import assert from 'node:assert/strict';
import test from 'node:test';
import { describeRegionProximity } from '../src/utils/proximityCopy.js';

test('identifies the user-entered starting region instead of describing it as 0 km away', () => {
  assert.equal(
    describeRegionProximity({ distanceKm: '0', referenceRegion: 'Ballarat' }),
    'This is the region you entered as your starting point.',
  );
});

test('describes non-zero distances as close, moderate or far', () => {
  assert.match(describeRegionProximity({ distanceKm: 50, referenceRegion: 'Ballarat' }), /close to Ballarat/);
  assert.match(describeRegionProximity({ distanceKm: 115, referenceRegion: 'Ballarat' }), /moderate distance from Ballarat/);
  assert.match(describeRegionProximity({ distanceKm: 151, referenceRegion: 'Ballarat' }), /far from Ballarat/);
});

test('does not turn a missing or invalid distance into proximity guidance', () => {
  assert.match(describeRegionProximity({ distanceKm: null }), /not available/);
  assert.match(describeRegionProximity({ distanceKm: 'unknown' }), /not available/);
});
