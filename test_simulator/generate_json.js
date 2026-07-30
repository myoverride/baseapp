import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Generating AppStudio JSON Data...');

const app = {
  app_name: 'TEST SIMULATOR App',
  tag: '#testsimulator',
  export_date: new Date().toISOString(),
  components: {
    entities: [],
    records: [],
    devices: [],
    pages: [],
    endpoints: [],
    workers: []
  }
};

// 1. Entities
app.components.entities.push({
  name: 'Factory',
  slug: 'factory',
  schema: JSON.stringify({
    name: { type: 'text', required: true }
  }),
  hashtags: JSON.stringify(['#testsimulator'])
});

// The user mentioned: "makineye device_id yazmayacağız. cihaz için zaten record_id var, onu tanımlayacağız."
// This means the device_id field in Machine should NOT exist. Instead, the devices table has a 'record_id' column that links back to the Machine record.
app.components.entities.push({
  name: 'Machine',
  slug: 'machine',
  schema: JSON.stringify({
    name: { type: 'text', required: true },
    factory_id: { type: 'relation', targetEntitySlug: 'factory' }
  }),
  hashtags: JSON.stringify(['#testsimulator'])
});

// 2. Devices and Records
let recordIdOffset = 1;
let deviceIdCounter = 1; // Explicit counter for devices

for (let f = 1; f <= 10; f++) {
  const factoryName = `Fabrika ${f}`;
  
  // Factory Record
  const factoryTimestamp = new Date(Date.now() - (10000000) + recordIdOffset * 1000).toISOString();
  app.components.records.push({
    id: recordIdOffset, // ID doesn't matter for deduplication, but we need it for devices link
    entity_slug: 'factory',
    created_at: factoryTimestamp,
    updated_at: new Date().toISOString(),
    hashtags: JSON.stringify(['#testsimulator']),
    data: JSON.stringify({ name: factoryName })
  });
  const currentFactoryRecordId = recordIdOffset;
  recordIdOffset++;

  for (let m = 1; m <= 100; m++) {
    const machineName = `Makine ${f}-${m}`;
    const deviceId = `sim_device_${f}_${m}`;

    // Machine Record
    const machineTimestamp = new Date(Date.now() - (5000000) + recordIdOffset * 1000).toISOString();
    app.components.records.push({
      id: recordIdOffset,
      entity_slug: 'machine',
      created_at: machineTimestamp,
      updated_at: new Date().toISOString(),
      hashtags: JSON.stringify(['#testsimulator']),
      data: JSON.stringify({
        name: machineName,
        factory_id: factoryName // import.ts will resolve this string to Factory Record ID via val_str
      })
    });
    const currentMachineRecordId = recordIdOffset;
    recordIdOffset++;

    // Device
    app.components.devices.push({
      id: deviceIdCounter++,
      device_id: deviceId,
      secret_key: `secret_${deviceId}`,
      schema: JSON.stringify({
        target_entity_slug: 'machine',
        target_match_field: 'name',
        target_match_value: machineName,
        name: machineName,
        type: 'simulator',
        config: {}
      }),
      hashtags: JSON.stringify(['#testsimulator'])
    });
  }
}

