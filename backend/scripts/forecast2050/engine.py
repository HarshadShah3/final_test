# -*- coding: utf-8 -*-
"""Forecasting engine for the Iteration 3 "Towards 2050" model.

Pure maths and small model classes only - no database or file I/O (see pipeline.py).

Two model families are used:

* **Trend models** (``linear_trend``, ``log_linear_trend``) fitted to a series' own
  history and extended forward.
* **Anchored growth**, which extends a published projection using the growth rate
  between two official anchor points, optionally damped so a 24-year extension does
  not compound without limit.

A rolling-origin backtest measures out-of-sample error and calibrates the 90%
prediction interval, which widens with the forecast horizon through
``sigma(h) = c * h**p`` (fitted on the absolute relative backtest errors).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# z score for a two-sided 90% prediction interval
Z_90 = 1.645
# default damping factor for long-horizon extensions
DEFAULT_PHI = 0.95


class LinearTrendModel:
    name = "linear_trend"

    def fit(self, t, y):
        t = np.asarray(t, float)
        y = np.asarray(y, float)
        t0 = float(np.mean(t))
        b, a = np.polyfit(t - t0, y, 1)
        return {"t0": t0, "a": float(a), "b": float(b)}

    def predict(self, params, t):
        return params["a"] + params["b"] * (np.asarray(t, float) - params["t0"])


class LogLinearTrendModel:
    name = "log_linear_trend"

    def fit(self, t, y):
        t = np.asarray(t, float)
        y = np.asarray(y, float)
        if np.any(y <= 0):
            return None
        t0 = float(np.mean(t))
        b, a = np.polyfit(t - t0, np.log(y), 1)
        return {"t0": t0, "a": float(a), "b": float(b)}

    def predict(self, params, t):
        return np.exp(params["a"] + params["b"] * (np.asarray(t, float) - params["t0"]))


MODELS = {
    "linear_trend": LinearTrendModel(),
    "log_linear_trend": LogLinearTrendModel(),
}


def clip(value, bounds):
    """Clip a scalar to (low, high); either side may be None."""
    low, high = bounds
    if low is not None:
        value = max(value, low)
    if high is not None:
        value = min(value, high)
    return float(value)


def error_metrics(actual, pred):
    absolute = abs(actual - pred)
    denominator = abs(actual) + abs(pred)
    return {
        "abs_error": absolute,
        "sq_error": absolute ** 2,
        "ape": absolute / abs(actual) if actual != 0 else np.nan,
        "smape": 2 * absolute / denominator if denominator != 0 else 0.0,
        "signed_pct_error": (pred - actual) / actual * 100 if actual != 0 else np.nan,
    }


def rolling_backtest(df, splits, min_train_points=3, models=("linear_trend", "log_linear_trend"), bounds=(0, None)):
    """Fit each model up to ``train_end`` and score it at the ``forecast_point``.

    ``df`` needs columns ``series_id``, ``series_label``, ``t`` (decimal year) and
    ``value``. ``splits`` is a list of ``(train_end, forecast_point)`` pairs. Only
    cases where *every* competing model can be fitted are kept, so models are scored
    on identical evidence.
    """
    rows = []
    for series_id, group in df.groupby("series_id", sort=False):
        group = group.sort_values("t")
        label = group["series_label"].iloc[0]
        xs = group["t"].to_numpy(float)
        ys = group["value"].to_numpy(float)
        for train_end, forecast_point in splits:
            mask = xs <= train_end + 1e-9
            actual_rows = np.where(np.isclose(xs, forecast_point, atol=1e-9))[0]
            if mask.sum() < min_train_points or actual_rows.size == 0:
                continue
            actual = float(ys[actual_rows[0]])
            train_t = xs[mask]
            train_y = ys[mask]
            for model_name in models:
                model = MODELS[model_name]
                params = model.fit(train_t, train_y)
                if params is None:
                    continue
                predicted = clip(float(model.predict(params, [forecast_point])[0]), bounds)
                rows.append({
                    "series_id": series_id,
                    "series_label": label,
                    "model": model_name,
                    "train_through": float(train_end),
                    "forecast_point": float(forecast_point),
                    "horizon": float(forecast_point) - float(train_end),
                    "train_n": int(mask.sum()),
                    "actual": actual,
                    "predicted": predicted,
                    **error_metrics(actual, predicted),
                })

    detailed = pd.DataFrame(rows)
    if detailed.empty:
        return detailed, detailed

    counts = detailed.groupby(["series_id", "forecast_point"])["model"].transform("nunique")
    detailed = detailed[counts == len(models)].reset_index(drop=True)
    return detailed, summarise_backtest(detailed)


def _aggregate(grouped):
    table = grouped.agg(
        mae=("abs_error", "mean"),
        rmse=("sq_error", lambda values: float(np.sqrt(np.mean(values)))),
        mape_pct=("ape", lambda values: float(np.nanmean(values)) * 100),
        smape_pct=("smape", lambda values: float(np.nanmean(values)) * 100),
        bias_pct=("signed_pct_error", lambda values: float(np.nanmean(values))),
        n_forecasts=("abs_error", "count"),
        n_series=("series_id", "nunique"),
    ).reset_index()
    return table


def summarise_backtest(detailed):
    overall = _aggregate(detailed.groupby("model"))
    overall["split"] = "overall"
    per_split = _aggregate(detailed.groupby(["model", "forecast_point"])).rename(columns={"forecast_point": "split"})
    columns = ["model", "split", "mae", "rmse", "mape_pct", "smape_pct", "bias_pct", "n_forecasts", "n_series"]
    return pd.concat([overall, per_split], ignore_index=True)[columns]


def select_champion(summary, metric="mae"):
    overall = summary[summary["split"] == "overall"].copy()
    overall = overall[overall["n_forecasts"] > 0]
    if overall.empty:
        return None
    sort_metric = metric if overall[metric].notna().any() else "mae"
    overall = overall.sort_values(sort_metric)
    return str(overall.iloc[0]["model"])


def champion_metrics(summary, champion):
    row = summary[(summary["model"] == champion) & (summary["split"] == "overall")]
    if row.empty:
        return {"mae": None, "rmse": None, "mape_pct": None}
    row = row.iloc[0]
    return {
        "mae": None if pd.isna(row["mae"]) else float(row["mae"]),
        "rmse": None if pd.isna(row["rmse"]) else float(row["rmse"]),
        "mape_pct": None if pd.isna(row["mape_pct"]) else float(row["mape_pct"]),
    }


def calibrate_sigma(detailed, relative=True, floor=0.0):
    """Fit ``sigma(h) = c * h**p`` on mean backtest error per horizon.

    Returns ``(params, sigma)`` where ``sigma(h)`` gives one standard deviation of the
    forecast error in relative (fraction) or absolute units. ``p`` is forced to be
    non-negative so the interval never narrows with distance.
    """
    if detailed is None or detailed.empty:
        params = {"c": float(floor), "p": 0.0, "relative": relative, "floor": float(floor)}
        return params, lambda h: max(float(floor), 1e-9)

    frame = detailed.copy()
    frame["h"] = frame["horizon"].clip(lower=1e-9)
    frame["err"] = frame["ape"].abs() if relative else frame["abs_error"]
    frame = frame.dropna(subset=["err"])
    grouped = frame.groupby(frame["h"].round(4))["err"].mean().reset_index()
    grouped = grouped[grouped["err"] > 0]

    if len(grouped) >= 2:
        slope, intercept = np.polyfit(np.log(grouped["h"]), np.log(grouped["err"]), 1)
        c = float(np.exp(intercept))
        p = float(max(slope, 0.0))
    elif len(grouped) == 1:
        c = float(grouped["err"].iloc[0])
        p = 0.0
    else:
        c = float(floor)
        p = 0.0

    params = {"c": c, "p": p, "relative": relative, "floor": float(floor)}

    def sigma(h):
        return max(c * (max(float(h), 1e-9) ** p), float(floor))

    return params, sigma


def damped_geometric_sum(years, phi=DEFAULT_PHI):
    """Closed-form geometric sum ``sum(phi**k for k = 1..years)``.

    Supports a fractional number of years so monthly/quarterly series extend
    smoothly: ``phi * (1 - phi**years) / (1 - phi)``.
    """
    years = max(float(years), 0.0)
    if years == 0:
        return 0.0
    if abs(1.0 - phi) < 1e-12:
        return years
    return phi * (1.0 - phi ** years) / (1.0 - phi)


def damped_cumulative_growth(growth, years, phi=DEFAULT_PHI):
    """Product of ``(1 + growth * phi**k)`` for k = 1..years (compounded, damped).

    Used for annual anchored growth, where ``years`` is a whole number.
    """
    factor = 1.0
    for k in range(1, int(years) + 1):
        factor *= (1.0 + growth * (phi ** k))
    return factor


def damped_additive_growth(slope, years, phi=DEFAULT_PHI):
    """``slope * sum(phi**k)`` for k = 1..years (incremental, damped)."""
    return float(slope) * damped_geometric_sum(years, phi)


def damped_log_growth(rate, years, phi=DEFAULT_PHI):
    """``exp(rate * sum(phi**k))`` - multiplicative, damped extension."""
    return float(np.exp(rate * damped_geometric_sum(years, phi)))


def cagr(start_value, end_value, periods):
    if start_value is None or end_value is None or start_value <= 0 or end_value <= 0 or periods <= 0:
        return None
    return (end_value / start_value) ** (1.0 / periods) - 1.0


def rolling_splits(origins, horizons, max_t):
    """Integer-year splits: for each origin, forecast ``origin + horizon`` if in range."""
    splits = []
    for origin in origins:
        for horizon in horizons:
            point = origin + horizon
            if point <= max_t:
                splits.append((float(origin), float(point)))
    return splits
