import vm from 'node:vm';

/**
 * Validates JavaScript/TypeScript code syntax using node:vm.
 * Throws an object with { key, params } if syntax is invalid.
 */
export async function validateJS(code: string, sourceName?: string): Promise<void> {
  if (!code || code.trim() === '') return;

  // Temporarily disable import/export statements which cause vm.Script to throw outside a module
  let strippedCode = code
    .replace(/(^|\n)\s*import\s+[^;]+;/g, '$1/* import removed */')
    .replace(/(^|\n)\s*import\s*\{[^}]+\}\s*from\s*[^;]+;/g, '$1/* import removed */')
    .replace(/(^|\n)\s*export\s+default\s+/g, '$1const _defaultExport = ')
    .replace(/(^|\n)\s*export\s+(const|let|var|function|class)/g, '$1$2');

  try {
    const { parseSync } = await import('oxc-parser');
    // We wrap the strippedCode in a dummy async function so oxc-parser doesn't complain about top-level 'return' or 'await'
    const codeForOxc = `async function __dummy() {\n${strippedCode}\n}`;
    const result = parseSync('test.ts', codeForOxc, { sourceType: 'module' });
    
    // YENİ EKLENEN: oxc-parser syntax hatalarını fırlatmıyor, dizi olarak döndürüyor.
    // Eğer syntax hatası varsa direkt fırlatıyoruz!
    if (result.errors && result.errors.length > 0) {
      const firstError = result.errors[0];
      // Adjust line number if it's in the message
      let msg = firstError?.message || 'Syntax Error';
      throw { key: 'errors.syntaxError', params: { msg: msg } };
    }
    
    function walk(node: any) {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      // Catch standalone undefined variables/typos (e.g., 'asf;')
      if (node.type === 'ExpressionStatement' && node.expression && node.expression.type === 'Identifier') {
        const offset = node.expression.start;
        // calculate line based on codeForOxc, minus 1 for the dummy wrap line
        const line = codeForOxc.slice(0, offset).split('\n').length - 1;
        throw { key: 'errors.syntaxErrorLine', params: { line, msg: `Bilinmeyen değişken veya typo: ${node.expression.name}` } };
      }
      for (const key in node) {
        if (typeof node[key] === 'object') {
          walk(node[key]);
        }
      }
    }
    walk(result.program);
  } catch (err: any) {
    if (err.key) throw err;
    throw { key: 'errors.syntaxError', params: { msg: err.message || 'Syntax Error' } };
  }

  // Wrap in async function so that top-level return and await do not throw SyntaxError
  // Using strict mode to catch reserved word errors (e.g. standalone 'let') matching Vue/ESM environment
  const wrappedCode = `(async function() {\n"use strict";\n${strippedCode}\n})();`;

  try {
    new vm.Script(wrappedCode, { filename: 'Script' });
  } catch (err: any) {
    let errMsg = err.message || 'Syntax Error';
    if (err.stack) {
      const match = err.stack.match(/:(\d+)(?::(\d+))?/);
      if (match && match[1]) {
        // Subtract 2 because we added 2 lines with `(async function() {\n"use strict";\n`
        const line = Math.max(1, parseInt(match[1]) - 2);
        throw { key: 'errors.syntaxErrorLine', params: { line, msg: errMsg } };
      }
    }
    throw { key: 'errors.syntaxError', params: { msg: errMsg } };
  }
}

/**
 * Validates Vue/HTML templates for balanced tags to prevent Vue rendering crashes.
 * Throws an object with { key, params } if tags are mismatched or unclosed.
 */
