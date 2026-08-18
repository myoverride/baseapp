<template>
  <v-dialog v-model="isOpen" fullscreen transition="dialog-bottom-transition">
    <v-card class="fill-height d-flex flex-column">
      <v-toolbar :color="color" height="76" class="px-2 flex-grow-0">
        <v-toolbar-title class="text-h6 font-weight-bold">
          <v-icon start>mdi-history</v-icon> {{ $t('history.title') }}
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" size="small" @click="isOpen = false"></v-btn>
      </v-toolbar>
      
      <v-card-text class="pa-0 flex-grow-1 d-flex" style="overflow: hidden;">
        <!-- Sol Menü: Versiyon Listesi -->
        <div style="width: 250px; border-right: 1px solid rgba(0,0,0,0.1); overflow-y: auto; background-color: #f9f9f9;">
          <div v-if="loadingVersions" class="text-center py-4">
            <v-progress-circular indeterminate :color="color"></v-progress-circular>
            <div class="mt-2 text-caption">{{ $t('common.loading') }}</div>
          </div>
          
          <div v-else-if="versions.length === 0" class="text-center py-4 text-grey">
            {{ $t('common.noData') }}
          </div>
          
          <v-list v-else bg-color="transparent" density="compact" nav>
            <v-list-item
              v-for="(timestamp, idx) in versions"
              :key="timestamp"
              :active="selectedTimestamp === timestamp"
              :color="color"
              class="mb-1"
              @click="selectVersion(timestamp)"
            >
              <template v-slot:prepend>
                <v-icon size="small">mdi-source-commit</v-icon>
              </template>
              <v-list-item-title class="font-weight-medium text-body-2">
                {{ $t('history.version') }} {{ versions.length - idx }}
              </v-list-item-title>
              <v-list-item-subtitle class="text-caption">
                {{ formatDate(timestamp) }}
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </div>

        <!-- Sağ Taraf: Diff Editor -->
        <div class="flex-grow-1 d-flex flex-column">
          <div v-if="!selectedTimestamp" class="flex-grow-1 d-flex align-center justify-center text-grey">
            {{ $t('history.selectPrompt') }}
          </div>
          <div v-else class="flex-grow-1 d-flex flex-column">
            <!-- Araç Çubuğu -->
            <div class="pa-2 bg-background border-bottom d-flex align-center justify-space-between">
              <div>
                <span class="font-weight-bold ml-2">{{ $t('history.compare') }}</span>
                <span class="text-caption text-grey ml-2"><span v-html="$t('history.compareDesc')"></span></span>
              </div>
              <div>
                <v-btn size="small" color="success" prepend-icon="mdi-check" @click="restoreVersion">
                  {{ $t('history.restore') }}
                </v-btn>
              </div>
            </div>

            <!-- Editor -->
            <div class="flex-grow-1 relative" style="min-height: 0;">
              <div v-if="loadingContent" class="absolute-center">
                <v-progress-circular indeterminate :color="color"></v-progress-circular>
              </div>
              <MonacoDiffEditor
                v-else
                :original="historyCode"
                :modified="currentCode"
                :language="language"
                height="calc(100vh - 130px)"
                theme="vs-dark"
              />
            </div>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  modelValue: boolean;
  type: string;
  id: string | number;
  currentCode: string;
  language?: string;
  historyField?: string;
}>();

const emit = defineEmits(['update:modelValue', 'select']);

const { primaryColor: color } = useGlobals();
const { t } = useI18n();

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const versions = ref<string[]>([]);
const loadingVersions = ref(false);

const selectedTimestamp = ref<string | null>(null);
const loadingContent = ref(false);
const historyCode = ref('');
const fullHistoryData = ref<any>(null); // To return the full object

const language = computed(() => props.language || 'javascript');

const formatDate = (ts: string) => {
  const d = new Date(parseInt(ts));
  return d.toLocaleString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
};

const loadHistory = async () => {
  if (!props.type || !props.id) return;
  loadingVersions.value = true;
  try {
    const res = await $fetch<any>('/api/admin/history', {
      params: { type: props.type, id: props.id }
    });
    versions.value = res.versions || [];
  } catch (err) {
    
  } finally {
    loadingVersions.value = false;
  }
};

const selectVersion = async (timestamp: string) => {
  selectedTimestamp.value = timestamp;
  loadingContent.value = true;
  try {
    const res = await $fetch<any>('/api/admin/history', {
      params: { type: props.type, id: props.id, timestamp }
    });
    if (res.success && res.data) {
      fullHistoryData.value = res.data;
      if (props.historyField && res.data[props.historyField] !== undefined) {
        historyCode.value = res.data[props.historyField];
      } else {
        historyCode.value = res.data.code || '';
      }
    }
  } catch (err) {
    alert(t('history.fetchError'));
  } finally {
    loadingContent.value = false;
  }
};

const restoreVersion = () => {
  if (fullHistoryData.value) {
    emit('select', fullHistoryData.value);
    isOpen.value = false;
  }
};

watch(isOpen, (val) => {
  if (val) {
    selectedTimestamp.value = null;
    historyCode.value = '';
    loadHistory();
  }
});
</script>

<style scoped>
.border-bottom {
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}
.absolute-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
}
</style>
