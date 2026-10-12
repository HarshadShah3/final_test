# -*- coding: utf-8 -*-
"""Entry point: build the "Towards 2050" forecast and load it into MySQL.

Examples
--------
Dry run (compute only, write nothing)::

    cd backend/scripts/forecast2050
    python run_forecast.py --env-file ../../.env --dry-run

Write to ``model_run`` and ``model_prediction``::

    python run_forecast.py --env-file ../../.env

The script reads the same ``DB_*`` environment variables as the Node backend
(``DB_HOST``, ``DB_PORT``, ``DB_USER``, ``DB_PASSWORD``, ``DB_NAME`` and an
optional ``DB_SSL_CA_PATH`` / ``DB_SSL_CA`` / ``DB_SSL_CA_BASE64``).
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import pipeline


def load_env_file(path):
    if not path:
        return
    file = Path(path)
    if not file.exists():
        return
    for line in file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build and load the 2050 forecast.")
    parser.add_argument("--env-file", default=None, help="Optional .env file with DB_* settings.")
    parser.add_argument("--dry-run", action="store_true", help="Compute only; write nothing to MySQL.")
    parser.add_argument("--only", nargs="*", default=None, help="Subset of target_metric values to write.")
    parser.add_argument("--model-version", default=pipeline.DEFAULT_MODEL_VERSION)
    args = parser.parse_args(argv)

    load_env_file(args.env_file)
    database = pipeline.Database.connect(os.environ)
    try:
        results = pipeline.run_all(database)
        if args.only:
            wanted = set(args.only)
            results = [result for result in results if result["target_metric"] in wanted]

        for result in results:
            print(
                f"{result['target_metric']:<28} {result['model_name']:<28} "
                f"n={len(result['predictions']):<5} "
                f"mae={result['mae']} mape%={result['mape_pct']}"
            )

        if args.dry_run:
            print("dry run: nothing written to MySQL")
            return 0

        written = pipeline.write_results(database, results, args.model_version)
        print("written:", json.dumps(written, indent=2, default=str))
        return 0
    finally:
        database.close()


if __name__ == "__main__":
    raise SystemExit(main())
