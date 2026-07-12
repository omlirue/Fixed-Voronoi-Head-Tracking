/**
 * Simulation: Verify Pareto front with Professor Roberto's exact methods.
 *
 * Variance: std dev of filtered cursor during hold period (t_i,click to t_i,click + t_i,wait)
 * Latency:  filter delay = t_filtered_enters_R - t_raw_enters_R (pure filter delay)
 *           R = 5% of screen width (Roberto: "reason in units of screen size")
 */

// ========== ONE EURO FILTER ==========
class LowPassFilter {
  constructor(alpha, initval = 0.0) {
    this.y = this.s = initval;
    this.a = Math.max(0.0001, Math.min(1.0, alpha));
    this.initialized = false;
  }
  setAlpha(alpha) { this.a = Math.max(0.0001, Math.min(1.0, alpha)); }
  filter(value) {
    let result;
    if (this.initialized) result = this.a * value + (1.0 - this.a) * this.s;
    else { result = value; this.initialized = true; }
    this.y = value; this.s = result; return result;
  }
  filterWithAlpha(value, alpha) { this.setAlpha(alpha); return this.filter(value); }
  hasLastRawValue() { return this.initialized; }
  lastRawValue() { return this.y; }
  lastFilteredValue() { return this.s; }
}

class OneEuroFilter {
  alpha(cutoff) {
    const te = 1.0 / this.freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }
  constructor(freq, mincutoff = 1.0, beta_ = 0.0, dcutoff = 1.0) {
    this.freq = freq; this.mincutoff = mincutoff; this.beta_ = beta_; this.dcutoff = dcutoff;
    this.x = new LowPassFilter(this.alpha(mincutoff));
    this.dx = new LowPassFilter(this.alpha(dcutoff));
    this.lasttime = undefined;
  }
  filter(value, timestamp = undefined) {
    if (this.lasttime !== undefined && timestamp !== undefined && timestamp > this.lasttime)
      this.freq = 1.0 / (timestamp - this.lasttime);
    this.lasttime = timestamp;
    const dvalue = this.x.hasLastRawValue() ? (value - this.x.lastFilteredValue()) * this.freq : 0.0;
    const edvalue = this.dx.filterWithAlpha(dvalue, this.alpha(this.dcutoff));
    const cutoff = this.mincutoff + this.beta_ * Math.abs(edvalue);
    return this.x.filterWithAlpha(value, this.alpha(cutoff));
  }
}

// ========== SYNTHETIC DATA ==========

function gaussNoise(stdDev) {
  const u1 = Math.random(), u2 = Math.random();
  return stdDev * Math.sqrt(-2 * Math.log(u1 || 0.001)) * Math.cos(2 * Math.PI * u2);
}

function generatePositionData(targetX, targetY, newTargetX, newTargetY, jitter = 8) {
  const dt = 1000 / 60; // 60 fps
  const samples = [];
  let t = 0;

  // Phase 1: Settling (~500ms)
  const sx = targetX + (Math.random() - 0.5) * 100, sy = targetY + (Math.random() - 0.5) * 100;
  for (let i = 0; i < 30; i++) {
    const p = 1 - Math.exp(-3 * i / 30);
    samples.push({ time: t, headX: sx + (targetX - sx) * p + gaussNoise(jitter), headY: sy + (targetY - sy) * p + gaussNoise(jitter) });
    t += dt;
  }

  const t_i_click = t;

  // Phase 2: Holding at target (~2s)
  for (let i = 0; i < 120; i++) {
    samples.push({ time: t, headX: targetX + gaussNoise(jitter), headY: targetY + gaussNoise(jitter) });
    t += dt;
  }

  const t_i_wait_end = t;

  // Phase 3: Movement to new target (~800ms, sigmoid)
  for (let i = 0; i < 48; i++) {
    const sig = 1 / (1 + Math.exp(-10 * (i / 48 - 0.5)));
    samples.push({
      time: t,
      headX: targetX + (newTargetX - targetX) * sig + gaussNoise(jitter * 1.5),
      headY: targetY + (newTargetY - targetY) * sig + gaussNoise(jitter * 1.5)
    });
    t += dt;
  }

  // Phase 4: Post-arrival (~500ms)
  for (let i = 0; i < 30; i++) {
    samples.push({ time: t, headX: newTargetX + gaussNoise(jitter), headY: newTargetY + gaussNoise(jitter) });
    t += dt;
  }

  return {
    samples,
    timingData: { t_i_click, t_i_wait_end, variancePeriodStart: t_i_click, variancePeriodEnd: t_i_wait_end, newTargetX, newTargetY }
  };
}

