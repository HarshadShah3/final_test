# Backend data sources

`vic_reg_iteration_1_lga_master_data.csv` is the supplied export of
`Vic_Reg Data Final for Iteration 1.xlsx` (`LGA_Master_Data`). It contains all
56 Victorian regional and Melbourne-interface LGAs and 20 populated fields.

The import audit found no missing cells, duplicate LGA names or duplicate current
LGA codes. `data_quality.json` records the checks and the source qualification.
The CSV is matched to the application profiles using both LGA name and the
stable 2021 LGA code.

`regional_profiles_reviewed.csv` is the complete, normalised import snapshot for
the current regional values outside the Towards 2050 forecasting view. It
contains the 56 API profile records, including the reviewed population, housing,
employment, education, safety, health and transport fields already integrated by
the team. `buildRegionalProfiles.js` reads this file first and then applies the
authoritative Iteration 1 master CSV fields described below. The generated JSON
is a runtime artefact only and is never used as an input to its own rebuild.

`price_to_income_ratio_lga.csv` is the processed housing affordability source
for all 56 LGAs. It calculates price-to-income from the 2025 median house price
and annualised 2021 Census median weekly household income. The differing source
years are retained and disclosed as a limitation rather than being hidden.

The supplied CSV is authoritative for 2025 population, VIF 2021/2026 population,
SEIFA, 2025 median house price, September 2025 median rent and July 2026
highest-demand occupation. Fields absent from this iteration, including education,
safety and 2036 projections, retain their previously integrated reviewed values.

The original download is never modified and is not required at runtime. Run
`npm run build:data` to rebuild the import dataset entirely from the three committed
CSV files. The build validates all 56 housing LGA codes and names, checks the
price and income values against the existing sources, and recalculates every
ratio before publishing it. Each generated region includes `dataProvenance.fieldSources`, allowing
the import to record the exact source behind each metric.

The website does not read these CSV files at runtime and does not query the
legacy `website_region_profile` snapshot. Explore, Profile, Compare, Shortlist
and recommendations join the existing Aiven staging tables directly. The
committed files remain deterministic import inputs and test fixtures only.

`website_dataset` stores map geometry because the database has no other spatial
boundary table. Run `npm run sync:map-assets -- <source-version>` only after the
committed GeoJSON geometry has been reviewed and rebuilt.

`open-service-access/` contains the four reviewed CC BY 4.0 import files for
Health & services and Safety & access. Run `npm run import:service-access` from
the backend folder to validate the files and refresh these Aiven staging tables:

- `stg_health_facilities_open_2025`
- `stg_health_services_lga_2025`
- `stg_health_ed_median_time_2024_25`
- `stg_transport_access_lga_2026`

The import replaces only the rows in these four tables and records schema
version `20260915_open_service_v1`. Hospital and general-practice counts,
weekday GTFS calls per stop, and rail access are available for all 56 website
LGAs. AIHW hospital-level median time in ED is available for 20 of the 56 LGAs.
It is published as a range of hospital medians and is never relabelled as an
average waiting time. Nearest-emergency-department distance remains unavailable
until the product defines the point from which distance should be calculated.

`victoria_regional_profile.csv` also contains the reviewed VIF growth-pressure
indicator for all 56 LGAs. The import validates that each value equals VIF
population growth minus VIF dwelling growth for 2021–2036, then stores it in
`stg_growth_pressure_lga_2036` with schema version
`20260915_growth_pressure_v1`. The runtime reads this table directly from
Aiven MySQL; it does not fall back to the CSV.

## Future external API migration

The React pages already consume the stable `/api/regions`, `/api/map` and
`/api/recommendations` contracts rather than importing CSV files. When the
external regional-data API is ready, replace the data-provider implementation
behind those endpoints or set `VITE_API_BASE_URL` to a compatible external API.
Keep region IDs, null handling and `dataProvenance` in the response contract so
Profile, Compare, Shortlist and Explore do not need page-level rewrites.

`lga_boundaries.geojson` contains simplified polygon geometry for all 56 website
LGAs. It is generated from the Australian Bureau of Statistics ASGS 2021 LGA
ArcGIS service in EPSG:4326 by running `npm run build:map`.

`victoria_boundary.geojson` contains the simplified ABS ASGS 2021 Victoria state
boundary used as the complete, non-interactive map background. The same map build
command refreshes both boundary files.
