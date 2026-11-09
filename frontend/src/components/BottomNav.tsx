// Bottom tab bar (prototype components/BottomNav): Home · Auctions · Sell ·
// Chats · Profile. Sell is a raised round button that opens the Add Listing
// screen instead of switching tabs; guests are asked to sign in first.

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/icons';
import { Text } from '@/components/ui';
import { UnreadBadge } from '@/components/UnreadBadge';
import { config } from '@/config';
import { useRequireAuth } from '@/features/auth/hooks/useRequireAuth';
import { useUser } from '@/features/auth/sessionStore';
import {
  totalUnread,
  useChatThreads,
} from '@/features/offers/hooks/useNegotiation';
import type { TabParamList } from '@/navigation/types';
import { colors } from '@/theme/colors';
import { iconSize } from '@/theme/spacing';

const tabs: {
  route: keyof TabParamList;
  icon: IconName;
  label: 'tabs.home' | 'tabs.auctions' | 'tabs.chats' | 'tabs.profile';
}[] = [
  { route: 'Home', icon: 'Home', label: 'tabs.home' },
  { route: 'Auctions', icon: 'Gavel', label: 'tabs.auctions' },
  { route: 'Chats', icon: 'Chat', label: 'tabs.chats' },
  { route: 'Profile', icon: 'Profile', label: 'tabs.profile' },
];

export function BottomNav({ state, navigation }: BottomTabBarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const requireAuth = useRequireAuth();
  const activeRoute = state.routes[state.index].name;
  // The number on the Chats tab, wherever the person is. Guests have no chats.
  const user = useUser();
  const { data: threads } = useChatThreads({
    pollMs: config.pollMs.chatLive,
    enabled: !!user && user.role !== 'courier',
  });
  const unread = totalUnread(threads);

  const renderTab = ({ route, icon, label }: (typeof tabs)[number]) => {
    const active = activeRoute === route;
    return (
      <Pressable
        key={route}
        onPress={() => navigation.navigate(route)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={
          route === 'Chats' && unread > 0
            ? `${t(label)}, ${t('chats.unread', { count: unread })}`
            : t(label)
        }
        className="min-h-11 min-w-12 items-center gap-1"
      >
        <View>
          <Icon
            name={icon}
            size={iconSize.nav}
            color={active ? colors.primary : colors.warmgray}
          />
          {route === 'Chats' && (
            <View className="absolute -end-3 -top-1">
              <UnreadBadge count={unread} testID="tab-unread" />
            </View>
          )}
        </View>
        <Text
          className={`font-sans-bold text-xs ${
            active ? 'text-brand-primary' : 'text-brand-warmgray'
          }`}
        >
          {t(label)}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      className="flex-row items-center justify-between border-t border-brand-border bg-brand-surface px-5 pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      {renderTab(tabs[0])}
      {renderTab(tabs[1])}
      <Pressable
        onPress={() => requireAuth({ name: 'AddListing' })}
        accessibilityRole="button"
        accessibilityLabel={t('tabs.sell')}
        className="-mt-8 items-center gap-1"
      >
        <View className="rounded-full border-4 border-brand-surface bg-brand-primary p-4 shadow-lg shadow-brand-primary/30">
          <Icon name="Add" size={iconSize.nav} color={colors.onPrimary} />
        </View>
        <Text className="font-sans-bold text-xs">{t('tabs.sell')}</Text>
      </Pressable>
      {renderTab(tabs[2])}
      {renderTab(tabs[3])}
    </View>
  );
}
