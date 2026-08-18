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
      api-endpoint="/api/admin/users"
      :columns="columns"
      :title="$t('page.users')"
      default-sort-key="id"
      default-sort-order="asc"
      @create="openCreateDialog"
      @edit="openEditDialog"
      @delete="handleDelete"
    >
      <template #toolbarActions>
        <v-btn icon="mdi-download" variant="text" :loading="jsonExportLoading" @click="exportJSON" class="mr-2" :title="$t('action.exportFormat', { format: 'JSON' })"></v-btn>
        <v-btn icon="mdi-upload" variant="text" :loading="jsonImportLoading" @click="triggerJSONImport" class="mr-2" :title="$t('action.importFormat', { format: 'JSON' })"></v-btn>
        <input type="file" ref="jsonInputRef" accept=".json" style="display: none" @change="importJSON">
      </template>
      <template v-slot:item.is_admin="{ item }">
        <v-chip size="small" :color="item.is_admin ? 'success' : 'grey'">
          {{ item.is_admin ? $t('common.admin') : $t('user.standardUser') }}
        </v-chip>
      </template>
      <template v-slot:item.role_name="{ item }">
        <v-chip size="small" color="info" v-if="item.role_name">
          {{ item.role_name }}
        </v-chip>
        <span v-else-if="item.is_admin" class="text-grey">-</span>
        <span v-else class="text-error">Rol Yok</span>
      </template>
      <template v-slot:item.home_page="{ item }">
        <span v-if="item.home_page" class="text-caption opacity-70">{{ item.home_page }}</span>
        <span v-else class="text-caption text-grey">-</span>
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
            <div class="mb-1"><span class="font-weight-medium opacity-70">{{ $t('table.createdAt') }}:</span> {{ formatAppDate(item.created_at as any) }}</div>
            <div><span class="font-weight-medium opacity-70">{{ $t('table.updatedAt') }}:</span> {{ formatAppDate(item.updated_at as any) }}</div>
          </div>
        </v-tooltip>
      </template>
    
      <template v-slot:rowActions="{ item }">
        <v-btn icon="mdi-download-circle-outline" size="small" color="blue" variant="text" @click="exportSingleJSON(item)" :title="$t('action.exportFormat', { format: '(Single)' })" />
      </template>
    </CrudTable>

    <ItemDialog
      v-model="dialog"
      :mode="dialogMode"
      :initial-data="initialFormData"
      fullscreen
      @save="saveItem"
    >
      <template #default="{ formData: dialogData }">
        <v-row>
          <v-col cols="12" sm="6" md="4" lg="3" class="pb-0">
            <v-text-field
              v-model="dialogData.username"
              :label="$t('common.username')"
              variant="outlined"
              density="comfortable"
              required
              :rules="[(v: any) => !!v || $t('validation.required')]"
              class="mb-2"
            ></v-text-field>
          </v-col>

          <v-col cols="12" sm="6" md="4" lg="3" class="pb-0">
            <v-text-field
              v-model="dialogData.password"
              :label="$t('field.password')"
              type="password"
              variant="outlined"
              density="comfortable"
              :placeholder="dialogMode === 'edit' ? $t('message.passwordUnchanged') : ''"
              :rules="dialogMode === 'edit' ? [] : [(v: any) => !!v || 'Required']"
              class="mb-2"
            ></v-text-field>
          </v-col>

          <v-col cols="12" sm="6" md="4" lg="3" class="pb-0">
            <v-select
              v-model="dialogData.role_id"
              :items="roles"
              item-title="name"
              item-value="id"
              :label="$t('common.role')"
              variant="outlined"
              density="comfortable"
              class="mb-2"
            ></v-select>
          </v-col>

          <v-col cols="12" sm="6" md="4" lg="3" class="pb-0 d-flex align-center">
            <v-switch
              v-model="dialogData.is_admin"
              color="success"
              :label="$t('field.adminPrivilege')"
              class="mb-2 ml-2"
              hide-details
            ></v-switch>
          </v-col>
          
          <v-col cols="12" sm="12" class="pb-0">
            <v-combobox v-model="dialogData.hashtags" :label="$t('field.hashtags')" variant="outlined" multiple chips
              density="comfortable" class="mb-2" :hint="$t('field.hashtagsHint')"
              persistent-hint></v-combobox>
          </v-col>

          <v-col cols="12" sm="6" md="4" lg="3" class="pb-0">
            <v-select
              v-model="dialogData.home_page_base"
              :items="homePageOptions"
              item-title="title"
              item-value="value"
              :label="$t('field.customHomePage')"
              variant="outlined"
              density="comfortable"
              class="mb-2"
              :hint="$t('message.defaultPageHint')"
              persistent-hint
            ></v-select>
          </v-col>

          <v-col cols="12" sm="6" md="4" lg="3" class="pb-0">
            <v-expand-transition>
              <div v-if="dialogData.home_page_base && dialogData.home_page_base.includes(':id')">
                <v-text-field
                  v-model="dialogData.home_page_id"
                  :label="$t('field.homePageParam')"
                  variant="outlined"
                  density="comfortable"
                  :color="color"
                  class="mb-2"
                  :placeholder="$t('placeholder.tenantExample')"
                  :hint="$t('message.paramHint')"
                  persistent-hint
                  required
                ></v-text-field>
              </div>
            </v-expand-transition>
          </v-col>

          <v-col cols="12" md="12" lg="6" class="pb-0">
            <v-autocomplete
              v-model="dialogData.linked_record_ids"
              :items="availableRecords"
              item-title="title"
              item-value="value"
              :label="$t('field.linkedRecords')"
              multiple
              chips
              variant="outlined"
              density="comfortable"
              class="mb-2"
              :hint="$t('message.linkedRecordsHint')"
              persistent-hint
            ></v-autocomplete>
          </v-col>
        </v-row>

        <v-divider class="my-4"></v-divider>
        <div class="text-subtitle-1 font-weight-bold mb-2">{{ $t('field.customLeftMenu') }}</div>
        <div class="text-caption text-grey mb-3">{{ $t('message.menuHint') }}</div>
        <v-row v-for="(menu, i) in dialogData.menu_list" :key="i" class="mb-2 align-center" no-gutters>
          <v-col cols="12" md="3" class="px-1 mb-2 mb-md-0">
            <v-text-field v-model="menu.icon" :label="$t('field.icon')" variant="outlined" density="compact" hide-details></v-text-field>
          </v-col>
          <v-col cols="12" md="4" class="px-1 mb-2 mb-md-0">
            <v-text-field v-model="menu.title" :label="$t('common.title')" variant="outlined" density="compact" hide-details></v-text-field>
          </v-col>
          <v-col cols="11" md="4" class="px-1">
            <v-combobox
              v-model="menu.url"
              :items="pages.map(p => { const rp = p.route_pattern || ''; return rp.startsWith('/') ? rp : '/' + rp; })"
              :label="$t('field.targetUrl')"
              variant="outlined"
              density="compact"
              hide-details
            ></v-combobox>
          </v-col>
          <v-col cols="1" md="1" class="px-1 text-center">
            <v-btn icon="mdi-delete" size="small" color="error" variant="text" @click="dialogData.menu_list.splice(i, 1)"></v-btn>
          </v-col>
        </v-row>
        <v-btn prepend-icon="mdi-plus" size="small" variant="tonal" class="text-none mt-2" @click="dialogData.menu_list.push({icon: 'mdi-file-document-outline', title: '', url: ''})">
          {{ $t('action.addNew', { name: $t('menu.menuItem') }) }}
        </v-btn>
      </template>
    </ItemDialog>
  </v-container>
