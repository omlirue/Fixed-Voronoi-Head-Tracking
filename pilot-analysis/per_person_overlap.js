// Per-person test of the user's hypothesis: does the variance-overlap-wide /
// latency-overlap-narrow asymmetry hold for EVERY person, or is it dataset-specific?
// Reads each person's PERSONAL pareto fronts (from their optimization ZIP).
const fs = require('fs');
const path = require('path');

const ROOT = '/tmp/fronts';
const MAX_VAR = 12;   // usability variance cap (px SD)

function loadFront(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const arr = j.paretoFront || j.front || [];
  return arr
    .filter(p => Number.isFinite(p.meanVariance) && Number.isFinite(p.meanLatency))
    .map(p => ({ v: p.meanVariance, l: p.meanLatency }));
}

function rangeWithinCap(points) {
  const inCap = points.filter(p => p.v <= MAX_VAR);
  if (inCap.length < 2) return null;
  const lats = inCap.map(p => p.l);
  const vars = inCap.map(p => p.v);
  return { lMin: Math.min(...lats), lMax: Math.max(...lats), vMin: Math.min(...vars), vMax: Math.max(...vars) };
}

function interpVarAtLat(points, L) {
  const s = [...points].sort((a, b) => a.l - b.l);
  if (L <= s[0].l) return s[0].v;
  if (L >= s[s.length - 1].l) return s[s.length - 1].v;
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i].l <= L && s[i + 1].l >= L) {
      const f = (L - s[i].l) / (s[i + 1].l - s[i].l);
      return s[i].v + f * (s[i + 1].v - s[i].v);
    }
  }
  return s[s.length - 1].v;
}

const people = fs.readdirSync(ROOT).filter(d => fs.existsSync(path.join(ROOT, d, 'pareto-front-oneeuro.json'))).sort();

console.log('Per-person filter ranges (within variance cap 12px) and matched-overlap widths\n');
const header = ['Person', 'OE lat range', 'Exp lat range', 'VAR overlap', 'LAT overlap', 'mid-pair var gap'];
console.log(header.map((h, i) => h.padEnd([14, 14, 16, 14, 14, 16][i])).join(''));
console.log('-'.repeat(88));

for (const person of people) {
  const oe = loadFront(path.join(ROOT, person, 'pareto-front-oneeuro.json'));
  const ex = loadFront(path.join(ROOT, person, 'pareto-front-exponential.json'));
  const ro = rangeWithinCap(oe), re = rangeWithinCap(ex);
  if (!ro || !re) { console.log(person.padEnd(14) + '(insufficient in-cap points)'); continue; }

  const varLo = Math.max(ro.vMin, re.vMin), varHi = Math.min(ro.vMax, re.vMax);
  const latLo = Math.max(ro.lMin, re.lMin), latHi = Math.min(ro.lMax, re.lMax);
  const latW = Math.max(0, latHi - latLo);
  const varW = Math.max(0, varHi - varLo);

  let gap = 'n/a';
  if (latW > 0) {
    const mid = (latLo + latHi) / 2;
    gap = Math.abs(interpVarAtLat(ex, mid) - interpVarAtLat(oe, mid)).toFixed(1) + 'px';
  }

  const row = [
    person,
    `${ro.lMin.toFixed(0)}-${ro.lMax.toFixed(0)}ms`,
    `${re.lMin.toFixed(0)}-${re.lMax.toFixed(0)}ms`,
    `${varW.toFixed(1)}px`,
    `${latW.toFixed(0)}ms`,
    gap,
  ];
  console.log(row.map((c, i) => String(c).padEnd([14, 14, 16, 14, 14, 16][i])).join(''));
}

console.log('\nNote: OE = One Euro. "LAT overlap" = latency band where BOTH filters can live.');
console.log('"VAR overlap" = jitter band where both can live. Big VAR overlap + small LAT overlap');
console.log('= variance-matching feasible, latency-matching not — tested per person.');
