// The bell in the header: opens the inbox, with a dot while something is unread. Signed in only.

import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icons';
import { useUser } from '@/features/auth/sessionStore';
import { go } from '@/features/auth/authFlow';
import { iconSize } from '@/theme/spacing';
import { useUnreadNotifications } from './useInbox';

export function NotificationBell() {
  const { t } = useTranslation();
  const signedIn = !!useUser();
  const unread = useUnreadNotifications();
  if (!signedIn) return null;
  return (
    <Pressable
      testID="notification-bell"
      onPress={() => go({ name: 'Notifications' })}
      accessibilityRole="button"
      accessibilityLabel={
        unread
          ? t('notifications.openUnread', { count: unread })
          : t('notifications.open')
      }
      className="rounded-xl p-2 active:bg-brand-lightgray"
    >
      <Icon name="Bell" size={iconSize.nav} />
      {unread > 0 && (
        <View
          testID="notification-dot"
          className="absolute end-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-brand-primary"
        />
      )}
    </Pressable>
  );
}
