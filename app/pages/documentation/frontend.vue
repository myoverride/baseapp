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
        <v-list-item to="/documentation/frontend" title="3. Arayüz (Vue & Vuetify)" prepend-icon="mdi-monitor-dashboard" exact :color="color" rounded="lg"></v-list-item>
        <v-list-item to="/documentation/database" title="4. Veritabanı Mimarisi" prepend-icon="mdi-database" :color="color" rounded="lg"></v-list-item>
        <v-list-item to="/documentation/sandbox" title="5. Backend (Sandbox)" prepend-icon="mdi-server-security" :color="color" rounded="lg"></v-list-item>
        <v-list-item to="/documentation/utils" title="6. Yardımcı Araçlar" prepend-icon="mdi-toolbox" :color="color" rounded="lg"></v-list-item>
        <v-list-item to="/documentation/realtime" title="7. IoT ve Haberleşme" prepend-icon="mdi-access-point-network" :color="color" rounded="lg"></v-list-item>
        <v-list-item to="/documentation/background" title="8. Arka Plan Süreçleri" prepend-icon="mdi-clock-fast" :color="color" rounded="lg"></v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-main class="bg-grey-lighten-4" style="min-height: 100vh;">
      <v-container class="pa-md-8" fluid style="max-width: 1200px;">
        <h1 class="text-h3 font-weight-bold text-primary mb-4">Özel Sayfalar (UI) Geliştirme</h1>
        
        <v-alert type="info" variant="tonal" class="mb-6">
          <strong>DynamicRenderer Mimarisi:</strong> BaseApp sayfalarınızı (Custom Pages) sunucuyu yeniden başlatmadan anında (runtime) derleyen özel bir <code>DynamicRenderer.vue</code> mimarisine sahiptir. Platform içerisinden yazdığınız kodlar <code>eval()</code> ile değil, güvenli <code>Blob URL</code> mekanizmasıyla yüklenir.
        </v-alert>

        <p class="text-body-1 mb-6 text-grey-darken-3" style="line-height: 1.8;">
          Arayüz çizmek için platformun arayüzünde sadece 3 farklı metin alanı doldurursunuz: <em>Template String, Script Content ve Style Content</em>. Platform Vue 3, Nuxt ve Vuetify kütüphanelerini halihazırda sisteme gömmüştür.
        </p>

        <v-alert type="error" variant="tonal" border="start" class="rounded-lg mb-8">
          <div class="font-weight-bold text-h6 mb-2">KRİTİK UYARI: Yasaklı Kullanımlar</div>
          1. <strong>Asla</strong> <code>&lt;template&gt;</code>, <code>&lt;script&gt;</code> veya <code>&lt;style&gt;</code> sarmalayıcı etiketlerini (tag) <strong>kullanmayın.</strong><br>
          2. Script alanında <code>import ... from ...</code> VEYA <code>export default</code> <strong>KULLANILAMAZ</strong>. Tüm temel Vue değişkenleri (`ref`, `reactive`, `onMounted`) otomatik enjekte edilir.<br>
          3. Top-Level <code>await</code> Tuzağı: Script alanının ana dizininde doğrudan <code>await $fetch(...)</code> yaparsanız tüm arayüz kilitlenebilir. İsteklerinizi daima <code>onMounted</code> içine yazın.<br>
          <br>
          <div class="font-weight-bold text-h6 mb-2 mt-4 text-warning">MİMARİ BİLGİSİ: 3'lü Erişim Hiyerarşisi (RBAC) ve Uç Noktalar</div>
          Platform sadece "Yönetici" ve "Kullanıcı" olarak ayrılmaz:
          <ol class="ml-6 mb-2 mt-2">
            <li><strong>Sistem Yöneticileri (is_admin: true):</strong> Platformun otomatik ürettiği <code>/api/admin/records/...</code> uç noktalarını (EAV API) doğrudan kullanabilirler.</li>
            <li><strong>Standart Kullanıcılar (Hashtag Roller):</strong> <code>/api/admin/...</code> rotalarına erişimleri <strong>YASAKTIR (403)</strong>. Bu kullanıcılar için iş kurallarınıza göre <strong>Özel Uç Noktalar (Custom Endpoints)</strong> yazmanız ve yetki etiketlerini (Hashtag) eşleştirmeniz gerekir.</li>
            <li><strong>Public (Misafir) Ziyaretçiler:</strong> Sadece <code>is_public: true</code> olarak işaretlediğiniz Özel Uç Noktalara erişebilirler.</li>
          </ol>
          <strong>Özgür Rota (Custom Route) Mimarisi:</strong> Yazacağınız özel uç noktaların <code>/api/custom/...</code> gibi belirli bir kelimeyle başlama zorunluluğu <strong>yoktur</strong>. Sistem ayrılmış rotaları (Örn: <code>/api/admin</code>) hariç her türlü URL desenini (Örn: <code>/satranc-odasi</code>, <code>/api/v1/veriler</code>) tanımlamanıza olanak tanır.
        </v-alert>

        <h2 class="text-h4 font-weight-bold mt-8 mb-4 text-secondary">1. Template Alanı (Görsel İskelet)</h2>
        <p class="text-body-1 mb-4">
          Standart HTML ve Vuetify (<code>&lt;v-btn&gt;</code> vb.) bileşenleri burada kullanılır. Ayrıca platformun size sunduğu <strong>CrudTable, ItemDialog, AdvancedFilterBuilder, MonacoEditor</strong> gibi yerleşik güçlü bileşenleri hiçbir import yapmadan doğrudan kullanabilirsiniz.
        </p>

        <v-card class="mb-8 rounded-lg border" elevation="1">
          <v-toolbar color="white" density="compact" class="border-b">
            <v-icon color="primary" class="ml-4 mr-2">mdi-xml</v-icon>
            <v-toolbar-title class="text-subtitle-2 font-weight-bold text-grey-darken-3">
              Template Alanına Yazılacak Kod
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-chip size="x-small" color="primary" variant="flat" class="mr-4 text-uppercase font-weight-bold">HTML</v-chip>
          </v-toolbar>
          <MonacoEditor :modelValue="templateCode" language="html" readOnly :minimap="false" hideFullscreen autoHeight />
        </v-card>

        <h2 class="text-h4 font-weight-bold mt-8 mb-4 text-secondary">2. Script Alanı (Setup Body ve Otomatik Objeler)</h2>
        <p class="text-body-1 mb-4">
          Script alanı arka planda Vue'nun <code>setup()</code> metodunun gövdesi (body) gibi çalışır. Bu nedenle tanımladığınız tüm değişkenleri arayüzün görebilmesi için dosyanın en sonunda <strong><code>return { ... }</code></strong> yapmanız şarttır. <code>$fetch</code>, <code>useSysVars()</code> (Değişkenler), <code>useState('user')</code> (Aktif kullanıcı) gibi hayati araçlar otomatik enjekte edilmiştir. Bellek sızıntısını önlemek için sayfadan çıktığınız an tüm <code>$fetch</code> istekleri sistemce otomatik iptal edilir.
        </p>

        <v-card class="mb-8 rounded-lg border" elevation="1">
          <v-toolbar color="white" density="compact" class="border-b">
            <v-icon color="primary" class="ml-4 mr-2">mdi-language-javascript</v-icon>
            <v-toolbar-title class="text-subtitle-2 font-weight-bold text-grey-darken-3">
              Script Alanına Yazılacak Kod
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-chip size="x-small" color="primary" variant="flat" class="mr-4 text-uppercase font-weight-bold">JS</v-chip>
          </v-toolbar>
          <MonacoEditor :modelValue="scriptCode" language="javascript" readOnly :minimap="false" hideFullscreen autoHeight />
        </v-card>

        <h2 class="text-h4 font-weight-bold mt-8 mb-4 text-secondary">3. Style Alanı (Tasarım Detayları)</h2>
        <p class="text-body-1 mb-4">
          Sadece bu sayfayı etkileyecek olan (Scoped) CSS kodlarıdır. Sisteme sızmaması için BaseApp arka planda CSS id'lerini sayfa id'si ile otomatik sarmalar.
        </p>

        <v-card class="mb-8 rounded-lg border" elevation="1">
          <v-toolbar color="white" density="compact" class="border-b">
            <v-icon color="primary" class="ml-4 mr-2">mdi-palette</v-icon>
            <v-toolbar-title class="text-subtitle-2 font-weight-bold text-grey-darken-3">
              Style Alanına Yazılacak Kod
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-chip size="x-small" color="primary" variant="flat" class="mr-4 text-uppercase font-weight-bold">CSS</v-chip>
          </v-toolbar>
          <MonacoEditor :modelValue="styleCode" language="css" readOnly :minimap="false" hideFullscreen autoHeight />
        </v-card>

      </v-container>
    </v-main>
  </v-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue';
