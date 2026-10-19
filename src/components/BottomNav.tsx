// Bottom tab bar (prototype components/BottomNav): Home · Auctions · Sell ·
// Chats · Profile. Sell is a raised round button that opens the Add Listing
// screen instead of switching tabs (sign-in gating arrives in Phase 3).

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/icons';
import { Text } from '@/components/ui';
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
  const activeRoute = state.routes[state.index].name;

  const renderTab = ({ route, icon, label }: (typeof tabs)[number]) => {
    const active = activeRoute === route;
    return (
      <Pressable
        key={route}
        onPress={() => navigation.navigate(route)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={t(label)}
        className="min-h-11 min-w-12 items-center gap-1"
      >
        <Icon
          name={icon}
          size={iconSize.nav}
          color={active ? colors.primary : colors.warmgray}
        />
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
        onPress={() => navigation.getParent()?.navigate('AddListing')}
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
