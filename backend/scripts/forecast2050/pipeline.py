# -*- coding: utf-8 -*-
"""MySQL -> model -> MySQL pipeline for the Iteration 3 "Towards 2050" forecast.

Reads the reviewed historical and projection tables from Aiven MySQL, parses and
validates them, fits the champion model for each indicator, calibrates a 90%
prediction interval, and writes the results to ``model_run`` and
``model_prediction`` - the output contract already defined in the schema.

The model is precomputed (offline); the Node backend only reads the result tables.
See README.md for how to run it.
"""

from __future__ import annotations

import base64
import json
import math

import numpy as np
import pandas as pd

import engine

# Years written for every indicator. 2050 is the headline horizon.
TARGET_YEARS = (2031, 2036, 2041, 2046, 2050)
PHI = engine.DEFAULT_PHI
Z = engine.Z_90
DEFAULT_MODEL_VERSION = "iteration3-v1.0.0"

ANCHOR_YEARS = (2021, 2026, 2031, 2036)


def target_date(year):
    return f"{int(year)}-06-30"


def decimal_year(value):
    """Decimal year matching the convention in the loaders (day-of-year / 365.25)."""
    timestamp = pd.Timestamp(value)
    return timestamp.year + (timestamp.dayofyear - 1) / 365.25


def dated_splits(origin_years, horizons, month_day, max_t):
    """Rolling-origin splits anchored on real observation dates.

    Monthly/quarterly series are only observed on specific days, so forecast points
    must equal those dates exactly rather than an arbitrary decimal year.
    """
    splits = []
    for origin in origin_years:
        train_end = decimal_year(f"{origin}-{month_day}")
        for horizon in horizons:
            point = decimal_year(f"{origin + horizon}-{month_day}")
            if point <= max_t + 0.01:
                splits.append((train_end, point))
    return splits


def to_float(series):
    return pd.to_numeric(series, errors="coerce").astype(float)


def to_int(series):
    return pd.to_numeric(series, errors="coerce").astype("Int64")


# --------------------------------------------------------------------------- #
# Database                                                                     #
# --------------------------------------------------------------------------- #
def _ssl_kwargs(environ):
    """TLS options for Aiven, matching backend/src/database/aivenClient.js."""
    certificate = None
    if environ.get("DB_SSL_CA_BASE64"):
        certificate = base64.b64decode(environ["DB_SSL_CA_BASE64"]).decode("utf-8")
    elif environ.get("DB_SSL_CA"):
        certificate = environ["DB_SSL_CA"].replace("\\n", "\n")
    elif environ.get("DB_SSL_CA_PATH"):
        with open(environ["DB_SSL_CA_PATH"], "r", encoding="utf-8") as handle:
            certificate = handle.read()
    if certificate:
        return {"ssl_ca": certificate}
    # Aiven requires TLS; skip local verification when no CA is supplied.
    return {"ssl_disabled": False, "ssl_verify_cert": False, "ssl_verify_identity": False}


class Database:
    def __init__(self, connection):
        self.connection = connection

    @classmethod
    def connect(cls, environ):
        import pymysql

        required = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"]
        missing = [key for key in required if not environ.get(key)]
        if missing:
            raise RuntimeError(f"Missing database configuration: {', '.join(missing)}")
        options = dict(
            host=environ["DB_HOST"],
            port=int(environ["DB_PORT"]),
            user=environ["DB_USER"],
            password=environ["DB_PASSWORD"],
            database=environ["DB_NAME"],
            charset="utf8mb4",
            connect_timeout=15,
        )
        options.update(_ssl_kwargs(environ))
        return cls(pymysql.connect(**options))

    def query(self, sql, params=None):
        with self.connection.cursor() as cursor:
            cursor.execute(sql, params or ())
            rows = cursor.fetchall()
            columns = [description[0] for description in cursor.description]
        return pd.DataFrame(list(rows), columns=columns)

    def execute(self, sql, params=None):
        with self.connection.cursor() as cursor:
            cursor.execute(sql, params or ())
            # Returns (lastrowid, rowcount) - callers must unpack in that order.
            return cursor.lastrowid, cursor.rowcount

    def executemany(self, sql, rows):
        with self.connection.cursor() as cursor:
            cursor.executemany(sql, rows)
            return cursor.rowcount

    def commit(self):
        self.connection.commit()

    def close(self):
        self.connection.close()


