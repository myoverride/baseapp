<template>
  <v-container>
    <div class="mb-4">
      <v-btn prepend-icon="mdi-arrow-left" variant="text" to="/" class="text-none font-weight-medium px-0 text-body-1" color="primary">
        {{ $t('common.home') }}
      </v-btn>
    </div>
    
    <CrudTable
      ref="crudTable"
      :enable-multi-select="true"
      api-endpoint="/api/admin/tenants"
      :columns="columns"
      :title="$t('page.tenants')"
      default-sort-key="id"
      default-sort-order="asc"
      @create="openCreateDialog"
      @edit="openEditDialog"
      @delete="handleDelete"
    >
      <template #toolbarActions>
        <v-btn icon="mdi-download" variant="text" :loading="jsonExportLoading" @click="exportJSON('tenants')" class="mr-2" :title="$t('action.exportFormat', { format: 'JSON' })"></v-btn>
        <v-btn icon="mdi-upload" variant="text" :loading="jsonImportLoading" @click="triggerJSONImport" class="mr-2" :title="$t('action.importFormat', { format: 'JSON' })"></v-btn>
        <input type="file" ref="jsonInputRef" accept=".json" style="display: none" @change="importJSON">
      </template>
      <template v-slot:item.slug="{ item }">
        <v-chip size="small" color="info" variant="outlined" class="font-weight-bold">
          {{ item.slug }}
        </v-chip>
      </template>
      <template v-slot:item.status="{ item }">
        <v-chip size="small" :color="item.status === 'active' ? 'success' : 'error'">
          {{ item.status === 'active' ? $t('common.active') : $t('common.passive') }}
        </v-chip>
      </template>
      <template v-slot:item.created_at="{ item }">
        {{ formatAppDate(item.created_at as string) }}
      </template>
      <template #rowActions="{ item }">
        <v-btn icon="mdi-download-circle-outline" size="small" color="blue" variant="text" @click="exportSingleJSON(item, 'tenant')" :title="$t('action.exportFormatSingle')" />
      </template>
      <template v-slot:item.hashtags="{ item }">
        <v-chip class="ma-1" size="small" color="secondary" v-for="tag in (typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || []))" :key="tag">{{ tag }}</v-chip>
        <span v-if="!Array.isArray(typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || [])) || (typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || [])).length === 0" class="text-caption text-grey">-</span>
      </template>
      <template v-slot:item.info="{ item }">
        <v-tooltip location="top" max-width="400">
          <template v-slot:activator="{ props }">
            <v-btn icon="mdi-information" v-bind="props" color="info" variant="text" size="small"></v-btn>
          </template>
          <div class="text-caption">
            <div class="mb-1"><span class="font-weight-medium opacity-70">{{ $t('table.createdAt') }}:</span> {{ formatAppDate((item as any).created_at) }}</div>
            <v-divider class="my-1 border-opacity-25"></v-divider>
            <div class="mb-1"><span class="font-weight-medium opacity-70">{{ $t('table.deviceCount') }}:</span> {{ (item as any).info?.devicesCount || 0 }}</div>
            <div class="mb-1"><span class="font-weight-medium opacity-70">{{ $t('table.endpointCount') }}:</span> {{ (item as any).info?.endpointsCount || 0 }}</div>
            <div class="mb-1"><span class="font-weight-medium opacity-70">{{ $t('table.entityCount') }}:</span> {{ (item as any).info?.entitiesCount || 0 }}</div>
            <div class="mb-1"><span class="font-weight-medium opacity-70">{{ $t('table.recordCount') }}:</span> {{ (item as any).info?.recordsCount || 0 }}</div>
            <div class="mb-1"><span class="font-weight-medium opacity-70">{{ $t('table.pageCount') }}:</span> {{ (item as any).info?.pagesCount || 0 }}</div>
            <div class="mb-1"><span class="font-weight-medium opacity-70">{{ $t('table.workerCount') }}:</span> {{ (item as any).info?.workersCount || 0 }}</div>
            <div class="mb-1"><span class="font-weight-medium opacity-70">{{ $t('table.userCount') }}:</span> {{ (item as any).info?.usersCount || 0 }}</div>
            <div class="mb-1"><span class="font-weight-medium opacity-70">{{ $t('table.roleCount') }}:</span> {{ (item as any).info?.rolesCount || 0 }}</div>
            <div class="mb-1"><span class="font-weight-medium opacity-70">{{ $t('table.languageCount') }}:</span> {{ (item as any).info?.languagesCount || 0 }}</div>
            <v-divider class="my-1 border-opacity-25"></v-divider>
            <div class="mb-1"><span class="font-weight-medium opacity-70">{{ $t('table.sqliteAppDb') }}:</span> {{ formatBytes((item as any).info?.sqliteSize || 0) }}</div>
            <div><span class="font-weight-medium opacity-70">{{ $t('table.duckdbTelemetry') }}:</span> {{ formatBytes((item as any).info?.duckdbSize || 0) }}</div>
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
        <v-row>
          <v-col cols="12" class="pb-0">
            <v-text-field
              v-model="dialogData.name"
              :label="$t('field.tenantName')"
              variant="outlined"
              density="comfortable"
              class="mb-2"
              :rules="[(v: any) => !!v || $t('validation.required')]"
            ></v-text-field>
          </v-col>

          <v-col cols="12" class="pb-0">
            <v-text-field
              v-model="dialogData.slug"
              :label="$t('field.slug')"
              variant="outlined"
              density="comfortable"
              class="mb-2"
              :hint="$t('message.slugHint')"
              persistent-hint
              :readonly="dialogMode === 'edit'"
              :rules="[
                (v: any) => !!v || $t('validation.required'),
                (v: any) => /^[a-z0-9-]+$/.test(v) || t('validation.tenantSlugPattern')
              ]"
            ></v-text-field>
          </v-col>

          <v-col cols="12" class="pb-0">
            <v-text-field
              v-model="dialogData.custom_domain"
              :label="$t('field.customDomain')"
              variant="outlined"
              density="comfortable"
              class="mb-2"
              :placeholder="$t('field.tenantCodeHint')"
            ></v-text-field>
          </v-col>

          <v-col cols="12" class="pb-0">
            <v-select
              v-model="dialogData.status"
              :items="tenantStatusOptions"
              item-title="title"
              item-value="value"
              :label="$t('common.status')"
              variant="outlined"
              density="comfortable"
              class="mb-2"
            >
              <template v-slot:selection="{ item }">
                <v-chip size="small" :color="item.value === 'active' ? 'success' : 'error'">
                  {{ item.title }}
                </v-chip>
              </template>
            </v-select>
          </v-col>
          <v-col cols="12" class="pb-0">
            <v-combobox
              v-model="dialogData.hashtags"
              :items="availableTags"
              :label="$t('field.hashtags')"
              multiple
              chips
              closable-chips
              clearable
              variant="outlined"
              density="comfortable"
              class="mb-2"
            ></v-combobox>
          </v-col>
        </v-row>
      </template>
    </ItemDialog>

  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useJsonExportImport } from '~/composables/useJsonExportImport';

