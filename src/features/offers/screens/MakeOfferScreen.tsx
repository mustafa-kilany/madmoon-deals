// Make an offer. Phase 5 ports the prototype's MakeOffer.

import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export function MakeOfferScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('screens.makeOffer')} back />;
}
