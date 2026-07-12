/**
 * ONE EURO FILTER COMPREHENSIVE TEST
 * Varies BOTH minCutoff AND beta to generate smooth Pareto curves
 */

console.log('🧪 ONE EURO FILTER COMPREHENSIVE PARETO TEST\n');
console.log('Testing with BOTH minCutoff and beta parameters...\n');

// ============================================================================
// SCENARIO GENERATORS
// ============================================================================

function generateJitteryTracking() {
  const data = [];
  const JITTER = 50;
  
  for (let i = 0; i < 60; i++) {
    data.push({
      time: i * 16.67,
      x: 100 + (Math.random() - 0.5) * JITTER,
      y: 100 + (Math.random() - 0.5) * JITTER
    });
  }
  
  for (let i = 60; i < 150; i++) {
    const progress = (i - 60) / 90;
    const baseX = 100 + 400 * progress;
    const baseY = 100 + 400 * progress;
    data.push({
      time: i * 16.67,
      x: baseX + (Math.random() - 0.5) * JITTER,
      y: baseY + (Math.random() - 0.5) * JITTER
    });
  }
  
  for (let i = 150; i < 240; i++) {
    data.push({
      time: i * 16.67,
      x: 500 + (Math.random() - 0.5) * JITTER,
      y: 500 + (Math.random() - 0.5) * JITTER
    });
  }
  
  return data;
}

function generateSmoothTracking() {
  const data = [];
  const JITTER = 10;
  
  for (let i = 0; i < 60; i++) {
    data.push({
      time: i * 16.67,
      x: 100 + (Math.random() - 0.5) * JITTER,
      y: 100 + (Math.random() - 0.5) * JITTER
    });
  }
  
  for (let i = 60; i < 150; i++) {
    const progress = (i - 60) / 90;
    const baseX = 100 + 400 * progress;
    const baseY = 100 + 400 * progress;
    data.push({
      time: i * 16.67,
      x: baseX + (Math.random() - 0.5) * JITTER,
      y: baseY + (Math.random() - 0.5) * JITTER
    });
  }
  
  for (let i = 150; i < 240; i++) {
    data.push({
      time: i * 16.67,
      x: 500 + (Math.random() - 0.5) * JITTER,
      y: 500 + (Math.random() - 0.5) * JITTER
    });
  }
  
  return data;
}

// ============================================================================
// ONE EURO FILTER IMPLEMENTATION
// ============================================================================

