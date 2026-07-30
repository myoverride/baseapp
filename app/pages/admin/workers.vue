<template>
  <v-container>
    <div class="mb-4" v-if="!hideHeader">
      <v-btn prepend-icon="mdi-arrow-left" variant="text" to="/" class="text-none font-weight-medium px-0 text-body-1" color="grey-darken-2">
        {{ $t('common.home') }}
      </v-btn>
    </div>
    <CrudTable
      ref="crudTable"
      :enable-multi-select="true"
      api-endpoint="/api/admin/workers"
      :columns="columns"
      :title="$t('menu.workers')"
      default-sort-key="created_at"
      default-sort-order="desc"
      @create="openCreateDialog"
      @edit="openEditDialog"
      @delete="handleDelete"
    >
      <template #toolbarActions>
        <v-btn icon="mdi-download" variant="text" :loading="jsonExportLoading" @click="exportJSON('workers')" class="mr-2" :title="$t('action.exportFormat', { format: 'JSON' })"></v-btn>
        <v-btn icon="mdi-upload" variant="text" :loading="jsonImportLoading" @click="triggerJSONImport" class="mr-2" :title="$t('action.importFormat', { format: 'JSON' })"></v-btn>
        <input type="file" ref="jsonInputRef" accept=".json" style="display: none" @change="importJSON">
      </template>

      <template v-slot:item.type="{ item }">
        <v-chip size="small" label variant="tonal" :color="item.type === 'cron' ? 'purple' : 'teal'" class="font-weight-bold">
          {{ String(item.type).toUpperCase() }}
        </v-chip>
      </template>
      
      <template v-slot:item.active="{ item }">
        <v-icon :color="item.active ? 'success' : 'error'">
          {{ item.active ? 'mdi-check-circle' : 'mdi-close-circle' }}
        </v-icon>
      </template>

      <template v-slot:item.custom_config="{ item }">
        <div v-if="item.type === 'cron'" class="text-caption font-weight-medium">
          <v-icon size="small" class="mr-1">mdi-clock-outline</v-icon> {{ item.cron_expression }}
        </div>
        <div v-else class="text-caption font-weight-medium">
          <v-icon size="small" class="mr-1" :color="item.autostart ? 'success' : 'grey'">mdi-power</v-icon>
          {{ item.autostart ? 'Autostart ON' : 'Autostart OFF' }}
        </div>
      </template>

      <template v-slot:item.status="{ item }">
        <v-chip v-if="item.type === 'daemon'" :color="item.status === 'running' ? 'success' : (item.status === 'error' ? 'error' : 'grey')" size="small" class="text-uppercase">
          {{ item.status || 'stopped' }}
        </v-chip>
        <v-chip v-else :color="item.active ? 'success' : 'grey'" size="small" class="text-uppercase">
          {{ item.active ? 'active' : 'stopped' }}
        </v-chip>
      </template>

      <template v-slot:item.info="{ item }">
        <v-tooltip location="top" max-width="400">
          <template v-slot:activator="{ props }">
            <v-btn icon="mdi-information" v-bind="props" color="info" variant="text" size="small"></v-btn>
          </template>
          <div class="text-caption">
            <div class="mb-1"><span class="font-weight-medium text-grey-lighten-2">{{ $t('table.createdAt') }}:</span> {{ formatAppDate(item.created_at as any) }}</div>
            <div><span class="font-weight-medium text-grey-lighten-2">{{ $t('table.updatedAt') }}:</span> {{ formatAppDate(item.updated_at as any) }}</div>
            <div v-if="item.error_msg" class="mt-1 text-error"><span class="font-weight-medium">Error:</span> {{ item.error_msg }}</div>
          </div>
        </v-tooltip>
      </template>

      <template v-slot:item.hashtags="{ item }">
        <div class="d-flex flex-wrap gap-1">
          <v-chip
            v-for="tag in (typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || []))"
            :key="tag"
            size="x-small"
            :color="color"
            variant="flat"
          >
            {{ tag }}
          </v-chip>
        </div>
      </template>

      <template v-slot:rowActions="{ item }">
        <v-btn icon="mdi-download-circle-outline" size="small" color="blue" variant="text" @click="exportSingleJSON(item, 'worker')" :title="$t('action.exportFormat', { format: '(Single)' })" />
        <v-btn
          v-if="item.type === 'daemon'"
          :icon="item.status === 'running' ? 'mdi-stop' : 'mdi-play'"
          size="small"
          :color="item.status === 'running' ? 'error' : 'success'"
          variant="text"
          :title="item.status === 'running' ? $t('action.stop') : $t('action.start')"
          @click="toggleWorkerStatus(item)"
        />
      </template>
    </CrudTable>

    <!-- Create/Edit Dialog -->
    <ItemDialog
      ref="itemDialogRef"
      v-model="dialog"
      :mode="dialogMode"
      :title="dialogMode === 'create' ? $t('common.add') : $t('common.edit')"
      :initial-data="initialFormData"
      fullscreen
      @save="save"
    >
      <template #default="{ formData }">
        <div class="d-flex flex-column fill-height bg-white">
          <v-row class="mt-4 flex-grow-0" density="compact">
            <v-col cols="12" md="4">
              <v-text-field
                v-model="formData.name"
                :label="$t('common.name')"
                :rules="[(v: any) => !!v || $t('validation.required')]"
                variant="outlined"
                density="compact"
                hide-details
              ></v-text-field>
            </v-col>
            <v-col cols="12" md="2">
              <v-select
                v-model="formData.type"
                :items="['cron', 'daemon']"
                :label="$t('common.type')"
                variant="outlined"
                density="compact"
                hide-details
                @update:model-value="onTypeChange($event, formData)"
              ></v-select>
            </v-col>
            <v-col cols="12" md="4" v-if="formData.type === 'cron'">
              <v-text-field
                v-model="formData.cron_expression"
                :label="$t('field.cronExpression')"
                :placeholder="$t('field.cronExpressionHint')"
                variant="outlined"
                density="compact"
                hide-details
              ></v-text-field>
            </v-col>
          </v-row>
          <v-row class="mt-1 flex-grow-0" density="compact">
            <v-col cols="12" md="8">
              <v-combobox
                v-model="formData.hashtags"
                :items="availableTags"
                :label="$t('common.tags')"
                multiple
                chips
                closable-chips
                clearable
                variant="outlined"
                density="compact"
                hide-details
              ></v-combobox>
            </v-col>
            <v-col cols="6" md="2">
              <v-switch
                v-model="formData.active"
                :label="$t('common.active')"
                color="success"
                density="compact"
                hide-details
              ></v-switch>
            </v-col>
            <v-col cols="6" md="2" v-if="formData.type === 'daemon'">
              <v-switch
                v-model="formData.autostart"
                :label="$t('field.autostart')"
                color="blue"
                density="compact"
                hide-details
              ></v-switch>
            </v-col>
          </v-row>
          
          <v-divider class="my-3"></v-divider>
          
          <div class="flex-grow-1 d-flex flex-column px-4 pb-4" style="min-height: 400px;">
            <div class="d-flex align-center justify-space-between mb-2">
              <v-tabs v-model="tab" :color="color" density="compact">
                <v-tab value="code">
                  <v-icon start size="small">mdi-code-braces</v-icon> <span v-if="!mobile">{{ $t('common.codeEditor') }}</span>
                </v-tab>
                <v-tab value="test">
                  <v-icon start size="small">mdi-flask</v-icon> <span v-if="!mobile">Test</span>
                </v-tab>
                <v-tab value="console">
                  <v-icon start size="small">mdi-console</v-icon> <span v-if="!mobile">{{ $t('common.virtualConsole') }}</span>
                </v-tab>
              </v-tabs>

              <div class="d-flex align-center">
                <v-btn v-if="dialogMode === 'edit'" class="mr-2" size="small" :color="color" variant="tonal" prepend-icon="mdi-history" @click="historyDialogOpen = true">
                  <span v-if="!mobile">{{ $t('action.history') }}</span>
                </v-btn>
              </div>
            </div>
            <div class="mt-2 flex-grow-1 position-relative">
              <div v-show="tab === 'code'" class="position-absolute w-100 h-100 border rounded" style="overflow: hidden;">
                <MonacoEditor
                  v-model="formData.code"
                  language="javascript"
                  height="100%"
                  :theme="monacoTheme"
                  @save="saveCodeOnly"
                />
              </div>
              
              <div v-show="tab === 'test'" class="position-absolute w-100 h-100">
                <v-row class="fill-height ma-0">
                  <!-- Payload Editor -->
                  <v-col cols="12" md="6" class="pa-1 d-flex flex-column fill-height">
                    <div class="d-flex align-center justify-space-between mb-1">
                      <div class="text-caption font-weight-bold text-grey-darken-1">Test Payload (JSON)</div>
                      <div>
                        <v-btn v-if="formData.type === 'daemon'" size="x-small" color="error" @click="stopTestDaemon" class="mr-2" prepend-icon="mdi-stop">
                          Durdur
                        </v-btn>
                        <v-btn size="x-small" :color="color" @click="runTest('worker')" :loading="isTesting" prepend-icon="mdi-play">
                          Çalıştır
                        </v-btn>
                      </div>
                    </div>
                    <div class="border rounded flex-grow-1 position-relative" style="min-height: 250px;">
                      <div class="position-absolute w-100 h-100" style="overflow: hidden;">
                        <MonacoEditor
                          v-model="testPayload"
                          language="json"
                          height="100%"
                          :theme="monacoTheme"
                          @save="saveCodeOnly"
                        />
                      </div>
                    </div>
                  </v-col>
                  <!-- Result Viewer -->
                  <v-col cols="12" md="6" class="pa-1 d-flex flex-column fill-height">
                    <div class="d-flex align-center justify-space-between mb-1">
                      <div class="text-caption font-weight-bold text-grey-darken-1">Test Sonucu</div>
                      <v-btn size="x-small" variant="text" icon="mdi-content-copy" @click="copyTestResult"></v-btn>
                    </div>
                    <div class="border rounded flex-grow-1 bg-black pa-2" style="overflow-y: auto; font-family: monospace; font-size: 13px; white-space: pre-wrap; min-height: 250px;">
{{ testResult }}
                    </div>
                  </v-col>
                </v-row>
              </div>

              <div v-show="tab === 'console'" class="position-absolute w-100 h-100">
                <VirtualConsole :source-id="editId ? (formData.type === 'cron' ? `cron_worker_${editId},test-sandbox-worker` : `${editId},test-sandbox-worker`) : 'test-sandbox-worker'" height="100%" />
              </div>
            </div>
          </div>
        </div>
      </template>
    </ItemDialog>

    <CodeHistoryDialog
      v-model="historyDialogOpen"
      type="workers"
      :id="editId || ''"
      :current-code="itemDialogRef?.formData?.code || ''"
      @select="handleHistorySelect"
    />
  </v-container>
