// Standalone check of the latency-matched pairing on the REAL Pareto data.
// Mirrors computeLatencyMatchedPairs() / interpolateByLatency() in fitts-experiment.js.
const fs = require('fs');
const path = require('path');

function loadArray(file, name) {
  const src = fs.readFileSync(file, 'utf8');
  const sandbox = {};
  // eslint-disable-next-line no-new-func
  new Function(src + `\nreturn ${name};`).call(sandbox);
  return new Function(src + `\nreturn ${name};`)();
}

const JS = path.join(__dirname, '..', 'public', 'js');
const oe = loadArray(path.join(JS, 'pareto-front-parameters.js'), 'PARETO_FRONT_PARAMETERS');
const exp = loadArray(path.join(JS, 'exponential-parameters.js'), 'EXPONENTIAL_PARAMETERS');

const MAX_LATENCY_MS = 600;
const MAX_VARIANCE_PX = 12;

function interpByLat(targetLat, byLat, type) {
  if (targetLat <= byLat[0].meanLatency) return { ...byLat[0], interpolated: false };
  if (targetLat >= byLat[byLat.length - 1].meanLatency) return { ...byLat[byLat.length - 1], interpolated: false };
  for (let i = 0; i < byLat.length - 1; i++) {
    const lo = byLat[i], hi = byLat[i + 1];
    if (lo.meanLatency <= targetLat && hi.meanLatency >= targetLat) {
      const r = hi.meanLatency - lo.meanLatency;
      if (r === 0) return { ...lo, interpolated: false };
      const t = (targetLat - lo.meanLatency) / r;
      const L = (a, b) => a + t * (b - a);
      if (type === 'exp') return { alpha: L(lo.alpha, hi.alpha), meanVariance: L(lo.meanVariance, hi.meanVariance), meanLatency: targetLat };
      return { minCutoff: L(lo.minCutoff, hi.minCutoff), beta: L(lo.beta, hi.beta), dCutoff: L(lo.dCutoff, hi.dCutoff), meanVariance: L(lo.meanVariance, hi.meanVariance), meanLatency: targetLat };
    }
  }
  return null;
}

const within = (p) => p.meanVariance <= MAX_VARIANCE_PX && p.meanLatency <= MAX_LATENCY_MS;
const exByLat = exp.filter(within).sort((a, b) => a.meanLatency - b.meanLatency);
const oeByLat = oe.filter(within).sort((a, b) => a.meanLatency - b.meanLatency);

const exLo = exByLat[0].meanLatency, exHi = exByLat[exByLat.length - 1].meanLatency;
const oeLo = oeByLat[0].meanLatency, oeHi = oeByLat[oeByLat.length - 1].meanLatency;
const overlapLo = Math.max(exLo, oeLo), overlapHi = Math.min(exHi, oeHi);

console.log(`Exp in-cap latency range: ${exLo.toFixed(0)}-${exHi.toFixed(0)} ms (var ${Math.min(...exByLat.map(p=>p.meanVariance)).toFixed(1)}-${Math.max(...exByLat.map(p=>p.meanVariance)).toFixed(1)} px)`);
console.log(`OE  in-cap latency range: ${oeLo.toFixed(0)}-${oeHi.toFixed(0)} ms (var ${Math.min(...oeByLat.map(p=>p.meanVariance)).toFixed(1)}-${Math.max(...oeByLat.map(p=>p.meanVariance)).toFixed(1)} px)`);
console.log(`SHARED latency overlap: ${overlapLo.toFixed(0)}-${overlapHi.toFixed(0)} ms  (width ${(overlapHi-overlapLo).toFixed(0)} ms)`);
console.log('');

const margin = (overlapHi - overlapLo) * 0.02;
const loLat = overlapLo + margin, hiLat = overlapHi - margin;
const targets = [
  { level: 'Low   ', lat: hiLat },
  { level: 'Medium', lat: (loLat + hiLat) / 2 },
  { level: 'High  ', lat: loLat },
];

console.log('LATENCY-MATCHED PAIRS:');
for (const t of targets) {
  const e = interpByLat(t.lat, exByLat, 'exp');
  const o = interpByLat(t.lat, oeByLat, 'oe');
  console.log(`  ${t.level} @ ${t.lat.toFixed(0)} ms  ->  OE var=${o.meanVariance.toFixed(2)} px | Exp var=${e.meanVariance.toFixed(2)} px | var gap=${Math.abs(e.meanVariance-o.meanVariance).toFixed(2)} px`);
}
