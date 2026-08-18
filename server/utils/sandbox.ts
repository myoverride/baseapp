import vm from 'node:vm';
import crypto from 'node:crypto';
// @ts-ignore
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import { LRUCache } from 'lru-cache';
import { logEvents } from './realtime';
import { useDB, useTelemetryDB, createEphemeralTelemetryDB } from './db';
import { queueModbusRead, queueModbusWrite } from './modbusQueue';
import {} from './globalsManager';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { publishWS } from './wsManager';
import { addCommand, updateCommandStatus } from './deviceCommands';
import { getServerTranslation } from './i18n-server';
import { getPluginsDir } from './appRoot';



let baseRequire: NodeRequire;
try {
  baseRequire = createRequire(resolve(process.cwd(), 'index.js'));
} catch {
  baseRequire = typeof require !== 'undefined' ? require : createRequire(process.cwd() + '/index.js');
}
// plugins/ dizinini çözümleyen require oluştur
const pluginsRequire = createRequire(join(getPluginsDir(), 'index.js'));

// Önce plugins/ dizininde ara, bulamazsa normal require'a düş
const customRequire: NodeRequire = Object.assign(
  function customRequire(id: string) {
    if (id.startsWith('.')) {
      return baseRequire(id);
    }
    try {
      return pluginsRequire(id);
    } catch {
      return baseRequire(id);
    }
  } as NodeRequire,
  {
    resolve: Object.assign(
      function resolve(id: string, options?: { paths?: string[] }) {
        try {
          return pluginsRequire.resolve(id, options);
        } catch {
          return baseRequire.resolve(id, options);
        }
      },
      { paths: baseRequire.resolve.paths }
    ),
    cache: baseRequire.cache,
    extensions: baseRequire.extensions,
    main: baseRequire.main
  }
);

const compileCache = new LRUCache<string, vm.Script>({ max: 1000 });
const sandboxUserCache = new LRUCache<string, any>({ max: 10000, ttl: 1000 * 60 * 60 * 24 }); // 24 hours default

const safeClone = (arg: any) => {
  if (typeof arg === 'object' && arg !== null) {
    try { return JSON.parse(JSON.stringify(arg)); } catch { return String(arg); }
  }
  return arg;
};

// Asenkron geciktirme yardımcı metodu (Sınır kaldırıldı)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// SMTP Mailer Yapılandırması ve Yardımcı Metodu (Tenant bazlı)
const transporterMap = new Map<string, { transporter: any; configHash: string }>();

async function getTransporter(tenantSlug: string) {
  const sql = useDB(tenantSlug);
  const getVar = async (key: string, defaultVal: string | null = null) => {
    const res = await sql.unsafe(`SELECT value FROM globals WHERE type = 'variable' AND key = ?`, [key]);
    return res && res.length > 0 ? res[0].value : defaultVal;
  };

  // Konfigürasyonları çek
  const host = await getVar('SMTP_HOST', 'smtp.gmail.com');
  const port = parseInt(await getVar('SMTP_PORT', '587'), 10);
  const user = await getVar('SMTP_USER', '');
  const pass = await getVar('SMTP_PASS', '');

  // Yeni özellikler
  const secure = await getVar('SMTP_SECURE', 'false') === 'true';
  const requireTLS = await getVar('SMTP_REQUIRE_TLS', 'true') === 'true';
  const ignoreTLS = await getVar('SMTP_IGNORE_TLS', 'false') === 'true';

  const currentConfig = `${host}:${port}:${user}:${secure}:${requireTLS}`;

  const existing = transporterMap.get(tenantSlug);
  if (existing && existing.configHash === currentConfig) {
    return existing.transporter;
  }
  const config: any = {
    host,
    port,
    secure,
    requireTLS,
    ignoreTLS,
    // Hata ayıklama kaldırıldı
    auth: user ? { user, pass } : undefined
  };
  const transporter = nodemailer.createTransport(config);
  transporterMap.set(tenantSlug, { transporter, configHash: currentConfig });
  return transporter;
}
export const sendEmail = async (tenantSlug: string, options: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string // Opsiyonel olarak geçilebilir
}) => {
  const sql = useDB(tenantSlug);

  // Sender (Gönderen) tercihi: Options'ta geldiyse o, yoksa sistem değişkeni, o da yoksa SMTP_USER
  const customFrom = options.from || (await sql.unsafe(`SELECT value FROM globals WHERE type = 'variable' AND key = ?`, ['EMAIL_FROM']))[0]?.value;
  const smtpUser = (await sql.unsafe(`SELECT value FROM globals WHERE type = 'variable' AND key = ?`, ['SMTP_USER']))[0]?.value;

  const from = customFrom || smtpUser;

  const mailOptions = {
    from: from ? from : `"BaseApp" <${smtpUser}>`,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html
  };

  const t = await getTransporter(tenantSlug);
  return await t.sendMail(mailOptions);
};

