import { useDB } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user || !user.is_admin) throw createError({ statusCode: 403, message: 'errors.unauthorized' });

  const sql = useDB(event.context.tenantSlug);

  try {
    const query = getQuery(event);
    const search = query.search ? String(query.search).trim() : '';

    const entities = await sql`SELECT id, name, schema FROM entities`;
    let records = [];

    const eavSubquery = `
      (
        SELECT json_group_object(
            rf.key, 
            CASE 
              WHEN rf.val_str IS NOT NULL THEN rf.val_str 
              WHEN rf.val_num IS NOT NULL THEN rf.val_num 
              WHEN rf.val_bool IS NOT NULL THEN json(CASE WHEN rf.val_bool = 1 THEN 'true' ELSE 'false' END) 
            END
        )
        FROM record_fields rf WHERE rf.record_id = records.id
      ) as data
    `;

    if (search) {
      records = await sql.unsafe(`
        SELECT id, entity_id, ${eavSubquery} 
        FROM records 
        WHERE EXISTS (SELECT 1 FROM record_fields rf WHERE rf.record_id = records.id AND (rf.val_str LIKE $1 OR CAST(rf.val_num AS TEXT) LIKE $1))
        LIMIT 500
      `, [`%${search}%`]);
    } else {
      records = await sql.unsafe(`SELECT id, entity_id, ${eavSubquery} FROM records LIMIT 500`);
    }
    
    return { entities, records };
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message });
  }
});