# --------------------------------------------------------------------------- #
# Loaders and validation                                                       #
# --------------------------------------------------------------------------- #
def load_lga_area(db):
    frame = db.query("""
        SELECT area_id, area_code, area_name
        FROM geographic_area
        WHERE area_type = 'LGA' AND boundary_vintage = 2021 AND state_code = 'VIC'
    """)
    frame["area_id"] = to_int(frame["area_id"])
    frame["area_code"] = frame["area_code"].astype(str)
    return frame


def load_population_history(db):
    frame = db.query("""
        SELECT ga.area_id, ga.area_code, ga.area_name,
               CAST(p.year AS UNSIGNED) AS year,
               CAST(p.unknown_measure_19 AS DECIMAL(24,4)) AS value
        FROM stg_population_lga_2001_2025 AS p
        JOIN geographic_area AS ga
          ON ga.area_type = 'LGA' AND ga.boundary_vintage = 2021 AND ga.area_code = p.lga_code
        WHERE p.geography_status = 'standard_lga'
    """)
    frame["area_id"] = to_int(frame["area_id"])
    frame["year"] = to_int(frame["year"])
    frame["value"] = to_float(frame["value"])
    return frame.dropna(subset=["area_id", "year", "value"])


def load_vif_anchors(db):
    frame = db.query("""
        SELECT ga.area_id, ga.area_code, ga.area_name,
               php.reference_year,
               php.estimated_resident_population AS population,
               php.total_households AS households,
               php.total_dwellings AS dwellings
        FROM population_housing_projection AS php
        JOIN geographic_area AS ga ON ga.area_id = php.area_id
        WHERE ga.area_type = 'LGA' AND ga.boundary_vintage = 2021 AND ga.state_code = 'VIC'
          AND php.reference_year IN (2021, 2026, 2031, 2036)
          AND php.data_status = 'REPORTED'
    """)
    for column in ("population", "households", "dwellings"):
        frame[column] = to_float(frame[column])
    frame["area_id"] = to_int(frame["area_id"])
    frame["reference_year"] = to_int(frame["reference_year"])
    return frame.dropna(subset=["area_id", "reference_year"])


def load_employment(db):
    frame = db.query("""
        SELECT sa4_code, sa4_name, date,
               CAST(total_employment AS DECIMAL(24,4)) AS value
        FROM stg_employment_nero_sa4_trend
    """)
    frame["value"] = to_float(frame["value"])
    dates = pd.to_datetime(frame["date"], errors="coerce")
    frame["t"] = dates.dt.year + (dates.dt.dayofyear - 1) / 365.25
    return frame.dropna(subset=["t", "value"])


def load_sa4_area(db):
    frame = db.query("""
        SELECT area_id, area_code, area_name
        FROM geographic_area
        WHERE area_type = 'SA4' AND boundary_vintage = 2021 AND state_code = 'VIC'
    """)
    frame["area_id"] = to_int(frame["area_id"])
    frame["area_code"] = frame["area_code"].astype(str)
    return frame


def load_rent(db):
    frame = db.query("""
        SELECT lga_code_2021 AS lga_code, lga_name, quarter,
               CAST(median_weekly_rent_aud AS DECIMAL(24,4)) AS value,
               CAST(lettings_count AS DECIMAL(24,4)) AS lettings
        FROM stg_historical_median_rent_lga_trend
        WHERE data_status = 'reported'
    """)
    frame["value"] = to_float(frame["value"])
    quarters = pd.to_datetime(frame["quarter"], errors="coerce")
    frame["t"] = quarters.dt.year + (quarters.dt.dayofyear - 1) / 365.25
    return frame.dropna(subset=["t", "value"])


