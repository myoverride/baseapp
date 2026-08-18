import { getTenantRefs, getDbDir, TenantEventManager } from './db';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

interface TelemetryRow {
  device_id: string;
  payload: any;
  timestamp: Date | string;
}

let paramCache: Record<string, { batch: number, max: number, lastFetch: number }> = {};

export class TenantRotator {
  private tenantSlug: string;
  private buffer: TelemetryRow[] = [];
  private isFlushing = false;
  private flushTimer: NodeJS.Timeout | null = null;
  
  private spoolStream: fs.WriteStream | null = null;
  private spoolFile: string;
  private isProcessingSpool = false;

  constructor(tenantSlug: string) {
    this.tenantSlug = tenantSlug;
    this.spoolFile = path.join(getDbDir(), 'tmp', `${this.tenantSlug}_spool.jsonl`);
  }

  append(row: TelemetryRow) {
    const params = paramCache[this.tenantSlug] || { batch: 500, max: 10000 };
    
    // RAM patlamasını önlemek için aşırı yükte veriyi diske (Spool) yaz
    if (this.buffer.length >= params.max) {
      if (!this.spoolStream) {
        const tmpDir = path.join(getDbDir(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        this.spoolStream = fs.createWriteStream(this.spoolFile, { flags: 'a' });
      }
      this.spoolStream.write(JSON.stringify({
        device_id: row.device_id,
        payload: row.payload,
        timestamp: typeof row.timestamp === 'string' ? row.timestamp : row.timestamp.toISOString()
      }) + '\n');
      return; 
    }
    
    this.buffer.push(row);

    if (this.buffer.length >= params.batch) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 200);
    }
  }

  private async insertBatch(batch: TelemetryRow[]) {
    if (batch.length === 0) return;
    const refs = await getTenantRefs(this.tenantSlug);
    const db = refs.duckDbConn;
    
    let placeholders = [];
    let flatValues = [];
    
    for (const row of batch) {
      placeholders.push('(?, ?, ?)');
      flatValues.push(
        row.device_id,
        typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload),
        typeof row.timestamp === 'string' ? row.timestamp : row.timestamp.toISOString()
      );
    }
    
    const query = `INSERT INTO telemetry (device_id, payload, timestamp) VALUES ${placeholders.join(', ')}`;
    
    await new Promise((resolve, reject) => {
      db!.run(query, ...flatValues, (err: any) => err ? reject(err) : resolve(null));
    });
  }

  private async processSpool() {
    if (this.isProcessingSpool || !fs.existsSync(this.spoolFile)) return;
    this.isProcessingSpool = true;

    if (this.spoolStream) {
      await new Promise(r => this.spoolStream!.end(r));
      this.spoolStream = null;
    }

    const processingFile = this.spoolFile + '.processing';
    try {
      if (fs.existsSync(this.spoolFile)) {
        fs.renameSync(this.spoolFile, processingFile);
        
        const fileStream = fs.createReadStream(processingFile);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
        
        let batch: TelemetryRow[] = [];
        for await (const line of rl) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            batch.push({
               device_id: parsed.device_id,
               payload: parsed.payload,
               timestamp: new Date(parsed.timestamp)
            });
            if (batch.length >= 500) {
               await this.insertBatch(batch);
               batch = [];
            }
          } catch(e) {}
        }
        if (batch.length > 0) {
           await this.insertBatch(batch);
        }
      }
    } catch(err) {
      console.error(`[ERROR] Spool Processing Failed (${this.tenantSlug}):`, err);
    } finally {
      if (fs.existsSync(processingFile)) {
        fs.unlinkSync(processingFile);
      }
      this.isProcessingSpool = false;
    }
  }

  async flush() {
    if (this.buffer.length === 0 || this.isFlushing) {
      if (this.buffer.length === 0 && !this.isProcessingSpool) {
        this.processSpool();
      }
      return;
    }
    
    const now = Date.now();
    let cache = paramCache[this.tenantSlug];
    if (!cache || now - cache.lastFetch > 60000) {
      import('./globalsManager').then(async ({ globals }) => {
        const batch = parseInt(await globals.get(this.tenantSlug, 'TELEMETRY_BATCH_SIZE', false, '500')) || 500;
        const max = parseInt(await globals.get(this.tenantSlug, 'TELEMETRY_MAX_BUFFER_SIZE', false, '10000')) || 10000;
        paramCache[this.tenantSlug] = { batch, max, lastFetch: Date.now() };
      }).catch(() => {});
    }
    
    const params = paramCache[this.tenantSlug] || { batch: 500, max: 10000 };

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    this.isFlushing = true;
    const batch = this.buffer.splice(0, params.batch);

    try {
      await this.insertBatch(batch);
    } catch (err) {
      console.error(`[ERROR] DuckDB Bulk Insert Failed (${this.tenantSlug}):`, err);
      // Hata durumunda veriyi kaybetmemek için diske yedekle
      for (const row of batch) {
         if (!this.spoolStream) {
           const tmpDir = path.join(getDbDir(), 'tmp');
           if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
           this.spoolStream = fs.createWriteStream(this.spoolFile, { flags: 'a' });
         }
         this.spoolStream.write(JSON.stringify({
           device_id: row.device_id,
           payload: row.payload,
           timestamp: typeof row.timestamp === 'string' ? row.timestamp : row.timestamp.toISOString()
         }) + '\n');
      }
    } finally {
      this.isFlushing = false;
      // Eğer buffer'da hala veri varsa zincirleme flush yap
      if (this.buffer.length > 0) {
        this.flushTimer = setTimeout(() => this.flush(), 100);
      } else if (!this.isProcessingSpool) {
        this.processSpool(); // Demand bitince birikmiş spool varsa erit
      }
    }
  }

  destroy() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.buffer = [];
  }
}

const rotators = new Map<string, TenantRotator>();

// Eviction event handler to prevent memory leaks
TenantEventManager.on('tenant:evict', (tenantSlug: string) => {
  const rotator = rotators.get(tenantSlug);
  if (rotator) {
    rotator.destroy();
    rotators.delete(tenantSlug);
  }
});

export function appendTelemetry(tenantSlug: string, row: TelemetryRow) {
  let rotator = rotators.get(tenantSlug);
  if (!rotator) {
    rotator = new TenantRotator(tenantSlug);
    rotators.set(tenantSlug, rotator);
  }
  rotator.append(row);
}

export async function flushAppenderForTenant(tenantSlug: string) {
  const rotator = rotators.get(tenantSlug);
  if (rotator) {
    await rotator.flush();
  }
}

export async function flushAppender() {
  const promises = [];
  for (const rotator of rotators.values()) {
    promises.push(rotator.flush());
  }
  await Promise.all(promises);
}