// 3. Dashboards (Pages)
const realtimeTemplate = `<v-container fluid class="pa-4">
  <v-row>
    <v-col cols="12">
      <v-card class="bg-indigo-darken-4 text-white">
        <v-card-title class="text-h4 font-weight-bold py-4">Realtime Telemetry Dashboard</v-card-title>
        <v-card-subtitle class="pb-4 text-subtitle-1">Live data from 1000 devices via MQTT/WS</v-card-subtitle>
      </v-card>
    </v-col>
  </v-row>
  
  <v-row class="mt-4">
    <v-col cols="12" md="3">
      <v-card class="elevation-2 text-center py-4">
        <div class="text-h6 text-grey">Total Messages</div>
        <div class="text-h3 font-weight-bold text-indigo">{{ messageCount }}</div>
      </v-card>
    </v-col>
    <v-col cols="12" md="3">
      <v-card class="elevation-2 text-center py-4">
        <div class="text-h6 text-grey">Active Devices</div>
        <div class="text-h3 font-weight-bold text-success">{{ Object.keys(activeDevices).length }}</div>
      </v-card>
    </v-col>
    <v-col cols="12" md="3">
      <v-card class="elevation-2 text-center py-4">
        <div class="text-h6 text-grey">Avg Temperature</div>
        <div class="text-h3 font-weight-bold text-warning">{{ avgTemp.toFixed(1) }} °C</div>
      </v-card>
    </v-col>
    <v-col cols="12" md="3">
      <v-card class="elevation-2 text-center py-4">
        <div class="text-h6 text-grey">Messages/Sec</div>
        <div class="text-h3 font-weight-bold text-error">{{ msgPerSec }}</div>
      </v-card>
    </v-col>
  </v-row>

  <v-row class="mt-4">
    <v-col cols="12">
      <v-card>
        <v-card-title>
          Live Feed (Last 20 messages)
          <v-spacer></v-spacer>
          <v-btn color="primary" @click="toggleStream">{{ isStreaming ? 'Pause' : 'Resume' }}</v-btn>
        </v-card-title>
        <v-table density="compact">
          <thead>
            <tr>
              <th>Time</th>
              <th>Device ID</th>
              <th>Temperature</th>
              <th>Vibration</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in latestLogs" :key="log.id">
              <td>{{ log.time }}</td>
              <td class="font-weight-bold">{{ log.deviceId }}</td>
              <td :class="{'text-error': log.temp > 80}">{{ log.temp }} °C</td>
              <td>{{ log.vib }}</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </v-col>
  </v-row>
</v-container>`;

const realtimeScript = `}; return {
setup() {
  const wsLogs = ref([]);
  const messageCount = ref(0);
  const activeDevices = ref({});
  const isStreaming = ref(true);
  const avgTemp = ref(0);
  const msgPerSec = ref(0);
  let msgLastSec = 0;
  let secInterval = null;

  const { ws } = useWS('/api/ws/telemetry/demo', (payload) => {
    if (!isStreaming.value) return;
    
    const messages = Array.isArray(payload) ? payload : [payload];
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg && msg.deviceId) {
        messageCount.value++;
        msgLastSec++;
        
        const temp = parseFloat(msg.temp || 0);
        activeDevices.value[msg.deviceId] = temp;
        
        wsLogs.value.unshift({
          id: Date.now() + Math.random(),
          time: new Date().toLocaleTimeString(),
          deviceId: msg.deviceId,
          temp: temp.toFixed(2),
          vib: msg.vib
        });
      }
    }
    
    if (wsLogs.value.length > 20) {
      wsLogs.value = wsLogs.value.slice(0, 20);
    }
  });

  onMounted(() => {
    secInterval = setInterval(() => {
      msgPerSec.value = msgLastSec;
      msgLastSec = 0;
      
      const devices = Object.values(activeDevices.value);
      if (devices.length > 0) {
        const sum = devices.reduce((a, b) => a + b, 0);
        avgTemp.value = sum / devices.length;
      }
    }, 1000);
  });

  onUnmounted(() => {
    if (secInterval) clearInterval(secInterval);
  });

  const toggleStream = () => { isStreaming.value = !isStreaming.value; };
  const latestLogs = computed(() => wsLogs.value);

  return { latestLogs, messageCount, activeDevices, avgTemp, msgPerSec, toggleStream, isStreaming };
}
}; function __dummy() {`;

app.components.pages.push({
  title: '{"tr":"Canlı Telemetri","en":"Realtime Dashboard"}',
  route_pattern: 'realtime-test',
  page_type: 'regular',
  template_string: realtimeTemplate,
  script_content: realtimeScript,
  style_content: '',
  is_public: 0,
  active: 1,
  hashtags: JSON.stringify(['#testsimulator'])
});

const historianTemplate = `<v-container fluid class="pa-4">
  <v-row>
    <v-col cols="12">
      <v-card class="bg-teal-darken-4 text-white">
        <v-card-title class="text-h4 font-weight-bold py-4">Historian Dashboard</v-card-title>
        <v-card-subtitle class="pb-4 text-subtitle-1">DuckDB SQL Analytics</v-card-subtitle>
      </v-card>
    </v-col>
  </v-row>

  <v-row class="mt-4">
    <v-col cols="12">
      <v-card class="pa-4">
         <v-textarea v-model="query" label="DuckDB Query" rows="3" variant="outlined" class="font-monospace" bg-color="#f5f5f5"></v-textarea>
         <v-btn color="teal" @click="runQuery" :loading="loading" prepend-icon="mdi-play">Run Query</v-btn>
         <v-alert v-if="error" type="error" class="mt-4">{{ error }}</v-alert>
      </v-card>
    </v-col>
  </v-row>
  
  <v-row class="mt-4" v-if="results.length > 0">
    <v-col cols="12">
      <v-card>
         <v-table density="compact">
            <thead class="bg-grey-lighten-3">
              <tr><th v-for="col in columns" :key="col">{{ col }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in results" :key="i">
                <td v-for="col in columns" :key="col">{{ row[col] }}</td>
              </tr>
            </tbody>
         </v-table>
      </v-card>
    </v-col>
  </v-row>
</v-container>`;

