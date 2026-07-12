#!/usr/bin/env python3
"""
Four-Participant Pilot Analysis
================================
Participants: P05 (Professor), P07 (Aashritha), P08 (Marzia), P10 (Soha)

Professor ran 2 blocks per condition (192 trials); others ran 1 block (96 trials).
Strategy: average Professor's two blocks per (Pair × Filter × TargetSize) cell,
producing one TP value per cell for everyone — equal footing.

Uses the pre-computed fitts-results CSVs (TP, MT, We, etc. already calculated
by the app), so no re-derivation of Fitts metrics from raw trials.

Output:
  - four_pilot_summary.json  : full numbers
  - four_pilot_report.txt    : readable text report
"""

import csv
import json
import math
import os
import warnings
from collections import defaultdict
from pathlib import Path

import numpy as np

warnings.filterwarnings("ignore")

# ── paths ────────────────────────────────────────────────────────────────────
# Resolve BASE relative to where the script is called from (cwd), not __file__
_CWD = Path(os.getcwd())
# If called from pilot-analysis/, go up one level; otherwise use absolute fallback
if (_CWD / "pilot-data").exists():
    BASE = _CWD / "pilot-data"
elif (_CWD.parent / "pilot-data").exists():
    BASE = _CWD.parent / "pilot-data"
else:
    # hardcoded fallback for sandbox
    BASE = Path("/sessions/charming-adoring-archimedes/mnt/head-control-website-js/pilot-data")

OUT = _CWD / "output"
OUT.mkdir(exist_ok=True)

PARTICIPANTS = {
    "P05": {"folder": "Professor",  "double_block": True},
    "P07": {"folder": "Aashritha", "double_block": False},
    "P08": {"folder": "Marzia",    "double_block": False},
    "P10": {"folder": "Soha",      "double_block": False},
}

PAIR_LABEL = {"1": "Low SD", "2": "Med SD", "3": "High SD"}

# ── loader ───────────────────────────────────────────────────────────────────
def load_results_csv(path: Path) -> list[dict]:
    with open(path, newline="") as f:
        return list(csv.DictReader(f))

def find_results(folder: Path, part_tag: str) -> Path | None:
    """Find the fitts-results CSV for the given part (partA / partB)."""
    for p in sorted(folder.glob("*.csv")):
        if "results" in p.name.lower() and part_tag.lower() in p.name.lower():
            return p
    return None

def load_participant_cells(pid: str, info: dict) -> list[dict]:
    """
    Return a list of dicts, one per (PairNumber, FilterType, TargetSize),
    with averaged TP / MT / We / Latency / SD for Part A.

    For Professor (double_block=True): average the 2 repeated rows.
    For others: pass through directly.
    """
    folder = BASE / info["folder"]
    path = find_results(folder, "partA")
    if path is None:
        # try without partA prefix (Soha folder uses different naming)
        candidates = [p for p in sorted(folder.glob("*.csv"))
                      if "results" in p.name.lower() and "partB" not in p.name]
        path = candidates[0] if candidates else None
    if path is None:
        print(f"  ✗ {pid}: no Part A results CSV found")
        return []

    rows = load_results_csv(path)
    print(f"  ✓ {pid}: loaded {len(rows)} result rows from {path.name}")

    # Group by (PairNumber, FilterType, TargetSize) and average numeric cols
    groups = defaultdict(list)
    for r in rows:
        key = (r["PairNumber"], r["FilterType"], r["TargetSize"])
        groups[key].append(r)

    cells = []
    for (pair, filt, size), rlist in groups.items():
        if len(rlist) > 1 and not info["double_block"]:
            print(f"    ! {pid}: unexpected {len(rlist)} rows for Pair{pair}/{filt}/{size} — averaging anyway")

        def avg(col):
            vals = [float(r[col]) for r in rlist if col in r and r[col] not in ("", None)]
            return sum(vals) / len(vals) if vals else float("nan")

        cells.append({
            "Participant": pid,
            "PairNumber":  pair,
            "FilterType":  filt,
            "TargetSize":  float(size),
            "FilterLatency_ms": avg("FilterLatency"),
            "FilterSD_px":     avg("FilterVariance_px"),
            "TP":              avg("TP"),
            "MeanMT_s":        avg("MeanMT"),
            "We_px":           avg("We"),
            "IDe":             avg("IDe"),
            "MeanReEntries":   avg("MeanReEntries"),
            "CompletionRate":  avg("CompletionRate"),
            "PairDescription": rlist[0].get("PairDescription", ""),
            "n_blocks_averaged": len(rlist),
        })
    return cells


