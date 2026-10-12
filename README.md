# Australia 2050 — Regional Futures

```text
regional-futures/
|-- frontend/  React + Vite user interface
|-- backend/   Express REST API and regional data
`-- iteration-build/  Iteration evidence and technical documentation
```

## Local development

After installing the dependencies in `backend` and `frontend`, run `npm run dev` from the project root to start both services. Use `npm run dev:backend` or `npm run dev:frontend` when only one service is needed.

Both processes are required for the regional autocomplete, filters, map and profile data because each browser calls the backend on that same computer at `localhost:3001`. The backend requires the Aiven MySQL variables shown in `backend/.env.example`; it does not fall back to local CSV data at runtime.

- Frontend: `http://127.0.0.1:3000`
- Backend health: `http://localhost:3001/api/health`

The API provides:

- `GET /api/regions` with `search`, `state`, `population`, and `housePrice` query parameters
- `GET /api/data-sources` with source dates, geography and availability
- `GET /api/map/regions` as GeoJSON for the interactive Explore map
- `GET /api/regions/:regionId`
- `POST /api/recommendations` for preference-based Victorian regional matches

The recommendation endpoint is a transparent rule-based Iteration 1 service, not a trained machine-learning prediction. It validates a regional area name and one to three priorities selected from population, housing and employment. It does not store requests.

Copy the relevant `.env.example` to `.env` when ports or origins need to change.

The private preview also requires `SITE_PASSWORD_HASH` and `SESSION_SECRET`.
The password hash must be a SHA-256 hexadecimal digest, and the session secret
must contain at least 32 random characters. Store both as server-side
environment variables; never expose them through a `VITE_` variable or commit
the local `.env` file.

## Regional data boundary

At runtime, Explore, Profile, Compare, Shortlist and recommendations query the
existing Aiven staging tables directly. The provider joins the 56-row master,
housing, price-to-income, labour-force, age-structure, job-market and NERO
employment tables by LGA code/name and SA4 code. `website_dataset` is used only
for the two map geometry payloads. The legacy `website_region_profile` snapshot
is not queried.

CSV and generated JSON files are deterministic automated-test/import fixtures
only; production and local runtime endpoints do not read them. Any metric absent
from the verified Aiven staging tables stays `Not available`; there is no local
fallback. If map geometry changes, run
`npm --prefix backend run sync:map-assets -- <source-version>`. The latest
verified LGA projection horizon is 2036, so the application does not invent a
2050 LGA forecast.

## Iteration build evidence

The submission-ready evidence folder is [`iteration-build/`](iteration-build/README.md). It contains the development record, pair-programming observations, technology and first-cut data model, GitHub references, testing evidence and AI-use declaration.
