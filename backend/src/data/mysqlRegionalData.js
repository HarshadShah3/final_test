import { queryAiven } from '../database/aivenClient.js';

const expectedRegionCount = 56;
const requiredDatasetKeys = ['lga_boundaries', 'victoria_boundary'];
const unavailableSourceId = 'aiven-unavailable';

const sourceCatalog = {
  'aiven-master': {
    id: 'aiven-master',
    label: 'Aiven MySQL regional master dataset',
    table: 'stg_master_dataset_56_lga',
    role: 'LGA identity, population, household income, housing tenure, SEIFA and 2036 projections.',
  },
  'aiven-housing': {
    id: 'aiven-housing',
    label: 'Aiven MySQL housing profile',
    table: 'stg_housing_lga_latest_profile',
    role: 'Latest rent, affordable rental and five-year rent trend values.',
  },
  'aiven-price-income': {
    id: 'aiven-price-income',
    label: 'Aiven MySQL price-to-income dataset',
    table: 'stg_housing_price_to_income_ratio',
    role: 'Median house price, household income and price-to-income ratio.',
  },
  'aiven-job-market': {
    id: 'aiven-job-market',
    label: 'Aiven MySQL job market snapshot',
    table: 'stg_job_market_snapshot_by_lga',
    role: 'Top-five advertised occupation groups mapped from SA4 to LGA.',
  },
  'aiven-labour-force': {
    id: 'aiven-labour-force',
    label: 'Aiven MySQL Census labour-force dataset',
    table: 'stg_employment_census_lga_labourforce',
    role: 'LGA unemployment, participation, leading industries and occupation.',
  },
  'aiven-age-structure': {
    id: 'aiven-age-structure',
    label: 'Aiven MySQL Census age structure',
    table: 'stg_population_census_lga_age_structure',
    role: 'LGA child and working-age population shares.',
  },
  'aiven-education-schools': {
    id: 'aiven-education-schools',
    label: 'Aiven MySQL Victorian school locations 2025',
    table: 'stg_education_school_locations_2025',
    role: 'Open school, primary school and secondary school counts by LGA.',
  },
  'aiven-education-year12': {
    id: 'aiven-education-year12',
    label: 'Aiven MySQL Census Year 12 completion 2021',
    table: 'stg_education_year12_completion_lga_2021',
    role: 'Year 12 completion among people aged 20 to 24 by LGA.',
  },
  'aiven-safety-offences': {
    id: 'aiven-safety-offences',
    label: 'Aiven MySQL recorded offences by LGA',
    table: 'stg_safety_recorded_offences_lga_2025',
    role: 'Latest recorded offence counts by LGA; the per-capita rate is calculated using the 2025 LGA population.',
  },
  'aiven-health-facilities': {
    id: 'aiven-health-facilities',
    label: 'Aiven MySQL HealthDirect facilities 2025',
    table: 'stg_health_services_lga_2025',
    role: 'Verified active hospital, general-practice and emergency-department service counts by LGA.',
  },
  'aiven-ed-time': {
    id: 'aiven-ed-time',
    label: 'Aiven MySQL AIHW emergency-department time 2024–25',
    table: 'stg_health_ed_median_time_2024_25',
    role: 'Hospital-level median time until departure from the emergency department; this is not an average waiting time.',
  },
  'aiven-transport-access': {
    id: 'aiven-transport-access',
    label: 'Aiven MySQL Victorian GTFS weekday service 2026',
    table: 'stg_transport_access_lga_2026',
    role: 'Scheduled weekday stop calls, active stops, train stations and direct Southern Cross service by LGA.',
  },
  'aiven-growth-pressure': {
    id: 'aiven-growth-pressure',
    label: 'Aiven MySQL VIF growth pressure indicator',
    table: 'stg_growth_pressure_lga_2036',
    role: 'VIF population growth minus dwelling growth from 2021 to 2036, in percentage points.',
  },
  'aiven-employment-trend': {
    id: 'aiven-employment-trend',
    label: 'Aiven MySQL NERO employment trend',
    table: 'stg_employment_nero_sa4_trend',
    role: 'Latest SA4 total employment and annual employment growth.',
  },
  'aiven-employment-occupations': {
    id: 'aiven-employment-occupations',
    label: 'Aiven MySQL NERO occupations',
    table: 'stg_employment_nero_latest_sa4_occupation',
    role: 'Latest top-five employing occupations for each SA4.',
  },
  'aiven-map-assets': {
    id: 'aiven-map-assets',
    label: 'Aiven MySQL map geometry',
    table: 'website_dataset',
    role: 'Victorian LGA and state boundary geometry delivered at runtime from MySQL.',
  },
  [unavailableSourceId]: {
    id: unavailableSourceId,
    label: 'Not available in Aiven MySQL',
    table: null,
    role: 'The current Aiven schema contains no verified value for this field; no local fallback is used.',
  },
};