# ── load variance-measurement (measured SD during task) ─────────────────────
def load_variance(pid: str, info: dict) -> dict:
    """Return dict keyed by (PairNumber, FilterType) → MeasuredSD_px."""
    folder = BASE / info["folder"]
    candidates = [p for p in sorted(folder.glob("*.csv"))
                  if "variance" in p.name.lower() and "partB" not in p.name]
    if not candidates:
        return {}
    rows = load_results_csv(candidates[0])
    out = {}
    for r in rows:
        key = (r.get("PairNumber","?"), r.get("FilterType","?"))
        val_str = r.get("MeasuredVariance_px", "")
        if val_str not in ("", None):
            vals = out.setdefault(key, [])
            vals.append(float(val_str))
    return {k: sum(v)/len(v) for k, v in out.items()}


# ── load Part B (standard calibration) ──────────────────────────────────────
def load_partB_cells(pid: str, info: dict) -> list[dict]:
    folder = BASE / info["folder"]
    path = find_results(folder, "partB")
    if path is None:
        return []
    rows = load_results_csv(path)
    groups = defaultdict(list)
    for r in rows:
        key = (r["PairNumber"], r["FilterType"], r["TargetSize"])
        groups[key].append(r)
    cells = []
    for (pair, filt, size), rlist in groups.items():
        def avg(col):
            vals = [float(r[col]) for r in rlist if col in r and r[col] not in ("", None)]
            return sum(vals)/len(vals) if vals else float("nan")
        cells.append({
            "Participant": pid, "PairNumber": pair, "FilterType": filt,
            "TargetSize": float(size), "FilterLatency_ms": avg("FilterLatency"),
            "FilterSD_px": avg("FilterVariance_px"), "TP": avg("TP"),
            "MeanMT_s": avg("MeanMT"), "Part": "Part B",
        })
    return cells


# ── descriptive table ────────────────────────────────────────────────────────
def descriptive_table(all_cells: list[dict]) -> None:
    print("\n" + "="*80)
    print("DESCRIPTIVE TABLE — TP by Participant × Pair × Filter (averaged over target sizes)")
    print("="*80)
    print(f"{'Participant':12s} {'Pair':8s} {'Filter':12s} {'Latency(ms)':12s} {'SD(px)':8s} {'TP':7s}")
    print("-"*65)

    # average over target sizes first
    from collections import defaultdict
    agg = defaultdict(list)
    lat = {}
    sd  = {}
    for c in all_cells:
        key = (c["Participant"], c["PairNumber"], c["FilterType"])
        agg[key].append(c["TP"])
        lat[key] = c["FilterLatency_ms"]
        sd[key]  = c["FilterSD_px"]

    for (pid, pair, filt), tps in sorted(agg.items()):
        mean_tp = sum(tps)/len(tps)
        print(f"{pid:12s} {PAIR_LABEL.get(str(pair), pair):8s} {filt:12s} "
              f"{lat[(pid,pair,filt)]:12.1f} {sd[(pid,pair,filt)]:8.2f} {mean_tp:7.4f}")
    print()


