<template>
  <v-container>
    <div class="mb-4">
      <v-btn prepend-icon="mdi-arrow-left" variant="text" to="/" class="text-none font-weight-medium px-0 text-body-1"
        color="primary">
        {{ $t('common.home') }}
      </v-btn>
    </div>

    <CrudTable ref="crudTable" :enable-multi-select="true" api-endpoint="/api/admin/entities" :columns="columns"
      :title="$t('page.entities')" default-sort-key="created_at" default-sort-order="desc" @create="openCreateDialog"
      @edit="openEditDialog" @delete="handleDelete" @loaded="onCrudTableLoaded">
      <template #toolbarActions>
        <v-btn icon="mdi-creation" variant="text" :loading="generateAllLoading" @click="generateAllApiUi" class="mr-2"
          title="Tümünü Oluştur (API & UI)" color="deep-purple"></v-btn>
        <v-btn icon="mdi-download" variant="text" :loading="jsonExportLoading" @click="exportJSON" class="mr-2"
          :title="$t('action.exportFormat', { format: 'JSON' })"></v-btn>
        <v-btn icon="mdi-upload" variant="text" :loading="jsonImportLoading" @click="triggerJSONImport" class="mr-2"
          :title="$t('action.importFormat', { format: 'JSON' })"></v-btn>
        <input type="file" ref="jsonInputRef" accept=".json" style="display: none" @change="importJSON">
      </template>
      <template v-slot:item.name="{ item }">
        <v-chip size="small" label variant="tonal" :color="color" class="font-weight-bold">
          {{ $localize(item.name) }}
        </v-chip>
      </template>

      <!-- Hashtags -->
      <template v-slot:item.hashtags="{ item }">
        <v-chip class="ma-1" size="small" color="secondary"
          v-for="tag in (typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || []))"
          :key="tag">{{ tag }}</v-chip>
        <span
          v-if="!Array.isArray(typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || [])) || (typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || [])).length === 0"
          class="text-caption text-grey">-</span>
      </template>



      <!-- Özel Ekstra İşlem (Row Action) -->
      <template #rowActions="{ item }">
        <v-btn icon="mdi-creation" size="small" color="deep-purple" variant="text" @click="openGeneratorDialog(item)"
          title="API & UI Jeneratör" />
        <v-btn icon="mdi-download-circle-outline" size="small" color="blue" variant="text"
          @click="exportSingleJSON(item)" :title="$t('action.exportFormat', { format: '(Single)' })" />
        <v-btn icon="mdi-database-edit" size="small" color="teal" variant="text" :to="'/admin/records/' + item.slug"
          :title="$t('action.manageRecords')" />
      </template>

      <!-- Detay / Info Sütunu -->
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
    </CrudTable>

    <!-- ER Diagram Editor -->
    <v-card class="mt-6 elevation-2 rounded-lg" :class="{ 'er-fullscreen-card': isErFullscreen }">
      <v-toolbar :color="color" height="56" class="px-2">
        <v-icon start class="mr-2">mdi-source-branch</v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">
          {{ $t('action.erDiagramEditor') }}
        </v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-refresh" @click="crudTable?.loadItems()" title="Yenile" />
        <v-btn :icon="isErFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"
          @click="isErFullscreen = !isErFullscreen"
          :title="isErFullscreen ? $t('common.exitFullscreen') : $t('common.fullscreen')" />

      </v-toolbar>
      <ErDiagramEditor :entities="entitiesList" @entity-update="handleErEntityUpdate"
        @entity-create="handleErEntityCreate" @entity-delete="handleErEntityDelete" 
        @edit-entity="openEditDialog" @create-entity="openCreateDialog" />
    </v-card>

    <!-- ItemDialog Entegrasyonu -->
    <ItemDialog v-model="dialog" :mode="dialogMode" :initial-data="initialFormData" fullscreen @save="saveItem">
      <!-- formData, ItemDialog tarafından sağlanan state -->
      <template #default="{ formData, mode }">
        <v-row class="flex-shrink-0">
          <v-col cols="12" sm="6" class="pb-0">
            <I18nTextField v-model="formData.name" :label="$t('common.name')"
              @update:model-value="dialogMode === 'create' ? formData.slug = generateSlug($event) : null" required>
            </I18nTextField>
          </v-col>
          <v-col cols="12" sm="6" class="pb-0">
            <v-text-field v-model="formData.slug" :label="$t('field.slug')" variant="outlined" density="comfortable"
              class="font-weight-bold" :hint="$t('field.slugHint')"
              :disabled="dialogMode === 'edit'"
              @blur="formData.slug = normalizeSlug(formData.slug)"
              :rules="[
                (v: any) => !!v || $t('validation.required'),
                (v: any) => /^[a-z0-9_]+$/.test(v) || t('validation.alphanumericOnly'),
                (v: any) => !['api', 'admin', 'auth', 'users', 'tenant', 'system', 'webhook', 'records', 'login', 'logout', 'dashboard'].includes(v) || t('validation.reservedWord')
              ]"></v-text-field>
          </v-col>
          <v-col cols="12" sm="12" class="pb-0">
            <v-combobox v-model="formData.hashtags" :label="$t('field.hashtags')" variant="outlined" multiple chips
              density="comfortable" class="mb-2" :hint="$t('field.hashtagsHint')"
              persistent-hint></v-combobox>
          </v-col>
        </v-row>

        <div class="d-flex align-center justify-space-between mb-2 mt-2">
          <span class="font-weight-bold opacity-70">{{ $t('field.fields') }}</span>
          <v-btn size="small" :color="color" variant="tonal" prepend-icon="mdi-plus" @click="addField(formData)">
            {{ $t('common.addField') }}
          </v-btn>
        </div>

        <v-card v-for="(field, index) in (formData.fields as any[])" :key="index"
          class="mb-4 pa-4 border bg-white rounded-lg flex-shrink-0 shadow-sm" elevation="0">
          
          <!-- Field Header & Actions -->
          <div class="d-flex justify-space-between align-center mb-3 pb-2 border-b">
            <div class="text-subtitle-1 font-weight-bold opacity-70 d-flex align-center">
              <v-icon size="small" color="primary" class="mr-2">mdi-form-textbox</v-icon>
              {{ $t('common.fieldName') }} #{{ index + 1 }}
              <v-chip v-if="field.name" size="x-small" class="ml-2 font-weight-bold" color="primary" variant="tonal">{{ field.name }}</v-chip>
            </div>
            <div>
              <v-btn icon="mdi-arrow-up" color="primary" variant="text" size="small" :disabled="index === 0"
                @click="moveFieldUp(formData, index)" :title="$t('action.moveUp')"></v-btn>
              <v-btn icon="mdi-arrow-down" color="primary" variant="text" size="small"
                :disabled="index === formData.fields.length - 1" @click="moveFieldDown(formData, index)"
                :title="$t('action.moveDown')"></v-btn>
              <v-btn icon="mdi-delete" color="error" variant="text" size="small" class="ml-1" @click="removeField(formData, index)"
                :title="$t('action.deleteField')"></v-btn>
            </div>
          </div>

          <!-- Main Properties -->
          <v-row align="start">
            <v-col cols="12" md="4" class="pb-1">
              <I18nTextField v-model="field.label" :label="$t('common.name')"></I18nTextField>
            </v-col>

            <v-col cols="12" md="4" class="pb-1">
              <v-text-field v-model="field.name" :label="$t('field.slug')" variant="outlined" density="compact"
                hide-details bg-color="white"
                :disabled="!field.isNew"
                @blur="field.name = normalizeSlug(field.name)"
                :rules="[
                  (v: any) => !!v || t('validation.enterFieldName'),
                  (v: any) => /^[a-z0-9_]+$/.test(v) || t('validation.alphanumericOnly'),
                  (v: any) => !['api', 'admin', 'auth', 'users', 'tenant', 'system', 'webhook', 'records', 'login', 'logout', 'dashboard'].includes(v) || t('validation.reservedWord')
                ]"></v-text-field>
            </v-col>
            
            <v-col cols="12" md="4" class="pb-1">
              <v-select v-model="field.type"
                :items="['string', 'number', 'boolean', 'date', 'datetime', 'time', 'array', 'json', 'uuid', 'enum', 'relation', 'password']"
                :label="$t('field.dataType')" variant="outlined" density="compact" hide-details bg-color="white"
                @update:model-value="() => { field.rulesList = []; if (field.type !== 'relation') { field.onDelete = 'restrict'; field.targetEntityId = null; } else { enforceRelationPolicy(field); } }"></v-select>
              
              <!-- Relation Extra Fields -->
              <template v-if="field.type === 'relation'">
                <v-autocomplete v-model="field.targetEntityId" :items="localizedEntitiesList"
                  item-title="displayName" item-value="id" :label="$t('common.target')" variant="outlined"
                  density="compact" bg-color="white" class="mt-3" hide-details
                  :rules="[(v: any) => !!v || $t('validation.required')]"></v-autocomplete>
                <v-select v-model="field.onDelete"
                  :items="getRelationOnDeleteOptions(field)" item-title="title" item-value="value"
                  :label="$t('field.onDelete')" variant="outlined" density="compact"
                  bg-color="white" class="mt-3" hide-details
                  :hint="field.required && field.onDelete === 'restrict' ? t('validation.noSetNullIfRequired') : ''"
                  persistent-hint></v-select>
              </template>
              
              <!-- Enum Extra Fields -->
              <div v-if="field.type === 'enum'" class="mt-3 border rounded pa-3 bg-surface">
                <div class="d-flex justify-space-between align-center mb-2">
                  <span class="text-caption font-weight-bold opacity-70">{{ $t('common.optionsPressEnterToAdd') }}</span>
                  <v-btn size="x-small" :color="color" variant="tonal" prepend-icon="mdi-plus" @click="field.options.push('')">{{ $t('action.add') }}</v-btn>
                </div>
                <div v-for="(opt, optIdx) in field.options" :key="optIdx" class="d-flex align-start mb-2">
                  <div class="flex-grow-1">
                    <I18nTextField v-model="field.options[optIdx]" :placeholder="`${$t('common.option')} ${Number(optIdx) + 1}`" />
                  </div>
                  <v-btn icon="mdi-delete" color="red" variant="text" size="small" class="mt-1 ml-1" @click="field.options.splice(optIdx, 1)"></v-btn>
                </div>
                <div v-if="field.options.length === 0" class="text-caption text-error mt-1">{{ t('common.addAtLeastOneOption') }}</div>
              </div>
              
              <!-- Password Extra Fields -->
              <v-select v-if="field.type === 'password'" v-model="field.hashAlgorithm" :items="[
                { title: $t('common.plainText'), value: 'plain' },
                { title: $t('field.bcrypt'), value: 'bcrypt' },
                { title: $t('field.sha256'), value: 'sha256' }
              ]" item-title="title" item-value="value" :label="$t('field.hashAlgorithm')" variant="outlined"
                density="compact" bg-color="white" class="mt-3" hide-details></v-select>
            </v-col>
          </v-row>

          <v-divider class="my-4 border-opacity-50"></v-divider>

          <!-- Toggles & Rules Action -->
          <div class="d-flex flex-wrap align-center justify-space-between" style="gap: 16px;">
            <div class="d-flex flex-wrap align-center" style="gap: 24px;">
              <v-switch v-model="field.required" :label="$t('validation.required')" :color="color" hide-details
                density="compact" @update:model-value="() => enforceRelationPolicy(field)"></v-switch>
              <v-switch v-model="field.unique" :label="$t('field.unique')" color="deep-purple" hide-details
                density="compact"></v-switch>
              <v-switch v-model="field.isPrimary" :label="$t('field.primaryName')" color="teal" hide-details
                density="compact" @change="handlePrimaryChange(formData, index)" :title="$t('field.primaryNameHint')"></v-switch>
              <v-switch v-model="field.showInTable" :label="$t('common.showInTable')" color="info" hide-details
                density="compact" :title="$t('field.showInTableHint')"></v-switch>
            </div>
            <v-btn size="small" color="blue-grey" variant="tonal" prepend-icon="mdi-format-list-checks" @click="addRule(field)">
              {{ $t('action.addValidationRule') }} <span v-if="field.rulesList.length > 0" class="ml-1">({{ field.rulesList.length }})</span>
            </v-btn>
          </div>

          <!-- Validation Rules List -->
          <v-expand-transition>
            <div class="mt-4 px-3 py-3 border border-dashed bg-surface rounded" v-if="field.rulesList.length > 0">
              <div class="text-caption font-weight-bold text-blue-grey-darken-1 mb-3 d-flex align-center">
                <v-icon size="small" class="mr-1">mdi-shield-check</v-icon>
                {{ $t('entity.validationRules') }}
              </div>
              <v-row v-for="(rule, rIndex) in field.rulesList" :key="rIndex" align="center" no-gutters class="mb-3">
                <v-col cols="12" md="3" class="px-1 mb-2 mb-md-0">
                  <v-select v-model="rule.type" :items="getAvailableRules(field.type)" item-title="title"
                    item-value="value" :label="$t('field.ruleType')" density="compact" hide-details="auto"
                    variant="outlined" bg-color="white" @update:model-value="rule.value = null"></v-select>
                </v-col>
                <v-col cols="12" :md="requiresValue(rule.type) ? 3 : 0" class="px-1 mb-2 mb-md-0" v-if="requiresValue(rule.type)">
                  <v-text-field v-model="rule.value" :label="$t('common.value')" :type="getValueInputType(rule.type)"
                    :placeholder="getValuePlaceholder(rule.type)" :hint="getValueHint(rule.type)" persistent-hint
                    density="compact" hide-details="auto" variant="outlined" bg-color="white"></v-text-field>
                </v-col>
                <v-col cols="10" :md="requiresValue(rule.type) ? 5 : 8" class="px-1 mb-2 mb-md-0">
                  <I18nTextField v-model="rule.message" :label="$t('field.customErrorMessage')"
                    :placeholder="$t('field.customErrorMessageHint')"></I18nTextField>
                </v-col>
                <v-col cols="2" md="1" class="text-right px-1 mb-2 mb-md-0">
                  <v-btn icon="mdi-close" color="error" variant="text" size="small"
                    @click="removeRule(field, Number(rIndex))" :title="$t('action.deleteRule')"></v-btn>
                </v-col>
              </v-row>
            </div>
          </v-expand-transition>
        </v-card>
      </template>
    </ItemDialog>

    <!-- Yardım (Help) Dialogu -->

    <!-- Generator Dialog -->
    <v-dialog v-model="generatorDialog" max-width="600">
      <v-card>
        <v-toolbar color="deep-purple" height="64" class="px-2">
          <v-icon icon="mdi-magic-staff" color="white" class="mr-3" size="32"></v-icon>
          <v-toolbar-title class="text-h6 font-weight-bold text-white">
            {{ $t('entity.apiUiGenerator') }}
          </v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn icon="mdi-close" variant="text" color="white" @click="generatorDialog = false"></v-btn>
        </v-toolbar>
        <v-card-text class="pt-4">
          <div class="mb-4 text-body-1 font-weight-medium">
            <span class="text-primary">{{ $localize(generatorEntity?.name) }}</span> {{ $t('entity.selectModulesToGenerate') }}:
          </div>

          <v-row>
            <v-col cols="12" sm="6" class="py-1">
              <v-checkbox v-model="generatorOptions.apiList" :label="$t('field.generatorApiList')" color="deep-purple" hide-details
                density="compact"></v-checkbox>
            </v-col>
            <v-col cols="12" sm="6" class="py-1">
              <v-checkbox v-model="generatorOptions.apiSingle" :label="$t('field.generatorApiSingle')" color="deep-purple" hide-details
                density="compact"></v-checkbox>
            </v-col>
            <v-col cols="12" sm="6" class="py-1">
              <v-checkbox v-model="generatorOptions.apiCreate" :label="$t('field.generatorApiCreate')" color="deep-purple"
                hide-details density="compact"></v-checkbox>
            </v-col>
            <v-col cols="12" sm="6" class="py-1">
              <v-checkbox v-model="generatorOptions.apiUpdate" :label="$t('field.generatorApiUpdate')" color="deep-purple"
                hide-details density="compact"></v-checkbox>
            </v-col>
            <v-col cols="12" sm="6" class="py-1">
              <v-checkbox v-model="generatorOptions.apiDelete" :label="$t('field.generatorApiDelete')" color="deep-purple"
                hide-details density="compact"></v-checkbox>
            </v-col>
            <v-col cols="12" sm="6" class="py-1">
              <v-checkbox v-model="generatorOptions.apiBulk" :label="$t('field.generatorApiBulk')" color="deep-purple"
                hide-details density="compact"></v-checkbox>
            </v-col>
            <v-col cols="12" sm="6" class="py-1">
              <v-checkbox v-model="generatorOptions.pageList" :label="$t('field.generatorPageList')" color="deep-purple"
                hide-details density="compact"></v-checkbox>
            </v-col>
          </v-row>

          <v-divider class="my-4"></v-divider>

          <v-combobox v-model="generatorHashtags" :label="$t('field.permissionHashtags')" variant="outlined" multiple chips
            density="comfortable" :hint="$t('field.permissionHashtagsHint')"
            persistent-hint></v-combobox>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer></v-spacer>
          <v-btn variant="text" color="primary" @click="generatorDialog = false">İptal</v-btn>
          <v-btn variant="flat" color="deep-purple" @click="generateApiUi" :loading="generatorLoading">{{ $t('action.generate') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';

import { useJsonExportImport } from '~/composables/useJsonExportImport';

const { t } = useI18n();
const { $localize, $toast } = useNuxtApp() as any;

useHead({ title: () => t('page.entities') })

const crudTable = ref();

const generatorDialog = ref(false);
const generatorLoading = ref(false);
const generatorEntity = ref<any>(null);
const generatorHashtags = ref<string[]>([]);
const generatorOptions = ref({
  apiList: true,
  apiSingle: true,
  apiCreate: true,
  apiUpdate: true,
  apiDelete: true,
  apiBulk: true,
  pageList: true
});

function openGeneratorDialog(item: any) {
  generatorEntity.value = item;
  generatorHashtags.value = Array.isArray(item.hashtags) ? [...item.hashtags] : [];
  generatorDialog.value = true;
}

async function generateApiUi() {
  if (!generatorEntity.value) return;
  generatorLoading.value = true;
  try {
    const res: any = await $fetch('/api/admin/entities/generate', {
      method: 'POST',
      body: {
        entityId: generatorEntity.value.id,
        options: generatorOptions.value,
        hashtags: generatorHashtags.value
      }
    });
    if ($toast) $toast.success(t('message.generationComplete', { api: res.insertedMiddlewares, page: res.insertedPages }));
    generatorDialog.value = false;
  } catch (e: any) {
    if ($toast) $toast.error(e.data?.message || e.message || t('error.generationFailed'));
  } finally {
    generatorLoading.value = false;
  }
}

const generateAllLoading = ref(false);

async function generateAllApiUi() {
  if (!confirm('Tüm varlıklar için sayfalar ve API uç noktaları oluşturulacak (mevcut olanların üzerine yazılır). Onaylıyor musunuz?')) return;
  generateAllLoading.value = true;
  try {
    const res: any = await $fetch('/api/admin/entities/generate-all', {
      method: 'POST'
    });
    if ($toast) $toast.success(t('message.generationComplete', { api: res.insertedMiddlewares, page: res.insertedPages }));
  } catch (e: any) {
    if ($toast) $toast.error(e.data?.message || e.message || t('error.generationFailed'));
  } finally {
    generateAllLoading.value = false;
  }
}

const entitiesList = ref<any[]>([]);
const isErFullscreen = ref(false);
const { mobile } = useDisplay()

const { jsonExportLoading, jsonImportLoading, jsonInputRef, triggerJSONImport, exportSingleJSON, exportJSON, importJSON } = useJsonExportImport('/api/admin/entities', crudTable);

const { primaryColor: color } = useGlobals();

// 1. Hangi kurallar kullanıcıdan bir değer girmesini ister?
const requiresValue = (type: string) => {
  const noValueRules = [
    'email', 'url', 'alphanumeric', 'isInteger',
    'uniqueItems', 'pastOnly', 'futureOnly', 'disableWeekends',
    'validJson', 'isTrue', 'validUuid'
  ];
  return !noValueRules.includes(type);
};

// 2. Girilecek değer sayısal mı olmalı yoksa metin mi?
const getValueInputType = (type: string) => {
  const numberInputs = [
    'minLength', 'maxLength', 'exactLength',
    'min', 'max', 'step',
    'minItems', 'maxItems', 'maxDepth', 'uuidVersion'
  ];
  return numberInputs.includes(type) ? 'number' : 'text';
};

// 3. Kullanıcıya gösterilecek Placeholder (Örnek Metin)
const getValuePlaceholder = (type: string) => {
  switch (type) {
    case 'minDate':
    case 'maxDate': return t('placeholder.minMaxDate');
    case 'minTime':
    case 'maxTime': return t('placeholder.minMaxTime');
    case 'regex': return '^[a-zA-Z0-9]+$';
    case 'requiredKeys': return t('placeholder.requiredKeys');
    default: return t('placeholder.enterValue');
  }
};

// 4. Input'un altında belirecek yol gösterici ipuçları (Hint)
const getValueHint = (type: string) => {
  switch (type) {
    case 'minDate':
    case 'maxDate': return t('hint.maxDate');
    case 'regex': return t('hint.regex');
    case 'requiredKeys': return t('hint.requiredKeys');
    case 'step': return t('hint.step');
    default: return ''; // İpucu gerektirmeyenlerde boş kalır
  }
};

// -----------------------------------

const onCrudTableLoaded = (items: any[]) => {
  entitiesList.value = items;
};

const localizedEntitiesList = computed(() => {
  return entitiesList.value.map(e => ({
    ...e,
    displayName: $localize(e.name) || e.slug
  }))
});

const handleErEntityUpdate = async (entity: any) => {
  try {
    await $fetch(`/api/admin/entities/${entity.id}`, {
      method: 'PUT',
      body: { name: entity.name, slug: entity.slug, schema: entity.schema }
    });
    if ($toast) $toast.success(t('message.entityUpdated', { name: t('entity.entity') }));
    crudTable.value?.loadItems();
  } catch (e: any) {
        const errPayload = err?.data || e?.data;
    const isArr = Array.isArray(errPayload?.data);
    const errData = isArr ? errPayload.data[0] : (errPayload?.data || {});
    const errMsg = isArr ? errPayload.data[0].message : (errPayload?.message || 'errors.operationFailed');
    if ($toast) $toast.error(t(errMsg, errData));
  }
};

const handleErEntityCreate = async (data: any) => {
  try {
    await $fetch('/api/admin/entities', {
      method: 'POST',
      body: { name: data.name, slug: data.slug, schema: data.schema }
    });
    if ($toast) $toast.success(t('message.entityCreated', { name: t('entity.entity') }));
    crudTable.value?.loadItems();
  } catch (e: any) {
        const errPayload = err?.data || e?.data;
    const isArr = Array.isArray(errPayload?.data);
    const errData = isArr ? errPayload.data[0] : (errPayload?.data || {});
    const errMsg = isArr ? errPayload.data[0].message : (errPayload?.message || 'errors.operationFailed');
    if ($toast) $toast.error(t(errMsg, errData));
  }
};

const handleErEntityDelete = async (entity: any) => {
  try {
    await $fetch(`/api/admin/entities/${entity.id}`, { method: 'DELETE' });
    if ($toast) $toast.success(t('message.entityDeleted', { name: t('entity.entity') }));
    crudTable.value?.loadItems();
  } catch (e: any) {
        const errPayload = err?.data || e?.data;
    const isArr = Array.isArray(errPayload?.data);
    const errData = isArr ? errPayload.data[0] : (errPayload?.data || {});
    const errMsg = isArr ? errPayload.data[0].message : (errPayload?.message || 'errors.operationFailed');
    if ($toast) $toast.error(t(errMsg, errData));
  }
};

const columns = computed(() => [
  { title: t('common.name'), key: 'name', sortable: true, filterable: true, type: 'string', slot: true },
  { title: t('common.slug'), key: 'slug', sortable: true, filterable: true, type: 'string' },
  { title: t('field.hashtags'), key: 'hashtags', sortable: false, filterable: true, slot: true },
  { title: t('common.info'), key: 'info', sortable: false, filterable: false, slot: true, width: '60px', align: 'center' as const }
]);

const dialog = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const initialFormData = ref<any>({});
const editId = ref<number | null>(null);

// Yeni Oluştur Modalını Aç
const openCreateDialog = () => {
  dialogMode.value = 'create';
  editId.value = null;
  initialFormData.value = {
    name: '',
    slug: '',
    hashtags: [],
    fields: [{ name: '', label: '', type: 'string', required: true, unique: false, isPrimary: true, showInTable: true, rulesList: [], options: [], onDelete: 'restrict', isNew: true }]
  };
  dialog.value = true;
};

const generateSlug = (name: string) => {
  if (!name) return '';
  let nameStr = name;
  if (name.startsWith('{') && name.endsWith('}')) {
    try {
      const parsed = JSON.parse(name);
      const firstKey = Object.keys(parsed)[0];
      nameStr = parsed['en'] || (firstKey ? parsed[firstKey] : '') || '';
    } catch (e) {
      nameStr = '';
    }
  }
  return nameStr
    .toLowerCase()
    .replace(/[ğ]/g, 'g').replace(/[ü]/g, 'u').replace(/[ş]/g, 's')
    .replace(/[ı]/g, 'i').replace(/[ö]/g, 'o').replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
};

const normalizeSlug = (val: string) => {
  if (!val || typeof val !== 'string') return '';
  return val
    .toLowerCase()
    .replace(/[ğ]/g, 'g').replace(/[ü]/g, 'u').replace(/[ş]/g, 's')
    .replace(/[ı]/g, 'i').replace(/[ö]/g, 'o').replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
};

// Düzenle Modalını Aç
const openEditDialog = (item: any) => {
  dialogMode.value = 'edit';
  editId.value = item.id;

  const mappedFields = Object.keys(item.schema || {}).map(key => ({
    name: key,
    label: item.schema[key].label || '',
    type: item.schema[key].type,
    required: item.schema[key].rules?.required || false,
    unique: item.schema[key].rules?.unique || false,
    rulesList: item.schema[key].rules?.custom || [],
    targetEntityId: item.schema[key].targetEntityId,
    onDelete: item.schema[key].onDelete || 'restrict',
    options: item.schema[key].options || [],
    isPrimary: item.schema[key].isPrimary || false,
    showInTable: item.schema[key].showInTable !== false,
    hashAlgorithm: item.schema[key].hashAlgorithm || 'plain',
    _order: item.schema[key]._order || 0,
    isNew: false
  })).sort((a, b) => a._order - b._order);

  initialFormData.value = {
    name: item.name,
    slug: item.slug,
    hashtags: typeof item.hashtags === 'string' ? JSON.parse(item.hashtags || '[]') : (item.hashtags || []),
    fields: mappedFields.length > 0 ? mappedFields : [{ name: '', label: '', type: 'string', required: true, unique: false, isPrimary: true, showInTable: true, rulesList: [], options: [], hashAlgorithm: 'plain', onDelete: 'restrict', isNew: true }]
  };
  dialog.value = true;
};

// Form Araçları (Dialog içindeki form datasına direkt müdahale eder)
const addField = (formData: any) => {
  if (!formData.fields) formData.fields = [];
  const hasPrimary = formData.fields.some((f: any) => f.isPrimary);
  formData.fields.push({ name: '', label: '', type: 'string', required: false, unique: false, isPrimary: !hasPrimary, showInTable: true, rulesList: [], options: [], hashAlgorithm: 'plain', onDelete: 'restrict', isNew: true });
};

const getRelationOnDeleteOptions = (field: any) => {
  const options = [
    { title: t('policy.restrict'), value: 'restrict' },
    { title: t('policy.cascade'), value: 'cascade' }
  ];

  if (!field?.required) {
    options.push({ title: t('policy.setNull'), value: 'setnull' });
  }

  return options;
};

const enforceRelationPolicy = (field: any) => {
  if (!field || field.type !== 'relation') return;
  if (!field.onDelete) field.onDelete = 'restrict';
  if (field.required && field.onDelete === 'setnull') {
    field.onDelete = 'restrict';
    if ($toast) $toast.warning(t('errors.relationDeleteRestrictApplied'));
  }
};

const handlePrimaryChange = (formData: any, index: number) => {
  // Exclusivity logic removed to allow multi-column display names
};

const removeField = (formData: any, index: number) => {
  formData.fields.splice(index, 1);
};

const moveFieldUp = (formData: any, index: number) => {
  if (index > 0) {
    const temp = formData.fields[index];
    formData.fields[index] = formData.fields[index - 1];
    formData.fields[index - 1] = temp;
  }
};

const moveFieldDown = (formData: any, index: number) => {
  if (index < formData.fields.length - 1) {
    const temp = formData.fields[index];
    formData.fields[index] = formData.fields[index + 1];
    formData.fields[index + 1] = temp;
  }
};

const availableRulesByType = computed<Record<string, { title: string; value: string }[]>>(() => ({
  string: [
    { title: t('rule.minLength'), value: 'minLength' },
    { title: t('rule.maxLength'), value: 'maxLength' },
    { title: t('validation.exactLength'), value: 'exactLength' },
    { title: t('common.emailFormat'), value: 'email' },
    { title: t('common.urlFormat'), value: 'url' },
    { title: t('validation.alphanumeric'), value: 'alphanumeric' },
    { title: t('common.regularExpressionRegex'), value: 'regex' }
  ],
  number: [
    { title: t('common.minimumValue'), value: 'min' },
    { title: t('common.maximumValue'), value: 'max' },
    { title: t('rule.isInteger'), value: 'isInteger' },
    { title: t('rule.step'), value: 'step' }
  ],
  array: [
    { title: t('rule.minItems'), value: 'minItems' },
    { title: t('rule.maxItems'), value: 'maxItems' },
    { title: t('rule.uniqueItems'), value: 'uniqueItems' }
  ],
  date: [
    { title: t('rule.minDate'), value: 'minDate' },
    { title: t('rule.maxDate'), value: 'maxDate' },
    { title: t('rule.pastOnly'), value: 'pastOnly' },
    { title: t('rule.futureOnly'), value: 'futureOnly' },
    { title: t('rule.disableWeekends'), value: 'disableWeekends' }
  ],
  datetime: [
    { title: t('rule.minDate'), value: 'minDate' },
    { title: t('rule.maxDate'), value: 'maxDate' },
    { title: t('rule.pastOnly'), value: 'pastOnly' },
    { title: t('rule.futureOnly'), value: 'futureOnly' },
    { title: t('rule.disableWeekends'), value: 'disableWeekends' }
  ],
  time: [
    { title: t('rule.minTime'), value: 'minTime' },
    { title: t('rule.maxTime'), value: 'maxTime' },
    { title: t('rule.timeStep'), value: 'timeStep' }
  ],
  json: [
    { title: t('rule.validJson'), value: 'validJson' },
    { title: t('rule.maxDepth'), value: 'maxDepth' },
    { title: t('rule.requiredKeys'), value: 'requiredKeys' }
  ],
  boolean: [
    { title: t('rule.isTrue'), value: 'isTrue' }
  ],
  uuid: [
    { title: t('rule.validUuid'), value: 'validUuid' },
    { title: t('rule.uuidVersion'), value: 'uuidVersion' }
  ]
}))

const getAvailableRules = (type: string) => availableRulesByType.value[type] || [];


const addRule = (field: any) => {
  const defaultRule = getAvailableRules(field.type)[0];
  field.rulesList.push({ type: defaultRule ? defaultRule.value : 'regex', value: '', message: '' });
};

const removeRule = (field: any, index: number) => {
  field.rulesList.splice(index, 1);
};

// Kaydet İşlemi (ItemDialog'dan tetiklenir)
const saveItem = async (payload: any) => {
  // no hashtag stripping
  if (!payload.name || !payload.slug || !payload.fields || payload.fields.length === 0) {
    if ($toast) $toast.error(t('error.fillRequired'));
    return;
  }

  // Check for duplicate field names
  const fieldNames = payload.fields.map((f: any) => f.name);
  const duplicateName = fieldNames.find((name: string, index: number) => fieldNames.indexOf(name) !== index);
  if (duplicateName) {
    if ($toast) $toast.error(t('error.duplicateFieldName', { name: duplicateName }));
    return;
  }

  const normalizeI18nValue = (value: any): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    }
    return '';
  };

  const normalizedName = normalizeI18nValue(payload.name).trim();
  const normalizedSlug = String(payload.slug ?? '').trim();

  if (!normalizedName || !normalizedSlug) {
    if ($toast) $toast.error(t('error.fillRequired'));
    return;
  }

  // Schema'yı JSON Formatına Çevir
  const schemaObj: any = {};
  let orderIndex = 0;
  for (const f of payload.fields) {
    if (!f.name || f.name.trim() === '') continue;

    if (f.type === 'relation') {
      if (f.required && f.onDelete === 'setnull') {
        if ($toast) $toast.error(t('error.noSetNullIfRequired', { field: f.name }));
        return;
      }
      if (!f.onDelete) {
        f.onDelete = 'restrict';
      }
    }

    const rulesObj: any = { required: f.required, unique: f.unique };
    if (f.rulesList && f.rulesList.length > 0) {
      rulesObj.custom = f.rulesList.map((r: any) => ({
        type: r.type,
        value: ['min', 'max', 'minLength', 'maxLength'].includes(r.type) ? Number(r.value) : r.value,
        message: r.message
      }));
    }

    schemaObj[f.name.trim()] = {
      label: f.label,
      type: f.type,
      rules: rulesObj,
      targetEntityId: f.type === 'relation' ? f.targetEntityId : undefined,
      onDelete: f.type === 'relation' ? (f.onDelete || 'restrict') : undefined,
      options: f.type === 'enum' ? f.options : undefined,
      isPrimary: f.isPrimary || false,
      showInTable: f.showInTable !== false,
      hashAlgorithm: f.type === 'password' ? (f.hashAlgorithm || 'plain') : undefined,
      _order: orderIndex++
    };
  }

  try {
    if (dialogMode.value === 'edit') {
      await $fetch(`/api/admin/entities/${editId.value}`, {
        method: 'PUT',
        body: { name: normalizedName, slug: normalizedSlug, schema: schemaObj, hashtags: payload.hashtags || [] }
      });
    } else {
      await $fetch('/api/admin/entities', {
        method: 'POST',
        body: { name: normalizedName, slug: normalizedSlug, schema: schemaObj, hashtags: payload.hashtags || [] }
      });
    }

    dialog.value = false;
    if ($toast) $toast.success(dialogMode.value === 'edit' ? t('message.entityUpdated', { name: t('entity.entity') }) : t('message.entityCreated', { name: t('entity.entity') }));
    crudTable.value?.loadItems(); // Tabloyu yenile
    crudTable.value?.loadItems(); // ER diyagramını güncellemek için listeyi yenile
  } catch (e: any) {
        const errPayload = err?.data || e?.data;
    const isArr = Array.isArray(errPayload?.data);
    const errData = isArr ? errPayload.data[0] : (errPayload?.data || {});
    const errMsg = isArr ? errPayload.data[0].message : (errPayload?.message || 'errors.operationFailed');
    if ($toast) $toast.error(t(errMsg, errData));
  }
};

const handleDelete = async (item: any) => {
  if (!confirm(t('confirm.delete', { name: item.name }))) return;
  try {
    await $fetch(`/api/admin/entities/${item.id}`, { method: 'DELETE' });
    if ($toast) $toast.success(t('message.entityDeleted', { name: t('entity.entity') }));
    crudTable.value?.loadItems();
    crudTable.value?.loadItems(); // ER diyagramını güncellemek için listeyi yenile
  } catch (e: any) {
        const errPayload = err?.data || e?.data;
    const isArr = Array.isArray(errPayload?.data);
    const errData = isArr ? errPayload.data[0] : (errPayload?.data || {});
    const errMsg = isArr ? errPayload.data[0].message : (errPayload?.message || 'errors.operationFailed');
    if ($toast) $toast.error(t(errMsg, errData));
  }
};
</script>

<style scoped>
.er-fullscreen-card {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 1500 !important;
  border-radius: 0 !important;
  margin-top: 0 !important;
  display: flex;
  flex-direction: column;
}

.er-fullscreen-card .er-editor-wrapper {
  flex: 1;
  height: 100%;
}
</style>
