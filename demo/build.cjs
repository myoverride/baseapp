const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const outputFile = path.join(__dirname, '../xberber.json');

const finalJson = {
  app_name: "",
  tag: "",
  export_date: "",
  components: {
    roles: [],
    pages: [],
    entities: [],
    endpoints: [],
    records: [],
    globals: [],
    languages: [],
    translation_keys: [],
    workers: [],
    users: [],
    devices: []
  }
};

// 1. Meta
const metaPath = path.join(srcDir, 'meta.json');
if (fs.existsSync(metaPath)) {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  finalJson.app_name = meta.app_name;
  finalJson.tag = meta.tag;
  finalJson.export_date = meta.export_date;
}

// Helper to read JSON files in a dir
const readJsonDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) return [];
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
  return files.map(f => JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf-8')));
};

// 2. Roles
finalJson.components.roles = readJsonDir(path.join(srcDir, 'roles'));

// 3. Pages
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

// 4. Entities
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

// 5. Endpoints
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

// 6. Others
const othersDir = path.join(srcDir, 'others');
if (fs.existsSync(othersDir)) {
  const others = ['records', 'globals', 'languages', 'translation_keys', 'workers', 'users', 'devices'];
  others.forEach(key => {
    const p = path.join(othersDir, `${key}.json`);
    if (fs.existsSync(p)) {
      finalJson.components[key] = JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  });
}

fs.writeFileSync(outputFile, JSON.stringify(finalJson, null, 2));
console.log('Build complete. xberber.json generated.');
