import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import mqtt from 'mqtt';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// Sabitler
const TOTAL_DEVICES = 1000;
const THREAD_COUNT = 20; // Artırılmış thread sayısı
const DEVICES_PER_THREAD = TOTAL_DEVICES / THREAD_COUNT;
const MQTT_BROKER = 'mqtt://127.0.0.1:1883';
const SEND_INTERVAL_MS = 100; // Saniyede 1 kez gönderim (Toplam 1000 mesaj/sn)

if (isMainThread) {
  console.log(`[MAIN] Başlatılıyor: Toplam ${TOTAL_DEVICES} cihaz, ${THREAD_COUNT} thread üzerinden simüle edilecek.`);
  const __filename = fileURLToPath(import.meta.url);

  for (let t = 0; t < THREAD_COUNT; t++) {
    const startIndex = t * DEVICES_PER_THREAD;
    const worker = new Worker(__filename, {
      workerData: { threadId: t + 1, startIndex, count: DEVICES_PER_THREAD }
    });

    worker.on('message', (msg) => {
      // Sadece kritik hataları dinle
      if (msg.type === 'error') console.error(`[THREAD ${t + 1}] Hata:`, msg.data);
    });

    worker.on('exit', (code) => {
      if (code !== 0) console.error(`[THREAD ${t + 1}] Beklenmeyen çıkış kodu: ${code}`);
    });
  }
} else {
  // --- WORKER THREAD ---
  const { threadId, startIndex, count } = workerData;
  console.log(`[THREAD ${threadId}] Başladı. Cihaz endeksi: ${startIndex} - ${startIndex + count - 1}`);

  (async () => {
    const myDevices = [];
    let globalIndex = 0;
    for (let f = 1; f <= 10; f++) {
      for (let m = 1; m <= 100; m++) {
        if (globalIndex >= startIndex && globalIndex < startIndex + count) {
          myDevices.push(`sim_device_${f}_${m}`);
        }
        globalIndex++;
      }
    }

    for (let i = 0; i < myDevices.length; i++) {
      const deviceId = myDevices[i];
      const secretKey = `secret_${deviceId}`;

      // Bağlantıları çok kısa aralıklarla (20ms) açarak Windows soket çakışmalarını ve OOM çökmelerini (Exit 9) engelle
      await new Promise(res => setTimeout(res, 20));

      const client = mqtt.connect(MQTT_BROKER, {
        clientId: `simulator_${deviceId}`,
        username: deviceId,
        password: secretKey,
        clean: true,
        reconnectPeriod: 2000
      });

      client.on('connect', () => {
        // Saniyede bir veri gönder
        setInterval(() => {
          const temp = 20 + Math.random() * 60; // 20-80 derece arası
          const vib = Math.random() * 5;
          const timestamp = new Date().toISOString();

          const payload = { temp: temp.toFixed(2), vib: vib.toFixed(2), deviceId };
          const rawPayloadString = JSON.stringify(payload);

          const dataToSign = `${deviceId}|${timestamp}|${rawPayloadString}`;
          const hmac = crypto.createHmac('sha256', secretKey).update(dataToSign).digest('hex');

          const mqttMessage = {
            deviceId,
            timestamp,
            payload,
            hmac
          };

          client.publish(`telemetry/${deviceId}`, JSON.stringify(mqttMessage), { qos: 0 });
        }, SEND_INTERVAL_MS);
      });

      client.on('error', (err) => {
        // parentPort.postMessage({ type: 'error', data: `[${deviceId}] ` + err.message });
      });
    }

    console.log(`[THREAD ${threadId}] ${myDevices.length} cihaz için bağlantılar başlatıldı.`);
  })();
}
