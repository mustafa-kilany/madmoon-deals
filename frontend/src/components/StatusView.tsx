// Full-area loading spinner or load error with a retry button.

import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Text } from '@/components/ui';
import { colors } from '@/theme/colors';

type StatusViewProps =
  | { status: 'loading' }
  | { status: 'error'; onRetry: () => void; message?: string };

export function StatusView(props: StatusViewProps) {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center gap-4 p-8">
      {props.status === 'loading' ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : (
        <>
          <Text className="text-center font-sans-bold text-sm text-brand-warmgray">
            {props.message ?? t('common.loadError')}
          </Text>
          <Button label={t('common.retry')} onPress={props.onRetry} />
        </>
      )}
    </View>
  );
}
