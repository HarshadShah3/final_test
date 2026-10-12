import assert from 'node:assert/strict';
import test from 'node:test';
import { databaseConfiguration } from '../src/database/aivenClient.js';
import { buildForecastResponse, getRegionalForecasts, parseForecastRegionIds } from '../src/services/forecastService.js';

const source = {
  provider: 'Victoria in Future (VIF)',
  datasetName: 'VIF LGA housing projections',
  datasetVersion: 'VIF 2023',
};

function row(lgaCode, referenceYear, population, households, dwellings) {
  return { lgaCode, referenceYear, population, households, dwellings, ...source };
}

function modelRow(overrides) {
  return {
    targetMetric: 'population_lga',
    modelName: 'anchored-damped-trend',
    modelVersion: 'iteration3-v1.0.0',
    unit: 'people',
    mae: 1817.21,
    mapePct: 1.36,
    areaCode: '20570',
    areaName: 'Ballarat',
    areaType: 'LGA',
    mappedLgaCode: null,
    targetDate: '2050-06-30',
    predictedValue: 166742,
    lowerBound: 154892,
    upperBound: 178592,
    ...overrides,
  };
}

test('validates and de-duplicates forecast region IDs', () => {
  assert.deepEqual(parseForecastRegionIds('ballarat,bendigo,ballarat'), ['ballarat', 'bendigo']);
  assert.throws(() => parseForecastRegionIds(''), /at least one/);
  assert.throws(() => parseForecastRegionIds('not-a-region'), /Unknown Victorian region/);
  assert.throws(() => parseForecastRegionIds('ballarat,bendigo,mildura,melton,moira'), /no more than 4/);
});

test('builds a 2021-2036 VIF forecast response without inventing confidence intervals', () => {
  const response = buildForecastResponse(['ballarat'], [
    row('20570', 2021, 110000, 45000, 50000),
    row('20570', 2026, 116000, 48000, 53000),
    row('20570', 2031, 123000, 51000, 57000),
    row('20570', 2036, 131000, 55000, 61000),
  ]);

  assert.equal(response.meta.source, 'aiven-mysql');
  assert.equal(response.meta.isForecastBackendConnected, true);
  assert.equal(response.meta.projectionYear, 2036);
  assert.equal(response.meta.scenario, 'published-vif-projection');
  assert.equal(response.meta.confidenceLevel, null);
  assert.equal(response.data[0].series.population.length, 4);
  assert.equal(response.data[0].series.population.at(-1).value, 131000);
  assert.equal(response.data[0].series.population.at(-1).confidenceLow, null);
  assert.equal(response.data[0].indicators.find(item => item.id === 'population').projected, 131000);
  assert.equal(response.data[0].indicators.some(item => item.id === 'schools'), false);
});

test('includes the reviewed 2001 and 2025 population observations before projections', () => {
  const historicalRow = {
    ...row('20570', 2021, 110000, 45000, 50000),
    population2001: 85600,
    population2025: 114900,
  };
  const response = buildForecastResponse(['ballarat'], [
    historicalRow,
    row('20570', 2026, 116000, 48000, 53000),
    row('20570', 2031, 123000, 51000, 57000),
    row('20570', 2036, 131000, 55000, 61000),
  ]);

  assert.deepEqual(
    response.data[0].series.population.map(point => point.year),
    [2001, 2021, 2025, 2026, 2031, 2036],
  );
  assert.equal(response.data[0].series.population[0].value, 85600);
  assert.equal(response.data[0].series.population[2].value, 114900);
});

