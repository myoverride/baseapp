import { getTenantRefs } from './db';

interface TelemetryRow {
  device_id: string;
  payload: any;
  timestamp: Date;
}

class TenantRotator {
  tenantSlug: string;
  buffer: TelemetryRow[] = [];
  flushTimer: any = null;
  isFlushing: boolean = false;

  constructor(tenantSlug: string) {
    this.tenantSlug = tenantSlug;
  }

  append(row: TelemetryRow) {
    // RAM patlamasını önlemek için aşırı yükte veriyi reddet
    if (this.buffer.length > 10000) {
      return; 
    }
    
    this.buffer.push(row);

    if (this.buffer.length >= 500) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 200);
    }
  }

  async flush() {
    if (this.buffer.length === 0 || this.isFlushing) return;
    
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    this.isFlushing = true;
    const batch = this.buffer.splice(0, 500);

    try {
      const refs = await getTenantRefs(this.tenantSlug);
      const db = refs.duckDbConn;
      
      let placeholders = [];
      let flatValues = [];
      
      for (const row of batch) {
        placeholders.push('(?, ?, ?)');
        flatValues.push(
          row.device_id,
          typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload),
          row.timestamp.toISOString()
        );
      }
      
      const query = `INSERT INTO telemetry (device_id, payload, timestamp) VALUES ${placeholders.join(', ')}`;
      
      await new Promise((resolve, reject) => {
        db!.run(query, ...flatValues, (err: any) => err ? reject(err) : resolve(null));
      });
      
    } catch (err) {
      console.error(`[ERROR] DuckDB Bulk Insert Failed (${this.tenantSlug}):`, err);
      // Hata durumunda veriyi kaybetmemek için başa ekle, ancak limiti geçerse at
      if (this.buffer.length < 5000) {
         this.buffer = [...batch, ...this.buffer];
      }
    } finally {
      this.isFlushing = false;
      // Eğer buffer'da hala veri varsa zincirleme flush yap
      if (this.buffer.length > 0) {
        this.flushTimer = setTimeout(() => this.flush(), 100);
      }
    }
  }
}

const rotators = new Map<string, TenantRotator>();

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
