import aedesFactory from 'aedes';
import net from 'node:net';
import { useDB, getMasterDb } from '../utils/db';
import { handleMqttMessage } from '../utils/mqtt';
import { checkRateLimit } from '../utils/rateLimit';

if (!process.listeners('unhandledRejection').some(l => l.name === 'econnresetHandler')) {
  process.on('unhandledRejection', function econnresetHandler(reason: any) {
    if (reason && reason.code === 'ECONNRESET') {
      // Ignore network disconnects
      return;
    }
    console.error('[unhandledRejection]', reason);
  });
}

export default defineNitroPlugin((_nitroApp) => {
  // Build sırasında (prerender) başlatma
  if (import.meta.prerender || process.env.npm_lifecycle_event === 'build') return;

  // Sadece dev ortaminda veya eger henuz calismiyorsa calistir
  if (!(globalThis as any).__aedesBroker) {
    const aedes = new (aedesFactory as any)({
      concurrency: 100, // Architectural Shield: Eşzamanlı paket işleme
      queueLimit: 1000,  // Architectural Shield: RAM'de bekletilecek maks paket (QoS 0 için)
      maxClientsIdLength: 100
    });
    
    aedes.authenticate = async (client: any, username: string | undefined, password: Buffer | undefined, callback: any) => {
      try {
        const clientIp = client.conn?.remoteAddress || 'unknown';
        const rateLimitKey = `mqtt_auth_${clientIp}`;

        // 10 attempts per minute (Bypass for localhost simulator)
        const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.includes('127.0.0.1');
        if (!isLocalhost) {
          if (!checkRateLimit(rateLimitKey, 10, 60 * 1000)) {
            console.warn(`[MQTT Debug] Rate Limit Exceeded for IP: ${clientIp}`);
            const error: any = new Error('Too many connection attempts');
            error.returnCode = 4;
            return callback(error, false);
          }
        }

        if (!username) {
          const error: any = new Error('Not Authorized');
          error.returnCode = 4;
          return callback(error, false);
        }

        let tenantSlug: string | null = null;
        let role = 'device';
        const devId = username;
        const passStr = password ? password.toString() : '';
        
        try {
          const masterSql = getMasterDb();
          const tenantsRes = await masterSql.unsafe(`SELECT slug FROM tenants WHERE status = 'active'`);
          const tenantsToSearch = [{ slug: 'master' }, ...tenantsRes];
          
          for (const t of tenantsToSearch) {
            const sql = useDB(t.slug);
            
            // 1. Check device auth
            try {
              const device = await sql`SELECT secret_key FROM devices WHERE device_id = ${devId}`;
              if (device && device.length > 0 && device[0].secret_key === passStr) {
                tenantSlug = t.slug;
                role = 'device';
                break;
              }
            } catch (e) {
              // Ignore table missing errors if any
            }

            // 2. Check tenant admin auth
            try {
              const adminUser = await sql`SELECT value FROM system_variables WHERE key = 'MQTT_ADMIN_USER'`;
              const adminPass = await sql`SELECT value FROM system_variables WHERE key = 'MQTT_ADMIN_PASS'`;
              const aUser = adminUser.length > 0 ? adminUser[0].value : null;
              const aPass = adminPass.length > 0 ? adminPass[0].value : null;

              if (aUser && aPass && devId === aUser && passStr === aPass) {
                tenantSlug = t.slug;
                role = 'admin';
                break;
              }
            } catch (e) {
              // Ignore missing sys vars errors
            }
          }
        } catch (e) {
          console.error('Tenant iteration error during MQTT auth:', e);
        }

        if (!tenantSlug) {
          console.warn(`[MQTT Debug] Auth Failed - Tenant or Device not found for DeviceID: "${devId}"`);
          const error: any = new Error('Not Authorized');
          error.returnCode = 4;
          return callback(error, false);
        }

        (client as any).__tenantSlug = tenantSlug;
        (client as any).__deviceId = devId;
        (client as any).__role = role;
        (client as any).username = devId; // override aedes username for internals
        
        return callback(null, true);
      } catch (err) {
        console.error('MQTT Auth error:', err);
        const error: any = new Error('Internal Server Error');
        error.returnCode = 3;
        return callback(error, false);
      }
    };

    aedes.authorizePublish = async (client: any, packet: any, callback: any) => {
      if (!client) return callback(null);
      
      const username = client.__deviceId || client.username || '';
      const tenantSlug = client.__tenantSlug;
      const role = client.__role || 'device';
      const topic = packet.topic;

      if (topic === 'telemetry' || topic.startsWith('telemetry/')) {
        try {
          const payloadStr = packet.payload.toString();
          const data = JSON.parse(payloadStr);
          const deviceId = data.deviceId;
          
          if (!deviceId) throw new Error('Missing deviceId in payload');

          // Cache the device lookup to avoid DB query on every packet
          const cacheKey = `${tenantSlug}_${deviceId}`;
          let isDeviceValid = (globalThis as any).__aedesDeviceCache?.get(cacheKey);
          
          if (isDeviceValid === undefined) {
             const sql = useDB(tenantSlug);
             const device = await sql`SELECT 1 FROM devices WHERE device_id = ${deviceId}`;
             isDeviceValid = !!(device && device.length > 0);
             if (!(globalThis as any).__aedesDeviceCache) {
               const { LRUCache } = await import('lru-cache');
               (globalThis as any).__aedesDeviceCache = new LRUCache({ max: 10000, ttl: 1000 * 60 * 60 });
             }
             (globalThis as any).__aedesDeviceCache.set(cacheKey, isDeviceValid);
          }

          if (!isDeviceValid) {
            console.warn(`[ALERT] [BROKER KESİN RED] Kayıtlı olmayan cihaz (ID: ${deviceId}) veri basamaz! İstemci bağlantısı veya şifresi ne olursa olsun engellendi.`);
            const err = new Error('Device not registered in system') as any;
            err.returnCode = 135;
            return callback(err);
          }
        } catch (e: any) {
          console.warn(`[MQTT Debug] Publish reddedildi (JSON Parse Hatası)! Topic: ${topic}, İstemci: ${username}, Hata: ${e.message}, Payload: ${packet.payload.toString()}`);
          const err = new Error('Invalid payload format') as any;
          err.returnCode = 135;
          return callback(err);
        }
      }
      
      if (role === 'admin') {
        packet.topic = `${client.__tenantSlug}/${packet.topic}`;
        return callback(null);
      }

      if (
        topic === 'telemetry' || 
        topic === `telemetry/${username}` || 
        (topic.startsWith('commands/') && topic.endsWith('/response'))
      ) {
        packet.topic = `${client.__tenantSlug}/${packet.topic}`;
        return callback(null);
      }
      
      console.warn(`[ACL RED] Publish engellendi! İstemci: ${username}, Topic: ${topic}`);
      const err = new Error('Publish not allowed') as any;
      err.returnCode = 135; 
      return callback(err);
    };

    aedes.authorizeSubscribe = async (client: any, sub: any, callback: any) => {
      if (!client) return callback(null, sub);
      
      const username = client.__deviceId || client.username || '';
      const role = client.__role || 'device';
      const topic = sub.topic;

      if (topic.startsWith('$SYS/')) {
        const err = new Error('SYS topics restricted') as any;
        err.returnCode = 135;
        return callback(err, null);
      }
      
      if (role === 'admin') {
        sub.topic = `${client.__tenantSlug}/${sub.topic}`;
        return callback(null, sub);
      }

      const regex = new RegExp(`^commands/${username}(/.*)?$`);
      if (regex.test(topic)) {
        sub.topic = `${client.__tenantSlug}/${sub.topic}`;
        return callback(null, sub);
      }
      
      console.warn(`[ACL RED] Subscribe engellendi! İstemci: ${username}, Topic: ${topic}`);
      const err = new Error('Subscribe not allowed') as any;
      err.returnCode = 135;
      return callback(err, null);
    };

    aedes.authorizeForward = (client: any, packet: any) => {
      if (!client) return packet;
      if (client.__role !== 'admin' && client.__tenantSlug) {
        const prefix = client.__tenantSlug + '/';
        if (packet.topic.startsWith(prefix)) {
          return {
            ...packet,
            topic: packet.topic.substring(prefix.length)
          };
        }
      }
      return packet;
    };

    aedes.on('publish', async function (packet: any, client: any) {
      if (packet.topic.startsWith('$SYS/')) return;
      
      const topic = packet.topic;
      const firstSlash = topic.indexOf('/');
      if (firstSlash === -1) return;

      const tenantSlug = topic.substring(0, firstSlash);
      const realTopic = topic.substring(firstSlash + 1);

      // Sadece cihaza (veya admine) ait data ise (commands veya telemetry)
      if (realTopic.startsWith('telemetry/') || realTopic === 'telemetry' || realTopic.startsWith('commands/')) {
        await handleMqttMessage(tenantSlug, realTopic, packet.payload);
      }
    });

    const mqttServer = net.createServer(aedes.handle);
    const port = Number(process.env.MQTT_PORT || 1883);
    
    mqttServer.listen(port, function () {
      console.log(`[Aedes] Dahili Aedes MQTT Broker TCP port ${port} üzerinde çalışıyor (Nitro Plugin)`);
    });
    
    (globalThis as any).__aedesBroker = mqttServer;
    (globalThis as any).__aedesApp = aedes;
  }

});
