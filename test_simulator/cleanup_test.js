import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../.data/master/master_app.db');
if (!fs.existsSync(dbPath)) {
  console.error("Database not found:", dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

console.log("Cleaning up #testsimulator data...");

try {
  // Use LIKE because hashtags is a JSON string array e.g. '["#testsimulator"]'
  const tables = ['entities', 'records', 'devices', 'pages', 'endpoints', 'workers'];
  
  for (const table of tables) {
    const info = db.prepare(`DELETE FROM ${table} WHERE hashtags LIKE '%#testsimulator%'`).run();
    console.log(`Deleted ${info.changes} rows from ${table}`);
  }
  
  // Also clean telemetry from duckdb if needed, but DuckDB telemetry table has no hashtags. We can just leave it or clear telemetry for simulator devices
  // Since we recreate the DB in generator, the simulator devices will just start sending again.

  console.log("Cleanup complete!");
} catch (e) {
  console.error("Cleanup error:", e);
} finally {
  db.close();
}
