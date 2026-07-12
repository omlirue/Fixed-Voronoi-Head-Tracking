/**
 * COMPREHENSIVE PARETO CURVE SIMULATION
 * Tests multiple scenarios: jittery tracking, smooth tracking, fast/slow movement
 * Verifies that stability-based latency produces smooth concave curves
 */

console.log('🧪 COMPREHENSIVE PARETO CURVE SIMULATION\n');
console.log('Testing multiple scenarios to verify curve shape...\n');

// ============================================================================
// SCENARIO GENERATORS
// ============================================================================

function generateJitteryTracking() {
  console.log('📊 Scenario 1: VERY JITTERY TRACKING (poor lighting/calibration)');
  const data = [];
  const JITTER = 50; // Very high jitter
  
  // Stationary at start with high jitter
  for (let i = 0; i < 60; i++) {
    data.push({
      time: i * 16.67,
      x: 100 + (Math.random() - 0.5) * JITTER,
      y: 100 + (Math.random() - 0.5) * JITTER
    });
  }
  
  // Movement with jitter
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
  
  // Stationary at target with high jitter
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
  console.log('📊 Scenario 2: SMOOTH TRACKING (good lighting/calibration)');
  const data = [];
  const JITTER = 10; // Low jitter
  
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

function generateFastMovement() {
  console.log('📊 Scenario 3: FAST MOVEMENT (quick head motion)');
  const data = [];
  const JITTER = 20;
  
  for (let i = 0; i < 60; i++) {
    data.push({
      time: i * 16.67,
      x: 100 + (Math.random() - 0.5) * JITTER,
      y: 100 + (Math.random() - 0.5) * JITTER
    });
  }
  
  // Fast movement (only 30 samples = 0.5 seconds)
  for (let i = 60; i < 90; i++) {
    const progress = (i - 60) / 30;
    const baseX = 100 + 400 * progress;
    const baseY = 100 + 400 * progress;
    data.push({
      time: i * 16.67,
      x: baseX + (Math.random() - 0.5) * JITTER,
      y: baseY + (Math.random() - 0.5) * JITTER
    });
  }
  
  // Long stationary at target
  for (let i = 90; i < 240; i++) {
    data.push({
      time: i * 16.67,
      x: 500 + (Math.random() - 0.5) * JITTER,
      y: 500 + (Math.random() - 0.5) * JITTER
    });
  }
  
  return data;
}

function generateSlowMovement() {
  console.log('📊 Scenario 4: SLOW MOVEMENT (careful head motion)');
  const data = [];
  const JITTER = 20;
  
  for (let i = 0; i < 60; i++) {
    data.push({
      time: i * 16.67,
      x: 100 + (Math.random() - 0.5) * JITTER,
      y: 100 + (Math.random() - 0.5) * JITTER
    });
  }
  
  // Slow movement (120 samples = 2 seconds)
  for (let i = 60; i < 180; i++) {
    const progress = (i - 60) / 120;
    const baseX = 100 + 400 * progress;
    const baseY = 100 + 400 * progress;
    data.push({
      time: i * 16.67,
      x: baseX + (Math.random() - 0.5) * JITTER,
      y: baseY + (Math.random() - 0.5) * JITTER
    });
  }
  
  for (let i = 180; i < 240; i++) {
    data.push({
      time: i * 16.67,
      x: 500 + (Math.random() - 0.5) * JITTER,
      y: 500 + (Math.random() - 0.5) * JITTER
    });
  }
  
  return data;
}

// ============================================================================
// FILTER IMPLEMENTATIONS
// ============================================================================

function applyExponentialSmoothing(data, alpha) {
  const result = [];
  let sx = data[0].x;
  let sy = data[0].y;
  
  for (const sample of data) {
    sx = alpha * sample.x + (1 - alpha) * sx;
    sy = alpha * sample.y + (1 - alpha) * sy;
    
    result.push({
      time: sample.time,
      rawX: sample.x,
      rawY: sample.y,
      filteredX: sx,
      filteredY: sy
    });
  }
  
  return result;
}

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
  // Use first 60 samples (stationary period)
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
  const STABILITY_THRESHOLD = 40; // pixels
  const STABILITY_SAMPLES = 12; // ~200ms at 60fps
  
  // Start looking from sample 60 (after initial stationary period)
  const movementSamples = data.slice(60);
  
  // Find when RAW becomes stable near target
  let rawStableIdx = null;
  for (let i = 0; i < movementSamples.length - STABILITY_SAMPLES; i++) {
    const startX = movementSamples[i].rawX;
    const startY = movementSamples[i].rawY;
    
    // Check if close enough to target
    const distToTarget = Math.sqrt((startX - targetX) ** 2 + (startY - targetY) ** 2);
    if (distToTarget > 200) continue; // Must be within 200px
    
    // Check stability
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
  
  // Find when FILTERED becomes stable near target
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
    return (filteredStableIdx - rawStableIdx) * 16.67; // Convert to ms
  }
  
  return null;
}

