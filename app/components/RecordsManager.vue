<template>
  <v-container>
    <div class="mb-4">
      <v-btn prepend-icon="mdi-arrow-left" variant="text" @click="$router.back()" class="text-none font-weight-medium px-0 text-body-1" color="primary">
        {{ backLabel }}
      </v-btn>
    </div>
    
    <CrudTable
      v-if="entity && columns.length > 0"
      ref="crudTable"
      :enable-multi-select="enableMultiSelect"
      :hide-create="!canCreate"
      :hide-edit="!canEdit"
      :hide-delete="!canDelete"
      :hide-search="!canSearch"
      :hide-filter="!canFilter"
      :hide-refresh="!canRefresh"
      :api-endpoint="activeApiEndpoint"
      :columns="columns"
      :title="entity.name ? $localize(typeof entity.name === 'string' ? entity.name : JSON.stringify(entity.name)) : (slug.charAt(0).toUpperCase() + slug.slice(1))"
      default-sort-key="created_at"
      default-sort-order="desc"
      @create="openCreateDialog"
      @edit="openEditDialog"
      @delete="handleDelete"
      @loaded="onTableLoaded"
    >
      <template #toolbarActions>
        <v-btn v-if="canExport" icon="mdi-download" variant="text" :loading="csvExportLoading" @click="exportCSV" class="mr-2" :title="$t('action.exportFormat', { format: 'CSV' })"></v-btn>
        <v-btn v-if="canImport" icon="mdi-upload" variant="text" :loading="csvImportLoading" @click="triggerCSVImport" class="mr-2" :title="$t('action.importFormat', { format: 'CSV' })"></v-btn>
        <input type="file" ref="csvInputRef" accept=".csv" style="display: none" @change="importCSV">
        <slot name="extraToolbarActions"></slot>
      </template>
      <template v-slot:item.id="{ item }">
        <span class="font-weight-medium">{{ item.id }}</span>
        <v-btn 
          v-if="enableCopyId"
          icon="mdi-content-copy" 
          size="x-small" 
          variant="text" 
          :color="color" 
          @click="copy(String(item.id), $t('message.idCopied'))"
          :title="$t('action.copyForTelemetry')"
        ></v-btn>
      </template>
      
      <!-- Detay / Info Sütunu -->
      <template v-if="enableRowInfo" v-slot:item.info="{ item }">
        <v-tooltip location="top" max-width="400">
          <template v-slot:activator="{ props }">
            <v-btn icon="mdi-information" v-bind="props" color="info" variant="text" size="small"></v-btn>
          </template>
          <div class="text-caption">
            <div class="font-weight-bold mb-1 border-b pb-1">{{ $t('table.additionalInfo') }}</div>
            <div v-for="[key, config] in hiddenFields" :key="key" class="mb-1">
              <span class="font-weight-medium text-medium-emphasis">{{ $localize((config as any).label) || key }}:</span> {{ formatHiddenValue(item, key, config) }}
            </div>
            <v-divider class="my-2 border-opacity-50"></v-divider>
            <div class="mb-1"><span class="font-weight-medium text-medium-emphasis">{{ $t('table.createdAt') }}:</span> {{ formatAppDate(item.created_at as any) }}</div>
            <div><span class="font-weight-medium text-medium-emphasis">{{ $t('table.updatedAt') }}:</span> {{ formatAppDate(item.updated_at as any) }}</div>
          </div>
        </v-tooltip>
      </template>

      <!-- Dynamic Custom Slot for Relation Columns -->
      <template v-slot:[`item.${colName}`]="{ item }" v-for="colName in relationColumnNames" :key="colName">
        {{ getRelationDisplayValue(colName, item[colName], item) }}
      </template>

      <!-- Hashtags Slot -->
      <template v-slot:item.hashtags="{ item }">
        <div class="d-flex flex-wrap gap-1">
          <v-chip
            v-for="tag in (typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || []))"
            :key="tag"
            size="x-small"
            :color="color"
            variant="tonal"
          >
            #{{ tag }}
          </v-chip>
        </div>
      </template>

      <!-- Row Actions -->
      <template v-slot:rowActions="{ item }">
        <v-btn v-if="canExportSingle" icon="mdi-download-circle-outline" size="small" color="blue" variant="text" @click="exportSingleJSON(item)" :title="$t('action.exportFormat', { format: '(Single)' })" />
        <slot name="extraRowActions" :item="item"></slot>
      </template>
    </CrudTable>

    <ItemDialog
      v-model="dialog"
      :mode="dialogMode"
      :initial-data="formData"
      max-width="600"
      @save="saveItem"
    >
      <template #default="{ formData: dialogData }">
