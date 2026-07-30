import { LRUCache } from 'lru-cache';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitCache = new LRUCache<string, RateLimitRecord>({
  max: 10000,
  ttl: 60 * 60 * 1000, // En fazla 1 saat RAM'de kalır
});

/**
 * Belirli bir anahtar için (örneğin IP adresi) hız sınırını kontrol eder.
 * @param key Benzersiz kilit anahtarı (örn: 'login_192.168.1.1')
 * @param limit İzin verilen maksimum istek sayısı
 * @param windowMs Zaman penceresi (milisaniye cinsinden)
 * @returns {boolean} Sınır aşılmadıysa true, aşıldıysa false döner.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  let record = rateLimitCache.get(key);

  if (!record || now > record.resetTime) {
    // Kayıt yoksa veya süresi dolduysa yenisini oluştur
    record = { count: 1, resetTime: now + windowMs };
    rateLimitCache.set(key, record);
    return true;
  }

  record.count += 1;
  
  if (record.count > limit) {
    return false; // Sınır aşıldı
  }
  
  return true;
}
