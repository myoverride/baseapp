import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useNuxtApp } from '#app';

export function useJsonExportImport(apiEndpoint: string, crudTableRef: any) {
  const { t } = useI18n();
  const { $toast } = useNuxtApp() as any;

  const jsonExportLoading = ref(false);
  const jsonImportLoading = ref(false);
  const jsonInputRef = ref<HTMLInputElement | null>(null);

  const triggerJSONImport = () => {
      jsonInputRef.value?.click();
  };

  const exportSingleJSON = async (item: any, filenamePrefix = 'export') => {
      let fullItem = { ...item };
      try {
          if (item.id) {
              const res = await $fetch<any>(`${apiEndpoint}/${item.id}`);
              if (res && typeof res === 'object') {
                  fullItem = { ...fullItem, ...res };
              }
          }
      } catch (e) {
          console.warn('Failed to fetch full item for export', e);
      }

      // Strip system fields 
      const exportData = [fullItem];
      delete exportData[0].id;
      delete exportData[0].created_at;
      delete exportData[0].updated_at;
      delete exportData[0].created_by;
      delete exportData[0].updated_by;
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const exportJSON = async (filenamePrefix = 'export') => {
      jsonExportLoading.value = true;
      try {
          const response = await $fetch<any>(apiEndpoint, {
              params: { export: true, limit: 100000 }
          });

          const data = Array.isArray(response) ? response : (response.records || response.data || []);
          if (data.length === 0) {
              if ($toast) $toast.warning(t('common.noData'));
              return;
          }

          // Strip id, created_at, updated_at
          const exportData = data.map((item: any) => {
              const { id, created_at, updated_at, created_by, updated_by, ...rest } = item;
              return rest;
          });

          const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${filenamePrefix}_export_${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      } catch (e: any) {
          console.error('JSON Export Error:', e);
          if ($toast) $toast.error(t('error.operationFailed') + ' ' + (e.data?.message || e.message));
      } finally {
          jsonExportLoading.value = false;
      }
  };

  const importJSON = async (event: Event) => {
      const input = event.target as HTMLInputElement;
      if (!input.files || input.files.length === 0) {
          if ($toast) $toast.warning(t('message.selectFile'));
          return;
      }
      
      const file = input.files[0] as File;
      jsonImportLoading.value = true;
      
      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const text = e.target?.result as string;
              const recordsToImport = JSON.parse(text);

              if (!Array.isArray(recordsToImport)) {
                  throw new Error(t('error.invalidFormat'));
              }

              const res = await $fetch<any>(apiEndpoint, {
                  method: 'POST',
                  body: { records: recordsToImport }
              });
              
              if ($toast) $toast.success(res.message || t('message.success'));
              if (crudTableRef && crudTableRef.value) {
                  crudTableRef.value.loadItems();
              }
          } catch (err: any) {
              console.error('JSON Import Error:', err);
              if ($toast) $toast.error(t('error.operationFailed') + ' ' + (err.data?.message || err.message));
          } finally {
              jsonImportLoading.value = false;
              if (input) input.value = '';
          }
      };
      reader.onerror = () => {
          if ($toast) $toast.error(t('message.fileReadError'));
          jsonImportLoading.value = false;
          if (input) input.value = '';
      };
      reader.readAsText(file);
  };

  return {
      jsonExportLoading,
      jsonImportLoading,
      jsonInputRef,
      triggerJSONImport,
      exportSingleJSON,
      exportJSON,
      importJSON
  };
}