<template v-for="[fieldName, fieldConfig] in sortedSchemaEntries" :key="fieldName">
          
  <v-text-field
    v-if="['string', 'number', 'uuid'].includes(fieldConfig.type)"
    v-model="dialogData[fieldName]"
    :label="($localize(fieldConfig.label) || fieldName) + (fieldConfig.rules?.required ? ' *' : '')"
    :type="fieldConfig.type === 'number' ? 'number' : 'text'"
    :step="fieldConfig.type === 'number' ? 'any' : undefined"
    variant="outlined"
    density="comfortable"
    class="mb-3"
    clearable
    :rules="buildRules(String(fieldName), fieldConfig)"
  ></v-text-field>

  <v-text-field
    v-else-if="fieldConfig.type === 'password'"
    v-model="dialogData[fieldName]"
    :label="($localize(fieldConfig.label) || fieldName) + (fieldConfig.rules?.required ? ' *' : '')"
    type="password"
    variant="outlined"
    density="comfortable"
    class="mb-3"
    clearable
    :rules="buildRules(String(fieldName), fieldConfig)"
  ></v-text-field>

  <v-switch
    v-else-if="fieldConfig.type === 'boolean'"
    v-model="dialogData[fieldName]"
    :label="($localize(fieldConfig.label) || String(fieldName)) + (fieldConfig.rules?.required ? ' *' : '')"
    :color="color"
    class="mb-3"
    :rules="buildRules(String(fieldName), fieldConfig)"
  ></v-switch>

  <v-text-field
    v-else-if="['date', 'datetime', 'time'].includes(fieldConfig.type)"
    v-model="dialogData[fieldName]"
    :label="($localize(fieldConfig.label) || fieldName) + (fieldConfig.rules?.required ? ' *' : '')"
    :type="fieldConfig.type === 'date' ? 'date' : fieldConfig.type === 'time' ? 'time' : 'datetime-local'"
    variant="outlined"
    density="comfortable"
    class="mb-3"
    clearable
    :rules="buildRules(String(fieldName), fieldConfig)"
  ></v-text-field>

  <v-autocomplete
    v-else-if="fieldConfig.type === 'relation'"
    v-model="dialogData[fieldName]"
    :items="relationOptions[fieldName] || []"
    item-title="label"
    item-value="id"
    :label="($localize(fieldConfig.label) || fieldName) + (fieldConfig.rules?.required ? ' *' : '')"
    variant="outlined"
    density="comfortable"
    class="mb-3"
    clearable
    :loading="relationLoadings[fieldName]"
    @update:search="(val) => onRelationSearch(fieldName, fieldConfig, val)"
    :rules="buildRules(String(fieldName), fieldConfig)"
  ></v-autocomplete>

  <v-select
    v-else-if="fieldConfig.type === 'enum'"
    v-model="dialogData[fieldName]"
    :items="fieldConfig.options ? fieldConfig.options.map((o: any) => ({ value: o, title: $localize(o) })) : []"
    item-title="title"
    item-value="value"
    :label="($localize(fieldConfig.label) || fieldName) + (fieldConfig.rules?.required ? ' *' : '')"
    variant="outlined"
    density="comfortable"
    class="mb-3"
    clearable
    :rules="buildRules(String(fieldName), fieldConfig)"
  ></v-select>

  <v-textarea
    v-else
    v-model="dialogData[fieldName]"
    :label="($localize(fieldConfig.label) || fieldName) + (fieldConfig.type === 'json' ? (' - ' + t('rule.validJson')) : '') + (fieldConfig.rules?.required ? ' *' : '')"
    variant="outlined"
    density="comfortable"
    class="mb-3"
    rows="3"
    auto-grow
    :rules="buildRules(String(fieldName), fieldConfig)"
  ></v-textarea>
  
</template>

<v-combobox
  v-model="dialogData.hashtags"
  :label="$t('field.hashtags')"
  multiple
  chips
  closable-chips
  variant="outlined"
  density="comfortable"
  class="mb-3"
></v-combobox>
      </template>
    </ItemDialog>

    <!-- Yardım (Help) Dialogu -->

  </v-container>
</template>

<script setup lang="ts">
const { primaryColor: color } = useGlobals();
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import CrudTable from '~/components/CrudTable.vue';
import ItemDialog from '~/components/ItemDialog.vue';
import { useNuxtApp, useFetch } from '#app';


