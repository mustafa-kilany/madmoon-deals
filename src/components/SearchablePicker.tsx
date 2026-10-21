// Searchable pick-one list for long option lists (brands, models): a box like
// Select; tapping opens a bottom panel with a search field. The typed text can
// be used as-is when it isn't listed, and "Not specified" clears the choice.

import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icons';
import { Heading, Text, TextField } from '@/components/ui';
import { foldText } from '@/lib/text';
import { colors } from '@/theme/colors';

type SearchablePickerProps = {
  /** '' when nothing is chosen. */
  value: string;
  options: string[];
  onChange: (value: string) => void;
  /** Panel title and accessibility label. */
  label: string;
  /** Shown in the box when nothing is chosen. */
  placeholder: string;
  className?: string;
};

export function SearchablePicker({
  value,
  options,
  onChange,
  label,
  placeholder,
  className = '',
}: SearchablePickerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const choose = (option: string) => {
    close();
    onChange(option);
  };

  const q = foldText(query);
  const matches = q ? options.filter(o => foldText(o).includes(q)) : options;
  const custom =
    q && !options.some(o => foldText(o) === q) ? query.trim() : undefined;

  const row = (option: string, text: string, active: boolean) => (
    <Pressable
      onPress={() => choose(option)}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="min-h-12 flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-brand-lightgray"
    >
      <Text
        className={`flex-1 text-sm ${
          active ? 'font-sans-bold text-brand-primary' : 'font-sans-medium'
        }`}
      >
        {text}
      </Text>
      {active && <Icon name="Check" size={18} color={colors.primary} />}
    </Pressable>
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: value || undefined }}
        className={`min-h-11 flex-row items-center gap-2 rounded-xl border border-brand-border bg-brand-surface px-3 py-3 ${className}`}
      >
        <Text
          className={`flex-1 text-sm ${
            value ? 'font-sans-bold' : 'font-sans-medium text-brand-warmgray'
          }`}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <Icon name="ChevronDown" size={16} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={close}
      >
        <Animated.View entering={FadeIn.duration(150)} style={styles.fill}>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            className="flex-1 bg-brand-espresso/60"
          />
        </Animated.View>
        <Animated.View
          entering={SlideInDown.duration(200)}
          style={[
            styles.panel,
            { top: insets.top + 48, paddingBottom: insets.bottom + 8 },
          ]}
        >
          <View className="mx-auto mt-3 h-1 w-10 rounded-full bg-brand-border" />
          <View className="gap-3 px-5 pb-2 pt-4">
            <Heading className="text-lg">{label}</Heading>
            <TextField
              variant="muted"
              value={query}
              onChangeText={setQuery}
              placeholder={t('picker.search')}
              accessibilityLabel={t('picker.search')}
              autoCorrect={false}
              leading={<Icon name="Search" size={18} color={colors.warmgray} />}
            />
          </View>

          <FlatList
            data={matches}
            keyExtractor={option => option}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="px-3 pb-4"
            initialNumToRender={20}
            ListHeaderComponent={
              <>
                {custom !== undefined &&
                  row(custom, t('picker.useCustom', { value: custom }), false)}
                {!q && value !== '' && row('', t('picker.none'), false)}
              </>
            }
            renderItem={({ item: option }) =>
              row(option, option, option === value)
            }
            ListEmptyComponent={
              custom === undefined ? (
                <Text className="p-6 text-center text-sm text-brand-warmgray">
                  {t('picker.typeYourOwn')}
                </Text>
              ) : undefined
            }
          />
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
    backgroundColor: colors.surface,
    borderTopStartRadius: 24,
    borderTopEndRadius: 24,
  },
});
