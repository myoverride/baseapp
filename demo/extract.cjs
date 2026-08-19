const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, '../xberber.json');
const outputDir = __dirname;

if (!fs.existsSync(inputFile)) {
  console.error('xberber.json not found!');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

// Utility to create dir safely
const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Utility to create a safe slug
const slugify = (text) => {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
};

// 1. Meta
const meta = {
  app_name: data.app_name,
  tag: data.tag,
  export_date: data.export_date
};
fs.writeFileSync(path.join(outputDir, 'meta.json'), JSON.stringify(meta, null, 2));

// 2. Roles
if (data.components?.roles) {
  const rolesDir = path.join(outputDir, 'roles');
  ensureDir(rolesDir);
  data.components.roles.forEach(role => {
    fs.writeFileSync(path.join(rolesDir, `${slugify(role.name)}.json`), JSON.stringify(role, null, 2));
  });
}

// 3. Pages
if (data.components?.pages) {
  const pagesDir = path.join(outputDir, 'pages');
  ensureDir(pagesDir);
  data.components.pages.forEach(page => {
    let slug = slugify(page.title || page.route_pattern);
    if (!slug) slug = 'unnamed-page';
    const pageDir = path.join(pagesDir, slug);
    ensureDir(pageDir);
    
    const config = { ...page };
    delete config.template_string;
    delete config.script_content;
    delete config.style_content;
    
    fs.writeFileSync(path.join(pageDir, 'config.json'), JSON.stringify(config, null, 2));
    
    if (page.template_string) fs.writeFileSync(path.join(pageDir, 'template.html'), page.template_string);
    if (page.script_content) fs.writeFileSync(path.join(pageDir, 'script.js'), page.script_content);
    if (page.style_content) fs.writeFileSync(path.join(pageDir, 'style.css'), page.style_content);
  });
}

// 4. Entities
if (data.components?.entities) {
  const entitiesDir = path.join(outputDir, 'entities');
  ensureDir(entitiesDir);
  data.components.entities.forEach(entity => {
    const e = { ...entity };
    if (typeof e.schema === 'string') {
        try { e.schema = JSON.parse(e.schema); } catch(err){}
    }
    fs.writeFileSync(path.join(entitiesDir, `${slugify(entity.name || entity.slug)}.json`), JSON.stringify(e, null, 2));
  });
}

// 5. Endpoints
if (data.components?.endpoints) {
  const endpointsDir = path.join(outputDir, 'endpoints');
  ensureDir(endpointsDir);
  data.components.endpoints.forEach((ep, index) => {
    let slug = slugify(ep.title || ep.name || `endpoint-${index}`);
    const epDir = path.join(endpointsDir, slug);
    ensureDir(epDir);
    
    const config = { ...ep };
    delete config.code;
    
    fs.writeFileSync(path.join(epDir, 'config.json'), JSON.stringify(config, null, 2));
    if (ep.code) fs.writeFileSync(path.join(epDir, 'code.js'), ep.code);
  });
}

// 6. Other arrays in components
const others = ['records', 'globals', 'languages', 'translation_keys', 'workers', 'users', 'devices'];
const othersDir = path.join(outputDir, 'others');
ensureDir(othersDir);
others.forEach(key => {
    if (data.components && data.components[key] && data.components[key].length > 0) {
        fs.writeFileSync(path.join(othersDir, `${key}.json`), JSON.stringify(data.components[key], null, 2));
    } else {
        // write empty array just to keep structure
        fs.writeFileSync(path.join(othersDir, `${key}.json`), "[]");
    }
});

console.log('Extraction complete.');
