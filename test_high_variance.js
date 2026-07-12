/**
 * Test the 20%-of-peak onset method with HIGH VARIANCE conditions
 * matching the professor's real data (variance 5-45px).
 *
 * The real data had variance 5-45px across different filter params.
 * Raw head-tracking noise must be very high (~30-50px std) to produce
 * filtered variance of 45px even with light filtering.
 *
 * Run: node test_high_variance.js
 */

// ─── Inline filters (same as before) ────────────────────────────────────────

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

function generateTrial(noiseStd, distance = 300, moveDuration = 600) {
  const dt = 1000 / 60;
  const stationaryDuration = 2000;
  const settleDuration = 2000;
  const totalDuration = stationaryDuration + moveDuration + settleDuration;
  const startX = 500, startY = 400;
  const samples = [];
  for (let t = 0; t <= totalDuration; t += dt) {
    let trueX, trueY;
    if (t < stationaryDuration) { trueX = startX; trueY = startY; }
    else if (t < stationaryDuration + moveDuration) {
      const p = (t - stationaryDuration) / moveDuration;
      const s = 1 / (1 + Math.exp(-12 * (p - 0.5)));
      trueX = startX + distance * s; trueY = startY;
    } else { trueX = startX + distance; trueY = startY; }
    samples.push({
      time: t, headX: trueX + gaussRandom(0, noiseStd), headY: trueY + gaussRandom(0, noiseStd)
    });
  }
  return { samples, tWaitEnd: stationaryDuration };
}

function applyOneEuro(samples, params) {
  const f = new OneEuroFilter2D(60, params.minCutoff, params.beta, params.dCutoff);
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

function calcLatency(tWaitEnd, filteredData) {
  const rawVelocities = [];
  for (let i = 1; i < filteredData.length; i++) {
    const dt = (filteredData[i].time - filteredData[i - 1].time) / 1000;
    if (dt <= 0) continue;
    const rawSpeed = Math.sqrt(
      (filteredData[i].originalX - filteredData[i - 1].originalX) ** 2 +
      (filteredData[i].originalY - filteredData[i - 1].originalY) ** 2
    ) / dt;
    const filtSpeed = Math.sqrt(
      (filteredData[i].filteredX - filteredData[i - 1].filteredX) ** 2 +
      (filteredData[i].filteredY - filteredData[i - 1].filteredY) ** 2
    ) / dt;
    rawVelocities.push({ time: filteredData[i].time, rawSpeed, filtSpeed });
  }

  const SMOOTH_WINDOW = 5;
  const halfW = Math.floor(SMOOTH_WINDOW / 2);
  const velocities = [];
  for (let i = halfW; i < rawVelocities.length - halfW; i++) {
    let rawSum = 0, filtSum = 0;
    for (let j = i - halfW; j <= i + halfW; j++) {
      rawSum += rawVelocities[j].rawSpeed;
      filtSum += rawVelocities[j].filtSpeed;
    }
    velocities.push({
      time: rawVelocities[i].time,
      rawSpeed: rawSum / SMOOTH_WINDOW,
      filtSpeed: filtSum / SMOOTH_WINDOW
    });
  }

  const mov = velocities.filter(v => v.time >= tWaitEnd);
  if (mov.length < 5) return null;

  // Single threshold from RAW peak
  let peakRaw = 0;
  for (let i = 0; i < mov.length; i++) {
    if (mov[i].rawSpeed > peakRaw) peakRaw = mov[i].rawSpeed;
  }
  if (peakRaw < 10) return null;

  const threshold = 0.20 * peakRaw;

  const findCross = (samples, thresh, key) => {
    let peakIdx = 0, peakVal = 0;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i][key] > peakVal) { peakVal = samples[i][key]; peakIdx = i; }
    }
    if (peakVal < thresh) return null;
    for (let i = peakIdx; i > 0; i--) {
      if (samples[i][key] <= thresh) {
        const c = samples[i], n = samples[i + 1];
        const dv = n[key] - c[key];
        if (dv > 0) return c.time + ((thresh - c[key]) / dv) * (n.time - c.time);
        return n.time;
      }
    }
    return samples[0].time;
  };

  const rawT = findCross(mov, threshold, 'rawSpeed');
  const filtT = findCross(mov, threshold, 'filtSpeed');
  if (rawT === null || filtT === null) return null;
  return Math.max(0, filtT - rawT);
}

function computeVariance(filteredData, tStart) {
  const st = filteredData.filter(d => d.time < tStart);
  if (st.length < 10) return Infinity;
  const xV = st.map(d => d.filteredX), yV = st.map(d => d.filteredY);
  const xM = xV.reduce((a, b) => a + b, 0) / xV.length;
  const yM = yV.reduce((a, b) => a + b, 0) / yV.length;
  return Math.sqrt(
    xV.reduce((s, x) => s + (x - xM) ** 2, 0) / xV.length +
    yV.reduce((s, y) => s + (y - yM) ** 2, 0) / yV.length
  );
}

