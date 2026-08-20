const { $i18n } = useNuxtApp();
    const t = (key, fallback = '') => {
      try {
        return $i18n?.global?.t ? $i18n.global.t(key) : (fallback || key);
      } catch {
        return fallback || key;
      }
    };
    const query = ref('');
    const loading = ref(false);
    const results = ref([]);
    const columns = ref([]);
    const errorMsg = ref('');
    const successMsg = ref('');

    const runQuery = async () => {
      if (!query.value.trim()) return;
      loading.value = true;
      errorMsg.value = '';
      successMsg.value = '';
      results.value = [];
      columns.value = [];

      try {
        const res = await fetch('/api/dbstudio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query.value })
        });
        const json = await res.json();
        
        if (json.success) {
          if (Array.isArray(json.data) && json.data.length > 0) {
            results.value = json.data;
            columns.value = Object.keys(json.data[0]);
          } else {
            successMsg.value = 'customPage.dbstudio.querySuccessNoRows';
          }
        } else {
          errorMsg.value = json.error || t('customPage.dbstudio.unknownDbError');
        }
      } catch (e) {
        errorMsg.value = t('customPage.dbstudio.connectionError') + ': ' + (e?.message || t('common.unknownError'));
      } finally {
        loading.value = false;
      }
    };

    return { query, loading, results, columns, errorMsg, successMsg, runQuery };