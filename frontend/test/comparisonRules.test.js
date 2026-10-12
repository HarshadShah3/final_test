import assert from 'node:assert/strict';
import test from 'node:test';
import { comparisonDirections, comparisonWinner } from '../src/utils/comparisonRules.js';

test('bolds the correct side for approved higher-is-stronger and lower-is-stronger metrics', () => {
  assert.equal(comparisonWinner(comparisonDirections.medianIncome, 80_000, 75_000), 'A');
  assert.equal(comparisonWinner(comparisonDirections.medianRent, 420, 460), 'A');
  assert.equal(comparisonWinner(comparisonDirections.crimeRate, 75, 60), 'B');
  assert.equal(comparisonWinner(comparisonDirections.publicTransportFrequency, 12.5, 18.2), 'B');
});

test('does not bold ties, missing values or metrics without an approved direction', () => {
  assert.equal(comparisonWinner('higher', 10, 10), null);
  assert.equal(comparisonWinner('higher', null, 10), null);
  assert.equal(comparisonWinner(undefined, 20, 10), null);
});

test('does not classify scale-dependent totals or contextual growth figures as stronger', () => {
  const excludedMetrics = [
    'population',
    'populationGrowth',
    'homeOwnershipPercentage',
    'rentalListingsMarch2025',
    'occupationVacancies',
    'totalEmployment',
    'schoolCount',
    'primarySchoolCount',
    'secondarySchoolCount',
    'hospitalCount',
    'generalPracticeCount',
    'emergencyDepartmentCount',
    'populationGrowth2001To2025',
    'populationCagr2001To2025',
  ];

  for (const metric of excludedMetrics) {
    assert.equal(comparisonDirections[metric], undefined, `${metric} must remain contextual rather than ranked`);
  }
});
