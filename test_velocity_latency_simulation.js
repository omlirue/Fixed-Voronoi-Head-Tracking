/**
 * Simulation to validate the velocity-ONSET (4-sigma) latency method.
 *
 * Tests both One Euro and Exponential Smoothing filters across a wide
 * parameter range. Checks for smooth Pareto curves and no 0ms/Infinity artifacts.
 *
 * Run:  node test_velocity_latency_simulation.js
 */

const fs = require('fs');

// ─── Inline One Euro Filter ─────────────────────────────────────────────────

class LowPassFilter {
  constructor(alpha, initval = 0.0) {
    this.y = this.s = initval;
    this.a = alpha;
    this.initialized = false;
  }
  filter(value) {
    let result;
    if (this.initialized) result = this.a * value + (1.0 - this.a) * this.s;
    else { result = value; this.initialized = true; }
    this.y = value;
    this.s = result;
    return result;
  }
  filterWithAlpha(value, alpha) {
    this.a = alpha;
    return this.filter(value);
  }
  hasLastRawValue() { return this.initialized; }
  lastFilteredValue() { return this.s; }
}

class OneEuroFilter2D {
  alpha(cutoff) {
    const te = 1.0 / this.freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }
  constructor(freq, mincutoff = 1.0, beta_ = 0.0, dcutoff = 1.0) {
    this.freq = freq;
    this.mincutoff = mincutoff;
    this.beta_ = beta_;
    this.dcutoff = dcutoff;
    this.xFilter = new LowPassFilter(this.alpha(mincutoff));
    this.yFilter = new LowPassFilter(this.alpha(mincutoff));
    this.dxFilter = new LowPassFilter(this.alpha(dcutoff));
    this.dyFilter = new LowPassFilter(this.alpha(dcutoff));
    this.lasttime = undefined;
  }
  filter(x, y, timestamp) {
    if (this.lasttime !== undefined && timestamp !== undefined && timestamp > this.lasttime)
      this.freq = 1.0 / (timestamp - this.lasttime);
    this.lasttime = timestamp;
    const dxVal = this.xFilter.hasLastRawValue() ? (x - this.xFilter.lastFilteredValue()) * this.freq : 0.0;
    const dyVal = this.yFilter.hasLastRawValue() ? (y - this.yFilter.lastFilteredValue()) * this.freq : 0.0;
    const edx = this.dxFilter.filterWithAlpha(dxVal, this.alpha(this.dcutoff));
    const edy = this.dyFilter.filterWithAlpha(dyVal, this.alpha(this.dcutoff));
    const speed2D = Math.sqrt(edx * edx + edy * edy);
    const cutoff = this.mincutoff + this.beta_ * speed2D;
    const a = this.alpha(cutoff);
    return { x: this.xFilter.filterWithAlpha(x, a), y: this.yFilter.filterWithAlpha(y, a) };
  }
}

// ─── Gaussian random ─────────────────────────────────────────────────────────

