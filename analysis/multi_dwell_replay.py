#!/usr/bin/env python3
"""
Multi-Dwell Replay Analysis

Takes cursor path data from the Fitts' experiment (run at 2s dwell) and
replays each trial at multiple simulated dwell times to compute throughput
at each. Generates the "dwell time vs throughput" plot.

Algorithm per trial:
  1. Walk through the cursor path chronologically
  2. Track whether cursor is inside the target at each timestamp
  3. For each simulated dwell time T, find the first moment the cursor
     stays continuously inside the target for T milliseconds
  4. The "selection time" for dwell T is that moment
  5. MT = selection_time - trial_start_time (minus the dwell duration itself,
     since MT should not include dwell)
  6. Endpoint = cursor position at the moment it first achieved T ms inside
  7. Compute We, IDe, TP from the endpoints across trials in each condition
"""

import json
import csv
import math
import sys
import os
import numpy as np
import matplotlib.pyplot as plt
from collections import defaultdict


def load_cursor_paths(json_path):
    print(f"Loading cursor paths from {json_path}...")
    with open(json_path, 'r') as f:
        data = json.load(f)
    print(f"  Loaded {len(data)} trials")

    # Fix target positions: the export stores targetX/Y relative to startPoint
    # (previous target), but the experiment's hit detection always uses screen
    # center.  Derive screen center from the first trial (first in its layout,
    # so startPoint == screen center).
    cx = data[0]['startX']
    cy = data[0]['startY']
    print(f"  Screen center: ({cx}, {cy})")

    for trial in data:
        rad = math.radians(trial['direction'])
        trial['actualTargetX'] = cx + trial['amplitude'] * math.cos(rad)
        trial['actualTargetY'] = cy + trial['amplitude'] * math.sin(rad)

    return data


