// Live auction detail & bidding screen (Phase 5): photo gallery, live countdown,
// current bid, minimum increment, quick-add buttons (+5, +10, +25 JOD),
// custom bid input, bid history list, and similar items (same kind of item,
// most viewed first). Sellers can't bid on their own
// auction; once it ends, the winner (auction.winnerId) pays like a buyer.

import { useIsFocused } from '@react-navigation/native';
import { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { ConditionTag } from '@/components/ConditionTag';
import { Icon } from '@/components/icons';
import { ItemRail } from '@/components/ItemRail';
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
import { TimeLeft } from '@/components/TimeLeft';
import { config } from '@/config';
import { useLiveAuction } from '@/features/auctions/hooks/useLiveAuction';
import { useRequireAuth } from '@/features/auth/hooks/useRequireAuth';
import { useUser } from '@/features/auth/sessionStore';
import { useItem } from '@/features/catalog/hooks/useCatalog';
import { useSimilarItems } from '@/features/catalog/hooks/useSimilarItems';
import { useBids, usePlaceBid } from '@/features/offers/hooks/useNegotiation';
import { useHasEnded } from '@/hooks/useNow';
import { useLang, useLocalized } from '@/i18n';
import { formatJOD } from '@/lib/money';
import type { RootScreenProps } from '@/navigation/types';
import { errorMessageKey } from '@/services/api/errors';
import { toast } from '@/store/toastStore';
import { colors } from '@/theme/colors';

export function AuctionBiddingScreen({
  route,
  navigation,
}: RootScreenProps<'AuctionBidding'>) {
  const { t } = useTranslation();
  const lang = useLang();
  const localized = useLocalized();
  const itemId = route.params?.itemId;

  // New bids arrive over the live connection; the polls catch whatever it can't carry. Once the
  // auction has ended the winner comes from the server's closing job, so ask quickly again.
  // Under another screen (checkout) neither runs; coming back reconnects and catches up.
  const isFocused = useIsFocused();
  const { connected, reconnecting } = useLiveAuction(itemId, isFocused);
  const { data: item, isLoading: isItemLoading } = useItem(itemId, {
    pollMs: current => {
      if (!isFocused) return false;
      return connected &&
        current?.auction &&
        Date.now() < current.auction.endsAt
        ? config.pollMs.auctionLive
        : config.pollMs.auction;
    },
  });
  const { data: bids = [], isLoading: isBidsLoading } = useBids(
    itemId,
    !isFocused
      ? false
      : connected
        ? config.pollMs.auctionLive
        : config.pollMs.auction,
  );
  const placeBid = usePlaceBid();
  const user = useUser();
  const requireAuth = useRequireAuth();

  const [bidJod, setBidJod] = useState('');
  // Before the early returns: hooks run on every render.
  const ended = useHasEnded(item?.auction?.endsAt);
  // Same kind of item, any price, most viewed first.
  const similar = useSimilarItems(item, 'views');

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
  const isMine = !!user && user.id === item.sellerId;
  const won = ended && !!user && auction?.winnerId === user.id;
  const currentBidFils = item.priceFils;
  const incrementFils = auction?.incrementFils ?? 1000;
  const minRequiredFils = currentBidFils + incrementFils;

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
        onError: error => {
          toast.error(t(errorMessageKey(error)));
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
      {/* Above the scrolling part: it must stay in sight wherever the person has scrolled to. */}
      {reconnecting && !ended && (
        <View
          testID="auction-reconnecting"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="flex-row items-center gap-2 bg-brand-warning-soft px-5 py-3"
        >
          <Icon name="AlertCircle" size={16} color={colors.warningText} />
          <Text className="flex-1 font-sans-bold text-xs text-brand-warning-text">
            {t('auctionBidding.reconnecting')}
          </Text>
        </View>
      )}
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
              <TimeLeft
                endsAt={auction.endsAt}
                className="font-sans-bold text-sm text-brand-on-primary"
              />
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

        {isMine && (
          <Text className="text-center font-sans-bold text-sm text-brand-warmgray">
            {t('listing.yours')}
          </Text>
        )}
        {ended && !isMine && (
          <Card className="gap-3 p-4">
            <Text className="font-sans-bold text-sm">
              {t(won ? 'auctionBidding.won' : 'auctionBidding.ended')}
            </Text>
            {won && item.status === 'active' && (
              <Button
                size="lg"
                icon="Lock"
                label={t('product.payNow')}
                onPress={() =>
                  requireAuth({ name: 'Checkout', params: { itemId: item.id } })
                }
              />
            )}
          </Card>
        )}

        {/* Quick Add Buttons & Bid Form */}
        {!ended && !isMine && (
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

        {similar.items.length > 0 && (
          <View>
            <Heading className="text-lg">{t('product.similar')}</Heading>
            <Text className="mb-3 mt-0.5 font-sans-medium text-xs text-brand-warmgray">
              {t(
                similar.fallback
                  ? 'product.similarCategoryMostViewed'
                  : 'product.similarMostViewed',
              )}
            </Text>
            <ItemRail items={similar.items} size="sm" />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
