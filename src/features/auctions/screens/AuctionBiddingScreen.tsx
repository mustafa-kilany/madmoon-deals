// Auction detail + bidding. Phase 5 ports the prototype's AuctionBidding.

import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export function AuctionBiddingScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('screens.auctionBidding')} back />;
}