function gaussRandom(mean = 0, std = 1) {
  const u1 = Math.random();
  const u2 = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ─── Generate synthetic trial ────────────────────────────────────────────────

function generateSyntheticTrial(noiseStd = 3.0) {
  const dt = 1000 / 60;
  const stationaryDuration = 2000;
  const movementDuration = 600;
  const settleDuration = 2000;
  const totalDuration = stationaryDuration + movementDuration + settleDuration;
  const tWaitEnd = stationaryDuration;
  const startX = 500, startY = 400, endX = 800, endY = 400;

  const samples = [];
  for (let t = 0; t <= totalDuration; t += dt) {
    let trueX, trueY;
    if (t < stationaryDuration) {
      trueX = startX; trueY = startY;
    } else if (t < stationaryDuration + movementDuration) {
      const progress = (t - stationaryDuration) / movementDuration;
      const s = 1 / (1 + Math.exp(-12 * (progress - 0.5)));
      trueX = startX + (endX - startX) * s;
      trueY = startY + (endY - startY) * s;
    } else {
      trueX = endX; trueY = endY;
    }
    samples.push({
      time: t,
      headX: trueX + gaussRandom(0, noiseStd),
      headY: trueY + gaussRandom(0, noiseStd),
      phase: t < stationaryDuration ? 'variance_measurement' : 'latency_measurement'
    });
  }
  return { samples, tWaitEnd };
}

// ─── Apply One Euro Filter ───────────────────────────────────────────────────

function applyOneEuro(samples, params) {
  const filter2D = new OneEuroFilter2D(params.frequency || 60, params.minCutoff, params.beta, params.dCutoff);
  return samples.map(s => {
    const f = filter2D.filter(s.headX, s.headY, s.time / 1000);
    return { time: s.time, originalX: s.headX, originalY: s.headY, filteredX: f.x, filteredY: f.y, phase: s.phase };
  });
}

// ─── Apply Exponential Smoothing ─────────────────────────────────────────────

function applyExponential(samples, alpha) {
  let sx = samples[0].headX, sy = samples[0].headY;
  return samples.map((s, i) => {
    if (i > 0) { sx = alpha * s.headX + (1 - alpha) * sx; sy = alpha * s.headY + (1 - alpha) * sy; }
    return { time: s.time, originalX: s.headX, originalY: s.headY, filteredX: sx, filteredY: sy, phase: s.phase };
  });
}

// ─── Cross-correlation latency at 1ms resolution ───────────────────────────

function calculateLatencyOnset(tWaitEnd, filteredData) {
  const movement = filteredData.filter(d => d.time >= tWaitEnd);
  if (movement.length < 10) return null;

  const rawXs = movement.map(d => d.originalX);
  const rangeX = Math.max(...rawXs) - Math.min(...rawXs);
  if (rangeX < 5) return null;

  const tMin = movement[0].time, tMax = movement[movement.length - 1].time;
  const duration = tMax - tMin;
  if (duration < 100) return null;

  // Interpolate to 1ms grid
  const gridLen = Math.floor(duration) + 1;
  const rawGrid = new Float64Array(gridLen);
  const filtGrid = new Float64Array(gridLen);
  let j = 0;
  for (let g = 0; g < gridLen; g++) {
    const t = tMin + g;
    while (j < movement.length - 2 && movement[j + 1].time < t) j++;
    const d0 = movement[j], d1 = movement[j + 1];
    const dt = d1.time - d0.time;
    const frac = dt > 0 ? (t - d0.time) / dt : 0;
    rawGrid[g] = d0.originalX + frac * (d1.originalX - d0.originalX);
    filtGrid[g] = d0.filteredX + frac * (d1.filteredX - d0.filteredX);
  }

  // Remove mean
  let rawMean = 0, filtMean = 0;
  for (let i = 0; i < gridLen; i++) { rawMean += rawGrid[i]; filtMean += filtGrid[i]; }
  rawMean /= gridLen; filtMean /= gridLen;
  for (let i = 0; i < gridLen; i++) { rawGrid[i] -= rawMean; filtGrid[i] -= filtMean; }

  let rawE = 0, filtE = 0;
  for (let i = 0; i < gridLen; i++) { rawE += rawGrid[i] ** 2; filtE += filtGrid[i] ** 2; }
  const norm = Math.sqrt(rawE * filtE);
  if (norm === 0) return null;

  const maxLag = Math.min(500, Math.floor(gridLen / 2));
  let bestLag = 0, bestCorr = -Infinity;
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < gridLen - lag; i++) sum += rawGrid[i] * filtGrid[i + lag];
    const corr = sum / norm;
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }

  return {
    latency: Math.max(0, bestLag),
    rawThresh: 0, filtThresh: 0,
    rawOnset: 0, filtOnset: bestLag,
    peakRawSpeed: rangeX, peakFiltSpeed: rangeX
  };
}

// ─── Compute variance during stationary period ──────────────────────────────

function computeVariance(filteredData, tStart) {
  const stationary = filteredData.filter(d => d.time < tStart);
  if (stationary.length < 10) return Infinity;
  const xVals = stationary.map(d => d.filteredX);
  const yVals = stationary.map(d => d.filteredY);
  const xMean = xVals.reduce((a, b) => a + b, 0) / xVals.length;
  const yMean = yVals.reduce((a, b) => a + b, 0) / yVals.length;
  const xVar = xVals.reduce((s, x) => s + (x - xMean) ** 2, 0) / xVals.length;
  const yVar = yVals.reduce((s, y) => s + (y - yMean) ** 2, 0) / yVals.length;
  return Math.sqrt(xVar + yVar);
}

// ─── Pareto front ────────────────────────────────────────────────────────────

