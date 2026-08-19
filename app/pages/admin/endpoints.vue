<template>
  <v-container>
    <div class="mb-4" v-if="!hideHeader">
      <v-btn prepend-icon="mdi-arrow-left" variant="text" to="/" class="text-none font-weight-medium px-0 text-body-1"
        color="primary">
        {{ $t('common.home') }}
      </v-btn>
    </div>

    <CrudTable ref="crudTable" api-endpoint="/api/admin/endpoints" :columns="columns" :title="$t('menu.endpoints')"
      default-sort-key="priority" default-sort-order="desc" :enable-multi-select="true" @create="openCreateDialog"
      @edit="openEditDialog" @delete="handleDelete">
      <template #toolbarActions>
        <v-btn icon="mdi-download" variant="text" :loading="jsonExportLoading" @click="exportJSON('endpoints')"
          class="mr-2" :title="$t('action.exportFormat', { format: 'JSON' })"></v-btn>
        <v-btn icon="mdi-upload" variant="text" :loading="jsonImportLoading" @click="triggerJSONImport" class="mr-2"
          :title="$t('action.importFormat', { format: 'JSON' })"></v-btn>
        <input type="file" ref="jsonInputRef" accept=".json" style="display: none" @change="importJSON">
      </template>

      <template #rowActions="{ item }">
        <v-btn icon="mdi-download-circle-outline" size="small" color="blue" variant="text"
          @click="exportSingleJSON(item, 'endpoint')" :title="$t('action.exportFormat', { format: '(Single)' })" />
      </template>

      <template v-slot:item.type="{ item }">
        <v-chip size="small" label variant="tonal" :color="typeColor(String(item.type))" class="font-weight-bold">
          {{ String(item.type).toUpperCase() }}
        </v-chip>
      </template>

      <template v-slot:item.active="{ item }">
        <v-icon :color="item.active ? 'success' : 'error'">
          {{ item.active ? 'mdi-check-circle' : 'mdi-close-circle' }}
        </v-icon>
      </template>

      <template v-slot:item.is_public="{ item }">
        <v-icon :color="item.is_public ? 'success' : 'grey'">
          {{ item.is_public ? 'mdi-earth' : 'mdi-lock' }}
        </v-icon>
      </template>

      <template v-slot:item.info="{ item }">
        <v-tooltip location="top" max-width="400">
          <template v-slot:activator="{ props }">
            <v-btn icon="mdi-information" v-bind="props" color="info" variant="text" size="small"></v-btn>
          </template>
          <div class="text-caption">
            <div class="mb-1"><span class="font-weight-medium opacity-70">{{ $t('table.createdAt') }}:</span> {{
              formatAppDate(item.created_at as any) }}</div>
            <div><span class="font-weight-medium opacity-70">{{ $t('table.updatedAt') }}:</span> {{
              formatAppDate(item.updated_at as any) }}</div>
          </div>
        </v-tooltip>
      </template>

      <template v-slot:item.hashtags="{ item }">
        <div class="d-flex flex-wrap gap-1">
          <v-chip
            v-for="tag in (typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || []))"
            :key="tag" size="x-small" :color="color" variant="flat">
            {{ tag }}
          </v-chip>
        </div>
      </template>
    </CrudTable>

    <!-- Create/Edit Dialog -->
    <ItemDialog ref="itemDialogRef" v-model="dialog" :mode="dialogMode"
      :title="dialogMode === 'create' ? $t('common.add') : $t('common.edit')" :initial-data="initialFormData" fullscreen
      @save="save">
      <template #default="{ formData }">
        <div class="d-flex flex-column fill-height">
          <v-row class="mt-4 flex-grow-0" density="compact">
            <v-col cols="12" md="3">
              <v-text-field v-model="formData.name" :label="$t('common.name')" variant="outlined" density="compact"
                hide-details></v-text-field>
            </v-col>
            <v-col cols="12" md="2">
              <v-select v-model="formData.type" :items="['http', 'ws', 'mqtt']" :label="$t('common.type')"
                variant="outlined" density="compact" hide-details
                @update:model-value="onTypeChange($event, formData)"></v-select>
            </v-col>
            <v-col cols="12" md="5" v-if="['http', 'ws'].includes(formData.type)">
              <v-text-field v-model="formData.route_pattern" :label="$t('field.routePattern')" variant="outlined"
                density="compact" :placeholder="getRouteHint(formData.type)" :rules="[
                  (v: any) => !!v || $t('validation.required'),
                  (v: string) => formData.type === 'mqtt' || String(v).startsWith('/') || $t('validation.invalidRoutePattern')
                ]"></v-text-field>
            </v-col>
            <v-col cols="12" md="5" v-if="formData.type === 'mqtt'">
              <v-text-field v-model="formData.route_pattern" :label="$t('field.topicPattern')" variant="outlined"
                density="compact" :placeholder="$t('field.topicPatternHint')" hide-details></v-text-field>
            </v-col>
            <v-col cols="12" md="2">
              <v-text-field v-model.number="formData.priority" :label="$t('common.priority')" type="number"
                variant="outlined" density="compact" hide-details></v-text-field>
            </v-col>
          </v-row>
          <v-row class="mt-1 flex-grow-0" density="compact">
            <v-col cols="12" md="8">
              <v-combobox v-model="formData.hashtags" :items="availableTags" :label="$t('field.hashtags')" multiple
                chips closable-chips clearable variant="outlined" density="compact" hide-details></v-combobox>
            </v-col>
            <v-col cols="6" md="2">
              <v-switch v-model="formData.is_public" :label="$t('common.public')" :color="color" density="compact"
                hide-details></v-switch>
            </v-col>
            <v-col cols="6" md="2">
              <v-switch v-model="formData.active" :label="$t('common.active')" color="success" density="compact"
                hide-details></v-switch>
            </v-col>
          </v-row>

          <v-divider class="my-3"></v-divider>

          <div class="flex-grow-1 d-flex flex-column px-4 pb-4" style="min-height: 400px;">
            <div class="d-flex align-center justify-space-between mb-2">
              <v-tabs v-model="tab" :color="color" density="compact">
                <v-tab value="code">
                  <v-icon start size="small">mdi-code-braces</v-icon> <span v-if="!mobile">{{ $t('common.codeEditor')
                  }}</span>
                </v-tab>
                <v-tab value="test">
                  <v-icon start size="small">mdi-flask</v-icon> <span v-if="!mobile">Test</span>
                </v-tab>
                <v-tab value="console">
                  <v-icon start size="small">mdi-console</v-icon> <span v-if="!mobile">{{ $t('common.virtualConsole')
                  }}</span>
                </v-tab>
              </v-tabs>

              <div class="d-flex align-center">
                <v-btn v-if="dialogMode === 'edit'" class="mr-2" size="small" :color="color" variant="tonal"
                  prepend-icon="mdi-history" @click="historyDialogOpen = true">
                  <span v-if="!mobile">{{ $t('action.history') }}</span>
                </v-btn>
              </div>
            </div>

            <div class="mt-2 flex-grow-1 position-relative">
              <div v-show="tab === 'code'" class="position-absolute w-100 h-100 border rounded"
                style="overflow: hidden;">
                <MonacoEditor v-model="formData.code" language="javascript" height="100%" :theme="monacoTheme"
                  @save="saveCodeOnly" />
              </div>

              <div v-show="tab === 'test'" class="position-absolute w-100 h-100">
                <v-row class="fill-height ma-0">
                  <!-- Payload Editor -->
                  <v-col cols="12" md="6" class="pa-1 d-flex flex-column fill-height">
                    <div class="d-flex align-center justify-space-between mb-1">
                      <div class="text-caption font-weight-bold opacity-70">{{ $t('ide.testPayloadJson') }}</div>
                      <v-btn size="x-small" :color="color" @click="runTest('endpoint')" :loading="isTesting"
                        prepend-icon="mdi-play">
                        {{ $t('action.run') }}
                      </v-btn>
                    </div>
                    <div class="border rounded flex-grow-1 position-relative" style="min-height: 250px;">
                      <div class="position-absolute w-100 h-100" style="overflow: hidden;">
                        <MonacoEditor v-model="testPayload" language="json" height="100%" :theme="monacoTheme"
                          @save="saveCodeOnly" />
                      </div>
                    </div>
                  </v-col>
                  <!-- Result Viewer -->
                  <v-col cols="12" md="6" class="pa-1 d-flex flex-column fill-height">
                    <div class="d-flex align-center justify-space-between mb-1">
                      <div class="text-caption font-weight-bold opacity-70">{{ $t('ide.testResult') }}</div>
                      <v-btn size="x-small" variant="text" icon="mdi-content-copy" @click="copyTestResult"></v-btn>
                    </div>
                    <div class="border rounded flex-grow-1 bg-surface-variant pa-2"
                      style="overflow-y: auto; font-family: monospace; font-size: 13px; white-space: pre-wrap; min-height: 250px;">
                      {{ testResult }}
                    </div>
                  </v-col>
                </v-row>
              </div>

              <div v-show="tab === 'console'" class="position-absolute w-100 h-100">
                <VirtualConsole :source-id="editId ? `${editId},test-sandbox-endpoint` : 'test-sandbox-endpoint'"
                  height="100%" />
              </div>
            </div>
          </div>
        </div>
      </template>
    </ItemDialog>

    <CodeHistoryDialog v-model="historyDialogOpen" type="endpoints" :id="editId || ''"
      :current-code="itemDialogRef?.formData?.code || ''" @select="handleHistorySelect" />
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import CrudTable from '~/components/CrudTable.vue';
const MonacoEditor = defineAsyncComponent(() => import('~/components/MonacoEditor.vue'));
import VirtualConsole from '~/components/VirtualConsole.vue';
import ItemDialog from '~/components/ItemDialog.vue';
import CodeHistoryDialog from '~/components/CodeHistoryDialog.vue';
import { useJsonExportImport } from '~/composables/useJsonExportImport';
import { useDisplay } from 'vuetify';

