// Listing rules the Sell form, the mock backend and the server
// (docs/API.md → POST /listings) all apply.

import type { ItemType } from './types';

export const DESCRIPTION_MIN_WORDS = 10;
export const DESCRIPTION_MAX = 2000;

// A word has at least one letter or digit (Latin or Arabic), so "- - -" or
// a row of emoji doesn't count.
const WORD = /[0-9A-Za-zÀ-ɏ؀-ۿݐ-ݿ]/;

export const countWords = (text: string) =>
  text.split(/\s+/).filter(word => WORD.test(word)).length;

/** At least 10 words and at most 2000 characters. */
export const descriptionValid = (text: string | undefined) =>
  !!text &&
  countWords(text) >= DESCRIPTION_MIN_WORDS &&
  text.trim().length <= DESCRIPTION_MAX;

/** Phones, laptops, consoles…: the seller adds a shop's test certificate. */
export const needsTestCertificate = (type: ItemType | undefined) =>
  !!type?.requiresTestCertificate;
