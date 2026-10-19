// Order tracking. Phase 6 ports the prototype's BuyerTracking.

import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export function OrderTrackingScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('screens.orderTracking')} back />;
}
