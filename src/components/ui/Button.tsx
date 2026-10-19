// Main call-to-action button, matching the prototype's full-width buttons:
// primary = sage green with white bold text, secondary = white with a 2px
// border. Scales slightly while pressed (prototype: active:scale-[0.98]).

import { Pressable, View } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { colors } from '@/theme/colors';
import { Text } from './Text';

type Variant = 'primary' | 'secondary';
type Size = 'md' | 'lg';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  /** lg = text-lg, used for screen-level actions (Pay, Sign up, Submit). */
  size?: Size;
  icon?: IconName;
  disabled?: boolean;
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

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled = false,
  className = '',
  accessibilityLabel,
}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      className={`rounded-xl px-6 py-4 active:scale-[0.98] ${
        containerByVariant[variant]
      } ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      <View className="flex-row items-center justify-center gap-3">
        {icon && (
          <Icon
            name={icon}
            size={20}
            color={variant === 'primary' ? colors.onPrimary : colors.espresso}
          />
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