# ── crossover / filter winner analysis ──────────────────────────────────────
def filter_winner_table(all_cells: list[dict]) -> dict:
    """For each (Participant, Pair), which filter has higher TP?"""
    from collections import defaultdict
    by_key = defaultdict(dict)
    for c in all_cells:
        key = (c["Participant"], c["PairNumber"])
        filt = c["FilterType"]
        tp_vals = by_key[key].setdefault(filt, [])
        tp_vals.append(c["TP"])

    results = {}
    print("\n" + "="*80)
    print("FILTER WINNER — TP(OneEuro) vs TP(Exponential) per Participant × Variance Level")
    print("="*80)
    print(f"{'Participant':12s} {'Pair':8s} {'OE_TP':7s} {'Exp_TP':7s} {'Delta(OE-Exp)':14s} {'Winner':10s}")
    print("-"*65)

    oe_wins = 0
    exp_wins = 0
    comparisons = 0

    for (pid, pair), filts in sorted(results.items() if False else by_key.items()):
        oe_tps  = filts.get("oneEuro", [float("nan")])
        exp_tps = filts.get("exponential", [float("nan")])
        oe  = sum(oe_tps)/len(oe_tps)
        exp = sum(exp_tps)/len(exp_tps)
        delta = oe - exp
        winner = "OneEuro" if delta > 0 else "Exponential"
        print(f"{pid:12s} {PAIR_LABEL.get(str(pair), pair):8s} {oe:7.4f} {exp:7.4f} {delta:+14.4f} {winner:10s}")
        results[(pid, pair)] = {"oe": oe, "exp": exp, "delta": delta, "winner": winner}
        if delta > 0: oe_wins += 1
        else: exp_wins += 1
        comparisons += 1

    print(f"\nOneEuro wins: {oe_wins}/{comparisons}  |  Exponential wins: {exp_wins}/{comparisons}")

    # Sign test
    k = oe_wins
    n = comparisons
    p_sign = sum(math.comb(n, i) for i in range(k, n+1)) / (2**n) if n > 0 else float("nan")
    print(f"Sign test (H0: OE = Exp): k={k}, n={n}, p(one-sided)={p_sign:.4f}")

    # Per-pair breakdown
    print("\nPer-variance-level summary:")
    for pair_label in ["Low SD", "Med SD", "High SD"]:
        subset = {(pid, p): v for (pid, p), v in results.items()
                  if PAIR_LABEL.get(str(p), p) == pair_label}
        if not subset:
            continue
        oe_better = sum(1 for v in subset.values() if v["delta"] > 0)
        mean_delta = sum(v["delta"] for v in subset.values()) / len(subset)
        print(f"  {pair_label}: OE better {oe_better}/{len(subset)}, mean delta={mean_delta:+.4f}")

    return results


# ── mixed-effects model ──────────────────────────────────────────────────────
def mixed_model(all_cells: list[dict]) -> dict:
    try:
        import statsmodels.formula.api as smf
        import pandas as pd
    except ImportError:
        print("\n[Mixed model skipped: statsmodels not installed]")
        return {}

    df = pd.DataFrame(all_cells)
    # Average over target sizes → one row per (Participant, Pair, Filter)
    cell_means = (df.groupby(["Participant", "PairNumber", "FilterType"])
                    .agg(TP=("TP", "mean"),
                         FilterLatency_ms=("FilterLatency_ms", "mean"),
                         FilterSD_px=("FilterSD_px", "mean"),
                         IDe=("IDe", "mean"))
                    .reset_index())

    cell_means["filter_oe"] = (cell_means["FilterType"] == "oneEuro").astype(int)
    cell_means["log_latency"] = np.log(cell_means["FilterLatency_ms"].clip(lower=1))
    cell_means = cell_means.dropna(subset=["TP", "filter_oe", "FilterLatency_ms"])

    print("\n" + "="*80)
    print("MIXED-EFFECTS MODEL — TP ~ filter_oe * log(Latency) + IDe + (1|Participant)")
    print(f"Cell means: {len(cell_means)} obs from {cell_means['Participant'].nunique()} participants")
    print("="*80)

    formula = "TP ~ filter_oe * log_latency + IDe"
    try:
        md = smf.mixedlm(formula, cell_means, groups=cell_means["Participant"])
        res = md.fit(method="lbfgs", reml=True)
        print(res.summary())

        fe = res.fe_params.to_dict()
        pv = res.pvalues.to_dict()
        re_var = float(res.cov_re.iloc[0, 0]) if res.cov_re.size > 0 else float("nan")
        return {
            "formula": formula,
            "n_obs": len(cell_means),
            "n_participants": int(cell_means["Participant"].nunique()),
            "fixed_effects": fe,
            "p_values": pv,
            "between_participant_sd": float(np.sqrt(re_var)) if re_var > 0 else 0.0,
            "residual_sd": float(np.sqrt(res.scale)),
        }
    except Exception as e:
        print(f"Model failed: {e}")
        return {"error": str(e)}


