// Slide-in drawer (prototype components/SidebarMenu) from the start edge: left
// in English, right in Arabic. Account summary, quick links, and sign-in or
// log-out; couriers get only the language switch and log-out. Rendered once
// above the navigators; open it with useUiStore().openSidebar.

import { useEffect } from 'react';
import {
  BackHandler,
  I18nManager,
  Image,
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
import { go, startAuth, type AppRoute } from '@/features/auth/authFlow';
import { useLogOut } from '@/features/auth/hooks/useAccount';
import { useUser } from '@/features/auth/sessionStore';
import { changeLanguage, useLang } from '@/i18n';
import { useUiStore } from '@/store/uiStore';
import { colors } from '@/theme/colors';

const DURATION_MS = 300;
const MAX_WIDTH = 320;

const profile: AppRoute = { name: 'Tabs', params: { screen: 'Profile' } };

const links: {
  icon: IconName;
  label:
    | 'sidebar.profileSettings'
    | 'sidebar.myPurchases'
    | 'sidebar.mySales'
    | 'sidebar.support'
    | 'sidebar.refurbished'
    | 'sidebar.myListings'
    | 'sidebar.savedItems'
    | 'sidebar.settings';
  route: AppRoute;
}[] = [
  { icon: 'Profile', label: 'sidebar.profileSettings', route: profile },
  {
    icon: 'Box',
    label: 'sidebar.myPurchases',
    route: { name: 'OrderTracking' },
  },
  { icon: 'Truck', label: 'sidebar.mySales', route: { name: 'MySales' } },
  {
    icon: 'BadgeCheck',
    label: 'sidebar.refurbished',
    route: { name: 'Refurbished' },
  },
  { icon: 'Tag', label: 'sidebar.myListings', route: profile },
  { icon: 'Heart', label: 'sidebar.savedItems', route: { name: 'Saved' } },
  { icon: 'Settings', label: 'sidebar.settings', route: profile },
  { icon: 'Mail', label: 'sidebar.support', route: { name: 'Support' } },
];

export function SidebarMenu() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isOpen = useUiStore(s => s.isSidebarOpen);
  const close = useUiStore(s => s.closeSidebar);
  const user = useUser();
  const courier = user?.role === 'courier';
  const lang = useLang();
  const logOut = useLogOut();

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

  const then = (action: () => void) => () => {
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
            {user ? (
              <Image
                source={{ uri: user.avatarUrl }}
                className="h-full w-full"
              />
            ) : (
              <Icon name="Profile" size={32} color={colors.warmgray} />
            )}
          </View>
          <Heading className="text-2xl">
            {user ? user.name : t('sidebar.guest')}
          </Heading>
          {courier ? (
            <View className="mt-1 flex-row items-center gap-1">
              <Icon name="Truck" size={16} color={colors.primary} />
              <Text className="font-sans-bold text-sm text-brand-primary">
                {t('courier.role')}
              </Text>
            </View>
          ) : user?.verified ? (
            <View className="mt-1 flex-row items-center gap-1">
              <Icon name="BadgeCheck" size={16} color={colors.success} />
              <Text className="font-sans-bold text-sm text-brand-success">
                {t('sidebar.verifiedIdentity')}
              </Text>
            </View>
          ) : (
            <Text className="mt-1 font-sans-bold text-sm text-brand-warmgray">
              {t(user ? 'sidebar.unverified' : 'sidebar.browsingAsGuest')}
            </Text>
          )}
        </View>

        <ScrollView contentContainerClassName="gap-2 p-4">
          {courier ? (
            <>
              <MenuRow
                icon="Settings"
                label={t('language.toggleLabel')}
                onPress={then(() =>
                  changeLanguage(lang === 'ar' ? 'en' : 'ar'),
                )}
              />
              <MenuRow
                icon="Mail"
                label={t('sidebar.support')}
                onPress={then(() => go({ name: 'Support' }))}
              />
            </>
          ) : (
            links.map(link => (
              <MenuRow
                key={link.label}
                icon={link.icon}
                label={t(link.label)}
                onPress={then(() => go(link.route))}
              />
            ))
          )}
        </ScrollView>

        <View
          className="p-6"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          {user ? (
            <Pressable
              onPress={then(() => logOut.mutate())}
              accessibilityRole="button"
              className="items-center rounded-xl bg-brand-lightgray py-4 active:bg-brand-muted"
            >
              <Text className="font-sans-bold">{t('sidebar.logOut')}</Text>
            </Pressable>
          ) : (
            <Button
              label={t('sidebar.signIn')}
              onPress={then(() => startAuth(null))}
            />
          )}
        </View>
      </Animated.View>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  accessibilityLabel,
  onPress,
}: {
  icon: IconName;
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="flex-row items-center gap-3 rounded-xl p-4 active:bg-brand-lightgray"
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-lightgray">
        <Icon name={icon} size={20} color={colors.primary} />
      </View>
      <Text className="font-sans-bold">{label}</Text>
    </Pressable>
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
