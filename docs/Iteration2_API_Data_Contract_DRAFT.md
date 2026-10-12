# Iteration 2 API / Data Contract — draft

Status: **working draft for team review**. Re-audited on 15 Sep 2026 against the local `fix/iteration2-api-error-state` branch. The Towards 2050 projection path now reads VIF facts from Aiven MySQL; region profiles, maps and recommendation scoring still use `backend/src/data/regions.generated.json`. Express/Netlify and Vercel expose the same forecast route, but these changes are not yet merged or deployed. This is Ying's documentation draft, not a claim that full cloud migration or final team sign-off is complete.

## Setup and conventions

- Backend local origin: `http://localhost:3001`; all routes have the `/api` prefix. Frontend uses `VITE_API_BASE_URL`, or defaults to `http://localhost:3001/api` in development and relative `/api` in a production build.
- JSON is used except map success responses, which use `application/geo+json`.
- `regionId` is the stable `region.id` string, not a display name or postcode. URL-encode it in paths.
- Current runtime data is 56 Victorian LGAs. Do not label this national coverage. Published VIF projection data ends in 2036. The `Towards 2050` endpoint additionally serves precomputed 2050 *modelled projections* with a 90% prediction interval; these must always be labelled modelled, never as verified official VIF figures.
- Values can be missing or preview-only. The data-availability and reference-period fields must accompany interpretations of a metric. Employment vacancies can have SA4 geography even when displayed on an LGA map.

## Endpoints currently implemented

| Method and path | Input | Success | Error |
| --- | --- | --- | --- |
| `GET /api/health` | None | `{ "status": "ok" }` | — |
| `GET /api/data-sources` | None | `{ data: { ...metadata, referencePeriods: [{ id, name, ...periods }], availability: [{ id, name, ...availability }] } }` | — |
| `GET /api/forecasts/health` | None | `{ configured, connected, provider, schemaVersion }` | `503` when configuration is incomplete or Aiven is unavailable |
| `GET /api/forecasts/regions` | Required comma-separated `regionIds` (1-4) | `{ data: Forecast[], meta: ForecastMeta }` | `400` for invalid IDs/count; `503` when Aiven is unavailable |
| `GET /api/regions` | Optional `search`, `state`, `population`, `housePrice` query strings | `{ data: Region[], meta: { count: number, ... } }` | No explicit query-validation error yet; unknown filter values default to `all` |
| `GET /api/regions/:regionId` | Region ID | `{ data: Region, meta?: { ... } }` | `404 { message: "Regional profile not found." }` |
| `GET /api/map/regions` | Optional `metric`, comma-separated `regionIds` | GeoJSON `FeatureCollection` (below) | `400 { message, supportedMetrics }` for unsupported metric |
| `GET /api/map/regions/:regionId` | Region ID, optional `metric` | GeoJSON `Feature` (below) | `400` for unsupported metric; `404 { message: "Map region not found." }` |
| `POST /api/recommendations` | JSON `RecommendationRequest` (below) | `{ data: Recommendation[], meta: RecommendationMeta }` | `400 { message: "The recommendation request is invalid.", errors: [{ field, message }] }` |
| Any other `/api/...` path | — | — | `404 { message: "API route not found." }` |

`GET /api/regions` filter values: `population` supports `all`, `under10k`, `10kTo20k`, `20kTo30k`, `30kTo50k`, `50kTo100k`, `over100k`, `10kTo50k`, `over50k`, `small`, `large`. `housePrice` supports `all`, `under550k`, `550kTo700k`, `over700k`. `state` is case-insensitive; `search` matches the region name or postcode. Empty results are `200` with `data: []`, not `404`.

The Express and Vercel routes now return the same `meta.profileDelivery` and `meta.sourceCatalog` on region list/detail responses in this local branch. A parity test exercises both handlers. Do not assume this change is live until the branch is merged and the actual deployment is verified.

Map `metric` values: `population` (default), `medianRent`, `jobVacancies`, `schools`, `projectedPopulation`. `regionIds` absent means all 56 Victorian regions. Unknown IDs return no feature; the single-feature route returns `404`.

