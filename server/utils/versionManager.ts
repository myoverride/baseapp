export const versionCache: Record<string, number> = {};

export const getGlobalVersion = (tenantSlug: string = 'master') => {
  if (!versionCache[tenantSlug]) {
    versionCache[tenantSlug] = Date.now();
  }
  return versionCache[tenantSlug];
};

export const bumpGlobalVersion = (tenantSlug: string = 'master') => {
  versionCache[tenantSlug] = Date.now();
  return versionCache[tenantSlug];
};
