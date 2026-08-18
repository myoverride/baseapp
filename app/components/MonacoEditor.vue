<template>
  <div class="monaco-wrapper" :class="{ 'editor-fullscreen': isFullscreen }" :style="{ height: dynamicHeight === '100%' ? '100%' : 'auto' }">
    <div 
      ref="editorContainer" 
      :style="{ 
        height: isFullscreen ? '100vh' : dynamicHeight, 
        width: '100%', 
        borderRadius: isFullscreen ? '0' : '4px', 
        overflow: 'hidden', 
        border: isFullscreen ? 'none' : '1px solid rgba(0,0,0,0.38)' 
      }"
    ></div>
    <v-btn 
      icon 
      size="small" 
      class="theme-btn" 
      @click="toggleInternalTheme" 
      :title="internalTheme === 'vs-dark' ? $t('monaco.lightMode') : $t('monaco.darkMode')"
      color="primary"
      variant="flat"
    >
      <v-icon color="white">{{ internalTheme === 'vs-dark' ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
    </v-btn>
    <v-btn 
      v-if="!hideFullscreen"
      icon 
      size="small" 
      class="fullscreen-btn" 
      @click="toggleFullscreen" 
      :title="isFullscreen ? $t('monaco.exitFullscreen') : $t('monaco.fullscreen')"
      color="primary"
      variant="flat"
    >
      <v-icon color="white">{{ isFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen' }}</v-icon>
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { toRaw,  ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  modelValue: string;
  language?: string;
  height?: string;
  readOnly?: boolean;
  minimap?: boolean;
  hideFullscreen?: boolean;
  autoHeight?: boolean;
  theme?: string;
  contextType?: 'frontend' | 'backend';
}>();

const { globals } = useGlobals();
const { t } = useI18n();
const dynamicHeight = ref(props.height || '400px');

watch(() => props.height, (newVal) => {
  if (!props.autoHeight) {
    dynamicHeight.value = newVal || '400px';
  }
});

const emit = defineEmits(['update:modelValue', 'save']);

const editorContainer = ref<HTMLElement | null>(null);
let editor: any = null;

const isFullscreen = ref(false);
const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value;
};

const internalTheme = ref('vs-dark');
onMounted(() => {
  const saved = localStorage.getItem('monaco-theme');
  if (saved) internalTheme.value = saved;
});

const toggleInternalTheme = () => {
  internalTheme.value = internalTheme.value === 'vs-dark' ? 'vs' : 'vs-dark';
  localStorage.setItem('monaco-theme', internalTheme.value);
  if (editor) {
    const win = getGlobalWindow();
    if (win?.monaco) {
      win.monaco.editor.setTheme(internalTheme.value);
    }
  }
};

// Global loading state to prevent multiple script injections
const getGlobalWindow = () => (typeof window !== 'undefined' ? (window as any) : null);

async function fetchGlobalSuggestions() {
  const win = getGlobalWindow();
  if (!win) return { globalsData: [] };
  
  if (win.__monaco_intellisense_cache__ && Date.now() - win.__monaco_intellisense_cache_time__ < 10000) {
    return win.__monaco_intellisense_cache__;
  }
  
  try {
    const globalsRes = await $fetch('/api/admin/globals?limit=1000').catch(() => ({ data: [] }));
    const parseRes = (res: any) => Array.isArray(res) ? res : (res?.data || []);
    win.__monaco_intellisense_cache__ = {
      globalsData: parseRes(globalsRes)
    };
    win.__monaco_intellisense_cache_time__ = Date.now();
  } catch (e) {
    console.error('Monaco IntelliSense fetch error:', e);
    return { globalsData: [] };
  }
  return win.__monaco_intellisense_cache__;
}

async function injectDynamicExtraLib(isBackend: boolean, win: any) {
  try {
    const dynamicData = await fetchGlobalSuggestions();
    let dynamicLib = '';

    if (isBackend) {
      const apiGlobals = dynamicData.globalsData.filter((v: any) => v.target === 'api' || v.target === 'shared');
      
      const varsProps = apiGlobals.filter((v: any) => v.type !== 'util').map((v: any) => `        ${v.key}: any;`).join('\n');
      const methodsProps = apiGlobals.filter((v: any) => v.type === 'util').map((v: any) => `        ${v.key}(...args: any[]): Promise<any>;`).join('\n');
      
      dynamicLib = `
        /** (Backend) Global Değişkenler ve Fonksiyonlar */
        declare const globals: {
${varsProps}
${methodsProps}
        };
      `;
    } else {
      const uiGlobals = dynamicData.globalsData.filter((v: any) => v.target === 'ui' || v.target === 'shared');
      
      const varsProps = uiGlobals.filter((v: any) => v.type !== 'util').map((v: any) => `        ${v.key}: any;`).join('\n');
      const uiMethodsProps = uiGlobals.filter((v: any) => v.type === 'util').map((v: any) => `        ${v.key}(...args: any[]): Promise<any>;`).join('\n');
      
      dynamicLib = `
        /** (Frontend) Global Degiskenler ve Fonksiyonlar */
        declare const globals: {
${varsProps}
${uiMethodsProps}
        };

        declare function useGlobals(): {
          globals: {
${varsProps}
          };
          primaryColor: any;
        };
      `;
    }

    if (win.__monaco_dynamic_lib_js) win.__monaco_dynamic_lib_js.dispose();
    if (win.__monaco_dynamic_lib_ts) win.__monaco_dynamic_lib_ts.dispose();

    win.__monaco_dynamic_lib_js = win.monaco.languages.typescript.javascriptDefaults.addExtraLib(dynamicLib, 'file:///dynamic-globals.d.ts');
    win.__monaco_dynamic_lib_ts = win.monaco.languages.typescript.typescriptDefaults.addExtraLib(dynamicLib, 'file:///dynamic-globals.d.ts');
  } catch (e) {
    console.error('Monaco dynamic extraLib injection failed', e);
  }
}

let componentUnmounted = false;

onMounted(() => {
  if (!getGlobalWindow()) return;
  loadMonaco();
});

function loadMonaco() {
  const win = getGlobalWindow();
  if (win.monaco) {
    if (!componentUnmounted) initEditor();
    return;
  }

  if (win.__monaco_promise__) {
    win.__monaco_promise__.then(() => {
      if (!componentUnmounted) initEditor();
    });
    return;
  }

  win.__monaco_promise__ = new Promise<void>((resolve) => {
    const script = document.createElement('script');
    script.src = '/lib/monaco/vs/loader.js';
    script.onload = () => {
      win.require.config({ paths: { 'vs': '/lib/monaco/vs' } });
      win.require(['vs/editor/editor.main'], () => {
        resolve();
      });
    };
    document.head.appendChild(script);
  });

  win.__monaco_promise__.then(() => {
    if (!componentUnmounted) initEditor();
  });
}

function initEditor() {
  const win = getGlobalWindow();
  if (!editorContainer.value || !win.monaco) return;
  
  // Custom globals tanımlamalarını monaco dil servislerine ekleyelim (IntelliSense için)
  // Her mount edildiğinde lib'i güncelleyelim (eski libler monaco içinde kalsa da son eklenen ezer)
  const isBackend = props.contextType !== 'frontend';
  if (isBackend) {
    const extraLib = `
      /**
       * ${t("monaco.jsdoc.payload")}
       */
      declare const payload: {
        /** ${t("monaco.jsdoc.payloadParams")} */
        params?: { [key: string]: any };
        /** ${t("monaco.jsdoc.payloadBody")} */
        body?: any;
        /** ${t("monaco.jsdoc.payloadQuery")} */
        query?: { [key: string]: any };
        /** ${t("monaco.jsdoc.payloadMethod")} */
        method?: string;
        /** ${t("monaco.jsdoc.payloadHeaders")} */
        headers?: { [key: string]: string };
        
        /** ${t("monaco.jsdoc.payloadJobId")} */
        jobId?: number;
        /** ${t("monaco.jsdoc.payloadJobName")} */
        jobName?: string;
        /** ${t("monaco.jsdoc.payloadRunAt")} */
        runAt?: string;
      };

      /**
       * ${t("monaco.jsdoc.fetch")}
       */
      declare function fetch(url: any, init?: any): any;

      /**
       * ${t("monaco.jsdoc.require")}
       */
      declare function require(id: string): any;

      /**
       * ${t("monaco.jsdoc.process")}
       */
      declare const process: any;

      /**
       * ${t("monaco.jsdoc.dirname")}
       */
      declare const __dirname: string;

      /**
       * ${t("monaco.jsdoc.filename")}
       */
      declare const __filename: string;

      /**
       * Veritabanı bağlantısı. Tagged template literal kullanarak doğrudan SQL çalıştırabilirsiniz.
       * Örnek: const rows = await db\`SELECT * FROM devices\`;
       */
      declare const db: {
        unsafe(query: string, params?: any[]): any;
        begin(callback: any): any;
      };

      /**
       * ${t("monaco.jsdoc.buffer")}
       */
      declare namespace Buffer {
        function alloc(size: number): any;
        function from(data: string | any[], encoding?: string): any;
        function concat(list: any[], totalLength?: number): any;
      }

      /**
       * ${t("monaco.jsdoc.crypto")}
       */
      declare namespace crypto {
        function createHash(algorithm: string): any;
        function createHmac(algorithm: string, key: string | any): any;
        function randomBytes(size: number): any;
        function randomUUID(): string;
      }

      /**
       * ${t("monaco.jsdoc.publishMQTT")}
       */
      declare function publishMQTT(topic: string, message: string): boolean;

      /**
       * (Backend) Belirli bir WebSocket odasına (path) veri gönderir.
       * Örnek: publishWS('/api/ws/kazan', { sicaklik: 45 });
       */
      declare function publishWS(path: string, payload: any): void;

      /**
       * ${t("monaco.jsdoc.subscribeMQTT")}
       */
      declare function subscribeMQTT(callback: (topic: string, payload: any) => void): void;

      /**
       * Asenkron bekletme metodu (maksimum 5000 ms sınırı vardır).
       * Örnek: await sleep(1000); // 1 saniye bekler
       */
      declare function sleep(ms: number): any;

      /**
       * ${t("monaco.jsdoc.sendEmail")}
       */
      declare function sendEmail(options: { to: string; subject: string; text?: string; html?: string }): any;

      /**
       * ${t("monaco.jsdoc.readModbus")}
       * @param ip Modbus cihazının IP adresi
       * @param port Modbus TCP portu (genelde 502)
       * @param unitId Cihazın Modbus kimliği
       * @param startAddress Okunacak başlangıç adresi
       * @param length Okunacak veri uzunluğu
       * @param type Okuma tipi: 'holding', 'input', 'coil', 'discrete'
       * @param dataType Veri tipi: 'uint16', 'uint32', 'float32' vs.
       */
      declare function readModbusData(ip: string, port: number, unitId: number, startAddress: number, length: number, type?: 'holding' | 'input' | 'coil' | 'discrete', dataType?: string): any;

      /**
       * ${t("monaco.jsdoc.writeModbus")}
       * @param ip Modbus cihazının IP adresi
       * @param port Modbus TCP portu (genelde 502)
       * @param unitId Cihazın Modbus kimliği
       * @param address Yazılacak adres
       * @param value Yazılacak değer
       * @param dataType Veri tipi: 'uint16', 'uint32', 'float32', 'coil' vs.
       */
      declare function writeModbusData(ip: string, port: number, unitId: number, address: number, value: number, dataType?: string): any;

      /**
       * Şifre hashleme ve doğrulama için bcrypt kütüphanesi.
       * Güvenli şifre hash'leri oluşturma ve karşılaştırma.
       */
      declare const bcrypt: {
        /** ${t("monaco.jsdoc.bcryptHashSync")} */
        hashSync(data: string, saltOrRounds?: number | string): string;
        /** ${t("monaco.jsdoc.bcryptCompareSync")} */
        compareSync(data: string, hash: string): boolean;
        /** ${t("monaco.jsdoc.bcryptHash")} */
        hash(data: string, saltOrRounds: number | string): Promise<string>;
        /** ${t("monaco.jsdoc.bcryptCompare")} */
        compare(data: string, hash: string): Promise<boolean>;
        /** ${t("monaco.jsdoc.bcryptGenSaltSync")} */
        genSaltSync(rounds?: number): string;
        /** ${t("monaco.jsdoc.bcryptGenSalt")} */
        genSalt(rounds?: number): Promise<string>;
        /** ${t("monaco.jsdoc.bcryptGetRounds")} */
        getRounds(hash: string): number;
      };
    `;
    
    try {
      if (win.__monaco_static_lib_js) win.__monaco_static_lib_js.dispose();
      if (win.__monaco_static_lib_ts) win.__monaco_static_lib_ts.dispose();

      win.__monaco_static_lib_js = win.monaco.languages.typescript.javascriptDefaults.addExtraLib(extraLib, 'file:///globals.d.ts');
      win.__monaco_static_lib_ts = win.monaco.languages.typescript.typescriptDefaults.addExtraLib(extraLib, 'file:///globals.d.ts');
    } catch (e) {
      console.warn('Monaco typings loading failed', e);
    }
  } else {
    const frontendExtraLib = `
      /** Vue 3 Reactivity API */
      declare function ref<T>(value: T): { value: T };
      declare function reactive<T extends object>(target: T): T;
      declare function computed<T>(getter: () => T): { readonly value: T };
      declare function watch(source: any, callback: (val: any, oldVal: any) => void, options?: any): void;
      declare function watchEffect(effect: () => void): void;
      declare function watchPostEffect(effect: () => void): void;
      declare function watchSyncEffect(effect: () => void): void;
      declare function shallowRef<T>(value: T): { value: T };
      declare function triggerRef(ref: any): void;
      declare function customRef<T>(factory: (track: () => void, trigger: () => void) => { get: () => T, set: (val: T) => void }): { value: T };
      declare function shallowReactive<T extends object>(target: T): T;
      declare function shallowReadonly<T extends object>(target: T): T;
      declare function toRaw<T>(observed: T): T;
      declare function markRaw<T>(value: T): T;
      declare function toRef(object: object, key: string): { value: any };
      declare function toRefs(object: object): Record<string, { value: any }>;
      declare function unref<T>(ref: T | { value: T }): T;
      declare function isRef(r: any): boolean;
      declare function isReactive(r: any): boolean;
      declare function isReadonly(r: any): boolean;
      declare function isProxy(r: any): boolean;

      /** Vue 3 Lifecycle Hooks */
      declare function onMounted(callback: () => void): void;
      declare function onUnmounted(callback: () => void): void;
      declare function onUpdated(callback: () => void): void;
      declare function onBeforeMount(callback: () => void): void;
      declare function onBeforeUnmount(callback: () => void): void;
      declare function onErrorCaptured(callback: (err: any, instance: any, info: string) => boolean | void): void;
      declare function onActivated(callback: () => void): void;
      declare function onDeactivated(callback: () => void): void;

      /** Vue 3 Component APIs */
      declare function provide<T>(key: string | symbol, value: T): void;
      declare function inject<T>(key: string | symbol, defaultValue?: T): T;
      declare function nextTick(callback?: () => void): Promise<void>;
      declare function useSlots(): Record<string, any>;
      declare function useCssModule(name?: string): Record<string, string>;
      declare function useModel(props: any, name?: string): { value: any };
      declare function useAttrs(): Record<string, any>;
      declare function defineProps<T>(): T;
      declare function defineEmits<T>(): T;

      /** Nuxt / App Composables */
      declare function useRoute(): any;
      declare function useRouter(): any;
      declare function useFetch(url: string, options?: any): any;
      declare function useAsyncData(key: string, handler: () => Promise<any>): any;
      declare function useCookie(name: string, options?: any): any;
      declare function useState<T>(key: string, init?: () => T): { value: T };
      declare function navigateTo(to: string, options?: any): Promise<void | any>;
      declare function useWS(path: string, callback: (data: any) => void): void;
      declare function useHead(meta: any): void;
      declare function useSeoMeta(meta: any): void;
      declare function useI18n(): any;
      declare const routeParams: any;
    `;
    try {
      if (win.__monaco_frontend_lib_js) win.__monaco_frontend_lib_js.dispose();
      if (win.__monaco_frontend_lib_ts) win.__monaco_frontend_lib_ts.dispose();

      win.__monaco_frontend_lib_js = win.monaco.languages.typescript.javascriptDefaults.addExtraLib(frontendExtraLib, 'file:///frontend-globals.d.ts');
      win.__monaco_frontend_lib_ts = win.monaco.languages.typescript.typescriptDefaults.addExtraLib(frontendExtraLib, 'file:///frontend-globals.d.ts');
    } catch (e) {
      console.warn('Monaco frontend typings loading failed', e);
    }
  }

  // Dinamik tipleri enjekte et (asenkron, editoru bloklamaz)
  injectDynamicExtraLib(isBackend, win);

  // Özel Autocomplete (CompletionItemProvider) Ekleme
  if (!win.__monaco_completion_provider_added_v8__) {
    try {
      // JAVASCRIPT / TYPESCRIPT PROVİDER
      ['javascript', 'typescript'].forEach(lang => {
        win.monaco.languages.registerCompletionItemProvider(lang, {
          triggerCharacters: ['.'],
          provideCompletionItems: (model: any, position: any) => {
            const word = model.getWordUntilPosition(position);
            const lineContent = model.getLineContent(position.lineNumber);
            const textBeforeCursor = lineContent.substring(0, position.column - 1);
            
            // Eğer tırnak içindeyse (string literal yazılıyorsa) custom globalleri gösterme, TypeScript'e bırak.
            if (textBeforeCursor.match(/['"]\w*$/)) {
              return { suggestions: [] };
            }
            
            // HMR ve Closure bug'ını çözmek için isBackend bilgisini doğrudan model üzerinden alıyoruz
            const isBackendContext = model.__isBackend === true;

            // 1. db. durumunu kontrol et (db.begin vs. yazarken önerileri çıkar)
            const dbMatch = isBackendContext ? textBeforeCursor.match(/db\.(\w*)$/) : null;
            if (dbMatch) {
            const range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column - dbMatch[1].length,
              endColumn: position.column
            };
            return {
              suggestions: [
                {
                  label: 'begin',
                  kind: win.monaco.languages.CompletionItemKind.Method,
                  insertText: 'begin(async (sql) => {\n\t${1}\n})',
                  insertTextRules: win.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                  range: range,
                  detail: t("monaco.jsdoc.transaction"),
                  documentation: {
                    value: 'Veritabanı transaction (işlem) başlatır. Hata durumunda otomatik rollback yapar.\n\nÖrnek:\n```javascript\nawait db.begin(async sql => {\n  await sql`INSERT INTO ...`;\n});\n```'
                  }
                },
                {
                  label: 'unsafe',
                  kind: win.monaco.languages.CompletionItemKind.Method,
                  insertText: 'unsafe("${1:query}", [${2:params}])',
                  insertTextRules: win.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                  range: range,
                  detail: 'Raw SQL Query',
                  documentation: {
                    value: t("monaco.jsdoc.dbUnsafeDoc")
                  }
                }
              ]
            };
          }

          const payloadMatch = isBackend ? textBeforeCursor.match(/payload\.(\w*)$/) : null;
          if (payloadMatch) {
            const range = {
              startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
              startColumn: position.column - payloadMatch[1].length, endColumn: position.column
            };
            return {
              suggestions: [
                { label: 'jobId', kind: win.monaco.languages.CompletionItemKind.Property, insertText: 'jobId', range },
                { label: 'jobName', kind: win.monaco.languages.CompletionItemKind.Property, insertText: 'jobName', range },
                { label: 'runAt', kind: win.monaco.languages.CompletionItemKind.Property, insertText: 'runAt', range },
                { label: 'params', kind: win.monaco.languages.CompletionItemKind.Property, insertText: 'params', range },
                { label: 'body', kind: win.monaco.languages.CompletionItemKind.Property, insertText: 'body', range },
                { label: 'query', kind: win.monaco.languages.CompletionItemKind.Property, insertText: 'query', range }
              ]
            };
          }

          const cryptoMatch = isBackend ? textBeforeCursor.match(/crypto\.(\w*)$/) : null;
          if (cryptoMatch) {
            const range = {
              startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
              startColumn: position.column - cryptoMatch[1].length, endColumn: position.column
            };
            return {
              suggestions: [
                { label: 'createHash', kind: win.monaco.languages.CompletionItemKind.Method, insertText: 'createHash("${1:sha256}")', insertTextRules: 4, range },
                { label: 'createHmac', kind: win.monaco.languages.CompletionItemKind.Method, insertText: 'createHmac("${1:sha256}", "${2:key}")', insertTextRules: 4, range },
                { label: 'randomBytes', kind: win.monaco.languages.CompletionItemKind.Method, insertText: 'randomBytes(${1:16})', insertTextRules: 4, range },
                { label: 'randomUUID', kind: win.monaco.languages.CompletionItemKind.Method, insertText: 'randomUUID()', insertTextRules: 4, range }
              ]
            };
          }

          const bcryptMatch = isBackend ? textBeforeCursor.match(/bcrypt\.(\w*)$/) : null;
          if (bcryptMatch) {
            const range = {
              startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
              startColumn: position.column - bcryptMatch[1].length, endColumn: position.column
            };
            return {
              suggestions: [
                {
                  label: 'hashSync',
                  kind: win.monaco.languages.CompletionItemKind.Method,
                  insertText: 'hashSync(${1:password}, ${2:10})',
                  insertTextRules: 4,
                  range,
                  detail: '(password: string, rounds?: number) => string',
                  documentation: {
                    value: t("monaco.jsdoc.bcryptHashSyncDoc")
                  }
                },
                {
                  label: 'compareSync',
                  kind: win.monaco.languages.CompletionItemKind.Method,
                  insertText: 'compareSync(${1:password}, ${2:hash})',
                  insertTextRules: 4,
                  range,
                  detail: '(password: string, hash: string) => boolean',
                  documentation: {
                    value: t("monaco.jsdoc.bcryptCompareSyncDoc")
                  }
                },
                {
                  label: 'hash',
                  kind: win.monaco.languages.CompletionItemKind.Method,
                  insertText: 'hash(${1:password}, ${2:10})',
                  insertTextRules: 4,
                  range,
                  detail: '(password: string, rounds: number) => Promise<string>',
                  documentation: {
                    value: t("monaco.jsdoc.bcryptHashDoc")
                  }
                },
                {
                  label: 'compare',
                  kind: win.monaco.languages.CompletionItemKind.Method,
                  insertText: 'compare(${1:password}, ${2:hash})',
                  insertTextRules: 4,
                  range,
                  detail: '(password: string, hash: string) => Promise<boolean>',
                  documentation: {
                    value: t("monaco.jsdoc.bcryptCompareDoc")
                  }
                },
                {
                  label: 'genSaltSync',
                  kind: win.monaco.languages.CompletionItemKind.Method,
                  insertText: 'genSaltSync(${1:10})',
                  insertTextRules: 4,
                  range,
                  detail: '(rounds?: number) => string',
                  documentation: {
                    value: t("monaco.jsdoc.bcryptGenSaltSyncDoc")
                  }
                },
                {
                  label: 'genSalt',
                  kind: win.monaco.languages.CompletionItemKind.Method,
                  insertText: 'genSalt(${1:10})',
                  insertTextRules: 4,
                  range,
                  detail: '(rounds?: number) => Promise<string>',
                  documentation: {
                    value: t("monaco.jsdoc.bcryptGenSaltDoc")
                  }
                },
                {
                  label: 'getRounds',
                  kind: win.monaco.languages.CompletionItemKind.Method,
                  insertText: 'getRounds(${1:hash})',
                  insertTextRules: 4,
                  range,
                  detail: '(hash: string) => number',
                  documentation: {
                    value: t("monaco.jsdoc.bcryptGetRoundsDoc")
                  }
                }
              ]
            };
          }

          const bufferMatch = isBackend ? textBeforeCursor.match(/Buffer\.(\w*)$/) : null;
          if (bufferMatch) {
            const range = {
              startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
              startColumn: position.column - bufferMatch[1].length, endColumn: position.column
            };
            return {
              suggestions: [
                { label: 'alloc', kind: win.monaco.languages.CompletionItemKind.Method, insertText: 'alloc(${1:size})', insertTextRules: 4, range },
                { label: 'from', kind: win.monaco.languages.CompletionItemKind.Method, insertText: 'from(${1:data})', insertTextRules: 4, range },
                { label: 'concat', kind: win.monaco.languages.CompletionItemKind.Method, insertText: 'concat([${1:list}])', insertTextRules: 4, range }
              ]
            };
          }

          // Eğer imleç bir objenin property'sindeyse (noktadan sonra bir şey yazılıyorsa)
          // ve yukarıdaki env., db., payload. vb. kurallarına girmediyse, genel globalleri önerme!
          if (textBeforeCursor.match(/\.\w*$/)) {
            return { suggestions: [] };
          }

          // 3. Genel global nesne önerileri
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          };

          const suggestions = [
            {
              label: 'payload',
              kind: win.monaco.languages.CompletionItemKind.Variable,
              insertText: 'payload',
              range: range,
              detail: 'Incoming Request Payload/Params',
              documentation: {
                value: t("monaco.jsdoc.payloadDoc")
              }
            },
            {
              label: 'fetch',
              kind: win.monaco.languages.CompletionItemKind.Function,
              insertText: "fetch('${1:url}')",
              insertTextRules: win.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: range,
              detail: 'Global Fetch API',
              documentation: {
                value: 'Global fetch API. HTTP istekleri yapmak için kullanılır.\n\nÖrnek:\n```javascript\nconst res = await fetch("https://api.example.com");\n```'
              }
            },
            {
              label: 'require',
              kind: win.monaco.languages.CompletionItemKind.Function,
              insertText: "require('${1:module}')",
              insertTextRules: win.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: range,
              detail: 'Node.js require()',
              documentation: {
                value: t("monaco.jsdoc.requireDoc")
              }
            },
            {
              label: 'process',
              kind: win.monaco.languages.CompletionItemKind.Variable,
              insertText: 'process',
              range: range,
              detail: 'Node.js process object',
              documentation: {
                value: 'Node.js process nesnesi.'
              }
            },
            {
              label: '__dirname',
              kind: win.monaco.languages.CompletionItemKind.Variable,
              insertText: '__dirname',
              range: range,
              detail: 'Current directory path',
              documentation: {
                value: t("monaco.jsdoc.dirnameDoc")
              }
            },
            {
              label: '__filename',
              kind: win.monaco.languages.CompletionItemKind.Variable,
              insertText: '__filename',
              range: range,
              detail: 'Current file path',
              documentation: {
                value: t("monaco.jsdoc.filenameDoc")
              }
            },
            {
              label: 'db',
              kind: win.monaco.languages.CompletionItemKind.Variable,
              insertText: 'db',
              range: range,
              detail: 'Database Connection',
              documentation: {
                value: 'Veritabanı bağlantısı. Tagged template literal kullanarak doğrudan SQL çalıştırabilirsiniz.\n\nÖrnek:\n```javascript\nconst rows = await db`SELECT * FROM devices`;\n```'
              }
            },
            {
              label: 'Buffer',
              kind: win.monaco.languages.CompletionItemKind.Class,
              insertText: 'Buffer',
              range: range,
              detail: 'Node.js Buffer Class',
              documentation: {
                value: t("monaco.jsdoc.bufferDoc")
              }
            },
            {
              label: 'crypto',
              kind: win.monaco.languages.CompletionItemKind.Module,
              insertText: 'crypto',
              range: range,
              detail: 'Node.js crypto Module',
              documentation: {
                value: t("monaco.jsdoc.cryptoDoc")
              }
            },
            {
              label: 'bcrypt',
              kind: win.monaco.languages.CompletionItemKind.Module,
              insertText: 'bcrypt',
              range: range,
              detail: t("monaco.jsdoc.bcryptjs"),
              documentation: {
                value: 'Güvenli şifre hash\'leme ve doğrulama kütüphanesi.\n\nÖrnekler:\n```javascript\n// Şifre hashleme\nconst hash = bcrypt.hashSync("myPassword", 10);\n\n// Şifre doğrulama\nconst isValid = bcrypt.compareSync("test", hash);\n\n// Asenkron kullanım\nconst hash2 = await bcrypt.hash("pass", 10);\nconst ok = await bcrypt.compare("pass", hash2);\n```'
              }
            },
            {
              label: 'publishMQTT',
              kind: win.monaco.languages.CompletionItemKind.Function,
              insertText: "publishMQTT('${1:topic}', '${2:message}')",
              insertTextRules: win.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: range,
              detail: 'publishMQTT(topic: string, message: string): boolean',
              documentation: {
                value: t("monaco.jsdoc.publishMQTTDoc")
              }
            },
            {
              label: 'subscribeMQTT',
              kind: win.monaco.languages.CompletionItemKind.Function,
              insertText: "subscribeMQTT((topic, payload) => {\n\t${1}\n})",
              insertTextRules: win.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: range,
              detail: 'subscribeMQTT(callback: (topic: string, payload: any) => void)',
              documentation: {
                value: 'Sisteme gelen tüm MQTT mesajlarını dinler (Sadece Microservices).\n\nÖrnek:\n```javascript\nsubscribeMQTT((topic, payload) => {\n  if (topic === "my/topic") {\n    console.log(payload);\n  }\n});\n```'
              }
            },
            {
              label: 'sleep',
              kind: win.monaco.languages.CompletionItemKind.Function,
              insertText: 'sleep(${1:ms})',
              insertTextRules: win.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: range,
              detail: 'sleep(ms: number): Promise<void>',
              documentation: {
                value: 'Asenkron bekletme metodu (maksimum 5000 ms sınırı vardır).\n\nÖrnek:\n```javascript\nawait sleep(1000); // 1 saniye bekler\n```'
              }
            },
            {
              label: 'sendEmail',
              kind: win.monaco.languages.CompletionItemKind.Function,
              insertText: "sendEmail({\n\tto: '${1:email}',\n\tsubject: '${2:subject}',\n\ttext: '${3:body}'\n})",
              insertTextRules: win.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: range,
              detail: 'sendEmail(options): Promise<any>',
              documentation: {
                value: t("monaco.jsdoc.sendEmailDoc")
              }
            },
            {
              label: 'readModbusData',
              kind: win.monaco.languages.CompletionItemKind.Function,
              insertText: "readModbusData('${1:ip}', ${2:502}, ${3:1}, ${4:40001}, ${5:1}, '${6:holding}', '${7:uint16}')",
              insertTextRules: win.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: range,
              detail: 'Modbus TCP Read',
              documentation: {
                value: t("monaco.jsdoc.readModbusDataDoc")
              }
            },
            {
              label: 'writeModbusData',
              kind: win.monaco.languages.CompletionItemKind.Function,
              insertText: "writeModbusData('${1:ip}', ${2:502}, ${3:1}, ${4:40001}, ${5:value}, '${6:uint16}')",
              insertTextRules: win.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: range,
              detail: 'Modbus TCP Write',
              documentation: {
                value: t("monaco.jsdoc.writeModbusDataDoc")
              }
            },
            {
              label: 'useWS',
              kind: win.monaco.languages.CompletionItemKind.Function,
              insertText: "useWS('${1:path}', (data) => {\n\t${2}\n})",
              insertTextRules: win.monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: range,
              detail: 'useWS(path, callback)',
              documentation: {
                value: 'Frontend tarafında WebSocket dinleyicisi başlatır.\n\nÖrnek:\n```javascript\nuseWS("/api/ws/cihaz1", (data) => console.log(data));\n```'
              }
            }
          ];

            // Noktadan sonra yazılıyorsa ve yukarıdaki objelere (db., crypto. vs) uymadıysa global listeyi dönme!
            if (textBeforeCursor.match(/\.\w*$/)) {
              return undefined;
            }

            if (!isBackendContext) {
              const allowedFrontendGlobals = ['fetch', 'sleep', 'useWS'];
              return { suggestions: suggestions.filter(s => allowedFrontendGlobals.includes(s.label)) };
            }
            
            // Backend ise ui-only nesnelerini gizle
            const backendForbidden = ['useWS'];
            return { suggestions: suggestions.filter(s => !backendForbidden.includes(s.label)) };
          }
        });
      }); // End of JS/TS forEach



      win.__monaco_completion_provider_added_v8__ = true;
    } catch (e) {
      console.warn('Monaco completion provider registration failed', e);
    }
  }

  // Dile göre dosya uzantısı belirle
  const language = props.language || 'javascript';
  const extensionMap: Record<string, string> = {
    javascript: '.js',
    typescript: '.ts',
    vue: '.vue',
    html: '.html',
    css: '.css',
    json: '.json',
    sql: '.sql'
  };
  const ext = extensionMap[language] || '.js';
  const uniqueId = Math.random().toString(36).substring(2, 10);
  const modelUri = win.monaco.Uri.parse(`file:///model_${uniqueId}${ext}`);
  
  let model = win.monaco.editor.createModel(props.modelValue, language, modelUri);
  model.__isBackend = isBackend; // Dinamik context için model'e ekle

  // Vue dilinde doğrulama devre dışı bırak (Vue söz dizimi tanınmıyor)
  if (language === 'vue') {
    try {
      win.monaco.languages.html.htmlDefaults.setDiagnosticsOptions({
        validate: false
      });
    } catch (e) {
      console.warn('Vue validation disable attempted', e);
    }
  }

  // TypeScript/JavaScript doğrulama seçeneklerini ayarla
  if (language === 'javascript' || language === 'typescript') {
    try {
      const jsDefaults = win.monaco.languages.typescript.javascriptDefaults;
      const tsDefaults = win.monaco.languages.typescript.typescriptDefaults;
      const opts = {
        noSemanticValidation: false,
        noSyntaxValidation: false,
        diagnosticsOptions: {
          noSuggestions: false,
          noUnusedLocals: false,
          noUnusedParameters: false
        }
      };
      jsDefaults.setDiagnosticsOptions(opts.diagnosticsOptions);
      tsDefaults.setDiagnosticsOptions(opts.diagnosticsOptions);
    } catch (e) {
      console.warn('TS diagnostics setup failed', e);
    }
  }

  editor = win.monaco.editor.create(editorContainer.value, {
    model: model,
    theme: props.theme || internalTheme.value,
    automaticLayout: true,
    readOnly: props.readOnly || false,
    minimap: { enabled: props.minimap !== false && win.innerWidth >= 600 },
    fontSize: win.innerWidth < 600 ? 10 : 14,
    wordWrap: 'on',
    scrollBeyondLastLine: false,
    tabSize: 2,
    wordBasedSuggestions: 'off',
    suggest: {
      showWords: false
    }
  });

  editor.addCommand(win.monaco.KeyMod.CtrlCmd | win.monaco.KeyCode.KeyS, () => {
    emit('save');
  });

  editor.onDidChangeModelContent(() => {
    emit('update:modelValue', editor.getValue());
  });

  if (props.autoHeight) {
    editor.onDidContentSizeChange((e: any) => {
      dynamicHeight.value = (e.contentHeight + 20) + 'px';
      editor.layout();
    });
    setTimeout(() => {
      if (editor) {
        dynamicHeight.value = (editor.getContentHeight() + 20) + 'px';
        editor.layout();
      }
    }, 100);
  }
}

watch(() => props.modelValue, (newVal) => {
  if (editor && editor.getValue() !== newVal) {
    editor.setValue(newVal);
  }
});

watch(() => props.theme, (newTheme) => {
  const win = getGlobalWindow();
  if (editor && win?.monaco && newTheme) {
    win.monaco.editor.setTheme(newTheme);
  }
});



watch(() => props.language, (newLang) => {
  const win = getGlobalWindow();
  if (editor && win?.monaco && newLang) {
    const model = editor.getModel();
    if (model) {
      win.monaco.editor.setModelLanguage(model, newLang);
      
      editor.updateOptions({
        wordBasedSuggestions: 'off',
        suggest: {
          showWords: false
        }
      });
    }
  }
});

onBeforeUnmount(() => {
  componentUnmounted = true;
  if (editor) {
    const model = editor.getModel();
    if (model) {
      if(toRaw(model).dispose) toRaw(model).dispose();
    }
    if(toRaw(editor).dispose) toRaw(editor).dispose();
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
  opacity: 0.5;
  transition: opacity 0.2s;
}

.theme-btn {
  position: absolute;
  bottom: 50px;
  right: 25px;
  z-index: 10;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.monaco-wrapper:hover .fullscreen-btn,
.monaco-wrapper:hover .theme-btn {
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