# ── calibration comparison (RQ3) ─────────────────────────────────────────────
def calibration_comparison(partA_cells: list[dict], partB_cells: list[dict]) -> dict:
    """Personal (Part A, Pair 2) vs Standard (Part B, Pair 2) TP."""
    print("\n" + "="*80)
    print("CALIBRATION COMPARISON (RQ3) — Personal vs Standard at Medium Variance (Pair 2)")
    print("="*80)

    # Average over target sizes
    def agg_tp(cells, pair="2"):
        from collections import defaultdict
        d = defaultdict(list)
        for c in cells:
            if str(c["PairNumber"]) == str(pair):
                d[(c["Participant"], c["FilterType"])].append(c["TP"])
        return {k: sum(v)/len(v) for k, v in d.items()}

    personal = agg_tp(partA_cells)
    standard = agg_tp(partB_cells)

    all_pids = sorted(set(pid for pid, _ in personal) | set(pid for pid, _ in standard))
    deltas = []
    print(f"{'Participant':12s} {'Filter':12s} {'Personal_TP':12s} {'Standard_TP':12s} {'Delta':8s}")
    print("-"*58)
    for pid in all_pids:
        for filt in ["oneEuro", "exponential"]:
            pers = personal.get((pid, filt), float("nan"))
            std  = standard.get((pid, filt), float("nan"))
            delta = pers - std if not math.isnan(pers) and not math.isnan(std) else float("nan")
            print(f"{pid:12s} {filt:12s} {pers:12.4f} {std:12.4f} {delta:+8.4f}")
            if not math.isnan(delta):
                deltas.append(delta)

    if deltas:
        mean_d = sum(deltas)/len(deltas)
        print(f"\nMean delta (personal − standard): {mean_d:+.4f}  (n={len(deltas)} pairs)")
        n_pos = sum(1 for d in deltas if d > 0)
        print(f"Personal better: {n_pos}/{len(deltas)}")
    return {"mean_delta": mean_d if deltas else float("nan"), "n_pairs": len(deltas)}


# ── data quality flags ────────────────────────────────────────────────────────
def quality_flags(all_cells: list[dict]) -> None:
    print("\n" + "="*80)
    print("DATA QUALITY FLAGS")
    print("="*80)
    # Average over target sizes so each (Participant, Pair, Filter) appears once
    from collections import defaultdict
    agg = defaultdict(lambda: defaultdict(list))
    for c in all_cells:
        key = (c["Participant"], c["PairNumber"], c["FilterType"])
        for col in ["FilterLatency_ms", "FilterSD_px", "MeanReEntries", "CompletionRate"]:
            if not math.isnan(c.get(col, float("nan"))):
                agg[key][col].append(c[col])
    deduped = []
    for key, cols in agg.items():
        pid, pair, filt = key
        deduped.append({
            "Participant": pid, "PairNumber": pair, "FilterType": filt,
            "FilterLatency_ms": sum(cols["FilterLatency_ms"])/len(cols["FilterLatency_ms"]) if cols["FilterLatency_ms"] else float("nan"),
            "FilterSD_px":  sum(cols["FilterSD_px"])/len(cols["FilterSD_px"])  if cols["FilterSD_px"]  else float("nan"),
            "MeanReEntries": sum(cols["MeanReEntries"])/len(cols["MeanReEntries"]) if cols["MeanReEntries"] else float("nan"),
            "CompletionRate": sum(cols["CompletionRate"])/len(cols["CompletionRate"]) if cols["CompletionRate"] else float("nan"),
        })
    flags = []
    for c in deduped:
        pid, pair, filt = c["Participant"], c["PairNumber"], c["FilterType"]
        lat = c["FilterLatency_ms"]
        sd  = c["FilterSD_px"]
        re  = c["MeanReEntries"]
        cr  = c["CompletionRate"]

        issues = []
        if lat > 600:
            issues.append(f"Latency={lat:.0f}ms >600ms cap")
        if lat < 50:
            issues.append(f"Latency={lat:.1f}ms <50ms (barely filtering)")
        if re > 5:
            issues.append(f"ReEntries={re:.1f} (high)")
        if cr < 0.9:
            issues.append(f"CompletionRate={cr:.0%}")
        if sd > 50:
            issues.append(f"SD={sd:.1f}px (very high jitter)")

        if issues:
            label = PAIR_LABEL.get(str(pair), pair)
            print(f"  {pid} | {label} | {filt:12s} | {'; '.join(issues)}")
            flags.append({"Participant": pid, "Pair": pair, "Filter": filt, "issues": issues})

    if not flags:
        print("  No major flags.")
    return flags


