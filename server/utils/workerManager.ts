import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import fs from "node:fs";
import { fork, ChildProcess } from "child_process";
import { useDB, getMasterDb } from "./db";
import { logEvents } from "./realtime";

const activeWorkers = new Map<string, ChildProcess>();
const restartCounters = new Map<
  string,
  { count: number; firstCrash: number }
>();

const runningCronJobs = new Set<string>();
const fatallyCrashedWorkers = new Set<string>();

export let isShuttingDownDaemons = false;

let workerPath = "";
try {
  const url = import.meta.url;
  if (url && url.startsWith("file://")) {
    workerPath = join(dirname(fileURLToPath(url)), "worker.js");
    if (!fs.existsSync(workerPath)) {
      workerPath = join(process.cwd(), "server", "utils", "worker.js");
    }
  } else {
    workerPath = join(process.cwd(), ".output", "server", "utils", "worker.js");
  }
} catch {
  workerPath = join(process.cwd(), "server", "utils", "worker.js");
}

if (!fs.existsSync(workerPath)) {
  const fallback = join(process.cwd(), "server", "utils", "worker.js");
  if (fs.existsSync(fallback)) workerPath = fallback;
}

import { TenantEventManager } from "./db";

TenantEventManager.on("globals:updated", async (tenantSlug: string) => {
  const { globals } = await import("./globalsManager");
  const allVars = await globals.getAll(tenantSlug, true);
  const globalsObj: Record<string, any> = {};
  for (const v of allVars) {
    globalsObj[v.key] = v.value;
  }
  
  activeWorkers.forEach((worker, workerId) => {
    if (workerId.startsWith(`${tenantSlug}_`)) {
      worker.send({ type: "update_globals", globalsObj });
    }
  });
});

const logRateLimits = new Map<string, { count: number; lastReset: number }>();

function checkLogRateLimit(workerId: string): boolean {
  const now = Date.now();
  let rate = logRateLimits.get(workerId);
  if (!rate || now - rate.lastReset > 1000) {
    logRateLimits.set(workerId, { count: 1, lastReset: now });
    return true;
  }
  rate.count++;
  if (rate.count > 100) return false;
  return true;
}

