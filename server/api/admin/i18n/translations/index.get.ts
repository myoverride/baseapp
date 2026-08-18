import { useDB } from '../../../../utils/db';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user) {
    throw createError({ statusCode: 401, message: 'errors.loginRequired' });
  }
  if (!user.is_admin && !user.is_super_admin) {
    throw createError({ statusCode: 403, message: 'errors.forbiddenAdminOnly' });
  }

  const query = getQuery(event);
  const page = parseInt(query.page as string) || 1;
  const limit = parseInt(query.limit as string) || 10;
  const search = (query.search as string) || '';
  const sortBy = (query.sortBy as string) || 'key';
  const sortOrder = (query.sortOrder as string) || 'asc';
  
  const tenantSlug = event.context.tenantSlug || 'master';

  try {
    const keysMap = new Map<string, any>();

    // Helper to process languages table rows
    const processLanguages = (langs: any[], isMaster: boolean) => {
      for (const lang of langs) {
        const locale = lang.code;
        let transObj: Record<string, string> = {};
        if (lang.translations) {
          try {
            transObj = typeof lang.translations === 'string' ? JSON.parse(lang.translations) : lang.translations;
          } catch (e) {
            console.error('Failed to parse translations for', locale, e);
          }
        }

        for (const [key, value] of Object.entries(transObj)) {
          if (!keysMap.has(key)) {
            keysMap.set(key, { key, values: {}, inherited_locales: new Set<string>() });
          }
          const entry = keysMap.get(key);
          entry.values[locale] = value;
          
          if (isMaster && tenantSlug !== 'master') {
            entry.inherited_locales.add(locale);
          } else if (!isMaster) {
            entry.inherited_locales.delete(locale);
          }
        }
      }
    };

    // 1. Fetch from master first
    const masterSql = useDB('master');
    const masterLangs = await masterSql`SELECT code, translations FROM languages`;
    processLanguages(masterLangs, true);

    // 2. Fetch from tenant to override
    if (tenantSlug !== 'master') {
      const tenantSql = useDB(tenantSlug);
      const tenantLangs = await tenantSql`SELECT code, translations FROM languages`;
      processLanguages(tenantLangs, false);
    }

    // 3. Fetch translation_keys (hashtags, created_at, updated_at)
    const tenantSql = useDB(tenantSlug);
    let transKeys: any[] = [];
    try {
      transKeys = await tenantSql.unsafe('SELECT * FROM translation_keys');
    } catch (e) {
      // Table might not exist yet if migration failed or fresh DB
    }
    const metaMap = new Map<string, any>();
    for (const tk of transKeys) {
      let tags = [];
      try {
        tags = typeof tk.hashtags === 'string' ? JSON.parse(tk.hashtags) : (tk.hashtags || []);
      } catch (e) {
        tags = [];
      }
      metaMap.set(tk.key, { hashtags: tags, created_at: tk.created_at, updated_at: tk.updated_at });
    }

    let items = Array.from(keysMap.values()).map(entry => {
      const meta = metaMap.get(entry.key) || { hashtags: [], created_at: null, updated_at: null };
      return {
        ...entry,
        hashtags: meta.hashtags,
        created_at: meta.created_at,
        updated_at: meta.updated_at,
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