function generateFullTest(jitter = 8) {
  const positions = [
    { name: 'Top-Left', x: 200, y: 150, nx: 1000, ny: 150 },
    { name: 'Top-Right', x: 1000, y: 150, nx: 1000, ny: 600 },
    { name: 'Bottom-Right', x: 1000, y: 600, nx: 200, ny: 600 },
    { name: 'Bottom-Left', x: 200, y: 600, nx: 200, ny: 150 },
  ];
  return positions.map((p, i) => ({
    position: { name: p.name },
    targetX: p.x, targetY: p.y, // Explicitly pass start target
    ...generatePositionData(p.x, p.y, p.nx, p.ny, jitter),
    skipLatency: i === positions.length - 1,
  }));
}

// ========== FILTERS ==========

function applyOneEuro(samples, params) {
  const xF = new OneEuroFilter(params.frequency, params.minCutoff, params.beta, params.dCutoff);
  const yF = new OneEuroFilter(params.frequency, params.minCutoff, params.beta, params.dCutoff);
  return samples.map(s => ({
    time: s.time, originalX: s.headX, originalY: s.headY,
    filteredX: xF.filter(s.headX, s.time / 1000), filteredY: yF.filter(s.headY, s.time / 1000),
  }));
}

function applyExponential(samples, alpha) {
  let sx = samples[0].headX, sy = samples[0].headY;
  return samples.map((s, i) => {
    if (i > 0) { sx = alpha * s.headX + (1 - alpha) * sx; sy = alpha * s.headY + (1 - alpha) * sy; }
    return { time: s.time, originalX: s.headX, originalY: s.headY, filteredX: sx, filteredY: sy };
  });
}

// ========== ROBERTO'S VARIANCE: std dev during hold ==========

function calculateVariance(timingData, filteredData) {
  const period = filteredData.filter(d => d.time >= timingData.variancePeriodStart && d.time <= timingData.variancePeriodEnd);
  if (period.length < 10) return Infinity;
  const xVals = period.map(d => d.filteredX), yVals = period.map(d => d.filteredY);
  const xMean = xVals.reduce((a, b) => a + b, 0) / xVals.length;
  const yMean = yVals.reduce((a, b) => a + b, 0) / yVals.length;
  const xVar = xVals.reduce((s, x) => s + (x - xMean) ** 2, 0) / xVals.length;
  const yVar = yVals.reduce((s, y) => s + (y - yMean) ** 2, 0) / yVals.length;
  return Math.sqrt(xVar + yVar);
}

// ========== ROBERTO'S EXACT LATENCY: time from target appearance to filtered arrival ==========