async function handleRpc(
  tenantSlug: string,
  id: number,
  message: any,
  worker: ChildProcess,
) {
  try {
    let result;
    if (message.method === "db.unsafe") {
      const sql = useDB(tenantSlug);
      const { query, params } = message.args;
      result = await sql.unsafe(query, params || []);
    } else if (message.method === "telemetryDb.unsafe") {
      const { useTelemetryDB } = await import("./db");
      const telemetrySql = useTelemetryDB(tenantSlug);
      const { query, params } = message.args;
      result = await telemetrySql.unsafe(query, params || []);
    } else if (message.method === "telemetryDb.query") {
      const { useTelemetryDB } = await import("./db");
      const telemetrySql = useTelemetryDB(tenantSlug);
      const { strings, values } = message.args;
      result = await telemetrySql(strings, ...values);
    } else if (message.method === "db.query") {
      const sql = useDB(tenantSlug);
      const { strings, values } = message.args;
      result = await sql(strings, ...values);
    } else if (message.method === "globals.get") {
      const { key } = message.args;
      const { globals } = await import("./globalsManager");
      result = await globals.get(tenantSlug, key, true);
    } else if (message.method === "publishMQTT") {
      const { topic, message: mqttMessage } = message.args;
      const { publishMQTT } = await import("./mqtt");
      publishMQTT(`${tenantSlug}/${topic}`, mqttMessage);
      result = true;
    } else if (message.method === "readModbusData") {
      const { ip, port, unitId, startAddress, length, type, dataType } =
        message.args;
      const { queueModbusRead } = await import("./modbusQueue");
      result = await queueModbusRead(
        ip,
        port,
        unitId,
        startAddress,
        length,
        type,
        dataType,
      );
    } else if (message.method === "writeModbusData") {
      const { ip, port, unitId, address, value, dataType } = message.args;
      const { queueModbusWrite } = await import("./modbusQueue");
      result = await queueModbusWrite(
        ip,
        port,
        unitId,
        address,
        value,
        dataType,
      );
    } else if (message.method === "sendEmail") {
      const { options } = message.args;
      const { sendEmail } = await import("./sandbox");
      result = await sendEmail(tenantSlug, options);
    } else if (message.method === "push.send") {
      const { userId, pushPayload } = message.args;
      const { sendPushToUser } = await import("./push");
      result = await sendPushToUser(tenantSlug, userId, pushPayload);
    } else if (message.method === "push.broadcast") {
      const { pushPayload } = message.args;
      const { broadcastPush } = await import("./push");
      result = await broadcastPush(tenantSlug, pushPayload);
    } else if (message.method === "publishWS") {
      const { path, payload } = message.args;
      const { publishWS } = await import("./wsManager");
      result = await publishWS(tenantSlug, path, payload);
    } else if (message.method === "tAsync") {
      const { args } = message.args;
      const { getServerTranslation } = await import("./i18n-server");
      let key = typeof args === "string" ? args : args.key;
      let params = args.params || undefined;
      // using a default locale since microservice has no context
      const locale = "en";
      result = await getServerTranslation(tenantSlug, locale, key, params);
    } else if (message.method === "runGlobal") {
      const { utilName, args } = message.args;
      const { globals } = await import("./globalsManager");
      
      const { useDB } = await import("./db");
      const { publishWS } = await import("./wsManager");
      const { publishMQTT } = await import("./mqtt");
      const { getServerTranslation } = await import("./i18n-server");
      const recordManager = await import("./recordManager");

      let telemetryDbProxy: any = null;
      try {
        const { createEphemeralTelemetryDB } = await import("./db");
        const tDb = await createEphemeralTelemetryDB(tenantSlug);
        telemetryDbProxy = new Proxy(function(){}, {
           get: (_, prop: string) => async (...innerArgs: any[]) => {
              if(typeof tDb[prop] === 'function') return await tDb[prop].bind(tDb)(...innerArgs);
              return tDb[prop];
           },
           apply: async (_, __, argsList: any[]) => await tDb(...argsList)
        });
      } catch(e) {}

      const workerContext = {
        payload: null,
        tenantSlug,
        db: useDB(tenantSlug),
        telemetryDb: telemetryDbProxy,
        publishWS: (path: string, p: any) => publishWS(tenantSlug, path, p),
        publishMQTT: async (topic: string, msg: any) => {
            const finalMsg = typeof msg === 'object' ? JSON.stringify(msg) : String(msg);
            return publishMQTT(`${tenantSlug}/${topic}`, finalMsg);
        },
        t: (key: string, params?: any) => getServerTranslation(tenantSlug, 'en', key, params),
        tAsync: async (targs: any) => {
            const k = typeof targs === 'string' ? targs : targs.key;
            const p = targs.params;
            return getServerTranslation(tenantSlug, 'en', k, p);
        },
        recordManager: (() => {
          const wrapper: any = {};
          for (const prop in recordManager) {
            const val = (recordManager as any)[prop];
            if (typeof val === 'function') {
              wrapper[prop] = async (...args2: any[]) => {
                if (tenantSlug === 'master') return val(...args2);
                return val(tenantSlug, ...args2);
              };
            } else {
              wrapper[prop] = val;
            }
          }
          return wrapper;
        })()
      };

      result = await globals.run(
        tenantSlug,
        utilName,
        workerContext,
        ...(args || []),
      );
    } else {
      throw new Error(`Unknown RPC method: ${message.method}`);
    }
    worker.send({
      type: "rpc_response",
      rpcId: message.rpcId,
      success: true,
      result,
    });
  } catch (err: any) {
    worker.send({
      type: "rpc_response",
      rpcId: message.rpcId,
      success: false,
      error: err.message,
    });
  }
}