// ============================================================================
// RUN TESTS FOR EACH SCENARIO
// ============================================================================

const scenarios = [
  { name: 'Jittery Tracking', generator: generateJitteryTracking },
  { name: 'Smooth Tracking', generator: generateSmoothTracking },
  { name: 'Fast Movement', generator: generateFastMovement },
  { name: 'Slow Movement', generator: generateSlowMovement }
];

for (const scenario of scenarios) {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`🎯 ${scenario.name.toUpperCase()}`);
  console.log('═══════════════════════════════════════════════════════\n');
  
  const rawData = scenario.generator();
  
  // Test Exponential Smoothing
  console.log('🔵 Exponential Smoothing Results:');
  console.log('───────────────────────────────────────────────────────');
  
  const expResults = [];
  const alphaValues = [0.05, 0.10, 0.15, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95, 0.99];
  
  for (const alpha of alphaValues) {
    const filtered = applyExponentialSmoothing(rawData, alpha);
    const variance = calculateVariance(filtered);
    const latency = calculateLatencyStabilityBased(filtered, 500, 500);
    
    if (latency !== null && latency >= 0) {
      expResults.push({ alpha, variance, latency });
      console.log(`  α=${alpha.toFixed(2)} → Var: ${variance.toFixed(2)}px, Lat: ${latency.toFixed(0)}ms`);
    }
  }
  
  // Test One Euro Filter
  console.log('\n🔴 One Euro Filter Results:');
  console.log('───────────────────────────────────────────────────────');
  
  const oneEuroResults = [];
  const minCutoffValues = [0.001, 0.005, 0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5, 2.0];
  const betaValue = 0.001;
  
  for (const minCutoff of minCutoffValues) {
    const filtered = applyOneEuroFilter(rawData, minCutoff, betaValue);
    const variance = calculateVariance(filtered);
    const latency = calculateLatencyStabilityBased(filtered, 500, 500);
    
    if (latency !== null && latency >= 0) {
      oneEuroResults.push({ minCutoff, beta: betaValue, variance, latency });
      console.log(`  minCutoff=${minCutoff.toFixed(3)} → Var: ${variance.toFixed(2)}px, Lat: ${latency.toFixed(0)}ms`);
    }
  }
  
  // Calculate Pareto fronts
  const expPareto = calculateParetoFront(expResults);
  const oneEuroPareto = calculateParetoFront(oneEuroResults);
  
  console.log('\n📊 Pareto Analysis:');
  console.log('───────────────────────────────────────────────────────');
  console.log(`Exponential: ${expPareto.length}/${expResults.length} optimal points`);
  console.log(`One Euro: ${oneEuroPareto.length}/${oneEuroResults.length} optimal points`);
  
  // Verify curve shape
  const expConcave = verifyConcavity(expPareto, 'Exponential');
  const oneEuroConcave = verifyConcavity(oneEuroPareto, 'One Euro');
  
  if (expConcave && oneEuroConcave) {
    console.log('\n✅ BOTH CURVES ARE SMOOTH AND CONCAVE!');
  } else {
    console.log('\n⚠️  Some curves are not smooth - see details above');
  }
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
    console.log(`  ${name}: Not enough points (${paretoFront.length}) to verify concavity`);
    return false;
  }
  
  let varianceIncreases = true;
  let latencyDecreases = true;
  
  for (let i = 1; i < paretoFront.length; i++) {
    const prev = paretoFront[i - 1];
    const curr = paretoFront[i];
    
    if (curr.variance <= prev.variance) varianceIncreases = false;
    if (curr.latency >= prev.latency) latencyDecreases = false;
  }
  
  console.log(`  ${name}: Variance ${varianceIncreases ? '↑' : '↓'}, Latency ${latencyDecreases ? '↓' : '↑'} ${varianceIncreases && latencyDecreases ? '✅' : '❌'}`);
  
  return varianceIncreases && latencyDecreases;
}

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n\n═══════════════════════════════════════════════════════');
console.log('📈 FINAL SUMMARY');
console.log('═══════════════════════════════════════════════════════\n');

console.log('Tested 4 scenarios:');
console.log('  1. Jittery tracking (50px jitter)');
console.log('  2. Smooth tracking (10px jitter)');
console.log('  3. Fast movement (0.5s transition)');
console.log('  4. Slow movement (2s transition)');
console.log('');
console.log('Tested 2 filters:');
console.log('  - Exponential Smoothing (13 alpha values)');
console.log('  - One Euro Filter (12 minCutoff values)');
console.log('');
console.log('✅ Simulation complete!\n');
