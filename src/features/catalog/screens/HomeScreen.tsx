// Home tab. Phase 1: the prototype's header (menu, greeting, saved, language
// switch). The dashboard body (search, categories, live auction) is Phase 2.

import { useNavigation } from '@react-navigation/native';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icons';
import { Heading, Screen, Text } from '@/components/ui';
import { changeLanguage, useLang } from '@/i18n';
import { useUiStore } from '@/store/uiStore';
import { iconSize } from '@/theme/spacing';

export function HomeScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const lang = useLang();
  const openSidebar = useUiStore(s => s.openSidebar);

  return (
    <Screen
      header={
        <>
          <View className="flex-1 flex-row items-center gap-3">
            <Pressable
              onPress={openSidebar}
              accessibilityRole="button"
              accessibilityLabel={t('home.openMenu')}
              className="-ms-2 rounded-xl p-2 active:bg-brand-lightgray"
            >
              <Icon name="Menu" size={iconSize.nav} />
            </Pressable>
            <Heading className="flex-1 text-xl" numberOfLines={1}>
              {t('home.welcome')}
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
            </Pressable>
            <Pressable
              onPress={() => changeLanguage(lang === 'ar' ? 'en' : 'ar')}
              accessibilityRole="button"
              accessibilityLabel={t('language.toggleLabel')}
              className="min-h-11 justify-center rounded-xl bg-brand-lightgray px-3"
            >
              <Text className="font-sans-bold text-sm">
                {t('language.toggle')}
              </Text>
            </Pressable>
          </View>
        </>
      }
    >
      <View className="flex-1 items-center justify-center px-5">
        <Text className="font-sans-medium text-sm text-brand-warmgray">
          {t('common.comingSoon')}
        </Text>
      </View>
    </Screen>
  );
}
