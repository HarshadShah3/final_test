"""Create a reproducible inventory of files in Employment/raw.

This script is read-only with respect to raw data. It writes one CSV report to
Employment/reports/inventory/employment_raw_inventory.csv.
"""

from __future__ import annotations

import csv
import hashlib
import zipfile
from pathlib import Path


EMPLOYMENT_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = EMPLOYMENT_DIR / "raw"
OUTPUT_FILE = (
    EMPLOYMENT_DIR
    / "reports"
    / "inventory"
    / "employment_raw_inventory.csv"
)
HASH_CHUNK_SIZE = 1024 * 1024
IGNORED_FILENAMES = {".DS_Store"}


def sha256_file(path: Path) -> str:
    """Return a file's SHA-256 digest without loading it all into memory."""
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(HASH_CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inventory_rows() -> list[dict[str, object]]:
    """Collect file metadata and ZIP-member metadata from the raw directory."""
    rows: list[dict[str, object]] = []

    raw_files = (
        item
        for item in RAW_DIR.rglob("*")
        if item.is_file() and item.name not in IGNORED_FILENAMES
    )

    for path in sorted(raw_files):
        relative_path = path.relative_to(EMPLOYMENT_DIR).as_posix()
        file_hash = sha256_file(path)

        rows.append(
            {
                "record_type": "raw_file",
                "path": relative_path,
                "parent_archive": "",
                "size_bytes": path.stat().st_size,
                "sha256": file_hash,
                "zip_crc32": "",
                "zip_compressed_size": "",
            }
        )

        if path.suffix.lower() == ".zip":
            with zipfile.ZipFile(path) as archive:
                bad_member = archive.testzip()
                if bad_member is not None:
                    raise RuntimeError(
                        f"ZIP integrity check failed for {relative_path}: "
                        f"{bad_member}"
                    )

                for member in archive.infolist():
                    rows.append(
                        {
                            "record_type": "zip_member",
                            "path": member.filename,
                            "parent_archive": relative_path,
                            "size_bytes": member.file_size,
                            "sha256": "",
                            "zip_crc32": f"{member.CRC:08x}",
                            "zip_compressed_size": member.compress_size,
                        }
                    )

    return rows


def main() -> None:
    if not RAW_DIR.is_dir():
        raise FileNotFoundError(f"Raw-data directory not found: {RAW_DIR}")

    rows = inventory_rows()
    if not rows:
        raise RuntimeError(f"No raw files found under: {RAW_DIR}")

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "record_type",
        "path",
        "parent_archive",
        "size_bytes",
        "sha256",
        "zip_crc32",
        "zip_compressed_size",
    ]

    with OUTPUT_FILE.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(destination, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    raw_file_count = sum(row["record_type"] == "raw_file" for row in rows)
    zip_member_count = sum(row["record_type"] == "zip_member" for row in rows)
    print(f"Raw files inventoried: {raw_file_count}")
    print(f"ZIP members inventoried: {zip_member_count}")
    print(f"Inventory written to: {OUTPUT_FILE.relative_to(EMPLOYMENT_DIR)}")


if __name__ == "__main__":
    main()
