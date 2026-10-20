// Live auction detail & bidding screen (Phase 5): photo gallery, live countdown,
// current bid, minimum increment, quick-add buttons (+5, +10, +25 JOD),
// custom bid input, and bid history list.

import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { ConditionTag } from '@/components/ConditionTag';
import { Icon } from '@/components/icons';
import { Price } from '@/components/Price';
import { StatusView } from '@/components/StatusView';
import {
  Badge,
  Button,
  Card,
  Chip,
  Heading,
  Screen,
  Text,
  TextField,
} from '@/components/ui';
import { useTimeLeftLabel } from '@/features/auctions/hooks/useTimeLeftLabel';
import { useItem } from '@/features/catalog/hooks/useCatalog';
import { useBids, usePlaceBid } from '@/features/offers/hooks/useNegotiation';
import { useNow } from '@/hooks/useNow';
import { useLang, useLocalized } from '@/i18n';
import { formatJOD } from '@/lib/money';
import type { RootScreenProps } from '@/navigation/types';
import { toast } from '@/store/toastStore';
import { colors } from '@/theme/colors';

export function AuctionBiddingScreen({
  route,
  navigation,
}: RootScreenProps<'AuctionBidding'>) {
  const { t } = useTranslation();
  const lang = useLang();
  const localized = useLocalized();
  const now = useNow();
  const timeLeftLabel = useTimeLeftLabel();
  const itemId = route.params?.itemId;

  const { data: item, isLoading: isItemLoading } = useItem(itemId);
  const { data: bids = [], isLoading: isBidsLoading } = useBids(itemId);
  const placeBid = usePlaceBid();

  const [bidJod, setBidJod] = useState('');

  if (isItemLoading || isBidsLoading) return <StatusView status="loading" />;
  if (!item) {
    return (
      <StatusView
        status="error"
        message={t('product.notFound')}
        onRetry={() => navigation.goBack()}
      />
    );
  }

  const auction = item.auction;
  const currentBidFils = item.priceFils;
  const incrementFils = auction?.incrementFils ?? 1000;
  const minRequiredFils = currentBidFils + incrementFils;
  const ended = !!auction && auction.endsAt <= now;

  const handleQuickAdd = (addDinars: number) => {
    const targetFils = currentBidFils + addDinars * 1000;
    setBidJod((targetFils / 1000).toString());
  };

  const handlePlaceBid = () => {
    const numericBid = parseFloat(bidJod);
    if (isNaN(numericBid) || numericBid <= 0) {
      toast.error(t('validation.cardInvalid'));
      return;
    }

    const amountFils = Math.round(numericBid * 1000);
    if (amountFils < minRequiredFils) {
      toast.error(
        t('auctionBidding.minBidNote', {
          amount: formatJOD(minRequiredFils, lang),
        }),
      );
      return;
    }

    placeBid.mutate(
      { itemId: item.id, amountFils },
      {
        onSuccess: () => {
          toast.success(t('auctionBidding.bidSuccess'));
          setBidJod('');
        },
        onError: () => {
          toast.error(t('errors.UNKNOWN'));
        },
      },
    );
  };

  return (
    <Screen
      header={
        <>
          <BackButton />
          <Heading className="text-xl">{t('auctionBidding.title')}</Heading>
          <Badge label={t('auctions.live')} tone="success" dot />
        </>
      }
    >
      <ScrollView
        contentContainerClassName="gap-6 p-5 pb-10"
        keyboardShouldPersistTaps="handled"
      >
        {/* Item Image with Timer */}
        <View className="relative aspect-square w-full overflow-hidden rounded-2xl bg-brand-surface shadow-sm">
          <Image
            source={{ uri: item.imageUrl }}
            className="h-full w-full"
            resizeMode="cover"
          />
          {auction && (
            <View className="absolute bottom-3 end-3 start-3 flex-row items-center gap-2 rounded-xl bg-brand-espresso/90 px-4 py-3">
              <Icon name="Clock" size={18} color={colors.onPrimary} />
              <Text className="font-sans-bold text-sm text-brand-on-primary">
                {ended
                  ? t('time.ended')
                  : t('time.left', {
                      time: timeLeftLabel(auction.endsAt, now),
                    })}
              </Text>
            </View>
          )}
        </View>

        {/* Item Details */}
        <View className="gap-2">
          <Heading className="text-2xl">{localized(item.title)}</Heading>
          <View className="flex-row items-center gap-2">
            <ConditionTag condition={item.condition} />
            <Text className="font-sans-bold text-xs text-brand-warmgray">
              {t('card.by', { name: localized(item.seller) })}
            </Text>
          </View>
        </View>

        {/* Current Bid & Minimum Bid Notice */}
        <Card className="gap-2 p-4">
          <Text className="font-sans-bold text-xs text-brand-warmgray">
            {t('auctionBidding.currentBid')}
          </Text>
          <Price
            fils={currentBidFils}
            className="text-3xl text-brand-primary"
          />
          <Text className="font-sans-medium text-xs text-brand-warmgray">
            {t('auctionBidding.minBidNote', {
              amount: formatJOD(minRequiredFils, lang),
            })}
          </Text>
        </Card>

        {/* Quick Add Buttons & Bid Form */}
        {!ended && (
          <View className="gap-4">
            <View className="gap-2">
              <Text className="font-sans-bold text-sm">
                {t('auctionBidding.quickAdd')}
              </Text>
              <View className="flex-row gap-2">
                <Chip
                  label="+1 JOD"
                  onPress={() => handleQuickAdd(1)}
                  className="flex-1 items-center justify-center py-3"
                />
                <Chip
                  label="+5 JOD"
                  onPress={() => handleQuickAdd(5)}
                  className="flex-1 items-center justify-center py-3"
                />
                <Chip
                  label="+10 JOD"
                  onPress={() => handleQuickAdd(10)}
                  className="flex-1 items-center justify-center py-3"
                />
                <Chip
                  label="+25 JOD"
                  onPress={() => handleQuickAdd(25)}
                  className="flex-1 items-center justify-center py-3"
                />
              </View>
            </View>

            <TextField
              label={t('auctionBidding.yourBidJod')}
              value={bidJod}
              onChangeText={setBidJod}
              keyboardType="decimal-pad"
              placeholder={`${minRequiredFils / 1000}`}
              ltr
            />

            <Button
              size="lg"
              icon="Gavel"
              label={t('auctionBidding.placeBid')}
              loading={placeBid.isPending}
              onPress={handlePlaceBid}
            />
          </View>
        )}

        {/* Bid History List */}
        <View className="gap-3 pt-2">
          <Heading className="text-lg">
            {t('auctionBidding.bidHistory')}
          </Heading>
          {bids.length === 0 ? (
            <Text className="font-sans-medium text-sm text-brand-warmgray">
              {t('auctionBidding.noBidsYet')}
            </Text>
          ) : (
            <View className="gap-2">
              {bids.map(bid => (
                <Card
                  key={bid.id}
                  className="flex-row items-center justify-between p-3"
                >
                  <View className="flex-row items-center gap-3">
                    <View className="h-9 w-9 items-center justify-center rounded-full bg-brand-lightgray">
                      <Icon name="Gavel" size={16} color={colors.primary} />
                    </View>
                    <View>
                      <Text className="font-sans-bold text-sm">
                        {bid.bidderName}
                      </Text>
                      <Text className="text-[10px] text-brand-warmgray">
                        {new Date(bid.createdAt).toLocaleTimeString()}
                      </Text>
                    </View>
                  </View>
                  <Price
                    fils={bid.amountFils}
                    className="text-base text-brand-primary"
                  />
                </Card>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
