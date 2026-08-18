export const DEFAULT_LOGIN_TEMPLATE = `
<div class="w-100 h-100 bg-grey-lighten-4">
  <v-container class="fill-height bg-grey-lighten-4 pa-0 pa-sm-4" fluid>
    <v-row align="center" justify="center" class="fill-height ma-0">
      <v-col cols="12" sm="10" md="8" lg="5" xl="4" class="px-6 px-sm-3">

        <!-- Mobile Logo Area (Hidden on sm and up) -->
        <div class="d-flex d-sm-none flex-column align-center justify-center mb-8">
          <div v-if="globals?.APP_LOGO" v-html="globals.APP_LOGO" style="width: 240px; height: 220px;" class="text-primary mb-4"></div>
          <img v-else :src="'/logo.svg'" style="width: 220px; height: 220px;" class="mb-4" @error="($event.target).style.display = 'none'" />
          <h1 class="text-h1 font-weight-bold text-grey-darken-4 text-center px-4">{{ globals?.APP_NAME }}</h1>
        </div>

        <!-- The Card Wrapper (Animasyon için relative kapsayıcı eklendi) -->
        <div class="position-relative mx-auto" style="max-width: 450px;">
          
          <!-- Tavşan Karakteri (Mobilde gizlendi, sadece sm ve üzerinde görünür) -->
          <div class="rabbit d-none d-sm-block">
            <div class="ear left"></div>
            <div class="ear right"></div>
            <div class="face">
              <div class="eyes">
                <div class="eye"><div class="pupil"></div></div>
                <div class="eye"><div class="pupil"></div></div>
              </div>
              <div class="snout"></div>
            </div>
          </div>

          <!-- The Card -->
          <v-card class="login-card w-100">
            <v-card-text class="pa-0 pa-sm-8">
              <!-- Desktop Logo Area (Hidden on xs) -->
              <div class="d-none d-sm-flex align-center justify-center mb-8">
                <div v-if="globals?.APP_LOGO" v-html="globals.APP_LOGO" style="width: 56px; height: 56px;" class="text-primary mr-3"></div>
                <img v-else :src="'/logo.svg'" style="width: 56px; height: 56px;" class="mr-3" @error="($event.target).style.display = 'none'" />
                <h1 class="text-h3 font-weight-bold text-grey-darken-4" style="letter-spacing: -1px;">{{ globals?.APP_NAME }}</h1>
              </div>

              <v-alert v-if="!tenantSlug && savedTenantSlug && savedTenantSlug !== 'master'" type="info" variant="tonal" class="mb-6 cursor-pointer text-center rounded-lg" @click="returnToWorkspace">
                {{ $t('page.returnToWorkspace', { slug: savedTenantSlug }) }}
              </v-alert>

              <v-alert v-if="errorMsg" type="error" variant="tonal" class="mb-6 rounded-lg">
                {{ $t(errorMsg) }}
              </v-alert>

              <v-form @submit.prevent="handleLogin" ref="form" class="pt-2 pt-sm-0">
                <v-text-field v-model="username" :label="$t('common.username')" prepend-inner-icon="mdi-account-outline" variant="outlined" :color="color" bg-color="white" class="mb-3" rounded="lg" required :disabled="loading"></v-text-field>

                <!-- Animasyon için @focus ve @blur eventleri eklendi -->
                <v-text-field 
                  v-model="password" 
                  :label="$t('field.password')" 
                  :type="showPassword ? 'text' : 'password'" 
                  prepend-inner-icon="mdi-lock-outline" 
                  :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'" 
                  @click:append-inner="showPassword = !showPassword" 
                  @focus="isPasswordFocused = true"
                  @blur="isPasswordFocused = false"
                  variant="outlined" 
                  :color="color" 
                  bg-color="white" 
                  class="mb-8" 
                  rounded="lg" 
                  required 
                  :disabled="loading"
                ></v-text-field>

                <v-btn type="submit" :color="color || '#1976D2'" size="x-large" block class="rounded-lg text-none font-weight-medium mb-2" elevation="0" :loading="loading">
                  {{ $t('common.login') }}
                </v-btn>
              </v-form>
            </v-card-text>
          </v-card>
        </div>
        
      </v-col>
    </v-row>
  </v-container>
</div>
`;