</template>

<script setup lang="ts">
const { primaryColor: color } = useGlobals();
import { ref, onMounted, computed } from 'vue';
import { useState } from '#app';
import { useI18n } from 'vue-i18n';
import { useJsonExportImport } from '~/composables/useJsonExportImport';

const { t, locale } = useI18n();
const { $toast } = useNuxtApp() as any;

useHead({ title: () => t('page.users') })

const crudTable = ref();
const dialog = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const initialFormData = ref<Record<string, any>>({});
const editId = ref<number | null>(null);

const currentUser = useState<any>('user');
const roles = ref<any[]>([]);
const pages = ref<any[]>([]);
const availableRecords = ref<any[]>([]);

const buildLocaleCandidates = (activeLocale: string): string[] => {
  const normalized = (activeLocale || '').trim();
  if (!normalized) return ['tr', 'en'];

  const short = normalized.split('-')[0]?.split('_')[0] || normalized;
  return Array.from(new Set([normalized, short, 'tr', 'en']));
};

const toDisplayText = (value: any, preferredLocale = locale.value): string => {
  if (typeof value === 'string') {
    const parsed = parseJsonObject(value);
    if (parsed) return toDisplayText(parsed, preferredLocale);
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (!value || typeof value !== 'object') return '';

  const localeCandidates = buildLocaleCandidates(preferredLocale);
  const localizedCandidates = localeCandidates.map((lang) => value[lang]);

  const candidates = [
    ...localizedCandidates,
    value.name,
    value.title,
    ...Object.values(value)
  ];

  const firstText = candidates.find((item) => {
    if (typeof item === 'string') return item.trim().length > 0;
    return typeof item === 'number' || typeof item === 'boolean';
  });

  return firstText == null ? '' : String(firstText).trim();
};

const parseJsonObject = (value: any): Record<string, any> | null => {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, any>;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeLinkedIds = (ids: any): number[] => {
  if (!Array.isArray(ids)) return [];
  return ids
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));
};

