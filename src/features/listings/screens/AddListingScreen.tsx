// Add listing screen (Phase 4): multi-field form for listing photos, title,
// description (shown to buyers on the item page), category & item type, condition, brand & model (searchable lists for the
// chosen type), city location, and sale format (fixed price vs. live auction).

import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { CityPicker } from '@/components/CityPicker';
import { Icon } from '@/components/icons';
import { SearchablePicker } from '@/components/SearchablePicker';
import { StatusView } from '@/components/StatusView';
import {
  Button,
  Chip,
  Heading,
  Screen,
  Select,
  Text,
  TextField,
  type SelectOption,
} from '@/components/ui';
import { pickListingPhoto } from '@/features/auth/photoCapture';
import { useUser } from '@/features/auth/sessionStore';
import {
  useCategories,
  useCategoryFilters,
  useCities,
  useCreateListing,
} from '@/features/catalog/hooks/useCatalog';
import { useLocalized } from '@/i18n';
import type { Condition, LocalPhoto, SaleType } from '@/lib/types';
import type { RootScreenProps } from '@/navigation/types';
import { toast } from '@/store/toastStore';
import { colors } from '@/theme/colors';

const conditions: Condition[] = ['new', 'excellent', 'good', 'loved'];
/** Same limit as POST /listings (docs/API.md). */
const DESCRIPTION_MAX = 2000;

