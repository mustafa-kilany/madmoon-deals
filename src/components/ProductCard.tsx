// Listing card for result grids (prototype components/ProductCard): photo
// with Verified badge and save heart, auction countdown band, title,
// condition · seller, price, location or bid count (warranty on certified
// refurbished listings), and Bid now for auctions.

import { memo } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ConditionTag } from '@/components/ConditionTag';
import { Icon } from '@/components/icons';
import { Price } from '@/components/Price';
import { TimeLeft } from '@/components/TimeLeft';
import { Heading, Text } from '@/components/ui';
import { useOpenItem } from '@/features/catalog/hooks/useOpenItem';
import {
  useIsFavorite,
  useToggleFavorite,
} from '@/features/favorites/hooks/useFavorites';
import { useHasEnded } from '@/hooks/useNow';
import { useLocalized } from '@/i18n';
import { placeLabel } from '@/lib/places';
import type { Item } from '@/lib/types';
import { colors } from '@/theme/colors';

/**
 * Memoised, and never redraws for the clock: the countdown text (TimeLeft)
 * ticks on its own, and the card itself only redraws when its auction ends.
 */
export const ProductCard = memo(function ProductCard({ item }: { item: Item }) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const openItem = useOpenItem();
  const saved = useIsFavorite(item.id);
  const toggleFavorite = useToggleFavorite();
  const auction = item.saleType === 'auction' ? item.auction : undefined;
  const ended = useHasEnded(auction?.endsAt);
  const title = localized(item.title);

  return (
    <View className="flex-1 overflow-hidden rounded-2xl border border-brand-border bg-brand-surface shadow-sm">
      <Pressable
        onPress={() => openItem(item)}
        accessibilityRole="button"
        accessibilityLabel={title}
        // grow, not flex-1: flex-1 starts from zero height and can collapse
        // the card when the grid row re-lays out.
        className="grow"
      >
        <View className="aspect-square w-full bg-brand-lightgray">
          <Image
            source={{ uri: item.imageUrl }}
            className="h-full w-full"
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
          {item.verified && (
            <View className="absolute start-2 top-2 flex-row items-center gap-1 rounded-full bg-brand-success px-2 py-1 shadow-sm">
              <Icon name="BadgeCheck" size={12} color={colors.onPrimary} />
              <Text className="font-sans-bold text-xs text-brand-on-primary">
                {t('card.verified')}
              </Text>
            </View>
          )}
          {auction && (
            <View
              className={`absolute bottom-2 end-2 start-2 flex-row items-center gap-1.5 rounded-lg px-2 py-1.5 ${
                ended ? 'bg-brand-surface/90' : 'bg-brand-espresso/85'
              }`}
            >
              <Icon
                name="Clock"
                size={14}
                color={ended ? colors.warmgray : colors.onPrimary}
              />
              <TimeLeft
                endsAt={auction.endsAt}
                className={`font-sans-bold text-xs ${
                  ended ? 'text-brand-warmgray' : 'text-brand-on-primary'
                }`}
              />
            </View>
          )}
        </View>

        <View className="p-3">
          <Heading className="text-sm" numberOfLines={1}>
            {title}
          </Heading>
          <View className="mt-1 flex-row items-center gap-1.5">
            <ConditionTag condition={item.condition} />
            {!auction && (
              // Refurbished: grade and seller share the row (both shrink), as
              // in the prototype; otherwise the seller takes what's left.
              <Text
                className={`font-sans-bold text-xs text-brand-warmgray ${
                  item.refurbished ? 'shrink' : 'flex-1'
                }`}
                numberOfLines={1}
              >
                {t('card.by', { name: localized(item.seller) })}
              </Text>
            )}
          </View>
          <Text className="mt-3 font-sans-bold text-xs text-brand-warmgray">
            {auction ? t('card.currentBid') : t('card.buyNow')}
          </Text>
          <Price fils={item.priceFils} className="text-lg" />
          {item.refurbished && !auction ? (
            <View className="mt-1 flex-row items-center gap-1">
              <Icon name="Shield" size={14} color={colors.primary} />
              <Text
                className="flex-1 font-sans-bold text-xs text-brand-primary"
                numberOfLines={1}
              >
                {item.refurbished.warrantyMonths
                  ? t('card.warranty', {
                      months: item.refurbished.warrantyMonths,
                    })
                  : t('card.brandInspected')}
              </Text>
            </View>
          ) : (
            <Text
              className="mt-1 text-xs text-brand-warmgray"
              numberOfLines={1}
            >
              {auction
                ? t('card.bids', { count: auction.bidCount })
                : placeLabel(item.location, localized)}
            </Text>
          )}
        </View>
      </Pressable>

      {auction && (
        <View className="px-3 pb-3">
          <Pressable
            onPress={() => openItem(item)}
            disabled={ended}
            accessibilityRole="button"
            accessibilityState={{ disabled: ended }}
            className={`min-h-11 flex-row items-center justify-center gap-1.5 rounded-xl bg-brand-primary py-2.5 active:scale-[0.98] ${
              ended ? 'opacity-40' : ''
            }`}
          >
            <Icon name="Gavel" size={16} color={colors.onPrimary} />
            <Text className="font-sans-bold text-xs text-brand-on-primary">
              {ended ? t('time.ended') : t('card.bidNow')}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Rendered after the photo so it sits on top of it. */}
      <Pressable
        onPress={() => toggleFavorite(item.id)}
        accessibilityRole="button"
        accessibilityLabel={saved ? t('card.removeSaved') : t('card.save')}
        accessibilityState={{ selected: saved }}
        hitSlop={6}
        className={`absolute end-2 top-2 h-8 w-8 items-center justify-center rounded-full shadow-sm ${
          saved ? 'bg-brand-primary' : 'bg-brand-surface/85'
        }`}
      >
        <Icon
          name="Heart"
          size={16}
          color={saved ? colors.onPrimary : colors.espresso}
          filled={saved}
        />
      </Pressable>
    </View>
  );
});
