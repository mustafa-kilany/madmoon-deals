// Type-checks translation keys: t('home.welcome') compiles, t('home.typo') doesn't.
import 'i18next';
import type en from './en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