function parseJson(value, label) {
  if (Buffer.isBuffer(value)) return JSON.parse(value.toString('utf8'));
  if (typeof value === 'string') return JSON.parse(value);
  if (value && typeof value === 'object') return value;
  throw new Error(`MySQL returned an invalid JSON payload for ${label}.`);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replaceAll(',', '').replaceAll('$', '').replaceAll('%', '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function rounded(value, digits = 0) {
  const number = numberOrNull(value);
  if (number === null) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
}

function percentFromFraction(value) {
  const number = numberOrNull(value);
  return number === null ? null : rounded(number * 100, 1);
}

function annualGrowth(start, end, years) {
  const first = numberOrNull(start);
  const last = numberOrNull(end);
  if (first === null || last === null || first <= 0 || years <= 0) return null;
  return rounded(((last / first) ** (1 / years) - 1) * 100, 1);
}

function lgaCode(value) {
  return String(value ?? '').replace(/\D/g, '').padStart(5, '0');
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function normalizedLgaName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function indexBy(rows, key) {
  return new Map(rows.map(row => [key(row), row]));
}

function groupBy(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    const groupKey = key(row);
    const values = grouped.get(groupKey) ?? [];
    values.push(row);
    grouped.set(groupKey, values);
  }
  return grouped;
}

function requireRows(rows, label, minimum = expectedRegionCount) {
  if (rows.length < minimum) {
    throw new Error(`Expected at least ${minimum} rows from ${label}, received ${rows.length}.`);
  }
}

function requireRelatedRows(masterRows, index, label, masterKey) {
  const missing = masterRows.filter(row => !index.has(masterKey(row))).map(row => row.lga_name);
  if (missing.length) throw new Error(`${label} is missing Aiven rows for: ${missing.join(', ')}.`);
}

function latestVacancies(jobMarket) {
  return Array.from({ length: 5 }, (_value, index) => {
    const position = index + 1;
    const name = jobMarket?.[`top_occupation_${position}`];
    const vacancies = rounded(jobMarket?.[`top_occupation_${position}_vacancies_3mma`]);
    return name && vacancies !== null ? { name, vacancies3mma: vacancies } : null;
  }).filter(Boolean);
}

function profileFieldSources() {
  const fields = {
    id: 'aiven-master', lgaCode: 'aiven-master', name: 'aiven-master', state: 'aiven-master', postcode: unavailableSourceId,
    year: 'aiven-master', population: 'aiven-master', populationGrowth: 'aiven-master', medianIncome: 'aiven-price-income',
    medianHouseholdIncomeWeekly: 'aiven-price-income', medianHousePrice: 'aiven-price-income', medianRent: 'aiven-housing',
    medianMortgageRepaymentMonthly: 'aiven-master', affordableRentalShare: 'aiven-housing', priceToIncomeRatio: 'aiven-price-income',
    rentToIncomeRatio: 'aiven-price-income', rentalListingsMarch2025: 'aiven-housing', medianRentMarch2025: 'aiven-housing',
    medianRentMarch2020: 'aiven-housing', medianRentGrowth2020To2025: 'aiven-housing', homeOwnershipPercentage: 'aiven-master',
    rentingPercentage: 'aiven-master', leadingEmploymentSectors: 'aiven-labour-force', occupationVacancies: 'aiven-job-market',
    vacanciesPerThousandEmployed: 'aiven-job-market', employmentGrowth: 'aiven-employment-trend', totalEmployment: 'aiven-employment-trend',
    topEmployingOccupations: 'aiven-employment-occupations', topVacancyGroups: 'aiven-job-market', projectedPopulation: 'aiven-master',
    projectedHouseholds: 'aiven-master', projectedDwellings: 'aiven-master', projectionYear: 'aiven-master', population2025: 'aiven-master',
    populationGrowth2001To2025: 'aiven-master', populationCagr2001To2025: 'aiven-master', seifaIrsdScore2021: 'aiven-master',
    seifaIrsdDecile2021: 'aiven-master', childrenPercentage: 'aiven-age-structure', workingAgePercentage: 'aiven-age-structure',
    dataAvailability: 'aiven-master', referencePeriods: 'aiven-master', employmentGeography: 'aiven-master', vacancyGeography: 'aiven-job-market',
    highestDemandOccupation: 'aiven-job-market', employmentMapping: 'aiven-master',
    schoolCount: 'aiven-education-schools', primarySchoolCount: 'aiven-education-schools',
    secondarySchoolCount: 'aiven-education-schools', year12CompletionYoungAdultsPercentage: 'aiven-education-year12',
    recordedOffences2025: 'aiven-safety-offences', offenceRatePerHundredThousand2025: 'aiven-safety-offences',
    offenceRatePerThousand2025: 'aiven-safety-offences', crimeRate: 'aiven-safety-offences',
    crimeRateUnit: 'aiven-safety-offences',
    hospitalCount: 'aiven-health-facilities', generalPracticeCount: 'aiven-health-facilities',
    emergencyDepartmentCount: 'aiven-health-facilities', emergencyDepartmentMedianTimeRange: 'aiven-ed-time',
    emergencyDepartmentMedianTimeHospitalCount: 'aiven-ed-time',
    publicTransportFrequency: 'aiven-transport-access', publicTransportActiveStopCount: 'aiven-transport-access',
    publicTransportScheduledStopCalls: 'aiven-transport-access', railAccess: 'aiven-transport-access',
    trainStationCount: 'aiven-transport-access', directSouthernCrossService: 'aiven-transport-access',
    growthPressureIndicator: 'aiven-growth-pressure',
  };
  const unavailableFields = [
    'schoolAgePopulation2015', 'schoolAgePopulation2025', 'schoolAgePopulationGrowth2015To2025',
    'schoolAgePopulationShare', 'schoolsPerTenThousandChildren', 'schoolStaffPerThousandChildren',
    'year12CompletionAllAdultsPercentage', 'offenceRateChange2020To2025PerHundredThousand',
    'nearestEmergencyDepartmentKm', 'averageEmergencyWaitMinutes',
    'heatExposureIndex', 'cityAccessibilityScore', 'greenSpaceAreaPercent', 'communityServicesScore',
  ];
  unavailableFields.forEach(field => { fields[field] = unavailableSourceId; });
  return fields;
}

export function buildRegionalData({
  masterRows,
  housingRows,
  priceIncomeRows,
  jobMarketRows,
  labourForceRows,
  ageRows,
  employmentTrendRows,
  employmentOccupationRows,
  schoolRows,
  year12Rows,
  offenceRows,
  healthRows,
  edTimeRows,
  transportRows,
  growthPressureRows,
  datasetRows,
}) {
  requireRows(masterRows, 'stg_master_dataset_56_lga');
  if (masterRows.length !== expectedRegionCount) {
    throw new Error(`Expected ${expectedRegionCount} regional master rows in MySQL, received ${masterRows.length}.`);
  }
  requireRows(housingRows, 'stg_housing_lga_latest_profile');
  requireRows(priceIncomeRows, 'stg_housing_price_to_income_ratio');
  requireRows(jobMarketRows, 'stg_job_market_snapshot_by_lga');
  requireRows(labourForceRows, 'stg_employment_census_lga_labourforce');
  requireRows(ageRows, 'stg_population_census_lga_age_structure');
  requireRows(schoolRows, 'stg_education_school_locations_2025', 1);
  requireRows(year12Rows, 'stg_education_year12_completion_lga_2021', 1);
  requireRows(offenceRows, 'stg_safety_recorded_offences_lga_2025', 1);
  requireRows(healthRows, 'stg_health_services_lga_2025');
  requireRows(edTimeRows, 'stg_health_ed_median_time_2024_25', 1);
  requireRows(transportRows, 'stg_transport_access_lga_2026');
  requireRows(growthPressureRows, 'stg_growth_pressure_lga_2036');

  const housingByCode = indexBy(housingRows, row => lgaCode(row.lga_code_2021));
  const priceIncomeByCode = indexBy(priceIncomeRows, row => lgaCode(row.lga_code_2021_abs));
  const jobMarketByName = indexBy(jobMarketRows, row => row.lga_name.toLowerCase());
  const labourForceByCode = indexBy(labourForceRows, row => lgaCode(row.lga_code_2021_abs));
  const ageByCode = indexBy(ageRows, row => lgaCode(row.lga_code_2021_abs));
  const trendBySa4 = indexBy(employmentTrendRows, row => String(row.sa4_code));
  const occupationsBySa4 = groupBy(employmentOccupationRows, row => String(row.sa4_code));
  const schoolsByName = groupBy(schoolRows, row => normalizedLgaName(row.lgaName));
  const year12ByCode = indexBy(year12Rows, row => lgaCode(row.lgaCode));
  const offencesByName = indexBy(offenceRows, row => normalizedLgaName(row.lgaName));
  const healthByCode = indexBy(healthRows, row => lgaCode(row.lgaCode));
  const edTimesByCode = groupBy(edTimeRows, row => lgaCode(row.lgaCode));
  const transportByCode = indexBy(transportRows, row => lgaCode(row.lgaCode));
  const growthPressureByCode = indexBy(growthPressureRows, row => lgaCode(row.lgaCode));
  const masterKey = row => lgaCode(row.lga_code_2021_abs);

  requireRelatedRows(masterRows, housingByCode, 'stg_housing_lga_latest_profile', masterKey);
  requireRelatedRows(masterRows, priceIncomeByCode, 'stg_housing_price_to_income_ratio', masterKey);
  requireRelatedRows(masterRows, labourForceByCode, 'stg_employment_census_lga_labourforce', masterKey);
  requireRelatedRows(masterRows, ageByCode, 'stg_population_census_lga_age_structure', masterKey);
  requireRelatedRows(masterRows, jobMarketByName, 'stg_job_market_snapshot_by_lga', row => row.lga_name.toLowerCase());
  requireRelatedRows(masterRows, trendBySa4, 'stg_employment_nero_sa4_trend', row => String(row.dominant_sa4_code));
  requireRelatedRows(masterRows, occupationsBySa4, 'stg_employment_nero_latest_sa4_occupation', row => String(row.dominant_sa4_code));
  requireRelatedRows(masterRows, schoolsByName, 'stg_education_school_locations_2025', row => normalizedLgaName(row.lga_name));
  requireRelatedRows(masterRows, year12ByCode, 'stg_education_year12_completion_lga_2021', masterKey);
  requireRelatedRows(masterRows, offencesByName, 'stg_safety_recorded_offences_lga_2025', row => normalizedLgaName(row.lga_name));
  requireRelatedRows(masterRows, healthByCode, 'stg_health_services_lga_2025', masterKey);
  requireRelatedRows(masterRows, transportByCode, 'stg_transport_access_lga_2026', masterKey);
  requireRelatedRows(masterRows, growthPressureByCode, 'stg_growth_pressure_lga_2036', masterKey);

  const datasets = new Map(datasetRows.map(row => [row.datasetKey, parseJson(row.payloadJson, row.datasetKey)]));
  const missingKeys = requiredDatasetKeys.filter(key => !datasets.has(key));
  if (missingKeys.length) throw new Error(`MySQL is missing website datasets: ${missingKeys.join(', ')}.`);
  const fieldSources = profileFieldSources();
  const regionalProfiles = masterRows.map(master => {
    const code = masterKey(master);
    const housing = housingByCode.get(code);
    const priceIncome = priceIncomeByCode.get(code);
    const jobMarket = jobMarketByName.get(master.lga_name.toLowerCase());
    const labourForce = labourForceByCode.get(code);
    const age = ageByCode.get(code);
    const trend = trendBySa4.get(String(master.dominant_sa4_code));
    const occupationRows = [...occupationsBySa4.get(String(master.dominant_sa4_code))]
      .sort((first, second) => numberOrNull(first.occupation_rank_in_sa4) - numberOrNull(second.occupation_rank_in_sa4))
      .slice(0, 5);
    const regionSchools = schoolsByName.get(normalizedLgaName(master.lga_name));
    const year12 = year12ByCode.get(code);
    const offences = offencesByName.get(normalizedLgaName(master.lga_name));
    const health = healthByCode.get(code);
    const edTimes = edTimesByCode.get(code) ?? [];
    const transport = transportByCode.get(code);
    const growthPressure = growthPressureByCode.get(code);
    const vacancyGroups = latestVacancies(jobMarket);
    const vacancyTotal = vacancyGroups.reduce((total, item) => total + item.vacancies3mma, 0);
    const totalEmployment = rounded(trend.total_employment);
    const weeklyIncome = rounded(priceIncome.median_household_income_weekly_2021_census_aud);
    const annualIncome = rounded(priceIncome.annualised_household_income_aud) ?? (weeklyIncome === null ? null : weeklyIncome * 52);
    const weeklyRent = rounded(housing.latest_rent_median_weekly_rent_aud);
    const population2025 = rounded(master.population_2025);
    const schoolCount = regionSchools.length;
   const primarySchoolCount = regionSchools.filter(row =>
  ['primary', 'pri/sec'].includes(String(row.schoolType).toLowerCase())
).length;

const secondarySchoolCount = regionSchools.filter(row =>
  ['secondary', 'pri/sec'].includes(String(row.schoolType).toLowerCase())
).length;

    const recordedOffences = rounded(offences.offenceCount);
    const offenceRatePerHundredThousand = rounded(offences.ratePerHundredThousand, 1)
      ?? (population2025 && recordedOffences !== null ? rounded(recordedOffences / population2025 * 100000, 1) : null);
    const offenceRatePerThousand = offenceRatePerHundredThousand === null
      ? null
      : rounded(offenceRatePerHundredThousand / 100, 1);
    const edMedianValues = edTimes
      .map(row => rounded(row.medianTimeInEdMinutes))
      .filter(value => value !== null)
      .sort((first, second) => first - second);
    const edMedianMinimum = edMedianValues[0] ?? null;
    const edMedianMaximum = edMedianValues.at(-1) ?? null;
    const emergencyDepartmentMedianTimeRange = edMedianMinimum === null
      ? null
      : edMedianMinimum === edMedianMaximum
        ? `${edMedianMinimum} min`
        : `${edMedianMinimum}–${edMedianMaximum} min`;
    const callsPerActiveStop = rounded(transport.weekdayStopCallsPerActiveStop, 1);
    const sourceIds = Object.keys(sourceCatalog);

    return {
      id: slugify(master.lga_name),
      lgaCode: `LGA${code}`,
      name: master.lga_name,
      state: 'VIC',
      postcode: '',
      year: 2026,
      population: rounded(master.vif_population_2026),
      populationGrowth: annualGrowth(master.vif_population_2021, master.vif_population_2026, 5),
      medianIncome: annualIncome,
      medianHouseholdIncomeWeekly: weeklyIncome,
      medianHousePrice: rounded(priceIncome.median_house_price_2025_aud),
      medianRent: weeklyRent,
      medianMortgageRepaymentMonthly: rounded(master.median_monthly_mortgage_repayment_2021_census_aud),
      affordableRentalShare: percentFromFraction(housing.latest_affordable_lettings_share),
      priceToIncomeRatio: rounded(priceIncome.price_to_income_ratio, 2),
      rentToIncomeRatio: annualIncome && weeklyRent !== null ? rounded((weeklyRent * 52 / annualIncome) * 100, 1) : null,
      rentalListingsMarch2025: rounded(housing.latest_rent_lettings_count),
      medianRentMarch2025: weeklyRent,
      medianRentMarch2020: rounded(housing.latest_rent_median_weekly_rent_aud_5y_ago),
      medianRentGrowth2020To2025: percentFromFraction(housing.latest_rent_median_weekly_rent_aud_change_5y_pct),
      homeOwnershipPercentage: rounded(numberOrNull(master.owned_outright_pct_2021_census) + numberOrNull(master.owned_with_mortgage_pct_2021_census), 1),
      rentingPercentage: rounded(master.rented_pct_2021_census, 1),
      leadingEmploymentSectors: [
        labourForce.top_industry_of_employment_1,
        labourForce.top_industry_of_employment_2,
        labourForce.top_industry_of_employment_3,
      ].filter(Boolean).join(' · '),
      occupationVacancies: vacancyTotal,
      vacanciesPerThousandEmployed: totalEmployment ? rounded(vacancyTotal / totalEmployment * 1000, 1) : null,
      employmentGrowth: percentFromFraction(trend.employment_change_1y_pct),
      totalEmployment,
      topEmployingOccupations: occupationRows.map(row => ({
        name: row.anzsco4_name,
        employed: rounded(row.nsc_emp),
        share: rounded(row.employment_share, 4),
      })),
      topVacancyGroups: vacancyGroups.map(group => ({
        ...group,
        share: vacancyTotal ? rounded(group.vacancies3mma / vacancyTotal, 4) : null,
      })),
      projectedPopulation: rounded(master.vif_erp_2036_projected),
      projectedHouseholds: rounded(master.vif_households_2036_projected),
      projectedDwellings: rounded(master.vif_dwellings_2036_projected),
      projectionYear: 2036,
      population2025,
      populationGrowth2001To2025: rounded(master.population_growth_pct_2001_2025, 1),
      populationCagr2001To2025: rounded(master.population_cagr_pct_2001_2025, 1),
      seifaIrsdScore2021: rounded(master.seifa_irsd_score_2021),
      seifaIrsdDecile2021: rounded(master.seifa_irsd_decile_2021),
      growthPressureIndicator: rounded(growthPressure.growthPressureIndicator, 1),
      schoolAgePopulation2015: null,
      schoolAgePopulation2025: null,
      schoolAgePopulationGrowth2015To2025: null,
      schoolAgePopulationShare: null,
      childrenPercentage: rounded(age.pct_0_14_computed, 1),
      schoolCount,
      primarySchoolCount,
      secondarySchoolCount,
      schoolsPerTenThousandChildren: null,
      schoolStaffPerThousandChildren: null,
      year12CompletionYoungAdultsPercentage: rounded(year12.year12CompletionPercentage, 1),
      year12CompletionAllAdultsPercentage: null,
      recordedOffences2025: recordedOffences,
      offenceRatePerHundredThousand2025: offenceRatePerHundredThousand,
      offenceRatePerThousand2025: offenceRatePerThousand,
      offenceRateChange2020To2025PerHundredThousand: null,
      crimeRate: offenceRatePerThousand,
      crimeRateUnit: 'recorded offences per 1,000 residents',
      workingAgePercentage: rounded(age.pct_15_64_working_age_computed, 1),
      hospitalCount: rounded(health.hospitalCount),
      emergencyDepartmentCount: rounded(health.emergencyDepartmentCount),
      nearestEmergencyDepartmentKm: null,
      generalPracticeCount: rounded(health.generalPracticeCount),
      averageEmergencyWaitMinutes: null,
      emergencyDepartmentMedianTimeRange,
      emergencyDepartmentMedianTimeHospitalCount: edMedianValues.length,
      publicTransportFrequency: callsPerActiveStop,
      publicTransportActiveStopCount: rounded(transport.activeStopCount),
      publicTransportScheduledStopCalls: rounded(transport.weekdayScheduledStopCalls),
      trainStationCount: rounded(transport.trainStationCount),
      directSouthernCrossService: Boolean(numberOrNull(transport.directSouthernCrossService)),
      railAccess: numberOrNull(transport.directSouthernCrossService)
        ? 'Direct train to Southern Cross'
        : numberOrNull(transport.hasRailAccess)
          ? 'Rail station in LGA'
          : 'No rail station in LGA',
      heatExposureIndex: null,
      cityAccessibilityScore: null,
      greenSpaceAreaPercent: null,
      communityServicesScore: null,
      dataAvailability: {
        population: 'aiven-mysql', rent: 'aiven-mysql', affordableRent: 'aiven-mysql', housingProjection: 'aiven-mysql',
        housingTenure: 'aiven-mysql', employment: 'aiven-mysql', education: 'aiven-mysql', safety: 'aiven-mysql',
        housePrice: 'aiven-mysql', healthcare: 'aiven-mysql', transport: 'aiven-mysql', growthPressure: 'aiven-mysql', priceToIncomeRatio: 'aiven-mysql',
      },
      referencePeriods: {
        census: 2021,
        populationProfile: 2025,
        populationEstimate: 2026,
        rentQuarter: dateOnly(housing.latest_rent_quarter),
        rentTrend: `${dateOnly(housing.latest_rent_quarter)} and five years earlier`,
        housingProjectionEnd: 2036,
        education: '2025 school locations; 2021 Census Year 12 completion',
        safety: `year ending ${offences.yearEnding} ${offences.year}`,
        healthcare: '7 March 2025 HealthDirect facilities; 2024–25 AIHW emergency-department median time',
        growthPressure: 'VIF population and dwelling growth, 2021–2036',
        transport: `GTFS scheduled services on ${dateOnly(transport.representativeWeekday)}`,
        employment: dateOnly(trend.date),
        vacancies: dateOnly(jobMarket.data_internal_reference_date),
        housePrice: 2025,
        occupationDemand: dateOnly(jobMarket.data_internal_reference_date),
        priceToIncomeRatio: '2025 house price / annualised 2021 Census household income',
      },
      employmentGeography: { level: 'SA4', code: String(master.dominant_sa4_code), name: master.dominant_sa4_name },
      vacancyGeography: {
        level: jobMarket.geography_type,
        code: String(master.dominant_sa4_code),
        name: jobMarket.dominant_sa4_or_gccsa_region,
      },
      highestDemandOccupation: jobMarket.top_occupation_1,
      employmentMapping: {
        lgaPopulationOverlapPercentage: rounded(master.lga_population_overlap_with_dominant_sa4_pct, 1),
        confidence: master.mapping_confidence,
      },
      dataProvenance: {
        delivery: 'aiven-mysql-direct',
        sourceIds,
        sources: sourceIds.map(sourceId => sourceCatalog[sourceId]),
        fieldSources: { ...fieldSources },
      },
    };
  }).sort((first, second) => first.name.localeCompare(second.name));

  if (new Set(regionalProfiles.map(region => region.id)).size !== regionalProfiles.length) {
    throw new Error('Aiven MySQL returned duplicate website region IDs.');
  }

  return {
    regionalProfiles,
    regionalDataMeta: {
      generatedAt: null,
      regionCount: regionalProfiles.length,
      profileDelivery: 'aiven-mysql-direct',
      runtimeProvider: 'aiven-mysql',
      dataMode: 'aiven-mysql-only',
      localRuntimeFallback: false,
      sourceCatalog,
      databaseTables: Object.values(sourceCatalog).map(source => source.table).filter(Boolean),
      geographicWarning: 'Population and housing values are LGA-level. Employment and vacancy values are SA4-level indicators mapped onto LGAs.',
      periodWarning: 'The Aiven tables contain different reference periods; read each profile referencePeriods value before comparison.',
      priceToIncomeWarning: 'Price-to-income compares 2025 median house price with annualised 2021 Census median weekly household income.',
      unavailableDataWarning: 'Nearest-emergency-department distance remains unavailable because the product has not defined the reference point. AIHW median time in ED is kept separate from the unavailable average-wait field. No local fallback is used.',
    },
    boundaryCollection: datasets.get('lga_boundaries'),
    victoriaBoundaryCollection: datasets.get('victoria_boundary'),
  };
}

export async function loadRegionalData(query = queryAiven) {
  const [
    masterRows,
    housingRows,
    priceIncomeRows,
    jobMarketRows,
    labourForceRows,
    ageRows,
    employmentTrendRows,
    employmentOccupationRows,
    schoolRows,
    year12Rows,
    offenceRows,
    healthRows,
    edTimeRows,
    transportRows,
    growthPressureRows,
    datasetRows,
  ] = await Promise.all([
    query('SELECT * FROM stg_master_dataset_56_lga ORDER BY lga_name'),
    query('SELECT * FROM stg_housing_lga_latest_profile ORDER BY lga_code_2021'),
    query('SELECT * FROM stg_housing_price_to_income_ratio ORDER BY lga_code_2021_abs'),
    query('SELECT * FROM stg_job_market_snapshot_by_lga ORDER BY lga_name'),
    query('SELECT * FROM stg_employment_census_lga_labourforce ORDER BY lga_code_2021_abs'),
    query('SELECT * FROM stg_population_census_lga_age_structure ORDER BY lga_code_2021_abs'),
    query(`
      SELECT * FROM stg_employment_nero_sa4_trend
      WHERE date = (SELECT MAX(date) FROM stg_employment_nero_sa4_trend)
      ORDER BY sa4_code
    `),
    query(`
      SELECT * FROM stg_employment_nero_latest_sa4_occupation
      WHERE date = (SELECT MAX(date) FROM stg_employment_nero_latest_sa4_occupation)
        AND CAST(occupation_rank_in_sa4 AS UNSIGNED) <= 5
      ORDER BY sa4_code, CAST(occupation_rank_in_sa4 AS UNSIGNED)
    `),
    query(`
      SELECT LGA_Name AS lgaName, School_Type AS schoolType
      FROM stg_education_school_locations_2025
      WHERE LOWER(School_Status) = 'open'
      ORDER BY LGA_Name, School_No
    `),
    query(`
      SELECT
        LGA_CODE_2021 AS lgaCode,
        year12_completion_pct AS year12CompletionPercentage
      FROM stg_education_year12_completion_lga_2021
      ORDER BY LGA_CODE_2021
    `),
    query(`
      SELECT
        Year AS year,
        Year_ending AS yearEnding,
        Local_Government_Area AS lgaName,
        Offence_Count AS offenceCount,
        Rate_per_100_000_population AS ratePerHundredThousand
      FROM stg_safety_recorded_offences_lga_2025
      WHERE Year = (SELECT MAX(Year) FROM stg_safety_recorded_offences_lga_2025)
      ORDER BY Local_Government_Area
    `),
    query(`
      SELECT
        lga_code_2021 AS lgaCode,
        hospital_count AS hospitalCount,
        general_practice_count AS generalPracticeCount,
        emergency_department_count AS emergencyDepartmentCount
      FROM stg_health_services_lga_2025
      ORDER BY lga_code_2021
    `),
    query(`
      SELECT
        lga_code_2021 AS lgaCode,
        hospital_name AS hospitalName,
        median_time_in_ed_minutes AS medianTimeInEdMinutes
      FROM stg_health_ed_median_time_2024_25
      ORDER BY lga_code_2021, hospital_name
    `),
    query(`
      SELECT
        lga_code_2021 AS lgaCode,
        DATE_FORMAT(representative_weekday, '%Y-%m-%d') AS representativeWeekday,
        active_stop_count AS activeStopCount,
        weekday_scheduled_stop_calls AS weekdayScheduledStopCalls,
        weekday_stop_calls_per_active_stop AS weekdayStopCallsPerActiveStop,
        train_station_count AS trainStationCount,
        has_rail_access AS hasRailAccess,
        direct_southern_cross_service AS directSouthernCrossService
      FROM stg_transport_access_lga_2026
      ORDER BY lga_code_2021
    `),
    query(`
      SELECT
        lga_code_2021 AS lgaCode,
        growth_pressure_indicator AS growthPressureIndicator
      FROM stg_growth_pressure_lga_2036
      ORDER BY lga_code_2021
    `),
    query(`
      SELECT dataset_key AS datasetKey, payload_json AS payloadJson
      FROM website_dataset
      WHERE dataset_key IN ('lga_boundaries', 'victoria_boundary')
    `),
  ]);

  return buildRegionalData({
    masterRows,
    housingRows,
    priceIncomeRows,
    jobMarketRows,
    labourForceRows,
    ageRows,
    employmentTrendRows,
    employmentOccupationRows,
    schoolRows,
    year12Rows,
    offenceRows,
    healthRows,
    edTimeRows,
    transportRows,
    growthPressureRows,
    datasetRows,
  });
}
