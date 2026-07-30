<template>
  <v-layout class="docs-layout">
    <v-navigation-drawer v-model="drawer" width="300" elevation="1">
      <div class="pa-4">
        <h2 class="text-h6 font-weight-black text-primary">
          Platform Kılavuzu
        </h2>
        <div class="text-caption text-grey-darken-1">
          IIoT Referans ve Eğitim
        </div>
      </div>
      <v-divider></v-divider>
      <v-list nav density="compact" class="docs-menu">
        <v-list-item
          to="/documentation"
          title="1. Platforma Giriş"
          prepend-icon="mdi-human-greeting"
          :color="color"
          rounded="lg"
        ></v-list-item>
        <v-list-item
          to="/documentation/basics"
          title="2. Web & Programlama"
          prepend-icon="mdi-school"
          :color="color"
          rounded="lg"
        ></v-list-item>
        <v-list-item
          to="/documentation/frontend"
          title="3. Arayüz (Vue & Vuetify)"
          prepend-icon="mdi-monitor-dashboard"
          :color="color"
          rounded="lg"
        ></v-list-item>
        <v-list-item
          to="/documentation/database"
          title="4. Veritabanı Mimarisi"
          prepend-icon="mdi-database"
          :color="color"
          rounded="lg"
        ></v-list-item>
        <v-list-item
          to="/documentation/sandbox"
          title="5. Backend (Sandbox)"
          prepend-icon="mdi-server-security"
          :color="color"
          rounded="lg"
        ></v-list-item>
        <v-list-item
          to="/documentation/utils"
          title="6. Yardımcı Araçlar"
          prepend-icon="mdi-toolbox"
          :color="color"
          rounded="lg"
        ></v-list-item>
        <v-list-item
          to="/documentation/realtime"
          title="7. IoT ve Haberleşme"
          prepend-icon="mdi-access-point-network"
          :color="color"
          rounded="lg"
        ></v-list-item>
        <v-list-item
          to="/documentation/background"
          title="8. Arka Plan Süreçleri"
          prepend-icon="mdi-clock-fast"
          exact
          :color="color"
          rounded="lg"
        ></v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-main class="bg-grey-lighten-4" style="min-height: 100vh">
      <v-container class="pa-md-8" fluid style="max-width: 1200px">
        <h1 class="text-h3 font-weight-bold text-primary mb-4">
          Arka Plan Süreçleri (Microservices & Cron)
        </h1>
        
        <v-alert type="info" variant="tonal" class="mb-6">
          <strong>Sürekli Çalışan Süreçler:</strong> Sadece bir butona tıklandığında değil, kendi kendine sürekli arka planda çalışan kodlara ihtiyaç duyarız. Örneğin bir sensörü 7/24 dinlemek veya her gece rapor üretmek gibi işlemleri Platform'un arka plan motoru (Background Engine) üstlenir.
        </v-alert>

        <p class="text-body-1 mb-6 text-grey-darken-3" style="line-height: 1.8">
          <strong>Platformdaki Karşılığı:</strong> Platformumuzda 7/24 kesintisiz çalışması gereken işlemler için <strong>Microservice (Sonsuz Döngü)</strong>, sadece belirli bir tarih ve saatte çalışması gereken işlemler için ise <strong>Cron (Zamanlanmış Görevler)</strong> modülleri bulunur. Bu modüller arka planda ana sunucuyu kitlemeden (Thread-safe) çalışırlar.
        </p>

        <h2 class="text-h4 font-weight-bold mt-8 mb-4 text-secondary">
          1. Microservice (Sürekli Döngü) Mantığı
        </h2>
        <p class="text-body-1 mb-4">
          Bir Microservice yazdığınızda aslında arka planda görünmez bir <code>while(true)</code> döngüsü başlatırsınız. Bu döngü hiç durmadan çalışır. En çok cihazlardan anlık veri okurken (Örn: Modbus/MQTT) kullanılır. Burada dikkat etmeniz gereken tek kural, kodu bitirdiğinizde <strong>sisteme nefes alması için (<code>await sleep</code>) milisaniyelik bir bekleme</strong> koymaktır. Aksi takdirde CPU %100 olur ve sunucu bu görevi tehlikeli sayarak kilitler.
        </p>

        <v-card class="mb-8 rounded-lg border" elevation="1">
          <v-toolbar color="white" density="compact" class="border-b">
            <v-icon color="primary" class="ml-4 mr-2">mdi-clock-fast</v-icon>
            <v-toolbar-title
              class="text-subtitle-2 font-weight-bold text-grey-darken-3"
            >
              Event Loop Bloke Olmaması İçin Bekleme Süresi
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-chip
              size="x-small"
              color="primary"
              variant="flat"
              class="mr-4 text-uppercase font-weight-bold"
              >JS</v-chip
            >
          </v-toolbar>
          <MonacoEditor
            :modelValue="bgCode"
            language="javascript"
            readOnly
            :minimap="false"
            hideFullscreen
            autoHeight
          />
        </v-card>

        <h2 class="text-h4 font-weight-bold mt-8 mb-4 text-secondary">
          2. Zamanlanmış Görevler (Cron / Scheduler)
        </h2>
        <v-alert
          type="warning"
          variant="tonal"
          border="start"
          class="rounded-lg mb-6"
        >
          <div class="font-weight-bold text-h6 mb-2">
            Zaman Formatı ve OOM (Hafıza) Koruması
          </div>
          Scheduler görevleri standart "Cron Expression" formatıyla (Örn: <code>0 3 * * *</code> her gece 03:00) çalışır. Platform, arka planda çalışan yazdığınız görevler çok fazla veri çekerse (Out of Memory - RAM dolması) ana sunucuyu korumak için sadece o görevi otomatik iptal eder.
        </v-alert>

        <ul class="text-body-1 mb-6" style="line-height: 2">
          <li>
            <strong>Çökme Koruması (Auto-Restart):</strong> Microservice'iniz bir kod hatası yüzünden çökerse platform onu otomatik olarak yeniden başlatır. Ancak sürekli çöken (hatalı) bir kod yazdıysanız platform 5 denemeden sonra onu güvenliğe alarak tamamen durdurur ("Stopped" statüsü).
          </li>
          <li>
            <strong>Cron Görevlerinde Veri:</strong> Cron görevleri saniyeler veya aylar aralıklarla çalışabilir. Görev tetiklendiğinde Sandbox içine enjekte edilen <code>db.unsafe</code>, <code>fetch</code> veya <code>sendEmail</code> ile gece vardiyası raporlarını müşterilerinize otomatik e-posta atabilirsiniz. Görevlerin zaman aşımı (Timeout) limiti 15 dakikadır.
          </li>
        </ul>

        <v-card class="mb-8 rounded-lg border" elevation="1">
          <v-toolbar color="white" density="compact" class="border-b">
            <v-icon color="primary" class="ml-4 mr-2">mdi-calendar-clock</v-icon>
            <v-toolbar-title class="text-subtitle-2 font-weight-bold text-grey-darken-3">Cron Görevi (Zamanlanmış Rapor) Örneği</v-toolbar-title>
            <v-spacer></v-spacer>
            <v-chip size="x-small" color="primary" variant="flat" class="mr-4 text-uppercase font-weight-bold">JS</v-chip>
          </v-toolbar>
          <MonacoEditor :modelValue="cronCode" language="javascript" readOnly :minimap="false" hideFullscreen autoHeight />
        </v-card>
        
        <h2 class="text-h4 font-weight-bold mt-8 mb-4 text-secondary">
          3. Multi-Tenant Bağlantı Havuzu ve Çöp Toplayıcı (Garbage Collection)
        </h2>
        <p class="text-body-1 mb-4">
          Arka planda aynı anda yüzlerce müşteriye (Tenant) ait microservice çalışabilir. Her kiracının izole veritabanı bağlantısı ana sunucuda bir <strong>Bağlantı Havuzu (Tenant Pool)</strong> içerisinde tutulur (LRU Mantığı).
        </p>
        <v-alert type="success" variant="tonal" class="mb-6">
          <strong>Memory Leak (Bellek Sızıntısı) Önleme:</strong> Sisteme aynı anda yüzlerce müşteri/firma (Tenant) bağlandığında, sunucunuzun RAM'i dolup kilitlenebilir. Bunu önlemek için sisteme bir kota (Örn: <code>POOL_LIMIT=200</code>) konulmuştur. 201. firma giriş yaptığında, sistem en uzun süredir işlem yapmayan firmayı anında RAM'den atar (<code>tenant:evict</code> olayı fırlatılır). Bu sayede sunucunuz asla Out of Memory (OOM) hatası verip çökmez.
        </v-alert>
        
        <v-card color="grey-lighten-4" class="pa-4 mb-6" elevation="0" rounded="lg">
          <p class="text-subtitle-2 font-weight-bold mb-2">[İLERİ OKUMA] İleri Okuma (Meraklılar İçin):</p>
          <ul class="text-body-2 pl-4">
            <li>Cron zaman formatını kolayca oluşturmak için <a href="https://crontab.guru/" target="_blank" class="text-primary font-weight-bold">Crontab Guru Aracı</a>.</li>
            <li>JavaScript Asenkron yapıları ve Event Loop mantığı için <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Event_loop" target="_blank" class="text-primary font-weight-bold">MDN Event Loop</a>.</li>
          </ul>
        </v-card>
      </v-container>
    </v-main>
  </v-layout>
