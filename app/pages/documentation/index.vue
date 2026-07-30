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
          exact
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
          :color="color"
          rounded="lg"
        ></v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-main class="bg-grey-lighten-4" style="min-height: 100vh">
      <v-container class="pa-md-8" fluid style="max-width: 1200px">
        <v-row class="mb-4">
          <v-col>
            <h1 class="text-h3 font-weight-bold text-primary mb-4">
              Platforma Hoş Geldiniz
            </h1>
            <p class="text-body-1 text-grey-darken-3" style="line-height: 1.8">
              Endüstriyel Nesnelerin İnterneti (IIoT) Platformuna hoş geldiniz.
              Bu platform, fabrikalardan gelen devasa verileri saniyeden kısa
              sürede işleyebilen, kendi içinde veritabanı, haberleşme
              protokolleri (MQTT/Modbus) ve gelişmiş arayüz motorları barındıran
              tam teşekküllü bir **Canlı Geliştirme (Dynamic Execution)**
              ortamıdır.
            </p>
          </v-col>
        </v-row>

        <v-row class="mt-4 mb-8">
          <v-col cols="12">
            <v-card class="rounded-xl" elevation="2">
              <v-card-text class="pa-6">
                <h2 class="text-h5 font-weight-bold mb-4 text-secondary">
                  Mimarinin Temeli: Nasıl Çalışıyoruz?
                </h2>
                <p class="text-body-1 mb-4">
                  Standart yazılım projelerinde kodlar dosya sistemine yazılır,
                  derlenir ve sunucuya gönderilir (Deployment). Bu platformda
                  ise "Derleme (Build)" süreci yoktur. Tüm sayfalar
                  (`pages`) veritabanında tutulur. Siz arayüz üzerinden
                  kodunuzu güncellediğinizde, platform bunu anında yorumlayarak
                  **Canlı (Runtime)** ortamına alır.
                </p>
                <p class="text-body-1 mb-4">
                  Arayüz (Frontend) tarafı
                  <strong>Vue 3 Runtime Compiler</strong> ile yorumlanırken,
                  sunucu (Backend) kodları
                  <strong>Node.js VM Sandbox</strong> teknolojisi ile izole bir
                  kutuda çalıştırılır.
                </p>
                <v-alert type="warning" variant="tonal" class="mt-4">
                  <strong>Tek Geliştirici (Single-Owner) Felsefesi:</strong> Normal platformlarda "kötü niyetli biri sisteme sızar" korkusuyla gelen her veri defalarca filtreden geçer ve sistemi yavaşlatır. Bu platform tamamen sizin kişisel aracınız olduğu için, SQL Injection veya ReDoS gibi saldırıları durdurmaya çalışan ağır güvenlik denetimleri esnetilerek, yazdığınız kodların saf C++ motorunda çalışıyormuş gibi maksimum hızda çalışması sağlanır.
                </v-alert>
              </v-card-text>

            </v-card>
          </v-col>
        </v-row>

        <h2 class="text-h4 font-weight-bold mb-6 text-primary">
          Başvuru Kaynakları (External Resources)
        </h2>
        <p class="text-body-1 mb-4 text-grey-darken-3">
          Platformumuz modern yazılım standartları üzerine inşa edilmiştir.
          İleri düzey tasarımlar, karmaşık SQL sorguları veya özel fonksiyonlar
          yazarken platformun dayandığı resmi kütüphanelerin kılavuzlarına
          başvurmalısınız.
        </p>

        <v-row>
          <v-col cols="12" md="6" lg="4">
            <v-card variant="outlined" class="h-100 bg-white">
              <v-card-text>
                <div class="d-flex align-center mb-3">
                  <v-icon color="orange" size="32" class="mr-3"
                    >mdi-language-html5</v-icon
                  >
                  <h3 class="text-h6 font-weight-bold">
                    HTML, CSS & JavaScript
                  </h3>
                </div>
                <p class="text-body-2 mb-3">
                  Tüm web dünyasının temeli olan bu üçlü için en iyi kaynak
                  Mozilla'dır.
                </p>
                <a
                  href="https://developer.mozilla.org/en-US/"
                  target="_blank"
                  class="text-decoration-none text-primary font-weight-bold"
                  >MDN Web Docs'a Git &rarr;</a
                >
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" md="6" lg="4">
            <v-card variant="outlined" class="h-100 bg-white">
              <v-card-text>
                <div class="d-flex align-center mb-3">
                  <v-icon color="green" size="32" class="mr-3"
                    >mdi-vuejs</v-icon
                  >
                  <h3 class="text-h6 font-weight-bold">
                    Vue 3 (Composition API)
                  </h3>
                </div>
                <p class="text-body-2 mb-3">
                  Platformdaki arayüzlerin mantığını yönettiğimiz temel
                  framework.
                </p>
                <a
                  href="https://vuejs.org/guide/introduction.html"
                  target="_blank"
                  class="text-decoration-none text-primary font-weight-bold"
                  >Vue Resmi Dokümantasyonu &rarr;</a
                >
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" md="6" lg="4">
            <v-card variant="outlined" class="h-100 bg-white">
              <v-card-text>
                <div class="d-flex align-center mb-3">
                  <v-icon color="blue" size="32" class="mr-3"
                    >mdi-material-design</v-icon
                  >
                  <h3 class="text-h6 font-weight-bold">
                    Vuetify 3 (UI Kütüphanesi)
                  </h3>
                </div>
                <p class="text-body-2 mb-3">
                  Hazır butonlar, tablolar ve Material Design grid yapıları
                  (v-row, v-col) için başvuru kaynağınız.
                </p>
                <a
                  href="https://vuetifyjs.com/en/components/all/"
                  target="_blank"
                  class="text-decoration-none text-primary font-weight-bold"
                  >Vuetify Bileşenleri &rarr;</a
                >
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" md="6" lg="4">
            <v-card variant="outlined" class="h-100 bg-white">
              <v-card-text>
                <div class="d-flex align-center mb-3">
                  <v-icon color="blue-grey-darken-3" size="32" class="mr-3"
                    >mdi-database</v-icon
                  >
                  <h3 class="text-h6 font-weight-bold">SQLite</h3>
                </div>
                <p class="text-body-2 mb-3">
                  Sistemin ana veritabanı motoru. Veri tipleri ve fonksiyonları
                  hakkında bilgi almak için resmi dökümantasyonu
                  inceleyebilirsiniz.
                </p>
                <a
                  href="https://www.sqlite.org/docs.html"
                  target="_blank"
                  class="text-decoration-none text-primary font-weight-bold"
                  >SQLite Dokümanı &rarr;</a
                >
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" md="6" lg="4">
            <v-card variant="outlined" class="h-100 bg-white">
              <v-card-text>
                <div class="d-flex align-center mb-3">
                  <v-icon color="indigo" size="32" class="mr-3"
                    >mdi-chart-bell-curve-cumulative</v-icon
                  >
                  <h3 class="text-h6 font-weight-bold">DuckDB (Telemetry)</h3>
                </div>
                <p class="text-body-2 mb-3">
                  IoT zaman serisi (Time-Series) analizleri ve milyonlarca
                  kayıttan hızlı veri getirmek için kullanılan analitik motor.
                </p>
                <a
                  href="https://duckdb.org/docs/"
                  target="_blank"
                  class="text-decoration-none text-primary font-weight-bold"
                  >DuckDB Dokümanı &rarr;</a
                >
              </v-card-text>
            </v-card>
          </v-col>

        </v-row>
      </v-container>
    </v-main>
  </v-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue';
const drawer = ref(true);
const { primaryColor: color } = useSysVars();
</script>

<style scoped>
.docs-menu .v-list-item--active {
  font-weight: 600;
  background-color: rgb(var(--v-theme-primary), 0.1);
}
</style>
