import { useDB } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const sql = useDB(event.context.tenantSlug);
  const tags = new Set<string>();

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
      const rows = await sql.unsafe(`SELECT hashtags FROM ${table} WHERE hashtags IS NOT NULL AND hashtags != '[]' AND hashtags != ''`);
      for (const row of rows) {
        if (!row.hashtags) continue;
        let arr = [];
        try {
          arr = typeof row.hashtags === 'string' ? JSON.parse(row.hashtags) : row.hashtags;
        } catch { continue; }
        
        if (Array.isArray(arr)) {
          arr.forEach(t => {
            if (t && typeof t === 'string') {
              // Eğer başında # varsa da yoksa da temiz tutabiliriz, ama kullanıcının girdiği gibi gösterelim
              tags.add(t);
            }
          });
        }
      }
    } catch (e) {
      // Table might not exist or error, just continue
    }
  }

  return Array.from(tags).sort();
});
