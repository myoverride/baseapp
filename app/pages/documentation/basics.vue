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
          exact
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
          :color="color"
          rounded="lg"
        ></v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-main class="bg-grey-lighten-4" style="min-height: 100vh">
      <v-container class="pa-md-8" fluid style="max-width: 1200px">
        <h1 class="text-h3 font-weight-bold text-primary mb-4">
          Felsefe ve Runtime Mimarisi
        </h1>
        <p class="text-body-1 mb-6 text-grey-darken-3" style="line-height: 1.8">
          <strong>BaseApp Nedir?</strong> BaseApp klasik bir web projesi değildir. "Kodla, derle, durdur, dağıt, başlat" (code-compile-deploy) döngüsünü tamamen ortadan kaldıran yeni nesil bir <strong>Runtime Uygulama Geliştirme Platformudur</strong> (Low-Code/No-Code Engine).<br><br>
          <strong>Nasıl Çalışır?</strong> Geliştiriciler yerel bilgisayarlarında VS Code kullanarak dosya oluşturmazlar. Tüm arayüzler (UI), arka plan servisleri (API), veritabanı şemaları ve zamanlanmış görevler doğrudan <strong>Platformun Yönetim Paneli</strong> üzerinden yazılır. Yazdığınız kodlar veritabanına kaydedilir ve sunucu yeniden başlatılmadan (No Restart) anında devreye girer.
        </p>

        <v-divider class="mb-8"></v-divider>

        <h2 class="text-h4 font-weight-bold mb-4 text-secondary">
          1. İzole Sandbox ve Özel Kod Stratejisi
        </h2>
        <v-alert type="info" variant="tonal" class="mb-4">
          <strong>Genel Kavram:</strong> Tarayıcı üzerinden Backend kodu yazmak normalde büyük bir çökme riski taşır (Örn: Sonsuz döngüler).
        </v-alert>
        <p class="text-body-1 mb-4">
          <strong>Platformdaki Karşılığı:</strong> Platform, arka planda Node.js'in çekirdek <code>node:vm</code> (Virtual Machine) Sandbox modülünü kullanır. Tüm kodlarınız izole edilir. Kodunuz kilitlense dahi sistem 5 saniye (SANDBOX_TIMEOUT) içinde işlemi "Hard-Kill" ile sonlandırarak ana sunucuyu çökme (OOM) ve Zombi Sorgulardan korur.
        </p>

        <v-row class="mb-8">
          <v-col cols="12">
            <v-card class="rounded-lg border" elevation="1">
              <v-toolbar color="white" density="compact" class="border-b">
                <v-icon color="primary" class="ml-4 mr-2">mdi-shield-lock</v-icon>
                <v-toolbar-title class="text-subtitle-2 font-weight-bold text-grey-darken-3">
                  Backend Sandbox Alanı (Güvenli Kapsam)
                </v-toolbar-title>
                <v-spacer></v-spacer>
                <v-chip size="x-small" color="primary" variant="flat" class="mr-4 text-uppercase font-weight-bold">JS</v-chip>
              </v-toolbar>
              <MonacoEditor :modelValue="sandboxCode" language="javascript" readOnly :minimap="false" hideFullscreen autoHeight />
            </v-card>
          </v-col>
        </v-row>

        <v-divider class="mb-8"></v-divider>

        <h2 class="text-h4 font-weight-bold mb-4 text-secondary">
          2. Multi-Tenant ve Mismatch (Sızıntı) Koruması
        </h2>
        <v-alert type="warning" variant="tonal" class="mb-4">
          <strong>Fiziksel İzolasyon:</strong> Kurumların (Tenant) verileri aynı tabloda "tenant_id" sütunuyla ayrılmaz. Her kurumun kendine ait fiziksel <code>_app.db</code> (SQLite) ve <code>_telemetry.duckdb</code> (DuckDB) dosyaları vardır.
        </v-alert>
        <p class="text-body-1 mb-6">
          Sistem, yetki karmaşasını (Mismatch) donanımsal düzeyde çözer. Çerezlere (Cookie) güvenmek yerine, talebin URL yoluna veya Custom Domain başlığına bakar. Eğer tarayıcınızdaki oturum belirteci (Token) ile bulunduğunuz URL URL eşleşmiyorsa anında <strong>403 Forbidden</strong> vererek veri sızıntılarını (Data Bleed) imkansız hale getirir.
        </p>
        <v-divider class="mb-8"></v-divider>

        <h2 class="text-h4 font-weight-bold mb-4 text-secondary">
          3. Arayüz ve Backend Etkileşimi (Özet)
        </h2>
        <p class="text-body-1 mb-4">
          BaseApp'da arayüzler doğrudan veritabanına bağlanmaz. Arayüzünüz (Vue) platform üzerinden bir istek atar, arka plandaki Sandbox (Node.js) isteği yakalar, veritabanına sorguyu atar ve JSON olarak cevabı UI'a döndürür.
        </p>

        <v-row class="mb-8">
          <v-col cols="12">
            <v-card class="rounded-lg border" elevation="1">
              <v-toolbar color="white" density="compact" class="border-b">
                <v-icon color="primary" class="ml-4 mr-2">mdi-monitor</v-icon>
                <v-toolbar-title class="text-subtitle-2 font-weight-bold text-grey-darken-3">
                  Arayüz (UI) Kodu
                </v-toolbar-title>
                <v-spacer></v-spacer>
                <v-chip size="x-small" color="primary" variant="flat" class="mr-4 text-uppercase font-weight-bold">JS</v-chip>
              </v-toolbar>
              <MonacoEditor :modelValue="uiCode" language="javascript" readOnly :minimap="false" hideFullscreen autoHeight />
            </v-card>
          </v-col>

          <v-col cols="12">
            <v-card class="rounded-lg border" elevation="1">
              <v-toolbar color="white" density="compact" class="border-b">
                <v-icon color="primary" class="ml-4 mr-2">mdi-server</v-icon>
                <v-toolbar-title class="text-subtitle-2 font-weight-bold text-grey-darken-3">
                  Backend (Sandbox) Kodu
                </v-toolbar-title>
                <v-spacer></v-spacer>
                <v-chip size="x-small" color="primary" variant="flat" class="mr-4 text-uppercase font-weight-bold">JS</v-chip>
              </v-toolbar>
              <MonacoEditor :modelValue="sandboxExampleCode" language="javascript" readOnly :minimap="false" hideFullscreen autoHeight />
            </v-card>
          </v-col>
        </v-row>

      </v-container>
    </v-main>
  </v-layout>