export const DEFAULT_LOGIN_STYLE = `
.login-card {
  box-shadow: none !important;
  background-color: transparent !important;
  position: relative;
  z-index: 2; /* Tavşanın kartın altında kalmaması için ayarlandı */
}

/* --- TAVŞAN CSS --- */
.rabbit {
  position: absolute;
  top: -100px;
  left: 20px;
  width: 120px;
  height: 120px;
  z-index: 1; /* Formun bir kademe arkasında kalır */
}

.ear {
  position: absolute;
  top: -40px;
  width: 30px;
  height: 80px;
  background: white;
  border: 2px solid #424242; /* v-card ile uyumlu border rengi */
  border-radius: 50% 50% 0 0;
  overflow: hidden;
}

.ear::after {
  content: '';
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  width: 14px;
  height: 50px;
  background: #ffcce0;
  border-radius: 50px;
}

.ear.left {
  left: 15px;
  transform: rotate(-10deg);
}

.ear.right {
  right: 15px;
  transform: rotate(10deg);
}

.face {
  position: absolute;
  top: 10px;
  width: 100%;
  height: 100%;
  background: white;
  border: 2px solid #424242;
  border-radius: 50%;
}

.eyes {
  position: absolute;
  top: 30px;
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 15px;
}

.eye {
  position: relative;
  width: 25px;
  height: 25px;
  background: white;
  border: 2px solid #424242;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.pupil {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #424242;
  border-radius: 50%;
  transition: transform 0.15s ease-out;
}

.snout {
  position: absolute;
  bottom: 25px;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 25px;
  background: #ffcce0;
  border: 2px solid #424242;
  border-radius: 50%;
}

.snout::before, .snout::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 25px;
  height: 1px;
  background: #424242;
}

.snout::before { left: -30px; transform: rotate(10deg); box-shadow: 0 5px 0 #424242, 0 -5px 0 #424242; }
.snout::after { right: -30px; transform: rotate(-10deg); box-shadow: 0 5px 0 #424242, 0 -5px 0 #424242; }

@media (min-width: 600px) {
  .login-card {
    box-shadow: 0px 8px 24px rgba(0, 0, 0, 0.06) !important;
    background-color: #ffffff !important;
    border-radius: 16px !important;
    padding: 16px !important;
  }
}
`;


export const DEFAULT_LOGIN_SCRIPT = `


  const { t } = useI18n();
  useHead({ title: () => t('common.login') })
  const { primaryColor: color, globals, isDark } = useGlobals();
  
  const toggleTheme = () => {
    const { $toggleTheme } = useNuxtApp();
    if ($toggleTheme) $toggleTheme();
  };

  const showPassword = ref(false);
  const isPasswordFocused = ref(false);

  const route = useRoute();
  let tenantSlug = '';
  if (route.path.startsWith('/tenant/')) {
    tenantSlug = route.path.split('/')[2] || '';
  }
  const headers = tenantSlug ? { 'x-tenant-slug': tenantSlug } : {};

  const username = ref('');
  const password = ref('');
  const errorMsg = ref('');
  const loading = ref(false);

  const savedTenantSlug = useCookie('tenant_slug').value;

  function returnToWorkspace() {
    window.location.href = '/tenant/' + savedTenantSlug;
  }

  const router = useRouter();
  const user = useState('user');

  // --- GÖZ ANİMASYONU LOGİC ---
  let lastMouseEvent = null;

  const updateEyes = (event) => {
    if (typeof document === 'undefined') return; // SSR Koruması

    const eyes = document.querySelectorAll(".eye");
    
    eyes.forEach((eye) => {
      const pupil = eye.querySelector(".pupil");
      if (!pupil) return;
      
      // Şifre alanına odaklanıldıysa ve şifre gizliyse (fareyi bırakıp yukarı bak)
      if (isPasswordFocused.value && !showPassword.value) {
        pupil.style.transform = \`translate(0px, -8px)\`;
        return;
      }

      if (!event) return;

      const rect = eye.getBoundingClientRect();
      const eyeCenterX = rect.left + rect.width / 2;
      const eyeCenterY = rect.top + rect.height / 2;
      
      const angle = Math.atan2(event.clientY - eyeCenterY, event.clientX - eyeCenterX);
      const distance = Math.min(rect.width / 3, Math.hypot(event.clientX - eyeCenterX, event.clientY - eyeCenterY) / 10);
      
      const moveX = Math.cos(angle) * distance;
      const moveY = Math.sin(angle) * distance;
      
      pupil.style.transform = \`translate(\${moveX}px, \${moveY}px)\`;
    });
  };

  const onMouseMove = (event) => {
    lastMouseEvent = event;
    updateEyes(event);
  };

  // State değişikliklerinde gözleri anında güncelle (Göster/Gizle veya focus/blur tetiklendiğinde)
  watch([showPassword, isPasswordFocused], () => {
    updateEyes(lastMouseEvent);
  });

  onMounted(() => {
    document.addEventListener("mousemove", onMouseMove);
  });

  onUnmounted(() => {
    document.removeEventListener("mousemove", onMouseMove);
  });
  // -----------------------------

  async function handleLogin() {
    if (!username.value || !password.value) {
      errorMsg.value = 'message.enterCredentials';
      return;
    }

    loading.value = true;
    errorMsg.value = '';

    try {
      const data = await $fetch('/api/auth/login', {
        method: 'POST',
        headers,
        body: { username: username.value, password: password.value }
      });

      if (data && data.success) {
        user.value = data.user;
        const redirectUrl = route.query.redirect;
        const targetPage = redirectUrl || data.user.home_page || '/';
        window.location.href = targetPage;
      }
    } catch (err) {
      errorMsg.value = err?.data?.message ? err.data.message : (err?.statusMessage || 'message.loginFailed');
    } finally {
      loading.value = false;
    }
  }

  return {
    globals, color, t, showPassword, isPasswordFocused, username, password, errorMsg, loading, savedTenantSlug,
    tenantSlug, returnToWorkspace, handleLogin
  };
`;

