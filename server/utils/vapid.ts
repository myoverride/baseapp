import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import { getDataDir } from './appRoot';

const VAPID_FILE = path.join(getDataDir(), 'vapid.json');

export function getVapidKeys(): { publicKey: string; privateKey: string } {
  if (fs.existsSync(VAPID_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf-8'));
      if (data.publicKey && data.privateKey) {
        return data;
      }
    } catch (e) {
      console.error('Error reading vapid.json. Will not overwrite, throwing error to protect keys.', e);
      throw new Error('Failed to read existing VAPID keys. Halting to prevent push subscription loss.');
    }
  }

  // Generate new keys
  const vapidKeys = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2));
  console.log('Generated new VAPID keys for Web Push Notifications.');
  return vapidKeys;
}

export function setupWebPush() {
  const keys = getVapidKeys();
  // Provide a generic mailto link as required by web-push
  webpush.setVapidDetails('mailto:admin@baseapp.local', keys.publicKey, keys.privateKey);
}