export function AddListingScreen({
  navigation,
}: RootScreenProps<'AddListing'>) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const user = useUser();

  const { data: categories, isLoading: isCatLoading } = useCategories();
  const { data: categoryFilters, isLoading: isFiltersLoading } =
    useCategoryFilters();
  const { data: cities, isLoading: isCitiesLoading } = useCities();
  const createListing = useCreateListing();

  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('');
  const [itemType, setItemType] = useState<string>('');
  const [condition, setCondition] = useState<Condition>('excellent');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [cityId, setCityId] = useState<string>('');
  const [saleType, setSaleType] = useState<SaleType>('fixed');
  const [priceJod, setPriceJod] = useState('');
  const [startingBidJod, setStartingBidJod] = useState('');
  const [incrementJod, setIncrementJod] = useState('1');
  const [durationDays, setDurationDays] = useState<'1' | '3' | '7'>('3');

  const isLoading = isCatLoading || isFiltersLoading || isCitiesLoading;

  if (isLoading || !categories || !cities) {
    return <StatusView status="loading" />;
  }

  // Pre-select category & city if empty
  const activeCategory = category || categories[0]?.id || 'mobiles';
  // Defaults to the seller's own area (Profile); the GPS button can change it.
  const activeCity = cityId || user?.cityId || cities[0]?.id || 'amman';

  const categoryOptions: SelectOption<string>[] = categories.map(c => ({
    value: c.id,
    label: localized(c.name),
  }));

  const availableTypes =
    categoryFilters?.[activeCategory as keyof typeof categoryFilters]?.types ??
    [];

  const typeOptions: SelectOption<string>[] = availableTypes.map(tItem => ({
    value: tItem.id,
    label: localized(tItem.name),
  }));

  const activeType =
    itemType && availableTypes.some(tItem => tItem.id === itemType)
      ? itemType
      : availableTypes[0]?.id || 'general';
  const typeInfo = availableTypes.find(tItem => tItem.id === activeType);
  const brandOptions = typeInfo?.brands ?? [];
  const modelOptions = (brand && typeInfo?.models?.[brand]) || [];

  // Brands and models belong to the type, so a new type starts them over.
  const changeType = (update: () => void) => {
    update();
    setBrand('');
    setModel('');
  };

  // Picking a model fills an empty title ("Toyota Camry").
  const chooseModel = (value: string) => {
    setModel(value);
    if (value && !title.trim()) {
      setTitle(value.startsWith(brand) ? value : `${brand} ${value}`);
    }
  };

  const handleAddPhoto = async () => {
    if (photos.length >= 5) return;
    try {
      const photo = await pickListingPhoto();
      if (photo) setPhotos(prev => [...prev, photo]);
    } catch {
      toast.error(t('addListing.error'));
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (photos.length === 0) {
      toast.error(t('addListing.photoRequired'));
      return;
    }
    if (!title.trim()) {
      toast.error(t('validation.nameRequired'));
      return;
    }

    const numericPrice = parseFloat(priceJod || startingBidJod || '0');
    if (isNaN(numericPrice) || numericPrice <= 0) {
      toast.error(t('addListing.error'));
      return;
    }

    const priceFils = Math.round(numericPrice * 1000);
    const durationMs = parseInt(durationDays, 10) * 24 * 60 * 60 * 1000;

    createListing.mutate(
      {
        category: activeCategory as any,
        titleAr: title.trim(),
        titleEn: title.trim(),
        priceFils,
        photos,
        condition,
        description: description.trim() || undefined,
        brand: brand.trim() || undefined,
        model: (brand.trim() && model.trim()) || undefined,
        type: activeType,
        locationId: activeCity,
        saleType,
        auctionEndsAt:
          saleType === 'auction' ? Date.now() + durationMs : undefined,
        incrementFils:
          saleType === 'auction'
            ? Math.round((parseFloat(incrementJod) || 1) * 1000)
            : undefined,
      },
      {
        onSuccess: () => {
          toast.success(t('addListing.success'));
          navigation.goBack();
        },
        onError: () => {
          toast.error(t('addListing.error'));
        },
      },
    );
  };

  return (
    <Screen
      header={
        <>
          <BackButton />
          <Heading className="text-xl">{t('screens.addListing')}</Heading>
        </>
      }
    >
      <ScrollView
        contentContainerClassName="gap-6 p-5 pb-10"
        keyboardShouldPersistTaps="handled"
      >
        {/* Photos section */}
        <View className="gap-2">
          <Text className="font-sans-bold text-sm">
            {t('addListing.photos')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row items-center gap-3">
              {photos.map((photo, i) => (
                <View key={photo.uri + i} className="relative h-20 w-20">
                  <Image
                    source={{ uri: photo.uri }}
                    className="h-full w-full rounded-xl"
                  />
                  <Pressable
                    onPress={() => handleRemovePhoto(i)}
                    accessibilityRole="button"
                    accessibilityLabel={t('addListing.removePhoto', {
                      n: i + 1,
                    })}
                    hitSlop={10}
                    className="absolute -end-1.5 -top-1.5 h-6 w-6 items-center justify-center rounded-full bg-brand-danger shadow-sm"
                  >
                    <Icon name="X" size={12} color={colors.onPrimary} />
                  </Pressable>
                </View>
              ))}
              {photos.length < 5 && (
                <Pressable
                  onPress={handleAddPhoto}
                  accessibilityRole="button"
                  accessibilityLabel={t('addListing.addPhoto')}
                  className="h-20 w-20 items-center justify-center gap-1 rounded-xl border-2 border-dashed border-brand-border bg-brand-surface"
                >
                  <Icon name="Camera" size={20} color={colors.warmgray} />
                  <Text className="font-sans-bold text-[10px] text-brand-warmgray">
                    {t('addListing.addPhoto')}
                  </Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </View>

        {/* Title */}
        <TextField
          label={t('addListing.title')}
          value={title}
          onChangeText={setTitle}
          placeholder={t('addListing.titlePlaceholder')}
        />

        {/* Grows as the seller types, then scrolls inside */}
        <TextField
          label={t('addListing.description')}
          value={description}
          onChangeText={setDescription}
          placeholder={t('addListing.descriptionPlaceholder')}
          hint={t('addListing.descriptionHint')}
          multiline
          maxLength={DESCRIPTION_MAX}
          showCount
          style={styles.multiline}
        />

        {/* Category & Item Type */}
        <View className="gap-2">
          <Text className="font-sans-bold text-sm">
            {t('addListing.category')}
          </Text>
          <Select
            label={t('addListing.category')}
            value={activeCategory}
            options={categoryOptions}
            onChange={value => changeType(() => setCategory(value))}
            size="md"
          />
        </View>

        {typeOptions.length > 0 && (
          <View className="gap-2">
            <Text className="font-sans-bold text-sm">
              {t('addListing.itemType')}
            </Text>
            <Select
              label={t('addListing.itemType')}
              value={activeType}
              options={typeOptions}
              onChange={value => changeType(() => setItemType(value))}
              size="md"
            />
          </View>
        )}

        {/* Condition */}
        <View className="gap-2">
          <Text className="font-sans-bold text-sm">
            {t('addListing.condition')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {conditions.map(c => (
              <Chip
                key={c}
                label={t(`condition.${c}`)}
                selected={condition === c}
                onPress={() => setCondition(c)}
              />
            ))}
          </View>
        </View>

        {/* Brand & model */}
        <View className="gap-2">
          <Text className="font-sans-bold text-sm">
            {t('addListing.brand')}
          </Text>
          <SearchablePicker
            label={t('addListing.brand')}
            value={brand}
            options={brandOptions}
            onChange={value => {
              setBrand(value);
              setModel('');
            }}
            placeholder={t('addListing.brandPlaceholder')}
          />
        </View>

        {brand !== '' && (
          <View className="gap-2">
            <Text className="font-sans-bold text-sm">
              {t('addListing.model')}
            </Text>
            <SearchablePicker
              label={t('addListing.model')}
              value={model}
              options={modelOptions}
              onChange={chooseModel}
              placeholder={t(
                modelOptions.length
                  ? 'addListing.modelPlaceholder'
                  : 'addListing.modelTypeIt',
              )}
            />
          </View>
        )}

        {/* City Location */}
        <View className="gap-2">
          <Text className="font-sans-bold text-sm">
            {t('addListing.location')}
          </Text>
          <CityPicker
            label={t('addListing.location')}
            value={activeCity}
            onChange={setCityId}
          />
        </View>

        {/* Sale Format */}
        <View className="gap-2">
          <Text className="font-sans-bold text-sm">
            {t('addListing.saleType')}
          </Text>
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => setSaleType('fixed')}
              accessibilityRole="radio"
              accessibilityState={{ checked: saleType === 'fixed' }}
              className={`flex-1 items-center rounded-xl border p-3 ${
                saleType === 'fixed'
                  ? 'border-brand-primary bg-brand-success-soft'
                  : 'border-brand-border bg-brand-surface'
              }`}
            >
              <Text className="font-sans-bold text-xs">
                {t('addListing.fixedPrice')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSaleType('auction')}
              accessibilityRole="radio"
              accessibilityState={{ checked: saleType === 'auction' }}
              className={`flex-1 items-center rounded-xl border p-3 ${
                saleType === 'auction'
                  ? 'border-brand-primary bg-brand-success-soft'
                  : 'border-brand-border bg-brand-surface'
              }`}
            >
              <Text className="font-sans-bold text-xs">
                {t('addListing.auction')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Pricing & Auction specifics */}
        {saleType === 'fixed' ? (
          <TextField
            label={t('addListing.priceJod')}
            value={priceJod}
            onChangeText={setPriceJod}
            keyboardType="decimal-pad"
            placeholder="0.00"
            ltr
          />
        ) : (
          <View className="gap-4">
            <TextField
              label={t('addListing.startingBidJod')}
              value={startingBidJod}
              onChangeText={setStartingBidJod}
              keyboardType="decimal-pad"
              placeholder="0.00"
              ltr
            />
            <TextField
              label={t('addListing.minIncrementJod')}
              value={incrementJod}
              onChangeText={setIncrementJod}
              keyboardType="decimal-pad"
              placeholder="1.00"
              ltr
            />
            <View className="gap-2">
              <Text className="font-sans-bold text-sm">
                {t('addListing.auctionDuration')}
              </Text>
              <View className="flex-row gap-2">
                <Chip
                  label={t('addListing.duration1d')}
                  selected={durationDays === '1'}
                  onPress={() => setDurationDays('1')}
                />
                <Chip
                  label={t('addListing.duration3d')}
                  selected={durationDays === '3'}
                  onPress={() => setDurationDays('3')}
                />
                <Chip
                  label={t('addListing.duration7d')}
                  selected={durationDays === '7'}
                  onPress={() => setDurationDays('7')}
                />
              </View>
            </View>
          </View>
        )}

        {/* Submit button */}
        <Button
          label={t('addListing.submit')}
          onPress={handleSubmit}
          loading={createListing.isPending}
          size="lg"
          className="mt-4"
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 140, maxHeight: 320, textAlignVertical: 'top' },
});