</template>

<script setup lang="ts">
import { ref } from "vue";
const drawer = ref(true);
const { primaryColor: color } = useSysVars();

const bgCode = `// Arka Plan Görevleri (Microservices)
// Bu kod ana Node.js sunucusundan bağımsız bir İşçi (Worker) içinde çalışır.
// Amacı 7/24 cihazları dinlemek ve belirli koşullarda alarm üretmektir.

async function surekliGozlemYap() 
{
    while(true) 
    {
        try {
            // Örnek: Ağır sensör okuma işlemleri veya Modbus çağrıları
            const veriler = await readModbusData('10.0.0.5', 502, 1, 100, 1, 'holding', 'uint16');
            
            if (veriler[0] > 1000) {
                // Alarm durumu oluştuğunda cihazlara veya arayüze MQTT ile mesaj basıyoruz
                publishMQTT('alarms/sicaklik', { acilDurum: true, deger: veriler[0] });
            }
        } 
        catch (err) {
            console.error("Gözlem hatası:", err.message);
        }
        
        // KRİTİK: Event Loop'a nefes aldırmak ZORUNLUDUR!
        // Eğer asenkron bir bekleme (sleep) konulmazsa, bu sonsuz döngü %100 CPU tüketir 
        // ve işletim sistemi (OOM / CPU Throttling) tarafından anında kill edilir.
        await sleep(1000); // 1 saniye bekle ve döngüye devam et
    }
}

// Ana döngüyü başlat
surekliGozlemYap();`;

