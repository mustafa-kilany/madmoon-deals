// National ID scan (prototype IDVerification). purpose "signup" creates a
// verified account; "verify" upgrades the signed-in email account. The photo
// comes from idCapture (simulated until the camera is added).

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Icon } from '@/components/icons';
import { Button, Heading, Screen, Text } from '@/components/ui';
import type { RootScreenProps } from '@/navigation/types';
import { errorMessageKey } from '@/services/api/errors';
import { toast } from '@/store/toastStore';
import { colors } from '@/theme/colors';
import { useSignUpWithId, useVerifyId } from '../hooks/useAccount';
import { captureIdPhoto } from '../idCapture';

export function IdVerificationScreen({
  route,
  navigation,
}: RootScreenProps<'IdVerification'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { purpose } = route.params;
  const signUp = useSignUpWithId();
  const verify = useVerifyId();
  const mutation = purpose === 'signup' ? signUp : verify;

  const capture = async () => {
    const photo = await captureIdPhoto();
    if (purpose === 'signup') signUp.mutate(photo);
    else
      verify.mutate(photo, {
        onSuccess: () => {
          toast.success(t('idVerification.verified'));
          navigation.goBack();
        },
      });
  };

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
      <View className="flex-1 items-center justify-center gap-8 p-6">
        <View className="items-center gap-3">
          <Heading className="text-center text-2xl">
            {t('idVerification.title')}
          </Heading>
          <Text className="text-center font-sans-medium text-sm leading-relaxed text-brand-warmgray">
            {t(
              purpose === 'signup'
                ? 'idVerification.signupBody'
                : 'idVerification.verifyBody',
            )}
          </Text>
        </View>

        <ScanFrame />

        <View className="flex-row items-center gap-2">
          <Icon name="Lock" size={16} color={colors.success} />
          <Text className="font-sans-bold text-xs text-brand-warmgray">
            {t('idVerification.secure')}
          </Text>
        </View>
      </View>

      <View
        className="gap-3 border-t border-brand-border bg-brand-surface p-6"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        {mutation.isError && (
          <Text
            accessibilityRole="alert"
            className="text-center font-sans-bold text-sm text-brand-danger"
          >
            {t(errorMessageKey(mutation.error))}
          </Text>
        )}
        <Button
          size="lg"
          label={t('idVerification.capture')}
          loading={mutation.isPending}
          onPress={capture}
        />
      </View>
    </Screen>
  );
}

/** Dashed card outline with a pulsing scan line (prototype animate-pulse). */
function ScanFrame() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.4, { duration: 1000 }), -1, true);
  }, [opacity]);
  const lineStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View className="aspect-[1.6] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-brand-warmgray bg-brand-lightgray">
      <View className="absolute inset-4 rounded-xl border-2 border-brand-primary/40" />
      <Animated.View style={[styles.scanLine, lineStyle]} />
      <Icon name="IdCard" size={48} color={`${colors.warmgray}80`} />
    </View>
  );
}

const styles = StyleSheet.create({
  scanLine: {
    position: 'absolute',
    start: 16,
    end: 16,
    top: '50%',
    height: 2,
    backgroundColor: colors.primary,
    opacity: 0.7,
  },
});
