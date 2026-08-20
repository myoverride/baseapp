try {
  if (payload.method === 'POST') {
    publishWS('/api/ws/radio', payload.body);
    return { respond: true, status: 200, body: { success: true } };
  }

  return { respond: true, status: 404, body: { error: 'Not Found' } };
} catch (e) {
  return { respond: true, status: 500, body: { error: e.message } };
}