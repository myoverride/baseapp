import fs from 'node:fs';
import path from 'node:path';
import { sendStream, setHeader, createError } from 'h3';
import { getDbDir } from '../../../../utils/db';

const mimeTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.json': 'application/json'
};

export default defineEventHandler(async (event) => {
  const contextTenantSlug = event.context.tenantSlug;
  const slug = event.context.params?.slug;
  const filePath = event.context.params?.file;
  
  if (!slug || !filePath || !contextTenantSlug || slug !== contextTenantSlug) {
    throw createError({ statusCode: 404, message: 'error.notFound' });
  }

  // Path traversal saldırılarını engelle
  if (filePath.includes('..') || filePath.startsWith('/')) {
    throw createError({ statusCode: 403, message: 'error.forbidden' });
  }

  const baseDir = path.join(getDbDir(), `${slug}_assets`);
  if (!fs.existsSync(baseDir)) {
    try {
      fs.mkdirSync(baseDir, { recursive: true });
    } catch(err: any) {
      if (err.code !== 'EPERM' && err.code !== 'EEXIST') throw err;
    }
  }

  const absolutePath = path.join(baseDir, filePath);
  
  if (!fs.existsSync(absolutePath)) {
    throw createError({ statusCode: 404, message: 'error.fileNotFound' });
  }

  const ext = path.extname(absolutePath).toLowerCase();
  const mimeType = mimeTypes[ext] || 'application/octet-stream';

  setHeader(event, 'Content-Type', mimeType);
  setHeader(event, 'Cache-Control', 'public, max-age=86400'); // 1 gün önbellek

  const stream = fs.createReadStream(absolutePath);
  return sendStream(event, stream);
});
