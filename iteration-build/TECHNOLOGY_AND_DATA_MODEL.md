# First Cut: Technology and Data Model

## Development approach

- Iterative vertical slices: Landing → Preferences → Explore map → Regional Profile.
- Component-based frontend with a small REST API boundary.
- Feature-branch integration and review before merging to `main`.
- Explainable rules for recommendations; no unsupported prediction claim.
- Automated backend regression tests plus frontend production-build verification.
- Data provenance and image licensing stored beside the implementation.

## Technology

| Layer | First-cut choice | Purpose |
| --- | --- | --- |
| Frontend | JavaScript, React, React DOM | Page and component rendering |
| Navigation | React Router | Landing, preferences, explore and profile routes |
| Build tooling | Vite | Development server and production bundle |
| Icons | Lucide React (ISC) | Population, housing and employment card icons |
| Backend | Node.js, Express | REST endpoints and recommendation service |
| Map | Native SVG + GeoJSON | Dependency-light, accessible Victoria/LGA map |
| Data inputs | CSV, JSON and GeoJSON | Reviewed regional indicators and geometry |
| Tests | Node built-in test runner | Service, filter, ranking and map regression tests |

The current first cut does not require MySQL. Express reads a generated JSON file at startup. This keeps Iteration 1 reproducible while allowing a later database adapter to replace the data-loading layer without changing the frontend API.

## Runtime flow

```text
Landing
  → Preferences (location + 1–3 priorities, memory only)
  → POST /api/recommendations
  → GET /api/map/regions
  → Explore map (top four shown by colour)
  → selected map region card
  → GET /api/regions/:regionId
  → Regional Profile
```

## First-cut regional record

| Field group | Representative fields | Notes |
| --- | --- | --- |
| Identity | `id`, `lgaCode`, `name`, `state`, `postcode` | LGA code is the stable join key |
| Population | `population`, `populationGrowth`, `population2025` | Reference period retained separately |
| Housing | `medianHousePrice`, `medianRent`, affordability fields | Missing values remain unavailable, not zero |
| Employment | `highestDemandOccupation`, `occupationVacancies`, `employmentGrowth` | Geography metadata distinguishes LGA and SA4 |
| Education/safety | school and offence fields | Retained for later iterations; not all are displayed |
| Outlook | `projectedPopulation`, `projectionYear` | Verified horizon is 2036 |
| Governance | `dataAvailability`, `referencePeriods`, geography objects | Supports transparent labels and warnings |

## API contracts

- `GET /api/health` — service health.
- `GET /api/regions` — autocomplete and population/house-price filtering.
- `GET /api/regions/:regionId` — one profile.
- `GET /api/map/regions?metric=...` — Victoria boundary and 56 LGA features.
- `POST /api/recommendations` — location, one to three priorities, optional filters and result limit.
- `GET /api/data-sources` — source, period, quality and geography metadata.

## Recommendation model

For selected priorities, each region receives a normalised score for each supported topic. Priority scores are averaged, then combined with proximity:

```text
combined score = 0.70 × average(selected priority scores)
               + 0.30 × geographic proximity score
```

The service returns the component scores, ranks and plain-language reasons. It is a transparent recommendation model, not a trained regression model or a guaranteed forecast.