export const DEFAULT_LAYOUT_TEMPLATE = `
<v-app>
  <v-navigation-drawer v-model="drawer" temporary>
    <v-list density="compact" nav>
      <!-- Özel Tanımlı Menüler (Tüm Kullanıcılar İçin) -->
      <template v-if="user?.menu_list?.length">
        <v-list-item 
          v-for="(menu, idx) in user.menu_list" 
          :key="'m-'+idx" 
          :to="menu.url" 
          :prepend-icon="menu.icon || 'mdi-circle-small'" 
          :title="$localize(menu.title)"
        ></v-list-item>
        <v-divider v-if="user?.is_admin || user?.is_super_admin" class="my-2"></v-divider>
      </template>
      
      <!-- Menüsü Olmayan Standart Kullanıcılar -->
      <v-list-item 
        v-if="!user?.is_admin && !user?.is_super_admin && (!user?.menu_list || !user?.menu_list.length)"
        prepend-icon="mdi-information-outline"
        :title="$t('menu.noMenu')"
        :subtitle="$t('menu.contactAdmin')"
        disabled
      ></v-list-item>

      <!-- Admin Sistem Menüleri -->
      <template v-if="user?.is_admin || user?.is_super_admin">
        <template v-for="(m, i) in menuConfig" :key="'nav-'+i">
          <v-list-group v-if="m.children" :value="m.title">
            <template v-slot:activator="{ props }">
              <v-list-item v-bind="props" :prepend-icon="m.icon" :title="$localize(m.title)"></v-list-item>
            </template>
            <v-list-item v-for="(child, ci) in m.children" :key="'nav-c-'+i+'-'+ci" :to="child.url" :prepend-icon="child.icon" :title="$localize(child.title)"></v-list-item>
          </v-list-group>
          <v-list-item v-else :to="m.url" :prepend-icon="m.icon" :title="$localize(m.title)"></v-list-item>
        </template>
      </template>
    </v-list>
  </v-navigation-drawer>

  <v-app-bar :color="color" elevation="1" density="compact">
    <v-app-bar-nav-icon @click="drawer = !drawer" v-if="user"></v-app-bar-nav-icon>
    <v-app-bar-title class="font-weight-bold text-body-1 d-flex align-center cursor-pointer" style="max-width: 350px;min-width: 150px;" @click="$router.push('/')">
      <template v-if="globals?.APP_LOGO">
        <div v-if="globals.APP_LOGO.trim().startsWith('<')" v-html="globals.APP_LOGO" style="width: 24px; height: 24px; display: inline-block; vertical-align: middle;" class="mr-2"></div>
        <img v-else :src="globals.APP_LOGO" style="height: 24px; vertical-align: middle;" class="mr-2" />
      </template>
      {{ globals?.APP_NAME || 'BaseApp' }}
    </v-app-bar-title>
    <v-menu v-if="user?.is_super_admin" open-on-hover>
      <template v-slot:activator="{ props }">
        <v-btn v-bind="props" size="small" prepend-icon="mdi-domain">
          {{ !mobile?(displayTenant === 'MASTER' ? 'MASTER' : displayTenant.toUpperCase()):'' }}
        </v-btn>
      </template>
      <v-list density="compact" min-width="200">
        <v-list-subheader class="text-caption font-weight-bold">{{ $t('menu.tenantWorkspace') }}</v-list-subheader>
        <v-list-item @click="switchTenant('master')" prepend-icon="mdi-database-outline" :title="$t('menu.masterTenant')" :active="displayTenant === 'MASTER'"></v-list-item>
        <v-divider></v-divider>
        <v-list-item v-for="t in allTenants" :key="t.slug" @click="switchTenant(t.slug)" prepend-icon="mdi-domain" :title="t.name" :subtitle="t.slug" :active="displayTenant === t.slug"></v-list-item>
      </v-list>
    </v-menu>
    <div class="d-none d-md-flex align-center" v-if="user?.is_admin || user?.is_super_admin">
      <template v-for="(m, i) in menuConfig" :key="'ab-'+i">
        <v-menu v-if="m.children" open-on-hover>
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" variant="text" :prepend-icon="m.icon" append-icon="mdi-chevron-down" class="text-none ml-2">{{ $localize(m.title) }}</v-btn>
          </template>
          <v-list density="compact">
            <v-list-item v-for="(child, ci) in m.children" :key="'ab-c-'+i+'-'+ci" :to="child.url" :prepend-icon="child.icon" :title="$localize(child.title)"></v-list-item>
          </v-list>
        </v-menu>
        <v-btn v-else :to="m.url" variant="text" :prepend-icon="m.icon" class="text-none ml-2">{{ $localize(m.title) }}</v-btn>
      </template>
    </div>
    <v-spacer></v-spacer>
    <v-btn variant="text" icon @click="toggleTheme" class="text-white mr-2">
      <v-icon>{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
    </v-btn>
    <div class="d-flex align-center mr-2" v-if="availableLocales.length > 0">
      <v-menu open-on-hover>
        <template v-slot:activator="{ props }">
          <v-btn v-bind="props" variant="text" icon="mdi-translate" class="text-white"></v-btn>
        </template>
        <v-list density="compact" min-width="120">
          <v-list-item v-for="lang in availableLocales" :key="lang.code" :active="currentLocale === lang.code" @click="changeLang(lang.code)">
            <v-list-item-title class="text-body-2">{{ lang.name }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>
    <div v-if="user" class="d-flex align-center">
      <v-menu open-on-hover>
        <template v-slot:activator="{ props }">
          <v-btn v-bind="props" variant="text" :icon="mobile ? true : false" prepend-icon="mdi-account-circle" :append-icon="mobile ? '' : 'mdi-chevron-down'" class="text-none text-white">
            <v-icon v-if="mobile">mdi-account-circle</v-icon>
            <span v-if="!mobile">{{ user.username }}</span>
          </v-btn>
        </template>
        <v-list density="compact" min-width="150">
          <v-list-item to="/profile" prepend-icon="mdi-account-cog" :title="$t('common.profileSettings')"></v-list-item>
          <v-divider></v-divider>
          <v-list-item @click="logout" prepend-icon="mdi-logout" :title="$t('menu.logout')" base-color="error"></v-list-item>
        </v-list>
      </v-menu>
    </div>
  </v-app-bar>

  <v-main class="bg-grey-lighten-4">
    <slot />
  </v-main>

  <v-footer v-if="user" app border class="bg-grey-darken-4 text-grey-lighten-1 px-3 d-flex justify-center align-center" :height="28" style="font-size: 12px;">
    <div>Powered by Override Yazılım</div>
  </v-footer>
</v-app>
`;