function extractPareto(results) {
  const p = [];
  for (const r of results) {
    if (!results.some(o => o.variance <= r.variance && o.latency <= r.latency &&
        (o.variance < r.variance || o.latency < r.latency))) p.push(r);
  }
  return p.sort((a, b) => a.variance - b.variance);
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  HIGH VARIANCE TEST — Matching professor\'s real data (5-45px)   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Test multiple noise levels to find which produces 5-45px variance range
  console.log('Step 1: Finding noise level that produces 5-45px variance range\n');

  const noiseLevels = [10, 20, 30, 40, 50, 60];
  for (const noise of noiseLevels) {
    const { samples, tWaitEnd } = generateTrial(noise);
    // Light filter (high variance)
    const lightFiltered = applyOneEuro(samples, { minCutoff: 0.5, beta: 0.005, dCutoff: 1.0 });
    const lightVar = computeVariance(lightFiltered, tWaitEnd);
    // Heavy filter (low variance)
    const heavyFiltered = applyOneEuro(samples, { minCutoff: 0.001, beta: 0.00001, dCutoff: 0.5 });
    const heavyVar = computeVariance(heavyFiltered, tWaitEnd);
    // Raw (no filter)
    const rawVar = computeVariance(samples.map(s => ({
      time: s.time, filteredX: s.headX, filteredY: s.headY
    })), tWaitEnd);
    console.log(`  noise=${String(noise).padStart(2)}px → raw var=${rawVar.toFixed(1)}px, heavy filter=${heavyVar.toFixed(1)}px, light filter=${lightVar.toFixed(1)}px`);
  }

  // Use noise=40px which should give ~5-45px variance range
  const NOISE = 40;
  const NUM_TRIALS = 10;
  console.log(`\nUsing noise=${NOISE}px for main test (${NUM_TRIALS} trials averaged)\n`);

  // Generate trials
  const trials = [];
  for (let t = 0; t < NUM_TRIALS; t++) trials.push(generateTrial(NOISE));

  // ─── ONE EURO ──────────────────────────────────────────────────────────
  console.log('━'.repeat(70));
  console.log('ONE EURO FILTER — High Variance');
  console.log('━'.repeat(70));

  const minCutoffs = [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0];
  const betas = [0.00001, 0.0001, 0.0005, 0.001, 0.003, 0.005, 0.01, 0.05];
  const dCutoffs = [0.5, 1.0];

  const oeResults = [];
  let oeFail = 0;
  for (const mc of minCutoffs) {
    for (const b of betas) {
      for (const dc of dCutoffs) {
        const lats = [], vars = [];
        for (const trial of trials) {
          const filtered = applyOneEuro(trial.samples, { minCutoff: mc, beta: b, dCutoff: dc });
          const v = computeVariance(filtered, trial.tWaitEnd);
          const l = calcLatency(trial.tWaitEnd, filtered);
          if (l === null) { oeFail++; continue; }
          lats.push(l); vars.push(v);
        }
        if (lats.length === 0) continue;
        oeResults.push({
          variance: vars.reduce((a, b) => a + b, 0) / vars.length,
          latency: lats.reduce((a, b) => a + b, 0) / lats.length,
          paramStr: `mc=${mc} β=${b} dc=${dc}`
        });
      }
    }
  }

  console.log(`Params tested: ${oeResults.length}, Failed: ${oeFail}`);
  console.log(`Variance range: ${Math.min(...oeResults.map(r => r.variance)).toFixed(1)} – ${Math.max(...oeResults.map(r => r.variance)).toFixed(1)}px`);
  console.log(`Latency range: ${Math.min(...oeResults.map(r => r.latency)).toFixed(1)} – ${Math.max(...oeResults.map(r => r.latency)).toFixed(1)}ms`);
  console.log(`Zero latency: ${oeResults.filter(r => r.latency === 0).length}/${oeResults.length}`);
  console.log(`>500ms latency: ${oeResults.filter(r => r.latency > 500).length}/${oeResults.length}`);

  const oePareto = extractPareto(oeResults);
  console.log(`\nPareto front: ${oePareto.length} points`);
  console.log('\n' + 'variance(px)'.padEnd(14) + 'latency(ms)'.padEnd(14) + 'Δlat'.padEnd(10) + 'params');
  console.log('─'.repeat(80));
  const oeJumps = [];
  for (let i = 0; i < oePareto.length; i++) {
    const dl = i > 0 ? (oePareto[i].latency - oePareto[i - 1].latency).toFixed(1) : '—';
    if (i > 0) oeJumps.push(Math.abs(oePareto[i].latency - oePareto[i - 1].latency));
    console.log(
      oePareto[i].variance.toFixed(2).padEnd(14) +
      oePareto[i].latency.toFixed(1).padEnd(14) +
      String(dl).padEnd(10) +
      oePareto[i].paramStr
    );
  }
  if (oeJumps.length > 0) {
    const mean = oeJumps.reduce((a, b) => a + b, 0) / oeJumps.length;
    const max = Math.max(...oeJumps);
    const abrupt = oeJumps.filter(j => j > mean * 3).length;
    console.log(`\n  Mean Δ: ${mean.toFixed(1)}ms, Max Δ: ${max.toFixed(1)}ms, Abrupt: ${abrupt}/${oeJumps.length}`);
    console.log(`  VERDICT: ${abrupt <= 2 ? '✅ SMOOTH (or near-smooth)' : '⚠️  HAS JUMPS'}`);
  }

  // ─── EXPONENTIAL ───────────────────────────────────────────────────────
  console.log('\n\n' + '━'.repeat(70));
  console.log('EXPONENTIAL SMOOTHING — High Variance');
  console.log('━'.repeat(70));

  const alphas = [];
  for (let a = 0.001; a <= 1.0; a += 0.001) alphas.push(parseFloat(a.toFixed(4)));

  const expResults = [];
  let expFail = 0;
  for (const alpha of alphas) {
    const lats = [], vars = [];
    for (const trial of trials) {
      const filtered = applyExponential(trial.samples, alpha);
      const v = computeVariance(filtered, trial.tWaitEnd);
      const l = calcLatency(trial.tWaitEnd, filtered);
      if (l === null) { expFail++; continue; }
      lats.push(l); vars.push(v);
    }
    if (lats.length === 0) continue;
    expResults.push({
      variance: vars.reduce((a, b) => a + b, 0) / vars.length,
      latency: lats.reduce((a, b) => a + b, 0) / lats.length,
      paramStr: `α=${alpha.toFixed(4)}`
    });
  }

  console.log(`Params tested: ${expResults.length}, Failed: ${expFail}`);
  console.log(`Variance range: ${Math.min(...expResults.map(r => r.variance)).toFixed(1)} – ${Math.max(...expResults.map(r => r.variance)).toFixed(1)}px`);
  console.log(`Latency range: ${Math.min(...expResults.map(r => r.latency)).toFixed(1)} – ${Math.max(...expResults.map(r => r.latency)).toFixed(1)}ms`);
  console.log(`Zero latency: ${expResults.filter(r => r.latency === 0).length}/${expResults.length}`);
  console.log(`>500ms latency: ${expResults.filter(r => r.latency > 500).length}/${expResults.length}`);

  const expPareto = extractPareto(expResults);
  console.log(`\nPareto front: ${expPareto.length} points`);

  // Show first 20 and last 10
  console.log('\n' + 'variance(px)'.padEnd(14) + 'latency(ms)'.padEnd(14) + 'Δlat'.padEnd(10) + 'params');
  console.log('─'.repeat(60));
  const expJumps = [];
  const showIdxs = new Set();
  for (let i = 0; i < Math.min(20, expPareto.length); i++) showIdxs.add(i);
  for (let i = Math.max(0, expPareto.length - 10); i < expPareto.length; i++) showIdxs.add(i);

  for (let i = 0; i < expPareto.length; i++) {
    const dl = i > 0 ? (expPareto[i].latency - expPareto[i - 1].latency).toFixed(1) : '—';
    if (i > 0) expJumps.push(Math.abs(expPareto[i].latency - expPareto[i - 1].latency));
    if (showIdxs.has(i)) {
      console.log(
        expPareto[i].variance.toFixed(2).padEnd(14) +
        expPareto[i].latency.toFixed(1).padEnd(14) +
        String(dl).padEnd(10) +
        expPareto[i].paramStr
      );
    } else if (showIdxs.has(i - 1)) {
      console.log(`  ... ${expPareto.length - 30} more rows ...`);
    }
  }
  if (expJumps.length > 0) {
    const mean = expJumps.reduce((a, b) => a + b, 0) / expJumps.length;
    const max = Math.max(...expJumps);
    const abrupt = expJumps.filter(j => j > mean * 3).length;
    console.log(`\n  Mean Δ: ${mean.toFixed(1)}ms, Max Δ: ${max.toFixed(1)}ms, Abrupt: ${abrupt}/${expJumps.length}`);
    console.log(`  VERDICT: ${abrupt <= 2 ? '✅ SMOOTH (or near-smooth)' : '⚠️  HAS JUMPS'}`);
  }

  console.log('\n=== High variance test complete ===');
}

main();
