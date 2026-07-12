#!/usr/bin/env python3
"""
Calibration-reach analysis for Aashritha and Marzia (pilot, May 2026).

Roberto raised a concern that some participants could not comfortably reach
all four edges of the screen with their head movement. The newly-added
edge-check in fitts-experiment.js fixes this prospectively, but we want to
quantify it retroactively for these two pilots:

  1. What was each participant's actual cursor range (min/max X, Y) across
     all completed trials? Does it span the full screen, or does it cap out
     well short of the top / bottom?
  2. Per direction (8 cardinal directions: 0=right, 45=down-right, 90=down,
     135=down-left, 180=left, 225=up-left, 270=up, 315=up-right) — what is
     the completion rate, and what is the typical endpoint y-distance from
     the intended target?
  3. Do top-going trials (direction 270) and bottom-going trials (direction
     90) show systematic under-reach (endpoint significantly off-target)
     compared to left/right trials?

Inputs:
  pilot-data/Aashritha/partA-fitts-raw-data-*.csv
  pilot-data/Marzia/partA-fitts-raw-data-*.csv

Outputs:
  pilot-analysis/output/calibration_reach.md   (human-readable summary)
  pilot-analysis/output/calibration_reach.json (machine-readable)

This script intentionally uses only the standard library so it works without
the pilot-analysis venv.
"""

from __future__ import annotations

import csv
import glob
import json
import math
import os
import statistics
import sys
from collections import defaultdict
from pathlib import Path

DATA_DIR = Path("/Users/soha/head-control-website-js/pilot-data")
OUT_DIR  = Path("/Users/soha/head-control-website-js/pilot-analysis/output")
PARTICIPANTS = ["Aashritha", "Marzia"]


