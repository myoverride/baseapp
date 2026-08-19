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
      api-endpoint="/api/admin/roles"
      :columns="columns"
      :title="$t('page.roles')"
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
      <template v-slot:item.allowed_tags="{ item }">
        <v-chip class="ma-1" size="small" color="blue" v-for="tag in item.allowed_tags" :key="tag">{{ tag }}</v-chip>
        <span v-if="!Array.isArray(item.allowed_tags) || item.allowed_tags.length === 0" class="text-caption text-grey">-</span>
      </template>
      <template v-slot:item.hashtags="{ item }">
        <v-chip class="ma-1" size="small" color="secondary" v-for="tag in (typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || []))" :key="tag">{{ tag }}</v-chip>
        <span v-if="!Array.isArray(typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || [])) || (typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || [])).length === 0" class="text-caption text-grey">-</span>
      </template>
      <template v-slot:item.home_page="{ item }">
        <span v-if="item.home_page" class="text-caption opacity-70">{{ item.home_page }}</span>
        <span v-else class="text-caption text-grey">-</span>
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
              v-model="dialogData.name" 
              :label="$t('common.role')" 
              variant="outlined" 
              density="comfortable" 
              class="mb-2" 
              :rules="[(v: any) => !!v || 'Required']"
            ></v-text-field>
          </v-col>

          <v-col cols="12" sm="6" md="4" lg="3" class="pb-0">
            <v-select
              v-model="dialogData.home_page"
              :items="homePageOptions"
              item-title="title"
              item-value="value"
              :label="$t('field.redirectHomePage')"
              variant="outlined"
              density="comfortable"
              class="mb-2"
            ></v-select>
          </v-col>

          <v-col cols="12" md="12" lg="12" class="pb-0">
            <v-combobox
              v-model="dialogData.allowed_tags"
              :items="availableTags"
              :label="$t('field.permissionTags')"
              variant="outlined"
              multiple
              chips
              density="comfortable"
              class="mb-2"
              :hint="$t('field.permissionTagsHint')"
              persistent-hint
            ></v-combobox>
          </v-col>
          
          <v-col cols="12" md="12" lg="12" class="pb-0">
            <v-combobox
              v-model="dialogData.hashtags"
              :items="availableTags"
              :label="$t('field.hashtags')"
              variant="outlined"
              multiple
              chips
              density="comfortable"
              class="mb-2"
              :hint="$t('field.hashtagsHint')"
              persistent-hint
            ></v-combobox>
          </v-col>
        </v-row>

        <v-divider class="my-4"></v-divider>
        <div class="text-subtitle-1 font-weight-bold mb-2">{{ $t('field.customLeftMenu') }}</div>
        <div class="text-caption text-grey mb-3">{{ $t('message.roleMenuHint') }}</div>
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
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useJsonExportImport } from '~/composables/useJsonExportImport';

const { t } = useI18n();
const { $toast } = useNuxtApp() as any;

useHead({ title: () => t('page.roles') })

const crudTable = ref();
const dialog = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const initialFormData = ref<Record<string, any>>({});
const editId = ref<number | null>(null);

const pages = ref<any[]>([]);
const availableTags = ref<string[]>([]);

const stringifyCustomPageTitle = (title: any): string => {
  if (typeof title === 'string') return title;
  if (!title || typeof title !== 'object') return '';

  const candidates = [
    title.tr,
    title.en,
    ...Object.values(title)
  ];

  const firstText = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  return (firstText as string | undefined)?.trim() || '';
};

const customPageOptions = computed(() =>
  pages.value
    .filter((p: any) => !['component', 'layout'].includes(p.page_type))
    .map((p: any) => ({
      ...p,
      displayTitle: stringifyCustomPageTitle(p.title) || p.route_pattern || `#${p.id}`
    }))
);

const { jsonExportLoading, jsonImportLoading, jsonInputRef, triggerJSONImport, exportSingleJSON, exportJSON, importJSON } = useJsonExportImport('/api/admin/roles', crudTable);
// -----------------------------------

const columns = computed(() => [
  { title: t('common.id'), key: 'id', sortable: true, filterable: true, type: 'number', width: '80px' },
  { title: t('common.role'), key: 'name', sortable: true, filterable: true, type: 'string' },
  { title: t('table.homePage'), key: 'home_page', sortable: true, filterable: true, type: 'string', slot: true },
  { title: t('field.permissionTags'), key: 'allowed_tags', sortable: false, filterable: false, slot: true },
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
    const [pData, tagsData] = await Promise.all([
      $fetch('/api/admin/pages?limit=1000'),
      $fetch('/api/admin/app-studio/tags')
    ]);
    
    pages.value = ((pData as any).records || []);
    availableTags.value = Array.isArray(tagsData) ? tagsData : [];
  
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
  initialFormData.value = { name: '', allowed_tags: [], hashtags: [], home_page: '', menu_list: [] };
  dialog.value = true;
};

const openEditDialog = (item: any) => {
  dialogMode.value = 'edit';
  editId.value = item.id;
  initialFormData.value = { 
    name: item.name, 
    allowed_tags: item.allowed_tags || [],
    hashtags: typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || []),
    home_page: item.home_page || '',
    menu_list: item.menu_list || []
  };
  dialog.value = true;
};

const saveItem = async (payload: any) => {
  // no hashtag stripping
  if (!payload.name.trim()) return;

  try {
    if (dialogMode.value === 'edit') {
      await $fetch(`/api/admin/roles/${editId.value}`, {
        method: 'PUT',
        body: {
          name: payload.name.trim(),
          allowed_tags: payload.allowed_tags,
          hashtags: payload.hashtags,
          home_page: payload.home_page?.trim() || null,
          menu_list: payload.menu_list || []
        }
      });
    } else {
      await $fetch('/api/admin/roles', {
        method: 'POST',
        body: { 
          name: payload.name.trim(),
          allowed_tags: payload.allowed_tags,
          hashtags: payload.hashtags,
          home_page: payload.home_page?.trim() || null,
          menu_list: payload.menu_list || []
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
    await $fetch(`/api/admin/roles/${item.id}`, { 
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
