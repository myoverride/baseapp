import { defineNuxtPlugin, useCookie, useState } from '#imports';
import { watch } from 'vue';

export default defineNuxtPlugin((nuxtApp) => {
  // Use a 1-year maxAge so the theme preference is persistent across browser sessions
  const themeMode = useCookie('app_theme_mode', { default: () => 'light', maxAge: 60 * 60 * 24 * 365 });

  const toggleTheme = () => {
    themeMode.value = themeMode.value === 'light' ? 'dark' : 'light';
    const vuetify: any = nuxtApp.$vuetify;
    if (vuetify && vuetify.theme) {
      //vuetify.theme.global.name.value = themeMode.value;
      vuetify.theme.change(themeMode.value);
    }
  };

  nuxtApp.hook('app:created', () => {
    const vuetify: any = nuxtApp.$vuetify;

    if (vuetify && vuetify.theme) {
      // Set the initial theme mode from user preference cookie
      //vuetify.theme.global.name.value = themeMode.value;
      vuetify.theme.change(themeMode.value);

      const globals = useState<Record<string, string>>('app-globals');

      // Function to dynamically update Vuetify themes from tenant globals
      const syncThemeColors = (globalVars: Record<string, string> | null | undefined) => {
        if (!globalVars) return;

        // Update Light Theme
        if (globalVars.LIGHT_PRIMARY) vuetify.theme.themes.value.light.colors.primary = globalVars.LIGHT_PRIMARY;
        if (globalVars.LIGHT_SECONDARY) vuetify.theme.themes.value.light.colors.secondary = globalVars.LIGHT_SECONDARY;
        if (globalVars.LIGHT_BACKGROUND) vuetify.theme.themes.value.light.colors.background = globalVars.LIGHT_BACKGROUND;
        if (globalVars.LIGHT_SURFACE) vuetify.theme.themes.value.light.colors.surface = globalVars.LIGHT_SURFACE;

        // Update Dark Theme
        if (globalVars.DARK_PRIMARY) vuetify.theme.themes.value.dark.colors.primary = globalVars.DARK_PRIMARY;
        if (globalVars.DARK_SECONDARY) vuetify.theme.themes.value.dark.colors.secondary = globalVars.DARK_SECONDARY;
        if (globalVars.DARK_BACKGROUND) vuetify.theme.themes.value.dark.colors.background = globalVars.DARK_BACKGROUND;
        if (globalVars.DARK_SURFACE) vuetify.theme.themes.value.dark.colors.surface = globalVars.DARK_SURFACE;
      };

      // Sync immediately if globals are already populated (e.g. hydrated from server)
      syncThemeColors(globals.value);

      // Watch for globals changes (e.g. after tenant switch or late API load)
      watch(() => globals.value, (newVals) => {
        syncThemeColors(newVals);
      }, { deep: true });
    }
  });

  return {
    provide: {
      toggleTheme
    }
  };
});
