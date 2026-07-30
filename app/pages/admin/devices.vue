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
      api-endpoint="/api/admin/devices"
      :columns="columns"
      :title="$t('page.devices')"
      default-sort-key="created_at"
      default-sort-order="desc"
      @create="openCreateDialog"
      @edit="openEditDialog"
      @delete="handleDelete"
    >
      <template #toolbarActions>
        <v-btn icon="mdi-download" variant="text" :loading="jsonExportLoading" @click="exportJSON('devices')" class="mr-2" :title="$t('action.exportFormat', { format: 'JSON' })"></v-btn>
        <v-btn icon="mdi-upload" variant="text" :loading="jsonImportLoading" @click="triggerJSONImport" class="mr-2" :title="$t('action.importFormat', { format: 'JSON' })"></v-btn>
        <input type="file" ref="jsonInputRef" accept=".json" style="display: none" @change="importJSON">
      </template>
      <template v-slot:item.device_id="{ item }">
        <span class="font-weight-medium">{{ item.device_id }}</span>
        <v-btn 
          icon="mdi-content-copy" 
          size="x-small" 
          variant="text" 
          :color="color" 
          @click="copy(String(item.device_id), $t('message.idCopied'))"
        ></v-btn>
      </template>

      <template v-slot:item.schema.target_record_id="{ item }">
        <v-chip v-if="(item.schema as any)?.target_record_id || (item.schema as any)?.machine_record_id" size="small" color="info" variant="flat">
          {{ getRecordName(item) }}
        </v-chip>
        <span v-else class="text-grey text-caption">{{ $t('message.undefined') }}</span>
      </template>

      <template v-slot:item.secret_key="{ item }">
        <code class="bg-grey-lighten-4 px-2 py-1 rounded text-body-2 font-weight-medium text-grey-darken-2">
          *********
        </code>
        <v-btn 
          icon="mdi-content-copy" 
          size="x-small" 
          variant="text" 
          :color="color" 
          @click="copy(String(item.secret_key), $t('message.keyCopied'))"
        ></v-btn>
      </template>

      <!-- Telemetry İşlemi (Row Action) -->
      <template #rowActions="{ item }">
        <v-btn icon="mdi-download-circle-outline" size="small" color="blue" variant="text" @click="exportSingleJSON(item, 'device')" :title="$t('action.exportFormat', { format: '(Single)' })" />
        <v-btn icon="mdi-chart-line" size="small" color="indigo" variant="text" :to="'/admin/telemetry/' + item.device_id" :title="$t('action.telemetryData')" />
        <v-btn icon="mdi-remote" size="small" color="success" variant="text" @click="openCommandDialog(item)" :title="$t('action.sendCommand')" />
      </template>

      <!-- Hashtags -->
      <template v-slot:item.hashtags="{ item }">
        <v-chip class="ma-1" size="small" color="secondary" v-for="tag in (typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || []))" :key="tag">{{ tag }}</v-chip>
        <span v-if="!Array.isArray(typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || [])) || (typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || [])).length === 0" class="text-caption text-grey">-</span>
      </template>

      <!-- Detay / Info Sütunu -->
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
    </CrudTable>

    <ItemDialog
      v-model="dialog"
      :mode="dialogMode"
      :initial-data="initialFormData"
      @save="saveItem"
    >
      <template #default="{ formData: dialogData }">
        <v-text-field 
          v-model="dialogData.deviceId" 
          :label="$t('common.id')" 
          variant="outlined" 
          density="comfortable" 
          class="mb-2" 
          :rules="[(v: any) => !!v || $t('validation.required')]"
        ></v-text-field>
        <v-autocomplete
          v-model="dialogData.targetRecordId"
          :items="availableRecords"
          item-title="title"
          item-value="value"
          :label="$t('field.targetRecordOptional')"
          variant="outlined"
          density="comfortable"
          class="mb-2"
          clearable
          :hint="$t('hint.selectEntity')"
          persistent-hint
        ></v-autocomplete>
        <v-text-field 
          v-if="dialogMode === 'edit'" 
          v-model="dialogData.secretKey" 
          :label="$t('common.secretKey')" 
          variant="outlined" 
          density="comfortable" 
          append-inner-icon="mdi-refresh" 
          :hint="$t('hint.generateKey')" 
          persistent-hint 
          @click:append-inner="generateRandomKey(dialogData)"
        ></v-text-field>
        <v-combobox
          v-model="dialogData.hashtags"
          :label="$t('field.hashtags')"
          variant="outlined"
          multiple
          chips
          density="comfortable"
          class="mb-2"
          :hint="$t('field.hashtagsHint')"
          persistent-hint
        ></v-combobox>
      </template>
    </ItemDialog>

    <!-- Downlink Komut Gönderme Dialogu -->
    <v-dialog v-model="commandDialog" max-width="800px">
      <v-card>
        <v-toolbar :color="color" height="76" class="px-2">
          <v-toolbar-title class="text-h6 font-weight-bold">
            {{ $t('device.downlink') }} {{ selectedDevice?.device_id }}
          </v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn icon="mdi-close" variant="text" color="white" @click="commandDialog = false"></v-btn>
        </v-toolbar>
        
        <v-card-text class="pt-4">
          <v-row>
            <v-col cols="12" md="6" class="border-sm-right">
              <h3 class="text-subtitle-1 font-weight-bold mb-3">{{ $t('action.newCommand') }}</h3>
              <v-text-field
                v-model="newCommandName"
                :label="$t('label.commandName')"
                variant="outlined"
                density="comfortable"
                class="mb-3"
              ></v-text-field>

              <v-textarea
                v-model="newCommandPayload"
                :label="$t('field.commandParamsJson')"
                variant="outlined"
                density="comfortable"
                rows="4"
                :hint="$t('hint.validJson')"
                persistent-hint
                class="mb-3"
              ></v-textarea>

              <v-btn
                color="success"
                block
                prepend-icon="mdi-send"
                :loading="sendingCommand"
                @click="sendDeviceCommand"
              >
                {{ $t('action.sendCommand') }}
              </v-btn>
            </v-col>
            
            <v-col cols="12" md="6">
              <div class="d-flex justify-space-between align-center mb-3">
                <h3 class="text-subtitle-1 font-weight-bold">{{ $t('action.history') }}</h3>
                <v-btn icon="mdi-refresh" size="small" variant="text" @click="loadCommandHistory"></v-btn>
              </div>

              <div style="max-height: 300px; overflow-y: auto;">
                <v-list density="compact" v-if="commandHistory && commandHistory.length > 0">
                  <v-list-item v-for="cmd in commandHistory" :key="cmd.id" class="px-0 py-1 border-bottom">
                    <div class="d-flex justify-space-between align-center w-100">
                      <div>
                        <div class="font-weight-bold text-body-2">{{ cmd.command_name }}</div>
                        <div class="text-caption text-grey">{{ formatTime(cmd.created_at) }}</div>
                      </div>
                      <v-chip :color="getStatusColor(cmd.status)" size="x-small" label class="font-weight-bold">
                        {{ cmd.status }}
                      </v-chip>
                    </div>
                    <div class="text-caption text-grey-darken-1 mt-1 bg-grey-lighten-4 pa-1 rounded" style="font-family: monospace; white-space: pre-wrap; font-size: 10px;">
                      <div>Payload: {{ JSON.stringify(cmd.payload) }}</div>
                      <div v-if="cmd.response">Response: {{ JSON.stringify(cmd.response) }}</div>
                    </div>
                  </v-list-item>
                </v-list>
                <div v-else class="text-center text-grey py-8">{{ $t('message.noCommandHistory') }}</div>
              </div>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Yardım (Help) Dialogu -->
  </v-container>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useJsonExportImport } from '~/composables/useJsonExportImport';

