import { app } from './app';
import { env } from './env';
import { scheduleAuctionClosing } from './modules/negotiation/bids';
import { scheduleUploadCleanup } from './modules/uploads/cleanup';

// Same port as the contract server, so the app's debug apiBaseUrl
// (http://10.0.2.2:4000/v1 on the Android emulator) reaches it unchanged.
// Run one or the other, not both.
scheduleUploadCleanup();
scheduleAuctionClosing();

app.listen(env.PORT, () => {
  console.log(`Sahla backend on http://localhost:${env.PORT}/v1`);
});
