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
          exact
          :color="color"
          rounded="lg"
        ></v-list-item>
        <v-list-item
          to="/documentation/sandbox"
          title="8. Korumalı Alan (Sandbox)"
          prepend-icon="mdi-shield-check-outline"
          :color="color"
          rounded="lg"
        ></v-list-item>
        <v-list-item
          to="/documentation/endpoints"
          title="5. Endpoint (API) Geliştirme"
          prepend-icon="mdi-api"
          :color="color"
          rounded="lg"
        ></v-list-item>
        <v-list-item
          to="/documentation/mqtt"
          title="7. MQTT & Cihaz Haberleşmesi"
          prepend-icon="mdi-access-point-network"
          :color="color"
          rounded="lg"
        ></v-list-item>
        <v-list-item
          to="/documentation/background"
          title="6. Arka Plan Görevleri"
          prepend-icon="mdi-cog-refresh-outline"
          :color="color"
          rounded="lg"
        ></v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-main class="bg-grey-lighten-4" style="min-height: 100vh">
      <v-container class="pa-md-8" fluid style="max-width: 1200px">
        <h1 class="text-h3 font-weight-bold text-primary mb-4">
          Veritabanı Mimarisi (SQLite ve DuckDB)
        </h1>
        
        <v-alert type="info" variant="tonal" class="mb-6">
          <strong>Genel Kavram:</strong> Uygulamalarda genellikle iki tip veri tutulur: 1) Formlar, Müşteriler gibi iş verileri (İlişkisel Veri), 2) Saniyede binlerce kez akan sensör sıcaklık, basınç verileri (Zaman Serisi Verisi).
        </v-alert>

        <p class="text-body-1 mb-6 text-grey-darken-3" style="line-height: 1.8">
          <strong>Platformdaki Karşılığı:</strong> Platformumuz İş Verileri için <strong>SQLite (EAV Modeli)</strong>, Sensör ve Log verileri için <strong>DuckDB</strong> motorunu kullanır. Arka plan servislerinizi (Sandbox) yazarken her iki veritabanına da size sunulan global değişkenler üzerinden kolayca ulaşırsınız.
        </p>

        <h2 class="text-h4 font-weight-bold mt-8 mb-4 text-secondary">
          1. Form ve İş Verileri (EAV Modeli ve SQLite)
        </h2>
        <p class="text-body-1 mb-4">
          Platform esnekliği sağlamak adına Entity-Attribute-Value (EAV) modelini kullanır. Sandbox içinde bu veritabanına <code>db.unsafe</code> (veya <code>sql</code>) fonksiyonu ile ulaşırsınız.
          SQLite yapısı gereği tek bir kilit (Mutex) kullanır. Aynı anda binlerce kişi okuma yapabilir ancak sadece tek kişi yazma yapabilir. Bu yüzden sistem <strong>Çift Bağlantı (Dual Connection)</strong> mimarisi kurmuştur: 1) Okuma kanalı (<code>sqliteRead</code>) kilitsiz ve açıktır. 2) Yazma kanalı (<code>sqlite</code>) ise işlemleri sıraya sokarak çarpışmayı (database is locked hatasını) önler.
        </p>
        <v-alert type="success" variant="tonal" class="mb-4">
          <strong>Otomatik JSON Çözümleme (Gizli Özellik):</strong> <code>db.unsafe</code> ile çektiğiniz kayıtlarda, eğer sütun verisi <code>[</code> veya <code>{</code> ile başlıyorsa, sistem bunu otomatik olarak <code>JSON.parse()</code> işleminden geçirip size doğrudan Obje/Dizi olarak teslim eder.
        </v-alert>

        <v-card class="mb-8 rounded-lg border" elevation="1">
          <v-card-title class="text-h6 font-weight-bold pt-4 pb-2 border-b">
            <v-icon :color="color" class="ml-4 mr-2">mdi-database</v-icon>
            İlişkisel Veritabanı (SQLite)
          </v-card-title>
          <MonacoEditor
            :modelValue="sqlCode"
            language="javascript"
            readOnly
            :minimap="false"
            hideFullscreen
            autoHeight
          />
        </v-card>

        <h2 class="text-h4 font-weight-bold mt-8 mb-4 text-secondary">
          2. Sensör ve Zaman Serisi Verileri (DuckDB)
        </h2>
        <p class="text-body-1 mb-4">
          EAV modeli esnek olsa da, cihazlardan akan anlık devasa loglar için yavaştır. Bu devasa veriler (Time-Series) için platform <strong>DuckDB</strong>'yi kullanır. Sandbox içinde <code>telemetryDb.unsafe</code> fonksiyonu ile bu hızlı analitik veritabanını sorgulayabilirsiniz. DuckDB, SQLite kilit kuyruğunun tamamen dışındadır (Bypass). Böylece cihazlar arkada deli gibi veri basarken, siz arayüzde donma yaşamadan sayfaları milisaniyeler içinde açabilirsiniz.
        </p>

        <v-card color="grey-lighten-4" class="pa-4 mb-6" elevation="0" rounded="lg">
          <p class="text-subtitle-2 font-weight-bold mb-2">[İLERİ OKUMA] İleri Okuma (Meraklılar İçin):</p>
          <ul class="text-body-2 pl-4">
            <li>EAV sorgu mantığı hakkında daha fazlası için <a href="https://en.wikipedia.org/wiki/Entity%E2%80%93attribute%E2%80%93value_model" target="_blank" class="text-primary font-weight-bold">EAV Modeli Wiki</a>.</li>
            <li>DuckDB'nin zaman fonksiyonları için <a href="https://duckdb.org/docs/sql/functions/time" target="_blank" class="text-primary font-weight-bold">DuckDB Time-Series Dokümantasyonu</a>.</li>
          </ul>
        </v-card>

        <v-card class="mb-8 rounded-lg border" elevation="1">
          <v-card-title class="text-h6 font-weight-bold pt-4 pb-2 border-b">
            <v-icon :color="color" class="ml-4 mr-2">mdi-chart-line</v-icon>
            DuckDB Aggregation (Kümeleme) Örneği
          </v-card-title>
          <MonacoEditor
            :modelValue="duckDbCode"
            language="javascript"
            readOnly
            :minimap="false"
            hideFullscreen
            autoHeight
          />
        </v-card>
      </v-container>
    </v-main>
  </v-layout>
</template>

<script setup lang="ts">
import { ref } from "vue";
const drawer = ref(true);
const { primaryColor: color } = useSysVars();

const sqlCode = `// Backend Sandbox'ında (Sunucu) Çalışır
// db.unsafe: Tenant'ın kendi izole SQLite veritabanıdır.

const cihazSektor = payload.body.sektor; 

// SQL Injection koruması için parametreler DİZİ (Array) olarak verilir.
const sonuc = await db.unsafe(\`
    SELECT r.id, e.slug
    FROM records r
    JOIN entities e ON r.entity_id = e.id
    LEFT JOIN record_fields rf ON r.id = rf.record_id
    WHERE e.slug = 'musteriler' 
      AND rf.key = 'sektor' 
      AND rf.val_str = ?
\`, [cihazSektor]);

return { respond: true, status: 200, body: sonuc };`;

const duckDbCode = `// Backend Sandbox'ında (Sunucu) Çalışır
// DuckDB ile milyarlarca sensör verisinin ışık hızında gruplanması

const cihazId = payload.body.cihazId;

// global 'telemetryDb' değişkeni DuckDB veritabanı bağlantısıdır
const analiz = await telemetryDb.unsafe(\`
    SELECT 
        time_bucket(INTERVAL '1 hour', timestamp) AS saat,
        AVG(value) AS ortalama_sicaklik,
        MAX(value) AS maksimum_sicaklik
    FROM telemetry
    WHERE device_id = ?
      AND timestamp >= NOW() - INTERVAL '24 hours'
    GROUP BY saat
    ORDER BY saat DESC
\`, [cihazId]);

return { respond: true, status: 200, body: analiz };`;
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
