// The inbox and its unread number, for the bell's dot and the inbox screen. A new notification
// arrives over the live connection; the poll is the safety net behind it.

import { useQuery } from '@tanstack/react-query';
import { config } from '@/config';
import { useUser } from '@/features/auth/sessionStore';
import { useLiveAccountStatus } from '@/features/offers/hooks/useLiveAccount';
import { useLang } from '@/i18n';
import { notificationsService } from '@/services/notifications';
import { queryKeys } from '@/services/queryClient';

export function useInbox() {
  const signedIn = !!useUser();
  const lang = useLang();
  const { connected } = useLiveAccountStatus();
  return useQuery({
    queryKey: queryKeys.notifications(lang),
    queryFn: () => notificationsService.get(lang),
    enabled: signedIn,
    refetchInterval: connected ? config.pollMs.chatLive : config.pollMs.chat,
  });
}

export const useUnreadNotifications = () => useInbox().data?.unreadCount ?? 0;
