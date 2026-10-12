import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(scriptDirectory, '..');

function parseArguments(argumentsList) {
  const values = {};
  for (let index = 0; index < argumentsList.length; index += 2) values[argumentsList[index].replace(/^--/, '')] = argumentsList[index + 1];
  return values;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(value); value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value);
      if (row.some(cell => cell !== '')) rows.push(row);
      row = []; value = '';
    } else value += character;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const [headers, ...dataRows] = rows;
  return dataRows.map(dataRow => Object.fromEntries(headers.map((header, index) => [header, dataRow[index] ?? ''])));
}

function number(value, decimals = null) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/[$,%\s]/g, ''));
  if (!Number.isFinite(parsed)) return null;
  if (decimals === null) return parsed;
  const scale = 10 ** decimals;
  return Math.round(parsed * scale) / scale;
}

function rounded(value) {
  const parsed = number(value);
  return parsed === null ? null : Math.round(parsed);
}

function annualGrowth(startValue, endValue, years) {
  if (!startValue || !endValue) return null;
  return number(((endValue / startValue) ** (1 / years) - 1) * 100, 2);
}

function normalisedLgaCode(value) {
  return `LGA${String(value).replace(/\D/g, '')}`;
}

function sa4Parts(value) {
  const match = String(value).match(/^(.*?)\s*\((\d+)\)$/);
  return match ? { name: match[1], code: match[2] } : { name: String(value), code: '' };
}

const jsonFields = new Set([
  'topEmployingOccupations', 'topVacancyGroups', 'dataAvailability', 'referencePeriods',
  'employmentGeography', 'vacancyGeography', 'employmentMapping',
]);
const stringFields = new Set([
  'id', 'lgaCode', 'name', 'state', 'postcode', 'leadingEmploymentSectors',
  'crimeRateUnit', 'publicTransportFrequency', 'railAccess', 'highestDemandOccupation',
]);

function parseReviewedProfile(row) {
  return Object.fromEntries(Object.entries(row).map(([field, value]) => {
    if (jsonFields.has(field)) return [field, value ? JSON.parse(value) : null];
    if (stringFields.has(field)) return [field, value];
    return [field, number(value)];
  }));
}

const masterSourceId = 'iteration-1-master-csv';
const reviewedSourceId = 'regional-profiles-reviewed-csv';
const housingRatioSourceId = 'housing-price-to-income-csv';
const sourceCatalog = {
  [reviewedSourceId]: {
    id: reviewedSourceId,
    label: 'Regional Futures reviewed profile CSV',
    file: 'regional_profiles_reviewed.csv',
    role: 'Complete current profile values used by Explore, Profile, Compare and Shortlist.',
  },
  [masterSourceId]: {
    id: masterSourceId,
    label: 'Iteration 1 LGA master CSV',
    file: 'vic_reg_iteration_1_lga_master_data.csv',
    role: 'Authoritative population, SEIFA, house price, rent and occupation-demand overrides.',
  },
  [housingRatioSourceId]: {
    id: housingRatioSourceId,
    label: 'Housing price-to-income processed CSV',
    file: 'price_to_income_ratio_lga.csv',
    role: 'Price-to-income ratio for all 56 LGAs, calculated from 2025 median house price and annualised 2021 Census median weekly household income.',
  },
};
const masterFields = new Set([
  'population', 'populationGrowth', 'population2025', 'populationGrowth2001To2025',
  'populationCagr2001To2025', 'seifaIrsdScore2021', 'seifaIrsdDecile2021',
  'medianHousePrice', 'medianRent', 'highestDemandOccupation', 'leadingEmploymentSectors',
  'employmentGeography', 'vacancyGeography', 'employmentMapping',
]);

function fieldSources(region) {
  return Object.fromEntries(Object.keys(region)
    .map(field => [field, field === 'priceToIncomeRatio'
      ? housingRatioSourceId
      : masterFields.has(field) ? masterSourceId : reviewedSourceId]));
}

