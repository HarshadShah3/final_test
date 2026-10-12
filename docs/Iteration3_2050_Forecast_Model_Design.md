# Iteration 3 — 2050 Forecast Model & Output Design

Status: **Step 1 design, for team approval.** Audited against the live Aiven schema
`simulate_australia_2050_v2` on 11 Oct 2026. This document is the specification for
Step 2 (Python model + MySQL writes, backend/frontend code) and Step 3 (integration and
tests). Nothing here changes the current 2036-only behaviour until Step 2 ships.

> Policy change: Iteration 2 deliberately refused to invent a 2050 LGA forecast. Iteration 3
> introduces a **modelled** 2050 projection. Every 2050 value must be labelled
> "modelled projection" and must never be presented as an official VIF figure.

## 1. Objective and scope

- Data flow is fixed: **MySQL → Python (parse/validate) → model → 2050 output → MySQL →
  Node backend → React dashboard**. The model runs **offline / precomputed**; the backend
  only reads result rows at request time.
- Where a region is selected on "Towards 2050", the dashboard shows several graphs covering
  current data, change over years, and projected data (with a 90% range). The
  "Regions in this outlook" selector is unchanged (≤ 4 regions).
- Scope: the 56 Victorian LGAs shown in the app (`regions.generated.json`, ids like
  `LGA20570`). The model is fitted for the 79 standard LGA 2021 areas in the database and the
  API returns whichever of the 56 are requested.
- Five indicators: population, households & dwellings, employment (SA4-sourced), median rent
  / affordability, and property prices.

## 2. Verified data inventory (live schema)

All source series the model engine needs are present as tables. No runtime CSV fallback.

| Purpose | Table | Coverage | Notes |
| --- | --- | --- | --- |
| Population history | `stg_population_lga_2001_2025` | 2001–2025, 79 LGAs + 1 unincorporated | total = `unknown_measure_19`; 5-digit 2021 codes |
| Population ERP (cross-check) | `stg_2050_population_lga_erp` | 2001–2025, 80 areas | `population_erp` only |
| VIF anchors (pop/households/dwellings) | `population_housing_projection` | 2021/2026/2031/2036 | `observation_status` ESTIMATED/PROJECTED; LGA 2021 `area_id` 3–81 |
| VIF wide (fast path) | `stg_population_vif_lga_growth` | 2021/2026/2031/2036 | population, households, dwellings as columns |
| Rent history | `stg_historical_median_rent_lga_trend` | 1999Q2–2025Q3, 79 LGAs | `median_weekly_rent_aud`; `suppressed_or_insufficient` flag |
| Affordability history | `stg_historical_affordable_rental_lga_trend` | 2000Q1–2025Q3, 79 LGAs | `affordable_lettings_share` (0–1), counts |
| Property prices | `stg_housing_property_price_suburb` | 2015–2026, 808 localities | house/unit median sale price; **no LGA column** |
| LGA price anchor | `stg_master_dataset_56_lga.median_house_price_2025_aud` | 56 LGAs, 2025 | fallback: `housing_affordability_snapshot.median_house_price_aud` |
| Employment history | `stg_employment_nero_sa4_trend` | 2015-09–2026-07 monthly, 17 SA4 | `total_employment` |
| JSA future anchors | `employment_projection` (ANZSCO + ANZSIC) | 2025 actual / 2030 / 2035 | national; area_id = Australia |
| SA4→LGA mapping | `v_lga_primary_labour_market_mapping`, `stg_master_dataset_56_lga.dominant_sa4_code` | 56 LGAs | dominant-overlap %, confidence `ACCEPTED` |

`geographic_area` gives stable keys: `area_id` 1 = Australia, 2 = Victoria, 3–81 = LGA 2021
(79), plus a second LGA vintage and SA4 areas. `model_prediction.area_id` **must use the LGA
2021 ids 3–81** (the same vintage as `population_housing_projection`), and the SA4 ids for
employment.

### Output contract already exists

The schema already defines the intended result tables (currently **empty**):

- `model_run(model_run_id, target_metric, model_name, model_version, trained_through,
  validation_method, mae, rmse, mape_pct, parameters_json, created_at)` with unique key
  `(target_metric, model_name, model_version)`.
- `model_prediction(prediction_id, model_run_id, area_id, target_date, predicted_value,
  lower_bound, upper_bound, unit, generated_at)` with unique key
  `(model_run_id, area_id, target_date)` and checks that `lower ≤ value ≤ upper`, plus FKs to
  `geographic_area` and `model_run`.

**Decision: write model output into these two tables. No new tables.**

### Known gaps

