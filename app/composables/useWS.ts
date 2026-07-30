import { onMounted, onUnmounted, ref } from 'vue';

export function useWS(path: string, onMessage: (data: any) => void) {
  const ws = ref<WebSocket | null>(null);
  let reconnectTimer: any = null;
  let isUnmounted = false;
  let retryCount = 0;

  const connect = () => {
    if (isUnmounted) return;
    
    // Protokol özel belirlenir (SSL destekli)
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    // Doğrudan full path veriliyor, örn: /api/ws/kazan
    ws.value = new WebSocket(`${protocol}//${location.host}${path}`);
    
    ws.value.onopen = () => {
      retryCount = 0; // Başarılı bağlantıda retry sıfırlanır
      console.log(`[WS] Connected to ${path}`);
    };
    
    ws.value.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (err) {
        console.warn('[WS] Payload parse error:', err, 'Raw:', event.data);
        // JSON değilse direkt raw metni yolla
        onMessage(event.data);
      }
    };
    
    ws.value.onclose = (event) => {
      if (isUnmounted) return;
      
      // Eğer sunucu yetki hatası döndüyse (örn: 4001, 4003) yeniden deneme
      if (event.code === 4001 || event.code === 4003 || event.code === 4004) {
        console.error(`[WS] Bağlantı reddedildi (${event.code}: ${event.reason}). Lütfen yetkilerinizi kontrol edin.`);
        return;
      }

      // Exponential backoff reconnect
      const timeout = Math.min(1000 * Math.pow(1.5, retryCount), 10000);
      retryCount++;
      console.log(`[WS] Reconnecting to ${path} in ${Math.round(timeout)}ms...`);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, timeout);
    };
    
    ws.value.onerror = (err) => {
      console.error(`[WS] Connection error on ${path}`);
    };
  };

  onMounted(() => {
    isUnmounted = false;
    connect();
  });

  onUnmounted(() => {
    isUnmounted = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws.value) {
      ws.value.onclose = null; // Kapatırken onclose tetiklenip reconnect yapmasın
      ws.value.close();
    }
  });

  return { ws };
}
