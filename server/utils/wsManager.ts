let connections: Map<string, any> = (globalThis as any).__wsConnections;
if (!connections) {
  connections = new Map<string, any>();
  (globalThis as any).__wsConnections = connections;
}
export const wsConnections = connections;

import { LRUCache } from 'lru-cache';

// Maintain backward compatibility for any other modules
export const wsClients = {
  add: (peer: any) => { /* handled in [...ws].ts directly */ },
  delete: (peer: any) => connections.delete(peer.id),
};

import fs from 'node:fs';

export async function publishWS(tenantSlug: string, path: string, payload: any): Promise<number> {
  if (!tenantSlug) return 0;
  
  const message = JSON.stringify(payload);
  let count = 0;
  for (const info of connections.values()) {
    try {
      if (info.tenantSlug === tenantSlug) {
        const infoPath = (info.endpointPath || '').replace(/^\/?api\/ws/, '').replace(/^\/?ws/, '');
        const cleanPeerPath = infoPath.replace(/^\/+|\/+$/g, '') || 'root';
        const cleanPath = path.replace(/^\/?api\/ws/, '').replace(/^\/?ws/, '').replace(/^\/+|\/+$/g, '') || 'root';

        let isMatch = false;
        if (cleanPeerPath === cleanPath) {
          isMatch = true;
        } else if (cleanPeerPath.includes(':')) {
          let regex = (globalThis as any).__wsRegexCache?.get(cleanPeerPath);
          if (!regex) {
            if (!(globalThis as any).__wsRegexCache) (globalThis as any).__wsRegexCache = new LRUCache<string, RegExp>({ max: 1000 });
            const pattern = '^' + cleanPeerPath.replace(/:[^\/]+/g, '([^/]+)') + '$';
            regex = new RegExp(pattern);
            (globalThis as any).__wsRegexCache.set(cleanPeerPath, regex);
          }
          if (regex.test(cleanPath)) {
            isMatch = true;
          }
        }

        if (isMatch) {
          info.send(message);
          count++;
        }
      }
    } catch (err) {
      console.error('publishWS error sending to peer:', err);
    }
  }
  
  // Removed retry logic to prevent event loop starvation and memory leaks during high frequency telemetry pushes

  return count;
}