function emitLog(level: string, args: any[], sourceId?: string, contextParams?: any, tenantSlug?: string) {
  // Sadece Virtual Console'a gitsin, terminale basılmasın

  if (sourceId) {
    logEvents.emit('log', {
      sourceId,
      level,
      args: args.map(safeClone),
      timestamp: new Date().toISOString(),
      metadata: contextParams || {},
      tenantSlug: tenantSlug || (contextParams && contextParams.tenantSlug) || 'master'
    });
  }
}
function getVirtualConsole(sourceId?: string, contextParams?: any, tenantSlug?: string) {
  // Sadece UI log olsun diye native console fallback'i kapatıldı
  // We don't cache virtualConsole anymore if contextParams is passed, so it can emit deviceId dynamically
  return {
    log: (...args: any[]) => emitLog('log', args, sourceId, contextParams, tenantSlug),
    error: (...args: any[]) => emitLog('error', args, sourceId, contextParams, tenantSlug),
    warn: (...args: any[]) => emitLog('warn', args, sourceId, contextParams, tenantSlug),
    info: (...args: any[]) => emitLog('info', args, sourceId, contextParams, tenantSlug)
  };
}
/**
 * Özel kodu node:vm kullanarak çalıştırır. On-Premise versiyon:
 * Kısıtlamalar kaldırılmıştır (Sınırsız timeout, Native Fetch, fs ve child_process için require desteği).
 */
