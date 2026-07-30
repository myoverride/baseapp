<template>
  <v-container>
    <div class="mb-4">
      <v-btn prepend-icon="mdi-arrow-left" variant="text" to="/" class="text-none font-weight-medium px-0 text-body-1" color="grey-darken-2">
        {{ $t('common.home') }}
      </v-btn>
    </div>

    <!-- Sistem Değişkenleri Yönetimi -->
    <CrudTable
      ref="crudTable"
      :enable-multi-select="true"
      api-endpoint="/api/admin/system-variables"
      :columns="columns"
      :title="$t('common.systemSettings')"
      @create="openCreateDialog"
      @edit="openEditDialog"
      @delete="handleDelete"
    >
      <template #toolbarActions>
        <v-btn icon="mdi-download" variant="text" :loading="jsonExportLoading" @click="exportJSON('sysvars')" class="mr-2" :title="$t('action.exportFormat', { format: 'JSON' })"></v-btn>
        <v-btn icon="mdi-upload" variant="text" :loading="jsonImportLoading" @click="triggerJSONImport" class="mr-2" :title="$t('action.importFormat', { format: 'JSON' })"></v-btn>
        <input type="file" ref="jsonInputRef" accept=".json" style="display: none" @change="importJSON">
      </template>
      <template #rowActions="{ item }">
        <v-btn icon="mdi-download-circle-outline" size="small" color="blue" variant="text" @click="exportSingleJSON(item, 'sysvar')" :title="$t('action.exportFormat', { format: '(Single)' })" />
      </template>
      <template v-slot:item.key="{ item }">
        <v-chip color="info" size="small" variant="flat" class="font-weight-bold">
          <v-icon v-if="item.protected === 1 || item.protected === true" start size="x-small" color="red">mdi-lock</v-icon>
          {{ item.key }}
        </v-chip>
      </template>
      <template v-slot:item.value="{ item }">
        <span class="text-truncate d-inline-block" style="max-width: 250px;">{{ item.value }}</span>
      </template>
      <template v-slot:item.target="{ item }">
        <v-chip size="x-small" :color="item.target === 'api' ? 'error' : (item.target === 'ui' ? 'success' : 'primary')" variant="flat">
          {{ item.target }}
        </v-chip>
      </template>
      <template v-slot:item.is_public="{ item }">
        <v-icon :color="item.is_public ? 'success' : 'grey'">
          {{ item.is_public ? 'mdi-check-circle' : 'mdi-circle-outline' }}
        </v-icon>
      </template>

      <template v-slot:item.hashtags="{ item }">
        <v-chip class="ma-1" size="small" color="secondary" v-for="tag in (typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || []))" :key="tag">{{ tag }}</v-chip>
        <span v-if="!Array.isArray(typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || [])) || (typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || [])).length === 0" class="text-caption text-grey">-</span>
      </template>
    </CrudTable>

    <!-- Şablon Export/Import -->
    <v-row class="mt-4">
      <v-col cols="12">
        <v-card class="elevation-2 rounded-lg border-primary-lighten-4">
          <v-toolbar :color="color" height="76" class="px-2">
            <v-icon class="mr-2" color="info">mdi-application-export</v-icon>
            <v-toolbar-title class="text-subtitle-1 font-weight-bold">{{ $t('settings.appTemplateManagement') }}</v-toolbar-title>
          </v-toolbar>
          
          <v-card-text class="pt-4">
            <v-row align="center">
              <v-col cols="12" md="6">
                <h4 class="text-subtitle-2 font-weight-bold">{{ $t('settings.exportTemplate') }}</h4>
                <p class="text-body-2 text-grey-darken-1 mt-1">
                  {{ $t('settings.exportTemplateDesc') }}
                </p>
                <v-btn
                  color="info"
                  variant="elevated"
                  prepend-icon="mdi-download"
                  :loading="exportingTemplate"
                  @click="exportAppTemplate"
                  class="mt-3"
                >
                  {{ $t('action.exportFormat', { format: 'Template' }) }}
                </v-btn>
              </v-col>
              <v-col cols="12" md="6" class="border-md-left pl-md-6 mt-4 mt-md-0">
                <h4 class="text-subtitle-2 font-weight-bold">{{ $t('action.importFormat', { format: 'Template' }) }}</h4>
                <p class="text-body-2 text-grey-darken-1 mt-1 mb-3">
                  <v-icon color="warning" size="small">mdi-alert-circle</v-icon> <strong>{{ $t('settings.importWarning') }}</strong> <span v-html="$t('settings.importWarningDesc')"></span>
                </p>
                <div class="d-flex align-center gap-2">
                  <v-btn
                    color="warning"
                    variant="elevated"
                    prepend-icon="mdi-upload"
                    :loading="importingTemplate"
                    @click="triggerTemplateImport"
                  >
                    {{ $t('action.importFormat', { format: 'Template' }) }}
                  </v-btn>
                  <input type="file" ref="templateInputRef" accept=".json" style="display: none" @change="importAppTemplate">
                </div>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Sistem Yedekleme -->
    <v-row class="mt-4">
      <v-col cols="12">
        <v-card class="elevation-2 rounded-lg border-primary-lighten-4">
          <v-toolbar :color="color" height="76" class="px-2">
            <v-icon class="mr-2" color="warning">mdi-database</v-icon>
            <v-toolbar-title class="text-subtitle-1 font-weight-bold">{{ $t('settings.systemBackup') }}</v-toolbar-title>
          </v-toolbar>
          
          <v-card-text class="pt-4">
            <v-row align="center">
              <v-col cols="12" md="6">
                <h4 class="text-subtitle-2 font-weight-bold">{{ $t('settings.systemBackup') }}</h4>
                <p class="text-body-2 text-grey-darken-1 mt-1">
                  {{ $t('settings.backupDesc') }}
                </p>
                <v-btn
                  color="info"
                  variant="elevated"
                  prepend-icon="mdi-download"
                  :loading="exportingBackup"
                  @click="exportAppBackup"
                  class="mt-3"
                >
                  {{ $t('action.downloadBackup') }}
                </v-btn>
              </v-col>
              <v-col cols="12" md="6" class="border-md-left pl-md-6 mt-4 mt-md-0">
                <h4 class="text-subtitle-2 font-weight-bold">{{ $t('action.uploadBackup') }}</h4>
                <p class="text-body-2 text-grey-darken-1 mt-1 mb-3">
                  <v-icon color="error" size="small">mdi-alert-circle</v-icon> <strong>{{ $t('settings.restoreWarning') }}</strong>
                </p>
                <div class="d-flex align-center gap-2">
                  <v-btn
                    color="error"
                    variant="elevated"
                    prepend-icon="mdi-upload"
                    :loading="importingBackup"
                    @click="triggerBackupImport"
                  >
                    {{ $t('action.uploadBackup') }}
                  </v-btn>
                  <input type="file" ref="backupInputRef" accept=".db,.sqlite" style="display: none" @change="importAppBackup">
                </div>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>


    <!-- Dialog for System Variable Add/Edit -->
    <ItemDialog
      v-model="dialog"
      :mode="dialogMode"
      :initial-data="initialFormData"
      @save="saveItem"
    >
      <template #default="{ formData: fd }">
        <v-text-field
          v-model="fd.key"
          :label="$t('field.transKey')"
          variant="outlined"
          :rules="[v => !!v || $t('validation.required'), v => /^[a-zA-Z0-9_]+$/.test(v) || $t('validation.onlyAlphanumeric')]"
          required
          class="mb-4"
          :placeholder="$t('settings.placeholderTheme')"
          :disabled="fd.protected === 1 || fd.protected === true"
        ></v-text-field>
        
        <v-row>
          <v-col cols="12" md="6">
            <v-select
              v-model="fd.type"
              :items="['string', 'number', 'boolean', 'json', 'date', 'time', 'color']"
              :label="$t('field.dataType')"
              variant="outlined"
              class="mb-4"
              hide-details
            ></v-select>
          </v-col>
          <v-col cols="12" md="6">
            <v-switch
              v-model="fd.is_secret"
              :label="$t('field.isSecret')"
              color="error"
              :hint="$t('settings.hintEncrypted')"
              persistent-hint
            ></v-switch>
          </v-col>
        </v-row>

        <v-textarea
          v-if="['string', 'json'].includes(fd.type)"
          v-model="fd.value"
          :label="$t('common.value')"
          variant="outlined"
          :rules="[v => !!v || $t('validation.required')]"
          required
          rows="3"
          class="mb-4"
          :type="fd.is_secret ? 'password' : 'text'"
        ></v-textarea>
        
        <v-text-field
          v-else-if="fd.type === 'number'"
          v-model="fd.value"
          :label="$t('settings.numericValue')"
          type="number"
          variant="outlined"
          :rules="[v => !!v || $t('validation.required')]"
          class="mb-4"
        ></v-text-field>

        <v-switch
          v-else-if="fd.type === 'boolean'"
          v-model="fd.value"
          :label="$t('settings.booleanValue')"
          :color="color"
          class="mb-4"
          true-value="true"
          false-value="false"
        ></v-switch>

        <v-text-field
          v-else-if="['date', 'time', 'color'].includes(fd.type)"
          v-model="fd.value"
          :label="fd.type +  ' ' + $t('common.value')"
          :type="fd.type"
          variant="outlined"
          :rules="[v => !!v || $t('validation.required')]"
          class="mb-4"
        ></v-text-field>
        
        <v-text-field
          v-model="fd.description"
          :label="$t('field.descriptionOptional')"
          variant="outlined"
          class="mb-4"
          hide-details
        ></v-text-field>

        <v-combobox
          v-model="fd.hashtags"
          :label="$t('field.hashtags')"
          variant="outlined"
          multiple
          chips
          density="comfortable"
          class="mb-4"
          :hint="$t('field.hashtagsHint')"
          persistent-hint
        ></v-combobox>

        <v-row>
          <v-col cols="12" md="6">
            <v-select
              v-model="fd.target"
              :items="['ui', 'api', 'shared']"
              :label="$t('field.target')"
              variant="outlined"
              :color="color"
              :hint="$t('field.targetHint')"
              persistent-hint
              @update:model-value="val => { if (val === 'api') fd.is_public = false; }"
            ></v-select>
          </v-col>
          <v-col cols="12" md="6">
            <v-switch
              v-model="fd.is_public"
              :label="$t('common.public')"
              color="success"
              :hint="$t('field.anonymousReadHint')"
              persistent-hint
              :disabled="fd.target === 'api'"
            ></v-switch>
          </v-col>
        </v-row>
      </template>
    </ItemDialog>

  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useJsonExportImport } from '~/composables/useJsonExportImport';