const drawer = ref(true);
const { primaryColor: color } = useSysVars();

const templateCode = `<v-container>
    <v-row>
        <v-col cols="12">
            <v-card class="elevation-2 rounded-lg">
                <v-card-title class="bg-primary text-white py-3">
                    <v-icon icon="mdi-robot-industrial" class="mr-2"></v-icon>
                    Bağlı Cihazlar
                </v-card-title>
                
                <v-data-table 
                    :headers="tabloBasliklari" 
                    :items="cihazListesi" 
                    :loading="yukleniyor"
                    hover
                >
                    <template v-slot:item.durum="{ item }">
                        <v-chip :color="item.durum === 'Aktif' ? 'success' : 'error'" size="small">
                            {{ item.durum }}
                        </v-chip>
                    </template>
                </v-data-table>
            </v-card>
        </v-col>
    </v-row>
</v-container>`;

const scriptCode = `// DİKKAT: Burada import { ref } from 'vue' YAZILMAZ!
// Sistem 'ref', 'onMounted', '$fetch', 'useSysVars' gibi öğeleri otomatik enjekte eder.

const yukleniyor = ref(false);
const cihazListesi = ref([]);

// Aktif giriş yapmış kullanıcı bilgisini çekmek için global state
const user = useState('user');

const verileriGetir = async () => {
    yukleniyor.value = true;
    try {
        // Multi-tenant header'lar ve yetki Token'ı arka planda ($fetch ile) otomatik eklenir
        // SİZİN EKLEMENİZE GEREK YOKTUR
        const response = await $fetch('/api/custom/cihazlari-getir');
        cihazListesi.value = response.data;
    } catch (e) {
        console.error("Veri çekilemedi", e);
    } finally {
        yukleniyor.value = false;
    }
};

// Top-Level Await hatasına düşmemek için isteği onMounted içinde atıyoruz
onMounted(() => {
    verileriGetir();
});

// Template (Arayüz) kodunun bu değişkenleri görebilmesi için ZORUNLU İŞLEM:
return {
    yukleniyor,
    cihazListesi,
    user,
    verileriGetir
};`;

const styleCode = `/* Sadece bu sayfada geçerli olacak CSS kuralları */
.v-data-table {
    border-radius: 0 0 8px 8px;
}

/* Tablonun satırlarının üzerine gelindiğinde hafif mavi renk verelim */
.v-data-table tbody tr:hover {
    background-color: #f0f8ff !important;
    cursor: pointer;
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
