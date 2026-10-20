// Order tracking (prototype BuyerTracking): the buyer's orders, their escrow
// status and, once the payment is held, the PIN to give the courier.

import { FlatList, Image, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Price } from '@/components/Price';
import { StatusView } from '@/components/StatusView';
import { Card, Heading, Ltr, Screen, Text } from '@/components/ui';
import { useMyOrders } from '@/features/checkout/hooks/useOrders';
import { useLocalized } from '@/i18n';
import type { Order, OrderStatus } from '@/lib/types';

const STATUS_KEY = {
  awaiting_payment: 'orders.statusAwaiting_payment',
  escrow_held: 'orders.statusEscrow_held',
  completed: 'orders.statusCompleted',
  refunded: 'orders.statusRefunded',
} as const satisfies Record<OrderStatus, string>;

export function OrderTrackingScreen() {
  const { t } = useTranslation();
  const localized = useLocalized();
  const { data: orders, isLoading, isError, refetch } = useMyOrders();

  const renderOrder = ({ item: order }: { item: Order }) => (
    <Card className="gap-3 p-3">
      <View className="flex-row items-center gap-4">
        <Image
          source={{ uri: order.itemImageUrl }}
          className="h-16 w-16 rounded-xl"
        />
        <View className="flex-1">
          <Heading className="text-base" numberOfLines={1}>
            {localized(order.itemTitle)}
          </Heading>
          <Price fils={order.totalFils} className="text-base" />
        </View>
      </View>
      <Text className="font-sans-bold text-xs text-brand-primary">
        {t(STATUS_KEY[order.status])}
      </Text>
      {order.pin && order.status === 'escrow_held' && (
        <View className="items-center gap-1 rounded-xl bg-brand-lightgray p-3">
          <Text className="text-xs text-brand-warmgray">{t('orders.pin')}</Text>
          <Ltr className="font-heading-black text-3xl tracking-[8px]">
            {order.pin}
          </Ltr>
          <Text className="text-center text-xs text-brand-warmgray">
            {t('orders.pinHint')}
          </Text>
        </View>
      )}
    </Card>
  );

  return (
    <Screen
      header={
        <>
          <BackButton />
          <Heading className="text-xl">{t('screens.orderTracking')}</Heading>
        </>
      }
    >
      {isLoading ? (
        <StatusView status="loading" />
      ) : isError ? (
        <StatusView status="error" onRetry={refetch} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={o => o.id}
          renderItem={renderOrder}
          contentContainerClassName="gap-4 p-5"
          ListEmptyComponent={
            <Text className="pt-10 text-center text-brand-warmgray">
              {t('orders.empty')}
            </Text>
          }
        />
      )}
    </Screen>
  );
}
