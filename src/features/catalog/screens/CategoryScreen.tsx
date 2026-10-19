// One category's listings, with the shared formats, filters and sorting
// (prototype CategoryScreen).

import { View } from 'react-native';
import { BackButton } from '@/components/BackButton';
import { CategoryImage } from '@/components/CategoryImage';
import { ListingBrowser } from '@/components/ListingBrowser';
import { StatusView } from '@/components/StatusView';
import { Heading, Screen } from '@/components/ui';
import { useLocalized } from '@/i18n';
import type { RootScreenProps } from '@/navigation/types';
import { useCatalog } from '../hooks/useCatalog';

export function CategoryScreen({ route }: RootScreenProps<'Category'>) {
  const { categoryId } = route.params;
  const localized = useLocalized();
  const { items, categories, categoryFilters, isLoading, isError, refetch } =
    useCatalog();
  const category = categories.find(c => c.id === categoryId);

  return (
    <Screen
      header={
        <>
          <BackButton />
          {category && (
            <>
              <View className="h-9 w-9 overflow-hidden rounded-lg border border-brand-border bg-brand-surface">
                <CategoryImage category={category} />
              </View>
              <Heading className="text-xl">{localized(category.name)}</Heading>
            </>
          )}
        </>
      }
    >
      {isError ? (
        <StatusView status="error" onRetry={refetch} />
      ) : isLoading || !category || !categoryFilters ? (
        <StatusView status="loading" />
      ) : (
        <ListingBrowser
          scope={`category:${categoryId}`}
          items={items.filter(i => i.category === categoryId)}
          categories={categories}
          categoryFilters={categoryFilters}
        />
      )}
    </Screen>
  );
}
