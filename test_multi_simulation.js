/**
 * Multiple simulations with different noise levels, movement distances,
 * and movement speeds to stress-test the 20%-of-peak onset latency method.
 *
 * Run: node test_multi_simulation.js
 */

const fs = require('fs');

// ─── Inline One Euro Filter ─────────────────────────────────────────────────

class LowPassFilter {
  constructor(alpha, initval = 0.0) {
    this.y = this.s = initval; this.a = alpha; this.initialized = false;
  }
  filter(value) {
    let result;
    if (this.initialized) result = this.a * value + (1.0 - this.a) * this.s;
    else { result = value; this.initialized = true; }
    this.y = value; this.s = result; return result;
  }
  filterWithAlpha(value, alpha) { this.a = alpha; return this.filter(value); }
  hasLastRawValue() { return this.initialized; }
  lastFilteredValue() { return this.s; }
}

class OneEuroFilter2D {
  alpha(cutoff) {
    const te = 1.0 / this.freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }
  constructor(freq, mc = 1.0, beta = 0.0, dc = 1.0) {
    this.freq = freq; this.mincutoff = mc; this.beta_ = beta; this.dcutoff = dc;
    this.xFilter = new LowPassFilter(this.alpha(mc));
    this.yFilter = new LowPassFilter(this.alpha(mc));
    this.dxFilter = new LowPassFilter(this.alpha(dc));
    this.dyFilter = new LowPassFilter(this.alpha(dc));
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

function gaussRandom(mean = 0, std = 1) {
  return mean + std * Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

// ─── Configurable synthetic trial ────────────────────────────────────────────

function generateTrial({ noiseStd = 3, distance = 300, moveDuration = 600, fps = 60 }) {
  const dt = 1000 / fps;
  const stationaryDuration = 2000;
  const settleDuration = 2000;
  const totalDuration = stationaryDuration + moveDuration + settleDuration;
  const tWaitEnd = stationaryDuration;
  const startX = 500, startY = 400;
  const endX = startX + distance, endY = startY;

  const samples = [];
  for (let t = 0; t <= totalDuration; t += dt) {
    let trueX, trueY;
    if (t < stationaryDuration) { trueX = startX; trueY = startY; }
    else if (t < stationaryDuration + moveDuration) {
      const p = (t - stationaryDuration) / moveDuration;
      const s = 1 / (1 + Math.exp(-12 * (p - 0.5)));
      trueX = startX + distance * s; trueY = startY;
    } else { trueX = endX; trueY = endY; }
    samples.push({
      time: t,
      headX: trueX + gaussRandom(0, noiseStd),
      headY: trueY + gaussRandom(0, noiseStd),
      phase: t < stationaryDuration ? 'variance_measurement' : 'latency_measurement'
    });
  }
  return { samples, tWaitEnd };
}

// ─── Filters ─────────────────────────────────────────────────────────────────

function applyOneEuro(samples, params) {
  const f = new OneEuroFilter2D(params.frequency || 60, params.minCutoff, params.beta, params.dCutoff);
  return samples.map(s => {
    const r = f.filter(s.headX, s.headY, s.time / 1000);
    return { time: s.time, originalX: s.headX, originalY: s.headY, filteredX: r.x, filteredY: r.y };
  });
}

function applyExponential(samples, alpha) {
  let sx = samples[0].headX, sy = samples[0].headY;
  return samples.map((s, i) => {
    if (i > 0) { sx = alpha * s.headX + (1 - alpha) * sx; sy = alpha * s.headY + (1 - alpha) * sy; }
    return { time: s.time, originalX: s.headX, originalY: s.headY, filteredX: sx, filteredY: sy };
  });
}

// ─── 20%-of-peak onset latency ───────────────────────────────────────────────

function calcLatency(tWaitEnd, filteredData) {
  const velocities = [];
  for (let i = 1; i < filteredData.length; i++) {
    const dt = (filteredData[i].time - filteredData[i - 1].time) / 1000;
    if (dt <= 0) continue;
    const rawDx = filteredData[i].originalX - filteredData[i - 1].originalX;
    const rawDy = filteredData[i].originalY - filteredData[i - 1].originalY;
    const rawSpeed = Math.sqrt(rawDx * rawDx + rawDy * rawDy) / dt;
    const filtDx = filteredData[i].filteredX - filteredData[i - 1].filteredX;
    const filtDy = filteredData[i].filteredY - filteredData[i - 1].filteredY;
    const filtSpeed = Math.sqrt(filtDx * filtDx + filtDy * filtDy) / dt;
    velocities.push({ time: filteredData[i].time, rawSpeed, filtSpeed });
  }

  const mov = velocities.filter(v => v.time >= tWaitEnd);
  if (mov.length < 5) return null;

  let peakRaw = 0, peakRawI = 0, peakFilt = 0, peakFiltI = 0;
  for (let i = 0; i < mov.length; i++) {
    if (mov[i].rawSpeed > peakRaw) { peakRaw = mov[i].rawSpeed; peakRawI = i; }
    if (mov[i].filtSpeed > peakFilt) { peakFilt = mov[i].filtSpeed; peakFiltI = i; }
  }
  if (peakRaw < 10) return null;

  const rawTh = 0.20 * peakRaw;
  const filtTh = 0.20 * peakFilt;

  const findCross = (samples, peakIdx, threshold, key) => {
    for (let i = peakIdx; i > 0; i--) {
      if (samples[i][key] <= threshold) {
        const c = samples[i], n = samples[i + 1];
        const dv = n[key] - c[key];
        if (dv > 0) return c.time + ((threshold - c[key]) / dv) * (n.time - c.time);
        return n.time;
      }
    }
    return samples[0].time;
  };

  const rawT = findCross(mov, peakRawI, rawTh, 'rawSpeed');
  const filtT = findCross(mov, peakFiltI, filtTh, 'filtSpeed');
  return Math.max(0, filtT - rawT);
}

function computeVariance(filteredData, tStart) {
  const st = filteredData.filter(d => d.time < tStart);
  if (st.length < 10) return Infinity;
  const xV = st.map(d => d.filteredX), yV = st.map(d => d.filteredY);
  const xM = xV.reduce((a, b) => a + b, 0) / xV.length;
  const yM = yV.reduce((a, b) => a + b, 0) / yV.length;
  const xVar = xV.reduce((s, x) => s + (x - xM) ** 2, 0) / xV.length;
  const yVar = yV.reduce((s, y) => s + (y - yM) ** 2, 0) / yV.length;
  return Math.sqrt(xVar + yVar);
}

function extractPareto(results) {
  const p = [];
  for (const r of results) {
    if (!results.some(o => o.variance <= r.variance && o.latency <= r.latency &&
        (o.variance < r.variance || o.latency < r.latency))) p.push(r);
  }
  return p.sort((a, b) => a.variance - b.variance);
}

// ─── Run a single scenario ───────────────────────────────────────────────────

function runScenario(label, trialOpts, filterType) {
  const NUM_TRIALS = 10;
  const allResults = [];

  // Generate multiple trials
  const trials = [];
  for (let t = 0; t < NUM_TRIALS; t++) trials.push(generateTrial(trialOpts));

  if (filterType === 'oneeuro') {
    const minCutoffs = [0.001, 0.01, 0.05, 0.1, 0.5, 1.0];
    const betas = [0.00001, 0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05];
    const dCutoffs = [1.0];

    for (const mc of minCutoffs) {
      for (const b of betas) {
        for (const dc of dCutoffs) {
          const latencies = [];
          const variances = [];
          let fails = 0;
          for (const trial of trials) {
            const filtered = applyOneEuro(trial.samples, { minCutoff: mc, beta: b, dCutoff: dc });
            const v = computeVariance(filtered, trial.tWaitEnd);
            const l = calcLatency(trial.tWaitEnd, filtered);
            if (l === null) { fails++; continue; }
            latencies.push(l);
            variances.push(v);
          }
          if (latencies.length === 0) continue;
          const meanLat = latencies.reduce((a, b) => a + b, 0) / latencies.length;
          const meanVar = variances.reduce((a, b) => a + b, 0) / variances.length;
          allResults.push({ variance: meanVar, latency: meanLat, paramStr: `mc=${mc} β=${b}` });
        }
      }
    }
  } else {
    const alphas = [];
    for (let a = 0.001; a <= 0.5; a += 0.002) alphas.push(parseFloat(a.toFixed(4)));

    for (const alpha of alphas) {
      const latencies = [];
      const variances = [];
      for (const trial of trials) {
        const filtered = applyExponential(trial.samples, alpha);
        const v = computeVariance(filtered, trial.tWaitEnd);
        const l = calcLatency(trial.tWaitEnd, filtered);
        if (l === null) continue;
        latencies.push(l);
        variances.push(v);
      }
      if (latencies.length === 0) continue;
      const meanLat = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const meanVar = variances.reduce((a, b) => a + b, 0) / variances.length;
      allResults.push({ variance: meanVar, latency: meanLat, paramStr: `α=${alpha.toFixed(4)}` });
    }
  }

  // Analyze
  const pareto = extractPareto(allResults);
  const totalZeros = allResults.filter(r => r.latency === 0).length;
  const totalHigh = allResults.filter(r => r.latency > 500).length;
  const successRate = allResults.length;

  let maxJump = 0, meanJump = 0, abruptCount = 0;
  if (pareto.length >= 3) {
    const jumps = [];
    for (let i = 1; i < pareto.length; i++)
      jumps.push(Math.abs(pareto[i].latency - pareto[i - 1].latency));
    meanJump = jumps.reduce((a, b) => a + b, 0) / jumps.length;
    maxJump = Math.max(...jumps);
    abruptCount = jumps.filter(j => j > meanJump * 3).length;
  }

  const latRange = allResults.length > 0
    ? `${Math.min(...allResults.map(r => r.latency)).toFixed(1)}-${Math.max(...allResults.map(r => r.latency)).toFixed(1)}ms`
    : 'N/A';

  return {
    label, successRate, totalZeros, totalHigh,
    paretoSize: pareto.length, meanJump, maxJump, abruptCount, latRange,
    pareto
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   MULTI-SCENARIO STRESS TEST — 20%-of-Peak Onset Method        ║');
  console.log('║   Each scenario: 10 random trials averaged per parameter set   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const scenarios = [
    // Vary noise level
    { label: 'OneEuro | noise=1px, dist=300, speed=normal',  opts: { noiseStd: 1, distance: 300, moveDuration: 600 }, filter: 'oneeuro' },
    { label: 'OneEuro | noise=3px, dist=300, speed=normal',  opts: { noiseStd: 3, distance: 300, moveDuration: 600 }, filter: 'oneeuro' },
    { label: 'OneEuro | noise=8px, dist=300, speed=normal',  opts: { noiseStd: 8, distance: 300, moveDuration: 600 }, filter: 'oneeuro' },
    { label: 'OneEuro | noise=15px, dist=300, speed=normal', opts: { noiseStd: 15, distance: 300, moveDuration: 600 }, filter: 'oneeuro' },

    // Vary movement distance
    { label: 'OneEuro | noise=3px, dist=100, speed=normal',  opts: { noiseStd: 3, distance: 100, moveDuration: 600 }, filter: 'oneeuro' },
    { label: 'OneEuro | noise=3px, dist=500, speed=normal',  opts: { noiseStd: 3, distance: 500, moveDuration: 600 }, filter: 'oneeuro' },
    { label: 'OneEuro | noise=3px, dist=800, speed=normal',  opts: { noiseStd: 3, distance: 800, moveDuration: 600 }, filter: 'oneeuro' },

    // Vary movement speed
    { label: 'OneEuro | noise=3px, dist=300, speed=fast',    opts: { noiseStd: 3, distance: 300, moveDuration: 300 }, filter: 'oneeuro' },
    { label: 'OneEuro | noise=3px, dist=300, speed=slow',    opts: { noiseStd: 3, distance: 300, moveDuration: 1200 }, filter: 'oneeuro' },

    // Exponential smoothing scenarios
    { label: 'Exp     | noise=1px, dist=300, speed=normal',  opts: { noiseStd: 1, distance: 300, moveDuration: 600 }, filter: 'exp' },
    { label: 'Exp     | noise=3px, dist=300, speed=normal',  opts: { noiseStd: 3, distance: 300, moveDuration: 600 }, filter: 'exp' },
    { label: 'Exp     | noise=8px, dist=300, speed=normal',  opts: { noiseStd: 8, distance: 300, moveDuration: 600 }, filter: 'exp' },
    { label: 'Exp     | noise=15px, dist=300, speed=normal', opts: { noiseStd: 15, distance: 300, moveDuration: 600 }, filter: 'exp' },
    { label: 'Exp     | noise=3px, dist=100, speed=normal',  opts: { noiseStd: 3, distance: 100, moveDuration: 600 }, filter: 'exp' },
    { label: 'Exp     | noise=3px, dist=300, speed=fast',    opts: { noiseStd: 3, distance: 300, moveDuration: 300 }, filter: 'exp' },
    { label: 'Exp     | noise=3px, dist=300, speed=slow',    opts: { noiseStd: 3, distance: 300, moveDuration: 1200 }, filter: 'exp' },
  ];

  // Header
  console.log(
    'Scenario'.padEnd(52) +
    'Params'.padEnd(8) +
    'Zeros'.padEnd(7) +
    '>500ms'.padEnd(8) +
    'Pareto'.padEnd(8) +
    'MeanΔ'.padEnd(8) +
    'MaxΔ'.padEnd(8) +
    'Abrupt'.padEnd(8) +
    'LatRange'.padEnd(18)
  );
  console.log('─'.repeat(125));

  const allScenarioResults = [];

  for (const sc of scenarios) {
    const r = runScenario(sc.label, sc.opts, sc.filter);
    allScenarioResults.push(r);
    console.log(
      r.label.padEnd(52) +
      String(r.successRate).padEnd(8) +
      String(r.totalZeros).padEnd(7) +
      String(r.totalHigh).padEnd(8) +
      String(r.paretoSize).padEnd(8) +
      r.meanJump.toFixed(1).padStart(5).padEnd(8) +
      r.maxJump.toFixed(1).padStart(5).padEnd(8) +
      String(r.abruptCount).padEnd(8) +
      r.latRange.padEnd(18)
    );
  }

  // Summary
  console.log('\n' + '═'.repeat(125));
  console.log('SUMMARY');
  console.log('═'.repeat(125));

  const totalScenarios = allScenarioResults.length;
  const smoothScenarios = allScenarioResults.filter(r => r.abruptCount === 0).length;
  const anyHighLatency = allScenarioResults.some(r => r.totalHigh > 0);
  const totalParams = allScenarioResults.reduce((s, r) => s + r.successRate, 0);
  const totalZeros = allScenarioResults.reduce((s, r) => s + r.totalZeros, 0);

  console.log(`Scenarios tested: ${totalScenarios}`);
  console.log(`Perfectly smooth Pareto (0 abrupt jumps): ${smoothScenarios}/${totalScenarios}`);
  console.log(`Any >500ms latency outliers: ${anyHighLatency ? 'YES ⚠️' : 'NO ✅'}`);
  console.log(`Total parameter evaluations: ${totalParams}`);
  console.log(`Total zero-latency results: ${totalZeros}/${totalParams} (${(totalZeros/totalParams*100).toFixed(1)}%)`);

  // Print a few Pareto fronts in detail
  console.log('\n\n' + '━'.repeat(70));
  console.log('DETAILED PARETO: OneEuro noise=3px dist=300 normal speed');
  console.log('━'.repeat(70));
  const detail1 = allScenarioResults.find(r => r.label.includes('OneEuro') && r.label.includes('noise=3px') && r.label.includes('dist=300') && r.label.includes('normal'));
  if (detail1) {
    for (const p of detail1.pareto) {
      console.log(`  var=${p.variance.toFixed(3).padEnd(8)} lat=${p.latency.toFixed(1).padStart(7)}ms  ${p.paramStr}`);
    }
  }

  console.log('\n' + '━'.repeat(70));
  console.log('DETAILED PARETO: Exp noise=3px dist=300 normal speed');
  console.log('━'.repeat(70));
  const detail2 = allScenarioResults.find(r => r.label.includes('Exp') && r.label.includes('noise=3px') && r.label.includes('dist=300') && r.label.includes('normal'));
  if (detail2) {
    for (const p of detail2.pareto.slice(0, 30)) {
      console.log(`  var=${p.variance.toFixed(3).padEnd(8)} lat=${p.latency.toFixed(1).padStart(7)}ms  ${p.paramStr}`);
    }
    if (detail2.pareto.length > 30) console.log(`  ... and ${detail2.pareto.length - 30} more`);
  }

  console.log('\n=== All simulations complete ===');
}

main();
