# IIoT Platform — Kritik Sorunlar (Trade-off Olmayan Gerçek Hatalar)

> **Tarih:** 2026-07-26  
> **Kaynak:** `report.md` (tam audit raporu) içinden filtrelenmiştir.  
> **Kriter:** Yalnızca "kasıtlı tasarım kararı" veya "on-premise trade-off" **olmayan**, gerçek mimari/işlevsel sorunlar listelenmiştir.

---

## Özet

Tam rapordaki 12 bulgdan **4 tanesi** gerçek sorun olarak sınıflandırılmıştır:

| # | Sorun | Dosya | Seviye |
|---|-------|-------|--------|
| S3 | Zombie child process riski | sandbox.ts | 🔴 Yüksek |
| S7 | Worker'da VM timeout eksikliği | worker.js | 🔴 Yüksek |
| S8 | Worker kodu doğrulanmadan çalıştırılıyor | workerManager.ts | 🟡 Orta |
| S4 | Sandbox cache kod değişikliğinde temizlenmiyor | sandbox.ts | 🟡 Orta |

> [!NOTE]
> **Elenen bulgular:** S1, S2, S5, S6 (process/require erişimi — kasıtlı on-premise kararı), S9 (boş context ile etkisiz), S10 (tasarım gereği DB erişimi), S11 (scoped CSS — işlevsel gereksinim), S12 (Blob URL — iyi tasarlanmış).

---

## S3 — Zombie Child Process Riski 🔴

