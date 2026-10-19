// Countdown text for auctions: "44m 54s", "3h 12m", "2d 4h", "Auction ended".

import { useTranslation } from 'react-i18next';
import { timeLeft } from '@/lib/browsing';

export function useTimeLeftLabel(): (endsAt: number, now: number) => string {
  const { t } = useTranslation();
  return (endsAt, now) => {
    const left = timeLeft(endsAt, now);
    switch (left.unit) {
      case 'ended':
        return t('time.ended');
      case 'days':
        return t('time.days', { days: left.days, hours: left.hours });
      case 'hours':
        return t('time.hours', { hours: left.hours, minutes: left.minutes });
      case 'minutes':
        return t('time.minutes', {
          minutes: left.minutes,
          seconds: left.seconds,
        });
    }
  };
}
