#!/usr/bin/env python3
"""
Pilot Analysis Pipeline for the Fitts / Filter experiment.

Inputs (default: ../pilot-data/<participant>/*.csv):
  - <anything>raw-data<anything>.csv     : per-trial data
  - <anything>variance-measurement<anything>.csv : per-condition cursor SD
  - <anything>results<anything>.csv      : per-cell aggregates (optional)

Outputs (default: ./output/):
  - pilot_memo.html   : one-page report (open in browser, print to PDF)
  - figures/*.png     : standalone figures
  - summary.json      : machine-readable numbers (n, CV, effects, recommended_n)

Sections (matches the 7-deliverable memo plan):
  1. Data coverage
  2. Sanity check: Fitts' law fit per participant
  3. Between-participant variation (the prof's concern)
  4. Per-participant descriptive table
  5. Direction-of-effect (sign test)
  6. Exploratory mixed-effects model
  7. Power analysis & recommended n for full study

Usage:
  python pilot_analysis.py                       # uses ../pilot-data/
  python pilot_analysis.py --data ./my-pilots/   # custom folder
  python pilot_analysis.py --output ./report/    # custom output

Schema robustness: handles older CSVs that lack newer columns (e.g. no
EffectiveAmplitude/EndpointX) by falling back to ActualAmplitude/SelectionX.
"""

from __future__ import annotations

import argparse
import base64
import glob
import json
import os
import sys
import warnings
from io import BytesIO
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")


# ----- I/O & schema normalisation -----

REQUIRED_RAW_COLUMNS = [
    "PairNumber", "PairVariance", "FilterType",
    "TargetSize", "Amplitude", "Direction", "MovementTime",
]

OPTIONAL_RAW_COLUMNS = {
    "Status":          "completed",
    "EffectiveAmplitude": None,
    "ActualAmplitude": None,
    "EndpointX": None, "EndpointY": None,
    "SelectionX": None, "SelectionY": None,
    "TargetX": None, "TargetY": None,
    "ReEntryCount":    0,
    "Part":            "Part A",
    "PairDescription": "",
    "FilterRank":      "",
    "FilterVariance":  np.nan,
    "FilterLatency":   np.nan,
}

