// Static checks over the app's source and native files (SECURITY_PLAN S6): what a release can
// contain, and that nobody forgets a screen-reader label or a hidden screen.

const { readFileSync, readdirSync } = jest.requireActual('fs') as {
  readFileSync: (file: string, encoding: 'utf8') => string;
  readdirSync: (dir: string, options: { withFileTypes: true }) => { name: string; isDirectory(): boolean }[];
};

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(`${dir}/${entry.name}`) : /\.tsx?$/.test(entry.name) ? [`${dir}/${entry.name}`] : [],
  );
const files = walk('src').map(file => ({ file, text: readFileSync(file, 'utf8') }));
const tappable = (text: string) => {
  const blocks: string[] = [];
  const open = /<(Pressable|TouchableOpacity)\b/g;
  let match: RegExpExecArray | null;
  while ((match = open.exec(text))) {
    const end = text.indexOf(`</${match[1]}>`, match.index);
    blocks.push(text.slice(match.index, end < 0 ? match.index + 800 : end));
  }
  return blocks;
};

test('S6.3 no secret key in the app: only the public Google client id', () => {
  const secret = /AIza[0-9A-Za-z_-]{20,}|sk-ant-|POSTMARK|GOOGLE_VISION|GOOGLE_MAPS_API_KEY|-----BEGIN|sahla_sk_[A-Za-z0-9]/;
  for (const { file, text } of files) expect([file, secret.test(text)]).toEqual([file, false]);
});

test('S6.2 release builds use only the real API over https, and no service is on mock data', () => {
  const config = readFileSync('src/config.ts', 'utf8');
  expect(config).toMatch(/apiBaseUrl: __DEV__ \? 'http:\/\/10\.0\.2\.2:4000\/v1' : 'https:\/\/api\.sahla\.jo\/v1'/);
  const mock = config.slice(config.indexOf('mock: {'), config.indexOf('},', config.indexOf('mock: {')));
  expect(mock).not.toMatch(/: true/);
  // Nothing else in the app hard-codes a test address.
  for (const { file, text } of files)
    if (file !== 'src/config.ts') expect([file, /10\.0\.2\.2|localhost:\d/.test(text)]).toEqual([file, false]);
});

test('S6.4 release builds strip console.*; the app logs nothing outside __DEV__', () => {
  expect(readFileSync('babel.config.js', 'utf8')).toContain('transform-remove-console');
  for (const { file, text } of files)
    for (const line of text.split('\n'))
      if (/console\.(log|warn|error|info|debug)\(/.test(line)) expect([file, line.includes('__DEV__')]).toEqual([file, true]);
});

test('S6.5 every screen with a delivery PIN, card number or bank account hides from screenshots', () => {
  for (const file of [
    'src/features/orders/screens/OrderTrackingScreen.tsx',
    'src/features/courier/screens/DeliveryScreen.tsx',
    'src/features/checkout/screens/CheckoutScreen.tsx',
    'src/features/orders/screens/PayoutAccountScreen.tsx',
  ])
    expect([file, readFileSync(file, 'utf8').includes('useSecureScreen(')]).toEqual([file, true]);
  // The profile's card form too, while it's open.
  expect(readFileSync('src/features/auth/screens/ProfileScreen.tsx', 'utf8')).toContain('useSecureScreen(');
  const native = readFileSync('android/app/src/main/java/com/sahla/ScreenSecurityModule.kt', 'utf8');
  expect(native).toContain('FLAG_SECURE');
  expect(readFileSync('android/app/src/main/java/com/sahla/MainApplication.kt', 'utf8')).toContain('ScreenSecurityPackage');
});

test('S6.9 the app asks only for the permissions it uses', () => {
  const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
  const asked = [...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map(m => m[1]).sort();
  expect(asked).toEqual([
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.INTERNET',
    'android.permission.POST_NOTIFICATIONS',
  ]);
  expect(manifest).toContain('android:allowBackup="false"');
});

test('accessibility: every tappable thing is a button to a screen reader, and icon-only ones have a label', () => {
  const noRole: string[] = [];
  const noLabel: string[] = [];
  for (const { file, text } of files)
    for (const block of tappable(text)) {
      const where = `${file}: ${block.slice(0, 80).replace(/\s+/g, ' ')}`;
      if (!block.includes('accessibilityRole')) noRole.push(where);
      const iconOnly = /<Icon\b|<SahlaLogo\b/.test(block) && !/<Text\b|<Ltr\b/.test(block);
      if (iconOnly && !block.includes('accessibilityLabel')) noLabel.push(where);
    }
  expect(noRole).toEqual([]);
  expect(noLabel).toEqual([]);
});

test('the app’s name is translated', () => {
  expect(readFileSync('android/app/src/main/res/values-ar/strings.xml', 'utf8')).toContain('سهلة');
});
