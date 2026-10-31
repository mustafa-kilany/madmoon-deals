import { app } from './app';
import { env } from './env';
import { logger } from './lib/logger';
import { scheduleAuctionClosing } from './modules/negotiation/bids';
import { scheduleNightlyRiskCheck } from './modules/risk/triggers';
import { scheduleUploadCleanup } from './modules/uploads/cleanup';

// Same port as the contract server, so the app's debug apiBaseUrl
// (http://10.0.2.2:4000/v1 on the Android emulator) reaches it unchanged.
// Run one or the other, not both.
scheduleUploadCleanup();
scheduleAuctionClosing();
scheduleNightlyRiskCheck();

app.listen(env.PORT, () => {
  logger.info(`Sahla backend on http://localhost:${env.PORT}/v1`);
});
