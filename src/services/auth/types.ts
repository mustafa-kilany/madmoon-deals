// What the app needs for accounts, whoever answers (mock or API).

import type { LocalPhoto, Session, User } from '@/lib/types';

export type EmailSignUp = { name: string; email: string; password: string };
export type EmailLogIn = { email: string; password: string };
export type ProfilePatch = Partial<Pick<User, 'name' | 'cityId'>>;

export interface AuthService {
  signUpWithEmail(input: EmailSignUp): Promise<Session>;
  logInWithEmail(input: EmailLogIn): Promise<Session>;
  /** Create a verified account from a photo of the national ID. */
  signUpWithId(idPhoto: LocalPhoto): Promise<Session>;
  /** Verify the signed-in (email) account with a photo of the national ID. */
  verifyId(idPhoto: LocalPhoto): Promise<User>;
  /** The signed-in account, fresh from the server. */
  getMe(): Promise<User>;
  updateProfile(patch: ProfilePatch): Promise<User>;
  /** New profile photo. Without a photo the mock cycles demo avatars. */
  changeAvatar(photo?: LocalPhoto): Promise<User>;
  /**
   * Attach a card to the account. Takes the payment provider's token
   * (services/payments), never the card number.
   */
  savePaymentCard(cardToken: string): Promise<User>;
  removePaymentCard(): Promise<User>;
  logOut(): Promise<void>;
}
