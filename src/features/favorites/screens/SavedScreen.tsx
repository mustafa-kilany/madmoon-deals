// Saved items. Phase 2 ports the prototype's SavedItems.

import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export function SavedScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('screens.saved')} back />;
}