export const DEFAULT_LAYOUT_STYLE = '';

export const DEFAULT_LAYOUT_SCRIPT = `
  const { t } = useI18n();
  const { globals, primaryColor: color, isDark } = useGlobals();
  
  const toggleTheme = () => {
    const { $toggleTheme } = useNuxtApp();
    if ($toggleTheme) $toggleTheme();
  };

  const user = useState('user');
  
  const menuConfig = computed(() => {
    const baseMenu = [];
    if (user.value?.is_super_admin) {
      baseMenu.push(
        { title: 'App Studio', icon: 'mdi-application-braces-outline', url: '/admin/app-studio' },
        { title: t('menu.devices'), icon: 'mdi-devices', url: '/admin/devices' },
        { title: t('menu.entities'), icon: 'mdi-cube-outline', url: '/admin/entities' },
        { title: t('menu.runtime'), icon: 'mdi-code-braces', children: [
            { title: t('menu.globals'), icon: 'mdi-earth', url: '/admin/globals' },
            { title: t('common.customPages'), icon: 'mdi-monitor-dashboard', url: '/admin/pages' },
            { title: t('menu.endpoints'), icon: 'mdi-api', url: '/admin/endpoints' },
            { title: t('menu.workers'), icon: 'mdi-cogs', url: '/admin/workers' }
        ]},
        { title: t('menu.systemPanel'), icon: 'mdi-cogs', children: [
            { title: t('common.language'), icon: 'mdi-translate', url: '/admin/i18n' },
            { title: t('menu.tenants'), icon: 'mdi-domain', url: '/admin/tenants' }
        ]},
        { title: t('menu.securityAccess'), icon: 'mdi-shield-account', children: [
            { title: t('menu.users'), icon: 'mdi-account-group', url: '/admin/users' },
            { title: t('menu.roles'), icon: 'mdi-badge-account', url: '/admin/roles' }
        ]}
      );
    } else if (user.value?.is_admin) {
      baseMenu.push(
        { title: 'App Studio', icon: 'mdi-application-braces-outline', url: '/admin/app-studio' },
        { title: t('menu.devices'), icon: 'mdi-devices', url: '/admin/devices' },
        { title: t('menu.entities'), icon: 'mdi-cube-outline', url: '/admin/entities' },
        { title: t('menu.runtime'), icon: 'mdi-code-braces', children: [
            { title: t('menu.globals'), icon: 'mdi-earth', url: '/admin/globals' },
            { title: t('common.customPages'), icon: 'mdi-monitor-dashboard', url: '/admin/pages' },
            { title: t('menu.endpoints'), icon: 'mdi-api', url: '/admin/endpoints' },
            { title: t('menu.workers'), icon: 'mdi-cogs', url: '/admin/workers' }
        ]},
        { title: t('menu.systemPanel'), icon: 'mdi-cogs', children: [
            { title: t('common.language'), icon: 'mdi-translate', url: '/admin/i18n' }
        ]},
        { title: t('menu.securityAccess'), icon: 'mdi-shield-account', children: [
            { title: t('menu.users'), icon: 'mdi-account-group', url: '/admin/users' },
            { title: t('menu.roles'), icon: 'mdi-badge-account', url: '/admin/roles' }
        ]}
      );
    }
    return baseMenu;
  });

  const route = useRoute();
  let tenantSlug = '';
  if (route.path.startsWith('/tenant/')) {
    tenantSlug = route.path.split('/')[2] || '';
  }
  const tenantCookie = useCookie('tenant_slug');
  const currentLocale = ref('en');
  const availableLocales = useState('app_locales', () => []);

  const displayTenant = computed(() => {
    if (tenantSlug) return tenantSlug;
    if (tenantCookie.value && tenantCookie.value !== 'master') return tenantCookie.value;
    return 'MASTER';
  });

  const drawer = ref(false);
  const router = useRouter();
  
  // Create a reactive mobile check since useDisplay might not be injected the same way in the wrapper.
  // Actually, vuetify might not be accessible from context. Let's just create a custom breakpoint.
  const mobile = ref(false);

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' });
    user.value = null;
    router.push('/');
  }

  const allTenants = ref([]);
  const switchTenant = (slug) => {
    document.cookie = 'tenant_slug=' + slug + '; path=/; max-age=604800';
    window.location.href = slug === 'master' ? '/' : '/tenant/' + slug;
  };

  const changeLang = async (code) => {
    const { $setLanguage } = useNuxtApp();
    if ($setLanguage) {
      await $setLanguage(code);
      currentLocale.value = code;
    }
  };

  const checkMobile = () => {
    if (globalThis.window) {
      mobile.value = window.innerWidth < 960;
    }
  };

  onMounted(async () => {
    checkMobile();
    if (globalThis.window) {
      window.addEventListener('resize', checkMobile);
    }
    const current = localStorage.getItem('app_locale') || 'en';
    currentLocale.value = current;
    if (user.value?.is_super_admin) {
      try {
        const tList = await $fetch('/api/admin/tenants', { headers: tenantSlug ? { 'x-tenant-slug': tenantSlug } : {} });
        if (Array.isArray(tList)) allTenants.value = tList;
      } catch(e) {}
    }
  });

  onUnmounted(() => {
    if (globalThis.window) {
      window.removeEventListener('resize', checkMobile);
    }
  });

  return {
    t, globals, user, menuConfig, currentLocale, availableLocales, displayTenant, drawer, color, mobile,
    allTenants, switchTenant, changeLang, logout, isDark, toggleTheme
  };
`;

