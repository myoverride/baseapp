<template>
  <div class="monaco-wrapper" :class="{ 'editor-fullscreen': isFullscreen }">
    <div 
      ref="editorContainer" 
      :style="{ 
        height: isFullscreen ? '100vh' : (height || '400px'), 
        width: '100%', 
        borderRadius: isFullscreen ? '0' : '4px', 
        overflow: 'hidden', 
        border: isFullscreen ? 'none' : '1px solid rgba(0,0,0,0.38)' 
      }"
    ></div>
    <v-btn 
      icon 
      size="small" 
      class="fullscreen-btn" 
      @click="toggleFullscreen" 
      :title="isFullscreen ? $t('common.exitFullscreen') : $t('common.fullscreen')"
      color="primary"
      variant="flat"
    >
      <v-icon color="white">{{ isFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen' }}</v-icon>
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { toRaw,  ref, onMounted, onBeforeUnmount, watch } from 'vue';

const props = defineProps<{
  original: string;
  modified: string;
  language?: string;
  height?: string;
  theme?: string;
}>();

const editorContainer = ref<HTMLElement | null>(null);
let diffEditor: any = null;

const isFullscreen = ref(false);
const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value;
};

const getGlobalWindow = () => (typeof window !== 'undefined' ? (window as any) : null);

onMounted(() => {
  if (!getGlobalWindow()) return;
  loadMonaco();
});

function loadMonaco() {
  const win = getGlobalWindow();
  if (win.monaco) {
    initEditor();
    return;
  }

  if (win.__monaco_loading__) {
    const interval = setInterval(() => {
      if (win.monaco) {
        clearInterval(interval);
        initEditor();
      }
    }, 100);
    return;
  }

  win.__monaco_loading__ = true;
  const script = document.createElement('script');
  script.src = '/lib/monaco/vs/loader.js';
  script.onload = () => {
    win.require.config({ paths: { 'vs': '/lib/monaco/vs' } });
    win.require(['vs/editor/editor.main'], () => {
      initEditor();
    });
  };
  document.head.appendChild(script);
}

function initEditor() {
  const win = getGlobalWindow();
  if (!editorContainer.value || !win.monaco) return;

  const language = props.language || 'javascript';
  const originalModel = win.monaco.editor.createModel(props.original, language);
  const modifiedModel = win.monaco.editor.createModel(props.modified, language);

  diffEditor = win.monaco.editor.createDiffEditor(editorContainer.value, {
    theme: props.theme || 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 14,
    scrollBeyondLastLine: false,
    readOnly: true, // we don't want them editing in the diff view, just preview
    originalEditable: false
  });

  diffEditor.setModel({
    original: originalModel,
    modified: modifiedModel
  });
}

watch(() => props.original, (newVal) => {
  if (diffEditor) {
    const model = diffEditor.getModel().original;
    if (model && model.getValue() !== newVal) {
      model.setValue(newVal);
    }
  }
});

watch(() => props.modified, (newVal) => {
  if (diffEditor) {
    const model = diffEditor.getModel().modified;
    if (model && model.getValue() !== newVal) {
      model.setValue(newVal);
    }
  }
});

watch(() => props.theme, (newTheme) => {
  const win = getGlobalWindow();
  if (win?.monaco && newTheme) {
    win.monaco.editor.setTheme(newTheme);
  }
});

onBeforeUnmount(() => {
  if (diffEditor) {
    if(toRaw(diffEditor).dispose) toRaw(diffEditor).dispose();
  }
});
</script>

<style scoped>
.monaco-wrapper {
  margin-bottom: 12px;
  position: relative;
}

.fullscreen-btn {
  position: absolute;
  bottom: 10px;
  right: 25px;
  z-index: 10;
  opacity: 0.3;
  transition: opacity 0.2s;
}

.monaco-wrapper:hover .fullscreen-btn {
  opacity: 1;
}

.editor-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  margin: 0 !important;
}
</style>