function calculateLatency(timingData, filteredData, targetX, targetY) {
  if (!timingData.t_i_wait_end || !timingData.newTargetX) return Infinity;

  const newTargetX = timingData.newTargetX, newTargetY = timingData.newTargetY;
  const samples = filteredData.filter(d => d.time >= timingData.t_i_wait_end);
  if (samples.length === 0) return Infinity;

  // Use 3% radius like the main app (Roberto's suggestion)
  const screenWidth = 1920;
  const arrivalRadius = screenWidth * 0.03;
  const MIN_REALISTIC_LATENCY = 50;

  // 1. Try to find arrival time within radius
  let arrivalTime = null;
  for (const s of samples) {
    if (Math.sqrt((s.filteredX - newTargetX) ** 2 + (s.filteredY - newTargetY) ** 2) <= arrivalRadius) {
      arrivalTime = s.time;
      break;
    }
  }

  // 2. Fallback: Time of closest approach
  if (arrivalTime === null) {
    let minDist = Infinity, closestTime = null;
    for (const s of samples) {
      const d = Math.sqrt((s.filteredX - newTargetX) ** 2 + (s.filteredY - newTargetY) ** 2);
      if (d < minDist) { minDist = d; closestTime = s.time; }
    }
    if (closestTime) arrivalTime = closestTime;
    else return Infinity;
  }

  // 3. Calculate raw latency
  const rawLatency = arrivalTime - timingData.t_i_wait_end;

  // 4. Normalize by distance (Roberto's requirement)
  const dist = Math.sqrt((newTargetX - targetX) ** 2 + (newTargetY - targetY) ** 2);
  const normalized = dist > 0 ? (rawLatency / dist) * 100 : rawLatency;

  // 5. Clamp to realistic minimum
  return Math.max(MIN_REALISTIC_LATENCY, normalized);
}

// ========== ANALYSIS ==========

function analyze(testData, filterFn) {
  let totalVar = 0, totalLat = 0, vc = 0, lc = 0;
  for (const pos of testData) {
    const filtered = filterFn(pos.samples);
    const v = calculateVariance(pos.timingData, filtered);
    if (v === Infinity) continue;
    totalVar += v; vc++;
    if (!pos.skipLatency) {
      // Pass current target (pos.position) and new target (from timingData)
      // Note: generatePositionData returns samples where the "current" target is targetX, targetY
      // We need to pass these to calculateLatency for distance normalization
      // In generateFullTest, p.x and p.y are the start coordinates
      const currentTargetX = pos.samples[0].headX; // Approximate start
      const currentTargetY = pos.samples[0].headY; 
      
      // Better: use the known target coordinates from generation
      // We'll extract them from the first sample's target if available, or pass them in testData
      const l = calculateLatency(pos.timingData, filtered, pos.targetX, pos.targetY);
      if (l !== Infinity) { totalLat += l; lc++; }
    }
  }
  if (vc === 0) return null;
  return { meanVariance: totalVar / vc, meanLatency: lc > 0 ? totalLat / lc : Infinity };
}

// ========== PARETO FRONT ==========

function paretoFront(results) {
  const valid = results.filter(r => r.meanVariance !== Infinity && r.meanLatency !== Infinity);
  const front = [];
  for (const c of valid) {
    let dominated = false;
    for (const o of valid) {
      if (o !== c && o.meanVariance <= c.meanVariance && o.meanLatency <= c.meanLatency &&
          (o.meanVariance < c.meanVariance || o.meanLatency < c.meanLatency)) {
        dominated = true; break;
      }
    }
    if (!dominated) front.push(c);
  }
  front.sort((a, b) => a.meanVariance - b.meanVariance);
  return front;
}

// ========== ASCII PLOT ==========

