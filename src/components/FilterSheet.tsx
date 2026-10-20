// Filters bottom sheet (prototype components/FilterSheet). Edits a draft;
// "Show N results" applies it, closing discards it. Option chips come from the
// server's facets (what exists in scope), and the count is asked of the
// server as the draft changes.

import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icons';
import {
  Button,
  Chip,
  Heading,
  Select,
  Text,
  TextField,
} from '@/components/ui';
import { useListingTotal } from '@/features/catalog/hooks/useCatalog';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useLocalized } from '@/i18n';
import { emptyFilters, validPriceRange } from '@/lib/browsing';
import type {
  ActiveFilters,
  Category,
  CategoryFilters,
  CategoryId,
  ListingFacets,
  ListingFormat,
  ListingQuery,
} from '@/lib/types';
import { colors } from '@/theme/colors';

type FilterSheetProps = {
  visible: boolean;
  /** Options that exist in scope; undefined while the first page loads. */
  facets: ListingFacets | undefined;
  /** The browser's query; the draft filters replace its filters for the count. */
  countQuery: ListingQuery;
  /** Shown as a Category picker on Search and Auctions; omitted on a category page. */
  categories?: Category[];
  categoryFilters: Record<CategoryId, CategoryFilters>;
  format: ListingFormat;
  value: ActiveFilters;
  onClose: () => void;
  onApply: (filters: ActiveFilters) => void;
};

type ListKey = 'conditions' | 'locations' | 'types' | 'brands';

