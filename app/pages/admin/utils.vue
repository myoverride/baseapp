<template>
  <v-container>
    <div class="mb-4">
      <v-btn prepend-icon="mdi-arrow-left" variant="text" to="/" class="text-none font-weight-medium px-0 text-body-1" color="grey-darken-2">
        {{ $t('common.home') }}
      </v-btn>
    </div>
    <CrudTable
      ref="crudTable"
      :enable-multi-select="true"
      api-endpoint="/api/admin/utils"
      :columns="columns"
      :title="$t('page.utils')"
      default-sort-key="created_at"
      default-sort-order="desc"
      @create="openCreateDialog"
      @edit="openEditDialog"
      @delete="handleDelete"
    >
      <template #toolbarActions>
        <v-btn icon="mdi-download" variant="text" :loading="jsonExportLoading" @click="exportJSON" class="mr-2" :title="$t('action.exportFormat', { format: 'JSON' })"></v-btn>
        <v-btn icon="mdi-upload" variant="text" :loading="jsonImportLoading" @click="triggerJSONImport" class="mr-2" :title="$t('action.importFormat', { format: 'JSON' })"></v-btn>
        <input type="file" ref="jsonInputRef" accept=".json" style="display: none" @change="importJSON">
      </template>

      <template v-slot:item.target="{ item }">
        <v-chip size="small" label variant="tonal" :color="targetColor(String(item.target))" class="font-weight-bold">
          {{ item.target }}
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
          </div>
        </v-tooltip>
      </template>

      <template v-slot:rowActions="{ item }">
        <v-btn
          icon="mdi-download-circle-outline"
          size="small"
          color="blue"
          variant="text"
          :title="$t('action.exportFormat', { format: '(Single)' })"
          @click="exportSingleJSON(item)"
        />
      </template>
    
      <!-- Etiketler -->
      <template v-slot:item.hashtags="{ item }">
        <div class="d-flex flex-wrap gap-1">
          <v-chip
            v-for="tag in (typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || []))"
            :key="tag"
            size="x-small"
            :color="color"
            variant="tonal"
          >
            {{ tag }}
          </v-chip>
        </div>
      </template>
    </CrudTable>

    <ItemDialog
      ref="itemDialogRef"
      v-model="dialog"
      :mode="dialogMode"
      :initial-data="initialFormData"
      fullscreen
      @save="saveItem"
    >
      <template #default="{ formData: fd }">
        <div class="d-flex flex-column fill-height bg-white">
          <v-row class="mt-4 flex-grow-0" density="compact">
            <v-col cols="12" md="3">
              <v-text-field
                v-model="fd.name"
                :label="$t('common.name')"
                variant="outlined"
                density="compact"
                :rules="[(v) => !!v || $t('validation.required')]"
              ></v-text-field>
            </v-col>
            <v-col cols="12" md="3">
              <v-text-field
                v-model="fd.key"
                :label="$t('field.keyExample')"
                variant="outlined"
                density="compact"
                hide-details
                :rules="[(v) => !!v || $t('validation.required')]"
              ></v-text-field>
            </v-col>
            <v-col cols="12" md="3">
              <v-select
                v-model="fd.target"
                :items="['ui', 'api', 'shared']"
                :label="$t('common.target')"
                variant="outlined"
                density="compact"
                hide-details
              ></v-select>
            </v-col>
            <v-col cols="12" md="3">
              <v-switch
                v-model="fd.active"
                color="success"
                :label="$t('common.active')"
                hide-details
                density="compact"
              ></v-switch>
            </v-col>
          </v-row>
          <v-row class="mt-1 flex-grow-0" density="compact">
            <v-col cols="12" md="12">
              <v-combobox
                v-model="fd.hashtags"
                :label="$t('field.hashtags')"
                multiple
                chips
                closable-chips
                variant="outlined"
                density="compact"
                hide-details
                :items="[]"
                :delimiters="[',', ' ']"
                append-inner-icon="mdi-tag-multiple"
              ></v-combobox>
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
                  v-model="fd.code"
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
                      <div class="text-caption font-weight-bold text-grey-darken-1">Test Payload / Args (JSON)</div>
                      <v-btn size="x-small" :color="color" @click="runTest('util')" :loading="isTesting" prepend-icon="mdi-play">
                        Çalıştır
                      </v-btn>
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
                <VirtualConsole :source-id="editId ? `util_${editId},test-sandbox-util` : 'test-sandbox-util'" height="100%" />
              </div>
            </div>
          </div>
        </div>
      </template>
    </ItemDialog>

    <!-- Kapsamlı Geliştirici Kılavuzu (Help Dialog) -->

    <CodeHistoryDialog
      v-model="historyDialogOpen"
      type="utils"
      :id="editId || ''"
      :current-code="itemDialogRef?.formData?.code || ''"
      @select="handleHistorySelect"
    />
  </v-container>
