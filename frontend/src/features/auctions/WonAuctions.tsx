// Auctions the person won and hasn't paid for. Ended auctions leave every list, and a push may
// never arrive (notifications off), so wins are shown here too: on the Auctions tab and on Profile.

import { useNavigation } from '@react-navigation/native';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Price } from '@/components/Price';
import { Card, Text } from '@/components/ui';
import { useAuctionsWon } from '@/features/catalog/hooks/useCatalog';
import { useLocalized } from '@/i18n';
import type { RootNavigation } from '@/navigation/types';

export function WonAuctions() {
  const { t } = useTranslation();
  const localized = useLocalized();
  const navigation = useNavigation<RootNavigation>();
  const { data: won = [] } = useAuctionsWon();
  if (!won.length) return null;
  return (
    <View testID="won-auctions" className="gap-2 px-5 pb-3">
      {won.map(item => (
        <Pressable
          key={item.id}
          testID={`won-${item.id}`}
          accessibilityRole="button"
          onPress={() => navigation.navigate('AuctionBidding', { itemId: item.id })}
        >
          <Card className="gap-1 border border-brand-primary p-3">
            <Text className="font-sans-bold text-sm text-brand-primary">{t('auctionBidding.wonBanner')}</Text>
            <Text numberOfLines={1} className="text-sm">{localized(item.title)}</Text>
            <Price fils={item.priceFils} className="text-base" />
          </Card>
        </Pressable>
      ))}
    </View>
  );
}
