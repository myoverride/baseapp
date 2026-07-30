# IIoT Platform — Proje Sorun Raporu

**Tarih:** 2026-07-30  
**İncelenen Dizinler:** `server/`, `app/`, `.agents/`  
**Kapsam:** Mimari sorunlar, potansiyel runtime hataları, kod tekrarları, eksikler

---

## Özet

| Kategori | Kritik | Orta | Düşük |
|---|---|---|---|
| Mimari / Concurrency | 3 | 2 | 1 |
| Kod Kalitesi / Tekrar | 0 | 4 | 2 |
| Potansiyel Runtime Hataları | 2 | 3 | 1 |
| Konfigürasyon / DevOps | 0 | 2 | 2 |
| Frontend (app/) | 0 | 2 | 2 |

---

## 1. KRİTİK SORUNLAR

### 1.1 `db.ts` — `records` ve `record_fields` Tabloları İki Kez CREATE Ediliyor

**Dosya:** [`db.ts`](file:///c:/Users/murat/Desktop/iiotplatform/server/utils/db.ts)  
**Satırlar:** L731-L756 ve L817-L842

`setupTenantDatabase` fonksiyonunda `records` ve `record_fields` tabloları ile ilgili `CREATE TABLE IF NOT EXISTS` ve `CREATE INDEX IF NOT EXISTS` satırları **iki kez** tekrarlanıyor:
- İlk kez: L731-L756
- İkinci kez: L817-L842 (workers tablosunun hemen altında)

**Risk:** Fonksiyonel bir hata oluşturmuyor (`IF NOT EXISTS` sayesinde) ancak kod karmaşıklığını artırıyor ve migration sırasında yalnızca birinde yapılan değişikliğin diğerine uygulanmaması riski var. Gelecekte biri değiştirilip diğeri unutulursa sessiz şema tutarsızlığına yol açabilir.

**Öneri:** L817-L842 arasındaki ikinci `records` ve `record_fields` CREATE/INDEX bloğunu kaldırmak.

---

### 1.2 `db.ts` — `tenantInitPromises` Race Condition

**Dosya:** [`db.ts`](file:///c:/Users/murat/Desktop/iiotplatform/server/utils/db.ts)  
**Satırlar:** L103-L239

`getTenantRefs` fonksiyonunda `tenantInitPromises` Map'e set edilme zamanlaması hatalı. Promise oluşturulup çalıştırılıyor (L115'te IIFE başlıyor), ardından L237'de Map'e ekleniyor. Ancak IIFE anında çalışmaya başladığı için, ikinci bir istek geldiğinde L111 kontrolünde Map henüz set edilmemiş olabilir → **aynı tenant için çift init** tetiklenebilir.

```
// Sorunlu sıralama:
const initPromise = (async () => { ... })(); // Anında çalışmaya başlar
tenantInitPromises.set(tenantSlug, initPromise); // Bu satır SONRA çalışır
```

**Risk:** Aynı tenant için eşzamanlı iki istek geldiğinde, iki ayrı SQLite bağlantısı ve iki ayrı DuckDB instance'ı oluşabilir. Bu WAL kilit çatışmasına (SQLITE_BUSY) veya DuckDB "Connection Error" döngüsüne yol açabilir.

**Öneri:** `tenantInitPromises.set()` çağrısını `initPromise` IIFE tanımından **hemen sonra**, yani IIFE'nin body'sine girmeden **önce** yapmak. (L237'yi L116'ya taşımak.)

---

### 1.3 `sandbox.ts` — Ephemeral DB Variable Shadowing

**Dosya:** [`sandbox.ts`](file:///c:/Users/murat/Desktop/iiotplatform/server/utils/sandbox.ts)  
**Satırlar:** L169 ve L200

`ephemeralTelemetryDb` değişkeni iki kez tanımlanıyor:
- L169: `let ephemeralTelemetryDb: any = null;` (outer scope, try-catch dışı)
- L200: `let ephemeralTelemetryDb: any = null;` (inner scope, try bloğu içinde)

Inner scope değişkeni outer scope'u gölgeliyor (variable shadowing). Sonuç olarak:
- L469'daki `if (ephemeralTelemetryDb && ...)` kontrolü **her zaman outer scope'taki null'a** bakıyor
- L489'daki catch bloğundaki cleanup da aynı şekilde **outer null'a** bakıyor
- **Gerçek ephemeral DB bağlantısı (inner scope) hiçbir zaman kapatılmıyor** → DuckDB connection leak

**Risk:** Her sandbox çalışmasında (özellikle `telemetryDb` kullanıldığında) kalıcı bir DuckDB bağlantısı açılıp kapanmıyor. Yoğun telemetri sandbox işlemlerinde DuckDB "too many open connections" hatası alınabilir.

**Öneri:** L200'deki ikinci `let` tanımını kaldırıp, L169'daki outer scope değişkenini kullanmak.

---

## 2. ORTA SEVİYE SORUNLAR

### 2.1 `worker.js` — `worker.js` doğrudan SQLite açıyor ama WITH/PRAGMA/RETURNING sorguları eksik

**Dosya:** [`worker.js`](file:///c:/Users/murat/Desktop/iiotplatform/server/utils/worker.js)  
**Satırlar:** L128-L138

Worker process'teki `sql.unsafe` fonksiyonu sadece `startsWith('SELECT')` kontrolü yapıyor. Ancak `db.ts`'teki ana implementasyonda `WITH`, `PRAGMA` ve `RETURNING` içeren sorgular da SELECT gibi işleniyor (L489-L490). Worker'daki basit kontrol bu sorguları yanlış kategoride çalıştırır:
- `WITH ... AS SELECT ...` → `stmt.run()` ile çalıştırılır (sonuç dönmez)
- `INSERT ... RETURNING id` → `stmt.run()` ile çalıştırılır (veri yerine `{ changes }` döner)

**Risk:** Worker (daemon) kodunda `WITH` CTE'leri veya `RETURNING` kullanıldığında sessiz veri kaybı veya hatalı dönüş tipi.

**Öneri:** Worker'daki `isSelect` kontrolünü `db.ts`'teki gibi genişletmek: `startsWith('WITH') || startsWith('PRAGMA') || includes('RETURNING')`.

---

### 2.2 `workerManager.ts` — `stopAllDaemonWorkers` Tenant Slug Parsing Bug

**Dosya:** [`workerManager.ts`](file:///c:/Users/murat/Desktop/iiotplatform/server/utils/workerManager.ts)  
**Satırlar:** L461-L471

`stopAllDaemonWorkers` fonksiyonu `workerId.split('_')` ile tenant slug ve id'yi ayırıyor. Ancak workerId formatı `{tenantSlug}_{id}` ve tenant slug'ın kendisi alt çizgi (`_`) içerebilir (örn: `my_tenant_5`). Bu durumda `parts[0]` yalnızca `my` olur, `parts[1]` ise `tenant` olur → **yanlış tenant ve yanlış id** ile durdurma girişimi yapılır.

Aynı sorun `stopAllTenantWorkers` (L473-L491) fonksiyonunda da var.

**Risk:** Alt çizgi içeren tenant slug'larla daemon yönetimi tamamen bozulur.

**Öneri:** `workerId` formatını `{tenantSlug}::{id}` gibi çakışmayan bir ayırıcıya değiştirmek veya ayrı bir `Map<workerId, { tenantSlug, id }>` lookup tablosu tutmak.

---

### 2.3 `recordManager.ts` — `updateRecord` Password Restore `= ANY($2)` Sözdizimi SQLite'ta Hatalı

**Dosya:** [`recordManager.ts`](file:///c:/Users/murat/Desktop/iiotplatform/server/utils/recordManager.ts)  
**Satır:** L322

```typescript
const oldFields = await sql.unsafe(
  `SELECT key, val_str FROM record_fields WHERE record_id = $1 AND key = ANY($2)`, 
  [id, keysToRestore]
);
```

`= ANY($2)` PostgreSQL söz dizimidir. `sqlTranspiler.ts` bu kalıbı `IN (...)` formatına çevirebilmek için `col = ANY($N)` pattern'ini bekliyor, ancak burada `key = ANY($2)` şeklinde yazılmış. Transpiler regex'i (`\b(\w+(?:\.\w+)?)\s*=\s*ANY\(`) bunu match etmeli ama sadece `\w+` yani alfanumerik karakter kabul ediyor — `key` kelimesi alfanumerik olduğu için transpile çalışacaktır.

**Ancak:** `keysToRestore` boş bir dizi olduğunda `IN ()` syntax hatası oluşur. Transpiler boş dizileri `1=0` olarak dönüştürüyor (L42-43) — bu doğru. Yine de, `keysToRestore.length > 0` koşulu (L321) sayesinde boş dizi iletilmiyor. **Mevcut durumda çalışıyor fakat kırılgan.**

**Öneri:** Yine de explicit güvenlik için `keysToRestore.length > 0` kontrolünden sonra `oldFields` sorgusunu yapmak (mevcut hali böyle). Sorun yok ama not düşülmeli.

---

### 2.4 Büyük Kod Tekrarı — DuckDB Sonuç Mapping

**Dosyalar:** [`db.ts`](file:///c:/Users/murat/Desktop/iiotplatform/server/utils/db.ts)  
**Satırlar:** L331-L344, L381-L398, L422-L438

`createEphemeralTelemetryDB`, `useTelemetryDB` (template literal) ve `useTelemetryDB.unsafe` fonksiyonlarında aynı row mapping kodu (bigint → number, JSON.parse denemesi) **üç kez** tekrar ediyor. `useDB._internalExecute` içinde de aynı pattern var (L495-L504).

**Risk:** Bu dört yerdeki mapping mantığından birinde yapılacak bir düzeltme, diğer üçüne uygulanmazsa veri tutarsızlığı oluşur.

**Öneri:** Ortak bir `mapDuckDbRow(row)` helper fonksiyonu çıkarmak.

---

### 2.5 `utilsCache.ts` — `compileUtility` Güvenlik Blacklist Yetersiz

**Dosya:** [`utilsCache.ts`](file:///c:/Users/murat/Desktop/iiotplatform/server/utils/utilsCache.ts)  
**Satırlar:** L122-L129

```typescript
const forbidden = ['eval', 'Function', 'globalThis', 'global', 'import'];
```

`import` kelimesi `\bimport\b` regex'i ile aranıyor. Ancak `vm.runInNewContext` zaten izole bir context'te çalışıyor ve bu blacklist kolayca bypass edilebilir (ör: `const e = this.constructor.constructor`). **AGENTS.md kurallarına göre bu bir "vulnerability" değil (single-admin ortam),** ancak dinamik util kodunun kazara global scope'u kirletmesini önlemek için `vm.runInNewContext(wrappedCall, {})` boş sandbox kullanılıyor — bu yeterli.

**Not:** `vm.runInNewContext` ile boş sandbox geçilmesi, `require` veya `process` gibi global'lere erişimi zaten engelliyor. Blacklist fazlalık ama zararsız.

---

### 2.6 `duckdb-appender.ts` — Hata Sonrası Buffer Geri Ekleme (unshift) Sıralama Sorunu

**Dosya:** [`duckdb-appender.ts`](file:///c:/Users/murat/Desktop/iiotplatform/server/utils/duckdb-appender.ts)  
**Satırlar:** L70-L72

```typescript
if (this.buffer.length < 5000) {
   this.buffer.unshift(...batch);
}
```

Hata durumunda batch başa ekleniyor. Eğer `batch` büyükse (500 eleman) `unshift(...batch)` spread operatörü call stack'i patlatabilir (stack overflow). V8'de spread argüman limiti ~65.000 civarıdır, dolayısıyla 500 elemanla patlama riski düşük ama yine de `this.buffer = [...batch, ...this.buffer]` daha güvenli bir seçenek.

**Risk:** Düşük. Pratikte 500 elemanla sorun olmaz.

---

## 3. POTANSİYEL RUNTİME HATALARI

### 3.1 `aedes.ts` — MQTT Auth'ta Tüm Tenant'ları Sequential Tarama

**Dosya:** [`aedes.ts`](file:///c:/Users/murat/Desktop/iiotplatform/server/plugins/aedes.ts)  
**Satırlar:** L56-L93

Her MQTT `authenticate` çağrısında **tüm aktif tenant'lar** sequential olarak taranıyor ve her biri için `useDB(t.slug)` çağrılıp sorgu yapılıyor. 50+ tenant'ta bu operasyon yavaşlayabilir ve `aedes.authenticate` callback'i bloklayabilir.

**Risk:** Çok sayıda tenant'ta MQTT bağlantı kurulumu yavaşlar; timeout durumunda cihaz bağlanamaz.

**Öneri:** MQTT username formatına tenant bilgisi eklemek (ör: `tenantSlug/deviceId`) veya global bir device lookup cache'i tutmak.

---

### 3.2 `codeValidator.ts` — `handleValidationError` Yanlış Tenant Slug Path

**Dosya:** [`codeValidator.ts`](file:///c:/Users/murat/Desktop/iiotplatform/server/utils/codeValidator.ts)  
**Satır:** L198

```typescript
const tenantSlug = event.context?.tenant?.slug || 'master';
```

Tüm projede tenant slug `event.context.tenantSlug` olarak set ediliyor (`00.tenant.ts` middleware'i). Ancak burada `event.context?.tenant?.slug` kullanılmış. Bu property hiçbir zaman set edilmiyor → **her zaman `'master'` olarak fallback eder.**

**Risk:** Tenant-spesifik i18n çevirileri yerine her zaman master tenant çevirileri döner (validation hata mesajlarında).

**Öneri:** `event.context?.tenantSlug || 'master'` olarak düzeltmek.

---

### 3.3 `rate-limit.ts` — `getRequestURL` Performans Sorunu

**Dosya:** [`rate-limit.ts`](file:///c:/Users/murat/Desktop/iiotplatform/server/middleware/rate-limit.ts)  
**Satır:** L11

```typescript
const pathname = getRequestURL(event).pathname || '';
```

`03.endpoints.ts` dosyasında açıkça belirtilmiş: _"Yüksek performanslı path ayıklama (getRequestURL(event) yavaş olduğu için kaldırıldı)"_ (L15 yorumu). Ancak rate-limit middleware'i hâlâ `getRequestURL(event)` kullanıyor.

**Risk:** Her HTTP isteğinde gereksiz URL parsing overhead'i.

**Öneri:** `event.node.req.url` kullanarak manual pathname çıkarma yapmak (endpoints middleware'deki gibi).

---

### 3.4 `02.authorize.ts` — `toPatternRegex` ve `endpointManager.compileRoutePattern` Duplicate Logic

**Dosyalar:**
- [`02.authorize.ts`](file:///c:/Users/murat/Desktop/iiotplatform/server/middleware/02.authorize.ts) (L10-L19)
- [`endpointManager.ts`](file:///c:/Users/murat/Desktop/iiotplatform/server/utils/endpointManager.ts) (L10-L49)

İki farklı route pattern regex derleyicisi var. `endpointManager.compileRoutePattern` daha gelişmiş (catch-all wildcard, named params). `02.authorize.ts`'teki `toPatternRegex` daha basit ve farklı bir regex üretir. Aynı endpoint için iki farklı regex sonucu üretirse, authorize başarılı ama endpoint eşleşmesi başarısız olabilir (veya tersi).

**Risk:** Orta. Mevcut kodda `02.authorize.ts`'teki regex sadece `is_public` kontrolü için kullanılıyor; eşleşme tutarsızlığı durumunda public endpoint'e auth zorunlu olabilir.

**Öneri:** `02.authorize.ts`'in de `endpointManager`'daki derlenmiş regex'leri kullanması (zaten `getActiveEndpoints` çağrısıyla bunları çekiyor, L68-L73).

---

### 3.5 `nuxt.config.ts` — Gereksiz "trigger restart" Yorumları

**Dosya:** [`nuxt.config.ts`](file:///c:/Users/murat/Desktop/iiotplatform/nuxt.config.ts)  
**Satırlar:** L147-L165

10 adet `// trigger restart` yorumu. HMR tetiklemek için eklenen geçici yorum satırları temizlenmemiş.

**Risk:** Yok (görsel kirlilik).

---

## 4. FRONTEND (app/) SORUNLARI

### 4.1 `app/layouts/default.vue.bak` ve `app/middleware/auth.global.ts.bak` — Backup Dosyaları

**Dosyalar:**
- [`default.vue.bak`](file:///c:/Users/murat/Desktop/iiotplatform/app/layouts/default.vue.bak)
- [`auth.global.ts.bak`](file:///c:/Users/murat/Desktop/iiotplatform/app/middleware/auth.global.ts.bak)

`.bak` uzantılı dosyalar dizinde bırakılmış. Git olmadığı için versiyon kontrolü yapılamıyor.

**Öneri:** `.agents/backups/` dizinine taşımak veya silmek.

---

### 4.2 `DynamicRenderer.vue` — CSS Scoping Regex Kırılganlığı

**Dosya:** [`DynamicRenderer.vue`](file:///c:/Users/murat/Desktop/iiotplatform/app/components/DynamicRenderer.vue)  
**Satırlar:** L67-L79

`scopeCss` fonksiyonundaki regex `@media`, `@keyframes` gibi at-rule'ları bypass ediyor ama iç içe at-rule'larda (nested `@media` içindeki selector'lar) çalışmayabilir.

```typescript
if (trimmed.startsWith('@') || trimmed.startsWith(':root') || trimmed.match(/^(\d+%|from|to)$/i)) return trimmed;
```

**Risk:** Dinamik sayfa CSS'lerinde `@media` sorguları içindeki selector'lar yanlış scope'lanabilir → bozuk görünüm.

**Öneri:** Düşük öncelikli. Sorun kullanıcı tarafından fark edildiğinde düzeltilir.

---

### 4.3 `useWS.ts` — Reconnect Timer Leak Potansiyeli

**Dosya:** [`useWS.ts`](file:///c:/Users/murat/Desktop/iiotplatform/app/composables/useWS.ts)  
**Satırlar:** L34-L48

`onclose` event handler'ında `reconnectTimer` set ediliyor. Eğer WebSocket hızlı hızlı açılıp kapanırsa (ör: sunucu instabil) eski timer temizlenmeden yeni timer set edilebilir.

```typescript
ws.value.onclose = (event) => {
  // ...
  reconnectTimer = setTimeout(connect, timeout); // Eski timer üzerine yazılıyor
};
```

**Risk:** Düşük — sadece çok hızlı bağlantı kopmalarında birden fazla eşzamanlı `connect()` çağrısı olabilir.

**Öneri:** `reconnectTimer = setTimeout(...)` öncesinde `if (reconnectTimer) clearTimeout(reconnectTimer);` eklemek.

---

## 5. `.agents/` DİZİNİ

### 5.1 `.agents/backups/` — Boş Dizin

Backup dizini oluşturulmuş ama içi boş. `.bak` dosyaları `app/` dizininde kalmış (bkz. 4.1).

### 5.2 `AGENTS.md` — Bozuk Karakter

**Dosya:** [`AGENTS.md`](file:///c:/Users/murat/Desktop/iiotplatform/.agents/AGENTS.md)  
**Satır:** L54

```
deneme yan�lma
```

Karakter encoding sorunu. `ı` harfi bozulmuş (muhtemelen UTF-8 → ANSI dönüşüm hatası).

---

## 6. KOD KALİTESİ / GENEL GÖZLEMLER

| Gözlem | Dosya | Detay |
|---|---|---|
| `any` tip kullanımı yaygın | `db.ts`, `sandbox.ts`, `recordManager.ts` | TypeScript strict mode'da `any` yerine spesifik tipler tercih edilmeli |
| Türkçe + İngilizce karışık loglama | Tüm server/ | `console.log` mesajları tutarsız dilde |
| `server.js` kök dizinde | [`server.js`](file:///c:/Users/murat/Desktop/iiotplatform/server.js) (14KB) | Standalone production entry point, konfigürasyon dosyasıyla karıştırılabilir |
| `scratch_console.log` kök dizinde | Proje kökü | Debug/test artığı dosya |
| `repomix-output.xml` (2.1MB) | Proje kökü | Büyük geçici dosya; `.gitignore` olmadığı için deploy paketine girmemeli |

---

## 7. ÖNCELİK SIRASI (Önerilen Aksiyon Planı)

| # | Sorun | Öncelik | Tahmini Etki |
|---|---|---|---|
| 1 | **1.3** Sandbox ephemeral DB leak | 🔴 Kritik | DuckDB connection sızıntısı |
| 2 | **1.2** Tenant init race condition | 🔴 Kritik | Çift SQLite/DuckDB instance |
| 3 | **3.2** `handleValidationError` yanlış tenant path | 🟡 Orta | Yanlış çeviri dönüşü |
| 4 | **2.1** Worker.js SELECT kontrol eksikliği | 🟡 Orta | WITH/RETURNING sorgularında veri kaybı |
| 5 | **2.2** WorkerId parsing bug | 🟡 Orta | Alt çizgili tenant'larda daemon bozulması |
| 6 | **1.1** Duplicate CREATE TABLE | 🟢 Düşük | Bakım zorluğu |
| 7 | **3.3** Rate-limit performans | 🟢 Düşük | Gereksiz overhead |
| 8 | **2.4** DuckDB mapping tekrarı | 🟢 Düşük | Bakım riski |

---

*Bu rapor yalnızca mevcut kod incelemesine dayalıdır. Hiçbir dosya değiştirilmemiştir.*
