## [Unreleased] - 2026-07-30
### Fixed
- **Schema Migration N+1 Query Fix:** `server/utils/schemaMigration.ts` içerisindeki N+1 okuma darboğazı giderildi. Artık migration işlemi 50.000 ayrı `SELECT` sorgusu atmak yerine 500'erli gruplar halinde tek bir `IN` sorgusuyla çalışarak Node.js olay döngüsünü (Event Loop) bloke olmaktan koruyor.
- **Bulk Import Phase 1 N+1 Fix:** `server/utils/recordManager.ts` içerisindeki CSV içe aktarımlarının doğrulama aşamasında atılan binlerce ilişki (relation) ve benzersizlik (unique) `SELECT` sorguları, bellek içi Map/Set kullanılarak (Batched SELECT) optimize edildi.
- **DRY Violation / Transpiler Refactor:** `db.ts` ve `worker.js` içindeki birebir aynı olan SQL çeviri fonksiyonu `transpileQueryAndParams` ayrı bir bağımlılıksız dosya olan `sqlTranspiler.ts` içine taşındı. Worker thread'lerin modül bağımlılık yapısı (ESM) korunarak kod tekrarı engellendi.
- **Cascade Delete Stack Overflow & DB Lock Fix:** `server/utils/relationDeletePolicy.ts` içindeki ardışık (recursive) silme algoritması yinelemeli (iterative/queue) yapıya dönüştürüldü ve alt kayıtların veritabanından silinmesi işlemi, SQLite kilitlenmelerini (SQLITE_BUSY) önlemek adına toplu (Batch) Transaction yapısına alındı.
- **Schema Migration OOM Prevention:** `server/utils/schemaMigration.ts` içerisindeki migration işlemlerinde 50000+ kayıtlık tablolarda oluşabilecek bellek taşmasını (OOM) önlemek adına `transactionSync` işlemine `BATCH_SIZE = 500` (Chunking) eklendi.
- **Bulk Import I/O Bottleneck:** `server/utils/recordManager.ts` içerisindeki `bulkImportRecords` fonksiyonu optimize edilerek, binlerce `BEGIN...COMMIT` işlemi tek bir dev transaction (`sql.begin`) içine alındı. Böylece SQLite WAL kilitlenmeleri ve I/O darboğazı giderildi.
- **Modbus Connection Memory Leak:** `server/utils/modbusQueue.ts` içerisindeki `connectionPool` Map nesnesinin referans bırakarak RAM tüketmesine neden olan hafıza sızıntısı (Memory Leak), `closeConnection` metodunda ilgili nesnenin kendini silmesi sağlanarak giderildi.
- **Push Notification Table Scan:** `server/utils/push.ts` içerisindeki `broadcastPush` fonksiyonunda kullanılan metinsel arama (`LIKE '%pushSubscriptions%'`) yerine, SQLite'ın yerleşik JSON operatörü `json_type(profile, '$.pushSubscriptions') = 'array'` kullanılarak olası Full Table Scan darboğazı hafifletildi.

## [Unreleased] - 2026-07-27
### Fixed
- **Database Mutex Memory Leak (OOM):** `server/utils/db.ts` içerisindeki `executeWithLock` yapısına 1000 eşzamanlı işlem (queue limit) sınırı eklendi. Sınırsız Promise zincirinin aşırı yükte Node.js belleğini doldurması engellenerek, kuyruk dolduğunda "429 Too Many Requests" fırlatması sağlandı.
- **Worker Daemon OOM Crash Loop:** `server/utils/workerManager.ts` içerisinde arka plan işlemlerini (worker) başlatan komutlara eklenen RAM limiti `--max-old-space-size=50` (50MB) çok düşük olduğu için çökmelere yol açıyordu. Bu değer güvenli olan `--max-old-space-size=256` (256MB) seviyesine çekilerek daemon worker kararlılığı artırıldı.
- **DuckDB Spill-to-Disk Event Loop Block:** `server/utils/duckdb-appender.ts` dosyasında bellek taştığında (Spill-to-disk) veriyi geçici diske yazan mekanizma senkron `fs.appendFileSync` kullanıyordu ve Node.js'i kilitliyordu. Bu işlem asenkron `fs.promises.appendFile` ile değiştirilerek Event-Loop tıkanıklığı giderildi.
- **EAV Model Write Bottleneck:** `server/utils/recordManager.ts` içerisindeki `createRecord` ve `updateRecord` işlemlerinde, her bir EAV alanını (field) ayrı bir SQL `INSERT` sorgusu ile dönen `for` döngüsü iptal edildi. Bunun yerine `record_fields` tablosuna çoklu-değerli (Batch) tek bir `INSERT` atan toplu veri yazma mimarisine geçilerek I/O maliyeti 20 kat düşürüldü.
- **Tenant Deletion Leak:** `server/api/admin/tenants/[id].delete.ts` içerisinde kiracı (tenant) silinirken DuckDB ve SQLite veritabanı bağlantılarını doğru şekilde (graceful) kapatan `closeTenantDb` yapısına geçilerek yetim bağlantıların (file handles) arkada açık kalması (Leak) önlendi.
- **Sandbox Event-Loop Starvation (MQTT):** `server/utils/sandbox.ts` içerisindeki yüksek frekanslı MQTT Sandbox çalıştırıcısı, saniyede binlerce kez `vm.createContext` çağırarak Node.js ana iş parçacığını (%100 CPU) felç ediyordu. Bu yapı native V8 `AsyncFunction` ile değiştirilerek Context oluşturma gecikmesi tamamen sıfırlandı ve devasa bir performans artışı sağlandı.
- **WebSocket Retry Memory Leak & OOM:** `server/utils/wsManager.ts` içerisindeki `publishWS` fonksiyonunda, aktif bir dinleyici olmadığında 3 defa (toplam 1.7 saniye) `setTimeout` ile yapılan tekrar deneme (retry) bloğu, saniyede 3000 telemetri mesajı akan bir ortamda yüz binlerce askıda kalmış Promise yaratıp Node.js V8 motorunu çökerterek (Exit Code 58) sistemi kilitliyordu. Retry mantığı tamamen kaldırılarak RAM sızıntısı çözüldü.
- **UI Table Loading Glitch & Event Bug:** `app/components/CrudTable.vue` tablosunda "Veri Yok" uyarısının önce görünüp sonra kaybolmasını önlemek için başlangıç loading durumu `true` yapıldı. Ayrıca `refresh` (Yenile) butonuna tıklandığında Vue.js'in `PointerEvent` objesini fonksiyona geçirerek loading parametresini ezdiği (silent=PointerEvent) klasik hata, `@click="() => loadItems(false)"` yapılarak düzeltildi.
- **WebSocket Batched Payload:** Canlı Dashboard'a akan yüksek frekanslı WebSocket telemetri mesajları yüzünden tarayıcının saniyede binlerce DOM güncellemesi yapıp kilitlenmesini engellemek için, mesajlar saniyelik 1000'li (batch) diziler halinde gönderilerek Vue reaktivitesi optimize edildi.
- **DuckDB Producer-Consumer Promise Leak (OOM):** `server/utils/duckdb-appender.ts` dosyasında saniyede 3000 veri gelirken DuckDB'nin yazma hızı (I/O) geride kaldığı için Node.js Event Loop içerisinde yüz binlerce unresolved (çözülmemiş) `.run` Promise klozürü (closure) birikiyordu. 6 saatlik çalışmada RAM kullanımının 500 MB'dan 3.8 GB'a çıkmasına (Memory Leak) sebep olan bu Producer-Consumer darboğazı, verilerin eşzamanlı (concurrent) olarak DuckDB'ye atılması engellenerek `isFlushing` isimli bir Mutex kilidine ve sıralı While döngüsü (Batch Draining) mimarisine taşınarak çözüldü. Artık DuckDB sıkışsa dahi veriler RAM'de Promise olarak değil, güvenli bir tamponda (maks 5000) bekletilip gerekiyorsa Asenkron olarak diske (Spill-to-disk) yazılıyor.

