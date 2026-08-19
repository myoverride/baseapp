<template>
  <v-container>
    <div class="mb-4 d-flex align-center justify-space-between">
      <v-btn prepend-icon="mdi-arrow-left" variant="text" to="/" class="text-none font-weight-medium px-0 text-body-1"
        color="primary">
        {{ $t('common.home') }}
      </v-btn>
    </div>

    <v-card class="elevation-2 rounded-lg border-primary-lighten-4 mb-4">
      <v-toolbar :color="color" height="76" class="px-2">
        <v-icon class="mr-2">mdi-application-brackets</v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">{{ $t('appStudio.title') }}</v-toolbar-title>
      </v-toolbar>

      <v-card-text class="pt-6">
        <v-row align="center">
          <v-col cols="12" md="8">
            <p class="text-body-2 opacity-70 mb-4">
              {{ $t('appStudio.description') }}
            </p>
            <div class="d-flex align-center">
              <v-combobox v-model="appTag" :items="availableTags" :label="$t('appStudio.tagLabel')" variant="outlined"
                density="comfortable" hide-details prepend-inner-icon="mdi-tag" class="mr-4" clearable multiple chips
                closable-chips @keyup.enter="previewApp"></v-combobox>
              <v-btn color="info" size="large" :loading="loading" @click="previewApp" prepend-icon="mdi-magnify">
                {{ $t('appStudio.scan') }}
              </v-btn>
            </div>
          </v-col>
          <v-col cols="12" md="4" class="text-right">
            <v-btn color="success" size="large" prepend-icon="mdi-download" :disabled="!hasData" @click="exportApp"
              class="mb-2 w-100">
              {{ $t('action.export') }}
            </v-btn>
            <v-btn color="warning" size="large" prepend-icon="mdi-upload" @click="triggerImport" class="w-100">
              {{ $t('action.import') }}
            </v-btn>
            <input type="file" ref="importInput" accept=".json" style="display: none" @change="importApp">
          </v-col>
        </v-row>
        <v-row v-if="importProgress.active" class="mt-4">
          <v-col cols="12">
            <v-card variant="outlined" color="info" class="pa-4">
              <div class="d-flex justify-space-between mb-2">
                <span class="font-weight-medium">{{ $t('message.importing') }}...</span>
                <span class="font-weight-bold">{{ importProgress.percentage }}% ({{ importProgress.processed }} / {{
                  importProgress.total }})</span>
              </div>
              <v-progress-linear :model-value="importProgress.percentage" color="info" height="12" rounded striped
                :indeterminate="importProgress.total === 0"></v-progress-linear>
              <v-alert v-if="importProgress.errors.length > 0" type="warning" density="compact" class="mt-4"
                icon="mdi-alert">
                <div class="text-caption" style="max-height: 100px; overflow-y: auto;">
                  <div v-for="(err, i) in importProgress.errors" :key="i">{{ err }}</div>
                </div>
              </v-alert>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- IMPORT CONFIRMATION DIALOG -->
    <v-dialog v-model="importDialog" max-width="500" transition="dialog-bottom-transition">
      <v-card class="fill-height d-flex flex-column">
        <v-toolbar :color="color" height="76" class="px-2 flex-grow-0">
          <v-toolbar-title class="text-h6 font-weight-bold">
            {{ $t('appStudio.importConfirmTitle') }}
          </v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn icon="mdi-close" variant="text" size="small" @click="importDialog = false"></v-btn>
        </v-toolbar>

        <v-card-text class="pa-4 flex-grow-1 d-flex flex-column" style="overflow-y: auto;">
          <p class="mb-4 text-body-1">
            <span
              v-html="$t('appStudio.importConfirmDesc1', { app: `<strong>${pendingPayload?.app_name || 'Uygulama'}</strong>` })"></span>
          </p>
          <p class="mb-4 text-caption text-medium-emphasis">
            {{ $t('appStudio.importConfirmDesc2') }}
          </p>

          <v-radio-group v-model="importStrategy" :color="color">
            <v-radio v-for="opt in strategyOptions" :key="opt.value" :value="opt.value">
              <template v-slot:label>
                <div class="mt-2 mb-2">
                  <div class="font-weight-bold text-body-2">{{ opt.title }}</div>
                  <div class="text-caption text-medium-emphasis">{{ opt.desc }}</div>
                </div>
              </template>
            </v-radio>
          </v-radio-group>
        </v-card-text>

        <v-divider />

        <v-card-actions class="pa-3">
          <v-spacer></v-spacer>
          <v-btn @click="importDialog = false" :aria-label="$t('common.cancel')">
            {{ $t('common.cancel') }}
          </v-btn>
          <v-btn :color="color" variant="elevated" @click="confirmImport" :loading="loading"
            :aria-label="$t('appStudio.confirmAndStart')">
            {{ $t('appStudio.confirmAndStart') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-card v-if="appData" class="elevation-2 rounded-lg border-info-lighten-4 mt-4">
      <v-toolbar color="info" height="76" class="px-2">
        <v-icon class="mr-2" size="small">mdi-chart-pie</v-icon>
        <v-toolbar-title class="text-subtitle-2 font-weight-bold">{{ appTag }} {{ $t('appStudio.moduleContent')
        }}</v-toolbar-title>
      </v-toolbar>
      <v-card-text class="pt-4 pa-0">
        <v-expansion-panels variant="accordion" :key="refreshKey">
          <template v-for="(items, key) in appData.components" :key="key">
            <v-expansion-panel v-if="items.length > 0 && componentMap[key]">
              <v-expansion-panel-title class="text-h6 font-weight-bold d-flex justify-space-between align-center">
                <div>
                  <v-icon :color="color" class="mr-2">mdi-folder-outline</v-icon>
                  <span class="text-uppercase">{{ String(key).replace('_', ' ') }}</span>
                </div>
                <v-chip color="info" size="small" class="ml-auto mr-4">{{ items.length }} {{ $t('appStudio.itemsCount')
                }}</v-chip>
              </v-expansion-panel-title>
              <v-expansion-panel-text class="pa-0 bg-background">
                <component :is="componentMap[key]" :hideHeader="true" class="pa-0" />
              </v-expansion-panel-text>
            </v-expansion-panel>
          </template>
        </v-expansion-panels>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
const { primaryColor: color } = useGlobals();
import { ref, computed, onMounted } from 'vue'
import { useNuxtApp } from '#app'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
useHead({ title: () => t('appStudio.title') || 'App Studio' })

import Pages from './pages.vue'
import Endpoints from './endpoints.vue'
import Workers from './workers.vue'
import Globals from './globals.vue'
import Entities from './entities.vue'
import Roles from './roles.vue'
import Users from './users.vue'
import Devices from './devices.vue'
import I18n from './i18n.vue'

const componentMap: Record<string, any> = {
  pages: Pages,
  endpoints: Endpoints,
  workers: Workers,
  globals: Globals,
  entities: Entities,
  roles: Roles,
  users: Users,
  languages: I18n,
  devices: Devices
}

const router = useRouter()
const route = useRoute()
const { $toast } = useNuxtApp() as any;
const refreshKey = ref(0)

const appTag = ref<string[]>([])
const loading = ref(false)
const appData = ref<any>(null)
const importInput = ref<HTMLInputElement | null>(null)
const availableTags = ref<string[]>([])

const importStrategy = ref('skip')
const strategyOptions = computed(() => [
  { title: t('appStudio.strategy.skip.title'), value: 'skip', desc: t('appStudio.strategy.skip.desc') },
  { title: t('appStudio.strategy.overwrite.title'), value: 'overwrite', desc: t('appStudio.strategy.overwrite.desc') },
  { title: t('appStudio.strategy.newer.title'), value: 'newer', desc: t('appStudio.strategy.newer.desc') },
  { title: t('appStudio.strategy.abort.title'), value: 'abort', desc: t('appStudio.strategy.abort.desc') }
])

const importDialog = ref(false)
const pendingPayload = ref<any>(null)

const importProgress = ref({
  active: false,
  percentage: 0,
  processed: 0,
  total: 0,
  errors: [] as string[]
})
let progressInterval: any = null;

const hasData = computed(() => !!appData.value)

const previewApp = async () => {
  const selectedTags = Array.isArray(appTag.value) ? appTag.value : (appTag.value ? [appTag.value] : [])
  if (selectedTags.length === 0 || selectedTags.every(t => !t.trim())) {
    if ($toast) $toast.warning(t('appStudio.selectTagWarning'))
    return
  }

  const tagParam = selectedTags.map(t => t.trim()).filter(Boolean).join(',')

  const filterGroup = {
    logic: 'AND',
    conditions: selectedTags.map(t => {
      const tag = t.trim();
      return { field: 'hashtags', operator: 'contains', value: tag };
    })
  }

  router.push({ query: { tags: tagParam, advancedFilters: JSON.stringify(filterGroup) } })
  refreshKey.value++

  loading.value = true
  try {
    const res = await $fetch<any>(`/api/admin/app-studio/export?tag=${encodeURIComponent(tagParam)}`)
    appData.value = res
    if ($toast) $toast.success(`${res.app_name} ${t('message.scanned')}`)
  } catch (e: any) {
    if ($toast) $toast.error(t(e.data?.message || 'appStudio.scanFailed'))
    appData.value = null
  } finally {
    loading.value = false
  }
}

const exportApp = () => {
  if (!appData.value) return

  const blob = new Blob([JSON.stringify(appData.value, null, 2)], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safeName = appData.value.app_name.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  a.download = `${safeName}_export_${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  if ($toast) $toast.success(t('message.exported'))
}

const triggerImport = () => {
  importInput.value?.click()
}

const importApp = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return

  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()

  reader.onload = async (e) => {
    try {
      const content = e.target?.result as string
      const payload = JSON.parse(content)

      if (!payload.tag || !payload.components) {
        throw new Error(t('error.invalidFormat'))
      }

      pendingPayload.value = payload;
      importDialog.value = true;
      if (importInput.value) importInput.value.value = ''; // reset file input

    } catch (err: any) {
      if ($toast) $toast.error(t(err.data?.message || 'error.importError'))
    }
  }

  reader.readAsText(file)
}

const confirmImport = async () => {
  if (!pendingPayload.value) return;
  const payload = pendingPayload.value;
  payload.strategy = importStrategy.value;

  importDialog.value = false;
  if ($toast) $toast.info(t('message.importing'))
  loading.value = true

  const importId = Date.now().toString()
  importProgress.value = { active: true, percentage: 0, processed: 0, total: 0, errors: [] }

  progressInterval = setInterval(async () => {
    try {
      const p = await $fetch<any>(`/api/admin/app-studio/import-progress?importId=${importId}`)
      if (p && p.success && p.data) {
        importProgress.value.percentage = p.data.percentage
        importProgress.value.processed = p.data.processed
        importProgress.value.total = p.data.total
        importProgress.value.errors = p.data.errors
      }
    } catch (e) { }
  }, 1000)

  try {
    const res = await $fetch<any>(`/api/admin/app-studio/import?importId=${importId}`, {
      method: 'POST',
      body: payload
    })

    if (res.errors && res.errors.length > 0) {
      if ($toast) $toast.warning(t('appStudio.importWarning'))
      importProgress.value.errors = res.errors
    } else {
      if ($toast) $toast.success(res.message || t('message.imported'))
    }

    // Auto preview after import
    appTag.value = payload.tag
    await previewApp()

  } catch (err: any) {
    if ($toast) $toast.error(err.data?.details || err.data?.message || t('appStudio.criticalImportError'))
  } finally {
    loading.value = false
    if (progressInterval) clearInterval(progressInterval)
    importProgress.value.active = false
    pendingPayload.value = null;
  }
}

onMounted(async () => {
  try {
    const tags = await $fetch<string[]>('/api/admin/app-studio/tags');
    availableTags.value = tags || [];
  } catch (e) {

  }
})
</script>

<style scoped>
:deep(.v-container > .mb-4) {
  display: none !important;
}
</style>

<style scoped>
.h-100 {
  height: 100%;
}
</style>