const argumentsMap = parseArguments(process.argv.slice(2));
const sourcePath = path.resolve(argumentsMap['profile-csv'] ?? path.join(backendDirectory, 'data-sources/vic_reg_iteration_1_lga_master_data.csv'));
const reviewedProfilePath = path.resolve(argumentsMap['reviewed-profile-csv'] ?? path.join(backendDirectory, 'data-sources/regional_profiles_reviewed.csv'));
const housingRatioPath = path.resolve(argumentsMap['price-to-income-csv'] ?? path.join(backendDirectory, 'data-sources/price_to_income_ratio_lga.csv'));
const outputPath = path.resolve(argumentsMap.output ?? path.join(backendDirectory, 'src/data/regions.generated.json'));
const qualityPath = path.join(backendDirectory, 'data-sources/data_quality.json');

const [sourceText, reviewedProfileText, housingRatioText, regionalProfileQuality] = await Promise.all([
  readFile(sourcePath, 'utf8'),
  readFile(reviewedProfilePath, 'utf8'),
  readFile(housingRatioPath, 'utf8'),
  readFile(qualityPath, 'utf8').then(JSON.parse),
]);
const sourceRows = parseCsv(sourceText);
const reviewedProfiles = parseCsv(reviewedProfileText).map(parseReviewedProfile);
const existingByName = new Map(reviewedProfiles.map(region => [region.name, region]));
const housingRatioRows = parseCsv(housingRatioText).map(row => ({
  name: row.lga_name,
  lgaCode: normalisedLgaCode(row.lga_code_2021_abs),
  medianHousePrice: rounded(row.median_house_price_2025_aud),
  medianHouseholdIncomeWeekly: number(row.median_household_income_weekly_2021_census_aud),
  annualisedHouseholdIncome: rounded(row.annualised_household_income_aud),
  priceToIncomeRatio: number(row.price_to_income_ratio, 2),
}));

if (sourceRows.length !== 56) throw new Error(`Expected 56 LGA rows, received ${sourceRows.length}.`);
if (reviewedProfiles.length !== 56) throw new Error(`Expected 56 reviewed profile rows, received ${reviewedProfiles.length}.`);
if (housingRatioRows.length !== 56) throw new Error(`Expected 56 housing ratio rows, received ${housingRatioRows.length}.`);

const housingRatioByCode = new Map();
for (const housingRatio of housingRatioRows) {
  if (!housingRatio.name || !/^LGA\d{5}$/.test(housingRatio.lgaCode)
    || !housingRatio.medianHousePrice || !housingRatio.medianHouseholdIncomeWeekly
    || !housingRatio.annualisedHouseholdIncome || !housingRatio.priceToIncomeRatio) {
    throw new Error(`Housing ratio row for ${housingRatio.name || housingRatio.lgaCode || 'unknown LGA'} is incomplete.`);
  }
  if (housingRatioByCode.has(housingRatio.lgaCode)) throw new Error(`Duplicate housing ratio LGA code: ${housingRatio.lgaCode}.`);
  if (housingRatio.annualisedHouseholdIncome !== housingRatio.medianHouseholdIncomeWeekly * 52) {
    throw new Error(`Annualised household income is inconsistent for ${housingRatio.name}.`);
  }
  const calculatedRatio = number(housingRatio.medianHousePrice / housingRatio.annualisedHouseholdIncome, 2);
  if (Math.abs(calculatedRatio - housingRatio.priceToIncomeRatio) > 0.01) {
    throw new Error(`Price-to-income ratio is inconsistent for ${housingRatio.name}.`);
  }
  housingRatioByCode.set(housingRatio.lgaCode, housingRatio);
}

