import bcrypt from 'bcryptjs';
import { useDB } from '../db';
import * as seedPages from './pages';
import seedData from './i18n.json';

export async function runSeed(tenantSlug: string, refs?: any) {
  try {
    const mainSql = useDB(tenantSlug, refs);
    console.log(`[Seed] Initializing database seed for tenant: ${tenantSlug}`);

    // 1. AUTO SEED DEFAULT GLOBALS (Tüm tenantlar için)
    const defaultGlobals = [
      { key: 'ALLOW_HTTP', value: 'true', description: 'Geliştirme ortamında HTTP çerezlerine izin verir', target: 'shared', is_public: 1, type: 'boolean' },
      { key: 'TELEMETRY_VALIDATION_MODE', value: 'relaxed', description: 'Telemetri doğrulama modu (relaxed/strict)', target: 'api', is_public: 0, type: 'string' },
      { key: 'SMTP_HOST', value: 'smtp.gmail.com', description: 'SMTP Sunucu Adresi', target: 'api', is_public: 0, type: 'string' },
      { key: 'SMTP_PORT', value: '587', description: 'SMTP Bağlantı Noktası', target: 'api', is_public: 0, type: 'number' },
      { key: 'SMTP_USER', value: '', description: 'SMTP Kullanıcı Adı', target: 'api', is_public: 0, type: 'string' },
      { key: 'SMTP_PASS', value: '', description: 'SMTP Şifresi', target: 'api', is_public: 0, is_secret: 1, type: 'string' },
      { key: 'SMTP_SECURE', value: 'false', description: 'SSL/TLS Kullanımı', target: 'api', is_public: 0, type: 'boolean' },
      { key: 'SMTP_REQUIRE_TLS', value: 'true', description: 'TLS Zorunluluğu', target: 'api', is_public: 0, type: 'boolean' },
      { key: 'SMTP_IGNORE_TLS', value: 'false', description: 'TLS İptali', target: 'api', is_public: 0, type: 'boolean' },
      { key: 'EMAIL_FROM', value: 'noreply@example.com', description: 'E-Posta Gönderen Adresi', target: 'api', is_public: 0, type: 'string' },
      { key: 'MQTT_ADMIN_USER', value: 'admin', description: 'MQTT Broker varsayılan admin kullanıcısı', target: 'api', is_public: 0, type: 'string' },
      { key: 'MQTT_ADMIN_PASS', value: 'admin123', description: 'MQTT Broker varsayılan admin şifresi', target: 'api', is_public: 0, is_secret: 1, type: 'string' },
      { key: 'MQTT_COMMAND_TIMEOUT', value: '30', description: 'MQTT Komut Zaman Aşımı Süresi (Saniye)', target: 'api', is_public: 0, type: 'number' },
      { key: 'SANDBOX_TIMEOUT', value: '5', description: 'Sandbox Asenkron Çalışma Zaman Aşımı (Saniye)', target: 'api', is_public: 0, type: 'number' },
      { key: 'APP_NAME', value: 'BaseApp', description: 'Uygulama Adı (PWA Manifest)', target: 'shared', is_public: 1, type: 'string' },
      { key: 'LIGHT_PRIMARY', value: '#1976D2', description: 'Aydınlık Tema Ana Rengi', target: 'ui', is_public: 1, type: 'color' },
      { key: 'DARK_PRIMARY', value: '#1976D2', description: 'Karanlık Tema Ana Rengi', target: 'ui', is_public: 1, type: 'color' },
      { key: 'LIGHT_SECONDARY', value: '#424242', description: 'Aydınlık Tema İkincil Rengi', target: 'ui', is_public: 1, type: 'color' },
      { key: 'DARK_SECONDARY', value: '#BDBDBD', description: 'Karanlık Tema İkincil Rengi', target: 'ui', is_public: 1, type: 'color' },
      { key: 'LIGHT_BACKGROUND', value: '#FFFFFF', description: 'Aydınlık Tema Arkaplan Rengi', target: 'ui', is_public: 1, type: 'color' },
      { key: 'DARK_BACKGROUND', value: '#121212', description: 'Karanlık Tema Arkaplan Rengi', target: 'ui', is_public: 1, type: 'color' },
      { key: 'LIGHT_SURFACE', value: '#FFFFFF', description: 'Aydınlık Tema Kart Rengi', target: 'ui', is_public: 1, type: 'color' },
      { key: 'DARK_SURFACE', value: '#1E1E1E', description: 'Karanlık Tema Kart Rengi', target: 'ui', is_public: 1, type: 'color' },
      { key: 'APP_LOGO', value: '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="2730 7938 15540 13824"><defs><style>.fil0{fill:#03396C} .fil1{fill:#6497B1}</style></defs><g><polygon class="fil0" points="5013,10810 11456,8438 17147,10696 15008,11483 15602,11719 17741,10932 15602,11719 11456,10074 7152,11658 5013,10810 5771,10531 7880,11390 7152,11658 "/><polygon class="fil0" points="5042,17132 5042,18768 11327,21262 17770,18890 17770,17254 11327,19626 "/><polygon class="fil1" points="3230,13815 3230,15451 9516,17945 15958,15573 15958,13937 9516,16309 "/><polygon class="fil0" points="5013,10810 5013,12446 11299,14939 17741,12568 17741,10932 11299,13303 "/><polygon class="fil0" points="17214,17034 15075,17821 13229,17089 15368,16302 "/><polygon class="fil1" points="3859,13584 5998,14433 7534,13867 5395,13019 "/></g></svg>', description: 'Uygulama Logosu SVG Ham Kodu', target: 'shared', is_public: 1, type: 'string' },
      
      // Master-Only Global Parametreler
      { key: 'WS_HEARTBEAT_INTERVAL', value: '30000', description: 'WebSocket Ping/Pong döngü süresi (ms)', target: 'api', is_public: 0, type: 'number', is_master_only: true },
      { key: 'CRON_TICK_MS', value: '1000', description: 'Cron zaman tarama döngü hızı (ms)', target: 'api', is_public: 0, type: 'number', is_master_only: true },
      { key: 'WORKER_CRASH_WINDOW_MS', value: '60000', description: 'Worker çökme sıklığı algılama aralığı (ms)', target: 'api', is_public: 0, type: 'number', is_master_only: true },
      { key: 'MODBUS_IDLE_TIMEOUT_MS', value: '10000', description: 'Modbus TCP boşta kapanma süresi (ms)', target: 'api', is_public: 0, type: 'number', is_master_only: true },
      { key: 'MODBUS_RESPONSE_TIMEOUT_MS', value: '3000', description: 'Modbus cevap bekleme süresi (ms)', target: 'api', is_public: 0, type: 'number', is_master_only: true },
      { key: 'MODBUS_COOLDOWN_MS', value: '50', description: 'İki Modbus işlemi arası statik bekleme (ms)', target: 'api', is_public: 0, type: 'number', is_master_only: true },


      // Tenant-Specific Parametreler
      { key: 'API_RATE_LIMIT', value: '1000', description: 'Kullanıcı başına dakikalık API istek limiti', target: 'api', is_public: 0, type: 'number' },
      { key: 'LOGIN_RATE_LIMIT', value: '10', description: 'Dakikalık Login/Auth istek limiti (Brute-force)', target: 'api', is_public: 0, type: 'number' },
      { key: 'CRON_WORKER_TIMEOUT_MS', value: '60000', description: 'Cron Fork yaşama süresi (ms)', target: 'api', is_public: 0, type: 'number' },
      { key: 'SANDBOX_SCHEDULER_TIMEOUT', value: '900', description: 'Sandbox Scheduler çalışma limiti (sn)', target: 'api', is_public: 0, type: 'number' },
      { key: 'WORKER_MEMORY_LIMIT_MB', value: '256', description: 'Fork edilen Worker RAM sınırı (MB)', target: 'api', is_public: 0, type: 'number' },
      { key: 'TELEMETRY_BATCH_SIZE', value: '500', description: 'Telemetri DuckDB paket yazma limiti', target: 'api', is_public: 0, type: 'number' },
      { key: 'TELEMETRY_MAX_BUFFER_SIZE', value: '10000', description: 'Telemetri biriktirme OOM sınırı', target: 'api', is_public: 0, type: 'number' },
      { key: 'DB_MAX_ACTIVE_OPERATIONS', value: '1000', description: 'SQLite eşzamanlı sorgu kilit limiti', target: 'api', is_public: 0, type: 'number' },
      { key: 'DUCKDB_MEMORY_LIMIT', value: '256', description: 'DuckDB motoruna verilen RAM (MB)', target: 'api', is_public: 0, type: 'number' }
    ];

    for (const globalVar of defaultGlobals) {
      if ((globalVar as any).is_master_only && tenantSlug !== 'master') continue;
      
      await mainSql.unsafe(`
        INSERT INTO globals (type, key, value, description, target, is_public, is_secret, protected, data_type)
        SELECT 'variable', ?, ?, ?, ?, ?, ?, 1, ?
        WHERE NOT EXISTS (SELECT 1 FROM globals WHERE key = ?);
      `, [globalVar.key, globalVar.value, globalVar.description, globalVar.target, globalVar.is_public, globalVar.is_secret || 0, globalVar.type || 'string', globalVar.key]);
    }

    // 2. AUTO SEED INITIAL ADMIN
    const usersCount = await mainSql.unsafe('SELECT COUNT(*) as c FROM users');
    if (usersCount[0] && usersCount[0].c === 0 && tenantSlug === 'master') {
      const menuList = '[]';
      const hash = bcrypt.hashSync('admin123', 10);
      await mainSql.unsafe(`
        INSERT INTO users (username, password_hash, is_admin, home_page, menu_list)
        SELECT 'admin', ?, 1, '/', ?
        WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');
      `, [hash, menuList]);
      console.log('[Seed] Admin user created (admin / admin123).');
    }

    // 3. AUTO SEED SYSTEM PAGES
    const layoutCount = await mainSql.unsafe("SELECT COUNT(*) as c FROM pages WHERE page_type = 'layout' AND is_default_layout = 1");
    if (layoutCount[0] && layoutCount[0].c === 0) {
      await mainSql.unsafe(`
        INSERT INTO pages (route_pattern, priority, title, page_type, template_string, script_content, style_content, is_public, is_default_layout, protected)
        VALUES ('/system/layout', 100, '{"en":"System Default Layout","tr":"Sistem Varsayılan Şablon"}', 'layout', ?, ?, ?, 1, 1, 1)
      `, [seedPages.DEFAULT_LAYOUT_TEMPLATE, seedPages.DEFAULT_LAYOUT_SCRIPT, seedPages.DEFAULT_LAYOUT_STYLE]);
      console.log(`[Seed] System Default Layout created.`);
    }

    const landingCount = await mainSql.unsafe("SELECT COUNT(*) as c FROM pages WHERE route_pattern = '/' AND is_public = 1 AND protected = 1");
    if (landingCount[0] && landingCount[0].c === 0) {
      await mainSql.unsafe(`
        INSERT INTO pages (route_pattern, priority, title, page_type, template_string, script_content, style_content, is_public, protected)
        VALUES ('/', 100, '{"en":"System Landing Page","tr":"Sistem Açılış Sayfası"}', 'regular', ?, ?, ?, 1, 1)
      `, [seedPages.DEFAULT_LANDING_TEMPLATE, seedPages.DEFAULT_LANDING_SCRIPT, seedPages.DEFAULT_LANDING_STYLE]);
      console.log(`[Seed] System Landing Page created.`);
    }

    const aboutCount = await mainSql.unsafe("SELECT COUNT(*) as c FROM pages WHERE route_pattern = '/about' AND is_public = 1 AND protected = 1");
    if (aboutCount[0] && aboutCount[0].c === 0) {
      await mainSql.unsafe(`
        INSERT INTO pages (route_pattern, priority, title, page_type, template_string, script_content, style_content, is_public, protected)
        VALUES ('/about', 100, '{"en":"System About Page","tr":"Sistem Hakkımızda Sayfası"}', 'regular', ?, ?, '', 1, 1)
      `, [seedPages.DEFAULT_ABOUT_TEMPLATE, seedPages.DEFAULT_ABOUT_SCRIPT]);
      console.log(`[Seed] System About Page created.`);
    }

    const loginCount = await mainSql.unsafe("SELECT COUNT(*) as c FROM pages WHERE route_pattern = '/login' AND protected = 1");
    if (loginCount[0] && loginCount[0].c === 0) {
      await mainSql.unsafe(`
        INSERT INTO pages (route_pattern, priority, title, page_type, template_string, script_content, style_content, is_public, protected)
        VALUES ('/login', 100, '{"en":"System Login Page","tr":"Sistem Giriş Sayfası"}', 'regular', ?, ?, ?, 1, 1)
      `, [seedPages.DEFAULT_LOGIN_TEMPLATE, seedPages.DEFAULT_LOGIN_SCRIPT, seedPages.DEFAULT_LOGIN_STYLE]);
      console.log(`[Seed] System Login Page created.`);
    }

    const profileCount = await mainSql.unsafe("SELECT COUNT(*) as c FROM pages WHERE route_pattern = '/profile' AND page_type = 'regular'");
    if (profileCount[0] && profileCount[0].c === 0) {
      await mainSql.unsafe(`
        INSERT INTO pages (route_pattern, priority, title, page_type, template_string, script_content, style_content, is_public, protected)
        VALUES ('/profile', 100, '{"en":"System Profile Page","tr":"Sistem Profil Sayfası"}', 'regular', ?, ?, ?, 0, 1)
      `, [seedPages.DEFAULT_PROFILE_TEMPLATE, seedPages.DEFAULT_PROFILE_SCRIPT, seedPages.DEFAULT_PROFILE_STYLE]);
      console.log(`[Seed] System Profile Page created.`);
    }

    // 4. AUTO SEED TRANSLATIONS (i18n)
    if (seedData) {
      // Make sure languages table has en and tr
      await mainSql.unsafe(`
        INSERT INTO languages (code, name, dir, is_active)
        VALUES 
          ('tr', 'Türkçe', 'ltr', 1),
          ('en', 'English', 'ltr', 1)
        ON CONFLICT(code) DO NOTHING
      `);

      // Group translations by locale
      const localeTranslations: Record<string, Record<string, string>> = {};
      for (const [key, values] of Object.entries(seedData)) {
        const vals = values as Record<string, string>;
        for (const [locale, value] of Object.entries(vals)) {
          if (!localeTranslations[locale]) localeTranslations[locale] = {};
          localeTranslations[locale][key] = value;
        }
      }

      let upsertedCount = 0;
      for (const [locale, trans] of Object.entries(localeTranslations)) {
        const rows = await mainSql.unsafe('SELECT translations FROM languages WHERE code = ?', [locale]);
        if (rows.length > 0) {
          let currentTrans: any = {};
          if (rows[0].translations) {
            try { currentTrans = typeof rows[0].translations === 'string' ? JSON.parse(rows[0].translations) : rows[0].translations; } catch {}
          }
          const newTrans = { ...currentTrans, ...trans };
          await mainSql.unsafe('UPDATE languages SET translations = ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?', [JSON.stringify(newTrans), locale]);
          upsertedCount += Object.keys(trans).length;
        }
      }

      // Populate translation_keys table for all keys in seedData
      for (const key of Object.keys(seedData)) {
        await mainSql.unsafe(`
          INSERT INTO translation_keys (key, hashtags) 
          VALUES (?, '[]') 
          ON CONFLICT(key) DO NOTHING
        `, [key]);
      }

      console.log(`[Seed] Injected ${upsertedCount} translation entries.`);
    }

    console.log(`[Seed] Database seed completed for tenant: ${tenantSlug}`);
  } catch (err) {
    console.error(`[Seed] Error during seeding for tenant ${tenantSlug}:`, err);
  }
}
