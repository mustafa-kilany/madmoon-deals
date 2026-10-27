// Condition label with its color pair (DEVELOPMENT_GUIDE §2.1): New green,
// Excellent blue, Good yellow, Loved red. Refurbished grades are espresso, so
// they never read as a used-item grade (prototype conditionClasses).

import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import type { Condition } from '@/lib/types';

const refurbished = { box: 'bg-brand-espresso', text: 'text-brand-on-primary' };

const classes: Record<Condition, { box: string; text: string }> = {
  new: { box: 'bg-brand-success-soft', text: 'text-brand-success' },
  excellent: { box: 'bg-brand-info-soft', text: 'text-brand-info' },
  good: { box: 'bg-brand-warning-soft', text: 'text-brand-warning-text' },
  loved: { box: 'bg-brand-danger-soft', text: 'text-brand-danger' },
  refurbished_like_new: refurbished,
  refurbished_excellent: refurbished,
  refurbished_good: refurbished,
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
    // shrink + 2 lines: a long grade ("Refurbished - Like new") wraps instead
    // of being cut off when the card is narrow; the minimum width keeps the
    // word "Refurbished" on one line.
    <View
      className={`shrink self-start rounded-md py-0.5 ${
        size === 'sm' ? 'px-1.5' : 'px-2'
      } ${condition.startsWith('refurbished_') ? 'min-w-[92px]' : ''} ${c.box}`}
    >
      <Text className={`font-sans-bold text-xs ${c.text}`} numberOfLines={2}>
        {t(`condition.${condition}`)}
      </Text>
    </View>
  );
}
