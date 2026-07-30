
import { createEphemeralTelemetryDB } from '../../utils/db';
export default defineEventHandler(async () => {
  try {
    const telemetryDb = await createEphemeralTelemetryDB('master');
    const rows = await telemetryDb.unsafe('SELECT 1 as is_duck');
    telemetryDb.close();
    return { success: true, rows };
  } catch (e: any) {
    return { error: e.message };
  }
});

