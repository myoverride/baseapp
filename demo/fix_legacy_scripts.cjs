const fs = require('fs');
const path = require('path');

const demoDir = __dirname;

// Dosyaları tara
const files = fs.readdirSync(demoDir);
const appFiles = files.filter(f => f.endsWith('_app.json'));

if (appFiles.length === 0) {
  console.log("Düzeltilecek '_app.json' uzantılı dosya bulunamadı.");
  process.exit(0);
}

let totalFixed = 0;
let totalFiles = 0;

appFiles.forEach(file => {
  const inputFile = path.join(demoDir, file);
  const newFileName = file.replace(/_app\.json$/, '.json');
  const outputFile = path.join(demoDir, newFileName);
  
  let data;
  try {
    data = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
  } catch (e) {
    console.error(`Atlandı: ${file} (Geçersiz JSON)`);
    return;
  }

  let fileFixed = false;
  let fileFixedCount = 0;

  // 1. Script wrapper temizliği (components.pages)
  if (data.components && Array.isArray(data.components.pages)) {
    data.components.pages.forEach(page => {
      if (page.script_content) {
        let script = page.script_content.trim();
        const legacyStartRegex = /^\};\s*return\s*\{\s*(async\s+)?setup\s*\(\)\s*\{/i;
        const legacyEndRegex = /\}\s*\};\s*function\s+__dummy\s*\(\)\s*\{\s*$/i;
        
        if (legacyStartRegex.test(script) && legacyEndRegex.test(script)) {
          script = script.replace(legacyStartRegex, '');
          script = script.replace(legacyEndRegex, '');
          page.script_content = script.trim();
          fileFixed = true;
          fileFixedCount++;
        }
      }
      if (page.hasOwnProperty('is_landing_page')) {
        delete page.is_landing_page;
        fileFixed = true;
      }
    });
  }

  // Eğer components yapısı olmadan direkt pages array varsa:
  if (Array.isArray(data.pages)) {
    data.pages.forEach(page => {
      if (page.script_content) {
        let script = page.script_content.trim();
        const legacyStartRegex = /^\};\s*return\s*\{\s*(async\s+)?setup\s*\(\)\s*\{/i;
        const legacyEndRegex = /\}\s*\};\s*function\s+__dummy\s*\(\)\s*\{\s*$/i;
        
        if (legacyStartRegex.test(script) && legacyEndRegex.test(script)) {
          script = script.replace(legacyStartRegex, '');
          script = script.replace(legacyEndRegex, '');
          page.script_content = script.trim();
          fileFixed = true;
          fileFixedCount++;
        }
      }
      if (page.hasOwnProperty('is_landing_page')) {
        delete page.is_landing_page;
        fileFixed = true;
      }
    });
  }

  // Dosyayı kaydet
  fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
  totalFiles++;
  if (fileFixed) {
    totalFixed += fileFixedCount;
    console.log(`[TEMİZLENDİ] ${file} -> ${newFileName} (${fileFixedCount} sayfa düzeltildi)`);
  } else {
    console.log(`[AYNEN AKTARILDI] ${file} -> ${newFileName} (Legacy wrapper yok)`);
  }
});

console.log(`\nİŞLEM TAMAMLANDI!`);
console.log(`Toplam ${totalFiles} dosya işlendi, ${totalFixed} sayfanın scripti temizlendi.`);
console.log(`Orijinal '*_app.json' dosyalarına dokunulmadı.`);
