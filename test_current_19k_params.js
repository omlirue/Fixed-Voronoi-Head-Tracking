/**
 * TEST WITH EXACT CURRENT 19,000 PARAMETER COMBINATIONS
 * Uses the same ranges as parameter-optimization.js FULL ANALYSIS MODE
 * 
 * minCutoff: 0.001 to 1.0, step 0.02 (linear) → ~50 values
 * beta: 0.00001 to 0.01, step 0.0005 → ~20 values
 * dCutoff: 0.1 to 2.0, step 0.1 → ~19 values
 */

console.log('🧪 TESTING WITH EXACT CURRENT 19,000 PARAMETER GRID\n');

// ============================================================================
// SCENARIO GENERATORS
// ============================================================================

function generateScenario(jitter, movementFrames, name) {
  const data = [];
  
  // Stationary at start
  for (let i = 0; i < 60; i++) {
    data.push({
      time: i * 16.67,
      x: 100 + (Math.random() - 0.5) * jitter,
      y: 100 + (Math.random() - 0.5) * jitter
    });
  }
  
  // Movement phase
  for (let i = 60; i < 60 + movementFrames; i++) {
    const progress = (i - 60) / movementFrames;
    data.push({
      time: i * 16.67,
      x: 100 + 400 * progress + (Math.random() - 0.5) * jitter,
      y: 100 + 400 * progress + (Math.random() - 0.5) * jitter
    });
  }
  
  // Stationary at target
  for (let i = 60 + movementFrames; i < 240; i++) {
    data.push({
      time: i * 16.67,
      x: 500 + (Math.random() - 0.5) * jitter,
      y: 500 + (Math.random() - 0.5) * jitter
    });
  }
  
  return data;
}

// ============================================================================
// ONE EURO FILTER (matches actual code)
// ============================================================================

function applyOneEuroFilter(data, minCutoff, beta, dCutoff) {
  const result = [];
  let prevFilteredX = data[0].x;
  let prevFilteredY = data[0].y;
  let prevDx = 0;
  let prevDy = 0;
  let prevTime = data[0].time / 1000;
  
  for (const sample of data) {
    const currentTime = sample.time / 1000;
    const dt = currentTime - prevTime;
    
    if (dt <= 0) {
      result.push({
        time: sample.time,
        rawX: sample.x, rawY: sample.y,
        filteredX: prevFilteredX, filteredY: prevFilteredY
      });
      continue;
    }
    
    // Velocity
    const dx = (sample.x - prevFilteredX) / dt;
    const dy = (sample.y - prevFilteredY) / dt;
    
    // Smooth velocity using dCutoff
    const alphaDeriv = 1.0 / (1.0 + 1.0 / (2 * Math.PI * dCutoff * dt));
    const smoothDx = alphaDeriv * dx + (1 - alphaDeriv) * prevDx;
    const smoothDy = alphaDeriv * dy + (1 - alphaDeriv) * prevDy;
    
    const speed = Math.sqrt(smoothDx * smoothDx + smoothDy * smoothDy);
    
    // Adaptive cutoff: minCutoff + beta * speed
    const cutoff = minCutoff + beta * speed;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    const alpha = 1.0 / (1.0 + tau / dt);
    
    const filteredX = prevFilteredX + alpha * (sample.x - prevFilteredX);
    const filteredY = prevFilteredY + alpha * (sample.y - prevFilteredY);
    
    result.push({
      time: sample.time,
      rawX: sample.x, rawY: sample.y,
      filteredX, filteredY
    });
    
    prevFilteredX = filteredX;
    prevFilteredY = filteredY;
    prevDx = smoothDx;
    prevDy = smoothDy;
    prevTime = currentTime;
  }
  
  return result;
}

// ============================================================================
// METRICS (stability-based, matches actual code)
// ============================================================================

