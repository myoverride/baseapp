import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import util from 'node:util';
import cluster from 'node:cluster';


// Güvenlik ve Uptime: Konsol loglarının custom fs.writeStream ile dosyaya yazılması,
// stream race condition'ları ve Node.js çökmelerine (ERR_STREAM_WRITE_AFTER_END)
// yol açtığı için kaldırıldı. Standalone endüstriyel sistemlerde konsol çıktıları
// pm2-logrotate veya işletim sistemi (systemd) log yönetimi ile handle edilmelidir.

import forge from 'node-forge';

const appRoot = process.env.APP_HOME || process.cwd();

// --- GLOBAL KALKAN VE DOSYA TABANLI LOGLAMA ---
const logErrorToFile = (type, error) => {
  try {
    const logDir = path.join(appRoot, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'crash.log');
    const timestamp = new Date().toISOString();
    const errorMsg = error instanceof Error ? error.stack : String(error);
    const msg = `[${timestamp}] [${type}] ${errorMsg}\n`;
    fs.appendFileSync(logFile, msg);
  } catch (e) {
    console.error('Log dosyasına yazılamadı:', e);
  }
};

process.on('uncaughtException', (err) => {
  console.error('\n🔥 [Global Kalkan] Yakalanmayan Kritik Hata:', err.message);
  logErrorToFile('uncaughtException', err);
  // Prevent memory corruption and unpredictable states by exiting.
  // PM2 or the internal cluster fork will restart the process with a clean state.
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 [Global Kalkan] Yakalanmayan Promise Hatası:', reason);
  logErrorToFile('unhandledRejection', reason);
});
// ----------------------------------------------

const configPath = path.join(appRoot, 'config.json');

// Varsayılan konfigürasyon
let config = {
  mode: 'local', // 'local' veya 'letsencrypt'
  httpPort: 80,
  httpsPort: 443,
  mqttPort: 1883
};

// Konfigürasyon oku veya oluştur
if (fs.existsSync(configPath)) {
  try {
    const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config = { ...config, ...userConfig };
  } catch (err) {
    console.error('Config okuma hatası, varsayılanlar kullanılıyor.');
  }
} else {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      if (err.code !== 'EPERM' && err.code !== 'EEXIST') {
        console.error('Config dizini oluşturulamadı:', err.message);
      }
    }
  }
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Config dosyası yazılamadı (Yetki reddi olabilir):', err.message);
  }
}