</template>

<script setup lang="ts">
const { primaryColor: color } = useSysVars();
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import CrudTable from '~/components/CrudTable.vue';
import MonacoEditor from '~/components/MonacoEditor.vue';
import VirtualConsole from '~/components/VirtualConsole.vue';
import ItemDialog from '~/components/ItemDialog.vue';
import CodeHistoryDialog from '~/components/CodeHistoryDialog.vue';
import { useJsonExportImport } from '~/composables/useJsonExportImport';
import { useDisplay } from 'vuetify';

const { t } = useI18n();
const { $toast } = useNuxtApp() as any;
const { mobile } = useDisplay();
useHead({ title: () => t('menu.workers') });

const crudTable = ref<InstanceType<typeof CrudTable> | null>(null);
const itemDialogRef = ref();
const dialog = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const tab = ref('code');
const editId = ref<number | null>(null);

const testPayload = ref('{}');
const testResult = ref('');
const isTesting = ref(false);

const onTypeChange = (newType: string, slotData: any) => {
  if (newType === 'cron') {
    testPayload.value = JSON.stringify({
      jobId: 1,
      jobName: "Test Cron Job",
      runAt: new Date().toISOString()
    }, null, 2);
  } else {
    testPayload.value = '{}';
  }

  if (dialogMode.value === 'create' && slotData) {
    if (newType === 'cron') slotData.code = cronTemplate;
    else slotData.code = daemonTemplate;
  }
};

