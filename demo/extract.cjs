const fs = require('fs');
const path = require('path');

if (process.argv.length < 3) {
  console.error("Usage: node extract.cjs <file.json>");
  process.exit(1);
}

const inputFile = process.argv[2];
if (!fs.existsSync(inputFile)) {
  console.error(`Error: File not found: ${inputFile}`);
  process.exit(1);
}

// 1. Read JSON
const rawData = fs.readFileSync(inputFile, 'utf-8');
const data = JSON.parse(rawData);

// 2. Extract Tag
let tag = data.tag || 'app';
tag = tag.replace(/^#/, '');

const targetDir = path.join(__dirname, tag);

// Clean up existing dir
if (fs.existsSync(targetDir)) {
  fs.rmSync(targetDir, { recursive: true, force: true });
}
fs.mkdirSync(targetDir, { recursive: true });

// 3. Write Meta
const meta = {
  app_name: data.app_name || '',
  tag: data.tag || '',
  export_date: data.export_date || ''
};
fs.writeFileSync(path.join(targetDir, 'meta.json'), JSON.stringify(meta, null, 2));

const components = data.components || {};

// 4. Legacy Conversions
if (components.system_variables || components.dynamic_utils) {
  components.globals = components.globals || [];
  if (components.system_variables) {
    components.globals = components.globals.concat(components.system_variables);
    delete components.system_variables;
  }
  if (components.dynamic_utils) {
    components.globals = components.globals.concat(components.dynamic_utils);
    delete components.dynamic_utils;
  }
}
if (components.schedulers) {
  components.workers = components.workers || [];
  components.workers = components.workers.concat(components.schedulers);
  delete components.schedulers;
}
if (components.translations) {
  components.translation_keys = components.translation_keys || [];
  components.translation_keys = components.translation_keys.concat(components.translations);
  delete components.translations;
}

// Helper to sanitize folder names
const sanitize = (name) => name.replace(/[^a-zA-Z0-9_-]/g, '_');

// 5. Pages
if (components.pages && Array.isArray(components.pages)) {
  const pagesDir = path.join(targetDir, 'pages');
  fs.mkdirSync(pagesDir, { recursive: true });
  
  components.pages.forEach(page => {
    let folderName = page.route_pattern || page.id || 'unknown_page';
    folderName = sanitize(folderName);
    
    const pagePath = path.join(pagesDir, folderName);
    fs.mkdirSync(pagePath, { recursive: true });
    
    if (page.template_string) {
      fs.writeFileSync(path.join(pagePath, 'template.html'), page.template_string);
      delete page.template_string;
    }
    if (page.script_content) {
      fs.writeFileSync(path.join(pagePath, 'script.js'), page.script_content);
      delete page.script_content;
    }
    if (page.style_content) {
      fs.writeFileSync(path.join(pagePath, 'style.css'), page.style_content);
      delete page.style_content;
    }
    
    fs.writeFileSync(path.join(pagePath, 'config.json'), JSON.stringify(page, null, 2));
  });
  delete components.pages;
}

// 6. Endpoints
if (components.endpoints && Array.isArray(components.endpoints)) {
  const epDir = path.join(targetDir, 'endpoints');
  fs.mkdirSync(epDir, { recursive: true });
  
  components.endpoints.forEach(ep => {
    let folderName = ep.name || ep.route_pattern || ep.id || 'unknown_ep';
    folderName = sanitize(folderName);
    
    const epPath = path.join(epDir, folderName);
    fs.mkdirSync(epPath, { recursive: true });
    
    if (ep.code) {
      fs.writeFileSync(path.join(epPath, 'code.js'), ep.code);
      delete ep.code;
    }
    
    fs.writeFileSync(path.join(epPath, 'config.json'), JSON.stringify(ep, null, 2));
  });
  delete components.endpoints;
}

// 7. Workers
if (components.workers && Array.isArray(components.workers)) {
  const wkDir = path.join(targetDir, 'workers');
  fs.mkdirSync(wkDir, { recursive: true });
  
  components.workers.forEach(wk => {
    let folderName = wk.name || wk.id || 'unknown_wk';
    folderName = sanitize(folderName);
    
    const wkPath = path.join(wkDir, folderName);
    fs.mkdirSync(wkPath, { recursive: true });
    
    if (wk.code) {
      fs.writeFileSync(path.join(wkPath, 'code.js'), wk.code);
      delete wk.code;
    }
    
    fs.writeFileSync(path.join(wkPath, 'config.json'), JSON.stringify(wk, null, 2));
  });
  delete components.workers;
}

// 8. Entities
if (components.entities && Array.isArray(components.entities)) {
  const entDir = path.join(targetDir, 'entities');
  fs.mkdirSync(entDir, { recursive: true });
  
  components.entities.forEach(ent => {
    let fileName = ent.slug || ent.name || ent.id || 'unknown_ent';
    fileName = sanitize(fileName) + '.json';
    
    if (typeof ent.schema === 'string') {
      try {
        ent.schema = JSON.parse(ent.schema);
      } catch (e) {}
    }
    
    fs.writeFileSync(path.join(entDir, fileName), JSON.stringify(ent, null, 2));
  });
  delete components.entities;
}

// 9. Others (globals, roles, records, etc.)
Object.keys(components).forEach(key => {
  const dataList = components[key];
  if (Array.isArray(dataList) && dataList.length > 0) {
    fs.writeFileSync(path.join(targetDir, `${key}.json`), JSON.stringify(dataList, null, 2));
  }
});

console.log(`Extraction complete. App contents are in demo/${tag}`);
