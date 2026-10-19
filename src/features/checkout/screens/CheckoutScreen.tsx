// Secure checkout. Phase 6 ports the prototype's Checkout.

import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export function CheckoutScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('screens.checkout')} back />;
}
