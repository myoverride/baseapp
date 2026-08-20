try {
  if (payload.method !== 'POST') return { respond: true, status: 200, body: { success: false, error: 'Sadece POST desteklenir' } };
  if (!payload.user || !payload.user.is_admin) return { respond: true, status: 403, body: { error: 'Yetkisiz erişim.' } };

  const { query } = payload.body || {};
  if (!query) return { respond: true, status: 200, body: { success: false, error: 'Çalıştırılacak SQL sorgusu boş olamaz.' } };

  let result;
  // Sandbox ortamında zaten erişilebilir olan (enjekte edilmiş) db objesini kullanıyoruz
  try {
    if (typeof db !== 'undefined') {
      result = typeof db.unsafe === 'function' ? await db.unsafe(query) : await sql([query]);
    } else if (typeof mainSql !== 'undefined') {
      result = typeof mainSql.unsafe === 'function' ? await mainSql.unsafe(query) : await mainSql([query]);
    } else {
      return { respond: true, status: 200, body: { success: false, error: 'Middleware context içinde veritabanı objesi (sql/mainSql) bulunamadı.' } };
    }
  } catch (err) {
    return { respond: true, status: 200, body: { success: false, error: err.message || String(err) } };
  }

  return { respond: true, status: 200, body: { success: true, data: result } };
} catch (error) {
  return { respond: true, status: 200, body: { success: false, error: error.message || String(error) } };
}