async function updateStatus(
  tenantSlug: string,
  id: number,
  status: string,
  errorMsg: string | null = null,
) {
  try {
    const sql = useDB(tenantSlug);
    await sql.unsafe(
      `UPDATE workers SET status = ?, error_msg = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, errorMsg, id],
    );
  } catch (err) {
    console.error(
      `Failed to update status for worker ${id} (Tenant: ${tenantSlug}):`,
      err,
    );
  }
}

export async function startDaemonWorker(
  tenantSlug: string,
  id: number,
  codeOverride?: string,
) {
  const workerId = `${tenantSlug}_${id}`;
  if (activeWorkers.has(workerId)) {
    return { success: true, message: "message.workerAlreadyRunning" };
  }

  const workerRow = await useDB(tenantSlug).unsafe(
    `SELECT code, active FROM workers WHERE id = ?`,
    [id],
  );
  
  if (!workerRow[0] || (workerRow[0].active !== 1 && workerRow[0].active !== true)) {
    return { success: false, message: "Worker is disabled or deleted." };
  }
  
  const code = codeOverride || workerRow[0].code;

  // Sözdizimi doğrulaması — geçersiz kod fork edilmeden yakalanır (S8 Fix)
  try {
    const { validateJS } = await import("./codeValidator");
    await validateJS(code, `Worker ${id}`);
  } catch (err: any) {
    const errMsg = err.key
      ? `Syntax Error: ${JSON.stringify(err.params)}`
      : (err.message || "error.invalidJavaScript");
    await updateStatus(tenantSlug, id, "error", errMsg);
    return { success: false, message: errMsg };
  }

  const { globals } = await import("./globalsManager");
  const allVars = await globals.getAll(tenantSlug, true);
  const globalsObj: Record<string, any> = {};
  for (const v of allVars) {
    globalsObj[v.key] = v.value;
  }

  return new Promise((resolve, reject) => {
    try {
      const worker = fork(workerPath, [], {
        silent: true,
        execArgv: ["--max-old-space-size=256"], // Bellek sızıntısına (OOM) karşı katı kısıtlama
      }); // silent: true creates pipes for stdout/stderr

      worker.stdout?.on("data", (data) => {
        const str = data.toString().trimEnd();
        if (!str) return;
        // console.log(`[Worker ${workerId}]`, str); // Sadece UI log olsun diye kapatÄ±ldÄ±
        if (checkLogRateLimit(workerId)) {
          logEvents.emit("log", {
            sourceId: String(id),
            level: "info",
            args: [str],
            timestamp: new Date().toISOString(),
            tenantSlug,
          });
        }
      });

      worker.stderr?.on("data", (data) => {
        const str = data.toString().trimEnd();
        if (!str) return;
        // console.error(`[Worker ${workerId}] ERROR:`, str); // Sadece UI log olsun diye kapatÄ±ldÄ±
        if (checkLogRateLimit(workerId)) {
          logEvents.emit("log", {
            sourceId: String(id),
            level: "error",
            args: [str],
            timestamp: new Date().toISOString(),
            tenantSlug,
          });
        }
      });

      worker.send({
        type: "init",
        workerData: { code, id, tenantSlug, language: "javascript", globalsObj },
      });
      activeWorkers.set(workerId, worker);
      updateStatus(tenantSlug, id, "running", null);

      worker.on("message", async (message: any) => {
        if (message.type === "rpc") {
          handleRpc(tenantSlug, id, message, worker);
        } else if (message.type === "error") {
          console.error(
            `[Worker ${workerId}] Crashed with error:`,
            message.error,
          );

          logEvents.emit("log", {
            sourceId: String(id),
            level: "error",
            args: [`Crashed with error: ${message.error}`],
            timestamp: new Date().toISOString(),
            tenantSlug,
          });

          fatallyCrashedWorkers.add(workerId);
          activeWorkers.delete(workerId);
          logRateLimits.delete(workerId);
          try {
            const sql = await import("./db").then((m) => m.useDB(tenantSlug));
            await sql.unsafe(
              `UPDATE workers SET active = false, status = 'stopped', error_msg = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [message.error, id],
            );
          } catch (e) {}
        } else if (message.type === "log") {
          if (!checkLogRateLimit(workerId)) return;

          logEvents.emit("log", {
            sourceId: String(id), // Keeping UI backward compat
            level: message.level,
            args: message.args,
            timestamp: new Date().toISOString(),
            tenantSlug, // Can be used by UI to filter
          });

          // Terminali meÅŸgul etmemek iÃ§in aÅŸaÄŸÄ±daki satÄ±rlar kapatÄ±ldÄ±
          /*
          if (message.level === 'error') {
            console.error(`[Worker ${workerId}]`, ...message.args);
          } else if (message.level === 'warn') {
            console.warn(`[Worker ${workerId}]`, ...message.args);
          } else {
            console.log(`[Worker ${workerId}]`, ...message.args);
          }
          */
        }
      });

      worker.on("error", (error: Error) => {
        console.error(`[Worker ${workerId}] Error:`, error.message);

        if (isShuttingDownDaemons) return;

        logEvents.emit("log", {
          sourceId: String(id),
          level: "error",
          args: [`System Error: ${error.message}`],
          timestamp: new Date().toISOString(),
          tenantSlug,
        });

        activeWorkers.delete(workerId);
        logRateLimits.delete(workerId);
        updateStatus(tenantSlug, id, "error", error.message);
      });

      worker.on("exit", (code) => {
        console.log(`[Worker ${workerId}] exited with code ${code}`);

        if (isShuttingDownDaemons) return;
        
        if (fatallyCrashedWorkers.has(workerId)) {
            fatallyCrashedWorkers.delete(workerId);
            return; // Do not auto-restart, it was manually shut down due to fatal error
        }

        logEvents.emit("log", {
          sourceId: String(id),
          level: code === 0 ? "info" : "error",
          args: [`Exited with code ${code}`],
          timestamp: new Date().toISOString(),
          tenantSlug,
        });

        activeWorkers.delete(workerId);
        logRateLimits.delete(workerId);
        if (code !== 0 && code !== null) {
          const now = Date.now();
          let counter = restartCounters.get(workerId);
          import("./globalsManager").then(async ({ globals }) => {
            const crashWindowMs = parseInt(await globals.get('master', 'WORKER_CRASH_WINDOW_MS', false, '60000')) || 60000;
            if (!counter || now - counter.firstCrash > crashWindowMs) {
              counter = { count: 1, firstCrash: now };
            } else {
              counter.count++;
            }
            restartCounters.set(workerId, counter);

            if (counter.count > 5) {
            console.error(
              `ğŸš¨ [Worker ${workerId}] BANNED from auto-restarting due to >5 crashes in 60s.`,
            );
            updateStatus(
              tenantSlug,
              id,
              "error_stopped",
              `Exited with code ${code}. Max retries exceeded (Auto-restart disabled).`,
            );

            logEvents.emit("log", {
              sourceId: String(id),
              level: "error",
              args: [
                `CRITICAL: Auto-restart disabled due to excessive crashing. Manual intervention required.`,
              ],
              timestamp: new Date().toISOString(),
              tenantSlug,
            });
          } else {
            updateStatus(
              tenantSlug,
              id,
              "error",
              `Exited with code ${code}. Auto-restarting in 5s... (${counter.count}/5)`,
            );
            setTimeout(() => {
              startDaemonWorker(tenantSlug, id).catch((e) =>
                console.error(`[Worker ${workerId}] Auto-restart failed:`, e),
              );
            }, 5000);
          }
          }); // Close import().then
        } else {
          updateStatus(tenantSlug, id, "stopped", null);
          restartCounters.delete(workerId);
        }
      });

      resolve({ success: true, message: "message.workerStarted" });
    } catch (err: any) {
      updateStatus(tenantSlug, id, "error", err.message);
      reject(err);
    }
  });
}

