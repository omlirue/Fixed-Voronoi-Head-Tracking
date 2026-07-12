"""Figure for the meeting: WHY latency-matched pairs don't work for these two filters.
Left  : Pareto fronts (latency vs variance). One Euro tops out at ~383 ms, so the
        shared latency band (where BOTH filters can live) is tiny.
Right : at every matched latency, One Euro is smooth while Exponential is jittery —
        an 8-10 px variance gap that no usability cap can close.
"""
import re
import os
import numpy as np
import matplotlib.pyplot as plt

JS = os.path.join(os.path.dirname(__file__), "..", "public", "js")

def load(fname, key):
    txt = open(os.path.join(JS, fname)).read()
    var = re.findall(r"meanVariance:\s*([0-9.]+)", txt)
    lat = re.findall(r"meanLatency:\s*([0-9.]+)", txt)
    v = np.array([float(x) for x in var])
    l = np.array([float(x) for x in lat])
    order = np.argsort(l)
    return l[order], v[order]

oe_lat, oe_var = load("pareto-front-parameters.js", "PARETO_FRONT_PARAMETERS")
ex_lat, ex_var = load("exponential-parameters.js", "EXPONENTIAL_PARAMETERS")

MAX_VAR = 12.0
# In-cap shared latency overlap
def incap(lat, var):
    m = var <= MAX_VAR
    return lat[m], var[m]
oel, oev = incap(oe_lat, oe_var)
exl, exv = incap(ex_lat, ex_var)
lo = max(exl.min(), oel.min())
hi = min(exl.max(), oel.max())

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 5.2))

# ---- Panel 1: Pareto fronts ----
ax1.plot(oe_lat, oe_var, "o-", color="#2c7fb8", label="One Euro", ms=4)
ax1.plot(ex_lat, ex_var, "s-", color="#d95f0e", label="Exponential", ms=4)
ax1.axvspan(lo, hi, color="#31a354", alpha=0.18, label=f"Shared band ({hi-lo:.0f} ms)")
ax1.axvline(oe_lat.max(), color="#2c7fb8", ls="--", lw=1.2)
ax1.annotate(f"One Euro's slowest\n= {oe_lat.max():.0f} ms (hard ceiling)",
             xy=(oe_lat.max(), 8), xytext=(oe_lat.max()+60, 14),
             arrowprops=dict(arrowstyle="->", color="#2c7fb8"), fontsize=9, color="#2c7fb8")
ax1.axhline(MAX_VAR, color="gray", ls=":", lw=1)
ax1.text(ax1.get_xlim()[1]*0.98, MAX_VAR+0.3, "variance cap 12 px", ha="right", fontsize=8, color="gray")
ax1.set_xlabel("Latency (ms)")
ax1.set_ylabel("Cursor variance / jitter (px SD)")
ax1.set_title("Filters barely overlap in latency")
ax1.legend(loc="upper right", fontsize=9)
ax1.set_ylim(0, 22)

# ---- Panel 2: variance gap at matched latency ----
targets = np.linspace(lo, hi, 25)
oe_at = np.interp(targets, oel, oev)
ex_at = np.interp(targets, exl, exv)
ax2.fill_between(targets, oe_at, ex_at, color="#fdae6b", alpha=0.5, label="Variance gap (unfair)")
ax2.plot(targets, oe_at, "o-", color="#2c7fb8", label="One Euro variance", ms=3)
ax2.plot(targets, ex_at, "s-", color="#d95f0e", label="Exponential variance", ms=3)
for L in (lo, (lo+hi)/2, hi):
    o = np.interp(L, oel, oev); e = np.interp(L, exl, exv)
    ax2.annotate(f"{abs(e-o):.1f} px", xy=(L, (o+e)/2), fontsize=9, ha="center",
                 fontweight="bold", color="#b30000")
ax2.set_xlabel("Matched latency (ms)")
ax2.set_ylabel("Cursor variance / jitter (px SD)")
ax2.set_title("At equal latency, jitter is wildly unequal")
ax2.legend(loc="upper right", fontsize=9)
ax2.set_ylim(0, 14)

fig.suptitle("Why latency-matched pairs are infeasible for One Euro vs Exponential",
             fontsize=13, fontweight="bold")
fig.tight_layout(rect=[0, 0, 1, 0.96])
out = os.path.join(os.path.dirname(__file__), "pilot3_figures", "fig7_why_latency_match_fails.png")
os.makedirs(os.path.dirname(out), exist_ok=True)
fig.savefig(out, dpi=150)
print("Saved:", out)