function calculateVariance(data) {
  const samples = data.slice(0, 60);
  const xValues = samples.map(d => d.filteredX);
  const yValues = samples.map(d => d.filteredY);
  const xMean = xValues.reduce((a, b) => a + b) / xValues.length;
  const yMean = yValues.reduce((a, b) => a + b) / yValues.length;
  const xVar = xValues.reduce((s, x) => s + (x - xMean) ** 2, 0) / xValues.length;
  const yVar = yValues.reduce((s, y) => s + (y - yMean) ** 2, 0) / yValues.length;
  return Math.sqrt(xVar + yVar);
}

function calculateLatency(data) {
  const STABILITY_THRESHOLD = 40;
  const STABILITY_SAMPLES = 12;
  const movementSamples = data.slice(60);
  
  function findStable(field) {
    for (let i = 0; i < movementSamples.length - STABILITY_SAMPLES; i++) {
      const startX = movementSamples[i][field + 'X'];
      const startY = movementSamples[i][field + 'Y'];
      
      const distToTarget = Math.sqrt((startX - 500) ** 2 + (startY - 500) ** 2);
      if (distToTarget > 200) continue;
      
      let isStable = true;
      for (let j = i + 1; j < Math.min(i + STABILITY_SAMPLES, movementSamples.length); j++) {
        const movement = Math.sqrt(
          (movementSamples[j][field + 'X'] - startX) ** 2 +
          (movementSamples[j][field + 'Y'] - startY) ** 2
        );
        if (movement > STABILITY_THRESHOLD) { isStable = false; break; }
      }
      if (isStable) return i;
    }
    return null;
  }
  
  const rawIdx = findStable('raw');
  const filtIdx = findStable('filtered');
  
  if (rawIdx !== null && filtIdx !== null) {
    return Math.max(0, (filtIdx - rawIdx) * 16.67);
  }
  return null;
}

// ============================================================================
// GENERATE THE EXACT CURRENT PARAMETER GRID
// ============================================================================

// Current ranges from parameter-optimization.js
const minCutoffValues = [];
for (let v = 0.001; v <= 1.0; v += 0.02) minCutoffValues.push(parseFloat(v.toFixed(4)));

const betaValues = [];
for (let v = 0.00001; v <= 0.01; v += 0.0005) betaValues.push(parseFloat(v.toFixed(6)));

const dCutoffValues = [];
for (let v = 0.1; v <= 2.0; v += 0.1) dCutoffValues.push(parseFloat(v.toFixed(2)));

const totalCombinations = minCutoffValues.length * betaValues.length * dCutoffValues.length;

console.log(`Parameter grid:`);
console.log(`  minCutoff: ${minCutoffValues.length} values (${minCutoffValues[0]} to ${minCutoffValues[minCutoffValues.length-1]})`);
console.log(`  beta: ${betaValues.length} values (${betaValues[0]} to ${betaValues[betaValues.length-1]})`);
console.log(`  dCutoff: ${dCutoffValues.length} values (${dCutoffValues[0]} to ${dCutoffValues[dCutoffValues.length-1]})`);
console.log(`  Total: ${totalCombinations} combinations\n`);

// ============================================================================
// RUN SCENARIOS
// ============================================================================

const scenarios = [
  { name: 'Jittery (50px)', jitter: 50, movementFrames: 90 },
  { name: 'Moderate (25px)', jitter: 25, movementFrames: 90 },
  { name: 'Smooth (10px)', jitter: 10, movementFrames: 90 },
  { name: 'Fast+Jittery', jitter: 35, movementFrames: 30 },
  { name: 'Slow+Smooth', jitter: 15, movementFrames: 120 },
];

