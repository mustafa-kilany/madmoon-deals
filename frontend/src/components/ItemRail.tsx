// Horizontal row of small listing cards: "Recently Viewed" on Home (lg) and
// "Similar items" on the product page (sm).

import { Image, Pressable, ScrollView, View } from 'react-native';
import { Price } from '@/components/Price';
import { Text } from '@/components/ui';
import { useOpenItem } from '@/features/catalog/hooks/useOpenItem';
import { useLocalized } from '@/i18n';
import type { Item } from '@/lib/types';

const sizes = {
  lg: {
    card: 'w-32',
    body: 'p-2.5',
    title: 'text-xs',
    price: 'text-sm',
    unit: 'text-[10px]',
  },
  sm: {
    card: 'w-28',
    body: 'p-2',
    title: 'text-[11px]',
    price: 'text-xs',
    unit: 'text-[9px]',
  },
};

export function ItemRail({
  items,
  size = 'lg',
}: {
  items: Item[];
  size?: 'lg' | 'sm';
}) {
  const localized = useLocalized();
  const openItem = useOpenItem();
  const s = sizes[size];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-5"
      contentContainerClassName="gap-3 px-5 pb-1"
    >
      {items.map(item => {
        const title = localized(item.title);
        return (
          <Pressable
            key={item.id}
            onPress={() => openItem(item)}
            accessibilityRole="button"
            accessibilityLabel={title}
            className={`${s.card} overflow-hidden rounded-2xl bg-brand-surface shadow-sm active:scale-[0.98]`}
          >
            <View className="aspect-square w-full bg-brand-lightgray">
              <Image
                source={{ uri: item.imageUrl }}
                className="h-full w-full"
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            </View>
            <View className={s.body}>
              <Text className={`font-sans-bold ${s.title}`} numberOfLines={1}>
                {title}
              </Text>
              <Price
                fils={item.priceFils}
                className={`mt-0.5 text-brand-primary ${s.price}`}
                unitClassName={s.unit}
              />
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