def load_affordability(db):
    frame = db.query("""
        SELECT lga_code_2021 AS lga_code, lga_name, quarter,
               CAST(affordable_lettings_share AS DECIMAL(24,6)) AS value,
               CAST(affordable_lettings_count AS DECIMAL(24,4)) AS lettings
        FROM stg_historical_affordable_rental_lga_trend
        WHERE data_status = 'reported'
    """)
    frame["value"] = to_float(frame["value"])
    quarters = pd.to_datetime(frame["quarter"], errors="coerce")
    frame["t"] = quarters.dt.year + (quarters.dt.dayofyear - 1) / 365.25
    return frame.dropna(subset=["t", "value"])


def load_price_suburb(db):
    frame = db.query("""
        SELECT source_locality_name, property_type,
               CAST(year AS UNSIGNED) AS year,
               CAST(median_sale_price_aud AS DECIMAL(24,2)) AS value
        FROM stg_housing_property_price_suburb
        WHERE year_status = 'published' AND data_status = 'reported' AND property_type = 'house'
    """)
    frame["year"] = to_int(frame["year"])
    frame["value"] = to_float(frame["value"])
    return frame.dropna(subset=["year", "value"])


def load_price_anchor(db):
    frame = db.query("""
        SELECT lga_code_2021_abs AS lga_code, lga_name,
               CAST(median_house_price_2025_aud AS DECIMAL(24,2)) AS value
        FROM stg_master_dataset_56_lga
    """)
    frame["value"] = to_float(frame["value"])
    return frame.dropna(subset=["value"])


# --------------------------------------------------------------------------- #
# Small helpers                                                                #
# --------------------------------------------------------------------------- #
def pivot_metric(anchors_long, column):
    wide = anchors_long.pivot_table(index="area_id", columns="reference_year", values=column, aggfunc="first")
    wide.columns = [int(column_year) for column_year in wide.columns]
    return wide


def area_id_by_code(area_frame):
    return {str(code): int(area_id) for code, area_id in zip(area_frame["area_code"], area_frame["area_id"])}


def series_frame(frame, id_column, label_column, t_column, value_column):
    return pd.DataFrame({
        "series_id": frame[id_column].astype(str),
        "series_label": frame[label_column].astype(str),
        "t": frame[t_column].astype(float),
        "value": frame[value_column].astype(float),
    }).dropna().sort_values(["series_id", "t"])


def interval(point, half, mode, bounds):
    if mode == "relative":
        lower = point * (1.0 - half)
        upper = point * (1.0 + half)
    else:
        lower = point - half
        upper = point + half
    return engine.clip(lower, bounds), engine.clip(upper, bounds)


def result(target_metric, model_name, unit, trained_through, validation_method, metrics, predictions, parameters):
    return {
        "target_metric": target_metric,
        "model_name": model_name,
        "unit": unit,
        "model_version": DEFAULT_MODEL_VERSION,
        "trained_through": trained_through,
        "validation_method": validation_method,
        "mae": metrics.get("mae"),
        "rmse": metrics.get("rmse"),
        "mape_pct": metrics.get("mape_pct"),
        "parameters_json": parameters,
        "predictions": predictions,
    }


def remap_predictions(outcome, code_to_area):
    predictions = []
    for point in outcome["predictions"]:
        area_id = code_to_area.get(str(point["series_id"]))
        if area_id is None:
            continue
        predictions.append({
            "area_id": int(area_id),
            "year": point["year"],
            "value": point["value"],
            "lower": point["lower"],
            "upper": point["upper"],
        })
    return predictions