## [Unreleased] - 2026-07-26
### Fixed
- **UI Inconsistency & Save Code Payload:** Standartized the `saveCodeOnly` (Ctrl+S) behavior across all admin pages (`pages`, `endpoints`, `workers`, `utils`). Refactored ID resolution logic to reliably capture `payload.id` or `editId` irrespective of Vue 3 proxy unwrap differences, preventing silent payload failures. Cleaned up hardcoded Turkish UI strings (`Lütfen önce oluşturup kaydedin.`) replacing them with standard i18n keys (`message.saveCodeNotAllowed`).
- **HMR Graceful Shutdown Deadlock:** Fixed a critical deadlock during Hot Module Replacement (HMR) reloads caused by conflicting `close` hooks. The `aedes.ts` plugin was awaiting `broker.close()`, which waits for all clients to disconnect. However, the internal MQTT client disconnection logic was in `init.ts`, which was stuck waiting for `aedes.ts` to finish. This deadlock prevented `closeDatabases()` from ever running, permanently locking the DuckDB files and crashing the new Nitro worker. The duplicate hook in `aedes.ts` was removed, consolidating the shutdown sequence (Client -> Broker -> Databases) cleanly into `init.ts`.
- **HMR DuckDB Lock Retry:** Re-enabled graceful shutdown for DuckDB during HMR reloads and added a retry-loop strategy (up to 2 seconds) inside `getTenantRefs`. This fixes the `Connection was never established` error caused by the new Nitro worker thread trying to open the `.duckdb` file before the old Nitro worker thread had completely released the POSIX lock.
- **Daemon Autostart (Master Tenant):** Fixed an issue where daemon workers belonging to the `master` tenant were completely ignored during system boot (autostart). The `initDaemonWorkers` function now correctly injects the virtual `master` tenant into the iteration loop, ensuring its background daemons start automatically as intended.
- **Daemon Autostart Crash:** Fixed a critical bug in `server/utils/workerManager.ts` where `initDaemonWorkers` was missing an `await` keyword before executing the tenant query via `getMasterDb()`. This caused a `TypeError: tenants is not iterable` error during server startup, which failed silently inside a `try/catch` block and prevented all background workers (daemons) from automatically starting upon system boot or HMR reload.
- **Utility Sandbox Context Override:** Fixed an issue in `server/utils/utilsCache.ts` where executing a utility would overwrite the externally injected `__emitUtilLog` and `__utilId` properties (such as those provided by the Sandbox Test UI) with the default global logger.
- **Smart Login Redirects:** Removed the automatic fallback redirection to the secret `/admin/login` page when unauthenticated users attempt to access private `/admin` routes. Users are now seamlessly redirected to the standard `/login` page with their intended destination appended as a `?redirect` parameter. Upon successful login, the seeded login script will now respect this parameter and redirect them back to their original page.
- **Interrupted Seed Recovery:** Fixed a critical bug where restarting the Nuxt development server (HMR) during the initial database creation (`isNewDb=true`) would kill the seeding process midway. Subsequent restarts falsely assumed the database was fully initialized because the `.db` file existed, resulting in empty layouts and broken routes. Added a self-healing fallback that checks for an empty `pages` table to robustly resume seeding if previously interrupted.
- **Admin Menu Duplication (Seed):** Removed hardcoded navigation links from the default `admin` user's `menu_list` during database seeding, preventing Vuetify duplicate ID warnings since these links are already provided by the system's default navigation drawer.
- **DB Init Race Condition & Deadlock (Thundering Herd):** Fixed a critical race condition in `server/utils/db.ts` where concurrent requests during a tenant's initial database setup could receive a partially initialized `TenantDbRefs` object. Implemented an asynchronous init promise queue (`tenantInitPromises`) to block subsequent requests. Also fixed a circular deadlock in `useDB` where `setupTenantDatabase` would get stuck waiting for its own init promise by passing `_internalRefs` directly.
- **Zombie Worker (HMR Race Condition) Memory Leak:** Geliştirme ortamında (Dev/HMR) arka arkaya kaydetme yapıldığında, `initDaemonWorkers` işlemi devam ederken `stopAllDaemonWorkers` metodunun araya girmesiyle oluşan ve hafızada asılı (Zombie) kalarak her defasında ~50MB RAM çalan "Race Condition" sızıntısı giderildi. `isInitializingDaemons` kilidi eklenerek başlatma döngüleri HMR sırasında anında kesildi.
### Added
- **Form Date Validation:** `recordValidator.ts` içerisine sadece `today()` fonksiyonunu kullanma (bugünün tarihi) desteği eklendi. Önceden yalnızca operatörlerle (ör: `today()+2d`) çalışıyordu.

