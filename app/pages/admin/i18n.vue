<template>
  <v-container>
    <div class="mb-4 d-flex align-center justify-space-between">
      <v-btn prepend-icon="mdi-arrow-left" variant="text" to="/" class="text-none font-weight-medium px-0 text-body-1" color="grey-darken-2">
        {{ $t('action.backToSystemPanel') }}
      </v-btn>
    </div>

    <!-- DİLLER -->
    <v-card class="elevation-2 rounded-lg border-primary-lighten-4 mb-8">
      <CrudTable
        ref="langTable"
        api-endpoint="/api/admin/i18n/languages"
        :title="$t('common.language')"
        :columns="languageColumns"
        default-sort-key="code"
        default-sort-order="asc"
        @create="openLanguageDialog()"
        @edit="openLanguageDialog($event)"
        @delete="deleteLanguage($event)"
        :enable-multi-select="true"
        row-key="code"
      >
        <template #toolbarActions>
          <v-btn icon="mdi-download" variant="text" :loading="langExportLoading" @click="exportLangsJSON('languages')" class="mr-2" :title="$t('action.exportFormat', { format: 'JSON' })"></v-btn>
          <v-btn icon="mdi-upload" variant="text" :loading="langImportLoading" @click="triggerLangImport" class="mr-2" :title="$t('action.importFormat', { format: 'JSON' })"></v-btn>
          <input type="file" ref="langInputRef" accept=".json" style="display: none" @change="importLangsJSON">
        </template>
        <template v-slot:rowActions="{ item }">
          <v-btn icon="mdi-download-circle-outline" size="small" color="blue" variant="text" @click="exportSingleLangJSON(item, 'language')" :title="$t('action.exportFormat', { format: '(Single)' })" />
        </template>

        <template v-slot:item.dir="{ item }">
          <v-chip size="small" :color="(item as any).dir === 'rtl' ? 'orange' : 'blue'" variant="flat">
            {{ (item as any).dir.toUpperCase() }}
          </v-chip>
        </template>
        <template v-slot:item.is_active="{ item }">
          <v-switch
            v-model="(item as any).is_active"
            :true-value="1"
            :false-value="0"
            color="success"
            hide-details
            density="compact"
            @change="toggleLanguageStatus(item)"
            :disabled="(item as any).is_inherited"
          ></v-switch>
        </template>
        <template v-slot:item.is_inherited="{ item }">
          <v-chip v-if="(item as any).is_inherited" size="small" color="purple" variant="tonal" prepend-icon="mdi-shield-lock-outline">
            {{ $t('message.masterInherited') }}
          </v-chip>
          <v-chip v-else size="small" color="success" variant="tonal">{{ $t('message.local') }}</v-chip>
        </template>
        <template v-slot:item.hashtags="{ item }">
          <v-chip class="ma-1" size="small" color="secondary" v-for="tag in (item as any).hashtags" :key="tag">{{ tag }}</v-chip>
          <span v-if="!Array.isArray((item as any).hashtags) || (item as any).hashtags.length === 0" class="text-caption text-grey">-</span>
        </template>
      </CrudTable>
    </v-card>

    <!-- ÇEVİRİLER -->
    <v-card class="elevation-2 rounded-lg border-primary-lighten-4 mb-8">
      <CrudTable
        ref="transTable"
        api-endpoint="/api/admin/i18n/translations"
        :title="$t('page.transManagement')"
        :columns="translationColumns"
        default-sort-key="key"
        default-sort-order="asc"
        @create="openTranslationDialog()"
        @edit="openTranslationDialog($event)"
        @delete="deleteTranslation($event)"
        :enable-multi-select="true"
        row-key="key"
      >
        <template #toolbarActions>
          <v-btn icon="mdi-download" variant="text" :loading="transExportLoading" @click="exportTransJSON('translations')" class="mr-2" :title="$t('action.exportFormat', { format: 'JSON' })"></v-btn>
          <v-btn icon="mdi-upload" variant="text" :loading="transImportLoading" @click="triggerTransImport" class="mr-2" :title="$t('action.importFormat', { format: 'JSON' })"></v-btn>
          <input type="file" ref="transInputRef" accept=".json" style="display: none" @change="importTransJSON">
        </template>
        <template v-slot:rowActions="{ item }">
          <v-btn icon="mdi-download-circle-outline" size="small" color="blue" variant="text" @click="exportSingleTransJSON(item, 'translation')" :title="$t('action.exportFormat', { format: '(Single)' })" />
        </template>

        <template v-slot:item.key="{ item }">
          <code class="text-primary bg-grey-lighten-4 px-2 py-1 rounded">{{ (item as any).key }}</code>
        </template>
        <template v-slot:item.is_inherited="{ item }">
          <v-chip v-if="(item as any).is_inherited" size="small" color="purple" variant="tonal" prepend-icon="mdi-shield-lock-outline">
            {{ $t('message.masterAll') }}
          </v-chip>
          <v-chip v-else size="small" color="success" variant="tonal">{{ $t('message.localOverride') }}</v-chip>
        </template>
        <template v-for="lang in activeLanguages" :key="lang.code" v-slot:[`item.${lang.code}`]="{ item }">
          {{ (item as any).values[lang.code] || '-' }}
        </template>
        <template v-slot:item.hashtags="{ item }">
          <v-chip class="ma-1" size="small" color="secondary" v-for="tag in (item as any).hashtags" :key="tag">{{ tag }}</v-chip>
          <span v-if="!Array.isArray((item as any).hashtags) || (item as any).hashtags.length === 0" class="text-caption text-grey">-</span>
        </template>
      </CrudTable>
    </v-card>

    <!-- Dil Ekleme/Düzenleme Dialog -->
    <ItemDialog
      v-model="langDialog"
      :title="editingLang ? $t('page.editLang') : $t('action.addNew', { name: $t('entity.language') })"
      :mode="editingLang ? 'edit' : 'create'"
      :loading="savingLang"
      @save="saveLanguage"
      @cancel="langDialog = false"
      max-width="500"
    >
      <v-select
        v-if="!editingLang"
        v-model="selectedPredefinedLang"
        :items="availablePredefinedLanguages"
        item-title="name"
        return-object
        :label="$t('field.selectLang')"
        variant="outlined"
        density="comfortable"
        @update:model-value="onPredefinedLangSelect"
      >
        <template v-slot:item="{ props, item }">
          <v-list-item 
            v-bind="props" 
            :title="((item as any).raw || (item as any)).name" 
            :subtitle="(((item as any).raw || (item as any)).code || '').toUpperCase() + ' (' + (((item as any).raw || (item as any)).dir || '').toUpperCase() + ')'"
          ></v-list-item>
        </template>
      </v-select>

      <template v-if="editingLang">
        <v-text-field v-model="langForm.name" :label="$t('common.languageName')" variant="outlined" density="comfortable" readonly disabled></v-text-field>
        <v-text-field v-model="langForm.code" :label="$t('field.langCode')" variant="outlined" density="comfortable" readonly disabled></v-text-field>
        <v-text-field v-model="langForm.dir" :label="$t('field.langDir')" variant="outlined" density="comfortable" readonly disabled></v-text-field>
      </template>

      <v-switch v-model="langForm.is_active" :true-value="1" :false-value="0" :label="$t('field.isActive')" color="success"></v-switch>
      
      <v-combobox
        v-model="langForm.hashtags"
        :label="$t('field.hashtags')"
        variant="outlined"
        multiple
        chips
        density="comfortable"
        class="mt-2"
        :hint="$t('field.hashtagsHint')"
        persistent-hint
      ></v-combobox>
    </ItemDialog>

    <!-- Çeviri Ekleme/Düzenleme Dialog -->
    <ItemDialog
      v-model="transDialog"
      :title="editingTrans ? $t('page.editTrans') : $t('action.addNew', { name: $t('table.transKey') })"
      :mode="editingTrans ? 'edit' : 'create'"
      :loading="savingTrans"
      @save="saveTranslation"
      @cancel="transDialog = false"
      max-width="600"
    >
      <v-alert v-if="editingTrans && editingTrans.is_inherited" type="info" variant="tonal" class="mb-4">
        {{ $t('message.transOverrideHint') }}
      </v-alert>
      <v-text-field v-model="transForm.key" :label="$t('field.transKey')" variant="outlined" density="comfortable" :readonly="!!editingTrans" :disabled="!!editingTrans"></v-text-field>
      
      <div class="mt-4">
        <div class="text-subtitle-2 mb-2 text-grey-darken-1">{{ $t('field.transForLangs') }}</div>
        <v-textarea 
          v-for="lang in activeLanguages" 
          :key="lang.code"
          v-model="transForm.values[lang.code]" 
          :label="lang.name + ' (' + lang.code + ')'" 
          variant="outlined" 
          density="comfortable" 
          rows="2"
          class="mb-2"
        ></v-textarea>
      </div>

      <v-combobox
        v-model="transForm.hashtags"
        :label="$t('field.hashtags')"
        variant="outlined"
        multiple
        chips
        density="comfortable"
        class="mt-4"
        :hint="$t('field.hashtagsHint')"
        persistent-hint
      ></v-combobox>
    </ItemDialog>

  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useNuxtApp } from '#app';