const { t } = useI18n();
const { $toast, $localize } = useNuxtApp() as any;

useHead({ title: () => t('page.devices') })

const crudTable = ref();
const availableRecords = ref<any[]>([]);

const { primaryColor: color } = useSysVars();

const fetchDependencies = async () => {
  try {
    const lookupData = await $fetch('/api/admin/users/records-lookup');
    const entData = (lookupData as any).entities || [];
    const recData = (lookupData as any).records || [];
    
    const entMap: Record<number, any> = {};
    const pKeyMap: Record<number, string | undefined> = {};
    
    entData.forEach((e: any) => {
      entMap[e.id] = e.name;
      if (e.schema) {
        const pk = Object.keys(e.schema).find(k => e.schema[k].isPrimary);
        if (pk) pKeyMap[e.id] = pk;
      }
    });
    
    availableRecords.value = recData.map((r: any) => {
      const rawEntName = entMap[r.entity_id] || 'Bilinmeyen';
      const entName = typeof $localize === 'function' ? $localize(typeof rawEntName === 'string' && rawEntName.startsWith('{') ? rawEntName : JSON.stringify(rawEntName)) : (typeof rawEntName === 'object' ? rawEntName.tr || rawEntName.en || 'Bilinmeyen' : rawEntName);
      const pk = pKeyMap[r.entity_id];
      let name = r.id;
      if (r.data) {
        if (pk && r.data[pk]) {
          name = r.data[pk];
        } else {
          name = r.data['Adı Soyadı'] || r.data['Adı'] || r.data['Kodu'] || r.data['Fabrika'] || r.id;
        }
      }
      return {
        value: r.id,
        title: `[${entName}] ${name}`
      };
    });
  } catch (err: any) {
    
  }
};