# --------------------------------------------------------------------------- #
# Trend indicator (employment, rent, affordability, price index)               #
# --------------------------------------------------------------------------- #
def run_trend_indicator(series, splits, target_years, *, champion_metric="mae",
                        models=("linear_trend", "log_linear_trend"), bounds=(0, None),
                        sigma_mode="relative", sigma_floor=0.0, phi=PHI, min_train_points=4):
    detailed, summary = engine.rolling_backtest(
        series, splits, min_train_points=min_train_points, models=models, bounds=bounds)
    champion = engine.select_champion(summary, champion_metric) or "linear_trend"
    metrics = engine.champion_metrics(summary, champion)
    sigma_params, sigma = engine.calibrate_sigma(
        detailed, relative=(sigma_mode == "relative"), floor=sigma_floor)

    predictions = []
    for series_id, group in series.groupby("series_id", sort=False):
        group = group.sort_values("t")
        t = group["t"].to_numpy(float)
        values = group["value"].to_numpy(float)
        params = engine.MODELS[champion].fit(t, values)
        used = champion
        if params is None:
            params = engine.MODELS["linear_trend"].fit(t, values)
            used = "linear_trend"
        last_t = float(t[-1])
        last_value = float(values[-1])
        for year in target_years:
            years = max((year + 0.5) - last_t, 0.0)
            if used == "log_linear_trend":
                point = last_value * engine.damped_log_growth(params["b"], years, phi)
            else:
                point = last_value + params["b"] * engine.damped_additive_growth(1.0, years, phi)
            point = engine.clip(point, bounds)
            horizon = max(year - math.floor(last_t), 1.0)
            half = Z * sigma(horizon)
            lower, upper = interval(point, half, sigma_mode, bounds)
            predictions.append({
                "series_id": series_id, "year": year,
                "value": point, "lower": lower, "upper": upper,
            })

    return {
        "champion": champion,
        "metrics": metrics,
        "sigma_params": sigma_params,
        "predictions": predictions,
    }


# --------------------------------------------------------------------------- #
# Anchored indicators (population, households, dwellings)                      #
# --------------------------------------------------------------------------- #
def error_row(horizon, actual, predicted):
    return {"horizon": float(horizon), "actual": float(actual), "predicted": float(predicted),
            **engine.error_metrics(float(actual), float(predicted))}


def anchored_error_rows(wide, phi=PHI):
    rows = []
    for _, row in wide.iterrows():
        values = {year: (None if pd.isna(row.get(year)) else float(row[year])) for year in ANCHOR_YEARS}
        if any(value is None for value in values.values()):
            continue
        growth = engine.cagr(values[2021], values[2026], 5)
        if growth is not None:
            predicted_2031 = values[2026] * engine.damped_cumulative_growth(growth, 5, phi)
            predicted_2036 = values[2026] * engine.damped_cumulative_growth(growth, 10, phi)
            rows.append(error_row(5, values[2031], predicted_2031))
            rows.append(error_row(10, values[2036], predicted_2036))
        growth2 = engine.cagr(values[2026], values[2031], 5)
        if growth2 is not None:
            predicted = values[2031] * engine.damped_cumulative_growth(growth2, 5, phi)
            rows.append(error_row(5, values[2036], predicted))
    return pd.DataFrame(rows)


def anchored_metrics(errors):
    if errors is None or errors.empty:
        return {"mae": None, "rmse": None, "mape_pct": None}
    return {
        "mae": float(errors["abs_error"].mean()),
        "rmse": float(np.sqrt(errors["sq_error"].mean())),
        "mape_pct": float(np.nanmean(errors["ape"]) * 100),
    }