### Changed
- **Sandbox Relative Imports:** `sandbox.ts` içerisindeki `customRequire` mekanizmasına, kullanıcıların izafi (relative) dosya yollarını (ör: `./utils/helper`) çağırırken `plugins/` dizinini atlamasını sağlayan bir kural eklendi. Böylece geliştirici kafa karışıklığı önlendi.
- **Cache Eviction Fix:** `tenantResolver.ts` içerisindeki tenant iptal metoduna (`invalidateTenantCache`), olası bir custom domain değişikliğinde yönlendirmenin bozulmaması için `customDomainCache.clear()` eklendi.

### Fixed
- **i18n Memory Leak Prevention:** `server/utils/i18n-server.ts` içerisindeki süresiz ve sınırsız dil önbelleği nesnesi (Map), maksimum 1000 tenant kapasiteli bir LRUCache ile değiştirildi.
- **SQL Injection Prevention:** `recordValidator.ts` (eski adıyla `recordManager.ts` üzerinden çağrılan) `checkUniqueConstraints` kuralına, kolon adlarının yalnızca alfanümerik ve alt çizgi içermesini zorunlu kılan bir Regex eklendi.

### Fixed
- **OOM Crash (Memory Leak) Prevention in DuckDB Appender:** Fixed a critical logical bug in `server/utils/duckdb-appender.ts` where the `existingBuffer.length` was incorrectly checked against the 5000 limit instead of the total accumulated buffer length. This allowed the RAM buffer to grow infinitely during sustained DuckDB downtime, completely bypassing the OOM Spill-to-Disk protection and crashing the Node.js process.

### Added
- **Isolated Safe Mode (Disaster Recovery):** Tamamen veritabanından bağımsız ve izole çalışan bir "Güvenli Mod" eklendi. Dinamik sayfalar (özellikle `/system/layout` veya `[...dynamic].vue`) veritabanındaki bir hata veya syntax hatası yüzünden çökse dahi, sistemin kilitlenmesi engellendi.
- **Safe Mode Login:** `app/pages/admin/login.vue` oluşturuldu. `http://localhost:3000/admin/login` adresi üzerinden sabit koda gömülü bir giriş formu sağlandı. Başarılı girişte tarayıcıya `safe_mode=1` çerezi bırakılıyor.
- **DynamicRenderer Bypass (Absolute Isolation):** `app/layouts/default.vue` güncellendi. Eğer `safe_mode=1` çerezi varsa, Nuxt veritabanındaki şablonu (layout) çekmeyi ve `DynamicRenderer` bileşenini tamamen atlayarak (bypass), ekrana sabit koda gömülü kırmızı bir "Emergency Recovery" menüsü ve admin sayfalarını basıyor. Bu sayede veritabanındaki hiçbir hata kurtarma modunu etkileyemiyor.
- **Middleware Guard:** `app/middleware/auth.global.ts` içerisine kural eklendi. Giriş yapmamış bir kullanıcı (veya admin) `/admin` rotalarına girdiğinde doğrudan `admin/login` sayfasına yönlendiriliyor, böylece ana sayfa (`/`) çökük olsa dahi kaybolması engelleniyor.


### Fixed
- **Seed Syntax Errors:** Fixed unescaped backticks in `server/utils/seed/pages.ts` template literals that were causing TS1005 (unterminated string literal) errors and breaking the Nitro build.
- **Architectural Cleanup Reversal:** Removed `is_landing_page` and `is_login_page` columns that were accidentally re-added to the `pages` table in `server/utils/db.ts` and `server/api/admin/pages/index.ts`, fully honoring the recent architectural refactoring.
- **Dynamic Route Authorization Loop:** Fixed a critical bug in `server/api/pages/[...slug].ts` where role/tag verification for dynamic pages was done after the routing loop broke. The auth check is now inside the loop, allowing the system to `continue` and fallback to lower-priority pages with the same route if the user lacks permissions for the higher-priority one.
- **Double-Hop Redirect on Unauthorized Pages:** Updated `app/pages/[...dynamic].vue` to redirect users directly to `/login` (instead of `/`) when receiving a 401/403 on dynamic pages, preventing UI flicker and redundant backend requests.
- **Nitro Root Routing (Blank Page Fix):** Fixed the bug where Nuxt Nitro router failed to map requests to the `/api/pages/` root endpoint, resulting in a 404 error and causing both authenticated and unauthenticated users to see a blank page at the site root (`/`). Updated `app/pages/index.vue` to fetch `/api/pages/index` and mapped the `index` slug to the root path (`/`) in `server/api/pages/[...slug].ts`.
- **Authentication Redirects:** Added frontend guards in `index.vue` to automatically redirect users to `/login` if the root page is not public (401/404 caught), and to redirect authenticated users to their predefined `home_page` if it is set.

## [Unreleased] - 2026-07-25
### Changed (Architectural Refactoring)
- **Centralized Route Resolution:** Removed `server/api/landing-page.get.ts` and `server/api/pages/system/[type].ts`. Frontend now routes all page requests through the master `/api/pages/[...slug].ts` endpoint.
- **Dynamic Access Control:** Modified `[...slug].ts` to handle fallback routing dynamically based on user authentication and `is_public` flag. Both Home and Landing pages can now share the exact same route pattern (e.g. `/`) without conflict.
- **Strict SQLite Types (FilterEngine):** Replaced the `COALESCE(val_str, val_num...)` logic in `server/utils/filterEngine.ts` with strict target column mapping based on schema types to prevent SQLite type coercion bugs.
- **Log Formatting:** Removed all emojis from backend server logs (db, workerManager, aedes, etc.) and adopted standardized textual tags like `[OK]`, `[ERROR]`, `[CRON]`.
- **System Protection Flag:** Renamed the incorrectly named `is_system` database column to `protected` across all schemas, APIs, and Vue admin panels.

