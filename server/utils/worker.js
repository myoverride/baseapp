import vm from 'vm';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { createRequire } from 'module';
import { resolve, join } from 'path';
import fs from 'fs';
import { transpileQueryAndParams } from './sqlTranspiler';
/*
 * Worker Process Execution Script (DAEMON)
 * 
 * Bu script ana thread'den ayrı, izole bir süreçte çalışır.
 * Uzun ömürlü (Daemon) servisler içindir.
 */

const parentPort = {
  postMessage: (msg) => {
    if (process.send) process.send(msg);
  },
  on: (event, cb) => process.on(event, cb)
};

let workerData = null;
const pendingRpc = new Map();
let rpcIdCounter = 0;



// Query transpiler helper for PostgreSQL syntax compatibility is now imported from sqlTranspiler.ts
process.on('message', (msg) => {
  if (msg.type === 'init') {
    workerData = msg.workerData;
    executeInWorker().catch(e => {
      parentPort.postMessage({ type: 'error', error: e.message });
      process.exit(1);
    });
  } else if (msg.type === 'rpc_response') {
    const pending = pendingRpc.get(msg.rpcId);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingRpc.delete(msg.rpcId);
      if (msg.error) pending.reject(new Error(msg.error));
      else pending.resolve(msg.result);
    }
  } else if (msg.type === 'mqtt') {
    mqttEmitter(msg.topic, msg.payload);
  }
});

// ANA SUNUCU (Nuxt) YENİDEN BAŞLARSA VEYA BAĞLANTI KOPARSA ZOMBİ OLMAMAK İÇİN ÇIK
process.on('disconnect', () => {
  process.exit(0);
});

let baseRequire;
try {
  baseRequire = createRequire(resolve(process.cwd(), 'index.js'));
} catch {
  baseRequire = typeof require !== 'undefined' ? require : createRequire(process.cwd() + '/index.js');
}

const appRoot = process.env.APP_HOME || process.cwd();
const pluginsDir = join(appRoot, 'plugins');
if (!fs.existsSync(pluginsDir)) { try { fs.mkdirSync(pluginsDir, { recursive: true }); } catch { } }
const pluginsRequire = createRequire(join(pluginsDir, 'index.js'));

const customRequire = (id) => {
  try { return pluginsRequire(id); } catch { return baseRequire(id); }
};

function callMainThread(method, args) {
  return new Promise((resolve, reject) => {
    const rpcId = ++rpcIdCounter;
    const timeout = setTimeout(() => {
      pendingRpc.delete(rpcId);
      reject(new Error(`RPC timeout: ${method}`));
    }, 30000);

    pendingRpc.set(rpcId, { resolve, reject, timeout });
    parentPort.postMessage({ type: 'rpc', rpcId, method, args });
  });
}

let mqttEmitter = () => { };

async function executeInWorker() {
  const { code, tenantSlug } = workerData;
  const mqttCallbacks = [];
  mqttEmitter = (topic, payload) => {
    mqttCallbacks.forEach(cb => {
      try { cb(topic, payload); } catch (e) { parentPort.postMessage({ type: 'log', level: 'error', args: ['MQTT error:', e.message] }); }
    });
  };

  // Preserve expected db wrapper logic for custom sql strings, passing everything to main thread via RPC
  const sql = async (strings, ...values) => {
    return callMainThread('db.query', { strings, values });
  };
  sql.unsafe = async (query, params = []) => {
    return callMainThread('db.unsafe', { query, params });
  };
  sql.begin = async () => { throw new Error("db.begin() not supported in worker."); };
  sql.json = (val) => JSON.stringify(val);

  const contextObj = {
    payload: workerData.payload || null,
    context: { tenantSlug: workerData.tenantSlug },
    console: {
      log: (...args) => parentPort.postMessage({ type: 'log', level: 'info', args: args.map(safeClone) }),
      error: (...args) => parentPort.postMessage({ type: 'log', level: 'error', args: args.map(safeClone) }),
      warn: (...args) => parentPort.postMessage({ type: 'log', level: 'warn', args: args.map(safeClone) }),
      info: (...args) => parentPort.postMessage({ type: 'log', level: 'info', args: args.map(safeClone) })
    },
    sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
    mqtt: { onMessage: (cb) => mqttCallbacks.push(cb) },
    fetch: globalThis.fetch,
    Buffer,
    crypto,
    bcrypt,
    process,
    env: process.env,
    require: customRequire,
    db: sql,
    sql: sql,
    push: {
      send: (userId, pushPayload) => callMainThread('push.send', { userId, pushPayload }),
      broadcast: (pushPayload) => callMainThread('push.broadcast', { pushPayload })
    },
    publishWS: (path, payload) => callMainThread('publishWS', { path, payload }),
    tAsync: (args) => callMainThread('tAsync', { args }),
    telemetryDb: {
      unsafe: async (query, params = []) => callMainThread('telemetryDb.unsafe', { query, params })
    },
    publishMQTT: (topic, message) => callMainThread('publishMQTT', { topic, message }),
    subscribeMQTT: (cb) => mqttCallbacks.push(cb),
    sendEmail: (options) => callMainThread('sendEmail', { options }),
    readModbusData: (ip, port, unitId, startAddress, length, type = 'holding', dataType = 'uint16') => callMainThread('readModbusData', { ip, port, unitId, startAddress, length, type, dataType }),
    writeModbusData: (ip, port, unitId, address, value, dataType = 'uint16') => callMainThread('writeModbusData', { ip, port, unitId, address, value, dataType }),
    useUtil: async (utilName) => async (...args) => callMainThread('useUtil', { utilName, args }),
    utils: new Proxy({}, {
      get: (_, prop) => async (...args) => callMainThread('useUtil', { utilName: prop, args })
    })
  };

  let executableCode = code.trim();
  if (executableCode.startsWith('export default ')) {
    executableCode = executableCode.replace(/^export\s+default\s+/, 'const _defaultExport = ') + '\nif (typeof _defaultExport === "function") await _defaultExport(typeof payload !== "undefined" ? payload : {});';
  }

  try {
    const context = vm.createContext(contextObj);
    const wrappedCode = `
      (async () => {
        ${executableCode}
      })()
    `;
    const script = new vm.Script(wrappedCode);
    // Senkron sonsuz döngü koruması (S7 Fix)
    if (workerData.isCronWorker) {
      await script.runInContext(context, { timeout: 55000 });
    } else {
      // Daemon'lar tamamen bağımsız mikroservis gibi çalışır, zaman sınırı yoktur.
      await script.runInContext(context);
    }

    // Kod normal şekilde sonlanırsa bile thread'i açık tut (Daemon mode)
    if (workerData.isCronWorker) {
      parentPort.postMessage({ type: 'cron_worker_done' });
      process.exit(0);
    }
  } catch (error) {
    parentPort.postMessage({ type: 'error', error: error.message || error.toString() });
    process.exit(1);
  }
}

function safeClone(arg) {
  if (typeof arg === 'object' && arg !== null) {
    try { return JSON.parse(JSON.stringify(arg)); } catch { return String(arg); }
  }
  return arg;
}

