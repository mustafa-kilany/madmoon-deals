// S5.3: the headers the dashboard must be served with. The dashboard's token lives in
// sessionStorage, so this Content-Security-Policy is what stops injected script from
// reading it: only our own scripts run, and they can only talk to our own API.
//
// `vite build` writes them to dist/_headers (the format of Cloudflare Pages and Netlify).
// Another host: set the same headers there. `npm run preview` serves them too, so
// what's tested on this PC is what production gets.

export function securityHeaders(apiOrigin: string) {
  const csp = [
    "default-src 'none'",
    "script-src 'self'",
    // The stylesheet and the Arabic font from Google Fonts. React's style={…} isn't affected.
    "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    // Photos come from the API or the storage's address; the QR code is a data: image; private
    // certificate photos are shown as blob: URLs.
    "img-src 'self' https: data: blob:",
    `connect-src 'self' ${apiOrigin}`.trim(),
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
  return {
    'Content-Security-Policy': csp,
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}
