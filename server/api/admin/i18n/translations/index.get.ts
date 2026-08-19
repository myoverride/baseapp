import { useDB } from '../../../../utils/db';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const page = parseInt(query.page as string) || 1;
  const limit = parseInt(query.limit as string) || 10;
  const search = (query.search as string) || '';
  const sortBy = (query.sortBy as string) || 'key';
  const sortOrder = (query.sortOrder as string) || 'asc';
  
  const tenantSlug = event.context.tenantSlug || 'master';

  try {
    const keysMap = new Map<string, any>();

    // 1. Fetch translation keys from master first (for inheritance)
    const masterSql = useDB('master');
    const masterKeys = await masterSql.unsafe(`SELECT key, hashtags, created_at, updated_at FROM translation_keys`);
    for (const mk of masterKeys) {
      let tags = [];
      try { tags = typeof mk.hashtags === 'string' ? JSON.parse(mk.hashtags) : (mk.hashtags || []); } catch {}
      keysMap.set(mk.key, {
        key: mk.key,
        hashtags: tags,
        created_at: mk.created_at,
        updated_at: mk.updated_at,
        values: {},
        inherited_locales: new Set<string>()
      });
    }

    // 1.1 Fetch master translations
    const masterTrans = await masterSql.unsafe(`SELECT key, language_code, value FROM translations`);
    for (const mt of masterTrans) {
      if (keysMap.has(mt.key)) {
        const entry = keysMap.get(mt.key);
        entry.values[mt.language_code] = mt.value;
        if (tenantSlug !== 'master') {
          entry.inherited_locales.add(mt.language_code);
        }
      }
    }

    // 2. Fetch from tenant to override
    if (tenantSlug !== 'master') {
      const tenantSql = useDB(tenantSlug);
      
      const tenantKeys = await tenantSql.unsafe(`SELECT key, hashtags, created_at, updated_at FROM translation_keys`);
      for (const tk of tenantKeys) {
        let tags = [];
        try { tags = typeof tk.hashtags === 'string' ? JSON.parse(tk.hashtags) : (tk.hashtags || []); } catch {}
        if (!keysMap.has(tk.key)) {
          keysMap.set(tk.key, {
            key: tk.key,
            hashtags: tags,
            created_at: tk.created_at,
            updated_at: tk.updated_at,
            values: {},
            inherited_locales: new Set<string>()
          });
        } else {
          // Override metadata
          const entry = keysMap.get(tk.key);
          entry.hashtags = tags;
          entry.created_at = tk.created_at;
          entry.updated_at = tk.updated_at;
        }
      }

      const tenantTrans = await tenantSql.unsafe(`SELECT key, language_code, value FROM translations`);
      for (const tt of tenantTrans) {
        if (keysMap.has(tt.key)) {
          const entry = keysMap.get(tt.key);
          entry.values[tt.language_code] = tt.value;
          entry.inherited_locales.delete(tt.language_code);
        }
      }
    }

    // Convert map to array and apply search & sort in memory
    // (Optimization Note: For thousands of keys, this can be moved to direct SQL using CTEs,
    // but cross-database tenant overriding requires memory merge in SQLite unless ATTACH DATABASE is used.
    // For now, mapping from direct table is much faster and cleaner than parsing JSON).
    let items = Array.from(keysMap.values()).map(entry => {
      return {
        ...entry,
        is_inherited: entry.inherited_locales.size > 0 && entry.inherited_locales.size === Object.keys(entry.values).length,
        inherited_locales: Array.from(entry.inherited_locales)
      };
    });
    
    if (search) {
      const s = search.toLowerCase();
      items = items.filter((i: any) => {
        if (i.key.toLowerCase().includes(s)) return true;
        for (const val of Object.values(i.values)) {
          if (typeof val === 'string' && val.toLowerCase().includes(s)) return true;
        }
        if (i.hashtags && i.hashtags.some((h: string) => h.toLowerCase().includes(s))) return true;
        return false;
      });
    }

    items.sort((a: any, b: any) => {
      let va = a[sortBy];
      let vb = b[sortBy];
      if (sortBy !== 'key') {
        va = a.values[sortBy] || '';
        vb = b.values[sortBy] || '';
      }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortOrder === 'asc' ? -1 : 1;
      if (va > vb) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    const total = items.length;
    items = items.slice((page - 1) * limit, page * limit);

    return { success: true, data: items, pagination: { total, page, limit } };
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message });
  }
});
