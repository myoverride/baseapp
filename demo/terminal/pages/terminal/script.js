const { $i18n } = useNuxtApp();
const t = (key, fallback = '') => {
  try {
    return $i18n?.global?.t ? $i18n.global.t(key) : (fallback || key);
  } catch {
    return fallback || key;
  }
};


const command = ref('');
const history = ref([]);
const loading = ref(false);
const terminalLog = ref(null);

const cmdHistory = ref([]);
const historyIndex = ref(-1);

const scrollToBottom = () => {
  setTimeout(() => {
    if (terminalLog.value) {
      terminalLog.value.scrollTop = terminalLog.value.scrollHeight;
    }
  }, 50);
};

// Terminal Renklerini (ANSI) HTML'e dönüştüren fonksiyon
const formatAnsi = (str) => {
  if (!str) return '';
  // Temel XSS/HTML Tag koruması
  let html = String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Temel Terminal Renk Paleti
  const colors = {
    '30': '#000000', '31': '#ef5350', '32': '#66bb6a', '33': '#ffa726',
    '34': '#42a5f5', '35': '#ab47bc', '36': '#26c6da', '37': '#eceff1',
    '90': '#90a4ae', '91': '#e53935', '92': '#43a047', '93': '#fb8c00',
    '94': '#1e88e5', '95': '#8e24aa', '96': '#00acc1', '97': '#ffffff'
  };

  html = html.replace(/\x1B\[([\d;]*)m/g, (match, codes) => {
    const parts = codes.split(';');
    let styles = [];
    let isReset = false;

    for (const p of parts) {
      if (p === '0' || p === '' || p === '39' || p === '22' || p === '24') isReset = true;
      else if (p === '1') styles.push('font-weight: bold');
      else if (p === '3') styles.push('font-style: italic');
      else if (p === '4') styles.push('text-decoration: underline');
      else if (colors[p]) styles.push(`color: ${colors[p]}`);
    }

    if (isReset) return '</span>';
    if (styles.length) return `<span style="${styles.join(';')}">`;
    return '';
  });

  return html;
};

const handleKeyDown = (e) => {
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (cmdHistory.value.length > 0) {
      if (historyIndex.value < cmdHistory.value.length - 1) {
        historyIndex.value++;
      }
      command.value = cmdHistory.value[cmdHistory.value.length - 1 - historyIndex.value];
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIndex.value > 0) {
      historyIndex.value--;
      command.value = cmdHistory.value[cmdHistory.value.length - 1 - historyIndex.value];
    } else if (historyIndex.value === 0) {
      historyIndex.value = -1;
      command.value = '';
    }
  }
};

const handleGlobalKeyDown = (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === 'c') {
    e.preventDefault();
    sendCtrlC();
  }
};

const sendCtrlC = async () => {
  if (!loading.value) return;

  history.value.push({ cmd: '^C', out: t('customPage.terminal.sendingStopSignal'), err: null });
  scrollToBottom();

  try {
    const res = await fetch('/api/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: '^C' })
    });
    const json = await res.json();
    const currentIdx = history.value.length - 1;

    if (json.success) {
      history.value[currentIdx].out = json.stdout;
    }
  } catch (e) { }
};

const sendCommand = async () => {
  const cmd = command.value.trim();
  if (!cmd && !loading.value) return;
  if (loading.value) return;

  if (cmd === 'clear') {
    history.value = [];
    command.value = '';
    return;
  }

  if (cmdHistory.value.length === 0 || cmdHistory.value[cmdHistory.value.length - 1] !== cmd) {
    cmdHistory.value.push(cmd);
  }
  historyIndex.value = -1;

  history.value.push({ cmd: cmd, out: t('customPage.terminal.running'), err: null });
  const currentIdx = history.value.length - 1;
  command.value = '';
  loading.value = true;
  scrollToBottom();

  try {
    const res = await fetch('/api/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd })
    });

    const textRes = await res.text();
    let json;
    try {
      json = JSON.parse(textRes);
    } catch (e) {
      throw new Error(t('customPage.terminal.invalidServerResponse') + ': ' + textRes.substring(0, 100) + '...');
    }

    if (json.success) {
      history.value[currentIdx].out = json.stdout || t('customPage.terminal.emptyOutput');
      if (json.stderr) history.value[currentIdx].err = json.stderr;
    } else {
      history.value[currentIdx].out = null;
      history.value[currentIdx].err = json.error || t('customPage.terminal.unknownError');
      if (json.stdout) history.value[currentIdx].out = 'Stdout: ' + json.stdout;
      if (json.stderr) history.value[currentIdx].err += '\n                        ' + t('customPage.terminal.stderrLabel') + ': ' + json.stderr;
    }
  } catch (e) {
    history.value[currentIdx].out = null;
    history.value[currentIdx].err = t('customPage.terminal.errorPrefix') + ': ' + (e?.message || t('common.unknownError'));
  } finally {
    loading.value = false;
    scrollToBottom();
  }
};

onMounted(() => {
  history.value.push({
    cmd: 'init',
    out: t('customPage.terminal.sessionStarted') + '\n                        - ' + t('customPage.terminal.stopInstruction') + '\n                        - ' + t('customPage.terminal.historyInstruction')
  });
  window.addEventListener('keydown', handleGlobalKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown);
});

return {
  command,
  history,
  loading,
  terminalLog,
  sendCommand,
  sendCtrlC,
  handleKeyDown,
  formatAnsi
};