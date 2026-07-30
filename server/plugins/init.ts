import { initMasterDb, closeDatabases } from '../utils/db';
import { initMQTT } from '../utils/mqtt';
import { flushAppender } from '../utils/duckdb-appender';

export default defineNitroPlugin(async (_nitroApp) => {
  // Build sırasında (prerender) başlatma
  if (import.meta.prerender || process.env.npm_lifecycle_event === 'build') return;

  console.log('[Init] Sistem Başlatılıyor...');
  
  // Önce Master DB'yi kur/kontrol et
  initMasterDb();
  
  // Sonra MQTT'den veri yutmaya başla
  initMQTT();

  // Cron Workers'ları başlat
  const { initCronWorkers, initDaemonWorkers, stopAllDaemonWorkers } = await import('../utils/workerManager');
  initCronWorkers();

  // Daemon Workers'ları başlat
  await initDaemonWorkers();

  // ==========================================
  // GRACEFUL SHUTDOWN (Dev Mode)
  // ==========================================
  let isShuttingDown = false;
  async function gracefulShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[SHUTDOWN] ${signal} alındı. Graceful shutdown başlatılıyor...`);

    // 1. Cron Workers'ları durdur
    if ((globalThis as any).__cronWorkerInterval) {
      clearInterval((globalThis as any).__cronWorkerInterval);
      console.log('  [OK] Cron Workers durduruldu');
    }

    // 2. Daemon worker'ları durdur
    try {
      await stopAllDaemonWorkers();
      console.log('  [OK] Daemon worker\'lar durduruldu');
    } catch {}

    // 3. DuckDB telemetry buffer'ını flush et
    try {
      await flushAppender();
      console.log('  [OK] Telemetry buffer flush edildi');
    } catch {}

    // 4. MQTT bağlantılarını kapat
    try {
      if ((globalThis as any).__mqttClient) {
        (globalThis as any).__mqttClient.end();
        console.log('  [OK] MQTT client kapatıldı');
      }
      if ((globalThis as any).__mqttTimeoutInterval) {
        clearInterval((globalThis as any).__mqttTimeoutInterval);
      }
      if ((globalThis as any).__aedesBroker) {
        (globalThis as any).__aedesBroker.close();
        if ((globalThis as any).__aedesApp) {
          (globalThis as any).__aedesApp.close();
        }
        console.log('  [OK] MQTT Broker kapatıldı');
      }
    } catch {}

    // 5. Veritabanlarını kapat
    try {
      await closeDatabases();
      console.log('  [OK] Veritabanı bağlantıları kapatıldı');
    } catch (err) {
      console.error('Veritabanları kapatılırken hata:', err);
    }

    console.log(`[EXIT] ${signal === 'HMR-CLOSE' ? 'HMR Temizliği' : 'Güle güle! Temiz kapanış'} tamamlandı.`);
    // Sadece işletim sistemi sinyallerinde process'i sonlandır.
    // HMR (close hook) sırasında process kapanmamalıdır, sadece temizlik yapılmalıdır.
    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      process.exit(0);
    }
  }

  // Nitro HMR kancası: Yeni worker başlatılmadan önce eskisini temizler
  _nitroApp.hooks.hook('close', () => gracefulShutdown('HMR-CLOSE'));

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
});

