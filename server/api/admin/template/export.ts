import { useDB } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const sql = useDB(event.context.tenantSlug);
  const components: Record<string, any[]> = {};

  const tables = [
    'system_variables',
    'roles',
    'users',
    'languages',
    'translations',
    'utils',
    'entities',
    'records',
    'endpoints',
    'workers',
    'devices',
    'pages'
  ];

  for (const table of tables) {
    try {
      if (table === 'records') {
        const query = `
          SELECT r.*, e.slug as entity_slug,
          (
            SELECT json_group_object(
                rf.key, 
                CASE 
                  WHEN rf.val_str IS NOT NULL THEN rf.val_str 
                  WHEN rf.val_num IS NOT NULL THEN rf.val_num 
                  WHEN rf.val_bool IS NOT NULL THEN json(CASE WHEN rf.val_bool = 1 THEN 'true' ELSE 'false' END) 
                END
            )
            FROM record_fields rf WHERE rf.record_id = r.id
          ) as data
          FROM records r
          JOIN entities e ON r.entity_id = e.id
        `;
        components[table] = await sql.unsafe(query);
      } else {
        components[table] = await sql.unsafe(`SELECT * FROM ${table}`);
      }
    } catch (e) {
      console.error(`Export error for table ${table}:`, e);
      components[table] = [];
    }
  }

  return { components };
});