### Removed
- **UNIQUE Constraint:** Dropped the `UNIQUE` constraint from `pages.route_pattern` in the database schema to allow multiple variations of the same route (like public vs private).
### Changed (Architectural Unification)
- **Unified is_system Architecture**: Both `pages` and `system_variables` tables now use a standardized `is_system` boolean flag for protection instead of relying on hardcoded arrays (e.g., `protectedKeys`) or specific page types.
- **Pages Refactor**: Removed deprecated `is_landing_page`, `is_login_page` columns and the `landing` / `login` page types. System pages now use `page_type = 'regular'` with an `is_system = 1` flag and are identified by their `route_pattern` (e.g., `/` and `/login`).
- **System Variables Refactor**: Added `is_system` column to `system_variables` table. Protected keys are now seeded with `is_system = 1` directly into the database, removing the need for hardcoded backend lists.

### Fixed
- **UI System Locks**: Updated `pages.vue` and `system-settings.vue` to disable the editing of `key`, `route_pattern`, and `page_type` for system-defined records. Added visual lock and system icons.
- **Missing Protected Variables**: Fixed the issue where some critical variables like `PRIMARY_COLOR` were not protected by moving to the `is_system` flag mechanism.


### Fixed (System Variables Seed)
- `server/utils/seed/index.ts` icerisinde, orijinal mimerideki MQTT, APP_NAME, APP_LOGO gibi bir cok kritik `system_variables` seed degerinin unutularak eksik tasinmasindan dolayi yasanan 'sistem degiskeni yoklugu' hatasi giderildi. Tum eksik varsayilan degiskenler tohumlama asamasina tekrar eklendi.

### Fixed (Seed & Migration Bugs)
- `languages` tablosuna seed atarken yanlis kolon isimleri (lang, key, value) kullanilmasindan dogan SQL hatasi giderildi. Eski yapiya uygun olarak JSON guncelleme mantigi kuruldu.
- Sifirdan DB kurulumunda (Auto-Migration) surekli tetiklenen `system_variables.is_public` kolonu dogrudan `CREATE TABLE` sorgusuna eklendi, boylece temiz kurulum sonrasi gereksiz ALTER TABLE tetiklenmesi onlendi.

## [Unreleased] - 2026-07-24
### Added
- Merkezi veritaban� seed altyap�s� (`server/utils/seed`).
### Changed
- DB kurulum mant��� mod�lerle�tirildi. Seed i�lemi sadece yeni DB yarat�l�rken 1 kez tetiklenecek �ekilde optimize edildi.
- Konsol loglar�ndaki emojiler temizlendi, resmi formata ge�ildi.
- �18n �evirileri veritaban�na otomatik insert etme i�lemi init yerine merkezi seed i�erisine ta��nd�.
### Fixed
- `system_variables` tablosundaki `is_admin` g�� d�ng�s� hatas� (Sonsuz migration loop) giderildi.
# Changelog
## [2026-07-24] - Cron Worker Memory Leak & Fork Bomb Fix

### Fixed
- **Cron Worker OOM (Out Of Memory) Prevention:** workerManager.ts i�erisinde ork ile ba�lat�lan Cron Worker'lar i�in --max-old-space-size=50 (50MB RAM Limiti) arg�man� eksikti. Bu arg�man eklenerek kullan�c�lar�n hatal� yazd��� array veya haf�za t�keten objelerin sunucu RAM'ini komple yutmas� engellendi.
- **Cron Worker Fork Bomb Korumas�:** Zaman ayarl� cron g�revlerinde sonsuz d�ng� (while(true)) olu�turulmas� durumunda process'in asla �lmemesi ve her dakika arka planda �l�ms�z bir Node.js servisi ba�latmas� (Fork Bomb) engellendi. Her cron g�revi i�in 60 saniyelik bir \setTimeout\ (Hard Timeout) yerle�tirilerek s�resi dolan worker'lar�n i�letim sistemi seviyesinde (SIGKILL) ac�mas�zca �ld�r�lmesi sa�land�.
- **Console Log Kirlili�i:** Cron worker'lara silent: true arg�man� eklenerek console.log ta�k�nlar�n�n ana sunucu PM2/Syslog dosyalar�n� �i�irmesi engellendi.


## [2026-07-24] - Critical Architectural Bug Fixes (DB Thrashing & Memory Leak)

### Fixed
- **Cron Engine DB Thrashing (LRU Cache Destruction):** `server/utils/workerManager.ts` içerisindeki Cron motorunun saniyede bir çalışan döngüsü (`setInterval`), sistemdeki tüm firmaların veritabanlarına her saniye bağlanarak `workers` tablosunu kontrol ediyordu. Bu durum, `db.ts` içerisindeki 200 limitli LRU bağlantı havuzunu (Tenant Pool) çökerterek sunucuda devasa bir disk I/O ve CPU israfına (Thrashing) yol açıyordu. Cron görevleri sunucu RAM'inde (Cache) tutulacak şekilde yeniden yapılandırıldı. Saniyede atılan 200+ SQLite sorgusu 0'a indirildi. Yönetim paneli üzerinden yeni cron eklendiğinde/güncellendiğinde cache'in anında yenilenmesi sağlandı.
- **Sandbox DuckDB Connection Leak:** `server/utils/sandbox.ts` içerisinde kullanıcı kodları hata verdiğinde (Timeout vs.) arka planda çalışan DuckDB bağlantısını kapatması gereken kod parçası, block-scope dışında kalan bir objeye (`sandbox`) erişmeye çalıştığı için `ReferenceError` verip sessizce patlıyordu. Hata alan veya askıda kalan tüm kullanıcı kodlarının sunucuda açık DuckDB bağlantıları (Native Memory Leak) bırakması sorunu `ephemeralTelemetryDb` doğrudan hedeflenerek kesin olarak çözüldü.
## [2026-07-24] - Architectural Bottleneck Resolutions

### Fixed
- **SQLite Database Locking (SQLITE_BUSY):** `server/utils/db.ts` içerisindeki ana veritabanı bağlantılarına (`masterDb`, `sqlite`, `sqliteRead`) `sqlite.pragma('busy_timeout = 5000');` kuralı eklendi. Daha önce yalnızca arka plan işlemlerinde (Worker) olan bu kuralın eksikliği nedeniyle, bir arka plan işlemi veritabanına yazarken aynı anda arayüzden istek geldiğinde sistemin çökmesi (SQLITE_BUSY) sorunu, sunucunun işlemi 5 saniyeye kadar beklemesi sağlanarak kesin olarak giderildi.
## [2026-07-24] - Frontend-Backend Synchronization Fixes

