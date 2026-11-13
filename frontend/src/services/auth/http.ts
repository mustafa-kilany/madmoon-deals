// Accounts from the Sahla API (docs/API.md → Accounts).

import type { Session, User } from '@/lib/types';
import { api, photoForm } from '../api/client';
import type { AuthService, IdVerificationStart, PayoutAccount } from './types';

export const httpAuthService: AuthService = {
  // B15.8: the sign-up screens show the terms with the button: pressing it is acceptance.
  signUpWithEmail: input =>
    api.post<Session>('/auth/signup', { ...input, acceptTerms: true }),
  logInWithEmail: input => api.post<Session>('/auth/login', input),
  logInWithGoogle: idToken =>
    api.post<Session>('/auth/google', { idToken, acceptTerms: true }),
  logInWithApple: idToken =>
    api.post<Session>('/auth/apple', { idToken, acceptTerms: true }),
  sendOtp: input => api.post<void>('/auth/send-otp', input),
  forgotPassword: input => api.post<void>('/auth/forgot-password', input),
  resetPassword: input => api.post<Session>('/auth/reset-password', input),
  startIdVerification: () =>
    api.post<IdVerificationStart>('/me/id-verification/sanad', {
      consent: true,
    }),
  acceptTerms: version => api.post<User>('/me/terms', { version }),
  getMe: () => api.get<User>('/me'),
  updateProfile: patch => api.patch<User>('/me', patch),
  changeAvatar: photo =>
    api.post<User>('/me/avatar', photoForm('avatar', photo)),
  savePaymentCard: cardToken =>
    api.post<User>('/me/payment-card', { cardToken }),
  removePaymentCard: () => api.delete<User>('/me/payment-card'),
  getPayoutAccount: () => api.get<PayoutAccount>('/me/payout-account'),
  savePayoutAccount: input => api.put<PayoutAccount>('/me/payout-account', input),
  sendPayoutCode: () => api.post<void>('/me/payout-account/code'),
  exportMyData: () => api.get<unknown>('/me/export'),
  logOut: async () => {
    await api.post('/auth/logout');
  },
  deleteAccount: async () => {
    await api.delete('/me');
  },
};