</template>

<script setup lang="ts">
const { primaryColor: color } = useSysVars();
import { useI18n } from 'vue-i18n';
import { useJsonExportImport } from '~/composables/useJsonExportImport';

const { t } = useI18n();
const { $toast } = useNuxtApp() as any;

useHead({ title: () => t('page.utils') });

const crudTable = ref();
const itemDialogRef = ref();
const { mobile } = useDisplay();

const historyDialogOpen = ref(false);
const handleHistorySelect = (data: any) => {
  if (data && data.code !== undefined && itemDialogRef.value) {
    itemDialogRef.value.formData.code = data.code;
    if ($toast) $toast.info(t('message.historyLoaded'));
  }
};

const { jsonExportLoading, jsonImportLoading, jsonInputRef, triggerJSONImport, exportSingleJSON, exportJSON, importJSON } = useJsonExportImport('/api/admin/utils', crudTable);

const columns = computed(() => [
  { title: t('common.name'), key: 'name', sortable: true, filterable: true, type: 'string' },
  { title: t('table.transKey'), key: 'key', sortable: true, filterable: true, type: 'string' },
  { title: t('common.target'), key: 'target', sortable: true, filterable: false, slot: true },
  { title: t('field.hashtags'), key: 'hashtags', sortable: false, filterable: true, slot: true },
  { title: t('common.detail'), key: 'info', sortable: false, filterable: false, slot: true, width: '60px', align: 'center' as const }
]);

const dialog = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const initialFormData = ref<any>({});
const editId = ref<number | null>(null);

const tab = ref('code');
const monacoTheme = ref('vs-dark');

const testPayload = ref('[\n  "arg1_ornek",\n  123\n]');
const testResult = ref('');
const isTesting = ref(false);

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
        code: itemDialogRef.value?.formData?.code || '',
        payload: payloadObj
      }
    });
    testResult.value = res.result !== undefined ? JSON.stringify(res.result, null, 2) : 'undefined';
  } catch (err: any) {
    testResult.value = 'HATA:\n' + (err.data?.message || err.message || 'Bilinmeyen hata');
  } finally {
    isTesting.value = false;
  }
};

const copyTestResult = () => {
  navigator.clipboard.writeText(testResult.value);
  $toast.success('Sonuç kopyalandı');
};

onMounted(() => {
  const saved = localStorage.getItem('monaco-theme');
  if (saved) monacoTheme.value = saved;
});

const toggleMonacoTheme = () => {
  monacoTheme.value = monacoTheme.value === 'vs-dark' ? 'vs' : 'vs-dark';
  localStorage.setItem('monaco-theme', monacoTheme.value);
};