const { t } = useI18n();
const { $toast } = useNuxtApp() as any;

const formatBytes = (bytes: number, decimals = 2) => {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const availableTags = ref<string[]>([]);

onMounted(async () => {
  try {
    const tags = await $fetch<string[]>('/api/admin/app-studio/tags');
    availableTags.value = tags || [];
  } catch (e) {
    
  }
});

useHead({ title: () => t('page.tenants') });

const crudTable = ref();
const dialog = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const initialFormData = ref<Record<string, any>>({});
const editId = ref<number | null>(null);

const { jsonExportLoading, jsonImportLoading, jsonInputRef, triggerJSONImport, exportSingleJSON, exportJSON, importJSON } = useJsonExportImport('/api/admin/tenants', crudTable);

const columns = computed(() => [
  { title: t('common.id'), key: 'id', sortable: true, filterable: true, type: 'number', width: '80px' },
  { title: t('field.tenantName'), key: 'name', sortable: true, filterable: true, type: 'string' },
  { title: t('common.slug'), key: 'slug', slot: true },
  { title: t('field.customDomain'), key: 'custom_domain', sortable: true, filterable: true, type: 'string' },
  { title: t('common.status'), key: 'status', slot: true },
  { title: t('field.hashtags'), key: 'hashtags', sortable: false, filterable: true, slot: true },
  { title: t('common.info'), key: 'info', sortable: false, slot: true }
]);

const tenantStatusOptions = computed(() => [
  { title: t('common.active'), value: 'active' },
  { title: t('common.passive'), value: 'inactive' }
]);

const openCreateDialog = () => {
  dialogMode.value = 'create';
  editId.value = null;
  initialFormData.value = { name: '', slug: '', custom_domain: '', status: 'active', hashtags: [] };
  dialog.value = true;
};

const openEditDialog = (item: any) => {
  dialogMode.value = 'edit';
  editId.value = item.id;
  initialFormData.value = { 
    name: item.name, 
    slug: item.slug, 
    custom_domain: item.custom_domain || '',
    status: item.status || 'active',
    hashtags: typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || [])
  };
  dialog.value = true;
};

const saveItem = async (payload: any) => {
  if (!payload.name.trim() || !payload.slug.trim()) return;

  try {
    if (dialogMode.value === 'edit') {
      await $fetch(`/api/admin/tenants/${editId.value}`, {
        method: 'PUT',
        body: {
          name: payload.name.trim(),
          slug: payload.slug.trim(),
          custom_domain: payload.custom_domain,
          status: payload.status,
          hashtags: payload.hashtags
        }
      });
    } else {
      await $fetch('/api/admin/tenants', {
        method: 'POST',
        body: { 
          name: payload.name.trim(),
          slug: payload.slug.trim(),
          custom_domain: payload.custom_domain,
          status: payload.status,
          hashtags: payload.hashtags
        }
      });
    }
    dialog.value = false;
    if ($toast) $toast.success(dialogMode.value === 'edit' ? t('message.updated') : t('message.added'));
    crudTable.value?.loadItems();
  } catch (e: any) {
        const errPayload = e?.data;
    const isArr = Array.isArray(errPayload?.data);
    const errData = isArr ? errPayload.data[0] : (errPayload?.data || {});
    const errMsg = isArr ? errPayload.data[0].message : (errPayload?.message || 'errors.operationFailed');
    if ($toast) $toast.error(t(errMsg, errData));
  }
};

const handleDelete = async (item: any) => {
  if (!confirm(t('confirm.delete', { name: item.name }))) return;
  
  try {
    await $fetch(`/api/admin/tenants/${item.id}`, { 
      method: 'DELETE'
    });
    if ($toast) $toast.success(t('message.deleted'));
    crudTable.value?.loadItems();
  } catch (e: any) {
        const errPayload = e?.data;
    const isArr = Array.isArray(errPayload?.data);
    const errData = isArr ? errPayload.data[0] : (errPayload?.data || {});
    const errMsg = isArr ? errPayload.data[0].message : (errPayload?.message || 'errors.operationFailed');
    if ($toast) $toast.error(t(errMsg, errData));
  }
};

</script>

