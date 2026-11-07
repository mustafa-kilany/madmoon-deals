// Courier mode's home (BACKEND_PLAN B14.7): the deliveries an admin assigned
// to me, oldest first, then the ones I delivered today. Pull down to refresh;
// it also re-asks the server every 30 s. The menu has only language and log out.

import { FlatList, Image, Pressable, RefreshControl, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icons';
import { StatusView } from '@/components/StatusView';
import { Card, Heading, Screen, Text } from '@/components/ui';
import { useUser } from '@/features/auth/sessionStore';
import { useCities } from '@/features/catalog/hooks/useCatalog';
import { useLocalized } from '@/i18n';
import { placeLabel } from '@/lib/places';
import type { CourierStatus, Delivery } from '@/lib/types';
import type { RootScreenProps } from '@/navigation/types';
import { useUiStore } from '@/store/uiStore';
import { colors } from '@/theme/colors';
import { iconSize } from '@/theme/spacing';
import { useDeliveries } from '../hooks/useDeliveries';
import { DeliveryStatus } from './DeliveryStatus';

/** Nothing left to do: delivered, or marked failed (an admin decides next, B15.4). */
const finished = (status: CourierStatus) =>
  status === 'delivered' || status === 'failed';

export function DeliveriesScreen({
  navigation,
}: RootScreenProps<'Deliveries'>) {
  const { t } = useTranslation();
  const user = useUser();
  const openSidebar = useUiStore(s => s.openSidebar);
  const { data, isLoading, isError, isRefetching, refetch } = useDeliveries();

  // Still to do first; delivered ones (today's) at the end.
  const deliveries = data
    ? [
        ...data.filter(d => !finished(d.status)),
        ...data.filter(d => finished(d.status)),
      ]
    : [];
  const toDo = deliveries.filter(d => !finished(d.status)).length;

  return (
    <Screen
      header={
        <>
          <Pressable
            onPress={openSidebar}
            accessibilityRole="button"
            accessibilityLabel={t('home.openMenu')}
            className="-ms-2 rounded-xl p-2 active:bg-brand-lightgray"
          >
            <Icon name="Menu" size={iconSize.nav} />
          </Pressable>
          <View className="flex-1">
            <Heading className="text-xl">{t('courier.deliveries')}</Heading>
            {user && (
              <Text className="text-xs text-brand-warmgray" numberOfLines={1}>
                {user.name}
              </Text>
            )}
          </View>
        </>
      }
    >
      {isLoading ? (
        <StatusView status="loading" />
      ) : isError ? (
        <StatusView status="error" onRetry={refetch} />
      ) : (
        <FlatList
          data={deliveries}
          keyExtractor={d => d.orderId}
          renderItem={({ item }) => (
            <DeliveryRow
              delivery={item}
              onPress={() =>
                navigation.navigate('Delivery', { orderId: item.orderId })
              }
            />
          )}
          contentContainerClassName="gap-3 p-5"
          ListHeaderComponent={
            deliveries.length ? (
              <Text className="font-sans-bold text-sm text-brand-warmgray">
                {t('courier.toDo', { n: toDo })}
              </Text>
            ) : undefined
          }
          ListEmptyComponent={
            <View className="items-center gap-3 pt-16">
              <Icon name="Truck" size={40} color={colors.warmgray} />
              <Text className="text-center text-brand-warmgray">
                {t('courier.empty')}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                refetch();
              }}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />
      )}
    </Screen>
  );
}

function DeliveryRow({
  delivery,
  onPress,
}: {
  delivery: Delivery;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const { data: cities } = useCities();
  const area = (cityId: string) => {
    const city = cities?.find(c => c.id === cityId);
    return city ? placeLabel(city, localized) : cityId;
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${delivery.orderId}, ${localized(
        delivery.itemTitle,
      )}`}
    >
      <Card
        className={`flex-row items-center gap-3 p-3 ${
          finished(delivery.status) ? 'opacity-60' : ''
        }`}
      >
        <Image
          source={{ uri: delivery.itemImageUrl }}
          className="h-16 w-16 rounded-xl"
        />
        <View className="flex-1 gap-1">
          <View className="flex-row items-center justify-between gap-2">
            <Heading className="text-base">{delivery.orderId}</Heading>
            <DeliveryStatus status={delivery.status} />
          </View>
          <Text className="text-sm" numberOfLines={1}>
            {localized(delivery.itemTitle)}
          </Text>
          <Text className="text-xs text-brand-warmgray" numberOfLines={1}>
            {t('courier.route', {
              from: area(delivery.pickup.cityId),
              to: area(delivery.dropoff.cityId),
            })}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}
