import { isJordanIban, maskedIban, normalizeIban } from '@/lib/iban';
import { formatAmount, formatJOD, jod } from '@/lib/money';

describe('money', () => {
  test('jod converts dinars to integer fils', () => {
    expect(jod(520)).toBe(520000);
    expect(jod(12.5)).toBe(12500);
    expect(jod(0.1 + 0.2)).toBe(300);
  });

  test('whole dinars show without decimals, like the prototype', () => {
    expect(formatAmount(520000)).toBe('520');
    expect(formatAmount(0)).toBe('0');
  });

  test('fractional amounts show all three fils digits', () => {
    expect(formatAmount(12500)).toBe('12.500');
    expect(formatAmount(15605)).toBe('15.605');
    expect(formatAmount(1050)).toBe('1.050');
    expect(formatAmount(-2500)).toBe('-2.500');
  });

  test('currency label follows the language, after the amount', () => {
    expect(formatJOD(450000, 'en')).toBe('450 JOD');
    expect(formatJOD(450000, 'ar')).toBe('450 د.أ');
  });
});

test('S3.7 Jordanian IBANs', () => {
  const good = 'JO94CBJO0010000000000131000302';
  expect(isJordanIban(good)).toBe(true);
  expect(isJordanIban(normalizeIban('jo94 cbjo-0010 0000 0000 0131 000302'))).toBe(true);
  expect(isJordanIban(normalizeIban('JO٩٤CBJO0010000000000131000302'))).toBe(true);
  for (const bad of ['JO94CBJO0010000000000131000303', 'GB82WEST12345698765432', 'JO94', ''])
    expect(isJordanIban(normalizeIban(bad))).toBe(false);
  expect(maskedIban('0302')).toContain('0302');
  expect(maskedIban('0302')).not.toContain('CBJO');
});