// 2. Hybrid SSL ve Web Sunucusu Başlatma
async function startServer() {
  // Nuxt'un build sonrası oluşturduğu handler
  // Not: Geliştirme modunda bu dosya olmayabilir, bu yüzden dinamik import kullanıyoruz
  let handle;
  let handleUpgrade;
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    let nitroPath = path.join(__dirname, 'index.mjs');
    let chunksNitroPath = path.join(__dirname, 'chunks', '_', 'nitro.mjs');

    if (!fs.existsSync(nitroPath)) {
      // Fallback for development (running from project root)
      nitroPath = path.join(__dirname, '.output', 'server', 'index.mjs');
      chunksNitroPath = path.join(__dirname, '.output', 'server', 'chunks', '_', 'nitro.mjs');
    }

    const nitroApp = await import(`file://${nitroPath}`);
    const originalHandle = nitroApp.handler || nitroApp.handle || nitroApp.default;

    try {
      const crosswsNodeModule = await import('crossws/adapters/node');
      const crosswsNode = crosswsNodeModule.default || crosswsNodeModule;
      
      let wsConfig = null;
      if (nitroApp.websocket) {
        wsConfig = nitroApp.websocket;
      } else {
        const chunksNitro = await import(`file://${chunksNitroPath}`);
        if (chunksNitro.ws) {
          wsConfig = chunksNitro.ws;
        } else if (chunksNitro.useNitroApp) {
          const internalNitroApp = chunksNitro.useNitroApp();
          if (internalNitroApp && internalNitroApp.h3App && internalNitroApp.h3App.websocket) {
            wsConfig = internalNitroApp.h3App.websocket;
          } else if (internalNitroApp && internalNitroApp.router && internalNitroApp.router.websocket) {
            wsConfig = internalNitroApp.router.websocket;
          }
        }
      }

      if (wsConfig) {
        const wsAdapter = crosswsNode(wsConfig);
        handleUpgrade = (req, socket, head) => wsAdapter.handleUpgrade(req, socket, head);
      } else {
        console.warn('⚠️ WebSocket konfigürasyonu bulunamadı. WebSocket istekleri 426 dönecektir.');
        // Fallback denemesi: Belki h3App'in kendisi crossws için uyumludur
        const chunksNitro = await import(`file://${chunksNitroPath}`);
        if (chunksNitro.useNitroApp) {
           const app = chunksNitro.useNitroApp().h3App;
           if (app) {
              try {
                const wsAdapter = crosswsNode(app);
                handleUpgrade = (req, socket, head) => wsAdapter.handleUpgrade(req, socket, head);
              } catch(e) {}
           }
        }
      }
    } catch (wsErr) {
      console.warn('⚠️ WebSocket adapter başlatılamadı:', wsErr.message);
    }

    
    const publicDir = path.resolve(__dirname, '..', 'public');
    const mimeTypes = {
      '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
      '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
      '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
      '.eot': 'application/vnd.ms-fontobject', '.wasm': 'application/wasm'
    };

    handle = (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return originalHandle(req, res);
      let urlPath = req.url.split('?')[0];
      if (urlPath === '/') return originalHandle(req, res);
      
      const filePath = path.join(publicDir, urlPath);
      if (!filePath.startsWith(publicDir)) return originalHandle(req, res);
      
      fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) return originalHandle(req, res);
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'Content-Length': stat.size,
          'Cache-Control': 'public, max-age=31536000, immutable'
        });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(filePath).pipe(res);
      });
    };
  } catch (err) {
    console.warn("⚠️ '.output/server/index.mjs' bulunamadı. Lütfen önce 'npm run build' çalıştırın.");
    handle = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Nuxt build henuz alinmadi. Lutfen npm run build komutunu calistirin.');
    };
  }

  if (config.mode === 'letsencrypt') {
    console.log("🌍 Greenlock (Let's Encrypt) modunda başlatılıyor...");
    // @ts-ignore: greenlock-express için type declaration dosyası eksik uyarılarını gizler
    const glxModule = await import('greenlock-express');
    const glx = glxModule.default || glxModule;
    
    glx.init({
      packageRoot: __dirname,
      configDir: path.join(appRoot, 'greenlock.d'),
      maintainerEmail: config.maintainerEmail || "admin@example.com",
      cluster: false
    }).ready(function(glxInstance) {
      glxInstance.serveApp(handle);
    });
  } else {
    console.log('🏠 Local (Self-Signed) modunda başlatılıyor...');
    const sslDir = path.join(appRoot, '.ssl');
    const keyPath = path.join(sslDir, 'server.key');
    const certPath = path.join(sslDir, 'server.cert');

    // Sertifika yoksa Node-Forge ile üret
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      console.log('Sertifika bulunamadı, node-forge ile Self-Signed sertifika üretiliyor...');
      fs.mkdirSync(sslDir, { recursive: true });
      
      const keys = forge.pki.rsa.generateKeyPair(2048);
      const cert = forge.pki.createCertificate();
      cert.publicKey = keys.publicKey;
      cert.serialNumber = '01';
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
      
      const attrs = [{ name: 'commonName', value: 'localhost' }];
      cert.setSubject(attrs);
      cert.setIssuer(attrs);

      const interfaces = os.networkInterfaces();
      const ips = [];
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            ips.push({ type: 7, ip: iface.address });
          }
        }
      }

      cert.setExtensions([{
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          ...ips
        ]
      }]);

      cert.sign(keys.privateKey, forge.md.sha256.create());
      
      fs.writeFileSync(keyPath, forge.pki.privateKeyToPem(keys.privateKey));
      fs.writeFileSync(certPath, forge.pki.certificateToPem(cert));
    }

    const options = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };

    const httpServer = createHttpServer((req, res) => {
      // Standart HTTP isteklerini HTTPS'e yönlendir
      const host = req.headers['host']?.replace(/:\d+$/, '') || 'localhost';
      const httpsPort = config.httpsPort === 443 ? '' : `:${config.httpsPort}`;
      res.writeHead(301, { "Location": `https://${host}${httpsPort}${req.url}` });
      res.end();
    });

    const httpsServer = createHttpsServer(options, handle);

    if (handleUpgrade) {
      httpServer.on('upgrade', handleUpgrade);
      httpsServer.on('upgrade', handleUpgrade);
    }

    // EACCES (Yetki Reddi) durumunda alternatif portlara düşme (Fallback)
    function listenWithFallback(server, port, fallbackPort, label) {
      server.on('error', (e) => {
        if (e.code === 'EACCES') {
          console.warn(`⚠️ Port ${port} için Yönetici/Root yetkisi eksik! ${fallbackPort} portuna düşülüyor (Fallback)...`);
          server.listen(fallbackPort);
        } else {
          console.error(`${label} Server Hatası:`, e);
        }
      });
      
      server.listen(port, () => {
        const actualPort = server.address().port;
        console.log(`🌐 ${label} Sunucu port ${actualPort} üzerinde dinliyor`);
      });
    }

    listenWithFallback(httpServer, config.httpPort, 8080, 'HTTP');
    listenWithFallback(httpsServer, config.httpsPort, 8443, 'HTTPS');

    // ==========================================
    // GRACEFUL SHUTDOWN
    // ==========================================
    let isShuttingDown = false;
    async function gracefulShutdown(signal) {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`\n🛑 ${signal} alındı. Graceful shutdown başlatılıyor...`);

      // 1. Yeni bağlantı kabul etmeyi durdur
      httpServer.close();
      httpsServer.close();
      console.log('  ✓ HTTP/HTTPS sunucuları kapatıldı');

      // 2. DuckDB telemetry buffer'ını flush et
      try {
        const { flushAppender } = await import('./chunks/_/nitro.mjs').then(m => {
          // Nitro içindeki modülü bulmaya çalış
          return m;
        }).catch(() => ({}));
        if (typeof flushAppender === 'function') {
          await flushAppender();
          console.log('  ✓ Telemetry buffer flush edildi');
        }
      } catch (e) {
        // Flush fonksiyonu bulunamazsa sessizce devam et
      }

      // 3. MQTT broker ve client bağlantılarını kapat
      try {
        if (globalThis.__aedesApp) {
          globalThis.__aedesApp.close();
          console.log('  ✓ MQTT Broker (Aedes) kapatıldı');
        }
        if (globalThis.__mqttTimeoutInterval) {
          clearInterval(globalThis.__mqttTimeoutInterval);
        }
      } catch (e) {}

      // 4. Scheduler interval'ini durdur
      try {
        if (globalThis.__schedulerInterval) {
          clearInterval(globalThis.__schedulerInterval);
          console.log('  ✓ Scheduler durduruldu');
        }
      } catch (e) {}


      console.log('Güle güle! Temiz kapanış tamamlandı.');
      process.exit(0);
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }
}