onMounted(() => {
  fetchDependencies();
});

onUnmounted(() => {
  if (commandHistoryInterval) {
    clearInterval(commandHistoryInterval);
    commandHistoryInterval = null;
  }
});

const getRecordName = (item: any) => {
  const data = item.target_record_data;
  const entitySchema = item.entity_schema;
  const id = item.schema?.target_record_id || item.schema?.machine_record_id;
  if (!data) return `${t('record.prefix')}${id}`;
  
  // 1. Explicitly chosen primary field by the user
  if (entitySchema) {
    const primaryKey = Object.keys(entitySchema).find(k => entitySchema[k].isPrimary);
    if (primaryKey && data[primaryKey] !== undefined) return String(data[primaryKey]);
  }
  
  // 2. Smart fallback if no primary is set (legacy)
  const possibleKeys = ['envanter kodu', 'ad', 'name', 'title', 'label', 'ad soyad', 'isim', 'makine modeli', 'hat adı', 'departman adı', 'tesis adı'];
  const nameKey = Object.keys(data).find(k => possibleKeys.includes(k.toLowerCase()));
  if (nameKey && data[nameKey] !== undefined) return String(data[nameKey]);
  
  // 3. Just take the first string field
  const firstKey = Object.keys(data).find(k => typeof data[k] === 'string');
  if (firstKey) return String(data[firstKey]);
  
  return `${t('record.prefix')}${id}`;
};

const commandDialog = ref(false);
const selectedDevice = ref<any>(null);
const newCommandName = ref('');
const newCommandPayload = ref('{\n  "status": true\n}');
const sendingCommand = ref(false);
const commandHistory = ref<any[]>([]);
let commandHistoryInterval: any = null;

const openCommandDialog = (item: any) => {
  selectedDevice.value = item;
  newCommandName.value = '';
  newCommandPayload.value = '{\n  \n}';
  commandHistory.value = [];
  commandDialog.value = true;
  loadCommandHistory();
  
  if (commandHistoryInterval) clearInterval(commandHistoryInterval);
  commandHistoryInterval = setInterval(loadCommandHistory, 2000);
};

watch(commandDialog, (val) => {
  if (!val && commandHistoryInterval) {
    clearInterval(commandHistoryInterval);
    commandHistoryInterval = null;
  }
});

const loadCommandHistory = async () => {
  if (!selectedDevice.value) return;
  try {
    commandHistory.value = await $fetch<any>(`/api/admin/devices/commands?deviceId=${selectedDevice.value.device_id}` as any);
  } catch (e: any) {
    
  }
};

const sendDeviceCommand = async () => {
  if (!newCommandName.value.trim()) {
    if ($toast) $toast.error(t('message.commandEmpty'));
    return;
  }
  let parsedPayload = {};
  try {
    if (newCommandPayload.value.trim()) {
      parsedPayload = JSON.parse(newCommandPayload.value);
    }
  } catch (e) {
    if ($toast) $toast.error(t('error.invalidFormat'));
    return;
  }

  sendingCommand.value = true;
  try {
    const res = await $fetch<any>('/api/admin/devices/commands' as any, {
      method: 'POST',
      body: {
        deviceId: selectedDevice.value.device_id,
        command: newCommandName.value.trim(),
        payload: parsedPayload
      }
    });
    if (res.success) {
      if ($toast) $toast.success(t('message.commandSent'));
      newCommandName.value = '';
      newCommandPayload.value = '{\n  \n}';
      loadCommandHistory();
    } else {
      if ($toast) $toast.error(res.error || t('message.commandFailed'));
    }
    } catch (e: any) {
      if ($toast) $toast.error(t(e.data?.message || 'errors.operationFailed'));
    } finally {
      sendingCommand.value = false;
    }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'SUCCESS': return 'success';
    case 'SENT': return 'warning';
    case 'PENDING': return 'info';
    case 'TIMEOUT': return 'grey';
    case 'FAILED': return 'error';
    default: return 'grey';
  }
};