const runTest = async (type: string) => {
  isTesting.value = true;
  testResult.value = 'Çalıştırılıyor...';
  try {
    let payloadObj = {};
    if (testPayload.value.trim()) {
      try {
        payloadObj = JSON.parse(testPayload.value);
      } catch (e) {
        testResult.value = 'HATA: Payload geçerli bir JSON formatında değil.';
        isTesting.value = false;
        return;
      }
    }
    const res = await $fetch<any>('/api/admin/sandbox/test-run', {
      method: 'POST',
      body: {
        type,
        workerType: itemDialogRef.value?.formData?.type,
        code: itemDialogRef.value?.formData?.code || '',
        payload: payloadObj
      }
    });
    testResult.value = res.result !== undefined ? JSON.stringify(res.result, null, 2) : 'Çalıştırma tamamlandı.\n(Worker kodları geriye veri döndürmez. Çıktıları görmek için Sanal Konsol sekmesini kontrol ediniz.)';
  } catch (err: any) {
    testResult.value = 'HATA:\n' + (err.data?.message || err.message || 'Bilinmeyen hata');
  } finally {
    isTesting.value = false;
  }
};

const stopTestDaemon = async () => {
  try {
    await $fetch('/api/admin/sandbox/stop-test-daemon', { method: 'POST' });
    if ($toast) $toast.info('Arkaplan Daemon testi durduruldu.');
  } catch (e) {
    if ($toast) $toast.error('Test durdurulurken hata oluştu.');
  }
};

