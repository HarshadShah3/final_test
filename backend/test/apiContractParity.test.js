import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { accessCookieName, createAccessToken } from '../src/accessControl.js';

const { default: vercelApi } = await import('../../api/index.js');

test('Express and deployment API agree on regional scope and recommendation metadata', async t => {
  const previousPasswordHash = process.env.SITE_PASSWORD_HASH;
  const previousSessionSecret = process.env.SESSION_SECRET;
  process.env.SITE_PASSWORD_HASH = createHash('sha256').update('test-password').digest('hex');
  process.env.SESSION_SECRET = 'test-session-secret-with-more-than-32-characters';
  const cookie = `${accessCookieName}=${encodeURIComponent(createAccessToken())}`;
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
  const origin = `http://127.0.0.1:${server.address().port}`;

  async function compare(method, path, body) {
    const init = body ? {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    } : { method, headers: { cookie } };
    const [expressResponse, deploymentResponse] = await Promise.all([
      fetch(`${origin}${path}`, init),
      vercelApi.fetch(new Request(`https://example.test${path}`, init)),
    ]);
    assert.equal(expressResponse.status, deploymentResponse.status);
    const [expressBody, deploymentBody] = await Promise.all([
      expressResponse.json(),
      deploymentResponse.json(),
    ]);
    assert.deepEqual(deploymentBody, expressBody);
    return expressBody;
  }

  const outsideVictoria = await compare('POST', '/api/recommendations', {
    priorities: ['jobs'], location: 'Adelaide', resultLimit: 4,
  });
  assert.ok(outsideVictoria.errors.some(error => error.field === 'location'));

  const recommendation = await compare('POST', '/api/recommendations', {
    priorities: ['jobs'], location: 'Ballarat', resultLimit: 1,
  });
  assert.equal(recommendation.meta.stateScope, 'VIC');
  assert.equal(recommendation.meta.locationWeightPercentage, 30);
  assert.ok(recommendation.data[0].priorityBreakdown[0].factors.length > 0);

  const regions = await compare('GET', '/api/regions?state=VIC&population=under10k');
  assert.ok(regions.data.every(region => region.state === 'VIC'));
  assert.equal(regions.meta.profileDelivery, 'csv-build');
  await compare('GET', '/api/regions/ballarat');
  const unknownRegion = await compare('GET', '/api/regions/not-a-region');
  assert.equal(unknownRegion.message, 'Regional profile not found.');

  const databaseHealth = await compare('GET', '/api/forecasts/health');
  assert.equal(databaseHealth.connected, false);
  assert.equal(databaseHealth.configured, false);
});
