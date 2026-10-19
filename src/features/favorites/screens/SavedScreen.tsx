// Saved items (prototype SavedItems): grid of favourited listings, or an
// empty state that sends the user back to browsing.

import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Icon } from '@/components/icons';
import { ProductGrid } from '@/components/ProductGrid';
import { StatusView } from '@/components/StatusView';
import { Button, Heading, Screen, Text } from '@/components/ui';
import { useItems } from '@/features/catalog/hooks/useCatalog';
import { useNow } from '@/hooks/useNow';
import type { Item } from '@/lib/types';
import type { RootScreenProps } from '@/navigation/types';
import { colors } from '@/theme/colors';
import { useFavoritesStore } from '../store';

export function SavedScreen({ navigation }: RootScreenProps<'Saved'>) {
  const { t } = useTranslation();
  const ids = useFavoritesStore(s => s.ids);
  const { data: items = [], isPending, isError, refetch } = useItems();
  const now = useNow();

  const saved = ids
    .map(id => items.find(i => i.id === id))
    .filter((i): i is Item => !!i);

  return (
    <Screen
      headerBorder
      header={
        <>
          <BackButton />
          <Heading className="flex-1 text-xl">{t('screens.saved')}</Heading>
          {saved.length > 0 && (
            <Text className="font-sans-bold text-sm text-brand-warmgray">
              {saved.length}
            </Text>
          )}
        </>
      }
    >
      {isError ? (
        <StatusView status="error" onRetry={refetch} />
      ) : isPending ? (
        <StatusView status="loading" />
      ) : saved.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-4 p-5">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-secondary/20">
            <Icon name="Heart" size={32} color={colors.primary} />
          </View>
          <View className="items-center">
            <Heading className="text-lg">{t('saved.emptyTitle')}</Heading>
            <Text className="mt-1 text-center font-sans-medium text-sm text-brand-warmgray">
              {t('saved.emptyBody')}
            </Text>
          </View>
          <Button
            className="px-8"
            label={t('saved.startBrowsing')}
            onPress={() => navigation.navigate('Tabs', { screen: 'Home' })}
          />
        </View>
      ) : (
        <ProductGrid items={saved} now={now} gap="gap-4" />
      )}
    </Screen>
  );
}
