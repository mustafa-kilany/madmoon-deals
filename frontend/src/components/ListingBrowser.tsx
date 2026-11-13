// Shared browsing UI for Search results, Auctions, Category pages and the
// Certified Refurbished store (prototype components/ListingBrowser): optional
// search box, one bar with the All / Buy now / Auctions tabs (with counts) and
// the Refurbished switch, item-type and category chips, Filters + Sort,
// removable filter chips, an optional "Shop by brand" row, and the 2-column
// results grid. Choices are kept per `scope`. Results come from the server a
// page at a time (useListings); scrolling to the end loads the next page.

import { useState, type ReactElement } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CategoryImage } from '@/components/CategoryImage';
import { FilterSheet } from '@/components/FilterSheet';
import { Icon } from '@/components/icons';
import { ProductGrid } from '@/components/ProductGrid';
import {
  Button,
  Chip,
  Heading,
  Select,
  Text,
  TextField,
  type SelectOption,
} from '@/components/ui';
import { StatusView } from '@/components/StatusView';
import { useBrowseState } from '@/features/catalog/browseStore';
import { useListings } from '@/features/catalog/hooks/useCatalog';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useLocalized } from '@/i18n';
import { emptyFilters, filterCount } from '@/lib/browsing';
import { placeLabel } from '@/lib/places';
import type {
  ActiveFilters,
  BrowseSort,
  Category,
  CategoryFilters,
  CategoryId,
  ListingFormat,
  ListingQuery,
} from '@/lib/types';
import { colors } from '@/theme/colors';

const unique = <T,>(values: T[]) => [...new Set(values)];

type ListingBrowserProps = {
  scope: string;
  /** Search text from the screen (Search); `searchable` browsers have their own box. */
  query?: string;
  /** Only this category's listings (Category page). */
  category?: CategoryId;
  categories: Category[];
  categoryFilters: Record<CategoryId, CategoryFilters>;
  /** Auctions tab: no format tabs, auction sorts. */
  auctionOnly?: boolean;
  /** Own search box (Auctions tab). */
  searchable?: boolean;
  /** Category chips + category in the filter sheet (Search, Auctions). */
  showCategories?: boolean;
  /** Only brand-certified listings, no Refurbished switch (the store). */
  refurbishedOnly?: boolean;
  /** Row of item-type chips under the tabs (e.g. Phones, Laptops). */
  quickTypes?: boolean;
  /** "Shop by brand" row above the results. */
  quickBrands?: boolean;
  /** Shown at the top of the scrolling results. */
  intro?: ReactElement;
};

