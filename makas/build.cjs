const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const outputFile = path.join(__dirname, '../makas.json');

const finalJson = {
  app_name: "Makas Pro",
  tag: "#makas",
  export_date: new Date().toISOString(),
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

const entitiesDir = path.join(srcDir, 'entities');
if (fs.existsSync(entitiesDir)) {
  const entityFolders = fs.readdirSync(entitiesDir).filter(f => fs.statSync(path.join(entitiesDir, f)).isDirectory());
  entityFolders.forEach(folder => {
    const epPath = path.join(entitiesDir, folder);
    const configPath = path.join(epPath, 'config.json');
    if (fs.existsSync(configPath)) {
      const entity = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      
      let tags = [];
      if (typeof entity.hashtags === 'string') {
        try { tags = JSON.parse(entity.hashtags); } catch(e) {}
      } else if (Array.isArray(entity.hashtags)) {
        tags = entity.hashtags;
      }
      
      if (!tags.includes('#makas')) {
        tags.push('#makas');
      }
      entity.hashtags = JSON.stringify(tags);
      
      finalJson.components.entities.push(entity);
    }
  });
}

// 2. Roles
const rolesDir = path.join(srcDir, 'roles');
if (fs.existsSync(rolesDir)) {
  const roleFolders = fs.readdirSync(rolesDir).filter(f => fs.statSync(path.join(rolesDir, f)).isDirectory());
  roleFolders.forEach(folder => {
    const epPath = path.join(rolesDir, folder);
    const configPath = path.join(epPath, 'config.json');
    if (fs.existsSync(configPath)) {
      const role = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      finalJson.components.roles.push(role);
    }
  });
}

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

fs.writeFileSync(outputFile, JSON.stringify(finalJson, null, 2));
console.log('Build complete. makas.json generated.');
