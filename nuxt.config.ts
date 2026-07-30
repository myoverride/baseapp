import fs from 'node:fs';
import path from 'node:path';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  devtools: {
    enabled: false
  },

  app: {
    head: {
      script: [
        { src: '/lib/chart.umd.js', defer: true },
        { src: '/lib/echarts.min.js', defer: true },
        {
          innerHTML: `
            window.__deferredPwaPrompt = null;
            window.addEventListener('beforeinstallprompt', (e) => {
              window.__deferredPwaPrompt = e;
              if (window.__pwaPromptCallback) window.__pwaPromptCallback(e);
            });
          `,
          type: 'text/javascript'
        }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' },
        { rel: 'manifest', href: '/manifest.json' },
        { rel: 'apple-touch-icon', href: '/logo.svg' }
      ],
      meta: [
        { name: 'theme-color', content: '#121212' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'BaseApp' },
        { name: 'mobile-web-app-capable', content: 'yes' }
      ]
    }
  },

  vue: {
    runtimeCompiler: true
  },

  modules: [
    'vuetify-nuxt-module'
  ],

  vuetify: {
    // ...
  },

  sourcemap: {
    server: false,
    client: false
  },

  postcss: {
    plugins: {
      cssnano: {
        preset: ['default', { calc: false }]
      }
    }
  },

  vite: {
    logLevel: 'warn',
    esbuild: {
      logOverride: {
        'css-syntax-error': 'silent'
      }
    },
    build: {
      modulePreload: false
    }
  },

  nitro: {
    experimental: {
      websocket: true
    },
    preset: 'node',
    serveStatic: true,
    output: {
      dir: '.output'
    },
    externals: {
      traceInclude: ['node_modules/crossws/**'],
      external: ['node:sqlite', /@nuxt\/nitro-server/]
    },
    prerender: {
      crawlLinks: false,
      routes: ['/']
    },
    hooks: {
      'compiled'(nitro) {
        const sqlSrc = path.resolve('node_modules/sql.js/dist/sql-wasm.wasm');
        const sqlDestDir = path.resolve('.output/server/node_modules/sql.js/dist');
        if (fs.existsSync(sqlSrc)) {
          fs.mkdirSync(sqlDestDir, { recursive: true });
          fs.copyFileSync(sqlSrc, path.join(sqlDestDir, 'sql-wasm.wasm'));
        }

        const duckSrc = path.resolve('node_modules/duckdb/lib/binding');
        const duckDest = path.resolve('.output/server/node_modules/duckdb/lib/binding');
        if (fs.existsSync(duckSrc)) {
          fs.mkdirSync(duckDest, { recursive: true });
          fs.cpSync(duckSrc, duckDest, { recursive: true });
        }

        // server.js çalışma zamanı modüllerini caxa paketi içine kopyala
        const copyModule = (name: string) => {
          const src = path.resolve('node_modules', name);
          const dest = path.resolve('.output/server/node_modules', name);
          if (fs.existsSync(src)) {
            fs.mkdirSync(dest, { recursive: true });
            fs.cpSync(src, dest, { recursive: true });
          }
        };
        copyModule('crossws');
        copyModule('node-forge');
        copyModule('greenlock-express');
        copyModule('bcryptjs');

        // Copy worker.js
        const workerSrc = path.resolve('server/utils/worker.js');
        const workerDestDir = path.resolve('.output/server/utils');
        const workerDest = path.join(workerDestDir, 'worker.js');
        if (fs.existsSync(workerSrc)) {
          fs.mkdirSync(workerDestDir, { recursive: true });
          fs.copyFileSync(workerSrc, workerDest);
        }

        // Caxa için server.js'i .output/server içine kopyala
        const serverJsSrc = path.resolve('server.js');
        const serverJsDest = path.resolve('.output/server/server.js');
        if (fs.existsSync(serverJsSrc)) {
          fs.copyFileSync(serverJsSrc, serverJsDest);
        }
      }
    }
  }
});

