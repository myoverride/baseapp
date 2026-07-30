const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('../server/database/master.sqlite');
db.all("SELECT id, name, type FROM endpoints WHERE type = 'ws'", [], (err, rows) => {
    if (err) throw err;
    console.log(rows);
});
db.close();