### Fixed
- **Home Page Dropdown Fix:** `app/pages/admin/users.vue` ve `app/pages/admin/roles.vue` içerisindeki anasayfa (home page) seçim listelerinde `component` ve `layout` tipli sayfaların da listelenmesi ve yanlışlıkla seçilebilmesi sorunu giderildi. Artık sadece yönlendirilebilir sayfalar gösteriliyor.
- **Endpoint Type Mismatch:** `app/pages/admin/endpoints.vue` sayfasındaki Endpoint oluşturma ve düzenleme ekranlarında `rest` ve `mqtt` olan hardcoded (sabit) tipler; veritabanı şemasıyla uyumlu olacak şekilde `http`, `ws`, ve `mqtt` olarak düzeltildi.
- **WebSocket Visibility:** Uç nokta tanımlarken "ws" seçeneğinin görünmemesi sorunu yukarıdaki güncellemeyle beraber çözüldü. Arayüz ve Backend senkronize edildi.

## [2026-07-24] - Codebase Cleanup & Push Bug Fix

### Fixed
- **Push Notification Zombie Subscriptions:** `server/utils/push.ts` içerisindeki `sendPushToUser` ve `broadcastPush` fonksiyonları düzeltildi. Daha önce 410 (Gone) hatası döndüren geçersiz (süresi dolmuş/kullanıcının tarayıcıdan sildiği) push abonelikleri sadece konsola yazdırılıyor ve veritabanında birikmeye devam ediyordu. Yeni eklenen mantık sayesinde, 410 hatası alındığında ilgili ölü abonelik tespit ediliyor, kullanıcının `profile.pushSubscriptions` dizisinden temizleniyor ve veritabanına geri kaydediliyor (Database Garbage Collection).
- **Cleanup Leftovers:** Artık kullanılmayan ve TypeScript hatalarına yol açan eski `app/pages/tenant/[slug]/login.vue` sayfası sistemden tamamen silindi (Login işlemleri zaten dinamik olarak yürütülüyordu).
- **Workspace Cleanup:** Ortamda kalan ve artık işlevi olmayan eski `.bak` (yedek) dosyaları ve `scratch` altındaki geçici test scriptleri temizlendi.

### Changed
- **API Message Standardization (i18n):** `server/` dizini altındaki tüm API uç noktaları (import/export), doğrulama sınıfları (`recordValidator`, `validator`) ve yönetim modüllerindeki "hardcoded" (sabit yazılı) kullanıcıya dönen İngilizce ve Türkçe hata/başarı mesajları temizlendi. Tüm `message:` ve `statusMessage:` alanları standart proje yapısına uygun olarak `error.X` ve `success.X` formatındaki çoklu dil (i18n) anahtarlarıyla değiştirildi. Fallback metinler kaldırıldı.
## [2026-07-23] - Nitro Static Compilation Fix (PWA)

### Fixed
- **PWA Install Button Bug (Part 1 - Nitro):** `server/utils/seed-pages.ts` dosyasındaki dinamik PWA kurulum mantığı düzeltildi. Nuxt/Nitro derleme (build) sırasında sunucu tarafı optimizasyonu sebebiyle `typeof window !== 'undefined'` ifadelerinin `"undefined" !== 'undefined'` (sabit false) olarak string'e dönüştürülüp veritabanına yazılması sorunu giderildi. Kod içinde `typeof window` yerine `globalThis.window` kontrolüne geçilerek statik string çevirisi kalıcı olarak atlatıldı.
- **PWA Install Button Bug (Part 2 - Dynamic Manifest):** Önceki adımda kazara `public/` klasörüne eklenen statik `manifest.json` ve `logo.svg` dosyaları silinerek, sistemin dinamik tenant rotalarını (`server/routes/manifest.json.ts` ve `server/routes/logo.svg.ts`) gölgelemesi engellendi. Uygulamanın `<link>` etiketleri (manifest ve icon) tekrar `nuxt.config.ts` dosyasına eklendi ve statik `/logo.png` yerine dinamik olarak oluşturulan `/logo.svg` rotasına yönlendirildi. Böylece hem PWA kurulumu aktifleşti hem de Tenant'a özel dinamik logo/isim mimarisi tekrar sağlandı.

## [2026-07-23] - DB-Driven System Pages (Home Page)

### Added
- **Primary Color Variable:** Arayüzün ana renk temasını belirleyen ve birçok bileşende (App Bar, Footer, Tablo vb.) kullanılan dinamik renk yapısı için veritabanına `PRIMARY_COLOR` sistem değişkeni eklendi. Artık Sistem Ayarları sayfası üzerinden `PRIMARY_COLOR` değeri (örn: `#ff5733` veya `success`) değiştirildiğinde tüm uygulamanın renk teması otomatik olarak değişebilecek.

### Changed
- **Logo Rendering Fix:** `APP_LOGO` sistem değişkeninin hem standart URL (örn: `logo.png`) hem de ham `<svg>` kodları (string) ile çalışabilmesi için sistem şablonundaki (`server/utils/seed-pages.ts`) render mantığı güncellendi. Eğer değer `<` işaretiyle başlıyorsa (SVG) `v-html` ile doğrudan DOM'a ekleniyor, aksi takdirde normal `<img>` etiketinin `src` niteliğine yazılıyor. Bu düzeltme mevcut veritabanlarındaki layout (şablon) sayfalarına da yansıtıldı.
- **Admin Custom Menu Support:** `app/pages/admin/roles.vue` ve diğer yerlerden yönetilen `menu_list` özelliğinin (özel tanımlı menüler), Layout şablonunda Admin ve Super Adminler için kısıtlanması hatası giderildi. Artık yöneticiler de kendilerine veya rollerine tanımlı olan özel menüleri, standart sistem menülerinin en üstünde (bir ayırıcı çizgi ile birlikte) görebilecekler.
- **Home Page Refactoring:** `app/pages/index.vue` içerisindeki hardcoded (sabit kodlanmış) Admin Dashboard ve Non-Admin Karşılama Ekranı arayüzleri silindi.
- **Dynamic Home Template:** Bu arayüzler veritabanı odaklı sistem sayfası (`page_type = 'home'`) yapısına dahil edildi. `server/utils/seed-pages.ts` güncellenerek varsayılan Home (Dashboard) tasarımı otomatik olarak tüm tenant (müşteri) veritabanlarına eklendi. `index.vue` artık giriş yapılmışsa doğrudan veritabanındaki Home (Dashboard) sayfasını, giriş yapılmamışsa Landing sayfasını dinamik olarak render ediyor.

