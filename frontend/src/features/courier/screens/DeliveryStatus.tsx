// The courier's status of a delivery as a badge.

import { useTranslation } from 'react-i18next';
import { Badge, type BadgeTone } from '@/components/ui';
import type { CourierStatus } from '@/lib/types';

const STATUS = {
  to_pickup: { key: 'courier.statusTo_pickup', tone: 'warning' },
  picked_up: { key: 'courier.statusPicked_up', tone: 'info' },
  delivered: { key: 'courier.statusDelivered', tone: 'success' },
  failed: { key: 'courier.statusFailed', tone: 'danger' },
} as const satisfies Record<CourierStatus, { key: string; tone: BadgeTone }>;

export function DeliveryStatus({ status }: { status: CourierStatus }) {
  const { t } = useTranslation();
  return <Badge label={t(STATUS[status].key)} tone={STATUS[status].tone} />;
}
