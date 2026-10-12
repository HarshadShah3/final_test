# Backend API

The Express backend supplies regional profiles and an Iteration 1 recommendation contract for the React frontend.

## Run locally

```powershell
npm install
npm run dev
```

The default address is `http://localhost:3001`. Check `GET /api/health` before testing the frontend.

## Aiven VIF projection connection

Copy `.env.example` to `.env` and set the server-side `DB_*` values. Use Aiven's
CA certificate through `DB_SSL_CA_PATH` locally, or `DB_SSL_CA` /
`DB_SSL_CA_BASE64` on the deployment host. Never expose these values through a
`VITE_*` variable.

- `GET /api/forecasts/health` verifies the TLS connection and schema version.
- `GET /api/forecasts/regions?regionIds=ballarat,bendigo` returns the published
  VIF population, household and dwelling series for 2021, 2026, 2031 and 2036.

The latest verified horizon is 2036. This is a database-backed publication of
the VIF projection series, not a claim that the project trained an ML model or
produced a validated 2050 forecast.

## Rebuild the integrated data

The backend imports the supplied Iteration 1 LGA master CSV. It updates the
overlapping population, SEIFA, house-price, rent and occupation-demand fields
while retaining reviewed fields that are not included in this CSV iteration.

```powershell
npm run build:data
```

The command writes `src/data/regions.generated.json`. It validates all 56 LGA
names and codes before updating the runtime dataset. Data provenance, dates and
availability are available from `GET /api/data-sources`.

## Recommendation request

`POST /api/recommendations`

```json
{
  "priorities": ["population", "housing", "jobs"],
  "location": "Ballarat"
}
```

Supported priorities are `population`, `housing`, and `jobs`. The endpoint accepts one to three unique priorities. It returns the top four of 56 regions by default; set `resultLimit` to `all` to receive the complete ranking.

The matching service is deliberately rule based and explainable. Population, reviewed median house price, median rent and employment data affect the three corresponding scores. Geographic distance from the selected LGA contributes 30% of the final score, using centres derived from the supplied LGA boundaries; all selected priorities share the remaining 70% equally. The service does not train a model, claim future accuracy, write to a database, or store user preferences. The Data Science team can later replace the scoring layer without changing the frontend request format.

## Explore map contract

- `GET /api/map/regions?metric=population`
- `GET /api/map/regions/:regionId?metric=medianRent`

The map endpoints return GeoJSON using the simplified ABS ASGS 2021 Victoria state boundary as the complete background and LGA polygons for all 56 regions in the team profile dataset as the interactive layer. The `metric` query accepts `population`, `medianRent`, `jobVacancies`, `schools` or `projectedPopulation`. Each feature contains the region id, name, postcode, LGA code, profile path, population, available median house price, display metric, reference period and evidence label. The frontend combines this geometry with the existing backend recommendation order to highlight four regions for one selected priority at a time.

Run `npm run build:map` only when the committed ABS boundary file needs to be refreshed.

## Tests

```powershell
npm test
```

The tests cover regional filters, input validation, Victoria-only output, match reasons, map geometry, and changes in ranking when priorities change.