export async function stopDaemonWorker(tenantSlug: string, id: number) {
  const workerId = `${tenantSlug}_${id}`;
  const worker = activeWorkers.get(workerId);
  if (worker) {
    worker.kill();
    activeWorkers.delete(workerId);
    logRateLimits.delete(workerId);
    if (!isShuttingDownDaemons) {
      await updateStatus(tenantSlug, id, "stopped", null);
    }
    return { success: true, message: "status.stopped" };
  }
  return { success: true, message: "message.workerNotRunning" };
}

export function isDaemonWorkerRunning(tenantSlug: string, id: number) {
  return activeWorkers.has(`${tenantSlug}_${id}`);
}

export function broadcastMqttMessage(
  tenantSlug: string,
  topic: string,
  payload: any,
) {
  activeWorkers.forEach((worker, workerId) => {
    if (workerId.startsWith(`${tenantSlug}_`)) {
      worker.send({ type: "mqtt", topic, payload });
    }
  });
}

let isInitializingDaemons = false;

export async function initDaemonWorkers() {
  isInitializingDaemons = true;
  try {
    const mSql = getMasterDb();
    const tenantsResult = await mSql`SELECT slug FROM tenants WHERE status = 'active'`;
    const tenants = [{ slug: "master" }, ...tenantsResult];

    for (const t of tenants) {
      try {
        const sql = useDB(t.slug);
        await sql.unsafe(
          "UPDATE workers SET status = 'stopped' WHERE type = 'daemon'",
        );

        const services = await sql.unsafe(
          "SELECT id, code FROM workers WHERE type = 'daemon' AND active = 1 AND autostart = 1",
        );
        for (const service of services) {
          if (!isInitializingDaemons) break; // HMR Zombie Koruması
          console.log(
            `[Tenant: ${t.slug}] Autostarting worker ID: ${service.id}`,
          );
          await startDaemonWorker(t.slug, service.id, service.code);
        }
      } catch (err) {
        console.error(
          `[DaemonWorkers] Tenant ${t.slug} initialization failed`,
          err,
        );
      }
    }
  } catch (err) {
    console.error("[DaemonWorkers] Initialization failed", err);
  } finally {
    isInitializingDaemons = false;
  }
}

export async function stopAllDaemonWorkers() {
  // @ts-ignore
  isInitializingDaemons = false; // Kilit İptali dummy
  isShuttingDownDaemons = true;
  const keys = Array.from(activeWorkers.keys());
  for (const workerId of keys) {
    try {
      const match = workerId.match(/^(.*)_(\d+)$/);
      if (match && match[1] && match[2]) {
        await stopDaemonWorker(match[1], parseInt(match[2], 10));
      }
    } catch (e) {
      console.error(`[DaemonWorkers] Failed to stop ${workerId}:`, e);
    }
  }
}

