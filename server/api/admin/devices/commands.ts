import crypto from 'node:crypto';
import { publishMQTT } from '../../../utils/mqtt';
import { getAllCommands, addCommand, updateCommandStatus } from '../../../utils/deviceCommands';

export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  const tenantSlug = event.context.tenantSlug;

  if (method === 'GET') {
    const query = getQuery(event);
    const deviceId = query.deviceId as string;

    if (!deviceId) {
      throw createError({ statusCode: 400, message: 'errors.validationFailed' });
    }

    try {
      const commands = getAllCommands(tenantSlug, deviceId);
      return commands;
    } catch (error: any) {
      throw createError({ statusCode: 500, message: 'errors.commandSendFailed' });
    }
  }

  if (method === 'POST') {
    const body = await readBody(event);
    const { deviceId, command, payload } = body;

    if (!deviceId || !command) {
      throw createError({ statusCode: 400, message: 'errors.validationFailed' });
    }

    const correlationId = crypto.randomUUID();
    const commandPayload = payload || {};

    try {
      // 1. RAM Store'a PENDING olarak ekle
      addCommand(tenantSlug, {
        id: correlationId,
        device_id: deviceId,
        command_name: command,
        payload: commandPayload,
        status: 'PENDING',
        response: null,
        correlation_id: correlationId,
        created_at: new Date(),
        updated_at: new Date()
      });

      // 2. MQTT Ã¼zerinden komutu gÃ¶nder
      const mqttPayload = JSON.stringify({
        command,
        payload: commandPayload,
        correlationId
      });

      const publishSuccess = publishMQTT(`${tenantSlug}/commands/${deviceId}`, mqttPayload);

      if (publishSuccess) {
        // Durumu SENT yap
        updateCommandStatus(tenantSlug, correlationId, 'SENT');
        
        // RAM tabanlÄ± timeout sayacÄ±nÄ± baÅŸlat
        // RAM tabanlı timeout sayacını başlat
        const { scheduleCommandTimeout } = await import('../../../utils/deviceCommands');
        scheduleCommandTimeout(tenantSlug, correlationId);
        
        return { success: true, correlationId, status: 'SENT' };
      } else {
        updateCommandStatus(tenantSlug, correlationId, 'FAILED', { error: 'MQTT Broker Unavailable' });
        throw createError({ statusCode: 503, message: 'errors.mqttBrokerUnavailable', data: { correlationId } });
      }

    } catch (error: any) {
      throw createError({ statusCode: 500, message: 'errors.commandSendFailed' });
    }
  }
});
