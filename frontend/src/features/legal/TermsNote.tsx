// "By continuing, you agree to Sahla's Terms and Privacy Policy" with links
// (BACKEND_PLAN B15.8). Shown with the sign-up and Google / Apple buttons:
// pressing them sends acceptTerms, recorded with the account.

import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';

export function TermsNote({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const link = (doc: 'terms' | 'privacy', label: string) => (
    <Text
      accessibilityRole="link"
      onPress={() => navigation.navigate('Legal', { doc })}
      className="font-sans-bold text-xs text-brand-primary underline"
    >
      {label}
    </Text>
  );
  return (
    <Text className={`text-center text-xs leading-relaxed text-brand-warmgray ${className}`}>
      {t('legal.agreeStart')}
      {link('terms', t('legal.terms'))}
      {t('legal.agreeAnd')}
      {link('privacy', t('legal.privacy'))}
      {t('legal.agreeEnd')}
    </Text>
  );
}
