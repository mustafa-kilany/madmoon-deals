// What the app needs for accounts, whoever answers (mock or API).

import type { LocalPhoto, Session, User } from '@/lib/types';

/** Where to send the user to approve the check in Sanad (Jordan's digital ID app). */
export type IdVerificationStart = { redirectUrl: string };

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

/** S3.7: the seller's bank account as the app sees it: never the whole IBAN. */
export type PayoutAccount = {
  /** How a change is confirmed: the password, or an emailed code (Google / Apple accounts). */
  confirmWith: 'password' | 'code';
  account: { holderName: string; ibanLast4: string; heldUntil?: string } | null;
};
export type PayoutAccountInput = {
  holderName: string;
  iban: string;
  password?: string;
  code?: string;
};

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
  /**
   * Start verifying the signed-in account with Sanad. The app opens redirectUrl;
   * Sanad sends the user back to the server, then GET /me shows verified: true.
   * SANAD_UNAVAILABLE until Sahla has Sanad access. Sends the person's consent
   * (B15.8): the screen asks for it first.
   */
  startIdVerification(): Promise<IdVerificationStart>;
  /** B15.8: accept the current terms and privacy policy (LEGAL_VERSION). */
  acceptTerms(version: string): Promise<User>;
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
  /** S3.7: where a seller's money goes. */
  getPayoutAccount(): Promise<PayoutAccount>;
  savePayoutAccount(input: PayoutAccountInput): Promise<PayoutAccount>;
  /** Accounts with no password: email a code to confirm a change. */
  sendPayoutCode(): Promise<void>;
  /** S8.4: a copy of everything Sahla holds about this person. */
  exportMyData(): Promise<unknown>;
  logOut(): Promise<void>;
  /** Delete the account and everything on it (App Store rule 5.1.1(v)). */
  deleteAccount(): Promise<void>;
}
