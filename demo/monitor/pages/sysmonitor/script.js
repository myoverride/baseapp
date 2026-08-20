const { $i18n } = useNuxtApp();
    const t = (key, fallback = '') => {
      try {
        return $i18n?.global?.t ? $i18n.global.t(key) : (fallback || key);
      } catch {
        return fallback || key;
      }
    };
    const loading = ref(false);
    const errorMsg = ref('');
    const sys = ref(null);
    let interval = null;

    const ramPercent = computed(() => {
      if (!sys.value?.memory?.total) return 0;
      const used = sys.value.memory.used;
      return Math.round((used / sys.value.memory.total) * 100);
    });

    const fetchStats = async (isBackground = false) => {
      // Sadece butona tıklandığında veya ilk açılışta loading animasyonu çıksın
      if (!isBackground) loading.value = true; 
      errorMsg.value = '';
      
      try {
        const res = await $fetch('/api/sysmonitor', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (res.success && res.data) {
          sys.value = res.data; // Vue'nun reaktif yapısı ekran titretmeden günceller
        } else {
          if (!isBackground) errorMsg.value = res.error || t('customPage.sysmonitor.dataFetchFailed');
        }
      } catch (e) { 
        if (!isBackground) errorMsg.value = e?.data?.error || e?.message || t('customPage.sysmonitor.serverUnreachable');
      } finally {
        if (!isBackground) loading.value = false;
      }
    };

    const formatSize = (bytes) => {
      if (!bytes || bytes === 0) return '0 ' + t('customPage.common.bytes');
      const k = 1024;
      const sizes = [t('customPage.common.bytes'), 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatUptime = (seconds) => {
      if (!seconds) return '0s';
      const d = Math.floor(seconds / (3600*24));
      const h = Math.floor(seconds % (3600*24) / 3600);
      const m = Math.floor(seconds % 3600 / 60);
      
      const parts = [];
      if (d > 0) parts.push(`${d}${t('customPage.sysmonitor.dayShort')}`);
      if (h > 0) parts.push(`${h}${t('customPage.sysmonitor.hourShort')}`);
      if (m > 0) parts.push(`${m}${t('customPage.sysmonitor.minuteShort')}`);
      if (parts.length === 0) parts.push(`${Math.floor(seconds)}${t('customPage.sysmonitor.secondShort')}`);
      return parts.join(' ');
    };

    onMounted(() => {
      fetchStats(false);
      // Arka plan yenilemesinde true parametresi geçilerek buton loading animasyonu ve titreme engellendi
      interval = setInterval(() => fetchStats(true), 5000); 
    });

    onUnmounted(() => {
      if (interval) clearInterval(interval);
    });

    return { 
      sys, 
      loading, 
      errorMsg,
      ramPercent, 
      fetchStats, 
      formatSize, 
      formatUptime
    };