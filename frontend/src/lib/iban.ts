// Jordanian IBANs (shared by the app's form and the server): JO + 2 check digits + 4-letter
// bank code + 4-digit branch + 18 characters = 30 characters, with the standard mod-97 check.

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Spaces and dashes out, capitals, Arabic digits to Latin (phones often type those). */
export const normalizeIban = (text: string) =>
  text
    .replace(/[\s-]/g, '')
    .toUpperCase()
    .replace(/[٠-٩]/g, digit => String(ARABIC_DIGITS.indexOf(digit)));

const mod97 = (iban: string) => {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
};

export const isJordanIban = (iban: string) => /^JO\d{2}[A-Z]{4}\d{4}[A-Z0-9]{18}$/.test(iban) && mod97(iban) === 1;

/** "JO94 CBJO …": shown with only the last 4 characters. */
export const maskedIban = (last4: string) => `JO•• •••• •••• ${last4}`;
