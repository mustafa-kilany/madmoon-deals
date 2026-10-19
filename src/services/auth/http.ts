// Accounts from the Sahla API (docs/API.md → Accounts).

import type { LocalPhoto, Session, User } from '@/lib/types';
import { api } from '../api/client';
import type { AuthService } from './types';

/** multipart/form-data body with one image field. */
function photoForm(field: string, photo: LocalPhoto): FormData {
  const form = new FormData();
  // React Native's FormData takes { uri, type, name } for files.
  form.append(field, {
    uri: photo.uri,
    type: photo.mimeType,
    name: photo.fileName,
  } as unknown as Blob);
  return form;
}

export const httpAuthService: AuthService = {
  signUpWithEmail: input => api.post<Session>('/auth/signup', input),
  logInWithEmail: input => api.post<Session>('/auth/login', input),
  signUpWithId: (input: any) => {
    const photo = input?.idPhoto || input;
    const form = photoForm('idPhoto', photo);
    form.append('name', input?.name ? String(input.name) : 'Mustafa');
    form.append('email', input?.email ? String(input.email) : 'verified@sahla.jo');
    if (input?.password) form.append('password', input.password);
    return api.post<Session>('/auth/signup/id', form);
  },
  logInWithGoogle: idToken => api.post<Session>('/auth/google', { idToken }),
  logInWithApple: idToken => api.post<Session>('/auth/apple', { idToken }),
  sendOtp: input => api.post<void>('/auth/send-otp', input),
  verifyOtp: input => api.post<Session>('/auth/verify-otp', input),
  verifyId: idPhoto =>
    api.post<User>('/me/id-verification', photoForm('idPhoto', idPhoto)),
  getMe: () => api.get<User>('/me'),
  updateProfile: patch => api.patch<User>('/me', patch),
  changeAvatar: photo =>
    api.post<User>('/me/avatar', photoForm('avatar', photo)),
  savePaymentCard: cardToken =>
    api.post<User>('/me/payment-card', { cardToken }),
  removePaymentCard: () => api.delete<User>('/me/payment-card'),
  logOut: async () => {
    await api.post('/auth/logout');
  },
};
