import { H3Event } from 'h3';
import { getServerTranslation } from './i18n-server';

export function getEventLocale(event: H3Event): string {
  const acceptLang = getRequestHeader(event, 'accept-language');
  if (acceptLang) {
    return acceptLang.split(',')[0]?.split('-')[0] || 'en';
  }
  // Optional: check cookies if preferred
  const cookieLang = getCookie(event, 'app_locale');
  if (cookieLang) return cookieLang;
  
  return 'en';
}

export function tEvent(event: H3Event, key: string, params?: Record<string, any>): string {
  // Sadece key dönüyoruz, UI tarafında $toast ile çevrilecek
  return key;
}
