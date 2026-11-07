// The privacy policy or the terms (BACKEND_PLAN B15.8), in the app's language.
// The same text is on the web at /v1/legal/privacy and /v1/legal/terms.

import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Heading, Screen, Text } from '@/components/ui';
import { useLocalized } from '@/i18n';
import { LEGAL_VERSION, legalDocs } from '@/legal';
import type { RootScreenProps } from '@/navigation/types';

export function LegalScreen({ route }: RootScreenProps<'Legal'>) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const doc = legalDocs[route.params.doc];

  return (
    <Screen
      tone="white"
      headerBorder
      header={
        <>
          <BackButton />
          <Heading className="flex-1 text-xl">{localized(doc.title)}</Heading>
        </>
      }
    >
      <ScrollView contentContainerClassName="gap-5 p-5 pb-10">
        <Text className="text-xs text-brand-warmgray">
          {t('legal.version', { version: LEGAL_VERSION })}
        </Text>
        {doc.sections.map(section => (
          <View key={section.title.en} className="gap-2">
            <Heading className="text-base">{localized(section.title)}</Heading>
            <Text className="text-sm leading-relaxed">
              {localized(section.body)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
