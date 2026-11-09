// How many messages are waiting. Nothing at all when there are none.

import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';

export function UnreadBadge({
  count,
  testID,
}: {
  count: number;
  testID: string;
}) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  return (
    <View
      testID={testID}
      accessibilityLabel={t('chats.unread', { count })}
      className="h-5 min-w-5 items-center justify-center rounded-full bg-brand-primary px-1"
    >
      <Text className="font-sans-bold text-[10px] text-brand-on-primary">
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}
