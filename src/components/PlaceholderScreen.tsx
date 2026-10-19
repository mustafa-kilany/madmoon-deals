// Temporary body for screens that haven't been ported yet (Phase 1 shell).
// Each feature screen replaces it when its phase lands.

import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Heading, Screen, Text } from '@/components/ui';

type PlaceholderScreenProps = {
  title: string;
  /** Stack screens get a back button; tab screens don't. */
  back?: boolean;
};

export function PlaceholderScreen({
  title,
  back = false,
}: PlaceholderScreenProps) {
  const { t } = useTranslation();
  return (
    <Screen
      header={
        <>
          {back && <BackButton />}
          <Heading className="text-xl">{title}</Heading>
        </>
      }
    >
      <View className="flex-1 items-center justify-center px-5">
        <Text className="font-sans-medium text-sm text-brand-warmgray">
          {t('common.comingSoon')}
        </Text>
      </View>
    </Screen>
  );
}
