// Home tab (prototype HomeDashboard): header with menu, greeting, saved and
// language switch; search shortcut, category grid, recently viewed rail, and
// the featured live auction.

import { useNavigation } from '@react-navigation/native';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CategoryImage } from '@/components/CategoryImage';
import { Icon } from '@/components/icons';
import { SahlaMark } from '@/components/SahlaLogo';
import { ItemRail } from '@/components/ItemRail';
import { Price } from '@/components/Price';
import { StatusView } from '@/components/StatusView';
import { Heading, Screen, Text } from '@/components/ui';
import { TimeLeft } from '@/components/TimeLeft';
import { useFavoritesStore } from '@/features/favorites/store';
import { changeLanguage, useLang, useLocalized } from '@/i18n';
import { emptyFilters } from '@/lib/browsing';
import type { Item } from '@/lib/types';
import { useUiStore } from '@/store/uiStore';
import { useUser } from '@/features/auth/sessionStore';
import { colors } from '@/theme/colors';
import { iconSize } from '@/theme/spacing';
import {
  useCatalogMeta,
  useItemsByIds,
  useListings,
} from '../hooks/useCatalog';
import { useOpenItem } from '../hooks/useOpenItem';
import { useHistoryStore } from '../historyStore';

/** First page of live auctions, soonest ending first; Home shows the top one. */
const FEATURED_QUERY = {
  format: 'auction',
  sort: 'ending_soon',
  filters: emptyFilters(),
} as const;

