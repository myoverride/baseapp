import path from 'node:path';
import fs from 'node:fs';

let _appRoot: string | null = null;

/**
 * Uygulamanın kök dizinini döndürür.
 * Öncelik sırası:
 *   1. APP_HOME ortam değişkeni (override)
 *   2. process.cwd() (EXE, binary veya node çalıştırılan dizin)
 */
export function getAppRoot(): string {
  if (_appRoot) return _appRoot;
  _appRoot = process.env.APP_HOME || process.cwd();
  return _appRoot;
}

/**
 * Veritabanı ve uygulama verilerinin tutulduğu dizin.
 * {appRoot}/data/
 */
export function getDataDir(): string {
  const dir = path.join(getAppRoot(), 'data');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err: any) {
      if (err.code !== 'EPERM' && err.code !== 'EEXIST') console.error('Data dir error:', err);
    }
  }
  return dir;
}

/**
 * Harici JS kütüphanelerinin yüklenebileceği dizin.
 * {appRoot}/plugins/
 * Sandbox ve Worker içinden require('lib-name') ile erişilebilir.
 */
export function getPluginsDir(): string {
  const dir = path.join(getAppRoot(), 'plugins');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err: any) {
      if (err.code !== 'EPERM' && err.code !== 'EEXIST') console.error('Plugins dir error:', err);
    }
  }
  return dir;
}