export async function stopAllTenantWorkers(tenantSlug: string) {
  const ids: number[] = [];
  for (const [workerId] of activeWorkers.entries()) {
    if (workerId.startsWith(`${tenantSlug}_`)) {
      const match = workerId.match(/^(.*)_(\d+)$/);
      if (match && match[2]) {
        ids.push(parseInt(match[2], 10));
      }
    }
  }

  for (const id of ids) {
    try {
      await stopDaemonWorker(tenantSlug, id);
    } catch (e) {
      console.error(`Failed to stop worker ${id} for tenant ${tenantSlug}`, e);
    }
  }
}

// --- CRON WORKERS (Formerly Scheduler) ---
// --- QUARTZ CRON YARDIMCI FONKSÄ°YONLAR ---

// JS Date objesinde ayÄ±n son gÃ¼nÃ¼nÃ¼ bulur
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// Belirtilen gÃ¼nÃ¼n hafta iÃ§i olup olmadÄ±ÄŸÄ±nÄ± kontrol eder
function isWeekday(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day).getDay();
  return d !== 0 && d !== 6; // 0: Pazar, 6: Cumartesi
}

// "W" (En yakÄ±n hafta iÃ§i) mantÄ±ÄŸÄ±nÄ± hesaplar
function getNearestWeekday(year: number, month: number, day: number): number {
  if (isWeekday(year, month, day)) return day;
  const d = new Date(year, month - 1, day).getDay();

  if (d === 6) {
    // Cumartesi ise
    if (day === 1) return 3; // AyÄ±n 1'i cumartesi ise pazartesiye (3'Ã¼ne) atla
    return day - 1; // Cuma gÃ¼nÃ¼ne Ã§ek
  }

  if (d === 0) {
    // Pazar ise
    const lastDay = getDaysInMonth(year, month);
    if (day === lastDay) return day - 2; // AyÄ±n son gÃ¼nÃ¼ pazar ise cumaya Ã§ek
    return day + 1; // Pazartesiye it
  }
  return day;
}

// Ay ve GÃ¼n isimlerini Quartz standart rakamlarÄ±na dÃ¶nÃ¼ÅŸtÃ¼rÃ¼r (SUN=1, SAT=7)
const MONTHS: Record<string, string> = {
  JAN: "1",
  FEB: "2",
  MAR: "3",
  APR: "4",
  MAY: "5",
  JUN: "6",
  JUL: "7",
  AUG: "8",
  SEP: "9",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};
const DOWS: Record<string, string> = {
  SUN: "1",
  MON: "2",
  TUE: "3",
  WED: "4",
  THU: "5",
  FRI: "6",
  SAT: "7",
};

function normalizeNames(str: string, type: string) {
  let res = str.toUpperCase();
  if (type === "month") {
    for (const [k, v] of Object.entries(MONTHS))
      res = res.replace(new RegExp(k, "g"), v);
  } else if (type === "dow") {
    for (const [k, v] of Object.entries(DOWS))
      res = res.replace(new RegExp(k, "g"), v);
  }
  return res;
}

// Tekil bir Cron parÃ§asÄ±nÄ± deÄŸerlendirir
function matchPart(
  part: string,
  fieldValue: number,
  min: number,
  max: number,
  date: Date,
  type: string,
): boolean {
  if (part === "*" || part === "?") return true;

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dow = date.getDay() + 1; // JS 0-6 verir, Quartz'da 1=Pazar, 7=Cumartesi (ArayÃ¼z hint'ine gÃ¶re)

  // 1. GÃœN (Day of Month) Ã–zel Karakterleri
  if (type === "dom") {
    if (part === "LW") {
      let target = getDaysInMonth(year, month);
      while (!isWeekday(year, month, target)) target--;
      return fieldValue === target;
    }
    if (part === "L") {
      return fieldValue === getDaysInMonth(year, month);
    }
    if (part.endsWith("W")) {
      const targetDay = parseInt(part.replace("W", ""), 10);
      if (isNaN(targetDay)) return false;
      return fieldValue === getNearestWeekday(year, month, targetDay);
    }
  }

  // 2. HAFTA GÃœNÃœ (Day of Week) Ã–zel Karakterleri
  if (type === "dow") {
    if (part.endsWith("L")) {
      const targetDow = parseInt(part.replace("L", ""), 10) as any;
      if (isNaN(targetDow)) return false;
      const lastDay = getDaysInMonth(year, month);
      return dow === targetDow && day + 7 > lastDay; // AyÄ±n o gÃ¼ne denk gelen son haftasÄ± mÄ±?
    }
    if (part.includes("#")) {
      const [targetDowStr, nthStr] = part.split("#") as any;
      const targetDow = parseInt(targetDowStr, 10);
      const nth = parseInt(nthStr, 10);
      if (isNaN(targetDow) || isNaN(nth)) return false;

      const currentNth = Math.ceil(day / 7);
      return dow === targetDow && currentNth === nth; // Ã–rn: 2#1 -> Ä°lk (1) Pazartesi (2) mi?
    }
  }

  // 3. AdÄ±m (Step) MantÄ±ÄŸÄ± (Ã¶rn: */5 veya 10-20/2)
  if (part.includes("/")) {
    const [rangePart, stepStr] = part.split("/") as any;
    const step = parseInt(stepStr, 10);
    if (isNaN(step)) return false;

    let start = min;
    let end = max;

    if (rangePart !== "*") {
      if (rangePart.includes("-")) {
        const [startStr, endStr] = rangePart.split("-");
        start = parseInt(startStr, 10);
        end = parseInt(endStr, 10);
      } else {
        start = parseInt(rangePart, 10);
      }
    }
    return (
      fieldValue >= start &&
      fieldValue <= end &&
      (fieldValue - start) % step === 0
    );
  }

  // 4. AralÄ±k (Range) MantÄ±ÄŸÄ± (Ã¶rn: 1-5)
  if (part.includes("-")) {
    const [startStr, endStr] = part.split("-") as any;
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    return fieldValue >= start && fieldValue <= end;
  }

  // 5. Tam EÅŸleÅŸme (Exact Match)
  const val = parseInt(part, 10);
  return val === fieldValue;
}

