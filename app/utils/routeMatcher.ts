export interface RouteMatchResult {
  isMatch: boolean;
  params: Record<string, string>;
}

export function compileRoutePattern(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const rawPattern = String(pattern || '').trim();
  const normalizedPattern = rawPattern.startsWith('/') ? rawPattern : `/${rawPattern}`;
  const segments = normalizedPattern.split('/');
  const regexParts: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i] || '';

    // Leading slash segment
    if (i === 0) {
      regexParts.push('');
      continue;
    }

    // Catch-all wildcard
    const isCatchAll = seg.startsWith('[...') && seg.endsWith(']');
    if (isCatchAll) {
      const paramName = seg.replace('[...', '').replace(']', '') || 'catchAll';
      paramNames.push(paramName);
      regexParts.push('(.*)');
      break; // Catch-all can only be at the end
    }

    // Named parameters
    const namedMatch = seg.match(/^:([a-zA-Z0-9_]+)$/);
    if (namedMatch) {
      paramNames.push(namedMatch[1] as string);
      regexParts.push('([^/]+)');
      continue;
    }

    // Literal segment
    regexParts.push(seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  }

  const regexBody = regexParts.join('/');
  return { regex: new RegExp(`^${regexBody}$`), paramNames };
}

export function matchRoute(path: string, compiledRegex: RegExp, paramNames: string[]): RouteMatchResult {
  // Strip query string if any
  const cleanPath = path.split('?')[0] || '';
  const match = cleanPath.match(compiledRegex);

  if (!match) {
    return { isMatch: false, params: {} };
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < paramNames.length; i++) {
    const pName = paramNames[i] as string;
    params[pName] = match[i + 1] || '';
  }

  return { isMatch: true, params };
}
