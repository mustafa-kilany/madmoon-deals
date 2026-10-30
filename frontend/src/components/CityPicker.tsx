// Area picker for Profile and Add Listing: shows "البلقاء / السلط" in a box
// like Select; tapping opens a searchable list grouped by governorate, with
// "Use my current location" on top (GPS → nearest area, on the phone).

import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icons';
import { Heading, Text, TextField } from '@/components/ui';
import { useCities } from '@/features/catalog/hooks/useCatalog';
import { locateErrorKey, useLocate } from '@/features/location/useLocate';
import { useLocalized } from '@/i18n';
import { matchesPlace, nearestCity, placeLabel } from '@/lib/places';
import type { City } from '@/lib/types';
import { colors } from '@/theme/colors';

type CityPickerProps = {
  value: string;
  onChange: (cityId: string) => void;
  /** Panel title and accessibility label. */
  label: string;
  className?: string;
};

export function CityPicker({
  value,
  onChange,
  label,
  className = '',
}: CityPickerProps) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const insets = useSafeAreaInsets();
  const { data: cities = [] } = useCities();
  const locate = useLocate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = cities.find(c => c.id === value);
  const choose = (cityId: string) => {
    setOpen(false);
    setQuery('');
    locate.reset();
    onChange(cityId);
  };

  const useMyLocation = () =>
    locate.mutate(undefined, {
      onSuccess: position => {
        const nearest = nearestCity(cities, position);
        if (nearest) choose(nearest.id);
      },
    });

  // Governorates in list order, each with its matching areas.
  const sections: { title: string; data: City[] }[] = [];
  for (const city of cities.filter(c => matchesPlace(c, query))) {
    const title = localized(city.governorate);
    const section = sections.find(s => s.title === title);
    if (section) section.data.push(city);
    else sections.push({ title, data: [city] });
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{
          text: selected ? placeLabel(selected, localized) : undefined,
        }}
        className={`min-h-11 flex-row items-center gap-2 rounded-xl border border-brand-border bg-brand-surface px-4 py-4 ${className}`}
      >
        <Icon name="MapPin" size={18} color={colors.primary} />
        <Text className="flex-1 font-sans-bold text-base" numberOfLines={1}>
          {selected ? placeLabel(selected, localized) : t('location.choose')}
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

            <Pressable
              onPress={useMyLocation}
              disabled={locate.isPending}
              accessibilityRole="button"
              className="min-h-12 flex-row items-center gap-3 rounded-xl bg-brand-success-soft px-3 py-3 active:opacity-80"
            >
              {locate.isPending ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Icon name="MapPin" size={20} color={colors.primary} />
              )}
              <Text className="flex-1 font-sans-bold text-sm text-brand-primary">
                {t('location.useCurrent')}
              </Text>
            </Pressable>
            {locate.isError && (
              <Text
                accessibilityRole="alert"
                className="font-sans-bold text-xs text-brand-danger"
              >
                {t(locateErrorKey(locate.error))}
              </Text>
            )}

            <TextField
              variant="muted"
              value={query}
              onChangeText={setQuery}
              placeholder={t('location.search')}
              accessibilityLabel={t('location.search')}
              leading={<Icon name="Search" size={18} color={colors.warmgray} />}
            />
          </View>

          <SectionList
            sections={sections}
            keyExtractor={city => city.id}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            contentContainerClassName="px-3 pb-4"
            renderSectionHeader={({ section }) => (
              <Text className="px-3 pb-1 pt-4 font-sans-bold text-xs text-brand-warmgray">
                {section.title}
              </Text>
            )}
            renderItem={({ item: city }) => {
              const active = city.id === value;
              return (
                <Pressable
                  onPress={() => choose(city.id)}
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
                    {localized(city.name)}
                  </Text>
                  {active && (
                    <Icon name="Check" size={18} color={colors.primary} />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text className="p-6 text-center text-sm text-brand-warmgray">
                {t('location.noMatch')}
              </Text>
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
