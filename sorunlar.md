# Tespit Edilen Sorunlar

Bu belge `app/` ve `server/` dizinlerinin derinlemesine incelenmesi sonucu tespit edilen mimari ve implementasyon sorunlarını içermektedir. Çözüm önerisi yoktur, yalnızca tespit vardır.

---

## 1. SERVER / UTILS

### 1.1 db.ts — Veritabanı Katmanı

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S1 | db.ts | ~180-250 | `transpileQueryAndParams` fonksiyonu PostgreSQL sözdizimini (`$1`, `= ANY($1)`) SQLite'a çeviriyor. Regex tabanlı bu çeviri, string literal içindeki `$1` veya `ANY(...)` ifadelerini gerçek parametrelerden ayırt edemeyebilir. String literal koruma mekanizması var (`__STR_LITERAL_`) ama nested quote (`''`) gibi edge case'lerde hata riski mevcut. |
| S2 | db.ts | ~310-380 | `executeWithLock` mekanizması, promise zincirleme ile sıralı kuyruk oluşturuyor. Yüksek eşzamanlılıkta (çok sayıda eşzamanlı yazma isteği) bu kuyruk uzayabilir ve zaman aşımları tetikleyebilir. Timeout mekanizması var ama kuyrukta biriken görevler bellekte birikir. |
| S3 | db.ts | tüm dosya | `useDB` fonksiyonu `better-sqlite3` bağlantılarını `Map` içinde tutuyor. Çok sayıda tenant oluşturulursa veya bazı tenantlar silinirse bu bağlantılar kapatılmadan bellekte kalır. `closeDatabases` yalnızca shutdown'da çağrılıyor; tenant silme veya deaktive etme durumunda tek bir tenant'ın bağlantısını kapatan bir mekanizma yok. |
| S4 | db.ts | ~550-600 | DuckDB bağlantısı `duckdb` npm paketinin callback-tabanlı API'si ile kullanılıyor. `getTenantRefs` her çağrıda tenant'ın DuckDB'sine erişim sağlıyor ama DuckDB bağlantısı (`conn`) hata durumunda (`EBUSY`, dosya kilidi vs.) otomatik olarak yeniden oluşturulmuyor. |
| S5 | db.ts | ~700-800 | `initTenantDb` fonksiyonu schema migration işlemlerini sırayla çalıştırıyor (`ALTER TABLE ADD COLUMN IF NOT EXISTS` ile). SQLite'da `ADD COLUMN IF NOT EXISTS` sözdizimi desteklenmiyor (SQLite 3.35.0+ gerekli). Desteklenmeyen sürümlerde sessizce hata verebilir. |
| S6 | db.ts | ~820 | `TenantEventManager` bir `EventEmitter`. `setMaxListeners` çağrılmamış. Çok sayıda modül bu emitter'a listener eklerse `MaxListenersExceededWarning` oluşabilir. |
| S7 | db.ts | tüm dosya | `sql.unsafe()` metodu raw SQL çalıştırırken parametre placeholder'ı olarak hem `$1` hem `?` hem de tagged template literal destekleniyor. Bu üç farklı kullanım biçimi kod genelinde tutarsız kullanılıyor ve transpiler'ın hangi formatta çalıştığını takip etmeyi zorlaştırıyor. |

### 1.2 workerManager.ts — Worker Yönetimi

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S8 | workerManager.ts | tüm | `child_process.fork` ile başlatılan worker süreçleri `--max-old-space-size=50` ile sınırlandırılmış. Bu sınır çok düşük olabilir; özellikle `better-sqlite3` kullanan daemon worker'lar için SQLite bağlantısının kendisi bile önemli miktarda bellek tüketir. |
| S9 | workerManager.ts | ~200-300 | Cron worker'lar `setInterval` ile periyodik olarak kontrol ediliyor. Her tetiklemede tüm tenantlar üzerinde döngü yapılıyor ve her tenant'ın workers tablosu sorgulanıyor. Tenant sayısı arttıkça bu döngünün süresi uzar. |
| S10 | workerManager.ts | ~400-500 | RPC handler'lar (`rpc_handlers`) içinde `db.query` ve `db.unsafe` çağrıları var. Worker process'ten ana process'e RPC üzerinden DB sorgusu yapılması, worker'ın kendi SQLite bağlantısı varken gereksiz bir overhead oluşturur. Worker.js dosyasında zaten yerel SQLite bağlantısı var ama bazı durumlarda (DuckDB, push bildirimi vs.) RPC zorunlu. |
| S11 | workerManager.ts | ~600 | `stopDaemonWorker` fonksiyonunda worker sürecine `SIGTERM` sinyali gönderiliyor ve 10 saniye bekleniyor. Bu sürede worker kapanmazsa `SIGKILL` gönderiliyor. Ancak Windows'ta `SIGTERM` ve `SIGKILL` davranışları farklıdır; Windows'ta `process.kill(pid, 'SIGTERM')` süreci doğrudan sonlandırır. |
| S12 | workerManager.ts | tüm | Daemon worker'ların yeniden başlatma (restart) mantığı var ama crash loop koruması yok. Bir daemon sürekli hata verip kapanırsa, sonsuz yeniden başlatma döngüsüne girebilir. |

