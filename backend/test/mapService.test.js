import assert from 'node:assert/strict';
import test from 'node:test';
import { getMapRegion, getMapRegions, supportedMapMetrics } from '../src/services/mapService.js';

test('returns all 56 official LGA polygon features for the explore map', () => {
  const collection = getMapRegions();
  assert.equal(collection.type, 'FeatureCollection');
  assert.equal(collection.features.length, 56);
  assert.equal(collection.bbox.length, 4);
  assert.equal(collection.stateBoundary.properties.stateName, 'Victoria');
  assert.ok(['Polygon', 'MultiPolygon'].includes(collection.stateBoundary.geometry.type));
  assert.ok(collection.features.every(feature => ['Polygon', 'MultiPolygon'].includes(feature.geometry.type)));
  assert.match(collection.metadata.boundarySource.source, /Australian Bureau of Statistics/);
  assert.match(collection.metadata.stateBoundarySource.source, /Australian Bureau of Statistics/);
});

test('joins backend regional metrics to the map features', () => {
  const ballarat = getMapRegion('ballarat', 'medianRent');
  assert.equal(ballarat.properties.lgaCode, 'LGA20570');
  assert.equal(ballarat.properties.metric.value, 420);
  assert.equal(ballarat.properties.metric.unit, 'AUD per week');
  assert.equal(ballarat.properties.metric.source.file, 'vic_reg_iteration_1_lga_master_data.csv');
  assert.equal(ballarat.properties.medianHousePrice, 570000);
  assert.equal(ballarat.properties.projectionYear, 2036);
});

test('filters map regions and exposes supported display metrics', () => {
  const collection = getMapRegions({ regionIds: 'geelong,wodonga', metric: 'projectedPopulation' });
  assert.deepEqual(collection.features.map(feature => feature.id), ['geelong', 'wodonga']);
  assert.equal(collection.metadata.selectedMetric, 'projectedPopulation');
  assert.deepEqual(Object.keys(supportedMapMetrics), ['population', 'medianRent', 'jobVacancies', 'schools', 'projectedPopulation']);
});
