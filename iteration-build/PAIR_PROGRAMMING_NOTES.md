# Pair-Programming and Collaborative Review Notes

## Working mode

The iteration used short driver/navigator handoffs and asynchronous review on a shared feature branch. These notes do not claim that every commit was produced in a continuous live pairing session.

## Observation 1 — frontend/backend contract

- Participants/roles: website integration owner as driver; frontend owner as navigator/reviewer.
- Scope: preference payload, recommendation response, map feature properties and Profile route.
- Evidence: commits `da9bde3`, `ba3ec6c`, `e82c419`, `de3e048` and the contracts documented in `backend/README.md`.
- Observation: agreeing on `priorities`, `location`, filter keys and `profilePath` prevented the React pages from depending on backend internals.
- Improvement made: error handling and preview fallback were added so the interface explains a backend failure instead of rendering an empty page.

## Observation 2 — Data Science handoff

- Participants/roles: Data Science contributor supplied cleaned housing/employment outputs; website integration owner joined and exposed the reviewed fields.
- Scope: stable LGA codes, geography labels, reference periods and missing-value rules.
- Evidence: data-cleaning commits through `7ea12ee`, integration commits `eb3be3`/`f522d54`, and `backend/data-sources/data_quality.json`.
- Observation: field names alone were insufficient; every joined value also needed geography, evidence status and reference-period metadata.
- Improvement made: employment values carry the SA4 warning and data-quality metadata is returned by the API.

## Observation 3 — shared-branch UI review

- Participants/roles: integration owner and Baiyang Huang exchanged the feature branch between driver and reviewer roles.
- Scope: filters, location-aware recommendations, revised master CSV, profile photography and credits.
- Evidence: commits `84b20e3`, `7761f9f` and `7b1d6d9`.
- Observation: a fast-forward handoff preserved both contributors' work, but the receiving developer still needed to run the complete build/test suite and review changed behaviour.
- Improvement made: 56/56 image coverage and 25/25 backend tests were verified after synchronisation.

## Team convention for the next session

1. Driver states the single task and expected acceptance check.
2. Navigator checks naming, data provenance, accessibility and API compatibility while the driver implements.
3. Roles swap after one small commit.
4. Both participants record the commit hash, one observation and one follow-up action.
5. Work remains on a feature branch until team review; no direct merge to `main` is implied by these notes.
