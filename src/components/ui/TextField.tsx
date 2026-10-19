// Text input from the prototype's ui/Input: 2px border, radius 12, bold text,
// sage border while focused, optional label above and error below. Optional
// leading/trailing slots (search icon, clear button) sit inside the field.

import { useState, type ReactNode } from 'react';
import {
  I18nManager,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { colors } from '@/theme/colors';
import { Text } from './Text';

type TextFieldProps = Omit<TextInputProps, 'className'> & {
  label?: string;
  /** Prototype uses small gray labels in sheets: "font-sans-bold text-xs text-brand-warmgray". */
  labelClassName?: string;
  error?: string;
  /** "muted" = cream background, as on search fields. */
  variant?: 'surface' | 'muted';
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Numbers and prices: always typed and shown left-to-right. */
  ltr?: boolean;
  /** Layout of the wrapper (flex-1, mt-4, …). */
  className?: string;
};

export function TextField({
  label,
  labelClassName = 'font-sans-bold text-sm',
  error,
  variant = 'surface',
  leading,
  trailing,
  ltr = false,
  className = '',
  onFocus,
  onBlur,
  style,
  ...props
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const border = error
    ? 'border-brand-danger'
    : focused
    ? 'border-brand-primary'
    : 'border-brand-border';
  const background =
    variant === 'muted' ? 'bg-brand-lightgray' : 'bg-brand-surface';

  return (
    <View className={`gap-2 ${className}`}>
      {label && <Text className={labelClassName}>{label}</Text>}
      <View className="justify-center">
        <TextInput
          accessibilityLabel={props.accessibilityLabel ?? label}
          placeholderTextColor={colors.warmgray}
          className={`w-full rounded-xl border-2 py-3 text-sm font-sans-bold text-brand-espresso ${background} ${border} ${
            leading ? 'ps-10' : 'ps-3'
          } ${trailing ? 'pe-9' : 'pe-3'}`}
          style={[ltr ? styles.ltr : styles.start, style]}
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
        {leading && (
          <View pointerEvents="none" className="absolute start-3">
            {leading}
          </View>
        )}
        {trailing && <View className="absolute end-2">{trailing}</View>}
      </View>
      {error && (
        <Text className="font-sans-bold text-xs text-brand-danger">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ltr: { textAlign: 'left', writingDirection: 'ltr' },
  // Otherwise Android aligns by the typed text's script ("Apple" goes left
  // in Arabic); the prototype keeps input at the start edge.
  start: { textAlign: I18nManager.isRTL ? 'right' : 'left' },
});
