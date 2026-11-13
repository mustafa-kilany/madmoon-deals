// Card tokenization. The card number goes to the payment provider, never to
// Sahla's backend; the app only passes on the provider's token. The provider
// isn't chosen yet (DEVELOPMENT_GUIDE §8 #4): when it is, its SDK replaces
// this mock (and its card field replaces the plain input on Profile).

const brandOf = (digits: string) =>
  digits.startsWith('4')
    ? 'visa'
    : /^5[1-5]/.test(digits)
    ? 'mastercard'
    : 'card';

export const paymentProvider = {
  /** Mock token "mock_<brand>_<last4>". */
  tokenizeCard: async (cardNumber: string): Promise<string> => {
    if (!__DEV__) throw new Error('Card payments aren’t connected yet');
    const digits = cardNumber.replace(/\D/g, '');
    if (digits.length < 12) throw new Error('Card number too short');
    return `mock_${brandOf(digits)}_${digits.slice(-4)}`;
  },
};
