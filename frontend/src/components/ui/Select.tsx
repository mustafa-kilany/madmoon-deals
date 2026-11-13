// Dropdown (prototype ui/Select, a native <select> on the web). Shows the
// current choice in a bordered box; tapping opens a list of options in a
// bottom panel.

import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { colors } from '@/theme/colors';
import { Heading, Text } from './Text';

export type SelectOption<T extends string> = { value: T; label: string };

const boxBySize = { sm: 'px-3 py-2.5', md: 'px-3 py-3', lg: 'px-4 py-4' };
const textBySize = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };

type SelectProps<T extends string> = {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Panel title and accessibility label. */
  label: string;
  /** Text in the closed box; defaults to the selected option's label. */
  display?: string;
  /** sm = text-xs (sort bar), md = text-sm (filter sheet), lg = text-base (Profile). */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  display,
  size = 'sm',
  className = '',
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const selected = options.find(o => o.value === value);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label }}
        className={`min-h-11 flex-row items-center gap-2 rounded-xl border border-brand-border bg-brand-surface ${boxBySize[size]} ${className}`}
      >
        <Text
          className={`flex-1 font-sans-bold ${textBySize[size]}`}
          numberOfLines={1}
        >
          {display ?? selected?.label}
        </Text>
        <Icon name="ChevronDown" size={16} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={() => setOpen(false)}
      >
        <Animated.View entering={FadeIn.duration(150)} style={styles.fill}>
          <Pressable
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={label}
            className="flex-1 bg-brand-espresso/60"
          />
        </Animated.View>
        <Animated.View
          entering={SlideInDown.duration(200)}
          style={[styles.panel, { paddingBottom: insets.bottom + 8 }]}
        >
          <View className="mx-auto mt-3 h-1 w-10 rounded-full bg-brand-border" />
          <Heading className="px-5 pb-2 pt-4 text-lg">{label}</Heading>
          <ScrollView contentContainerClassName="px-3 pb-2">
            {options.map(option => {
              const active = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    setOpen(false);
                    onChange(option.value);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className="min-h-12 flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-brand-lightgray"
                >
                  <Text
                    className={`flex-1 text-sm ${
                      active
                        ? 'font-sans-bold text-brand-primary'
                        : 'font-sans-medium'
                    }`}
                  >
                    {option.label}
                  </Text>
                  {active && (
                    <Icon name="Check" size={18} color={colors.primary} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>
      </Modal>
    </>
  );
}

// Reanimated views take style, not className.
const styles = StyleSheet.create({
  fill: { flex: 1 },
  panel: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderTopStartRadius: 24,
    borderTopEndRadius: 24,
  },
});
