const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.vue') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./app');
let totalReplaced = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // Regex to match $t('...') || '...' or t('...') || '...'
  // Pattern breakdown:
  // 1: (\$t|\bt) -> matches $t or t
  // 2: \( (['"][^'"]+['"] (?:, \s*\{[^}]+\})?) \) -> matches the arguments inside t() like ('key') or ('key', { ... })
  // 3: \s*\|\|\s* -> matches ||
  // 4: (['"][^'"]*['"]) -> matches the fallback string
  
  // Note: This regex is carefully crafted to only catch literal string fallbacks
  const regex = /(\$t|\bt)\(\s*(['"][^'"]+['"](?:\s*,\s*\{[^}]+\})?)\s*\)\s*\|\|\s*(['"][^'"]*['"])/g;
  
  content = content.replace(regex, (match, tFunc, tArgs, fallbackStr) => {
    console.log(`[${file}] Fixed: ${match}`);
    totalReplaced++;
    return `${tFunc}(${tArgs})`;
  });

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
  }
});

console.log(`\nTotal fixed occurrences: ${totalReplaced}`);
