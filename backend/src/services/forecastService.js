import { regionalProfiles } from '../data/regions.js';
import { queryAiven } from '../database/aivenClient.js';

const maximumRegions = 4;
// The published VIF series stops at 2036; the modelled projection reaches 2050.
const officialProjectionYear = 2036;
const modelledProjectionYear = 2050;
const modelledConfidenceLevel = 0.9;
const profilesById = new Map(regionalProfiles.map(region => [region.id, region]));

/**
 * Maps a model_run.target_metric to the response series key it feeds, plus how to
 * present it. "scale" converts stored units to the display unit (affordability is
 * stored as a 0-1 share and shown as a percentage).
 */
const SERIES_CONFIG = {
  population: { unit: 'people', scale: 1, category: 'Demography', label: 'Population' },
  households: { unit: 'households', scale: 1, category: 'Demography', label: 'Households' },
  dwellings: { unit: 'dwellings', scale: 1, category: 'Housing', label: 'Dwellings' },
  housingCost: { unit: 'AUD/week', scale: 1, category: 'Housing', label: 'Median weekly rent' },
  affordability: { unit: 'percent', scale: 100, category: 'Housing', label: 'Affordable rental share' },
  propertyPrice: { unit: 'AUD', scale: 1, category: 'Housing', label: 'Median house price' },
  employment: { unit: 'persons', scale: 1, category: 'Economy', label: 'Employment' },
};

const SERIES_BY_METRIC = {
  population_lga: 'population',
  households_lga: 'households',
  dwellings_lga: 'dwellings',
  median_weekly_rent_aud: 'housingCost',
  affordable_lettings_share: 'affordability',
  employment_sa4: 'employment',
  median_house_price_aud: 'propertyPrice',
};

export class ForecastRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ForecastRequestError';
  }
}

