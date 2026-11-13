// i18next setup plus language switching. React Native only applies a layout
// direction change (LTR ↔ RTL) after a reload, so changing between English and
// Arabic saves the choice, flips the direction, and restarts the app.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import RNRestart from 'react-native-restart';
import { storage } from '@/lib/storage';
import type { Lang, Localized } from '@/lib/types';
import { useSettingsStore } from '@/store/settingsStore';
import ar from './ar.json';
import en from './en.json';

export const resources = {
  en: { translation: en },
  ar: { translation: ar },
} as const;

i18n.use(initReactI18next).init({
  resources,
  lng: useSettingsStore.getState().lang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// Remembers which direction we last restarted for, so a device that refuses
// the change can't trap the app in a restart loop.
const RESTART_GUARD_KEY = 'direction-restart';

/**
 * Point the native layout direction at `lang` and restart if it doesn't match
 * yet. Called once at startup (index.js) and whenever the language changes.
 */
export function applyDirection(lang: Lang): void {
  const rtl = lang === 'ar';
  if (I18nManager.isRTL === rtl) {
    storage.remove(RESTART_GUARD_KEY);
    return;
  }
  // allowRTL(false) is needed too: otherwise an Arabic device stays RTL in English.
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  if (storage.getString(RESTART_GUARD_KEY) === lang) return;
  storage.set(RESTART_GUARD_KEY, lang);
  RNRestart.restart();
}

export function changeLanguage(lang: Lang): void {
  useSettingsStore.getState().setLang(lang);
  i18n.changeLanguage(lang);
  applyDirection(lang);
}

export const useLang = (): Lang => useSettingsStore(s => s.lang);

/** Pick the current language's text from catalog data (`item.title`, …). */
export function useLocalized(): (text: Localized) => string {
  const lang = useLang();
  return text => text[lang];
}

export default i18n;