function matchField(
  fieldValue: number,
  cronField: string,
  min: number,
  max: number,
  date: Date,
  type: string,
): boolean {
  if (cronField === "*" || cronField === "?") return true;

  // Ä°simlendirmeleri sayÄ±lara Ã§evir (JAN->1, SUN->1 vb.)
  const normalizedField = normalizeNames(cronField, type);

  // VirgÃ¼l ile ayrÄ±lmÄ±ÅŸ listeleri (Ã¶rn: 1,15,L) destekle
  const parts = normalizedField.split(",");
  for (const part of parts) {
    if (matchPart(part, fieldValue, min, max, date, type)) {
      return true;
    }
  }
  return false;
}

export function matchesCron(
  expression: string,
  date: Date = new Date(),
): boolean {
  const fields = expression.trim().split(/\s+/);

  if (fields.length < 5 || fields.length > 7) {
    return false;
  }

  let secondExpr = "0";
  let minExpr = "*";
  let hourExpr = "*";
  let domExpr = "*";
  let monthExpr = "*";
  let dowExpr = "*";
  let yearExpr = "*";

  if (fields.length === 5) {
    [minExpr, hourExpr, domExpr, monthExpr, dowExpr] = fields as any;
  } else if (fields.length === 6) {
    [secondExpr, minExpr, hourExpr, domExpr, monthExpr, dowExpr] =
      fields as any;
  } else if (fields.length >= 7) {
    [secondExpr, minExpr, hourExpr, domExpr, monthExpr, dowExpr, yearExpr] =
      fields as any;
  }

  const second = date.getSeconds();
  const min = date.getMinutes();
  const hour = date.getHours();
  const dom = date.getDate();
  const month = date.getMonth() + 1;
  const dow = date.getDay() + 1;
  const year = date.getFullYear();

  const isSecondMatch = matchField(second, secondExpr, 0, 59, date, "second");
  const isMinMatch = matchField(min, minExpr, 0, 59, date, "minute");
  const isHourMatch = matchField(hour, hourExpr, 0, 23, date, "hour");
  const isDomMatch = matchField(dom, domExpr, 1, 31, date, "dom");
  const isMonthMatch = matchField(month, monthExpr, 1, 12, date, "month");
  const isDowMatch = matchField(dow, dowExpr, 1, 7, date, "dow");
  const isYearMatch = matchField(year, yearExpr, 1970, 2099, date, "year");

  return (
    isSecondMatch &&
    isMinMatch &&
    isHourMatch &&
    isDomMatch &&
    isMonthMatch &&
    isDowMatch &&
    isYearMatch
  );
}

let lastRunSecond = -1;

export interface CachedCronJob {
  tenantSlug: string;
  id: number;
  name: string;
  code: string;
  cron_expression: string;
}

let cronJobsCache: CachedCronJob[] = [];
let isCronCacheLoading = false;