## Shared region fields

`Region` is the backend regional profile object. The following fields are read directly by the current frontend and therefore are contract-critical:

| Field | Type and meaning |
| --- | --- |
| `id`, `lgaCode`, `name`, `state`, `postcode` | Strings/identifiers and display labels. `state` is currently `VIC`. |
| `population`, `population2025`, `projectedPopulation`, `projectedHouseholds`, `projectedDwellings`, `projectionYear` | Numbers; population and projection display. `projectionYear` is currently 2036, not 2050. |
| `medianIncome`, `medianHousePrice`, `medianRent`, `employmentGrowth`, `occupationVacancies`, `highestDemandOccupation` | Numbers or display text for profile/compare views; missing values must render as unavailable, not zero. |
| `dataAvailability`, `referencePeriods`, `employmentGeography`, `vacancyGeography`, `dataProvenance` | Objects describing availability, source, reference times and geographic level. Do not omit when explaining or comparing metrics. `dataProvenance.fieldSources` maps populated fields to sources. |

The backend presently returns additional fields from `regions.generated.json` (e.g. household income, SEIFA, crime, schools, health, transport and affordability). Some are already read by the newer Compare and Towards 2050 pages, so their exact names, units, periods, geographic level and nullability need joint frontend/data-owner sign-off before this becomes a final contract. `heatExposureIndex`, `cityAccessibilityScore`, `greenSpaceAreaPercent` and `communityServicesScore` are documented as *future nullable fields* in the frontend source, not verified current data. Missing numbers must remain `null`, never a placeholder zero.

## Aiven-backed projection endpoint

`frontend/src/services/regionApi.js` calls `GET /api/forecasts/regions?regionIds=...`. The server validates one to four stable website region IDs, maps them to LGA codes over verified TLS, and returns:

- the published VIF years 2021, 2026, 2031 and 2036 from `geographic_area`, `population_housing_projection` and `data_source`; and
- precomputed 2050 model output from `model_run` and `model_prediction` (written offline by `backend/scripts/forecast2050`).

Each `Forecast` region contains a `series` map and an `indicators` array. Series keys are `population`, `households`, `dwellings`, `housingCost` (median weekly rent), `affordability` (share shown as a percentage), `propertyPrice` and `employment`. Each series point is `{ year, value, confidenceLow, confidenceHigh, modelled }`; published VIF points have `modelled: false` and null bounds, while modelled points carry the 90% prediction interval. `meta` reports `projectionYear: 2050`, `officialProjectionYear: 2036`, `scenario: "modelled-projection"`, `confidenceLevel: 0.9`, a `models[]` list (metric, model name, version, MAE, MAPE) and `limitations`.

If no model rows are present for a region the endpoint is backwards-compatible: it falls back to the published 2021-2036 VIF series with `projectionYear: 2036`, `scenario: "published-vif-projection"`, `confidenceLevel: null` and null bounds. The interface never invents confidence intervals.

Method and disclosure notes:

- 2050 values are modelled projections, not official Victoria in Future figures. Base series are anchored to published VIF estimates through 2036 and then damped to 2050; the interval widens with the forecast horizon.
- Employment uses SA4 source geography and is inherited by each LGA from its dominant SA4 (overlap percentage is disclosed in the model metadata).
- Property prices are low confidence: each LGA is anchored on its 2025 median house price and grown by a statewide price trend, because no locality-to-LGA price history is available. `propertyPrice` therefore has no observed baseline (`baseline: null`).
- `employment`, `medianRent` and `affordableShare` include observed history from 2015 onwards so the dashboard can show current data and change over time.
- School counts remain current observations and are labelled accordingly, never as projected service capacity.

## Recommendation request and response

Example request:

```json
{
  "priorities": ["population", "housing", "jobs"],
  "location": "Ballarat",
  "population": "all",
  "housePrice": "all",
  "resultLimit": 4
}
```

