// Every crash goes through here: render errors (ErrorBoundary) and uncaught
// JS errors (global handler). Debug builds log them; a crash-reporting service
// (e.g. Sentry: needs an account and its DSN) plugs into `send` before
// release, without touching the rest of the app.

type CrashContext = { where: 'render' | 'global'; fatal?: boolean };

/** The latest few crashes, newest first (kept in memory for support/debugging). */
const recent: { message: string; at: number; context: CrashContext }[] = [];
const MAX_RECENT = 10;

function send(error: Error, context: CrashContext): void {
  if (__DEV__) console.error(`[crash:${context.where}]`, error);
  // Release: report to the crash-reporting service here.
}

export const crashReporter = {
  capture(error: unknown, context: CrashContext): void {
    const err = error instanceof Error ? error : new Error(String(error));
    recent.unshift({ message: err.message, at: Date.now(), context });
    recent.length = Math.min(recent.length, MAX_RECENT);
    try {
      send(err, context);
    } catch {
      // Reporting must never crash the app itself.
    }
  },
  recent: () => [...recent],

  /** Uncaught JS errors: report, then let React Native's handler continue. */
  installGlobalHandler(): void {
    const previous = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      crashReporter.capture(error, { where: 'global', fatal: isFatal });
      previous(error, isFatal);
    });
  },
};
