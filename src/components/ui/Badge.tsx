// Small rounded label: condition tags, the "Live" auction badge, counts.
// Tones map to the soft/strong color pairs in the palette.

import { View } from 'react-native';
import { Text } from './Text';

export type BadgeTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

const toneClasses: Record<
  BadgeTone,
  { box: string; text: string; dot: string }
> = {
  success: {
    box: 'bg-brand-success-soft',
    text: 'text-brand-success',
    dot: 'bg-brand-success',
  },
  info: {
    box: 'bg-brand-info-soft',
    text: 'text-brand-info',
    dot: 'bg-brand-info',
  },
  warning: {
    box: 'bg-brand-warning-soft',
    text: 'text-brand-warning-text',
    dot: 'bg-brand-warning-text',
  },
  danger: {
    box: 'bg-brand-danger-soft',
    text: 'text-brand-danger',
    dot: 'bg-brand-danger',
  },
  neutral: {
    box: 'bg-brand-lightgray',
    text: 'text-brand-warmgray',
    dot: 'bg-brand-warmgray',
  },
};

type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  /** Leading status dot, as on the Auctions "Live" badge. */
  dot?: boolean;
  className?: string;
};

export function Badge({
  label,
  tone = 'neutral',
  dot = false,
  className = '',
}: BadgeProps) {
  const c = toneClasses[tone];
  return (
    <View
      className={`flex-row items-center gap-1.5 self-start rounded-full px-2 py-1 ${c.box} ${className}`}
    >
      {dot && <View className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />}
      <Text className={`font-sans-bold text-xs ${c.text}`}>{label}</Text>
    </View>
  );
}
