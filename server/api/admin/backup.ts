import { getDbDir } from '../../utils/db';
import fs from 'node:fs';
import path from 'node:path';
import { sendStream, readMultipartFormData, setResponseHeader } from 'h3';

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user || !user.is_admin) throw createError({ statusCode: 403, message: 'errors.unauthorized' });
  
  const method = event.node.req.method;
  const tenantSlug = event.context.tenantSlug;
  
  if (method === 'GET') {
    const query = getQuery(event);
    if (query.type === 'telemetry') {
      try {
        const dbDir = getDbDir();
        const parquetPath = path.join(dbDir, `telemetry_${tenantSlug}_${Date.now()}.parquet`);
        const { getTenantRefs } = await import('../../utils/db');
        const refs = await getTenantRefs(tenantSlug);
        
        if (refs.duckDbConn) {
          await new Promise<void>((resolve, reject) => {
            refs.duckDbConn!.exec(`COPY (SELECT * FROM telemetry) TO '${parquetPath.replace(/'/g, "''")}' (FORMAT PARQUET);`, (err: any) => {
              if (err) reject(err); else resolve();
            });
          });
        } else {
          throw new Error("DuckDB connection not ready.");
        }
        
        setResponseHeader(event, 'Content-Type', 'application/vnd.apache.parquet');
        setResponseHeader(event, 'Content-Disposition', `attachment; filename="telemetry_${tenantSlug}_${new Date().toISOString().split('T')[0]}.parquet"`);
        
        const stream = fs.createReadStream(parquetPath);
        stream.on('close', () => {
           try { fs.unlinkSync(parquetPath); } catch {}
        });
        
        return sendStream(event, stream);
      } catch (err: any) {
        throw createError({ statusCode: 500, message: 'errors.internalError' + ': ' + err.message });
      }
    }

    try {
      const dbDir = getDbDir();
      const tempBackupPath = path.join(dbDir, `backup_${tenantSlug}_${Date.now()}.db`);
      
      const { getTenantRefs } = await import('../../utils/db');
      const refs = await getTenantRefs(tenantSlug);
      
      // VACUUM INTO komutu aktif bağlantı ve WAL modunda bile çalışan 
      // güvenli bir SQLite anlık yedek (snapshot) mekanizmasıdır.
      refs.sqlite.exec(`VACUUM INTO '${tempBackupPath.replace(/'/g, "''")}';`);
      
      setResponseHeader(event, 'Content-Type', 'application/x-sqlite3');
      setResponseHeader(event, 'Content-Disposition', `attachment; filename="app_backup_${tenantSlug}_${new Date().toISOString().split('T')[0]}.db"`);
      
      const stream = fs.createReadStream(tempBackupPath);
      stream.on('close', () => {
         try { fs.unlinkSync(tempBackupPath); } catch {}
      });
      
      return sendStream(event, stream);
    } catch (err: any) {
      throw createError({ statusCode: 500, message: 'errors.internalError' + ': ' + err.message });
    }
  }
  
  if (method === 'POST') {
    try {
      const query = getQuery(event);
      const isTelemetry = query.type === 'telemetry';
      const dbDir = getDbDir();
      const tempPath = isTelemetry 
        ? path.join(dbDir, `${tenantSlug}_restore_temp.parquet`)
        : path.join(dbDir, `${tenantSlug}_temp.db`);

      // Streaming Multipart Parser (Busboy) ile RAM şişmesini önle (OOM Koruması)
      const Busboy = (await import('busboy')).default;
      await new Promise<void>((resolve, reject) => {
        try {
          const busboy = Busboy({ headers: event.node.req.headers });
          let fileFound = false;
          let activeWrites = 0;
          let busboyFinished = false;

          busboy.on('file', (name, file, _info) => {
            if (name === 'file') {
              fileFound = true;
              activeWrites++;
              const writeStream = fs.createWriteStream(tempPath);
              file.pipe(writeStream);
              writeStream.on('error', reject);
              writeStream.on('close', () => {
                activeWrites--;
                if (busboyFinished && activeWrites === 0) resolve();
              });
            } else {
              file.resume(); // İlgisiz alanları es geç
            }
          });

          busboy.on('finish', () => {
            busboyFinished = true;
            if (!fileFound) return reject(createError({ statusCode: 400, message: 'errors.validationFailed' }));
            if (activeWrites === 0) resolve();
          });

          busboy.on('error', reject);
          event.node.req.pipe(busboy);
        } catch (err) {
          reject(err);
        }
      });

      if (isTelemetry) {
          const { getTenantRefs } = await import('../../utils/db');
          const refs = await getTenantRefs(tenantSlug);
          
          if (refs.duckDbConn) {
             await new Promise<void>((resolve, reject) => {
                refs.duckDbConn!.exec(`COPY telemetry FROM '${tempPath.replace(/'/g, "''")}' (FORMAT PARQUET);`, (err: any) => {
                    if (err) reject(err); else resolve();
                });
             });
          }
          
          try { fs.unlinkSync(tempPath); } catch {}
          return { success: true, message: 'message.success' };
      }

      const appDbPath = path.join(dbDir, `${tenantSlug}_app.db`);
      
      // Mevcut bağlantıları kapat ve havuzdan çıkar (Dosya kilitlenmelerini önlemek için)
      const tenantPool = (globalThis as any).__tenantPool as Map<string, any>;
      if (tenantPool && tenantPool.has(tenantSlug)) {
        const refs = tenantPool.get(tenantSlug);
        if (refs.duckDbConn) await new Promise<void>((res) => refs.duckDbConn.close(() => res()));
        if (refs.duckDbInst) await new Promise<void>((res) => refs.duckDbInst.close(() => res()));
        try { refs.sqlite.close(); } catch {}
        tenantPool.delete(tenantSlug);
      }
      
      // Atomik İşlem: temp dosyayı asıl dosyanın üzerine geçir
      fs.renameSync(tempPath, appDbPath);
      
      return { success: true, message: 'message.success' };
    } catch (err: any) {
      throw createError({ statusCode: 500, message: 'errors.internalError' + ': ' + err.message });
    }
  }
});