def load_raw_data(csv_path):
    print(f"Loading raw data from {csv_path}...")
    rows = []
    with open(csv_path, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    print(f"  Loaded {len(rows)} trials")
    return rows


def point_in_circle(px, py, cx, cy, radius):
    return (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2


def simulate_dwell(trial, dwell_ms):
    """
    Simulate a dwell selection at `dwell_ms` for a single trial.

    Returns dict with:
      - success: whether cursor stayed inside target for dwell_ms continuously
      - mt: movement time (from first cursor sample to when dwell completes, minus dwell)
      - endpoint_x, endpoint_y: cursor position at dwell onset (start of dwell)
      - selection_time: absolute time when dwell completed
    Or None if dwell was never achieved.
    """
    path = trial['cursorPath']
    if not path:
        return None

    tx, ty = trial['actualTargetX'], trial['actualTargetY']
    radius = trial['targetSize'] / 2

    trial_start = path[0]['t']
    enter_time = None
    enter_x, enter_y = None, None

    for sample in path:
        x, y, t = sample['x'], sample['y'], sample['t']
        inside = point_in_circle(x, y, tx, ty, radius)

        if inside:
            if enter_time is None:
                enter_time = t
                enter_x, enter_y = x, y
            elapsed_inside = t - enter_time
            if elapsed_inside >= dwell_ms:
                selection_time = t
                mt = (selection_time - trial_start) / 1000.0 - dwell_ms / 1000.0
                if mt < 0:
                    mt = 0.001
                return {
                    'success': True,
                    'mt': mt,
                    'endpoint_x': enter_x,
                    'endpoint_y': enter_y,
                    'selection_time': selection_time,
                }
        else:
            enter_time = None
            enter_x, enter_y = None, None

    return {'success': False, 'mt': None, 'endpoint_x': None, 'endpoint_y': None}


def compute_throughput(trials_data, trial_metas):
    """
    Compute throughput from a set of trial results within one condition.

    Uses the standard ISO 9241-9 approach:
      - Ae = mean effective amplitude (start to endpoint)
      - We = 4.133 * SD of directionally projected endpoints
      - IDe = log2(Ae/We + 1)
      - TP = IDe / mean_MT
    """
    successful = [(td, tm) for td, tm in zip(trials_data, trial_metas) if td['success']]
    if len(successful) < 3:
        return None

    mts = []
    endpoints_projected = []
    effective_amps = []

    for td, tm in successful:
        sx, sy = tm['startX'], tm['startY']
        ex, ey = td['endpoint_x'], td['endpoint_y']
        tx_target, ty_target = tm['targetX'], tm['targetY']

        # Effective amplitude
        ae = math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
        effective_amps.append(ae)

        # Project endpoint onto the task axis (start → target direction)
        dx_axis = tx_target - sx
        dy_axis = ty_target - sy
        axis_len = math.sqrt(dx_axis ** 2 + dy_axis ** 2)
        if axis_len == 0:
            continue

        dx_end = ex - tx_target
        dy_end = ey - ty_target
        projected = (dx_end * dx_axis + dy_end * dy_axis) / axis_len
        endpoints_projected.append(projected)
        mts.append(td['mt'])

    if len(mts) < 3:
        return None

    mean_mt = np.mean(mts)
    ae = np.mean(effective_amps)
    we = 4.133 * np.std(endpoints_projected, ddof=1) if len(endpoints_projected) > 1 else 1.0
    we = max(we, 0.01)
    ide = math.log2(ae / we + 1)
    tp = ide / mean_mt if mean_mt > 0 else 0

    return {
        'mean_mt': mean_mt,
        'ae': ae,
        'we': we,
        'ide': ide,
        'tp': tp,
        'n_success': len(mts),
        'n_total': len(trials_data),
        'error_rate': 1 - len(mts) / len(trials_data),
    }


def run_analysis(cursor_paths, raw_data, dwell_times_ms):
    """
    For each simulated dwell time, replay all trials and compute throughput
    per (pairNumber, filterType) condition.
    """
    # Build lookup for raw data metadata.
    # Screen center from cursor_paths (already validated).
    screen_cx = cursor_paths[0]['startX']
    screen_cy = cursor_paths[0]['startY']

    meta_lookup = {}
    for row in raw_data:
        key = int(row['GlobalTrialNumber'])
        direction = float(row['Direction'])
        amplitude = float(row['Amplitude'])
        rad = math.radians(direction)
        meta_lookup[key] = {
            'pairNumber': int(row['PairNumber']),
            'pairVariance': float(row['PairVariance']),
            'filterType': row['FilterType'],
            'targetSize': float(row['TargetSize']),
            'amplitude': amplitude,
            'direction': direction,
            'startX': float(row['StartX']),
            'startY': float(row['StartY']),
            'targetX': screen_cx + amplitude * math.cos(rad),
            'targetY': screen_cy + amplitude * math.sin(rad),
        }

    results = []

    for dwell_ms in dwell_times_ms:
        print(f"\nSimulating dwell = {dwell_ms}ms...")

        # Group trials by condition: (pairNumber, filterType)
        condition_trials = defaultdict(lambda: {'sim': [], 'meta': []})

        for trial in cursor_paths:
            gtn = trial['globalTrialNumber']
            if gtn not in meta_lookup:
                continue
            meta = meta_lookup[gtn]
            key = (meta['pairNumber'], meta['filterType'])

            sim_result = simulate_dwell(trial, dwell_ms)
            if sim_result is None:
                continue

            condition_trials[key]['sim'].append(sim_result)
            condition_trials[key]['meta'].append(meta)

        for (pair_num, filter_type), data in condition_trials.items():
            tp_result = compute_throughput(data['sim'], data['meta'])
            pair_var = data['meta'][0]['pairVariance'] if data['meta'] else 0

            if tp_result:
                results.append({
                    'dwell_ms': dwell_ms,
                    'pairNumber': pair_num,
                    'pairVariance': pair_var,
                    'filterType': filter_type,
                    **tp_result,
                })
                n = tp_result['n_success']
                total = tp_result['n_total']
                print(f"  Pair {pair_num} ({filter_type}): TP={tp_result['tp']:.3f} bits/s, "
                      f"MT={tp_result['mean_mt']:.2f}s, "
                      f"errors={total - n}/{total}")
            else:
                results.append({
                    'dwell_ms': dwell_ms,
                    'pairNumber': pair_num,
                    'pairVariance': pair_var,
                    'filterType': filter_type,
                    'mean_mt': None, 'ae': None, 'we': None,
                    'ide': None, 'tp': None,
                    'n_success': 0, 'n_total': len(data['sim']),
                    'error_rate': 1.0,
                })
                print(f"  Pair {pair_num} ({filter_type}): ALL FAILED")

    return results


def plot_dwell_vs_throughput(results, output_dir):
    """Main plot: dwell time (x) vs throughput (y), one line per SD level × filter."""
    fig, axes = plt.subplots(1, 2, figsize=(14, 6), sharey=True)

    filter_types = ['exponential', 'oneEuro']
    filter_labels = {'exponential': 'Exponential Smoothing', 'oneEuro': 'One Euro Filter'}
    colors = {1: '#2196F3', 2: '#FF9800', 3: '#F44336'}

    pairs = sorted(set(r['pairNumber'] for r in results))
    pair_labels = {}
    for r in results:
        pair_labels[r['pairNumber']] = f"SD ≈ {r['pairVariance']:.1f}"

    for ax, ft in zip(axes, filter_types):
        for pair_num in pairs:
            subset = [r for r in results if r['pairNumber'] == pair_num
                      and r['filterType'] == ft and r['tp'] is not None]
            if not subset:
                continue

            subset.sort(key=lambda r: r['dwell_ms'])
            dwells = [r['dwell_ms'] / 1000 for r in subset]
            tps = [r['tp'] for r in subset]

            ax.plot(dwells, tps, 'o-', color=colors.get(pair_num, 'gray'),
                    label=pair_labels.get(pair_num, f'Pair {pair_num}'),
                    linewidth=2, markersize=6)

        ax.set_xlabel('Dwell Time (s)', fontsize=12)
        ax.set_title(filter_labels.get(ft, ft), fontsize=13, fontweight='bold')
        ax.legend(fontsize=10)
        ax.grid(True, alpha=0.3)
        ax.set_xlim(0, 2.2)

    axes[0].set_ylabel('Throughput (bits/s)', fontsize=12)
    fig.suptitle('Dwell Time vs Throughput by SD Level', fontsize=15, fontweight='bold')
    plt.tight_layout()

    path = os.path.join(output_dir, 'dwell_vs_throughput.png')
    plt.savefig(path, dpi=150, bbox_inches='tight')
    print(f"\nSaved: {path}")
    plt.close()


def plot_dwell_vs_throughput_combined(results, output_dir):
    """Combined plot: both filters on one chart, grouped by SD level."""
    fig, ax = plt.subplots(figsize=(10, 7))

    pairs = sorted(set(r['pairNumber'] for r in results))
    pair_labels = {}
    for r in results:
        pair_labels[r['pairNumber']] = f"SD ≈ {r['pairVariance']:.1f}"

    colors = {1: '#2196F3', 2: '#FF9800', 3: '#F44336'}
    filter_styles = {'exponential': ('--', 's'), 'oneEuro': ('-', 'o')}
    filter_labels = {'exponential': 'Exp', 'oneEuro': '1€'}

    for pair_num in pairs:
        for ft in ['exponential', 'oneEuro']:
            subset = [r for r in results if r['pairNumber'] == pair_num
                      and r['filterType'] == ft and r['tp'] is not None]
            if not subset:
                continue

            subset.sort(key=lambda r: r['dwell_ms'])
            dwells = [r['dwell_ms'] / 1000 for r in subset]
            tps = [r['tp'] for r in subset]

            ls, marker = filter_styles[ft]
            label = f"{pair_labels.get(pair_num, f'P{pair_num}')} ({filter_labels[ft]})"
            ax.plot(dwells, tps, linestyle=ls, marker=marker,
                    color=colors.get(pair_num, 'gray'),
                    label=label, linewidth=2, markersize=6)

    ax.set_xlabel('Dwell Time (s)', fontsize=13)
    ax.set_ylabel('Throughput (bits/s)', fontsize=13)
    ax.set_title('Dwell Time vs Throughput\n(Dashed = Exponential, Solid = One Euro)',
                 fontsize=14, fontweight='bold')
    ax.legend(fontsize=9, ncol=2)
    ax.grid(True, alpha=0.3)
    ax.set_xlim(0, 2.2)

    path = os.path.join(output_dir, 'dwell_vs_throughput_combined.png')
    plt.savefig(path, dpi=150, bbox_inches='tight')
    print(f"Saved: {path}")
    plt.close()


def plot_dwell_vs_error_rate(results, output_dir):
    """Error rate vs dwell time."""
    fig, ax = plt.subplots(figsize=(10, 6))

    pairs = sorted(set(r['pairNumber'] for r in results))
    pair_labels = {}
    for r in results:
        pair_labels[r['pairNumber']] = f"SD ≈ {r['pairVariance']:.1f}"

    colors = {1: '#2196F3', 2: '#FF9800', 3: '#F44336'}
    filter_styles = {'exponential': ('--', 's'), 'oneEuro': ('-', 'o')}
    filter_labels = {'exponential': 'Exp', 'oneEuro': '1€'}

    for pair_num in pairs:
        for ft in ['exponential', 'oneEuro']:
            subset = [r for r in results if r['pairNumber'] == pair_num
                      and r['filterType'] == ft]
            if not subset:
                continue

            subset.sort(key=lambda r: r['dwell_ms'])
            dwells = [r['dwell_ms'] / 1000 for r in subset]
            errors = [r['error_rate'] * 100 for r in subset]

            ls, marker = filter_styles[ft]
            label = f"{pair_labels.get(pair_num, f'P{pair_num}')} ({filter_labels[ft]})"
            ax.plot(dwells, errors, linestyle=ls, marker=marker,
                    color=colors.get(pair_num, 'gray'),
                    label=label, linewidth=2, markersize=6)

    ax.set_xlabel('Dwell Time (s)', fontsize=13)
    ax.set_ylabel('Error Rate (%)', fontsize=13)
    ax.set_title('Error Rate vs Dwell Time', fontsize=14, fontweight='bold')
    ax.legend(fontsize=9, ncol=2)
    ax.grid(True, alpha=0.3)
    ax.set_xlim(0, 2.2)
    ax.set_ylim(-2, 105)

    path = os.path.join(output_dir, 'dwell_vs_error_rate.png')
    plt.savefig(path, dpi=150, bbox_inches='tight')
    print(f"Saved: {path}")
    plt.close()


def save_results_csv(results, output_dir):
    path = os.path.join(output_dir, 'multi_dwell_results.csv')
    fields = ['dwell_ms', 'pairNumber', 'pairVariance', 'filterType',
              'tp', 'mean_mt', 'ae', 'we', 'ide', 'n_success', 'n_total', 'error_rate']
    with open(path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(results)
    print(f"Saved: {path}")


def main():
    # File paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    downloads = os.path.expanduser('~/Downloads')

    cursor_paths_file = os.path.join(downloads, 'fitts-cursor-paths-2026-03-03T06_07_38.745Z.json')
    raw_data_file = os.path.join(downloads, 'fitts-experiment-raw-data-2026-03-03T06_07_38.745Z.csv')

    output_dir = os.path.join(base_dir, 'output')
    os.makedirs(output_dir, exist_ok=True)

    # Simulated dwell times: 200ms to 2000ms in 200ms steps
    dwell_times_ms = [200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000]

    cursor_paths = load_cursor_paths(cursor_paths_file)
    raw_data = load_raw_data(raw_data_file)

    results = run_analysis(cursor_paths, raw_data, dwell_times_ms)

    print("\n" + "=" * 60)
    print("Generating plots...")
    print("=" * 60)

    plot_dwell_vs_throughput(results, output_dir)
    plot_dwell_vs_throughput_combined(results, output_dir)
    plot_dwell_vs_error_rate(results, output_dir)
    save_results_csv(results, output_dir)

    print("\n✅ Done! Check the output/ folder.")


if __name__ == '__main__':
    main()
