// Text input from the prototype's ui/Input: 2px border, radius 12, bold text,
// sage border while focused, optional label above and error below.

import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { colors } from '@/theme/colors';
import { Text } from './Text';

type TextFieldProps = Omit<TextInputProps, 'className'> & {
  label?: string;
  error?: string;
  /** Layout of the wrapper (flex-1, mt-4, …). */
  className?: string;
};

export function TextField({
  label,
  error,
  className = '',
  onFocus,
  onBlur,
  ...props
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const border = error
    ? 'border-brand-danger'
    : focused
    ? 'border-brand-primary'
    : 'border-brand-border';

  return (
    <View className={`gap-2 ${className}`}>
      {label && <Text className="font-sans-bold text-sm">{label}</Text>}
      <TextInput
        accessibilityLabel={props.accessibilityLabel ?? label}
        placeholderTextColor={colors.warmgray}
        className={`w-full rounded-xl border-2 bg-brand-surface px-3 py-3 text-sm font-sans-bold text-brand-espresso ${border}`}
        onFocus={e => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...props}
      />
      {error && (
        <Text className="font-sans-bold text-xs text-brand-danger">
          {error}
        </Text>
      )}
    </View>
  );
}