- No population for 2026 (history ends 2025); 2026 comes from the VIF anchor.
- 2025 rent/affordability is partial (Q3 only) → last complete year treated as 2024.
- **No locality→LGA crosswalk**, so suburbs cannot be aggregated to LGA history
  (see §4.7).

## 3. Model framework

All indicators share one pipeline:

1. **Extract** the series per area from the tables above; **parse** the `longtext` columns to
   numbers and dates; **validate** (row count, non-null, monotonic years, range checks) and
   drop unincorporated / suppressed rows.
2. **Annualise** quarterly/monthly series (mean or lettings-weighted mean).
3. **Candidate models** per indicator (below).
4. **Rolling-origin backtest, step 3 years**: for each origin `t0`, fit on data ≤ `t0` and
   predict `t0+3 … t0+min(15, horizon)`; compare with actuals. Report MAE / RMSE / MAPE.
5. **Champion** = lowest backtest MAE for the indicator (MAPE where the baseline is positive);
   ties break toward the simpler model.
6. **Anchor** to official VIF where it exists (population, households, dwellings) so the near
   term matches published figures; beyond 2036 extrapolate with a **damped growth** rate
   `g·φ^k`, `φ` default 0.95 and lower for fast growers, to stop runaway 24-year compounding.
7. **Shrinkage**: blend small LGAs toward the Victoria/regional trend, weighted by population
   size and series length, to keep small-area estimates stable.
8. **Prediction interval** (§5) and **validity clamping** (population ≥ 0, share ∈ [0,1], price
   ≥ 0).
9. **Write** `model_run` + `model_prediction` (idempotent: delete prior rows for the same
   `target_metric`/`model_version` then insert).

Backtest against the VIF 2026/2031/2036 anchors doubles as a realism check: if the fitted
pre-2036 growth does not reproduce the official direction, the damping and blend are tuned
until it does.

## 4. Per-indicator champion models

### 4.1 Population — LGA, 2001–2025
- Candidates: linear OLS; log-linear (exponential); damped trend.
- Anchors: VIF 2021/2026/2031/2036 as checkpoints, fitted through to 2036, then extended to
  2050.
- Unit `people`; `target_metric = population_lga`.

### 4.2 Households — LGA
- Anchors: VIF 2021/2026/2031/2036. No annual history.
- Champion uses **average household size consistency**: size drifts along the VIF points
  (`population / households`), and `households_2050 = population_2050 / size_2050`, blended
  with the damped implied CAGR. This keeps households consistent with the population path.
- Unit `households`; `target_metric = households_lga`.

### 4.3 Dwellings — LGA
- Anchors: VIF 2021/2026/2031/2036; `dwelling_occupancy_ratio` drifts toward occupancy 1.
- Champion: damped dwellings/households ratio trend. Unit `dwellings`;
  `target_metric = dwellings_lga`.

### 4.4 Employment — SA4 (inherited to LGA)
- History: `stg_employment_nero_sa4_trend` monthly → annual mean 2016–2026, 17 SA4.
- Candidates: linear, log-linear, damped trend; optionally shaped by the JSA national
  2025→2030→2035 growth from `employment_projection`.
- Inherited to each LGA via `v_lga_primary_labour_market_mapping` (dominant SA4, overlap %).
- Unit `persons`; `target_metric = employment_sa4`; predictions stored against **SA4**
  `area_id`s; the backend maps LGA→dominant SA4 and the dashboard discloses the geography.

### 4.5 Median rent — LGA
- History: `stg_historical_median_rent_lga_trend` quarterly → annual 2000–2024 (2025 partial).
- Candidates: linear; log-linear; damped trend. Unit `AUD/week`;
  `target_metric = median_weekly_rent_aud`.

### 4.6 Affordable lettings share — LGA
- History: `stg_historical_affordable_rental_lga_trend` quarterly → annual lettings-weighted
  share 2000–2024.
- Champion: **linear only** (as agreed), clamped to [0,1]; MAE. Unit `share`;
  `target_metric = affordable_lettings_share`.

### 4.7 Property price — LGA (lowest confidence)
- No LGA history and no suburb→LGA crosswalk, so:
  1. build a **Victoria-wide price growth trend** from the 808 suburbs (median across
     suburbs, 2015–2026), damped to 2050;
  2. anchor each LGA at its 2025 median house price
     (`stg_master_dataset_56_lga.median_house_price_2025_aud`);
  3. apply the damped statewide growth to the anchor.
- Unit `AUD`; `target_metric = median_house_price_aud`; always flagged **low confidence** and
  given the widest interval. Limitation disclosed in the API meta.

## 5. Prediction interval (90%)

- Backtest residuals by horizon `h` give `σ(h) = c·h^p` (log–log fit of |residual| on `h`).
- 90% interval = `predicted ± 1.645·σ(h)`; width grows with horizon.
- Floors: property price has a minimum relative width; share clamped to [0,1]; all values
  clamped ≥ 0.
