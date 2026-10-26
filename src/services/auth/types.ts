// What the app needs for accounts, whoever answers (mock or API).

import type { LocalPhoto, Session, User } from '@/lib/types';

/** `code` is the 6-digit code POST /auth/send-otp emailed (proves the address). */
export type EmailSignUp = {
  name: string;
  email: string;
  password: string;
  code: string;
};
export type EmailLogIn = { email: string; password: string };
export type SendOtpInput = { email: string };
export type ResetPasswordInput = {
  email: string;
  code: string;
  password: string;
};
export type ProfilePatch = Partial<Pick<User, 'name' | 'cityId'>>;

export interface AuthService {
  signUpWithEmail(input: EmailSignUp): Promise<Session>;
  logInWithEmail(input: EmailLogIn): Promise<Session>;
  /** Social log-in with Google. */
  logInWithGoogle(idToken?: string): Promise<Session>;
  /** Social log-in with Apple. */
  logInWithApple(idToken?: string): Promise<Session>;
  /** Email a 6-digit code to a new address, before sign-up. */
  sendOtp(input: SendOtpInput): Promise<void>;
  /** Email a reset code (says nothing about whether the account exists). */
  forgotPassword(input: SendOtpInput): Promise<void>;
  /** New password with the emailed code; signs in. */
  resetPassword(input: ResetPasswordInput): Promise<Session>;
  /** Verify the signed-in (email) account with a photo of the national ID. */
  verifyId(idPhoto: LocalPhoto): Promise<User>;
  /** The signed-in account, fresh from the server. */
  getMe(): Promise<User>;
  updateProfile(patch: ProfilePatch): Promise<User>;
  /** Upload a new profile photo. */
  changeAvatar(photo: LocalPhoto): Promise<User>;
  /**
   * Attach a card to the account. Takes the payment provider's token
   * (services/payments), never the card number.
   */
  savePaymentCard(cardToken: string): Promise<User>;
  removePaymentCard(): Promise<User>;
  logOut(): Promise<void>;
  /** Delete the account and everything on it (App Store rule 5.1.1(v)). */
  deleteAccount(): Promise<void>;
}
