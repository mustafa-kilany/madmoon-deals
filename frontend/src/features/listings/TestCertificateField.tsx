// Sell form section for phones and electronics: the photo of a shop's test
// report (stamped, naming this device and its specs). The server reads it
// (OCR) and says whether it passes; the listing can't be published until it
// does, for the brand and model now chosen.

import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icons';
import { Badge, Text } from '@/components/ui';
import { useLang } from '@/i18n';
import { formatDate } from '@/lib/dates';
import type { CertificateCheck, LocalPhoto } from '@/lib/types';
import { errorMessageKey } from '@/services/api/errors';
import { colors } from '@/theme/colors';

type TestCertificateFieldProps = {
  /** A brand is chosen: the report is matched against it. */
  ready: boolean;
  photo?: LocalPhoto;
  check?: CertificateCheck;
  checking: boolean;
  /** The check request itself failed (network…). */
  error: unknown;
  /** Brand, model or type changed since the check. */
  stale: boolean;
  onPick: () => void;
  onRecheck: () => void;
};

export function TestCertificateField({
  ready,
  photo,
  check,
  checking,
  error,
  stale,
  onPick,
  onRecheck,
}: TestCertificateFieldProps) {
  const { t } = useTranslation();
  const lang = useLang();

  const status = checking
    ? 'checking'
    : error
    ? 'error'
    : !check
    ? 'none'
    : stale
    ? 'stale'
    : check.status;
  const box = {
    passed: 'border-brand-success bg-brand-success-soft',
    failed: 'border-brand-danger bg-brand-danger-soft',
    error: 'border-brand-danger bg-brand-danger-soft',
    stale: 'border-brand-warning-text bg-brand-warning-soft',
    checking: 'border-brand-border bg-brand-surface',
    none: 'border-brand-border bg-brand-surface',
  }[status];

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Text className="font-sans-bold text-sm">{t('certificate.title')}</Text>
        <Badge label={t('certificate.required')} tone="warning" />
      </View>
      <Text className="font-sans-medium text-xs leading-relaxed text-brand-warmgray">
        {t('certificate.explain')}
      </Text>

      {!photo ? (
        <>
          <Pressable
            onPress={onPick}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
            className={`min-h-20 flex-row items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-border bg-brand-surface p-4 ${
              ready ? '' : 'opacity-50'
            }`}
          >
            <Icon name="ClipboardCheck" size={22} color={colors.primary} />
            <Text className="font-sans-bold text-sm text-brand-primary">
              {t('certificate.add')}
            </Text>
          </Pressable>
          {!ready && (
            <Text className="font-sans-medium text-xs text-brand-warmgray">
              {t('certificate.brandFirst')}
            </Text>
          )}
        </>
      ) : (
        <View className={`flex-row gap-3 rounded-xl border-2 p-3 ${box}`}>
          <Image
            source={{ uri: photo.uri }}
            className="h-24 w-[72px] rounded-lg bg-brand-lightgray"
            accessibilityLabel={t('certificate.title')}
          />
          <View className="flex-1 gap-1" accessibilityLiveRegion="polite">
            {status === 'checking' && (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color={colors.primary} />
                <Text className="flex-1 font-sans-bold text-sm">
                  {t('certificate.checking')}
                </Text>
              </View>
            )}
            {status === 'error' && (
              <Text className="font-sans-bold text-sm text-brand-danger">
                {t(errorMessageKey(error))}
              </Text>
            )}
            {status === 'stale' && (
              <Text className="font-sans-bold text-sm text-brand-warning-text">
                {t('certificate.stale')}
              </Text>
            )}
            {status === 'passed' && check && (
              <>
                <View className="flex-row items-center gap-1">
                  <Icon name="Check" size={16} color={colors.success} />
                  <Text className="flex-1 font-sans-bold text-sm text-brand-success">
                    {t('certificate.passed')}
                  </Text>
                </View>
                <Text className="font-sans-medium text-xs">
                  {[
                    check.shopName,
                    check.testedAt && formatDate(check.testedAt, lang),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                <Text className="font-sans-medium text-xs text-brand-warmgray">
                  {[check.device, ...check.specs].filter(Boolean).join(' · ')}
                </Text>
              </>
            )}
            {status === 'failed' && check && (
              <>
                <Text className="font-sans-bold text-sm text-brand-danger">
                  {t('certificate.failed')}
                </Text>
                {check.problems.map(problem => (
                  <Text key={problem} className="font-sans-medium text-xs">
                    {`• ${t(`certificate.problem.${problem}`)}`}
                  </Text>
                ))}
              </>
            )}
            {!checking && (
              <View className="mt-1 flex-row flex-wrap gap-x-4">
                {(status === 'stale' || status === 'error') && (
                  <Pressable
                    onPress={onRecheck}
                    accessibilityRole="button"
                    className="min-h-11 justify-center"
                  >
                    <Text className="font-sans-bold text-xs text-brand-primary">
                      {t('certificate.checkAgain')}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={onPick}
                  accessibilityRole="button"
                  className="min-h-11 justify-center"
                >
                  <Text className="font-sans-bold text-xs text-brand-primary">
                    {t('certificate.replace')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