export function FilterSheet(props: FilterSheetProps) {
  return (
    <Modal
      visible={props.visible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={props.onClose}
    >
      {/* Mounted only while open, so the draft starts from the applied filters. */}
      {props.visible && <SheetContent {...props} />}
    </Modal>
  );
}

function SheetContent({
  facets,
  countQuery,
  categories,
  categoryFilters,
  format,
  value,
  onClose,
  onApply,
}: FilterSheetProps) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<ActiveFilters>(value);

  // Option ids come from the listings themselves, so they're valid values.
  const toggle = (key: ListKey, option: string) =>
    setDraft(d => {
      const list: string[] = d[key];
      return {
        ...d,
        [key]: list.includes(option)
          ? list.filter(x => x !== option)
          : [...list, option],
      };
    });

  // Types and brands follow the chosen category; condition and location don't.
  const byCategory = facets?.byCategory ?? {};
  const scopedCategories = (
    draft.category
      ? [draft.category]
      : (Object.keys(byCategory) as CategoryId[])
  ).filter(id => byCategory[id]);
  const typeOptions = scopedCategories.flatMap(id =>
    byCategory[id]!.types.flatMap(typeId => {
      const name = categoryFilters[id]?.types.find(x => x.id === typeId)?.name;
      return name ? [{ id: typeId, label: localized(name) }] : [];
    }),
  );
  const brandOptions = [
    ...new Set(scopedCategories.flatMap(id => byCategory[id]!.brands)),
  ].map(b => ({ id: b, label: b }));

  const sections: {
    key: ListKey;
    title: string;
    options: { id: string; label: string }[];
  }[] = [
    {
      key: 'conditions',
      title: t('filters.condition'),
      options: (facets?.conditions ?? []).map(c => ({
        id: c,
        label: t(`condition.${c}`),
      })),
    },
    {
      key: 'locations',
      title: t('filters.location'),
      options: (facets?.cities ?? []).map(place => ({
        id: place.id,
        label: localized(place.name),
      })),
    },
    {
      key: 'types',
      title: t('filters.type'),
      options: typeOptions,
    },
    {
      key: 'brands',
      title: t('filters.brand'),
      options: brandOptions,
    },
  ];

  const valid = validPriceRange(draft);
  // Asked of the server, debounced so typing a price doesn't spam requests.
  const debouncedDraft = useDebouncedValue(draft);
  const count = useListingTotal({ ...countQuery, filters: debouncedDraft });
  const priceTitle =
    format === 'auction'
      ? t('filters.priceAuction')
      : format === 'all'
      ? t('filters.priceAll')
      : t('filters.priceFixed');

  return (
    <>
      <Animated.View entering={FadeIn.duration(150)} style={styles.fill}>
        <Pressable
          onPress={onClose}
          accessibilityLabel={t('filters.close')}
          className="flex-1 bg-brand-espresso/60"
        />
      </Animated.View>

      <Animated.View
        entering={SlideInDown.duration(220)}
        style={[styles.panel, { top: insets.top + 24 }]}
        accessibilityViewIsModal
      >
        <View className="mx-auto mt-3 h-1 w-10 rounded-full bg-brand-border" />
        <View className="flex-row items-center justify-between border-b border-brand-border px-5 pb-4 pt-3">
          <Heading className="text-xl">{t('filters.title')}</Heading>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            className="-me-2 rounded-full p-2 active:bg-brand-lightgray"
          >
            <Icon name="X" />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-6 p-5"
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <Heading className="mb-3 text-sm">{priceTitle}</Heading>
            <View className="flex-row items-end gap-3">
              <TextField
                className="flex-1"
                label={t('filters.minimum')}
                labelClassName="font-sans-bold text-xs text-brand-warmgray"
                value={draft.min}
                onChangeText={min => setDraft(d => ({ ...d, min }))}
                placeholder="0"
                keyboardType="decimal-pad"
                ltr
              />
              <Text className="pb-3 font-sans-bold text-brand-warmgray">—</Text>
              <TextField
                className="flex-1"
                label={t('filters.maximum')}
                labelClassName="font-sans-bold text-xs text-brand-warmgray"
                value={draft.max}
                onChangeText={max => setDraft(d => ({ ...d, max }))}
                placeholder={t('filters.noLimit')}
                keyboardType="decimal-pad"
                ltr
              />
            </View>
            {!valid && (
              <Text
                accessibilityRole="alert"
                className="mt-2 font-sans-bold text-xs text-brand-danger"
              >
                {t('filters.rangeError')}
              </Text>
            )}
            {format !== 'fixed' && (
              <Text className="mt-3 text-xs leading-5 text-brand-warmgray">
                {t('filters.auctionNote')}
              </Text>
            )}
          </View>

          {categories && (
            <View className="gap-3">
              <Heading className="text-sm">{t('filters.category')}</Heading>
              <Select
                size="md"
                label={t('filters.category')}
                value={draft.category}
                onChange={category =>
                  setDraft(d => ({ ...d, category, types: [], brands: [] }))
                }
                options={[
                  { value: '' as const, label: t('filters.allCategories') },
                  ...categories.map(c => ({
                    value: c.id,
                    label: localized(c.name),
                  })),
                ]}
              />
            </View>
          )}

          {sections.map(
            section =>
              section.options.length > 0 && (
                <View key={section.key}>
                  <Heading className="mb-3 text-sm">{section.title}</Heading>
                  <View className="flex-row flex-wrap gap-2">
                    {section.options.map(option => (
                      <Chip
                        key={option.id}
                        label={option.label}
                        selected={(draft[section.key] as string[]).includes(
                          option.id,
                        )}
                        onPress={() => toggle(section.key, option.id)}
                      />
                    ))}
                  </View>
                </View>
              ),
          )}

          <View className="gap-3">
            <Heading className="text-sm">{t('filters.moreOptions')}</Heading>
            <View className="flex-row flex-wrap gap-2">
              <Chip
                label={t('filters.verifiedSellers')}
                selected={draft.verifiedOnly}
                onPress={() =>
                  setDraft(d => ({ ...d, verifiedOnly: !d.verifiedOnly }))
                }
              />
              {format !== 'fixed' && (
                <Chip
                  label={t('filters.endingWithin24h')}
                  selected={draft.endingSoon}
                  onPress={() =>
                    setDraft(d => ({ ...d, endingSoon: !d.endingSoon }))
                  }
                />
              )}
            </View>
          </View>
        </ScrollView>

        <View
          className="flex-row items-center gap-3 border-t border-brand-border bg-brand-surface px-5 pt-5"
          style={{ paddingBottom: Math.max(insets.bottom, 20) }}
        >
          <Pressable
            onPress={() => setDraft(emptyFilters())}
            accessibilityRole="button"
            className="min-h-11 justify-center rounded-xl px-3 py-4 active:bg-brand-lightgray"
          >
            <Text className="font-sans-bold text-sm">{t('filters.reset')}</Text>
          </Pressable>
          <Button
            className="flex-1"
            label={
              count === undefined
                ? t('browse.filters')
                : t('filters.showResults', { count })
            }
            disabled={!valid}
            onPress={() => onApply(draft)}
          />
        </View>
      </Animated.View>
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
