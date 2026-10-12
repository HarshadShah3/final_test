/**
 * Stable regional-data client used by every data page.
 *
 * Current delivery: region, map, recommendation and forecast records come from
 * Aiven MySQL. Database credentials remain behind the API boundary.
 *
 * TODO(EXTERNAL API): Set VITE_API_BASE_URL to the external service base URL
 * once it implements the same /regions, /map/regions and /recommendations
 * response contracts. Keep region IDs, null values and dataProvenance stable so
 * page components do not need to know the database schema.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  ?? (import.meta.env.PROD ? '/api' : `${window.location.protocol}//${window.location.hostname}:3001/api`);

async function requestJson(endpoint, options = {}) {
  // Aiven-backed serverless routes can take longer during a cold start. Keep a
  // finite timeout, but do not report a false data error after only 3 seconds.
  const { timeoutMs = 15000, ...fetchOptions } = options;
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), timeoutMs);
  const combinedSignal = fetchOptions.signal
    ? AbortSignal.any([fetchOptions.signal, timeoutController.signal])
    : timeoutController.signal;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...fetchOptions,
      credentials: 'include',
      signal: combinedSignal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message ?? 'The regional data service is unavailable.');
  }
  return response.json();
}

export function checkAccess(signal) {
  return requestJson('/auth/status', { signal });
}

export function unlockSite(password) {
  return requestJson('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export function fetchRegions(filters, signal) {
  const queryParameters = new URLSearchParams(filters);
  return requestJson(`/regions?${queryParameters}`, { signal });
}

export function fetchDataSources(signal) {
  return requestJson('/data-sources', { signal, timeoutMs: 12000 });
}

export function fetchRegionById(regionId, signal) {
  return requestJson(`/regions/${encodeURIComponent(regionId)}`, { signal });
}

/**
 * TODO(EXTERNAL API - COMPARE CATEGORY FIELDS): Extend each /regions/:id
 * profile with these nullable numeric fields when reviewed providers are ready:
 *   heatExposureIndex, cityAccessibilityScore, greenSpaceAreaPercent,
 *   communityServicesScore.
 * Also add every populated field to dataProvenance.fieldSources. Keep missing
 * values as null so the aligned Compare rows remain stable and never mistake a
 * placeholder zero for a real measurement.
 */

export function fetchMapRegions({ metric = 'population', regionIds = [] } = {}, signal) {
  const queryParameters = new URLSearchParams({ metric });
  if (regionIds.length) queryParameters.set('regionIds', regionIds.join(','));
  return requestJson(`/map/regions?${queryParameters}`, { signal });
}

/**
 * Loads the published 2021-2036 VIF series from Aiven MySQL through the backend.
 * Database credentials stay on the server and are never sent to the browser.
 */
export async function fetchRegionalProjections(regionIds, signal) {
  const uniqueRegionIds = [...new Set(regionIds.filter(Boolean))];
  const queryParameters = new URLSearchParams({ regionIds: uniqueRegionIds.join(',') });
  return requestJson(`/forecasts/regions?${queryParameters}`, { signal, timeoutMs: 12000 });
}

export function fetchPriorityRecommendations({ priorities, location, population = 'all', housePrice = 'all' }, signal) {
  return requestJson('/recommendations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priorities, location, population, housePrice, resultLimit: 'all' }),
    signal,
  });
}