const { t } = useI18n();
const { $toast } = useNuxtApp() as any;
const { mobile } = useDisplay();
const { primaryColor: color } = useGlobals();
useHead({ title: () => t('menu.endpoints') });


const crudTable = ref<InstanceType<typeof CrudTable> | null>(null);
const itemDialogRef = ref();
const dialog = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const tab = ref('code');
const editId = ref<number | null>(null);

const testPayload = ref('{\n  "url": "/api/test",\n  "method": "POST",\n  "headers": {\n    "content-type": "application/json"\n  },\n  "query": {},\n  "params": {},\n  "body": {\n    "action": "test"\n  },\n  "user": {\n    "id": 1,\n    "username": "admin",\n    "is_admin": true\n  }\n}');
const testResult = ref('');
const isTesting = ref(false);

const runTest = async (type: string) => {
  isTesting.value = true;
  testResult.value = t('message.running');
  try {
    let payloadObj = {};
    if (testPayload.value.trim()) {
      try {
        payloadObj = JSON.parse(testPayload.value);
      } catch (e) {
        testResult.value = t('error.invalidJsonPayload');
        isTesting.value = false;
        return;
      }
    }
    const res = await $fetch<any>('/api/admin/sandbox/test-run', {
      method: 'POST',
      body: {
        type,
        code: itemDialogRef.value?.formData?.code || '',
        payload: payloadObj
      }
    });
    testResult.value = res.result !== undefined ? JSON.stringify(res.result, null, 2) : 'undefined';
  } catch (err: any) {
    testResult.value = t('error.prefix') + ':\n' + (err.data?.message || err.message || t('error.unknown'));
  } finally {
    isTesting.value = false;
  }
};

