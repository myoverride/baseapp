<template>
  <v-layout class="docs-layout">
    <v-navigation-drawer v-model="drawer" width="300" elevation="1">
      <div class="pa-4">
        <h2 class="text-h6 font-weight-black text-primary">Platform Kılavuzu</h2>
        <div class="text-caption text-grey-darken-1">IIoT Referans ve Eğitim</div>
      </div>
      <v-divider></v-divider>
      <v-list nav density="compact" class="docs-menu">
        <v-list-item to="/documentation" title="1. Platforma Giriş" prepend-icon="mdi-human-greeting" :color="color" rounded="lg"></v-list-item>
        <v-list-item to="/documentation/basics" title="2. Web & Programlama" prepend-icon="mdi-school" :color="color" rounded="lg"></v-list-item>
        <v-list-item to="/documentation/frontend" title="3. Arayüz (Vue & Vuetify)" prepend-icon="mdi-monitor-dashboard" :color="color" rounded="lg"></v-list-item>
        <v-list-item to="/documentation/database" title="4. Veritabanı Mimarisi" prepend-icon="mdi-database" :color="color" rounded="lg"></v-list-item>
        <v-list-item to="/documentation/sandbox" title="5. Backend (Sandbox)" prepend-icon="mdi-server-security" :color="color" rounded="lg"></v-list-item>
        <v-list-item to="/documentation/utils" title="6. Yardımcı Araçlar" prepend-icon="mdi-toolbox" :color="color" rounded="lg"></v-list-item>
        <v-list-item to="/documentation/realtime" title="7. IoT ve Haberleşme" prepend-icon="mdi-access-point-network" exact :color="color" rounded="lg"></v-list-item>
        <v-list-item to="/documentation/background" title="8. Arka Plan Süreçleri" prepend-icon="mdi-clock-fast" :color="color" rounded="lg"></v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-main class="bg-grey-lighten-4" style="min-height: 100vh;">
      <v-container class="pa-md-8" fluid style="max-width: 1200px;">
        <h1 class="text-h3 font-weight-bold text-primary mb-4">IoT ve Gerçek Zamanlı Mimariler</h1>
        
        <v-alert type="info" variant="tonal" class="mb-6">
          <strong>Yerleşik Protokol Desteği:</strong> Platformumuz endüstri standartları olan <strong>Modbus TCP/RTU</strong> ve <strong>MQTT</strong> protokollerini dışarıdan kütüphane yüklemenize gerek kalmadan, doğrudan Sandbox içine global olarak enjekte eder.
        </v-alert>

        <p class="text-body-1 mb-6 text-grey-darken-3" style="line-height: 1.8;">
          Sandbox içinde (Arka Plan API veya Mikroservis) yazacağınız basit kodlarla makinelere bağlanabilir, verileri toplayabilir veya arayüzdeki kullanıcılara anlık uyarı (Push Notification / WebSocket) gönderebilirsiniz. Modbus işlemleri asenkron olarak arka plan havuzlarında sıraya sokulur.
        </p>

        <h2 class="text-h4 font-weight-bold mt-8 mb-4 text-secondary">1. Modbus ile Cihaz Haberleşmesi</h2>
        <p class="text-body-1 mb-4">
          Sahadaki cihazlardan veri okumak için Sandbox içine otomatik enjekte edilen <code>readModbusData</code> fonksiyonunu kullanırsınız. Modbus protokolü yavaş olduğu için, aynı cihaza aynı anda birden fazla istek atarsanız cihaz kilitlenebilir. Merak etmeyin; platform bu istekleri arka planda güvenli bir "Kuyruğa" alarak sırayla işletir.
        </p>

        <v-card class="mb-8 rounded-lg border" elevation="1">
          <v-toolbar color="white" density="compact" class="border-b">
            <v-icon color="primary" class="ml-4 mr-2">mdi-access-point-network</v-icon>
            <v-toolbar-title class="text-subtitle-2 font-weight-bold text-grey-darken-3">
              Modbus Async Kuyruk Okuması
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-chip size="x-small" color="primary" variant="flat" class="mr-4 text-uppercase font-weight-bold">JS</v-chip>
          </v-toolbar>
          <MonacoEditor :modelValue="modbusCode" language="javascript" readOnly :minimap="false" hideFullscreen autoHeight />
        </v-card>

        <h2 class="text-h4 font-weight-bold mt-8 mb-4 text-secondary">2. Aedes Dahili MQTT Broker</h2>
        <p class="text-body-1 mb-4">
          Cihazlarınız MQTT destekliyorsa harici bir sunucu kurmanıza gerek yoktur. Platformun içinde çok yüksek performanslı <strong>Aedes MQTT Broker</strong> bulunur.
        </p>

        <v-row class="mb-8">
          <v-col cols="12">
            <v-card class="h-100 bg-white border" elevation="0" rounded="lg">
              <v-card-title class="font-weight-bold text-blue-darken-2 bg-blue-lighten-5">Görünmez Topic İzolasyonu (Tenant Güvenliği)</v-card-title>
              <v-card-text>
                <p class="text-body-2 mb-3 mt-3">Sandbox içinde <code>publishMQTT('sensor/1', { val: 25 })</code> yazdığınızda platform bunu güvenliğe alarak arka planda görünmez bir şekilde izole eder. Hem kodunuzda hem de sahada cihazlarınızı doğrudan <code>sensor/1</code> şeklinde yapılandırırsınız (prefix eklemenize gerek yoktur). Bu sayede sizin cihaz verileriniz başka bir müşteriye kesinlikle karışmaz.</p>
              </v-card-text>
              <div class="pa-4 pt-0">
                <v-card class="rounded-lg border" elevation="0">
                  <v-toolbar color="white" density="compact" class="border-b">
                    <v-icon color="primary" class="ml-4 mr-2">mdi-broadcast</v-icon>
                    <v-toolbar-title class="text-subtitle-2 font-weight-bold text-grey-darken-3">MQTT Publish Örneği</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-chip size="x-small" color="primary" variant="flat" class="mr-4 text-uppercase font-weight-bold">JS</v-chip>
                  </v-toolbar>
                  <MonacoEditor :modelValue="mqttCode" language="javascript" readOnly :minimap="false" hideFullscreen autoHeight />
                </v-card>
              </div>
            </v-card>
          </v-col>

          <v-col cols="12">
            <v-card class="h-100 bg-white border" elevation="0" rounded="lg">
              <v-card-title class="font-weight-bold text-purple-darken-3 bg-purple-lighten-5">Bildirimler (Push & WebSocket)</v-card-title>
              <v-card-text>
                <p class="text-body-2 mb-3 mt-3">Sandbox içinde bir cihaz hatası tespit ettiğinizde, <code>push.send(kullaniciId, mesaj)</code> fonksiyonu ile platform arayüzünü kullanan operatörlere anlık tarayıcı bildirimi (Web Push) atabilirsiniz.</p>
              </v-card-text>
              <div class="pa-4 pt-0">
                <v-card class="rounded-lg border" elevation="0">
                  <v-toolbar color="white" density="compact" class="border-b">
                    <v-icon color="primary" class="ml-4 mr-2">mdi-bell-ring</v-icon>
                    <v-toolbar-title class="text-subtitle-2 font-weight-bold text-grey-darken-3">Web Push Örneği</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-chip size="x-small" color="primary" variant="flat" class="mr-4 text-uppercase font-weight-bold">JS</v-chip>
                  </v-toolbar>
                  <MonacoEditor :modelValue="pushCode" language="javascript" readOnly :minimap="false" hideFullscreen autoHeight />
                </v-card>
              </div>
            </v-card>
          </v-col>
        </v-row>
        
        <v-card color="grey-lighten-4" class="pa-4 mb-6" elevation="0" rounded="lg">
          <p class="text-subtitle-2 font-weight-bold mb-2">[İLERİ OKUMA] İleri Okuma (Meraklılar İçin):</p>
          <ul class="text-body-2 pl-4">
            <li>Endüstri standartı MQTT haberleşmesinin detayı için <a href="https://mqtt.org/" target="_blank" class="text-primary font-weight-bold">MQTT Resmi Sitesi</a>.</li>
            <li>Tarayıcılara push bildirimi atma (Web Push API) mimarisi için <a href="https://developer.mozilla.org/en-US/docs/Web/API/Push_API" target="_blank" class="text-primary font-weight-bold">MDN Push API</a>.</li>
          </ul>
        </v-card>

      </v-container>
    </v-main>
  </v-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue';