export const DEFAULT_LANDING_TEMPLATE = `
  <div class="w-100 h-100">
    <!-- Admin kullanıcıları için Runtime Dashboard -->
    <v-container v-if="user?.is_admin || user?.is_super_admin" class="py-8">
        <div class="text-center mb-8">
          <v-icon size="64" :color="color" class="mb-2">mdi-cube-outline</v-icon>
          <h1 class="text-h4 font-weight-bold text-grey-darken-3">{{ $t('dashboard.runtimeTitle') }}</h1>
          <p class="text-subtitle-1 text-grey-darken-1 mt-1">
            {{ $t('dashboard.runtimeDesc') }}
          </p>
        </div>

        <v-row>
          <v-col cols="12" sm="6" md="3">
            <v-card to="/admin/pages" hover class="pa-4 text-center" height="100%">
              <v-icon size="48" color="teal" class="mb-3">mdi-monitor-dashboard</v-icon>
              <v-card-title class="text-subtitle-1 font-weight-bold">{{ $t('common.customPages') }}</v-card-title>
              <v-card-text class="text-body-2 text-grey-darken-1">{{ $t('dashboard.dynPagesDesc') }}</v-card-text>
            </v-card>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-card to="/admin/endpoints" hover class="pa-4 text-center" height="100%">
              <v-icon size="48" color="deep-purple" class="mb-3">mdi-api</v-icon>
              <v-card-title class="text-subtitle-1 font-weight-bold">{{ $t('menu.endpoints') }}</v-card-title>
              <v-card-text class="text-body-2 text-grey-darken-1">{{ $t('dashboard.endpointsDesc') }}</v-card-text>
            </v-card>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-card to="/admin/workers" hover class="pa-4 text-center" height="100%">
              <v-icon size="48" color="blue" class="mb-3">mdi-server-network</v-icon>
              <v-card-title class="text-subtitle-1 font-weight-bold">{{ $t('menu.workers') }}</v-card-title>
              <v-card-text class="text-body-2 text-grey-darken-1">{{ $t('dashboard.workersDesc') }}</v-card-text>
            </v-card>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-card to="/admin/entities" hover class="pa-4 text-center" height="100%">
              <v-icon size="48" color="orange" class="mb-3">mdi-database-cog</v-icon>
              <v-card-title class="text-subtitle-1 font-weight-bold">{{ $t('menu.entities') }}</v-card-title>
              <v-card-text class="text-body-2 text-grey-darken-1">{{ $t('dashboard.entitiesDesc') }}</v-card-text>
            </v-card>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-card to="/admin/devices" hover class="pa-4 text-center" height="100%">
              <v-icon size="48" color="green" class="mb-3">mdi-chip</v-icon>
              <v-card-title class="text-subtitle-1 font-weight-bold">{{ $t('menu.devices') }}</v-card-title>
              <v-card-text class="text-body-2 text-grey-darken-1">{{ $t('dashboard.devicesDesc') }}</v-card-text>
            </v-card>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-card to="/admin/globals" hover class="pa-4 text-center" height="100%">
              <v-icon size="48" color="cyan" class="mb-3">mdi-database-settings</v-icon>
              <v-card-title class="text-subtitle-1 font-weight-bold">{{ $t('common.systemSettings') }}</v-card-title>
              <v-card-text class="text-body-2 text-grey-darken-1">{{ $t('dashboard.dataOptDesc') }}</v-card-text>
            </v-card>
          </v-col>
        </v-row>
    </v-container>

    <!-- Normal giriş yapmış kullanıcılar için karşılama ekranı -->
    <v-container v-else-if="user" class="py-8">
      <div class="text-center" style="max-width: 500px; margin: 0 auto;">
        <v-icon size="64" :color="color" class="mb-4">mdi-hand-wave</v-icon>
        <h1 class="text-h5 font-weight-bold text-grey-darken-3 mb-2">{{ $t('dashboard.welcome', { username: user?.username || 'User' }) }}</h1>
        <p class="text-body-1 text-grey-darken-1 mb-8">
          {{ $t('common.useTheLinksInTheMenuToAccessYourPages') }}
        </p>
      </div>

      <v-row v-if="parsedMenuList?.length" class="mt-4 justify-center">
        <v-col cols="12" sm="6" md="3" v-for="(menu, idx) in parsedMenuList" :key="'dash-menu-'+idx">
          <v-card :to="menu.url" hover class="pa-4 text-center" height="100%" border elevation="0">
            <v-icon size="48" :color="color" class="mb-3">{{ menu.icon || 'mdi-file-document-outline' }}</v-icon>
            <v-card-title class="text-subtitle-1 font-weight-bold text-wrap" style="line-height: 1.2;">{{ typeof $localize === 'function' ? $localize(menu.title) : menu.title }}</v-card-title>
          </v-card>
        </v-col>
      </v-row>

      <v-row v-if="myPages?.length" class="mt-4 justify-center">
        <v-col cols="12" sm="6" md="3" v-for="(p, idx) in myPages" :key="'my-page-'+idx">
          <v-card :to="p.route_pattern" hover class="pa-4 text-center" height="100%" border elevation="0">
            <v-icon size="48" :color="color" class="mb-3">mdi-text-box-outline</v-icon>
            <v-card-title class="text-subtitle-1 font-weight-bold text-wrap" style="line-height: 1.2;">{{ getPageTitle(p.title) }}</v-card-title>
          </v-card>
        </v-col>
      </v-row>
    </v-container>

    <!-- Ziyaretçiler (Giriş Yapmamış) için Public Landing -->
    <v-container v-else class="py-16 d-flex flex-column justify-center align-center h-100 text-center bg-grey-lighten-4" fluid style="min-height: calc(100vh - 100px);">
      <v-alert v-if="!tenantSlug && savedTenantSlug && savedTenantSlug !== 'master'" type="info" variant="tonal" class="mb-8 cursor-pointer text-center" @click="returnToWorkspace" style="max-width: 700px; width: 100%;">
        {{ $t('page.returnToWorkspace', { slug: savedTenantSlug }) }}
      </v-alert>

      <div v-if="globals?.APP_LOGO" v-html="globals.APP_LOGO" style="width: 120px; height: 120px; margin: 0 auto;" class="mb-6 text-primary"></div>
      <img v-else src="/logo.svg" style="width: 120px; height: 120px; margin: 0 auto;" class="mb-6" @error="($event.target).style.display = 'none'" />

      <h1 class="text-h3 font-weight-black text-grey-darken-4 mb-4">{{ globals?.APP_NAME || $t('dashboard.landingTitle') }}</h1>
      <p class="text-h6 text-grey-darken-1 mb-8" style="max-width: 700px; line-height: 1.6;">
        {{ $t('dashboard.landingDesc') }}
      </p>
      <div class="d-flex gap-4 flex-wrap justify-center">
        <v-btn :color="color" size="x-large" rounded="pill" class="px-8 text-none font-weight-bold" to="/login" prepend-icon="mdi-login">
          {{ $t('common.login') }}
        </v-btn>
        <v-btn 
          v-if="canInstall"
          color="secondary" 
          size="x-large" 
          rounded="pill" 
          class="px-8 text-none font-weight-bold" 
          prepend-icon="mdi-download"
          @click="installPwa"
        >
          {{ $t('dashboard.install') }}
        </v-btn>
        <v-btn size="x-large" rounded="pill" class="px-8 text-none font-weight-bold" variant="outlined" to="/about" prepend-icon="mdi-information">
          {{ $t('page.about') }}
        </v-btn>
      </div>
    </v-container>
  </div>
`;
export const DEFAULT_LANDING_SCRIPT = `
  const { t } = useI18n();
  useHead({ title: () => t('common.home') })
  const { globals, primaryColor: color } = useGlobals();
  const user = useState('user');

  const route = useRoute();
  let tenantSlug = '';
  if (route.path.startsWith('/tenant/')) {
    tenantSlug = route.path.split('/')[2] || '';
  }

  const savedTenantSlug = useCookie('tenant_slug').value;

  function returnToWorkspace() {
    window.location.href = '/tenant/' + savedTenantSlug;
  }

  const canInstall = ref(false);
  const myPages = ref([]);

  const parsedMenuList = computed(() => {
    if (!user.value || !user.value.menu_list) return [];
    if (typeof user.value.menu_list === 'string') {
      try {
        const parsed = JSON.parse(user.value.menu_list);
        return Array.isArray(parsed) ? parsed : [];
      } catch(e) {
        return [];
      }
    }
    return Array.isArray(user.value.menu_list) ? user.value.menu_list : [];
  });

  const getPageTitle = (title) => {
    if (!title) return 'Sayfa';
    if (typeof title === 'string') {
      try {
        const parsed = JSON.parse(title);
        return typeof $localize === 'function' ? $localize(parsed) : (parsed.tr || parsed.en || title);
      } catch (e) {
        return title;
      }
    }
    return typeof $localize === 'function' ? $localize(title) : (title.tr || title.en || 'Sayfa');
  };

  onMounted(async () => {
    if (globalThis.window) {
      if (window.__deferredPwaPrompt) {
        canInstall.value = true;
      } else {
        window.__pwaPromptCallback = (e) => {
          canInstall.value = true;
        };
      }
    }
    if (user.value && !user.value.is_admin && !user.value.is_super_admin) {
      try {
        const res = await $fetch('/api/pages/my-pages');
        myPages.value = res.data || [];
      } catch(e) {}
    }
  });

  const installPwa = async () => {
    if (globalThis.window) {
      const promptEvent = window.__deferredPwaPrompt;
      if (promptEvent) {
        promptEvent.prompt();
        const outcome = await promptEvent.userChoice;
        if (outcome.outcome === 'accepted') {
          canInstall.value = false;
          window.__deferredPwaPrompt = null;
        }
      }
    }
  };

  return {
    t, globals, user, tenantSlug, savedTenantSlug, returnToWorkspace, canInstall, installPwa, color, parsedMenuList, myPages, getPageTitle
  };
`;
export const DEFAULT_LANDING_STYLE = ``;

