import { getSysVar } from './sysvars';

export interface DeviceCommand {
  id: string;
  device_id: string;
  command_name: string;
  payload: any;
  status: 'PENDING' | 'SENT' | 'SUCCESS' | 'FAILED' | 'TIMEOUT';
  response: any;
  correlation_id: string;
  created_at: Date;
  updated_at: Date;
}

const g = globalThis as any;
g.__deviceCommandsStore = g.__deviceCommandsStore || new Map<string, Map<string, DeviceCommand>>();

export function getTenantStore(tenantSlug: string): Map<string, DeviceCommand> {
  let tenantStore = g.__deviceCommandsStore.get(tenantSlug);
  if (!tenantStore) {
    tenantStore = new Map<string, DeviceCommand>();
    g.__deviceCommandsStore.set(tenantSlug, tenantStore);
  }
  return tenantStore;
}

export function getAllCommands(tenantSlug: string, deviceId: string): DeviceCommand[] {
  const store = getTenantStore(tenantSlug);
  return Array.from(store.values())
    .filter(cmd => cmd.device_id === deviceId)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(0, 50);
}

export function addCommand(tenantSlug: string, cmd: DeviceCommand) {
  const store = getTenantStore(tenantSlug);
  store.set(cmd.correlation_id, cmd);
}

export function updateCommandStatus(tenantSlug: string, correlationId: string, status: DeviceCommand['status'], response: any = null) {
  const store = getTenantStore(tenantSlug);
  const cmd = store.get(correlationId);
  if (cmd) {
    cmd.status = status;
    if (response !== null) cmd.response = response;
    cmd.updated_at = new Date();
  }
}

/**
 * Schedules a RAM-based timeout for an MQTT command.
 * If the command is not responded to within the timeout, its status is set to TIMEOUT.
 */
export async function scheduleCommandTimeout(tenantSlug: string, correlationId: string, createdAtMs: number = Date.now()) {
  let timeoutSec = 30;
  try {
    const sysVal = await getSysVar(tenantSlug, 'MQTT_COMMAND_TIMEOUT', false, '30');
    timeoutSec = parseInt(sysVal, 10) || 30;
  } catch (e) {
    // ignore
  }
  
  const timeoutMs = timeoutSec * 1000;
  const now = Date.now();
  const expiresAt = createdAtMs + timeoutMs;
  let delay = expiresAt - now;
  
  if (delay <= 0) {
    delay = 1; // Trigger on next tick if already expired
  }

  setTimeout(async () => {
    try {
      const store = getTenantStore(tenantSlug);
      const cmd = store.get(correlationId);
      if (cmd && (cmd.status === 'PENDING' || cmd.status === 'SENT')) {
        updateCommandStatus(tenantSlug, correlationId, 'TIMEOUT', { error: 'Device did not respond in time.' });
        console.log(`[Queue] [TIMEOUT] Komut zaman aşımına uğradı: ${correlationId} (Tenant: ${tenantSlug})`);
      }
    } catch (e: any) {
      console.error(`Command timeout update failed for ${correlationId}:`, e.message);
    }
  }, delay);
}

/**
 * Cleanup job to remove very old commands from memory (e.g., older than 1 hour).
 */
export function cleanupOldCommands() {
  if (!g.__deviceCommandsStore) return;

  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;

  for (const [tenantSlug, store] of g.__deviceCommandsStore.entries()) {
    for (const [correlationId, cmd] of store.entries()) {
      if (now - cmd.created_at.getTime() > ONE_HOUR) {
        store.delete(correlationId);
      }
    }
  }
}

// Run cleanup every 15 minutes
setInterval(cleanupOldCommands, 15 * 60 * 1000).unref();

export async function initCommandTimeouts(tenantSlug: string, sql: any) {
  // DB tablosu silindiği için burada yapılacak bir şey kalmadı.
  console.log(`[Queue] [${tenantSlug}] In-Memory command queue ready.`);
}
