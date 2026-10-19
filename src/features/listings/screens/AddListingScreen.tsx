// Add listing. Phase 4 ports the prototype's AddListing.

import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export function AddListingScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('screens.addListing')} back />;
}
