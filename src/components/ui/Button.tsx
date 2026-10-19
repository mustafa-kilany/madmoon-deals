// Main call-to-action button, matching the prototype's full-width buttons:
// primary = sage green with white bold text, secondary = white with a 2px
// border. Scales slightly while pressed (prototype: active:scale-[0.98]).
// `loading` shows a spinner and blocks presses while a request runs.

import { ActivityIndicator, Pressable, View } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { colors } from '@/theme/colors';
import { Text } from './Text';

type Variant = 'primary' | 'secondary';
type Size = 'sm' | 'md' | 'lg';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  /** lg = text-lg (screen-level actions), sm = py-3 (inside cards). */
  size?: Size;
  /** 24px for lg buttons, 20px otherwise; green on secondary buttons. */
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  /** Layout only (w-full, flex-1, mt-4, …). */
  className?: string;
  accessibilityLabel?: string;
};

const containerByVariant: Record<Variant, string> = {
  primary: 'bg-brand-primary shadow-lg shadow-brand-primary/20',
  secondary: 'bg-brand-surface border-2 border-brand-border',
};

const textByVariant: Record<Variant, string> = {
  primary: 'text-brand-on-primary',
  secondary: 'text-brand-espresso',
};

const paddingBySize: Record<Size, string> = {
  sm: 'py-3',
  md: 'py-4',
  lg: 'py-4',
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled = false,
  loading = false,
  className = '',
  accessibilityLabel,
}: ButtonProps) {
  const inactive = disabled || loading;
  const contentColor =
    variant === 'primary' ? colors.onPrimary : colors.espresso;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      className={`rounded-xl px-6 active:scale-[0.98] ${paddingBySize[size]} ${
        containerByVariant[variant]
      } ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      <View className="flex-row items-center justify-center gap-3">
        {loading ? (
          <ActivityIndicator color={contentColor} />
        ) : (
          icon && (
            <Icon
              name={icon}
              size={size === 'lg' ? 24 : 20}
              color={variant === 'primary' ? colors.onPrimary : colors.primary}
            />
          )
        )}
        <Text
          className={`font-sans-bold ${
            size === 'lg' ? 'text-lg' : 'text-base'
          } ${textByVariant[variant]}`}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
