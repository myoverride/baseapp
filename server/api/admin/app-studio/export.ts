import { useDB } from '../../../utils/db';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const tagsParam = (query.tags as string || query.tag as string || '').trim();

  if (!tagsParam) {
    throw createError({ statusCode: 400, message: 'errors.appTagsRequired' });
  }

  const tags = tagsParam.split(',').map(t => t.trim()).filter(Boolean);

  const sql = useDB(event.context.tenantSlug);
  
  const likeTags = tags.map(t => `%\"${t}\"%`);
  const whereClause = tags.map((_, i) => `hashtags LIKE $${i + 1}`).join(' AND ');

  const components: Record<string, any[]> = {};

  const tables = [
    'system_variables',
    'roles',
    'users',
    'languages',
    'translation_keys',
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
      // records tablosu entity_slug ile birlikte gelse iyi olur, import ederken işe yarar
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
          WHERE ${whereClause.replace(/hashtags LIKE/g, 'r.hashtags LIKE')}
        `;
        components[table] = await sql.unsafe(query, likeTags);
      } else if (table === 'languages') {
        let matchingKeys: string[] = [];
        try {
          const transKeys = await sql.unsafe(`SELECT key FROM translation_keys WHERE ${whereClause}`, likeTags);
          matchingKeys = transKeys.map((k: any) => k.key);
        } catch (e) {}

        let langs = [];
        if (matchingKeys.length > 0) {
          langs = await sql.unsafe(`SELECT * FROM languages`);
        } else {
          langs = await sql.unsafe(`SELECT * FROM languages WHERE ${whereClause}`, likeTags);
        }

        const processedLangs = [];
        for (const lang of langs) {
          let isLangTagged = false;
          try {
            const langHashtags = typeof lang.hashtags === 'string' ? JSON.parse(lang.hashtags) : (lang.hashtags || []);
            isLangTagged = tags.some(t => langHashtags.includes(t));
          } catch (e) {}

          let transObj: any = {};
          try {
            transObj = typeof lang.translations === 'string' ? JSON.parse(lang.translations) : (lang.translations || {});
          } catch (e) {}

          if (!isLangTagged && matchingKeys.length > 0) {
            const filteredTrans: any = {};
            for (const k of matchingKeys) {
              if (transObj[k] !== undefined) {
                filteredTrans[k] = transObj[k];
              }
            }
            lang.translations = JSON.stringify(filteredTrans);
            
            if (Object.keys(filteredTrans).length > 0) {
              processedLangs.push(lang);
            }
          } else if (isLangTagged) {
            processedLangs.push(lang);
          }
        }
        components[table] = processedLangs;
      } else if (table === 'entities') {
        const ents = await sql.unsafe(`SELECT * FROM ${table} WHERE ${whereClause}`, likeTags);
        for (let i = 0; i < ents.length; i++) {
          if (ents[i].schema) {
            try {
              const schemaObj = typeof ents[i].schema === 'string' ? JSON.parse(ents[i].schema) : ents[i].schema;
              for (const [key, field] of Object.entries(schemaObj)) {
                const f: any = field;
                if (f.type === 'relation' && f.targetEntityId) {
                  const targetEnt = await sql.unsafe(`SELECT slug FROM entities WHERE id = $1 LIMIT 1`, [f.targetEntityId]);
                  if (targetEnt.length > 0) {
                    f.targetEntitySlug = targetEnt[0].slug;
                  }
                }
              }
              ents[i].schema = JSON.stringify(schemaObj);
            } catch (e) {
              console.error('Failed to parse schema for export', e);
            }
          }
        }
        components[table] = ents;
      } else {
        components[table] = await sql.unsafe(`SELECT * FROM ${table} WHERE ${whereClause}`, likeTags);
      }
    } catch (e) {
      console.error(`Export error for table ${table}:`, e);
      components[table] = [];
    }
  }

  return {
    app_name: tags.map(t => t.replace('#', '')).join(', ').toUpperCase() + ' App',
    tag: tagsParam,
    export_date: new Date().toISOString(),
    components
  };
});
