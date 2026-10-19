// Condition label with its color pair (DEVELOPMENT_GUIDE §2.1): New green,
// Excellent blue, Good yellow, Loved red.

import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import type { Condition } from '@/lib/types';

const classes: Record<Condition, { box: string; text: string }> = {
  new: { box: 'bg-brand-success-soft', text: 'text-brand-success' },
  excellent: { box: 'bg-brand-info-soft', text: 'text-brand-info' },
  good: { box: 'bg-brand-warning-soft', text: 'text-brand-warning-text' },
  loved: { box: 'bg-brand-danger-soft', text: 'text-brand-danger' },
};

type ConditionTagProps = {
  condition: Condition;
  /** "sm" on cards (px-1.5), "md" on the product page (px-2). */
  size?: 'sm' | 'md';
};

export function ConditionTag({ condition, size = 'sm' }: ConditionTagProps) {
  const { t } = useTranslation();
  const c = classes[condition];
  return (
    <View
      className={`self-start rounded-md py-0.5 ${
        size === 'sm' ? 'px-1.5' : 'px-2'
      } ${c.box}`}
    >
      <Text className={`font-sans-bold text-xs ${c.text}`} numberOfLines={1}>
        {t(`condition.${condition}`)}
      </Text>
    </View>
  );
}
