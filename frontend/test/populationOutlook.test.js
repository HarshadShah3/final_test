import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPopulationOutlook } from '../src/utils/populationOutlook.js';

test('classifies projected growth with the same bands on both pages', () => {
  assert.equal(classifyPopulationOutlook(100, 130).growthBand, 'High growth');
  assert.equal(classifyPopulationOutlook(100, 110).growthBand, 'Moderate growth');
  assert.equal(classifyPopulationOutlook(100, 102).growthBand, 'Stable or declining');
  assert.equal(classifyPopulationOutlook(100, 90).growthBand, 'Stable or declining');
});

test('does not invent an outlook where projection data is absent', () => {
  assert.equal(classifyPopulationOutlook(0, 120), null);
  assert.equal(classifyPopulationOutlook(100, null), null);
});
