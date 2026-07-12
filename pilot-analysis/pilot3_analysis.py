"""Pilot 3 analysis — three new participants (P19 Amelie, P20 Valerie, P21 Jesus).

Implements the plot set Roberto asked for in the June 17 meeting:
  - Plot the REAL throughput values, not just the One Euro - Exponential difference
  - Throughput vs each participant's ACTUAL variance (sigma), not low/med/high bins
  - Throughput vs each participant's ACTUAL latency (filters are matched per pair,
    but the achieved latency differs, so plot against the real axis)
  - Latency vs jitter (variance) per participant
  - Per-participant overlays so the between-participant spread at the same nominal
    settings is visible (the calibration-matters argument)

Stats mirror the pilot 1 / pilot 2 reports:
  Method 1: Bootstrap CI over participants (10,000 resamples)
  Method 2: Per-participant one-sample t-test
  Method 3: Mixed model log(MT) ~ filter*SD + ID + (1|participant)
Plus: crossover by latency level, measured variance spread, Part A/B calibration audit.
"""
import csv, io, os, subprocess, warnings
import numpy as np
from scipy import stats
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
warnings.filterwarnings("ignore")

BASE = "/Users/soha/head-control-website-js/pilot data 2/pilot data -2 - latency "
OUTDIR = "/Users/soha/head-control-website-js/pilot-analysis/pilot3_figures"
os.makedirs(OUTDIR, exist_ok=True)

# participant -> (folder, personal zip, standard zip, timestamp-in-filename)
SRC = {
    "Amelie (P19)": (
        "Amelie",
        "fitts-personal-calibration-P19-2026-06-16T17_25_11.839Z.zip",
        "fitts-standard-calibration-P19-2026-06-16T17_25_11.839Z.zip",
        "2026-06-16T17:25:11.839Z",
    ),
    "Valerie (P20)": (
        "Valerie",
        "fitts-personal-calibration-P20-2026-06-16T17_45_21.003Z (2).zip",
        "fitts-standard-calibration-P20-2026-06-16T17_45_21.003Z (2).zip",
        "2026-06-16T17:45:21.003Z",
    ),
    "Jesus (P21)": (
        "Jesus",
        "fitts-personal-calibration-P21-2026-06-16T17_29_17.388Z (2).zip",
        "fitts-standard-calibration-P21-2026-06-16T17_29_17.388Z (1).zip",
        "2026-06-16T17:29:17.388Z",
    ),
}

FILTER_COLORS = {"oneEuro": "#1f77b4", "exponential": "#d62728"}
FILTER_LABEL = {"oneEuro": "One Euro", "exponential": "Exponential"}