export function parseForecastRegionIds(value) {
  const requested = Array.isArray(value) ? value : String(value ?? '').split(',');
  const regionIds = [...new Set(requested.map(id => id.trim()).filter(Boolean))];
  if (!regionIds.length) throw new ForecastRequestError('Choose at least one region.');
  if (regionIds.length > maximumRegions) {
    throw new ForecastRequestError(`Choose no more than ${maximumRegions} regions.`);
  }
  const invalid = regionIds.filter(id => !profilesById.has(id));
  if (invalid.length) throw new ForecastRequestError(`Unknown Victorian region: ${invalid[0]}.`);
  return regionIds;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function point(year, value, confidenceLow, confidenceHigh, modelled) {
  return {
    year: Number(year),
    value: finiteNumber(value),
    confidenceLow: confidenceLow === null || confidenceLow === undefined ? null : finiteNumber(confidenceLow),
    confidenceHigh: confidenceHigh === null || confidenceHigh === undefined ? null : finiteNumber(confidenceHigh),
    modelled: Boolean(modelled),
  };
}

function projectionPoint(row, key) {
  return point(row.referenceYear, row[key], null, null, false);
}

function scalePoint(item, config) {
  if (!config || config.scale === 1) return item;
  return {
    ...item,
    value: item.value === null ? null : item.value * config.scale,
    confidenceLow: item.confidenceLow === null ? null : item.confidenceLow * config.scale,
    confidenceHigh: item.confidenceHigh === null ? null : item.confidenceHigh * config.scale,
  };
}

function indicator(id, category, label, unit, baseline, projected, status = 'available', extra = {}) {
  return { id, category, label, unit, baseline, projected, status, ...extra };
}

/* Later series override earlier ones for the same year (published, then observed, then modelled). */
function mergePoints(...seriesList) {
  const byYear = new Map();
  for (const series of seriesList) {
    for (const item of series ?? []) {
      byYear.set(item.year, item);
    }
  }
  return [...byYear.values()].sort((first, second) => first.year - second.year);
}

function indexOfficialRows(databaseRows) {
  const rowsByCode = new Map();
  for (const row of databaseRows) {
    const code = String(row.lgaCode);
    const year = Number(row.referenceYear);
    const byYear = rowsByCode.get(code) ?? new Map();
    if (!byYear.has(year)) byYear.set(year, row);
    rowsByCode.set(code, byYear);
  }
  return rowsByCode;
}

function indexModelRows(modelRows) {
  const seriesByCode = new Map();
  const metaByMetric = new Map();

  for (const row of modelRows ?? []) {
    const seriesKey = SERIES_BY_METRIC[row.targetMetric];
    const code = row.areaType === 'SA4' ? row.mappedLgaCode : row.areaCode;
    if (!seriesKey || code === null || code === undefined) continue;
    const year = Number(String(row.targetDate).slice(0, 4));
    if (!Number.isFinite(year)) continue;

    const config = SERIES_CONFIG[seriesKey];
    const item = scalePoint(point(year, row.predictedValue, row.lowerBound, row.upperBound, true), config);

    const codeKey = String(code);
    const metricMap = seriesByCode.get(codeKey) ?? new Map();
    const yearMap = metricMap.get(seriesKey) ?? new Map();
    if (!yearMap.has(year)) yearMap.set(year, item);
    metricMap.set(seriesKey, yearMap);
    seriesByCode.set(codeKey, metricMap);

    if (!metaByMetric.has(row.targetMetric)) {
      metaByMetric.set(row.targetMetric, {
        metric: row.targetMetric,
        modelName: row.modelName,
        modelVersion: row.modelVersion,
        unit: row.unit,
        mae: finiteNumber(row.mae),
        mapePct: finiteNumber(row.mapePct),
      });
    }
  }

  const series = new Map();
  for (const [code, metricMap] of seriesByCode) {
    const byKey = {};
    for (const [key, yearMap] of metricMap) {
      byKey[key] = [...yearMap.values()].sort((first, second) => first.year - second.year);
    }
    series.set(code, byKey);
  }
  return { seriesByCode: series, meta: [...metaByMetric.values()] };
}

function indexObservedRows(observedRows) {
  const seriesByCode = new Map();
  for (const row of observedRows ?? []) {
    const seriesKey = SERIES_BY_METRIC[row.metric];
    if (!seriesKey || row.lgaCode === null || row.lgaCode === undefined) continue;
    const year = Number(row.year);
    if (!Number.isFinite(year)) continue;

    const config = SERIES_CONFIG[seriesKey];
    const item = scalePoint(point(year, row.value, null, null, false), config);

    const codeKey = String(row.lgaCode);
    const metricMap = seriesByCode.get(codeKey) ?? new Map();
    const yearMap = metricMap.get(seriesKey) ?? new Map();
    if (!yearMap.has(year)) yearMap.set(year, item);
    metricMap.set(seriesKey, yearMap);
    seriesByCode.set(codeKey, metricMap);
  }

  const series = new Map();
  for (const [code, metricMap] of seriesByCode) {
    const byKey = {};
    for (const [key, yearMap] of metricMap) {
      byKey[key] = [...yearMap.values()].sort((first, second) => first.year - second.year);
    }
    series.set(code, byKey);
  }
  return series;
}

function observedIndicator(id, seriesKey, series) {
  const config = SERIES_CONFIG[seriesKey];
  const observed = (series ?? []).filter(item => !item.modelled);
  const projected = (series ?? []).find(item => item.modelled && item.year === modelledProjectionYear)
    ?? (series ?? []).filter(item => item.modelled).at(-1)
    ?? null;
  const baseline = observed.at(-1) ?? null;
  const status = projected ? 'available' : (baseline ? 'current-observation' : 'unavailable');
  return indicator(id, config.category, config.label, config.unit,
    baseline?.value ?? null, projected?.value ?? null, status, {
      baselineYear: baseline?.year ?? null,
      projectedYear: projected?.year ?? null,
      confidenceLow: projected?.confidenceLow ?? null,
      confidenceHigh: projected?.confidenceHigh ?? null,
    });
}

export function buildForecastResponse(regionIds, databaseRows, modelRows = [], observedRows = []) {
  const officialByCode = indexOfficialRows(databaseRows);
  const { seriesByCode: modelledByCode, meta: modelMeta } = indexModelRows(modelRows);
  const observedByCode = indexObservedRows(observedRows);
  const hasModel = modelledByCode.size > 0;

  const data = regionIds.map(regionId => {
    const profile = profilesById.get(regionId);
    const databaseCode = profile.lgaCode.replace(/^LGA/i, '');
    const officialRows = [...(officialByCode.get(databaseCode)?.values() ?? [])]
      .sort((first, second) => Number(first.referenceYear) - Number(second.referenceYear));
    const official2021 = officialRows.find(row => Number(row.referenceYear) === 2021) ?? null;
    const official2036 = officialRows.find(row => Number(row.referenceYear) === officialProjectionYear) ?? null;

    const model = modelledByCode.get(databaseCode) ?? {};
    const observed = observedByCode.get(databaseCode) ?? {};
    const regionHasModel = modelledByCode.has(databaseCode);

    const historyRow = officialRows.find(row => (
      finiteNumber(row.population2001) !== null || finiteNumber(row.population2025) !== null
    )) ?? {};
    const populationHistory = [
      point(2001, historyRow.population2001, null, null, false),
      point(2025, historyRow.population2025, null, null, false),
    ].filter(item => item.value !== null);
    const populationSeries = mergePoints(
      populationHistory,
      officialRows.map(row => projectionPoint(row, 'population')),
      model.population,
    );
    const householdsSeries = mergePoints(
      officialRows.map(row => projectionPoint(row, 'households')), model.households);
    const dwellingsSeries = mergePoints(
      officialRows.map(row => projectionPoint(row, 'dwellings')), model.dwellings);
    const housingCost = mergePoints(observed.housingCost, model.housingCost);
    const affordability = mergePoints(observed.affordability, model.affordability);
    const propertyPrice = mergePoints(model.propertyPrice);
    const employment = mergePoints(observed.employment, model.employment);

    const population2050 = (model.population ?? []).find(item => item.year === modelledProjectionYear) ?? null;
    const households2050 = (model.households ?? []).find(item => item.year === modelledProjectionYear) ?? null;
    const dwellings2050 = (model.dwellings ?? []).find(item => item.year === modelledProjectionYear) ?? null;
    const available = Boolean(population2050) || Boolean(official2036);

    const baselineIndicator = (id, key, projectedPoint) => indicator(id, SERIES_CONFIG[key].category,
      SERIES_CONFIG[key].label, SERIES_CONFIG[key].unit,
      finiteNumber(official2021?.[key]),
      projectedPoint?.value ?? finiteNumber(official2036?.[key]),
      available ? 'available' : 'unavailable',
      {
        baselineYear: official2021 ? Number(official2021.referenceYear) : null,
        projectedYear: projectedPoint?.year ?? (official2036 ? Number(official2036.referenceYear) : null),
        confidenceLow: projectedPoint?.confidenceLow ?? null,
        confidenceHigh: projectedPoint?.confidenceHigh ?? null,
      });

    return {
      region: { id: profile.id, name: profile.name, state: profile.state },
      baselineYear: official2021 ? Number(official2021.referenceYear) : null,
      projectionYear: regionHasModel ? modelledProjectionYear : officialProjectionYear,
      officialProjectionYear,
      confidenceLevel: regionHasModel ? modelledConfidenceLevel : null,
      scenario: regionHasModel ? 'modelled-projection' : 'published-vif-projection',
      dataStatus: available ? 'available' : 'unavailable',
      series: {
        population: populationSeries,
        households: householdsSeries,
        dwellings: dwellingsSeries,
        housingCost,
        affordability,
        propertyPrice,
        employment,
        services: [],
        climate: [],
      },
      indicators: [
        baselineIndicator('population', 'population', population2050),
        baselineIndicator('households', 'households', households2050),
        baselineIndicator('dwellings', 'dwellings', dwellings2050),
        observedIndicator('medianRent', 'housingCost', housingCost),
        observedIndicator('affordableShare', 'affordability', affordability),
        observedIndicator('propertyPrice', 'propertyPrice', propertyPrice),
        observedIndicator('employment', 'employment', employment),
      ],
    };
  });

  const firstSource = databaseRows[0] ?? {};
  const modelVersions = [...new Set((modelRows ?? []).map(row => row.modelVersion).filter(Boolean))];
  const limitations = hasModel
    ? [
      'Values to 2050 are modelled projections, not official Victoria in Future (VIF) figures.',
      'The 2050 range is a 90% prediction interval calibrated from a rolling three-year backtest; it widens with the forecast horizon.',
      'Employment uses SA4 source geography and is inherited by each LGA from its dominant SA4 (overlap disclosed in the model metadata).',
      'Property prices are low confidence: each LGA is anchored on its 2025 median house price and grown by a statewide price trend because no locality-to-LGA history is available.',
    ]
    : [
      `The latest verified population and housing projection horizon is ${officialProjectionYear}, not ${modelledProjectionYear}.`,
      'The published VIF series does not provide confidence intervals in the imported source.',
    ];

  return {
    data,
    meta: {
      count: data.length,
      source: 'aiven-mysql',
      provider: firstSource.provider ?? 'Victoria in Future (VIF)',
      dataset: firstSource.datasetName ?? 'VIF LGA housing projections',
      datasetVersion: firstSource.datasetVersion ?? null,
      projectionYear: hasModel ? modelledProjectionYear : officialProjectionYear,
      officialProjectionYear,
      scenario: hasModel ? 'modelled-projection' : 'published-vif-projection',
      confidenceLevel: hasModel ? modelledConfidenceLevel : null,
      methodologyVersion: modelVersions.length ? modelVersions.at(-1) : null,
      models: modelMeta,
      generatedAt: null,
      isForecastBackendConnected: true,
      limitations,
    },
  };
}

export async function getRegionalForecasts(value, query = queryAiven) {
  const regionIds = parseForecastRegionIds(value);
  const codes = regionIds.map(id => profilesById.get(id).lgaCode.replace(/^LGA/i, ''));
  const placeholders = codes.map(() => '?').join(',');

  const baselineRows = await query(
    `SELECT
       ga.area_code AS lgaCode,
       ga.area_name AS lgaName,
       php.reference_year AS referenceYear,
       php.estimated_resident_population AS population,
       php.total_households AS households,
       php.total_dwellings AS dwellings,
       m.population_2001 AS population2001,
       m.population_2025 AS population2025,
       php.observation_status AS observationStatus,
       ds.provider,
       ds.dataset_name AS datasetName,
       ds.dataset_version AS datasetVersion,
       php.source_id AS sourceId
     FROM geographic_area AS ga
     JOIN population_housing_projection AS php ON php.area_id = ga.area_id
     JOIN stg_master_dataset_56_lga AS m ON m.lga_code_2021_abs = ga.area_code
     JOIN data_source AS ds ON ds.source_id = php.source_id
     WHERE ga.area_type = 'LGA'
       AND ga.state_code = 'VIC'
       AND ga.area_code IN (${placeholders})
       AND php.reference_year IN (2021, 2026, 2031, 2036)
       AND php.data_status IN ('REPORTED', 'ESTIMATED')
     ORDER BY ga.area_code, php.reference_year, php.source_id DESC`,
    codes,
  );

  const modelRows = await query(
    `SELECT
       r.target_metric AS targetMetric,
       r.model_name AS modelName,
       r.model_version AS modelVersion,
       p.unit AS unit,
       r.mae AS mae,
       r.mape_pct AS mapePct,
       ga.area_code AS areaCode,
       ga.area_name AS areaName,
       ga.area_type AS areaType,
       m.lga_code_2021_abs AS mappedLgaCode,
       DATE_FORMAT(p.target_date, '%Y-%m-%d') AS targetDate,
       p.predicted_value AS predictedValue,
       p.lower_bound AS lowerBound,
       p.upper_bound AS upperBound
     FROM model_prediction AS p
     JOIN model_run AS r ON r.model_run_id = p.model_run_id
     JOIN geographic_area AS ga ON ga.area_id = p.area_id
     LEFT JOIN stg_master_dataset_56_lga AS m
       ON ga.area_type = 'SA4' AND m.dominant_sa4_code = ga.area_code
     WHERE (ga.area_type = 'LGA' AND ga.area_code IN (${placeholders}))
        OR (ga.area_type = 'SA4' AND ga.area_code IN (
             SELECT dominant_sa4_code FROM stg_master_dataset_56_lga
             WHERE lga_code_2021_abs IN (${placeholders})))
     ORDER BY ga.area_type, ga.area_code, r.target_metric, p.target_date`,
    [...codes, ...codes],
  );

  const observedRows = await query(
    `SELECT 'median_weekly_rent_aud' AS metric, t.lga_code_2021 AS lgaCode,
            CAST(YEAR(STR_TO_DATE(t.quarter, '%Y-%m-%d')) AS UNSIGNED) AS year,
            AVG(CAST(t.median_weekly_rent_aud AS DECIMAL(24,4))) AS value
     FROM stg_historical_median_rent_lga_trend AS t
     WHERE t.data_status = 'reported' AND t.lga_code_2021 IN (${placeholders})
       AND YEAR(STR_TO_DATE(t.quarter, '%Y-%m-%d')) >= 2015
     GROUP BY 1, 2, 3
     UNION ALL
     SELECT 'affordable_lettings_share', a.lga_code_2021,
            CAST(YEAR(STR_TO_DATE(a.quarter, '%Y-%m-%d')) AS UNSIGNED),
            AVG(CAST(a.affordable_lettings_share AS DECIMAL(24,6)))
     FROM stg_historical_affordable_rental_lga_trend AS a
     WHERE a.data_status = 'reported' AND a.lga_code_2021 IN (${placeholders})
       AND YEAR(STR_TO_DATE(a.quarter, '%Y-%m-%d')) >= 2015
     GROUP BY 1, 2, 3
     UNION ALL
     SELECT 'employment_sa4', m.lga_code_2021_abs,
            CAST(YEAR(STR_TO_DATE(e.date, '%Y-%m-%d')) AS UNSIGNED),
            AVG(CAST(e.total_employment AS DECIMAL(24,4)))
     FROM stg_employment_nero_sa4_trend AS e
     JOIN stg_master_dataset_56_lga AS m ON m.dominant_sa4_code = e.sa4_code
     WHERE m.lga_code_2021_abs IN (${placeholders})
       AND YEAR(STR_TO_DATE(e.date, '%Y-%m-%d')) >= 2015
     GROUP BY 1, 2, 3
     ORDER BY 1, 2, 3`,
    [...codes, ...codes, ...codes],
  );

  return buildForecastResponse(regionIds, baselineRows, modelRows, observedRows);
}