def forecast_population(db):
    history = load_population_history(db)
    series = series_frame(history, "area_id", "area_name", "year", "value")
    max_year = int(series["t"].max())
    splits = engine.rolling_splits([2004, 2007, 2010, 2013, 2016, 2019], [3, 6, 9, 12, 15], max_year)
    trend = run_trend_indicator(series, splits, target_years=(), champion_metric="mae",
                                bounds=(0, None), sigma_mode="relative", min_train_points=3)
    # run_trend_indicator with no target years still returns the champion and metrics
    anchors = load_vif_anchors(db)
    population_wide = pivot_metric(anchors, "population")
    errors = anchored_error_rows(population_wide)
    sigma_params, sigma = engine.calibrate_sigma(errors, relative=True, floor=0.012)

    predictions = []
    points = {}
    for area_id, row in population_wide.iterrows():
        values = {year: (None if pd.isna(row.get(year)) else float(row[year])) for year in ANCHOR_YEARS}
        if any(value is None for value in values.values()):
            continue
        growth_main = engine.cagr(values[2031], values[2036], 5)
        growth_alt = engine.cagr(values[2026], values[2036], 10)
        points[int(area_id)] = {}
        for year in TARGET_YEARS:
            if year <= 2036:
                point, lower, upper = values[year], None, None
            else:
                years = year - 2036
                point = values[2036] * engine.damped_cumulative_growth(growth_main, years, PHI)
                alt = values[2036] * engine.damped_cumulative_growth(growth_alt, years, PHI)
                half = Z * sigma(years)
                lower = max(min(point * (1 - half), min(point, alt)), 0.0)
                upper = max(point * (1 + half), max(point, alt))
            points[int(area_id)][year] = point
            predictions.append({"area_id": int(area_id), "year": year, "value": point,
                                "lower": lower, "upper": upper})

    output = result(
        target_metric="population_lga", model_name="anchored-damped-trend", unit="people",
        trained_through="2025-06-30",
        validation_method="anchored rolling backtest (step 3y) plus trend backtest",
        metrics=anchored_metrics(errors), predictions=predictions,
        parameters={
            "phi": PHI, "z": Z, "sigma": sigma_params, "anchors": list(ANCHOR_YEARS),
            "trend_champion": trend["champion"], "trend_metrics": trend["metrics"],
            "method": "official VIF anchors to 2036, damped growth to 2050",
            "n_areas": len(points),
        },
    )
    return output, points, sigma


def forecast_households(anchors, population_points, population_sigma):
    wide_pop = pivot_metric(anchors, "population")
    wide_households = pivot_metric(anchors, "households")
    predictions = []
    points = {}

    for area_id in wide_households.index:
        if area_id not in wide_pop.index:
            continue
        population = {year: wide_pop.at[area_id, year] if year in wide_pop.columns else np.nan for year in ANCHOR_YEARS}
        households = {year: wide_households.at[area_id, year] if year in wide_households.columns else np.nan for year in ANCHOR_YEARS}
        if any(pd.isna(value) for value in households.values()) or any(pd.isna(value) for value in population.values()):
            continue
        sizes = {year: population[year] / households[year] for year in ANCHOR_YEARS}
        slope, _ = np.polyfit([float(year) for year in ANCHOR_YEARS],
                              [sizes[year] for year in ANCHOR_YEARS], 1)
        growth_main = engine.cagr(households[2031], households[2036], 5)
        growth_alt = engine.cagr(households[2026], households[2036], 10)
        points[int(area_id)] = {}
        for year in TARGET_YEARS:
            if year <= 2036:
                point, lower, upper = households[year], None, None
            else:
                years = year - 2036
                size_point = sizes[2036] + engine.damped_additive_growth(slope, years, PHI)
                population_point = population_points.get(int(area_id), {}).get(year)
                if population_point and size_point > 0:
                    point = population_point / size_point
                else:
                    point = households[2036] * engine.damped_cumulative_growth(growth_main, years, PHI)
                alt = households[2036] * engine.damped_cumulative_growth(growth_alt, years, PHI)
                half = Z * population_sigma(years) * 1.15
                lower = max(min(point * (1 - half), min(point, alt)), 0.0)
                upper = max(point * (1 + half), max(point, alt))
            points[int(area_id)][year] = point
            predictions.append({"area_id": int(area_id), "year": year, "value": point,
                                "lower": lower, "upper": upper})

    output = result(
        target_metric="households_lga", model_name="anchored-household-size", unit="households",
        trained_through="2036-06-30",
        validation_method="official VIF anchors with damped average-household-size extension",
        metrics={"mae": None, "rmse": None, "mape_pct": None}, predictions=predictions,
        parameters={
            "phi": PHI, "z": Z, "anchors": list(ANCHOR_YEARS),
            "method": "population / damped average household size",
            "cross_check": "damped CAGR of official household anchors forms the lower/upper method spread",
            "n_areas": len(points),
        },
    )
    return output, points


