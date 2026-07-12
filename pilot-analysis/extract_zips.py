#!/usr/bin/env python3
"""
Extract experiment ZIPs into the pilot-data/ layout the analysis script expects.

Source layout:
  <source>/<Participant>/fitts-personal-calibration-PXX-<ts>.zip   (Part A)
  <source>/<Participant>/fitts-standard-calibration-PXX-<ts>.zip   (Part B)
  (...one or more ZIPs per type; duplicates are de-duplicated by content size)

Output layout:
  pilot-data/<Participant>/partA-fitts-raw-data-<ts>.csv
  pilot-data/<Participant>/partA-fitts-variance-measurement-<ts>.csv
  pilot-data/<Participant>/partA-fitts-results-<ts>.csv
  pilot-data/<Participant>/partB-fitts-raw-data-<ts>.csv
  ...

Usage:
  python extract_zips.py "/Users/soha/Desktop/pilot data"
  python extract_zips.py "/Users/soha/Desktop/pilot data" --output ../pilot-data
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
import zipfile
from pathlib import Path


CALIB_KIND = {
    "personal-calibration": "partA",
    "standard-calibration": "partB",
}


def pick_one_zip(zips: list[Path]) -> Path:
    """Pick one ZIP from a list of duplicates: prefer the latest timestamp."""
    def ts_key(p: Path) -> str:
        m = re.search(r"(\d{4}-\d{2}-\d{2}T[\d_.]+Z)", p.name)
        return m.group(1) if m else ""
    return sorted(zips, key=ts_key)[-1]


def group_zips(folder: Path) -> dict[str, Path]:
    """Group ZIPs in `folder` by calibration kind; return {kind: chosen_zip}."""
    chosen = {}
    for kind, label in CALIB_KIND.items():
        matches = sorted(folder.glob(f"fitts-{kind}-*.zip"))
        if matches:
            chosen[label] = pick_one_zip(matches)
    return chosen


def extract_one(zip_path: Path, dest: Path, prefix: str) -> list[str]:
    """Extract CSVs from zip_path into dest, prefixing each filename with `prefix-`.
    Returns the list of written filenames. JSON (cursor paths) is skipped to save
    space — the analysis doesn't need it."""
    written = []
    with zipfile.ZipFile(zip_path) as z:
        for info in z.infolist():
            name = info.filename
            if not name.endswith(".csv") and name != "info.txt":
                continue
            base = Path(name).name.replace(":", "_")
            out_name = f"{prefix}-{base}"
            with z.open(info) as src, open(dest / out_name, "wb") as dst:
                shutil.copyfileobj(src, dst)
            written.append(out_name)
    return written


def main():
    ap = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source",
                    help="Source folder containing one subfolder per participant")
    ap.add_argument("--output", default="../pilot-data",
                    help="Destination pilot-data folder (default: ../pilot-data)")
    args = ap.parse_args()

    here = Path(__file__).parent.resolve()
    src = Path(args.source).expanduser().resolve()
    out_root = (here / args.output).resolve() if not Path(args.output).is_absolute() else Path(args.output)

    if not src.is_dir():
        print(f"Source folder not found: {src}", file=sys.stderr)
        sys.exit(1)

    out_root.mkdir(parents=True, exist_ok=True)
    print(f"Source: {src}")
    print(f"Output: {out_root}\n")

    for child in sorted(src.iterdir()):
        if not child.is_dir():
            continue
        pid = child.name
        zips = group_zips(child)
        if not zips:
            print(f"  ✗ {pid}: no calibration ZIPs found, skipping")
            continue

        dest = out_root / pid
        dest.mkdir(parents=True, exist_ok=True)
        for label, zpath in zips.items():
            written = extract_one(zpath, dest, label)
            print(f"  ✓ {pid}/{label}: {len(written)} files from {zpath.name}")

    print(f"\nDone. Run: python pilot_analysis.py")


if __name__ == "__main__":
    main()
