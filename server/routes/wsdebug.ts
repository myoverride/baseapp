export default defineEventHandler(async (event) => {
  const { wsConnections, publishWS } = await import('../utils/wsManager');
  const count = await publishWS('e2e-tenant-55471', '/custom/echo', { test: true });
  const connections = Array.from(wsConnections.values()).map(info => ({
    tenantSlug: info.tenantSlug,
    endpointPath: info.endpointPath,
    peerId: info.peer?.id
  }));
  return {
    success: true,
    size: wsConnections.size,
    count,
    connections
  };
});