// Edit a listing (BACKEND_PLAN B15.2): title, description, photos, price,
// condition and the pickup for the courier, while it is on sale. An auction
// that has bids keeps what people bid on: only the pickup can change. Withdraw
// takes it off sale for good. The category, type, brand and model can't change
// (a test certificate is for one device): withdraw and list it again instead.

import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Icon } from '@/components/icons';
import { StatusView } from '@/components/StatusView';
import {
  Button,
  Chip,
  Heading,
  Screen,
  Text,
  TextField,
} from '@/components/ui';
import { pickListingPhoto } from '@/features/auth/photoCapture';
import {
  useItem,
  useUpdateListing,
  useWithdrawListing,
} from '@/features/catalog/hooks/useCatalog';
import { useLocalized } from '@/i18n';
import {
  ADDRESS_MAX,
  ADDRESS_MIN,
  NOTES_MAX,
  normalizeJordanMobile,
} from '@/lib/delivery';
import {
  countWords,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN_WORDS,
  descriptionValid,
} from '@/lib/listing';
import type { Condition, Item, LocalPhoto } from '@/lib/types';
import type { RootScreenProps } from '@/navigation/types';
import type { ListingPatch } from '@/services/catalog/types';
import { errorMessageKey } from '@/services/api/errors';
import { toast } from '@/store/toastStore';
import { colors } from '@/theme/colors';

const CONDITIONS: Condition[] = ['new', 'excellent', 'good', 'loved'];
const MAX_PHOTOS = 5;
type Photo = string | LocalPhoto;
const uriOf = (p: Photo) => (typeof p === 'string' ? p : p.uri);
const jod = (fils: number) => String(fils / 1000);

export function EditListingScreen({
  route,
  navigation,
}: RootScreenProps<'EditListing'>) {
  const { t } = useTranslation();
  const {
    data: item,
    isLoading,
    isError,
    refetch,
  } = useItem(route.params.itemId);

  const header = (
    <>
      <BackButton />
      <Heading className="text-xl">{t('editListing.title')}</Heading>
    </>
  );
  if (isLoading)
    return (
      <Screen header={header}>
        <StatusView status="loading" />
      </Screen>
    );
  if (isError || !item)
    return (
      <Screen header={header}>
        <StatusView status="error" onRetry={refetch} />
      </Screen>
    );
  return (
    <Screen tone="white" headerBorder header={header}>
      <EditForm
        item={item}
        onDone={() => navigation.goBack()}
        // Withdrawn: its own page (underneath) is gone too.
        onWithdrawn={() => navigation.pop(2)}
      />
    </Screen>
  );
}