import { useI18n } from 'vue-i18n';
import { useJsonExportImport } from '~/composables/useJsonExportImport';

const { t } = useI18n();

useHead({ title: () => t('page.i18n') });

const { $toast } = useNuxtApp() as any;

// --- Languages State ---
const langTable = ref<any>(null);
const langDialog = ref(false);
const editingLang = ref<any>(null);
const savingLang = ref(false);
const selectedPredefinedLang = ref(null);
const langForm = ref<{ code: string; name: string; dir: string; is_active: number; hashtags?: string[] }>({ code: '', name: '', dir: 'ltr', is_active: 1, hashtags: [] });
const activeLanguages = ref<any[]>([]);
const existingLanguageCodes = ref<string[]>([]);

const predefinedLanguages = [
  { code: 'tr', name: 'Türkçe', dir: 'ltr' },
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
  { code: 'de', name: 'Deutsch', dir: 'ltr' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'ru', name: 'Русский', dir: 'ltr' },
  { code: 'zh', name: '中文', dir: 'ltr' },
  { code: 'ja', name: '日本語', dir: 'ltr' },
  { code: 'it', name: 'Italiano', dir: 'ltr' },
  { code: 'fa', name: 'فارسی', dir: 'rtl' },
  { code: 'ur', name: 'اردو', dir: 'rtl' }
];