def forecast_dwellings(anchors, household_points, population_sigma):
    wide_households = pivot_metric(anchors, "households")
    wide_dwellings = pivot_metric(anchors, "dwellings")
    predictions = []
    points = {}

    for area_id in wide_dwellings.index:
        if area_id not in wide_households.index:
            continue
        households = {year: wide_households.at[area_id, year] if year in wide_households.columns else np.nan for year in ANCHOR_YEARS}
        dwellings = {year: wide_dwellings.at[area_id, year] if year in wide_dwellings.columns else np.nan for year in ANCHOR_YEARS}
        if any(pd.isna(value) for value in dwellings.values()) or any(pd.isna(value) for value in households.values()):
            continue
        ratios = {year: dwellings[year] / households[year] for year in ANCHOR_YEARS}
        slope, _ = np.polyfit([float(year) for year in ANCHOR_YEARS],
                              [ratios[year] for year in ANCHOR_YEARS], 1)
        growth_main = engine.cagr(dwellings[2031], dwellings[2036], 5)
        growth_alt = engine.cagr(dwellings[2026], dwellings[2036], 10)
        points[int(area_id)] = {}
        for year in TARGET_YEARS:
            if year <= 2036:
                point, lower, upper = dwellings[year], None, None
            else:
                years = year - 2036
                ratio_point = min(max(ratios[2036] + engine.damped_additive_growth(slope, years, PHI), 0.6), 2.0)
                household_point = household_points.get(int(area_id), {}).get(year)
                if household_point:
                    point = household_point * ratio_point
                else:
                    point = dwellings[2036] * engine.damped_cumulative_growth(growth_main, years, PHI)
                alt = dwellings[2036] * engine.damped_cumulative_growth(growth_alt, years, PHI)
                half = Z * population_sigma(years) * 1.25
                lower = max(min(point * (1 - half), min(point, alt)), 0.0)
                upper = max(point * (1 + half), max(point, alt))
            points[int(area_id)][year] = point
            predictions.append({"area_id": int(area_id), "year": year, "value": point,
                                "lower": lower, "upper": upper})

    output = result(
        target_metric="dwellings_lga", model_name="anchored-damped-ratio", unit="dwellings",
        trained_through="2036-06-30",
        validation_method="official VIF anchors with damped dwellings-per-household ratio",
        metrics={"mae": None, "rmse": None, "mape_pct": None}, predictions=predictions,
        parameters={
            "phi": PHI, "z": Z, "anchors": list(ANCHOR_YEARS),
            "method": "households x damped dwellings-per-household ratio",
            "n_areas": len(points),
        },
    )
    return output


# --------------------------------------------------------------------------- #
# Trend-based indicators                                                       #
# --------------------------------------------------------------------------- #
def forecast_employment(db):
    employment = load_employment(db)
    series = series_frame(employment, "sa4_code", "sa4_name", "t", "value")
    max_t = series["t"].max()
    splits = dated_splits([2018, 2019, 2020, 2021, 2022], (2, 3, 4), "07-15", max_t)
    outcome = run_trend_indicator(series, splits, TARGET_YEARS, champion_metric="mae",
                                  bounds=(0, None), sigma_mode="relative", sigma_floor=0.004,
                                  min_train_points=18)
    code_to_area = area_id_by_code(load_sa4_area(db))
    predictions = remap_predictions(outcome, code_to_area)
    return result(
        target_metric="employment_sa4", model_name=f"damped-{outcome['champion']}", unit="persons",
        trained_through="2026-06-30",
        validation_method="rolling-origin backtest, step 3y (monthly SA4 series)",
        metrics=outcome["metrics"], predictions=predictions,
        parameters={
            "phi": PHI, "z": Z, "sigma": outcome["sigma_params"], "champion": outcome["champion"],
            "geography": "SA4 source geography, inherited to LGA via dominant-overlap mapping",
            "n_areas": len(predictions) // len(TARGET_YEARS),
        },
    )