### 1.3 sandbox.ts — Sandbox Kod Çalıştırma

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S13 | sandbox.ts | ~100 | `vm.createContext` ile oluşturulan sandbox context'ine `fetch`, `Buffer`, `crypto`, `bcrypt` gibi güçlü modüller doğrudan enjekte ediliyor. Sandbox kodu `fetch` ile dış ağ istekleri yapabilir. |
| S14 | sandbox.ts | ~200 | `runInContext` için `timeout: 10000` (10 saniye) ayarlanmış. Bu timeout yalnızca senkron döngüleri kesiyor; `async/await` veya `setTimeout` tabanlı asenkron kodlar bu timeout'tan etkilenmiyor. Asenkron sonsuz döngü (`while(true) { await sleep(1) }`) sandbox'ı sonsuza kadar meşgul edebilir. |
| S15 | sandbox.ts | ~300 | Sandbox içindeki `require` fonksiyonu custom bir wrapper ama `node:fs`, `node:child_process` gibi modüllere erişimi engelleyen bir whitelist mekanizması yok. `pluginsDir` ve `baseRequire` üzerinden herhangi bir npm paketi yüklenebilir. |
| S16 | sandbox.ts | ~150 | `export default` ile başlayan kodlar regex ile dönüştürülüyor. Bu dönüşüm string literal içindeki `export default` ifadelerini de etkileyebilir. |

### 1.4 mqtt.ts — MQTT Mesaj İşleme

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S17 | mqtt.ts | ~50-80 | `handleMqttMessage` fonksiyonu gelen MQTT mesajlarını sırayla işliyor. Yüksek mesaj trafiğinde (binlerce cihaz) tek thread üzerinde sıralı işlem darboğaz oluşturabilir. |
| S18 | mqtt.ts | ~100 | HMAC doğrulaması `MQTT_HMAC_SECRET` sistem değişkenine bağlı. Bu değişken ayarlanmamışsa HMAC kontrolü tamamen atlanıyor. Varsayılan davranışın güvenli mi yoksa açık mı olduğu bağlam dışında net değil. |
| S19 | mqtt.ts | ~180 | Telemetri verisi önce `validateTelemetry` ile doğrulanıyor, sonra `appendTelemetry` ile buffer'a ekleniyor. `appendTelemetry` işlemi asenkron ama hata durumunda mesaj kaybı olabilir (buffer'a yazılıp DuckDB'ye flush edilemezse). Bu durum `duckdb-appender.ts`'deki spill-to-disk mekanizması ile kısmen ele alınmış. |
| S20 | mqtt.ts | ~200 | Sandbox kodu tetikleme (`runCustomCode`) her gelen MQTT mesajı için çağrılıyor. Yüksek frekanslı cihaz verilerinde her mesaj için sandbox context oluşturma ve kod çalıştırma ciddi CPU yükü yaratır. |

### 1.5 duckdb-appender.ts — Telemetri Buffer

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S21 | duckdb-appender.ts | 56 | DuckDB'ye toplu yazma işlemi callback-tabanlı `db.run()` ile yapılıyor. Eğer DuckDB bağlantısı (`refs.duckDbConn`) null ise veya bağlantı kopmuşsa, `db!.run(...)` ifadesi `TypeError` fırlatır. Non-null assertion (`!`) kullanılması riskli. |
| S22 | duckdb-appender.ts | 65-81 | Spill-to-disk mekanizması `fs.appendFileSync` kullanıyor (senkron dosya yazma). Yüksek trafikte bu senkron işlem event loop'u bloke edebilir. |
| S23 | duckdb-appender.ts | 26 | `flushTimer` tek bir global timer. Birden fazla tenant'ın buffer'ı eşzamanlı dolmaya başlarsa, timer yalnızca bir kez tetiklenir ve ilk tenant flush edilirken diğerleri bekler. |

### 1.6 worker.js — Worker Process Script

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S24 | worker.js | 30-65 | Worker kendi `transpileQueryAndParams` fonksiyonunu içeriyor. Bu, `db.ts`'deki transpiler'ın bir kopyası. İki kopya arasında senkronizasyon yok; birindeki bug fix diğerine yansımaz. |
| S25 | worker.js | 141-148 | Worker process kendi `better-sqlite3` bağlantısını açıyor. Ana process'teki `executeWithLock` mekanizması bu bağlantıyı kapsamaz. Worker'ın SQLite yazma işlemleri ile ana process'in yazma işlemleri arasında WAL modu sayesinde çakışma olmaması bekleniyor, ama `busy_timeout` yalnızca 5000ms; yoğun yazma senaryolarında `SQLITE_BUSY` hataları oluşabilir. |
| S26 | worker.js | 175 | `sql.begin` (transaction) desteklenmiyor (`throw new Error`). Worker kodları transaction kullanamıyor, bu da çoklu yazma işlemlerinin atomik olmayacağı anlamına gelir. |
| S27 | worker.js | 194 | Worker context'ine `process` objesi doğrudan enjekte ediliyor. Sandbox kodu `process.exit()`, `process.env` veya `process.kill()` gibi çağrılar yapabilir. |
| S28 | worker.js | 236 | Daemon worker'lar için `vm.Script.runInContext` çağrısında herhangi bir timeout yok. Senkron sonsuz döngü (`while(true) {}`) daemon worker'ı kalıcı olarak dondurur ve fork edilmiş process sonsuza kadar CPU tüketir. |

