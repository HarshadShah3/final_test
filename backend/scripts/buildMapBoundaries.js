import { readFile, writeFile } from 'node:fs/promises';

const outputUrl = new URL('../data-sources/lga_boundaries.geojson', import.meta.url);
const stateOutputUrl = new URL('../data-sources/victoria_boundary.geojson', import.meta.url);
const profileCsvUrl = new URL('../data-sources/victoria_regional_profile.csv', import.meta.url);
const profileLines = (await readFile(profileCsvUrl, 'utf8')).trim().split(/\r?\n/);
const profileHeaders = profileLines.shift().split(',');
const lgaCodeIndex = profileHeaders.indexOf('lga_code_2021');
const lgaCodes = profileLines.map(line => line.split(',')[lgaCodeIndex]);
const sourceUrl = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/LGA/MapServer/0/query';
const stateSourceUrl = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/STE/MapServer/0/query';
const query = new URLSearchParams({
  where: `lga_code_2021 IN (${lgaCodes.map(code => `'${code}'`).join(',')})`,
  outFields: 'lga_code_2021,lga_name_2021,area_albers_sqkm',
  returnGeometry: 'true',
  outSR: '4326',
  geometryPrecision: '5',
  maxAllowableOffset: '0.002',
  f: 'geojson',
});

const response = await fetch(`${sourceUrl}?${query}`);
if (!response.ok) throw new Error(`ABS boundary request failed with status ${response.status}.`);

const featureCollection = await response.json();
if (featureCollection.type !== 'FeatureCollection' || featureCollection.features?.length !== lgaCodes.length) {
  throw new Error(`Expected ${lgaCodes.length} LGA boundary features from ABS.`);
}

featureCollection.features = featureCollection.features
  .map(feature => ({
    ...feature,
    properties: {
      lgaCode: feature.properties.lga_code_2021,
      lgaName: feature.properties.lga_name_2021,
      areaSqKm: feature.properties.area_albers_sqkm,
    },
  }))
  .sort((first, second) => first.properties.lgaCode.localeCompare(second.properties.lgaCode));

featureCollection.metadata = {
  source: 'Australian Bureau of Statistics ASGS 2021 LGA ArcGIS service',
  sourceUrl: 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/LGA/MapServer',
  coordinateReferenceSystem: 'EPSG:4326',
  simplificationDegrees: 0.002,
  regionCount: lgaCodes.length,
};

const stateQuery = new URLSearchParams({
  where: "state_code_2021 = '2'",
  outFields: 'state_code_2021,state_name_2021,area_albers_sqkm',
  returnGeometry: 'true',
  outSR: '4326',
  geometryPrecision: '5',
  maxAllowableOffset: '0.002',
  f: 'geojson',
});
const stateResponse = await fetch(`${stateSourceUrl}?${stateQuery}`);
if (!stateResponse.ok) throw new Error(`ABS state boundary request failed with status ${stateResponse.status}.`);
const stateCollection = await stateResponse.json();
if (stateCollection.type !== 'FeatureCollection' || stateCollection.features?.length !== 1) {
  throw new Error('Expected one Victoria state boundary feature from ABS.');
}
stateCollection.features = stateCollection.features.map(feature => ({
  ...feature,
  properties: {
    stateCode: feature.properties.state_code_2021,
    stateName: feature.properties.state_name_2021,
    areaSqKm: feature.properties.area_albers_sqkm,
  },
}));
stateCollection.metadata = {
  source: 'Australian Bureau of Statistics ASGS 2021 State and Territory ArcGIS service',
  sourceUrl: 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/STE/MapServer',
  coordinateReferenceSystem: 'EPSG:4326',
  simplificationDegrees: 0.002,
};

await writeFile(outputUrl, `${JSON.stringify(featureCollection)}\n`, 'utf8');
await writeFile(stateOutputUrl, `${JSON.stringify(stateCollection)}\n`, 'utf8');
console.log(`Saved ${featureCollection.features.length} LGA boundaries to ${outputUrl.pathname}.`);
console.log(`Saved the Victoria state boundary to ${stateOutputUrl.pathname}.`);