const { t } = useI18n();
const { $toast } = useNuxtApp() as any;

useHead({ title: () => t('common.systemSettings') })



const selectedDevices = ref<string[]>([]);
const allDevices = ref<any[]>([]);

const fetchDevices = async () => {
  try {
    const res = await $fetch<any>('/api/admin/devices', { params: { limit: 1000 } });
    allDevices.value = Array.isArray(res) ? res : (res.records || res.data || []);
  } catch(e) {}
};

const consoleFilter = (log: any) => {
  if (selectedDevices.value.length === 0) return true;
  if (log.metadata && log.metadata.deviceId) {
    return selectedDevices.value.includes(log.metadata.deviceId);
  }
  return true;
};

onMounted(() => {
  fetchDevices();
});

const crudTable = ref();

const { primaryColor: color } = useSysVars();

const exportingTemplate = ref(false);
const importingTemplate = ref(false);
const templateInputRef = ref<HTMLInputElement | null>(null);

const { jsonExportLoading, jsonImportLoading, jsonInputRef, triggerJSONImport, exportSingleJSON, exportJSON, importJSON } = useJsonExportImport('/api/admin/system-variables', crudTable);

const columns = computed(() => [
  { title: t('table.transKey'), key: 'key', sortable: true, filterable: true, type: 'string', slot: true },
  { title: t('common.value'), key: 'value', sortable: false, filterable: true, type: 'string', slot: true },
  { title: t('table.description'), key: 'description', sortable: false, filterable: true, type: 'string' },
  { title: 'Hedef', key: 'target', sortable: true, filterable: true, type: 'string', slot: true },
  { title: t('common.public'), key: 'is_public', sortable: true, filterable: true, type: 'boolean', slot: true },
  { title: t('field.hashtags'), key: 'hashtags', sortable: false, filterable: true, slot: true },
]);