test('builds a modelled 2050 response with a 90 percent interval and auxiliary indicators', () => {
  const official = [
    row('20570', 2021, 110000, 45000, 50000),
    row('20570', 2026, 116000, 48000, 53000),
    row('20570', 2031, 123000, 51000, 57000),
    row('20570', 2036, 131000, 55000, 61000),
  ];
  const modelRows = [
    modelRow({ targetMetric: 'population_lga', targetDate: '2041-06-30', predictedValue: 154058, lowerBound: 151017, upperBound: 157099 }),
    modelRow({ targetMetric: 'population_lga', targetDate: '2050-06-30', predictedValue: 166742, lowerBound: 154892, upperBound: 178592 }),
    modelRow({ targetMetric: 'median_weekly_rent_aud', unit: 'AUD', targetDate: '2050-06-30', predictedValue: 566.7, lowerBound: 364.1, upperBound: 769.3 }),
    modelRow({ targetMetric: 'affordable_lettings_share', unit: 'share', targetDate: '2050-06-30', predictedValue: 0.6, lowerBound: 0.4, upperBound: 0.9 }),
    modelRow({ targetMetric: 'median_house_price_aud', unit: 'AUD', targetDate: '2050-06-30', predictedValue: 891000, lowerBound: 579000, upperBound: 1200000 }),
    modelRow({ targetMetric: 'employment_sa4', unit: 'persons', areaCode: '201', areaName: 'Ballarat', areaType: 'SA4', mappedLgaCode: '20570', targetDate: '2050-06-30', predictedValue: 115581, lowerBound: 107190, upperBound: 123972 }),
  ];
  const observedRows = [
    { metric: 'median_weekly_rent_aud', lgaCode: '20570', year: 2025, value: 418.3 },
    { metric: 'affordable_lettings_share', lgaCode: '20570', year: 2025, value: 0.7 },
    { metric: 'employment_sa4', lgaCode: '20570', year: 2026, value: 98000 },
  ];

  const response = buildForecastResponse(['ballarat'], official, modelRows, observedRows);
  const region = response.data[0];

  assert.equal(response.meta.projectionYear, 2050);
  assert.equal(response.meta.officialProjectionYear, 2036);
  assert.equal(response.meta.scenario, 'modelled-projection');
  assert.equal(response.meta.confidenceLevel, 0.9);
  assert.equal(region.projectionYear, 2050);
  assert.equal(region.confidenceLevel, 0.9);

  const population = region.series.population;
  assert.equal(population.at(-1).year, 2050);
  assert.equal(population.at(-1).value, 166742);
  assert.equal(population.at(-1).confidenceLow, 154892);
  assert.equal(population.at(-1).confidenceHigh, 178592);
  assert.equal(population.at(-1).modelled, true);
  // Published 2021/2026 points are preserved.
  assert.equal(population[0].value, 110000);
  assert.equal(population[0].modelled, false);

  // Affordability is stored as a 0-1 share and presented as a percentage.
  const affordableShare = region.indicators.find(item => item.id === 'affordableShare');
  assert.equal(affordableShare.unit, 'percent');
  assert.equal(affordableShare.projected, 60);

  const employment = region.indicators.find(item => item.id === 'employment');
  assert.equal(employment.projected, 115581);
  assert.equal(employment.baseline, 98000);
  assert.equal(employment.confidenceLow, 107190);

  const propertyPrice = region.indicators.find(item => item.id === 'propertyPrice');
  assert.equal(propertyPrice.projected, 891000);
  assert.equal(region.series.propertyPrice.at(-1).confidenceHigh, 1200000);

  const rent = region.indicators.find(item => item.id === 'medianRent');
  assert.equal(rent.baseline, 418.3);
  assert.equal(rent.projected, 566.7);
});

test('queries only the selected LGA codes and the reviewed projection years', async () => {
  const calls = [];
  const query = async (sql, parameters) => {
    calls.push({ sql, parameters });
    if (/FROM model_prediction/.test(sql)) return [];
    if (/stg_historical_median_rent_lga_trend/.test(sql)) return [];
    return [
      row('20570', 2021, 110000, 45000, 50000),
      row('20570', 2036, 131000, 55000, 61000),
      row('22620', 2021, 121000, 49000, 55000),
      row('22620', 2036, 150000, 62000, 69000),
    ];
  };

  const response = await getRegionalForecasts(['ballarat', 'bendigo'], query);
  const baseline = calls.find(call => /php\.reference_year IN \(2021, 2026, 2031, 2036\)/.test(call.sql));
  assert.ok(baseline, 'expected a baseline VIF query');
  assert.deepEqual(baseline.parameters, ['20570', '22620']);

  const model = calls.find(call => /FROM model_prediction/.test(call.sql));
  assert.ok(model, 'expected a model prediction query');
  assert.deepEqual(model.parameters, ['20570', '22620', '20570', '22620']);

  const observed = calls.find(call => /stg_historical_median_rent_lga_trend/.test(call.sql));
  assert.ok(observed, 'expected an observed history query');
  assert.deepEqual(observed.parameters, ['20570', '22620', '20570', '22620', '20570', '22620']);

  assert.deepEqual(response.data.map(item => item.region.id), ['ballarat', 'bendigo']);
});

test('reports an invalid CA path as an incomplete database configuration', () => {
  const configuration = databaseConfiguration({
    DB_HOST: 'example.aivencloud.com',
    DB_PORT: '27679',
    DB_USER: 'avnadmin',
    DB_PASSWORD: 'not-a-real-secret',
    DB_NAME: 'simulate_australia_2050_v2',
    DB_SSL_CA_PATH: 'Z:/missing/aiven-ca.pem',
  });

  assert.equal(configuration.configured, false);
  assert.deepEqual(configuration.missing, ['valid DB_SSL_CA_PATH']);
});
