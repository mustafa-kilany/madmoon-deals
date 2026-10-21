// Profile & Settings tab (prototype Profile): avatar, verification status,
// city, payment card, own listings, log out. Guests see a sign-in prompt.

import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { CityPicker } from '@/components/CityPicker';
import { Icon, type IconName } from '@/components/icons';
import { Price } from '@/components/Price';
import { Button, Heading, Ltr, Screen, Text, TextField } from '@/components/ui';
import { go, startAuth } from '@/features/auth/authFlow';
import { pickAvatarPhoto } from '@/features/auth/photoCapture';
import { useMyListings } from '@/features/catalog/hooks/useCatalog';
import { useOpenItem } from '@/features/catalog/hooks/useOpenItem';
import { useLocalized } from '@/i18n';
import type { User } from '@/lib/types';
import { errorMessageKey } from '@/services/api/errors';
import { toast } from '@/store/toastStore';
import { colors } from '@/theme/colors';
import {
  useChangeAvatar,
  useLogOut,
  useRemovePaymentCard,
  useSavePaymentCard,
  useUpdateProfile,
} from '../hooks/useAccount';
import { useUser } from '../sessionStore';

const toHome = () => go({ name: 'Tabs', params: { screen: 'Home' } });

export function ProfileScreen() {
  const { t } = useTranslation();
  const user = useUser();

  if (!user)
    return (
      <Screen
        tone="white"
        headerBorder
        header={
          <>
            <BackButton onPress={toHome} />
            <Heading className="text-xl">{t('screens.myProfile')}</Heading>
          </>
        }
      >
        <View className="flex-1 items-center justify-center gap-4 p-6">
          <Icon name="Profile" size={56} color={`${colors.warmgray}80`} />
          <Text className="text-center font-sans-bold">
            {t('profile.signInPrompt')}
          </Text>
          <Button
            className="px-8"
            size="sm"
            label={t('profile.signIn')}
            onPress={() =>
              startAuth({ name: 'Tabs', params: { screen: 'Profile' } })
            }
          />
        </View>
      </Screen>
    );

  return <SignedInProfile user={user} />;
}

