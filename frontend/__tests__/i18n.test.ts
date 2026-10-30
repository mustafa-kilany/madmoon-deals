import ar from '@/i18n/ar.json';
import en from '@/i18n/en.json';

const keys = (obj: object, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? keys(v, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );

describe('translations', () => {
  test('Arabic and English have exactly the same keys', () => {
    expect(keys(ar).sort()).toEqual(keys(en).sort());
  });

  test('no empty strings', () => {
    const values = (obj: object): string[] =>
      Object.values(obj).flatMap(v =>
        typeof v === 'string' ? [v] : values(v),
      );
    expect(values(en).filter(v => !v.trim())).toEqual([]);
    expect(values(ar).filter(v => !v.trim())).toEqual([]);
  });
});
