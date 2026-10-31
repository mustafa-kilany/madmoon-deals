// A short page in the phone's browser after an outside service (Sanad, the
// bank's card check) sends the user back to this server: "go back to the app".

export type PageMessage = { ar: string; en: string };

export const browserPage = (message: PageMessage) => `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sahla</title><style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;text-align:center;line-height:1.6}</style>
</head><body><h1>سهلة · Sahla</h1><p>${message.ar}</p><p dir="ltr">${message.en}</p></body></html>`;