export async function refreshCronCache() {
  if (isCronCacheLoading) return;
  isCronCacheLoading = true;
  try {
    const { getMasterDb, useDB } = await import("./db");
    const mSql = getMasterDb();
    const tenantsResult =
      await mSql`SELECT slug FROM tenants WHERE status = 'active'`;
    const tenants = [{ slug: "master" }, ...tenantsResult];

    const newCache: CachedCronJob[] = [];
    for (const t of tenants) {
      try {
        const db = useDB(t.slug);
        const activeJobs =
          await db`SELECT id, name, code, cron_expression FROM workers WHERE type = 'cron' AND active = 1`;
        for (const job of activeJobs) {
          newCache.push({
            tenantSlug: t.slug,
            id: job.id,
            name: job.name,
            code: job.code,
            cron_expression: job.cron_expression,
          });
        }
      } catch (err) {}
    }
    cronJobsCache = newCache;
  } catch (err) {
    console.error("[ERROR] Failed to refresh Cron cache:", err);
  } finally {
    isCronCacheLoading = false;
  }
}

export function initCronWorkers() {
  console.log("[CRON] Cron Cron Workers Engine başlatılıyor...");

  if ((globalThis as any).__cronWorkerInterval) {
    clearInterval((globalThis as any).__cronWorkerInterval);
  }

  refreshCronCache();
  if ((globalThis as any).__cronCacheInterval) {
    clearInterval((globalThis as any).__cronCacheInterval);
  }
  (globalThis as any).__cronCacheInterval = setInterval(
    refreshCronCache,
    60000,
  );

  let isRunning = false;
  const scheduleCronTick = async () => {
    try {
      const { globals } = await import("./globalsManager");
      const tickMs = parseInt(await globals.get('master', 'CRON_TICK_MS', false, '1000')) || 1000;
      
      if (isRunning) {
        (globalThis as any).__cronWorkerInterval = setTimeout(scheduleCronTick, tickMs);
        return;
      }
      
      const now = new Date();
      const currentSecondKey = Math.floor(now.getTime() / 1000);

      if (lastRunSecond === currentSecondKey) {
        (globalThis as any).__cronWorkerInterval = setTimeout(scheduleCronTick, tickMs);
        return;
      }
      
      lastRunSecond = currentSecondKey;
      isRunning = true;

      try {
            for (const job of cronJobsCache) {
              if (matchesCron(job.cron_expression, now)) {
                try {
                  const { useDB } = await import("./db");
                  const db = useDB(job.tenantSlug);
                  const cronJobKey = `${job.tenantSlug}_${job.id}`;
                  
                  if (runningCronJobs.has(cronJobKey)) {
                      continue; // Skip this tick if the previous fork is still running
                  }

                  const lockResult = await db`
                    UPDATE workers 
                    SET last_run_second = ${currentSecondKey} 
                    WHERE id = ${job.id} AND (last_run_second IS NULL OR last_run_second < ${currentSecondKey})
                    RETURNING id
                  `;

                  if (lockResult.length === 0) continue;
                  
                  runningCronJobs.add(cronJobKey);

                  const payload = {
                    jobId: job.id,
                    jobName: job.name,
                    runAt: now.toISOString(),
                    db,
                  };

                  const startTime = Date.now();
                  const workerPath = resolve(
                    process.cwd(),
                    "server",
                    "utils",
                    "worker.js",
                  );
                  
                  const workerMemoryLimit = parseInt(await globals.get(job.tenantSlug, 'WORKER_MEMORY_LIMIT_MB', false, '256')) || 256;
                  const workerTimeoutMs = parseInt(await globals.get(job.tenantSlug, 'CRON_WORKER_TIMEOUT_MS', false, '60000')) || 60000;

                  const worker = fork(workerPath, [], {
                    env: process.env,
                    silent: true,
                    execArgv: [`--max-old-space-size=${workerMemoryLimit}`], // Parametric OOM limit
                  });

                  // Hard timeout for Cron worker to prevent Fork Bombs
                  const cronTimeout = setTimeout(() => {
                    try {
                      console.error(
                        `[ALERT] Cron Worker [${job.id}] TIMEOUT (${workerTimeoutMs}ms). Force killed! (Fork Bomb Protection)`,
                      );
                      worker.kill("SIGKILL");
                    } catch (e) {}
                  }, workerTimeoutMs);

                  worker.on("exit", () => {
                    clearTimeout(cronTimeout);
                    runningCronJobs.delete(cronJobKey);
                  });

            const allVars = await globals.getAll(job.tenantSlug, true);
            const globalsObj: Record<string, any> = {};
            for (const v of allVars) {
              globalsObj[v.key] = v.value;
            }

            worker.send({
              type: "init",
              workerData: {
                code: job.code,
                tenantSlug: job.tenantSlug,
                isCronWorker: true,
                payload: payload,
                globalsObj,
              },
            });

            worker.on("message", (msg: any) => {
              if (msg.type === "log") {
                logEvents.emit("log", {
                  sourceId: `cron_worker_${job.id}`,
                  level: msg.level,
                  args: msg.args,
                  timestamp: new Date().toISOString(),
                  metadata: {},
                });
              } else if (msg.type === "error") {
                logEvents.emit("log", {
                  sourceId: `cron_worker_${job.id}`,
                  level: "error",
                  args: [msg.error],
                  timestamp: new Date().toISOString(),
                  metadata: {},
                });
              } else if (msg.type === "rpc") {
                handleRpc(job.tenantSlug, job.id, msg, worker);
              }
            });

            worker.on("error", (err) => {
              runningCronJobs.delete(cronJobKey);
              const execTime = Date.now() - startTime;
              const errMsg = err.message || "Unknown Error";
              console.error(
                `[CRON ERROR] Cron Execution Error [${job.name}] (Duration: ${execTime}ms):`,
                err,
              );

              logEvents.emit("log", {
                sourceId: `cron_worker_${job.id}`,
                level: "error",
                args: [`Cron Execution Error: ${errMsg}`],
                timestamp: new Date().toISOString(),
                metadata: {},
              });
            });
          } catch (jobErr) {
            runningCronJobs.delete(`${job.tenantSlug}_${job.id}`);
            console.error(
              `[ERROR] Job Error [${job.tenantSlug}/${job.name}]:`,
              jobErr,
            );
          }
        }
      }
    } catch (err) {
      console.error("[ERROR] Cron Engine execution error:", err);
    } finally {
      isRunning = false;
    }
    
    (globalThis as any).__cronWorkerInterval = setTimeout(scheduleCronTick, tickMs);
  } catch (e) {
    console.error("Cron tick outer error:", e);
    (globalThis as any).__cronWorkerInterval = setTimeout(scheduleCronTick, 1000);
  }
  };

  scheduleCronTick();
}

