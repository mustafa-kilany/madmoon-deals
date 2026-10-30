// Reading the text off a certificate photo. The checks only see OcrResult, so
// the provider can change (docs/OCR.md) without touching them.

export type OcrWord = {
  text: string;
  confidence: number; // 0–1
  /** Corners in pixels, clockwise from top-left: where to blur IMEI / serials. */
  box: { x: number; y: number }[];
};

export type OcrResult = {
  provider: string;
  text: string; // the whole page, line breaks kept
  words: OcrWord[];
  confidence: number; // average over words, 0–1
};

export interface OcrProvider {
  readonly name: string;
  read(image: Buffer): Promise<OcrResult>;
}

type VisionWord = {
  confidence?: number;
  boundingBox?: { vertices?: { x?: number; y?: number }[] };
  symbols?: { text?: string }[];
};

/**
 * Google Cloud Vision, DOCUMENT_TEXT_DETECTION (reads Arabic and English).
 * REST with an API key: https://cloud.google.com/vision/docs/ocr
 */
export function googleVision(apiKey: string): OcrProvider {
  return {
    name: 'google-vision',
    async read(image) {
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [
              {
                image: { content: image.toString('base64') },
                features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                imageContext: { languageHints: ['ar', 'en'] },
              },
            ],
          }),
          signal: AbortSignal.timeout(8_000), // the seller is waiting (~10 s budget)
        },
      );
      if (!response.ok)
        throw new Error(`Google Vision ${response.status}: ${await response.text()}`);
      const data = (await response.json()) as {
        responses: {
          error?: { message: string };
          fullTextAnnotation?: {
            text?: string;
            pages?: { blocks?: { paragraphs?: { words?: VisionWord[] }[] }[] }[];
          };
        }[];
      };
      const page = data.responses[0];
      if (page?.error) throw new Error(`Google Vision: ${page.error.message}`);

      const words: OcrWord[] = (page?.fullTextAnnotation?.pages ?? [])
        .flatMap(p => p.blocks ?? [])
        .flatMap(b => b.paragraphs ?? [])
        .flatMap(p => p.words ?? [])
        .map(w => ({
          text: (w.symbols ?? []).map(s => s.text ?? '').join(''),
          confidence: w.confidence ?? 0,
          box: (w.boundingBox?.vertices ?? []).map(v => ({ x: v.x ?? 0, y: v.y ?? 0 })),
        }));
      return {
        provider: 'google-vision',
        text: page?.fullTextAnnotation?.text ?? '',
        words,
        confidence: words.length
          ? words.reduce((sum, w) => sum + w.confidence, 0) / words.length
          : 0,
      };
    },
  };
}