const openCreateDialog = () => {
  dialogMode.value = 'create';
  editId.value = null;
  initialFormData.value = {
    name: '',
    hashtags: [],
    key: '',
    target: 'api',
    code: `export default async function(context, ...args) {
  /*
   * ==========================================
   * IIoT Platform - Util (Ortak Fonksiyon) Şablonu
   * ==========================================
   * Util'ler, projede tekrar eden işlemleri merkezileştirmek için kullanılır.
   * Diğer Sandbox ortamlarından (Endpoint, Worker) veya sayfalardan çağrılabilirler.
   * 
   * [KULLANIM ÖRNEĞİ (Diğer Sandbox Kodları İçinden)]
   * const myUtil = await getUtil('my_util_key');
   * const result = await executeUtil(myUtil, { db, context, t }, arg1, arg2);
   */

  // 1. Context İçinden Ortak Objeleri Alma
  // (Util'i çağıran yer, bu objeleri context içinde vermelidir)
  const { db, t, tenantSlug } = context;
  
  // 2. Argümanları Okuma
  const [param1, param2] = args;
  
  if (!param1) {
    // Çeviri (i18n) fonksiyonu kullanılarak hata fırlatılabilir
    throw new Error(t ? t('errors.missingParameter', { param: 'param1' }) : "param1 eksik!");
  }

  // 3. Veritabanı veya İş Mantığı
  // Örn: Bir cihazın durumunu kontrol eden ortak fonksiyon
  // const device = await db.unsafe("SELECT status FROM devices WHERE id = ?", [param1]);
  // return device.length > 0 ? device[0].status : null;
  
  console.log(\`Util başarıyla çalıştı. Parametre 1: \${param1}\`);
  
  return {
    processed: true,
    input: param1,
    info: "Util başarıyla çalıştırıldı"
  };
}`,
    // End of code template
    active: true
  };
  tab.value = 'code';
  dialog.value = true;
};

const openEditDialog = async (item: any) => {
  dialogMode.value = 'edit';
  editId.value = item.id;
  
  let fullItem = item;
  try {
    const detail = await $fetch<any>(`/api/admin/utils/${item.id}`);
    if (detail && detail.data) fullItem = detail.data;
    else if (detail) fullItem = detail;
  } catch (e) {
  }

  initialFormData.value = {
    hashtags: typeof fullItem.hashtags === 'string' ? JSON.parse(fullItem.hashtags || '[]') : (fullItem.hashtags || []),
    name: fullItem.name || '',
    key: fullItem.key,
    target: fullItem.target,
    code: fullItem.code || '',
    active: fullItem.active === undefined || fullItem.active === true || fullItem.active === 1
  };
  tab.value = 'code';
  dialog.value = true;
};

const saveItem = async (payload: any) => {
  // no hashtag stripping
  try {
    if (dialogMode.value === 'edit') {
      await $fetch(`/api/admin/utils/${editId.value}`, { method: 'PUT', body: payload });
    } else {
      await $fetch('/api/admin/utils', { method: 'POST', body: payload });
    }
    dialog.value = false;
    if ($toast) $toast.success(dialogMode.value === 'edit' ? t('message.entityUpdated', { name: t('entity.util') }) : t('message.entityCreated', { name: t('entity.util') }));
    crudTable.value?.loadItems();
  } catch (e: any) {
    if ($toast) $toast.error(t(e.data?.message || 'errors.operationFailed', e.data?.data || {}));
  }
};
const saveCodeOnly = async () => {
  const payload = itemDialogRef.value?.formData || initialFormData.value;
  const targetId = payload?.id || editId.value;
  
  if (!targetId) {
    if ($toast) $toast.warning(t('message.saveCodeNotAllowed'));
    return;
  }
  
  try {
    await $fetch(`/api/admin/utils/${targetId}`, { method: 'PUT', body: payload });
    crudTable.value?.loadItems();
    if ($toast) $toast.success(t('message.saved'));
  } catch (e: any) {
    if ($toast) $toast.error(t(e.data?.message || 'errors.operationFailed', e.data?.data || {}));
  }
};

const handleDelete = async (item: any) => {
  if (!confirm(t('confirm.delete', { name: item.key }))) return;
  try {
    await $fetch(`/api/admin/utils/${item.id}`, { method: 'DELETE' });
    if ($toast) $toast.warning(t('message.entityDeleted', { name: t('entity.util') }));
    crudTable.value?.loadItems();
  } catch (e: any) {
    if ($toast) $toast.error(t(e.data?.message || 'errors.operationFailed', e.data?.data || {}));
  }
};

const targetColor = (target: string) => {
  const colors: Record<string, string> = { ui: 'blue', api: 'green', shared: 'deep-purple' };
  return colors[target] || 'grey';
};

</script>

<style scoped>
:deep(.v-window), :deep(.v-window__container) {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}
</style>