const drawer = ref(true);
const { primaryColor: color } = useSysVars();

const modbusCode = `// Backend Sandbox Alanında Çalışır (Sunucu Tarafı)
// Cihazlara asenkron olarak komut göndermek veya veri okumak için kullanılır.

const ipAdresi = payload.body.ip;

try {
    // PLC'den okuma yapıldığında istek arka planda platformun Modbus havuzuna alınır ve sırayla iletilir.
    const result = await readModbusData(
        ipAdresi,       // Cihaz IP'si
        502,            // Port
        1,              // Slave ID
        0,              // Başlangıç Adresi
        5,              // Kaç Register?
        'holding',      // Tip
        'uint16'        // Parse türü
    );
    
    return { respond: true, status: 200, body: { data: result } };
} catch(e) {
    return { respond: true, status: 500, body: { hata: 'Cihaza ulaşılamadı' } };
}`;

const mqttCode = `// Backend Sandbox Alanında Çalışır

const cihazId = payload.body.cihazId;
const islemVerisi = payload.body.veri;

// Sadece kendi tenant'ınız içindeki 'komutlar/Cihaz-1' topic'ine veri atarsınız
publishMQTT(\`komutlar/\${cihazId}\`, {
    aktif: true,
    hiz: 1500,
    parametre: islemVerisi
});

return { respond: true, status: 200, body: { mesaj: 'MQTT mesajı gönderildi' } };`;

const pushCode = `// Backend Sandbox Alanında Çalışır

const alarmAktifMi = payload.body.alarm;
const operatorId = payload.body.kullaniciId;

if (alarmAktifMi) {
    // Seçili operatörün tarayıcısına anında Push Bildirimi (WebSocket) düşer
    push.send(operatorId, {
        baslik: "Kritik Sıcaklık Uyarısı!",
        mesaj: "Motor-1 90 dereceyi geçti, lütfen kontrol edin.",
        tip: "error"
    });
}

return { respond: true, status: 200, body: { mesaj: 'Kontrol tamamlandı' } };`;
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
