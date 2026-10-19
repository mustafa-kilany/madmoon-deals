// Product page (prototype ProductDetail): photo gallery with floating back /
// share / save, title and price, condition and location, trust badges,
// seller card, description, similar items, and the Make an Offer / Pay Now bar.
// Buying actions need an account: they open sign-in (redirect-after-login
// arrives with auth in Phase 3).

import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { ConditionTag } from '@/components/ConditionTag';
import { Icon } from '@/components/icons';
import { ItemRail } from '@/components/ItemRail';
import { Price } from '@/components/Price';
import { StatusView } from '@/components/StatusView';
import { Button, Card, Heading, Text } from '@/components/ui';
import {
  useIsFavorite,
  useToggleFavorite,
} from '@/features/favorites/hooks/useFavorites';
import { useLang, useLocalized } from '@/i18n';
import { formatJOD } from '@/lib/money';
import type { Item } from '@/lib/types';
import type { RootScreenProps } from '@/navigation/types';
import { colors } from '@/theme/colors';
import { useItems } from '../hooks/useCatalog';

// Prototype's seller photo (same for every seller until real profiles exist).
const SELLER_AVATAR =
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&h=100&fit=crop';

/** The prototype fakes a 3-photo gallery from one image with Unsplash effects. */
const galleryOf = (url: string) => [
  url,
  url.replace('fit=crop', 'fit=crop&sat=-30'),
  url.replace('fit=crop', 'fit=crop&flip=h'),
];

export function ProductScreen({
  route,
  navigation,
}: RootScreenProps<'Product'>) {
  const { t } = useTranslation();
  const { data: items, isPending, isError, refetch } = useItems();
  const item = items?.find(i => i.id === route.params.itemId);

  if (isError) return <StatusView status="error" onRetry={refetch} />;
  if (isPending) return <StatusView status="loading" />;
  if (!item)
    return (
      <StatusView
        status="error"
        message={t('product.notFound')}
        onRetry={() => navigation.goBack()}
      />
    );
  return <ProductDetail item={item} allItems={items} />;
}

