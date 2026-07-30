import { useDB } from './db';
import { bumpGlobalVersion } from './versionManager';

// Cache structure: tenantSlug -> Map<string, any>
const sysVarCache = new Map<string, Map<string, any>>();

export const invalidateSysVarCache = (tenantSlug: string) => {
  sysVarCache.delete(tenantSlug);
  bumpGlobalVersion(tenantSlug);
  if (tenantSlug === 'master') {
    // If master is invalidated, invalidate all tenants since they inherit from master
    sysVarCache.clear();
    // We should ideally bump version for all tenants here, but bumping master is a good start.
  }
};

const getCachedVars = async (tenantSlug: string) => {
  if (sysVarCache.has(tenantSlug)) {
    return sysVarCache.get(tenantSlug)!;
  }

  const varsMap = new Map<string, any>();

  // 1. Fetch from master first
  const masterSql = useDB('master');
  const masterRows = await masterSql`SELECT * FROM system_variables`;
  
  for (const row of masterRows) {
    varsMap.set(row.key, { ...row, is_inherited: tenantSlug !== 'master' });
  }

  // 2. Fetch from tenant to override
  if (tenantSlug !== 'master') {
    const tenantSql = useDB(tenantSlug);
    const tenantRows = await tenantSql`SELECT * FROM system_variables`;
    
    for (const row of tenantRows) {
      varsMap.set(row.key, { ...row, is_inherited: false });
    }
  }

  sysVarCache.set(tenantSlug, varsMap);
  return varsMap;
};

/**
 * Gets a system variable for a specific tenant.
 * If the variable is not defined in the tenant's db, it falls back to the master tenant.
 *
 * @param tenantSlug The tenant's slug
 * @param key The key of the system variable
 * @param allowSecret If true, returns the actual value even if it is a secret. Usually true for backend use, false for UI.
 * @param defaultValue Default value if not found in both tenant and master
 * @returns The value of the system variable
 */
export const getSysVar = async (tenantSlug: string, key: string, allowSecret: boolean = false, defaultValue: any = null) => {
  const varsMap = await getCachedVars(tenantSlug);
  const row = varsMap.get(key);

  if (row) {
    if (row.is_secret && !allowSecret) {
      return '********';
    }
    return row.value;
  }

  return defaultValue;
};

/**
 * Gets all system variables for a tenant, including inherited ones from master.
 * Tenant's variables override master's variables.
 * 
 * @param tenantSlug The tenant's slug
 * @param allowSecret If true, includes actual values of secrets. False will mask them.
 */
export const getAllSysVars = async (tenantSlug: string, allowSecret: boolean = false) => {
  const varsMap = await getCachedVars(tenantSlug);
  const result = [];

  for (const [key, row] of varsMap.entries()) {
    let val = row.value;
    if (row.is_secret && !allowSecret) {
      val = '********';
    }
    result.push({ ...row, value: val });
  }

  return result;
};