const copyTestResult = () => {
  navigator.clipboard.writeText(testResult.value);
  $toast.success(t('message.copied'));
};

const historyDialogOpen = ref(false);
const handleHistorySelect = (data: any) => {
  if (data && data.code !== undefined && itemDialogRef.value) {
    itemDialogRef.value.formData.code = data.code;
    if ($toast) $toast.info(t('message.historyLoaded'));
  }
};

const monacoTheme = ref('vs-dark');

onMounted(() => {
  const saved = localStorage.getItem('monaco-theme');
  if (saved) monacoTheme.value = saved;
});

const toggleMonacoTheme = () => {
  monacoTheme.value = monacoTheme.value === 'vs-dark' ? 'vs' : 'vs-dark';
  localStorage.setItem('monaco-theme', monacoTheme.value);
};


const saveCodeOnly = async () => {
  const payload = itemDialogRef.value?.formData || initialFormData.value;
  const targetId = payload.id || editId.value;

  if (!targetId) {
    if ($toast) $toast.warning(t('message.saveCodeNotAllowed'));
    return;
  }

  if (payload.type === 'mqtt' && !payload.route_pattern) {
    payload.route_pattern = '#';
  }

  try {
    await $fetch(`/api/admin/endpoints/${targetId}`, {
      method: 'PUT',
      body: payload
    });
    crudTable.value?.loadItems();
    if ($toast) $toast.success(t('message.success'));
  } catch (err: any) {
    if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed', err.data?.data || {}));
  }
};

const loading = ref(false);
const availableTags = ref<string[]>([]);
const { jsonExportLoading, jsonImportLoading, jsonInputRef, triggerJSONImport, exportSingleJSON, exportJSON, importJSON } = useJsonExportImport('/api/admin/endpoints', crudTable);