const availablePredefinedLanguages = computed(() => {
  const existingSet = new Set(existingLanguageCodes.value.map((code) => String(code).toLowerCase()));
  return predefinedLanguages.filter((lang) => !existingSet.has(lang.code.toLowerCase()));
});

const languageColumns = computed(() => [
  { title: t('common.code'), key: 'code', width: '100px' },
  { title: t('common.languageName'), key: 'name' },
  { title: t('table.langDir'), key: 'dir', width: '100px', slot: true },
  { title: t('table.source'), key: 'is_inherited', width: '120px', slot: true, filterable: false },
  { title: t('common.status'), key: 'is_active', width: '100px', slot: true, filterable: false },
  { title: t('field.hashtags'), key: 'hashtags', sortable: false, filterable: true, slot: true }
]);

const onPredefinedLangSelect = (val: any) => {
  if (val) {
    langForm.value.code = val.code;
    langForm.value.name = val.name;
    langForm.value.dir = val.dir;
  }
};

const fetchExistingLanguageCodes = async () => {
  try {
    const res = await $fetch<any>('/api/admin/i18n/languages', {
      params: { page: 1, limit: 1000, sortBy: 'code', sortOrder: 'asc' }
    });

    const rows = Array.isArray(res?.data)
      ? res.data
      : Array.isArray(res?.records)
        ? res.records
        : Array.isArray(res)
          ? res
          : [];

    existingLanguageCodes.value = rows
      .map((row: any) => String(row?.code || '').trim())
      .filter((code: string) => !!code);
  } catch (e) {
    existingLanguageCodes.value = activeLanguages.value
      .map((lang: any) => String(lang?.code || '').trim())
      .filter((code: string) => !!code);
  }
};

const updateGlobalLocales = async () => {
  try {
    const res = await $fetch<any[]>('/api/i18n/locales');
    const appLocales = useState<any[]>('app_locales');
    appLocales.value = Array.isArray(res) && res.length > 0 ? res : [];
    activeLanguages.value = Array.isArray(res) ? res : [];
  } catch (e) {
    
  }
};

const openLanguageDialog = async (lang: any = null) => {
  if (lang && lang.is_inherited) {
    if ($toast) $toast.warning(t('message.masterLangWarning'));
    return;
  }
  editingLang.value = lang;
  if (lang) {
    langForm.value = { ...lang, hashtags: typeof lang.hashtags === 'string' ? JSON.parse(lang.hashtags || '[]') : (lang.hashtags || []) };
    selectedPredefinedLang.value = null;
  } else {
    langForm.value = { code: '', name: '', dir: 'ltr', is_active: 1, hashtags: [] };
    selectedPredefinedLang.value = null;
    await fetchExistingLanguageCodes();
  }
  langDialog.value = true;
};

const saveLanguage = async () => {
  if (!langForm.value.code || !langForm.value.name) {
    if ($toast) $toast.warning(t('field.selectLang'));
    return;
  }
  // no hashtag stripping
  savingLang.value = true;
  try {
    await $fetch('/api/admin/i18n/languages', {
      method: 'POST',
      body: langForm.value
    });
    if ($toast) $toast.success(t('message.added'));
    langDialog.value = false;
    langTable.value?.loadItems();
    await updateGlobalLocales();
  } catch (err: any) {
    if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed'));
  } finally {
    savingLang.value = false;
  }
};