**Dosya:** [sandbox.ts](file:///C:/Users/murat/Desktop/iiotplatform/server/utils/sandbox.ts)  
**Satırlar:** 408-414, 424-427

### Sorunun Tanımı

Sandbox timeout'u tetiklendiğinde `abortController.abort()` çağrılır. Bu mekanizma yalnızca şu işlemleri iptal edebilir:
- `fetch()` çağrıları (signal parametresi ile)
- `safeSleep()` çağrıları (signal listener ile)
- DB sorguları (Proxy'deki abort kontrolü ile)

**İptal EDİLEMEYEN işlemler:**
- `require('child_process').exec('some-command')` — OS process olarak ayrı çalışır
- `require('child_process').spawn(...)` — aynı şekilde
- `require('net').createServer(...)` — açık TCP soketleri
- `require('fs').createReadStream(...)` — açık dosya handle'ları

### Gerçek Senaryo

```javascript
// Sandbox kodunda:
const { exec } = require('child_process');
exec('ping -c 1000 google.com'); // 1000 ping atar

// Sandbox 5 saniye sonra timeout olur ve Promise.race onu "tamamlandı" sayar.
// Ancak ping komutu arka planda dakikalarca çalışmaya devam eder.
```

### Etki

Yanlışlıkla yazılan uzun ömürlü OS komutları birikerek:
- Sistem kaynaklarını (CPU, RAM, file descriptor) tüketir
- Ana sunucu process'i bu zombie'lerden habersizdir
- Tekrarlayan sandbox çalıştırmalarında (MQTT telemetri gibi yüksek frekanslı tetikleyiciler) zombie sayısı hızla çoğalabilir

### Önerilen Çözüm

Sandbox context'ine verilen `process` objesini bir Proxy ile sararak, `child_process` referanslarını takip etmek ve timeout'ta bunların PID'lerini `process.kill()` ile sonlandırmak. Alternatif olarak, sandbox'ta `require('child_process')` çağrısını izleyen bir wrapper oluşturulabilir.

---

## S7 — Worker'da VM Timeout Eksikliği 🔴

**Dosya:** [worker.js](file:///C:/Users/murat/Desktop/iiotplatform/server/utils/worker.js)  
**Satırlar:** 226-227

### Sorunun Tanımı

```javascript
// worker.js satır 226-227:
const script = new vm.Script(wrappedCode);
await script.runInContext(context);  // ← timeout parametresi YOK
```

sandbox.ts'te `script.runInContext(context, { timeout: timeoutMs })` kullanılırken, worker.js'te bu parametre atlanmış. Bu, senkron sonsuz döngülerin worker process'i **sonsuza kadar** bloke etmesi anlamına gelir.

### Hafifletici Faktörler (Kısmen)

- **Daemon worker'lar:** `--max-old-space-size=50` ile bellek sınırı var — sonsuz döngü bellek tüketiyorsa (array push gibi) OOM ile çıkar. **Ancak** CPU-bound sonsuz döngüler (`while(true) {}`) bellek tüketmez ve OOM'u tetiklemez.
- **Cron worker'lar:** workerManager.ts'te 60 saniyelik `SIGKILL` hard-timeout var — bu yalnızca cron worker'lar için geçerli, daemon'lar bu korumadan yararlanmaz.

### Gerçek Senaryo

```javascript
// Daemon worker kodunda yanlışlıkla:
while(true) {
  // await olmayan sonsuz döngü
  // Bu satır CPU'yu %100 kullanır ve worker sonsuza kadar bloke olur
}
```

### Etki

- Daemon worker sonsuza kadar yaşar, CPU çekirdeğini %100 kullanır
- `--max-old-space-size=50` bu durumu **yakalamaz** (bellek artmıyor)
- workerManager auto-restart mekanizması **çalışmaz** çünkü process çökmüyor, sadece bloke oluyor
- Manuel müdahale (admin panelinden "Stop Worker" veya `kill` komutu) gerekir

### Önerilen Çözüm

`script.runInContext(context)` çağrısına `{ timeout: 300000 }` (5 dakika) gibi bir senkron timeout eklemek. Daemon'ların doğası gereği uzun çalışması beklenir, ancak bu timeout yalnızca **senkron blokajı** yakalar — asenkron döngüler (await içeren) zaten normal şekilde çalışmaya devam eder.

---

## S8 — Worker Kodu Doğrulanmadan Çalıştırılıyor 🟡

**Dosya:** [workerManager.ts](file:///C:/Users/murat/Desktop/iiotplatform/server/utils/workerManager.ts)  
**Satır:** 184

### Sorunun Tanımı

```typescript
// workerManager.ts satır 184:
const code = codeOverride || workerRow[0].code;
// Doğrudan worker.js'e gönderiliyor — validateJS() çağrılmıyor
```

Admin panelinden "Test Çalıştır" yapıldığında `validateJS()` çağrılır ([test-run.post.ts satır 26-29](file:///C:/Users/murat/Desktop/iiotplatform/server/api/admin/sandbox/test-run.post.ts#L26-L29)), ancak gerçek `startDaemonWorker()` ve cron çalıştırmalarında bu doğrulama **yapılmıyor**.

### Gerçek Senaryo

1. Geliştirici DB'ye doğrudan (`INSERT INTO workers ...`) geçersiz JavaScript yazar
2. Sunucu yeniden başlatılır, `initDaemonWorkers()` tüm `autostart=1` olan worker'ları başlatır
3. Geçersiz syntax'a sahip worker fork edilir, anında çöker, auto-restart devreye girer
4. 5 çökmeden sonra worker "BANNED" olur

### Etki

- Her çökme bir `fork()` + `process.exit(1)` döngüsü yaratır (5 kez, 5 saniye aralıkla)
- 25 saniyelik bir crash-loop sonrasında worker ban'lanır ve durur
- Gerçek dünyada ciddi bir sorun değil çünkü auto-restart mekanizması bunu 25 saniyede durdurur
- Ancak bu 25 saniye boyunca gereksiz kaynak tüketimi (fork + OOM kill) oluşur

### Önerilen Çözüm

`startDaemonWorker()` fonksiyonunun başına bir `validateJS(code)` çağrısı eklemek. Geçersiz syntax tespit edilirse worker fork bile edilmeden hata döndürmek ve durumu `error` olarak işaretlemek.

---

## S4 — Sandbox Cache Kod Değişikliğinde Temizlenmiyor 🟡

**Dosya:** [sandbox.ts](file:///C:/Users/murat/Desktop/iiotplatform/server/utils/sandbox.ts)  
**Satır:** 55, 169-188

### Sorunun Tanımı

```typescript
// Satır 55: Cache tanımı
const compileCache = new LRUCache<string, vm.Script>({ max: 1000 });

// Satır 169-170: Cache key oluşturma
const scriptHash = crypto.createHash('md5').update(scriptCode).digest('hex');
const cacheKey = sourceId || scriptHash;
```

Cache key olarak `sourceId` (örn: `master_42`) kullanılıyor. Aynı `sourceId`'ye sahip endpoint/worker'ın kodu değiştiğinde, cache'teki **eski derlenmiş script** hâlâ kullanılır.

### Gerçek Senaryo

1. Endpoint #42 için kod yazılır → cache'e `master_42` key'i ile eklenir
2. Admin panelinden kod güncellenir
3. Yeni HTTP isteği gelir → cache'te `master_42` bulunur → **eski kod** çalışır
4. Cache TTL'i olmadığı için (LRU sadece max'e göre evict yapar) bu durum sunucu yeniden başlatılana kadar sürer

### Hafifletici Faktör

- `clearSandboxCache()` fonksiyonu mevcut ([satır 454-461](file:///C:/Users/murat/Desktop/iiotplatform/server/utils/sandbox.ts#L454-L461)) — ancak endpoint/worker güncelleme API'sinden çağrılıp çağrılmadığı kontrol edilmeli.

### Önerilen Çözüm

Endpoint/worker güncelleme API handler'larında `clearSandboxCache(sourceId)` çağrısı yapılıyorsa sorun yoktur. Yapılmıyorsa, cache key'ini `${tenantSlug}_${sourceId}_${scriptHash}` olarak değiştirmek veya güncelleme sonrası cache invalidation eklemek.

---

## Trade-off Olan ve Elenen Bulgular (Referans)

Aşağıdaki bulgular kasıtlı tasarım kararı veya on-premise bağlamda kabul edilebilir trade-off olarak değerlendirilip bu rapordan **çıkarılmıştır**:

| # | Bulgu | Neden Elendi |
|---|-------|-------------|
| S1 | `process` sandbox'ta | On-premise tasarım kararı — kod yorumunda açıkça "kısıtlamalar kaldırılmıştır" yazıyor |
| S2 | `require` sandbox'ta | Aynı — `fs` ve `child_process` erişimi kasıtlı olarak verilmiş |
| S5 | Worker'da `process` | S1'in fork process versiyonu — izole process'te olduğu için daha da düşük risk |
| S6 | Worker'da `require` | S2'nin fork process versiyonu |
| S9 | Regex yasak kelime bypass | Boş context (`{}`) nedeniyle bypass edilecek bir şey yok |
| S10 | Utility DB erişimi | Tasarım gereği — utility'ler DB ile çalışmak için var |
| S11 | `innerHTML` CSS | Scoped CSS mekanizması ile sınırlandırılmış, işlevsel gereksinim |
| S12 | Blob URL import | İyi tasarlanmış eval alternatifi, sorun değil |
