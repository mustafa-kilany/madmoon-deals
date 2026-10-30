// Verified badge with Sanad, Jordan's national digital ID app. The app opens
// Sanad's page; Sanad sends the user back to the server, which verifies the
// account. When the user returns to the app, it reloads the account.

import { useEffect, useRef } from 'react';
import { AppState, Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Icon } from '@/components/icons';
import { Button, Heading, Screen, Text } from '@/components/ui';
import type { RootScreenProps } from '@/navigation/types';
import { errorMessageKey } from '@/services/api/errors';
import { toast } from '@/store/toastStore';
import { colors } from '@/theme/colors';
import { useReloadUser, useStartIdVerification } from '../hooks/useAccount';
import { useUser } from '../sessionStore';

export function IdVerificationScreen({
  navigation,
}: RootScreenProps<'IdVerification'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const user = useUser();
  const start = useStartIdVerification();
  const { mutate: reloadUser } = useReloadUser();
  /** Sanad was opened: reload the account when the user comes back. */
  const inSanad = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active' || !inSanad.current) return;
      inSanad.current = false;
      reloadUser();
    });
    return () => sub.remove();
  }, [reloadUser]);

  const verified = !!user?.verified;
  useEffect(() => {
    if (!verified) return;
    toast.success(t('idVerification.verified'));
    navigation.goBack();
  }, [verified, navigation, t]);

  const openSanad = () =>
    start.mutate(undefined, {
      onSuccess: ({ redirectUrl }) => {
        inSanad.current = true;
        Linking.openURL(redirectUrl);
      },
    });

  return (
    <Screen
      tone="white"
      header={
        <>
          <BackButton />
          <Heading className="text-xl">{t('screens.idVerification')}</Heading>
        </>
      }
    >
      <ScrollView contentContainerClassName="grow justify-center gap-6 p-6">
        <View className="items-center gap-3">
          <View className="rounded-full bg-brand-lightgray p-6">
            <Icon name="IdCard" size={48} color={colors.primary} />
          </View>
          <Heading className="text-center text-2xl">
            {t('idVerification.title')}
          </Heading>
          <Text className="text-center font-sans-medium text-sm leading-relaxed text-brand-warmgray">
            {t('idVerification.verifyBody')}
          </Text>
        </View>

        <View className="flex-row items-center justify-center gap-2">
          <Icon name="Lock" size={16} color={colors.success} />
          <Text className="font-sans-bold text-xs text-brand-warmgray">
            {t('idVerification.secure')}
          </Text>
        </View>
      </ScrollView>

      <View
        className="gap-3 border-t border-brand-border bg-brand-surface p-6"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        {start.isError && (
          <Text
            accessibilityRole="alert"
            className="text-center font-sans-bold text-sm text-brand-danger"
          >
            {t(errorMessageKey(start.error))}
          </Text>
        )}
        <Button
          size="lg"
          label={t('idVerification.withSanad')}
          loading={start.isPending}
          onPress={openSanad}
        />
      </View>
    </Screen>
  );
}