defineProps<{ hideHeader?: boolean }>();

const httpTemplate = `/*
 * ==========================================
 * HTTP / REST API Endpoint Şablonu
 * ==========================================
 * [KULLANILABİLİR DEĞİŞKENLER]
 * payload : { url, method, headers, body, query, params, user }
 * context : { tenantSlug, user }
 * db      : SQLite veritabanı bağlantısı.
 * t       : Çeviri fonksiyonu (i18n).
 */

const { url, method, body, query, params, user } = payload;
const action = body?.action || query?.action;

if (!action) {
  throw new Error(t ? t('errors.missingParameter', { param: 'action' }) : "Eksik parametre: action");
}

// Güvenlik: Admin mi?
if (action === 'delete_something' && !user?.is_admin) {
  return { block: true, status: 403, message: "Yetkisiz erişim" }; // İsteği reddeder
}

const activeAdmins = await db.unsafe("SELECT id, username FROM users WHERE is_admin = ?", [1]);

// 200 OK ile JSON Dönüşü
return {
  success: true,
  message: "İşlem başarılı",
  data: { action, adminCount: activeAdmins.length }
};`;

const mqttTemplate = `/*
 * ==========================================
 * MQTT Mesaj İşleyici Şablonu
 * ==========================================
 * [KULLANILABİLİR DEĞİŞKENLER]
 * payload : { topic, message, clientId, data (JSON parse edilebildiyse) }
 * context : { tenantSlug }
 * db      : SQLite veritabanı bağlantısı.
 */

const { topic, message, clientId, data } = payload;

// JSON parse edilememişse veya istenen aksiyon yoksa çık
if (!data || !data.action) return; 

console.log(\`[MQTT] \${clientId} cihazından mesaj: \${topic}\`);

// Telemetri (DuckDB) Kaydı:
if (data.action === 'telemetry_save' && data.value) {
  const tDb = useTelemetryDB(context.tenantSlug);
  // await tDb.unsafe("INSERT INTO telemetry (ts, key, value) VALUES (current_timestamp, ?, ?)", ['temp', data.value]);
}

// Opsiyonel: Mesajı reddetmek isterseniz false dönebilirsiniz
// return false; 
`;

const wsTemplate = `/*
 * ==========================================
 * WebSocket (Realtime) İşleyici Şablonu
 * ==========================================
 * [KULLANILABİLİR DEĞİŞKENLER]
 * payload : { action, data, clientInfo: { id } }
 * context : { tenantSlug, userId, peerId }
 */

const { action, data, clientInfo } = payload;

console.log(\`[WS] \${clientInfo.id} istemcisinden eylem: \${action}\`);

if (action === 'chat_message') {
  // Örnek: Gelen mesajı sansürleme
  if (data.message && data.message.includes("kötükelime")) {
    data.message = "***";
    // Değiştirilmiş veriyi odaya yayınlamak (broadcast) için:
    return { payload: { action, data } };
  }
}

if (action === 'private_action') {
  // Mesajın diğer istemcilere (broadcast) gitmesini engellemek için:
  return { broadcast: false };
}
`;

const defaultItem = {
  name: '',
  type: 'http',
  route_pattern: '',
  code: httpTemplate,
  priority: 0,
  active: true,
  is_public: false,
  hashtags: [] as string[]
};

const initialFormData = ref({ ...defaultItem });

const columns = computed(() => [
  { title: t('common.name'), key: 'name', sortable: true },
  { title: t('common.type'), key: 'type', sortable: true },
  { title: t('field.routePattern'), key: 'route_pattern', sortable: true },
  { title: t('common.priority'), key: 'priority', sortable: true },
  { title: t('common.active'), key: 'active', sortable: true, align: 'center' as const },
  { title: t('common.public'), key: 'is_public', sortable: true, align: 'center' as const },
  { title: t('field.hashtags'), key: 'hashtags', sortable: false },
  { title: t('common.info'), key: 'info', sortable: false, align: 'center' as const }
]);

const typeColor = (type: string) => {
  switch (type) {
    case 'http': return 'blue';
    case 'ws': return 'green';
    case 'mqtt': return 'orange';
    default: return 'grey';
  }
};

onMounted(async () => {
  try {
    const tags = await $fetch<string[]>('/api/admin/app-studio/tags');
    availableTags.value = tags || [];
  } catch (e) {

  }
});

const generateRandomId = () => Math.random().toString(36).substring(2, 8);

