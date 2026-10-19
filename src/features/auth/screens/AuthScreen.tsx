// Sign-in choice (prototype AuthScreen): verify with national ID (creates a
// verified account) or continue with email. Opened by any gated action.

import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icons';
import { Button, Heading, Text } from '@/components/ui';
import type { RootScreenProps } from '@/navigation/types';
import { colors } from '@/theme/colors';
import { iconSize } from '@/theme/spacing';
import { useAuthFlowStore } from '../authFlow';

export function AuthScreen({ navigation }: RootScreenProps<'Auth'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const setPending = useAuthFlowStore(s => s.setPending);

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

      <ScrollView contentContainerClassName="grow justify-center gap-8 p-6">
        <View className="items-center gap-2">
          <View className="mb-2 h-16 w-16 items-center justify-center rounded-2xl bg-brand-primary shadow-lg shadow-brand-primary/30">
            <Text className="font-heading-black text-3xl text-brand-on-primary">
              {t('auth.logoLetter')}
            </Text>
          </View>
          <Heading className="text-center text-3xl">
            {t('screens.auth')}
          </Heading>
          <Text className="text-center font-sans-medium text-sm leading-relaxed text-brand-warmgray">
            {t('auth.subtitle')}
          </Text>
        </View>

        <View className="gap-3">
          <Button
            size="lg"
            icon="IdCard"
            label={t('auth.verifyWithId')}
            onPress={() =>
              navigation.navigate('IdVerification', { purpose: 'signup' })
            }
          />
          <Button
            size="lg"
            variant="secondary"
            icon="Mail"
            label={t('auth.continueWithEmail')}
            onPress={() => navigation.navigate('EmailAuth', { mode: 'signup' })}
          />
        </View>

        <View className="flex-row items-center gap-2 rounded-xl border border-brand-secondary bg-brand-secondary/15 p-3">
          <Icon name="BadgeCheck" size={20} color={colors.primary} />
          <Text className="flex-1 font-sans-bold text-xs">
            {t('auth.idBenefit')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
