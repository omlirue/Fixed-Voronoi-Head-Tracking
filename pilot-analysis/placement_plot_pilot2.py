#!/usr/bin/env python3
"""Latency-vs-jitter placement plot for pilot-2 ('latency') data.
Mirrors the professor's hand sketch: x = latency (ms), y = jitter (px SD),
one colour per participant, marker per filter, with the 600 ms and jitter
cap lines drawn in. Uses the ACTUAL tested design points from each person's
personal-calibration fitts-results CSV."""
import os, zipfile, csv, io, glob
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

BASE = os.path.join(os.path.dirname(__file__), "..", "pilot data 2", "pilot data -2 - latency ")

# participant -> personal-calibration zip (pick the plain one if duplicates)
PEOPLE = {
    "P15 (Tareq)":   "Tareq/fitts-personal-calibration-P15-2026-06-07T18_57_54.025Z.zip",
    "P18 (Soha)":    "Soha/fitts-personal-calibration-P18-2026-06-12T18_52_47.041Z.zip",
    "P19 (Amelie)":  "Amelie/fitts-personal-calibration-P19-2026-06-16T17_25_11.839Z.zip",
    "P20 (Valerie)": "Valerie/fitts-personal-calibration-P20-2026-06-16T17_45_21.003Z (2).zip",
    "P21 (Jesus)":   "Jesus/fitts-personal-calibration-P21-2026-06-16T17_29_17.388Z (2).zip",
}

def read_results(zip_path):
    with zipfile.ZipFile(zip_path) as z:
        name = [n for n in z.namelist() if "fitts-results" in n and n.endswith(".csv")][0]
        text = z.read(name).decode("utf-8", errors="replace")
    rows = list(csv.DictReader(io.StringIO(text)))
    # unique design point per (pair, filter): pair -> {filter: (lat, var)}
    pairs = {}
    for r in rows:
        try:
            lat = float(r["FilterLatency"]); var = float(r["FilterVariance_px"])
        except (KeyError, ValueError):
            continue
        pairs.setdefault(r["PairNumber"], {})[r["FilterType"]] = (lat, var)
    return pairs

colors = plt.cm.tab10.range if False else plt.cm.tab10(range(10))
marker = {"oneEuro": "o", "exponential": "s"}

fig, ax = plt.subplots(figsize=(9, 6.5))
for i, (label, rel) in enumerate(PEOPLE.items()):
    path = os.path.join(BASE, rel)
    if not os.path.exists(path):
        print("MISSING:", path); continue
    pairs = read_results(path)
    c = colors[i % 10]
    for pairno, fdict in pairs.items():
        # connect the two filters at this level (horizontal => variance-matched,
        # vertical => latency-matched)
        if "oneEuro" in fdict and "exponential" in fdict:
            (x1, y1), (x2, y2) = fdict["oneEuro"], fdict["exponential"]
            ax.plot([x1, x2], [y1, y2], color=c, lw=1.0, alpha=0.5, zorder=2)
        for ftype, (lat, var) in fdict.items():
            ax.scatter(lat, var, color=c, marker=marker.get(ftype, "x"),
                       s=90, edgecolor="black", linewidth=0.5, zorder=3)
    # label once
    ax.scatter([], [], color=c, marker="o", s=90, label=label)

# cap lines
ax.axvline(600, color="red", ls="--", lw=1.5)
ax.text(602, ax.get_ylim()[1]*0.98, "latency cap 600 ms", color="red", fontsize=9, va="top")
ax.axhline(12, color="orange", ls="--", lw=1.5)
ax.text(ax.get_xlim()[0], 12.2, "jitter cap 12 px", color="orange", fontsize=9)

# filter-shape legend
from matplotlib.lines import Line2D
shape_legend = [Line2D([0],[0], marker="o", color="gray", ls="", label="One Euro", markersize=9),
                Line2D([0],[0], marker="s", color="gray", ls="", label="Exponential", markersize=9)]
leg1 = ax.legend(loc="upper right", title="Participant", fontsize=8)
ax.add_artist(leg1)
ax.legend(handles=shape_legend, loc="lower right", title="Filter", fontsize=8)

ax.set_xlabel("Latency (ms)"); ax.set_ylabel("Jitter — cursor SD (px)")
ax.set_title("Pilot-2 placement: where each participant's tested points land\n(latency vs jitter, both filters)")
ax.grid(True, alpha=0.3)
out = os.path.join(os.path.dirname(__file__), "pilot2_placement.png")
fig.tight_layout(); fig.savefig(out, dpi=140)
print("saved", out)
