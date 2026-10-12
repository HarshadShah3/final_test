import { readJsonFile } from './readJsonFile.js';
import { loadRegionalData } from './mysqlRegionalData.js';

/**
 * Runtime data is loaded from Aiven MySQL. Node's test runner uses the committed
 * build artefacts as deterministic fixtures so tests do not require credentials.
 */
const fixtureMode = Boolean(process.env.NODE_TEST_CONTEXT);
const fixtureData = fixtureMode ? readJsonFile('backend/src/data/regions.generated.json') : null;
const regionalData = fixtureMode
  ? {
    regionalProfiles: fixtureData.regions,
    regionalDataMeta: fixtureData.meta,
    boundaryCollection: readJsonFile('backend/data-sources/lga_boundaries.geojson'),
    victoriaBoundaryCollection: readJsonFile('backend/data-sources/victoria_boundary.geojson'),
  }
  : await loadRegionalData();

export const regionalProfiles = regionalData.regionalProfiles;
export const regionalDataMeta = regionalData.regionalDataMeta;
export const boundaryCollection = regionalData.boundaryCollection;
export const victoriaBoundaryCollection = regionalData.victoriaBoundaryCollection;