def _num(v: str):
    """Parse a string CSV cell as float; return None on blank/invalid."""
    if v is None:
        return None
    s = v.strip()
    if not s or s.lower() in ("nan", "null", "none"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def load_trials(csv_path: Path) -> list[dict]:
    rows = []
    with csv_path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for r in reader:
            rows.append(r)
    return rows


def direction_label(deg: float | None) -> str:
    """Map a direction (degrees, 0=right, +=CCW per screen coords) to a
    cardinal label. Note: in screen coordinates +y is *down*, so direction
    convention here treats 90° as the *bottom* of the screen and 270° as
    the top. This matches how the experiment lays out the 8 targets."""
    if deg is None:
        return "?"
    d = round(deg) % 360
    return {
        0:   "right",
        45:  "down-right",
        90:  "down",
        135: "down-left",
        180: "left",
        225: "up-left",
        270: "up",
        315: "up-right",
    }.get(d, f"{d}°")


def analyse_participant(name: str) -> dict:
    folder = DATA_DIR / name
    raw_csvs = sorted(glob.glob(str(folder / "*raw-data*.csv")))
    if not raw_csvs:
        return {"participant": name, "error": "no raw-data CSV found"}

    all_trials = []
    for p in raw_csvs:
        all_trials.extend(load_trials(Path(p)))

    if not all_trials:
        return {"participant": name, "error": "no trials in CSV"}

    # Parse the cells we care about into numerics once.
    parsed = []
    for r in all_trials:
        parsed.append({
            "status":     (r.get("Status") or "").strip(),
            "part":       (r.get("Part") or "").strip(),
            "filter":     (r.get("FilterType") or "").strip(),
            "pair":       _num(r.get("PairNumber")),
            "direction":  _num(r.get("Direction")),
            "amplitude":  _num(r.get("Amplitude")),
            "targetX":    _num(r.get("TargetX")),
            "targetY":    _num(r.get("TargetY")),
            "endpointX":  _num(r.get("EndpointX")),
            "endpointY":  _num(r.get("EndpointY")),
            "startX":     _num(r.get("StartX")),
            "startY":     _num(r.get("StartY")),
            "selX":       _num(r.get("SelectionX")),
            "selY":       _num(r.get("SelectionY")),
            "lastEntryX": _num(r.get("LastEntryX")),
            "lastEntryY": _num(r.get("LastEntryY")),
            "mt":         _num(r.get("MovementTime")),
            "reentries":  _num(r.get("ReEntryCount")),
        })

    n_total = len(parsed)
    n_completed = sum(1 for t in parsed if t["status"].lower() == "completed")

    # Endpoint range across all completed trials (best proxy for "where the
    # cursor was when the trial ended"). If endpointX/Y missing, fall back
    # to selectionX/Y.
    def _endpoint(t):
        ex = t["endpointX"] if t["endpointX"] is not None else t["selX"]
        ey = t["endpointY"] if t["endpointY"] is not None else t["selY"]
        return ex, ey

    completed = [t for t in parsed if t["status"].lower() == "completed"]

    endpoints_x = [e for e, _ in (_endpoint(t) for t in completed) if e is not None]
    endpoints_y = [e for _, e in (_endpoint(t) for t in completed) if e is not None]
    targets_x   = [t["targetX"] for t in completed if t["targetX"] is not None]
    targets_y   = [t["targetY"] for t in completed if t["targetY"] is not None]

    range_summary = {}
    for label, values in [("endpoint_x", endpoints_x),
                          ("endpoint_y", endpoints_y),
                          ("target_x",   targets_x),
                          ("target_y",   targets_y)]:
        if values:
            range_summary[label] = {
                "min":    min(values),
                "max":    max(values),
                "mean":   statistics.fmean(values),
                "stdev":  statistics.pstdev(values) if len(values) > 1 else 0.0,
                "n":      len(values),
            }
        else:
            range_summary[label] = None

    # Per-direction breakdown.
    by_dir = defaultdict(list)
    for t in parsed:
        if t["direction"] is None:
            continue
        by_dir[direction_label(t["direction"])].append(t)

    dir_stats = {}
    for dlabel, trials in sorted(by_dir.items()):
        n = len(trials)
        n_done = sum(1 for t in trials if t["status"].lower() == "completed")
        n_timeout = sum(1 for t in trials
                        if t["status"].lower().startswith("timeout"))

        # Endpoint distance from target — for completed trials only.
        endpoint_dists = []
        # Y-only error: how far short of the target was the endpoint?
        y_underreach = []
        for t in trials:
            if t["status"].lower() != "completed":
                continue
            ex, ey = _endpoint(t)
            tx, ty = t["targetX"], t["targetY"]
            if None in (ex, ey, tx, ty):
                continue
            endpoint_dists.append(math.hypot(ex - tx, ey - ty))
            y_underreach.append(ey - ty)  # signed; +ve means endpoint *below* target

        # Movement time on completed trials in this direction.
        mts = [t["mt"] for t in trials
               if t["status"].lower() == "completed" and t["mt"] is not None]
        # Re-entry count on completed trials.
        ress = [t["reentries"] for t in trials
                if t["status"].lower() == "completed" and t["reentries"] is not None]

        dir_stats[dlabel] = {
            "n_total":        n,
            "n_completed":    n_done,
            "n_timeout":      n_timeout,
            "completion_rate": (n_done / n) if n > 0 else None,
            "endpoint_dist_mean": statistics.fmean(endpoint_dists) if endpoint_dists else None,
            "endpoint_dist_max":  max(endpoint_dists) if endpoint_dists else None,
            "y_signed_error_mean": statistics.fmean(y_underreach) if y_underreach else None,
            "mt_mean":            statistics.fmean(mts) if mts else None,
            "mt_max":             max(mts) if mts else None,
            "reentries_mean":     statistics.fmean(ress) if ress else None,
            "reentries_max":      max(ress) if ress else None,
        }

    return {
        "participant": name,
        "n_total": n_total,
        "n_completed": n_completed,
        "completion_rate": (n_completed / n_total) if n_total > 0 else None,
        "range_summary": range_summary,
        "by_direction":  dir_stats,
    }


def _fmt(v, p=1):
    if v is None:
        return "—"
    if isinstance(v, float):
        return f"{v:.{p}f}"
    return str(v)


def render_markdown(results: list[dict]) -> str:
    lines = []
    lines.append("# Calibration reach analysis — Aashritha & Marzia")
    lines.append("")
    lines.append("> Retroactive look at whether these two pilot participants could "
                 "actually reach all four edges of the screen with their head movement. "
                 "Going forward this is prevented by the calibration edge-check added "
                 "to `fitts-experiment.js` in May 2026.")
    lines.append("")

    for r in results:
        name = r["participant"]
        if "error" in r:
            lines.append(f"## {name}\n\nERROR: {r['error']}\n")
            continue

        lines.append(f"## {name}")
        lines.append("")
        lines.append(f"Total trials: **{r['n_total']}** · "
                     f"Completed: **{r['n_completed']}** · "
                     f"Completion rate: **{_fmt(r['completion_rate'] * 100 if r['completion_rate'] is not None else None)}%**")
        lines.append("")

        rs = r["range_summary"]
        lines.append("### Cursor reach (across all completed trials)")
        lines.append("")
        lines.append("| | min | max | range | mean | sd | n |")
        lines.append("|---|---:|---:|---:|---:|---:|---:|")
        for label in ("endpoint_x", "endpoint_y", "target_x", "target_y"):
            s = rs[label]
            if s is None:
                lines.append(f"| {label} | — | — | — | — | — | 0 |")
            else:
                lines.append(f"| {label} | {_fmt(s['min'])} | {_fmt(s['max'])} | "
                             f"{_fmt(s['max'] - s['min'])} | {_fmt(s['mean'])} | "
                             f"{_fmt(s['stdev'])} | {s['n']} |")
        lines.append("")

        # Diagnostic: does the endpoint range cover the target range?
        ep_y = rs["endpoint_y"]
        tg_y = rs["target_y"]
        if ep_y and tg_y:
            top_gap    = ep_y["min"] - tg_y["min"]
            bottom_gap = tg_y["max"] - ep_y["max"]
            verdict = []
            if top_gap > 30:    # endpoint never got within 30 px of top-most target
                verdict.append(f"**top under-reach** by {_fmt(top_gap)} px")
            if bottom_gap > 30:
                verdict.append(f"**bottom under-reach** by {_fmt(bottom_gap)} px")
            if not verdict:
                verdict.append("vertical reach OK (endpoints cover target Y range)")
            lines.append(f"_Y-axis reach verdict: {' · '.join(verdict)}._")
            lines.append("")

        # Per-direction table.
        lines.append("### Per-direction breakdown")
        lines.append("")
        lines.append("| Direction | n | n completed | n timeout | comp rate | "
                     "mean endpoint err | mean Y signed err | mean MT (s) | "
                     "mean re-entries |")
        lines.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
        # Order by compass: up first, then up-right, etc.
        order = ["up", "up-right", "right", "down-right", "down",
                 "down-left", "left", "up-left"]
        for d in order:
            if d not in r["by_direction"]:
                continue
            s = r["by_direction"][d]
            lines.append(
                f"| {d} | {s['n_total']} | {s['n_completed']} | {s['n_timeout']} "
                f"| {_fmt(s['completion_rate'] * 100 if s['completion_rate'] is not None else None)}% "
                f"| {_fmt(s['endpoint_dist_mean'])} "
                f"| {_fmt(s['y_signed_error_mean'])} "
                f"| {_fmt(s['mt_mean'], 2)} "
                f"| {_fmt(s['reentries_mean'], 1)} |"
            )
        lines.append("")

        # Highlight any direction with completion < 80% or large mean re-entries.
        problem_dirs = [
            (d, s) for d, s in r["by_direction"].items()
            if (s["completion_rate"] is not None and s["completion_rate"] < 0.8)
               or (s["reentries_mean"] is not None and s["reentries_mean"] > 3)
        ]
        if problem_dirs:
            lines.append("**Directions showing reach / dwell trouble:**")
            for d, s in problem_dirs:
                lines.append(
                    f"- `{d}`: completion {_fmt(s['completion_rate'] * 100 if s['completion_rate'] is not None else None)}%, "
                    f"mean re-entries {_fmt(s['reentries_mean'], 1)}, "
                    f"mean endpoint error {_fmt(s['endpoint_dist_mean'])} px"
                )
            lines.append("")
        else:
            lines.append("No direction with completion < 80% or mean re-entries > 3.")
            lines.append("")

    # Cross-participant takeaway.
    lines.append("---")
    lines.append("## Takeaway")
    lines.append("")
    lines.append("- The endpoint Y range (in the table above) is the best proxy for "
                 "how high / low the cursor actually traveled. Compare it to the "
                 "target Y range to see whether the participant could physically "
                 "reach the top/bottom targets.")
    lines.append("- The per-direction table shows whether problems are isolated to "
                 "specific axes (e.g. up-only). A consistent up-direction failure with "
                 "OK left/right is the classic head-tilt-back limitation.")
    lines.append("- The new in-session edge-check (May 2026) will catch this "
                 "prospectively: if the participant can't reach top/bottom/left/right "
                 "within 12 s each, they're offered to recalibrate before any data is "
                 "recorded.")
    return "\n".join(lines)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results = [analyse_participant(p) for p in PARTICIPANTS]

    md_path = OUT_DIR / "calibration_reach.md"
    md_path.write_text(render_markdown(results), encoding="utf-8")

    json_path = OUT_DIR / "calibration_reach.json"
    json_path.write_text(json.dumps(results, indent=2, default=str),
                         encoding="utf-8")

    print(f"Wrote {md_path}")
    print(f"Wrote {json_path}")


if __name__ == "__main__":
    main()
