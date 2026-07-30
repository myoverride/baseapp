export const useSysVars = () => {
  // app.vue tarafında sayfa yüklenmeden önce global olarak çekildiği için 
  // burada tekrar useFetch çağırarak Suspense döngüsüne (titreme) girmesini engelliyoruz.
  // Doğrudan Nuxt'un önbelleğinden senkron olarak okuyoruz.
  const sysVars = useState<Record<string, string>>('sys-vars-global');
  const primaryColor = computed(() => sysVars.value?.PRIMARY_COLOR || sysVars.value?.primary_color || 'primary');
  const status = ref('success');

  return {
    sysVars,
    status,
    primaryColor
  };
};
