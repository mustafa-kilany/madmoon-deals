// Order tracking (prototype BuyerTracking): the buyer's orders with their
// order number, an escrow timeline and, while the payment is held, the PIN to
// give the courier. Pull down to refresh after the courier confirms.

import { FlatList, Image, RefreshControl, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Icon } from '@/components/icons';
import { Price } from '@/components/Price';
import { StatusView } from '@/components/StatusView';
import { Card, Heading, Ltr, Screen, Text } from '@/components/ui';
import { useMyOrders } from '@/features/checkout/hooks/useOrders';
import { useLocalized } from '@/i18n';
import type { Order, OrderStatus } from '@/lib/types';
import { colors } from '@/theme/colors';

const STATUS_KEY = {
  awaiting_payment: 'orders.statusAwaiting_payment',
  escrow_held: 'orders.statusEscrow_held',
  completed: 'orders.statusCompleted',
  refunded: 'orders.statusRefunded',
} as const satisfies Record<OrderStatus, string>;

const STEPS = [
  'orders.stepPaid',
  'orders.stepDelivery',
  'orders.stepDelivered',
] as const;

/** How many timeline steps are done: paid → out for delivery → delivered. */
const stepsDone = (status: OrderStatus) =>
  status === 'completed' ? 3 : status === 'escrow_held' ? 1 : 0;

export function OrderTrackingScreen() {
  const { t } = useTranslation();
  const {
    data: orders,
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = useMyOrders();

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
          renderItem={({ item }) => <OrderCard order={item} />}
          contentContainerClassName="gap-4 p-5"
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

function OrderCard({ order }: { order: Order }) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const done = stepsDone(order.status);

  return (
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
          <Text testID="order-number" className="text-xs text-brand-warmgray">
            {t('orders.number', { id: order.id })}
          </Text>
        </View>
      </View>

      <Text className="font-sans-bold text-xs text-brand-primary">
        {t(STATUS_KEY[order.status])}
      </Text>

      {order.status === 'refunded' ? (
        <Text className="text-xs text-brand-warmgray">
          {t('orders.refundedNote')}
        </Text>
      ) : (
        <View className="gap-2">
          {STEPS.map((step, index) => {
            const complete = index < done;
            const current = index === done && done > 0;
            return (
              <View key={step} className="flex-row items-center gap-3">
                <View
                  className={`h-6 w-6 items-center justify-center rounded-full ${
                    complete
                      ? 'bg-brand-success'
                      : current
                      ? 'border-2 border-brand-primary'
                      : 'border-2 border-brand-border'
                  }`}
                >
                  {complete && (
                    <Icon name="Check" size={14} color={colors.onPrimary} />
                  )}
                </View>
                <Text
                  className={`flex-1 text-xs ${
                    complete || current
                      ? 'font-sans-bold'
                      : 'text-brand-warmgray'
                  }`}
                >
                  {t(step)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {order.pin && order.status === 'escrow_held' && (
        <View className="items-center gap-1 rounded-xl bg-brand-lightgray p-3">
          <Text className="text-xs text-brand-warmgray">{t('orders.pin')}</Text>
          <Ltr
            testID="order-pin"
            className="font-heading-black text-3xl tracking-[8px]"
          >
            {order.pin}
          </Ltr>
          <Text className="text-center text-xs text-brand-warmgray">
            {t('orders.pinHint')}
          </Text>
        </View>
      )}
    </Card>
  );
}