const dialog = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const initialFormData = ref<any>({});
const editId = ref<number | null>(null);

const toBool = (value: any) => value === true || value === 1 || value === '1' || value === 'true';

const openCreateDialog = () => {
  dialogMode.value = 'create';
  editId.value = null;
  initialFormData.value = { key: '', value: '', description: '', target: 'shared', is_public: false, is_secret: false, type: 'string', hashtags: [] };
  dialog.value = true;
};

const openEditDialog = async (item: any) => {
  try {
    const fullItem = await $fetch<any>(`/api/admin/system-variables/${item.id}`);
    dialogMode.value = 'edit';
    editId.value = fullItem.id;
    initialFormData.value = {
      ...fullItem,
      target: fullItem.target || 'shared',
      is_public: toBool(fullItem.is_public),
      is_secret: toBool(fullItem.is_secret),
      type: fullItem.type || 'string',
      hashtags: typeof fullItem.hashtags === 'string' ? JSON.parse(fullItem.hashtags || '[]') : (fullItem.hashtags || [])
    };
    dialog.value = true;
  } catch (err: any) {
    if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed'));
  }
};

const saveItem = async (payload: any) => {
  // no hashtag stripping
  const body = {
    ...payload,
    target: payload.target || 'shared',
    is_public: payload.target === 'api' ? false : toBool(payload.is_public),
    is_secret: toBool(payload.is_secret)
  };

  try {
    if (dialogMode.value === 'edit') {
      await $fetch(`/api/admin/system-variables/${editId.value}`, { method: 'PUT', body });
      if ($toast) $toast.success(t('message.entityUpdated', { name: t('entity.var') }));
    } else {
      await $fetch('/api/admin/system-variables', { method: 'POST', body });
      if ($toast) $toast.success(t('message.entityCreated', { name: t('entity.var') }));
    }
    dialog.value = false;
    
    // UI'ı anında reaktif olarak güncelle
    const sysVars = useState<Record<string, string>>('sys-vars-global');
    if (sysVars.value) {
      sysVars.value = { ...sysVars.value, [body.key]: body.value };
    }
    
    crudTable.value?.loadItems();
  } catch (err: any) {
    if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed'));
  }
};