const copyTestResult = () => {
  navigator.clipboard.writeText(testResult.value);
  $toast.success('Sonuç kopyalandı');
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
  const targetId = payload?.id || editId.value;
  
  if (!targetId) {
    if ($toast) $toast.warning(t('message.saveCodeNotAllowed'));
    return;
  }
  
  try {
    await $fetch(`/api/admin/workers/${targetId}`, { method: 'PUT', body: payload });
    crudTable.value?.loadItems();
    if ($toast) $toast.success(t('message.saved'));
  } catch (e: any) {
    if ($toast) $toast.error(t(e.data?.message || 'errors.operationFailed', e.data?.data || {}));
  }
};

const valid = ref(true); // ItemDialog forms emit save when valid
const loading = ref(false);
const availableTags = ref<string[]>([]);
const { jsonExportLoading, jsonImportLoading, jsonInputRef, triggerJSONImport, exportSingleJSON, exportJSON, importJSON } = useJsonExportImport('/api/admin/workers', crudTable);

defineProps<{ hideHeader?: boolean }>();

const cronTemplate = `/*
 * ==========================================
 * Cron Worker (Zamanlanmış Görev) Şablonu
 * ==========================================
 * Belirli zaman aralıklarında (örn: her saat başı) tek seferlik çalışan görevler.
 *
 * --- KULLANILABİLİR KÜRESEL NESNELER (GLOBALS) VE ÖRNEKLER ---
 * 
 * 1. payload     : Cron motoru tarafından otomatik gönderilir: { jobId, jobName, runAt }
 * 2. context     : Ortam değişkenleri: { tenantSlug: "..." }
 * 3. db          : SQLite veritabanı (Örn: await db.unsafe("SELECT * FROM users"))
 * 4. telemetryDb : Timeseries veritabanı (Örn: await telemetryDb.unsafe("SELECT * FROM telemetry"))
 * 5. fetch       : HTTP istekleri atmak için (Örn: await fetch("https://api.example.com"))
 * 6. publishMQTT : MQTT mesajı yayınlamak için (Örn: await publishMQTT("sensor/1", { temp: 25 }))
 * 7. sendEmail   : E-posta göndermek için (Örn: await sendEmail({ to: "a@b.com", subject: "S", text: "B" }))
 * 8. require     : Node.js modüllerini içe aktarmak için (Örn: const axios = require("axios"))
 * 9. sleep       : Beklemek için (Örn: await sleep(2000))
 * 10. utils      : Özel utillerinizi (Custom Utils) çağırmak için (Örn: await utils.hesapla(10, 5))
 * 
 * Diğerleri: crypto, Buffer, env, process, bcrypt, readModbusData, writeModbusData
 */
console.log(\`[CRON] Worker başlatıldı. Görev: \${payload?.jobName} (\${payload?.runAt})\`);

try {
  // Örnek: Sistemdeki kayıtlı yöneticileri bulalım
  const result = await db.unsafe("SELECT count(*) as c FROM users WHERE is_admin = ?", [1]);
  console.log(\`[CRON] Aktif yönetici sayısı: \${result[0].c}\`);
} catch (err) {
  console.error("[CRON] Hata:", err.message);
}

console.log("[CRON] Worker başarıyla tamamlandı.");`;

