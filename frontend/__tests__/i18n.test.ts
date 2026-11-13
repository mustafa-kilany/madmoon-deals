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
    // Plurals excepted: Arabic has six forms of a word (_zero … _other), English two.
    const words = (all: string[]) => [
      ...new Set(all.map(k => k.replace(/_(zero|one|two|few|many|other)$/, ''))),
    ];
    expect(words(keys(ar)).sort()).toEqual(words(keys(en)).sort());
  });

  test('every plural has all the forms its language needs', () => {
    const forms = (all: string[], word: string) =>
      all
        .filter(k => k.startsWith(`${word}_`))
        .map(k => k.slice(word.length + 1))
        .sort();
    expect(forms(keys(en), 'chats.unread')).toEqual(['one', 'other']);
    expect(forms(keys(ar), 'chats.unread')).toEqual(
      ['few', 'many', 'one', 'other', 'two', 'zero'],
    );
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
