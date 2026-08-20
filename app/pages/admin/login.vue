<template>
  <v-container class="fill-height bg-background" fluid>
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="4">
        <v-card class="elevation-12 rounded-lg">
          <v-toolbar color="error" dark>
            <v-toolbar-title class="font-weight-bold">
              <v-icon class="mr-2">mdi-shield-alert-outline</v-icon>
              Safe Mode Login
            </v-toolbar-title>
          </v-toolbar>
          <v-card-text class="pa-6">
            <v-alert type="warning" variant="tonal" class="mb-6 text-caption">
              {{ $t('login.safeModeWarning') }}
            </v-alert>
            <v-form @submit.prevent="handleLogin" ref="form">
              <v-text-field
                v-model="username"
                :label="$t('common.username')"
                prepend-inner-icon="mdi-account"
                variant="outlined"
                density="comfortable"
                required
              ></v-text-field>
              
              <v-text-field
                v-model="password"
                :label="$t('common.password')"
                prepend-inner-icon="mdi-lock"
                type="password"
                variant="outlined"
                density="comfortable"
                required
              ></v-text-field>
              
              <v-btn
                type="submit"
                color="error"
                size="large"
                block
                :loading="loading"
                class="mt-2 text-none"
              >
                {{ $t('action.login') }}
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useFetch, useState, navigateTo, useCookie } from '#app';
import { useNuxtApp } from '#app';
import { useI18n } from 'vue-i18n';

// Bu sayfa default layout'un çökme ihtimaline karşı tamamen saf çalışmalı
definePageMeta({
  layout: false // Layout kullanma, direkt render et.
});

const username = ref('');
const password = ref('');
const loading = ref(false);
const user = useState<any>('user');
const safeModeCookie = useCookie('safe_mode', { maxAge: 60 * 60 * 24 }); // 1 günlük çerez
const { $toast } = useNuxtApp() as any;
const { t } = useI18n();

const handleLogin = async () => {
  if (!username.value || !password.value) {
    if ($toast) $toast.error(t('errors.usernamePasswordRequired'));
    return;
  }
  
  loading.value = true;
  try {
    const data = await $fetch<any>('/api/auth/login', {
      method: 'POST',
      body: {
        username: username.value,
        password: password.value
      }
    });
    
    if (data && data.user) {
      user.value = data.user;
      safeModeCookie.value = '1'; // Güvenli mod bayrağını aç
      if ($toast) $toast.success(t('login.safeModeSuccess'));
      
      // Tam bir sayfa yenilemesi (hard reload) ile admin/pages'e git. 
      // Böylece layout baştan yüklenir ve çerezi okur.
      window.location.href = '/admin/pages';
    }
  } catch (err: any) {
    const msg = err?.data?.message || err?.statusMessage || t('error.loginFailed');
    if ($toast) $toast.error(msg);
  } finally {
    loading.value = false;
  }
};
</script>
