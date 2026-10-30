// Calendar dates for display: "20 Oct 2026" / "20 تشرين الأول 2026" (Latin
// digits in both languages, like prices).

import type { Lang } from './types';

export const formatDate = (ms: number, lang: Lang): string =>
  new Date(ms).toLocaleDateString(lang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
