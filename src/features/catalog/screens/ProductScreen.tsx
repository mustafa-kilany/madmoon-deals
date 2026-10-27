// Product page (prototype ProductDetail): photo gallery with floating back /
// share / save, title and price, condition and location, trust badges,
// seller card, description, similar items, and the Make an Offer / Pay Now bar.
// Certified refurbished listings add the brand's guarantee box; phones and
// electronics, the shop's test certificate.
// Buying actions need an account: guests sign in first, then continue. Your
// own listings and reserved / sold ones show a note instead of the buy bar.

import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { ConditionTag } from '@/components/ConditionTag';
import { Icon, type IconName } from '@/components/icons';
import { ItemRail } from '@/components/ItemRail';
import { Price } from '@/components/Price';
import { ReadMoreText } from '@/components/ReadMoreText';
import { StatusView } from '@/components/StatusView';
import { Badge, Button, Card, Heading, Text } from '@/components/ui';
import { useRequireAuth } from '@/features/auth/hooks/useRequireAuth';
import { useUser } from '@/features/auth/sessionStore';
import {
  useIsFavorite,
  useToggleFavorite,
} from '@/features/favorites/hooks/useFavorites';
import { useLang, useLocalized } from '@/i18n';
import { formatDate } from '@/lib/dates';
import { formatJOD, jod } from '@/lib/money';
import { placeLabel } from '@/lib/places';
import type { Item, TestCertificate } from '@/lib/types';
import type { RootScreenProps } from '@/navigation/types';
import { ApiError } from '@/services/api/errors';
import { colors } from '@/theme/colors';
import { useItem } from '../hooks/useCatalog';
import { useSimilarItems } from '../hooks/useSimilarItems';

// Prototype's seller photo (same for every seller until real profiles exist).
const SELLER_AVATAR =
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&h=100&fit=crop';

/** The prototype fakes a 3-photo gallery from one image with Unsplash effects. */
const galleryOf = (url: string) => [
  url,
  url.replace('fit=crop', 'fit=crop&sat=-30'),
  url.replace('fit=crop', 'fit=crop&flip=h'),
];

const isNotFound = (error: unknown) =>
  error instanceof ApiError && error.code === 'NOT_FOUND';

export function ProductScreen({
  route,
  navigation,
}: RootScreenProps<'Product'>) {
  const { t } = useTranslation();
  const {
    data: item,
    isPending,
    isError,
    error,
    refetch,
  } = useItem(route.params.itemId);

  if (isError && !isNotFound(error))
    return <StatusView status="error" onRetry={refetch} />;
  if (isPending && !isError) return <StatusView status="loading" />;
  if (!item)
    return (
      <StatusView
        status="error"
        message={t('product.notFound')}
        onRetry={() => navigation.goBack()}
      />
    );
  return <ProductDetail item={item} />;
}

