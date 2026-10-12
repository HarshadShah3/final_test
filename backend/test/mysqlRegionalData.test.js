import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRegionalData } from '../src/data/mysqlRegionalData.js';

function mysqlFixture(regionCount = 56) {
  const regions = Array.from({ length: regionCount }, (_value, index) => ({
    code: String(20000 + index),
    name: `Region ${index}`,
  }));
  const masterRows = regions.map(({ code, name }) => ({
    lga_name: name,
    lga_code_2021_abs: code,
    dominant_sa4_name: 'Test SA4',
    dominant_sa4_code: '201',
    lga_population_overlap_with_dominant_sa4_pct: '100%',
    mapping_confidence: 'Accepted',
    population_2001: '900',
    population_2025: '1100',
    population_growth_pct_2001_2025: '22.2',
    population_cagr_pct_2001_2025: '0.8',
    vif_population_2021: '1000',
    vif_population_2026: '1100',
    vif_erp_2036_projected: '1300',
    vif_households_2036_projected: '600',
    vif_dwellings_2036_projected: '700',
    median_monthly_mortgage_repayment_2021_census_aud: '1500',
    owned_outright_pct_2021_census: '30',
    owned_with_mortgage_pct_2021_census: '40',
    rented_pct_2021_census: '25',
    seifa_irsd_score_2021: '1000',
    seifa_irsd_decile_2021: '5',
  }));
  const housingRows = regions.map(({ code, name }) => ({
    lga_code_2021: code,
    lga_name: name,
    latest_rent_quarter: '2025-09-01',
    latest_rent_lettings_count: '50',
    latest_rent_median_weekly_rent_aud: '400',
    latest_rent_median_weekly_rent_aud_5y_ago: '300',
    latest_rent_median_weekly_rent_aud_change_5y_pct: '0.3333',
    latest_affordable_lettings_share: '0.25',
  }));
  const priceIncomeRows = regions.map(({ code, name }) => ({
    lga_code_2021_abs: code,
    lga_name: name,
    median_house_price_2025_aud: '650000',
    median_household_income_weekly_2021_census_aud: '1,250',
    annualised_household_income_aud: '65000',
    price_to_income_ratio: '10',
  }));
  const jobMarketRows = regions.map(({ name }) => ({
    lga_name: name,
    dominant_sa4_or_gccsa_region: 'Test SA4',
    geography_type: 'SA4',
    mapping_confidence: 'Accepted',
    top_occupation_1: 'Nurses',
    top_occupation_1_vacancies_3mma: '100',
    top_occupation_2: 'Carers',
    top_occupation_2_vacancies_3mma: '50',
    data_internal_reference_date: '2026-07-01',
  }));
  const labourForceRows = regions.map(({ code, name }) => ({
    lga_code_2021_abs: code,
    lga_name: name,
    top_industry_of_employment_1: 'Health care',
    top_industry_of_employment_2: 'Education',
    top_industry_of_employment_3: 'Retail',
  }));
  const ageRows = regions.map(({ code, name }) => ({
    lga_code_2021_abs: code,
    lga_name: name,
    pct_0_14_computed: '18.5',
    pct_15_64_working_age_computed: '62.5',
  }));
  const employmentTrendRows = [{
    sa4_code: '201',
    sa4_name: 'Test SA4',
    date: '2026-07-15',
    total_employment: '50000',
    employment_change_1y_pct: '0.02',
  }];
  const employmentOccupationRows = Array.from({ length: 5 }, (_value, index) => ({
    sa4_code: '201',
    anzsco4_name: `Occupation ${index + 1}`,
    nsc_emp: String(5000 - index * 100),
    employment_share: String(0.1 - index * 0.005),
    occupation_rank_in_sa4: String(index + 1),
  }));
  const schoolRows = regions.flatMap(({ name }) => [
    { lgaName: `${name} (C)`, schoolType: 'Primary' },
    { lgaName: `${name} (C)`, schoolType: 'Secondary' },
    { lgaName: `${name} (C)`, schoolType: 'Special' },
  ]);
  const year12Rows = regions.map(({ code }) => ({
    lgaCode: `LGA${code}`,
    year12CompletionPercentage: '75.5',
  }));
  const offenceRows = regions.map(({ name }) => ({
    year: 2025,
    yearEnding: 'December',
    lgaName: name,
    offenceCount: '110',
    ratePerHundredThousand: null,
  }));
  const healthRows = regions.map(({ code }) => ({
    lgaCode: `LGA${code}`,
    hospitalCount: '2',
    generalPracticeCount: '5',
    emergencyDepartmentCount: '1',
  }));
  const edTimeRows = [
    { lgaCode: `LGA${regions[0].code}`, hospitalName: 'Hospital A', medianTimeInEdMinutes: '120' },
    { lgaCode: `LGA${regions[0].code}`, hospitalName: 'Hospital B', medianTimeInEdMinutes: '180' },
  ];
  const transportRows = regions.map(({ code }, index) => ({
    lgaCode: `LGA${code}`,
    representativeWeekday: '2026-09-15',
    activeStopCount: '20',
    weekdayScheduledStopCalls: '490',
    weekdayStopCallsPerActiveStop: '24.5',
    trainStationCount: index === 0 ? '2' : '0',
    hasRailAccess: index === 0 ? '1' : '0',
    directSouthernCrossService: index === 0 ? '1' : '0',
  }));
  const growthPressureRows = regions.map(({ code }) => ({
    lgaCode: `LGA${code}`,
    growthPressureIndicator: '-2.5',
  }));
  const datasetRows = [
    {
      datasetKey: 'lga_boundaries',
      payloadJson: JSON.stringify({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: { lgaCode: regions[0].code, lgaName: regions[0].name },
          geometry: {
            type: 'Polygon',
            coordinates: [[[145, -38], [146, -38], [146, -37], [145, -37], [145, -38]]],
          },
        }],
      }),
    },
    { datasetKey: 'victoria_boundary', payloadJson: Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: [] })) },
  ];
  const calls = [];

  return {
    calls,
    query: async sql => {
      calls.push(sql);
      if (sql.includes('stg_master_dataset_56_lga')) return masterRows;
      if (sql.includes('stg_housing_lga_latest_profile')) return housingRows;
      if (sql.includes('stg_housing_price_to_income_ratio')) return priceIncomeRows;
      if (sql.includes('stg_job_market_snapshot_by_lga')) return jobMarketRows;
      if (sql.includes('stg_employment_census_lga_labourforce')) return labourForceRows;
      if (sql.includes('stg_population_census_lga_age_structure')) return ageRows;
      if (sql.includes('stg_employment_nero_sa4_trend')) return employmentTrendRows;
      if (sql.includes('stg_employment_nero_latest_sa4_occupation')) return employmentOccupationRows;
      if (sql.includes('stg_education_school_locations_2025')) return schoolRows;
      if (sql.includes('stg_education_year12_completion_lga_2021')) return year12Rows;
      if (sql.includes('stg_safety_recorded_offences_lga_2025')) return offenceRows;
      if (sql.includes('stg_health_services_lga_2025')) return healthRows;
      if (sql.includes('stg_health_ed_median_time_2024_25')) return edTimeRows;
      if (sql.includes('stg_transport_access_lga_2026')) return transportRows;
      if (sql.includes('stg_growth_pressure_lga_2036')) return growthPressureRows;
      if (sql.includes('website_dataset')) return datasetRows;
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

test('builds all regional website fields directly from Aiven source tables', async () => {
  const fixture = mysqlFixture();
  const data = await loadRegionalData(fixture.query);
  const first = data.regionalProfiles[0];

  assert.equal(data.regionalProfiles.length, 56);
  assert.equal(data.regionalDataMeta.profileDelivery, 'aiven-mysql-direct');
  assert.equal(first.population, 1100);
  assert.equal(first.medianHousePrice, 650000);
  assert.equal(first.priceToIncomeRatio, 10);
  assert.equal(first.affordableRentalShare, 25);
  assert.equal(first.occupationVacancies, 150);
  assert.equal(first.employmentGrowth, 2);
  assert.equal(first.schoolCount, 3);
  assert.equal(first.primarySchoolCount, 1);
  assert.equal(first.secondarySchoolCount, 1);
  assert.equal(first.year12CompletionYoungAdultsPercentage, 75.5);
  assert.equal(first.recordedOffences2025, 110);
  assert.equal(first.crimeRate, 100);
  assert.equal(first.hospitalCount, 2);
  assert.equal(first.generalPracticeCount, 5);
  assert.equal(first.emergencyDepartmentCount, 1);
  assert.equal(first.emergencyDepartmentMedianTimeRange, '120–180 min');
  assert.equal(first.emergencyDepartmentMedianTimeHospitalCount, 2);
  assert.equal(first.publicTransportFrequency, 24.5);
  assert.equal(first.dataAvailability.education, 'aiven-mysql');
  assert.equal(first.dataAvailability.safety, 'aiven-mysql');
  assert.equal(first.dataAvailability.healthcare, 'aiven-mysql');
  assert.equal(first.railAccess, 'Direct train to Southern Cross');
  assert.equal(first.dataAvailability.transport, 'aiven-mysql');
  assert.equal(first.growthPressureIndicator, -2.5);
  assert.equal(first.dataAvailability.growthPressure, 'aiven-mysql');
  assert.equal(first.dataProvenance.fieldSources.population, 'aiven-master');
  assert.equal(first.dataProvenance.fieldSources.schoolCount, 'aiven-education-schools');
  assert.equal(first.dataProvenance.fieldSources.crimeRate, 'aiven-safety-offences');
  assert.equal(first.dataProvenance.fieldSources.hospitalCount, 'aiven-health-facilities');
  assert.equal(first.dataProvenance.fieldSources.railAccess, 'aiven-transport-access');
  assert.equal(first.dataProvenance.fieldSources.growthPressureIndicator, 'aiven-growth-pressure');
  assert.equal(data.boundaryCollection.type, 'FeatureCollection');
  assert.equal(data.victoriaBoundaryCollection.type, 'FeatureCollection');
  assert.equal(fixture.calls.some(sql => sql.includes('website_region_profile')), false);
});

test('rejects an incomplete Aiven regional master table', async () => {
  const fixture = mysqlFixture(55);
  await assert.rejects(
    loadRegionalData(fixture.query),
    /Expected at least 56 rows from stg_master_dataset_56_lga, received 55/,
  );
});