- Stored in `model_prediction.lower_bound` / `upper_bound`; `confidenceLevel: 0.90` is
  surfaced in the API meta.

## 6. Output rows written to MySQL

`model_run` — one row per indicator (units and horizons per §4):

| target_metric | model_name | unit | trained_through |
| --- | --- | --- | --- |
| `population_lga` | `anchored-damped-trend` | people | 2025-06-30 |
| `households_lga` | `anchored-household-size` | households | 2036-06-30 |
| `dwellings_lga` | `anchored-damped-ratio` | dwellings | 2036-06-30 |
| `employment_sa4` | `damped-trend` | persons | 2026-06-30 |
| `median_weekly_rent_aud` | `damped-trend` | AUD/week | 2024-06-30 |
| `affordable_lettings_share` | `bounded-linear` | share | 2024-06-30 |
| `median_house_price_aud` | `anchor-plus-state-trend` | AUD | 2025-06-30 |

`parameters_json` records: champion choice, φ, anchor source/vintage, backtest windows,
`σ(h)` coefficients `c`/`p`, z = 1.645, shrinkage weight, and a `lowConfidence` flag where
relevant. `mae`/`rmse`/`mape_pct` hold the backtest scores.

`model_prediction` — `target_date` at `2031-06-30`, `2036-06-30`, `2041-06-30`, `2046-06-30`,
`2050-06-30` (2050 is the headline). Areas: LGA `area_id` 3–81 for all indicators except
employment (SA4 `area_id`s). Idempotent re-runs.

## 7. Backend API changes (backwards compatible)

Extend `GET /api/forecasts/regions` in `backend/src/services/forecastService.js`:

- Keep the VIF query (official 2021–2036) as the baseline series.
- Add a second query joining `model_run` + `model_prediction` + `geographic_area` for the
  requested LGA codes (and dominant SA4 for employment), years 2031–2050.
- Merge so each region gains:
  - `series.population` / `households` / `dwellings` extended to 2050, modelled points
    carrying `confidenceLow`/`confidenceHigh`;
  - new `series.housingCost` (rent), `series.affordability`, `series.employment`,
    `series.propertyPrice`;
  - new indicators `medianRent`, `affordableShare`, `employment`, `propertyPrice` with
    baseline + projected(2050) + range.
- `meta` gains `projectionYear: 2050`, `confidenceLevel: 0.90`,
  `scenario: "modelled-projection"`, model version, and added `limitations` (modelled not
  official; employment inherited from dominant SA4; property prices anchored on the 2025 LGA
  snapshot + statewide trend; 24-year horizon).
- **Fallback:** if no `model_prediction` rows exist, behave exactly as today (2021–2036,
  bounds `null`). The Express, Vercel (`api/index.js`) and Netlify (`netlify/functions/api.js`)
  handlers share this service, so the contract stays aligned; the parity test is extended.

## 8. Frontend dashboard design (`Towards2050Page.jsx`, `theme.css`)

Selector unchanged. For each displayed region:

- **KPI cards → 2050**: population with 90% range, households, dwellings; "modelled" badge.
- **Charts**:
  1. Population outlook 2001→2050 — solid history/official to 2036, dashed modelled
     2036→2050 with a shaded 90% band.
  2. Households & dwellings to 2050.
  3. **Change over the years** — annual % change / CAGR per region.
  4. Rent & affordability dual-axis trajectory.
  5. Property price trajectory (low-confidence styling).
  6. Employment trajectory (SA4-inherited disclosure).
- **Indicator table**: add a 2050 column showing value + 90% range; 2036 remains the last
  official point.
- Every 2050 value labelled "modelled projection"; ranges always shown; limitations visible.

## 9. Validation, tests, and honesty rules

- Python unit tests: backtest windows, `σ(h)` fit, clamping, household-size consistency,
  SA4→LGA inheritance.
- Backend tests: extended contract from fixtures, null when model rows absent, and the
  Express/Vercel/Netlify parity test.
- Labelling: never call 2050 official; always show the range and the source geography.
- Keep `docs/Iteration2_API_Data_Contract_DRAFT.md`'s "do not invent a 2050 forecast" line
  until Step 2 lands, then update it to describe the modelled projection.

## 10. Open items for Step 2

- Confirm JSA `employment_projection` is used only as an optional national shape (documented,
  not required) — it is national, not LGA.
- Decide the exact shrinkage weights and φ per indicator during backtest tuning; recorded in
  `parameters_json`.
- Decide whether the dashboard shows modelled 2031/2036 alongside official values (proposed:
  show official solid, modelled dashed, with a legend note).