const props = withDefaults(defineProps<{
  slug: string;
  apiEndpoint?: string;
  enableCreate?: boolean;
  enableEdit?: boolean;
  enableDelete?: boolean;
  enableExport?: boolean;
  enableImport?: boolean;
  enableSearch?: boolean;
  enableFilter?: boolean;
  enableRefresh?: boolean;
  enableMultiSelect?: boolean;
  enableCopyId?: boolean;
  enableExportSingle?: boolean;
  enableRowInfo?: boolean;
  backLabel?: string;
}>(), {
  enableCreate: true,
  enableEdit: true,
  enableDelete: true,
  enableExport: true,
  enableImport: true,
  enableSearch: true,
  enableFilter: true,
  enableRefresh: true,
  enableMultiSelect: true,
  enableCopyId: true,
  enableExportSingle: true,
  enableRowInfo: true
});

const { t } = useI18n();
const { $localize, $toast } = useNuxtApp() as any;
const route = useRoute();
const router = useRouter();

const user = useState<any>('user');

const hasPermission = (actionTag: string) => {
  if (user.value?.is_admin || user.value?.is_super_admin) return true;
  const tags = user.value?.allowed_tags || [];
  return tags.includes(props.slug) || tags.includes(props.slug + actionTag);
};

const canCreate = computed(() => props.enableCreate && hasPermission('post'));
const canEdit = computed(() => props.enableEdit && hasPermission('put'));
const canDelete = computed(() => props.enableDelete && hasPermission('delete'));
// For search, filter, refresh, export, view etc, 'get' permission is generally required
const canSearch = computed(() => props.enableSearch && hasPermission('get'));
const canFilter = computed(() => props.enableFilter && hasPermission('get'));
const canRefresh = computed(() => props.enableRefresh && hasPermission('get'));
const canExport = computed(() => props.enableExport && hasPermission('get'));
const canExportSingle = computed(() => props.enableExportSingle && hasPermission('get'));
// Import creates new records, so 'post' permission is needed
const canImport = computed(() => props.enableImport && hasPermission('post'));

const slug = computed(() => props.slug);

const backLabel = computed(() => {
  return t('action.goBack');
});

const activeApiEndpoint = computed(() => props.apiEndpoint || `/api/admin/records/${slug.value}`);

// Sayfa ilk yüklendiğinde schema bilgisi için küçük bir fetch yapıyoruz
const { data: initialData } = await useFetch(activeApiEndpoint.value, { params: { limit: 1 }, server: false });

const entity = computed(() => (initialData.value as any)?.entity || null);

useHead({ title: () => {
  const eName = entity.value?.name;
  const locName = eName ? $localize(typeof eName === 'string' ? eName : JSON.stringify(eName)) : (slug.value.charAt(0).toUpperCase() + slug.value.slice(1));
  return `${locName} ${t('menu.records') || 'Records'}`;
} })

const sortedSchemaEntries = computed(() => {
  if (!entity.value || !entity.value.schema) return [];
  return Object.entries((entity.value.schema || {}) as Record<string, any>)
    .sort((a, b) => {
      const oA = a[1]._order !== undefined ? a[1]._order : 999;
      const oB = b[1]._order !== undefined ? b[1]._order : 999;
      return oA - oB;
    });
});

const columns = computed(() => {
  if (!entity.value || !entity.value.schema) return [];
  const cols = [];
  
  cols.push({ title: 'ID', key: 'id', sortable: true, filterable: true, type: 'number', width: '120px', slot: true });
  
  for (const [key, config] of sortedSchemaEntries.value) {
    if ((config as any).showInTable !== false) {
      cols.push({ 
        title: $localize((config as any).label) || key, 
        key: key, 
        sortable: true,
        filterable: true,
        type: (config as any).type,
        slot: (config as any).type === 'relation'
      });
    }
  }
  
  cols.push({ title: t('field.hashtags') || 'Hashtags', key: 'hashtags', sortable: false, filterable: true, type: 'string', slot: true });
  if (props.enableRowInfo) {
    cols.push({ title: t('common.info'), key: 'info', sortable: false, filterable: false, slot: true, width: '60px', align: 'center' as const });
  }
  
  return cols;
});

const hiddenFields = computed(() => {
  if (!entity.value || !entity.value.schema) return [];
  return sortedSchemaEntries.value.filter(([, config]: any) => config.showInTable === false);
});

