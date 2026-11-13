// Is there a shop stamp on the paper? OCR can't tell, so this is its own step
// (docs/API.md → Shop test certificates, step 3; docs/OCR.md → Stamp).

export type StampResult = {
  /** null = not checked (no detector yet): the certificate goes to admin review. */
  found: boolean | null;
  detector: string;
};

export interface StampDetector {
  detect(image: Buffer): Promise<StampResult>;
}

/**
 * Until a real detector is trained: text checks still decide pass / fail, and
 * every certificate is saved with stampChecked = false for an admin to look at.
 */
export const noStampDetector: StampDetector = {
  async detect() {
    return { found: null, detector: 'none' };
  },
};
