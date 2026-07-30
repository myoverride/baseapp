<template>
  <div class="virtual-console d-flex flex-column border rounded" :style="{ height: height || '200px' }">
    <div class="console-header d-flex align-center justify-space-between px-2 py-1 bg-grey-darken-4 text-white text-caption">
      <div class="d-flex align-center">
        <v-icon size="small" class="mr-1" :color="connected ? 'success' : 'error'">
          {{ connected ? 'mdi-wifi' : 'mdi-wifi-off' }}
        </v-icon>
        <span class="font-weight-bold">{{ $t('common.virtualConsole') }} ({{ sourceId || $t('console.notReady') }})</span>
      </div>
      <div>
        <v-btn icon size="x-small" variant="text" @click="logs = []" :title="$t('common.clear')" color="grey-lighten-1">
          <v-icon>mdi-delete-sweep</v-icon>
        </v-btn>
      </div>
    </div>
    
    <div ref="logContainer" class="console-body flex-grow-1 bg-black pa-2 overflow-y-auto">
      <div v-if="logs.length === 0" class="text-grey-darken-2 text-caption font-italic">
        {{ connected ? $t('console.connected') : $t('console.connecting') }}
      </div>
      
      <div 
        v-for="(log, idx) in logs" 
        :key="idx" 
        class="log-entry mt-1 text-caption font-monospace"
        :class="getLogColorClass(log.level)"
        style="word-break: break-all;"
      >
        <span class="log-time text-grey-darken-1 mr-2">[{{ formatTime(log.timestamp) }}]</span>
        <span class="log-message">
          <template v-for="(arg, aIdx) in log.args" :key="aIdx">
            {{ formatArg(arg) }}<span v-if="Number(aIdx) < log.args.length - 1"> </span>
          </template>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

// Tenant tespiti
const route = useRoute();
let tenantSlug = '';
if (route.path.startsWith('/tenant/')) {
  tenantSlug = route.path.split('/')[2] || '';
}

const props = defineProps<{
  sourceId: string | number | null;
  height?: string;
  filterFn?: (log: any) => boolean;
}>();

const { t } = useI18n();
const logs = ref<any[]>([]);
const logContainer = ref<HTMLElement | null>(null);
const connected = ref(false);
let isUnmounted = false;
let reconnectAttempts = ref(0);
const MAX_RECONNECT_ATTEMPTS = 5;
let ws: WebSocket | null = null;

const formatTime = (isoStr?: string) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
};

const formatArg = (arg: any) => {
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
};

const getLogColorClass = (level: string) => {
  switch(level) {
    case 'error': return 'text-red-accent-2';
    case 'warn': return 'text-amber';
    case 'info': return 'text-blue-lighten-2';
    default: return 'text-green-accent-3';
  }
};

const connectWs = () => {
  if (ws) {
    ws.close();
    ws = null;
  }
  
  if (!props.sourceId) {
    connected.value = false;
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const tenantQuery = tenantSlug ? `&tenant=${tenantSlug}` : '';
  const url = `${protocol}//${window.location.host}/api/ws/logs?id=${props.sourceId}${tenantQuery}`;
  
  ws = new WebSocket(url);
  
  ws.onopen = () => {
    connected.value = true;
    reconnectAttempts.value = 0; // Başarılı bağlantıda sıfırla
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'system') return; // Sistem mesajlarını atla
      
      if (props.filterFn && !props.filterFn(data)) return; // Filtrelendi, atla
      
      logs.value.push(data);
      if (logs.value.length > 500) {
        logs.value.shift();
      }
      
      // Auto scroll to bottom
      nextTick(() => {
        if (logContainer.value) {
          logContainer.value.scrollTop = logContainer.value.scrollHeight;
        }
      });
    } catch (e) {}
  };
  
  ws.onclose = () => {
    connected.value = false;
    
    if (reconnectAttempts.value < MAX_RECONNECT_ATTEMPTS && !isUnmounted) {
      reconnectAttempts.value++;
      // Otomatik yeniden bağlanma
      setTimeout(() => {
        if (props.sourceId && !connected.value && !isUnmounted) connectWs();
      }, 5000);
    } else if (!isUnmounted) {
      logs.value.push({
        level: 'error',
        timestamp: new Date().toISOString(),
        args: [t('console.maxRetries')]
      });
    }
  };
};

watch(() => props.sourceId, () => {
  logs.value = [];
  reconnectAttempts.value = 0;
  connectWs();
});

onMounted(() => {
  connectWs();
});

onBeforeUnmount(() => {
  isUnmounted = true;
  if (ws) ws.close();
});
</script>

<style scoped>
.font-monospace {
  font-family: 'Courier New', Courier, monospace;
}
</style>