const daemonTemplate = `/*
 * ==========================================
 * Daemon Worker (Sürekli Çalışan) Şablonu
 * ==========================================
 * Arka planda sonsuz döngü (while) ile sürekli çalışan mikroservisler.
 * NOT: Daemon çalıştığında 'payload' parametresi her zaman NULL gelir.
 * 
 * --- KULLANILABİLİR KÜRESEL NESNELER (GLOBALS) VE ÖRNEKLER ---
 * 
 * 1. context     : Ortam değişkenleri: { tenantSlug: "..." }
 * 2. db          : SQLite veritabanı (Örn: await db.unsafe("SELECT * FROM users"))
 * 3. telemetryDb : Timeseries veritabanı (Örn: await telemetryDb.unsafe("SELECT * FROM telemetry"))
 * 4. fetch       : HTTP istekleri atmak için (Örn: await fetch("https://api.example.com"))
 * 5. publishMQTT : MQTT mesajı yayınlamak için (Örn: await publishMQTT("sensor/1", { temp: 25 }))
 * 6. sendEmail   : E-posta göndermek için (Örn: await sendEmail({ to: "a@b.com", subject: "S", text: "B" }))
 * 7. require     : Node.js modüllerini içe aktarmak için (Örn: const _ = require("lodash"))
 * 8. sleep       : Beklemek için (Örn: await sleep(2000))
 * 9. utils       : Özel utillerinizi (Custom Utils) çağırmak için (Örn: await utils.hesapla(10, 5))
 * 
 * Diğerleri: crypto, Buffer, env, process, bcrypt, readModbusData, writeModbusData
 * -------------------------------------------------------------
 */
console.log("[DAEMON] Worker başlatıldı.");

let tick = 0;
while (true) {
  tick++;
  console.log(\`[DAEMON] Döngü çalışıyor... (Tick: \${tick})\`);
  
  // ÖNEMLİ: Döngülerin CPU'yu kilitlememesi için mutlaka uyku (sleep) süresi eklenmelidir
  await sleep(2000); // 2 saniye bekle
}`;

const defaultItem = {
  name: '',
  type: 'daemon',
  cron_expression: '',
  code: daemonTemplate,
  autostart: false,
  active: true,
  hashtags: [] as string[]
};

