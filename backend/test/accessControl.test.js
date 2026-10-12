import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import { createApp } from '../src/app.js';

test('password access protects API data and creates a valid session', async t => {
  const previousPasswordHash = process.env.SITE_PASSWORD_HASH;
  const previousSessionSecret = process.env.SESSION_SECRET;
  process.env.SITE_PASSWORD_HASH = createHash('sha256').update('test-password').digest('hex');
  process.env.SESSION_SECRET = 'test-session-secret-with-more-than-32-characters';

  const server = createServer(createApp());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (previousPasswordHash === undefined) delete process.env.SITE_PASSWORD_HASH;
    else process.env.SITE_PASSWORD_HASH = previousPasswordHash;
    if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSessionSecret;
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const deniedResponse = await fetch(`${baseUrl}/api/regions`);
  assert.equal(deniedResponse.status, 401);

  const invalidLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'wrong-password' }),
  });
  assert.equal(invalidLogin.status, 401);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'test-password' }),
  });
  assert.equal(loginResponse.status, 200);
  const cookie = loginResponse.headers.get('set-cookie');
  assert.match(cookie, /^australia2050_access=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);

  const authorisedResponse = await fetch(`${baseUrl}/api/regions`, {
    headers: { cookie },
  });
  assert.equal(authorisedResponse.status, 200);
});
