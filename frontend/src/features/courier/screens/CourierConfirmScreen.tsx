// Courier delivery confirmation (DEVELOPMENT_GUIDE §3.3, steps 5–7): the
// courier hands over the item, enters the order number and the buyer's PIN,
// and the server checks it and releases escrow to the seller. A wrong PIN
// releases nothing. Only accounts with role 'courier' can use it.

import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Icon } from '@/components/icons';
import { StatusView } from '@/components/StatusView';
import { Button, Heading, Screen, Text, TextField } from '@/components/ui';
import { useUser } from '@/features/auth/sessionStore';
import { useConfirmDelivery } from '@/features/checkout/hooks/useOrders';
import type { RootScreenProps } from '@/navigation/types';
import { errorMessageKey } from '@/services/api/errors';
import { colors } from '@/theme/colors';

export function CourierConfirmScreen({
  navigation,
}: RootScreenProps<'CourierConfirm'>) {
  const { t } = useTranslation();
  const user = useUser();
  const confirm = useConfirmDelivery();
  const [orderId, setOrderId] = useState('');
  const [pin, setPin] = useState('');

  const header = (
    <>
      <BackButton />
      <Heading className="text-xl">{t('courier.title')}</Heading>
    </>
  );

  if (user?.role !== 'courier')
    return (
      <Screen header={header}>
        <StatusView
          status="error"
          message={t('courier.notCourier')}
          onRetry={() => navigation.goBack()}
        />
      </Screen>
    );

  const ready = orderId.trim().length > 0 && /^\d{4}$/.test(pin);
  const reset = () => {
    confirm.reset();
    setOrderId('');
    setPin('');
  };

  return (
    <Screen tone="white" header={header}>
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          contentContainerClassName="grow gap-5 p-6"
          keyboardShouldPersistTaps="handled"
        >
          {confirm.isSuccess ? (
            <View className="flex-1 items-center justify-center gap-4">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-success">
                <Icon name="Check" size={32} color={colors.onPrimary} />
              </View>
              <Heading className="text-center text-xl">
                {confirm.data.id}
              </Heading>
              <Text className="text-center font-sans-medium text-sm text-brand-warmgray">
                {t('courier.confirmed')}
              </Text>
              <Button label={t('courier.another')} onPress={reset} />
            </View>
          ) : (
            <>
              <Text className="font-sans-medium text-sm leading-relaxed text-brand-warmgray">
                {t('courier.body')}
              </Text>
              <TextField
                variant="form"
                value={orderId}
                onChangeText={setOrderId}
                placeholder={t('courier.orderNumber')}
                accessibilityLabel={t('courier.orderNumber')}
                autoCapitalize="characters"
                ltr
              />
              <TextField
                variant="form"
                value={pin}
                onChangeText={value => setPin(value.replace(/\D/g, ''))}
                placeholder={t('courier.pin')}
                accessibilityLabel={t('courier.pin')}
                keyboardType="number-pad"
                maxLength={4}
                ltr
              />
              {confirm.isError && (
                <Text
                  accessibilityRole="alert"
                  className="text-center font-sans-bold text-sm text-brand-danger"
                >
                  {t(errorMessageKey(confirm.error))}
                </Text>
              )}
              <Button
                size="lg"
                icon="Lock"
                label={t('courier.confirm')}
                disabled={!ready}
                loading={confirm.isPending}
                onPress={() => confirm.mutate({ orderId: orderId.trim(), pin })}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
