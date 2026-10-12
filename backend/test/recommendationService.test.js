import assert from 'node:assert/strict';
import test from 'node:test';
import { recommendRegions, supportedPriorities, validateRecommendationRequest } from '../src/services/recommendationService.js';

test('accepts a valid recommendation request', () => {
  const validation = validateRecommendationRequest({
    priorities: ['population', 'housing', 'jobs'],
    location: 'Ballarat',
  });
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.value.location, 'Ballarat');
  assert.equal(validation.value.resultLimit, 4);
});

test('rejects more than three or unsupported priorities', () => {
  const validation = validateRecommendationRequest({
    priorities: ['population', 'housing', 'jobs', 'schools'],
    location: 'Clayton',
  });
  assert.ok(validation.errors.some(error => error.field === 'priorities'));
});

test('requires a usable regional area name', () => {
  const validation = validateRecommendationRequest({
    priorities: ['jobs'],
    location: '',
  });
  assert.deepEqual(validation.errors.map(error => error.field), ['location']);
});

test('keeps recommendation locations within the Victorian regions used by Compare', () => {
  const outsideVictoria = validateRecommendationRequest({ priorities: ['jobs'], location: 'Adelaide' });
  assert.ok(outsideVictoria.errors.some(error => error.field === 'location'));

  const unknownLocation = validateRecommendationRequest({ priorities: ['jobs'], location: 'Not a real region' });
  assert.ok(unknownLocation.errors.some(error => error.field === 'location'));

  const canonical = validateRecommendationRequest({ priorities: ['jobs'], location: 'Greater Bendigo' });
  assert.deepEqual(canonical.errors, []);

  const acceptedAlias = validateRecommendationRequest({ priorities: ['jobs'], location: 'Bendigo' });
  assert.deepEqual(acceptedAlias.errors, []);
});

test('returns only Victorian regions with plain-language reasons', () => {
  const recommendations = recommendRegions({
    priorities: ['population', 'housing', 'jobs'],
    location: 'Ballarat',
  });
  assert.equal(recommendations.length, 4);
  assert.ok(recommendations.every(item => item.region.state === 'VIC'));
  assert.ok(recommendations.every(item => item.reasons.length > 0));
  assert.ok(recommendations.every(item => Number.isInteger(item.matchScore)));
  assert.ok(recommendations.every(item => item.priorityBreakdown.length === 3));
  assert.ok(recommendations.every(item => item.outlook.projectionYear === 2036));
});

test('exposes the factor and overall weights behind the match percentage', () => {
  const [recommendation] = recommendRegions({
    priorities: ['population', 'housing', 'jobs'],
    location: 'Ballarat',
  });
  assert.equal(recommendation.locationAdjustment.weightPercentage, 30);
  assert.ok(Math.abs(recommendation.priorityBreakdown
    .reduce((total, priority) => total + priority.overallWeightPercentage, 0) - 70) < 0.02);

  for (const priority of recommendation.priorityBreakdown) {
    assert.ok(priority.factors.length >= 1);
    assert.ok(Math.abs(priority.factors.reduce((total, factor) => total + factor.weight, 0) - 1) < 0.00001);
    assert.ok(Math.abs(priority.factors.reduce((total, factor) => total + factor.score * factor.weight, 0) - priority.score) <= 0.005);
    assert.ok(priority.factors.every(factor => Array.isArray(factor.sourceFields) && Array.isArray(factor.sourceIds)));
    assert.ok(Math.abs(priority.factors
      .reduce((total, factor) => total + factor.overallWeightPercentage, 0) - priority.overallWeightPercentage) < 0.02);
  }
});

test('changes the leading match when user priorities change', () => {
  const jobsFirst = recommendRegions({ priorities: ['jobs'], location: 'Ballarat' });
  const housingFirst = recommendRegions({ priorities: ['housing'], location: 'Ballarat' });
  assert.notEqual(jobsFirst[0].region.id, housingFirst[0].region.id);
});

test('uses the three priorities available in the preference page', () => {
  assert.equal(supportedPriorities.length, 3);
  assert.deepEqual(supportedPriorities, [
    'population',
    'housing',
    'jobs',
  ]);
});

test('applies geographic proximity scores from the selected regional area', () => {
  const recommendations = recommendRegions({ priorities: ['jobs'], location: 'Ballarat', resultLimit:'all' });
  const ballarat = recommendations.find(item => item.region.id === 'ballarat');
  const bendigo = recommendations.find(item => item.region.id === 'bendigo');
  assert.equal(ballarat.locationAdjustment.applied, true);
  assert.equal(bendigo.locationAdjustment.applied, true);
  assert.equal(ballarat.locationAdjustment.weightPercentage, 30);
  assert.equal(bendigo.locationAdjustment.weightPercentage, 30);
  assert.equal(ballarat.locationAdjustment.distanceKm, 0);
  assert.ok(bendigo.locationAdjustment.distanceKm > 0);
  assert.ok(ballarat.locationAdjustment.proximityScore > bendigo.locationAdjustment.proximityScore);
});

test('gives location enough weight to change the recommended shortlist', () => {
  const ballaratResults = recommendRegions({ priorities: ['population', 'housing'], location: 'Ballarat' });
  const bendigoResults = recommendRegions({ priorities: ['population', 'housing'], location: 'Greater Bendigo' });
  assert.notDeepEqual(
    ballaratResults.map(item => item.region.id),
    bendigoResults.map(item => item.region.id),
  );
});

test('moves the shortlist geographically when the selected region changes', () => {
  const milduraResults = recommendRegions({ priorities: ['population', 'housing'], location: 'Mildura' });
  const ballaratResults = recommendRegions({ priorities: ['population', 'housing'], location: 'Ballarat' });
  assert.deepEqual(milduraResults.map(item => item.region.id), ['mildura', 'yarriambiack', 'hindmarsh', 'mitchell']);
  assert.notDeepEqual(milduraResults.map(item => item.region.id), ballaratResults.map(item => item.region.id));
});

test('returns either the top four or all 56 regional matches', () => {
  const topFour = recommendRegions({ priorities:['housing'], location:'Ballarat' });
  const allRegions = recommendRegions({ priorities:['housing'], location:'Ballarat', resultLimit:'all' });
  assert.equal(topFour.length, 4);
  assert.equal(allRegions.length, 56);
  assert.deepEqual(topFour.map(item => item.region.id), allRegions.slice(0, 4).map(item => item.region.id));
});

test('validates the recommendation result limit', () => {
  const validation = validateRecommendationRequest({ priorities:['housing'], location:'Ballarat', resultLimit:100 });
  assert.ok(validation.errors.some(error => error.field === 'resultLimit'));
});

test('filters candidates before selecting the top four recommendations', () => {
  const recommendations = recommendRegions({
    priorities: ['population'],
    location: 'Ballarat',
    population: 'under10k',
    resultLimit: 4,
  });
  assert.equal(recommendations.length, 4);
  assert.ok(recommendations.every(item => item.region.population < 10000));
});

test('validates recommendation population and house price filters', () => {
  const validation = validateRecommendationRequest({
    priorities: ['housing'],
    location: 'Ballarat',
    population: 'invalid-band',
    housePrice: 'invalid-band',
  });
  assert.ok(validation.errors.some(error => error.field === 'population'));
  assert.ok(validation.errors.some(error => error.field === 'housePrice'));
});
