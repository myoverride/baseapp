try {
  // 1. WebSocket Endpoint'inin veritabanında (ws_endpoints) bulunduğundan emin olalım
  // Multi-tenant yapıda doğru endpoint yolu /meet olmalıdır.
  // 2. Client'lardan gelen Sinyal Mesajlarını Al ve Native WebSocket ile Herkese Dağıt
  if (payload.method === 'POST') {
    // Tenant izole edilmiş broadcast ağında mesajları dağıt
    publishWS('/api/ws/meet', payload.body);
    return { respond: true, status: 200, body: { success: true } };
  }

  return { respond: true, status: 404, body: { error: 'Not Found' } };
} catch (e) {
  return { respond: true, status: 500, body: { error: e.message } };
}