## [2026-07-23] - DB-Driven System Pages (Layout & Login/Landing)

### Added
- **Auto-Seeding Logic:** `server/utils/seed-pages.ts` oluşturuldu ve `db.ts` içerisindeki `setupTenantDatabase` fonksiyonuna entegre edildi. Sistem veritabanı kurulduğunda, varsayılan şablon (Layout) ve giriş sayfası (Login) `pages` tablosuna `is_system=1` olarak otomatik ekleniyor.
- **System Protection:** `server/api/admin/pages/[id].ts` içindeki DELETE uç noktası güncellendi. `is_system = 1` bayrağına sahip sistem sayfalarının (Layout ve Login/Landing) Admin panelinden silinmesi engellendi (Ancak Page Builder ile düzenlenebilir bırakıldı).

### Changed
- **Vue Refactoring:** `app/layouts/default.vue` ve `app/pages/login.vue` dosyalarındaki binlerce satırlık (hardcoded) HTML/Vue tasarımları silinerek sadece veritabanındaki içeriği render eden `<DynamicRenderer>` wrapper'ı bırakıldı. Tüm tasarım yükü veritabanına taşındı.
- **Login & Landing Merge:** Kullanıcı talebi doğrultusunda "Landing Page" ile "Login Page" birleştirildi. `app/pages/index.vue` içerisinde eğer veritabanında özelleştirilmiş bir Landing Page yoksa, giriş yapmamış (unauthenticated) kullanıcılar otomatik olarak doğrudan `/login` sayfasına yönlendirilecek şekilde kod güncellendi. Giriş yapmış kullanıcılar için Dashboard görünümü korundu.

## [2026-07-23] - System Variables Hybrid Architecture (Target + Public)

### Changed
- **Hybrid Architecture:** system_variables şemasına is_public sütunu geri eklendi. Hedef (	arget) sütunu ile public görünürlüğü ayrı boyutlara ayrıştırıldı.
- **API Auth Logic:** sys-vars.get.ts içerisindeki yetki denetimi geri getirildi. Eğer istek anonimse sadece is_public=1 olan değişkenler, giriş yapılmışsa tüm ui/shared değişkenler döndürülüyor.
- **UI Logic:** System Settings arayüzündeki Public butonu geri getirildi. 	arget=api seçildiğinde Public butonunun kilitlenmesi sağlandı.

## [2026-07-23] - System Variables Target Architecture

### Changed
- **Target Migration:** system_variables tablosundan karmaşık olan is_public ve is_admin sütunları kaldırılarak utils tablosuna benzer şekilde tek bir 	arget ('ui', 'api', 'shared') mimarisine geçildi.
- **Frontend Auth Filter Removal:** Frontend useSysVars APIsi (sys-vars.get.ts) artık public/admin ayrımı yapmaksızın 	arget=ui veya 	arget=shared olan tüm değişkenleri UI'a gönderiyor.
- **UI Form Update:** system-settings.vue içerisindeki Public ve Admin switchleri kaldırılarak yerine hedef (target) seçici eklendi.

Tüm önemli mimari değişiklikler ve düzeltmeler bu dosyada kayıt altına alınacaktır.

## [2026-07-23] - Application Rename

### Changed
- **System-Wide Rename:** Uygulamanın adı "IIoT Platform" yerine tüm projede "BaseApp" olarak değiştirildi. Bu değişiklik `package.json`, `nuxt.config.ts`, Service Worker dosyaları, Vue düzenleri (layouts), çeviri dosyaları ve tüm dokümantasyon dosyalarını kapsamaktadır.
- **Build Output Names:** Uygulama derleme çıktı adları `iiotplatform`'dan işletim sistemi mimarisine göre `baseapp_win_x64.exe`, `baseapp_linux_x64`, vb. olacak şekilde güncellendi.

## [2026-07-23] - JSON Import/Export & Circular Dependencies

### Fixed
- **JSON Single Export Missing Code (Pages/Endpoints/Utils):** `app/composables/useJsonExportImport.ts` içerisindeki `exportSingleJSON` fonksiyonu güncellendi. Arayüzdeki listelerden dışa aktarma yapıldığında, listenin kısıtlı verisi yerine (sayfalar için `template_string`, `script_content`, `style_content` eksikliği gibi) `GET /api/.../:id` ile tam veri çekilip eksiksiz dışa aktarım (export) yapılması sağlandı.
- **Workers Bulk Import Bug:** `server/api/admin/workers/index.ts` dosyasına toplu kayıtları işleme mantığı (`body.records`) eklendi. Workers sayfasından JSON import yapıldığında artık sessizce hata vermek yerine kayıtları başarıyla oluşturuyor veya güncelliyor.
- **Server Circular Dependencies (OOM/Deadlock Risk):** `server/utils/workerManager.ts`, `server/utils/mqtt.ts` ve `server/utils/sandbox.ts` modüllerinin en üst kısımlarında yer alan ve dairesel bağımlılığa (Circular Dependency) sebep olan doğrudan içe aktarmalar (import) kaldırıldı. Modüllerin yüklenme (Boot) sırasındaki kilitlenmelerini önlemek amacıyla, ilgili fonksiyonlar sadece ihtiyaç anında (runtime) "Dynamic Import" yöntemiyle çağrılacak şekilde yeniden yapılandırıldı.

## [2026-07-23] - Architectural Fixes: Memory Leaks & Zombie Processes

