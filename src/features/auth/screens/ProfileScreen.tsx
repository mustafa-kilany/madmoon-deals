// Profile tab. Phase 3 ports the prototype's Profile.

import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export function ProfileScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('screens.profile')} />;
}
