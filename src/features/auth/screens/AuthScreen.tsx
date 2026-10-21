// Sign-in choice (prototype AuthScreen): Google, Apple, Email, or verify
// with national ID (creates a verified account with email). Opened by any gated action.

import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icons';
import { AppleLogo, GoogleLogo } from '@/components/icons/BrandLogos';
import { SahlaLogo } from '@/components/SahlaLogo';
import { Button, Heading, Text } from '@/components/ui';
import type { RootScreenProps } from '@/navigation/types';
import { colors } from '@/theme/colors';
import { iconSize } from '@/theme/spacing';
import { useAuthFlowStore } from '../authFlow';
import { useLogInWithApple, useLogInWithGoogle } from '../hooks/useAccount';

export function AuthScreen({ navigation }: RootScreenProps<'Auth'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const setPending = useAuthFlowStore(s => s.setPending);
  const logInGoogle = useLogInWithGoogle();
  const logInApple = useLogInWithApple();

  const busy = logInGoogle.isPending || logInApple.isPending;

  const close = () => {
    setPending(null);
    navigation.goBack();
  };

  return (
    <View
      className="flex-1 bg-brand-surface"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="flex-row items-center px-5 pb-4 pt-3">
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          className="-ms-2 rounded-full p-2 active:bg-brand-lightgray"
        >
          <Icon name="X" size={iconSize.nav} />
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="grow justify-center gap-6 p-6">
        <View className="items-center gap-2">
          <View className="mb-2">
            <SahlaLogo size={84} />
          </View>
          <Heading className="text-center text-3xl">
            {t('screens.auth')}
          </Heading>
          <Text className="text-center font-sans-medium text-sm leading-relaxed text-brand-warmgray">
            {t('auth.subtitle')}
          </Text>
        </View>

        <View className="gap-3">
          <Pressable
            onPress={() => logInGoogle.mutate(undefined)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('auth.continueWithGoogle')}
            className="min-h-[56px] flex-row items-center justify-center gap-3 rounded-xl border-2 border-brand-border bg-white px-6 active:scale-[0.98]"
          >
            {logInGoogle.isPending ? (
              <ActivityIndicator color={colors.espresso} />
            ) : (
              <GoogleLogo size={22} />
            )}
            <Text className="font-sans-bold text-lg text-brand-espresso">
              {t('auth.continueWithGoogle')}
            </Text>
          </Pressable>

          {/* Apple's guidelines: black button, white logo; shown on iOS and,
              as Android also supports the web flow, kept visible there too. */}
          <Pressable
            onPress={() => logInApple.mutate(undefined)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('auth.continueWithApple')}
            className="min-h-[56px] flex-row items-center justify-center gap-3 rounded-xl bg-black px-6 active:scale-[0.98]"
          >
            {logInApple.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <AppleLogo size={24} color="#fff" />
            )}
            <Text className="font-sans-bold text-lg text-white">
              {t('auth.continueWithApple')}
            </Text>
          </Pressable>

          <View className="my-1 flex-row items-center gap-3">
            <View className="h-[1px] flex-1 bg-brand-border" />
            <Text className="font-sans-bold text-xs text-brand-warmgray">
              {t('auth.or')}
            </Text>
            <View className="h-[1px] flex-1 bg-brand-border" />
          </View>

          <Button
            size="lg"
            icon="Mail"
            label={t('auth.continueWithEmail')}
            onPress={() => navigation.navigate('EmailAuth', { mode: 'signup' })}
          />
        </View>
      </ScrollView>
    </View>
  );
}
