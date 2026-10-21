// 2-column grid of ProductCards on FlashList, which recycles card views as
// you scroll instead of creating new ones (smooth on long result lists).
// Spacing is padding on each cell: FlashList has no column gap. Lazy loading:
// `onEndReached` fires near the bottom, `loadingMore` shows a footer spinner.

import type { ReactElement } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ProductCard } from '@/components/ProductCard';
import type { Item } from '@/lib/types';
import { colors } from '@/theme/colors';

/** p-5 around the grid (prototype value). */
const EDGE = 20;
/** gap-3 in browsers, gap-4 on Saved (prototype values). */
const GAP = { 'gap-3': 12, 'gap-4': 16 };

type ProductGridProps = {
  items: Item[];
  gap?: keyof typeof GAP;
  header?: ReactElement;
  empty?: ReactElement;
  /** Load the next page; called when the list is about half a screen from its end. */
  onEndReached?: () => void;
  loadingMore?: boolean;
};

export function ProductGrid({
  items,
  gap = 'gap-3',
  header,
  empty,
  onEndReached,
  loadingMore = false,
}: ProductGridProps) {
  const space = GAP[gap];
  return (
    <FlashList
      data={items}
      keyExtractor={item => item.id}
      numColumns={2}
      // Auction cards are taller (Bid now button): recycle like with like.
      getItemType={item => item.saleType}
      renderItem={({ item, index }) => (
        <View
          style={{
            flex: 1,
            paddingBottom: space,
            paddingStart: index % 2 ? space / 2 : 0,
            paddingEnd: index % 2 ? 0 : space / 2,
          }}
        >
          <ProductCard item={item} />
        </View>
      )}
      contentContainerStyle={{
        paddingHorizontal: EDGE,
        paddingTop: EDGE,
        paddingBottom: EDGE - space,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        header ? <View style={{ marginBottom: space }}>{header}</View> : null
      }
      ListEmptyComponent={empty}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        loadingMore ? (
          <View className="py-4">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null
      }
    />
  );
}