- `priorities`: array of 1–3 **unique** values from `population`, `housing`, `jobs`.
- `location`: name of an available Victorian regional area, 2–80 characters after trimming. The backend also accepts the short alias of a `Greater ...` name (for example `Bendigo` for `Greater Bendigo`). Unknown or non-Victorian locations receive a `400` validation error instead of silently dropping the geographic weight.
- `population`: one of `all`, `under10k`, `10kTo20k`, `20kTo30k`, `30kTo50k`, `50kTo100k`, `over100k` (default `all`).
- `housePrice`: one of `all`, `under550k`, `550kTo700k`, `over700k` (default `all`).
- `resultLimit`: integer from 1 to the available Victoria-region count (default 4), or string `"all"`. The current frontend sends `"all"`.

Each `Recommendation` contains `region: Region`, `matchScore: number | null`, `priorityMatchScore: number`, `matchStrength: string`, `priorityCount: number`, `priorityBreakdown: [{ priority, weight, weightPercentage, overallWeightPercentage, score, rank, scored, reason, factors }]`, `locationAdjustment: { applied, referenceRegion, distanceKm, proximityScore, weightPercentage, reason }`, `outlook: { projectionYear, projectedPopulation, projectedHouseholds, projectedDwellings }`, and `reasons: string[]`. Each factor has `key`, `label`, numeric `value` or `null`, `score`, within-priority `weight` and `weightPercentage`, `overallWeightPercentage`, `neutralFallback`, `sourceFields` and `sourceIds`. `meta` contains result `count`, `totalAvailable`, `resultLimit`, applied `filters`, `stateScope`, `method`, `persistence`, selected priorities, weighting explanation, `outlookYear`, `dataIntegration` and limitations. Scores are rule-based, not a trained model. A valid Victorian location contributes 30% of the final score; selected priorities share the remaining 70%. Missing factor values receive a disclosed neutral score of 50. No preference is stored by this endpoint.

## Map response shape

The collection has `type: "FeatureCollection"`, `bbox`, `stateBoundary`, `features` and `metadata` (`count`, `selectedMetric`, boundary sources, geographic level and note). Each feature has `type: "Feature"`, `id`, polygon `geometry`, and `properties` including `id`, `name`, `state`, `postcode`, `lgaCode`, `areaSqKm`, `population`, `medianHousePrice`, `medianRent`, `occupationVacancies`, `schoolCount`, `projectedPopulation`, `projectionYear`, `profilePath`, `apiPath`, and `metric: { key, label, value, unit, evidence, referencePeriod }`. `jobVacancies` can reflect SA4 data overlaid on an LGA polygon; it is not an LGA count.

## Error and frontend behaviour requiring resolution

The backend returns JSON 404 for malformed/unknown `/api` routes and region IDs. The older local frontend caught failed list and profile requests and silently substituted preview records. The newer Iteration 2 frontend branch propagates these errors. Its Preferences-page error state was fixed in local commit `bfc3e99` and tested, but that commit has not been merged or deployed, so AC8.2.4 remains open for team review and deployment. Normal client requests time out after 3 seconds; the Aiven projection request allows 12 seconds for a serverless cold connection.

## Change control and outstanding acceptance checks

1. Agree on the Iteration 2 integration branch, merge the local Express/Vercel metadata parity change, and verify the actual deployed path. The older local `website` checkout is behind and dirty.
2. The VIF projection adapter is implemented and locally verified. Complete the separate MySQL mapping for region profiles, maps and recommendation inputs before calling the whole application cloud-migrated.
3. Add browser-level tests that deliberately use a malformed API base URL and verify the visible error state. Backend tests now cover invalid recommendation locations, unknown region IDs and Express/Vercel contract parity.
4. Have frontend, backend and data owners sign off the fields they actually consume. Update this contract in the same PR whenever an endpoint or schema changes. Only then mark the LeanKit “Contract finalised, integration-ready” task Done.

Source files audited: `backend/src/app.js`, `backend/src/database/aivenClient.js`, `backend/src/routes/*.js`, `backend/src/services/{regionService,recommendationService,mapService,forecastService}.js`, `backend/src/data/regions.js`, and `frontend/src/services/regionApi.js`.
