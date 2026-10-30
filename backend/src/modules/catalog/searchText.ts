import { foldText } from '@/lib/text';
import { findType } from '../../reference';

/**
 * Listing.searchText: what GET /listings?q= searches, folded the same way as the
 * app (أ/إ/آ → ا, ة → ه, ى → ي, no tashkeel, lower case), so an Arabic query finds
 * English titles too. Every query word must appear in it.
 */
export function searchTextFor(listing: {
  category: string;
  type: string;
  titleAr: string;
  titleEn: string;
  brand?: string | null;
  model?: string | null;
}) {
  const type = findType(listing.category, listing.type);
  return foldText(
    [listing.titleEn, listing.titleAr, listing.brand, listing.model, type?.name.en, type?.name.ar]
      .filter(Boolean)
      .join(' '),
  );
}

/** The words of a search query, folded like searchText. */
export const searchWords = (q: string) => foldText(q).split(/\s+/).filter(Boolean);