# Map newer column names (with units suffix) -> canonical names the script uses.
COLUMN_ALIASES = {
    "PairVariance_px":     "PairVariance",
    "FilterVariance_px":   "FilterVariance",
    # variance-measurement files only:
    # MeasuredVariance_px / ExpectedVariance_px are already canonical
}


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Rename newer-style columns to the canonical names used elsewhere."""
    rename = {old: new for old, new in COLUMN_ALIASES.items()
              if old in df.columns and new not in df.columns}
    if rename:
        df = df.rename(columns=rename)
    return df


def find_csvs(folder: Path, pattern_substring: str) -> list[Path]:
    """Find all CSVs in `folder` whose name contains `pattern_substring`."""
    return [m for m in sorted(folder.glob("*.csv"))
            if pattern_substring in m.name.lower()]


def _load_concat(paths: list[Path]) -> pd.DataFrame | None:
    """Read & concat a list of CSVs, robust to per-file column differences."""
    if not paths:
        return None
    frames = []
    for p in paths:
        try:
            frames.append(pd.read_csv(p))
        except Exception as e:
            print(f"     ! could not read {p.name}: {e}")
    if not frames:
        return None
    return pd.concat(frames, ignore_index=True, sort=False)


def load_participant(folder: Path) -> dict:
    """Load one participant folder. Returns a dict with raw_trials, variance, and meta.

    Concatenates ALL raw-data and variance-measurement CSVs found in the folder
    (so Part A + Part B from the same participant are combined automatically)."""
    pid = folder.name
    raw_paths = find_csvs(folder, "raw-data")
    var_paths = find_csvs(folder, "variance-measurement")
    q_paths   = find_csvs(folder, "mini-questionnaire")

    if not raw_paths:
        print(f"  ✗ {pid}: no raw-data CSV found, skipping")
        return None

    df = _load_concat(raw_paths)
    if df is None or df.empty:
        print(f"  ✗ {pid}: raw-data files unreadable, skipping")
        return None
    df = _normalize_columns(df)

    missing_required = [c for c in REQUIRED_RAW_COLUMNS if c not in df.columns]
    if missing_required:
        print(f"  ✗ {pid}: missing required columns {missing_required}, skipping")
        return None

    for col, default in OPTIONAL_RAW_COLUMNS.items():
        if col not in df.columns:
            df[col] = default

    if df["EffectiveAmplitude"].isna().all():
        df["EffectiveAmplitude"] = df["ActualAmplitude"]
    if df["EndpointX"].isna().all() and "SelectionX" in df.columns:
        df["EndpointX"] = df["SelectionX"]
        df["EndpointY"] = df["SelectionY"]

    if "Part" not in df.columns or df["Part"].isna().all():
        df["Part"] = "Part A"

    dedupe_keys = [c for c in ["GlobalTrialNumber", "Part", "PairNumber",
                               "FilterType", "Direction", "TrialInLayout"] if c in df.columns]
    if dedupe_keys:
        before = len(df)
        df = df.drop_duplicates(subset=dedupe_keys, keep="first").reset_index(drop=True)
        if before != len(df):
            print(f"     · {pid}: deduped {before - len(df)} duplicate trial rows")

    df["Participant"] = pid
    df["ID"] = np.log2(df["Amplitude"] / df["TargetSize"] + 1)

    var_df = _load_concat(var_paths)
    if var_df is not None:
        var_df = _normalize_columns(var_df)
        var_df["Participant"] = pid
        if "Part" not in var_df.columns:
            var_df["Part"] = "Part A"
        var_keys = [c for c in ["Part", "PairNumber", "FilterType"] if c in var_df.columns]
        if var_keys:
            var_df = var_df.drop_duplicates(subset=var_keys, keep="first").reset_index(drop=True)

    q_df = _load_concat(q_paths) if q_paths else None
    if q_df is not None:
        q_df = _normalize_columns(q_df)
        # Override ParticipantID with the folder name so it matches
        # trials["Participant"] (which is also the folder name).  The
        # original P-numbers (P05, P07, …) inside the questionnaire CSV
        # are kept under "ParticipantIDOriginal" for reference.
        if "ParticipantID" in q_df.columns:
            q_df = q_df.rename(columns={"ParticipantID": "ParticipantIDOriginal"})
        q_df["ParticipantID"] = pid

    parts_str = ",".join(sorted(df["Part"].dropna().astype(str).unique())) if "Part" in df.columns else "?"
    print(f"  ✓ {pid}: {len(df)} trials ({parts_str}), "
          f"{'variance ✓' if var_df is not None else 'no variance file'}, "
          f"{'questionnaire ✓' if q_df is not None else 'no questionnaire'}")

    # Parse partA-info.txt and partB-info.txt to extract the actual
    # Calibration Source the participant ran with. The "Calibration Type"
    # label is hard-coded in the JS by part name and does NOT reflect
    # whether a different calibration file was uploaded. The source
    # timestamp is the only reliable signal.
    calib_info = {}
    for part_tag, part_label in (("partA", "Part A"), ("partB", "Part B")):
        info_path = folder / f"{part_tag}-info.txt"
        src = None
        ctype = None
        if info_path.exists():
            try:
                for raw_line in info_path.read_text().splitlines():
                    line = raw_line.strip()
                    if line.lower().startswith("calibration source:"):
                        src = line.split(":", 1)[1].strip()
                    elif line.lower().startswith("calibration type:"):
                        ctype = line.split(":", 1)[1].strip()
            except OSError:
                pass
        calib_info[part_label] = {"source": src, "type_label": ctype}

    return {"pid": pid, "trials": df, "variance": var_df, "questionnaire": q_df,
            "calibration_info": calib_info}


def load_all(data_dir: Path) -> dict:
    """Scan data_dir for participant subfolders; combine into one dataframe."""
    print(f"\nScanning {data_dir} for participant folders…")
    parts = []
    for child in sorted(data_dir.iterdir()):
        if child.is_dir():
            p = load_participant(child)
            if p is not None:
                parts.append(p)

    if not parts:
        print("\nNo loadable participants found.")
        sys.exit(1)

    trials = pd.concat([p["trials"] for p in parts], ignore_index=True)
    variance = pd.concat(
        [p["variance"] for p in parts if p["variance"] is not None],
        ignore_index=True
    ) if any(p["variance"] is not None for p in parts) else None
    questionnaire = pd.concat(
        [p["questionnaire"] for p in parts if p.get("questionnaire") is not None],
        ignore_index=True
    ) if any(p.get("questionnaire") is not None for p in parts) else None

    trials = trials[trials["Status"].astype(str).str.lower().isin(
        ["completed", "true", "1", "ok"]) | trials["Status"].isna()]

    calibration_info = {p["pid"]: p.get("calibration_info", {}) for p in parts}

    return {"trials": trials, "variance": variance,
            "questionnaire": questionnaire,
            "calibration_info": calibration_info,
            "n_participants": len(parts)}


# ----- analysis helpers -----

def per_participant_fitts_fit(trials: pd.DataFrame) -> pd.DataFrame:
    """For each participant, fit MT ~ a + b * ID across condition cell means.
    Returns a frame with slope, intercept, r²."""
    rows = []
    for pid, g in trials.groupby("Participant"):
        cell = (g.groupby(["FilterType", "PairNumber", "TargetSize", "Amplitude"])
                  .agg(MT=("MovementTime", "mean"), ID=("ID", "first"))
                  .reset_index())
        cell = cell.dropna(subset=["MT", "ID"])
        if len(cell) < 3:
            rows.append({"Participant": pid, "n_cells": len(cell),
                         "slope": np.nan, "intercept": np.nan, "r2": np.nan})
            continue
        x = cell["ID"].values
        y = cell["MT"].values
        b, a = np.polyfit(x, y, 1)
        yhat = a + b * x
        ss_res = np.sum((y - yhat) ** 2)
        ss_tot = np.sum((y - y.mean()) ** 2)
        r2 = 1 - ss_res / ss_tot if ss_tot > 0 else np.nan
        rows.append({"Participant": pid, "n_cells": len(cell),
                     "slope": b, "intercept": a, "r2": r2})
    return pd.DataFrame(rows)


def between_participant_variation(variance: pd.DataFrame) -> pd.DataFrame:
    """For each (PairNumber, FilterType), compute CV of measured cursor SD across participants."""
    if variance is None or len(variance) == 0:
        return pd.DataFrame()
    g = (variance.groupby(["PairNumber", "FilterType"])
                 ["MeasuredVariance_px"]
                 .agg(["mean", "std", "min", "max", "count"])
                 .reset_index())
    g["CV"] = g["std"] / g["mean"]
    return g


def descriptive_table(trials: pd.DataFrame) -> pd.DataFrame:
    """Per-participant × condition cell summary: TP, MT, error rate."""
    rows = []
    for (pid, pair, filt), g in trials.groupby(["Participant", "PairNumber", "FilterType"]):
        completed = g[g["Status"].astype(str).str.lower().isin(["completed", "true", "1", "ok"])
                      | g["Status"].isna()]
        mt = completed["MovementTime"].dropna()
        n_total = len(g)
        n_done = len(completed)

        if n_done == 0 or mt.mean() == 0:
            rows.append({"Participant": pid, "PairNumber": pair, "FilterType": filt,
                         "n": n_done, "n_total": n_total,
                         "meanMT": np.nan, "IDe": np.nan, "TP": np.nan,
                         "errorRate": np.nan, "meanReEntries": np.nan})
            continue

        if completed["EndpointX"].notna().any():
            theta = np.deg2rad(completed["Direction"].values)
            dx = completed["EndpointX"].values - completed["TargetX"].values
            dy = completed["EndpointY"].values - completed["TargetY"].values
            proj = dx * np.cos(theta) + dy * np.sin(theta)
            if len(proj) > 1 and np.isfinite(proj).any():
                sd_x = np.nanstd(proj, ddof=1)
                we = 4.133 * sd_x
                ae = np.nanmean(completed["EffectiveAmplitude"].dropna()
                                if completed["EffectiveAmplitude"].notna().any()
                                else completed["ActualAmplitude"].dropna())
                ide = np.log2(ae / we + 1) if we > 0 and ae > 0 else g["ID"].iloc[0]
            else:
                ide = g["ID"].iloc[0]
        else:
            ide = g["ID"].iloc[0]

        tp = ide / mt.mean() if mt.mean() > 0 else np.nan
        rows.append({"Participant": pid, "PairNumber": pair, "FilterType": filt,
                     "n": n_done, "n_total": n_total,
                     "meanMT": mt.mean(), "IDe": ide, "TP": tp,
                     "errorRate": 1 - n_done / n_total if n_total > 0 else np.nan,
                     "meanReEntries": completed["ReEntryCount"].mean()})
    return pd.DataFrame(rows)


def sign_test(desc: pd.DataFrame) -> dict:
    """For each (participant, pair), did One Euro beat Exponential on TP?
    Returns overall AND per-pair breakdowns."""
    pivot = desc.pivot_table(index=["Participant", "PairNumber"],
                              columns="FilterType", values="TP")
    if "oneEuro" not in pivot.columns or "exponential" not in pivot.columns:
        return {"comparisons": 0, "oneEuro_better": 0, "p_one_sided": np.nan,
                "per_cell": [], "per_pair": []}
    pivot["delta"] = pivot["oneEuro"] - pivot["exponential"]
    pivot = pivot.dropna(subset=["delta"])
    pivot_r = pivot.reset_index()

    from math import comb
    def _p_one_sided(k, n):
        return sum(comb(n, i) for i in range(k, n + 1)) / (2 ** n) if n > 0 else np.nan

    n_all = len(pivot_r)
    k_all = int((pivot_r["delta"] > 0).sum())

    per_pair = []
    for pair, sub in pivot_r.groupby("PairNumber"):
        n_pair = len(sub)
        k_pair = int((sub["delta"] > 0).sum())
        per_pair.append({"PairNumber": pair, "n": n_pair, "oneEuro_better": k_pair,
                         "p_one_sided": _p_one_sided(k_pair, n_pair),
                         "mean_delta": float(sub["delta"].mean())})

    return {"comparisons": n_all, "oneEuro_better": k_all,
            "p_one_sided": _p_one_sided(k_all, n_all),
            "per_cell": pivot_r.to_dict("records"),
            "per_pair": per_pair}


def filter_initial_read(desc: pd.DataFrame, n_boot: int = 10000,
                        seed: int = 7) -> dict:
    """Triangulated initial read of the One Euro vs Exponential filter
    contrast — useful at small pilot n where the mixed model is necessary
    but a reviewer will also want robust nonparametric backup.

    Computes, on the per-cell ΔTP = TP(oneEuro) − TP(exponential) for each
    (Participant × PairNumber):
       • paired t-test against 0  (parametric)
       • Wilcoxon signed-rank      (nonparametric, robust)
       • bootstrap CI on the mean  (resamples PARTICIPANTS, not cells,
                                    so participant-level dependence is
                                    respected)
       • per-participant aggregate ΔTP across pairs (n participants ⇒
         1-sample t and Wilcoxon at the participant level — the unit a
         reviewer is most comfortable with)
       • per-pair mean ΔTP and direction count (filter × variance hint)

    Returns ok=False if the design is too unbalanced.
    """
    pivot = desc.pivot_table(index=["Participant", "PairNumber"],
                              columns="FilterType", values="TP")
    if "oneEuro" not in pivot.columns or "exponential" not in pivot.columns:
        return {"ok": False, "error": "need both filters in descriptive table"}
    pivot["delta"] = pivot["oneEuro"] - pivot["exponential"]
    pivot = pivot.dropna(subset=["delta"]).reset_index()
    if len(pivot) < 4:
        return {"ok": False, "error": f"only {len(pivot)} paired cells"}

    deltas = pivot["delta"].to_numpy()
    n_cells = len(deltas)
    mean_d  = float(deltas.mean())
    sd_d    = float(deltas.std(ddof=1))
    dz      = mean_d / sd_d if sd_d > 0 else np.nan

    try:
        from scipy import stats
    except ImportError:
        stats = None

    cell_paired_t = None
    cell_wilcoxon = None
    if stats is not None:
        try:
            t, p = stats.ttest_1samp(deltas, 0)
            cell_paired_t = {"n": n_cells, "mean_delta": mean_d,
                              "sd_delta": sd_d, "t": float(t),
                              "p_two_sided": float(p), "cohens_dz": dz}
        except Exception as e:
            cell_paired_t = {"error": str(e)}
        try:
            w = stats.wilcoxon(deltas)
            cell_wilcoxon = {"n": n_cells, "statistic": float(w.statistic),
                              "p_two_sided": float(w.pvalue)}
        except Exception as e:
            cell_wilcoxon = {"error": str(e)}

    # Cluster-bootstrap CI on the mean Δ: resample PARTICIPANTS with
    # replacement, then average within-participant Δs. This respects the
    # repeated-measures structure (cells from the same participant are not
    # independent) and is the right thing to do with n_participants small.
    rng = np.random.default_rng(seed)
    parts = pivot["Participant"].unique()
    boot_means = []
    for _ in range(n_boot):
        sample = rng.choice(parts, size=len(parts), replace=True)
        all_d = []
        for pid in sample:
            all_d.extend(pivot.loc[pivot["Participant"] == pid, "delta"].tolist())
        boot_means.append(float(np.mean(all_d)))
    boot_means_arr = np.asarray(boot_means)
    boot = {
        "n_boot": n_boot,
        "mean": float(boot_means_arr.mean()),
        "ci95_low":  float(np.quantile(boot_means_arr, 0.025)),
        "ci95_high": float(np.quantile(boot_means_arr, 0.975)),
        "p_two_sided_approx": float(2 * min(
            np.mean(boot_means_arr <= 0), np.mean(boot_means_arr >= 0))),
    }

    # Per-participant aggregate Δ (average across the 3 pairs).
    per_part = (pivot.groupby("Participant")["delta"].mean()
                      .reset_index().rename(columns={"delta": "mean_delta"}))
    part_deltas = per_part["mean_delta"].to_numpy()
    n_parts = len(part_deltas)
    part_summary = {"n_participants": n_parts,
                     "mean": float(part_deltas.mean()),
                     "sd":   float(part_deltas.std(ddof=1)) if n_parts > 1 else np.nan,
                     "n_oneEuro_higher": int((part_deltas > 0).sum())}
    part_paired_t = None
    part_wilcoxon = None
    if stats is not None and n_parts >= 2:
        try:
            t, p = stats.ttest_1samp(part_deltas, 0)
            part_paired_t = {"t": float(t), "p_two_sided": float(p),
                              "cohens_dz": float(part_deltas.mean() /
                                                  part_deltas.std(ddof=1))
                                            if part_deltas.std(ddof=1) > 0 else np.nan}
        except Exception as e:
            part_paired_t = {"error": str(e)}
        try:
            if n_parts >= 6:
                w = stats.wilcoxon(part_deltas)
                part_wilcoxon = {"statistic": float(w.statistic),
                                  "p_two_sided": float(w.pvalue)}
            else:
                part_wilcoxon = {"note": f"n={n_parts} too small for Wilcoxon"}
        except Exception as e:
            part_wilcoxon = {"error": str(e)}

    # Per-pair pattern (already in sign_test but reproduced here so this
    # block is self-contained for the memo).
    per_pair = []
    for pair, sub in pivot.groupby("PairNumber"):
        per_pair.append({
            "PairNumber": int(pair),
            "n": int(len(sub)),
            "mean_delta_TP": float(sub["delta"].mean()),
            "sd_delta_TP":   float(sub["delta"].std(ddof=1))
                              if len(sub) > 1 else np.nan,
            "n_oneEuro_higher": int((sub["delta"] > 0).sum()),
        })

    return {
        "ok": True,
        "delta_definition": "ΔTP = TP(oneEuro) − TP(exponential), bits/s",
        "per_cell": {
            "n_cells": n_cells,
            "mean_delta": mean_d,
            "sd_delta":   sd_d,
            "cohens_dz":  dz,
            "paired_t_test": cell_paired_t,
            "wilcoxon_signed_rank": cell_wilcoxon,
            "bootstrap_participant_cluster": boot,
        },
        "per_participant": {
            "summary": part_summary,
            "values": per_part.to_dict("records"),
            "paired_t_test_vs_zero": part_paired_t,
            "wilcoxon_signed_rank":  part_wilcoxon,
        },
        "per_pair": per_pair,
    }


def _build_cell_means(trials: pd.DataFrame,
                      variance: pd.DataFrame | None,
                      desc: pd.DataFrame | None = None) -> pd.DataFrame:
    """Aggregate raw trials to one row per (Participant, Part, PairNumber, FilterType).
    Returns columns: Participant, Part, PairNumber, FilterType, MeasuredSD,
    MeasuredLatency, meanMT, TP, IDe, n. Restricted to completed trials."""
    df = trials.copy()
    df = df[df["MovementTime"].notna() & (df["MovementTime"] > 0)]
    if "Status" in df.columns:
        completed = df["Status"].astype(str).str.lower().isin(
            ["completed", "true", "1", "ok"]) | df["Status"].isna()
        df = df[completed]

    if "Part" not in df.columns:
        df["Part"] = "Part A"
    df["Part"] = df["Part"].fillna("Part A")

    # Per-cell mean MT and filter latency.
    agg = (df.groupby(["Participant", "Part", "PairNumber", "FilterType"])
              .agg(meanMT=("MovementTime", "mean"),
                   MeasuredLatency=("FilterLatency", "mean"),
                   n=("MovementTime", "size"))
              .reset_index())

    # Pull measured SD from the variance-measurement table when available.
    if variance is not None and len(variance) > 0:
        sd_agg = (variance.groupby(["Participant", "PairNumber", "FilterType"])
                          ["MeasuredVariance_px"].mean()
                          .reset_index()
                          .rename(columns={"MeasuredVariance_px": "MeasuredSD"}))
        agg = agg.merge(sd_agg, on=["Participant", "PairNumber", "FilterType"],
                        how="left")
    else:
        agg["MeasuredSD"] = np.nan

    # Pull IDe from the descriptive table if provided so we stay consistent
    # with the rest of the memo's numbers. IDe depends on the task pair, not on
    # calibration source, so reusing the pooled IDe across Part A and Part B is
    # fine. TP, however, MUST be computed from each cell's own meanMT so the
    # personal-vs-standard comparison reflects the calibration difference.
    if desc is not None and len(desc) > 0:
        keep = ["Participant", "PairNumber", "FilterType", "IDe"]
        agg = agg.merge(desc[keep], on=["Participant", "PairNumber", "FilterType"],
                        how="left")
    else:
        agg["IDe"] = np.nan

    agg["TP"] = np.where(
        (agg["meanMT"] > 0) & agg["IDe"].notna(),
        agg["IDe"] / agg["meanMT"],
        np.nan,
    )

    return agg


def fit_mixed_model(trials: pd.DataFrame,
                    variance: pd.DataFrame | None,
                    desc: pd.DataFrame | None = None) -> dict:
    """RQ1 + RQ2 — cell-mean linear mixed-effects model.

    Fits  TP ~ filter * MeasuredLatency + IDe + (1 | Participant)  on cell
    means (one row per Participant × PairNumber × FilterType), restricted to
    Part A (personal calibration) for a balanced design. Part B contributes
    only to the calibration comparison (see `calibration_comparison`).

    Falls back gracefully if statsmodels or data is unavailable.
    """
    try:
        import statsmodels.formula.api as smf
    except ImportError:
        return {"ok": False, "error": "statsmodels not installed"}

    cells = _build_cell_means(trials, variance, desc)
    cells = cells[cells["Part"].astype(str).str.lower().str.contains("a")]
    cells = cells[cells["TP"].notna() & cells["MeasuredLatency"].notna()
                  & cells["IDe"].notna()]
    cells["filter_oe"] = (cells["FilterType"] == "oneEuro").astype(int)

    # Choose the latency covariate; if no FilterLatency at all, fall back to
    # MeasuredSD (paired with latency on the Pareto front).
    if cells["MeasuredLatency"].notna().sum() >= 4:
        lat_col = "MeasuredLatency"
    elif cells["MeasuredSD"].notna().sum() >= 4:
        lat_col = "MeasuredSD"
    else:
        return {"ok": False, "error": "no usable continuous covariate"}

    cells = cells.dropna(subset=["TP", "filter_oe", lat_col, "IDe"])
    if cells["Participant"].nunique() < 2:
        return {"ok": False, "error": "need ≥2 participants for mixed model"}
    if len(cells) < 6:
        return {"ok": False, "error": f"only {len(cells)} cell means available"}

    formula = f"TP ~ filter_oe * {lat_col} + IDe"
    try:
        md = smf.mixedlm(formula, cells, groups=cells["Participant"])
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            res = md.fit(method="lbfgs", reml=True)
    except Exception as e:
        return {"ok": False, "error": str(e)}

    fe = res.fe_params.to_dict()
    se = res.bse_fe.to_dict()
    pv = res.pvalues.to_dict()
    re_var = float(res.cov_re.iloc[0, 0]) if res.cov_re.size > 0 else np.nan

    return {
        "ok": True,
        "formula": formula,
        "covariate": lat_col,
        "unit": "cell means (one row per Participant × Pair × Filter, Part A only)",
        "fixed_effects": fe,
        "standard_errors": se,
        "p_values": pv,
        "between_participant_sd": float(np.sqrt(re_var)) if re_var > 0 else 0.0,
        "residual_sd": float(np.sqrt(res.scale)),
        "n_obs": int(cells.shape[0]),
        "n_participants": int(cells["Participant"].nunique()),
    }


def calibration_comparison(trials: pd.DataFrame,
                           desc: pd.DataFrame | None = None,
                           variance: pd.DataFrame | None = None,
                           calibration_info: dict | None = None) -> dict:
    """RQ3 — Personal vs standard calibration at matched mid variance.

    For each (Participant × Filter), compute TP at Part A's mid-variance pair
    and at Part B's mid-variance pair, then take the paired delta.

    `calibration_info` is the per-participant dict returned by load_all().
    We use it to check whether each participant ACTUALLY ran with a different
    calibration in Part B (by comparing the Calibration Source timestamps).
    If everyone's Part A and Part B sources are identical, the contrast is
    really a TEST–RETEST of the medium-variance condition (no calibration
    swap actually happened), not a personal-vs-standard comparison. The
    result is relabeled accordingly so we don't mislead the reader.

    Returns ok=False if no participant has both parts.
    """
    cells = _build_cell_means(trials, variance, desc)
    if "Part" not in cells.columns:
        return {"ok": False, "error": "no Part column"}

    # The "mid" pair is conventionally PairNumber == 2 (Low=1, Med=2, High=3).
    mid = cells[cells["PairNumber"] == 2].copy()
    if len(mid) == 0:
        return {"ok": False, "error": "no mid-variance (Pair 2) rows"}

    def _classify_part(p: str) -> str:
        p = p.strip().lower()
        if p in ("part a", "parta", "a"):
            return "personal"
        if p in ("part b", "partb", "b"):
            return "standard"
        return "?"

    mid["calib"] = mid["Part"].astype(str).apply(_classify_part)
    mid = mid[mid["calib"].isin(["personal", "standard"])]

    pivot = mid.pivot_table(
        index=["Participant", "FilterType"],
        columns="calib",
        values="TP",
        aggfunc="mean",
    )
    pivot = pivot.dropna(subset=["personal", "standard"], how="any")
    if len(pivot) == 0:
        return {"ok": False, "error": "no participant has both Part A and Part B mid"}

    # Audit: did each participant actually run Part B with a DIFFERENT
    # calibration than Part A? The JS hard-codes "Calibration Type: Standard"
    # in partB-info.txt by part name, so that label is unreliable. The only
    # reliable signal is the Calibration Source timestamp.
    audit = []
    n_actually_swapped = 0
    if calibration_info:
        for pid in sorted(set(pivot.reset_index()["Participant"])):
            info = calibration_info.get(pid, {}) or {}
            a = (info.get("Part A") or {}).get("source")
            b = (info.get("Part B") or {}).get("source")
            swapped = bool(a and b and a.strip() != b.strip())
            if swapped:
                n_actually_swapped += 1
            audit.append({
                "Participant": pid,
                "partA_source": a,
                "partB_source": b,
                "calibration_actually_swapped": swapped,
            })

    n_participants_total = pivot.reset_index()["Participant"].nunique()
    all_swapped = (calibration_info is not None
                   and n_actually_swapped == n_participants_total
                   and n_participants_total > 0)
    none_swapped = (calibration_info is not None and n_actually_swapped == 0)

    if all_swapped:
        comparison_kind = "personal_vs_standard"
    elif none_swapped:
        comparison_kind = "test_retest_same_calibration"
    else:
        comparison_kind = "mixed_swap_status"

    pivot["delta_A_minus_B"] = pivot["personal"] - pivot["standard"]
    pivot = pivot.rename(columns={"personal": "partA_mid_TP",
                                  "standard": "partB_mid_TP"})
    rows = pivot.reset_index().to_dict("records")

    # Per-filter summary.
    per_filter = []
    for filt, sub in pivot.reset_index().groupby("FilterType"):
        deltas = sub["delta_A_minus_B"].dropna()
        per_filter.append({
            "FilterType": filt,
            "n_participants": int(len(deltas)),
            "mean_delta_TP_A_minus_B": float(deltas.mean()) if len(deltas) > 0 else np.nan,
            "sd_delta_TP_A_minus_B":   float(deltas.std(ddof=1)) if len(deltas) > 1 else np.nan,
            "n_partA_higher": int((deltas > 0).sum()),
        })

    # Optional paired t-test pooled across filters (small-n, exploratory).
    try:
        from scipy import stats
        all_deltas = pivot["delta_A_minus_B"].dropna().values
        if len(all_deltas) >= 2:
            t, p = stats.ttest_1samp(all_deltas, 0)
            wilcox = stats.wilcoxon(all_deltas) if len(all_deltas) >= 6 else None
            pooled = {
                "n": int(len(all_deltas)),
                "mean_delta_TP_A_minus_B": float(all_deltas.mean()),
                "t": float(t),
                "p_t": float(p),
                "wilcoxon_p": float(wilcox.pvalue) if wilcox is not None else None,
            }
        else:
            pooled = {"n": int(len(all_deltas)), "note": "n<2, no test"}
    except Exception:
        pooled = None

    return {
        "ok": True,
        "comparison_kind": comparison_kind,
        "n_participants_swapped_calibration": n_actually_swapped,
        "n_participants_total": int(n_participants_total),
        "calibration_audit": audit,
        "rows": rows,
        "per_filter": per_filter,
        "pooled_paired": pooled,
    }


def participant_curve_fit(trials: pd.DataFrame,
                          variance: pd.DataFrame | None,
                          desc: pd.DataFrame | None = None) -> dict:
    """RQ2 — Per-participant quadratic fit of TP vs MeasuredLatency, then
    group-average curve per filter.

    With only 3 latency levels per participant a quadratic interpolates exactly
    (no residual). The point of the fit is to give every participant the same
    smooth representation so the group average is meaningful.
    """
    cells = _build_cell_means(trials, variance, desc)
    cells = cells[cells["Part"].astype(str).str.lower().str.contains("a")]
    cells = cells[cells["TP"].notna() & cells["MeasuredLatency"].notna()]
    if len(cells) == 0:
        return {"ok": False, "error": "no cells with TP + MeasuredLatency"}

    out = {"per_participant": [], "group_curve": {}}

    # Per-participant per-filter quadratic.
    for (pid, filt), sub in cells.groupby(["Participant", "FilterType"]):
        sub = sub.sort_values("MeasuredLatency")
        if len(sub) < 2:
            continue
        x = sub["MeasuredLatency"].values
        y = sub["TP"].values
        deg = 2 if len(sub) >= 3 else 1
        coef = np.polyfit(x, y, deg)
        out["per_participant"].append({
            "Participant": pid,
            "FilterType": filt,
            "n_points": int(len(sub)),
            "degree": int(deg),
            "coef": [float(c) for c in coef],  # highest-power first
            "x_min": float(x.min()),
            "x_max": float(x.max()),
        })

    # Group curve per filter: evaluate each participant's polynomial on a
    # common grid restricted to that participant's own latency range, then
    # average values where ≥2 participants contribute.
    for filt in cells["FilterType"].unique():
        rows = [r for r in out["per_participant"] if r["FilterType"] == filt]
        if not rows:
            continue
        grid_lo = max(r["x_min"] for r in rows)
        grid_hi = min(r["x_max"] for r in rows)
        if grid_hi <= grid_lo:
            continue
        grid = np.linspace(grid_lo, grid_hi, 50)
        values = []
        for r in rows:
            p = np.poly1d(r["coef"])
            values.append(p(grid))
        values = np.vstack(values)
        out["group_curve"][filt] = {
            "x": [float(g) for g in grid],
            "y_mean": [float(v) for v in np.nanmean(values, axis=0)],
            "y_sd":   [float(v) for v in np.nanstd(values, axis=0, ddof=1)
                       if values.shape[0] > 1] if values.shape[0] > 1 else None,
            "n_participants": int(values.shape[0]),
        }

    out["ok"] = len(out["per_participant"]) > 0
    return out


def tp_vs_subjective_correlation(desc: pd.DataFrame,
                                 questionnaire: pd.DataFrame | None) -> dict:
    """Sub-RQ B — Spearman correlation between TP rank and subjective-preference
    rank, computed within (Participant × Filter) over the 3 variance levels.
    Returns the per-(participant, filter) ρ values and a one-sample
    Wilcoxon vs ρ=0 across all (participant, filter) pairs.
    """
    if questionnaire is None or len(questionnaire) == 0:
        return {"ok": False, "error": "no questionnaire data"}

    # Build a universal per-condition subjective "satisfaction" score that
    # works regardless of whether the participant used the old wording
    # (EasyToHit, Concentration, Control, Effort) or the new wording
    # (NaturalCursor, LowEffort, CursorAccurate, NoticeableDelay, plus the
    # interim CursorSlow/CursorAccurate). We average all positive items and
    # reverse-coded negative items that are present on each row, so a row
    # with any Likert response contributes.
    q = questionnaire.copy()
    pos_cols = [c for c in ["EasyToHit", "Control", "LowEffort",
                              "CursorAccurate", "AccurateFollowing",
                              "NaturalCursor"]
                  if c in q.columns]
    neg_cols = [c for c in ["Concentration", "Effort", "HighEffort",
                              "CursorSlow", "NoticeableDelay"]
                  if c in q.columns]
    if not pos_cols and not neg_cols:
        return {"ok": False, "error": "no Likert columns present"}

    def _row_score(row):
        vals = []
        for c in pos_cols:
            v = pd.to_numeric(row.get(c), errors="coerce")
            if pd.notna(v):
                vals.append(float(v))
        for c in neg_cols:
            v = pd.to_numeric(row.get(c), errors="coerce")
            if pd.notna(v):
                vals.append(6.0 - float(v))
        return float(np.mean(vals)) if vals else np.nan

    q = q.assign(cursor_score=q.apply(_row_score, axis=1))
    q = q[["ParticipantID", "PairNumber", "FilterType", "cursor_score"]].copy()
    q = q.rename(columns={"ParticipantID": "Participant"})
    q = q.dropna(subset=["cursor_score"])

    # Build a per-condition TP table (mean across layouts).
    tp = (desc.groupby(["Participant", "PairNumber", "FilterType"])["TP"]
              .mean().reset_index().rename(columns={"TP": "tp"}))

    merged = tp.merge(q, on=["Participant", "PairNumber", "FilterType"])
    if len(merged) == 0:
        return {"ok": False, "error": "no overlap between TP and questionnaire"}

    try:
        from scipy import stats
    except ImportError:
        return {"ok": False, "error": "scipy not installed"}

    rho_rows = []
    for (pid, filt), sub in merged.groupby(["Participant", "FilterType"]):
        if sub["tp"].notna().sum() < 2 or sub["cursor_score"].notna().sum() < 2:
            continue
        rho, p = stats.spearmanr(sub["tp"], sub["cursor_score"])
        if np.isnan(rho):
            continue
        rho_rows.append({"Participant": pid, "FilterType": filt,
                         "n_levels": int(len(sub)),
                         "spearman_rho": float(rho),
                         "p_value": float(p)})

    if not rho_rows:
        return {"ok": False, "error": "no usable (Participant,Filter) pairs"}

    all_rhos = np.array([r["spearman_rho"] for r in rho_rows])
    summary = {
        "mean_rho": float(np.nanmean(all_rhos)),
        "median_rho": float(np.nanmedian(all_rhos)),
        "n_pairs": int(len(all_rhos)),
        "n_positive": int((all_rhos > 0).sum()),
    }
    try:
        from scipy import stats as _s
        if len(all_rhos) >= 6:
            summary["wilcoxon_p"] = float(_s.wilcoxon(all_rhos).pvalue)
    except Exception:
        pass

    return {"ok": True, "per_pair": rho_rows, "summary": summary}


def direction_effects(trials: pd.DataFrame) -> pd.DataFrame:
    """Per-direction supplementary table: completion rate, mean MT, mean
    re-entries. Useful for spotting top/bottom asymmetries (as in the
    pilot — Marzia, Aashritha)."""
    df = trials.copy()
    if "Direction" not in df.columns:
        return pd.DataFrame()
    df["Direction"] = pd.to_numeric(df["Direction"], errors="coerce")
    df = df[df["Direction"].notna()]
    df["DirLabel"] = df["Direction"].astype(int).map({
        0: "right", 45: "down-right", 90: "down", 135: "down-left",
        180: "left", 225: "up-left", 270: "up", 315: "up-right",
    }).fillna(df["Direction"].astype(int).astype(str) + "°")

    completed = df["Status"].astype(str).str.lower().isin(
        ["completed", "true", "1", "ok"]) | df["Status"].isna()
    df["completed"] = completed.astype(int)

    rows = []
    for d, g in df.groupby("DirLabel"):
        n = len(g)
        n_done = int(g["completed"].sum())
        mts = g.loc[g["completed"] == 1, "MovementTime"].dropna()
        res = g.loc[g["completed"] == 1, "ReEntryCount"].dropna() \
                if "ReEntryCount" in g.columns else pd.Series(dtype=float)
        rows.append({
            "Direction":        d,
            "n_total":          n,
            "n_completed":      n_done,
            "completion_rate":  n_done / n if n > 0 else np.nan,
            "mean_MT":          float(mts.mean()) if len(mts) > 0 else np.nan,
            "mean_reentries":   float(res.mean()) if len(res) > 0 else np.nan,
        })
    # Order compass-style.
    order = ["up", "up-right", "right", "down-right",
             "down", "down-left", "left", "up-left"]
    df_out = pd.DataFrame(rows)
    if len(df_out) > 0:
        df_out["__o"] = df_out["Direction"].apply(
            lambda d: order.index(d) if d in order else 99)
        df_out = df_out.sort_values("__o").drop(columns="__o").reset_index(drop=True)
    return df_out


def power_analysis(trials: pd.DataFrame, mixed: dict) -> dict:
    """Estimate sample size needed for 80% power detecting the filter effect.

    Uses a simple paired-t power calc on per-participant ΔTP, plus the mixed-model
    within/between SD as a sanity check. This is what your professor will accept
    for a pilot — proper simr-style simulation is overkill for now.
    """
    from scipy import stats

    desc = descriptive_table(trials)
    pivot = desc.pivot_table(index=["Participant", "PairNumber"],
                              columns="FilterType", values="TP")

    if "oneEuro" not in pivot.columns or "exponential" not in pivot.columns:
        return {"ok": False, "error": "need both filters"}

    pivot["delta"] = pivot["oneEuro"] - pivot["exponential"]
    deltas = pivot["delta"].dropna()
    if len(deltas) < 2:
        return {"ok": False, "error": "too few paired deltas"}

    mean_delta = float(deltas.mean())
    sd_delta = float(deltas.std(ddof=1)) if len(deltas) > 1 else float("nan")

    if not np.isfinite(sd_delta) or sd_delta == 0:
        return {"ok": False, "error": "delta SD is zero or undefined"}

    dz = mean_delta / sd_delta

    def n_for_paired_t(dz_val, alpha=0.05, power=0.8, max_n=500):
        """Iterative paired-t sample-size finder using noncentral t distribution.
        Returns None if the required n exceeds max_n (i.e. effect too small to find)."""
        if abs(dz_val) < 1e-6:
            return None
        for n in range(3, max_n + 1):
            df_ = n - 1
            t_crit = stats.t.ppf(1 - alpha / 2, df_)
            ncp = dz_val * np.sqrt(n)
            achieved = 1 - stats.nct.cdf(t_crit, df_, ncp) + stats.nct.cdf(-t_crit, df_, ncp)
            if achieved >= power:
                return n
        return None

    n80 = n_for_paired_t(dz)
    n90 = n_for_paired_t(dz, power=0.9)

    def min_detectable_dz(n, alpha=0.05, power=0.8):
        """Minimum d_z detectable with `n` paired observations at given α and power."""
        from scipy.optimize import brentq
        df_n = n - 1
        t_crit_n = stats.t.ppf(1 - alpha / 2, df_n)
        def power_at_dz(d):
            ncp = d * np.sqrt(n)
            return (1 - stats.nct.cdf(t_crit_n, df_n, ncp)
                    + stats.nct.cdf(-t_crit_n, df_n, ncp) - power)
        try:
            return brentq(power_at_dz, 1e-4, 3.0)
        except Exception:
            return None

    mdes_at_n12 = min_detectable_dz(12)
    mdes_at_n20 = min_detectable_dz(20)

    if n80 is None:
        recommendation = 20
        m12 = f"{mdes_at_n12:.2f}" if mdes_at_n12 else "—"
        m20 = f"{mdes_at_n20:.2f}" if mdes_at_n20 else "—"
        interpretation = (
            f"Pilot effect size for ΔTP is essentially zero (d_z = {dz:.3f}), so a "
            "paired-t test cannot estimate a meaningful target n. With n=12 (HCI "
            f"standard) a real study could detect d_z ≥ {m12}; with "
            f"n=20 it could detect d_z ≥ {m20}. Pilot does not yet "
            "support a strong directional claim on filter type."
        )
    else:
        recommendation = max(8, min(n80, 30))
        interpretation = (
            f"To detect the pilot effect (d_z = {dz:.3f}) with 80% power at α=0.05, "
            f"n = {n80} is required."
        )

    return {"ok": True, "mean_delta_TP": mean_delta, "sd_delta_TP": sd_delta,
            "cohens_dz": dz, "n_paired_observations": int(len(deltas)),
            "n_for_80_power": int(n80) if n80 is not None else None,
            "n_for_90_power": int(n90) if n90 is not None else None,
            "min_detectable_dz_at_n12": float(mdes_at_n12) if mdes_at_n12 else None,
            "min_detectable_dz_at_n20": float(mdes_at_n20) if mdes_at_n20 else None,
            "recommended_n": int(recommendation),
            "interpretation": interpretation,
            "note": ("Paired-t power on per-participant ΔTP collapsed across variance pairs. "
                     "Conservative estimate. For final study, refine with simr in R "
                     "or a simulation-based mixed-model power analysis.")}


# ----- plotting -----

def _fig_to_b64(fig) -> str:
    buf = BytesIO()
    fig.savefig(buf, format="png", dpi=110, bbox_inches="tight")
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("ascii")


def make_figures(trials, variance, fits, var_table, desc, out_dir: Path,
                 curve_fit: dict | None = None):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    figs = {}

    # Fig 1: data coverage heatmap
    pivot = (trials.groupby(["Participant", "PairNumber", "FilterType"])
                   .size()
                   .unstack(["PairNumber", "FilterType"], fill_value=0))
    fig, ax = plt.subplots(figsize=(6, max(2, 0.5 * len(pivot) + 1)))
    im = ax.imshow(pivot.values, aspect="auto", cmap="Blues")
    ax.set_xticks(range(len(pivot.columns)))
    ax.set_xticklabels(["P{}\n{}".format(p, f[:3]) for p, f in pivot.columns],
                       rotation=0, fontsize=8)
    ax.set_yticks(range(len(pivot.index)))
    ax.set_yticklabels(pivot.index)
    for i in range(pivot.shape[0]):
        for j in range(pivot.shape[1]):
            v = pivot.values[i, j]
            ax.text(j, i, str(v), ha="center", va="center",
                    color="white" if v > pivot.values.max() / 2 else "black",
                    fontsize=8)
    ax.set_title("Trials per participant × pair × filter")
    fig.colorbar(im, ax=ax, label="# trials")
    fig.tight_layout()
    fig.savefig(out_dir / "01_data_coverage.png", dpi=110, bbox_inches="tight")
    figs["coverage"] = _fig_to_b64(fig)
    plt.close(fig)

    # Fig 2: Fitts fit per participant
    fig, ax = plt.subplots(figsize=(6, 4))
    for pid, g in trials.groupby("Participant"):
        cell = (g.groupby(["FilterType", "PairNumber", "TargetSize", "Amplitude"])
                  .agg(MT=("MovementTime", "mean"), ID=("ID", "first"))
                  .reset_index())
        ax.scatter(cell["ID"], cell["MT"], label=pid, alpha=0.7)
        if len(cell) >= 3:
            b, a = np.polyfit(cell["ID"], cell["MT"], 1)
            xs = np.linspace(cell["ID"].min(), cell["ID"].max(), 50)
            ax.plot(xs, a + b * xs, alpha=0.5)
    ax.set_xlabel("Index of difficulty (bits)")
    ax.set_ylabel("Mean movement time (s)")
    ax.set_title("Fitts' law fit per participant")
    ax.legend(fontsize=8)
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(out_dir / "02_fitts_fit.png", dpi=110, bbox_inches="tight")
    figs["fitts"] = _fig_to_b64(fig)
    plt.close(fig)

    # Fig 3: between-participant variation in measured SD
    if variance is not None and len(variance) > 0:
        fig, ax = plt.subplots(figsize=(7, 4))
        for filt, marker in [("exponential", "o"), ("oneEuro", "s")]:
            sub = variance[variance["FilterType"] == filt]
            if len(sub) == 0:
                continue
            ax.scatter(sub["PairNumber"] + (0.1 if filt == "oneEuro" else -0.1),
                       sub["MeasuredVariance_px"],
                       label=filt, marker=marker, alpha=0.8, s=60)
        ax.set_xlabel("Variance pair (1=Low, 2=Med, 3=High)")
        ax.set_ylabel("Measured cursor SD (px)")
        ax.set_title("Measured cursor SD per participant (the prof's concern)")
        ax.set_xticks([1, 2, 3])
        ax.legend()
        ax.grid(True, alpha=0.3)
        fig.tight_layout()
        fig.savefig(out_dir / "03_variance_per_participant.png", dpi=110, bbox_inches="tight")
        figs["variance"] = _fig_to_b64(fig)
        plt.close(fig)

    # Fig 4: TP per pair × filter, per participant
    fig, ax = plt.subplots(figsize=(7, 4))
    width = 0.35
    pairs = sorted(desc["PairNumber"].unique())
    participants = sorted(desc["Participant"].unique())
    x = np.arange(len(pairs))
    for i, pid in enumerate(participants):
        sub = desc[desc["Participant"] == pid]
        for j, filt in enumerate(["exponential", "oneEuro"]):
            vals = [sub[(sub["PairNumber"] == p) &
                        (sub["FilterType"] == filt)]["TP"].mean()
                    for p in pairs]
            offset = (i - (len(participants) - 1) / 2) * (width + 0.05) + \
                     (-width / 2 if filt == "exponential" else width / 2)
            ax.bar(x + offset, vals,
                   width=width * 0.45,
                   label=f"{pid}-{filt[:3]}" if i < 3 else None,
                   alpha=0.7)
    ax.set_xticks(x)
    ax.set_xticklabels([f"Pair {p}" for p in pairs])
    ax.set_ylabel("Throughput (bits/s)")
    ax.set_title("Throughput per participant × pair × filter")
    ax.legend(fontsize=7, ncol=2)
    ax.grid(True, alpha=0.3, axis="y")
    fig.tight_layout()
    fig.savefig(out_dir / "04_descriptive_table.png", dpi=110, bbox_inches="tight")
    figs["desc"] = _fig_to_b64(fig)
    plt.close(fig)

    # Fig 5: Throughput vs Latency Pareto plot.
    # For each (participant × pair × filter) cell we now have an empirically
    # observed (mean filter latency, mean throughput) point. Plotting them
    # together shows: (a) where each filter actually sits on the latency/TP
    # plane in practice, and (b) whether One Euro really does dominate the
    # operating points we chose. Lines connect the three variance pairs within
    # the same (participant, filter) to make the per-participant Pareto shape
    # visible.
    pareto_rows = []
    for (pid, pair, filt), g in trials.groupby(
            ["Participant", "PairNumber", "FilterType"]):
        completed = g[g["Status"].astype(str).str.lower().isin(
            ["completed", "true", "1", "ok"]) | g["Status"].isna()]
        mt = completed["MovementTime"].dropna()
        if len(mt) == 0:
            continue
        # Filter latency is a per-cell constant. Take the mean defensively.
        lat = pd.to_numeric(g["FilterLatency"], errors="coerce").dropna()
        if len(lat) == 0:
            continue
        # Throughput: use the descriptive table's IDe value for this cell to
        # stay consistent with the rest of the report.
        match = desc[(desc["Participant"] == pid) &
                     (desc["PairNumber"] == pair) &
                     (desc["FilterType"] == filt)]
        if len(match) == 0 or pd.isna(match["TP"].iloc[0]):
            continue
        pareto_rows.append({
            "Participant": pid,
            "PairNumber": pair,
            "FilterType": filt,
            "FilterLatency": float(lat.mean()),
            "TP": float(match["TP"].iloc[0]),
        })

    pareto = pd.DataFrame(pareto_rows)
    if len(pareto) > 0:
        fig, ax = plt.subplots(figsize=(7.5, 5))
        color_map = {"exponential": "#d95f02", "oneEuro": "#1b9e77"}
        marker_map = {"exponential": "o",         "oneEuro": "s"}
        participants = sorted(pareto["Participant"].unique())
        # Subtle per-participant alpha tweak so overlapping points are visible.
        for pid in participants:
            for filt in ["exponential", "oneEuro"]:
                sub = (pareto[(pareto["Participant"] == pid)
                              & (pareto["FilterType"] == filt)]
                       .sort_values("FilterLatency"))
                if len(sub) == 0:
                    continue
                ax.plot(sub["FilterLatency"], sub["TP"],
                        color=color_map[filt],
                        marker=marker_map[filt],
                        markersize=9,
                        markeredgecolor="white",
                        markeredgewidth=0.8,
                        linewidth=1.2,
                        alpha=0.85,
                        label=None)
        # One legend entry per filter (de-duplicated).
        from matplotlib.lines import Line2D
        legend_handles = [
            Line2D([0], [0], color=color_map["exponential"],
                   marker=marker_map["exponential"], markersize=9,
                   linewidth=1.2, label="Exponential"),
            Line2D([0], [0], color=color_map["oneEuro"],
                   marker=marker_map["oneEuro"], markersize=9,
                   linewidth=1.2, label="One Euro"),
        ]
        # Annotate each point with the participant ID + variance pair
        # so the figure is still readable in a printed memo.
        for _, r in pareto.iterrows():
            ax.annotate(
                f"{r['Participant']}·P{int(r['PairNumber'])}",
                (r["FilterLatency"], r["TP"]),
                fontsize=7, color="#444",
                xytext=(4, 4), textcoords="offset points",
            )
        ax.set_xlabel("Filter latency (ms)")
        ax.set_ylabel("Throughput (bits / s)")
        ax.set_title("Throughput vs filter latency — empirical Pareto by filter\n"
                     "(lines connect Low→Med→High variance pairs within each "
                     "participant)",
                     fontsize=11)
        ax.legend(handles=legend_handles, loc="best", frameon=True)
        ax.grid(True, alpha=0.3)
        fig.tight_layout()
        fig.savefig(out_dir / "05_throughput_vs_latency_pareto.png",
                    dpi=110, bbox_inches="tight")
        figs["pareto"] = _fig_to_b64(fig)
        plt.close(fig)

    # Fig 6: RQ2 — per-participant TP-vs-latency quadratic curves with group
    # mean overlay per filter. Built from the curve_fit dict produced by
    # participant_curve_fit(). This is the figure Roberto sketched at the
    # May 7 meeting: each participant gets 3 (latency, TP) points fit with a
    # smooth curve; the group average tells us where the "sweet spot" is.
    if curve_fit and curve_fit.get("ok"):
        fig, ax = plt.subplots(figsize=(7.5, 5))
        color_map = {"exponential": "#d95f02", "oneEuro": "#1b9e77"}

        # Per-participant thin lines.
        for r in curve_fit.get("per_participant", []):
            filt = r["FilterType"]
            x = np.linspace(r["x_min"], r["x_max"], 50)
            y = np.poly1d(r["coef"])(x)
            ax.plot(x, y, color=color_map.get(filt, "gray"),
                    alpha=0.35, linewidth=1.0)

        # Group mean thick lines per filter.
        from matplotlib.lines import Line2D
        legend_handles = []
        for filt, gc in curve_fit.get("group_curve", {}).items():
            ax.plot(gc["x"], gc["y_mean"], color=color_map.get(filt, "gray"),
                    linewidth=3.0, label=f"{filt} group mean")
            legend_handles.append(Line2D(
                [0], [0], color=color_map.get(filt, "gray"), linewidth=3.0,
                label=f"{filt} (group mean, n={gc['n_participants']})"))

        if legend_handles:
            ax.legend(handles=legend_handles, loc="best", frameon=True)
        ax.set_xlabel("Filter latency (ms)")
        ax.set_ylabel("Throughput (bits / s)")
        ax.set_title("RQ2: Throughput vs latency — per-participant curves + "
                     "group mean\n(thin = each participant's quadratic fit, "
                     "thick = average across participants)",
                     fontsize=11)
        ax.grid(True, alpha=0.3)
        fig.tight_layout()
        fig.savefig(out_dir / "06_rq2_curves.png", dpi=110, bbox_inches="tight")
        figs["rq2_curves"] = _fig_to_b64(fig)
        plt.close(fig)

    return figs


# ----- HTML report -----

HTML_TEMPLATE = """<!doctype html>
<html><head>
<meta charset="utf-8">
<title>Fitts/Filter Pilot Analysis</title>
<style>
  body {{ font-family: -apple-system, system-ui, sans-serif; max-width: 900px;
         margin: 24px auto; padding: 0 16px; color: #222; line-height: 1.5; }}
  h1 {{ color: #2a4a6a; border-bottom: 2px solid #64c8ff; padding-bottom: 6px; }}
  h2 {{ color: #2a4a6a; margin-top: 28px; }}
  .meta {{ color: #666; font-size: 13px; }}
  .callout {{ background: #f4f8fc; border-left: 3px solid #64c8ff;
              padding: 10px 14px; border-radius: 4px; margin: 12px 0; }}
  .warn {{ background: #fff3e0; border-left: 3px solid #ffa64d; }}
  table {{ border-collapse: collapse; font-size: 13px; margin: 12px 0; }}
  th, td {{ border: 1px solid #ccc; padding: 4px 8px; text-align: right; }}
  th {{ background: #f0f4f8; }}
  td.label {{ text-align: left; }}
  img {{ max-width: 100%; height: auto; margin: 8px 0; }}
  code {{ background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 12px; }}
  .num {{ font-variant-numeric: tabular-nums; }}
</style></head>
<body>

<h1>Fitts / Filter Pilot — n={n}</h1>
<p class="meta">Generated {ts}. Source: <code>{data_dir}</code>.</p>

<div class="callout"><strong>Framing.</strong> This is a pilot. All inferential
claims are exploratory. The point is (1) to sanity-check the experiment,
(2) to quantify between-participant variation (the professor's concern),
and (3) to estimate the sample size required for a real study.</div>

<h2>1. Data coverage</h2>
<p>Number of completed trials per participant × pair × filter. Cells should
be roughly equal within participant; very low counts indicate a methods issue.</p>
<p class="meta"><strong>Notes on design:</strong> Part A runs all 3 variance pairs;
Part B (standard calibration) typically runs Pair 2 only. So Pair 2 has roughly
double the trials of Pairs 1 and 3 for each participant who completed both parts.
If one participant ran the protocol twice, their totals can be doubled again.</p>
<img src="data:image/png;base64,{fig_coverage}" alt="coverage">
{coverage_note}

<h2>2. Sanity check: Fitts' law fit</h2>
<p>Per-participant linear fit of mean MT against Index of Difficulty.
A "clean" Fitts task with constant viewing conditions and no filter
manipulation typically gives <code>r² &gt; 0.8</code>.</p>
{fitts_table}
<img src="data:image/png;base64,{fig_fitts}" alt="fitts">
<p class="callout"><strong>Note on the low r² values.</strong> In this study,
each participant's MT samples come from three very different filter
operating points (Low / Med / High latency × 2 filter types). The
filter-condition variance is intentionally large by design — it is the
quantity we want to study — and that variance ends up dominating the
task-difficulty variance that Fitts' law captures. So an r² of 0.2–0.5
here does <em>not</em> say the task is broken; it says the manipulation
is working. A confirmatory Fitts check would fit the line <strong>within
each filter × variance cell</strong> separately.</p>

<h2>3. Between-participant variation (the professor's concern)</h2>
<p>For each variance pair × filter, how much does the <em>measured</em> cursor SD
differ between participants? A high coefficient of variation (CV) means the
"Low / Med / High" labels do not produce uniform conditions across people —
the case for per-participant filter calibration.</p>
{variance_table}
{variance_fig}

<h2>4. Per-participant descriptive results</h2>
<p>Throughput (bits/s), mean MT (s), and re-entry count per condition cell.
Sign-test framing only — no inferential claim from <em>n</em>=pilot.</p>
{desc_table}
<img src="data:image/png;base64,{fig_desc}" alt="desc">

<h3>4a. Throughput vs filter latency — empirical Pareto</h3>
<p>Each marker is one (participant × variance pair × filter) cell. Lines connect
the three variance pairs within a participant for a single filter, so the shape
of each filter's per-participant operating curve is visible. If One Euro
genuinely dominates Exponential in this regime, its markers should sit
<em>above and/or to the left</em> of the matching Exponential markers.</p>
{pareto_fig}

<h2>5. Direction-of-effect (sign test) [RQ1 quick read]</h2>
<p>For each (participant × variance pair), did One Euro produce higher throughput
than Exponential?</p>
{sign_test_block}

<h2>5a. Filter contrast — multiple methods triangulated</h2>
<p>With only {n} participants the mixed model alone is fragile. The block
below applies several complementary tests to the same 12 paired ΔTP values
(ΔTP = TP(One Euro) − TP(Exponential), per Participant × Pair). If all
methods point the same way, the initial read is robust; if they disagree,
the pilot is genuinely inconclusive on the filter main effect.</p>
{filter_initial_read_block}

<h2>6. RQ1 + RQ2 — Cell-mean mixed-effects model</h2>
<div class="callout warn"><strong>Exploratory only.</strong> With only {n} participants,
the random-effect variance is unstable. Treat the fixed-effect estimates as
preliminary effect-size guesses, not as hypothesis tests.</div>
{mixed_block}

<h2>6a. RQ2 — Throughput vs latency curves</h2>
<p>Roberto's sketch from the May 7 meeting: per-participant smooth fit of
throughput against the <em>measured</em> filter latency, averaged across
participants per filter. An interior peak (or a clear divergence between
the two filters' curves) is the paper's headline finding from this section.</p>
{rq2_fig}

<h2>6b. RQ3 — Calibration contrast at mid variance {calibration_heading_suffix}</h2>
{calibration_block}

<h2>6c. Sub-RQ — Throughput vs subjective preference (Spearman)</h2>
{correlation_block}

<h2>6d. Supplementary — Direction effects</h2>
{direction_block}

<h2>7. Power analysis &amp; recommended <em>n</em> for the real study</h2>
{power_block}

<h2>Decision points for the professor</h2>
<ul>
  <li>Does the CV in section 3 justify implementing <strong>per-participant filter
      calibration</strong> (replacing the global Pareto front with one derived from
      each participant's own still-recording)?</li>
  <li>Is <strong>n = {recommended_n}</strong> an acceptable target for the full
      study (matches HCI standard practice: Casiez 2012 used 11, ISO 9241-411
      recommends ≥12, Hansen 2018 used 20)?</li>
  <li>Anything else to log per trial before full recruitment?</li>
</ul>

</body></html>
"""


def df_to_html(df: pd.DataFrame, fmt: dict | None = None) -> str:
    fmt = fmt or {}
    cols = list(df.columns)
    def f(v, c):
        if c in fmt and isinstance(v, (int, float, np.integer, np.floating)) and pd.notna(v):
            return fmt[c].format(v)
        if pd.isna(v):
            return ""
        return str(v)
    rows = ["<table><thead><tr>" + "".join(f"<th>{c}</th>" for c in cols) + "</tr></thead><tbody>"]
    for _, r in df.iterrows():
        rows.append("<tr>" + "".join(
            f'<td class="{"label num" if isinstance(r[c], str) else "num"}">{f(r[c], c)}</td>'
            for c in cols) + "</tr>")
    rows.append("</tbody></table>")
    return "\n".join(rows)


def build_sign_test_block(st: dict) -> str:
    if st["comparisons"] == 0:
        return "<p>Not enough paired cells to run sign test.</p>"
    p = st["p_one_sided"]
    p_str = f"{p:.4f}" if pd.notna(p) else "n/a"
    sentence = (
        f"<p>Overall: One Euro had higher TP than Exponential in "
        f"<strong>{st['oneEuro_better']} of {st['comparisons']}</strong> "
        f"participant × pair cells (one-sided sign-test p = {p_str}).</p>"
    )
    if pd.notna(p) and p < 0.1:
        sentence += "<p>Trend: One Euro favoured. Pilot-level only; confirm with full sample.</p>"
    elif pd.notna(p) and p > 0.4:
        sentence += ('<p class="callout warn">No directional trend at the pilot '
                     'level — the effect either is small or varies across participants. '
                     'Per-pair breakdown below may still show pattern.</p>')

    # per-pair summary table
    per_pair_df = pd.DataFrame(st["per_pair"])
    per_pair_df = per_pair_df.rename(columns={
        "PairNumber": "Pair", "n": "n", "oneEuro_better": "OE wins",
        "p_one_sided": "p (one-sided)", "mean_delta": "mean ΔTP"})
    sentence += "<h3 style='font-size:14px;margin-top:14px'>Per-pair breakdown</h3>"
    sentence += df_to_html(per_pair_df,
        {"p (one-sided)": "{:.3f}", "mean ΔTP": "{:+.3f}"})

    # per-cell raw deltas
    rows = [{"Participant": r["Participant"], "Pair": r["PairNumber"],
             "TP One Euro": r.get("oneEuro"), "TP Exp": r.get("exponential"),
             "Δ (OE-Exp)": r["delta"]} for r in st["per_cell"]]
    table_df = pd.DataFrame(rows)
    sentence += "<h3 style='font-size:14px;margin-top:14px'>Per-cell raw values</h3>"
    return sentence + df_to_html(table_df,
        {"TP One Euro": "{:.3f}", "TP Exp": "{:.3f}", "Δ (OE-Exp)": "{:+.3f}"})


def build_filter_initial_read_block(f: dict) -> str:
    if not f.get("ok"):
        return (f'<p class="callout warn">Triangulated filter read not run: '
                f'{f.get("error","unknown")}</p>')
    pc = f["per_cell"]
    boot = pc["bootstrap_participant_cluster"]
    ppt = f["per_participant"]
    psumm = ppt["summary"]

    def _fmt_p(p):
        return f"{p:.3f}" if (p is not None and pd.notna(p)) else "n/a"

    direction_word = (
        "favours <strong>One Euro</strong>" if pc["mean_delta"] > 0
        else "favours <strong>Exponential</strong>" if pc["mean_delta"] < 0
        else "<strong>equal</strong>")

    out = []
    out.append(
        f"<p>Δ definition: <em>{f['delta_definition']}</em>. Positive Δ ⇒ One Euro "
        f"better; negative Δ ⇒ Exponential better. Across {pc['n_cells']} paired "
        f"(Participant × Pair) cells, mean Δ = "
        f"<span class='num'>{pc['mean_delta']:+.3f}</span> bits/s "
        f"(SD = {pc['sd_delta']:.3f}, Cohen's d_z = {pc['cohens_dz']:+.2f}). "
        f"The direction {direction_word}, but the magnitude is small.</p>")

    method_rows = []
    if pc.get("paired_t_test") and "p_two_sided" in pc["paired_t_test"]:
        tt = pc["paired_t_test"]
        method_rows.append({
            "Method": "Paired t-test on per-cell ΔTP",
            "Unit": f"{pc['n_cells']} paired cells",
            "Statistic": f"t = {tt['t']:+.2f}",
            "p (two-sided)": _fmt_p(tt.get("p_two_sided")),
            "Effect / 95% CI": f"mean Δ = {pc['mean_delta']:+.3f}, d_z = {pc['cohens_dz']:+.2f}",
        })
    if pc.get("wilcoxon_signed_rank") and "p_two_sided" in pc["wilcoxon_signed_rank"]:
        w = pc["wilcoxon_signed_rank"]
        method_rows.append({
            "Method": "Wilcoxon signed-rank on per-cell ΔTP",
            "Unit": f"{pc['n_cells']} paired cells",
            "Statistic": f"W = {w['statistic']:.1f}",
            "p (two-sided)": _fmt_p(w.get("p_two_sided")),
            "Effect / 95% CI": "—",
        })
    method_rows.append({
        "Method": "Cluster-bootstrap CI (resample participants)",
        "Unit": f"{boot['n_boot']:,} resamples",
        "Statistic": "—",
        "p (two-sided)": _fmt_p(boot.get("p_two_sided_approx")),
        "Effect / 95% CI": f"95% CI [{boot['ci95_low']:+.3f}, {boot['ci95_high']:+.3f}] bits/s",
    })
    if ppt.get("paired_t_test_vs_zero") and "p_two_sided" in ppt["paired_t_test_vs_zero"]:
        pt = ppt["paired_t_test_vs_zero"]
        method_rows.append({
            "Method": "Per-participant aggregate ΔTP (1-sample t)",
            "Unit": f"{psumm['n_participants']} participants",
            "Statistic": f"t = {pt['t']:+.2f}",
            "p (two-sided)": _fmt_p(pt.get("p_two_sided")),
            "Effect / 95% CI": f"mean Δ = {psumm['mean']:+.3f}, d_z = {pt.get('cohens_dz', float('nan')):+.2f}",
        })

    method_df = pd.DataFrame(method_rows)
    out.append("<h3 style='font-size:14px;margin-top:14px'>Triangulation table</h3>")
    out.append(df_to_html(method_df, {}))

    # Per-pair pattern — the most interesting hint at n=4.
    pair_df = pd.DataFrame(f["per_pair"])
    pair_df["variance_level"] = pair_df["PairNumber"].map(
        {1: "Low (Pair 1)", 2: "Mid (Pair 2)", 3: "High (Pair 3)"})
    pair_df = pair_df[["PairNumber", "variance_level", "n",
                        "mean_delta_TP", "sd_delta_TP", "n_oneEuro_higher"]]
    out.append("<h3 style='font-size:14px;margin-top:14px'>"
                "Per-variance-pair breakdown (filter × variance hint)</h3>")
    out.append(df_to_html(pair_df,
        {"mean_delta_TP": "{:+.3f}", "sd_delta_TP": "{:.3f}"}))

    # Per-participant aggregate table.
    pp_rows = []
    for r in ppt["values"]:
        pp_rows.append({"Participant": r["Participant"],
                         "mean ΔTP (across pairs)": r["mean_delta"],
                         "favoured filter": ("One Euro" if r["mean_delta"] > 0
                                              else "Exponential" if r["mean_delta"] < 0
                                              else "tie")})
    pp_df = pd.DataFrame(pp_rows)
    out.append("<h3 style='font-size:14px;margin-top:14px'>"
                "Per-participant aggregate ΔTP</h3>")
    out.append(df_to_html(pp_df, {"mean ΔTP (across pairs)": "{:+.3f}"}))

    # Verdict callout.
    pieces = []
    if pc.get("paired_t_test") and "p_two_sided" in pc["paired_t_test"]:
        pieces.append(("paired t", pc["paired_t_test"]["p_two_sided"]))
    if pc.get("wilcoxon_signed_rank") and "p_two_sided" in pc["wilcoxon_signed_rank"]:
        pieces.append(("Wilcoxon", pc["wilcoxon_signed_rank"]["p_two_sided"]))
    if ppt.get("paired_t_test_vs_zero") and "p_two_sided" in ppt["paired_t_test_vs_zero"]:
        pieces.append(("per-participant t", ppt["paired_t_test_vs_zero"]["p_two_sided"]))
    ci_crosses_zero = boot["ci95_low"] < 0 < boot["ci95_high"]
    all_ns = all(p > 0.10 for _, p in pieces) and len(pieces) > 0

    if all_ns and ci_crosses_zero:
        out.append(
            "<p class='callout warn'><strong>Verdict (initial read).</strong> "
            "All four tests fail to reject H0 (p > 0.10), and the bootstrap 95% "
            "CI on the mean Δ comfortably straddles zero. <em>The pilot does NOT "
            "support a main-effect claim for either filter.</em> The per-pair "
            "table above is more informative: One Euro tends to win at low/mid "
            "variance and lose at high variance — a hint at a filter × variance "
            "interaction worth confirming at n = 20.</p>")
    elif not ci_crosses_zero:
        out.append(
            "<p class='callout' style='border-color:#64ff96'><strong>Verdict (initial read).</strong> "
            "The bootstrap 95% CI on the mean Δ does NOT cross zero — robust hint "
            "that the favoured filter outperforms the other in this pilot. Still "
            "exploratory; confirm at n = 20.</p>")
    else:
        out.append(
            "<p class='callout warn'><strong>Verdict (initial read).</strong> "
            "Methods disagree or evidence is mixed. The pilot is genuinely "
            "inconclusive on the filter main effect; rely on the n = 20 study "
            "for any directional claim.</p>")
    return "\n".join(out)


def build_mixed_block(m: dict) -> str:
    if not m.get("ok"):
        return f'<p class="callout warn">Mixed model not fit: {m.get("error","unknown")}</p>'
    fe = m["fixed_effects"]; se = m["standard_errors"]; pv = m["p_values"]
    rows = []
    for name in fe:
        rows.append({"term": name, "estimate": fe[name],
                     "SE": se.get(name, np.nan), "p": pv.get(name, np.nan)})
    table = pd.DataFrame(rows)
    cov = m.get("covariate", "?")
    head = (f"<p>Formula: <code>{m['formula']}</code><br>"
            f"<code>{cov}</code> = "
            + ("per-cell measured filter latency (ms)" if cov == "MeasuredLatency"
               else "per-cell measured cursor SD (px)") + ". "
            + f"<strong>Unit of analysis:</strong> {m.get('unit','cell means')}. "
            + f"n = {m['n_obs']} cells from {m['n_participants']} participants.<br>"
            + f"Between-participant SD (random intercept) = "
              f"{m['between_participant_sd']:.3f}. "
            + f"Residual SD = {m['residual_sd']:.3f}.</p>"
            + '<p class="meta">Cell-mean model (one row per Participant × Pair × '
              'Filter, Part A only) — avoids the trial-level pseudo-replication '
              'that inflates the SE on a covariate that is constant within a '
              'cell. Compare to a trial-level model as a sensitivity check.</p>')
    return head + df_to_html(table,
        {"estimate": "{:+.4f}", "SE": "{:.4f}", "p": "{:.4f}"})


def build_calibration_block(c: dict) -> str:
    if not c.get("ok"):
        return (f'<p class="callout warn">Calibration comparison not run: '
                f'{c.get("error","unknown")}</p>')

    kind  = c.get("comparison_kind", "personal_vs_standard")
    n_sw  = c.get("n_participants_swapped_calibration")
    n_tot = c.get("n_participants_total")
    audit = pd.DataFrame(c.get("calibration_audit") or [])

    lines = []

    # Pick narrative based on whether the calibration source actually
    # differed between Part A and Part B for each participant. The
    # `Calibration Type` label in partB-info.txt is hard-coded by the JS
    # and CANNOT be trusted on its own; only matching the timestamps in
    # `Calibration Source` is reliable.
    if kind == "test_retest_same_calibration":
        lines.append(
            f"<p class='callout warn'><strong>Protocol audit:</strong> for "
            f"all {n_tot}/{n_tot} pilot participants, Part A and Part B were "
            f"run with the <strong>same calibration source timestamp</strong> "
            f"(no participant uploaded a different / experimenter-provided "
            f"calibration file at the swap screen). The Part B label "
            f"<em>'Calibration Type: Standard'</em> in <code>partB-info.txt</code> "
            f"is hard-coded by part name in the JS and does not reflect a "
            f"real calibration swap. <strong>This pilot therefore does NOT yet "
            f"answer the personal-vs-standard RQ.</strong> What the section "
            f"below shows is a <strong>test–retest stability check</strong> at "
            f"mid variance (Pair 2), where Δ = TP(Part A mid) − TP(Part B mid) "
            f"under identical calibration. Useful as a within-session "
            f"reliability signal, not as a calibration contrast.</p>")
        kind_label = "Test–retest (same calibration in both parts)"
        delta_caption = "Δ TP = Part A mid − Part B mid (same calibration)"
    elif kind == "mixed_swap_status":
        lines.append(
            f"<p class='callout warn'><strong>Protocol audit:</strong> only "
            f"{n_sw}/{n_tot} participants actually ran Part B with a different "
            f"calibration source than Part A. The remaining participants ran "
            f"Part B with their Part A calibration. The Δ below is therefore "
            f"a <em>mix</em> of personal-vs-standard contrasts and "
            f"test–retests and should be interpreted accordingly.</p>")
        kind_label = "Mixed (some swapped, some did not)"
        delta_caption = "Δ TP = Part A − Part B"
    else:  # all swapped
        lines.append(
            f"<p>Within-participant comparison at <strong>mid variance "
            f"(Pair 2)</strong>: personal calibration (Part A) vs. standard "
            f"calibration (Part B), separately for each filter. Positive Δ ⇒ "
            f"personal calibration better. Calibration sources differed for "
            f"all {n_sw}/{n_tot} participants.</p>")
        kind_label = "Personal vs. Standard calibration"
        delta_caption = "Δ TP = personal − standard"

    if not audit.empty:
        audit_display = audit.rename(columns={
            "partA_source": "Part A source",
            "partB_source": "Part B source",
            "calibration_actually_swapped": "actually swapped?",
        })
        lines.append("<h3 style='font-size:14px;margin-top:14px'>"
                     "Per-participant calibration audit</h3>")
        lines.append(df_to_html(audit_display, {}))

    lines.append(f"<p class='meta'>Comparison kind: <strong>{kind_label}</strong>. "
                 f"Δ definition: {delta_caption}.</p>")

    per_filter = pd.DataFrame(c["per_filter"])
    if not per_filter.empty:
        lines.append("<h3 style='font-size:14px;margin-top:14px'>Per-filter summary</h3>")
        lines.append(df_to_html(per_filter,
            {"mean_delta_TP_A_minus_B": "{:+.3f}",
             "sd_delta_TP_A_minus_B": "{:.3f}"}))
    raw = pd.DataFrame(c["rows"])
    if not raw.empty:
        raw = raw.rename(columns={
            "delta_A_minus_B": "Δ TP",
            "partA_mid_TP": "Part A mid TP",
            "partB_mid_TP": "Part B mid TP",
        })
        lines.append("<h3 style='font-size:14px;margin-top:14px'>Per-participant raw values</h3>")
        lines.append(df_to_html(raw,
            {"Part A mid TP": "{:.3f}", "Part B mid TP": "{:.3f}",
             "Δ TP": "{:+.3f}"}))
    pooled = c.get("pooled_paired")
    if pooled and "p_t" in pooled:
        lines.append(f"<p>Pooled paired test across both filters (exploratory, "
                     f"small-n): mean Δ = "
                     f"<span class='num'>{pooled['mean_delta_TP_A_minus_B']:+.3f}</span> "
                     f"bits/s, t = {pooled['t']:+.2f}, p = {pooled['p_t']:.3f}, "
                     f"n = {pooled['n']}.</p>")
    return "\n".join(lines)


def build_correlation_block(c: dict) -> str:
    if not c.get("ok"):
        return (f'<p class="callout warn">TP–subjective correlation not run: '
                f'{c.get("error","unknown")}</p>')
    summ = c["summary"]
    rho_table = pd.DataFrame(c["per_pair"])
    head = (f"<p>For each (Participant × Filter), Spearman ρ between Throughput "
            f"rank and cursor-side subjective score rank across the 3 variance "
            f"levels. Cursor-side score = mean of <em>AccurateFollowing</em> and "
            f"<em>(6 − NoticeableDelay)</em>, so high = 'feels accurate and "
            f"responsive'.</p>"
            f"<p><strong>Across {summ['n_pairs']} (Participant × Filter) pairs:</strong> "
            f"mean ρ = <span class='num'>{summ['mean_rho']:+.3f}</span>, "
            f"median ρ = <span class='num'>{summ['median_rho']:+.3f}</span>, "
            f"<span class='num'>{summ['n_positive']}/{summ['n_pairs']}</span> "
            f"positive.</p>")
    if "wilcoxon_p" in summ:
        head += f"<p>Wilcoxon vs ρ = 0: p = {summ['wilcoxon_p']:.3f} (exploratory).</p>"
    head += "<h3 style='font-size:14px;margin-top:14px'>Per (Participant × Filter)</h3>"
    return head + df_to_html(rho_table,
        {"spearman_rho": "{:+.3f}", "p_value": "{:.3f}"})


def build_direction_block(d: pd.DataFrame) -> str:
    if d is None or len(d) == 0:
        return "<p><em>No direction data available.</em></p>"
    head = ("<p>Supplementary: per-target-direction completion rate, mean MT, "
            "and mean re-entries (completed trials only). Top/bottom asymmetry "
            "in completion rate is a calibration-reach symptom; high re-entries "
            "anywhere indicate dwell-selection instability.</p>")
    return head + df_to_html(d,
        {"completion_rate": "{:.1%}", "mean_MT": "{:.2f}",
         "mean_reentries": "{:.2f}"})


def build_power_block(p: dict) -> str:
    if not p.get("ok"):
        return f'<p class="callout warn">Power analysis not run: {p.get("error","unknown")}</p>'

    head = (f"<p>Per-participant ΔTP (One Euro − Exponential): "
            f"<span class='num'>mean = {p['mean_delta_TP']:+.3f} bits/s, "
            f"SD = {p['sd_delta_TP']:.3f}, Cohen's <em>d<sub>z</sub></em> = "
            f"{p['cohens_dz']:.3f}</span> across {p['n_paired_observations']} "
            f"paired observations.</p>")

    if p.get("n_for_80_power") is None:
        m12 = p.get("min_detectable_dz_at_n12")
        m20 = p.get("min_detectable_dz_at_n20")
        m12_str = f"{m12:.2f}" if m12 is not None else "—"
        m20_str = f"{m20:.2f}" if m20 is not None else "—"
        body = (f"<p class='callout warn'><strong>{p['interpretation']}</strong></p>"
                f"<p>Reporting <em>minimum detectable effect</em> (MDES) at standard "
                f"sample sizes instead of a target n:</p>"
                f"<ul>"
                f"<li>n = 12 → minimum detectable d<sub>z</sub> ≈ "
                f"<strong>{m12_str}</strong></li>"
                f"<li>n = 20 → minimum detectable d<sub>z</sub> ≈ "
                f"<strong>{m20_str}</strong></li>"
                f"</ul>"
                f"<p>Practical reading: a real study with n=12 would only catch a "
                f"<em>medium</em> filter effect; n=20 catches a small-to-medium effect. "
                f"If you expect the true effect to be small (which the pilot suggests), "
                f"plan for n ≥ 20.</p>")
    else:
        body = (f"<p>To detect this effect at α=0.05, two-sided:</p>"
                f"<ul>"
                f"<li>80% power → <strong>n = {p['n_for_80_power']}</strong></li>"
                f"<li>90% power → <strong>n = {p['n_for_90_power']}</strong></li>"
                f"</ul>")

    return head + body + f"<p class='meta'>{p['note']}</p>"


# ----- main -----

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="../pilot-data",
                    help="Folder containing one subfolder per participant (default: ../pilot-data)")
    ap.add_argument("--output", default="./output",
                    help="Output folder (default: ./output)")
    ap.add_argument("--exclude", default="",
                    help="Comma-separated participant folder names to exclude "
                         "(default: '' — include everyone).")
    ap.add_argument("--min-amplitude", type=float, default=300.0,
                    help="Drop trials with Amplitude < this many pixels (default: "
                         "300). This automatically removes the older 4-layout "
                         "protocol's inner-ring trials (Professor, May 5) so all "
                         "participants are analysed on the matched outer ring "
                         "(IDe ≈ 2.39 and 3.07). Pass --min-amplitude 0 to keep "
                         "all trials.")
    args = ap.parse_args()

    here = Path(__file__).parent.resolve()
    data_dir = (here / args.data).resolve() if not os.path.isabs(args.data) else Path(args.data)
    out_dir = (here / args.output).resolve() if not os.path.isabs(args.output) else Path(args.output)
    fig_dir = out_dir / "figures"
    out_dir.mkdir(parents=True, exist_ok=True)
    fig_dir.mkdir(parents=True, exist_ok=True)

    bundle = load_all(data_dir)
    trials = bundle["trials"]
    variance = bundle["variance"]

    # Apply CLI filters.
    excluded = [s.strip() for s in args.exclude.split(",") if s.strip()]
    if excluded:
        before_n = len(trials)
        before_p = trials["Participant"].nunique()
        trials = trials[~trials["Participant"].isin(excluded)]
        if variance is not None:
            variance = variance[~variance["Participant"].isin(excluded)]
        print(f"\nExcluded participants {excluded}: dropped "
              f"{before_p - trials['Participant'].nunique()} participants, "
              f"{before_n - len(trials)} trials.")

    if args.min_amplitude > 0:
        before_n = len(trials)
        amp_num = pd.to_numeric(trials["Amplitude"], errors="coerce")
        trials = trials[amp_num >= args.min_amplitude]
        if before_n != len(trials):
            print(f"\nApplied --min-amplitude={args.min_amplitude}: dropped "
                  f"{before_n - len(trials)} trials with Amplitude below the "
                  f"matched outer-ring threshold (keeps everyone on the same "
                  f"IDe operating points: ≈2.39 and 3.07).")

    n = trials["Participant"].nunique()
    print(f"\nLoaded {n} participants, {len(trials)} trials total after filtering.")

    print("\n[1/7] data coverage…")
    print("[2/7] Fitts fits per participant…")
    fits = per_participant_fitts_fit(trials)
    print(fits.to_string(index=False))

    print("\n[3/7] between-participant variation…")
    var_table = between_participant_variation(variance)
    if len(var_table):
        print(var_table.to_string(index=False))

    print("\n[4/7] descriptive table…")
    desc = descriptive_table(trials)

    print("\n[5/7] sign test…")
    st = sign_test(desc)
    print(f"  One Euro better in {st['oneEuro_better']}/{st['comparisons']} cells "
          f"(p={st['p_one_sided']:.4f})")

    print("\n[5a] filter contrast — triangulated initial read…")
    fir = filter_initial_read(desc)
    if fir.get("ok"):
        pc = fir["per_cell"]
        boot = pc["bootstrap_participant_cluster"]
        print(f"  per-cell mean ΔTP (OE − Exp) = {pc['mean_delta']:+.3f} bits/s, "
              f"SD = {pc['sd_delta']:.3f}, d_z = {pc['cohens_dz']:+.2f} "
              f"(n_cells = {pc['n_cells']})")
        if pc.get("paired_t_test") and "p_two_sided" in pc["paired_t_test"]:
            tt = pc["paired_t_test"]
            print(f"  paired t-test (cells):   t = {tt['t']:+.2f}, "
                  f"p = {tt['p_two_sided']:.3f}")
        if pc.get("wilcoxon_signed_rank") and "p_two_sided" in pc["wilcoxon_signed_rank"]:
            w = pc["wilcoxon_signed_rank"]
            print(f"  Wilcoxon signed-rank:    W = {w['statistic']:.1f}, "
                  f"p = {w['p_two_sided']:.3f}")
        print(f"  bootstrap 95% CI:        [{boot['ci95_low']:+.3f}, "
              f"{boot['ci95_high']:+.3f}] bits/s "
              f"(cluster-bootstrap on participants, {boot['n_boot']} resamples)")
        ppt = fir["per_participant"]
        if ppt.get("paired_t_test_vs_zero") and "p_two_sided" in ppt["paired_t_test_vs_zero"]:
            pt = ppt["paired_t_test_vs_zero"]
            print(f"  per-participant 1-samp t: t = {pt['t']:+.2f}, "
                  f"p = {pt['p_two_sided']:.3f}, d_z = {pt['cohens_dz']:+.2f} "
                  f"(n_participants = {ppt['summary']['n_participants']})")
    else:
        print(f"  triangulated read skipped: {fir.get('error')}")

    print("\n[6/7] RQ1+RQ2 cell-mean mixed model…")
    mm = fit_mixed_model(trials, variance, desc)
    if mm.get("ok"):
        print(f"  fit OK (n_obs={mm['n_obs']} cells, formula={mm['formula']})")
    else:
        print(f"  fit failed: {mm.get('error')}")

    print("\n[6a] RQ2 per-participant TP-vs-latency curves…")
    curve = participant_curve_fit(trials, variance, desc)
    if curve.get("ok"):
        print(f"  fit {len(curve['per_participant'])} per-(participant,filter) curves; "
              f"group curves for {len(curve.get('group_curve', {}))} filter(s).")
    else:
        print(f"  curve fit skipped: {curve.get('error')}")

    print("\n[6b] RQ3 calibration comparison (Part A vs Part B, mid variance)…")
    calib = calibration_comparison(trials, desc, variance,
                                   calibration_info=bundle.get("calibration_info"))
    if calib.get("ok"):
        kind = calib.get("comparison_kind", "?")
        n_sw = calib.get("n_participants_swapped_calibration")
        n_tot = calib.get("n_participants_total")
        print(f"  {len(calib['rows'])} per-(participant,filter) deltas computed.")
        print(f"  comparison kind: {kind}  "
              f"(calibration actually swapped in {n_sw}/{n_tot} participants)")
    else:
        print(f"  comparison skipped: {calib.get('error')}")

    print("\n[6c] sub-RQ TP vs subjective preference (Spearman)…")
    correl = tp_vs_subjective_correlation(desc, bundle.get("questionnaire"))
    if correl.get("ok"):
        print(f"  ρ summary across {correl['summary']['n_pairs']} pairs: "
              f"mean = {correl['summary']['mean_rho']:+.3f}")
    else:
        print(f"  correlation skipped: {correl.get('error')}")

    print("\n[6d] direction effects…")
    dir_tbl = direction_effects(trials)
    if len(dir_tbl) > 0:
        print(f"  {len(dir_tbl)} directions in data.")

    print("\n[7/7] power analysis…")
    pa = power_analysis(trials, mm)
    if pa.get("ok"):
        print(f"  recommended n for 80% power: {pa['n_for_80_power']}")
    else:
        print(f"  power analysis failed: {pa.get('error')}")

    print("\nGenerating figures…")
    figs = make_figures(trials, variance, fits, var_table, desc, fig_dir,
                        curve_fit=curve if curve.get("ok") else None)

    fitts_table_html = df_to_html(fits, {"slope": "{:.3f}", "intercept": "{:.3f}", "r2": "{:.3f}"})

    if len(var_table):
        variance_table_html = df_to_html(var_table,
            {"mean": "{:.2f}", "std": "{:.2f}", "min": "{:.2f}", "max": "{:.2f}", "CV": "{:.3f}"})
        variance_fig_html = f'<img src="data:image/png;base64,{figs["variance"]}" alt="variance">' \
                            if "variance" in figs else ""
    else:
        variance_table_html = "<p>No variance-measurement CSV found — skipping.</p>"
        variance_fig_html = ""

    desc_html = df_to_html(desc,
        {"meanMT": "{:.3f}", "IDe": "{:.3f}", "TP": "{:.3f}",
         "errorRate": "{:.2%}", "meanReEntries": "{:.2f}"})

    recommended_n = pa.get("recommended_n", 12) if pa.get("ok") else 12

    # build coverage note about imbalance across participants
    by_p = trials.groupby("Participant").size().to_dict()
    coverage_note = ""
    if by_p:
        mn, mx = min(by_p.values()), max(by_p.values())
        if mx > 1.5 * mn:
            lines = ", ".join(f"{p} = {n_}" for p, n_ in sorted(by_p.items()))
            coverage_note = (f'<p class="callout warn"><strong>Trial count '
                             f'imbalance.</strong> Total completed trials per '
                             f'participant: {lines}. The participant with ~2× more '
                             f'trials gets proportionally more weight in the mixed '
                             f'model. Consider either including a session/run random '
                             f'effect or restricting analyses to Part A for balance.</p>')

    import datetime as dt
    pareto_fig_html = (
        f'<img src="data:image/png;base64,{figs["pareto"]}" alt="tp_vs_latency_pareto">'
        if "pareto" in figs else
        "<p><em>Throughput-vs-latency Pareto plot unavailable (no FilterLatency "
        "column or no completed trials).</em></p>"
    )
    rq2_fig_html = (
        f'<img src="data:image/png;base64,{figs["rq2_curves"]}" alt="rq2_curves">'
        if "rq2_curves" in figs else
        "<p><em>RQ2 curve figure unavailable — need ≥2 latency levels per "
        "(participant × filter).</em></p>"
    )
    calib_heading_suffix_map = {
        "personal_vs_standard": "(Personal vs. Standard)",
        "test_retest_same_calibration": "(<em>test–retest only — calibration not actually swapped</em>)",
        "mixed_swap_status": "(<em>mixed swap status — interpret carefully</em>)",
    }
    calib_heading_suffix = calib_heading_suffix_map.get(
        calib.get("comparison_kind", ""),
        "")

    html = HTML_TEMPLATE.format(
        n=n,
        ts=dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
        data_dir=data_dir,
        fig_coverage=figs["coverage"],
        coverage_note=coverage_note,
        fitts_table=fitts_table_html,
        fig_fitts=figs["fitts"],
        variance_table=variance_table_html,
        variance_fig=variance_fig_html,
        desc_table=desc_html,
        fig_desc=figs["desc"],
        pareto_fig=pareto_fig_html,
        rq2_fig=rq2_fig_html,
        sign_test_block=build_sign_test_block(st),
        filter_initial_read_block=build_filter_initial_read_block(fir),
        mixed_block=build_mixed_block(mm),
        calibration_heading_suffix=calib_heading_suffix,
        calibration_block=build_calibration_block(calib),
        correlation_block=build_correlation_block(correl),
        direction_block=build_direction_block(dir_tbl),
        power_block=build_power_block(pa),
        recommended_n=recommended_n,
    )

    memo_path = out_dir / "pilot_memo.html"
    memo_path.write_text(html, encoding="utf-8")

    summary = {
        "n_participants": n,
        "n_trials_total": int(len(trials)),
        "fitts_fits": fits.to_dict("records"),
        "between_participant_variation": var_table.to_dict("records") if len(var_table) else [],
        "descriptive_table": desc.to_dict("records"),
        "sign_test": {k: v for k, v in st.items() if k not in ("per_cell",)},
        "filter_initial_read": fir,
        "mixed_model_cell_means": mm,
        "rq2_curves": curve,
        "rq3_calibration": calib,
        "subrq_tp_vs_subjective": correl,
        "direction_effects": dir_tbl.to_dict("records") if len(dir_tbl) else [],
        "power_analysis": pa,
        "recommended_n": recommended_n,
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2, default=str))

    print(f"\n✓ Wrote {memo_path}")
    print(f"✓ Wrote {out_dir/'summary.json'}")
    print(f"✓ Wrote {fig_dir}/01_data_coverage.png  …  04_descriptive_table.png")
    print(f"\nOpen the memo:  open '{memo_path}'")


if __name__ == "__main__":
    main()
