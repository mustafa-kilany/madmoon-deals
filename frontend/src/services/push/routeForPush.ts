// Which screen a tapped push opens. The server's `data` is
// { type, id } (docs/API.md → Live Updates & Notifications).

import type { AppRoute } from '@/features/auth/authFlow';

export function routeForPush(
  data: Record<string, unknown> | undefined,
): AppRoute | null {
  const type = data?.type;
  const id = typeof data?.id === 'string' ? data.id : '';
  switch (type) {
    case 'chat':
    case 'offer':
      return {
        name: 'Tabs',
        params: { screen: 'Chats', params: { chatId: id } },
      };
    case 'outbid':
    case 'auction_won':
      return id ? { name: 'AuctionBidding', params: { itemId: id } } : null;
    case 'order':
      return { name: 'OrderTracking' };
    case 'delivery':
      return id ? { name: 'Delivery', params: { orderId: id } } : null;
    case 'support':
      return { name: 'Support' };
    case 'sale':
      return { name: 'MySales' };
    default:
      return null; // unknown: just open the app
  }
}