export const DEFAULT_PROFILE_TEMPLATE = `

  <v-container>
    <v-card class="pa-4 mx-auto" max-width="600">
      <v-card-title class="text-h5 mb-4">{{ $t('common.profileSettings') }}</v-card-title>
      <v-card-text>
        <v-alert v-if="successMsg" type="success" variant="tonal" class="mb-4" closable @click:close="successMsg=''">
          {{ successMsg }}
        </v-alert>
        <v-alert v-if="errorMsg" type="error" variant="tonal" class="mb-4" closable @click:close="errorMsg=''">
          {{ errorMsg }}
        </v-alert>

        <v-form @submit.prevent="saveProfile">
          <h3 class="text-h6 mb-2">{{ $t('page.changePassword') }}</h3>
          <v-text-field
            v-model="passwords.old"
            :label="$t('field.currentPassword')"
            type="password"
            variant="outlined"
            density="compact"
            class="mb-2"
          ></v-text-field>
          <v-text-field
            v-model="passwords.new"
            :label="$t('field.newPassword')"
            type="password"
            variant="outlined"
            density="compact"
            class="mb-2"
          ></v-text-field>
          <v-btn type="submit" :color="color" :loading="saving" block class="mb-4">
            {{ $t('action.updatePassword') }}
          </v-btn>
          <v-divider class="my-4"></v-divider>
          
          <h3 class="text-h6 mb-2">{{ $t('page.notifications') }}</h3>
          <p class="text-body-2 mb-4 text-medium-emphasis">
            {{ $t('page.pushDesc') }}
          </p>
          
          <v-btn 
            v-if="!isSubscribed"
            :color="color" 
            prepend-icon="mdi-bell-ring"
            :loading="pushLoading"
            @click="enableNotifications"
          >
            {{ $t('action.allowNotifications') }}
          </v-btn>
          <div v-else class="d-flex align-center flex-wrap gap-2">
            <div class="text-caption text-success mr-4">
              <v-icon size="small" class="mr-1">mdi-check-circle</v-icon>
              {{ $t('status.pushRegistered') }}
            </div>
            <v-btn
              color="error"
              variant="tonal"
              size="small"
              prepend-icon="mdi-bell-off"
              :loading="pushLoading"
              @click="disableNotifications"
            >
              {{ $t('action.disableNotifications') }}
            </v-btn>
          </div>
        </v-form>
      </v-card-text>
    </v-card>
  </v-container>

`;
export const DEFAULT_PROFILE_SCRIPT = `

  const { t } = useI18n();
  useHead({ title: () => t('common.profileSettings') });
  const { primaryColor: color } = useGlobals();

  const successMsg = ref('');
  const errorMsg = ref('');
  const pushLoading = ref(false);
  const saving = ref(false);
  const isSubscribed = ref(false);
  const passwords = ref({ old: '', new: '' });

  const checkSubscription = async () => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      isSubscribed.value = !!subscription;
    }
  };

  onMounted(() => {
    checkSubscription();
  });

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  const enableNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      errorMsg.value = t('message.browserNoPush');
      return;
    }
    
    pushLoading.value = true;
    errorMsg.value = '';
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error(t('message.pushDenied'));
      }

      const { publicKey } = await $fetch('/api/profile/vapid-public-key');
      const convertedVapidKey = urlBase64ToUint8Array(publicKey);

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      await $fetch('/api/profile/push-subscribe', {
        method: 'POST',
        body: subscription
      });

      successMsg.value = t('message.success');
      isSubscribed.value = true;
    } catch (err) {
      console.error('Push error:', err);
      errorMsg.value = err.message || t('message.pushError');
    } finally {
      pushLoading.value = false;
    }
  };

  const disableNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }
    
    pushLoading.value = true;
    errorMsg.value = '';
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await $fetch('/api/profile/push-unsubscribe', {
          method: 'POST',
          body: subscription
        });
        await subscription.unsubscribe();
      }

      successMsg.value = t('message.pushDisabled');
      isSubscribed.value = false;
    } catch (err) {
      console.error('Push unsubscribe error:', err);
      errorMsg.value = err.message || t('message.pushDisableError');
    } finally {
      pushLoading.value = false;
    }
  };

  const saveProfile = async () => {
    if (!passwords.value.old || !passwords.value.new) {
      errorMsg.value = t('message.enterPasswords');
      return;
    }
    
    saving.value = true;
    errorMsg.value = '';
    successMsg.value = '';
    try {
      await $fetch('/api/profile', {
        method: 'PUT',
        body: {
          password: {
            old: passwords.value.old,
            new: passwords.value.new
          }
        }
      });
      successMsg.value = t('message.passwordUpdated');
      passwords.value = { old: '', new: '' };
    } catch (err) {
      errorMsg.value = err.data?.message || err.message || t('message.passwordUpdateError');
    } finally {
      saving.value = false;
    }
  };

  return {
    t, color, successMsg, errorMsg, pushLoading, saving, isSubscribed, passwords, checkSubscription,
    urlBase64ToUint8Array, enableNotifications, disableNotifications, saveProfile
  };

`;
export const DEFAULT_PROFILE_STYLE = ``;

