// Category tile photo (bundled), falling back to the category's line icon if
// the image can't be shown (prototype CategoryIcon). Fills its container.

import { useState } from 'react';
import { Image, View } from 'react-native';
import { Icon } from '@/components/icons';
import type { Category } from '@/lib/types';

export function CategoryImage({ category }: { category: Category }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <View className="h-full w-full items-center justify-center">
        <Icon name={category.icon} size={28} />
      </View>
    );
  return (
    <Image
      source={category.image}
      onError={() => setFailed(true)}
      resizeMode="cover"
      className="h-full w-full"
      accessibilityIgnoresInvertColors
    />
  );
}
