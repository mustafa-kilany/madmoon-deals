// npm run check:secrets: looks through the code AND the whole git history for keys. It prints
// where each one is and what kind, never the value (so the report is safe to share).
// Allowed: Firebase's client key in google-services.json (public by design; S0.7 restricts it).

import { execFileSync } from 'node:child_process';

const PATTERNS: [string, RegExp][] = [
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/g],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['Anthropic key', /\bsk-ant-[0-9A-Za-z_-]{20,}/g],
  ['Sahla store key', /\bsahla_sk_[0-9A-Za-z_-]{30,}/g],
  ['Postmark token', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b(?=.*(?:POSTMARK|postmark))/gi],
  ['Database URL with a password', /postgres(?:ql)?:\/\/[^:\s"'`]+:(?!YOUR_PASSWORD|postgres@|build@|password@|PASSWORD@)[^@\s"'`]{4,}@(?!localhost:5432\/sahla_?test|127\.0\.0\.1:1\/)[^\s"'`]+/g],
  ['JWT secret value', /JWT_SECRET\s*=\s*["']?(?!["']?\s*$)[A-Za-z0-9_-]{32,}/g],
  ['Service account', /"type":\s*"service_account"/g],
];
/** Files whose job is to contain examples, or the key that's public by design. */
const ALLOWED = [/google-services\.json$/, /secret-scan\.ts$/, /scrub\.test\.ts$/, /\.github\/workflows\/ci\.yml$/, /settings\.e2e\.ts$/, /package-lock\.json$/];

// The patterns must really find things: each one against a made-up sample, built here at run time.
const SAMPLES: Record<string, string> = {
  'Google API key': 'AIza' + 'B'.repeat(35),
  'Private key': '-----BEGIN ' + 'PRIVATE KEY-----',
  'AWS key': 'AKIA' + 'B'.repeat(16),
  'Anthropic key': 'sk-ant-' + 'b'.repeat(24),
  'Sahla store key': 'sahla_sk_' + 'b'.repeat(32),
  'Postmark token': 'POSTMARK=' + ['aaaaaaaa', 'bbbb', 'cccc', 'dddd', 'eeeeeeeeeeee'].join('-') + ' postmark',
  'Database URL with a password': 'postgresql://sahla:' + 'hunter2hunter' + '@db.example.com/sahla',
  'JWT secret value': 'JWT_SECRET=' + 'q'.repeat(40),
  'Service account': '"type": "service_' + 'account"',
};
for (const [kind, pattern] of PATTERNS) {
  pattern.lastIndex = 0;
  if (!pattern.test(SAMPLES[kind])) throw new Error(`The pattern for ${kind} misses its sample`);
}
// Port 1 on this PC is never a database: balancer-test.ts uses it to cut the live connection (check 9).
// Only that address is let through, not the same password anywhere else.
const dbUrl = PATTERNS.find(([kind]) => kind === 'Database URL with a password')![1];
for (const [text, found] of [['postgresql://nobody:' + 'nothing@127.0.0.1:1/none', false], ['postgresql://nobody:' + 'nothing@127.0.0.1:5432/sahla', true]] as const) {
  dbUrl.lastIndex = 0;
  if (dbUrl.test(text) !== found) throw new Error(`The database pattern ${found ? 'misses' : 'flags'} ${text.replace(/:[^:@]+@/, ':***@')}`);
}

const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const git = (...args: string[]) => execFileSync('git', ['-C', top, ...args], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 * 1024 });
const findings = new Map<string, { kind: string; where: string; commit: string }>();

const scan = (text: string, where: string, commit: string) => {
  if (ALLOWED.some(pattern => pattern.test(where))) return;
  for (const [kind, pattern] of PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) findings.set(`${kind}|${where}`, { kind, where, commit });
  }
};

// Every line ever added, in every commit of every branch.
const history = git('log', '--all', '-p', '--no-color', '--unified=0', '--format=commit %h');
let commit = '';
let file = '';
let commits = 0;
for (const line of history.split('\n')) {
  if (line.startsWith('commit ')) {
    commit = line.slice(7).trim();
    commits++;
  } else if (line.startsWith('+++ b/')) file = line.slice(6).trim();
  else if (line.startsWith('+') && !line.startsWith('+++')) scan(line, file, commit);
}

const tracked = git('ls-files').split('\n').filter(Boolean);
for (const secretFile of ['.env', 'backend/.env', 'firebase-service-account.json', 'backend/firebase-service-account.json'])
  if (tracked.includes(secretFile)) findings.set(`tracked|${secretFile}`, { kind: 'A secrets file is in git', where: secretFile, commit: 'HEAD' });

console.log(`Scanned ${commits} commits and ${tracked.length} tracked files.`);
for (const { kind, where, commit: at } of findings.values()) console.log(`FOUND  ${kind}  in ${where}  (commit ${at})`);
console.log(findings.size ? `${findings.size} findings.` : 'No secrets found.');
process.exit(findings.size ? 1 : 0);