export const DEFAULT_ABOUT_TEMPLATE = `
<div class="w-100 bg-white">
  <!-- Hero Section -->
  <v-container class="py-16 text-center" fluid style="background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);">
    <h1 class="text-h2 font-weight-bold mb-4 text-grey-darken-4">{{ $t('about.heroTitle') }}</h1>
    <p class="text-h6 text-grey-darken-2 mx-auto" style="max-width: 800px;">
      {{ $t('about.heroDesc') }}
    </p>
  </v-container>

  <!-- Features Section -->
  <v-container class="py-16">
    <v-row>
      <v-col cols="12" md="4" class="text-center">
        <v-icon size="64" color="primary" class="mb-4">mdi-speedometer</v-icon>
        <h3 class="text-h5 font-weight-bold mb-2">{{ $t('about.performanceTitle') }}</h3>
        <p class="text-body-1 text-grey-darken-1">{{ $t('about.performanceDesc') }}</p>
      </v-col>
      <v-col cols="12" md="4" class="text-center">
        <v-icon size="64" color="teal" class="mb-4">mdi-shield-check</v-icon>
        <h3 class="text-h5 font-weight-bold mb-2">{{ $t('about.securityTitle') }}</h3>
        <p class="text-body-1 text-grey-darken-1">{{ $t('about.securityDesc') }}</p>
      </v-col>
      <v-col cols="12" md="4" class="text-center">
        <v-icon size="64" color="orange" class="mb-4">mdi-puzzle-outline</v-icon>
        <h3 class="text-h5 font-weight-bold mb-2">{{ $t('about.integrationTitle') }}</h3>
        <p class="text-body-1 text-grey-darken-1">{{ $t('about.integrationDesc') }}</p>
      </v-col>
    </v-row>
  </v-container>

  <!-- CTA Section -->
  <v-container class="py-16 text-center bg-grey-darken-4 text-white" fluid>
    <h2 class="text-h4 font-weight-bold mb-6">{{ $t('about.ctaTitle') }}</h2>
    <p class="text-h6 mb-8 text-grey-lighten-1">{{ $t('about.ctaDesc') }}</p>
    <v-btn color="primary" size="x-large" rounded="pill" class="px-8 font-weight-bold text-none" to="/login">
      {{ $t('common.login') }}
    </v-btn>
  </v-container>
</div>
`;
export const DEFAULT_ABOUT_SCRIPT = `
  const { t } = useI18n();
  useHead({ title: () => t('page.about') });
  return { t };
`;

