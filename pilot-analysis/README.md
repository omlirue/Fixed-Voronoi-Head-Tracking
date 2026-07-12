# Pilot Analysis

Generates a one-page HTML memo for the Fitts / Filter pilot data, suitable to email or print-to-PDF for the professor.

## What it does

Seven sections, in order:

1. **Data coverage** — trials per participant × pair × filter
2. **Sanity check** — per-participant Fitts' law fit (`r²` reported)
3. **Between-participant variation** — measured cursor SD per participant per condition + coefficient of variation (this addresses the "variance / latency differences among participants" concern directly)
4. **Per-participant descriptive table** — TP, MT, error rate per cell
5. **Direction-of-effect (sign test)** — how often One Euro beat Exponential
6. **Exploratory mixed model** — `log(MT) ~ filter × measured_SD + ID + (1|Participant)`, framed as exploratory only
7. **Power analysis** — recommended `n` for the real study from pilot effect size

## Input layout

```
pilot-data/
  participant_a/
    fitts-raw-data-*.csv               (or pilot-variance-filter-raw-data-*.csv)
    fitts-variance-measurement-*.csv   (optional but recommended)
    fitts-results-*.csv                (optional; not required)
  participant_b/
    ...
  participant_c/
    ...
```

Each participant lives in its own subfolder. The script auto-discovers any CSV whose name contains `raw-data` and `variance-measurement`. Participant ID is taken from the subfolder name.

## Run

```
cd pilot-analysis
python -m pip install -r requirements.txt    # one-time
python pilot_analysis.py                     # uses ../pilot-data/
```

To point at a different folder:

```
python pilot_analysis.py --data /path/to/my/pilots --output ./report
```

## Output

```
pilot-analysis/output/
  pilot_memo.html         <- open in browser, then ⌘P → "Save as PDF"
  summary.json            <- machine-readable numbers (recommended_n, CV, effects, etc.)
  figures/
    01_data_coverage.png
    02_fitts_fit.png
    03_variance_per_participant.png
    04_descriptive_table.png
```

## What the report does *not* claim

- It does **not** report participant-level p-values as if confirmatory.
- It does **not** claim "Filter X is better in the general population."
- It does **not** fit random slopes by participant (would boundary-fit with small n).

These are explicitly excluded with on-page callouts. The output is honestly a *pilot*.

## Schema notes

The loader handles older CSV variants:

- Missing `EffectiveAmplitude` → falls back to `ActualAmplitude`
- Missing endpoint coordinates → falls back to `SelectionX/Y`
- Missing `Status` column → assumes all trials completed

If a participant's raw CSV lacks the required columns (`PairNumber`, `PairVariance`, `FilterType`, `TargetSize`, `Amplitude`, `Direction`, `MovementTime`) they're skipped with a warning.
