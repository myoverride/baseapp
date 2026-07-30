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
        <v-list-item to="/documentation/sandbox" title="5. Backend (Sandbox)" prepend-icon="mdi-server-security" exact :color="color" rounded="lg"></v-list-item>
        <v-list-item to="/documentation/utils" title="6. Yardımcı Araçlar" prepend-icon="mdi-toolbox" :color="color" rounded="lg"></v-list-item>
        <v-list-item to="/documentation/realtime" title="7. IoT ve Haberleşme" prepend-icon="mdi-access-point-network" :color="color" rounded="lg"></v-list-item>
        <v-list-item to="/documentation/background" title="8. Arka Plan Süreçleri" prepend-icon="mdi-clock-fast" :color="color" rounded="lg"></v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-main class="bg-grey-lighten-4" style="min-height: 100vh;">
      <v-container class="pa-md-8" fluid style="max-width: 1200px;">
        <h1 class="text-h3 font-weight-bold text-primary mb-4">Backend Mimarisi (Sandbox ve İş Kuralları)</h1>
        
        <v-alert type="info" variant="tonal" class="mb-6">
          <strong>Genel Kavram:</strong> Güvenlik kilitleri, kritik hesaplamalar ve veritabanına yazma işlemleri her zaman sunucu (Backend) tarafında yapılır. Sunucuya, dışarıdan çağrılabilen özel adresler (Endpoint / API) yazılır.
        </v-alert>

        <p class="text-body-1 mb-6 text-grey-darken-3" style="line-height: 1.8;">
          <strong>Platformdaki Karşılığı:</strong> Arayüzden tetiklenen işlemleri veya dış sistemlerden gelen talepleri (Örn: ERP entegrasyonu) karşılamak için <strong>Custom Endpoints (Özel Uç Noktalar)</strong> oluşturursunuz. Yazdığınız kodlar doğrudan sunucuyu çökertmemesi için <strong>Sandbox (İzole Kutu)</strong> adı verilen son derece güvenli bir ortamda çalışır. Bu sayede sonsuz döngü yazsanız bile platform zarar görmez.
        </p>

        <h2 class="text-h4 font-weight-bold mt-8 mb-4 text-secondary">1. Sandbox İçinde Neler Var? (JavaScript)</h2>
        <p class="text-body-1 mb-4">
          Sandbox içinde Node.js (JavaScript) yazabilirsiniz. Ancak platform size platformun API'si olan "hazır global değişkenleri" otomatik olarak enjekte eder:
        </p>
        <v-alert type="error" variant="tonal" class="mb-4">
          <strong>Kapsam (Scope) Koruması:</strong> URL'den veya formdan gelen veriler ASLA kök değişkene aktarılmaz (Örn: <code>params.id</code> diyemezsiniz). Dışarıdan gelen tüm veri kesinlikle <code>payload</code> objesinin altındadır (<code>payload.params</code>, <code>payload.body</code>).
        </v-alert>
        <v-alert type="warning" variant="tonal" class="mb-4">
          <strong>Zombi Sorgu (Zombie Query) Koruması:</strong> Dinamik kodların <code>SANDBOX_TIMEOUT</code> (Örn: 5 saniye) limitini aşıp kısır döngüye girmesi durumunda JavaScript VM işlemi anında kesilir (Hard-kill). DuckDB (telemetryDb) gibi analitik motorların ağır sorgular sırasında bellekte "Zombi" olarak kalmasını engellemek için, Sandbox içinde ortak bağlantı havuzu yerine her isteğe özel "Anlık (Ephemeral)" DuckDB bağlantıları açılır ve timeout anında bu bağlantılar anında imha edilerek bellek sızıntısı önlenir.
        </v-alert>
        <ul class="text-body-1 mb-6" style="line-height: 2;">
          <li><strong><code>payload</code>:</strong> Arayüzden veya dışarıdan size gönderilen form verisidir.</li>
          <li><strong><code>recordManager</code>:</strong> EAV Varlıklarına (Müşteriler, Formlar vb.) güvenli bir şekilde veri eklemek/okumak için kullanılır. <em>(En Önemlisi)</em></li>
          <li><strong><code>db.unsafe</code>:</strong> Sadece fiziksel tablolarda (users, telemetry) doğrudan SQLite okuma/yazma yapar.</li>
          <li><strong><code>telemetryDb.unsafe</code>:</strong> Saniyede binlerce sensör verisini gruplamak için DuckDB zaman serisi motoruna bağlanır.</li>
          <li><strong><code>fetch</code>:</strong> Başka bir sunucuya veya dış API'ye veri göndermek/çekmek için kullanılır.</li>
          <li><strong><code>sendEmail</code> & <code>push.send</code> & <code>publishMQTT</code>:</strong> SMTP E-Posta, Anlık Bildirim (Push) ve IoT cihazlarına komut göndermek için kullanılır.</li>
        </ul>

        <v-card class="mb-8 rounded-lg border" elevation="1">
          <v-toolbar color="white" density="compact" class="border-b">
            <v-icon color="primary" class="ml-4 mr-2">mdi-api</v-icon>
            <v-toolbar-title class="text-subtitle-2 font-weight-bold text-grey-darken-3">
              HTTP Timeout Yönetimi ve Statü Kodları
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-chip size="x-small" color="primary" variant="flat" class="mr-4 text-uppercase font-weight-bold">JS</v-chip>
          </v-toolbar>
          <MonacoEditor :modelValue="jsCode" language="javascript" readOnly :minimap="false" hideFullscreen autoHeight />
        </v-card>



      </v-container>
    </v-main>
  </v-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue';
const drawer = ref(true);
const { primaryColor: color } = useSysVars();

const jsCode = `// Backend Sandbox Alanı (Node.js VM İzole Ortamı)
// Tüm Custom Endpoint'ler ve API'ler varsayılan olarak 5 SANİYE (SANDBOX_TIMEOUT) ile kısıtlıdır!

const islemVerisi = payload.body.veri;

try {
    // Dış dünyaya fetch atmak serbesttir
    const response = await fetch('https://api.external.com/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: islemVerisi })
    });
    
    if (!response.ok) {
        return { respond: true, status: 400, body: { hata: 'Dış API cevap vermedi.' } };
    }
    
    const API_Sonucu = await response.json();
    
    // Gelen sonucu veritabanımızdaki bir EAV Varlığına (Örn: log_kayitlari) güvenle ekliyoruz
    // DİKKAT: db.unsafe kullanarak EAV varlıklarına INSERT INTO ile müdahale edilemez! Sadece recordManager kullanılmalıdır.
    // context.tenantSlug, sistemin arka planda güvenle enjekte ettiği kırılamaz tenant kimliğidir.
    await recordManager.createRecord(context.tenantSlug, 'log_kayitlari', { API_Sonucu });
    
    return { respond: true, status: 200, body: { mesaj: 'İşlem Başarılı' } };
    
} catch(e) {
    // Timeout veya Kod hataları doğrudan sistem telemetry'ye düşer
    console.error("Endpoint Hatası:", e.message);
    return { respond: true, status: 500, body: { hata: 'Sistem hatası' } };
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
