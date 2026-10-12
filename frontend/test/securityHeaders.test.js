import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer, preview } from 'vite';
import { frontendSecurityHeaders } from '../securityHeaders.js';

const root = fileURLToPath(new URL('../', import.meta.url));

test('hosting policies match the frontend policy and preserve separate API headers', async () => {
  const vercel = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'));
  const netlify = await readFile(new URL('../../netlify.toml', import.meta.url), 'utf8');
  const rule = vercel.headers[0];
  const matcher = new RegExp(`^${rule.source}$`);
  for (const path of ['/', '/preferences', '/towards-2050', '/assets/app.js']) {
    assert.ok(matcher.test(path));
  }
  for (const path of ['/api', '/api/health', '/api/auth/status']) {
    assert.equal(matcher.test(path), false);
  }
  assert.deepEqual(Object.fromEntries(rule.headers.map(({ key, value }) => [key, value])), frontendSecurityHeaders());
  const headerBlock = netlify.split('[[headers]]')[1];
  assert.match(headerBlock, /for = "\/\*"/);
  for (const [key, value] of Object.entries(frontendSecurityHeaders())) {
    assert.ok(headerBlock.includes(`${key} = ${JSON.stringify(value)}`), `Netlify header: ${key}`);
  }
});

test('production CSP blocks inline scripts and unapproved connections; development allows local API and HMR', () => {
  const production = frontendSecurityHeaders()['Content-Security-Policy'];
  assert.ok(production.includes("script-src 'self';"));
  assert.ok(production.includes("connect-src 'self';"));
  assert.ok(production.includes("frame-ancestors 'none'"));
  assert.ok(!production.includes('unsafe-eval'));
  const development = frontendSecurityHeaders({ development: true })['Content-Security-Policy'];
  assert.ok(development.includes('http://127.0.0.1:3001'));
  assert.ok(development.includes('ws://127.0.0.1:*'));
  const external = frontendSecurityHeaders({ apiBaseUrl: 'https://api.example.test/api' })['Content-Security-Policy'];
  assert.ok(external.includes("connect-src 'self' https://api.example.test;"));
});

for (const production of [false, true]) {
  test(`${production ? 'preview' : 'dev'} server sends security headers on HTML and direct page links`, { timeout: 15000 }, async t => {
    const config = {
      root,
      // These are HTTP document tests; skip background dependency prebundling.
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { port: 0, strictPort: false },
      preview: { port: 0, strictPort: false },
    };
    const server = production ? await preview(config) : await createServer(config);
    if (!production) await server.listen();
    t.after(() => {
      server.httpServer.closeAllConnections();
      return server.close();
    });
    const { port } = server.httpServer.address();
    for (const path of ['/', '/preferences', '/towards-2050']) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/html/);
      for (const [key, value] of Object.entries(frontendSecurityHeaders({ development: !production }))) {
        assert.equal(response.headers.get(key), value, `${path}: ${key}`);
      }
      assert.match(await response.text(), /<title>Australia 2050<\/title>/);
    }
  });
}
