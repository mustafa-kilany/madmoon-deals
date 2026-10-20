// 2-column grid of ProductCards. Pads an odd last row with an empty cell so
// a lone card keeps half width, as in the prototype's CSS grid. Lazy loading:
// `onEndReached` fires near the bottom, `loadingMore` shows a footer spinner.

import type { ReactElement } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { ProductCard } from '@/components/ProductCard';
import type { Item } from '@/lib/types';
import { colors } from '@/theme/colors';

const SPACER = 'spacer';

type ProductGridProps = {
  items: Item[];
  now: number;
  /** gap-3 in browsers, gap-4 on Saved (prototype values). */
  gap?: 'gap-3' | 'gap-4';
  header?: ReactElement;
  empty?: ReactElement;
  /** Load the next page; called when the list is about half a screen from its end. */
  onEndReached?: () => void;
  loadingMore?: boolean;
};

export function ProductGrid({
  items,
  now,
  gap = 'gap-3',
  header,
  empty,
  onEndReached,
  loadingMore = false,
}: ProductGridProps) {
  const data: (Item | typeof SPACER)[] =
    items.length % 2 ? [...items, SPACER] : items;
  return (
    <FlatList
      data={data}
      keyExtractor={entry => (entry === SPACER ? SPACER : entry.id)}
      numColumns={2}
      renderItem={({ item }) =>
        item === SPACER ? (
          <View className="flex-1" />
        ) : (
          <ProductCard item={item} now={now} />
        )
      }
      columnWrapperClassName={gap}
      contentContainerClassName={`${gap} p-5`}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        loadingMore ? (
          <View className="py-4">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : undefined
      }
      // Cards are images: keep the render window small on long lists.
      initialNumToRender={8}
      windowSize={7}
      removeClippedSubviews
    />
  );
}
