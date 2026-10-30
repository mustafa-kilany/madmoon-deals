// User settings that survive restarts. The app opens in English on first
// launch; switching language goes through `changeLanguage` (src/i18n), which
// also flips the layout direction and restarts the app.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import type { Lang } from '@/lib/types';

type SettingsState = {
  lang: Lang;
  setLang: (lang: Lang) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    set => ({
      lang: 'en',
      setLang: lang => set({ lang }),
    }),
    { name: 'settings', storage: zustandStorage },
  ),
);
