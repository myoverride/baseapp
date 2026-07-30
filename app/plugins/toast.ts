import { defineNuxtPlugin, useState } from '#app';

export default defineNuxtPlugin(() => {
  const toastState = useState('global_toast', () => ({
    show: false,
    text: '',
    color: 'success',
    timeout: 3000
  }));

  const showToast = (text: string, color: string = 'success', timeout: number = 3000) => {
    toastState.value.text = text;
    toastState.value.color = color;
    toastState.value.timeout = timeout;
    toastState.value.show = true;
  };

  const $toast = {
    success: (text: string, timeout?: number) => showToast(text, 'success', timeout),
    error: (text: string, timeout?: number) => showToast(text, 'error', timeout),
    warning: (text: string, timeout?: number) => showToast(text, 'warning', timeout),
    info: (text: string, timeout?: number) => showToast(text, 'info', timeout),
    show: showToast
  };

  return {
    provide: {
      toast: $toast
    }
  };
});
