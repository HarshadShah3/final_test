import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBarrierAssessment } from '../src/utils/barrierAssessment.js';

const region = { medianHousePrice: 600000 };

function context(scores, extra = {}) {
  return {
    priorityBreakdown: scores.map(([priority, score, scored = true]) => ({ priority, score, scored })),
    ...extra,
  };
}

test('flags scored categories below 60 and explains the threshold', () => {
  const result = buildBarrierAssessment(region, context([['jobs', 59.9]]));
  assert.equal(result.status, 'barriers');
  assert.equal(result.barriers[0].id, 'priority-jobs');
  assert.match(result.barriers[0].description, /59\.9\/100/);
});

test('does not flag a category at the threshold', () => {
  const result = buildBarrierAssessment(region, context([['housing', 60]]));
  assert.equal(result.status, 'positive');
  assert.equal(result.barriers.length, 0);
});

test('ignores unavailable priority scores', () => {
  const result = buildBarrierAssessment(region, context([['population', 0, false]]));
  assert.equal(result.status, 'unavailable');
});

test('returns every low category without a second scoring pass', () => {
  const result = buildBarrierAssessment(region, context([['housing', 42], ['jobs', 51], ['population', 80]]));
  assert.deepEqual(result.barriers.map(barrier => barrier.id), ['priority-housing', 'priority-jobs']);
});

test('flags a saved hard house-price constraint', () => {
  const result = buildBarrierAssessment(region, context([['jobs', 80]], {
    constraints: { housePrice: 'under550k' },
  }));
  assert.equal(result.barriers[0].id, 'house-price-limit');
  assert.equal(result.barriers[0].severity, 'critical');
});

test('flags a future maximum-distance constraint using the existing distance result', () => {
  const result = buildBarrierAssessment(region, context([['jobs', 80]], {
    constraints: { maxDistanceKm: 100 },
    locationAdjustment: { distanceKm: 140 },
  }));
  assert.equal(result.barriers[0].id, 'distance-limit');
});

test('does not claim a positive result when no score snapshot exists', () => {
  const result = buildBarrierAssessment(region, null);
  assert.equal(result.status, 'unavailable');
  assert.match(result.description, /could not be calculated/);
});
