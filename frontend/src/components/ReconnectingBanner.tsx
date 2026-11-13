// Above the scrolling part of a live screen: it must stay in sight wherever the person has scrolled to.

import { View } from 'react-native';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui';
import { colors } from '@/theme/colors';

export function ReconnectingBanner({
  message,
  testID,
}: {
  message: string;
  testID: string;
}) {
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="flex-row items-center gap-2 bg-brand-warning-soft px-5 py-3"
    >
      <Icon name="AlertCircle" size={16} color={colors.warningText} />
      <Text className="flex-1 font-sans-bold text-xs text-brand-warning-text">
        {message}
      </Text>
    </View>
  );
}
