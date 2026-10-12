import assert from 'node:assert/strict';
import test from 'node:test';
import { regionalDataMeta } from '../src/data/regions.js';
import { findRegionById, findRegions } from '../src/services/regionService.js';

test('filters regions by state and population band', () => {
  const regions = findRegions({ state: 'VIC', population: 'small' });
  assert.ok(regions.length > 1);
  assert.ok(regions.every(region => region.state === 'VIC' && region.population < 100000));
  assert.ok(regions.some(region => region.id === 'wodonga'));
});

test('supports the population filters used by the frontend', () => {
  const overFiftyThousand = findRegions({ population: 'over50k' });
  const tenToFiftyThousand = findRegions({ population: '10kTo50k' });
  assert.ok(overFiftyThousand.length > 3);
  assert.ok(overFiftyThousand.every(region => region.population >= 50000));
  assert.ok(tenToFiftyThousand.length > 1);
  assert.ok(tenToFiftyThousand.every(region => region.population >= 10000 && region.population < 50000));
});

test('supports the detailed population filters on the explore page', () => {
  const populationBands = [
    ['under10k', population => population < 10000],
    ['10kTo20k', population => population >= 10000 && population < 20000],
    ['20kTo30k', population => population >= 20000 && population < 30000],
    ['30kTo50k', population => population >= 30000 && population < 50000],
    ['50kTo100k', population => population >= 50000 && population < 100000],
    ['over100k', population => population >= 100000],
  ];

  for (const [population, isInBand] of populationBands) {
    const regions = findRegions({ state: 'VIC', population });
    assert.ok(regions.length > 0, `${population} should return at least one region`);
    assert.ok(regions.every(region => isInBand(region.population)));
  }
});

test('supports the available house-price filters on the explore page', () => {
  const priceBands = [
    ['under550k', price => price < 550000],
    ['550kTo700k', price => price >= 550000 && price < 700000],
    ['over700k', price => price >= 700000],
  ];

  for (const [housePrice, isInBand] of priceBands) {
    const regions = findRegions({ state: 'VIC', housePrice });
    assert.ok(regions.length > 0, `${housePrice} should return at least one region with available data`);
    assert.ok(regions.every(region => isInBand(region.medianHousePrice)));
  }
});

test('loads all 56 team-profile regions', () => {
  assert.equal(findRegions({}).length, 56);
});

test('loads reviewed housing, employment and education fields', () => {
  const ballarat = findRegionById('ballarat');
  assert.equal(ballarat?.medianRent, 420);
  assert.equal(ballarat?.priceToIncomeRatio, 7.67);
  assert.equal(ballarat?.occupationVacancies, 901);
  assert.equal(ballarat?.schoolCount, 48);
  assert.equal(ballarat?.dataAvailability.education, 'team-reviewed');
  assert.equal(ballarat?.employmentGeography.level, 'SA4');
});

test('loads a validated price-to-income ratio for every LGA', () => {
  const regions = findRegions({});
  assert.ok(regions.every(region => Number.isFinite(region.priceToIncomeRatio) && region.priceToIncomeRatio > 0));
  assert.equal(findRegionById('queenscliffe')?.priceToIncomeRatio, 17.2);
});

test('publishes source provenance and quality metadata', () => {
  assert.equal(regionalDataMeta.regionCount, 56);
  assert.equal(regionalDataMeta.profileDelivery, 'csv-build');
  assert.equal(regionalDataMeta.regionalProfileSourceRows, 56);
  assert.equal(regionalDataMeta.reviewedProfileSourceRows, 56);
  assert.equal(regionalDataMeta.priceToIncomeSourceRows, 56);
  assert.equal(regionalDataMeta.regionalProfileQuality.missingCellCount, 0);
  assert.equal(regionalDataMeta.sourceCatalog['regional-profiles-reviewed-csv'].file, 'regional_profiles_reviewed.csv');
  assert.equal(regionalDataMeta.sourceCatalog['iteration-1-master-csv'].file, 'vic_reg_iteration_1_lga_master_data.csv');
  assert.equal(regionalDataMeta.sourceCatalog['housing-price-to-income-csv'].file, 'price_to_income_ratio_lga.csv');
  assert.match(regionalDataMeta.geographicWarning, /SA4-level/);
  assert.match(regionalDataMeta.priceToIncomeWarning, /2025.*2021/);
  assert.equal(findRegionById('queenscliffe')?.dataProvenance.fieldSources.priceToIncomeRatio, 'housing-price-to-income-csv');
});

test('maps every import-fixture profile field to a declared source', () => {
  for (const region of findRegions({})) {
    assert.equal(region.dataProvenance.delivery, 'csv-build');
    const profileFields = Object.keys(region).filter(field => field !== 'dataProvenance');
    assert.ok(profileFields.every(field => region.dataProvenance.fieldSources[field]));
    assert.ok(Object.values(region.dataProvenance.fieldSources)
      .every(sourceId => regionalDataMeta.sourceCatalog[sourceId]));
  }
});
