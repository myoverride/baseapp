const state = reactive({
  loading: false,
  successMessage: '',
  errorMessage: '',
  form: {
    username: '',
    password: '',
    full_name: '',
    contact: '',
    gender: true
  }
});

const registerCustomer = async () => {
  state.loading = true;
  state.errorMessage = '';
  state.successMessage = '';
  
  try {
    const response = await $fetch('/api/custom/makas-register-customer', {
      method: 'POST',
      body: state.form
    }).catch(e => e.data);
    
    if (response && response.success) {
      state.successMessage = response.message || 'Müşteri hesabınız başarıyla oluşturuldu.';
    } else {
      state.errorMessage = '❌ ' + (response?.message || 'Bir hata oluştu.');
    }
  } catch (err) {
    state.errorMessage = '❌ Bağlantı hatası. Lütfen daha sonra tekrar deneyin.';
  } finally {
    state.loading = false;
  }
};

const goBack = () => {
  navigateTo('/');
};

const navigateToLogin = () => {
  navigateTo('/login');
};

return {
  state,
  registerCustomer,
  goBack,
  navigateToLogin
};
