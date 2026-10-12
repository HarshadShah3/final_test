# Development Artefacts

## Iteration trail

| Date | Increment | Repository evidence |
| --- | --- | --- |
| 31 Aug–1 Sep 2026 | Employment and housing source inventory, cleaning and processed outputs | `Employment/`, data-cleaning branch commits `69189c4`–`7ea12ee` |
| 1 Sep 2026 | React/Express prototype and initial recommendation API | commits `090e8c8`, `da9bde3`, `ba3ec6c` |
| 1–2 Sep 2026 | Reviewed regional data integration, provenance and resilient frontend fallback | commits `eb3be3`, `f522d54`, `f445cf8` |
| 2 Sep 2026 | Full LGA map API, filters, autocomplete, preference flow and accessible profile pages | commits `d3ed2a2`–`de3e048` |
| 2 Sep 2026 | UI simplification after feedback: landing recovery, three profile cards, icons and colour-only map ranking | commits `91572d4`–`8b75aa0` |
| 2–3 Sep 2026 | Location-aware ranking, revised master data and licensed photography for all regions | commits `84b20e3`, `7761f9f`, `7b1d6d9` |

## Artefacts retained in the repository

- Data inventory and cleaning scripts: `Employment/scripts/` and `Employment/reports/`.
- Normalised input and quality report: `backend/data-sources/`.
- Reproducible import scripts: `backend/scripts/buildRegionalProfiles.js` and `backend/scripts/buildMapBoundaries.js`.
- Runtime API data and services: `backend/src/data/` and `backend/src/services/`.
- Automated regression and contract tests: `backend/test/`.
- React components and page-level increments: `frontend/src/`.
- Image provenance: `IMAGE_CREDITS.md` and `frontend/public/images/regions/image_sources_and_licences.txt`.
- Git history: small commits record additions, removals, feedback changes and cross-role handoffs.

## Design decisions and observed changes

1. Preferences are held in React memory only. Refreshing clears them; the project does not use local storage for these answers.
2. The recommendation service is rule based and explainable. It is not described as a machine-learning forecast.
3. One to three user priorities share 70% of the combined score; geographic proximity to the entered LGA contributes 30%.
4. The Explore map keeps the Victoria boundary visible and highlights four recommended regions using colour only.
5. Profile pages intentionally show only Population, Housing and Employment in Iteration 1. Unsupported values display `Coming soon`.
6. The website title expresses a 2050 vision, but the latest verified LGA projection field is 2036 and is not relabelled as a 2050 prediction.

## Verification record

Run from the repository root using two terminals:

```powershell
cd backend
npm install
npm test
npm run dev
```

```powershell
cd frontend
npm install
npm run build
npm run dev
```

On 3 September 2026, the frontend build passed and all 25 backend tests passed. Tests cover the 56-region dataset, map geometry, validation, filter bands, all valid priority combinations, order independence, location adjustment and top-four/all-result behaviour.

## Current limitations

- There is no MySQL runtime dependency in this first cut; reviewed CSV/GeoJSON inputs are compiled into a JSON dataset loaded by Express.
- Employment demand is mapped from SA4 indicators to an LGA display and is labelled with that geographic warning.
- Source years differ across indicators; API metadata preserves the reference periods.
- Mentor access to the private GitHub repository must be granted by a repository administrator using the actual mentor usernames.
