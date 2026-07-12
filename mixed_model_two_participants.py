#!/usr/bin/env python3
"""
Mixed-Effects Model: Two participants with DIFFERENT SD levels
Demonstrates how the model handles variance mismatch across participants.
"""

import pandas as pd
import numpy as np
import statsmodels.formula.api as smf
import warnings
warnings.filterwarnings('ignore')

# Load your data (Soha)
soha = pd.read_csv("/Users/soha/Downloads/fitts-experiment-results-2026-03-03T06_07_38.745Z.csv")
soha['Participant'] = 'Soha'

# Load professor's data
prof = pd.read_csv("/Users/soha/Downloads/pilot-variance-filter-results-2026-02-17T22_44_34.435Z (2).csv")
prof['Participant'] = 'Professor'

# Combine
df = pd.concat([soha, prof], ignore_index=True)

print("=" * 70)
print("DATA WITH DIFFERENT SD LEVELS ACROSS PARTICIPANTS")
print("=" * 70)

print(f"\nParticipants: {df['Participant'].nunique()}")
print(f"Total rows: {len(df)}")

print("\n" + "-" * 70)
print("SD LEVELS PER PARTICIPANT (the 'apples vs oranges' problem)")
print("-" * 70)

for p in df['Participant'].unique():
    pdata = df[df['Participant'] == p]
    sds = sorted(pdata['PairVariance'].unique())
    print(f"\n  {p}:")
    for sd in sds:
        desc = pdata[pdata['PairVariance'] == sd]['PairDescription'].iloc[0]
        print(f"    {desc} → SD = {sd:.1f} px")

print("\n  ⚠️  Notice: the SD values are COMPLETELY DIFFERENT between participants!")
print("  Soha's Low (~3.2) ≠ Professor's Low (~4.9)")
print("  Soha's High (~31.8) ≠ Professor's High (~44.7)")
print("  THIS is the problem your professor raised.")

print("\n" + "-" * 70)
print("MEAN THROUGHPUT BY PARTICIPANT × FILTER × SD LEVEL")
print("-" * 70)

summary = df.groupby(['Participant', 'FilterType', 'PairVariance'])['TP'].agg(['mean', 'count'])
print(summary.to_string())

print("\n" + "-" * 70)
print("MEAN THROUGHPUT BY FILTER (NAIVE — ignoring SD differences)")
print("-" * 70)

naive = df.groupby(['FilterType'])['TP'].mean()
print(naive.to_string())
print("\n  ⚠️  This comparison is UNFAIR because it ignores that participants")
print("  had different SD levels. This is what ANOVA would do with 'Low/Mid/High' labels.")

# --- MIXED MODEL ---

print("\n" + "=" * 70)
print("LINEAR MIXED-EFFECTS MODEL")
print("Throughput ~ Filter * ActualSD + TargetSize + Amplitude + (1|Participant)")
print("=" * 70)

df['Filter'] = (df['FilterType'] == 'oneEuro').astype(int)
df['ActualSD'] = df['PairVariance']

model = smf.mixedlm(
    "TP ~ Filter * ActualSD + TargetSize + Amplitude",
    data=df,
    groups=df["Participant"]
)

result = model.fit()
print(result.summary())

# --- INTERPRETATION ---

print("\n" + "-" * 70)
print("INTERPRETATION")
print("-" * 70)

coefs = result.fe_params
pvals = result.pvalues

filter_effect = coefs.get('Filter', 0)
filter_p = pvals.get('Filter', 1)
sd_effect = coefs.get('ActualSD', 0)
sd_p = pvals.get('ActualSD', 1)
interaction = coefs.get('Filter:ActualSD', 0)
interaction_p = pvals.get('Filter:ActualSD', 1)

print(f"\n1. FILTER EFFECT (One Euro vs Exponential):")
print(f"   Effect: {filter_effect:+.4f} bits/s")
print(f"   p = {filter_p:.4f} {'*** SIGNIFICANT' if filter_p < 0.05 else '(not significant)'}")

print(f"\n2. JITTER SD EFFECT:")
print(f"   Each 1px increase in SD changes throughput by {sd_effect:+.4f} bits/s")
print(f"   p = {sd_p:.4f} {'*** SIGNIFICANT' if sd_p < 0.05 else '(not significant)'}")

print(f"\n3. FILTER × SD INTERACTION:")
print(f"   Effect: {interaction:+.4f} bits/s per unit SD")
print(f"   p = {interaction_p:.4f} {'*** SIGNIFICANT' if interaction_p < 0.05 else '(not significant)'}")

print(f"\n4. RANDOM EFFECT (Participant variance):")
re_var = float(result.cov_re.iloc[0, 0])
print(f"   Between-participant SD: {np.sqrt(re_var):.4f} bits/s")

print("\n" + "=" * 70)
print("WHY THIS WORKS DESPITE DIFFERENT SD LEVELS")
print("=" * 70)
print("""
The model does NOT compare 'Low vs Low' across participants.
Instead, it uses the actual SD numbers:

  Soha at SD=3.2  and  Professor at SD=4.9  → both inform the same regression line
  Soha at SD=31.8 and  Professor at SD=44.7 → both inform the same regression line

The model fits:
  Throughput = baseline + (filter effect) + (SD effect × actual SD) + (person's baseline)

So it asks: "At ANY given SD value, does One Euro beat Exponential?"
It doesn't matter that the two participants had different SD values —
the model uses ALL data points to estimate one filter effect.

This is exactly what Brauer & Curtin (2018) recommend for
continuous within-subject predictors that differ across participants.
""")

# --- COMPARISON: what if we just used ANOVA-style categories? ---

print("=" * 70)
print("COMPARISON: ANOVA-STYLE (treating Low/Mid/High as categories)")
print("=" * 70)

df['SDLevel'] = df.groupby('Participant')['PairVariance'].transform(
    lambda x: pd.Categorical(
        x.map(dict(zip(sorted(x.unique()), ['Low', 'Mid', 'High']))),
        categories=['Low', 'Mid', 'High']
    )
)

anova_summary = df.groupby(['SDLevel', 'FilterType', 'Participant'])['TP'].mean().unstack('Participant')
print(anova_summary.to_string())

print("""
⚠️  Look at the 'Low' row:
   Soha's 'Low' (SD=3.2) gives different throughput than Professor's 'Low' (SD=4.9)
   ANOVA treats these as the SAME condition — that's the problem.
   The mixed model uses 3.2 and 4.9 separately — that's the solution.
""")