// --- SANDBOX TEST DAEMON ---
export async function startTestDaemon(tenantSlug: string, code: string) {
  const workerId = `${tenantSlug}_test_sandbox`;
  if (activeWorkers.has(workerId)) {
    activeWorkers.get(workerId)?.kill();
    activeWorkers.delete(workerId);
  }

  return new Promise((resolve, reject) => {
    try {
      const worker = fork(workerPath, [], {
        silent: true,
        execArgv: ["--max-old-space-size=256"],
      });

      worker.stdout?.on("data", (data) => {
        logEvents.emit("log", {
          sourceId: "test-sandbox-worker",
          level: "info",
          args: [data.toString().trimEnd()],
          timestamp: new Date().toISOString(),
          tenantSlug,
        });
      });

      worker.stderr?.on("data", (data) => {
        logEvents.emit("log", {
          sourceId: "test-sandbox-worker",
          level: "error",
          args: [data.toString().trimEnd()],
          timestamp: new Date().toISOString(),
          tenantSlug,
        });
      });

      worker.send({
        type: "init",
        workerData: { code, id: "test_sandbox", tenantSlug, language: "javascript" },
      });

      activeWorkers.set(workerId, worker);

      worker.on("message", async (message: any) => {
        if (message.type === "rpc") {
          handleRpc(tenantSlug, "test_sandbox" as any, message, worker);
        } else if (message.type === "log") {
          logEvents.emit("log", {
            sourceId: "test-sandbox-worker",
            level: message.level,
            args: message.args,
            timestamp: new Date().toISOString(),
            tenantSlug,
          });
        }
      });
      
      resolve({ success: true });
    } catch (err) {
      reject(err);
    }
  });
}

export async function stopTestDaemon(tenantSlug: string) {
  const workerId = `${tenantSlug}_test_sandbox`;
  if (activeWorkers.has(workerId)) {
    activeWorkers.get(workerId)?.kill();
    activeWorkers.delete(workerId);
    logEvents.emit("log", {
      sourceId: "test-sandbox-worker",
      level: "warn",
      args: ["Sandbox Test (Daemon) manuel olarak durduruldu."],
      timestamp: new Date().toISOString(),
      tenantSlug,
    });
    return { success: true };
  }
  return { success: false };
}

export async function shutdownDaemonWorkers() {
  console.log('🛑 [WorkerManager] Shutting down all daemon workers...');
  isShuttingDownDaemons = true;
  for (const [workerId, worker] of activeWorkers.entries()) {
    try {
      worker.kill('SIGTERM');
      console.log(`  ✓ Killed worker ${workerId}`);
    } catch (e) {
      console.error(`  ✗ Failed to kill worker ${workerId}:`, e);
    }
  }
  activeWorkers.clear();
  runningCronJobs.clear();
}
