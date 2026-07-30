import fs from 'fs';
import path from 'path';
import { getDataDir } from './appRoot';

const MAX_VERSIONS = 50;
const HISTORY_BASE_DIR = path.join(getDataDir(), 'history');

/**
 * Saves a version of the code to the history directory.
 * Directory structure: history/{tenantSlug}/{type}/{id}/{timestamp}.json
 */
export async function saveHistory(tenantSlug: string, type: string, id: string | number, data: any) {
  try {
    const dir = path.join(HISTORY_BASE_DIR, tenantSlug, type, String(id));
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch(err: any) {
        if (err.code !== 'EPERM' && err.code !== 'EEXIST') throw err;
      }
    }

    const timestamp = Date.now().toString();
    const filePath = path.join(dir, `${timestamp}.json`);
    
    // Write the new version
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    // Cleanup old versions
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    if (files.length > MAX_VERSIONS) {
      files.sort((a, b) => {
        const timeA = parseInt(a.replace('.json', ''));
        const timeB = parseInt(b.replace('.json', ''));
        return timeA - timeB; // Sort ascending (oldest first)
      });
      
      const filesToDelete = files.slice(0, files.length - MAX_VERSIONS);
      for (const file of filesToDelete) {
        fs.unlinkSync(path.join(dir, file));
      }
    }
  } catch (error) {
    console.error(`Failed to save history for ${type}/${id}:`, error);
  }
}

/**
 * Gets a list of available history timestamps for a given type and id.
 * Returns an array of timestamps sorted descending (newest first).
 */
export async function getHistoryList(tenantSlug: string, type: string, id: string | number): Promise<string[]> {
  try {
    const dir = path.join(HISTORY_BASE_DIR, tenantSlug, type, String(id));
    if (!fs.existsSync(dir)) return [];

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const timestamps = files.map(f => f.replace('.json', ''));
    
    // Sort descending (newest first)
    timestamps.sort((a, b) => parseInt(b) - parseInt(a));
    return timestamps;
  } catch (error) {
    console.error(`Failed to get history list for ${type}/${id}:`, error);
    return [];
  }
}

/**
 * Gets the content of a specific history version.
 */
export async function getHistoryContent(tenantSlug: string, type: string, id: string | number, timestamp: string): Promise<any | null> {
  try {
    const filePath = path.join(HISTORY_BASE_DIR, tenantSlug, type, String(id), `${timestamp}.json`);
    if (!fs.existsSync(filePath)) return null;

    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Failed to get history content for ${type}/${id}/${timestamp}:`, error);
    return null;
  }
}
