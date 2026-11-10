// The notification inbox (BACKEND_REVIEW M2; docs/API.md → Live Updates & Notifications): every push
// the server sent is kept, so nothing is missed with notifications off or on a new phone. Always the
// real API (customers and drivers both get pushes), so there is no mock version.

import type { Lang } from '@/lib/types';
import { api } from './api/client';
import { fromIso } from './api/wire';

export type InboxItem = {
  id: string;
  /** The push's data.type: which screen a tap opens (services/push/routeForPush). */
  type: string;
  refId: string | null;
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
};

export type Inbox = { unreadCount: number; items: InboxItem[] };

type ItemDto = Omit<InboxItem, 'createdAt'> & { createdAt: string };

export const notificationsService = {
  /** Newest first, in the app's language. */
  get: async (lang: Lang): Promise<Inbox> => {
    const inbox = await api.get<{ unreadCount: number; items: ItemDto[] }>(
      `/me/notifications?lang=${lang}`,
    );
    return {
      unreadCount: inbox.unreadCount,
      items: inbox.items.map(item => ({
        ...item,
        createdAt: fromIso(item.createdAt),
      })),
    };
  },
  /** Opening the inbox reads everything in it. */
  markRead: () => api.post<void>('/me/notifications/read'),
};
