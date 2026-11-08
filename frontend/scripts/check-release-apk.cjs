// npm run check:apk (SECURITY_PLAN S6.2, S6.3, S6.4, S6.9): looks inside the built release APK, which is what
// people actually get. Build it first: android\gradlew.bat app:assembleRelease
// Reads the JS bundle's bytes, the merged manifest and the signing certificate. Prints what it
// finds, never a whole key.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const apk = process.argv[2] ?? path.join(__dirname, '../android/app/build/outputs/apk/release/app-release.apk');
if (!fs.existsSync(apk)) throw new Error(`No APK at ${apk}: build it first`);
const sdk = process.env.ANDROID_HOME ?? path.join(os.homedir(), 'AppData/Local/Android/Sdk');
const buildTools = path.join(sdk, 'build-tools');
const newest = fs.readdirSync(buildTools).sort().pop();
const tool = name => path.join(buildTools, newest, process.platform === 'win32' ? `${name}.exe` : name);

const problems = [];
const check = (ok, text) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`);
  if (!ok) problems.push(text);
};

// ── The merged manifest: what libraries added too ──
const permissions = execFileSync(tool('aapt2'), ['dump', 'permissions', apk], { encoding: 'utf8' })
  .split(/\r?\n/)
  .map(line => /name='([^']+)'/.exec(line)?.[1])
  .filter(Boolean);
console.log('Permissions in the release APK:\n  ' + permissions.join('\n  '));
const DANGEROUS_UNUSED = ['CAMERA', 'RECORD_AUDIO', 'READ_CONTACTS', 'READ_SMS', 'CALL_PHONE', 'SYSTEM_ALERT_WINDOW', 'READ_PHONE_STATE', 'ACCESS_BACKGROUND_LOCATION', 'WRITE_EXTERNAL_STORAGE', 'READ_EXTERNAL_STORAGE', 'REQUEST_INSTALL_PACKAGES'];
for (const name of DANGEROUS_UNUSED) check(!permissions.some(p => p.endsWith(`.${name}`)), `no ${name}`);
const manifest = execFileSync(tool('aapt2'), ['dump', 'xmltree', '--file', 'AndroidManifest.xml', apk], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const flag = name => new RegExp(`android:${name}\\(0x[0-9a-f]+\\)=(\\S+)`).exec(manifest)?.[1];
check(flag('allowBackup') === 'false', 'backups off (allowBackup=false)');
check(flag('usesCleartextTraffic') === 'false', 'plain http off (usesCleartextTraffic=false)');
check(flag('debuggable') !== 'true', 'not debuggable');

// ── The JS bundle ──
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sahla-apk-'));
try {
  const asZip = path.join(dir, 'app.zip');
  fs.copyFileSync(apk, asZip);
  execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${asZip}' -DestinationPath '${path.join(dir, 'x')}'`], { stdio: 'ignore' });
  const bundleFile = path.join(dir, 'x/assets/index.android.bundle');
  const bundle = fs.readFileSync(bundleFile);
  const text = bundle.toString('latin1');
  console.log(`JS bundle: ${(bundle.length / 1024 / 1024).toFixed(1)} MB`);
  const has = needle => text.includes(needle);

  check(has('https://api.sahla.jo/v1'), 'the real API address is there');
  check(!has('10.0.2.2'), 'no emulator address (10.0.2.2)');
  check(!/localhost:\d/.test(text), 'no localhost address');
  check(!/http:\/\/(?!www\.w3\.org|schemas\.|ns\.)[a-z0-9.-]+\.(?:jo|com)\//i.test(text), 'no plain-http address to a server');

  const keys = { 'Google API key': /AIza[0-9A-Za-z_-]{35}/g, 'Anthropic key': /sk-ant-[0-9A-Za-z_-]{20,}/g, 'store key': /sahla_sk_[0-9A-Za-z_-]{20,}/g, 'private key': /-----BEGIN [A-Z ]*PRIVATE KEY/g, 'AWS key': /AKIA[0-9A-Z]{16}/g };
  for (const [kind, pattern] of Object.entries(keys)) check(!pattern.test(text), `no ${kind} in the bundle`);
  // The one key the app legitimately holds: Firebase's client key, not in the JS but in resources.
  const resources = fs.readFileSync(path.join(dir, 'x/resources.arsc')).toString('latin1');
  const firebase = resources.match(/AIza[0-9A-Za-z_-]{35}/g) ?? [];
  console.log(`INFO  ${new Set(firebase).size} Firebase client key in the resources (public by design; S0.7: the owner restricts it)`);

  // What the in-app demo would leave behind. (sahla1234 itself is fine: it's on the refused-passwords list.)
  for (const [needle, what] of [['ahmad@sahla.jo', 'a demo account'], ['courier@sahla.jo', 'the demo driver'], ['Demo account', 'the demo log-in hint'], ['mock_', 'mock card tokens'], ['readMockTable', 'the mock services'], ['@demo.sahla.jo', 'demo sellers']])
    check(!has(needle), `no ${what} ("${needle}")`);

  // console.* calls left in our code: a marker only we use.
  check(!has('[crash:'), 'our __DEV__-only logging is gone');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── The signature ──
try {
  const cert = execFileSync(path.join(buildTools, newest, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner'), ['verify', '--print-certs', apk], { encoding: 'utf8', shell: process.platform === 'win32' });
  const signer = /certificate DN: (.*)/.exec(cert)?.[1] ?? 'unknown';
  console.log(`INFO  signed by: ${signer}`);
  if (/Android Debug/i.test(signer)) console.log('INFO  a local APK only. bundleRelease, the Play Store file, refuses this key (S0.3).');
} catch (error) {
  console.log(`INFO  couldn't read the signature: ${error.message.split('\n')[0]}`);
}

console.log(problems.length ? `${problems.length} problems.` : 'No problems found.');
process.exit(problems.length ? 1 : 0);