// ==========================================
// CLUSTER (SELF-HEALING) & BASLATMA
// ==========================================
if (cluster.isPrimary) {
  console.log(`🛡️ Master Gözetmen (PID: ${process.pid}) çalışıyor.`);
  
  // Tek bir Worker (İşçi) sunucu başlatıyoruz
  cluster.fork();

  let restartAttempts = 0;
  const MAX_RESTARTS = 10;
  
  cluster.on('exit', (worker, code, signal) => {
    const exitReason = signal || code;
    const msg = `İşçi Sunucu (PID: ${worker.process.pid}) ${exitReason} sebebiyle çöktü!`;
    console.error(`\n[KRİTİK UYARI] ${msg}`);
    logErrorToFile('WorkerExit', msg);
    
    restartAttempts++;
    if (restartAttempts > MAX_RESTARTS) {
      console.error(`[FATAL] Maksimum çökme limitine (${MAX_RESTARTS}) ulaşıldı. Sürekli yeniden başlatma durduruluyor.`);
      process.exit(1);
    }

    const backoffTime = Math.min(1000 * Math.pow(2, restartAttempts - 1), 60000); // 1s, 2s, 4s... max 60s
    console.log(`🔄 Sistem ${backoffTime / 1000} saniye içinde otomatik olarak yeniden başlatılıyor... (Deneme: ${restartAttempts}/${MAX_RESTARTS})`);
    
    setTimeout(() => {
      cluster.fork();
    }, backoffTime);
  });
} else {
  // Sadece işçi (Worker) process asıl web sunucusunu başlatır
  startServer();
}