def forecast_rent(db, lga_area):
    rent = load_rent(db)
    series = series_frame(rent, "lga_code", "lga_name", "t", "value")
    max_t = series["t"].max()
    splits = dated_splits([2008, 2010, 2012, 2014, 2016, 2018, 2020], (2, 3, 4, 5, 6), "09-01", max_t)
    outcome = run_trend_indicator(series, splits, TARGET_YEARS, champion_metric="mape_pct",
                                  bounds=(0, None), sigma_mode="relative", min_train_points=8)
    predictions = remap_predictions(outcome, area_id_by_code(lga_area))
    return result(
        target_metric="median_weekly_rent_aud", model_name=f"damped-{outcome['champion']}", unit="AUD/week",
        trained_through="2024-06-30",
        validation_method="rolling-origin backtest, step 2y (quarterly LGA series)",
        metrics=outcome["metrics"], predictions=predictions,
        parameters={
            "phi": PHI, "z": Z, "sigma": outcome["sigma_params"], "champion": outcome["champion"],
            "n_areas": len(predictions) // len(TARGET_YEARS),
        },
    )


def forecast_affordability(db, lga_area):
    affordability = load_affordability(db)
    series = series_frame(affordability, "lga_code", "lga_name", "t", "value")
    max_t = series["t"].max()
    splits = dated_splits([2008, 2010, 2012, 2014, 2016, 2018, 2020], (2, 3, 4, 5, 6), "09-01", max_t)
    outcome = run_trend_indicator(series, splits, TARGET_YEARS, champion_metric="mae",
                                  models=("linear_trend",), bounds=(0, 1), sigma_mode="absolute",
                                  sigma_floor=0.01, min_train_points=8)
    predictions = remap_predictions(outcome, area_id_by_code(lga_area))
    return result(
        target_metric="affordable_lettings_share", model_name="bounded-linear", unit="share",
        trained_through="2024-06-30",
        validation_method="rolling-origin backtest, step 2y, MAE (quarterly LGA series)",
        metrics=outcome["metrics"], predictions=predictions,
        parameters={
            "phi": PHI, "z": Z, "sigma": outcome["sigma_params"], "champion": outcome["champion"],
            "notes": "linear only; shares reach zero so log-linear is not applicable; clamped to 0-1",
            "n_areas": len(predictions) // len(TARGET_YEARS),
        },
    )


