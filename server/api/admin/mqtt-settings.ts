import { useDB } from '../../utils/db';
import { invalidateSysVarCache } from '../../utils/sysvars';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user || !user.is_admin) throw createError({ statusCode: 403, message: 'errors.unauthorized' });
  
  const method = event.node.req.method;
  const sql = useDB(event.context.tenantSlug);

  if (method === 'GET') {
    try {
      const vars = await sql`SELECT id, key, value FROM system_variables WHERE key IN ('MQTT_ADMIN_USER', 'MQTT_ADMIN_PASS')`;
      
      const result: any = {
        adminUser: '',
        adminPass: ''
      };
      
      vars.forEach((v: any) => {
        if (v.key === 'MQTT_ADMIN_USER') result.adminUser = v.value;
        if (v.key === 'MQTT_ADMIN_PASS') result.adminPass = v.value;
      });
      
      return result;
    } catch (err: any) {
      throw createError({ statusCode: 500, message: err.message });
    }
  }
  
  if (method === 'POST') {
    const body = await readBody(event);
    
    try {
      await sql.begin(async (tx: any) => {
        if (body.adminUser !== undefined) {
          await tx`
            INSERT INTO system_variables (key, value, description, is_admin, is_public) 
            VALUES ('MQTT_ADMIN_USER', ${body.adminUser}, 'MQTT Broker (Aedes) varsayılan admin kullanıcısı', 1, 0)
            ON CONFLICT(key) DO UPDATE SET value = ${body.adminUser}
          `;
        }
        if (body.adminPass !== undefined) {
          await tx`
            INSERT INTO system_variables (key, value, description, is_admin, is_public) 
            VALUES ('MQTT_ADMIN_PASS', ${body.adminPass}, 'MQTT Broker (Aedes) varsayılan admin şifresi', 1, 0)
            ON CONFLICT(key) DO UPDATE SET value = ${body.adminPass}
          `;
        }
      });
      
      invalidateSysVarCache(event.context.tenantSlug);
      return { success: true, message: 'message.saved' };
    } catch (err: any) {
      throw createError({ statusCode: 500, message: err.message });
    }
  }
});
