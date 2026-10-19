// Slide-in drawer (prototype components/SidebarMenu) from the start edge: left
// in English, right in Arabic. Account summary, quick links, and sign-in.
// Rendered once above the navigators; open it with useUiStore().openSidebar.

import { useEffect } from 'react';
import {
  BackHandler,
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/icons';
import { Button, Heading, Text } from '@/components/ui';
import { navigationRef } from '@/navigation/navigationRef';
import type { RootStackParamList } from '@/navigation/types';
import { useUiStore } from '@/store/uiStore';
import { colors } from '@/theme/colors';

const DURATION_MS = 300;
const MAX_WIDTH = 320;

type Link = {
  icon: IconName;
  label:
    | 'sidebar.profileSettings'
    | 'sidebar.myPurchases'
    | 'sidebar.myListings'
    | 'sidebar.savedItems'
    | 'sidebar.settings';
  go: () => void;
};

const toProfile = () => navigationRef.navigate('Tabs', { screen: 'Profile' });
// Routes that take no params.
type PlainRoute = {
  [K in keyof RootStackParamList]: RootStackParamList[K] extends undefined
    ? K
    : never;
}[keyof RootStackParamList];
const to = (route: PlainRoute) => () => navigationRef.navigate(route);

const links: Link[] = [
  { icon: 'Profile', label: 'sidebar.profileSettings', go: toProfile },
  { icon: 'Box', label: 'sidebar.myPurchases', go: to('OrderTracking') },
  { icon: 'Tag', label: 'sidebar.myListings', go: toProfile },
  { icon: 'Heart', label: 'sidebar.savedItems', go: to('Saved') },
  { icon: 'Settings', label: 'sidebar.settings', go: toProfile },
];

export function SidebarMenu() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isOpen = useUiStore(s => s.isSidebarOpen);
  const close = useUiStore(s => s.closeSidebar);

  const width = Math.min(screenWidth * 0.8, MAX_WIDTH);
  // translateX doesn't mirror in RTL, so hide toward the start edge by hand.
  const hiddenX = I18nManager.isRTL ? width : -width;

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(isOpen ? 1 : 0, { duration: DURATION_MS });
  }, [isOpen, progress]);

  // Android back button closes the drawer first.
  useEffect(() => {
    if (!isOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [isOpen, close]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.value) * hiddenX }],
  }));

  const go = (action: () => void) => {
    close();
    action();
  };

  return (
    <View
      pointerEvents={isOpen ? 'auto' : 'none'}
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden={!isOpen}
      importantForAccessibility={isOpen ? 'auto' : 'no-hide-descendants'}
    >
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t('sidebar.close')}
          className="flex-1 bg-brand-espresso/60"
        />
      </Animated.View>

      <Animated.View style={[styles.panel, { width }, panelStyle]}>
        <View
          className="border-b border-brand-border bg-brand-lightgray px-6 pb-6"
          style={{ paddingTop: insets.top + 24 }}
        >
          <View className="mb-4 h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-brand-surface bg-brand-muted shadow-sm">
            <Icon name="Profile" size={32} color={colors.warmgray} />
          </View>
          <Heading className="text-2xl">{t('sidebar.guest')}</Heading>
          <Text className="mt-1 font-sans-bold text-sm text-brand-warmgray">
            {t('sidebar.browsingAsGuest')}
          </Text>
        </View>

        <ScrollView contentContainerClassName="gap-2 p-4">
          {links.map(link => (
            <Pressable
              key={link.label}
              onPress={() => go(link.go)}
              accessibilityRole="button"
              className="flex-row items-center gap-3 rounded-xl p-4 active:bg-brand-lightgray"
            >
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-lightgray">
                <Icon name={link.icon} size={20} color={colors.primary} />
              </View>
              <Text className="font-sans-bold">{t(link.label)}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View
          className="p-6"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          <Button label={t('sidebar.signIn')} onPress={() => go(to('Auth'))} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    backgroundColor: colors.surface,
    elevation: 16,
    shadowColor: colors.espresso,
    shadowOpacity: 0.25,
    shadowRadius: 24,
  },
});
