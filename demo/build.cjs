const fs = require('fs');
const path = require('path');

if (process.argv.length < 3) {
  console.error("Usage: node build.cjs <tag_name>");
  process.exit(1);
}

let tag = process.argv[2];
tag = tag.replace(/^#/, '');

const srcDir = path.join(__dirname, tag);
if (!fs.existsSync(srcDir)) {
  console.error(`Error: Directory not found: ${srcDir}`);
  process.exit(1);
}

const outputFile = path.join(__dirname, `${tag}.json`);

const finalJson = {
  app_name: "",
  tag: "",
  export_date: "",
  components: {
    globals: [],
    roles: [],
    users: [],
    languages: [],
    translation_keys: [],
    entities: [],
    records: [],
    endpoints: [],
    workers: [],
    devices: [],
    pages: []
  }
};

// 1. Meta
const metaPath = path.join(srcDir, 'meta.json');
if (fs.existsSync(metaPath)) {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  finalJson.app_name = meta.app_name || '';
  finalJson.tag = meta.tag || '';
  finalJson.export_date = meta.export_date || new Date().toISOString();
} else {
  finalJson.app_name = tag.toUpperCase() + ' App';
  finalJson.tag = '#' + tag;
  finalJson.export_date = new Date().toISOString();
}

// 2. Pages
const pagesDir = path.join(srcDir, 'pages');
if (fs.existsSync(pagesDir)) {
  const pageFolders = fs.readdirSync(pagesDir).filter(f => fs.statSync(path.join(pagesDir, f)).isDirectory());
  pageFolders.forEach(folder => {
    const pPath = path.join(pagesDir, folder);
    const configPath = path.join(pPath, 'config.json');
    if (fs.existsSync(configPath)) {
      const page = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      
      const tPath = path.join(pPath, 'template.html');
      if (fs.existsSync(tPath)) page.template_string = fs.readFileSync(tPath, 'utf-8');
      
      const sPath = path.join(pPath, 'script.js');
      if (fs.existsSync(sPath)) page.script_content = fs.readFileSync(sPath, 'utf-8');
      
      const cPath = path.join(pPath, 'style.css');
      if (fs.existsSync(cPath)) page.style_content = fs.readFileSync(cPath, 'utf-8');
      
      finalJson.components.pages.push(page);
    }
  });
}

// 3. Endpoints
const endpointsDir = path.join(srcDir, 'endpoints');
if (fs.existsSync(endpointsDir)) {
  const epFolders = fs.readdirSync(endpointsDir).filter(f => fs.statSync(path.join(endpointsDir, f)).isDirectory());
  epFolders.forEach(folder => {
    const epPath = path.join(endpointsDir, folder);
    const configPath = path.join(epPath, 'config.json');
    if (fs.existsSync(configPath)) {
      const ep = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      
      const cPath = path.join(epPath, 'code.js');
      if (fs.existsSync(cPath)) ep.code = fs.readFileSync(cPath, 'utf-8');
      
      finalJson.components.endpoints.push(ep);
    }
  });
}

// 4. Workers
const workersDir = path.join(srcDir, 'workers');
if (fs.existsSync(workersDir)) {
  const wkFolders = fs.readdirSync(workersDir).filter(f => fs.statSync(path.join(workersDir, f)).isDirectory());
  wkFolders.forEach(folder => {
    const wkPath = path.join(workersDir, folder);
    const configPath = path.join(wkPath, 'config.json');
    if (fs.existsSync(configPath)) {
      const wk = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      
      const cPath = path.join(wkPath, 'code.js');
      if (fs.existsSync(cPath)) wk.code = fs.readFileSync(cPath, 'utf-8');
      
      finalJson.components.workers.push(wk);
    }
  });
}

// 5. Entities
const entitiesDir = path.join(srcDir, 'entities');
if (fs.existsSync(entitiesDir)) {
  const files = fs.readdirSync(entitiesDir).filter(f => f.endsWith('.json'));
  files.forEach(f => {
    const entity = JSON.parse(fs.readFileSync(path.join(entitiesDir, f), 'utf-8'));
    if (typeof entity.schema === 'object') {
      entity.schema = JSON.stringify(entity.schema);
    }
    finalJson.components.entities.push(entity);
  });
}

// 6. Others
const otherKeys = ['globals', 'roles', 'users', 'languages', 'translation_keys', 'records', 'devices'];
otherKeys.forEach(key => {
  const p = path.join(srcDir, `${key}.json`);
  if (fs.existsSync(p)) {
    finalJson.components[key] = JSON.parse(fs.readFileSync(p, 'utf-8'));
  }
});

fs.writeFileSync(outputFile, JSON.stringify(finalJson, null, 2));
console.log(`Build complete. ${tag}.json generated.`);
