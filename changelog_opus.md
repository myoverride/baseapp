# Changelog (Opus) — 2026-07-26

## Dinamik Kod Çalıştırma Kritik Sorunlar Düzeltmesi

`report_crit.md` raporundaki 4 kritik sorun düzeltildi. 5 dosyada toplam değişiklik yapıldı.

---

### S3 — Zombie Child Process Koruması
**Dosya:** `server/utils/sandbox.ts`

**Sorun:** Sandbox timeout'u tetiklendiğinde `abortController.abort()` yalnızca `fetch` ve `sleep` işlemlerini iptal edebiliyordu. `require('child_process').exec()` ile başlatılan OS process'leri zombie olarak kalıyordu.

**Çözüm:**
- Sandbox'a verilen `require` fonksiyonu bir proxy wrapper (`sandboxRequire`) ile sarıldı
- `child_process` veya `node:child_process` modülü require edildiğinde, dönen modülün `exec`, `execFile`, `spawn`, `fork` metotları izleniyor
- Başlatılan her child process'in PID'i `spawnedPids` Set'ine kaydediliyor
- Process normal şekilde çıktığında (`exit` event) PID Set'ten siliniyor
- Sandbox timeout'unda, `abortController.abort()` çağrısından sonra Set'teki tüm PID'ler `process.kill(pid)` ile sonlandırılıyor

---

### S7 — Worker VM Senkron Timeout
**Dosya:** `server/utils/worker.js`

**Sorun:** `vm.Script.runInContext()` çağrısında `timeout` parametresi yoktu. Senkron sonsuz döngüler (`while(true) {}`) worker process'i sonsuza kadar bloke edebiliyordu.

**Çözüm:**
- `script.runInContext(context, { timeout: vmTimeout })` olarak güncellendi
- Cron worker'lar için: **55 saniye** (workerManager'daki 60s SIGKILL'den 5s önce)
- Daemon worker'lar için: **300 saniye** (5 dakika — senkron blokajı yakalar, asenkron `await` döngülerine müdahale etmez)

---

### S8 — Worker Başlatma Öncesi Sözdizimi Doğrulama
**Dosya:** `server/utils/workerManager.ts`

**Sorun:** `startDaemonWorker()` fonksiyonunda worker kodu DB'den alınıp doğrudan fork ediliyordu. Geçersiz syntax'a sahip kod anlık çökme → auto-restart döngüsüne neden oluyordu.

**Çözüm:**
- `fork()` çağrısından önce `validateJS(code)` ile sözdizimi doğrulaması eklendi
- Geçersiz kod tespit edilirse worker fork **edilmiyor**
- Status `error` olarak DB'ye yazılıyor ve hata mesajı döndürülüyor
- Gereksiz `fork() → crash → restart` döngüsü önleniyor

---

### S4 — Sandbox Compile Cache Invalidation
**Dosyalar:** `server/api/admin/endpoints/[id].ts`, `server/api/admin/workers/[id].ts`

**Sorun:** Endpoint veya worker kodu güncellendiğinde, sandbox'taki `compileCache` (LRU) eski derlenmiş `vm.Script` nesnesini tutmaya devam ediyordu. Yeni kod sunucu yeniden başlatılana kadar etkili olmuyordu.

**Çözüm:**
- Her iki API handler'ının PUT (güncelleme) ve DELETE (silme) işlemlerine `clearSandboxCache()` çağrısı eklendi
- `clearSandboxCache` fonksiyonu `sandbox.ts`'ten import edildi
- Endpoint cache invalidation (`invalidateEndpointCache`) ve cron cache refresh (`refreshCronCache`) çağrılarının hemen yanına eklendi
