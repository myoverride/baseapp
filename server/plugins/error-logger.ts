// server/plugins/error-logger.ts
import fs from 'node:fs';
import path from 'node:path';

// Uygulama kök dizini (Hem Dev hem Prod için ortak)
const appRoot = process.env.APP_HOME || process.cwd();

const logErrorToFile = (type: string, error: any) => {
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

export default defineNitroPlugin((nitroApp) => {
  
  // 1. API İstekleri (HTTP) sırasında oluşan hataları temizle
  nitroApp.hooks.hook('error', (error: any, { event }) => {
    if (error.statusCode === 401 || error.statusCode === 403) return; // Gereksiz auth hatalarını loglama
    const path = event?.path || 'Bilinmeyen Yol';
    const msg = `[ALERT] [API Error] ${path} -> ${error.message}`;
    console.error(msg);
    logErrorToFile('ApiError', msg);
  });

  // 2. Sistemsel (Senin yakalamadığın Promise/Asenkron) hataları temizle
  process.on('unhandledRejection', (reason: any) => {
    console.error(`[CRASH] [Beklenmeyen Hata]: ${reason?.message || reason}`);
    logErrorToFile('unhandledRejection', reason);
  });

  // 3. Çökmeye sebep olacak kritik (Uncaught Exception) hataları temizle
  process.on('uncaughtException', (error) => {
    console.error(`[FATAL] [Kritik Çökme]: ${error.message}`);
    logErrorToFile('uncaughtException', error);
  });
});
