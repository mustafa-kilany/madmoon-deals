// Certified Refurbished store (prototype RefurbishedScreen): brand-certified
// listings with a warranty, browsable by type, brand and price. Reached from
// the Home banner and the side menu.

import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Icon, type IconName } from '@/components/icons';
import { ListingBrowser } from '@/components/ListingBrowser';
import { StatusView } from '@/components/StatusView';
import { Heading, Screen, Text } from '@/components/ui';
import { colors } from '@/theme/colors';
import { useCatalogMeta, useRefurbishedSummary } from '../hooks/useCatalog';

export function RefurbishedScreen() {
  const { t } = useTranslation();
  const { categories, categoryFilters, isLoading, isError, refetch } =
    useCatalogMeta();
  const { maxWarrantyMonths } = useRefurbishedSummary();

  const promises: [IconName, string][] = [
    [
      'Shield',
      maxWarrantyMonths
        ? t('refurbished.upToWarranty', { months: maxWarrantyMonths })
        : t('card.brandInspected'),
    ],
    ['BadgeCheck', t('refurbished.brandCertified')],
    ['Check', t('refurbished.inspected')],
  ];

  return (
    <Screen
      header={
        <>
          <BackButton />
          <View className="min-w-0 flex-1">
            <Heading className="text-xl leading-tight">
              {t('screens.refurbished')}
            </Heading>
            <Text className="mt-0.5 text-xs text-brand-warmgray">
              {t('refurbished.tagline')}
            </Text>
          </View>
        </>
      }
    >
      {isError ? (
        <StatusView status="error" onRetry={refetch} />
      ) : isLoading || !categoryFilters ? (
        <StatusView status="loading" />
      ) : (
        <ListingBrowser
          scope="refurbished"
          categories={categories}
          categoryFilters={categoryFilters}
          refurbishedOnly
          quickTypes
          quickBrands
          intro={
            <View className="mb-5 flex-row gap-2">
              {promises.map(([icon, label]) => (
                <View
                  key={icon}
                  className="flex-1 items-center gap-2 rounded-2xl border border-brand-border bg-brand-surface p-3"
                >
                  <View className="h-8 w-8 items-center justify-center rounded-full bg-brand-success-soft">
                    <Icon name={icon} size={16} color={colors.primary} />
                  </View>
                  <Text className="text-center font-sans-bold text-xs leading-tight">
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          }
        />
      )}
    </Screen>
  );
}
