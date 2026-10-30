// Toggle chip used for category and filter choices (prototype ListingBrowser):
// selected = sage border on soft green, idle = light border with gray text.

import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text } from './Text';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** Optional leading element, e.g. a small category image. */
  leading?: ReactNode;
  className?: string;
};

export function Chip({
  label,
  selected = false,
  onPress,
  leading,
  className = '',
}: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`min-h-11 flex-row items-center gap-2 rounded-xl border py-2 ${
        leading ? 'pe-3 ps-1' : 'px-3'
      } ${
        selected
          ? 'border-brand-primary bg-brand-success-soft'
          : 'border-brand-border'
      } ${className}`}
    >
      {leading}
      <Text
        className={`font-sans-bold text-xs ${
          selected ? 'text-brand-espresso' : 'text-brand-warmgray'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