const handleDelete = async (item: any) => {
  if (!confirm(t('confirm.delete', { name: typeof item !== 'undefined' ? (item.key || item.name || item.id || '?') : '?' }))) return;
  try {
    await $fetch(`/api/admin/system-variables/${item.id}`, { method: 'DELETE' });
    if ($toast) $toast.warning(t('message.entityDeleted', { name: t('entity.var') }));
    
    // UI'dan anında sil
    const sysVars = useState<Record<string, string>>('sys-vars-global');
    if (sysVars.value && item.key) {
      delete sysVars.value[item.key];
    }
    
    crudTable.value?.loadItems();
  } catch (err: any) {
    if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed'));
  }
};



const exportAppTemplate = async () => {
  exportingTemplate.value = true;
  try {
    const res = await $fetch('/api/admin/template/export');
    const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `app-template_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
    if ($toast) $toast.success(t('message.templateExported'));
  } catch (err: any) {
    if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed'));
  } finally {
    exportingTemplate.value = false;
  }
};

const triggerTemplateImport = () => {
  if (confirm(t('message.templateImportWarning'))) {
    templateInputRef.value?.click();
  }
};

const importAppTemplate = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  importingTemplate.value = true;
  
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const template = JSON.parse(event.target?.result as string);
      const res = await $fetch<any>('/api/admin/template/import', {
        method: 'POST',
        body: { template }
      });
      if ($toast) $toast.success(res.message || t('message.templateImported'));
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed'));
    } finally {
      importingTemplate.value = false;
      if (input) input.value = '';
    }
  };
  reader.onerror = () => {
    if ($toast) $toast.error(t('message.fileReadError'));
    importingTemplate.value = false;
  };
  reader.readAsText(file);
};

const exportingBackup = ref(false);
const importingBackup = ref(false);
const backupInputRef = ref<HTMLInputElement | null>(null);

const exportAppBackup = async () => {
  exportingBackup.value = true;
  try {
    const res = await $fetch('/api/admin/backup', { responseType: 'blob' });
    const blob = new Blob([res as unknown as Blob], { type: 'application/octet-stream' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString().split('T')[0]}.db`;
    a.click();
    window.URL.revokeObjectURL(url);
    if ($toast) $toast.success('Backup downloaded');
  } catch (err: any) {
    if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed'));
  } finally {
    exportingBackup.value = false;
  }
};

const triggerBackupImport = () => {
  if (confirm(t('settings.restoreWarning'))) {
    backupInputRef.value?.click();
  }
};

const importAppBackup = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  importingBackup.value = true;
  
  const formData = new FormData();
  formData.append('backup', file);

  try {
    const res = await $fetch<any>('/api/admin/backup', {
      method: 'POST',
      body: formData
    });
    if ($toast) $toast.success(res.message || 'Backup restored successfully');
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  } catch (err: any) {
    if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed'));
  } finally {
    importingBackup.value = false;
    if (input) input.value = '';
  }
};

</script>
