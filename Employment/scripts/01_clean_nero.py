"""Clean and validate the Victorian subset of the July 2026 NERO dataset.

The source CSV is read in chunks so the full national dataset is never loaded
into memory. Quality issues are reported and retained; this script does not
silently remove missing, duplicated, negative, or otherwise invalid records.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path

import pandas as pd


EMPLOYMENT_DIR = Path(__file__).resolve().parents[1]
SOURCE_FILE = EMPLOYMENT_DIR / "2026-07_shiny_df.csv"
PARQUET_OUTPUT = (
    EMPLOYMENT_DIR / "processed" / "parquet" / "nero_victoria_clean.parquet"
)
CSV_OUTPUT = EMPLOYMENT_DIR / "processed" / "csv" / "nero_victoria_clean.csv"
REPORT_OUTPUT = (
    EMPLOYMENT_DIR / "reports" / "data_quality" / "nero_cleaning_report.json"
)

CHUNK_SIZE = 200_000
EXPECTED_COLUMNS = [
    "Unnamed: 0",
    "state_name",
    "sa4_code",
    "sa4_name",
    "anzsco4_code",
    "anzsco4_name",
    "date",
    "nsc_emp",
]
OUTPUT_COLUMNS = [
    "source_row_id",
    "state_name",
    "sa4_code",
    "sa4_name",
    "anzsco4_code",
    "anzsco4_name",
    "date",
    "nsc_emp",
]
LOGICAL_KEY = ["sa4_code", "anzsco4_code", "date"]


def sha256_file(path: Path) -> str:
    """Calculate SHA-256 without loading the complete file into memory."""
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def serialise_counts(counts: Counter[str]) -> dict[str, int]:
    """Return sorted, JSON-compatible counters."""
    return {key: int(counts[key]) for key in sorted(counts)}


def main() -> None:
    if not SOURCE_FILE.is_file():
        raise FileNotFoundError(f"NERO source CSV not found: {SOURCE_FILE}")

    raw_rows = 0
    victoria_chunks: list[pd.DataFrame] = []
    raw_missing = Counter()
    state_counts = Counter()
    observed_columns: list[str] | None = None

    print(f"Reading {SOURCE_FILE.name} in chunks of {CHUNK_SIZE:,} rows...")

    reader = pd.read_csv(
        SOURCE_FILE,
        chunksize=CHUNK_SIZE,
        dtype="string",
        keep_default_na=True,
        low_memory=False,
    )

    for chunk_number, chunk in enumerate(reader, start=1):
        if observed_columns is None:
            observed_columns = chunk.columns.tolist()
            if observed_columns != EXPECTED_COLUMNS:
                raise ValueError(
                    "Unexpected NERO schema.\n"
                    f"Expected: {EXPECTED_COLUMNS}\n"
                    f"Observed: {observed_columns}"
                )

        raw_rows += len(chunk)
        raw_missing.update(
            {column: int(count) for column, count in chunk.isna().sum().items()}
        )
        state_counts.update(chunk["state_name"].dropna().tolist())

        victoria_chunk = chunk.loc[chunk["state_name"].eq("VIC")].copy()
        if not victoria_chunk.empty:
            victoria_chunks.append(victoria_chunk)

        print(
            f"  chunk {chunk_number:02d}: raw={len(chunk):,}, "
            f"VIC={len(victoria_chunk):,}"
        )

    if not victoria_chunks:
        raise RuntimeError("No Victoria records were found in the source dataset.")

    victoria = pd.concat(victoria_chunks, ignore_index=True)
    victoria = victoria.rename(columns={"Unnamed: 0": "source_row_id"})

    # Convert identifiers explicitly and preserve leading zeroes if they occur.
    identifier_columns = [
        "source_row_id",
        "state_name",
        "sa4_code",
        "sa4_name",
        "anzsco4_code",
        "anzsco4_name",
    ]
    for column in identifier_columns:
        victoria[column] = victoria[column].astype("string")

    original_dates = victoria["date"].copy()
    original_employment = victoria["nsc_emp"].copy()
    victoria["date"] = pd.to_datetime(victoria["date"], errors="coerce")
    victoria["nsc_emp"] = pd.to_numeric(victoria["nsc_emp"], errors="coerce")

    invalid_date_count = int(original_dates.notna().sum() - victoria["date"].notna().sum())
    invalid_employment_count = int(
        original_employment.notna().sum() - victoria["nsc_emp"].notna().sum()
    )
    negative_employment_count = int(victoria["nsc_emp"].lt(0).sum())
    zero_employment_count = int(victoria["nsc_emp"].eq(0).sum())
    fully_duplicated_rows = int(victoria.duplicated(keep=False).sum())
    duplicate_logical_key_rows = int(
        victoria.duplicated(subset=LOGICAL_KEY, keep=False).sum()
    )

    valid_dates = victoria["date"].dropna()
    min_date = valid_dates.min()
    max_date = valid_dates.max()
    if not valid_dates.empty:
        first_month = min_date.to_period("M").to_timestamp()
        last_month = max_date.to_period("M").to_timestamp()
        expected_dates = (
            pd.date_range(first_month, last_month, freq="MS")
            + pd.Timedelta(days=14)
        )
    else:
        expected_dates = pd.DatetimeIndex([])
    observed_dates = pd.DatetimeIndex(sorted(valid_dates.unique()))
    missing_dataset_months = expected_dates.difference(observed_dates)
    unexpected_dates = observed_dates.difference(expected_dates)

    group_month_counts = victoria.groupby(
        ["sa4_code", "anzsco4_code"], dropna=False
    )["date"].nunique()
    incomplete_series_count = int(group_month_counts.lt(len(expected_dates)).sum())

    sa4_name_counts = victoria.groupby("sa4_code", dropna=False)[
        "sa4_name"
    ].nunique(dropna=False)
    occupation_name_counts = victoria.groupby("anzsco4_code", dropna=False)[
        "anzsco4_name"
    ].nunique(dropna=False)

    report = {
        "source": {
            "filename": SOURCE_FILE.name,
            "relative_path": SOURCE_FILE.relative_to(EMPLOYMENT_DIR).as_posix(),
            "size_bytes": SOURCE_FILE.stat().st_size,
            "sha256": sha256_file(SOURCE_FILE),
        },
        "processing": {
            "chunk_size": CHUNK_SIZE,
            "raw_rows_read": raw_rows,
            "victoria_rows_retained": len(victoria),
            "columns_observed": observed_columns,
            "columns_output": OUTPUT_COLUMNS,
            "cleaning_decisions": [
                "Filtered state_name == VIC.",
                "Renamed Unnamed: 0 to source_row_id; the field was retained.",
                "Parsed date as datetime; invalid values were retained as null.",
                "Parsed nsc_emp as numeric; invalid values were retained as null.",
                "No duplicate, missing, zero, negative, or invalid rows were deleted.",
            ],
        },
        "raw_quality": {
            "missing_values_by_column": serialise_counts(raw_missing),
            "rows_by_state": serialise_counts(state_counts),
        },
        "victoria_quality": {
            "rows": len(victoria),
            "columns": len(victoria.columns),
            "sa4_count": int(victoria["sa4_code"].nunique(dropna=True)),
            "occupation_count": int(victoria["anzsco4_code"].nunique(dropna=True)),
            "date_count": int(valid_dates.nunique()),
            "date_min": min_date.strftime("%Y-%m-%d") if pd.notna(min_date) else None,
            "date_max": max_date.strftime("%Y-%m-%d") if pd.notna(max_date) else None,
            "missing_values_by_column": {
                key: int(value) for key, value in victoria.isna().sum().items()
            },
            "invalid_date_values": invalid_date_count,
            "invalid_nsc_emp_values": invalid_employment_count,
            "negative_nsc_emp_values": negative_employment_count,
            "zero_nsc_emp_values": zero_employment_count,
            "fully_duplicated_rows_including_all_copies": fully_duplicated_rows,
            "duplicate_logical_key_rows_including_all_copies": duplicate_logical_key_rows,
            "missing_dataset_months": [date.strftime("%Y-%m-%d") for date in missing_dataset_months],
            "unexpected_dates": [date.strftime("%Y-%m-%d") for date in unexpected_dates],
            "incomplete_sa4_occupation_series": incomplete_series_count,
            "sa4_codes_with_multiple_names": int(sa4_name_counts.gt(1).sum()),
            "occupation_codes_with_multiple_names": int(
                occupation_name_counts.gt(1).sum()
            ),
        },
    }

    victoria = victoria[OUTPUT_COLUMNS].sort_values(
        ["sa4_code", "anzsco4_code", "date"], kind="stable"
    )

    PARQUET_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    CSV_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    REPORT_OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    victoria.to_parquet(PARQUET_OUTPUT, index=False, engine="pyarrow")
    victoria.to_csv(CSV_OUTPUT, index=False, date_format="%Y-%m-%d")
    with REPORT_OUTPUT.open("w", encoding="utf-8") as destination:
        json.dump(report, destination, ensure_ascii=False, indent=2)
        destination.write("\n")

    print("Cleaning complete.")
    print(f"  Raw rows read: {raw_rows:,}")
    print(f"  Victoria rows written: {len(victoria):,}")
    print(f"  Parquet: {PARQUET_OUTPUT.relative_to(EMPLOYMENT_DIR)}")
    print(f"  CSV: {CSV_OUTPUT.relative_to(EMPLOYMENT_DIR)}")
    print(f"  Report: {REPORT_OUTPUT.relative_to(EMPLOYMENT_DIR)}")


if __name__ == "__main__":
    main()