const formatHiddenValue = (item: any, key: string, config: any) => {
  const val = item[key];
  if (val === undefined || val === null || val === '') return '-';
  if (config.type === 'relation') return getRelationDisplayValue(key, val, item);
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

const crudTable = ref();
const dialog = ref(false);
const dialogMode = ref<'create'|'edit'>('create');
const formData = ref<Record<string, any>>({});
const editId = ref<number | null>(null);
const copy = (txt: string, message = t('message.copied')) => {
  navigator.clipboard.writeText(txt);
  if ($toast) $toast.info(message);
};

// Relation options data
const relationOptions = ref<Record<string, { id: number, label: string }[]>>({});
const relationLoadings = ref<Record<string, boolean>>({});
const relationSearchTimeouts: Record<string, any> = {};

// --- CSV Export & Import Logic ---
const csvExportLoading = ref(false)
const csvImportLoading = ref(false)
const csvInputRef = ref<HTMLInputElement | null>(null)

const triggerCSVImport = () => {
    csvInputRef.value?.click()
}

const exportCSV = async () => {
    csvExportLoading.value = true
    try {
        const queryParams = crudTable.value?.getCurrentQuery() || {}

        const response = await $fetch<any>(activeApiEndpoint.value, {
            params: {
                page: 1,
                limit: 100000,
                ...queryParams
            }
        })

        const data = Array.isArray(response) ? response : (response.records || response.data || [])
        if (data.length === 0) {
            if ($toast) $toast.warning(t('common.noData'))
            return
        }

        const exportCols = columns.value.filter(c => c.key !== 'actions' && !c.key.startsWith('_'))
        const headers = exportCols.map(c => c.key)
        
        let csvContent = headers.join(',') + '\n'
        
        for (const row of data) {
            const rowData = headers.map((header: any) => {
                let valStr = '';
                if (relationColumnNames.value.includes(header)) {
                    valStr = String(getRelationDisplayValue(header, row[header], row) || '');
                } else {
                    valStr = String(row[header] || '');
                }

                if (valStr.includes(',') || valStr.includes('"') || valStr.includes('\n')) {
                  return '"' + valStr.replace(/"/g, '""') + '"';
                }
                return valStr;
            })
            csvContent += rowData.join(',') + '\n'
        }

        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${$localize(entity.value?.name) || 'export'}_${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

    } catch (e) {
        if ($toast) $toast.error(t('message.exportError'));
    }
}

function parseCSVLine(text: string) {
    const result = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < text.length; i++) {
        const char = text[i]
        if (char === '"') {
            if (inQuote && text[i+1] === '"') {
                cur += '"'
                i++
            } else {
                inQuote = !inQuote
            }
        } else if (char === ',' && !inQuote) {
            result.push(cur)
            cur = ''
        } else {
            cur += char
        }
    }
    result.push(cur)
    return result
}

const importCSV = async (event: Event) => {
    const input = event.target as HTMLInputElement
    if (!input.files || input.files.length === 0) {
        if ($toast) $toast.warning(t('message.selectFile'));
        return;
    }
    
    const file = input.files[0] as File
    csvImportLoading.value = true
    
    const reader = new FileReader()
    reader.onload = async (e) => {
        try {
            const text = e.target?.result as string
            const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
            if (lines.length < 2) throw new Error(t('message.invalidCsvFormat'))
            
            const headers = parseCSVLine(lines[0] || '').map(h => h.trim())
            const recordsToImport = []

            for (let i = 1; i < lines.length; i++) {
                const values = parseCSVLine(lines[i] || '')
                const record: any = {}
                headers.forEach((header, index) => {
                    let val: any = values[index] !== undefined ? values[index].trim() : ''
                    if (val !== '') {
                        if ((val.startsWith('[') && val.endsWith(']')) || (val.startsWith('{') && val.endsWith('}'))) {
                            try { val = JSON.parse(val) } catch(err) {}
                        }

                        // İlişkisel alan ise ada göre ID bulma (Importing Relation Names)
                        if (relationColumnNames.value.includes(header)) {
                            const options = relationOptions.value[header] || [];
                            // Önce doğrudan ID eşleşmesine bak
                            let match = options.find(opt => String(opt.id) === String(val));
                            if (!match) {
                                // Bulunamazsa Görünen Ada (Label) göre (case-insensitive) ara
                                match = options.find(opt => String(opt.label).toLowerCase() === String(val).toLowerCase());
                            }
                            if (match) {
                                val = match.id;
                            } else {
                                // 'ID: 15' gibi export edilmiş formattan raw ID'yi çıkarmayı dene
                                const idMatch = String(val).match(/^ID:\s*(\d+)$/);
                                if (idMatch) {
                                    val = Number(idMatch[1]);
                                }
                            }
                        }

                        record[header] = val
                    }
                })
                recordsToImport.push(record)
            }

            const res = await $fetch<any>(`${activeApiEndpoint.value}`, {
                method: 'POST',
                body: { records: recordsToImport }
            })
            
            if ($toast) $toast.success(res.message || t('message.success'))
            crudTable.value?.loadItems()
        } catch (err: any) {
            if ($toast) $toast.error(t(err.data?.message || 'message.importError'));
        } finally {
            csvImportLoading.value = false;
            if (input) input.value = '';
        }
    }
    reader.readAsText(file)
}

const loadRelations = async () => {
  if (!entity.value || !entity.value.schema) return;
  for (const [fieldName, config] of Object.entries(entity.value.schema)) {
    const fieldConfig = config as any;
    if (fieldConfig.type === 'relation' && fieldConfig.targetEntityId) {
      try {
        const targetSlug = fieldConfig.targetEntitySlug;
        const targetSchema = fieldConfig.targetEntitySchema || {};

        if (targetSlug) {
          const isSystemApi = !props.apiEndpoint;
          const relationApiUrl = isSystemApi 
            ? `/api/admin/records/${targetSlug}?limit=20` 
            : `/api/custom/${targetSlug}?limit=20`;

          const recordsRes = await $fetch<any>(relationApiUrl);
          const records = recordsRes.data || recordsRes.records || [];
          
          relationOptions.value[fieldName] = records.map((r: any) => ({
            id: r.id,
            label: r._record_title || t('common.recordWithId', { id: r.id })
          }));
        }
      } catch (e) {
        
      }
    }
  }
};

const onRelationSearch = (fieldName: string, fieldConfig: any, searchQuery: string) => {
  if (!searchQuery) return;
  
  if (relationSearchTimeouts[fieldName]) {
    clearTimeout(relationSearchTimeouts[fieldName]);
  }

  relationSearchTimeouts[fieldName] = setTimeout(async () => {
    try {
      relationLoadings.value[fieldName] = true;
      const targetSlug = fieldConfig.targetEntitySlug;
      const targetSchema = fieldConfig.targetEntitySchema || {};
      
      if (targetSlug) {
        const isSystemApi = !props.apiEndpoint;
        const baseApiUrl = isSystemApi ? `/api/admin/records/${targetSlug}` : `/api/custom/${targetSlug}`;
        
        const recordsRes = await $fetch<any>(`${baseApiUrl}?search=${encodeURIComponent(searchQuery)}&limit=20`);
        const records = recordsRes.data || recordsRes.records || [];
        
        const schemaEntries = Object.entries(targetSchema).sort((a: any, b: any) => {
          const oA = a[1]._order !== undefined ? a[1]._order : 999;
          const oB = b[1]._order !== undefined ? b[1]._order : 999;
          return oA - oB;
        });
        
        let firstKey: string | null = schemaEntries.find(([, config]: any) => config.isPrimary)?.[0] || null;
        if (!firstKey) {
          firstKey = schemaEntries[0] ? schemaEntries[0][0] : null;
          if (firstKey && targetSchema[firstKey] && targetSchema[firstKey]._order === undefined) {
             const smartKey = schemaEntries.find(([k]) => ['envanter kodu', 'ad', 'name', 'title', 'label', 'ad soyad', 'isim', 'makine modeli'].includes(k.toLowerCase()))?.[0];
             if (smartKey) firstKey = smartKey;
          }
        }

        const newOptions = records.map((r: any) => ({
          id: r.id,
          label: firstKey && r[firstKey] !== undefined && r[firstKey] !== null ? String(r[firstKey]) : t('common.recordWithId', { id: r.id })
        }));
        
        const currentOptions = relationOptions.value[fieldName] || [];
        const mergedOptions = [...currentOptions];
        
        for (const opt of newOptions) {
          if (!mergedOptions.find(o => o.id === opt.id)) {
            mergedOptions.push(opt);
          }
        }
        
        relationOptions.value[fieldName] = mergedOptions;
      }
    } catch (e) {
      
    } finally {
      relationLoadings.value[fieldName] = false;
    }
  }, 500);
};

const onTableLoaded = async (items: any[]) => {
  if (!entity.value || !entity.value.schema) return;
  
  for (const [fieldName, config] of Object.entries(entity.value.schema)) {
    const fieldConfig = config as any;
    if (fieldConfig.type === 'relation' && fieldConfig.targetEntityId) {
      const targetSlug = fieldConfig.targetEntitySlug;
      const targetSchema = fieldConfig.targetEntitySchema || {};
      if (!targetSlug) continue;
      
      const missingIds = items
        .map(i => i[fieldName])
        .filter(id => id !== null && id !== undefined && id !== '')
        .filter(id => {
          const opts = relationOptions.value[fieldName] || [];
          return !opts.find(o => o.id === id || String(o.id) === String(id));
        });
        
      const uniqueMissing = [...new Set(missingIds)];
      if (uniqueMissing.length === 0) continue;
      
      try {
        const isSystemApi = !props.apiEndpoint;
        const baseApiUrl = isSystemApi ? `/api/admin/records/${targetSlug}` : `/api/custom/${targetSlug}`;
        
        const advancedFilters = {
          logic: 'AND',
          conditions: [
            { field: 'id', operator: 'in', value: uniqueMissing }
          ]
        };
        const query = `advancedFilters=${encodeURIComponent(JSON.stringify(advancedFilters))}`;
        const recordsRes = await $fetch<any>(`${baseApiUrl}?${query}&limit=${uniqueMissing.length}`);
        const records = recordsRes.data || recordsRes.records || [];
        
        const schemaEntries = Object.entries(targetSchema).sort((a: any, b: any) => {
          const oA = a[1]._order !== undefined ? a[1]._order : 999;
          const oB = b[1]._order !== undefined ? b[1]._order : 999;
          return oA - oB;
        });
        
        let firstKey: string | null = schemaEntries.find(([, config]: any) => config.isPrimary)?.[0] || null;
        if (!firstKey) {
          firstKey = schemaEntries[0] ? schemaEntries[0][0] : null;
          if (firstKey && targetSchema[firstKey] && targetSchema[firstKey]._order === undefined) {
             const smartKey = schemaEntries.find(([k]) => ['envanter kodu', 'ad', 'name', 'title', 'label', 'ad soyad', 'isim', 'makine modeli'].includes(k.toLowerCase()))?.[0];
             if (smartKey) firstKey = smartKey;
          }
        }

        const newOptions = records.map((r: any) => ({
          id: r.id,
          label: firstKey && r[firstKey] !== undefined && r[firstKey] !== null ? String(r[firstKey]) : t('common.recordWithId', { id: r.id })
        }));
        
        const currentOptions = relationOptions.value[fieldName] || [];
        const mergedOptions = [...currentOptions];
        
        for (const opt of newOptions) {
          if (!mergedOptions.find(o => o.id === opt.id)) {
            mergedOptions.push(opt);
          }
        }
        
        relationOptions.value[fieldName] = mergedOptions;
      } catch (e) {
        
      }
    }
  }
};

watch(entity, (newEntity) => {
  if (newEntity) {
    loadRelations();
  }
}, { immediate: true });

const relationColumnNames = computed(() => {
  if (!entity.value || !entity.value.schema) return [];
  return sortedSchemaEntries.value
    .filter(([_, config]) => (config as any).type === 'relation')
    .map(([key]) => key);
});

const getRelationDisplayValue = (fieldName: string, value: any, item?: any) => {
  if (!value) return '';
  if (item && item._displayValues && item._displayValues[fieldName]) {
    return item._displayValues[fieldName];
  }
  const options = relationOptions.value[fieldName] || [];
  const match = options.find(opt => opt.id === value || String(opt.id) === String(value));
  return match ? match.label : `ID: ${value}`;
};

// Özel tarih ifadelerini gerçek tarihe çeviren motor
const parseDynamicDate = (expr: string): Date | null => {
  if (!expr) return null;

  // Örn: today() - 2d, today()+1w vb. formatları yakala
  const match = expr.replace(/\s+/g, '').match(/^today\(\)([+-])(\d+)([dwmy])$/i) as any;
  
  if (match) {
    const date = new Date();
    const operator = match[1]; // '+' veya '-'
    const amount = parseInt(match[2]); // sayısal değer
    const unit = match[3].toLowerCase(); // d (gün), w (hafta), m (ay), y (yıl)
    
    let days = 0;
    if (unit === 'd') days = amount;
    else if (unit === 'w') days = amount * 7;
    else if (unit === 'm') days = amount * 30;
    else if (unit === 'y') days = amount * 365;
    
    if (operator === '-') {
      date.setDate(date.getDate() - days);
    } else {
      date.setDate(date.getDate() + days);
    }
    // Sadece gün-ay-yıl karşılaştırması yapmak için saati sıfırlıyoruz
    date.setHours(0, 0, 0, 0); 
    return date;
  }

  // Eğer today() ifadesi yoksa standart tarih olarak parse etmeyi dene (Örn: 2024-12-31)
  const parsedDate = new Date(expr);
  return isNaN(parsedDate.getTime()) ? null : parsedDate;
};
// Özel Kuralları Oluştur
const buildRules = (fieldName: string, fieldConfig: any) => {
  const vuetifyRules: any[] = [];

  // 1. ZORUNLULUK KONTROLÜ (Required)
  if (fieldConfig.rules?.required) {
    vuetifyRules.push((v: any) => {
      // Boolean (Switch) için required ise mecburen 'true' olmalı
      if (fieldConfig.type === 'boolean' && v !== true) return `${fieldName} ${t('validation.mustBeApproved')}`;
      
      if (v === null || v === undefined || v === '') return `${fieldName} ${t('validation.required')}`;
      if (Array.isArray(v) && v.length === 0) return `${fieldName} ${t('validation.minOneElement')}`;
      return true;
    });
  }

  // 2. KULLANICI TARAFINDAN EKLENEN ÖZEL KURALLAR (Buradaki rulesList'i rules.custom yaptık!)
  if (fieldConfig.rules?.custom && Array.isArray(fieldConfig.rules.custom)) {
    fieldConfig.rules.custom.forEach((rule: any) => {
      
      vuetifyRules.push((v: any) => {
        if (v === null || v === undefined || v === '') return true;

        const val = rule.value;
        const msg = $localize(rule.message);

        try {
          switch (rule.type) {
            case 'minLength': return String(v).length >= Number(val) || msg || t('validation.minLength').replace('{0}', String(val));
            case 'maxLength': return String(v).length <= Number(val) || msg || t('validation.maxLength').replace('{0}', String(val));
            case 'exactLength': return String(v).length === Number(val) || msg || t('validation.exactLength').replace('{0}', String(val));
            case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)) || msg || t('validation.invalidEmail');
            case 'url': return /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(String(v)) || msg || t('validation.invalidUrl');
            case 'alphanumeric': return /^[a-zA-Z0-9ğüşıöçĞÜŞİÖÇ ]+$/.test(String(v)) || msg || t('validation.alphanumeric');
            case 'regex': return new RegExp(val).test(String(v)) || msg || t('validation.regexMismatch');

            case 'min': return Number(v) >= Number(val) || msg || t('validation.minVal').replace('{0}', String(val));
            case 'max': return Number(v) <= Number(val) || msg || t('validation.maxVal').replace('{0}', String(val));
            case 'isInteger': return Number.isInteger(Number(v)) || msg || t('validation.integerOnly');
            case 'step': return (Number(v) % Number(val)) === 0 || msg || t('validation.stepMismatch').replace('{0}', String(val));

            case 'isTrue': return (v === true || v === 'true') || msg || t('validation.required');

            case 'minDate': {
              const minD = parseDynamicDate(val);
              const currentD = new Date(v);
              currentD.setHours(0,0,0,0);
              return (minD && currentD >= minD) || msg || t('validation.minDate').replace('{0}', String(val));
            }
            case 'maxDate': {
              const maxD = parseDynamicDate(val);
              const currentD = new Date(v);
              currentD.setHours(0,0,0,0);
              return (maxD && currentD <= maxD) || msg || t('validation.maxDate').replace('{0}', String(val));
            }
            case 'pastOnly': {
              const today = new Date();
              today.setHours(0,0,0,0);
              const currentD = new Date(v);
              return currentD < today || msg || t('validation.pastDate');
            }
            case 'futureOnly': {
              const today = new Date();
              today.setHours(0,0,0,0);
              const currentD = new Date(v);
              return currentD > today || msg || t('validation.futureDate');
            }
            case 'disableWeekends': {
              const day = new Date(v).getDay();
              return (day !== 0 && day !== 6) || msg || t('validation.noWeekend');
            }

            case 'minTime': return String(v) >= String(val) || msg || t('validation.minTime').replace('{0}', String(val));
            case 'maxTime': return String(v) <= String(val) || msg || t('validation.maxTime').replace('{0}', String(val));

            case 'validJson': {
              if (typeof v === 'object') return true;
              try { JSON.parse(v); return true; } 
              catch { return msg || t('validation.invalidJson'); }
            }
            case 'requiredKeys': {
              const keys = val.split(',').map((k: string) => k.trim());
              let obj = typeof v === 'string' ? JSON.parse(v) : v;
              const missing = keys.filter((k: string) => !(k in obj));
              return missing.length === 0 || msg || `Eksik anahtarlar var: ${missing.join(', ')}`;
            }
            default: return true;
          }
        } catch (error) {
           return t('error.ruleProcess');
        }
      });
    });
  }

  return vuetifyRules;
};