const ensureLinkedRecordOptions = (ids: any) => {
  const normalizedIds = normalizeLinkedIds(ids);
  if (!normalizedIds.length) return;

  const existing = new Set(availableRecords.value.map((record: any) => Number(record.value)));
  for (const id of normalizedIds) {
    if (!existing.has(id)) {
      availableRecords.value.push({ value: id, title: `#${id}` });
    }
  }
};

const customPageOptions = computed(() =>
  pages.value
    .filter((p: any) => !['component', 'layout'].includes(p.page_type))
    .map((p: any) => ({
      ...p,
      displayTitle: toDisplayText(p.title) || p.route_pattern || `#${p.id}`
    }))
);

const { jsonExportLoading, jsonImportLoading, jsonInputRef, triggerJSONImport, exportSingleJSON, exportJSON, importJSON } = useJsonExportImport('/api/admin/users', crudTable);

// -----------------------------------

const columns = computed(() => [
  { title: t('common.id'), key: 'id', sortable: true, filterable: true, type: 'number', width: '80px' },
  { title: t('common.username'), key: 'username', sortable: true, filterable: true, type: 'string' },
  { title: t('table.authType'), key: 'is_admin', slot: true },
  { title: t('common.role'), key: 'role_name', slot: true },
  { title: t('table.homePage'), key: 'home_page', sortable: true, filterable: true, type: 'string', slot: true },
  { title: t('field.hashtags'), key: 'hashtags', sortable: false, filterable: true, slot: true },
  { title: t('common.info'), key: 'info', sortable: false, slot: true }
]);

const homePageOptions = computed(() => [
  { title: t('common.default'), value: '' },
  ...customPageOptions.value.map((p: any) => {
    const rp = p.route_pattern || '';
    const cleanRp = rp.startsWith('/') ? rp : '/' + rp;
    return { title: `${p.displayTitle} (${cleanRp})`, value: cleanRp };
  })
]);

const fetchDependencies = async () => {
  try {
    const [rData, pData, lookupData] = await Promise.all([
      $fetch('/api/admin/roles?limit=1000'),
      $fetch('/api/admin/pages?limit=1000'),
      $fetch('/api/admin/users/records-lookup')
    ]);
    roles.value = (rData as any).records || (rData as any).data || [];
    pages.value = (pData as any).records || (pData as any).data || [];
    
    const entData = (lookupData as any).entities || [];
    const recData = (lookupData as any).records || [];
    
    const entMap: Record<number, string> = {};
    const pKeyMap: Record<number, string | undefined> = {};
    
    entData.forEach((e: any) => {
      entMap[e.id] = toDisplayText(e.name, locale.value) || 'Bilinmeyen';

      const schemaObj = parseJsonObject(e.schema);
      if (schemaObj) {
        const pk = Object.keys(schemaObj).find((k) => schemaObj[k]?.isPrimary);
        if (pk) pKeyMap[e.id] = pk;
      }
    });
    
    availableRecords.value = recData.map((r: any) => {
      const entName = entMap[r.entity_id] || 'Bilinmeyen';
      const pk = pKeyMap[r.entity_id];
      const recordData = parseJsonObject(r.data) || {};
      const name =
        toDisplayText(pk ? recordData[pk] : undefined) ||
        toDisplayText(recordData['Adı Soyadı']) ||
        toDisplayText(recordData['Adı']) ||
        toDisplayText(recordData['Kodu']) ||
        toDisplayText(recordData['Fabrika']) ||
        toDisplayText(recordData.name) ||
        toDisplayText(recordData.title) ||
        String(r.id);

      return {
        value: Number(r.id),
        title: `[${entName}] ${name}`
      };
    });
  } catch (err: any) {
    if ($toast) $toast.error(t('message.depsError'));
  }
};

