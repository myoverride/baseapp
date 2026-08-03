import crypto from 'node:crypto';
import { useDB } from './db';
import { validateTelemetry } from './validator';
import { appendTelemetry } from './duckdb-appender';
import { updateCommandStatus } from './deviceCommands';
import { runCustomCode } from './sandbox';
import { getActiveEndpoints, matchRoute } from './endpointManager';

import { LRUCache } from 'lru-cache';

// Performans için şifre ve şemaları RAM'de önbelleğe alıyoruz
// OOM riskine karşı maksimum 50.000 cihaz önbellekte tutulur ve 30 dk (1800000ms) TTL uygulanır.
const deviceCache = new LRUCache<string, { secretKey: string, schema: any, expiresAt: number }>({ max: 50000, ttl: 1800000 });
const pendingFetches = new LRUCache<string, Promise<any>>({ max: 50000, ttl: 60000 });

const g: any = globalThis;

export function initMQTT() {
  // HMR Cleanup
  if (g.__mqttTimeoutInterval) {
    clearInterval(g.__mqttTimeoutInterval);
  }

  // 30 saniye boyunca cevaplanmayan komutları TIMEOUT durumuna geçirmek için
  // çözüm önerileri rapora/kullanıcıya sunulacak. 
  // Eski boş cron silindi.
}

