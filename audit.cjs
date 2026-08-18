const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join('c:', 'Users', 'murat', 'Desktop', 'baseapp', 'data', 'kestiremiyorum_app.db');
const jsonPath = path.join('c:', 'Users', 'murat', 'Desktop', 'baseapp', 'xberber.json');

try {
  const db = new Database(dbPath, { readonly: true });
  console.log('--- ENTITY RECORD COUNTS FROM DB ---');
  const entities = db.prepare('SELECT id, name, slug FROM entities').all();
  entities.forEach(e => {
    const recordCount = db.prepare('SELECT COUNT(*) as count FROM records WHERE entity_id = ?').get(e.id).count;
    console.log(`- ${e.name} (${e.slug}): ${recordCount} records`);
  });
  db.close();

  console.log('\n--- SYSTEM ARCHITECTURE (xberber.json) ---');
  const appData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  
  console.log('\nPAGES:');
  appData.pages.forEach(p => console.log(` - ${p.id}`));

  console.log('\nENDPOINTS:');
  appData.endpoints.forEach(e => console.log(` - ${e.name} (${e.route_pattern})`));

  console.log('\nENTITIES:');
  appData.entities.forEach(e => console.log(` - ${e.name} (${e.slug})`));

} catch (err) {
  console.error(err);
}
