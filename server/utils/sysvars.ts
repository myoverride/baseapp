import { useDB } from './db';
import { bumpGlobalVersion } from './versionManager';
import { LRUCache } from 'lru-cache';

// Master cache specifically for master variables to avoid duplicating them in memory
const masterCache = new Map<string, any>();
let isMasterFetched = false;

// LRU Cache for tenants to avoid memory leaks with thousands of tenants
const tenantCache = new LRUCache<string, Map<string, any>>({
  max: 1000
});

export const invalidateSysVarCache = (tenantSlug: string) => {
  bumpGlobalVersion(tenantSlug);
  if (tenantSlug === 'master') {
    isMasterFetched = false;
    masterCache.clear();
  } else {
    tenantCache.delete(tenantSlug);
  }
};

const fetchMasterVars = async () => {
  if (isMasterFetched) return masterCache;
  const masterSql = useDB('master');
  const masterRows = await masterSql`SELECT * FROM system_variables`;
  masterCache.clear();
  for (const row of masterRows) {
    masterCache.set(row.key, row);
  }
  isMasterFetched = true;
  return masterCache;
};

const getCachedVars = async (tenantSlug: string) => {
  const masterMap = await fetchMasterVars();
  const merged = new Map<string, any>();

  for (const [k, v] of masterMap.entries()) {
    merged.set(k, { ...v, is_inherited: tenantSlug !== 'master' });
  }

  if (tenantSlug === 'master') {
    return merged;
  }

  let tCache = tenantCache.get(tenantSlug);
  if (!tCache) {
    tCache = new Map<string, any>();
    const tenantSql = useDB(tenantSlug);
    const tenantRows = await tenantSql`SELECT * FROM system_variables`;
    for (const row of tenantRows) {
      tCache.set(row.key, { ...row, is_inherited: false });
    }
    tenantCache.set(tenantSlug, tCache);
  }

  for (const [k, v] of tCache.entries()) {
    merged.set(k, v);
  }

  return merged;
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