### 1.7 recordManager.ts — Kayıt Yönetimi

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S29 | recordManager.ts | 66 | `whereClause` oluşturulurken field key (`k`) doğrudan SQL string'ine interpolasyon ile ekleniyor: `rf_custom.key = '${k}'`. Bu değer query parametrelerinden geliyor (`query` objesi). `parsedSchema` kontrolü var ama `parsedSchema[k]` kontrolü geçtikten sonra `k` değeri hala ham string olarak SQL'e gömülüyor. |
| S30 | recordManager.ts | 97 | `sortBy` parametresi regex ile doğrulandıktan sonra (`/^[\p{L}0-9_ \.\-]+$/u`) doğrudan SQL'e ekleniyor: `rf_sort.key = '${sortBy}'`. Bu regex Unicode harflerine izin verdiği için bazı özel karakterlerle bypass riski düşük ama sıfır değil. |
| S31 | recordManager.ts | 202, 343 | `BEGIN TRANSACTION` ve `COMMIT`/`ROLLBACK` işlemleri `sql.unsafe()` ile yapılıyor. `better-sqlite3`'ün `.transaction()` API'si yerine raw SQL kullanılması, nested transaction veya WAL modu ile etkileşim sorunlarına yol açabilir. |
| S32 | recordManager.ts | 216-229 | Record oluşturmada her alan (field) için ayrı bir `INSERT INTO record_fields` sorgusu çalıştırılıyor. 20 alanlı bir entity için bu 20 ayrı INSERT demek. Toplu insert (batch insert) kullanılmıyor. |
| S33 | recordManager.ts | 357 | Record güncellemede (updateRecord) önce tüm field'lar siliniyor (`DELETE FROM record_fields WHERE record_id = $1`) sonra yeniden ekleniyor. Bu "delete-all-then-reinsert" yaklaşımı atomiklik açısından sorunlu olabilir (transaction içinde olsa da WAL modu altında). |
| S34 | recordManager.ts | 307 | Password field'larda `= ANY($2)` sözdizimi kullanılıyor. Bu PostgreSQL sözdizimi, SQLite transpiler tarafından çevrilmesi gereken bir ifade. Transpiler hata yaparsa password restore işlemi sessizce başarısız olur. |
| S35 | recordManager.ts | 444-476 | `bulkImportRecords` her kayıt için `createRecord` fonksiyonunu çağırıyor (sıralı). 10.000 kayıtlık bir import, 10.000 ayrı transaction açıp kapatır. Toplu import performansı çok düşük olacaktır. |

### 1.8 recordValidator.ts — Kayıt Doğrulama

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S36 | recordValidator.ts | 134 | `regex` kuralında kullanıcının sağladığı değer doğrudan `new RegExp(val)` ile derleniyor. Geçersiz veya çok karmaşık regex desenleri `ReDOS` riski taşır veya `SyntaxError` fırlatabilir. `try/catch` yok. |
| S37 | recordValidator.ts | 60-65 | Tarih hesaplamalarında ay (`m`) 30 gün, yıl (`y`) 365 gün olarak sabitlenmiş. Artık yıl ve farklı ay uzunlukları dikkate alınmıyor. |

