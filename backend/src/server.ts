import { app } from './app';
import { prisma } from './db';
import { env } from './env';
import { reportError } from './lib/errorReporter';
import { startJobWorker } from './lib/jobs';
import { logger } from './lib/logger';
import { scheduleAuctionClosing } from './modules/negotiation/bids';
import { attachLive } from './modules/negotiation/live';
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
const stopJobs = startJobWorker(); // pushes, emails, risk checks waiting in the Job table

const server = app.listen(env.PORT, () => {
  logger.info(`Sahla backend on http://localhost:${env.PORT}/v1`);
});

const live = attachLive(server, app);

// B12.2: on a deploy the host sends SIGTERM. Requests in progress (a payment!) finish,
// then the database connections close. Anything still open after 20 seconds is cut.
let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'Shutting down');
  const cut = setTimeout(() => process.exit(1), 20_000) as unknown as { unref(): void };
  cut.unref();
  live.close(); // open sockets would otherwise keep the server from closing
  stopJobs(); // a job running now finishes or, if cut, another server takes it over later
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
  server.closeIdleConnections();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// A bug nobody caught: tell someone, then start clean (the host restarts the server).
process.on('uncaughtException', error => {
  logger.fatal({ err: error }, 'Uncaught exception');
  void reportError(error, 'uncaught').finally(() => process.exit(1));
});
process.on('unhandledRejection', error => {
  logger.error({ err: error }, 'Unhandled rejection');
  void reportError(error, 'unhandled rejection');
});
