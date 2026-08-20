// Nuxt composables like useCookie, navigateTo, $fetch can be used directly in Sandbox pages

const state = reactive({
  loading: true,
  isLoggedIn: false,
  isPWA: false,
  company: null,
  personnel: null,
  editForm: {
    title: '',
    contact: '',
    address: '',
    target: '',
    dayoff: ''
  },
  saving: false,
  saveMessage: ''
});

const checkAuthAndFetchData = async () => {
  try {
    const response = await $fetch('/api/custom/makas-shop-status', {
      method: 'GET'
    }).catch(e => e.data); // Catch 401/404 errors as they throw by default in Nuxt $fetch

    if (response && response.success) {
      state.isLoggedIn = true;
      state.company = response.company;
      state.personnel = response.personnel;
      
      // Populate form if approved
      if (state.company && state.company.approved) {
        state.editForm.title = state.company.title || '';
        state.editForm.contact = state.company.contact || '';
        state.editForm.address = state.company.address || '';
        state.editForm.target = state.company.target || 'Karma';
        state.editForm.dayoff = state.company.dayoff || 'Yok';
      }
    } else {
      state.isLoggedIn = false;
      state.company = null;
      state.personnel = null;
    }
  } catch (err) {
    console.error('Fetch status error:', err);
    state.isLoggedIn = false;
    state.company = null;
    state.personnel = null;
  } finally {
    state.loading = false;
  }
};

const updateCompany = async () => {
  state.saving = true;
  state.saveMessage = '';
  
  try {
    const response = await $fetch('/api/custom/makas-shop-status', {
      method: 'PUT',
      body: state.editForm
    }).catch(e => e.data);
    
    if (response && response.success) {
      state.saveMessage = '✅ Bilgiler başarıyla güncellendi!';
      Object.assign(state.company, state.editForm);
      setTimeout(() => { state.saveMessage = ''; }, 3000);
    } else {
      state.saveMessage = '❌ ' + (response?.message || 'Bir hata oluştu.');
    }
  } catch (err) {
    state.saveMessage = '❌ Bağlantı hatası.';
  } finally {
    state.saving = false;
  }
};

const logout = async () => {
  const token = useCookie('auth_token');
  token.value = null;
  window.location.href = '/';
};

const navigateToRegister = () => {
  navigateTo('/register');
};

const navigateToRegisterCustomer = () => {
  navigateTo('/register-customer');
};

onMounted(() => {
  state.isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  checkAuthAndFetchData();
});

return {
  state,
  updateCompany,
  logout,
  navigateToRegister,
  navigateToRegisterCustomer
};