const toggleLanguageStatus = async (lang: any) => {
  try {
    await $fetch('/api/admin/i18n/languages', {
      method: 'POST',
      body: { ...lang }
    });
    if ($toast) $toast.success(t('message.updated'));
    await updateGlobalLocales();
  } catch (err: any) {
    if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed'));
  }
};

const deleteLanguage = async (itemOrItems: any) => {
  const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
  if (items.length === 0) return;
  
  if (!confirm(t('confirm.delete'))) return;

  try {
    for (const lang of items) {
      if (lang.is_inherited) {
        if ($toast) $toast.error(t('message.masterLangDelWarning'));
        continue;
      }
      await $fetch(`/api/admin/i18n/languages/${lang.code}`, { method: 'DELETE' });
    }
    if ($toast) $toast.success(t('message.deleted'));
    langTable.value?.loadItems();
    await updateGlobalLocales();
  } catch (err: any) {
    if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed'));
  }
};

// --- Translations State ---
const transTable = ref<any>(null);
const transDialog = ref(false);
const editingTrans = ref<any>(null);
const savingTrans = ref(false);
const transForm = ref<{ key: string; values: Record<string, string>; hashtags?: string[] }>({ key: '', values: {}, hashtags: [] });

const translationColumns = computed(() => {
  const cols: any[] = [
    { title: t('table.transKey'), key: 'key', width: '25%', slot: true }
  ];
  for (const lang of activeLanguages.value) {
    cols.push({ title: lang.name, key: lang.code, sortable: false, slot: true });
  }
  cols.push({ title: t('table.source'), key: 'is_inherited', width: '150px', slot: true, filterable: false });
  cols.push({ title: t('field.hashtags'), key: 'hashtags', sortable: false, filterable: true, slot: true });
  return cols;
});

const refreshTranslations = () => {
  if (transTable.value) {
    transTable.value.loadItems();
  }
};

const openTranslationDialog = (trans: any = null) => {
  editingTrans.value = trans;
  if (trans) {
    transForm.value = { key: trans.key, values: { ...trans.values }, hashtags: typeof trans.hashtags === 'string' ? JSON.parse(trans.hashtags || '[]') : (trans.hashtags || []) };
  } else {
    transForm.value = { key: '', values: {}, hashtags: [] };
  }
  transDialog.value = true;
};

const saveTranslation = async () => {
  if (!transForm.value.key) {
    if ($toast) $toast.warning('Key required');
    return;
  }
  // no hashtag stripping
  savingTrans.value = true;
  try {
    await $fetch('/api/admin/i18n/translations', {
      method: 'POST',
      body: {
        key: transForm.value.key,
        values: transForm.value.values,
        hashtags: transForm.value.hashtags
      }
    });
    if ($toast) $toast.success(t('message.added'));
    transDialog.value = false;
    refreshTranslations();
  } catch (err: any) {
    if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed'));
  } finally {
    savingTrans.value = false;
  }
};

const deleteTranslation = async (itemOrItems: any) => {
  const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
  if (items.length === 0) return;

  if (!confirm(t('confirm.delete'))) return;

  try {
    for (const trans of items) {
      if (trans.is_inherited) {
        if ($toast) $toast.error(t('message.masterTransDelWarning'));
        continue;
      }
      await $fetch('/api/admin/i18n/translations', {
        method: 'DELETE',
        params: { key: trans.key }
      });
    }
    if ($toast) $toast.success(t('message.deleted'));
    refreshTranslations();
  } catch (err: any) {
    if ($toast) $toast.error(t(err.data?.message || 'errors.operationFailed'));
  }
};

const { 
  jsonExportLoading: langExportLoading, 
  jsonImportLoading: langImportLoading, 
  jsonInputRef: langInputRef, 
  triggerJSONImport: triggerLangImport, 
  exportSingleJSON: exportSingleLangJSON, 
  exportJSON: exportLangsJSON, 
  importJSON: importLangsJSON 
} = useJsonExportImport('/api/admin/i18n/languages', langTable);

const { 
  jsonExportLoading: transExportLoading, 
  jsonImportLoading: transImportLoading, 
  jsonInputRef: transInputRef, 
  triggerJSONImport: triggerTransImport, 
  exportSingleJSON: exportSingleTransJSON, 
  exportJSON: exportTransJSON, 
  importJSON: importTransJSON 
} = useJsonExportImport('/api/admin/i18n/translations', transTable);

onMounted(() => {
  updateGlobalLocales();
});
</script>