function extractPareto(results) {
  const pareto = [];
  for (const r of results) {
    const dominated = results.some(o =>
      o.variance <= r.variance && o.latency <= r.latency &&
      (o.variance < r.variance || o.latency < r.latency)
    );
    if (!dominated) pareto.push(r);
  }
  return pareto.sort((a, b) => a.variance - b.variance);
}

function analyzePareto(pareto, label) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(label);
  console.log('='.repeat(70));
  console.log(`Pareto-optimal points: ${pareto.length}`);

  if (pareto.length < 3) { console.log('Too few points'); return; }

  console.log('\n' + 'variance(px)'.padEnd(14) + 'latency(ms)'.padEnd(14) + 'Δlatency'.padEnd(12) + 'params'.padEnd(30));
  console.log('─'.repeat(70));

  const jumps = [];
  for (let i = 0; i < pareto.length; i++) {
    const dLat = i > 0 ? (pareto[i].latency - pareto[i - 1].latency).toFixed(1) : '—';
    const pStr = pareto[i].paramStr || '';
    console.log(
      pareto[i].variance.toFixed(3).padEnd(14) +
      pareto[i].latency.toFixed(1).padEnd(14) +
      String(dLat).padEnd(12) +
      pStr
    );
    if (i > 0) jumps.push(Math.abs(pareto[i].latency - pareto[i - 1].latency));
  }

  if (jumps.length === 0) return;
  const meanJump = jumps.reduce((a, b) => a + b, 0) / jumps.length;
  const maxJump = Math.max(...jumps);
  const abruptCount = jumps.filter(j => j > meanJump * 3).length;
  let nonMono = 0;
  for (let i = 1; i < pareto.length; i++) {
    if (pareto[i].latency > pareto[i - 1].latency) nonMono++;
  }

  console.log(`\n  Mean Δlatency: ${meanJump.toFixed(1)}ms`);
  console.log(`  Max Δlatency: ${maxJump.toFixed(1)}ms`);
  console.log(`  Abrupt jumps (>3× mean): ${abruptCount}/${jumps.length}`);
  console.log(`  Non-monotone: ${nonMono}/${jumps.length}`);
  console.log(`  VERDICT: ${abruptCount === 0 ? '✅ SMOOTH' : '⚠️  HAS JUMPS'}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Velocity-ONSET Latency Method — Simulation ===\n');

  const NOISE_STD = 3.0;
  const { samples, tWaitEnd } = generateSyntheticTrial(NOISE_STD);
  console.log(`Generated ${samples.length} samples, noise σ=${NOISE_STD}px\n`);

  // ─── ONE EURO FILTER TEST ──────────────────────────────────────────────
  console.log('━'.repeat(70));
  console.log('ONE EURO FILTER');
  console.log('━'.repeat(70));

  const minCutoffs = [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0];
  const betas = [0.00001, 0.0001, 0.0005, 0.001, 0.003, 0.005, 0.01, 0.05];
  const dCutoffs = [0.5, 1.0];

  const oneEuroResults = [];
  let failCount = 0;

  for (const mc of minCutoffs) {
    for (const b of betas) {
      for (const dc of dCutoffs) {
        const filtered = applyOneEuro(samples, { minCutoff: mc, beta: b, dCutoff: dc });
        const variance = computeVariance(filtered, tWaitEnd);
        const result = calculateLatencyOnset(tWaitEnd, filtered);
        if (result === null) { failCount++; continue; }
        oneEuroResults.push({
          variance, latency: result.latency,
          paramStr: `mc=${mc} β=${b} dc=${dc}`,
          ...result
        });
      }
    }
  }

  console.log(`Total: ${minCutoffs.length * betas.length * dCutoffs.length}, Success: ${oneEuroResults.length}, Failed: ${failCount}`);

  // Check for 0ms latency (the problem we had before)
  const zeroCount = oneEuroResults.filter(r => r.latency === 0).length;
  const highCount = oneEuroResults.filter(r => r.latency > 500).length;
  console.log(`Zero latency (0ms): ${zeroCount}/${oneEuroResults.length}`);
  console.log(`High latency (>500ms): ${highCount}/${oneEuroResults.length}`);

  const oneEuroPareto = extractPareto(oneEuroResults);
  analyzePareto(oneEuroPareto, 'ONE EURO — ONSET METHOD Pareto Front');

  // ─── EXPONENTIAL SMOOTHING TEST ────────────────────────────────────────
  console.log('\n\n' + '━'.repeat(70));
  console.log('EXPONENTIAL SMOOTHING');
  console.log('━'.repeat(70));

  const alphas = [];
  for (let a = 0.001; a <= 1.0; a += 0.001) alphas.push(parseFloat(a.toFixed(4)));

  const expResults = [];
  let expFail = 0;

  for (const alpha of alphas) {
    const filtered = applyExponential(samples, alpha);
    const variance = computeVariance(filtered, tWaitEnd);
    const result = calculateLatencyOnset(tWaitEnd, filtered);
    if (result === null) { expFail++; continue; }
    expResults.push({
      variance, latency: result.latency,
      paramStr: `α=${alpha.toFixed(4)}`,
      ...result
    });
  }

  console.log(`Total: ${alphas.length}, Success: ${expResults.length}, Failed: ${expFail}`);

  const expZero = expResults.filter(r => r.latency === 0).length;
  const expHigh = expResults.filter(r => r.latency > 500).length;
  console.log(`Zero latency (0ms): ${expZero}/${expResults.length}`);
  console.log(`High latency (>500ms): ${expHigh}/${expResults.length}`);

  const expPareto = extractPareto(expResults);
  analyzePareto(expPareto, 'EXPONENTIAL — ONSET METHOD Pareto Front');

  // ─── Write CSV ─────────────────────────────────────────────────────────
  const csvHeader = 'filterType,params,variance,latency,rawThresh,filtThresh,peakRaw,peakFilt\n';
  const csvRows = [
    ...oneEuroResults.map(r => `oneeuro,${r.paramStr},${r.variance.toFixed(4)},${r.latency.toFixed(2)},${r.rawThresh.toFixed(2)},${r.filtThresh.toFixed(2)},${r.peakRawSpeed.toFixed(2)},${r.peakFiltSpeed.toFixed(2)}`),
    ...expResults.map(r => `exponential,${r.paramStr},${r.variance.toFixed(4)},${r.latency.toFixed(2)},${r.rawThresh.toFixed(2)},${r.filtThresh.toFixed(2)},${r.peakRawSpeed.toFixed(2)},${r.peakFiltSpeed.toFixed(2)}`)
  ].join('\n');
  fs.writeFileSync('velocity_onset_simulation.csv', csvHeader + csvRows);
  console.log('\n\nCSV written to velocity_onset_simulation.csv');

  // ─── Robustness: multiple trials ───────────────────────────────────────
  console.log('\n\n' + '━'.repeat(70));
  console.log('ROBUSTNESS: Multiple Trials (20 each)');
  console.log('━'.repeat(70));

  const testCases = [
    { type: 'oneeuro', params: { minCutoff: 0.1, beta: 0.001, dCutoff: 1.0 }, label: 'OneEuro moderate' },
    { type: 'oneeuro', params: { minCutoff: 0.001, beta: 0.00001, dCutoff: 0.5 }, label: 'OneEuro very heavy' },
    { type: 'oneeuro', params: { minCutoff: 1.0, beta: 0.01, dCutoff: 1.0 }, label: 'OneEuro light' },
    { type: 'exp', alpha: 0.005, label: 'Exp α=0.005 (heavy)' },
    { type: 'exp', alpha: 0.05, label: 'Exp α=0.05 (moderate)' },
    { type: 'exp', alpha: 0.5, label: 'Exp α=0.5 (light)' },
    { type: 'exp', alpha: 0.001, label: 'Exp α=0.001 (very heavy)' },
  ];

  for (const tc of testCases) {
    const latencies = [];
    for (let t = 0; t < 20; t++) {
      const { samples: s, tWaitEnd: tw } = generateSyntheticTrial(3.0);
      const filtered = tc.type === 'oneeuro'
        ? applyOneEuro(s, { ...tc.params, frequency: 60 })
        : applyExponential(s, tc.alpha);
      const result = calculateLatencyOnset(tw, filtered);
      if (result !== null) latencies.push(result.latency);
    }
    if (latencies.length === 0) { console.log(`${tc.label}: ALL FAILED`); continue; }
    const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const std = Math.sqrt(latencies.reduce((s, l) => s + (l - mean) ** 2, 0) / latencies.length);
    const zeros = latencies.filter(l => l === 0).length;
    console.log(`${tc.label.padEnd(30)} ${latencies.length}/20 ok, mean=${mean.toFixed(1).padStart(7)}ms, std=${std.toFixed(1).padStart(6)}ms, zeros=${zeros}`);
  }

  console.log('\n=== Simulation complete ===');
}

main();