function ProductDetail({ item, allItems }: { item: Item; allItems: Item[] }) {
  const { t } = useTranslation();
  const lang = useLang();
  const localized = useLocalized();
  const insets = useSafeAreaInsets();
  const saved = useIsFavorite(item.id);
  const toggleFavorite = useToggleFavorite();
  const [selected, setSelected] = useState(0);
  const navigation = useNavigation();

  const title = localized(item.title);
  const gallery = galleryOf(item.imageUrl);
  const similar = allItems
    .filter(i => i.category === item.category && i.id !== item.id)
    .slice(0, 6);
  const requireAuth = () => navigation.navigate('Auth');

  const share = () =>
    Share.share({
      message: t('product.shareText', {
        title,
        price: formatJOD(item.priceFils, lang),
      }),
    });

  return (
    <View className="flex-1 bg-brand-lightgray">
      <ScrollView contentContainerClassName="pb-5">
        <View className="aspect-square w-full bg-brand-espresso">
          <Image
            source={{ uri: gallery[selected] }}
            className="h-full w-full"
            resizeMode="cover"
            accessibilityLabel={title}
          />
        </View>
        <View className="-mt-8 flex-row gap-3 px-5">
          {gallery.map((uri, i) => (
            <Pressable
              key={uri}
              onPress={() => setSelected(i)}
              accessibilityRole="button"
              accessibilityLabel={t('product.photo', { index: i + 1 })}
              accessibilityState={{ selected: i === selected }}
              className={`h-16 w-16 overflow-hidden rounded-xl border-2 shadow-sm ${
                i === selected ? 'border-brand-primary' : 'border-brand-surface'
              }`}
            >
              <Image
                source={{ uri }}
                className="h-full w-full"
                resizeMode="cover"
              />
            </Pressable>
          ))}
        </View>

        <View className="gap-5 p-5">
          <View>
            <Heading className="text-2xl leading-tight">{title}</Heading>
            <Price
              fils={item.priceFils}
              className="mt-2 text-3xl text-brand-primary"
              unitClassName="text-lg"
            />
          </View>

          <View className="flex-row gap-3">
            <Card className="flex-1 p-3">
              <Text className="font-sans-bold text-[11px] text-brand-warmgray">
                {t('product.condition')}
              </Text>
              <View className="mt-1">
                <ConditionTag condition={item.condition} size="md" />
              </View>
            </Card>
            <Card className="flex-1 p-3">
              <Text className="font-sans-bold text-[11px] text-brand-warmgray">
                {t('product.location')}
              </Text>
              <View className="mt-0.5 flex-row items-center gap-1">
                <Icon name="MapPin" size={14} color={colors.primary} />
                <Text className="font-sans-bold text-sm">
                  {localized(item.location.name)}
                </Text>
              </View>
            </Card>
          </View>

          <View className="flex-row gap-2">
            <Card className="flex-1 flex-row items-center gap-2 p-3">
              <Icon name="Shield" size={20} color={colors.success} />
              <Text className="flex-1 font-sans-bold text-[11px] leading-tight">
                {t('product.buyerProtection')}
              </Text>
            </Card>
            <Card className="flex-1 flex-row items-center gap-2 p-3">
              <Icon name="Truck" size={20} color={colors.primary} />
              <Text className="flex-1 font-sans-bold text-[11px] leading-tight">
                {t('product.delivery48h')}
              </Text>
            </Card>
          </View>

          <Card className="flex-row items-center gap-3 p-3">
            <View className="h-11 w-11 overflow-hidden rounded-full bg-brand-muted">
              <Image
                source={{ uri: SELLER_AVATAR }}
                className="h-full w-full"
              />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-1">
                <Text className="font-sans-bold leading-tight">
                  {localized(item.seller)}
                </Text>
                {item.verified && (
                  <Icon name="BadgeCheck" size={16} color={colors.success} />
                )}
              </View>
              <View className="mt-0.5 flex-row flex-wrap items-center gap-1">
                <Icon name="Star" size={14} color={colors.secondary} filled />
                <Text className="font-sans-bold text-xs">4.9</Text>
                <Text className="font-sans-medium text-xs text-brand-warmgray">
                  · {t('product.reviews')} · {t('product.replies')}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={requireAuth}
              accessibilityRole="button"
              className="rounded-xl bg-brand-primary/10 px-3 py-2"
            >
              <Text className="font-sans-bold text-xs text-brand-primary">
                {t('product.chat')}
              </Text>
            </Pressable>
          </Card>

          <View>
            <Heading className="mb-2 text-base">
              {t('product.description')}
            </Heading>
            <Text className="font-sans-medium text-sm leading-relaxed text-brand-warmgray">
              {t('product.descriptionDefault')}
            </Text>
          </View>

          {similar.length > 0 && (
            <View>
              <Heading className="mb-3 text-base">
                {t('product.similar')}
              </Heading>
              <ItemRail items={similar} size="sm" />
            </View>
          )}
        </View>
      </ScrollView>

      <View
        className="absolute inset-x-0 top-0 flex-row items-center justify-between px-5"
        style={{ paddingTop: insets.top + 12 }}
      >
        <BackButton variant="floating" />
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={share}
            accessibilityRole="button"
            accessibilityLabel={t('product.share')}
            className="rounded-full bg-brand-surface/80 p-2 shadow-sm"
          >
            <Icon name="Share" size={20} />
          </Pressable>
          <Pressable
            onPress={() => toggleFavorite(item.id)}
            accessibilityRole="button"
            accessibilityLabel={saved ? t('card.removeSaved') : t('card.save')}
            accessibilityState={{ selected: saved }}
            className={`rounded-full p-2 shadow-sm ${
              saved ? 'bg-brand-primary' : 'bg-brand-surface/80'
            }`}
          >
            <Icon
              name="Heart"
              size={20}
              color={saved ? colors.onPrimary : colors.espresso}
              filled={saved}
            />
          </Pressable>
        </View>
      </View>

      <View
        className="flex-row items-center gap-3 border-t border-brand-border bg-brand-surface px-4 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <Pressable
          onPress={requireAuth}
          accessibilityRole="button"
          className="flex-1 items-center rounded-xl border-2 border-brand-primary bg-brand-surface py-4 active:scale-[0.98]"
        >
          <Text className="font-sans-bold text-base text-brand-primary">
            {t('product.makeOffer')}
          </Text>
        </Pressable>
        <Button
          className="flex-1"
          label={t('product.payNow')}
          onPress={requireAuth}
        />
      </View>
    </View>
  );
}