export function runCustomCode(tenantSlug: string, scriptCode: string, payload: any, sourceId?: string, contextParams?: any): Promise<any> {
  return new Promise(async (resolve) => {
    let timeoutId: any = null;
    let ephemeralTelemetryDb: any = null;
    const abortController = new AbortController();
    const signal = abortController.signal;
    // Child process tracking for zombie prevention (S3 Fix) — try dışında tanımlanmalı (catch'ten erişim)
    const spawnedPids = new Set<number>();
    
    let telemetryActiveQueries = 0;
    let telemetryPendingClose = false;
    try {
      const scriptHash = crypto.createHash('md5').update(scriptCode).digest('hex');
      const cacheKey = sourceId || scriptHash;

      let executableCode = scriptCode.trim();
      if (executableCode.startsWith('export default ')) {
        executableCode = executableCode.replace(/^export\s+default\s+/, 'const _defaultExport = ') + '\nif (typeof _defaultExport === "function") return await _defaultExport(payload, context); else return _defaultExport;';
      }

      const wrappedCode = `(async () => {\n${executableCode}\n})()`;

      let script: any;
      const finalCacheKey = sourceId ? `${tenantSlug}_${sourceId}` : undefined;
      
      if (finalCacheKey) {
        script = compileCache.get(finalCacheKey);
        if (!script || !compileCache.has(finalCacheKey)) {
          script = new vm.Script(wrappedCode);
          compileCache.set(finalCacheKey, script);
        }
      } else {
        script = new vm.Script(wrappedCode);
      }

      // Create a lazy proxy for ephemeralTelemetryDb so we don't open DuckDB connections for every MQTT message!
      const getTelemetryDb = async () => {
         if (!ephemeralTelemetryDb) {
            ephemeralTelemetryDb = await createEphemeralTelemetryDB(tenantSlug);
         }
         return ephemeralTelemetryDb;
      };
      const virtualConsole = getVirtualConsole(sourceId, contextParams, tenantSlug);

      const readModbusData = async (ip: string, port: number, unitId: number, startAddress: number, length: number, type: 'holding' | 'input' | 'coil' | 'discrete' = 'holding', dataType: string = 'uint16') => {
        if (signal.aborted) throw new Error('Sandbox execution aborted (modbus read)');
        const res = await queueModbusRead(ip, port, unitId, startAddress, length, type, dataType);
        if (signal.aborted) throw new Error('Sandbox execution aborted (modbus read)');
        return res;
      };

      const writeModbusData = async (ip: string, port: number, unitId: number, address: number, value: number, dataType: string = 'uint16') => {
        if (signal.aborted) throw new Error('Sandbox execution aborted (modbus write)');
        const res = await queueModbusWrite(ip, port, unitId, address, value, dataType);
        if (signal.aborted) throw new Error('Sandbox execution aborted (modbus write)');
        return res;
      };

      const sendDeviceCommand = async (deviceId: string, commandOptions: any) => {
        const correlationId = crypto.randomUUID();
        const commandName = commandOptions?.cmd || commandOptions?.command || 'CUSTOM';
        const payloadData = commandOptions?.payload !== undefined ? commandOptions.payload : commandOptions;

        addCommand(tenantSlug, {
          id: correlationId,
          device_id: deviceId,
          command_name: commandName,
          payload: payloadData,
          status: 'PENDING',
          response: null,
          correlation_id: correlationId,
          created_at: new Date(),
          updated_at: new Date()
        });

        const mqttPayload = JSON.stringify({
          command: commandName,
          payload: payloadData,
          correlationId
        });
        
        const { publishMQTT } = await import('./mqtt');
        const publishSuccess = publishMQTT(`${tenantSlug}/commands/${deviceId}`, mqttPayload);

        if (publishSuccess) {
          updateCommandStatus(tenantSlug, correlationId, 'SENT');
        } else {
          updateCommandStatus(tenantSlug, correlationId, 'FAILED', { error: 'MQTT Broker disconnected' });
        }

        // Asenkron komut zaman aşımı için sayacı başlat (Senaryo 1 Fix)
        const { scheduleCommandTimeout } = await import('./deviceCommands');
        scheduleCommandTimeout(tenantSlug, correlationId);

        return correlationId;
      };

      const { sendPushToUser, broadcastPush } = await import('./push');
      const filterEngine = await import('./filterEngine');
      const recordValidator = await import('./recordValidator');
      const recordManager = await import('./recordManager');

      const safeFetch = (url: string, options: any = {}) => {
        return globalThis.fetch(url, { ...options, signal });
      };

      const safeSleep = async (ms: number) => {
        return new Promise<void>((resolve, reject) => {
          if (signal.aborted) return reject(new Error('Sandbox execution aborted (sleep)'));
          const timeoutId = setTimeout(() => {
            resolve();
            signal.removeEventListener('abort', abortHandler);
          }, ms);
          const abortHandler = () => {
            clearTimeout(timeoutId);
            reject(new Error('Sandbox execution aborted (sleep)'));
          };
          signal.addEventListener('abort', abortHandler);
        });
      };

      const dbBase = useDB(tenantSlug);
      const safeDb = new Proxy(dbBase, {
        apply: async (target: any, thisArg: any, args: any[]) => {
          if (signal.aborted) throw new Error('Sandbox execution aborted (db timeout)');
          const res = await target.apply(thisArg, args);
          if (signal.aborted) throw new Error('Sandbox execution aborted (db timeout)');
          return res;
        },
        get: (target: any, prop: string) => {
          if (typeof target[prop] === 'function') {
            return async (...args: any[]) => {
              if (signal.aborted) throw new Error('Sandbox execution aborted (db timeout)');
              const res = await target[prop](...args);
              if (signal.aborted) throw new Error('Sandbox execution aborted (db timeout)');
              return res;
            };
          }
          return target[prop];
        }
      });

      // Child process tracking proxy (S3 Fix)
      const sandboxRequire: NodeRequire = Object.assign(
        function sandboxRequire(id: string) {
          const mod = customRequire(id);
          if (id === 'child_process' || id === 'node:child_process') {
            return new Proxy(mod, {
              get(target: any, prop: string) {
                const original = target[prop];
                if (typeof original === 'function' && ['exec', 'execFile', 'spawn', 'fork'].includes(prop)) {
                  return (...args: any[]) => {
                    const child = original(...args);
                    if (child && child.pid) {
                      spawnedPids.add(child.pid);
                      child.on('exit', () => spawnedPids.delete(child.pid));
                    }
                    return child;
                  };
                }
                return original;
              }
            });
          }
          return mod;
        } as NodeRequire,
        {
          resolve: customRequire.resolve,
          cache: customRequire.cache,
          extensions: customRequire.extensions,
          main: customRequire.main
        }
      );

      const {} = await import('./globalsManager');
      const allVars = await globals.getAll(tenantSlug, true);
      const globalsObj: Record<string, any> = {};
      for (const v of allVars) {
        globalsObj[v.key] = v.value;
      }

      const sandbox = {
        payload,
        context: {
          ...(contextParams || {}),
          cache: {
            get: async (key: string) => sandboxUserCache.get(`${tenantSlug}:${key}`),
            set: async (key: string, value: any, ttlSeconds?: number) => {
              if (ttlSeconds) {
                sandboxUserCache.set(`${tenantSlug}:${key}`, value, { ttl: ttlSeconds * 1000 });
              } else {
                sandboxUserCache.set(`${tenantSlug}:${key}`, value);
              }
            },
            delete: async (key: string) => sandboxUserCache.delete(`${tenantSlug}:${key}`)
          },
          publishWS: (path: string, payload: any) => publishWS(tenantSlug, path, payload),
          publishMQTT: async (topic: string, message: any) => {
            let finalMessage = message;
            if (typeof message === 'object') {
              try { finalMessage = JSON.stringify(message); } catch { }
            } else if (typeof message !== 'string') {
              finalMessage = String(message);
            }
            const { publishMQTT } = await import('./mqtt');
            return publishMQTT(`${tenantSlug}/${topic}`, finalMessage);
          }
        },
        console: virtualConsole,
        fetch: safeFetch,
        Buffer,
        crypto,
        process,
        env: process.env,
        require: sandboxRequire,
        __dirname: process.cwd(),
        __filename: join(process.cwd(), 'sandbox.js'),
        t: (key: string, params?: any) => {
          const locale = contextParams?.locale || 'en';
          return getServerTranslation(tenantSlug, locale, key, params);
        },
        tAsync: async (args: any) => {
          let key = typeof args === 'string' ? args : args.key;
          let params = args.params || undefined;
          const locale = contextParams?.locale || 'en';
          return getServerTranslation(tenantSlug, locale, key, params);
        },
        publishMQTT: async (topic: string, message: any) => {
          let finalMessage = message;
          if (typeof message === 'object') {
            try { finalMessage = JSON.stringify(message); } catch { }
          } else if (typeof message !== 'string') {
            finalMessage = String(message);
          }
          const { publishMQTT } = await import('./mqtt');
          return publishMQTT(`${tenantSlug}/${topic}`, finalMessage);
        },
        sleep: safeSleep,
        sendEmail: (options: any) => sendEmail(tenantSlug, options),
        readModbusData,
        writeModbusData,
        sendDeviceCommand,
        publishWS: (path: string, payload: any) => publishWS(tenantSlug, path, payload),
        filterEngine,
        recordValidator,
        recordManager: (() => {
          const wrapper: any = {};
          for (const prop in recordManager) {
            const val = (recordManager as any)[prop];
            if (typeof val === 'function') {
              wrapper[prop] = async (...args: any[]) => {
                return val(tenantSlug, ...args);
              };
            } else {
              wrapper[prop] = val;
            }
          }
          return wrapper;
        })(),
        globals: new Proxy(globalsObj, {
          get: (target: any, prop: string | symbol) => {
            if (typeof prop !== 'string') {
              return target[prop];
            }
            if (prop in target) {
              return target[prop];
            }
            return async (...args: any[]) => {
              return globals.run(tenantSlug, prop, {
                tenantSlug,
                payload,
                userId: contextParams?.userId,
                ...contextParams,
                db: safeDb,
                telemetryDb: sandbox.telemetryDb,
                publishWS: sandbox.publishWS,
                publishMQTT: sandbox.publishMQTT,
                t: sandbox.t,
                tAsync: sandbox.tAsync,
                recordManager: sandbox.recordManager
              }, ...args);
            }
          }
        }),
        bcrypt,
        db: safeDb,
        telemetryDb: new Proxy(function() {}, {
           get: (_, prop: string) => async (...args: any[]) => {
              const db = await getTelemetryDb();
              const val = db[prop];
              if (typeof val === 'function') {
                 telemetryActiveQueries++;
                 try {
                     return await val.bind(db)(...args);
                 } finally {
                     telemetryActiveQueries--;
                     if (telemetryActiveQueries === 0 && telemetryPendingClose && ephemeralTelemetryDb) {
                         try { ephemeralTelemetryDb.close(); } catch(e) {}
                     }
                 }
              }
              return val;
           },
           apply: async (_, __, argumentsList: any[]) => {
              const db = await getTelemetryDb();
              telemetryActiveQueries++;
              try {
                  return await db(...argumentsList);
              } finally {
                  telemetryActiveQueries--;
                  if (telemetryActiveQueries === 0 && telemetryPendingClose && ephemeralTelemetryDb) {
                      try { ephemeralTelemetryDb.close(); } catch(e) {}
                  }
              }
           }
        }),
        sql: safeDb,
        push: {
          send: (userId: number, pushPayload: any) => sendPushToUser(tenantSlug, userId, pushPayload),
          broadcast: (pushPayload: any) => broadcastPush(tenantSlug, pushPayload)
        }
      };

      const context = vm.createContext(sandbox);
      const sysVal = await globals.get(tenantSlug, 'SANDBOX_TIMEOUT', false, '5');
      let timeoutSec = parseInt(sysVal, 10) || 5;
      
      // Scheduler tasks max run time
      if (sourceId && sourceId.startsWith('scheduler_')) {
        timeoutSec = parseInt(await globals.get(tenantSlug, 'SANDBOX_SCHEDULER_TIMEOUT', false, '900')) || 900;
      }

      const timeoutMs = timeoutSec * 1000;
      
      let execPromise: Promise<any>;
      // vm.runInContext'in timeout parametresi senkron sonsuz döngüleri (while(true)) fiziksel olarak keser.
      execPromise = script.runInContext(context, { timeout: timeoutMs });


      // 2. Asenkron (await ile bekleyen) işlemler için Promise.race timeout
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Sandbox execution timed out after ${timeoutSec} seconds (Asynchronous)`));
        }, timeoutMs);
      });

      const result = await Promise.race([execPromise, timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);

      // Close ephemeral DB connection when execution finishes successfully
      if (ephemeralTelemetryDb && ephemeralTelemetryDb.close) {
        if (telemetryActiveQueries === 0) {
          try { ephemeralTelemetryDb.close(); } catch(e) {}
        } else {
          telemetryPendingClose = true;
        }
      }

      resolve(result);
    } catch (e: any) {
      if (timeoutId) clearTimeout(timeoutId);

      // Zombie Async Tasks Koruması: AbortController tetiklenerek fetch ve sleep işlemleri iptal edilir
      try {
        abortController.abort();
      } catch (err) { }

      // Zombie child process'leri sonlandır (S3 Fix)
      for (const pid of spawnedPids) {
        try { process.kill(pid); } catch {}
      }
      spawnedPids.clear();

      // Close ephemeral DB connection safely on error or timeout
      // Yalnızca aktif C++ sorgusu yoksa kapatılır, varsa bitmesi beklenir (SegFault Koruması)
      try {
        if (ephemeralTelemetryDb && ephemeralTelemetryDb.close) {
          if (telemetryActiveQueries === 0) {
            ephemeralTelemetryDb.close();
          } else {
            telemetryPendingClose = true;
          }
        }
      } catch (err) { }
      let errMsg = e.message || 'error.executionFailed';
      if (e.stack) {
        const match = e.stack.match(/evalmachine\.<anonymous>:(\d+)(?::(\d+))?/);
        if (match) {
          errMsg = 'error.executionLine|' + match[1] + '|' + errMsg;
        }
      }

      // Hata WS üzerinden anında kullanıcıya iletilsin (Eğer sourceId varsa)
      if (sourceId) {
        emitLog('error', [errMsg], sourceId, contextParams);
      }
      resolve({ error: errMsg, blocked: true, status: 500 });
    }
  });
}


export function clearSandboxCache(sourceId?: string) {
  // Clear the entire LRU cache instead of deleting one by one since we now prefix keys with tenantSlug
  compileCache.clear();
}

export function clearAllSandboxCache() {
  compileCache.clear();
}