const getRouteHint = (type: string) => {
  if (type === 'mqtt') return 'telemetry/devices/#';
  if (type === 'ws') return '/ws/chat/:roomId';
  return '/api/users/:id';
};

const onTypeChange = (newType: string, slotData: any) => {
  // 1. Dinamik Payload Güncellemesi
  if (newType === 'mqtt') {
    testPayload.value = '{\n  "topic": "test/topic",\n  "message": "{\\"action\\":\\"test\\"}",\n  "clientId": "test_client",\n  "data": { "action": "test" }\n}';
  } else if (newType === 'ws') {
    testPayload.value = '{\n  "action": "test",\n  "data": {},\n  "clientInfo": {\n    "id": "mock_client_123"\n  }\n}';
  } else {
    testPayload.value = '{\n  "url": "/api/test",\n  "method": "POST",\n  "headers": {\n    "content-type": "application/json"\n  },\n  "query": {},\n  "params": {},\n  "body": {\n    "action": "test"\n  },\n  "user": {\n    "id": 1,\n    "username": "admin",\n    "is_admin": true\n  }\n}';
  }

  // 2. Dinamik Rota Şablonu Güncellemesi
  if (dialogMode.value === 'edit') return;
  if (newType === 'mqtt') {
    slotData.route_pattern = 'telemetry/devices/#';
  } else if (newType === 'ws') {
    slotData.route_pattern = '/ws/' + generateRandomId();
  } else {
    slotData.route_pattern = '/api/' + generateRandomId();
  }

  // 3. Kod Şablonu Güncellemesi
  if (slotData) {
    if (newType === 'mqtt') slotData.code = mqttTemplate;
    else if (newType === 'ws') slotData.code = wsTemplate;
    else slotData.code = httpTemplate;
  }
};

const openCreateDialog = () => {
  dialogMode.value = 'create';
  editId.value = null;
  initialFormData.value = { ...defaultItem, code: httpTemplate, route_pattern: '/api/' + generateRandomId() };
  dialog.value = true;
};

const openEditDialog = async (item: any) => {
  dialogMode.value = 'edit';
  editId.value = item.id;
  initialFormData.value = {
    ...item,
    active: item.active === 1 || item.active === true,
    is_public: item.is_public === 1 || item.is_public === true,
    hashtags: typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || []),
    code: ''
  };

  try {
    const detail = await $fetch<any>(`/api/admin/endpoints/${item.id}`);
    if (detail) {
      initialFormData.value.code = detail.code || '';
      initialFormData.value.active = detail.active === 1 || detail.active === true;
      initialFormData.value.is_public = detail.is_public === 1 || detail.is_public === true;
      initialFormData.value.hashtags = typeof detail.hashtags === 'string' ? JSON.parse(detail.hashtags || '[]') : (detail.hashtags || []);
    }
  } catch (e: any) {

    const errPayload = e?.data;
    const isArr = Array.isArray(errPayload?.data);
    const errData = isArr ? errPayload.data[0] : (errPayload?.data || {});
    const errMsg = isArr ? errPayload.data[0].message : (errPayload?.message || 'errors.operationFailed');
    if ($toast) $toast.error(t(errMsg, errData));
  }

  dialog.value = true;
};

const closeDialog = () => {
  dialog.value = false;
  initialFormData.value = { ...defaultItem };
};

const save = async (payload: any) => {
  loading.value = true;

  if (payload.type === 'mqtt' && !payload.route_pattern) {
    payload.route_pattern = '#';
  }

  try {
    const url = dialogMode.value === 'edit' ? `/api/admin/endpoints/${payload.id}` : '/api/admin/endpoints';
    const method = dialogMode.value === 'edit' ? 'PUT' : 'POST';

    await $fetch(url, {
      method,
      body: payload
    });

    closeDialog();
    crudTable.value?.loadItems();
    if ($toast) $toast.success(t('message.success'));
  } catch (err: any) {
    if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed', err.data?.data || {}));
  } finally {
    loading.value = false;
  }
};

const handleDelete = async (item: any) => {
  if (!confirm(t('confirm.delete', { name: item.name || item.route_pattern }))) return;
  try {
    await $fetch(`/api/admin/endpoints/${item.id}`, { method: 'DELETE' });
    if ($toast) $toast.success(t('message.deleted'));
    crudTable.value?.loadItems();
  } catch (err: any) {
    if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed', err.data?.data || {}));
  }
};
</script>

<style scoped>
:deep(.v-window),
:deep(.v-window__container) {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}
</style>