const initialFormData = ref({ ...defaultItem });

const columns = computed(() => [
  { title: t('common.name'), key: 'name', sortable: true },
  { title: t('common.type'), key: 'type', sortable: true },
  { title: t('table.cronAutostart'), key: 'custom_config', sortable: false },
  { title: t('common.active'), key: 'active', sortable: true, align: 'center' as const },
  { title: t('common.status'), key: 'status', sortable: true, align: 'center' as const },
  { title: t('common.tags'), key: 'hashtags', sortable: false },
  { title: t('common.info'), key: 'info', sortable: false, align: 'center' as const }
]);

const statusColor = (status: any) => {
  const s = String(status || '');
  if (s === 'running') return 'success';
  if (s === 'error' || s === 'error_stopped') return 'error';
  return 'grey';
};

onMounted(async () => {
  try {
    const tags = await $fetch<string[]>('/api/admin/app-studio/tags');
    availableTags.value = tags || [];
  } catch (e) {
    
  }
});

const openCreateDialog = () => {
  dialogMode.value = 'create';
  editId.value = null;
  initialFormData.value = { ...defaultItem, code: daemonTemplate };
  
  // Varsayılan daemon olduğu için payload'u sıfırla
  testPayload.value = '{}';
  dialog.value = true;
};

const openEditDialog = async (item: any) => {
  dialogMode.value = 'edit';
  editId.value = item.id;
  initialFormData.value = {
    ...item,
    active: item.active === 1 || item.active === true,
    autostart: item.autostart === 1 || item.autostart === true,
    hashtags: typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || []),
    code: ''
  };
  
  try {
    const detail = await $fetch<any>(`/api/admin/workers/${item.id}`);
    if (detail) {
      initialFormData.value.code = detail.code || '';
      initialFormData.value.active = detail.active === 1 || detail.active === true;
      initialFormData.value.autostart = detail.autostart === 1 || detail.autostart === true;
      initialFormData.value.hashtags = typeof detail.hashtags === 'string' ? JSON.parse(detail.hashtags || '[]') : (detail.hashtags || []);
      
      // Mevcut worker türüne göre test payload'unu ayarla
      if (item.type === 'cron') {
        testPayload.value = JSON.stringify({
          jobId: item.id,
          jobName: item.name,
          runAt: new Date().toISOString()
        }, null, 2);
      } else {
        testPayload.value = '{}';
      }
    }
  } catch (e: any) {
    
    if ($toast) $toast.error(t(e.data?.message || 'errors.operationFailed', e.data?.data || {}));
  }

  // Open dialog AFTER data is loaded, so ItemDialog syncs the complete data
  dialog.value = true;
};

const closeDialog = () => {
  dialog.value = false;
  initialFormData.value = { ...defaultItem, code: daemonTemplate };
};

const save = async (payload: any) => {
  loading.value = true;

  try {
    const url = dialogMode.value === 'edit' ? `/api/admin/workers/${payload.id}` : '/api/admin/workers';
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
  if (!confirm(t('confirm.delete', { name: item.name }))) return;
  try {
    await $fetch(`/api/admin/workers/${item.id}`, { method: 'DELETE' });
    if ($toast) $toast.warning(t('message.entityDeleted', { name: 'Worker' }));
    crudTable.value?.loadItems();
  } catch (err: any) {
    if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed', err.data?.data || {}));
  }
};

const toggleWorkerStatus = async (item: any) => {
  const action = item.status === 'running' ? 'stop' : 'start';
  try {
    await $fetch(`/api/admin/workers/${item.id}`, {
      method: 'POST',
      body: { action }
    });
    if ($toast) $toast.success(t(`action.${action}`) + ' command sent');
    setTimeout(() => crudTable.value?.loadItems(), 1000);
  } catch (err: any) {
    if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed', err.data?.data || {}));
  }
};
</script>

<style scoped>
:deep(.v-window), :deep(.v-window__container) {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}
</style>
