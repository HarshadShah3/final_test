import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createApp } from '../src/app.js';

test('API responses include security headers without exposing Express', async t => {
  const server = createServer(createApp());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.equal(response.headers.get('permissions-policy'), 'camera=(), geolocation=(), microphone=()');
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(response.headers.get('x-powered-by'), null);

  const health = await response.json();
  assert.equal(health.buildLabel, '0915 1445');
  assert.equal(health.expectedDataProvider, 'aiven-mysql');
  assert.equal(health.localRuntimeFallback, false);
});
