// Auction countdown text ("44m 54s left", or "Auction ended"). The only part
// of a card or screen that redraws every second (see hooks/useNow).

import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { useTimeLeftLabel } from '@/features/auctions/hooks/useTimeLeftLabel';
import { useNow } from '@/hooks/useNow';

type TimeLeftProps = {
  endsAt: number;
  className?: string;
  /** "44m 54s left" (default) or just "44m 54s". */
  suffix?: boolean;
};

export function TimeLeft({ endsAt, className, suffix = true }: TimeLeftProps) {
  const { t } = useTranslation();
  const now = useNow();
  const label = useTimeLeftLabel();
  return (
    <Text className={className} numberOfLines={1}>
      {endsAt <= now
        ? t('time.ended')
        : suffix
        ? t('time.left', { time: label(endsAt, now) })
        : label(endsAt, now)}
    </Text>
  );
}
