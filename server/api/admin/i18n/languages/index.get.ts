import { useDB } from '../../../../utils/db';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user) {
    throw createError({ statusCode: 401, message: 'errors.loginRequired' });
  }
  if (!user.is_admin && !user.is_super_admin) {
    throw createError({ statusCode: 403, message: 'errors.forbiddenAdminOnly' });
  }

  const tenantSlug = event.context.tenantSlug || 'master';
  const query = getQuery(event);
  const page = parseInt(query.page as string) || 1;
  const limit = parseInt(query.limit as string) || 10;
  const search = (query.search as string) || '';
  const sortBy = (query.sortBy as string) || 'code';
  const sortOrder = (query.sortOrder as string) || 'asc';

  try {
    const localesMap = new Map<string, any>();

    // 1. Fetch from master first
    const masterSql = useDB('master');
    const masterLocales = await masterSql`SELECT * FROM languages`;
    
    for (const loc of masterLocales) {
      delete loc.translations;
      localesMap.set(loc.code, { ...loc, is_inherited: tenantSlug !== 'master' });
    }

    // 2. Fetch from tenant to override
    if (tenantSlug !== 'master') {
      const tenantSql = useDB(tenantSlug);
      const tenantLocales = await tenantSql`SELECT * FROM languages`;
      
      for (const loc of tenantLocales) {
        delete loc.translations;
        localesMap.set(loc.code, { ...loc, is_inherited: false });
      }
    }

    let items = Array.from(localesMap.values());

    if (search) {
      const s = search.toLowerCase();
      items = items.filter((i: any) => 
        i.code.toLowerCase().includes(s) || 
        i.name.toLowerCase().includes(s)
      );
    }

    items.sort((a: any, b: any) => {
      let va = a[sortBy];
      let vb = b[sortBy];
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
