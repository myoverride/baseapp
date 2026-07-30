import { setupWebPush } from '../utils/vapid';

export default defineNitroPlugin((nitroApp) => {
  setupWebPush();
});