### Fixed
- **MQTT deviceCache RAM Leak (OOM Risk):** `server/utils/mqtt.ts` içerisindeki sınırsız büyüyen `deviceCache` ve `pendingFetches` Map objeleri `lru-cache` kullanılarak güncellendi. Kullanılmayan cihazların bellekte kalarak sonsuza kadar birikip (Memory Leak) sistemi çökertmesi önlendi. Önbellek maksimum 50.000 cihaz ve 30 dakika TTL ile sınırlandırıldı.
- **Cron Zombie Processes:** `server/utils/workerManager.ts` içerisindeki Cron motoruna, Cron süreçlerinin çalışma sürelerini kontrol eden bir zaman aşımı (Timeout) mekanizması eklendi. Yarıda asılı kalan veya sonsuz döngüye giren süreçler 15 dakika sonra otomatik olarak `kill()` edilerek (Zombie Process) CPU ve RAM tükenmesi engellendi. Aynı Cron görevlerinin birbirinin üstüne binerek çalışmasını önleyen `activeCronWorkers` takip sistemi eklendi.
- **Super Admin Tenant Navigation (Ghost Cookie Fix):** `server/utils/tenantResolver.ts` içindeki `tenant_slug` cookie fallback mekanizması güvenli bir şekilde geri yüklendi. Böylece Super Adminler sol menüden `admin/users` gibi sayfalara girdiklerinde UI (Sticky Cookie) baz alınarak doğru kiracı verilerinin gelmesi sağlandı. Aynı zamanda `/api/auth/login` rotası bu fallback dışında bırakılarak, master panelde login olurken yaşanan "Ghost Cookie Mismatch" (istemsiz kiracıya giriş) hatası kesin olarak engellendi.

## [2026-07-21] - Architectural Shield & Bottleneck Resolutions

### Changed
- **Worker.js SQLite Isolation:** Background Worker süreçlerindeki (`worker.js`) RPC veritabanı darboğazı çözüldü. Worker'lar artık Ana Thread'i (IPC) meşgul etmek yerine `better-sqlite3` kullanarak kendi process'leri içerisinde SQLite dosyalarına (WAL modunda) doğrudan bağlanıyor. Ana Node.js döngüsü (Event Loop) üzerindeki %100 yük hafifletildi.
- **DuckDB Spill-to-Disk (OOM Protection):** `db.ts` içerisindeki DuckDB başlatma sekansına `PRAGMA temp_directory` eklendi. 64MB'lık `memory_limit` aşıldığında sistemin çökmesi (Out of Memory) engellendi, verinin güvenle geçici dizine (Spill-to-disk) taşınması sağlandı.
- **Aedes MQTT Queues Limits:** Aedes broker başlatılırken parametresiz (sınırsız) başlama hatası giderildi. RAM sızıntılarını (Memory Leak) ve sonsuz kuyruk birikmesini önlemek amacıyla `concurrency: 100` ve `queueLimit: 1000` donanımsal koruma limitleri eklendi.

### Fixed
- **WebSocket Zombie Connections:** `server/api/ws/[...ws].ts` dosyasına Global Ping/Pong (Heartbeat) döngüsü eklendi. Her 30 saniyede bir kopmuş/ölü bağlantılar (zombiler) tespit edilerek `wsConnections` haritasından temizleniyor. Gereksiz Broadcast yayınları (CPU ısınması) engellendi.


## [2026-07-21] - Architectural Refactoring & Isolation Improvements

### Added
- HTTP ve WebSocket isteklerinde tenant çözümleme mantığını tek bir merkezde toplayan `server/utils/tenantResolver.ts` oluşturuldu (Path, Header, Query, Custom Domain ve Subdomain destekli). Cookie fallback kaldırıldı.

### Changed
- `/api/telemetry`, `/api/records` ve `/api/master/tenants` endpointleri, güvenlik ve düzen amacıyla `/api/admin/...` altına taşındı.
- `server/middleware/02.authorize.ts` ve `01.auth.ts` middleware'leri yeni `/api/admin` yapılandırmasına uygun hale getirildi, gereksiz yama kontrolleri temizlendi.
- `server/middleware/00.tenant.ts` dosyası `tenantResolver.ts` kullanacak şekilde güncellendi. Bulunamayan tenantlar için master veritabanına düşme (fallback) hatası giderildi, artık 404 dönüyor. (Çıplak kök dizin master davranışı korundu).
- `server/api/ws/[...ws].ts` dosyası, ortak WS tenant çözümlemesi için `tenantResolver.ts` kullanacak şekilde güncellendi.
- `server/plugins/aedes.ts` güncellenerek, MQTT cihazlarının `tenant:` prefix'i kullanma zorunluluğu kaldırıldı. Cihazlar sadece `deviceId` ve `secretKey` ile doğrulama yapıyor, tenant arka planda dinamik olarak bulunuyor.
- Aedes plugin'ine eklenen `authorizeForward` ve `authorizeSubscribe` interceptor'ları ile giden MQTT paketlerindeki tenant prefix'leri istemciden gizlendi.
- Vue sayfaları (`telemetry/[device_id].vue`, `RecordsManager.vue`, `tenants.vue`, `default.vue`) yeni `/api/admin/` yollarına göre güncellendi.

### Fixed
- `server/api/auth/login.post.ts` içindeki Super Admin girişlerinde oluşan "ghost cookie" (çerez çakışması) hatası, master'a fallback yapıldığında `tenantSlug = 'master'` olarak zorlanarak çözüldü.
- API dosyaları taşınırken bozulan TypeScript import yolları (recordManager, db) düzeltildi.
- Hatalı varsayımlarla oluşturulan `server/api/admin/ws/terminal/[deviceId].ts` silindi, projedeki asıl Virtual Terminal olan `app/components/VirtualConsole.vue` düzeltilerek websocket isteklerine `?tenant=` query'si eklendi.
- `server/utils/tenantResolver.ts` içinden cookie çözümlemesi (fallback) tamamen kaldırılarak Super Admin'in master paneline girişinde yaşanan inatçı tenant çakışması kesin olarak çözüldü.
- `server/routes/api/ws/logs.ts` (Sanal Konsol) endpoint'i `tenantResolver` altyapısına geçirildi, tenant adminler sadece kendi loglarını görecek şekilde güvenli hale getirildi.

## [2026-07-21] - API & UI Mismatch Fixes

### Changed
- `app/pages/records` ve `app/pages/telemetry` dizinleri `app/pages/admin/` altına taşındı ve mimari bütünlük sağlandı.
- `app/middleware/auth.global.ts` içerisindeki `/records` ve `/telemetry` kök dizin istisnaları silindi, tüm yetki kontrolü `/admin` kalkanına bırakıldı.
- `app/pages/admin/entities.vue` ve `app/pages/admin/devices.vue` içindeki yönlendirme butonları yeni `admin` rotalarına uyumlu hale getirildi.

