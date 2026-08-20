try {
  if (payload.method !== 'POST') {
    return { respond: true, status: 200, body: { success: false, error: 'Sadece POST desteklenir' } };
  }

  if (!payload.user || !payload.user.is_admin) {
    return { respond: true, status: 403, body: { error: 'Yetkisiz erişim. Dosya yöneticisini yalnızca adminler kullanabilir.' } };
  }

  let fs, path;
  try {
    fs = require('fs/promises');
    path = require('path');
  } catch (e) {
    return { respond: true, status: 200, body: { success: false, error: 'Sunucuda fs (dosya sistemi) modülüne erişim izni yok.' } };
  }

  const { action, targetPath, content } = payload.body || {};
  if (!action) return { respond: true, status: 200, body: { success: false, error: 'İşlem (action) belirtilmedi.' } };

  const currentDir = targetPath ? path.resolve(targetPath) : process.cwd();

  if (action === 'list') {
    const items = await fs.readdir(currentDir, { withFileTypes: true });
    const files = [];
    
    for (const item of items) {
      try {
        const stat = await fs.stat(path.join(currentDir, item.name));
        files.push({ name: item.name, isDirectory: item.isDirectory(), size: stat.size, mtime: stat.mtime });
      } catch (err) { continue; }
    }
    
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    
    return { respond: true, status: 200, body: { success: true, currentDir, parentDir: path.dirname(currentDir), files } };
  }

  if (action === 'read') {
    const stat = await fs.stat(currentDir);
    if (stat.size > 5 * 1024 * 1024) { 
      return { respond: true, status: 200, body: { success: false, error: 'Dosya editörde açmak için çok büyük (Limit: 5MB).' } };
    }
    const data = await fs.readFile(currentDir, 'utf8');
    return { respond: true, status: 200, body: { success: true, content: data } };
  }

  if (action === 'write') {
    await fs.writeFile(currentDir, content || '', 'utf8');
    return { respond: true, status: 200, body: { success: true } };
  }

  if (action === 'download') {
    const stat = await fs.stat(currentDir);
    if (stat.size > 100 * 1024 * 1024) {
      return { respond: true, status: 200, body: { success: false, error: 'İndirilecek dosya çok büyük (>100MB).' } };
    }
    const data = await fs.readFile(currentDir);
    return { respond: true, status: 200, body: { success: true, fileName: path.basename(currentDir), base64: data.toString('base64') } };
  }

  if (action === 'upload') {
    const buffer = Buffer.from(content, 'base64');
    await fs.writeFile(currentDir, buffer);
    return { respond: true, status: 200, body: { success: true } };
  }

  if (action === 'delete') {
    const stat = await fs.stat(currentDir);
    if (stat.isDirectory()) {
      await fs.rm(currentDir, { recursive: true, force: true });
    } else {
      await fs.unlink(currentDir);
    }
    return { respond: true, status: 200, body: { success: true } };
  }

  if (action === 'mkdir') {
    await fs.mkdir(currentDir, { recursive: true });
    return { respond: true, status: 200, body: { success: true } };
  }

  return { respond: true, status: 200, body: { success: false, error: 'Geçersiz işlem isteği.' } };

} catch (error) {
  return { respond: true, status: 200, body: { success: false, error: error.message || String(error) } };
}