### 1.9 filterEngine.ts — Filtre Motoru

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S38 | filterEngine.ts | 64 | `safeField` değişkeni yalnızca tek tırnak escape'i yapıyor (`field.replace(/'/g, "''")`). Field adı SQL injection için gerekli diğer karakterleri (`--`, `;`, `/*`) içerebilir ve bunlar EAV subquery'si içinde doğrudan kullanılıyor. |
| S39 | filterEngine.ts | 70-71 | EAV subquery oluştururken `'${safeField}'` ifadesi parametre yerine doğrudan string interpolasyonu olarak kullanılıyor. Bu field adını SQL'e gömüyor. |
| S40 | filterEngine.ts | tüm | `processCondition` özyinelemeli (recursive) bir fonksiyon. Çok derin iç içe filter grupları stack overflow'a yol açabilir. Derinlik sınırı yok. |

### 1.10 endpointManager.ts — Endpoint Cache

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S41 | endpointManager.ts | 82 | `CACHE_TTL` 60 saniye. Bir endpoint güncellendiğinde `invalidateEndpointCache` çağrılmadığı sürece 60 saniye boyunca eski kod çalışır. Endpoint güncelleme API'sinin cache invalidation çağırıp çağırmadığı bu dosyadan anlaşılmıyor. |
| S42 | endpointManager.ts | 107 | `rows.map` içinde her satır için `compileRoutePattern` çağrılıyor. Cache'e yazılırken derlenmiş regex (`RegExp`) nesneleri saklanıyor. Çok sayıda endpoint tanımlanırsa bellek tüketimi artar ama TTL ile sınırlı. |

### 1.11 modbusQueue.ts — Modbus İletişim

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S43 | modbusQueue.ts | 149 | `connectionPool` global bir `Map` ve hiçbir zaman temizlenmiyor. Bağlantı idle timeout ile kapatılıyor ama `ModbusConnectionManager` nesnesi `Map`'ten hiç silinmiyor. Zamanla gereksiz nesneler birikir. |
| S44 | modbusQueue.ts | 70 | `this.client.connectTCP` çağrısı hata fırlatırsa (hedef cihaz kapalı, port erişilemez) tüm kuyruk reject ediliyor (`while (this.queue.length > 0)`). Kuyrukta biriken tüm görevler tek bir bağlantı hatası ile çöpe gidiyor. |
| S45 | modbusQueue.ts | 93-96 | `float32` ve `uint32` veri tiplerinde `data.buffer.readFloatBE(0)` kullanılıyor. Modbus RTU'da byte order (Big Endian vs Little Endian) cihaza göre değişebilir; sabit `BE` (Big Endian) varsayımı bazı cihazlarla uyumsuz olabilir. |

### 1.12 deviceCommands.ts — Cihaz Komut Yönetimi

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S46 | deviceCommands.ts | 16-25 | Komut deposu tamamen RAM'de (`Map`). Sunucu yeniden başlatılırsa tüm bekleyen komutlar kaybolur. |
| S47 | deviceCommands.ts | 72-83 | Her komut için ayrı bir `setTimeout` oluşturuluyor. Çok sayıda eşzamanlı komut gönderilirse (yüzlerce cihaza aynı anda) yüzlerce timer oluşur. Bu timer'lar bellekte birikir. |
| S48 | deviceCommands.ts | 105 | `setInterval(cleanupOldCommands, 15 * 60 * 1000)` modül yüklendiğinde çalışmaya başlıyor. Bu interval HMR (Hot Module Replacement) sırasında birden fazla kez oluşabilir ve temizlenmez. |

### 1.13 utilsCache.ts — Utility Derleme ve Cache

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S49 | utilsCache.ts | 122-128 | `compileUtility` fonksiyonundaki "forbidden globals" kontrolü regex tabanlı (`\beval\b` vs.). String literal içindeki kullanımları da yakalıyor (false positive): `const msg = "Don't use eval"` ifadesi reddedilir. |
| S50 | utilsCache.ts | 122 | Yasaklı kelime listesinde `import` var. Bu, `import()` dinamik import'u engellemeyi amaçlıyor ama `const x = "import"` gibi string kullanımlarını da engelliyor. |
| S51 | utilsCache.ts | 152, 175, 197 | `vm.runInNewContext` kullanılıyor. Bu, her derleme için yeni bir V8 context oluşturur. Çok sayıda utility derlenirse bellek tüketimi artar. Context'ler garbage collection'a bırakılıyor ama V8 context'leri yavaş toplanır. |
| S52 | utilsCache.ts | 218-220 | `scope` kısıtlamaları "v2'de" notu ile atlanmış. Scope doğrulaması hiç uygulanmıyor. |

### 1.14 codeValidator.ts — Kod Doğrulama

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S53 | codeValidator.ts | 39-44 | AST walker'da `ExpressionStatement > Identifier` pattern'i "bilinmeyen değişken" olarak raporlanıyor. Ancak bu, geçerli JavaScript olan `someFunction;` gibi ifadeleri de hatalı olarak işaretler. |
| S54 | codeValidator.ts | 87-117 | Template doğrulaması basit regex tabanlı tag eşleştirme yapıyor. Vue'nun `v-if`/`v-else` gibi directive'lerinden kaynaklanan koşullu tag yapılarını anlamıyor. Örneğin `<div v-if="x">` ve `<span v-else>` yapısı hata olarak algılanmaz ama iç içe geçmiş koşullu yapılar false positive üretebilir. |
| S55 | codeValidator.ts | 198 | `handleValidationError` içinde `event.context?.tenant?.slug` kullanılıyor ama diğer tüm middleware/handler'lar `event.context.tenantSlug` kullanıyor. Bu tutarsızlık, çevirinin her zaman 'master' tenant'tan gelmesine yol açabilir. |

### 1.15 wsManager.ts — WebSocket Yönetimi

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S56 | wsManager.ts | 56-93 | `publishWS` fonksiyonunda eğer ilk denemede hiçbir bağlantı bulunamazsa, 200ms, 500ms, 1000ms aralıklarla 3 kez yeniden deneniyor. Bu retry mekanizması her `publishWS` çağrısında toplam 1.7 saniye bekleyebilir. Yüksek frekanslı telemetri verilerinde bu retry'lar birbirine zincirlenir. |
| S57 | wsManager.ts | 22-44, 61-82 | Path eşleştirme mantığı (regex ile `:param` çözümleme) `publishWS` fonksiyonunda iki kez kopyalanmış (ilk deneme + retry döngüsü). DRY ihlali. |
| S58 | wsManager.ts | 16 | `import fs from 'node:fs'` import ediliyor ama hiçbir yerde kullanılmıyor. Ölü import. |

### 1.16 schemaMigration.ts — Schema Migration

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S59 | schemaMigration.ts | 10-78 | Migration işlemi tüm kayıtları belleğe yüklüyor (`SELECT id FROM records`), sonra her kayıt için tüm field'ları çekiyor, dönüştürüyor ve yeniden yazıyor. Çok sayıda kayıt varsa (örneğin 100.000) bu işlem büyük bellek tüketir ve çok uzun sürer. |
| S60 | schemaMigration.ts | 80-86 | `sql.transactionSync` metodu kontrol ediliyor ama bu metot `db.ts`'de tanımlı değilse fallback olarak sıralı `sql.unsafe` çağrıları yapılıyor. Transaction dışı çalışma durumunda kısmi migration riski var. |

### 1.17 relationDeletePolicy.ts — İlişkisel Silme

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S61 | relationDeletePolicy.ts | 109-150 | `deleteRecordWithRelationPolicy` özyinelemeli (recursive). Cascade silme politikası olan derin ilişki zincirlerinde stack overflow riski var. `visited` set'i döngüsel referansları engelliyor ama derinlik sınırı yok. |
| S62 | relationDeletePolicy.ts | 48-71 | `buildIncomingRelationPolicyMap` her silme işleminde tüm entity'lerin şemalarını çekiyor ve ilişki haritası oluşturuyor. Bu harita cache'lenmiyor; her tekil silme işleminde tam bir entity taraması yapılıyor. |

### 1.18 sysvars.ts — Sistem Değişkenleri

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S63 | sysvars.ts | 4 | `sysVarCache` Map'inin TTL'si yok. Cache yalnızca `invalidateSysVarCache` çağrıldığında temizleniyor. Sistem değişkeni veritabanından doğrudan güncellenirse (API dışı bir yolla) cache stale kalır. |
| S64 | sysvars.ts | 8-11 | Master cache invalidate edildiğinde `sysVarCache.clear()` tüm tenant'ların cache'ini de temizliyor. Çok sayıda tenant varsa bu toplu invalidation gereksiz DB sorgularına yol açar. |

### 1.19 push.ts — Push Bildirimleri

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S65 | push.ts | 48 | `broadcastPush` fonksiyonu tüm kullanıcıları LIKE sorgusuyla buluyor: `WHERE profile LIKE '%pushSubscriptions%'`. Bu sorgu her broadcast'te tam tablo taraması yapıyor. Index kullanılamıyor. |
| S66 | push.ts | 39 | Expired subscription temizliği sırasında `UPDATE users SET profile = ...` yapılıyor. Profile alanı JSON string olarak saklanıyor ve her güncelleme tüm profile'ı yeniden yazıyor. Concurrent erişimde race condition riski var (iki push aynı anda aynı kullanıcının profile'ını güncellerse biri diğerini ezebilir). |

### 1.20 tenantResolver.ts — Tenant Çözümleme

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S67 | tenantResolver.ts | 97-104 | `tenant_slug` cookie'si fallback olarak kullanılıyor. Login rotaları hariç tutulmuş ama başka public rotalar için cookie'deki stale tenant bilgisi yanıltıcı olabilir. |
| S68 | tenantResolver.ts | 84-92 | Subdomain tabanlı tenant çözümlemede `hostParts.length > 2` kontrolü var. `app.example.com` formatında subdomain `app` olarak algılanacak ama `www`, `app`, `api` hariç tutulmuş. Diğer yaygın subdomain'ler (ör. `mail`, `cdn`) hariç tutulmamış ve geçersiz tenant slug olarak değerlendirilecektir. |

---

## 2. SERVER / MIDDLEWARE

### 2.1 01.auth.ts — Kimlik Doğrulama

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S69 | 01.auth.ts | 27 | Statik dosya atlamada `reqUrl.includes('.')` kontrolü kullanılıyor. `.json` veya `.xml` uzantılı API endpoint'leri varsa bunlar da atlanacaktır (her ne kadar `/api/` hariç tutulmuş olsa da). |
| S70 | 01.auth.ts | 53-60 | Kullanıcı sorgusu `WHERE u.current_token = ${token}` ile yapılıyor. `current_token` sütununa index yoksa bu sorgu her istekte tam tablo taraması yapar. |
| S71 | 01.auth.ts | 62-85 | Tenant DB'de kullanıcı bulunamazsa master DB'de aranıyor. İki ayrı DB sorgusu (sıralı) yapılıyor. Bu double-lookup her istekte çalışıyor. |
| S72 | 01.auth.ts | 152 | `linked_records` her zaman boş dizi olarak dönüyor (`[]`). Bu alan hiçbir yerde doldurulmuyor ama client tarafında kullanılıyor olabilir. |
| S73 | 01.auth.ts | 156-161 | `/api/admin` kontrolü ve `/api/admin/tenants` kontrolü sırayla yapılıyor. `/api/admin/tenants` rotasına gelen bir istek önce `is_admin` kontrolünden geçiyor (satır 156-158), sonra `is_super_admin` kontrolüne takılıyor (satır 159-161). İlk kontrol geçse bile ikincisinde reddedilecek. Mantıksal olarak doğru ama gereksiz bir kontrol adımı. |

### 2.2 02.authorize.ts — Yetkilendirme

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S74 | 02.authorize.ts | 10-19 | `toPatternRegex` fonksiyonu regex oluşturuyor ama catch-all pattern'ler (`[...param]`) için kullanılan escape mantığı karmaşık ve hata potansiyeli yüksek. Özellikle `\\\[\\\.\\\.\\.[^\]]+\\\]` deseni okunması zor ve bakımı güç. |
| S75 | 02.authorize.ts | 66-75 | Public endpoint kontrolü için `getActiveEndpoints` çağrılıyor. Bu, her API isteğinde endpoint cache'ine erişim demek. Cache TTL'si (60 sn) süresi dolmuşsa DB sorgusu yapılacak. |
| S76 | 02.authorize.ts | 88-89 | `/api/admin/utils` rotası yalnızca "giriş yapmış kullanıcı" kontrolü yapıyor, admin kontrolü yok. Yani admin olmayan ama giriş yapmış bir kullanıcı dynamic utils endpoint'lerine erişebilir. |

### 2.3 03.endpoints.ts — Custom Endpoint Middleware

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S77 | 03.endpoints.ts | 24 | `pathname.includes('.')` kontrolü `.` içeren tüm yolları atlıyor. `/api/v2.0/data` gibi nokta içeren API yolları atlanacaktır. |
| S78 | 03.endpoints.ts | 30-45 | Bypass edilen core yollar hard-coded. Yeni bir core API rotası eklendiğinde bu listeye de eklenmesi gerekiyor; unutulursa custom endpoint kodu core rota yerine çalışabilir. |
| S79 | 03.endpoints.ts | 112-118 | Her eşleşen endpoint için `runCustomCode` çağrılıyor. Eğer birden fazla endpoint aynı pattern'e sahipse hepsi sırayla çalıştırılır. Performans etkisi belirsiz. |
| S80 | 03.endpoints.ts | 151 | Body mutasyonu: `(event as any)._requestBody = result.body`. Bu, H3'ün internal API'sine doğrudan müdahale. H3 versiyonu güncellendiğinde bu alan adı değişebilir ve mutasyon sessizce çalışmayı durdurur. |

### 2.4 rate-limit.ts — Hız Sınırlama

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S81 | rate-limit.ts | 11 | `getRequestURL(event)` kullanılıyor. `03.endpoints.ts`'deki yorumda `getRequestURL(event)` yavaş olduğu belirtilmiş ve orada `event.node.req.url` tercih edilmiş. Bu tutarsızlık performans farkı yaratır. |
| S82 | rate-limit.ts | 16 | Login dışı istekler için limit 1000 req/dakika (IP+tenant+userId başına). Bu limit oldukça yüksek. Normal API isteklerinin hız sınırlamasında etkisi düşük. |
| S83 | rate-limit.ts | tüm | Rate limit aşıldığında `return { error: ... }` ile yanıt dönülüyor ama `event.handled = true` veya benzeri bir mekanizma yok. H3 middleware zincirinde bu dönüşün sonraki middleware'leri engelleyip engellemediği belirsiz. |

---

## 3. SERVER / PLUGINS

### 3.1 aedes.ts — MQTT Broker

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S84 | aedes.ts | 53-87 | MQTT kimlik doğrulamasında tüm aktif tenantlar üzerinde döngü yapılıyor. Her bağlantı denemesinde `SELECT slug FROM tenants WHERE status = 'active'` sorgusu çalıştırılıyor ve her tenant için ayrı ayrı device ve admin kontrolü yapılıyor. Tenant sayısı arttıkça bu döngü yavaşlar. |
| S85 | aedes.ts | 63 | Device secret key'i plain text olarak karşılaştırılıyor (`device[0].secret_key === passStr`). Hash'lenmiş karşılaştırma yapılmıyor. |
| S86 | aedes.ts | 120-141 | `authorizePublish` içinde telemetry topic'ine yayın yapılırken payload JSON olarak parse edilip `deviceId` kontrol ediliyor. Ama `authorizePublish` hook'u zaten auth geçmiş bir client için çalışıyor. Client'ın kendi `__deviceId`'si yerine payload içindeki `deviceId` kontrol edilmesi, farklı bir cihaz adına veri gönderme (spoofing) riskini adresliyor ama aynı tenant içindeki başka kayıtlı cihazlar adına veri gönderilebilir. |
| S87 | aedes.ts | 181 | Subscribe ACL'de `commands/${username}` pattern'i regex ile kontrol ediliyor: `new RegExp('^commands/' + username + '(/.*)?$')`. `username` değeri regex'e doğrudan gömülüyor. Username'de regex özel karakterler (`.`, `*`, `+` vs.) varsa beklenmeyen eşleşmeler olabilir. |

### 3.2 init.ts — Sistem Başlatma

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S88 | init.ts | 34-37 | Cron worker interval'ı `(globalThis as any).__cronWorkerInterval` üzerinden temizleniyor. Bu ad `workerManager.ts`'deki ile eşleşmek zorunda (string coupling). |
| S89 | init.ts | 53-66 | MQTT cleanup'ta `(globalThis as any).__mqttClient`, `__mqttTimeoutInterval`, `__aedesBroker`, `__aedesApp` kontrol ediliyor. Bu globalThis property'leri birden fazla dosyada kullanılıyor ve aralarındaki bağımlılık yalnızca convention ile korunuyor. |
| S90 | init.ts | 88-89 | `process.on('SIGTERM')` ve `process.on('SIGINT')` handler'ları her HMR restart'ında yeniden ekleniyor. EventEmitter listener sızıntısı oluşabilir (her restart'ta bir listener daha eklenir). `close` hook'u ile temizlik yapılıyor ama signal handler'lar kaldırılmıyor. |

---

## 4. APP / PLUGINS

### 4.1 i18n.ts — Uluslararasılaştırma

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S91 | i18n.ts | 44 | `localStorage.getItem('app_locale')` SSR (Server-Side Rendering) sırasında çalışmaz. `import.meta.client` guard'ı var ama SSR'da varsayılan dil her zaman fallback olarak kalır. SSR ve client arasında dil uyumsuzluğu hydration mismatch'e yol açabilir. |
| S92 | i18n.ts | 63-66 | İlk yüklemede `currentLocale` ve `fallbackCode` için iki paralel `$fetch` çağrısı yapılıyor. Aynı dil ise ikinci çağrı `Promise.resolve({})` ile atlanıyor. Ama farklı dillerde iki HTTP isteği yapılıyor; ilk sayfa yükleme süresini etkiler. |
| S93 | i18n.ts | 113-127 | `syncVuetify` fonksiyonunda `vuetify.locale.messages.value` doğrudan mutate ediliyor ve sonra spread ile yeniden atanıyor. Bu, Vuetify'ın reactive sistemini zorlayan bir yaklaşım. |

### 4.2 auth.ts — Kimlik Doğrulama Plugin

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S94 | auth.ts | 5 | `useFetch('/api/auth/me', ...)` her sayfa değişiminde yeniden çalışmaz (Nuxt cache). Kullanıcı oturumu sunucu tarafında sona ererse client tarafındaki `user` state'i stale kalır. Proaktif session kontrolü veya token refresh mekanizması yok. |

### 4.3 toast.ts — Toast Bildirimleri

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S95 | toast.ts | 11-16 | `showToast` çağrıldığında önceki toast henüz gösterilmekteyken yeni toast onu ezer. Toast kuyruğu (queue) yok. Hızlı ardışık toast'lar kaybolur. |

---

## 5. APP / COMPOSABLES

### 5.1 useWS.ts — WebSocket

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S96 | useWS.ts | 16 | WebSocket bağlantısı her zaman `location.host` üzerinden kuruluyor. Tenant bazlı WebSocket bağlantılarında tenant bilgisi URL'e eklenmiyor. Tenant çözümlemesi cookie veya header üzerinden yapılıyor olmalı ama WebSocket handshake'inde custom header göndermek standart WebSocket API ile mümkün değil. |
| S97 | useWS.ts | 44 | Exponential backoff'ta maksimum timeout 10 saniye. `retryCount` üst sınırı yok; bağlantı hiçbir zaman kurulamazsa sonsuza kadar retry devam eder. |

### 5.2 useUtils.ts — Utility Yönetimi

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S98 | useUtils.ts | 13 | `utilCache` modül seviyesinde `ref` olarak tanımlı. Bu, tüm component instance'ları arasında paylaşılıyor (singleton). Bir component'in `loadUtilities` çağrısı diğerlerini de etkiler. |
| S99 | useUtils.ts | 49-50 | `execCache` fonksiyon kapanışında (closure) `Map` olarak tanımlı. Her `useUtils()` çağrısında yeni bir `execCache` oluşuyor. Bu, aynı utility'nin farklı component'lerde farklı cache'lenmesi demek. |
| S100 | useUtils.ts | 57 | `cacheKey` oluşturmada `JSON.stringify(args)` kullanılıyor. Argüman olarak circular referans veya DOM elemanı geçilirse `TypeError` fırlatır. |

---

## 6. APP / COMPONENTS

### 6.1 DynamicRenderer.vue — Dinamik Sayfa Render

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S101 | DynamicRenderer.vue | 489-498 | Dinamik bileşen kodu `Blob` + `URL.createObjectURL` + dynamic `import()` ile yükleniyor. Her render'da yeni bir blob URL oluşturuluyor. `URL.revokeObjectURL` `finally` bloğunda çağrılıyor ama import edilen modül belleğinde kalır (V8 module cache). |
| S102 | DynamicRenderer.vue | 449 | Kullanıcı script kodu `${finalScript}` olarak doğrudan template literal'e gömülüyor. Script kodu içinde backtick (`` ` ``) veya `${...}` ifadeleri varsa template literal'i kırabilir. |
| S103 | DynamicRenderer.vue | 66-77 | CSS scope mekanizması regex tabanlı. `@media`, `@keyframes`, `@font-face` gibi at-rule'lar kısmen ele alınmış ama karmaşık nested at-rule'lar (ör. `@supports` içinde `@media`) düzgün scope'lanmayabilir. |
| S104 | DynamicRenderer.vue | 296-315 | `TrackedResizeObserver`, `TrackedIntersectionObserver`, `TrackedMutationObserver` sınıfları `extends` ile oluşturuluyor ama `disconnect()` override edilmemiş. Manuel `disconnect()` çağrısı yapılırsa `activeObservers` set'inden kaldırılmaz ve cleanup sırasında zaten kapatılmış observer tekrar `disconnect()` edilir. |
| S105 | DynamicRenderer.vue | 398 | `customDefineProps` aslında `useAttrs()` döndürüyor. Gerçek Vue `defineProps` davranışından farklı; props type validation ve default değerleri desteklenmiyor. |
| S106 | DynamicRenderer.vue | 514 | Template'deki `$t(` ifadeleri `t(` ile, `$localize(` ifadeleri `localize(` ile değiştiriliyor (locale preview modu). Bu string replacement regex'siz basit `replace` ile yapılıyor ve JavaScript string literal'leri içindeki eşleşmeleri de değiştirir. |

### 6.2 CrudTable.vue, RecordsManager.vue

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S107 | Genel | - | Bu dosyalar büyük (CrudTable: 21KB, RecordsManager: 36KB). Component decomposition yapılmamış; tek bir dosyada tüm CRUD mantığı, UI, filtreleme, pagination ve diyalog yönetimi var. |

---

## 7. APP / MIDDLEWARE

### 7.1 auth.global.ts — Client Route Guard

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S108 | auth.global.ts | 11-20 | `toPatternRegex` fonksiyonu `02.authorize.ts`'deki ile neredeyse aynı ama ayrı dosyada tekrar yazılmış. İki kopya arasında senkronizasyon yok. |
| S109 | auth.global.ts | 42-44 | Kök dizine (`/`) gelen kullanıcı `home_page`'e yönlendiriliyor. Eğer `home_page` kendisi de `/` ise veya geçersiz bir yol ise sonsuz yönlendirme döngüsü oluşur. `home_page !== '/'` kontrolü var ama `home_page`'in geçerli bir rota olup olmadığı kontrol edilmiyor. |
| S110 | auth.global.ts | 71-74 | Custom sayfalarda yetki kontrolü "API üzerinden yapılacaktır" yorumuyla atlanmış. Client tarafında hiçbir guard yok; sayfa içeriği yüklendikten sonra (veya yüklenirken) API 401 döndüğünde yönlendirme yapılıyor. Sayfa bileşeni kısa süreliğine render edilip sonra kaybolabilir (flash). |

---

## 8. APP / LAYOUTS

### 8.1 default.vue — Ana Layout

| # | Dosya | Satır | Tespit |
|---|-------|-------|--------|
| S111 | default.vue | 51 | `isSafeMode` değeri `useCookie('safe_mode').value === '1'` ile belirleniyor. Bu değer reaktif değil (sadece ilk render'da okunuyor). Safe mode cookie'si sayfa yüklendikten sonra değiştirilirse layout güncellenmez. |
| S112 | default.vue | 92-94 | Layout fetch'i `useFetch(() => ...)` ile yapılıyor. Route değişimlerinde layout yeniden çekilecek ama layout genellikle tüm sayfalarda aynıysa gereksiz istekler oluşur. |

---

## 9. GENEL MİMARİ TESPİTLER

| # | Tespit |
|---|--------|
| G1 | **Transpiler Duplikasyonu**: SQL transpiler (`transpileQueryAndParams`) `db.ts` ve `worker.js`'de iki ayrı kopya olarak mevcut. Üç farklı parametre formatı destekleniyor ($1, ?, tagged template). Bu çoklu format + çoklu kopya bakım yükünü artırıyor. |
| G2 | **globalThis Kullanımı**: `__wsConnections`, `__logEvents`, `__aedesBroker`, `__aedesApp`, `__mqttClient`, `__cronWorkerInterval`, `__deviceCommandsStore`, `__wsRegexCache` gibi çok sayıda state `globalThis` üzerinde tutuluyor. Bu state'ler arasında resmi bir kayıt defteri (registry) yok; string convention ile erişiliyor. |
| G3 | **Cache TTL Tutarsızlığı**: `endpointManager` (60s), `utilsCache` (60s), `tenantResolver` (60s), `sysvars` (TTL yok, manuel invalidation), `sysVarCache` (TTL yok). Cache invalidation stratejileri tutarsız. |
| G4 | **Hata Yönetimi Tutarsızlığı**: Bazı yerlerde `throw { statusCode, message }` (plain object), bazı yerlerde `throw createError(...)` (H3 error), bazı yerlerde `throw new Error(...)` kullanılıyor. Üç farklı hata fırlatma kalıbı. |
| G5 | **İki Ayrı Rate Limiter**: `server/middleware/rate-limit.ts` ve `server/utils/rateLimit.ts` iki farklı rate limit implementasyonu. Middleware olan HTTP isteklerini, utils olan MQTT bağlantılarını sınırlıyor. İki ayrı LRUCache instance'ı, iki ayrı mantık. |
| G6 | **EAV Pattern Performansı**: Entity-Attribute-Value (EAV) veritabanı modeli kullanılıyor (`records` + `record_fields`). Her kayıt okuma işlemi ya `json_group_object` ile aggregation yapıyor ya da her field için ayrı satır okuyor. Karmaşık filtreleme ve sıralama işlemlerinde EAV pattern'inin performans dezavantajları belirgin. |
| G7 | **Pattern Duplikasyonu (toPatternRegex)**: Route pattern'i regex'e çeviren `toPatternRegex` fonksiyonu `02.authorize.ts` ve `app/middleware/auth.global.ts`'de ayrı ayrı tanımlı. `endpointManager.ts`'de ise farklı bir `compileRoutePattern` implementasyonu var. Üç farklı route matching mantığı. |
| G8 | **Schema Parse Tekrarı**: `(typeof entity.schema === 'string' && entity.schema.trim()) ? (() => { try { return JSON.parse(entity.schema); } catch { return {}; } })() : (entity.schema || {})` ifadesi `recordManager.ts` içinde en az 5 kez, diğer dosyalarda da defalarca tekrarlanıyor. Ortak bir `parseSchema` helper fonksiyonu yok. |
| G9 | **Asenkron Sandbox Timeout Koruması Yok**: `sandbox.ts` ve `worker.js`'de `vm.Script.runInContext` timeout'u yalnızca senkron kodu kapsar. Asenkron kod (Promise, setTimeout, fetch vb.) timeout'tan bağımsız çalışır. Hem endpoint hem de worker kodları asenkron olduğundan, gerçek bir runtime timeout koruması yok. |
| G10 | **Error.vue ve i18n**: `error.vue` dosyasında `useI18n()` try/catch içinde çağrılıyor. Eğer hata i18n plugin yüklenmeden önce oluşursa, tüm hata mesajları raw key olarak gösterilir (ör. `error.notFound`). |
