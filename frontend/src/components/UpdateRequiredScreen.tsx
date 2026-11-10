// Shown instead of the whole app once the server says this build is too old (426 UPDATE_REQUIRED,
// BACKEND_REVIEW M3): the API no longer serves it, so nothing else would work properly.

import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Button, Heading, Text } from '@/components/ui';
import { colors } from '@/theme/colors';

const PLAY_APP = 'market://details?id=com.sahla';
const PLAY_WEB = 'https://play.google.com/store/apps/details?id=com.sahla';

export const openStore = () =>
  Linking.openURL(PLAY_APP).catch(() => Linking.openURL(PLAY_WEB));

export function UpdateRequiredScreen() {
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="alert"
      className="flex-1 items-center justify-center gap-4 bg-brand-lightgray p-8"
    >
      <Icon name="AlertCircle" size={48} color={colors.warmgray} />
      <Heading className="text-center text-xl">{t('update.title')}</Heading>
      <Text className="text-center text-sm text-brand-warmgray">
        {t('update.body')}
      </Text>
      <Button label={t('update.button')} onPress={openStore} className="w-full" />
    </View>
  );
}
