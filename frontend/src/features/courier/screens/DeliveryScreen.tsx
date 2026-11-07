// One delivery (BACKEND_PLAN B14.7): where to collect it (the seller) and where
// to take it (the buyer), each with Call and Open in Maps. Collect → "Picked
// up"; at the door the buyer tells the 4-digit PIN → "Confirm delivery", and
// the server releases the payment to the seller. A wrong PIN releases nothing;
// after five the order locks until Sahla support unlocks it. Can't finish →
// "Delivery failed" with a reason (B15.4); the buyer's report at the door shows here.

import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  ScrollView,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Icon } from '@/components/icons';
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
import { useCities } from '@/features/catalog/hooks/useCatalog';
import { useLocalized } from '@/i18n';
import { reasonLabel } from '@/lib/deliveryProblems';
import { placeLabel } from '@/lib/places';
import type { DeliveryDetails } from '@/lib/types';
import type { RootScreenProps } from '@/navigation/types';
import { ApiError, errorMessageKey } from '@/services/api/errors';
import { colors } from '@/theme/colors';
import {
  useConfirmDelivery,
  useDelivery,
  useMarkPickedUp,
} from '../hooks/useDeliveries';
import { callUrl, mapsUrl } from '../links';
import { DeliveryStatus } from './DeliveryStatus';

/** Locked after five wrong PINs (the server answers RATE_LIMITED): only support can unlock it. */
const errorKey = (error: unknown) =>
  error instanceof ApiError && error.code === 'RATE_LIMITED'
    ? 'courier.pinLocked'
    : errorMessageKey(error);

