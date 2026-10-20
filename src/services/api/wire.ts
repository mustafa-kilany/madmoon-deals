// Timestamps are ISO-8601 strings on the wire (docs/API.md → Conventions)
// and epoch milliseconds in the app. The http.ts mappers use these.

/** T as it travels: the fields K are ISO strings instead of epoch ms. */
export type Dated<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: undefined extends T[P] ? string | undefined : string;
};

export const fromIso = (iso: string): number => Date.parse(iso);
export const toIso = (ms: number): string => new Date(ms).toISOString();
/** For optional fields. */
export const fromIsoMaybe = (iso: string | undefined) =>
  iso === undefined ? undefined : fromIso(iso);
