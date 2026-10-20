// Secure checkout (prototype Checkout): item, price breakdown, card, Pay.
// The price is the listing's, or an accepted offer's when opened from chat.
// Paying puts the money in escrow; the buyer then tracks the order and gets
// the delivery PIN (features/orders).

import { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Icon } from '@/components/icons';
import { Price } from '@/components/Price';
import { StatusView } from '@/components/StatusView';
import {
  Button,
  Card,
  Heading,
  Ltr,
  Screen,
  Text,
  TextField,
} from '@/components/ui';
import { useUser } from '@/features/auth/sessionStore';
import { useItem } from '@/features/catalog/hooks/useCatalog';
import { useLang, useLocalized } from '@/i18n';
import { calculateCheckoutBreakdown, formatJOD } from '@/lib/money';
import type { RootScreenProps } from '@/navigation/types';
import { errorMessageKey } from '@/services/api/errors';
import { paymentProvider } from '@/services/payments';
import { toast } from '@/store/toastStore';
import { colors } from '@/theme/colors';
import { useOffer } from '@/features/offers/hooks/useNegotiation';
import { useCreateOrder, usePayOrder } from '../hooks/useOrders';

/** Token that tells the server to charge the account's saved card. */
const SAVED_CARD = 'saved';

export function CheckoutScreen({
  route,
  navigation,
}: RootScreenProps<'Checkout'>) {
  const { t } = useTranslation();
  const lang = useLang();
  const localized = useLocalized();
  const user = useUser();
  const { itemId, offerId } = route.params;

  const { data: item, isLoading, isError, refetch } = useItem(itemId);
  const offer = useOffer(offerId);
  const createOrder = useCreateOrder();
  const payOrder = usePayOrder();
  const [cardNumber, setCardNumber] = useState('');
  const [tokenizing, setTokenizing] = useState(false);

  if (isLoading || offer.isLoading) return <StatusView status="loading" />;
  const offerUsable =
    !offerId ||
    (offer.data?.status === 'accepted' && offer.data.itemId === itemId);
  if (!offerUsable)
    return (
      <StatusView
        status="error"
        message={t('checkout.offerNotReady')}
        onRetry={() => navigation.goBack()}
      />
    );
  if (isError || !item) {
    return (
      <StatusView
        status="error"
        message={t('product.notFound')}
        onRetry={refetch}
      />
    );
  }

  // Display only: the server prices the order when it is created.
  const priceFils = offer.data?.amountFils ?? item.priceFils;
  const breakdown = calculateCheckoutBreakdown(priceFils);
  const savedCard = user?.card;
  const cardDigits = cardNumber.replace(/\D/g, '');
  const cardReady = !!savedCard || cardDigits.length >= 12;
  const busy = tokenizing || createOrder.isPending || payOrder.isPending;

  const pay = async () => {
    try {
      setTokenizing(true);
      const cardToken = savedCard
        ? SAVED_CARD
        : await paymentProvider.tokenizeCard(cardNumber);
      setTokenizing(false);
      const order = await createOrder.mutateAsync({
        listingId: item.id,
        offerId,
      });
      await payOrder.mutateAsync({ orderId: order.id, cardToken });
      toast.success(t('checkout.paid'));
      navigation.replace('OrderTracking');
    } catch (error) {
      setTokenizing(false);
      toast.error(t(errorMessageKey(error)));
    }
  };

  const row = (label: string, fils: number) => (
    <View className="flex-row justify-between">
      <Text className="text-sm text-brand-warmgray">{label}</Text>
      <Text className="font-sans-bold text-sm">{formatJOD(fils, lang)}</Text>
    </View>
  );

  return (
    <Screen
      header={
        <>
          <BackButton />
          <Heading className="text-xl">{t('checkout.title')}</Heading>
        </>
      }
    >
      <ScrollView
        contentContainerClassName="gap-6 p-5 pb-10"
        keyboardShouldPersistTaps="handled"
      >
        <Card className="flex-row items-center gap-4 p-3">
          <Image
            source={{ uri: item.imageUrl }}
            className="h-20 w-20 rounded-xl"
          />
          <View className="flex-1">
            <Heading className="text-base" numberOfLines={2}>
              {localized(item.title)}
            </Heading>
            <Text className="mt-1 text-xs text-brand-warmgray">
              {localized(item.seller)}
            </Text>
          </View>
        </Card>

        <Card className="gap-3 p-4">
          <Heading className="text-sm">{t('offers.feeBreakdown')}</Heading>
          {row(
            offerId ? t('checkout.agreedPrice') : t('offers.itemOffer'),
            breakdown.itemPriceFils,
          )}
          {row(t('offers.buyerProtection'), breakdown.buyerProtectionFils)}
          {row(t('offers.deliveryFee'), breakdown.deliveryFils)}
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

        <View className="gap-3">
          <Heading className="text-sm">{t('checkout.payWith')}</Heading>
          {savedCard ? (
            <View className="flex-row items-center justify-between rounded-2xl bg-brand-espresso p-4">
              <Ltr className="font-sans-bold text-base tracking-widest text-brand-on-primary">
                {`•••• •••• •••• ${savedCard.last4}`}
              </Ltr>
              <Text className="font-sans-bold text-xs text-brand-secondary">
                {t('checkout.savedCard')}
              </Text>
            </View>
          ) : (
            <TextField
              value={cardNumber}
              onChangeText={setCardNumber}
              placeholder={t('checkout.newCard')}
              accessibilityLabel={t('checkout.newCard')}
              keyboardType="number-pad"
              autoComplete="cc-number"
              ltr
              error={
                cardNumber && cardDigits.length < 12
                  ? t('validation.cardInvalid')
                  : undefined
              }
            />
          )}
        </View>

        <View className="flex-row items-start gap-2 rounded-xl border border-brand-secondary bg-brand-secondary/15 p-3">
          <Icon name="Lock" size={18} color={colors.primary} />
          <Text className="flex-1 font-sans-medium text-xs leading-relaxed">
            {t('checkout.escrowNote')}
          </Text>
        </View>

        <Button
          size="lg"
          label={t('checkout.pay', {
            amount: formatJOD(breakdown.totalFils, lang),
          })}
          disabled={!cardReady}
          loading={busy}
          onPress={pay}
        />
      </ScrollView>
    </Screen>
  );
}
