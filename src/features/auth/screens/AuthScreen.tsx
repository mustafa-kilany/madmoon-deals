// Sign-in choice. Phase 3 ports the prototype's AuthScreen.

import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export function AuthScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('screens.auth')} back />;
}