for (const scenario of scenarios) {
  console.log('═══════════════════════════════════════════════════════');
  console.log(`🎯 ${scenario.name.toUpperCase()}`);
  console.log('═══════════════════════════════════════════════════════\n');
  
  const rawData = generateScenario(scenario.jitter, scenario.movementFrames, scenario.name);
  
  const results = [];
  let tested = 0;
  
  for (const mc of minCutoffValues) {
    for (const b of betaValues) {
      for (const dc of dCutoffValues) {
        const filtered = applyOneEuroFilter(rawData, mc, b, dc);
        const variance = calculateVariance(filtered);
        const latency = calculateLatency(filtered);
        
        if (latency !== null && latency >= 0) {
          results.push({ minCutoff: mc, beta: b, dCutoff: dc, variance, latency });
        }
        tested++;
      }
    }
  }
  
  console.log(`Tested: ${tested} combinations, Valid: ${results.length}\n`);
  
  // Pareto front
  const paretoFront = [];
  for (const c of results) {
    let dominated = false;
    for (const o of results) {
      if (o !== c && o.variance <= c.variance && o.latency <= c.latency &&
          (o.variance < c.variance || o.latency < c.latency)) {
        dominated = true; break;
      }
    }
    if (!dominated) paretoFront.push(c);
  }
  paretoFront.sort((a, b) => a.variance - b.variance);
  
  console.log(`📊 Pareto Front: ${paretoFront.length}/${results.length} optimal points\n`);
  
  // Show all Pareto points
  console.log('Pareto-Optimal Points (sorted by variance):');
  console.log('───────────────────────────────────────────────────────');
  for (const p of paretoFront) {
    console.log(`  mc=${p.minCutoff.toFixed(3)} β=${p.beta.toFixed(5)} dc=${p.dCutoff.toFixed(1)} → Var: ${p.variance.toFixed(2)}px, Lat: ${p.latency.toFixed(0)}ms`);
  }
  
  // Monotonicity check
  let varUp = 0, varDown = 0, latUp = 0, latDown = 0;
  for (let i = 1; i < paretoFront.length; i++) {
    if (paretoFront[i].variance > paretoFront[i-1].variance) varUp++;
    else varDown++;
    if (paretoFront[i].latency < paretoFront[i-1].latency) latDown++;
    else latUp++;
  }
  
  console.log(`\n📈 Curve Shape:`);
  console.log(`  Variance steps: ${varUp} increases, ${varDown} decreases`);
  console.log(`  Latency steps: ${latDown} decreases, ${latUp} increases/flat`);
  
  if (paretoFront.length >= 3 && varUp >= (paretoFront.length - 1) * 0.7 && latDown >= (paretoFront.length - 1) * 0.7) {
    console.log(`  ✅ SMOOTH CONCAVE CURVE!`);
  } else if (paretoFront.length < 3) {
    console.log(`  ⚠️  Only ${paretoFront.length} points — NOT a smooth curve`);
  } else {
    console.log(`  ❌ NOT a smooth curve (need monotonic variance↑ + latency↓)`);
  }
  
  // Show unique latency values to see resolution
  const uniqueLatencies = [...new Set(paretoFront.map(p => p.latency))].sort((a,b) => a-b);
  console.log(`  Unique latency values: [${uniqueLatencies.map(l => l.toFixed(0) + 'ms').join(', ')}]`);
  
  // Show variance range
  if (paretoFront.length > 0) {
    console.log(`  Variance range: ${paretoFront[0].variance.toFixed(2)} to ${paretoFront[paretoFront.length-1].variance.toFixed(2)} px`);
  }
  
  console.log('\n');
}

// ============================================================================
// DIAGNOSIS
// ============================================================================

console.log('═══════════════════════════════════════════════════════');
console.log('🔍 DIAGNOSIS: WHY MIGHT CURVE BE POOR?');
console.log('═══════════════════════════════════════════════════════\n');

console.log('Current beta range: 0.00001 to 0.01');
console.log('Previous simulation showed smooth curves needed beta up to 0.05-0.5');
console.log('');
console.log('The key insight is:');
console.log('  - Low beta → filter ignores speed → acts like constant low-pass → smooth but laggy');
console.log('  - High beta → filter adapts to speed → during motion it passes raw signal → responsive but noisy');
console.log('');
console.log('With beta max = 0.01, the filter NEVER truly becomes responsive enough');
console.log('to produce the full range of latency trade-offs.');
console.log('');
console.log('Recommended fix: Extend beta range to at least 0.1 (or even 1.0)');
console.log('This allows the One Euro filter to produce a full Pareto front.\n');