function SignedInProfile({ user }: { user: User }) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const { data: listings = [] } = useMyListings();
  const openItem = useOpenItem();
  const changeAvatar = useChangeAvatar();
  const updateProfile = useUpdateProfile();
  const saveCard = useSavePaymentCard();
  const removeCard = useRemovePaymentCard();
  const logOut = useLogOut();
  const [cardNumber, setCardNumber] = useState('');

  const onError = (error: unknown) => toast.info(t(errorMessageKey(error)));
  const changePhoto = async () => {
    try {
      const photo = await pickAvatarPhoto();
      if (photo) changeAvatar.mutate(photo, { onError });
    } catch {
      toast.info(t('profile.photoError'));
    }
  };
  const cardDigits = cardNumber.replace(/\D/g, '');

  return (
    <Screen
      headerBorder
      header={
        <>
          <BackButton onPress={toHome} />
          <Heading className="text-xl">{t('screens.profile')}</Heading>
        </>
      }
    >
      <ScrollView
        contentContainerClassName="gap-6 p-5"
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center gap-3">
          <View>
            <View className="h-24 w-24 overflow-hidden rounded-full border-4 border-brand-surface bg-brand-muted shadow-md">
              <Image
                source={{ uri: user.avatarUrl }}
                className="h-full w-full"
              />
            </View>
            <Pressable
              onPress={changePhoto}
              disabled={changeAvatar.isPending}
              accessibilityRole="button"
              accessibilityLabel={t('profile.changePhoto')}
              className="absolute -bottom-1 -end-1 rounded-full border-2 border-brand-surface bg-brand-primary p-2 shadow-md"
            >
              <Icon name="Camera" size={16} color={colors.onPrimary} />
            </Pressable>
          </View>
          <Heading className="text-2xl">{user.name}</Heading>
        </View>

        {user.verified ? (
          <View className="flex-row items-center gap-3 rounded-2xl border-2 border-brand-success bg-brand-success-soft p-4">
            <Icon name="BadgeCheck" size={28} color={colors.success} />
            <View className="flex-1">
              <Text className="font-sans-bold text-base">
                {t('profile.verifiedTitle')}
              </Text>
              <Text className="font-sans-bold text-xs text-brand-warmgray">
                {t('profile.verifiedBody')}
              </Text>
            </View>
          </View>
        ) : (
          <View className="gap-3 rounded-2xl border-2 border-brand-secondary bg-brand-secondary/15 p-4">
            <View className="flex-row items-center gap-3">
              <Icon name="IdCard" size={28} color={colors.primary} />
              <View className="flex-1">
                <Text className="font-sans-bold text-base">
                  {t('profile.becomeVerified')}
                </Text>
                <Text className="font-sans-bold text-xs text-brand-warmgray">
                  {t('profile.becomeVerifiedBody')}
                </Text>
              </View>
            </View>
            <Button
              size="sm"
              label={t('profile.addIdVerify')}
              onPress={() => go({ name: 'IdVerification' })}
            />
          </View>
        )}

        <View>
          <SectionLabel icon="MapPin" label={t('profile.city')} />
          <CityPicker
            label={t('profile.city')}
            value={user.cityId}
            onChange={cityId => updateProfile.mutate({ cityId }, { onError })}
          />
        </View>

        <View>
          <SectionLabel icon="CreditCard" label={t('profile.paymentCard')} />
          {user.card ? (
            <View className="flex-row items-center justify-between rounded-2xl bg-brand-espresso p-4 shadow-sm">
              <Ltr className="font-sans-bold text-base tracking-widest text-brand-on-primary">
                {`•••• •••• •••• ${user.card.last4}`}
              </Ltr>
              <Pressable
                onPress={() => removeCard.mutate(undefined, { onError })}
                disabled={removeCard.isPending}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text className="font-sans-bold text-xs text-brand-secondary">
                  {t('profile.remove')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="flex-row gap-2">
              {/* Phase 6: the payment provider's card field replaces this input. */}
              <TextField
                className="flex-1"
                value={cardNumber}
                onChangeText={setCardNumber}
                placeholder={t('profile.cardNumber')}
                accessibilityLabel={t('profile.cardNumber')}
                keyboardType="number-pad"
                autoComplete="cc-number"
                ltr
                error={
                  cardNumber && cardDigits.length < 12
                    ? t('validation.cardInvalid')
                    : undefined
                }
              />
              <Button
                className="self-start px-5"
                size="sm"
                label={t('profile.save')}
                disabled={cardDigits.length < 12}
                loading={saveCard.isPending}
                onPress={() =>
                  saveCard.mutate(cardNumber, {
                    onSuccess: () => setCardNumber(''),
                    onError,
                  })
                }
              />
            </View>
          )}
        </View>

        <View>
          <SectionLabel icon="Tag" label={t('profile.myListings')} />
          {listings.length === 0 ? (
            <Text className="font-sans-bold text-sm text-brand-warmgray">
              {t('profile.noListings')}
            </Text>
          ) : (
            <View className="flex-row flex-wrap gap-3">
              {listings.map(item => (
                <Pressable
                  key={item.id}
                  onPress={() => openItem(item)}
                  accessibilityRole="button"
                  accessibilityLabel={localized(item.title)}
                  className="w-[30%] overflow-hidden rounded-xl bg-brand-surface shadow-sm"
                >
                  <Image
                    source={{ uri: item.imageUrl }}
                    className="aspect-square w-full"
                  />
                  <Price
                    fils={item.priceFils}
                    className="p-1.5 text-[11px] text-brand-primary"
                    unitClassName="text-[11px]"
                  />
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <Button
          variant="secondary"
          label={t('profile.logOut')}
          loading={logOut.isPending}
          onPress={() => logOut.mutate()}
        />
      </ScrollView>
    </Screen>
  );
}

function SectionLabel({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View className="mb-2 flex-row items-center gap-2">
      <Icon name={icon} size={16} color={colors.primary} />
      <Text className="font-sans-bold text-sm">{label}</Text>
    </View>
  );
}