export function DeliveryScreen({
  route,
  navigation,
}: RootScreenProps<'Delivery'>) {
  const { orderId } = route.params;
  const { t } = useTranslation();
  const localized = useLocalized();
  const { data: delivery, isLoading, isError, refetch } = useDelivery(orderId);
  const pickedUp = useMarkPickedUp();
  const confirm = useConfirmDelivery();
  const [pin, setPin] = useState('');

  const header = (
    <>
      <BackButton />
      <Heading className="flex-1 text-xl">{orderId}</Heading>
      {delivery && <DeliveryStatus status={delivery.status} />}
    </>
  );

  if (isLoading)
    return (
      <Screen header={header}>
        <StatusView status="loading" />
      </Screen>
    );
  // Gone from the list: reassigned to another courier, or refunded.
  if (isError || !delivery)
    return (
      <Screen header={header}>
        <StatusView
          status="error"
          message={isError ? undefined : t('courier.gone')}
          onRetry={refetch}
        />
      </Screen>
    );

  return (
    <Screen header={header}>
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          contentContainerClassName="gap-4 p-5"
          keyboardShouldPersistTaps="handled"
        >
          <Card className="flex-row items-center gap-3 p-3">
            <Image
              source={{ uri: delivery.itemImageUrl }}
              className="h-16 w-16 rounded-xl"
            />
            <Text className="flex-1 font-sans-bold" numberOfLines={2}>
              {localized(delivery.itemTitle)}
            </Text>
          </Card>

          <Stop
            title={t('courier.pickup')}
            icon="Box"
            stop={delivery.pickup}
            done={
              delivery.status === 'picked_up' || delivery.status === 'delivered'
            }
            missing={!delivery.pickup.address.trim()}
          />
          <Stop
            title={t('courier.dropoff')}
            icon="MapPin"
            stop={delivery.dropoff}
            done={delivery.status === 'delivered'}
          />

          {delivery.buyerIssue && delivery.status !== 'delivered' && (
            <View
              testID="delivery-buyer-issue"
              className="gap-1 rounded-xl bg-brand-warning-soft p-3"
            >
              <Text className="font-sans-bold text-sm text-brand-warning-text">
                {t('courier.buyerIssue', {
                  reason: localized(reasonLabel(delivery.buyerIssue.reason)),
                })}
              </Text>
              {delivery.buyerIssue.note && (
                <Text className="text-sm text-brand-warning-text">
                  “{delivery.buyerIssue.note}”
                </Text>
              )}
            </View>
          )}

          {delivery.status === 'failed' && delivery.failed && (
            <View
              testID="delivery-failed"
              className="rounded-xl bg-brand-warning-soft p-3"
            >
              <Text className="text-sm text-brand-warning-text">
                {t('courier.failedAt', {
                  reason: localized(reasonLabel(delivery.failed.reason)),
                })}
              </Text>
            </View>
          )}

          {delivery.status === 'to_pickup' && (
            <View className="gap-2">
              {pickedUp.isError && <ErrorText error={pickedUp.error} />}
              <Button
                size="lg"
                icon="Box"
                label={t('courier.pickedUp')}
                loading={pickedUp.isPending}
                onPress={() => pickedUp.mutate(delivery.orderId)}
              />
            </View>
          )}

          {delivery.status === 'picked_up' && (
            <Card className="gap-3 p-4">
              <Heading className="text-base">{t('courier.handOver')}</Heading>
              <Text className="text-sm leading-relaxed text-brand-warmgray">
                {t('courier.body')}
              </Text>
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
              {confirm.isError && <ErrorText error={confirm.error} />}
              <Button
                size="lg"
                icon="Lock"
                label={t('courier.confirm')}
                disabled={!/^\d{4}$/.test(pin)}
                loading={confirm.isPending}
                onPress={() =>
                  confirm.mutate(
                    { orderId: delivery.orderId, pin },
                    { onError: () => setPin('') },
                  )
                }
              />
            </Card>
          )}

          {(delivery.status === 'to_pickup' ||
            delivery.status === 'picked_up') && (
            <View className="gap-2 pt-2">
              <Text className="text-center text-xs text-brand-warmgray">
                {t('courier.failedHint')}
              </Text>
              <Button
                variant="secondary"
                icon="X"
                testID="delivery-mark-failed"
                label={t('courier.failed')}
                onPress={() =>
                  navigation.navigate('OrderProblem', {
                    kind: 'deliveryFailed',
                    orderId: delivery.orderId,
                    stage:
                      delivery.status === 'to_pickup' ? 'pickup' : 'dropoff',
                  })
                }
              />
            </View>
          )}

          {delivery.status === 'delivered' && (
            <View className="items-center gap-3 py-4">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-success">
                <Icon name="Check" size={32} color={colors.onPrimary} />
              </View>
              <Text className="text-center font-sans-medium text-sm text-brand-warmgray">
                {t('courier.confirmed')}
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ErrorText({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return (
    <Text
      accessibilityRole="alert"
      className="text-center font-sans-bold text-sm text-brand-danger"
    >
      {t(errorKey(error))}
    </Text>
  );
}

/** Where to collect or deliver: the person, area, address, and Call / Maps. */
function Stop({
  title,
  icon,
  stop,
  done,
  missing = false,
}: {
  title: string;
  icon: 'Box' | 'MapPin';
  stop: DeliveryDetails;
  done: boolean;
  /** The seller hasn't given the pickup address yet. */
  missing?: boolean;
}) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const { data: cities } = useCities();
  const city = cities?.find(c => c.id === stop.cityId);
  const area = city ? placeLabel(city, localized) : stop.cityId;
  const call = callUrl(stop.phone);

  return (
    <Card className={`gap-2 p-4 ${done ? 'opacity-60' : ''}`}>
      <View className="flex-row items-center gap-2">
        <Icon
          name={done ? 'Check' : icon}
          size={18}
          color={done ? colors.success : colors.primary}
        />
        <Text className="font-sans-bold text-xs uppercase text-brand-warmgray">
          {title}
        </Text>
      </View>
      <Heading className="text-lg">{stop.name}</Heading>
      <Text className="text-sm">{area}</Text>
      {missing ? (
        <Text className="text-sm text-brand-warning-text">
          {t('courier.noPickupYet')}
        </Text>
      ) : (
        <Text className="text-sm leading-relaxed">{stop.address}</Text>
      )}
      {stop.notes && (
        <Text className="text-sm text-brand-warmgray">“{stop.notes}”</Text>
      )}
      {stop.phone.trim() !== '' && (
        <Ltr className="text-sm text-brand-warmgray">{stop.phone}</Ltr>
      )}
      {!done && (
        <View className="mt-1 flex-row gap-2">
          {call && (
            <Button
              size="sm"
              variant="secondary"
              icon="Phone"
              label={t('courier.call')}
              className="flex-1"
              onPress={() => Linking.openURL(call).catch(() => {})}
            />
          )}
          <Button
            size="sm"
            variant="secondary"
            icon="MapPin"
            label={t('courier.maps')}
            className="flex-1"
            onPress={() =>
              Linking.openURL(
                mapsUrl(
                  stop,
                  city ? `${city.name.en}, ${city.governorate.en}` : '',
                ),
              ).catch(() => {})
            }
          />
        </View>
      )}
    </Card>
  );
}
