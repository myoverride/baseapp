const { $i18n } = useNuxtApp();
    const t = (key, fallback = '') => {
      try {
        return $i18n?.global?.t ? $i18n.global.t(key) : (fallback || key);
      } catch {
        return fallback || key;
      }
    };
    const currentDir = ref('');
    const parentDir = ref('');
    const currentDirInput = ref('');
    const files = ref([]);
    const loading = ref(false);
    const uploading = ref(false);
    const fileInput = ref(null);

    const editDialog = ref(false);
    const editingFileName = ref('');
    const editingContent = ref('');
    const editingFilePath = ref('');
    const saving = ref(false);

    const resolvePath = (name) => {
      return currentDir.value.endsWith('/') || currentDir.value.endsWith('\\')
        ? currentDir.value + name
        : currentDir.value + '/' + name;
    };

    const loadDir = async (path = '') => {
      loading.value = true;
      try {
        const res = await fetch('/api/winscp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list', targetPath: path })
        });
        const json = await res.json();
        if (json.success) {
          currentDir.value = json.currentDir;
          currentDirInput.value = json.currentDir;
          parentDir.value = json.parentDir;
          files.value = json.files;
        } else {
          alert(t('customPage.winscp.folderOpenFailed') + ' : ' + (json.error || t('common.unknownError')));
        }
      } catch (e) { } finally { loading.value = false; }
    };

    const goUp = () => {
      if (currentDir.value !== parentDir.value) loadDir(parentDir.value);
    };

    // 1. İNDİRME İŞLEMİ (DOWNLOAD)
    const downloadItem = async (item) => {
      loading.value = true;
      try {
        const res = await fetch('/api/winscp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'download', targetPath: resolvePath(item.name) })
        });
        const json = await res.json();
        if (json.success && json.base64) {
          // Gelen Base64 verisini gerçek dosyaya dönüştürüp tarayıcıdan indirtiyoruz
          const link = document.createElement('a');
          link.href = 'data:application/octet-stream;base64,' + json.base64;
          link.download = json.fileName || item.name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          alert(t('customPage.winscp.downloadFailed') + ' : ' + (json.error || t('common.unknownError')));
        }
      } catch (e) {
        alert(t('customPage.winscp.connectionError') + ': ' + (e?.message || t('common.unknownError')));
      } finally { loading.value = false; }
    };

    // 2. YÜKLEME İŞLEMİ (UPLOAD)
    const onFileSelected = async (event) => {
      const selectedFiles = event.target.files;
      if (!selectedFiles || selectedFiles.length === 0) return;

      uploading.value = true;
      for (const file of selectedFiles) {
        try {
          const reader = new FileReader();
          const base64Data = await new Promise((resolve) => {
            reader.onload = (e) => resolve(e.target.result.split(',')[1]); // Sadece saf base64 kısmını alıyoruz
            reader.readAsDataURL(file);
          });

          const res = await fetch('/api/winscp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'upload', targetPath: resolvePath(file.name), content: base64Data })
          });
          const json = await res.json();
          if (!json.success) alert(file.name + ' ' + t('customPage.winscp.uploadFailedSuffix') + ' : ' + (json.error || t('common.unknownError')));
        } catch (e) {
          alert(file.name + ' ' + t('customPage.winscp.errorSuffix') + ' : ' + (e?.message || t('common.unknownError')));
        }
      }
      
      if (fileInput.value) fileInput.value.value = '';
      uploading.value = false;
      loadDir(currentDir.value); // Yükleme bitince klasörü yenile
    };

    // 3. METİN EDİTÖRÜ (Düzenleme)
    const openEditor = async (item) => {
      const targetPath = resolvePath(item.name);
      loading.value = true;
      try {
        const res = await fetch('/api/winscp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'read', targetPath })
        });
        const json = await res.json();
        if (json.success) {
          editingFileName.value = item.name;
          editingFilePath.value = targetPath;
          editingContent.value = json.content;
          editDialog.value = true;
        } else {
          alert(t('customPage.winscp.fileOpenFailed') + ': ' + (json.error || t('common.unknownError')));
        }
      } catch(e) { } finally { loading.value = false; }
    };

    const saveFile = async () => {
      saving.value = true;
      try {
        const res = await fetch('/api/winscp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'write', targetPath: editingFilePath.value, content: editingContent.value })
        });
        const json = await res.json();
        if (json.success) editDialog.value = false;
        else alert(t('common.saveFailed') + ': ' + (json.error || t('common.unknownError')));
      } catch(e) { } finally { saving.value = false; }
    };

    const deleteItem = async (item) => {
      if (!confirm('' + item.name +   + t('customPage.winscp.deleteConfirmMid') + ' ' + (item.isDirectory ? t('customPage.winscp.folderNounAccusative') : t('customPage.winscp.fileNounAccusative')) + ' ' + t('customPage.winscp.deleteConfirmSuffix'))) return;
      loading.value = true;
      try {
        const res = await fetch('/api/winscp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', targetPath: resolvePath(item.name) })
        });
        const json = await res.json();
        if (json.success) loadDir(currentDir.value);
        else alert(t('customPage.winscp.deleteFailed') + ': ' + (json.error || t('common.unknownError')));
      } catch(e) { } finally { loading.value = false; }
    };

    const promptNewFolder = async () => {
      const name = prompt(t('customPage.winscp.newFolderPrompt'));
      if (!name) return;
      loading.value = true;
      try {
        const res = await fetch('/api/winscp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'mkdir', targetPath: resolvePath(name) })
        });
        const json = await res.json();
        if (json.success) loadDir(currentDir.value);
        else alert(t('customPage.winscp.createFolderFailed') + ': ' + (json.error || t('common.unknownError')));
      } catch(e) { } finally { loading.value = false; }
    };

    const formatSize = (bytes) => {
      if (bytes === 0) return '0 ' + t('customPage.common.bytes');
      const k = 1024;
      const sizes = [t('customPage.common.bytes'), 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (isoStr) => {
      if (!isoStr) return '-';
      return new Date(isoStr).toLocaleString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    onMounted(() => loadDir(''));

    return {
      currentDir, parentDir, currentDirInput, files, loading, uploading, fileInput,
      editDialog, editingFileName, editingContent, saving, editingFilePath,
      loadDir, goUp, resolvePath, openEditor, saveFile, deleteItem, promptNewFolder,
      downloadItem, onFileSelected, formatSize, formatDate
    };