const cronCode = `// Arka Plan Görevleri (Cron) Alanı
// Bu kod belirlediğiniz cron ifadesine göre (Örn: her gün sabah 08:00'da) bir kez çalışır.

try {
    // 1. Dünün üretim verilerini veritabanından çek
    const uretimVerisi = await db.unsafe(\`
        SELECT COUNT(id) as toplam 
        FROM uretim_kayitlari 
        WHERE tarih >= date('now', '-1 day')
    \`);
    
    // 2. Çekilen veriyi yöneticilere rapor olarak at
    await sendEmail(
        "yonetim@fabrika.com", 
        "Günlük Üretim Raporu", 
        \`Dün toplam \${uretimVerisi[0].toplam} adet ürün üretilmiştir.\`
    );
    
    // Cron görevi başarıyla tamamlandığında mutlaka return ile dönülmelidir.
    return { basarili: true, mesaj: "Rapor maili gönderildi" };
} 
catch (e) {
    console.error("Cron Görevi Hatası:", e.message);
    return { basarili: false, hata: e.message };
}`;
</script>

<style scoped>
.docs-menu .v-list-item--active {
  font-weight: 600;
  background-color: rgb(var(--v-theme-primary), 0.1);
}
.border-b {
  border-bottom: 1px solid #e0e0e0 !important;
}
</style>
