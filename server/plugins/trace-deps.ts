import 'greenlock-express';
import 'node-forge';
import 'modbus-serial';
import 'aedes';
import 'mqtt';

import 'duckdb';
import 'crossws/adapters/node';

export default defineNitroPlugin(() => {
  // Bu plugin sadece yukarıdaki modüllerin build sırasında
  // Nitro tarafından "kullanılıyor" olarak algılanıp
  // .output/server/node_modules içine kopyalanması için vardır.
});