export function HomeScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const lang = useLang();
  const localized = useLocalized();
  const openSidebar = useUiStore(s => s.openSidebar);
  const user = useUser();
  const savedCount = useFavoritesStore(s => s.ids.length);
  const recentIds = useHistoryStore(s => s.recentItemIds);
  const { categories, isLoading, isError, refetch } = useCatalogMeta();
  // Small, targeted requests: the viewed items, and the soonest-ending auction.
  const { items: recentItems } = useItemsByIds(recentIds);
  const { items: liveAuctions } = useListings(FEATURED_QUERY);

  const featured = liveAuctions[0];

  const header = (
    <>
      <View className="flex-1 flex-row items-center gap-2">
        <Pressable
          onPress={openSidebar}
          accessibilityRole="button"
          accessibilityLabel={t('home.openMenu')}
          className="-ms-2 rounded-xl p-2 active:bg-brand-lightgray"
        >
          <Icon name="Menu" size={iconSize.nav} />
        </Pressable>
        <SahlaMark size={36} />
        <Heading className="flex-1 text-xl" numberOfLines={1}>
          {user
            ? t('home.welcomeUser', { name: user.name })
            : t('home.welcome')}
        </Heading>
      </View>
      <View className="flex-row items-center gap-1">
        <Pressable
          onPress={() => navigation.navigate('Saved')}
          accessibilityRole="button"
          accessibilityLabel={t('home.saved')}
          className="rounded-xl p-2 active:bg-brand-lightgray"
        >
          <Icon name="Heart" size={iconSize.nav} />
          {savedCount > 0 && (
            <View className="absolute -end-0.5 -top-0.5 h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-brand-surface bg-brand-primary px-1">
              <Text className="font-heading-black text-[10px] leading-3 text-brand-on-primary">
                {savedCount}
              </Text>
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={() => changeLanguage(lang === 'ar' ? 'en' : 'ar')}
          accessibilityRole="button"
          accessibilityLabel={t('language.toggleLabel')}
          className="min-h-11 justify-center rounded-xl bg-brand-lightgray px-3"
        >
          <Text className="font-sans-bold text-sm">{t('language.toggle')}</Text>
        </Pressable>
      </View>
    </>
  );

  return (
    <Screen header={header}>
      {isLoading ? (
        <StatusView status="loading" />
      ) : isError ? (
        <StatusView status="error" onRetry={refetch} />
      ) : (
        <ScrollView
          contentContainerClassName="gap-8 px-5 pb-8 pt-4"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={() => navigation.navigate('Search')}
            accessibilityRole="search"
            className="flex-row items-center gap-3 rounded-full border border-brand-border bg-brand-surface px-4 py-4 shadow-sm"
          >
            <Icon name="Search" size={20} color={colors.warmgray} />
            <Text className="font-sans-bold text-brand-warmgray">
              {t('home.searchPlaceholder')}
            </Text>
          </Pressable>

          <View className="-mx-1.5 flex-row flex-wrap gap-y-4">
            {categories.map(category => (
              <Pressable
                key={category.id}
                onPress={() =>
                  navigation.navigate('Category', { categoryId: category.id })
                }
                accessibilityRole="button"
                className="w-1/4 items-center gap-2 px-1.5 active:scale-95"
              >
                <View className="aspect-square w-full overflow-hidden rounded-2xl border border-brand-border bg-brand-surface shadow-sm">
                  <CategoryImage category={category} />
                </View>
                {/* Two lines: names like "Mobiles & Tablets" wrap instead of truncating. */}
                <Text
                  className="text-center font-sans-bold text-xs leading-tight"
                  numberOfLines={2}
                >
                  {localized(category.name)}
                </Text>
              </Pressable>
            ))}
          </View>

          {recentItems.length > 0 && (
            <View>
              <Heading className="mb-4 text-xl">
                {t('home.recentlyViewed')}
              </Heading>
              <ItemRail items={recentItems} />
            </View>
          )}

          {featured?.auction && <FeaturedAuction item={featured} />}
        </ScrollView>
      )}
    </Screen>
  );
}

function FeaturedAuction({ item }: { item: Item }) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const localized = useLocalized();
  const openItem = useOpenItem();
  const title = localized(item.title);

  return (
    <View>
      <View className="mb-4 flex-row items-center justify-between gap-3">
        <Heading className="text-xl">{t('home.liveAuctions')}</Heading>
        <Pressable
          onPress={() => navigation.navigate('Tabs', { screen: 'Auctions' })}
          accessibilityRole="button"
          className="py-2"
        >
          <Text className="font-sans-bold text-sm text-brand-primary">
            {t('home.seeAll')}
          </Text>
        </Pressable>
      </View>

      <View className="overflow-hidden rounded-2xl bg-brand-espresso shadow-lg">
        <View className="aspect-[16/10] w-full">
          <Image
            source={{ uri: item.imageUrl }}
            className="h-full w-full opacity-80"
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
          <View className="absolute start-3 top-3 rounded-full bg-brand-primary px-3 py-1 shadow-md">
            <Text className="font-sans-bold text-xs text-brand-on-primary">
              {t('home.hotBid')}
            </Text>
          </View>
          <View className="absolute bottom-3 start-3 flex-row items-center gap-2 rounded-xl border border-brand-surface/10 bg-brand-espresso/80 px-3 py-1.5">
            <Icon name="Clock" size={16} color={colors.onPrimary} />
            <TimeLeft
              endsAt={item.auction!.endsAt}
              suffix={false}
              className="font-sans-bold text-sm text-brand-on-primary"
            />
          </View>
          <View className="absolute bottom-3 end-3 items-end rounded-xl bg-brand-surface px-3 py-1 shadow-md">
            <Text className="font-sans-bold text-[10px] leading-tight text-brand-warmgray">
              {t('card.currentBid')}
            </Text>
            <Price
              fils={item.priceFils}
              className="text-lg leading-tight"
              unitClassName="text-lg"
            />
          </View>
        </View>
        <View className="bg-brand-espresso p-4">
          <Heading className="text-lg text-brand-on-primary" numberOfLines={1}>
            {title}
          </Heading>
          <Pressable
            onPress={() => openItem(item)}
            accessibilityRole="button"
            accessibilityLabel={`${t('card.bidNow')}: ${title}`}
            className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-brand-primary py-3 active:scale-[0.98]"
          >
            <Icon name="Gavel" size={20} color={colors.onPrimary} />
            <Text className="font-sans-bold text-base text-brand-on-primary">
              {t('card.bidNow')}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