// Aedes broker üzerinden native olarak (TCP kullanmadan) çağrılır
export async function handleMqttMessage(tenantSlug: string, topic: string, message: Buffer) {
  if (!tenantSlug) {
     console.error('MQTT Hatası: tenantSlug belirtilmedi');
     return;
  }
  const sql = useDB(tenantSlug);
  try {
    // DOWNLINK COMMAND RESPONSE HANDLER
    if (topic.startsWith('commands/') && topic.endsWith('/response')) {
      const data = JSON.parse(message.toString());
      const { correlationId, status, response } = data;
      if (correlationId) {
        // 1. RAM'deki PENDING/SENT komutu var mı kontrol et
        const { getTenantStore } = await import('./deviceCommands');
        const store = getTenantStore(tenantSlug);
        const activeCmd = store.get(correlationId);
        if (!activeCmd || !['PENDING', 'SENT'].includes(activeCmd.status)) {
          console.warn(`[WARN] Downlink Yanıtı RAM'de Eşleşmedi veya Zaten Zaman Aşımına Uğramış: ID=${correlationId}`);
          return;
        }

        let cleanStatus = ['SUCCESS', 'FAILED'].includes(String(status).toUpperCase())
          ? String(status).toUpperCase()
          : 'FAILED';
        let cleanResponse = response || {};

        // 2. [FATAL] KOMUT YANITI İÇİN ÖNCE SANDBOX ÇALIŞTIR
        const scripts = await getActiveEndpoints(tenantSlug, 'mqtt');
        if (scripts && scripts.length > 0) {
          try {
            const deviceIdMatch = topic.match(/^commands\/(.+)\/response$/);
            const extractedDeviceId = deviceIdMatch ? deviceIdMatch[1] : 'unknown';
            
            const rpcContext: any = { deviceId: extractedDeviceId, timestamp: Date.now(), topic, isRpcResponse: true };
            
            for (let i = 0; i < scripts.length; i++) {
              const sandboxObj = scripts[i];
              if (!sandboxObj || !sandboxObj.code || sandboxObj.code.trim() === '') continue;

              if (sandboxObj.regexPattern) {
                const matchRes = matchRoute('/' + topic, sandboxObj.regexPattern, sandboxObj.paramNames || []);
                if (!matchRes.isMatch) continue;
                rpcContext.params = matchRes.params;
              }

              const rpcPayload = { correlationId, status: cleanStatus, response: cleanResponse };
              const result = await runCustomCode(tenantSlug, sandboxObj.code, rpcPayload, String(sandboxObj.id), rpcContext);
              
              if (result === false) {
                console.log(`[SANDBOX] [Sandbox ${sandboxObj.id}] RPC Yanıtı reddedildi: ${correlationId}`);
                return; // İptal et, veritabanına işleme
              } else if (result && typeof result === 'object' && !result.error) {
                // Sandbox veriyi değiştirdiyse yeni hallerini al
                if (result.status) cleanStatus = result.status;
                if (result.response) cleanResponse = result.response;
              } else if (result && result.error) {
                console.error(`[ALERT] [Sandbox ${sandboxObj.id}] RPC Response Hata:`, result.error);
              }
            }
          } catch (e: any) {
            console.error(`[ALERT] [Sandbox] RPC Response Çalışma Hatası:`, e.message);
          }
        }

        // 3. RAM'i güncelle
        updateCommandStatus(tenantSlug, correlationId, cleanStatus as any, cleanResponse);
        console.log(`[INCOMING] Downlink Yanıtı İşlendi: ID=${correlationId}, Status=${cleanStatus}`);
      }
      return;
    }

    // DOWNLINK COMMAND INTERCEPTOR (Virtual Device Simulation)
    if (topic.startsWith('commands/') && !topic.endsWith('/response')) {
      try {
        const data = JSON.parse(message.toString());
        const deviceIdMatch = topic.match(/^commands\/(.+)$/);
        const extractedDeviceId = deviceIdMatch ? deviceIdMatch[1] : 'unknown';
        
        // Sandbox Context'inde bunun bir simülasyon olduğunu belirtiyoruz
        const rpcContext: any = { deviceId: extractedDeviceId, timestamp: Date.now(), topic, isCommandSimulation: true };
        
        const scripts = await getActiveEndpoints(tenantSlug, 'mqtt');
        if (scripts && scripts.length > 0) {
          for (let i = 0; i < scripts.length; i++) {
            const sandboxObj = scripts[i];
            if (!sandboxObj || !sandboxObj.code || sandboxObj.code.trim() === '') continue;

            if (sandboxObj.regexPattern) {
              const matchRes = matchRoute('/' + topic, sandboxObj.regexPattern, sandboxObj.paramNames || []);
              if (!matchRes.isMatch) continue;
              rpcContext.params = matchRes.params;
            }
            
            // Komutu sandbox'a ilet, sanal cihaz isterse publishMQTT ile '/response' dönebilir
            await runCustomCode(tenantSlug, sandboxObj.code, data, String(sandboxObj.id), rpcContext);
          }
        }
      } catch (e: any) {
        console.error(`[ALERT] [Sandbox] Virtual Device Simulation Error:`, e.message);
      }
      return; // Cihaza giden komut telemetri değildir, burada işlemi kesiyoruz.
    }

    if (topic !== 'telemetry' && !topic.startsWith('telemetry/')) {
      console.warn(`[WARN] [Mimari Kural] Geçersiz Telemetri Kanalı: ${topic}. Yalnızca 'telemetry' veya 'telemetry/{deviceId}' kabul edilir.`);
      return;
    }

    // Beklenen paket formatı: 
    // { "deviceId": "...", "tenantId": "...", "timestamp": 1718000000, "payload": {...}, "hmac": "..." }
    
    const rawMessage = message.toString();
    // Worker'lara (daemon'lara) mesajı olduğu gibi ilet
    const { broadcastMqttMessage } = await import('./workerManager');
    broadcastMqttMessage(tenantSlug, topic, rawMessage);
    
    const data = JSON.parse(rawMessage);

    const { deviceId, timestamp, payload, hmac } = data;

    if (!deviceId || !timestamp || !payload || !hmac) {
      console.warn(`[WARN] [Güvenlik Uyarısı] Eksik paket formatı reddedildi.`);
      return;
    }

    // LWT (Offline) mesajları cihaz bağlandığı an şifrelenip Broker'a emanet edildiği için
    // gönderildiği zaman ile ulaştığı zaman arasında saatler/günler olabilir.
    const isLwtOffline = payload && payload.status === 'offline';

    // REPLAY ATTACK KORUMASI: Auth/ACL katmanı güçlü olduğu için devre dışı bırakıldı.

    // 1. RAM CACHE KONTROLÜ: Cihazın gizli şifresini ve şemasını bul
    const cacheKey = `${tenantSlug}:${deviceId}`;
    let deviceMeta = deviceCache.get(cacheKey);

    // TTL Kontrolü (Süresi geçmiş cache'i sil)
    if (deviceMeta && Date.now() > deviceMeta.expiresAt) {
      deviceCache.delete(cacheKey);
      deviceMeta = undefined;
    }

    if (!deviceMeta) {
      let fetchPromise = pendingFetches.get(cacheKey);

      if (!fetchPromise) {
        fetchPromise = (async () => {
          const dbDevice = await sql<{ secret_key: string, schema: any }[]>`SELECT secret_key, schema FROM devices WHERE device_id = ${deviceId}`;
          const row = dbDevice[0];
          if (row) {
            const meta = { secretKey: row.secret_key, schema: row.schema, expiresAt: Date.now() + 1800000 };
            deviceCache.set(cacheKey, meta);
            return meta;
          }
          return null;
        })();

        pendingFetches.set(cacheKey, fetchPromise);

        fetchPromise.finally(() => {
          pendingFetches.delete(cacheKey);
        });
      }

      deviceMeta = await fetchPromise;

      if (!deviceMeta) {
        console.warn(`[ALERT] [GÜVENLİK İHLALİ] Veritabanında kayıtlı olmayan cihaz veri basmaya çalışıyor! ID: ${deviceId}`);
        return;
      }
    }

    // 2. HMAC DOĞRULAMA (İmza Kontrolü)
    const rawPayloadString = JSON.stringify(payload);
    const dataToSign = `${deviceId}|${timestamp}|${rawPayloadString}`;

    const computedHmac = crypto
      .createHmac('sha256', deviceMeta.secretKey)
      .update(dataToSign)
      .digest('hex');

    // Gelen imza ile bizim hesapladığımız imza uyuşuyor mu?
    if (hmac !== computedHmac) {
      console.error(`[FATAL] [GÜVENLİK ALARMI] Sahte İmza! Biri "${deviceId}" adına sahte veri basıyor!`);
      return;
    }

    // 3. MQTT SANDBOX KATMANI (İsteğe bağlı Payload Manipülasyonu / Filtreleme)
    let activePayload = payload;
    const scripts = await getActiveEndpoints(tenantSlug, 'mqtt');
    if (scripts && scripts.length > 0) {
      try {
        const contextObj: any = { deviceId, timestamp, topic, hmac };
        for (let i = 0; i < scripts.length; i++) {
          const sandboxObj = scripts[i];
          if (!sandboxObj || !sandboxObj.code || sandboxObj.code.trim() === '') continue;

          if (sandboxObj.regexPattern) {
            const matchRes = matchRoute('/' + topic, sandboxObj.regexPattern, sandboxObj.paramNames || []);
            if (!matchRes.isMatch) continue;
            contextObj.params = matchRes.params;
          }

          const result = await runCustomCode(tenantSlug, sandboxObj.code, activePayload, String(sandboxObj.id), contextObj);
          if (result === false) {
            // Mesaj sandbox tarafından reddedildi
            console.log(`[SANDBOX] [Sandbox ${sandboxObj.id}] Mesaj reddedildi: ${deviceId}`);
            return;
          } else if (result && typeof result === 'object' && !result.error) {
            // Değiştirilmiş payload alındı
            activePayload = result;
          } else if (result && result.error) {
            console.error(`[ALERT] [Sandbox ${sandboxObj.id}] Cihaz: ${deviceId} Hata:`, result.error);
          }
        }
      } catch (e: any) {
        console.error(`[ALERT] [Sandbox] Çalışma Hatası:`, e.message);
      }
    }

    // 4. ŞEMA VE ZAMAN DOĞRULAMASI (Validation Agent)
    const validationResult = await validateTelemetry(tenantSlug, activePayload, deviceMeta.schema, timestamp, isLwtOffline);

    if (!validationResult.isValid || validationResult.action === 'REJECT') {
      console.error(`[ALERT] [VERİ REDDEDİLDİ] Cihaz: ${deviceId}`);
      console.error('Hata Detayları:', JSON.stringify(validationResult.errors, null, 2));
      return;
    }

    // HER ŞEY DOĞRULANDI -> Güvenli veriyi JSON formatında buffer'a al
    const cleanPayload = validationResult.processedPayload;
    const tsDate = new Date(timestamp);
    
    // duckdb-appender kullanılarak tampona at
    // Not: appendTelemetry'nin de tenantSlug desteklemesi lazım.
    appendTelemetry(tenantSlug, {
      device_id: deviceId,
      payload: cleanPayload,
      timestamp: tsDate
    });
  } catch (e) {
    console.error('Mesaj işleme/parse hatası:', e);
  }
}

export function isMqttConnected() {
  return !!g.__aedesApp;
}

export function removeDeviceFromCache(tenantSlug: string, deviceId: string) {
  const cacheKey = `${tenantSlug}:${deviceId}`;
  deviceCache.delete(cacheKey);
  pendingFetches.delete(cacheKey);
}

export function publishMQTT(topic: string, message: any) {
  const broker = g.__aedesApp;
  
  let payloadStr = message;
  if (typeof message === 'object' && message !== null && !Buffer.isBuffer(message)) {
    try {
      payloadStr = JSON.stringify(message);
    } catch {
      payloadStr = String(message);
    }
  } else if (message !== null && message !== undefined) {
    payloadStr = String(message);
  } else {
    payloadStr = '';
  }
  if (broker) {
    broker.publish({
      topic: topic,
      payload: payloadStr,
      qos: 0,
      retain: false
    }, () => {});
    return true;
  }
  return false;
}