const regions = sourceRows.map(row => {
  const name = row['LGA Name'];
  const existing = existingByName.get(name);
  if (!existing) throw new Error(`No existing regional profile matches ${name}.`);
  const lgaCode = normalisedLgaCode(row['LGA Code (SEIFA/VIF/Census scheme)']);
  if (lgaCode !== existing.lgaCode) throw new Error(`LGA code mismatch for ${name}: ${lgaCode} versus ${existing.lgaCode}.`);
  const housingRatio = housingRatioByCode.get(lgaCode);
  if (!housingRatio) throw new Error(`No housing ratio row matches ${name} (${lgaCode}).`);
  if (housingRatio.name !== name) throw new Error(`Housing ratio LGA name mismatch for ${lgaCode}: ${housingRatio.name} versus ${name}.`);

  const population2021 = rounded(row['VIF Population 2021 (verified)']);
  const population2026 = rounded(row['VIF Population 2026 (verified)']);
  const medianHousePrice = rounded(row['Median house price (AUD), 2025']);
  const medianRent = rounded(row['Median weekly rent (AUD), Sep 2025']);
  const employmentSa4 = sa4Parts(row['Dominant SA4']);
  if (housingRatio.medianHousePrice !== medianHousePrice) throw new Error(`Housing price mismatch for ${name}.`);
  if (housingRatio.annualisedHouseholdIncome !== existing.medianIncome) throw new Error(`Household income mismatch for ${name}.`);

  const region = {
    ...existing,
    year: 2026,
    population: population2026,
    populationGrowth: annualGrowth(population2021, population2026, 5),
    population2025: rounded(row['Population 2025 (ABS, verified)']),
    populationGrowth2001To2025: number(row['Population growth 2001-2025 % (computed)'], 1),
    populationCagr2001To2025: number(row['Population CAGR 2001-2025 % (computed)'], 2),
    seifaIrsdScore2021: rounded(row['SEIFA IRSD Score 2021 (verified)']),
    seifaIrsdDecile2021: rounded(row['SEIFA IRSD Decile 2021 (verified)']),
    medianHousePrice,
    priceToIncomeRatio: housingRatio.priceToIncomeRatio,
    medianRent,
    medianRentMarch2025: medianRent,
    highestDemandOccupation: row['Estimated highest-demand occupation, Jul 2026'],
    leadingEmploymentSectors: row['Estimated highest-demand occupation, Jul 2026'],
    employmentGeography: { level: 'SA4', code: employmentSa4.code, name: employmentSa4.name },
    vacancyGeography: { level: row['Demand source geography'], code: employmentSa4.code, name: row['Demand source region'] },
    employmentMapping: {
      lgaPopulationOverlapPercentage: number(row['LGA population overlap with dominant SA4'], 1),
      confidence: row['Mapping confidence'],
    },
    dataAvailability: {
      ...existing.dataAvailability,
      population: 'reviewed',
      rent: 'reviewed',
      housePrice: 'reviewed',
      priceToIncomeRatio: 'reviewed',
      employment: 'reviewed',
    },
    referencePeriods: {
      ...existing.referencePeriods,
      populationProfile: 2025,
      populationEstimate: 2026,
      housePrice: 2025,
      priceToIncomeRatio: '2025 house price / annualised 2021 Census household income',
      rentQuarter: 'September 2025',
      occupationDemand: 'July 2026',
    },
  };
  return {
    ...region,
    dataProvenance: {
      delivery: 'csv-build',
      sourceIds: [reviewedSourceId, masterSourceId, housingRatioSourceId],
      sources: [sourceCatalog[reviewedSourceId], sourceCatalog[masterSourceId], sourceCatalog[housingRatioSourceId]],
      fieldSources: fieldSources(region),
    },
  };
});

const sourceNames = new Set(sourceRows.map(row => row['LGA Name']));
const missingNames = reviewedProfiles.map(region => region.name).filter(name => !sourceNames.has(name));
if (missingNames.length) throw new Error(`Source is missing LGAs: ${missingNames.join(', ')}.`);

const output = {
  meta: {
    generatedAt: new Date().toISOString(),
    regionCount: regions.length,
    profileDelivery: 'csv-build',
    sourceCatalog,
    regionalProfileSourceRows: sourceRows.length,
    reviewedProfileSourceRows: reviewedProfiles.length,
    priceToIncomeSourceRows: housingRatioRows.length,
    regionalProfileSource: 'Vic_Reg Data Final for Iteration 1.xlsx - LGA_Master_Data.csv',
    regionalProfileQuality,
    geographicWarning: 'Population, house price and rent are LGA-level. Employment demand is mapped from the dominant SA4-level geography and may cover a wider area.',
    periodWarning: 'Population, rent, house price, employment, safety and projection fields use different reference periods. Read referencePeriods before comparison.',
    priceToIncomeWarning: 'Price-to-income compares 2025 median house price with annualised 2021 Census median weekly household income.',
    externalApiMigration: 'The frontend consumes the stable /api region contract. Replace the backend CSV provider with an external provider without changing page components.',
  },
  regions,
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Created ${outputPath} with ${regions.length} regional profiles from ${path.basename(sourcePath)}.`);
