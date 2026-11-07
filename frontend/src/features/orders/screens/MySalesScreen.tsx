// My sales (BACKEND_PLAN B15.9): what the seller sold, from the moment the
// buyer paid. Each sale shows where the delivery is (get the item ready → the
// driver has it → delivered), why a delivery didn't happen or the buyer
// cancelled, and the seller's money once delivered.

import { FlatList, Image, RefreshControl, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Price } from '@/components/Price';
import { StatusView } from '@/components/StatusView';
import {
  Badge,
  Card,
  Heading,
  Screen,
  Text,
  type BadgeTone,
} from '@/components/ui';
import { useMySales } from '@/features/checkout/hooks/useOrders';
import { useLocalized } from '@/i18n';
import { reasonLabel } from '@/lib/deliveryProblems';
import type { Order } from '@/lib/types';
import { colors } from '@/theme/colors';

/** Where a sale stands, from the seller's side. */
type SaleKey = `sales.${
  | 'cancelled'
  | 'refunded'
  | 'paidOut'
  | 'delivered'
  | 'problem'
  | 'withDriver'
  | 'getReady'}`;

function saleState(order: Order): { key: SaleKey; tone: BadgeTone } {
  if (order.status === 'cancelled')
    return { key: 'sales.cancelled', tone: 'neutral' };
  if (order.status === 'refunded')
    return { key: 'sales.refunded', tone: 'danger' };
  if (order.status === 'completed')
    return order.payout?.status === 'paid'
      ? { key: 'sales.paidOut', tone: 'success' }
      : { key: 'sales.delivered', tone: 'success' };
  if (order.courierStatus === 'failed')
    return { key: 'sales.problem', tone: 'danger' };
  if (order.courierStatus === 'picked_up')
    return { key: 'sales.withDriver', tone: 'info' };
  return { key: 'sales.getReady', tone: 'warning' };
}

export function MySalesScreen() {
  const { t } = useTranslation();
  const {
    data: sales,
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = useMySales();

  return (
    <Screen
      header={
        <>
          <BackButton />
          <Heading className="text-xl">{t('sales.title')}</Heading>
        </>
      }
    >
      {isLoading ? (
        <StatusView status="loading" />
      ) : isError ? (
        <StatusView status="error" onRetry={refetch} />
      ) : (
        <FlatList
          data={sales}
          keyExtractor={o => o.id}
          renderItem={({ item }) => <SaleCard order={item} />}
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
              {t('sales.empty')}
            </Text>
          }
        />
      )}
    </Screen>
  );
}

function SaleCard({ order }: { order: Order }) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const state = saleState(order);
  const label = (reason: string) => localized(reasonLabel(reason));

  return (
    <Card testID={`sale-${order.id}`} className="gap-3 p-3">
      <View className="flex-row items-center gap-4">
        <Image
          source={{ uri: order.itemImageUrl }}
          className="h-16 w-16 rounded-xl"
        />
        <View className="flex-1 gap-1">
          <Heading className="text-base" numberOfLines={1}>
            {localized(order.itemTitle)}
          </Heading>
          <Price fils={order.itemPriceFils} className="text-base" />
          <Text className="text-xs text-brand-warmgray">
            {t('orders.number', { id: order.id })}
          </Text>
        </View>
        <Badge label={t(state.key)} tone={state.tone} />
      </View>

      {order.status === 'escrow_held' && !order.courierStatus && (
        <Text className="text-xs text-brand-warmgray">
          {t('sales.getReadyHint')}
        </Text>
      )}
      {order.status === 'cancelled' && order.cancel && (
        <Text className="text-xs text-brand-warmgray">
          {t('sales.cancelledWhy', { reason: label(order.cancel.reason) })}
        </Text>
      )}
      {order.deliveryFailed && order.status !== 'completed' && (
        <Text className="rounded-xl bg-brand-warning-soft p-3 text-xs text-brand-warning-text">
          {t(
            order.deliveryFailed.stage === 'pickup'
              ? 'orders.failedPickup'
              : 'orders.failedDropoff',
            { reason: label(order.deliveryFailed.reason) },
          )}{' '}
          {order.status === 'escrow_held' ? t('orders.failedNext') : ''}
        </Text>
      )}
      {order.status === 'completed' && order.payout && (
        <Text className="text-xs text-brand-warmgray">
          {t(
            order.payout.status === 'paid'
              ? 'sales.payoutSent'
              : 'sales.payoutPending',
          )}
        </Text>
      )}
    </Card>
  );
}
