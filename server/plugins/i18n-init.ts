export default defineNitroPlugin(async (nitroApp) => {
  try {
    // Initialize memory cache from the database
    await import('../utils/i18n-server').then(m => m.initI18nCache(true)).catch(e => console.error('[i18n] Failed to init i18n cache:', e));
  } catch (err) {
    console.error('[i18n] Initialization error:', err);
  }
});
