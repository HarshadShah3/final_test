import {
  boundaryCollection,
  regionalDataMeta,
  regionalProfiles,
  victoriaBoundaryCollection,
} from '../data/regions.js';
const boundaryByCode = new Map(boundaryCollection.features.map(feature => [`LGA${feature.properties.lgaCode}`, feature]));
const victoriaBoundary = victoriaBoundaryCollection.features[0];

export const supportedMapMetrics = {
  population: { label: 'Current population', unit: 'people', field: 'population', evidence: 'reviewed' },
  medianRent: { label: 'Median weekly rent', unit: 'AUD per week', field: 'medianRent', evidence: 'reviewed' },
  jobVacancies: { label: 'Advertised occupation vacancies', unit: 'vacancies', field: 'occupationVacancies', evidence: 'reviewed' },
  schools: { label: 'Open schools', unit: 'schools', field: 'schoolCount', evidence: 'unavailable in Aiven MySQL' },
  projectedPopulation: { label: 'Projected population', unit: 'people', field: 'projectedPopulation', evidence: 'reviewed projection' },
};

function coordinatesOf(geometry) {
  if (!geometry) return [];
  return geometry.coordinates.flat(Infinity).reduce((pairs, value, index, values) => {
    if (index % 2 === 0) pairs.push([value, values[index + 1]]);
    return pairs;
  }, []);
}

function boundingBox(features) {
  const coordinates = features.flatMap(feature => coordinatesOf(feature.geometry));
  if (!coordinates.length) return null;
  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  return [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
}

function mapFeature(region, metricKey) {
  const boundary = boundaryByCode.get(region.lgaCode);
  if (!boundary) return null;
  const metric = supportedMapMetrics[metricKey];
  const metricSourceId = region.dataProvenance?.fieldSources?.[metric.field];
  const referencePeriod = metricKey === 'medianRent'
    ? region.referencePeriods.rentQuarter
    : metricKey === 'jobVacancies'
      ? region.referencePeriods.vacancies
      : metricKey === 'schools'
        ? region.referencePeriods.education
        : metricKey === 'projectedPopulation'
          ? String(region.projectionYear)
          : String(region.year);

  return {
    type: 'Feature',
    id: region.id,
    geometry: boundary.geometry,
    properties: {
      id: region.id,
      name: region.name,
      state: region.state,
      postcode: String(region.postcode),
      lgaCode: region.lgaCode,
      areaSqKm: boundary.properties.areaSqKm,
      population: region.population,
      medianHousePrice: region.medianHousePrice,
      medianRent: region.medianRent,
      occupationVacancies: region.occupationVacancies,
      schoolCount: region.schoolCount,
      projectedPopulation: region.projectedPopulation,
      projectionYear: region.projectionYear,
      metric: {
        key: metricKey,
        label: metric.label,
        value: region[metric.field],
        unit: metric.unit,
        evidence: metric.evidence,
        referencePeriod,
        source: regionalDataMeta.sourceCatalog?.[metricSourceId] ?? null,
      },
      profilePath: `/regions/${region.id}`,
      apiPath: `/api/regions/${region.id}`,
    },
  };
}

export function getMapRegions({ regionIds = '', metric = 'population' } = {}) {
  const selectedIds = new Set(String(regionIds).split(',').map(value => value.trim()).filter(Boolean));
  const features = regionalProfiles
    .filter(region => region.state === 'VIC' && (!selectedIds.size || selectedIds.has(region.id)))
    .map(region => mapFeature(region, metric))
    .filter(Boolean);

  return {
    type: 'FeatureCollection',
    bbox: boundingBox([victoriaBoundary]),
    stateBoundary: victoriaBoundary,
    features,
    metadata: {
      count: features.length,
      selectedMetric: metric,
      boundarySource: boundaryCollection.metadata,
      stateBoundarySource: victoriaBoundaryCollection.metadata,
      geographicLevel: 'LGA polygon',
      profileDelivery: regionalDataMeta.profileDelivery,
      profileSources: regionalDataMeta.sourceCatalog,
      note: metric === 'jobVacancies'
        ? 'Employment vacancy values are SA4-level indicators attached to LGA polygons for display and must not be interpreted as LGA-level counts.'
        : 'All 56 listed Victorian LGAs remain visible behind the highlighted areas.',
    },
  };
}

export function getMapRegion(regionId, metric = 'population') {
  return getMapRegions({ regionIds: regionId, metric }).features[0];
}
