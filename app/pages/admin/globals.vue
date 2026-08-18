<template>
  <v-container>
    <div class="mb-4" v-if="!hideHeader">
      <v-btn prepend-icon="mdi-arrow-left" variant="text" to="/" class="text-none font-weight-medium px-0 text-body-1"
        color="primary">
        {{ $t('common.home') }}
      </v-btn>
    </div>

    <CrudTable ref="crudTable" api-endpoint="/api/admin/globals" :columns="columns" :title="$t('menu.globals')"
      default-sort-key="key" default-sort-order="asc" :enable-multi-select="true" @create="openCreateDialog"
      @edit="openEditDialog" @delete="handleDelete">
      <template #toolbarActions>
        <v-btn icon="mdi-download" variant="text" :loading="jsonExportLoading" @click="exportJSON('globals')"
          class="mr-2" :title="$t('action.exportFormat', { format: 'JSON' })"></v-btn>
        <v-btn icon="mdi-upload" variant="text" :loading="jsonImportLoading" @click="triggerJSONImport" class="mr-2"
          :title="$t('action.importFormat', { format: 'JSON' })"></v-btn>
        <input type="file" ref="jsonInputRef" accept=".json" style="display: none" @change="importJSON">
      </template>

      <template #rowActions="{ item }">
        <v-btn icon="mdi-download-circle-outline" size="small" color="blue" variant="text"
          @click="exportSingleJSON(item, 'global')" :title="$t('action.exportFormat', { format: '(Single)' })" />
      </template>

      <template v-slot:item.type="{ item }">
        <v-icon>
          {{ item.type === 'variable' ? 'mdi-variable' : 'mdi-function-variant' }}
        </v-icon>
      </template>

      <template v-slot:item.data_type="{ item }">
        <span v-if="item.type === 'variable' && item.data_type" class="font-weight-medium">
          {{ String(item.data_type).charAt(0).toUpperCase() + String(item.data_type).slice(1) }}
        </span>
        <span v-else class="text-grey">-</span>
      </template>

      <template v-slot:item.value="{ item }">
        <span v-if="item.type === 'variable'">
          <span v-if="item.is_secret" class="text-grey">***</span>
          <span v-else-if="item.value" class="text-truncate"
            style="max-width: 200px; display: inline-block; vertical-align: bottom;">
            {{ String(item.value).length > 50 ? String(item.value).substring(0, 50) + '...' : item.value }}
          </span>
          <span v-else class="text-grey">-</span>
        </span>
        <span v-else class="text-grey">-</span>
      </template>

      <template v-slot:item.target="{ item }">
        <v-chip size="small" label variant="tonal"
          :color="item.target === 'ui' ? 'purple' : (item.target === 'api' ? 'red' : 'green')" class="font-weight-bold">
          {{ String(item.target).toUpperCase() }}
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
            <div class="mb-1"><span class="font-weight-medium opacity-70">{{ $t('table.createdAt') }}:</span>
              {{
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
        <div class="d-flex flex-column fill-height bg-white">
          <v-row class="mt-4 flex-grow-0" density="compact">
            <v-col cols="12" md="3">
              <v-select v-model="formData.type"
                :items="[{ title: $t('common.variable'), value: 'variable' }, { title: $t('common.util'), value: 'util' }]"
                item-title="title" item-value="value" :label="$t('common.type')" variant="outlined" density="compact"
                hide-details :readonly="dialogMode === 'edit'"></v-select>
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field v-model="formData.key" :label="$t('common.key')" variant="outlined" density="compact"
                :readonly="dialogMode === 'edit'"
                :rules="[(v: any) => !!v || $t('validation.required')]"></v-text-field>
            </v-col>

            <v-col cols="12" md="4">
              <v-select v-model="formData.target"
                :items="[{ title: 'Shared', value: 'shared' }, { title: 'UI', value: 'ui' }, { title: 'API', value: 'api' }]"
                item-title="title" item-value="value" :label="$t('common.target')" variant="outlined" density="compact"
                hide-details></v-select>
            </v-col>
          </v-row>

          <v-row class="mt-2 flex-grow-0" density="compact" v-if="formData.type === 'variable'">
            <v-col cols="12" md="2">
              <v-select v-model="formData.data_type"
                :items="[{ title: 'String', value: 'string' }, { title: 'Number', value: 'number' }, { title: 'Boolean', value: 'boolean' }, { title: 'JSON', value: 'json' }, { title: 'Color', value: 'color' }, { title: 'Date', value: 'date' }, { title: 'Time', value: 'time' }]"
                item-title="title" item-value="value" :label="$t('field.dataType')" variant="outlined" density="compact"
                hide-details></v-select>
            </v-col>
            <v-col cols="12" md="10">
              <v-text-field v-if="formData.data_type === 'string' || formData.data_type === 'number'"
                v-model="formData.value" :label="$t('common.value')"
                :type="formData.is_secret ? 'password' : (formData.data_type === 'number' ? 'number' : 'text')"
                variant="outlined" density="compact" hide-details></v-text-field>

              <v-switch v-else-if="formData.data_type === 'boolean'" v-model="formData.value" :true-value="'true'"
                :false-value="'false'" :label="$t('common.value')" color="primary" hide-details></v-switch>

              <v-menu v-else-if="formData.data_type === 'color'" :close-on-content-click="false">
                <template v-slot:activator="{ props }">
                  <v-text-field v-model="formData.value" :label="$t('common.value')" v-bind="props" variant="outlined"
                    density="compact" hide-details style="max-width: 250px">
                    <template v-slot:prepend-inner>
                      <div
                        :style="{ width: '24px', height: '24px', backgroundColor: formData.value || 'transparent', borderRadius: '4px', border: '1px solid #ccc' }">
                      </div>
                    </template>
                  </v-text-field>
                </template>
                <v-color-picker v-model="formData.value" mode="hexa" elevation="3"></v-color-picker>
              </v-menu>

              <v-text-field v-else-if="formData.data_type === 'date'" v-model="formData.value"
                :label="$t('common.value')" type="date" variant="outlined" density="compact" hide-details
                style="max-width: 250px"></v-text-field>

              <v-text-field v-else-if="formData.data_type === 'time'" v-model="formData.value"
                :label="$t('common.value')" type="time" variant="outlined" density="compact" hide-details
                style="max-width: 250px"></v-text-field>
            </v-col>
          </v-row>

          <v-row class="mt-2 flex-grow-0" density="compact">
            <v-col cols="12" md="6">
              <v-combobox v-model="formData.hashtags" :items="availableTags" :label="$t('field.hashtags')" multiple
                chips variant="outlined" density="compact" hide-details></v-combobox>
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field v-model="formData.description" :label="$t('table.description')" variant="outlined"
                density="compact" hide-details></v-text-field>
            </v-col>
          </v-row>
          <v-row class="mt-2 mb-2 flex-grow-0" density="compact">
            <v-col cols="auto" class="py-0">
              <v-switch v-model="formData.is_public" :label="$t('common.public')" color="primary" density="compact"
                hide-details></v-switch>
            </v-col>
            <v-col cols="auto" class="py-0" v-if="formData.type === 'variable'">
              <v-switch v-model="formData.is_secret" :label="$t('field.isSecret')" color="warning" density="compact"
                hide-details></v-switch>
            </v-col>
            <v-col cols="auto" class="py-0" v-if="formData.type === 'util'">
              <v-switch v-model="formData.active" :label="$t('common.active')" color="success" density="compact"
                hide-details></v-switch>
            </v-col>
          </v-row>

          <!-- Code Editor for Utils or JSON Variables -->
          <div class="flex-grow-1 d-flex flex-column px-4 pb-4" style="min-height: 400px;"
            v-if="formData.type === 'util' || (formData.type === 'variable' && formData.data_type === 'json')">
            <div class="d-flex align-center justify-space-between mb-2">
              <v-tabs v-model="tab" :color="color" density="compact" v-if="formData.type === 'util'">
                <v-tab value="code"><v-icon start size="small">mdi-code-braces</v-icon> <span v-if="!mobile">{{
                  $t('common.codeEditor') }}</span></v-tab>
                <v-tab value="test"><v-icon start size="small">mdi-flask</v-icon> <span
                    v-if="!mobile">Test</span></v-tab>
                <v-tab value="console"><v-icon start size="small">mdi-console</v-icon> <span v-if="!mobile">{{
                  $t('common.virtualConsole') }}</span></v-tab>
              </v-tabs>

              <v-tabs v-model="tab" :color="color" density="compact" v-else>
                <v-tab value="code"><v-icon start size="small">mdi-code-braces</v-icon> <span
                    v-if="!mobile">JSON</span></v-tab>
              </v-tabs>

              <div class="d-flex align-center">
                <v-btn v-if="dialogMode === 'edit' && formData.type === 'util'" class="mr-2" size="small" :color="color"
                  variant="tonal" prepend-icon="mdi-history" @click="historyDialogOpen = true">
                  <span v-if="!mobile">{{ $t('action.history') }}</span>
                </v-btn>
              </div>
            </div>

            <div class="mt-2 flex-grow-1 position-relative">
              <div v-show="tab === 'code'" class="position-absolute w-100 h-100 border rounded"
                style="overflow: hidden;">
                <MonacoEditor v-if="formData.type === 'util'" v-model="formData.code" language="javascript"
                  height="100%" :theme="monacoTheme" @save="saveCodeOnly" />
                <MonacoEditor v-if="formData.type === 'variable' && formData.data_type === 'json'"
                  v-model="formData.value" language="json" height="100%" :theme="monacoTheme" @save="saveCodeOnly" />
              </div>

              <div v-show="tab === 'test' && formData.type === 'util'" class="position-absolute w-100 h-100">
                <v-row class="fill-height ma-0">
                  <v-col cols="12" md="6" class="pa-1 d-flex flex-column fill-height">
                    <div class="d-flex align-center justify-space-between mb-1">
                      <div class="text-caption font-weight-bold opacity-70">{{ $t('ide.testPayloadTitle') }}
                        (body.key)</div>
                      <v-btn size="x-small" :color="color" @click="runTest" :loading="isTesting"
                        prepend-icon="mdi-play">{{
                          $t('action.run') }}</v-btn>
                    </div>
                    <div class="border rounded flex-grow-1 position-relative" style="min-height: 250px;">
                      <div class="position-absolute w-100 h-100" style="overflow: hidden;">
                        <MonacoEditor v-model="testPayload" language="json" height="100%" :theme="monacoTheme" />
                      </div>
                    </div>
                  </v-col>
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

              <div v-show="tab === 'console' && formData.type === 'util'" class="position-absolute w-100 h-100">
                <VirtualConsole :source-id="'test-sandbox-util'" height="100%" />
              </div>
            </div>
          </div>
        </div>
      </template>
    </ItemDialog>

    <CodeHistoryDialog v-model="historyDialogOpen" type="globals" :id="itemDialogRef?.formData?.id || ''"
      :current-code="itemDialogRef?.formData?.code || ''" @select="handleHistorySelect" />
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import CrudTable from '~/components/CrudTable.vue';
import ItemDialog from '~/components/ItemDialog.vue';
const MonacoEditor = defineAsyncComponent(() => import('~/components/MonacoEditor.vue'));
import VirtualConsole from '~/components/VirtualConsole.vue';
import CodeHistoryDialog from '~/components/CodeHistoryDialog.vue';
import { useJsonExportImport } from '~/composables/useJsonExportImport';
import { useNuxtApp } from '#app';
import { useDisplay } from 'vuetify';

const props = defineProps({
  hideHeader: { type: Boolean, default: false }
});

const { t } = useI18n();
const { $toast } = useNuxtApp() as any;
const { mobile } = useDisplay();
const { primaryColor: color } = useGlobals();
useHead({ title: () => t('menu.globals') });

const crudTable = ref<any>(null);
const itemDialogRef = ref<any>(null);
const dialog = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const initialFormData = ref<any>({});
const availableTags = ref<string[]>([]);

const { jsonExportLoading, jsonImportLoading, jsonInputRef, triggerJSONImport, exportSingleJSON, exportJSON, importJSON } = useJsonExportImport('/api/admin/globals', crudTable);

const tab = ref('code');
const historyDialogOpen = ref(false);
const testPayload = ref('[\n  "arg1",\n  "arg2"\n]');
const testResult = ref('');
const isTesting = ref(false);
const monacoTheme = ref('vs-dark');

const handleHistorySelect = (data: any) => {
  if (data && data.code !== undefined && itemDialogRef.value) {
    itemDialogRef.value.formData.code = data.code;
    if ($toast) $toast.info(t('message.historyLoaded'));
  }
};

const router = useRouter();

const runTest = async () => {
  isTesting.value = true;
  testResult.value = t('message.running');
  try {
    let payloadObj: any = [];
    if (testPayload.value.trim()) {
      try {
        payloadObj = JSON.parse(testPayload.value);
      } catch (e) {
        testResult.value = t('error.invalidJsonPayload');
        isTesting.value = false;
        return;
      }
    }

    const currentTarget = itemDialogRef.value?.formData?.target;
    const currentCode = itemDialogRef.value?.formData?.code || '';

    // UI veya Shared target ise tarayicida calistir
    if (currentTarget === 'ui' || currentTarget === 'shared') {
      const { compileUIUtil, invalidateUIUtilCache } = await import('~/composables/useGlobals');
      const testKey = '__test_ui_util__';
      invalidateUIUtilCache(testKey); // Her test oncesi cache temizle
      const fn = await compileUIUtil(testKey, currentCode);

      const frontendCtx = {
        payload: payloadObj,
        $router: router,
        $toast: $toast,
        $fetch: $fetch,
        globals: useGlobals().globals.value
      };

      const args = Array.isArray(payloadObj) ? payloadObj : [payloadObj];
      const res = await fn(frontendCtx, ...args);
      testResult.value = res !== undefined ? JSON.stringify(res, null, 2) : 'undefined';
    } else {
      // API target: Backend'e gonder (mevcut davranis)
      const res = await $fetch<any>('/api/admin/sandbox/test-run', {
        method: 'POST',
        body: {
          type: 'util',
          code: currentCode,
          payload: payloadObj
        }
      });
      testResult.value = res.result !== undefined ? JSON.stringify(res.result, null, 2) : 'undefined';
    }
  } catch (err: any) {
    testResult.value = 'ERROR:\n' + (err.data?.message || err.message || t('error.unknown'));
  } finally {
    isTesting.value = false;
  }
};

const copyTestResult = () => {
  navigator.clipboard.writeText(testResult.value);
  if ($toast) $toast.success(t('message.copied'));
};

const saveCodeOnly = async () => {
  const payload = itemDialogRef.value?.formData || initialFormData.value;
  const targetId = payload.id;

  if (!targetId) {
    if ($toast) $toast.warning(t('message.saveCodeNotAllowed'));
    return;
  }

  try {
    await $fetch(`/api/admin/globals/${targetId}`, {
      method: 'PUT',
      body: payload
    });
    crudTable.value?.loadItems();
    if ($toast) $toast.success(t('message.success'));
  } catch (err: any) {
    if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed', err.data?.data || {}));
  }
};

const columns = computed<any[]>(() => [
  { key: 'type', title: t('common.type'), sortable: true, width: '10%' },
  { key: 'description', title: t('table.description'), sortable: true, width: '20%' },
  { key: 'value', title: t('common.value'), sortable: false, width: '15%' },
  { key: 'target', title: t('common.target'), sortable: true, width: '10%' },
  { key: 'active', title: t('common.active'), sortable: true, width: '7%', align: 'center' },
  { key: 'is_public', title: t('common.public'), sortable: true, width: '7%', align: 'center' },
  { key: 'hashtags', title: t('field.hashtags'), sortable: false, width: '10%' },
  { key: 'info', title: t('common.info') || 'Info', sortable: false, width: '5%', align: 'center' }
]);

const openCreateDialog = () => {
  dialogMode.value = 'create';
  initialFormData.value = {
    type: 'variable',
    key: '',
    value: '',
    code: `/**
 * ============================================================================
 * BASEAPP GLOBAL UTILITY YAZIM KILAVUZU
 * ============================================================================
 * 
 * Bu alan, platformun herhangi bir yerinden tekrar tekrar cagirabilecegniz
 * genel amacli fonksiyonlar yazmaniz icindir.
 *
 * TARGET SECIMI:
 * - API: Kod sadece Backend'de (node:vm sandbox) calisir.
 *   ctx icerigi: db, telemetryDb, tenantSlug, userId, publishWS, t, recordManager
 * - UI: Kod sadece Tarayicida (Browser) calisir.
 *   ctx icerigi: $router, $toast, $fetch, globals (degiskenler)
 * - Shared: Hem API hem UI'da calisabilir. ctx icerigi calisma ortamina bagli.
 *
 * ============================================================================
 * ORNEK: API (BACKEND)
 * ============================================================================
 * export default async function(ctx, userId) {
 *    const rows = await ctx.db\`SELECT * FROM users WHERE id = \${userId}\`;
 *    ctx.publishWS('room', 'event', { data: rows[0] });
 *    return rows[0];
 * }
 *
 * ============================================================================
 * ORNEK: UI (FRONTEND)
 * ============================================================================
 * export default async function(ctx, mesaj) {
 *    ctx.$toast.success(mesaj || 'Basarili!');
 *    return { ok: true };
 * }
 *
 * ============================================================================
 * KONSOL / TEST SEKMESI (VIRTUAL CONSOLE)
 * console.log() kodlari "Console" sekmesine canli yansir.
 */
export default async function(ctx, ...args) {
  // Kodunuzu buraya yazin...
  
}`,
    data_type: 'string',
    target: 'shared',
    is_public: false,
    is_secret: false,
    protected: false,
    active: true,
    scope: [],
    description: '',
    hashtags: []
  };
  dialog.value = true;
};

const openEditDialog = async (item: any) => {
  dialogMode.value = 'edit';
  try {
    const detail = await $fetch(`/api/admin/globals/${item.id}`) as any;
    initialFormData.value = { ...detail };
    initialFormData.value.is_public = !!detail.is_public;
    initialFormData.value.is_secret = !!detail.is_secret;
    initialFormData.value.active = !!detail.active;
    initialFormData.value.protected = !!detail.protected;
    if (typeof initialFormData.value.hashtags === 'string') {
      initialFormData.value.hashtags = JSON.parse(initialFormData.value.hashtags || '[]');
    }
    if (typeof initialFormData.value.scope === 'string') {
      initialFormData.value.scope = JSON.parse(initialFormData.value.scope || '[]');
    }
    dialog.value = true;
  } catch (err: any) {
    if ($toast) $toast.error(t('errors.loadFailed'));
  }
};

const save = async (formData: any) => {
  try {
    const url = dialogMode.value === 'create'
      ? '/api/admin/globals'
      : `/api/admin/globals/${formData.id}`;

    await $fetch(url, {
      method: dialogMode.value === 'create' ? 'POST' : 'PUT',
      body: formData
    });

    dialog.value = false;
    crudTable.value?.loadItems();
  } catch (error: any) {
    throw error;
  }
};

const handleDelete = async (item: any) => {
  if (item.protected) return;
  if (!confirm(t('confirm.delete', { name: item.key || 'Global' }))) return;

  try {
    await $fetch(`/api/admin/globals/${item.id}`, { method: 'DELETE' });
    if ($toast) $toast.warning(t('message.entityDeleted', { name: 'Global' }));
    crudTable.value?.loadItems();
  } catch (err: any) {
    if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed', err.data?.data || {}));
  }
};
</script>
