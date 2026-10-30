// Text matching that forgives how people type Arabic: أ/إ/آ → ا, ة → ه,
// ى → ي, no tashkeel or tatweel, and case-insensitive Latin. The server is
// asked to do the same for listing search (docs/API.md → Search).

const TASHKEEL = /[ً-ْٰـ]/g;

export function foldText(text: string): string {
  return text
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim()
    .toLocaleLowerCase();
}
