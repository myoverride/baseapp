<template>
  <v-container>
    <div class="mb-4 d-flex align-center justify-space-between">
      <v-btn prepend-icon="mdi-arrow-left" variant="text" to="/" class="text-none font-weight-medium px-0 text-body-1" color="grey-darken-2">
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
                <p class="text-body-2 text-grey-darken-1 mb-4">
                  {{ $t('appStudio.description') }}
                </p>
                <div class="d-flex align-center">
                  <v-combobox
                    v-model="appTag"
                    :items="availableTags"
                    :label="$t('appStudio.tagLabel')"
                    variant="outlined"
                    density="comfortable"
                    hide-details
                    prepend-inner-icon="mdi-tag"
                    class="mr-4"
                    clearable
                    multiple
                    chips
                    closable-chips
                    @keyup.enter="previewApp"
                  ></v-combobox>
                  <v-btn color="info" size="large" :loading="loading" @click="previewApp" prepend-icon="mdi-magnify">
                    {{ $t('appStudio.scan') }}
                  </v-btn>
                </div>
              </v-col>
              <v-col cols="12" md="4" class="text-right">
                 <v-btn color="success" size="large" prepend-icon="mdi-download" :disabled="!hasData" @click="exportApp" class="mb-2 w-100">
                    {{ $t('action.export') }}
                 </v-btn>
                 <v-btn color="warning" size="large" prepend-icon="mdi-upload" @click="triggerImport" class="w-100">
                    {{ $t('action.import') }}
                 </v-btn>
                 <input type="file" ref="importInput" accept=".json" style="display: none" @change="importApp">
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <v-card v-if="appData" class="elevation-2 rounded-lg border-info-lighten-4 mt-4">
          <v-toolbar color="info" height="50" class="px-2" density="compact">
            <v-icon class="mr-2" size="small">mdi-chart-pie</v-icon>
            <v-toolbar-title class="text-subtitle-2 font-weight-bold">{{ appTag }} {{ $t('appStudio.moduleContent') }}</v-toolbar-title>
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
                    <v-chip color="info" size="small" class="ml-auto mr-4">{{ items.length }} {{ $t('appStudio.itemsCount') }}</v-chip>
                  </v-expansion-panel-title>
                  <v-expansion-panel-text class="pa-0 bg-grey-lighten-4">
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
const { primaryColor: color } = useSysVars();
import { ref, computed, onMounted } from 'vue'
import { useNuxtApp } from '#app'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
useHead({ title: () => t('appStudio.title') || 'App Studio' })

import Pages from './pages.vue'
import Endpoints from './endpoints.vue'
import Workers from './workers.vue'
import Utils from './utils.vue'
import Entities from './entities.vue'
import Roles from './roles.vue'
import Users from './users.vue'
import SystemSettings from './system-settings.vue'
import Devices from './devices.vue'
import I18n from './i18n.vue'

const componentMap: Record<string, any> = {
  pages: Pages,
  endpoints: Endpoints,
  workers: Workers,
  utils: Utils,
  entities: Entities,
  roles: Roles,
  users: Users,
  system_variables: SystemSettings,
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

const hasData = computed(() => !!appData.value)

const previewApp = async () => {
  const selectedTags = Array.isArray(appTag.value) ? appTag.value : (appTag.value ? [appTag.value] : [])
  if (selectedTags.length === 0 || selectedTags.every(t => !t.trim())) {
    if ($toast) $toast.warning(t('appStudio.selectTagWarning') || 'Lütfen en az bir etiket girin veya seçin.')
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
    if ($toast) $toast.success(`${res.app_name} ${t('message.success') || 'başarıyla tarandı.'}`)
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
  if ($toast) $toast.success(t('message.success') || 'Uygulama başarıyla indirildi.')
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
         throw new Error(t('error.invalidFormat') || 'Geçersiz Uygulama Paketi Formatı')
      }
      
      if ($toast) $toast.info(t('common.loading') || 'İçe aktarılıyor, lütfen bekleyin...')
      loading.value = true
      
      const res = await $fetch<any>('/api/admin/app-studio/import', {
        method: 'POST',
        body: payload
      })
      
      if ($toast) $toast.success(res.message || t('message.success') || 'Uygulama başarıyla içeri aktarıldı.')
      
      // Auto preview after import
      appTag.value = payload.tag
      await previewApp()
      
    } catch (err: any) {
      if ($toast) $toast.error(t(err.data?.message || 'error.importError'))
    } finally {
      loading.value = false
      if (importInput.value) importInput.value.value = ''
    }
  }
  
  reader.readAsText(file)
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
