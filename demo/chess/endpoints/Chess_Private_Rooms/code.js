try {
  if (payload.method === 'POST') {
    const result = await recordManager.createRecord(context.tenantSlug, 'chess_room', payload.body, context.userId);
    return { respond: true, status: 200, body: result };
  }
  return { respond: true, status: 405, body: { error: 'Method Not Allowed' } };
} catch(e) {
  return { respond: true, status: 500, body: { error: e.message } };
}