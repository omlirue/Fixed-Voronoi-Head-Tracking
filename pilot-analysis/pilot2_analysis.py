"""Pilot 2 analysis — same methodology as the pilot 1 report:
  Method 1: Bootstrap CI over participants (10,000 resamples)
  Method 2: Per-participant one-sample t-test
  Method 3: Mixed model log(MT) ~ filter*SD + ID + (1|participant)
Plus: crossover by variance level, measured variance levels, timeouts.
"""
import csv, io, subprocess, warnings
import numpy as np
from scipy import stats
import pandas as pd
warnings.filterwarnings('ignore')

BASE = "/Users/soha/head-control-website-js/pilot data 2/pilot data -2 - latency "

def get_csv(zip_path, inner):
    r = subprocess.run(['unzip', '-p', zip_path, inner], capture_output=True, text=True)
    return list(csv.DictReader(io.StringIO(r.stdout)))

def sf(v, d=np.nan):
    try: return float(v)
    except: return d

# participant -> (folder, partA zip, partB zip, timestamp)
SRC = {
  'Nowshad': ('Nowshad',
              'fitts-personal-calibration-P15-2026-06-07T19_04_02.397Z.zip',
              'fitts-standard-calibration-P15-2026-06-07T19_04_02.397Z.zip',
              '2026-06-07T19:04:02.397Z'),
  'Tareq':   ('Tareq',
              'fitts-personal-calibration-P15-2026-06-07T18_57_54.025Z.zip',
              'fitts-standard-calibration-P15-2026-06-07T18_57_54.025Z (1).zip',
              '2026-06-07T18:57:54.025Z'),
  'Soha':    ('Soha',
              'fitts-personal-calibration-P18-2026-06-12T18_52_47.041Z.zip',
              'fitts-standard-calibration-P18-2026-06-12T18_52_47.041Z.zip',
              '2026-06-12T18:52:47.041Z'),
}

results, raws, variances = {}, {}, {}
for p, (folder, za, zb, ts) in SRC.items():
    zpa = f"{BASE}/{folder}/{za}"
    zpb = f"{BASE}/{folder}/{zb}"
    results[p] = (get_csv(zpa, f"fitts-results-{ts}.csv")
                  + get_csv(zpb, f"fitts-results-{ts}.csv"))
    raws[p] = (get_csv(zpa, f"fitts-raw-data-{ts}.csv")
               + get_csv(zpb, f"fitts-raw-data-{ts}.csv"))
    variances[p] = get_csv(zpa, f"fitts-variance-measurement-{ts}.csv")

def cell_ok(r):
    return sf(r.get('CompletionRate')) > 0.5 and sf(r.get('TP')) > 0.01

print("=" * 70)
print("  0. MEASURED VARIANCE LEVELS PER PARTICIPANT (sanity check)")
print("=" * 70)
for p, rows in variances.items():
    if not rows:
        print(f"  {p}: (no variance-measurement file found)")
        continue
    cols = rows[0].keys()
    for r in rows:
        pair = r.get('PairNumber') or r.get('pairNumber') or '?'
        ft = r.get('FilterType') or r.get('filterType') or '?'
        mv = r.get('MeasuredVariance') or r.get('measuredVariance') or ''
        ev = r.get('ExpectedVariance') or r.get('expectedVariance') or ''
        print(f"  {p:8s} pair {pair} {ft:12s} expected={ev:>8s} measured={mv}")
    print()

print("=" * 70)
print("  PER-PARTICIPANT OVERALL THROUGHPUT (One Euro - Exponential)")
print("=" * 70)
diffs = {}
for p, rows in results.items():
    exp = [sf(r['TP']) for r in rows if r['FilterType'] == 'exponential' and cell_ok(r)]
    oe  = [sf(r['TP']) for r in rows if r['FilterType'] == 'oneEuro' and cell_ok(r)]
    diffs[p] = np.mean(oe) - np.mean(exp)
    print(f"  {p:8s}: Exp={np.mean(exp):.3f}  OE={np.mean(oe):.3f}  "
          f"diff={diffs[p]:+.3f}  winner: {'OneEuro' if diffs[p] > 0 else 'Exponential'}")
