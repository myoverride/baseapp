try {
  if (payload.method === 'GET') {
    const query = payload.query || {};
    const result = await recordManager.getRecords(context.tenantSlug, 'chess_room', query);
    return { respond: true, status: 200, body: result };
  }
  return { respond: true, status: 405, body: { error: 'Method Not Allowed' } };
} catch(e) {
  return { respond: true, status: 500, body: { error: e.message } };
}