import { app } from './app';
import { env } from './env';
import { logger } from './lib/logger';
import { scheduleAuctionClosing } from './modules/negotiation/bids';
import { scheduleMoneyCheck } from './modules/orders/moneyCheck';
import { scheduleRetention } from './modules/privacy/retention';
import { scheduleNightlyRiskCheck } from './modules/risk/triggers';
import { scheduleUploadCleanup } from './modules/uploads/cleanup';

// Same port as the contract server, so the app's debug apiBaseUrl
// (http://10.0.2.2:4000/v1 on the Android emulator) reaches it unchanged.
// Run one or the other, not both.
scheduleUploadCleanup();
scheduleAuctionClosing();
scheduleNightlyRiskCheck();
scheduleMoneyCheck();
scheduleRetention();

app.listen(env.PORT, () => {
  logger.info(`Sahla backend on http://localhost:${env.PORT}/v1`);
});