</template>

<script setup lang="ts">
import { ref } from "vue";
const drawer = ref(true);
const { primaryColor: color } = useSysVars();

const uiCode = `// Arayüz (Frontend) Script Alanı
const motorCalisiyor = ref(true);

const durumuDegistir = async () => {
    // Backend (Sandbox) tarafına veri gönderilir
    await $fetch('/api/custom/motor-guncelle', {
        method: 'POST',
        body: { durum: motorCalisiyor.value }
    });
};

return { motorCalisiyor, durumuDegistir };`;

const sandboxExampleCode = `// Backend Sandbox Alanı (motor-guncelle API'si)
const yeniDurum = payload.body.durum; 

// Veritabanı işlemleri sadece arka planda çalışır
await db.unsafe(
    "INSERT INTO motor_log (durum) VALUES (?)", 
    [yeniDurum]
);

return { respond: true, status: 200 };`;

const sandboxCode = `// Platform üzerinden oluşturulan "Custom Endpoint" alanı (Arka Plan)
// Bu kod node:vm sandbox içinde çalışır, sistem global objeleri otomatik enjekte eder.

// Dışarıdan gelen veriyi sadece 'payload' objesi üzerinden okuyabilirsiniz
const userName = payload.body.username; 

try {
    // fs veya process.exit() KULLANILAMAZ! Sadece platformun izin verdiği komutlar çalışır.
    
    // db.unsafe: Doğrudan Tenant'ın izole SQLite EAV veritabanına bağlanır.
    // Timeout anında bu bağlantı otomatik hard-kill ile kapatılır (Zombi sorgu koruması).
    const sonuc = await db.unsafe(
        "SELECT id, slug FROM entities WHERE slug = ?", 
        [userName]
    );

    // İşlem başarılıysa UI katmanına JSON dönülür
    return { 
        respond: true, 
        status: 200, 
        body: { basarili: true, data: sonuc } 
    };

} catch(e) {
    // Hatalar sistemin merkez log (telemetry) yapısına otomatik düşer
    return { 
        respond: true, 
        status: 500, 
        body: { mesaj: "Veritabanı okuma hatası" } 
    };
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