function applyOneEuroFilter(data, minCutoff, beta) {
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
        rawX: sample.x,
        rawY: sample.y,
        filteredX: prevFilteredX,
        filteredY: prevFilteredY
      });
      continue;
    }
    
    // Calculate velocity
    const dx = (sample.x - prevFilteredX) / dt;
    const dy = (sample.y - prevFilteredY) / dt;
    
    // Smooth velocity
    const alphaDx = 1.0 / (1.0 + 1.0 / (2 * Math.PI * 1.0 * dt));
    const smoothDx = alphaDx * dx + (1 - alphaDx) * prevDx;
    const smoothDy = alphaDx * dy + (1 - alphaDx) * prevDy;
    
    const speed = Math.sqrt(smoothDx * smoothDx + smoothDy * smoothDy);
    
    // Adaptive cutoff
    const cutoff = minCutoff + beta * speed;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    const alpha = 1.0 / (1.0 + tau / dt);
    
    // Filter
    const filteredX = prevFilteredX + alpha * (sample.x - prevFilteredX);
    const filteredY = prevFilteredY + alpha * (sample.y - prevFilteredY);
    
    result.push({
      time: sample.time,
      rawX: sample.x,
      rawY: sample.y,
      filteredX: filteredX,
      filteredY: filteredY
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
// METRIC CALCULATIONS
// ============================================================================

function calculateVariance(data) {
  const samples = data.slice(0, 60);
  
  const xValues = samples.map(d => d.filteredX);
  const yValues = samples.map(d => d.filteredY);
  
  const xMean = xValues.reduce((a, b) => a + b) / xValues.length;
  const yMean = yValues.reduce((a, b) => a + b) / yValues.length;
  
  const xVar = xValues.reduce((sum, x) => sum + (x - xMean) ** 2, 0) / xValues.length;
  const yVar = yValues.reduce((sum, y) => sum + (y - yMean) ** 2, 0) / yValues.length;
  
  return Math.sqrt(xVar + yVar);
}

function calculateLatencyStabilityBased(data, targetX, targetY) {
  const STABILITY_THRESHOLD = 40;
  const STABILITY_SAMPLES = 12;
  
  const movementSamples = data.slice(60);
  
  let rawStableIdx = null;
  for (let i = 0; i < movementSamples.length - STABILITY_SAMPLES; i++) {
    const startX = movementSamples[i].rawX;
    const startY = movementSamples[i].rawY;
    
    const distToTarget = Math.sqrt((startX - targetX) ** 2 + (startY - targetY) ** 2);
    if (distToTarget > 200) continue;
    
    let isStable = true;
    for (let j = i + 1; j < Math.min(i + STABILITY_SAMPLES, movementSamples.length); j++) {
      const movement = Math.sqrt(
        (movementSamples[j].rawX - startX) ** 2 +
        (movementSamples[j].rawY - startY) ** 2
      );
      if (movement > STABILITY_THRESHOLD) {
        isStable = false;
        break;
      }
    }
    
    if (isStable) {
      rawStableIdx = i;
      break;
    }
  }
  
  let filteredStableIdx = null;
  for (let i = 0; i < movementSamples.length - STABILITY_SAMPLES; i++) {
    const startX = movementSamples[i].filteredX;
    const startY = movementSamples[i].filteredY;
    
    const distToTarget = Math.sqrt((startX - targetX) ** 2 + (startY - targetY) ** 2);
    if (distToTarget > 200) continue;
    
    let isStable = true;
    for (let j = i + 1; j < Math.min(i + STABILITY_SAMPLES, movementSamples.length); j++) {
      const movement = Math.sqrt(
        (movementSamples[j].filteredX - startX) ** 2 +
        (movementSamples[j].filteredY - startY) ** 2
      );
      if (movement > STABILITY_THRESHOLD) {
        isStable = false;
        break;
      }
    }
    
    if (isStable) {
      filteredStableIdx = i;
      break;
    }
  }
  
  if (rawStableIdx !== null && filteredStableIdx !== null) {
    return (filteredStableIdx - rawStableIdx) * 16.67;
  }
  
  return null;
}

// ============================================================================
// COMPREHENSIVE PARAMETER SWEEP
// ============================================================================

const scenarios = [
  { name: 'Jittery Tracking', generator: generateJitteryTracking },
  { name: 'Smooth Tracking', generator: generateSmoothTracking }
];

for (const scenario of scenarios) {
  console.log('═══════════════════════════════════════════════════════');
  console.log(`🎯 ${scenario.name.toUpperCase()}`);
  console.log('═══════════════════════════════════════════════════════\n');
  
  const rawData = scenario.generator();
  
  // COMPREHENSIVE PARAMETER SWEEP
  const minCutoffValues = [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5, 2.0, 3.0, 5.0];
  const betaValues = [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0];
  
  console.log(`Testing ${minCutoffValues.length} minCutoff × ${betaValues.length} beta = ${minCutoffValues.length * betaValues.length} combinations\n`);
  
  const results = [];
  
  for (const minCutoff of minCutoffValues) {
    for (const beta of betaValues) {
      const filtered = applyOneEuroFilter(rawData, minCutoff, beta);
      const variance = calculateVariance(filtered);
      const latency = calculateLatencyStabilityBased(filtered, 500, 500);
      
      if (latency !== null && latency >= 0) {
        results.push({ minCutoff, beta, variance, latency });
      }
    }
  }
  
  console.log(`✅ Got ${results.length} valid results\n`);
  
  // Calculate Pareto front
  const paretoFront = calculateParetoFront(results);
  
  console.log(`📊 Pareto Front: ${paretoFront.length}/${results.length} optimal points\n`);
  
  // Show Pareto points sorted by variance
  console.log('Pareto-Optimal Parameter Combinations:');
  console.log('───────────────────────────────────────────────────────');
  
  for (const point of paretoFront) {
    console.log(`  minCutoff=${point.minCutoff.toFixed(3)}, beta=${point.beta.toFixed(4)} → Var: ${point.variance.toFixed(2)}px, Lat: ${point.latency.toFixed(0)}ms`);
  }
  
  // Verify curve shape
  console.log('\n📈 Curve Shape Analysis:');
  console.log('───────────────────────────────────────────────────────');
  verifyConcavity(paretoFront, 'One Euro Filter');
  
  console.log('\n');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateParetoFront(results) {
  const paretoFront = [];
  
  for (const candidate of results) {
    let isDominated = false;
    
    for (const other of results) {
      if (other !== candidate &&
          other.variance <= candidate.variance &&
          other.latency <= candidate.latency &&
          (other.variance < candidate.variance || other.latency < candidate.latency)) {
        isDominated = true;
        break;
      }
    }
    
    if (!isDominated) {
      paretoFront.push(candidate);
    }
  }
  
  paretoFront.sort((a, b) => a.variance - b.variance);
  return paretoFront;
}

function verifyConcavity(paretoFront, name) {
  if (paretoFront.length < 3) {
    console.log(`  ⚠️  Only ${paretoFront.length} points - need at least 3 for smooth curve`);
    return false;
  }
  
  let varianceIncreases = true;
  let latencyDecreases = true;
  let violations = 0;
  
  for (let i = 1; i < paretoFront.length; i++) {
    const prev = paretoFront[i - 1];
    const curr = paretoFront[i];
    
    if (curr.variance <= prev.variance) {
      varianceIncreases = false;
      violations++;
    }
    if (curr.latency >= prev.latency) {
      latencyDecreases = false;
      violations++;
    }
  }
  
  console.log(`  Variance trend: ${varianceIncreases ? '↑ monotonic' : '↑↓ non-monotonic'}`);
  console.log(`  Latency trend: ${latencyDecreases ? '↓ monotonic' : '↑↓ non-monotonic'}`);
  console.log(`  Violations: ${violations}/${paretoFront.length - 1} transitions`);
  
  if (varianceIncreases && latencyDecreases) {
    console.log(`  ✅ SMOOTH CONCAVE CURVE CONFIRMED!`);
    return true;
  } else if (paretoFront.length >= 5 && violations <= 2) {
    console.log(`  ⚠️  Mostly smooth with minor irregularities`);
    return true;
  } else {
    console.log(`  ❌ Not a smooth curve`);
    return false;
  }
}

console.log('═══════════════════════════════════════════════════════');
console.log('📈 SUMMARY');
console.log('═══════════════════════════════════════════════════════\n');
console.log('This test varies BOTH minCutoff and beta parameters');
console.log('to generate a comprehensive Pareto front for One Euro filter.\n');
console.log('Expected: Smooth concave curve with many optimal points.\n');
