import { getVapidKeys } from '../../utils/vapid';

export default defineEventHandler((event) => {
  const keys = getVapidKeys();
  return { publicKey: keys.publicKey };
});
