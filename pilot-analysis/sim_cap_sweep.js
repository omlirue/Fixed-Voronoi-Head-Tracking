// Does relaxing the usability caps rescue latency-matched pairs?
// Sweeps MAX_VARIANCE_PX and MAX_LATENCY_MS on the REAL Pareto data and reports
// the resulting shared-latency overlap + the per-pair variance gap.
const fs = require('fs');
const path = require('path');

function loadArray(file, name) {
  const src = fs.readFileSync(file, 'utf8');
  return new Function(src + `\nreturn ${name};`)();
}
const JS = path.join(__dirname, '..', 'public', 'js');
const oe = loadArray(path.join(JS, 'pareto-front-parameters.js'), 'PARETO_FRONT_PARAMETERS');
const exp = loadArray(path.join(JS, 'exponential-parameters.js'), 'EXPONENTIAL_PARAMETERS');

function interpByLat(t, s) {
  if (t <= s[0].meanLatency) return s[0];
  if (t >= s[s.length - 1].meanLatency) return s[s.length - 1];
  for (let i = 0; i < s.length - 1; i++) {
    const lo = s[i], hi = s[i + 1];
    if (lo.meanLatency <= t && hi.meanLatency >= t) {
      const f = (t - lo.meanLatency) / (hi.meanLatency - lo.meanLatency);
      return { meanVariance: lo.meanVariance + f * (hi.meanVariance - lo.meanVariance) };
    }
  }
  return s[s.length - 1];
}

function evaluate(maxVar, maxLat) {
  const within = (p) => p.meanVariance <= maxVar && p.meanLatency <= maxLat;
  const ex = exp.filter(within).sort((a, b) => a.meanLatency - b.meanLatency);
  const o = oe.filter(within).sort((a, b) => a.meanLatency - b.meanLatency);
  if (ex.length < 2 || o.length < 2) return null;
  const lo = Math.max(ex[0].meanLatency, o[0].meanLatency);
  const hi = Math.min(ex[ex.length - 1].meanLatency, o[o.length - 1].meanLatency);
  if (hi <= lo) return { width: 0, lo, hi, gaps: [] };
  const mid = (lo + hi) / 2;
  const gaps = [lo, mid, hi].map((L) => {
    const ev = interpByLat(L, ex).meanVariance;
    const ov = interpByLat(L, o).meanVariance;
    return { L, ev, ov, gap: Math.abs(ev - ov) };
  });
  return { width: hi - lo, lo, hi, gaps };
}

console.log('One Euro intrinsic latency range :', Math.min(...oe.map(p=>p.meanLatency)).toFixed(0), '-', Math.max(...oe.map(p=>p.meanLatency)).toFixed(0), 'ms');
console.log('Exponential intrinsic latency range:', Math.min(...exp.map(p=>p.meanLatency)).toFixed(0), '-', Math.max(...exp.map(p=>p.meanLatency)).toFixed(0), 'ms');
console.log('');
console.log('varCap  latCap | overlap (ms)      width | per-pair variance gap (px) lo/mid/hi');
console.log('-'.repeat(92));
for (const latCap of [600, 800, 2000]) {
  for (const varCap of [12, 16, 20, 30, 9999]) {
    const r = evaluate(varCap, latCap);
    const vc = varCap === 9999 ? 'none' : String(varCap);
    if (!r) { console.log(`${vc.padStart(5)}  ${String(latCap).padStart(5)} | (no in-cap points)`); continue; }
    const ov = `${r.lo.toFixed(0)}-${r.hi.toFixed(0)}`.padStart(11);
    const w = `${r.width.toFixed(0)}ms`.padStart(7);
    const g = r.gaps.map(x => x.gap.toFixed(1)).join(' / ');
    console.log(`${vc.padStart(5)}  ${String(latCap).padStart(5)} | ${ov}  ${w} | ${g}`);
  }
}
