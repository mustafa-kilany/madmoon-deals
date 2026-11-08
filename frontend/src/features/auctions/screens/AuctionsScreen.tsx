// Auctions tab (prototype AuctionsScreen): back button, title with a
// Live badge, saved shortcut, and an auction-only ListingBrowser with its own
// search box.

import { useNavigation } from '@react-navigation/native';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Icon } from '@/components/icons';
import { ListingBrowser } from '@/components/ListingBrowser';
import { StatusView } from '@/components/StatusView';
import { Badge, Heading, Screen, Text } from '@/components/ui';
import { useCatalogMeta } from '@/features/catalog/hooks/useCatalog';
import { useFavoritesStore } from '@/features/favorites/store';
import { WonAuctions } from '../WonAuctions';

export function AuctionsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const hasSaved = useFavoritesStore(s => s.ids.length > 0);
  const { categories, categoryFilters, isLoading, isError, refetch } =
    useCatalogMeta();

  return (
    <Screen
      header={
        <>
          <BackButton />
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Heading className="text-2xl">{t('screens.auctions')}</Heading>
              <Badge label={t('auctions.live')} tone="success" dot />
            </View>
            <Text className="mt-1 text-sm text-brand-warmgray">
              {t('auctions.tagline')}
            </Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('Saved')}
            accessibilityRole="button"
            accessibilityLabel={t('auctions.savedItems')}
            className="rounded-xl bg-brand-lightgray p-3"
          >
            <Icon name="Heart" size={20} filled={hasSaved} />
          </Pressable>
        </>
      }
    >
      {isError ? (
        <StatusView status="error" onRetry={refetch} />
      ) : isLoading || !categoryFilters ? (
        <StatusView status="loading" />
      ) : (
        <>
        <WonAuctions />
        <ListingBrowser
          scope="auctions"
          categories={categories}
          categoryFilters={categoryFilters}
          auctionOnly
          searchable
          showCategories
        />
        </>
      )}
    </Screen>
  );
}