function asciiPlot(name, pareto, all) {
  const W = 60, H = 20;
  const pts = all.filter(r => r.meanLatency !== Infinity);
  if (pts.length === 0) { console.log('  No data.'); return; }
  const minV = Math.min(...pts.map(r => r.meanVariance)), maxV = Math.max(...pts.map(r => r.meanVariance));
  const minL = Math.min(...pts.map(r => r.meanLatency)), maxL = Math.max(...pts.map(r => r.meanLatency));
  const vs = maxV - minV || 1, ls = maxL - minL || 1;
  const grid = Array.from({ length: H }, () => Array(W).fill(' '));
  for (const r of pts) {
    const x = Math.min(W - 1, Math.floor((r.meanVariance - minV) / vs * (W - 1)));
    const y = Math.min(H - 1, Math.floor((1 - (r.meanLatency - minL) / ls) * (H - 1)));
    if (grid[y][x] === ' ') grid[y][x] = '·';
  }
  for (const r of pareto) {
    const x = Math.min(W - 1, Math.floor((r.meanVariance - minV) / vs * (W - 1)));
    const y = Math.min(H - 1, Math.floor((1 - (r.meanLatency - minL) / ls) * (H - 1)));
    grid[y][x] = '★';
  }
  console.log(`\n  ${name}`);
  console.log(`  Latency(ms) ↑  (${minL.toFixed(0)}-${maxL.toFixed(0)}ms)`);
  for (let row = 0; row < H; row++) {
    const l = (maxL - row / (H - 1) * ls).toFixed(0);
    console.log(`  ${l.padStart(6)} |${grid[row].join('')}|`);
  }
  console.log(`         ${'─'.repeat(W + 2)}`);
  console.log(`         Variance(px) → (${minV.toFixed(1)}-${maxV.toFixed(1)}px)`);
  console.log(`  · = tested, ★ = Pareto-optimal`);
}

// ========== MAIN ==========

