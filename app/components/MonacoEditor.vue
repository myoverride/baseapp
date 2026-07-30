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
      :title="internalTheme === 'vs-dark' ? 'Light Mode' : 'Dark Mode'"
      color="grey-darken-3"
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
      :title="isFullscreen ? 'Normale Dön' : 'Tam Ekran'"
      color="grey-darken-3"
      variant="flat"
    >
      <v-icon color="white">{{ isFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen' }}</v-icon>
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';

const props = defineProps<{
  modelValue: string;
  language?: string;
  height?: string;
  readOnly?: boolean;
  minimap?: boolean;
  hideFullscreen?: boolean;
  autoHeight?: boolean;
  theme?: string;
}>();

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
  if (true) {
    const extraLib = `
      /**
       * Gelen istek parametreleri veya görev (Scheduler) bilgileri.
       */
      declare const payload: {
        /** Middleware: URL parametreleri (Örn: /api/:id -> payload.params.id) */
        params?: { [key: string]: any };
        /** Middleware: Gelen istek gövdesi (JSON body) */
        body?: any;
        /** Middleware: Query string parametreleri */
        query?: { [key: string]: any };
        /** Middleware: HTTP Metodu (GET, POST vs.) */
        method?: string;
        /** Middleware: Gelen istek başlıkları (Headers) */
        headers?: { [key: string]: string };
        
        /** Scheduler: Çalışan görevin benzersiz ID'si */
        jobId?: number;
        /** Scheduler: Çalışan görevin adı */
        jobName?: string;
        /** Scheduler: Görevin tetiklendiği zaman (Tarih/Saat) */
        runAt?: string;
      };

      /**
       * Global fetch API. HTTP istekleri yapmak için kullanılır.
       */
      declare function fetch(url: any, init?: any): any;

      /**
       * Node.js require modülü. Kütüphaneleri yüklemek için kullanılır.
       */
      declare function require(id: string): any;

      /**
       * Node.js process nesnesi.
       */
      declare const process: any;

      /**
       * Mevcut çalışma dizini.
       */
      declare const __dirname: string;

      /**
       * Mevcut dosya adı.
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
       * Ham binary, hex veya base64 veri dönüşümleri ve işlemeleri için Node.js Buffer sınıfı.
       */
      declare namespace Buffer {
        function alloc(size: number): any;
        function from(data: string | any[], encoding?: string): any;
        function concat(list: any[], totalLength?: number): any;
      }

      /**
       * Hash alma, HMAC imzalama veya şifreleme/çözme işlemleri için Node.js crypto modülü.
       */
      declare namespace crypto {
        function createHash(algorithm: string): any;
        function createHmac(algorithm: string, key: string | any): any;
        function randomBytes(size: number): any;
        function randomUUID(): string;
      }

      /**
       * .env dosyasındaki çevre değişkenlerine erişim sağlar.
       */
      declare const env: { [key: string]: string | undefined };

      /**
       * Belirli bir konuya (topic) MQTT mesajı yayınlar. Başarılı ise true döner.
       */
      declare function publishMQTT(topic: string, message: string): boolean;

      /**
       * (Backend) Belirli bir WebSocket odasına (path) veri gönderir.
       * Örnek: publishWS('/api/ws/kazan', { sicaklik: 45 });
       */
      declare function publishWS(path: string, payload: any): void;

      /**
       * (Arayüz/Frontend) Belirli bir WebSocket odasına bağlanır ve mesajları dinler.
       * Sadece Özel Sayfalar (Frontend) içinde çalışır.
       * Örnek: useWS('/api/ws/kazan', (data) => console.log(data));
       */
      declare function useWS(path: string, callback: (data: any) => void): void;

      /**
       * (Microservices) Gelen tüm MQTT mesajlarını dinlemek için abone olur.
       */
      declare function subscribeMQTT(callback: (topic: string, payload: any) => void): void;

      /**
       * Asenkron bekletme metodu (maksimum 5000 ms sınırı vardır).
       * Örnek: await sleep(1000); // 1 saniye bekler
       */
      declare function sleep(ms: number): any;

      /**
       * SMTP sunucusu üzerinden e-posta gönderir.
       */
      declare function sendEmail(options: { to: string; subject: string; text?: string; html?: string }): any;

      /**
       * Modbus TCP üzerinden veri okur.
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
       * Modbus TCP üzerinden veri yazar.
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
        /** Şifreyi senkron olarak hashler. @param data Hashlenecek metin @param saltOrRounds Salt veya round sayısı (varsayılan: 10) */
        hashSync(data: string, saltOrRounds?: number | string): string;
        /** Hash'i senkron olarak doğrular. @param data Doğrulanacak metin @param hash Karşılaştırılacak bcrypt hash'i */
        compareSync(data: string, hash: string): boolean;
        /** Şifreyi asenkron olarak hashler. */
        hash(data: string, saltOrRounds: number | string): Promise<string>;
        /** Hash'i asenkron olarak doğrular. */
        compare(data: string, hash: string): Promise<boolean>;
        /** Salt üretir. @param rounds Round sayısı (varsayılan: 10) */
        genSaltSync(rounds?: number): string;
        /** Asenkron salt üretir. */
        genSalt(rounds?: number): Promise<string>;
        /** Bir hash'in round sayısını döndürür. */
        getRounds(hash: string): number;
      };
    `;
    
    try {
      win.monaco.languages.typescript.javascriptDefaults.addExtraLib(extraLib, 'file:///globals.d.ts');
      win.monaco.languages.typescript.typescriptDefaults.addExtraLib(extraLib, 'file:///globals.d.ts');
    } catch (e) {
      console.warn('Monaco typings loading failed', e);
    }
  }

  // Özel Autocomplete (CompletionItemProvider) Ekleme
  if (!win.__monaco_completion_provider_added_v7__) {
    try {
      // JAVASCRIPT / TYPESCRIPT PROVİDER
      ['javascript', 'typescript'].forEach(lang => {
        win.monaco.languages.registerCompletionItemProvider(lang, {
          triggerCharacters: ['.'],
          provideCompletionItems: (model: any, position: any) => {
            const word = model.getWordUntilPosition(position);
            const lineContent = model.getLineContent(position.lineNumber);
            const textBeforeCursor = lineContent.substring(0, position.column - 1);

            // 1. env. durumunu kontrol et
            const envMatch = textBeforeCursor.match(/env\.(\w*)$/);
            if (envMatch) {
              const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: position.column - envMatch[1].length,
              endColumn: position.column
            };
            return {
              suggestions: [
                {
                  label: 'SECRET_KEY',
                  kind: win.monaco.languages.CompletionItemKind.Property,
                  insertText: 'SECRET_KEY',
                  range: range,
                  detail: 'Uygulama gizli anahtarı'
                },
                {
                  label: 'MQTT_URL',
                  kind: win.monaco.languages.CompletionItemKind.Property,
                  insertText: 'MQTT_URL',
                  range: range,
                  detail: 'mqtt broker connection url'
                },
                {
                  label: 'SMTP_HOST',
                  kind: win.monaco.languages.CompletionItemKind.Property,
                  insertText: 'SMTP_HOST',
                  range: range,
                  detail: 'smtp server host'
                },
                {
                  label: 'SMTP_PORT',
                  kind: win.monaco.languages.CompletionItemKind.Property,
                  insertText: 'SMTP_PORT',
                  range: range,
                  detail: 'smtp server port'
                },
                {
                  label: 'EMAIL_USER',
                  kind: win.monaco.languages.CompletionItemKind.Property,
                  insertText: 'EMAIL_USER',
                  range: range,
                  detail: 'smtp user email address'
                },
                {
                  label: 'EMAIL_PASS',
                  kind: win.monaco.languages.CompletionItemKind.Property,
                  insertText: 'EMAIL_PASS',
                  range: range,
                  detail: 'smtp application password'
                }
              ]
            };
          }

          // 2. db. durumunu kontrol et (db.begin vs. yazarken önerileri çıkar)
          const dbMatch = textBeforeCursor.match(/db\.(\w*)$/);
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
                  detail: 'Transaction (SQL İşlemleri)',
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
                    value: 'Parametreli raw SQL sorgusu çalıştırır.\n\nÖrnek:\n```javascript\nconst rows = await db.unsafe("SELECT * FROM devices WHERE id = $1", [1]);\n```'
                  }
                }
              ]
            };
          }

          const payloadMatch = textBeforeCursor.match(/payload\.(\w*)$/);
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

          const cryptoMatch = textBeforeCursor.match(/crypto\.(\w*)$/);
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

          const bcryptMatch = textBeforeCursor.match(/bcrypt\.(\w*)$/);
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
                    value: 'Şifreyi senkron olarak bcrypt ile hashler.\n\nÖrnek:\n```javascript\nconst hash = bcrypt.hashSync("myPassword", 10);\n```'
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
                    value: 'Şifreyi mevcut bcrypt hash ile senkron karşılaştırır.\n\nÖrnek:\n```javascript\nconst isValid = bcrypt.compareSync("test123", storedHash);\n```'
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
                    value: 'Şifreyi asenkron olarak bcrypt ile hashler.\n\nÖrnek:\n```javascript\nconst hash = await bcrypt.hash("myPassword", 10);\n```'
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
                    value: 'Şifreyi mevcut bcrypt hash ile asenkron karşılaştırır.\n\nÖrnek:\n```javascript\nconst isValid = await bcrypt.compare("test123", storedHash);\n```'
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
                    value: 'Senkron olarak bcrypt salt üretir.\n\nÖrnek:\n```javascript\nconst salt = bcrypt.genSaltSync(12);\nconst hash = bcrypt.hashSync("pass", salt);\n```'
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
                    value: 'Asenkron olarak bcrypt salt üretir.\n\nÖrnek:\n```javascript\nconst salt = await bcrypt.genSalt(12);\n```'
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
                    value: 'Bir bcrypt hash\'inin round sayısını döndürür.\n\nÖrnek:\n```javascript\nconst rounds = bcrypt.getRounds(storedHash); // 10\n```'
                  }
                }
              ]
            };
          }

          const bufferMatch = textBeforeCursor.match(/Buffer\.(\w*)$/);
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
                value: 'Gelen istek parametreleri ve gövdesi (sadece Middleware).\n\nÖrnek:\n```javascript\nconst id = payload.params.id;\n```'
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
                value: 'Node.js require modülü. Kütüphaneleri yüklemek için kullanılır.\n\nÖrnek:\n```javascript\nconst fs = require("fs");\n```'
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
                value: 'Mevcut çalışma dizini.'
              }
            },
            {
              label: '__filename',
              kind: win.monaco.languages.CompletionItemKind.Variable,
              insertText: '__filename',
              range: range,
              detail: 'Current file path',
              documentation: {
                value: 'Mevcut dosya adı.'
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
                value: 'Ham binary, hex veya base64 veri dönüşümleri ve işlemeleri için Node.js Buffer sınıfı.\n\nÖrnek:\n```javascript\nconst buf = Buffer.from("data");\n```'
              }
            },
            {
              label: 'crypto',
              kind: win.monaco.languages.CompletionItemKind.Module,
              insertText: 'crypto',
              range: range,
              detail: 'Node.js crypto Module',
              documentation: {
                value: 'Hash alma, HMAC imzalama veya şifreleme/çözme işlemleri için Node.js crypto modülü.\n\nÖrnek:\n```javascript\nconst hash = crypto.createHash("sha256").update(data).digest("hex");\n```'
              }
            },
            {
              label: 'bcrypt',
              kind: win.monaco.languages.CompletionItemKind.Module,
              insertText: 'bcrypt',
              range: range,
              detail: 'Şifre Hashleme (bcryptjs)',
              documentation: {
                value: 'Güvenli şifre hash\'leme ve doğrulama kütüphanesi.\n\nÖrnekler:\n```javascript\n// Şifre hashleme\nconst hash = bcrypt.hashSync("myPassword", 10);\n\n// Şifre doğrulama\nconst isValid = bcrypt.compareSync("test", hash);\n\n// Asenkron kullanım\nconst hash2 = await bcrypt.hash("pass", 10);\nconst ok = await bcrypt.compare("pass", hash2);\n```'
              }
            },
            {
              label: 'env',
              kind: win.monaco.languages.CompletionItemKind.Variable,
              insertText: 'env',
              range: range,
              detail: 'Environment Variables (process.env)',
              documentation: {
                value: '.env dosyasındaki çevre değişkenlerine erişim sağlar.\n\nÖrnek:\n```javascript\nconst key = env.SECRET_KEY;\n```'
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
                value: 'Belirli bir konuya (topic) MQTT mesajı yayınlar. Başarılı ise true döner.\n\nÖrnek:\n```javascript\npublishMQTT("commands/led", JSON.stringify({ status: true }));\n```'
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
                value: 'SMTP sunucusu üzerinden e-posta gönderir.\n\nÖrnek:\n```javascript\nawait sendEmail({\n  to: "92muratyigit@gmail.com",\n  subject: "Alarm",\n  text: "Kritik Sıcaklık!"\n});\n```'
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
                value: 'Modbus TCP üzerinden veri okur.\n\nÖrnek:\n```javascript\nconst val = await readModbusData("192.168.1.50", 502, 1, 40001, 1, "holding", "uint16");\n```'
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
                value: 'Modbus TCP üzerinden veri yazar.\n\nÖrnek:\n```javascript\nawait writeModbusData("192.168.1.50", 502, 1, 40001, 123, "uint16");\n```'
              }
            }
          ];
            return { suggestions: suggestions };
          }
        });
      }); // End of JS/TS forEach

      // C# PROVİDER (Zengin BCL ve js_env Sınıfları)
      ['csharp', 'dotnet'].forEach(lang => {
        win.monaco.languages.registerCompletionItemProvider(lang, {
          triggerCharacters: ['.'],
          provideCompletionItems: (model: any, position: any) => {
            const word = model.getWordUntilPosition(position);
            const lineContent = model.getLineContent(position.lineNumber);
            const textBeforeCursor = lineContent.substring(0, position.column - 1);
            const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };

            const consoleMatch = textBeforeCursor.match(/Console\.(\w*)$/);
            if (consoleMatch) {
              const r = { ...range, startColumn: position.column - consoleMatch[1].length };
              return { suggestions: [
                { label: 'WriteLine', kind: 1, insertText: 'WriteLine("${1}")', insertTextRules: 4, range: r },
                { label: 'Write', kind: 1, insertText: 'Write("${1}")', insertTextRules: 4, range: r },
                { label: 'Clear', kind: 1, insertText: 'Clear()', insertTextRules: 4, range: r },
                { label: 'ReadLine', kind: 1, insertText: 'ReadLine()', insertTextRules: 4, range: r }
              ]};
            }

            const taskMatch = textBeforeCursor.match(/Task\.(\w*)$/);
            if (taskMatch) {
              const r = { ...range, startColumn: position.column - taskMatch[1].length };
              return { suggestions: [
                { label: 'Delay', kind: 1, insertText: 'Delay(${1:1000})', insertTextRules: 4, range: r },
                { label: 'FromResult', kind: 1, insertText: 'FromResult(${1:null})', insertTextRules: 4, range: r },
                { label: 'Run', kind: 1, insertText: 'Run(() => {\n\t${1}\n})', insertTextRules: 4, range: r },
                { label: 'WhenAll', kind: 1, insertText: 'WhenAll(${1:tasks})', insertTextRules: 4, range: r }
              ]};
            }

            const envMatch = textBeforeCursor.match(/Environment\.(\w*)$/);
            if (envMatch) {
              const r = { ...range, startColumn: position.column - envMatch[1].length };
              return { suggestions: [
                { label: 'GetEnvironmentVariable', kind: 1, insertText: 'GetEnvironmentVariable("${1}")', insertTextRules: 4, range: r },
                { label: 'Exit', kind: 1, insertText: 'Exit(${1:0})', insertTextRules: 4, range: r },
                { label: 'MachineName', kind: 9, insertText: 'MachineName', range: r }
              ]};
            }

            const mathMatch = textBeforeCursor.match(/Math\.(\w*)$/);
            if (mathMatch) {
              const r = { ...range, startColumn: position.column - mathMatch[1].length };
              return { suggestions: [
                { label: 'Abs', kind: 1, insertText: 'Abs(${1:val})', insertTextRules: 4, range: r },
                { label: 'Round', kind: 1, insertText: 'Round(${1:val}, ${2:2})', insertTextRules: 4, range: r },
                { label: 'Max', kind: 1, insertText: 'Max(${1:a}, ${2:b})', insertTextRules: 4, range: r },
                { label: 'Min', kind: 1, insertText: 'Min(${1:a}, ${2:b})', insertTextRules: 4, range: r }
              ]};
            }

            const convertMatch = textBeforeCursor.match(/Convert\.(\w*)$/);
            if (convertMatch) {
              const r = { ...range, startColumn: position.column - convertMatch[1].length };
              return { suggestions: [
                { label: 'ToInt32', kind: 1, insertText: 'ToInt32(${1})', insertTextRules: 4, range: r },
                { label: 'ToDouble', kind: 1, insertText: 'ToDouble(${1})', insertTextRules: 4, range: r },
                { label: 'ToString', kind: 1, insertText: 'ToString(${1})', insertTextRules: 4, range: r },
                { label: 'ToBoolean', kind: 1, insertText: 'ToBoolean(${1})', insertTextRules: 4, range: r }
              ]};
            }

            const jsEnvDbMatch = textBeforeCursor.match(/js_env\.db\.(\w*)$/);
            if (jsEnvDbMatch) {
              const r = { ...range, startColumn: position.column - jsEnvDbMatch[1].length };
              return { suggestions: [
                { label: 'unsafe', kind: 1, insertText: 'unsafe("${1:query}", new object[] { ${2} })', insertTextRules: 4, range: r, detail: 'Raw SQL' }
              ]};
            }

            const jsEnvMatch = textBeforeCursor.match(/js_env\.(\w*)$/);
            if (jsEnvMatch) {
              const r = { ...range, startColumn: position.column - jsEnvMatch[1].length };
              return { suggestions: [
                { label: 'sleep', kind: 1, insertText: 'sleep(${1:1000})', insertTextRules: 4, range: r },
                { label: 'publishMQTT', kind: 1, insertText: 'publishMQTT("${1:topic}", "${2:msg}")', insertTextRules: 4, range: r },
                { label: 'sendEmail', kind: 1, insertText: 'sendEmail(new { to = "${1}", subject = "${2}", text = "${3}" })', insertTextRules: 4, range: r },
                { label: 'readModbusData', kind: 1, insertText: 'readModbusData("${1:ip}", 502, 1, ${2:40001}, 1)', insertTextRules: 4, range: r },
                { label: 'writeModbusData', kind: 1, insertText: 'writeModbusData("${1:ip}", 502, 1, ${2:40001}, ${3:value})', insertTextRules: 4, range: r },
                { label: 'db', kind: 9, insertText: 'db', range: r },
                { label: 'crypto', kind: 9, insertText: 'crypto', range: r },
                { label: 'bcrypt', kind: 9, insertText: 'bcrypt', range: r }
              ]};
            }

            if (textBeforeCursor.match(/\.\w*$/)) return { suggestions: [] };

            return { suggestions: [
              { label: 'Console', kind: 5, insertText: 'Console', range },
              { label: 'Task', kind: 5, insertText: 'Task', range },
              { label: 'System', kind: 9, insertText: 'System', range },
              { label: 'Environment', kind: 5, insertText: 'Environment', range },
              { label: 'Math', kind: 5, insertText: 'Math', range },
              { label: 'Convert', kind: 5, insertText: 'Convert', range },
              { label: 'String', kind: 5, insertText: 'String', range },
              { label: 'DateTime', kind: 5, insertText: 'DateTime', range },
              { label: 'TimeSpan', kind: 5, insertText: 'TimeSpan', range },
              { label: 'List<>', kind: 5, insertText: 'List<${1:string}>', insertTextRules: 4, range },
              { label: 'Dictionary<>', kind: 5, insertText: 'Dictionary<${1:string}, ${2:object}>', insertTextRules: 4, range },
              { label: 'js_env', kind: 6, insertText: 'js_env', range, detail: 'Node.js global objeleri (db, sleep vb.)' }
            ]};
          }
        });
      }); // End of C# forEach

      // PYTHON PROVİDER (Zengin Standard Kütüphane ve js_env)
      win.monaco.languages.registerCompletionItemProvider('python', {
        triggerCharacters: ['.'],
        provideCompletionItems: (model: any, position: any) => {
          const word = model.getWordUntilPosition(position);
          const lineContent = model.getLineContent(position.lineNumber);
          const textBeforeCursor = lineContent.substring(0, position.column - 1);
          const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };

          const jsEnvDbMatch = textBeforeCursor.match(/js_env\.db\.(\w*)$/);
          if (jsEnvDbMatch) {
            const r = { ...range, startColumn: position.column - jsEnvDbMatch[1].length };
            return { suggestions: [
              { label: 'unsafe', kind: 1, insertText: 'unsafe("${1:query}", [${2}])', insertTextRules: 4, range: r, detail: 'Raw SQL' }
            ]};
          }

          const jsEnvMatch = textBeforeCursor.match(/js_env\.(\w*)$/);
          if (jsEnvMatch) {
            const r = { ...range, startColumn: position.column - jsEnvMatch[1].length };
            return { suggestions: [
              { label: 'sleep', kind: 1, insertText: 'sleep(${1:1000})', insertTextRules: 4, range: r },
              { label: 'publishMQTT', kind: 1, insertText: 'publishMQTT("${1:topic}", "${2:msg}")', insertTextRules: 4, range: r },
              { label: 'sendEmail', kind: 1, insertText: 'sendEmail({"to": "${1}", "subject": "${2}", "text": "${3}"})', insertTextRules: 4, range: r },
              { label: 'readModbusData', kind: 1, insertText: 'readModbusData("${1:ip}", 502, 1, ${2:40001}, 1)', insertTextRules: 4, range: r },
              { label: 'writeModbusData', kind: 1, insertText: 'writeModbusData("${1:ip}", 502, 1, ${2:40001}, ${3:value})', insertTextRules: 4, range: r },
              { label: 'db', kind: 9, insertText: 'db', range: r },
              { label: 'crypto', kind: 9, insertText: 'crypto', range: r },
              { label: 'bcrypt', kind: 9, insertText: 'bcrypt', range: r }
            ]};
          }

          const jsonMatch = textBeforeCursor.match(/json\.(\w*)$/);
          if (jsonMatch) {
            const r = { ...range, startColumn: position.column - jsonMatch[1].length };
            return { suggestions: [
              { label: 'dumps', kind: 1, insertText: 'dumps(${1:obj})', insertTextRules: 4, range: r },
              { label: 'loads', kind: 1, insertText: 'loads(${1:str})', insertTextRules: 4, range: r }
            ]};
          }

          const timeMatch = textBeforeCursor.match(/time\.(\w*)$/);
          if (timeMatch) {
            const r = { ...range, startColumn: position.column - timeMatch[1].length };
            return { suggestions: [
              { label: 'sleep', kind: 1, insertText: 'sleep(${1:secs})', insertTextRules: 4, range: r },
              { label: 'time', kind: 1, insertText: 'time()', insertTextRules: 4, range: r }
            ]};
          }

          if (textBeforeCursor.match(/\.\w*$/)) return { suggestions: [] };

          return { suggestions: [
            { label: 'print', kind: 1, insertText: 'print(${1})', insertTextRules: 4, range },
            { label: 'len', kind: 1, insertText: 'len(${1})', insertTextRules: 4, range },
            { label: 'type', kind: 1, insertText: 'type(${1})', insertTextRules: 4, range },
            { label: 'range', kind: 1, insertText: 'range(${1:10})', insertTextRules: 4, range },
            { label: 'open', kind: 1, insertText: 'open("${1:file.txt}", "${2:r}")', insertTextRules: 4, range },
            { label: 'str', kind: 5, insertText: 'str(${1})', insertTextRules: 4, range },
            { label: 'int', kind: 5, insertText: 'int(${1})', insertTextRules: 4, range },
            { label: 'float', kind: 5, insertText: 'float(${1})', insertTextRules: 4, range },
            { label: 'list', kind: 5, insertText: 'list(${1})', insertTextRules: 4, range },
            { label: 'dict', kind: 5, insertText: 'dict(${1})', insertTextRules: 4, range },
            { label: 'set', kind: 5, insertText: 'set(${1})', insertTextRules: 4, range },
            { label: 'import', kind: 14, insertText: 'import ${1:module}', insertTextRules: 4, range },
            { label: 'json', kind: 9, insertText: 'json', range },
            { label: 'time', kind: 9, insertText: 'time', range },
            { label: 'os', kind: 9, insertText: 'os', range },
            { label: 'sys', kind: 9, insertText: 'sys', range },
            { label: 'math', kind: 9, insertText: 'math', range },
            { label: 'random', kind: 9, insertText: 'random', range },
            { label: 'datetime', kind: 9, insertText: 'datetime', range },
            { label: 're', kind: 9, insertText: 're', range },
            { label: 'js_env', kind: 6, insertText: 'js_env', range, detail: 'Node.js global objeleri (db, sleep vb.)' }
          ]};
        }
      });

      win.__monaco_completion_provider_added_v7__ = true;
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
    sql: '.sql',
    python: '.py',
    csharp: '.cs',
    dotnet: '.cs'
  };
  const ext = extensionMap[language] || '.js';
  const uniqueId = Math.random().toString(36).substring(2, 10);
  const modelUri = win.monaco.Uri.parse(`file:///model_${uniqueId}${ext}`);
  
  let model = win.monaco.editor.createModel(props.modelValue, language, modelUri);

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
    wordBasedSuggestions: (language === 'javascript' || language === 'typescript') ? 'off' : 'currentDocument',
    suggest: {
      showWords: !(language === 'javascript' || language === 'typescript')
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
      
      const isJs = newLang === 'javascript' || newLang === 'typescript';
      editor.updateOptions({
        wordBasedSuggestions: isJs ? 'off' : 'currentDocument',
        suggest: {
          showWords: !isJs
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
      model.dispose();
    }
    editor.dispose();
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
