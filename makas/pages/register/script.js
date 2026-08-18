const form = ref({
  company_title: '',
  company_contact: '',
  company_address: '',
  company_target: 'Erkek',
  company_dayoff: 'Yok',
  admin_full_name: '',
  admin_username: '',
  admin_password: '',
  admin_gender: false
});

const loading = ref(false);

const submitRegister = async () => {
  if(!form.value.company_title || !form.value.admin_username || !form.value.admin_password) {
    $toast.error('Lütfen zorunlu alanları doldurun.');
    return;
  }
  
  loading.value = true;
  try {
    const res = await $fetch('/api/custom/makas-register', {
      method: 'POST',
      body: form.value
    });
    
    if (res && res.success) {
      $toast.success('Kayıt başarıyla oluşturuldu! Lütfen yönetici hesabınızla giriş yapın.');
      navigateTo('/login');
    }
  } catch (e) {
    $toast.error(e.data?.message || 'Kayıt olurken bir hata oluştu.');
  } finally {
    loading.value = false;
  }
};

return { form, loading, submitRegister };
