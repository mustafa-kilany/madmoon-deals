// B12.2: on a deploy the host sends SIGTERM: a request in progress finishes, then the server
// exits cleanly. Windows has no SIGTERM to send to a process, so this runs on Linux (CI).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';

test('SIGTERM finishes the request in progress, then exits with 0', { skip: process.platform === 'win32' ? 'SIGTERM needs Linux (CI runs it)' : false }, async () => {
  const port = 4190;
  const server = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  const exited = new Promise<number | null>(resolve => server.once('exit', resolve));
  const base = `http://127.0.0.1:${port}/v1`;
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    up = await fetch(`${base}/health`).then(r => r.ok, () => false);
  }
  assert.ok(up, 'the server started');
  const inProgress = fetch(`${base}/listings?limit=50`);
  server.kill('SIGTERM');
  assert.equal((await inProgress).status, 200, 'the request in progress got its answer');
  assert.equal(await exited, 0);
  assert.equal(await fetch(`${base}/health`).then(() => 'up', () => 'down'), 'down');
});
