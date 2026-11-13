// Full-screen search (prototype SearchScreen): field with clear button;
// recent searches and category shortcuts while empty, live results in a
// ListingBrowser once something is typed.

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { CategoryImage } from '@/components/CategoryImage';
import { Icon } from '@/components/icons';
import { ListingBrowser } from '@/components/ListingBrowser';
import { StatusView } from '@/components/StatusView';
import { Heading, Screen, Text, TextField } from '@/components/ui';
import { useLocalized } from '@/i18n';
import type { RootScreenProps } from '@/navigation/types';
import { colors } from '@/theme/colors';
import { useCatalogMeta } from '../hooks/useCatalog';
import { useHistoryStore } from '../historyStore';

export function SearchScreen({ navigation }: RootScreenProps<'Search'>) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const [query, setQuery] = useState('');
  const recentSearches = useHistoryStore(s => s.recentSearches);
  const addRecentSearch = useHistoryStore(s => s.addRecentSearch);
  const { categories, categoryFilters, isLoading, isError, refetch } =
    useCatalogMeta();

  const trimmed = query.trim();

  const header = (
    <>
      <BackButton />
      <TextField
        className="flex-1"
        variant="muted"
        value={query}
        onChangeText={setQuery}
        onBlur={() => addRecentSearch(query)}
        onSubmitEditing={() => addRecentSearch(query)}
        autoFocus
        returnKeyType="search"
        accessibilityLabel={t('search.label')}
        placeholder={t('home.searchPlaceholder')}
        leading={<Icon name="Search" size={20} color={colors.warmgray} />}
        trailing={
          query ? (
            <Pressable
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel={t('common.clear')}
              hitSlop={8}
              className="p-1"
            >
              <Icon name="X" size={16} color={colors.warmgray} />
            </Pressable>
          ) : undefined
        }
      />
    </>
  );

  return (
    <Screen header={header}>
      {isLoading || !categoryFilters ? (
        isError ? (
          <StatusView status="error" onRetry={refetch} />
        ) : (
          <StatusView status="loading" />
        )
      ) : trimmed ? (
        <ListingBrowser
          scope="search"
          query={trimmed}
          categories={categories}
          categoryFilters={categoryFilters}
          showCategories
        />
      ) : (
        <ScrollView
          contentContainerClassName="gap-6 p-5"
          keyboardShouldPersistTaps="handled"
        >
          {recentSearches.length > 0 && (
            <View>
              <Heading className="mb-3 text-sm">{t('search.recent')}</Heading>
              <View className="flex-row flex-wrap gap-2">
                {recentSearches.map(s => (
                  <Pressable
                    key={s}
                    onPress={() => setQuery(s)}
                    accessibilityRole="button"
                    className="flex-row items-center gap-2 rounded-full border border-brand-border bg-brand-surface px-3 py-2"
                  >
                    <Icon name="Clock" size={14} color={colors.warmgray} />
                    <Text className="font-sans-bold text-sm">{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View>
            <Heading className="mb-3 text-sm">
              {t('search.browseByCategory')}
            </Heading>
            <View className="flex-row flex-wrap gap-3">
              {categories.map(category => (
                <Pressable
                  key={category.id}
                  onPress={() =>
                    navigation.navigate('Category', { categoryId: category.id })
                  }
                  accessibilityRole="button"
                  className="min-w-[45%] flex-1 basis-[45%] flex-row items-center gap-3 rounded-2xl bg-brand-surface p-3 shadow-sm"
                >
                  <View className="h-11 w-11 overflow-hidden rounded-lg border border-brand-border bg-brand-surface">
                    <CategoryImage category={category} />
                  </View>
                  <Text className="font-sans-bold">
                    {localized(category.name)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}
