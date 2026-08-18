import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import bcrypt from 'bcryptjs';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import Database from 'better-sqlite3';
import type { H3Event } from 'h3';
import { resolveTenant } from './tenantResolver';
import duckdb from 'duckdb';
import { getDataDir } from './appRoot';

export function mapDuckDbRow(row: any) {
  const obj: any = { ...row };
  for (const col of Object.keys(obj)) {
    let val = obj[col];
    if (typeof val === 'bigint') {
      val = Number(val);
    } else if (typeof val === 'string' && val.length > 0 && ((val.startsWith('[') && val.endsWith(']')) || (val.startsWith('{') && val.endsWith('}')))) {
      try { val = JSON.parse(val); } catch { }
    }
    obj[col] = val;
  }
  return obj;
}

export const getDbDir = () => {
  return getDataDir();
}
export const TenantEventManager = new EventEmitter();
interface TenantDbRefs {
  sqlite: any;
  sqliteRead: any;
  duckDbInst: duckdb.Database | null;
  duckDbConn: duckdb.Connection | null;
  duckDbDevicesDirty: boolean;
  lastAccessed: number;
  activeOperations: number;
  mutex: Promise<void>;
}
let POOL_LIMIT_CACHE = 200;
let lastPoolLimitFetch = 0;
const tenantPool: Map<string, TenantDbRefs> = (globalThis as any).__tenantPool || new Map<string, TenantDbRefs>();
(globalThis as any).__tenantPool = tenantPool;
const tenantInitPromises = new Map<string, Promise<TenantDbRefs>>();
let masterDb: any = (globalThis as any).__masterDb || null;
export const initMasterDb = () => {
  if (!masterDb) {
    const dbPath = path.join(getDbDir(), 'master.db');
    masterDb = new Database(dbPath);
    (globalThis as any).__masterDb = masterDb;
    masterDb.pragma('busy_timeout = 5000');
    masterDb.exec('PRAGMA journal_mode = WAL;');
    masterDb.exec('PRAGMA synchronous = NORMAL;');
    masterDb.exec('PRAGMA foreign_keys = ON;');

    masterDb.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        custom_domain VARCHAR(255) UNIQUE,
        hashtags TEXT DEFAULT '[]',
        status VARCHAR(50) DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    masterDb.exec(`
      CREATE TABLE IF NOT EXISTS global_users (
        username VARCHAR(100) UNIQUE NOT NULL,
        tenant_slug VARCHAR(100) NOT NULL
      )
    `);
  }
};
export const getMasterDb = () => {
  if (!masterDb) initMasterDb();

  const sql: any = (strings: TemplateStringsArray, ...values: any[]) => {
    let query = '';
    for (let i = 0; i < strings.length; i++) {
      query += strings[i];
      if (i < values.length) {
        query += '?';
      }
    }
    const stmt = masterDb!.prepare(query);
    const upperQuery = query.trim().toUpperCase();
    if (upperQuery.startsWith('SELECT') || upperQuery.startsWith('PRAGMA') || upperQuery.includes('RETURNING')) {
      return stmt.all(...values);
    } else {
      const info = stmt.run(...values);
      return Object.assign([], { count: info.changes });
    }
  };
  sql.unsafe = async (query: string, params: any[] = []) => {
    const stmt = masterDb!.prepare(query);
    const upperQuery = query.trim().toUpperCase();
    if (upperQuery.startsWith('SELECT') || upperQuery.startsWith('PRAGMA') || upperQuery.includes('RETURNING')) {
      return stmt.all(...params);
    } else {
      const info = stmt.run(...params);
      return Object.assign([], { count: info.changes });
    }
  };
  return sql;
};
export const getTenantRefs = async (tenantSlug: string): Promise<TenantDbRefs> => {
  if (!tenantSlug) throw new Error("tenantSlug is required for database connection.");
  if (tenantPool.has(tenantSlug)) {
    const refs = tenantPool.get(tenantSlug)!;
    refs.lastAccessed = Date.now();
    return refs;
  }

  if (tenantInitPromises.has(tenantSlug)) {
    return tenantInitPromises.get(tenantSlug)!;
  }

  let resolveInit!: (val: TenantDbRefs) => void;
  let rejectInit!: (err: any) => void;
  const initPromise = new Promise<TenantDbRefs>((res, rej) => {
    resolveInit = res;
    rejectInit = rej;
  });
  tenantInitPromises.set(tenantSlug, initPromise);

  (async () => {
    try {
      if (Date.now() - lastPoolLimitFetch > 60000) {
        // Dinamik limit okuması (globalsManager) deadlock yarattığı için, limit tenant havuzu
        // evict işlemi sırasında kullanılmak üzere sqlite üzerinden veya static olarak bırakılmalı.
        // Şimdilik POOL_LIMIT_CACHE varsayılan 200 olarak devam eder..catch(()=>{});
        lastPoolLimitFetch = Date.now();
      }
      if (tenantPool.size >= POOL_LIMIT_CACHE) {
        let oldestSlug: string | null = null;
        let oldestTime = Infinity;
        for (const [slug, refs] of tenantPool.entries()) {
          if (refs.activeOperations === 0 && refs.lastAccessed < oldestTime) {
            oldestTime = refs.lastAccessed;
            oldestSlug = slug;
          }
        }
        if (oldestSlug) {
          const oldRefs = tenantPool.get(oldestSlug)!;
          tenantPool.delete(oldestSlug);
          if (oldRefs.duckDbConn) await new Promise<void>((resolve) => oldRefs.duckDbConn!.close(() => resolve()));
          if (oldRefs.duckDbInst) await new Promise<void>((resolve) => oldRefs.duckDbInst!.close(() => resolve()));
          oldRefs.sqlite.close();
          if (oldRefs.sqliteRead) oldRefs.sqliteRead.close();
          TenantEventManager.emit('tenant:evict', oldestSlug);
          console.log(`[LRU Pool] Evicted tenant: ${oldestSlug}`);
        }
      }
      const sqlitePath = path.join(getDbDir(), `${tenantSlug}_app.db`);
      let isNewDb = !fs.existsSync(sqlitePath);

      const sqlite = new Database(sqlitePath);
      if (!isNewDb) {
        try {
          const c = sqlite.prepare("SELECT count(*) as count FROM pages").get() as any;
          if (c.count === 0) isNewDb = true;
        } catch {
          isNewDb = true;
        }
      }
      sqlite.pragma('busy_timeout = 5000');
      sqlite.exec('PRAGMA journal_mode = WAL;');
      sqlite.exec('PRAGMA synchronous = NORMAL;');
      sqlite.exec('PRAGMA foreign_keys = ON;');
      const sqliteRead = new Database(sqlitePath, { readonly: true });
      sqliteRead.pragma('busy_timeout = 5000');
      sqliteRead.exec('PRAGMA journal_mode = WAL;');
      sqliteRead.exec('PRAGMA synchronous = NORMAL;');
      sqliteRead.exec('PRAGMA foreign_keys = ON;');
      let duckDbInst: duckdb.Database | null = null;
      let duckDbConn: duckdb.Connection | null = null;
      const duckPath = path.join(getDbDir(), `${tenantSlug}_telemetry.duckdb`);

      let runAsync!: (query: string) => Promise<unknown>;

      const initDuckDbWithRetry = async (retries = 50) => {
        try {
          if (duckDbConn) { try { duckDbConn.close(); } catch {} duckDbConn = null; }
          if (duckDbInst) { try { await new Promise(r => duckDbInst!.close(r)); } catch {} duckDbInst = null; }
          
          duckDbInst = new duckdb.Database(duckPath);
          duckDbConn = duckDbInst.connect();
          runAsync = (query: string) => new Promise((resolve, reject) => {
            duckDbConn!.run(query, (err: any) => err ? reject(err) : resolve(null));
          });
          
          let duckDbMem = 256;
          try {
            const row = sqlite.prepare("SELECT value FROM globals WHERE key = 'DUCKDB_MEMORY_LIMIT'").get() as any;
            if (row && row.value) {
              const parsed = parseInt(row.value);
              if (!isNaN(parsed)) duckDbMem = parsed;
            }
          } catch (e) {
            // Table might not exist yet if isNewDb is true
          }
          await runAsync(`PRAGMA memory_limit='${duckDbMem}MB';`);
          await runAsync(`PRAGMA preserve_insertion_order=false;`);
        } catch (e: any) {
          if (retries > 0 && e.message && (e.message.includes('Connection Error') || e.message.includes('IO Error'))) {
            console.warn(`[DuckDB] Lock detected for ${tenantSlug}, retrying in ${200 + (50 - retries) * 50}ms... (${retries} retries left)`);
            await new Promise(res => setTimeout(res, 200 + (50 - retries) * 50));
            await initDuckDbWithRetry(retries - 1);
          } else {
            throw e;
          }
        }
      };

      await initDuckDbWithRetry();

      const tmpDir = path.join(getDbDir(), 'tmp');
      if (!fs.existsSync(tmpDir)) { try { fs.mkdirSync(tmpDir, { recursive: true }); } catch { } }
      await runAsync(`PRAGMA temp_directory='${tmpDir.replace(/\\/g, '/')}';`);
      await runAsync(`PRAGMA threads=1;`);
      await runAsync(`SET preserve_insertion_order=false;`);
      await runAsync(`PRAGMA wal_autocheckpoint='16MB';`);
      await runAsync(`
        CREATE TABLE IF NOT EXISTS telemetry (
          device_id VARCHAR,
          payload JSON,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await runAsync(`CREATE INDEX IF NOT EXISTS idx_telemetry_device ON telemetry(device_id);`);

      await runAsync(`
        CREATE TABLE IF NOT EXISTS devices (
          device_id VARCHAR,
          secret_key VARCHAR,
          schema JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_by INTEGER,
          updated_by INTEGER
        );
      `);
      await runAsync(`CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_id ON devices(device_id);`);

      const refs: TenantDbRefs = {
        sqlite, sqliteRead, duckDbInst, duckDbConn, duckDbDevicesDirty: true, lastAccessed: Date.now(), activeOperations: 0, mutex: Promise.resolve()
      };

      await setupTenantDatabase(tenantSlug, refs, isNewDb);
      tenantPool.set(tenantSlug, refs);
      resolveInit(refs);
    } catch (e) {
      rejectInit(e);
    } finally {
      tenantInitPromises.delete(tenantSlug);
    }
  })();

  return initPromise;
};
async function safeCloseTenantDb(refs: any, tenantSlug: string) {
  // Wait for active operations to drain (max 5 seconds)
  let retries = 50;
  while (refs.activeOperations > 0 && retries > 0) {
    await new Promise(resolve => setTimeout(resolve, 100));
    retries--;
  }
  if (refs.activeOperations > 0) {
    console.warn(`[DB] Force closing tenant ${tenantSlug} with ${refs.activeOperations} active operations.`);
  }

  if (refs.duckDbConn) await new Promise<void>((resolve) => refs.duckDbConn!.close(() => resolve()));
  if (refs.duckDbInst) await new Promise<void>((resolve) => refs.duckDbInst!.close(() => resolve()));
  try { refs.sqlite.close(); } catch { }
  try { if (refs.sqliteRead) refs.sqliteRead.close(); } catch { }
}

export async function evictTenantDb(tenantSlug: string) {
  if (tenantPool.has(tenantSlug)) {
    const refs = tenantPool.get(tenantSlug)!;
    tenantPool.delete(tenantSlug);
    await safeCloseTenantDb(refs, tenantSlug);
    TenantEventManager.emit('tenant:evict', tenantSlug);
    console.log(`[LRU Pool] Manually evicted tenant: ${tenantSlug}`);
  }
}

export async function closeDatabases() {
  const closePromises: Promise<void>[] = [];

  for (const [slug, refs] of tenantPool.entries()) {
    closePromises.push(safeCloseTenantDb(refs, slug));
  }

  await Promise.all(closePromises);
  tenantPool.clear();

  if (masterDb) {
    try { masterDb.close(); } catch { }
    masterDb = null;
    (globalThis as any).__masterDb = null;
  }
}

export async function closeTenantDb(tenantSlug: string) {
  if (tenantPool.has(tenantSlug)) {
    const refs = tenantPool.get(tenantSlug)!;
    tenantPool.delete(tenantSlug);
    await safeCloseTenantDb(refs, tenantSlug);
    TenantEventManager.emit('tenant:evict', tenantSlug);
    console.log(`[LRU Pool] Closed and removed tenant DB: ${tenantSlug}`);
  }
}
import { transpileQueryAndParams } from './sqlTranspiler';

export const executeWithLock = async <T>(tenantSlug: string, fn: (refs: TenantDbRefs) => Promise<T> | T): Promise<T> => {
  const refs = await getTenantRefs(tenantSlug);

  const { globals } = await import('./globalsManager');
  const maxActiveOps = parseInt(await globals.get(tenantSlug, 'DB_MAX_ACTIVE_OPERATIONS', false, '1000')) || 1000;
  if (refs.activeOperations > maxActiveOps) {
    const err: any = new Error(`Database write queue is full for tenant ${tenantSlug}`);
    err.statusCode = 429;
    throw err;
  }

  refs.activeOperations++;
  let release: (() => void) | undefined;
  const lock = new Promise<void>(res => { release = res; });
  const prev = refs.mutex;
  refs.mutex = prev.then(() => lock);
  try {
    await prev.catch(() => { });
    return await fn(refs);
  } finally {
    refs.activeOperations--;
    if (release) release();
  }
};
export const createEphemeralTelemetryDB = async (tenantSlug?: string) => {
  let slug = tenantSlug;
  if (!slug) throw new Error("tenantSlug is required for database connection.");
  const finalSlug: string = slug;
  const refs = await getTenantRefs(finalSlug);
  const ephemeralConn = refs.duckDbInst!.connect();
  const close = () => {
    try { ephemeralConn.close(); } catch (e) { console.error('Ephemeral Connection Close Error:', e); }
  };
  const sql: any = async (strings: TemplateStringsArray | string, ...values: any[]) => {
    let query = '';
    let flatValues: any[] = [];
    if (typeof strings === 'string') {
      query = strings;
      flatValues = values[0] || [];
    } else {
      for (let i = 0; i < strings.length; i++) {
        query += strings[i];
        if (i < values.length) {
          flatValues.push(values[i]);
          query += '?';
        }
      }
    }
    const transpiled = transpileQueryAndParams(query, flatValues);
    return new Promise((resolve, reject) => {
      ephemeralConn.all(transpiled.query, ...transpiled.params, (err: any, res: any) => {
        if (err) return reject(err);
        if (Array.isArray(res)) {
          res = res.map(mapDuckDbRow);
        }
        resolve(res);
      });
    });
  };
  sql.unsafe = async (query: string, params: any[] = []) => {
    return sql(query, params);
  };
  sql.end = async () => close();
  sql.close = close;
  return sql;
};
export const useTelemetryDB = (tenantSlug?: string) => {
  let slug = tenantSlug;
  if (!slug) throw new Error("tenantSlug is required for database connection.");
  const finalSlug: string = slug;
  const sql: any = async (strings: TemplateStringsArray, ...values: any[]) => {
    let flatValues: any[] = [];
    let query = '';
    for (let i = 0; i < strings.length; i++) {
      query += strings[i];
      if (i < values.length) {
        flatValues.push(values[i]);
        query += '?';
      }
    }
    const refs = await getTenantRefs(finalSlug);
    refs.activeOperations++;
    try {
      const transpiled = transpileQueryAndParams(query, flatValues);
      return await new Promise((resolve, reject) => {
        refs.duckDbConn!.all(transpiled.query, ...transpiled.params, (err: any, res: any) => {
          if (err) {
            console.error('Telemetry SQL Error:', err.message, '| Query:', transpiled.query);
            return reject(err);
          }
          if (Array.isArray(res)) {
            res = res.map(mapDuckDbRow);
          }
          resolve(res);
        });
      });
    } finally {
      refs.activeOperations--;
    }
  };
  sql.json = (val: any) => JSON.stringify(val);
  sql.unsafe = async (query: string, params: any[] = []) => {
    const refs = await getTenantRefs(finalSlug);
    if (!refs.duckDbConn) {
      throw new Error(`useTelemetryDB is not supported on tenant ${finalSlug}`);
    }
    refs.activeOperations++;
    try {
      const transpiled = transpileQueryAndParams(query, params);

      return await new Promise((resolve, reject) => {
        refs.duckDbConn!.all(transpiled.query, ...transpiled.params, (err: any, res: any) => {
          if (err) {
            console.error('DuckDB SQL Error:', err.message, '| Query:', transpiled.query);
            return reject(err);
          }
          if (Array.isArray(res)) {
            res = res.map(mapDuckDbRow);
          }
          resolve(res);
        });
      });
    } finally {
      refs.activeOperations--;
    }
  };
  sql.begin = async (callback: (tx: any) => Promise<any>) => {
    const refs = await getTenantRefs(finalSlug);
    if (!refs.duckDbConn) {
      throw new Error(`useTelemetryDB is not supported on tenant ${finalSlug}`);
    }
    try {
      await new Promise((res) => refs.duckDbConn!.run('BEGIN TRANSACTION;', res));
      const result = await callback(sql);
      await new Promise((res) => refs.duckDbConn!.run('COMMIT;', res));
      return result;
    } catch (err) {
      await new Promise((res) => refs.duckDbConn!.run('ROLLBACK;', res));
      throw err;
    }
  };
  sql.end = async () => { };
  return sql;
};
export const useDB = (tenantSlug?: string, _internalRefs?: TenantDbRefs) => {
  let slug = tenantSlug;
  if (!slug) throw new Error("tenantSlug is required for database connection.");
  const finalSlug: string = slug;
  const _internalExecute = async (refs: any, transpiled: any, upperQuery: string, useReadConnection: boolean = false) => {
    if (upperQuery.includes('INTO TELEMETRY') || upperQuery.includes('FROM TELEMETRY') || upperQuery.includes('UPDATE TELEMETRY')) {
      if (finalSlug === 'master') throw new Error("Telemetry is not supported on master tenant.");
      if (refs.duckDbDevicesDirty) {
        const stmt = refs.sqlite.prepare("SELECT device_id, schema FROM devices");
        const sqliteDevices = stmt.all();
        const tDb = useTelemetryDB(finalSlug);
        await tDb.unsafe("DELETE FROM devices");
        if (sqliteDevices && sqliteDevices.length > 0) {
          for (const row of sqliteDevices as any[]) {
            await tDb.unsafe("INSERT INTO devices (device_id, schema) VALUES ($1, $2)", [row.device_id, row.schema]);
          }
        }
        refs.duckDbDevicesDirty = false;
      }
      const tDb = useTelemetryDB(finalSlug);
      return await tDb.unsafe(transpiled.query, transpiled.params);
    }
    const isDeviceUpdate = upperQuery.includes('INTO DEVICES') || upperQuery.includes('UPDATE DEVICES') || (upperQuery.includes('FROM DEVICES') && upperQuery.includes('DELETE'));
    if (isDeviceUpdate) refs.duckDbDevicesDirty = true;
    const isSelect = upperQuery.startsWith('SELECT') || upperQuery.startsWith('WITH') || upperQuery.startsWith('PRAGMA');
    const isReturning = upperQuery.includes('RETURNING');
    if (isSelect || isReturning) {
      const dbConn = (useReadConnection && isSelect && !isReturning) ? refs.sqliteRead : refs.sqlite;
      const stmt = dbConn.prepare(transpiled.query);
      const rows = stmt.all(...transpiled.params);
      return rows.map(mapDuckDbRow);
    } else {
      const info = refs.sqlite.prepare(transpiled.query).run(...transpiled.params);
      return Object.assign([], { count: info.changes });
    }
  };
  const createSqlObj = (withLock: boolean, activeRefs?: any) => {
    const _handleExecute = async (transpiled: any, upperQuery: string) => {
      const isDuckDb = upperQuery.includes('INTO TELEMETRY') || upperQuery.includes('FROM TELEMETRY') || upperQuery.includes('UPDATE TELEMETRY');
      const isPureSelect = (upperQuery.startsWith('SELECT') || upperQuery.startsWith('WITH') || upperQuery.startsWith('PRAGMA')) && !upperQuery.includes('RETURNING') && !upperQuery.includes('INTO ');
      if (withLock) {
        if (isDuckDb || isPureSelect) {
          const refs = await getTenantRefs(finalSlug);
          return _internalExecute(refs, transpiled, upperQuery, isPureSelect);
        } else {
          return executeWithLock(finalSlug, async (refs) => {
            return _internalExecute(refs, transpiled, upperQuery, false);
          });
        }
      } else {
        return _internalExecute(activeRefs, transpiled, upperQuery, false);
      }
    };
    const sql: any = async (strings: TemplateStringsArray, ...values: any[]) => {
      let flatValues: any[] = [];
      let query = '';
      for (let i = 0; i < strings.length; i++) {
        query += strings[i];
        if (i < values.length) {
          flatValues.push(values[i]);
          query += '?';
        }
      }
      const transpiled = transpileQueryAndParams(query, flatValues);
      const upperQuery = transpiled.query.trim().toUpperCase();
      return _handleExecute(transpiled, upperQuery);
    };
    sql.json = (val: any) => JSON.stringify(val);
    sql.unsafe = async (query: string, params: any[] = []) => {
      const transpiled = transpileQueryAndParams(query, params);
      const upperQuery = transpiled.query.trim().toUpperCase();
      return _handleExecute(transpiled, upperQuery);
    };
    sql.begin = async (callback: (tx: any) => Promise<any>) => {
      if (!withLock) {
        throw new Error("Cannot nest sql.begin inside another transaction.");
      }
      return executeWithLock(finalSlug, async (refs) => {
        try {
          if (refs.sqlite.inTransaction) {
            try { refs.sqlite.exec('ROLLBACK;'); } catch (e) { }
          }
          refs.sqlite.exec('BEGIN TRANSACTION;');
          const txSql = createSqlObj(false, refs);
          const result = await callback(txSql);
          refs.sqlite.exec('COMMIT;');
          return result;
        } catch (err) {
          try { refs.sqlite.exec('ROLLBACK;'); } catch { }
          throw err;
        }
      });
    };
    sql.transactionSync = (queries: { query: string; params?: any[] }[]) => {
      if (withLock) {
        return executeWithLock(finalSlug, async (refs) => {
          if (refs.sqlite.inTransaction) {
            try { refs.sqlite.exec('ROLLBACK;'); } catch (e) { }
          }
          refs.sqlite.exec('BEGIN TRANSACTION;');
          try {
            const results = [];
            for (const q of queries) {
              const transpiled = transpileQueryAndParams(q.query, q.params || []);
              const upperQuery = transpiled.query.trim().toUpperCase();
              results.push(await _internalExecute(refs, transpiled, upperQuery));
            }
            refs.sqlite.exec('COMMIT;');
            return results;
          } catch (err) {
            try { refs.sqlite.exec('ROLLBACK;'); } catch { }
            throw err;
          }
        });
      } else {
        throw new Error("Cannot call transactionSync inside an async transaction.");
      }
    };
    sql.end = async () => { };
    return sql;
  };
  return _internalRefs ? createSqlObj(false, _internalRefs) : createSqlObj(true);
};

export async function setupTenantDatabase(tenantSlug: string, refs: TenantDbRefs, isNewDb: boolean = false) {
  try {
    const mainSql = useDB(tenantSlug, refs);
    console.log(`[Tenant: ${tenantSlug}] Checking tables and schema...`);
    // --------------------------------------------------------------------------

    console.log('Tablolar ve Güvenlik Altyapısı (Pure JS Memory) Kontrol Ediliyor...');
    // GÜVENLİK VE ROL YÖNETİMİ TABLOLARI
    await mainSql.unsafe(`
      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) UNIQUE NOT NULL,
        allowed_tags TEXT DEFAULT '[]',
        hashtags TEXT DEFAULT '[]',
        home_page VARCHAR(255),
        menu_list TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        updated_by INTEGER
      )
    `);
    await mainSql.unsafe(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT 0,
        role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
        home_page VARCHAR(255),
        menu_list TEXT DEFAULT NULL,
        current_token TEXT,
        token_expires_at DATETIME,
        token_tenant VARCHAR(100),
        profile TEXT DEFAULT '{}',
        hashtags TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        updated_by INTEGER
      )
    `);
    await mainSql.unsafe(`
      CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id VARCHAR(50) UNIQUE NOT NULL,
        secret_key VARCHAR(64) NOT NULL,
        schema TEXT DEFAULT '{}',
        hashtags TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        updated_by INTEGER
      )
    `);
    await mainSql.unsafe(`
      CREATE TABLE IF NOT EXISTS entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) UNIQUE NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        schema TEXT NOT NULL,
        hashtags TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        updated_by INTEGER
      )
    `);
    await mainSql.unsafe(`
      CREATE TABLE IF NOT EXISTS languages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code VARCHAR(10) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        dir VARCHAR(10) DEFAULT 'ltr',
        is_default BOOLEAN DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        hashtags TEXT DEFAULT '[]',
        translations TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        updated_by INTEGER
      )
    `);
    await mainSql.unsafe(`
      CREATE TABLE IF NOT EXISTS translation_keys (
        key VARCHAR(255) PRIMARY KEY,
        hashtags TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try { await mainSql.unsafe(`ALTER TABLE translation_keys ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`); } catch(e) {}
    try { await mainSql.unsafe(`ALTER TABLE translation_keys ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`); } catch(e) {}
    await mainSql.unsafe(`
      CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        updated_by INTEGER,
        hashtags TEXT DEFAULT '[]'
      )
    `);
    await mainSql.unsafe(`
      CREATE TABLE IF NOT EXISTS record_fields (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id INTEGER REFERENCES records(id) ON DELETE CASCADE,
        key VARCHAR(100) NOT NULL,
        val_str TEXT,
        val_num REAL,
        val_bool BOOLEAN
      )
    `);
    // Records tablosu için kritik performans indeksleri
    await mainSql.unsafe(`CREATE INDEX IF NOT EXISTS idx_records_entity_id ON records(entity_id)`);
    await mainSql.unsafe(`CREATE INDEX IF NOT EXISTS idx_records_entity_created ON records(entity_id, created_at DESC)`);
    await mainSql.unsafe(`CREATE INDEX IF NOT EXISTS idx_rf_record ON record_fields(record_id)`);
    await mainSql.unsafe(`CREATE INDEX IF NOT EXISTS idx_rf_key_num ON record_fields(key, val_num)`);
    await mainSql.unsafe(`CREATE INDEX IF NOT EXISTS idx_rf_key_str ON record_fields(key, val_str)`);
    await mainSql.unsafe(`CREATE INDEX IF NOT EXISTS idx_rf_val_str ON record_fields(val_str)`);
    await mainSql.unsafe(`CREATE INDEX IF NOT EXISTS idx_rf_val_num ON record_fields(val_num)`);
    await mainSql.unsafe(`
      CREATE TABLE IF NOT EXISTS user_records (
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        record_id INTEGER REFERENCES records(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, record_id)
      )
    `);
    // KÖKTEN MİMARİ DEĞİŞİM (Refactor): Eski tabloları yok et
    await mainSql.unsafe(`DROP TABLE IF EXISTS utils`);
    await mainSql.unsafe(`DROP TABLE IF EXISTS system_variables`);

    await mainSql.unsafe(`
      CREATE TABLE IF NOT EXISTS globals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type VARCHAR(20) NOT NULL CHECK(type IN ('variable', 'util')),
        key VARCHAR(255) UNIQUE NOT NULL,
        value TEXT,
        code TEXT,
        data_type VARCHAR(50) DEFAULT 'string',
        target VARCHAR(50) NOT NULL DEFAULT 'shared' CHECK(target IN ('ui', 'api', 'shared')),
        is_public BOOLEAN DEFAULT 0,
        is_secret BOOLEAN DEFAULT 0,
        protected BOOLEAN DEFAULT 0,
        active BOOLEAN DEFAULT 1,
        scope TEXT DEFAULT '[]',
        description TEXT,
        hashtags TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        updated_by INTEGER
      )
    `);
    await mainSql.unsafe(`
      CREATE TABLE IF NOT EXISTS endpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) UNIQUE NOT NULL,
        type VARCHAR(20) NOT NULL CHECK(type IN ('http', 'ws', 'mqtt')),
        route_pattern VARCHAR(255) NOT NULL,
        code TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        active BOOLEAN DEFAULT 1,
        is_public BOOLEAN DEFAULT 0,
        hashtags TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        updated_by INTEGER
      )
    `);
    await mainSql.unsafe(`
      CREATE TABLE IF NOT EXISTS workers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) UNIQUE NOT NULL,
        type VARCHAR(20) NOT NULL CHECK(type IN ('cron', 'daemon')),
        code TEXT NOT NULL,
        cron_expression VARCHAR(50),
        autostart BOOLEAN DEFAULT 0,
        active BOOLEAN DEFAULT 1,
        status VARCHAR(50) DEFAULT 'stopped',
        error_msg TEXT DEFAULT NULL,
        last_run_second INTEGER DEFAULT 0,
        hashtags TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        updated_by INTEGER
      )
    `);

    await mainSql.unsafe(`
      CREATE TABLE IF NOT EXISTS pages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          route_pattern VARCHAR(255),
          priority INTEGER NOT NULL DEFAULT 0,
          title VARCHAR(200) UNIQUE NOT NULL,
        page_type VARCHAR(50) DEFAULT 'regular',
        template_string TEXT DEFAULT '',
        script_content TEXT DEFAULT '',
        style_content TEXT DEFAULT '',
        active BOOLEAN DEFAULT 1,
        is_public BOOLEAN DEFAULT 0,
        is_default_layout BOOLEAN DEFAULT 0,
        protected BOOLEAN DEFAULT 0,
        layout_id INTEGER DEFAULT NULL REFERENCES pages(id) ON DELETE SET NULL,
        hashtags TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        updated_by INTEGER
      )
    `);

    // Create unique indexes to apply UNIQUE constraint retroactively on existing tables
    await mainSql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_endpoints_name ON endpoints(name)`);
    await mainSql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_workers_name ON workers(name)`);
    await mainSql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_title ON pages(title)`);
    // =========================================================================
    // --- NEW ISOLATED SEED LOGIC ---
    if (isNewDb) {
      const seedModule = await import('./seed/index');
      await seedModule.runSeed(tenantSlug, refs);
    }

    // --- INIT PENDING COMMAND TIMEOUTS INTO RAM ---
    const { initCommandTimeouts } = await import('./deviceCommands');
    await initCommandTimeouts(tenantSlug, mainSql);
    console.log(`[DB] Database and security infrastructure ready. (Tenant: ${tenantSlug})`);
  } catch (error: any) {
    console.error(`[DB] Critical Database Setup Error: ${error.message}`);
    process.exit(1);
  }
}