def get_csv(zip_path, inner):
    r = subprocess.run(["unzip", "-p", zip_path, inner], capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        return []
    return list(csv.DictReader(io.StringIO(r.stdout)))


def get_text(zip_path, inner):
    r = subprocess.run(["unzip", "-p", zip_path, inner], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else ""


def sf(v, d=np.nan):
    try:
        return float(v)
    except Exception:
        return d


def cell_ok(r):
    return sf(r.get("CompletionRate")) > 0.5 and sf(r.get("TP")) > 0.01


# ---------------------------------------------------------------- load data
resultsA, resultsB, raws, variances, infoA, infoB, quest = {}, {}, {}, {}, {}, {}, {}
for p, (folder, za, zb, ts) in SRC.items():
    zpa = f"{BASE}/{folder}/{za}"
    zpb = f"{BASE}/{folder}/{zb}"
    resultsA[p] = get_csv(zpa, f"fitts-results-{ts}.csv")
    resultsB[p] = get_csv(zpb, f"fitts-results-{ts}.csv")
    raws[p] = get_csv(zpa, f"fitts-raw-data-{ts}.csv")
    variances[p] = get_csv(zpa, f"fitts-variance-measurement-{ts}.csv")
    quest[p] = get_csv(zpa, f"fitts-mini-questionnaire-{ts}.csv")
    infoA[p] = get_text(zpa, "info.txt")
    infoB[p] = get_text(zpb, "info.txt")


# build a tidy per-cell table from Part A (one row per participant/filter/pair/targetsize)
def tidy(results_map):
    recs = []
    for p, rows in results_map.items():
        for r in rows:
            if not cell_ok(r):
                continue
            recs.append(
                dict(
                    participant=p,
                    filt=r["FilterType"],
                    pair=int(sf(r.get("PairNumber"), 0)),
                    variance_px=sf(r.get("FilterVariance_px")),
                    latency_ms=sf(r.get("FilterLatency")),
                    target=sf(r.get("TargetSize")),
                    TP=sf(r.get("TP")),
                    MT=sf(r.get("MeanMT")),
                    IDe=sf(r.get("IDe")),
                    part=r.get("Part", "Part A"),
                )
            )
    return pd.DataFrame(recs)


dfA = tidy(resultsA)

# per (participant, filter, pair): mean throughput / latency / variance over target sizes
cell = (
    dfA.groupby(["participant", "filt", "pair"])
    .agg(
        TP=("TP", "mean"),
        latency_ms=("latency_ms", "mean"),
        variance_px=("variance_px", "mean"),
    )
    .reset_index()
)

# ---------------------------------------------------------------- audit
print("=" * 74)
print("  0. CALIBRATION AUDIT (did Part B actually use STANDARD calibration?)")
print("=" * 74)
for p in SRC:
    def grab(txt, key):
        for line in txt.splitlines():
            if line.startswith(key):
                return line.split(":", 1)[1].strip()
        return "?"
    print(f"  {p:14s}  PartA={grab(infoA[p],'Calibration Type'):20s}"
          f"  PartB={grab(infoB[p],'Calibration Type'):20s}"
          f"  (B trials: {grab(infoB[p],'Trials Completed')})")

# ---------------------------------------------------------------- overall winner
print("\n" + "=" * 74)
print("  1. PER-PARTICIPANT OVERALL THROUGHPUT (Part A, One Euro - Exponential)")
print("=" * 74)
diffs = {}
for p in SRC:
    oe = cell[(cell.participant == p) & (cell.filt == "oneEuro")].TP.mean()
    ex = cell[(cell.participant == p) & (cell.filt == "exponential")].TP.mean()
    diffs[p] = oe - ex
    print(f"  {p:14s}: Exp={ex:.3f}  OE={oe:.3f}  diff={oe-ex:+.3f}  "
          f"winner: {'One Euro' if oe > ex else 'Exponential'}")
d = np.array(list(diffs.values()))
print(f"\n  Mean diff across {len(d)} participants = {d.mean():+.4f} bits/s")

# ---------------------------------------------------------------- stats
print("\n" + "=" * 74)
print("  2. THREE CONVERGENT TESTS (filter main effect)")
print("=" * 74)
rng = np.random.default_rng(42)
boot = np.array([rng.choice(d, len(d), replace=True).mean() for _ in range(10000)])
lo, hi = np.percentile(boot, [2.5, 97.5])
print(f"  Bootstrap 95% CI(OE-Exp) = [{lo:+.3f}, {hi:+.3f}] bits/s  "
      f"(zero inside? {'YES -> no clear winner' if lo <= 0 <= hi else 'NO'})")
t, pv = stats.ttest_1samp(d, 0)
print(f"  Per-participant 1-sample t-test: t={t:.3f}  p={pv:.3f}")

recs = []
for p, rows in raws.items():
    for r in rows:
        if r.get("Status") != "completed":
            continue
        mt, A, W = sf(r.get("MovementTime")), sf(r.get("Amplitude")), sf(r.get("TargetSize"))
        sd = sf(r.get("FilterVariance_px"))
        if not (mt > 0 and A > 0 and W > 0 and sd > 0):
            continue
        recs.append(dict(participant=p, filt=r["FilterType"], logmt=np.log(mt),
                         ID=np.log2(2 * A / W), sd=sd))
dfm = pd.DataFrame(recs)
try:
    import statsmodels.formula.api as smf
    m = smf.mixedlm("logmt ~ C(filt)*sd + ID", dfm, groups=dfm["participant"]).fit()
    c = m.params.get("C(filt)[T.oneEuro]", np.nan)
    pvm = m.pvalues.get("C(filt)[T.oneEuro]", np.nan)
    print(f"  Mixed model One Euro main effect (log MT): coef={c:+.4f}  p={pvm:.3f}  (neg = OE faster)")
    ix = "C(filt)[T.oneEuro]:sd"
    if ix in m.params:
        print(f"  filter x variance interaction (crossover term): "
              f"coef={m.params[ix]:+.5f}  p={m.pvalues[ix]:.3f}")
except Exception as e:
    print("  LMM failed:", e)

# ---------------------------------------------------------------- crossover
print("\n" + "=" * 74)
print("  3. CROSSOVER — One Euro advantage by latency level (pair 1=low var/high lat ...)")
print("=" * 74)
for p in SRC:
    sub = cell[cell.participant == p]
    out = []
    for pn in sorted(sub.pair.unique()):
        oe = sub[(sub.pair == pn) & (sub.filt == "oneEuro")].TP
        ex = sub[(sub.pair == pn) & (sub.filt == "exponential")].TP
        if len(oe) and len(ex):
            lat = sub[sub.pair == pn].latency_ms.mean()
            out.append(f"pair{pn}(~{lat:.0f}ms): {oe.values[0]-ex.values[0]:+.3f}")
    print(f"  {p:14s}: " + "   ".join(out))

# ---------------------------------------------------------------- variance spread
print("\n" + "=" * 74)
print("  4. MEASURED CURSOR JITTER AT SAME NOMINAL SETTINGS (calibration argument)")
print("=" * 74)
spread = {}
for p, rows in variances.items():
    for r in rows:
        pn = r.get("PairNumber")
        mv = sf(r.get("MeasuredVariance_px"))
        spread.setdefault(pn, []).append(mv)
for pn in sorted(spread):
    vals = [v for v in spread[pn] if not np.isnan(v)]
    if vals:
        print(f"  pair {pn}: measured SD {min(vals):.1f} - {max(vals):.1f} px "
              f"({max(vals)/max(min(vals),1e-9):.1f}x spread across participants/filters)")

# ================================================================ FIGURES
parts = list(SRC.keys())


def per_participant_panels(xcol, xlabel, fname, title):
    fig, axes = plt.subplots(1, len(parts), figsize=(5 * len(parts), 4.2), sharey=True)
    if len(parts) == 1:
        axes = [axes]
    for ax, p in zip(axes, parts):
        sub = cell[cell.participant == p]
        for filt in ["oneEuro", "exponential"]:
            s = sub[sub.filt == filt].sort_values(xcol)
            ax.plot(s[xcol], s.TP, "o-", color=FILTER_COLORS[filt],
                    label=FILTER_LABEL[filt], markersize=7, linewidth=2)
        ax.set_title(p)
        ax.set_xlabel(xlabel)
        ax.grid(alpha=0.3)
    axes[0].set_ylabel("Throughput (bits/s)")
    axes[0].legend()
    fig.suptitle(title, fontsize=13, fontweight="bold")
    fig.tight_layout(rect=[0, 0, 1, 0.95])
    fig.savefig(f"{OUTDIR}/{fname}", dpi=130)
    plt.close(fig)
    print(f"  saved {fname}")


print("\n" + "=" * 74)
print("  5. GENERATING FIGURES (Roberto's requested set)")
print("=" * 74)

# Fig 1: throughput vs ACTUAL variance (sigma) — real values, per participant
per_participant_panels(
    "variance_px", "Filter variance / jitter (px)",
    "fig1_throughput_vs_variance.png",
    "Throughput vs actual cursor variance (real values, per participant)")

# Fig 2: throughput vs ACTUAL latency — real values, per participant
per_participant_panels(
    "latency_ms", "Filter latency (ms)",
    "fig2_throughput_vs_latency.png",
    "Throughput vs actual latency (real values, per participant)")

# Fig 3: latency vs jitter (the operating points each filter actually hits)
fig, axes = plt.subplots(1, len(parts), figsize=(5 * len(parts), 4.2), sharey=True, sharex=True)
if len(parts) == 1:
    axes = [axes]
for ax, p in zip(axes, parts):
    sub = cell[cell.participant == p]
    for filt in ["oneEuro", "exponential"]:
        s = sub[sub.filt == filt].sort_values("latency_ms")
        ax.plot(s.latency_ms, s.variance_px, "o-", color=FILTER_COLORS[filt],
                label=FILTER_LABEL[filt], markersize=7, linewidth=2)
    ax.set_title(p)
    ax.set_xlabel("Latency (ms)")
    ax.grid(alpha=0.3)
axes[0].set_ylabel("Cursor variance / jitter (px)")
axes[0].legend()
fig.suptitle("Latency vs jitter operating points (per participant)",
             fontsize=13, fontweight="bold")
fig.tight_layout(rect=[0, 0, 1, 0.95])
fig.savefig(f"{OUTDIR}/fig3_latency_vs_jitter.png", dpi=130)
plt.close(fig)
print("  saved fig3_latency_vs_jitter.png")

# Fig 4: between-participant spread — throughput vs latency, all participants overlaid
fig, ax = plt.subplots(figsize=(8, 5.5))
markers = ["o", "s", "^"]
for mk, p in zip(markers, parts):
    sub = cell[cell.participant == p]
    for filt in ["oneEuro", "exponential"]:
        s = sub[sub.filt == filt].sort_values("latency_ms")
        ax.plot(s.latency_ms, s.TP, mk + ("-" if filt == "oneEuro" else "--"),
                color=FILTER_COLORS[filt], markersize=7, alpha=0.8,
                label=f"{p} — {FILTER_LABEL[filt]}")
ax.set_xlabel("Latency (ms)")
ax.set_ylabel("Throughput (bits/s)")
ax.set_title("Per-participant throughput curves overlaid\n(same nominal settings, different real operating points)",
             fontweight="bold")
ax.grid(alpha=0.3)
ax.legend(fontsize=8, ncol=2)
fig.tight_layout()
fig.savefig(f"{OUTDIR}/fig4_overlay_throughput_vs_latency.png", dpi=130)
plt.close(fig)
print("  saved fig4_overlay_throughput_vs_latency.png")

# Fig 5: measured-jitter spread at same nominal pair (calibration-matters bar)
fig, ax = plt.subplots(figsize=(8, 5))
pair_ids = sorted({r.get("PairNumber") for rows in variances.values() for r in rows if r.get("PairNumber")})
x = np.arange(len(pair_ids))
w = 0.25
for i, p in enumerate(parts):
    vals = []
    for pn in pair_ids:
        mv = [sf(r.get("MeasuredVariance_px")) for r in variances[p]
              if r.get("PairNumber") == pn]
        mv = [v for v in mv if not np.isnan(v)]
        vals.append(np.mean(mv) if mv else np.nan)
    ax.bar(x + (i - 1) * w, vals, w, label=p)
ax.set_xticks(x)
ax.set_xticklabels([f"pair {pn}" for pn in pair_ids])
ax.set_xlabel("Nominal variance pair")
ax.set_ylabel("Measured cursor SD (px)")
ax.set_title("Same nominal settings -> different measured jitter per participant",
             fontweight="bold")
ax.legend()
ax.grid(alpha=0.3, axis="y")
fig.tight_layout()
fig.savefig(f"{OUTDIR}/fig5_measured_jitter_spread.png", dpi=130)
plt.close(fig)
print("  saved fig5_measured_jitter_spread.png")

print(f"\n  All figures written to: {OUTDIR}")
print("=" * 74)