export async function setupSystemPages(sql: any) {
  try {
    const pages = [
      { type: 'login', title: 'Login', template: DEFAULT_LOGIN_TEMPLATE, script: DEFAULT_LOGIN_SCRIPT, style: DEFAULT_LOGIN_STYLE },
      { type: 'layout', title: 'Layout', template: DEFAULT_LAYOUT_TEMPLATE, script: DEFAULT_LAYOUT_SCRIPT, style: DEFAULT_LAYOUT_STYLE },
      { type: 'landing', title: 'Landing / Dashboard', template: DEFAULT_LANDING_TEMPLATE, script: DEFAULT_LANDING_SCRIPT, style: DEFAULT_LANDING_STYLE },
      { type: 'profile', title: 'Profile Settings', template: DEFAULT_PROFILE_TEMPLATE, script: DEFAULT_PROFILE_SCRIPT, style: DEFAULT_PROFILE_STYLE },
      { type: 'about', title: 'About', template: DEFAULT_ABOUT_TEMPLATE, script: DEFAULT_ABOUT_SCRIPT, style: '' }
    ];

    for (const p of pages) {
      const pageRes = await sql`SELECT id FROM pages WHERE page_type = ${p.type} AND protected = 1 LIMIT 1`;
      if (pageRes.length === 0) {
        let routePattern = '';
        let isPublic = 0;
        let isDefaultLayout = 0;
        if (p.type === 'login') {
          routePattern = '/login';
          isPublic = 1;
        } else if (p.type === 'landing') {
          routePattern = '/';
          isPublic = 1;
        } else if (p.type === 'layout') {
          routePattern = 'sys_layout';
          isDefaultLayout = 1;
          isPublic = 1; 
        } else if (p.type === 'profile') {
          routePattern = '/profile';
          isPublic = 0;
        } else if (p.type === 'about') {
          routePattern = '/about';
          isPublic = 1;
        }

        await sql`
          INSERT INTO pages (title, route_pattern, page_type, template_string, script_content, style_content, is_public, protected, is_default_layout, priority)
          VALUES (${p.title}, ${routePattern}, ${p.type}, ${p.template}, ${p.script}, ${p.style}, ${isPublic}, 1, ${isDefaultLayout}, 999)
        `;
      }
    }
  } catch (err) {
    console.error('Error in setupSystemPages:', err);
  }
}
