let connections: Map<string, any> = (globalThis as any).__wsConnections;
if (!connections) {
  connections = new Map<string, any>();
  (globalThis as any).__wsConnections = connections;
}
export const wsConnections = connections;

let channels: Map<string, Set<any>> = (globalThis as any).__wsChannels;
if (!channels) {
  channels = new Map<string, Set<any>>();
  (globalThis as any).__wsChannels = channels;
}
export const wsChannelMap = channels;

import { LRUCache } from 'lru-cache';

// Maintain backward compatibility for any other modules
export const wsClients = {
  add: (peer: any) => { /* handled in [...ws].ts directly */ },
  delete: (peer: any) => {
    const info = connections.get(peer.id);
    if (info) {
       const infoPath = info.endpointPath.replace(/^\/?api\/ws/, '').replace(/^\/?ws/, '');
       const normalizedPath = infoPath.replace(/^\/+|\/+$/g, '') || 'root';
       const channelKey = `${info.tenantSlug}:${normalizedPath}`;
       if (channels.has(channelKey)) {
           const channelSet = channels.get(channelKey)!;
           channelSet.delete(info);
           if (channelSet.size === 0) {
               channels.delete(channelKey);
           }
       }
    }
    connections.delete(peer.id);
  },
};

import fs from 'node:fs';

export async function publishWS(tenantSlug: string, path: string, payload: any): Promise<number> {
  if (!tenantSlug) return 0;
  
  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
  let count = 0;

  const cleanPath = path.replace(/^\/?api\/ws/, '').replace(/^\/?ws/, '').replace(/^\/+|\/+$/g, '') || 'root';
  const channelKey = `${tenantSlug}:${cleanPath}`;

  // O(1) Exact Match lookup
  const channelClients = wsChannelMap.get(channelKey);
  if (channelClients && channelClients.size > 0) {
    for (const info of channelClients) {
      try {
        info.send(message);
        count++;
      } catch (err) {
        console.error('publishWS error sending to peer:', err);
      }
    }
  }

  // Fallback for Dynamic Routes (Regex matching - only happens if publishers push to generic paths instead of exact ones)
  if (count === 0) {
    for (const info of connections.values()) {
      try {
        if (info.tenantSlug === tenantSlug) {
          const infoPath = (info.endpointPath || '').replace(/^\/?api\/ws/, '').replace(/^\/?ws/, '');
          const cleanPeerPath = infoPath.replace(/^\/+|\/+$/g, '') || 'root';

          let isMatch = false;
          if (cleanPeerPath.includes(':')) {
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
        console.error('publishWS error sending to peer in fallback:', err);
      }
    }
  }
  
  return count;
}
