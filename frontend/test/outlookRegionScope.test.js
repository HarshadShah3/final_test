import assert from 'node:assert/strict';
import test from 'node:test';
import { parseComparisonRegionIds, selectOutlookRegionIds } from '../src/utils/outlookRegionScope.js';

test('preserves only selected comparison regions in the outlook', () => {
  const requested = parseComparisonRegionIds('ballarat,greater-bendigo,ballarat');
  assert.deepEqual(requested, ['ballarat', 'greater-bendigo']);
  assert.deepEqual(
    selectOutlookRegionIds(['ballarat', 'greater-bendigo', 'mildura'], requested, ['mildura']),
    ['ballarat', 'greater-bendigo'],
  );
});

test('ignores URL region IDs outside the available map selection and shortlist', () => {
  assert.deepEqual(
    selectOutlookRegionIds(['ballarat', 'mildura'], ['unknown', 'mildura'], ['ballarat']),
    ['mildura'],
  );
  assert.deepEqual(
    selectOutlookRegionIds(['ballarat', 'mildura'], ['unknown'], ['ballarat']),
    ['ballarat', 'mildura'],
  );
});