function ProductDetail({ item }: { item: Item }) {
  const { t } = useTranslation();
  const lang = useLang();
  const localized = useLocalized();
  const insets = useSafeAreaInsets();
  const saved = useIsFavorite(item.id);
  const toggleFavorite = useToggleFavorite();
  const [selected, setSelected] = useState(0);
  const requireAuth = useRequireAuth();
  const user = useUser();
  const isMine = !!user && user.id === item.sellerId;
  const forSale = item.status === 'active';

  const title = localized(item.title);
  // Real listings carry their own photos; demo listings fake a gallery.
  const gallery = item.imageUrls?.length
    ? item.imageUrls
    : galleryOf(item.imageUrl);
  // Same kind of item at a similar price, e.g. other cars around 10,000 JOD.
  const similar = useSimilarItems(item, 'price');
  // Prototype: the seller's Chat button also starts an offer.
  const makeOffer = () =>
    requireAuth({ name: 'MakeOffer', params: { itemId: item.id } });
  const payNow = () =>
    requireAuth({ name: 'Checkout', params: { itemId: item.id } });
  const report = () =>
    requireAuth({ name: 'Report', params: { type: 'listing', id: item.id } });

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
            {item.status !== 'active' && (
              <Badge
                label={t(`listing.${item.status}`)}
                tone={item.status === 'sold' ? 'neutral' : 'warning'}
                className="mb-2"
              />
            )}
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
                  {placeLabel(item.location, localized)}
                </Text>
              </View>
            </Card>
          </View>

          {item.refurbished && (
            <RefurbishedGuarantee
              brand={item.brand}
              warrantyMonths={item.refurbished.warrantyMonths}
            />
          )}

          {item.testCertificate && (
            <ShopTested certificate={item.testCertificate} />
          )}

          {item.brand && (
            <Card className="p-3">
              <Text className="font-sans-bold text-[11px] text-brand-warmgray">
                {t('product.brand')}
              </Text>
              <Text className="mt-0.5 font-sans-bold text-sm">
                {[item.brand, item.model].filter(Boolean).join(' · ')}
              </Text>
            </Card>
          )}

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
            {forSale && !isMine && (
              <Pressable
                onPress={makeOffer}
                accessibilityRole="button"
                className="rounded-xl bg-brand-primary/10 px-3 py-2"
              >
                <Text className="font-sans-bold text-xs text-brand-primary">
                  {t('product.chat')}
                </Text>
              </Pressable>
            )}
          </Card>

          {item.description && (
            <View>
              <Heading className="mb-2 text-base">
                {t('product.description')}
              </Heading>
              <ReadMoreText
                text={item.description}
                className="font-sans-medium text-sm leading-relaxed text-brand-warmgray"
              />
            </View>
          )}

          {!isMine && (
            <Pressable
              onPress={report}
              accessibilityRole="button"
              className="min-h-11 flex-row items-center gap-2 self-start"
            >
              <Icon name="Flag" size={16} color={colors.warmgray} />
              <Text className="font-sans-bold text-xs text-brand-warmgray">
                {t('listing.report')}
              </Text>
            </Pressable>
          )}

          {similar.items.length > 0 && (
            <View>
              <Heading className="text-base">{t('product.similar')}</Heading>
              <Text className="mb-3 mt-0.5 font-sans-medium text-xs text-brand-warmgray">
                {similar.fallback
                  ? t('product.similarCategory')
                  : t('product.similarPrice', {
                      min: formatJOD(jod(similar.range.min), lang),
                      max: formatJOD(jod(similar.range.max), lang),
                    })}
              </Text>
              <ItemRail items={similar.items} size="sm" />
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
        {isMine || !forSale ? (
          <Text className="flex-1 py-4 text-center font-sans-bold text-sm text-brand-warmgray">
            {t(isMine ? 'listing.yours' : 'listing.unavailable')}
          </Text>
        ) : (
          <>
            <Pressable
              onPress={makeOffer}
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
              onPress={payNow}
            />
          </>
        )}
      </View>
    </View>
  );
}

/** The shop's test report on a phone or electronics listing; tap to see it. */
function ShopTested({ certificate }: { certificate: TestCertificate }) {
  const { t } = useTranslation();
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityHint={t('certificate.view')}
        className="flex-row items-center gap-3 rounded-2xl border border-brand-success bg-brand-success-soft p-3 active:opacity-80"
      >
        <Image
          source={certificate.image}
          className="h-14 w-11 rounded-md bg-brand-surface"
        />
        <View className="flex-1">
          <View className="flex-row items-center gap-1">
            <Icon name="ClipboardCheck" size={16} color={colors.success} />
            <Text className="flex-1 font-sans-bold text-sm text-brand-success">
              {t('certificate.testedBy', { shop: certificate.shopName })}
            </Text>
          </View>
          <Text className="mt-0.5 font-sans-medium text-xs">
            {[
              formatDate(certificate.testedAt, lang),
              ...certificate.specs,
            ].join(' · ')}
          </Text>
          <Text className="mt-0.5 font-sans-bold text-xs text-brand-primary">
            {t('certificate.view')}
          </Text>
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1 bg-black">
          <Image
            source={certificate.image}
            className="flex-1"
            resizeMode="contain"
            accessibilityLabel={t('certificate.testedBy', {
              shop: certificate.shopName,
            })}
          />
          <Pressable
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            className="absolute end-5 rounded-full bg-brand-surface/80 p-2"
            style={{ top: insets.top + 12 }}
          >
            <Icon name="X" size={20} />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

/** What the brand promises on a certified refurbished listing. */
function RefurbishedGuarantee({
  brand,
  warrantyMonths,
}: {
  brand?: string;
  warrantyMonths: number;
}) {
  const { t } = useTranslation();
  const points: [IconName, string][] = [
    [
      'Shield',
      warrantyMonths
        ? t('refurbished.warranty', { months: warrantyMonths })
        : t('card.brandInspected'),
    ],
    ['Check', t('refurbished.fullyTested')],
    ['Box', t('refurbished.returns')],
  ];
  return (
    <View className="rounded-2xl bg-brand-espresso p-4">
      <View className="flex-row items-center gap-2">
        <Icon name="BadgeCheck" size={20} color={colors.onPrimary} />
        <Heading className="flex-1 text-base text-brand-on-primary">
          {t('refurbished.certifiedBy', { brand: brand ?? '' })}
        </Heading>
      </View>
      <View className="mt-3 flex-row gap-2">
        {points.map(([icon, label]) => (
          <View
            key={icon}
            className="flex-1 gap-1.5 rounded-xl bg-brand-surface/10 p-2.5"
          >
            <Icon name={icon} size={16} color={colors.primary} />
            <Text className="font-sans-bold text-xs leading-tight text-brand-on-primary">
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
