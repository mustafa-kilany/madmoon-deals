// What may leave the server about an error (SECURITY_PLAN S0.10, S7.8). Prisma's messages quote
// the failed query with its values (password hashes, addresses), so for those only the
// kind of error is kept. Everything else goes through scrubText.

const PATTERNS: [RegExp, string][] = [
  [/([?&](?:key|token|code|ref|lat|lng|state)=)[^&\s"']+/gi, '$1[removed]'],
  [/Bearer\s+[\w.~+/=-]+/gi, 'Bearer [removed]'],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[token]'],
  [/AIza[\w-]{20,}/g, '[key]'],
  [/sahla_sk_[\w-]+/g, '[key]'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]'],
  [/\bJO\d{2}[A-Z0-9]{26}\b/gi, '[iban]'],
  [/\b\d{12,19}\b/g, '[number]'],
  [/\b07\d{8}\b/g, '[phone]'],
];

export const scrubText = (text: string) => PATTERNS.reduce((out, [pattern, to]) => out.replace(pattern, to), text);

export type SafeError = { type: string; message: string; code?: string; stack?: string };

/** An error, as it may be logged or reported. */
export function safeError(error: unknown): SafeError {
  if (!(error instanceof Error)) return { type: typeof error, message: 'Not an Error object' };
  const code = (error as { code?: unknown }).code;
  const fromDatabase = error.name.startsWith('PrismaClient');
  return {
    type: error.name,
    message: fromDatabase ? 'A database error (details withheld: they can quote personal data)' : scrubText(error.message),
    ...(typeof code === 'string' && { code }),
    // Only the "at file:line" lines: the first line of a stack repeats the message.
    stack: error.stack?.split('\n').filter(line => /^\s+at /.test(line)).slice(0, 20).map(scrubText).join('\n'),
  };
}

/** A request path for a log: ids stay (support needs them), long secrets such as push tokens don't. */
export const safePath = (url: string) =>
  scrubText(
    String(url)
      .split('?')[0]
      .split('/')
      .map(part => (part.length > 40 ? '[long]' : part))
      .join('/'),
  );