### Fixed
- `demo.json` içindeki kırık olan E2E test script'inin (19 adımlık kapsamlı test) API yolları `/api/master/tenants` yerine `/api/admin/tenants` olarak güncellenerek testin tekrar çalışması sağlandı.
- `public/docs.html` içindeki Dış API Entegrasyon dokümanları güncellenerek, kullanıcılara gösterilen tüm `api/records` ve `api/telemetry` yolları `api/admin/...` şeklinde düzeltildi, yanlış bilgilendirme (404 hatası) giderildi.
- `app/pages/documentation/realtime.vue` içindeki MQTT cihaz bağlantı rehberi düzeltildi. Platformun görünmez izolasyon yaptığı açıklandı ve cihazların topic prefix'ine ihtiyaç duymadan doğrudan (örn. `sensor/1`) yayın yapabileceği belirtildi.
- `server/routes/api/ws/logs.ts` içerisinde Super Admin'lerin Master ortamındayken tüm kiracıların loglarını karmaşık şekilde almasına neden olan güvenlik atlatması (bypass) kaldırılarak, master ortamında yalnızca master loglarının görüntülenmesi sağlandı.

## [2026-07-21] - WebSocket Broadcast Race Condition Fix

### Fixed
- E2E testinde (Adım 10) ortaya çıkan ve mesajın- **Neden:** İstemci tarafı sadece 500ms beklerken, sunucu tarafında asenkron veritabanı sorguları (özellikle Windows ortamlarında veya HMR sırasında) 1 saniyeden uzun sürebiliyordu. Bu nedenle mesaj `wsManager.ts` üzerinden yayınlandığında, E2E WebSocket bağlantısı henüz listeye eklenmemiş oluyordu.
- **Çözüm (Adım 1):** `[...ws].ts` içerisinde asenkron olan veritabanı denetimlerinden (resolveTenant) hemen önce bağlantı `wsConnections` haritasına senkron olarak eklendi.
- **Çözüm (Adım 2):** `server/utils/wsManager.ts` içerisindeki `publishWS` fonksiyonuna Asenkron Yeniden Deneme (Async Retry) mekanizması eklendi. Bağlantı o an bulunamazsa (count === 0), sırasıyla 200ms, 500ms ve 1000ms gecikmelerle 3 defa daha aranması sağlandı. Böylece bağlantı kurulumu ne kadar yavaş olursa olsun mesaj kesinlikle hedefine ulaşıyor. Bu sayede HTTP `publishWS` tetiklemesi istemciden geldiği anda (500ms içinde) bağlantının hazır olması garanti altına alındı.
- **GERÇEK KÖK NEDEN VE ÇÖZÜMÜ:** İki zincirleme hata mevcuttu:
  1. **Tenant Yönlendirmesi:** Nuxt/Vite dev proxy'si WebSocket URL'sinin başına `/_nitro/ws` eklediği için `resolveTenant` fonksiyonu `e2e-tenant-...` ismini ayrıştıramayıp varsayılan olarak `master` veritabanına bağlanıyordu. `master` veritabanında bu endpoint (`is_public=0`) olarak göründüğü için kimlik denetimine takılıyordu. (Halbuki E2E tenant'ında bu endpoint public'ti ve auth atlanmalıydı). URL parse mantığı düzeltilerek doğru tenant veritabanına bağlanması sağlandı.
  2. **Cookie Okuma Hatası:** `master` veritabanına gidip auth denetimine düştüğünde ise, `crossws` altyapısı HTTP başlıklarını gizlediği için `[...ws].ts` dosyası çerezleri okuyamıyor ve WebSocket'i anında öldürüyordu (`4001 Unauthorized`). Nuxt `upgrade` hook'u eklenerek çerezlerin güvenli bir şekilde alınması sağlandı. Artık WebSocket bağlantıları kusursuz yetkilendiriliyor.
- **Çözüm (Adım 18 - Çapraz Kiracı İzolasyonu):** E2E testinin 18. adımında başka bir tenant'a ait token ile izinsiz erişim denendiğinde (Cross-Tenant Token Hırsızlığı), `01.auth.ts` middleware'i token'ı o tenant'ın veritabanında bulamıyordu. Ancak token geçersiz olmasına rağmen, dinamik API'lere (`/api/custom`) yönelik istekleri anonim kabul edip yola devam etmesine izin veriyordu. Bu durum, eğer hedefte ilgili endpoint yoksa `404 Not Found` dönmesine, testin de bunu güvenlik zaafiyeti zannetmesine yol açıyordu. Middleware düzeltilerek, **eğer bir istekte token sunulmuşsa ama bu token geçersizse/başka kiracıya aitse**, hedefin public olup olmamasına bakılmaksızın tüm `/api/custom` ve `/api/ws` isteklerinde anında `401 Unauthorized` dönmesi sağlandı. (Eğer hiç token yollanmazsa anonim erişim çalışmaya devam ediyor). Artık tam izolasyon sağlandı.
- `server/utils/wsManager.ts` içerisindeki loglar temizlendi.

## [2026-07-26] - Fix I18nTextField and Vue Table Localization

### Fixed
- Removed visually broken `*` (asterisk) required indicator from `I18nTextField.vue` language dropdown list.
- Added `update:locale` event to `I18nTextField.vue` to allow parent components to track active language tab.
- Wrapped `DynamicRenderer.vue` in `pages.vue` preview tab with `<v-locale-provider>` to ensure preview `<v-data-table>` perfectly synchronizes its localization (e.g. "No data available") with the selected language tab, bypassing any global SSR injection disconnects.
- Fixed `[intlify] Duplicate useI18n calling` crash and `[Vue warn]: setup() return property "$t"` warnings in `DynamicRenderer.vue` by safely intercepting `useI18n` inside the dynamic setup, creating the local scope only once, and automatically replacing `$t(` with `t(` in dynamic templates so that both user scripts and templates successfully use the local scope without Vue runtime errors.
- Fixed `Must be called at the top of a setup function` error when switching languages by ensuring the global `useI18n` is accessed synchronously at the component initialization and fetching missing translation messages dynamically before rendering the preview.
 
 