const openCreateDialog = () => {
  dialogMode.value = 'create';
  editId.value = null;
  formData.value = {};
  
  if (entity.value && entity.value.schema) {
    for (const [key, config] of sortedSchemaEntries.value) {
      const type = (config as any).type;
      if (type === 'boolean') formData.value[key] = false;
      else if (type === 'number') formData.value[key] = null;
      else if (type === 'relation') formData.value[key] = null;
      else formData.value[key] = '';
    }
  }
  dialog.value = true;
};

const openEditDialog = (item: any) => {
  dialogMode.value = 'edit';
  editId.value = item.id;
  formData.value = { ...item };
  dialog.value = true;
};

const saveItem = async (rawPayload: Record<string, any>) => {
  const payload = { ...rawPayload };
  const hashtags = payload.hashtags || [];
  delete payload.hashtags;

  // Normalize
  for (const [key, config] of sortedSchemaEntries.value) {
    const type = (config as any).type;
    if (type === 'number' && payload[key] !== null && payload[key] !== '') payload[key] = Number(payload[key]);
    if (type === 'relation') {
      if (payload[key] === '' || payload[key] === undefined || payload[key] === null) {
        payload[key] = null;
      } else {
        payload[key] = Number(payload[key]);
      }
    }
    if (['array', 'json'].includes(type) && typeof payload[key] === 'string' && payload[key] !== '') {
      try { payload[key] = JSON.parse(payload[key]); } catch (e) {}
    }
  }

  try {
    if (dialogMode.value === 'edit') {
      await $fetch(`${activeApiEndpoint.value}/${editId.value}`, { method: 'PUT', body: { data: payload, hashtags } });
    } else {
      await $fetch(`${activeApiEndpoint.value}`, { method: 'POST', body: { data: payload, hashtags } });
    }
    dialog.value = false;
    if ($toast) $toast.success(dialogMode.value === 'edit' ? t('message.updated') : t('message.created'));
    crudTable.value?.loadItems(); // Tabloyu yenile
  } catch (e: any) {
    if ($toast) {
      const msg = e.data?.message || e.statusMessage || e.message || 'error.operationFailed';
      if (msg && msg.startsWith('error.uniqueConstraint|')) {
        const fieldSlug = msg.split('|')[1]?.trim();
        let label = fieldSlug;
        if (entity.value?.schema && entity.value.schema[fieldSlug]) {
          const schemaDef = entity.value.schema[fieldSlug] as any;
          if (schemaDef.label) {
            label = typeof $localize === 'function' ? $localize(schemaDef.label) : schemaDef.label;
          }
        }
        let translatedMsg = t('error.uniqueConstraint', { field: label });
        
        // Eğer kullanıcı kendi çevirisinde {field} yazmadıysa, hangi alanın hata verdiğini bilsin diye başa ekle.
        if (translatedMsg === 'error.uniqueConstraint') {
          translatedMsg = t('error.uniqueConstraintValueInUse', { field: label });
        } else if (translatedMsg.match(/\{\s*field\s*\}/)) {
           translatedMsg = translatedMsg.replace(/\{\s*field\s*\}/g, label);
        } else if (!translatedMsg.includes(label)) {
           // Mesajda alan adı geçmiyorsa otomatik başa ekle (Örn: "field1: Var bu")
           translatedMsg = `${label}: ${translatedMsg}`;
        }
        
        $toast.error(translatedMsg);
      } else {
        let translatedMsg = msg;
        if (typeof msg === 'string') {
          const parts = msg.split('|');
          if (parts.length > 1) {
            translatedMsg = t(parts[0] || '', parts.slice(1));
          } else {
            const localized = typeof $localize === 'function' ? $localize(msg) : msg;
            translatedMsg = localized !== msg ? localized : t(msg);
          }
        }
        $toast.error(translatedMsg || msg);
      }
    }
  }
};

const handleDelete = async (item: any) => {
  if (!confirm(t('confirm.delete'))) return;
  try {
    await $fetch(`${activeApiEndpoint.value}/${item.id}`, { method: 'DELETE' });
    if ($toast) $toast.warning(t('message.entityDeleted', { name: t('entity.record') }));
    crudTable.value?.loadItems();
  } catch (e: any) {
    const msg = e.data?.message || e.statusMessage || 'Silinemedi';
    let translatedMsg = msg;
    if (typeof msg === 'string') {
      const parts = msg.split('|');
      if (parts.length > 1) {
        translatedMsg = t(parts[0] || '', parts.slice(1));
      } else {
        const localized = typeof $localize === 'function' ? $localize(msg) : msg;
        translatedMsg = localized !== msg ? localized : t(msg);
      }
    }
    if ($toast) $toast.error(translatedMsg || msg);
  }
};

const exportSingleJSON = (item: any) => {
  const exportData = [{ ...item }];
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `record_${slug.value}_${item.id}_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
</script>

