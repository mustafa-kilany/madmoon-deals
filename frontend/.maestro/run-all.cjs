// npm run e2e:backend: every Maestro flow against a fresh backend (its own sahla_e2e_test database, re-seeded), with
// the auction's end between its two parts. Needs the emulator, Metro and nothing else on the port.
//   node .maestro/run-all.cjs                 all flows
//   node .maestro/run-all.cjs 08-bank-account-and-data
// Port 4000 is what debug builds call, so stop any other backend first.

const { spawn, spawnSync, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const front = path.join(__dirname, '..');
const backend = path.join(front, '../backend');
const url = new URL(fs.readFileSync(path.join(backend, '.env'), 'utf8').match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1]);
url.pathname = '/sahla_e2e_test';
const PORT = process.env.E2E_PORT ?? '4000';
const env = {
  ...process.env,
  NODE_ENV: 'development',
  DATABASE_URL: url.toString(),
  PORT,
  RATE_LIMIT_MULTIPLIER: '20',
  ADMIN_2FA: 'off',
  PAYMENT_MODE: 'fake',
  SANAD_MODE: 'fake',
  GEOCODER: 'fake',
  PUSH_MODE: 'off',
  MAIL_MODE: 'console',
  DEV_EMAIL_CODE: '123456',
  GOOGLE_CLIENT_IDS: '',
  LOG_LEVEL: 'warn',
};
const inBackend = args => execFileSync('npx', args, { cwd: backend, env, shell: true, stdio: ['ignore', 'pipe', 'inherit'] }).toString();
inBackend(['prisma', 'migrate', 'deploy']);
inBackend(['tsx', 'scripts/empty-db.ts']);
inBackend(['tsx', 'scripts/seed.ts']);

const server = spawn('npx', ['tsx', 'src/server.ts'], { cwd: backend, env, shell: true, stdio: 'ignore' });
const stop = () => {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    else server.kill();
  } catch {
    /* already gone */
  }
};

const FLOWS = ['01-browse-as-guest', '02-buy-and-deliver', '03-sell-an-item', '04-cancel-problems-support', '05-offer-counter-chat', '06-auction-bid', 'END', '07-auction-win-pay', '08-bank-account-and-data', '09-live-chat-unread', '10-late-bid-open', 'SOON', '11-late-bid-extends'];
const flows = process.argv.length > 2 ? process.argv.slice(2) : FLOWS;
const maestroPath = `${process.env.PATH}${path.delimiter}${path.join(os.homedir(), 'maestro/bin')}`;

(async () => {
  for (let i = 0; i < 120; i++) {
    if (await fetch(`http://localhost:${PORT}/v1/health`).then(r => r.ok, () => false)) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const results = [];
  for (const flow of flows) {
    if (flow === 'SOON') {
      console.log(inBackend(['tsx', 'scripts/e2e-end-auction.ts', 'auction-hobbies', '44']).trim().split('\n').pop());
      continue;
    }
    if (flow === 'END') {
      console.log(inBackend(['tsx', 'scripts/e2e-end-auction.ts', 'auction-fashion']).trim().split('\n').pop());
      continue;
    }
    const started = Date.now();
    const r = spawnSync('maestro', ['test', '-e', `API=http://localhost:${PORT}`, `.maestro/${flow}.yaml`], { cwd: front, shell: true, encoding: 'utf8', env: { ...process.env, PATH: maestroPath }, maxBuffer: 64 * 1024 * 1024 });
    results.push(r.status === 0);
    console.log(`${r.status === 0 ? 'PASS' : 'FAIL'}  ${flow}  ${Math.round((Date.now() - started) / 1000)} s`);
    if (r.status !== 0) console.log((r.stdout + r.stderr).split('\n').filter(line => /FAILED|Assertion is|Error:|\.maestro.tests/.test(line)).slice(0, 8).join('\n'));
  }
  stop();
  const failed = results.filter(ok => !ok).length;
  console.log(`${results.length - failed} of ${results.length} flows passed.`);
  process.exit(failed ? 1 : 0);
})();
