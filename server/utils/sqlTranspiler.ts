/**
 * SQL sorgularındaki PostgreSQL syntax'ini ($1, ANY) SQLite syntax'ine (?) dönüştürür.
 * Parametreleri de SQLite uyumlu hale (Date -> String, Boolean -> 1/0) getirir.
 * 
 * Bu dosya bağımlılık (import) içermez, hem db.ts hem de worker.js (Nitro/Child Process) 
 * tarafından güvenle dahil edilebilir.
 */
export function transpileQueryAndParams(query: string, params: any[] = []): { query: string; params: any[] } {
  // 1. KORUMA: Tırnak içindeki string değerleri geçici olarak sakla (Regex Faciası Koruması)
  const stringLiterals: string[] = [];
  let safeQuery = query.replace(/'(?:''|[^'])*'/g, match => {
    stringLiterals.push(match);
    return `__STR_LITERAL_${stringLiterals.length - 1}__`;
  });
  let newParams: any[] = [];
  let paramIndex = 0; // For tracking '?' placeholders
  
  // Regex to find placeholders in order:
  // Group 1: col, Group 2: positional number in ANY, Group 3: positional number outside ANY
  const regex = /\b(\w+(?:\.\w+)?)\s*=\s*ANY\(\s*(?:\$(\d+)|\?)\s*\)|\$(\d+)|\?/gi;
  let lastIndex = 0;
  let resultQuery = "";
  let match;
  
  while ((match = regex.exec(safeQuery)) !== null) {
    resultQuery += safeQuery.slice(lastIndex, match.index);
    lastIndex = regex.lastIndex;
    const [fullMatch, col, anyPosNum, posNum] = match;
    
    if (col) {
      let idx;
      if (anyPosNum) {
        idx = parseInt(anyPosNum, 10) - 1;
      } else {
        idx = paramIndex++;
      }
      
      if (params && idx < params.length) {
        const val = params[idx];
        if (Array.isArray(val)) {
          if (val.length === 0) {
            resultQuery += "1=0";
          } else {
            const placeholders = val.map(() => "?").join(", ");
            resultQuery += `${col} IN (${placeholders})`;
            newParams.push(...val);
          }
        } else {
          resultQuery += `${col} = ?`;
          newParams.push(val);
        }
      } else {
        resultQuery += fullMatch;
      }
    } else if (posNum) {
      const idx = parseInt(posNum, 10) - 1;
      if (params && idx < params.length) {
        const val = params[idx];
        resultQuery += "?";
        newParams.push(val);
      } else {
        resultQuery += fullMatch;
      }
    } else {
      const idx = paramIndex++;
      if (params && idx < params.length) {
        const val = params[idx];
        resultQuery += "?";
        newParams.push(val);
      } else {
        resultQuery += fullMatch;
      }
    }
  }
  
  resultQuery += safeQuery.slice(lastIndex);
  
  // 2. KORUMA GERİ YÜKLEME: Saklanan string'leri yerine koy
  resultQuery = resultQuery.replace(/__STR_LITERAL_(\d+)__/g, (_, idx) => stringLiterals[parseInt(idx, 10)] || '');
  
  // SQLite (native) boolean ve obje türlerini desteklemediği için uygun dönüşümleri yapıyoruz.
  newParams = newParams.map(p => {
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p instanceof Date) return p.toISOString();
    if (typeof p === 'object' && p !== null && !Array.isArray(p)) {
      return JSON.stringify(p);
    }
    return p;
  });
  
  return { query: resultQuery, params: newParams };
}
