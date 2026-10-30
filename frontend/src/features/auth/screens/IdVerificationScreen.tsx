// National ID scan (prototype IDVerification). Accounts are created with
// email only; this upgrades the signed-in account to Verified.

import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
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
import type { LocalPhoto } from '@/lib/types';
import type { RootScreenProps } from '@/navigation/types';
import { errorMessageKey } from '@/services/api/errors';
import { toast } from '@/store/toastStore';
import { colors } from '@/theme/colors';
import { useVerifyId } from '../hooks/useAccount';
import { captureIdPhoto } from '../photoCapture';

export function IdVerificationScreen({
  navigation,
}: RootScreenProps<'IdVerification'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const verify = useVerifyId();
  const [cameraFailed, setCameraFailed] = useState(false);

  const capture = async () => {
    setCameraFailed(false);
    let photo: LocalPhoto | null;
    try {
      photo = await captureIdPhoto();
    } catch {
      setCameraFailed(true);
      return;
    }
    if (!photo) return; // cancelled
    verify.mutate(photo, {
      onSuccess: user => {
        // Until Sanad, an admin reviews the photo: usually "submitted", not "verified".
        toast.success(
          t(
            user.verified
              ? 'idVerification.verified'
              : 'idVerification.submitted',
          ),
        );
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
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          contentContainerClassName="grow justify-center gap-6 p-6"
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center gap-3">
            <Heading className="text-center text-2xl">
              {t('idVerification.title')}
            </Heading>
            <Text className="text-center font-sans-medium text-sm leading-relaxed text-brand-warmgray">
              {t('idVerification.verifyBody')}
            </Text>
          </View>

          <ScanFrame />

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
          {(cameraFailed || verify.isError) && (
            <Text
              accessibilityRole="alert"
              className="text-center font-sans-bold text-sm text-brand-danger"
            >
              {cameraFailed
                ? t('idVerification.cameraError')
                : t(errorMessageKey(verify.error))}
            </Text>
          )}
          <Button
            size="lg"
            label={t('idVerification.capture')}
            loading={verify.isPending}
            onPress={capture}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** Dashed card outline with a pulsing scan line. */
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
