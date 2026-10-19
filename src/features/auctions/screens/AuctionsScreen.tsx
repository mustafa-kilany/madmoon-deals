// Auctions tab. Phase 2 ports the prototype's AuctionsScreen.

import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export function AuctionsScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('screens.auctions')} />;
}
