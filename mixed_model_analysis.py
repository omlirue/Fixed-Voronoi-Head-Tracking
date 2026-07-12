"""
Linear Mixed-Effects Model for Fitts' Law Filter Comparison
============================================================
Throughput ~ Filter * ActualSD + (1 | Participant)

Usage:
  1. Put each participant's fitts-experiment-results-*.csv in a folder
  2. Update DATA_FILES below with (filepath, participant_id) pairs
  3. Run: python mixed_model_analysis.py
  4. With 2 participants this is a sanity check only
     With 5-6+ participants the results become meaningful

Requirements: pip install statsmodels pandas
"""

import pandas as pd
import statsmodels.formula.api as smf
import sys

# ============================================================
# STEP 1: List your participant data files here
# ============================================================
DATA_FILES = [
    ("/tmp/prof_run2/fitts-experiment-results-2026-03-28T01:46:01.703Z.csv", "P1"),
    ("/tmp/fitts_soha/fitts-experiment-results-2026-03-27T02:22:00.704Z.csv", "P2"),
    # Add more participants as you collect data:
    # ("path/to/P3-results.csv", "P3"),
    # ("path/to/P4-results.csv", "P4"),
]

# ============================================================
# STEP 2: Load and combine all data
# ============================================================
frames = []
for path, pid in DATA_FILES:
    df = pd.read_csv(path)
    df['Participant'] = pid
    frames.append(df)

data = pd.concat(frames, ignore_index=True)

data = data.rename(columns={
    'FilterType': 'Filter',
    'PairVariance_px': 'ActualSD',
    'FilterLatency': 'Latency',
})

print("=" * 60)
print("DATA SUMMARY")
print("=" * 60)
print(f"Participants: {data['Participant'].nunique()}")
print(f"Total rows: {len(data)}")
print(f"Rows per participant: {len(data) // data['Participant'].nunique()}")
print()

# Summary per participant x filter
summary = data.groupby(['Participant', 'Filter']).agg(
    MeanTP=('TP', 'mean'),
    MeanMT=('MeanMT', 'mean'),
    MeanSD=('ActualSD', 'mean'),
    MeanReEntries=('MeanReEntries', 'mean'),
    N=('TP', 'count')
).round(3)
print(summary)
print()

# Summary per filter (across all participants)
print("Overall by filter:")
overall = data.groupby('Filter').agg(
    MeanTP=('TP', 'mean'),
    MeanMT=('MeanMT', 'mean'),
    MeanReEntries=('MeanReEntries', 'mean'),
    N=('TP', 'count')
).round(3)
print(overall)
print()

# ============================================================
# STEP 3: Fit the mixed-effects model
# ============================================================
print("=" * 60)
print("LINEAR MIXED-EFFECTS MODEL")
print("Throughput ~ Filter * ActualSD + (1 | Participant)")
print("=" * 60)
print()

if data['Participant'].nunique() < 3:
    print("⚠️  WARNING: Only {} participants — random effects cannot be")
    print("    estimated reliably. Results are for sanity checking only.")
    print("    Need 5-6+ participants for meaningful results.")
    print()

data['Filter_OE'] = (data['Filter'] == 'oneEuro').astype(int)

try:
    model = smf.mixedlm(
        "TP ~ Filter_OE * ActualSD",
        data=data,
        groups=data["Participant"]
    )
    result = model.fit()
    print(result.summary())
    print()

    print("=" * 60)
    print("INTERPRETATION")
    print("=" * 60)
    params = result.params
    pvals = result.pvalues

    print(f"\nIntercept: {params['Intercept']:.3f}")
    print(f"  → Baseline TP for Exponential at SD=0")
    print()

    print(f"Filter_OE: {params['Filter_OE']:.3f} (p={pvals['Filter_OE']:.4f})")
    if pvals['Filter_OE'] < 0.05:
        direction = "higher" if params['Filter_OE'] > 0 else "lower"
        print(f"  → One Euro TP is significantly {direction} than Exponential")
    else:
        print(f"  → No significant difference between filters")
    print()

    print(f"ActualSD: {params['ActualSD']:.4f} (p={pvals['ActualSD']:.4f})")
    if pvals['ActualSD'] < 0.05:
        direction = "increases" if params['ActualSD'] > 0 else "decreases"
        print(f"  → TP significantly {direction} as jitter increases")
    else:
        print(f"  → Jitter level does not significantly affect TP")
    print()

    print(f"Filter_OE:ActualSD: {params['Filter_OE:ActualSD']:.4f} (p={pvals['Filter_OE:ActualSD']:.4f})")
    if pvals['Filter_OE:ActualSD'] < 0.05:
        print(f"  → The filter effect significantly changes with jitter level")
    else:
        print(f"  → The filter effect does not significantly change with jitter")
    print()

except Exception as e:
    print(f"Model failed: {e}")
    print("This can happen with very few participants.")
    print("Try again with more data.")

# ============================================================
# STEP 4: Additional model — Re-entries
# ============================================================
print()
print("=" * 60)
print("BONUS: Re-entries ~ Filter * ActualSD + (1 | Participant)")
print("=" * 60)
print()

try:
    model2 = smf.mixedlm(
        "MeanReEntries ~ Filter_OE * ActualSD",
        data=data,
        groups=data["Participant"]
    )
    result2 = model2.fit()
    print(result2.summary())
except Exception as e:
    print(f"Model failed: {e}")