def forecast_property(db, lga_area):
    suburb = load_price_suburb(db)
    index = suburb.groupby("year")["value"].median().reset_index().sort_values("year")
    series = pd.DataFrame({
        "series_id": "VIC",
        "series_label": "Victoria (median house price)",
        "t": index["year"].astype(float),
        "value": index["value"].astype(float),
    })
    max_t = series["t"].max()
    splits = [(origin, origin + 3) for origin in (2018, 2019, 2020, 2021, 2022) if origin + 3 <= max_t]
    outcome = run_trend_indicator(series, splits, TARGET_YEARS, champion_metric="mape_pct",
                                  bounds=(0, None), sigma_mode="relative", sigma_floor=0.02,
                                  min_train_points=4)

    champion = outcome["champion"]
    params = engine.MODELS[champion].fit(series["t"].to_numpy(float), series["value"].to_numpy(float))
    index_2025 = float(engine.MODELS[champion].predict(params, [2025.0])[0])
    index_points = {point["year"]: point["value"] for point in outcome["predictions"]}

    code_to_area = area_id_by_code(lga_area)
    anchors = load_price_anchor(db)
    predictions = []
    for _, row in anchors.iterrows():
        area_id = code_to_area.get(str(row["lga_code"]))
        if area_id is None:
            continue
        anchor_value = float(row["value"])
        for year in TARGET_YEARS:
            index_value = index_points.get(year)
            if not index_value or index_2025 <= 0:
                continue
            point = anchor_value * index_value / index_2025
            horizon = max(year - 2025, 1.0)
            half = Z * 0.02 * (horizon ** 0.5)
            half = max(half, 0.014 * horizon)  # low-confidence floor
            lower = max(point * (1 - half), 0.0)
            upper = point * (1 + half)
            predictions.append({"area_id": int(area_id), "year": year, "value": point,
                                "lower": lower, "upper": upper})

    return result(
        target_metric="median_house_price_aud", model_name="anchor-plus-state-trend", unit="AUD",
        trained_through="2025-06-30",
        validation_method="statewide suburb price index backtest (step 3y) applied to the 2025 LGA anchor",
        metrics=outcome["metrics"], predictions=predictions,
        parameters={
            "phi": PHI, "z": Z, "sigma": outcome["sigma_params"], "champion": champion,
            "lowConfidence": True, "anchorYear": 2025,
            "method": "each LGA's 2025 median house price grown by a damped statewide price index",
            "limitation": "no locality-to-LGA crosswalk exists, so suburb prices cannot be summed to LGA history",
            "n_areas": len(predictions) // len(TARGET_YEARS),
        },
    )


# --------------------------------------------------------------------------- #
# Orchestration and writes                                                     #
# --------------------------------------------------------------------------- #
def run_all(db, log=print):
    log("loading LGA reference and VIF anchors ...")
    lga_area = load_lga_area(db)
    anchors = load_vif_anchors(db)
    log(f"  reference LGAs: {len(lga_area)} | anchor rows: {len(anchors)}")

    results = []
    population, population_points, population_sigma = forecast_population(db)
    results.append(population)
    log(f"population: {len(population['predictions'])} predictions")

    households, household_points = forecast_households(anchors, population_points, population_sigma)
    results.append(households)
    log(f"households: {len(households['predictions'])} predictions")

    results.append(forecast_dwellings(anchors, household_points, population_sigma))
    results.append(forecast_employment(db))
    results.append(forecast_rent(db, lga_area))
    results.append(forecast_affordability(db, lga_area))
    results.append(forecast_property(db, lga_area))
    return results


def write_results(db, results, model_version):
    written = []
    for outcome in results:
        metric = outcome["target_metric"]
        existing = db.query("SELECT model_run_id FROM model_run WHERE target_metric = %s", (metric,))
        if not existing.empty:
            ids = tuple(int(value) for value in existing["model_run_id"])
            placeholders = ",".join(["%s"] * len(ids))
            db.execute(f"DELETE FROM model_prediction WHERE model_run_id IN ({placeholders})", ids)
            db.execute("DELETE FROM model_run WHERE target_metric = %s", (metric,))

        model_run_id, _ = db.execute(
            """INSERT INTO model_run
               (target_metric, model_name, model_version, trained_through, validation_method,
                mae, rmse, mape_pct, parameters_json)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (metric, outcome["model_name"], model_version, outcome["trained_through"],
             outcome["validation_method"], outcome["mae"], outcome["rmse"], outcome["mape_pct"],
             json.dumps(outcome["parameters_json"], default=str)),
        )

        rows = []
        for point in outcome["predictions"]:
            rows.append((
                model_run_id, int(point["area_id"]), target_date(point["year"]),
                round(float(point["value"]), 6),
                None if point["lower"] is None else round(float(point["lower"]), 6),
                None if point["upper"] is None else round(float(point["upper"]), 6),
                outcome["unit"],
            ))
        if rows:
            db.executemany(
                """INSERT INTO model_prediction
                   (model_run_id, area_id, target_date, predicted_value, lower_bound, upper_bound, unit)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                rows,
            )
        db.commit()
        written.append({"target_metric": metric, "model_name": outcome["model_name"],
                        "model_run_id": model_run_id, "predictions": len(rows)})
    return written