onMounted(() => {
  fetchDependencies();
});

const openCreateDialog = () => {
  dialogMode.value = 'create';
  editId.value = null;
  initialFormData.value = { username: '', password: '', is_admin: false, role_id: null, home_page_base: '', home_page_id: '', menu_list: [], hashtags: [], linked_record_ids: [] };
  dialog.value = true;
};

const openEditDialog = (item: any) => {
  dialogMode.value = 'edit';
  editId.value = item.id;

  let hpBase = item.home_page || '';
  let hpId = '';
  
  if (item.home_page) {
    const matchedTemplate = pages.value.find(p => (p.route_pattern || '').includes(':id') && item.home_page.startsWith('/' + (p.route_pattern || '').replace(/^\//, '').split(':id')[0]));
    if (matchedTemplate) {
       hpBase = '/' + (matchedTemplate.route_pattern || '').replace(/^\//, '');
       const prefix = '/' + (matchedTemplate.route_pattern || '').replace(/^\//, '').split(':id')[0];
       hpId = item.home_page.substring(prefix.length);
    }
  }

  initialFormData.value = { 
    username: item.username, 
    password: '', 
    is_admin: item.is_admin || item.is_admin==1 ? true : false, 
    role_id: item.role_id,
    home_page_base: hpBase,
    home_page_id: hpId,
    menu_list: item.menu_list || [],
    hashtags: typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || []),
    linked_record_ids: normalizeLinkedIds(item.linked_record_ids)
  };

  ensureLinkedRecordOptions(initialFormData.value.linked_record_ids);
  dialog.value = true;
};

const saveItem = async (payload: any) => {
  // no hashtag stripping
  if (!payload.username.trim()) return;

  const finalHomePage = payload.home_page_base?.trim() || null;
  const resolvedHomePage = finalHomePage?.includes(':id') ? finalHomePage.replace(':id', payload.home_page_id?.trim() || '') : finalHomePage;

  try {
    if (dialogMode.value === 'edit') {
      await $fetch(`/api/admin/users/${editId.value}`, {
        method: 'PUT',
        body: {
          username: payload.username.trim(),
          password: payload.password,
          is_admin: payload.is_admin,
          role_id: payload.role_id,
          home_page: resolvedHomePage,
          menu_list: payload.menu_list?.length ? payload.menu_list : null,
          linked_record_ids: payload.linked_record_ids || [],
          hashtags: payload.hashtags
        }
      });
    } else {
      await $fetch('/api/admin/users', {
        method: 'POST',
        body: { 
          username: payload.username.trim(),
          password: payload.password,
          is_admin: payload.is_admin,
          role_id: payload.role_id,
          home_page: resolvedHomePage,
          menu_list: payload.menu_list?.length ? payload.menu_list : null,
          linked_record_ids: payload.linked_record_ids || [],
          hashtags: payload.hashtags
        }
      });
    }
    dialog.value = false;
    if ($toast) $toast.success(dialogMode.value === 'edit' ? t('message.updated') : t('message.added'));
    crudTable.value?.loadItems();
  } catch (e: any) {
        const errPayload = err?.data || e?.data;
    const isArr = Array.isArray(errPayload?.data);
    const errData = isArr ? errPayload.data[0] : (errPayload?.data || {});
    const errMsg = isArr ? errPayload.data[0].message : (errPayload?.message || 'errors.operationFailed');
    if ($toast) $toast.error(t(errMsg, errData));
  }
};

const handleDelete = async (item: any) => {
  if (!confirm(t('confirm.delete', { name: item.username }))) return;
  try {
    await $fetch(`/api/admin/users/${item.id}`, { 
      method: 'DELETE'
    });
    if ($toast) $toast.warning(t('message.deleted'));
    crudTable.value?.loadItems();
  } catch (e: any) {
        const errPayload = err?.data || e?.data;
    const isArr = Array.isArray(errPayload?.data);
    const errData = isArr ? errPayload.data[0] : (errPayload?.data || {});
    const errMsg = isArr ? errPayload.data[0].message : (errPayload?.message || 'errors.operationFailed');
    if ($toast) $toast.error(t(errMsg, errData));
  }
};

</script>