const formatTime = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('tr-TR') + ' ' + d.toLocaleDateString('tr-TR');
};

const { jsonExportLoading, jsonImportLoading, jsonInputRef, triggerJSONImport, exportSingleJSON, exportJSON, importJSON } = useJsonExportImport('/api/admin/devices', crudTable);

const columns = computed(() => [
  { title: t('table.id'), key: 'id', sortable: true, filterable: true, type: 'number', width: '80px' },
  { title: t('field.deviceId'), key: 'device_id', sortable: true, filterable: true, type: 'string', slot: true },
  { title: t('table.targetRecordId'), key: 'schema.target_record_id', sortable: false, filterable: false, slot: true },
  { title: t('common.secretKey'), key: 'secret_key', sortable: false, filterable: false, slot: true },
  { title: t('table.hashtags'), key: 'hashtags', sortable: false, filterable: true, slot: true },
  { title: t('common.detail'), key: 'info', sortable: false, filterable: false, slot: true, width: '60px', align: 'center' as const }
]);

const dialog = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const initialFormData = ref<Record<string, any>>({});
const editId = ref<number | null>(null);

const openCreateDialog = () => {
  dialogMode.value = 'create';
  editId.value = null;
  initialFormData.value = { deviceId: '', secretKey: '', targetRecordId: null, hashtags: [] };
  dialog.value = true;
};

const openEditDialog = (item: any) => {
  dialogMode.value = 'edit';
  editId.value = item.id;
  initialFormData.value = { 
    deviceId: item.device_id, 
    secretKey: item.secret_key,
    targetRecordId: item.schema?.target_record_id || item.schema?.machine_record_id || null,
    hashtags: typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || [])
  };
  dialog.value = true;
};

const generateRandomKey = (dialogData: any) => {
  const chars = 'abcdef0123456789';
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  dialogData.secretKey = result;
  if ($toast) $toast.info(t('message.keyGenerated'));
};

const saveItem = async (payload: any) => {
  // no hashtag stripping
  if (!payload.deviceId.trim()) return;

  try {
    if (dialogMode.value === 'edit') {
      await $fetch(`/api/admin/devices/${editId.value}`, {
        method: 'PUT',
        body: {
          deviceId: payload.deviceId.trim(),
          secretKey: payload.secretKey,
          targetRecordId: payload.targetRecordId,
          hashtags: payload.hashtags
        }
      });
    } else {
      await $fetch('/api/admin/devices', {
        method: 'POST',
        body: { 
          deviceId: payload.deviceId.trim(),
          targetRecordId: payload.targetRecordId,
          hashtags: payload.hashtags
        }
      });
    }
    dialog.value = false;
    if ($toast) $toast.success(dialogMode.value === 'edit' ? t('message.success') : t('message.success'));
    crudTable.value?.loadItems();
  } catch (e: any) {
    if ($toast) $toast.error(t(e.data?.message || 'errors.operationFailed'));
  }
};

const handleDelete = async (item: any) => {
  if (!confirm(t('confirm.delete'))) return;
  try {
    await $fetch(`/api/admin/devices/${item.id}`, { method: 'DELETE' });
    if ($toast) $toast.warning(t('message.entityDeleted', { name: t('entity.device') }));
    crudTable.value?.loadItems();
  } catch (e: any) {
    if ($toast) $toast.error(t(e.data?.message || 'errors.operationFailed'));
  }
};

const copy = async (txt: string, message = t('message.keyCopied')) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(txt);
      if ($toast) $toast.success(message);
    } else {
      // Fallback for older browsers and iOS Safari
      const textarea = document.createElement('textarea');
      textarea.value = txt;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      if ($toast) $toast.success(message);
    }
  } catch (err) {
    if ($toast) $toast.error('Failed to copy text');
  }
};
</script>