function EditForm({
  item,
  onDone,
  onWithdrawn,
}: {
  item: Item;
  onDone: () => void;
  onWithdrawn: () => void;
}) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const update = useUpdateListing();
  const withdraw = useWithdrawListing();
  const locked = (item.auction?.bidCount ?? 0) > 0;

  const [photos, setPhotos] = useState<Photo[]>(
    item.imageUrls?.length ? item.imageUrls : [item.imageUrl],
  );
  const [title, setTitle] = useState(localized(item.title));
  const [description, setDescription] = useState(item.description);
  const [priceJod, setPriceJod] = useState(jod(item.priceFils));
  const [condition, setCondition] = useState(item.condition);
  // The pickup is never in listing responses: blank = keep the current one.
  const [pickupPhone, setPickupPhone] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupNotes, setPickupNotes] = useState('');

  const words = countWords(description);
  const changingPickup = !!(pickupPhone.trim() || pickupAddress.trim());
  const pickupOk =
    !changingPickup ||
    (!!normalizeJordanMobile(pickupPhone) &&
      pickupAddress.trim().length >= ADDRESS_MIN);
  const price = Math.round(parseFloat(priceJod) * 1000);

  const addPhoto = async () => {
    try {
      const photo = await pickListingPhoto();
      if (photo) setPhotos(prev => [...prev, photo].slice(0, MAX_PHOTOS));
    } catch {
      toast.error(t('addListing.error'));
    }
  };

  const save = () => {
    const patch: ListingPatch & { photos?: Photo[] } = {};
    if (!locked) {
      if (!photos.length) return toast.error(t('addListing.photoRequired'));
      if (title.trim().length < 2)
        return toast.error(t('validation.nameRequired'));
      if (!descriptionValid(description))
        return toast.error(
          t('addListing.descriptionTooShort', { min: DESCRIPTION_MIN_WORDS }),
        );
      if (!(price > 0)) return toast.error(t('addListing.error'));
      const original = item.imageUrls?.length
        ? item.imageUrls
        : [item.imageUrl];
      if (photos.map(uriOf).join() !== original.join()) patch.photos = photos;
      if (title.trim() !== localized(item.title))
        Object.assign(patch, { titleAr: title.trim(), titleEn: title.trim() });
      if (description.trim() !== item.description)
        patch.description = description.trim();
      if (price !== item.priceFils) patch.priceFils = price;
      if (condition !== item.condition) patch.condition = condition;
    }
    if (!pickupOk) return toast.error(t('addListing.pickupMissing'));
    if (changingPickup)
      patch.pickup = {
        phone: pickupPhone.trim(),
        address: pickupAddress.trim(),
        notes: pickupNotes.trim() || undefined,
      };
    if (!Object.keys(patch).length) return onDone();
    update.mutate(
      { id: item.id, ...patch },
      {
        onSuccess: () => {
          toast.success(t('editListing.saved'));
          onDone();
        },
        onError: error => toast.error(t(errorMessageKey(error))),
      },
    );
  };

  const confirmWithdraw = () =>
    Alert.alert(t('editListing.withdrawTitle'), t('editListing.withdrawBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('editListing.withdraw'),
        style: 'destructive',
        onPress: () =>
          withdraw.mutate(item.id, {
            onSuccess: () => {
              toast.success(t('editListing.withdrawn'));
              onWithdrawn();
            },
            onError: error => toast.error(t(errorMessageKey(error))),
          }),
      },
    ]);

  return (
    <ScrollView
      contentContainerClassName="gap-5 p-5"
      keyboardShouldPersistTaps="handled"
    >
      {locked ? (
        <Text className="rounded-xl bg-brand-warning-soft p-3 text-sm text-brand-warning-text">
          {t('editListing.lockedByBids')}
        </Text>
      ) : (
        <>
          <View className="gap-2">
            <Text className="font-sans-bold text-sm">
              {t('addListing.photos')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row items-center gap-3">
                {photos.map((photo, i) => (
                  <View key={uriOf(photo) + i} className="relative h-20 w-20">
                    <Image
                      source={{ uri: uriOf(photo) }}
                      className="h-full w-full rounded-xl"
                    />
                    <Pressable
                      onPress={() =>
                        setPhotos(prev => prev.filter((_, j) => j !== i))
                      }
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
                {photos.length < MAX_PHOTOS && (
                  <Pressable
                    onPress={addPhoto}
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

          <TextField
            label={t('addListing.title')}
            value={title}
            onChangeText={setTitle}
            testID="edit-title"
          />
          <TextField
            label={t('addListing.description')}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={DESCRIPTION_MAX}
            testID="edit-description"
            hint={
              words < DESCRIPTION_MIN_WORDS
                ? t('addListing.descriptionWords', {
                    n: words,
                    min: DESCRIPTION_MIN_WORDS,
                  })
                : undefined
            }
          />
          <TextField
            label={t(
              item.saleType === 'auction'
                ? 'addListing.startingBidJod'
                : 'addListing.priceJod',
            )}
            value={priceJod}
            onChangeText={setPriceJod}
            keyboardType="decimal-pad"
            testID="edit-price"
            ltr
          />
          <View className="gap-2">
            <Text className="font-sans-bold text-sm">
              {t('addListing.condition')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {CONDITIONS.map(c => (
                <Chip
                  key={c}
                  label={t(`condition.${c}`)}
                  selected={condition === c}
                  onPress={() => setCondition(c)}
                />
              ))}
            </View>
          </View>
        </>
      )}

      <View className="gap-3">
        <Text className="font-sans-bold text-sm">
          {t('addListing.pickupTitle')}
        </Text>
        <Text className="text-xs text-brand-warmgray">
          {t('editListing.pickupKeep')}
        </Text>
        <TextField
          label={t('addListing.pickupPhone')}
          value={pickupPhone}
          onChangeText={setPickupPhone}
          keyboardType="phone-pad"
          ltr
          error={
            changingPickup && !normalizeJordanMobile(pickupPhone)
              ? t('addListing.pickupPhoneError')
              : undefined
          }
        />
        <TextField
          label={t('addListing.pickupAddress')}
          value={pickupAddress}
          onChangeText={setPickupAddress}
          maxLength={ADDRESS_MAX}
          error={
            changingPickup && pickupAddress.trim().length < ADDRESS_MIN
              ? t('addListing.pickupAddressError')
              : undefined
          }
        />
        <TextField
          label={t('addListing.pickupNotes')}
          value={pickupNotes}
          onChangeText={setPickupNotes}
          maxLength={NOTES_MAX}
        />
      </View>

      <Button
        size="lg"
        icon="Check"
        testID="edit-save"
        label={t('editListing.save')}
        loading={update.isPending}
        onPress={save}
      />
      {!locked && (
        <Button
          variant="secondary"
          icon="X"
          testID="edit-withdraw"
          label={t('editListing.withdraw')}
          loading={withdraw.isPending}
          onPress={confirmWithdraw}
        />
      )}
    </ScrollView>
  );
}