d = np.array(list(diffs.values()))
print(f"\n  Mean diff across {len(d)} participants = {d.mean():+.4f} bits/s")

print("\n" + "=" * 70)
print("  METHOD 1 — BOOTSTRAP CI (resample participants, 10,000x)")
print("=" * 70)
rng = np.random.default_rng(42)
boot = np.array([rng.choice(d, len(d), replace=True).mean() for _ in range(10000)])
lo, hi = np.percentile(boot, [2.5, 97.5])
print(f"  n={len(d)}  95% CI(OE-Exp) = [{lo:+.3f}, {hi:+.3f}] bits/s")
print(f"  Zero inside? {'YES -> no clear overall winner' if lo <= 0 <= hi else 'NO'}")

print("\n" + "=" * 70)
print("  METHOD 2 — PER-PARTICIPANT one-sample t-test (diff vs 0)")
print("=" * 70)
t, pv = stats.ttest_1samp(d, 0)
print(f"  n={len(d)}  t={t:.3f}  p={pv:.3f}  -> "
      f"{'no significant difference' if pv > 0.05 else 'significant'}")

print("\n" + "=" * 70)
print("  METHOD 3 — MIXED MODEL  log(MT) ~ filter*SD + ID + (1|participant)")
print("=" * 70)
recs = []
for p, rows in raws.items():
    for r in rows:
        if r.get('Status') != 'completed': continue
        mt = sf(r.get('MovementTime')); A = sf(r.get('Amplitude'))
        W = sf(r.get('TargetSize')); sd = sf(r.get('FilterVariance_px'))
        if not (mt > 0 and A > 0 and W > 0 and sd > 0): continue
        recs.append(dict(participant=p, filt=r['FilterType'], mt=mt,
                         ID=np.log2(2 * A / W), sd=sd))
df = pd.DataFrame(recs)
df['logmt'] = np.log(df['mt'])
print(f"  trials: {len(df)}, participants: {df['participant'].nunique()}")
try:
    import statsmodels.formula.api as smf
    m = smf.mixedlm("logmt ~ C(filt)*sd + ID", df, groups=df['participant']).fit()
    c = m.params.get('C(filt)[T.oneEuro]', np.nan)
    pv = m.pvalues.get('C(filt)[T.oneEuro]', np.nan)
    print(f"  One Euro main effect (log MT): coef={c:+.4f}  p={pv:.3f}  (neg = One Euro faster)")
    ix = 'C(filt)[T.oneEuro]:sd'
    if ix in m.params:
        print(f"  filter x SD interaction (crossover term): "
              f"coef={m.params[ix]:+.5f}  p={m.pvalues[ix]:.3f}")
except Exception as e:
    print("  LMM failed:", e)

print("\n" + "=" * 70)
print("  CROSSOVER — One Euro advantage by variance level (Part A only)")
print("=" * 70)
for p, rows in results.items():
    parta = [r for r in rows if r.get('Part', 'Part A') == 'Part A'] or rows
    pairs = sorted({r['PairNumber'] for r in parta if r.get('PairNumber')})
    out = []
    for pn in pairs:
        exp = [sf(r['TP']) for r in parta
               if r['PairNumber'] == pn and r['FilterType'] == 'exponential' and cell_ok(r)]
        oe = [sf(r['TP']) for r in parta
              if r['PairNumber'] == pn and r['FilterType'] == 'oneEuro' and cell_ok(r)]
        if exp and oe:
            out.append(f"pair{pn}: {np.mean(oe) - np.mean(exp):+.3f}")
    print(f"  {p:8s}: " + "   ".join(out))

print("\n" + "=" * 70)
print("  TIMEOUTS / INCOMPLETE TRIALS")
print("=" * 70)
for p, rows in raws.items():
    n = len(rows)
    to = sum(1 for r in rows if r.get('Status') != 'completed')
    print(f"  {p:8s}: {to}/{n} trials not completed")