const historianScript = `}; return {
setup() {
  const query = ref("SELECT device_id, COUNT(*) as msg_count, AVG(CAST(payload->>'temp' AS DOUBLE)) as avg_temp\\nFROM telemetry\\nGROUP BY device_id\\nORDER BY msg_count DESC\\nLIMIT 10");
  const loading = ref(false);
  const results = ref([]);
  const columns = ref([]);
  const error = ref("");

  const runQuery = async () => {
     loading.value = true;
     error.value = "";
     results.value = [];
     columns.value = [];
     
     try {
       const res = await $fetch('/api/admin/dbstudio/duckdb-test', {
          method: 'POST',
          body: { query: query.value }
       });
       if (res.success && res.data.length > 0) {
          results.value = res.data;
          columns.value = Object.keys(res.data[0]);
       } else if (!res.success) {
          error.value = res.error;
       }
     } catch (e) {
       error.value = e.message;
     } finally {
       loading.value = false;
     }
  };

  return { query, runQuery, loading, results, columns, error };
}
}; function __dummy() {`;

app.components.pages.push({
  title: '{"tr":"Geçmiş Veriler","en":"Historian Dashboard"}',
  route_pattern: 'historian-test',
  page_type: 'regular',
  template_string: historianTemplate,
  script_content: historianScript,
  style_content: '',
  is_public: 0,
  active: 1,
  hashtags: JSON.stringify(['#testsimulator'])
});

// A small backend endpoint to execute DuckDB Queries
app.components.endpoints.push({
  name: 'DuckDB Test API',
  route_pattern: '/api/admin/dbstudio/duckdb-test',
  type: 'http',
  active: 1,
  code: `try {
  const { query } = payload.body || {};
  if (!query) return { respond: true, status: 400, body: { success: false, error: 'Query is empty' } };
  
  const result = await telemetryDb.unsafe(query);
  const cleanResult = JSON.parse(JSON.stringify(result, (k, v) => typeof v === 'bigint' ? Number(v) : v));
  
  return { respond: true, status: 200, body: { success: true, data: cleanResult } };
} catch (e) {
  return { respond: true, status: 500, body: { success: false, error: String(e) } };
}`,
  is_public: 0,
  hashtags: JSON.stringify(['#testsimulator'])
});

// An MQTT Endpoint to intercept ALL telemetry and broadcast to WS
app.components.endpoints.push({
  name: 'Telemetry WS Broadcaster',
  route_pattern: 'telemetry/#',
  type: 'mqtt',
  active: 1,
  code: `// Intercept all telemetry and batch them for WS
if (!globalThis.wsBatch) {
  globalThis.wsBatch = [];
}
globalThis.wsBatch.push(payload);

if (globalThis.wsBatch.length >= 1000) {
  await publishWS('/telemetry/demo', globalThis.wsBatch);
  globalThis.wsBatch = [];
}
return payload;`, // return payload allows it to be saved to DB
  is_public: 0,
  hashtags: JSON.stringify(['#testsimulator'])
});

// A WebSocket Endpoint just to keep the route alive for connections
app.components.endpoints.push({
  name: 'Telemetry WS Dummy',
  route_pattern: '/telemetry/demo',
  type: 'ws',
  active: 1,
  code: `if (payload && payload.action === 'ping') {
  await publishWS('/telemetry/demo', { action: 'pong' });
}`,
  is_public: 1,
  hashtags: JSON.stringify(['#testsimulator'])
});

const outPath = path.join(__dirname, 'appstudio.json');
fs.writeFileSync(outPath, JSON.stringify(app, null, 2));

console.log('Successfully generated test app at:', outPath);
console.log('Entities:', app.components.entities.length);
console.log('Records:', app.components.records.length);
console.log('Devices:', app.components.devices.length);
