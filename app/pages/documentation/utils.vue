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
        <v-list-item to="/documentation/utils" title="6. Yardımcı Araçlar" prepend-icon="mdi-toolbox" exact :color="color" rounded="lg"></v-list-item>
        <v-list-item to="/documentation/realtime" title="7. IoT ve Haberleşme" prepend-icon="mdi-access-point-network" :color="color" rounded="lg"></v-list-item>
        <v-list-item to="/documentation/background" title="8. Arka Plan Süreçleri" prepend-icon="mdi-clock-fast" :color="color" rounded="lg"></v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-main class="bg-grey-lighten-4" style="min-height: 100vh;">
      <v-container class="pa-md-8" fluid style="max-width: 1200px;">
        <h1 class="text-h3 font-weight-bold text-primary mb-4">Yardımcı Araçlar (Custom Utils)</h1>
        
        <v-alert type="info" variant="tonal" class="mb-6">
          <strong>Genel Kavram:</strong> Yazılımda aynı kod bloklarını (Örneğin Vergi Hesaplama fonksiyonu) tekrar tekrar yazmak yerine, bir kez yazıp her yerden çağırmak isteriz. Buna DRY (Don't Repeat Yourself) prensibi denir.
        </v-alert>

        <p class="text-body-1 mb-6 text-grey-darken-3" style="line-height: 1.8;">
          <strong>Platformdaki Karşılığı:</strong> Platformumuzda "Utils" (Araçlar) isminde ortak bir kütüphane oluşturabilirsiniz. Yazdığınız bir fonksiyonu hem Arayüz'deki (Vue) formlardan hem de Arka Plandaki (Sandbox) süreçlerinizden çağırabilirsiniz.
        </p>

        <h2 class="text-h4 font-weight-bold mt-8 mb-4 text-secondary">1. Target (Hedef) Tipleri</h2>
        <p class="text-body-1 mb-4">Bir yardımcı fonksiyon (Util) yazarken nerede çalışacağını seçmelisiniz:</p>
        <v-table class="mb-6 bg-white" variant="outlined">
          <thead class="bg-primary text-white">
            <tr><th>Hedef (Target)</th><th>Nerede Çalışır?</th><th>Özellikleri</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>API</strong></td>
              <td>Sadece Sunucuda</td>
              <td>Veritabanı (<code>db.unsafe</code>) veya Mail (<code>sendEmail</code>) gibi sunucu yeteneklerine ulaşabilir. Tarayıcı özelliklerini (DOM, alert) kullanamaz.</td>
            </tr>
            <tr>
              <td><strong>UI</strong></td>
              <td>Arayüzden (API Üzerinden)</td>
              <td>Sadece tarayıcı üzerinden (Vue) tetiklenebilen uç noktalardır. Kod sunucuda (Node.js) çalışır, ancak sadece Arayüz bu koda erişebilir. (Not: Sunucuda çalıştığı için window veya localStorage özelliklerine erişemez.)</td>
            </tr>
            <tr>
              <td><strong>Shared (Ortak)</strong></td>
              <td>Her İki Tarafta</td>
              <td>İçinde sadece saf Matematik, Tarih hesaplaması veya Metin işlemleri (Formatlama) barındıran fonksiyonlardır. <strong>En sık kullanılan hedef tipidir.</strong></td>
            </tr>
          </tbody>
        </v-table>

        <h2 class="text-h4 font-weight-bold mt-8 mb-4 text-secondary">2. Örnek Kullanım Mantığı</h2>
        <p class="text-body-1 mb-4">
          Yardımcı araçları tanımlarken onlara bir argüman (parametre) listesi (<code>__utils_args</code>) gelir. Bunu işleyip <code>return</code> ile bir sonuç dönersiniz.
        </p>

        <v-card class="mb-8 rounded-lg border" elevation="1">
          <v-toolbar color="white" density="compact" class="border-b">
            <v-icon color="primary" class="ml-4 mr-2">mdi-toolbox</v-icon>
            <v-toolbar-title class="text-subtitle-2 font-weight-bold text-grey-darken-3">
              Kullanıcı Arayüzünden (UI) Util Çağırma
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-chip size="x-small" color="primary" variant="flat" class="mr-4 text-uppercase font-weight-bold">JS</v-chip>
          </v-toolbar>
          <MonacoEditor :modelValue="uiCode" language="javascript" readOnly :minimap="false" hideFullscreen autoHeight />
        </v-card>

        <v-card class="mb-8 rounded-lg border" elevation="1">
          <v-toolbar color="white" density="compact" class="border-b">
            <v-icon color="primary" class="ml-4 mr-2">mdi-server</v-icon>
            <v-toolbar-title class="text-subtitle-2 font-weight-bold text-grey-darken-3">
              Util Kodunun Kendisi (Arka Plan)
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-chip size="x-small" color="primary" variant="flat" class="mr-4 text-uppercase font-weight-bold">JS</v-chip>
          </v-toolbar>
          <MonacoEditor :modelValue="utilCode" language="javascript" readOnly :minimap="false" hideFullscreen autoHeight />
        </v-card>

        <v-card color="grey-lighten-4" class="pa-4 mt-8" elevation="0" rounded="lg">
          <p class="text-subtitle-2 font-weight-bold mb-2">[İLERİ OKUMA] İleri Okuma (Meraklılar İçin):</p>
          <ul class="text-body-2 pl-4">
            <li>JavaScript Fonksiyonları ve Argümanlar hakkında daha fazlası için <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions" target="_blank" class="text-primary font-weight-bold">MDN Functions</a>.</li>
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

const uiCode = `// Arayüzde (Frontend) herhangi bir Custom Page'in Script Alanı

// 1. Özel Utils proxy nesnesini alıyoruz (Otomatik enjekte edilmiştir)
const { $utils } = useUtils();

const fiyatiHesapla = async () => {
    // 2. Util veritabanından çalıştırılır (Argümanlar JSON formatında sunucuya gider)
    const vergiDahilFiyat = await $utils.gelismisHesapla(150, "KDV");
    console.log("Sonuç:", vergiDahilFiyat);
};

return { fiyatiHesapla };`;

const utilCode = `// Util'in Kendi Tanımlaması (Arka Planda Yönetim Panelinden Yazılan Kod)
// Bu kod utils.gelismisHesapla(150, "KDV") şeklinde çağrıldığında tetiklenir:

const [tutar, tip] = __utils_args; // Fonksiyona gönderilen argümanları Dizi olarak alırız

if (typeof tutar !== "number") {
    // Basit bir validasyon
    throw new Error("Tutar rakam olmalıdır!");
}

const hesap = tip === "KDV" ? tutar * 1.20 : tutar;
return hesap;`;
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