export async function validateTemplate(html: string, scriptCode?: string, sourceName?: string): Promise<void> {
  if (!html || html.trim() === '') return;

  const stack: string[] = [];
  const selfClosing = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

  const tagRegex = /<\/?([a-zA-Z0-9\-]+)[^>]*>/g;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const fullTag = match[0];
    const tagName = (match[1] || '').toLowerCase();

    // Explicit self-closing tag in Vue/XML, e.g. <v-icon />
    if (fullTag.endsWith('/>')) {
      continue;
    }
    
    // Standard HTML self-closing tags
    if (selfClosing.has(tagName)) {
      continue;
    }

    if (fullTag.startsWith('</')) {
      // Closing tag
      if (stack.length === 0) {
        throw { key: 'errors.templateErrorUnopened', params: { tag: tagName } };
      }
      const lastTag = stack.pop();
      if (lastTag !== tagName) {
        throw { key: 'errors.templateErrorMismatch', params: { expected: lastTag, found: tagName } };
      }
    } else {
      // Opening tag
      stack.push(tagName);
    }
  }

  if (stack.length > 0) {
    throw { key: 'errors.templateErrorUnclosed', params: { tags: stack.map(t => '<' + t + '>').join(', ') } };
  }

  // CROSS-VALIDATION
  if (scriptCode && scriptCode.trim() !== '') {
    try {
      const { compile } = await import('@vue/compiler-dom');
      const { parseSync } = await import('oxc-parser');
      
      const scriptAst = parseSync('script.ts', scriptCode);
      const returnedKeys = new Set<string>();
      let isObjectReturn = false;
      
      function walkScript(node: any) {
        if (!node) return;
        if (Array.isArray(node)) { node.forEach(walkScript); return; }
        if (node.type === 'ReturnStatement' && node.argument && node.argument.type === 'ObjectExpression') {
          isObjectReturn = true;
          node.argument.properties.forEach((prop: any) => {
            if (prop.type === 'ObjectProperty' && prop.key && prop.key.type === 'Identifier') {
              returnedKeys.add(prop.key.name);
            }
          });
        }
        for (const key in node) { if (typeof node[key] === 'object') walkScript(node[key]); }
      }
      walkScript(scriptAst.program);

      // Only cross-validate if the script explicitly returned an object
      if (isObjectReturn) {
        const compiled = compile(html, { mode: 'function', prefixIdentifiers: true });
        const htmlAst = parseSync('template.js', compiled.code);
        
        const whitelist = new Set([
          'Math', 'Date', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'RegExp',
          'console', 'window', 'document', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
          'undefined', 'null', 'NaN', '$event', '$emit', '$props', '$attrs', '$slots',
          '$router', '$route', '$toast', '$vuetify', '$t', '$localize', '$colorMode', '$config', '$fetch',
          'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'
        ]);

        let firstUndeclared = '';

        function walkHtml(node: any) {
          if (!node || firstUndeclared) return;
          if (Array.isArray(node)) { node.forEach(walkHtml); return; }
          
          if (node.type === 'StaticMemberExpression') {
            if (node.object && node.object.type === 'Identifier' && node.object.name === '_ctx') {
              const propName = node.property.name;
              if (!whitelist.has(propName) && !returnedKeys.has(propName)) {
                firstUndeclared = propName;
              }
            }
          }
          for (const key in node) { if (typeof node[key] === 'object') walkHtml(node[key]); }
        }
        walkHtml(htmlAst.program);
        
        if (firstUndeclared) {
          throw { key: 'errors.syntaxErrorLine', params: { line: 1, msg: `Template Error: Variable '${firstUndeclared}' is used in the template but not returned by the script.` } };
        }
      }
    } catch (err: any) {
      if (err.key) throw err;
      // If vue compile fails or parse fails, ignore to avoid blocking legitimate code
    }
  }
}

/**
 * Helper to translate validation errors into a translated H3Error.
 */
export async function handleValidationError(err: any, event: any) {
  if (err.key) {
    const { getServerTranslation } = await import('./i18n-server');
    const { getEventLocale } = await import('./i18n-api');
    const locale = getEventLocale(event);
    const tenantSlug = event.context?.tenantSlug || 'master';
    const msg = getServerTranslation(tenantSlug, locale, err.key, err.params);
    const { createError } = await import('h3');
    return createError({ statusCode: 400, message: msg });
  }
  const { createError } = await import('h3');
  return createError({ statusCode: 400, message: err.message });
}

