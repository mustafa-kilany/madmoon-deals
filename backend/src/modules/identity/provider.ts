// ID verification (the Verified badge). Sanad, Jordan's national digital ID
// app, is the goal; until Sahla has a Sanad agreement, a person reviews a photo
// of the ID card (manual). See docs/ID-VERIFICATION.md.

export type VerifiedIdentity = {
  /** Hash of the national number: one ID, one verified account. Never store the number. */
  nationalIdHash: string;
  fullNameAr?: string;
  fullNameEn?: string;
  /** The provider's own reference for this check, for audits. */
  providerRef: string;
};

export interface IdVerificationProvider {
  readonly name: 'sanad' | 'manual';
  /**
   * Starts a check for the user. Sanad: returns where to send the user (the
   * Sanad app / consent page). Manual: the photo is queued for an admin.
   */
  start(userId: string, input: { photo?: Buffer }): Promise<{ redirectUrl?: string; pending: true }>;
  /**
   * Sanad only: the user comes back from Sanad with a code; exchange it for
   * the verified identity. Shape to be confirmed with MoDEE's onboarding docs.
   */
  complete?(userId: string, callback: Record<string, string>): Promise<VerifiedIdentity>;
}

/** Placeholder until MoDEE gives Sahla Sanad API access (docs/ID-VERIFICATION.md). */
export const sanadNotConfigured: IdVerificationProvider = {
  name: 'sanad',
  async start() {
    throw new Error('Sanad is not configured yet: see backend/docs/ID-VERIFICATION.md');
  },
};