# ── between-participant CV ────────────────────────────────────────────────────
def between_participant_cv(all_cells: list[dict], var_data: dict) -> None:
    """Show how much cursor SD varies across participants at the same filter params."""
    print("\n" + "="*80)
    print("BETWEEN-PARTICIPANT VARIATION IN CURSOR SD")
    print("Justifies personal calibration: same Pareto-front params → different SD per person")
    print("="*80)

    # Deduplicate by (Participant, Pair, Filter) first (average over target sizes)
    from collections import defaultdict
    seen = {}
    for c in all_cells:
        key = (c["Participant"], c["PairNumber"], c["FilterType"])
        if key not in seen:
            seen[key] = c["FilterSD_px"]

    by_pair_filt = defaultdict(list)
    for (pid, pair, filt), sd in seen.items():
        by_pair_filt[(pair, filt)].append((pid, sd))

    print(f"{'Pair':8s} {'Filter':12s} {'Mean SD':8s} {'Min SD':8s} {'Max SD':8s} {'CV':6s}  Participants")
    print("-"*72)
    for (pair, filt), items in sorted(by_pair_filt.items()):
        sds = [sd for _, sd in items]
        mean_sd = sum(sds)/len(sds)
        cv = (max(sds)-min(sds))/mean_sd if mean_sd > 0 else float("nan")
        parts = ", ".join(f"{pid}={sd:.1f}" for pid, sd in items)
        print(f"{PAIR_LABEL.get(str(pair), pair):8s} {filt:12s} {mean_sd:8.2f} "
              f"{min(sds):8.2f} {max(sds):8.2f} {cv:6.2f}  [{parts}]")


# ── main ──────────────────────────────────────────────────────────────────────
def main():
    print("\n" + "="*80)
    print("FOUR-PARTICIPANT PILOT ANALYSIS")
    print("P05 Professor | P07 Aashritha | P08 Marzia | P10 Soha")
    print("Strategy: average Professor's 2 blocks → equal footing with others (1 block each)")
    print("="*80 + "\n")

    all_cells_A = []
    all_cells_B = []
    var_data    = {}

    for pid, info in PARTICIPANTS.items():
        cells = load_participant_cells(pid, info)
        all_cells_A.extend(cells)
        b_cells = load_partB_cells(pid, info)
        all_cells_B.extend(b_cells)
        var_data[pid] = load_variance(pid, info)

    print(f"\nLoaded {len(all_cells_A)} Part-A cell-level entries "
          f"({len(all_cells_A)//12 if all_cells_A else 0} expected per participant × 12 conditions)")

    # Analyses
    descriptive_table(all_cells_A)
    winner_results = filter_winner_table(all_cells_A)
    quality_flags(all_cells_A)
    between_participant_cv(all_cells_A, var_data)
    model_results = mixed_model(all_cells_A)
    calib_results = calibration_comparison(all_cells_A, all_cells_B)

    # Save JSON
    summary = {
        "participants": list(PARTICIPANTS.keys()),
        "n_participants": len(PARTICIPANTS),
        "professor_treatment": "averaged 2 blocks per condition",
        "filter_winner": {str(k): v for k, v in winner_results.items()},
        "mixed_model": model_results,
        "calibration_comparison": calib_results,
    }
    out_path = OUT / "four_pilot_summary.json"
    with open(out_path, "w") as f:
        json.dump(summary, f, indent=2, default=str)
    print(f"\n✓ Summary saved to {out_path}")


if __name__ == "__main__":
    main()