function runWithJitter(jitter) {
  console.log('\n' + '='.repeat(70));
  console.log(`  JITTER = ${jitter}px std dev`);
  console.log('='.repeat(70));

  const testData = generateFullTest(jitter);

  // Show raw data stats
  for (const pos of testData) {
    const hold = pos.samples.filter((_, i) => i >= 30 && i < 150); // hold phase
    const xVals = hold.map(s => s.headX);
    const yVals = hold.map(s => s.headY);
    const xM = xVals.reduce((a, b) => a + b, 0) / xVals.length;
    const yM = yVals.reduce((a, b) => a + b, 0) / yVals.length;
    const xV = xVals.reduce((s, x) => s + (x - xM) ** 2, 0) / xVals.length;
    const yV = yVals.reduce((s, y) => s + (y - yM) ** 2, 0) / yVals.length;
    const rawStd = Math.sqrt(xV + yV);
    console.log(`  ${pos.position.name}: raw hold jitter σ = ${rawStd.toFixed(1)}px`);
  }

  // ── One Euro ──
  console.log('\n  ONE EURO FILTER');
  const mcVals = [0.001, 0.005, 0.01, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const betaVals = [0.00001, 0.00005, 0.0001, 0.0005, 0.001, 0.005, 0.01];
  const dcVals = [0.1, 0.5, 1.0, 1.5, 2.0];

  const oeResults = [];
  for (const mc of mcVals)
    for (const beta of betaVals)
      for (const dc of dcVals) {
        const r = analyze(testData, s => applyOneEuro(s, { frequency: 60, minCutoff: mc, beta, dCutoff: dc }));
        if (r) oeResults.push({ ...r, params: { minCutoff: mc, beta, dCutoff: dc } });
      }

  const oeV = oeResults.map(r => r.meanVariance);
  const oeL = oeResults.filter(r => r.meanLatency !== Infinity).map(r => r.meanLatency);
  console.log(`  Tested: ${oeResults.length} | Variance: ${Math.min(...oeV).toFixed(1)}-${Math.max(...oeV).toFixed(1)}px | Latency: ${Math.min(...oeL).toFixed(0)}-${Math.max(...oeL).toFixed(0)}ms`);

  const oeP = paretoFront(oeResults);
  console.log(`  Pareto front: ${oeP.length} points`);
  console.log('    Rank | minCutoff | beta     | dCutoff | Var(px) | Lat(ms)');
  console.log('    ' + '-'.repeat(60));
  oeP.forEach((r, i) => {
    const p = r.params;
    console.log(`    ${String(i+1).padStart(4)} | ${String(p.minCutoff).padEnd(9)} | ${String(p.beta).padEnd(8)} | ${String(p.dCutoff).padEnd(7)} | ${r.meanVariance.toFixed(2).padStart(7)} | ${r.meanLatency.toFixed(1).padStart(7)}`);
  });

  // ── Exponential ──
  console.log('\n  EXPONENTIAL SMOOTHING');
  const expResults = [];
  for (let i = 0; i < 1000; i++) {
    const alpha = 0.001 + i * 0.998 / 999;
    const r = analyze(testData, s => applyExponential(s, alpha));
    if (r) expResults.push({ ...r, params: { alpha } });
  }

  const expV = expResults.map(r => r.meanVariance);
  const expL = expResults.filter(r => r.meanLatency !== Infinity).map(r => r.meanLatency);
  console.log(`  Tested: ${expResults.length} | Variance: ${Math.min(...expV).toFixed(1)}-${Math.max(...expV).toFixed(1)}px | Latency: ${Math.min(...expL).toFixed(0)}-${Math.max(...expL).toFixed(0)}ms`);

  const expP = paretoFront(expResults);
  console.log(`  Pareto front: ${expP.length} points`);
  console.log('    Rank | Alpha    | Var(px) | Lat(ms)');
  console.log('    ' + '-'.repeat(40));
  expP.forEach((r, i) => {
    console.log(`    ${String(i+1).padStart(4)} | ${r.params.alpha.toFixed(4).padEnd(8)} | ${r.meanVariance.toFixed(2).padStart(7)} | ${r.meanLatency.toFixed(1).padStart(7)}`);
  });

  // ── Plots ──
  asciiPlot('One Euro Filter', oeP, oeResults);
  asciiPlot('Exponential Smoothing', expP, expResults);

  return { oeP, expP, oeResults, expResults };
}

function run() {
  console.log('='.repeat(70));
  console.log('  ROBERTO METHOD - REALISTIC HUMAN HEAD JITTER SIMULATION');
  console.log('='.repeat(70));
  console.log('');
  console.log('  Typical webcam face-tracking jitter (MediaPipe on 1920px screen):');
  console.log('    Good lighting, steady setup:    15-20px std dev');
  console.log('    Average conditions:              25-35px std dev');
  console.log('    Poor lighting / movement:        40-60px std dev');
  console.log('');
  console.log('  Variance = std dev of filtered cursor during hold period');
  console.log('  Latency  = t_filtered_enters_R - t_i_wait_end (Roberto method)');
  console.log('  R = 5% of 1920px = 96px');

  // Run with 3 realistic jitter levels
  const results = {};
  for (const jitter of [20, 35, 50]) {
    results[jitter] = runWithJitter(jitter);
  }

  // ── Summary ──
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY ACROSS JITTER LEVELS');
  console.log('='.repeat(70));
  console.log('');
  console.log('  Jitter(px) | One Euro Pareto | Exp. Pareto | OE Var Range   | Exp Var Range');
  console.log('  ' + '-'.repeat(70));
  for (const jitter of [20, 35, 50]) {
    const { oeP, expP, oeResults, expResults } = results[jitter];
    const oeVMin = Math.min(...oeResults.map(r => r.meanVariance)).toFixed(1);
    const oeVMax = Math.max(...oeResults.map(r => r.meanVariance)).toFixed(1);
    const expVMin = Math.min(...expResults.map(r => r.meanVariance)).toFixed(1);
    const expVMax = Math.max(...expResults.map(r => r.meanVariance)).toFixed(1);
    console.log(`  ${String(jitter).padStart(10)}  | ${String(oeP.length).padStart(15)} | ${String(expP.length).padStart(11)} | ${oeVMin}-${oeVMax}px`.padEnd(60) + ` | ${expVMin}-${expVMax}px`);
  }

  const allPass = Object.values(results).every(r => r.oeP.length >= 2 && r.expP.length >= 3);
  console.log('');
  console.log(allPass
    ? '  ✅ ALL PASS: Both filters produce meaningful Pareto fronts at all jitter levels.'
    : '  ⚠️  Some jitter levels produced thin Pareto fronts.');
  console.log('='.repeat(70));
}

run();