export function ListingBrowser({
  scope,
  query: screenQuery = '',
  category: scopeCategory,
  categories,
  categoryFilters,
  auctionOnly = false,
  searchable = false,
  showCategories = false,
  refurbishedOnly = false,
  quickTypes = false,
  quickBrands = false,
  intro,
}: ListingBrowserProps) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const [state, patch] = useBrowseState(scope, auctionOnly);
  const [sheetOpen, setSheetOpen] = useState(false);

  const format: ListingFormat = auctionOnly ? 'auction' : state.format;
  // Auctions never include refurbished stock (always fixed price), so a
  // remembered Refurbished switch doesn't apply there.
  const refurbished = refurbishedOnly || (!auctionOnly && state.refurbished);
  const q = useDebouncedValue(searchable ? state.query : screenQuery);
  const listingQuery: ListingQuery = {
    q,
    category: scopeCategory,
    format,
    refurbished,
    filters: state.filters,
    sort: state.sort,
  };
  const listings = useListings(listingQuery);
  const { items, total, counts, refurbishedCounts, facets } = listings;
  const loadMore = () => {
    if (listings.hasNextPage && !listings.isFetchingNextPage)
      listings.fetchNextPage();
  };
  const count = filterCount(state.filters);
  const availableCategories = categories.filter(c =>
    facets?.categories.includes(c.id),
  );
  const inScope = Object.values(facets?.byCategory ?? {});
  const facetTypes = unique(inScope.flatMap(c => c.types));
  const facetBrands = unique(inScope.flatMap(c => c.brands));
  const typeName = (id: string) => {
    const type = Object.values(categoryFilters)
      .flatMap(c => c.types)
      .find(x => x.id === id);
    return type ? localized(type.name) : id;
  };

  const changeFilters = (filters: ActiveFilters) => patch({ filters });
  const clear = () => changeFilters(emptyFilters());
  const toggle = (key: 'types' | 'brands', value: string) =>
    changeFilters({
      ...state.filters,
      [key]: state.filters[key].includes(value)
        ? state.filters[key].filter(x => x !== value)
        : [...state.filters[key], value],
    });
  const setFormat = (selection: ListingFormat) =>
    patch({
      format: selection,
      sort: selection === 'auction' ? 'ending_soon' : 'recommended',
      filters: { ...state.filters, endingSoon: false },
    });
  const setCategory = (category: CategoryId | '') =>
    changeFilters({ ...state.filters, category, types: [], brands: [] });

  // Removable chips for every active filter.
  const f = state.filters;
  const chips: { key: string; label: string; remove: () => void }[] = [];
  const category = categories.find(c => c.id === f.category);
  if (category)
    chips.push({
      key: 'category',
      label: localized(category.name),
      remove: () => setCategory(''),
    });
  const without = <K extends 'types' | 'brands' | 'conditions' | 'locations'>(
    key: K,
    value: string,
  ) =>
    changeFilters({
      ...f,
      [key]: (f[key] as string[]).filter(x => x !== value),
    });
  for (const id of f.types)
    chips.push({
      key: `type:${id}`,
      label: typeName(id),
      remove: () => without('types', id),
    });
  for (const brand of f.brands)
    chips.push({
      key: `brand:${brand}`,
      label: brand,
      remove: () => without('brands', brand),
    });
  for (const condition of f.conditions)
    chips.push({
      key: `condition:${condition}`,
      label: t(`condition.${condition}`),
      remove: () => without('conditions', condition),
    });
  for (const id of f.locations) {
    const place = facets?.cities.find(p => p.id === id);
    chips.push({
      key: `location:${id}`,
      label: place ? placeLabel(place, localized) : id,
      remove: () => without('locations', id),
    });
  }
  if (f.min || f.max)
    chips.push({
      key: 'price',
      label: t('browse.priceChip', {
        min: f.min || '0',
        max: f.max || t('browse.any'),
      }),
      remove: () => changeFilters({ ...f, min: '', max: '' }),
    });
  if (f.verifiedOnly)
    chips.push({
      key: 'verified',
      label: t('browse.verifiedOnly'),
      remove: () => changeFilters({ ...f, verifiedOnly: false }),
    });
  if (f.endingSoon)
    chips.push({
      key: 'ending',
      label: t('browse.within24h'),
      remove: () => changeFilters({ ...f, endingSoon: false }),
    });

  const sorts: SelectOption<BrowseSort>[] = [
    { value: 'recommended', label: t('browse.sortRecommended') },
    ...(format !== 'fixed'
      ? [{ value: 'ending_soon' as const, label: t('browse.sortEndingSoon') }]
      : []),
    { value: 'price_asc', label: t('browse.sortPriceAsc') },
    { value: 'price_desc', label: t('browse.sortPriceDesc') },
    ...(format === 'auction'
      ? [{ value: 'most_bids' as const, label: t('browse.sortMostBids') }]
      : []),
    { value: 'most_viewed', label: t('browse.sortMostViewed') },
  ];
  const sortLabel = sorts.find(s => s.value === state.sort)?.label ?? '';

  const formats: [ListingFormat, string][] = [
    ['all', t('browse.all')],
    ['fixed', t('browse.buyNow')],
    ['auction', t('browse.auctions')],
  ];
  // Refurbished stock is always fixed price, so the store has no format tabs
  // and the Auctions tab no Refurbished choice. Elsewhere: a Refurbished switch
  // next to the format tabs.
  const showFormats = !auctionOnly && !refurbishedOnly;
  const showSwitch = !refurbishedOnly && !auctionOnly;
  const refurbishedMatches = refurbishedCounts?.refurbished ?? 0;
  const tabClass = (active: boolean) =>
    `min-h-11 grow flex-row items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 ${
      // Both branches set a shadow: NativeWind can't add shadow
      // (CSS-variable) styles after the first render.
      active ? 'bg-brand-surface shadow-sm' : 'shadow-none'
    }`;
  const tab = (
    key: string,
    label: string,
    active: boolean,
    onPress: () => void,
    matches?: number,
  ) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={tabClass(active)}
    >
      <Text
        className={`font-sans-bold text-xs ${
          active ? 'text-brand-espresso' : 'text-brand-warmgray'
        }`}
      >
        {label}
      </Text>
      <Text
        className={`font-sans-bold text-xs ${
          active ? 'text-brand-primary' : 'text-brand-warmgray'
        }`}
      >
        {matches ?? ''}
      </Text>
    </Pressable>
  );

  const header = (
    <View className="gap-3 border-b border-brand-border bg-brand-surface px-5 pb-4">
      {searchable && (
        <TextField
          variant="muted"
          value={state.query}
          onChangeText={query => patch({ query })}
          placeholder={t('browse.findNextBid')}
          accessibilityLabel={t('browse.searchAuctions')}
          leading={<Icon name="Search" size={20} color={colors.warmgray} />}
          returnKeyType="search"
        />
      )}

      {(showFormats || showSwitch) && (
        // Scrolls sideways if the tabs don't fit a narrow phone.
        <View className="overflow-hidden rounded-2xl border border-brand-border bg-brand-lightgray">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="grow gap-1 p-1"
          >
            {showFormats && (
              <View
                accessibilityLabel={t('browse.listingFormat')}
                className="grow flex-row gap-1"
              >
                {formats.map(([id, label]) =>
                  tab(
                    id,
                    label,
                    format === id,
                    () => setFormat(id),
                    counts?.[id],
                  ),
                )}
              </View>
            )}
            {showFormats && showSwitch && (
              <View className="my-2 w-px bg-brand-border" />
            )}
            {showSwitch && (
              // A switch: press again to go back to everything.
              <Pressable
                onPress={() => patch({ refurbished: !refurbished })}
                disabled={!refurbished && !refurbishedMatches}
                accessibilityRole="switch"
                accessibilityLabel={`${t(
                  'browse.refurbished',
                )} (${refurbishedMatches})`}
                accessibilityState={{
                  checked: refurbished,
                  disabled: !refurbished && !refurbishedMatches,
                }}
                className={`min-h-11 flex-row items-center justify-center rounded-xl px-3 py-2.5 ${
                  refurbished ? 'bg-brand-espresso shadow-sm' : 'shadow-none'
                } ${!refurbished && !refurbishedMatches ? 'opacity-40' : ''}`}
              >
                <Text
                  className={`font-sans-bold text-xs ${
                    refurbished
                      ? 'text-brand-on-primary'
                      : 'text-brand-warmgray'
                  }`}
                >
                  {t('browse.refurbished')}
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      )}

      {quickTypes && facetTypes.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-5"
          contentContainerClassName="gap-2 px-5"
          accessibilityLabel={t('filters.type')}
        >
          <Chip
            label={t('browse.allTypes')}
            selected={!f.types.length}
            onPress={() => changeFilters({ ...f, types: [] })}
          />
          {facetTypes.map(id => (
            <Chip
              key={id}
              label={typeName(id)}
              selected={f.types.includes(id)}
              onPress={() => toggle('types', id)}
            />
          ))}
        </ScrollView>
      )}

      {showCategories && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-5"
          contentContainerClassName="gap-2 px-5 py-1"
          accessibilityLabel={t('browse.category')}
        >
          <Chip
            label={t('browse.allCategories')}
            selected={!f.category}
            onPress={() => setCategory('')}
          />
          {availableCategories.map(c => (
            <Chip
              key={c.id}
              label={localized(c.name)}
              selected={f.category === c.id}
              onPress={() => setCategory(f.category === c.id ? '' : c.id)}
              leading={
                <View className="h-8 w-8 overflow-hidden rounded-lg bg-brand-surface">
                  <CategoryImage category={c} />
                </View>
              }
            />
          ))}
        </ScrollView>
      )}

      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          className={`min-h-11 flex-row items-center gap-2 rounded-xl border px-3 py-2.5 ${
            count
              ? 'border-brand-primary bg-brand-success-soft'
              : 'border-brand-border'
          }`}
        >
          <Icon name="Filter" size={16} />
          <Text className="font-sans-bold text-xs">{t('browse.filters')}</Text>
          {count > 0 && (
            <View className="h-5 w-5 items-center justify-center rounded-full bg-brand-primary">
              <Text className="font-sans-bold text-xs text-brand-on-primary">
                {count}
              </Text>
            </View>
          )}
        </Pressable>
        <Select
          className="flex-1"
          label={t('browse.sortListings')}
          value={state.sort}
          options={sorts}
          display={t('browse.sortPrefix', { label: sortLabel })}
          onChange={sort => patch({ sort })}
        />
      </View>

      {chips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="items-center gap-2 py-1"
        >
          <Pressable
            onPress={clear}
            accessibilityRole="button"
            className="py-1.5"
          >
            <Text className="font-sans-bold text-xs text-brand-warmgray underline">
              {t('browse.clearAll')}
            </Text>
          </Pressable>
          {chips.map(chip => (
            <Pressable
              key={chip.key}
              onPress={chip.remove}
              accessibilityRole="button"
              accessibilityLabel={t('browse.remove', { label: chip.label })}
              className="flex-row items-center gap-1.5 rounded-full bg-brand-success-soft px-3 py-1.5"
            >
              <Text className="font-sans-bold text-xs">{chip.label}</Text>
              <Icon name="X" size={12} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );

  const auctionsView = format === 'auction';
  const many = total !== 1;

  return (
    <View className="flex-1">
      {header}
      <ProductGrid
        items={items}
        onEndReached={loadMore}
        loadingMore={listings.isFetchingNextPage}
        header={
          <View>
            {intro}
            {quickBrands && facetBrands.length > 0 && (
              <View className="mb-5">
                <Heading className="mb-3 text-sm">
                  {t('browse.shopByBrand')}
                </Heading>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="-mx-5"
                  contentContainerClassName="gap-2 px-5 pb-1"
                  accessibilityLabel={t('filters.brand')}
                >
                  {facetBrands.map(brand => {
                    const active = f.brands.includes(brand);
                    return (
                      <Pressable
                        key={brand}
                        onPress={() => toggle('brands', brand)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        className={`h-14 min-w-24 flex-row items-center justify-center gap-1.5 rounded-2xl border px-4 shadow-sm ${
                          active
                            ? 'border-brand-primary bg-brand-success-soft'
                            : 'border-brand-border bg-brand-surface'
                        }`}
                      >
                        {active && (
                          <Icon name="Check" size={16} color={colors.primary} />
                        )}
                        <Text className="font-heading-black text-sm">
                          {brand}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
            <View className="mb-1 flex-row items-center justify-between gap-2">
              <Text
                accessibilityLiveRegion="polite"
                className="font-sans-bold text-xs text-brand-warmgray"
              >
                {auctionsView
                  ? t(
                      many
                        ? 'browse.liveAuctionsMany'
                        : 'browse.liveAuctionsOne',
                      {
                        count: total,
                      },
                    )
                  : t(many ? 'browse.resultsMany' : 'browse.resultsOne', {
                      count: total,
                    })}
              </Text>
              {auctionsView && (
                <Text className="text-xs text-brand-warmgray">
                  {t('browse.pricesAreBids')}
                </Text>
              )}
            </View>
          </View>
        }
        empty={
          listings.isPending ? (
            <View className="py-12">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : listings.isError ? (
            <StatusView status="error" onRetry={listings.refetch} />
          ) : (
            <View className="items-center gap-3 px-3 py-12">
              <View className="h-16 w-16 items-center justify-center rounded-2xl bg-brand-success-soft">
                <Icon
                  name={auctionsView ? 'Gavel' : 'Search'}
                  size={28}
                  color={colors.primary}
                />
              </View>
              <Heading className="text-center text-lg">
                {auctionsView
                  ? t('browse.noMatchingAuctions')
                  : t('browse.noMatchingItems')}
              </Heading>
              <Text className="text-center text-sm text-brand-warmgray">
                {t('browse.tryAnother')}
              </Text>
              {/* state.refurbished: the store's own scope isn't a filter to clear. */}
              {(count > 0 || state.refurbished) && (
                <Button
                  className="mt-2"
                  label={t('browse.clearFilters')}
                  onPress={() =>
                    patch({ filters: emptyFilters(), refurbished: false })
                  }
                />
              )}
            </View>
          )
        }
      />

      <FilterSheet
        visible={sheetOpen}
        facets={facets}
        countQuery={listingQuery}
        categories={showCategories ? availableCategories : undefined}
        categoryFilters={categoryFilters}
        format={format}
        value={state.filters}
        onClose={() => setSheetOpen(false)}
        onApply={filters => {
          changeFilters(filters);
          setSheetOpen(false);
        }}
      />
    </View>
  );
}
