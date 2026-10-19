// Make an offer screen (Phase 5): buyer inputs custom offer in JOD, calculates
// escrow fee breakdown (Item offer + 3% Buyer protection + 2 JOD flat delivery),
// and submits offer to the seller.

import { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Price } from '@/components/Price';
import { StatusView } from '@/components/StatusView';
import { Button, Card, Heading, Screen, Text, TextField } from '@/components/ui';
import { useItems } from '@/features/catalog/hooks/useCatalog';
import { useLang, useLocalized } from '@/i18n';
import { calculateCheckoutBreakdown, formatJOD } from '@/lib/money';
import type { RootScreenProps } from '@/navigation/types';
import { toast } from '@/store/toastStore';
import { useMakeOffer } from '../hooks/useNegotiation';

export function MakeOfferScreen({
  route,
  navigation,
}: RootScreenProps<'MakeOffer'>) {
  const { t } = useTranslation();
  const lang = useLang();
  const localized = useLocalized();
  const itemId = route.params?.itemId;

  const { data: items, isLoading, isError, refetch } = useItems();
  const makeOffer = useMakeOffer();

  const item = items?.find(i => i.id === itemId);

  const [offerJod, setOfferJod] = useState('');

  if (isLoading) return <StatusView status="loading" />;
  if (isError || !item) {
    return (
      <StatusView
        status="error"
        message={t('product.notFound')}
        onRetry={refetch}
      />
    );
  }

  const numericOffer = parseFloat(offerJod || '0');
  const offerFils = Math.round(numericOffer * 1000);
  const breakdown = calculateCheckoutBreakdown(offerFils);

  const handleSubmit = () => {
    if (isNaN(numericOffer) || numericOffer <= 0) {
      toast.error(t('validation.cardInvalid'));
      return;
    }

    makeOffer.mutate(
      { itemId: item.id, amountFils: offerFils },
      {
        onSuccess: () => {
          toast.success(t('offers.offerSent'));
          navigation.navigate('Tabs', { screen: 'Chats' });
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
          <Heading className="text-xl">{t('offers.title')}</Heading>
        </>
      }
    >
      <ScrollView
        contentContainerClassName="gap-6 p-5 pb-10"
        keyboardShouldPersistTaps="handled"
      >
        {/* Item summary card */}
        <Card className="flex-row items-center gap-4 p-3">
          <Image
            source={{ uri: item.imageUrl }}
            className="h-20 w-20 rounded-xl"
          />
          <View className="flex-1">
            <Heading className="text-base" numberOfLines={1}>
              {localized(item.title)}
            </Heading>
            <Text className="mt-1 text-xs text-brand-warmgray">
              {t('card.buyNow')}
            </Text>
            <Price fils={item.priceFils} className="text-base" />
          </View>
        </Card>

        {/* Offer amount input */}
        <TextField
          label={t('offers.offerAmount')}
          value={offerJod}
          onChangeText={setOfferJod}
          keyboardType="decimal-pad"
          placeholder={`${item.priceFils / 1000}`}
          ltr
        />

        {/* Fee breakdown preview */}
        {offerFils > 0 && (
          <Card className="gap-3 p-4">
            <Heading className="text-sm">{t('offers.feeBreakdown')}</Heading>

            <View className="flex-row justify-between">
              <Text className="text-sm text-brand-warmgray">
                {t('offers.itemOffer')}
              </Text>
              <Text className="font-sans-bold text-sm">
                {formatJOD(breakdown.itemPriceFils, lang)}
              </Text>
            </View>

            <View className="flex-row justify-between">
              <Text className="text-sm text-brand-warmgray">
                {t('offers.buyerProtection')}
              </Text>
              <Text className="font-sans-bold text-sm">
                {formatJOD(breakdown.buyerProtectionFils, lang)}
              </Text>
            </View>

            <View className="flex-row justify-between">
              <Text className="text-sm text-brand-warmgray">
                {t('offers.deliveryFee')}
              </Text>
              <Text className="font-sans-bold text-sm">
                {formatJOD(breakdown.deliveryFils, lang)}
              </Text>
            </View>

            <View className="mt-1 h-[1px] bg-brand-border" />

            <View className="flex-row justify-between pt-1">
              <Text className="font-sans-bold text-base">
                {t('offers.totalToPay')}
              </Text>
              <Price
                fils={breakdown.totalFils}
                className="text-xl text-brand-primary"
              />
            </View>
          </Card>
        )}

        {/* Send offer button */}
        <Button
          size="lg"
          label={t('offers.sendOffer')}
          loading={makeOffer.isPending}
          disabled={numericOffer <= 0}
          onPress={handleSubmit}
          className="mt-2"
        />
      </ScrollView>
    </Screen>
  );
}
