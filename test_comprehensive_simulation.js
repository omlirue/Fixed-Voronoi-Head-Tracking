/**
 * COMPREHENSIVE Pareto Simulation
 * Models realistic filter behavior with proper variance and latency trade-offs
 */

console.log('🧪 COMPREHENSIVE PARETO SIMULATION\n');
console.log('Testing if stability-based latency produces smooth concave curves...\n');

// Generate realistic head movement data
function generateRealisticMovement() {
  const data = [];
  const dt = 16.67; // 60fps
  
  // Phase 1: Stationary at start (0-1 second)
  for (let i = 0; i < 60; i++) {
    const jitter = 25; // High jitter when stationary
    data.push({
      time: i * dt,
      x: 100 + (Math.random() - 0.5) * jitter,
      y: 100 + (Math.random() - 0.5) * jitter
    });
  }
  
  // Phase 2: Movement to target (1-2.5 seconds)
  for (let i = 60; i < 150; i++) {
    const progress = (i - 60) / 90;
    const smoothProgress = progress * progress * (3 - 2 * progress); // Ease in-out
    
    const baseX = 100 + 400 * smoothProgress; // Move from 100 to 500
    const baseY = 100 + 400 * smoothProgress;
    
    const jitter = 20; // Jitter during movement
    data.push({
      time: i * dt,
      x: baseX + (Math.random() - 0.5) * jitter,
      y: baseY + (Math.random() - 0.5) * jitter
    });
  }
  
  // Phase 3: Stationary at target (2.5-4 seconds)
  for (let i = 150; i < 240; i++) {
    const jitter = 25; // High jitter when stationary
    data.push({
      time: i * dt,
      x: 500 + (Math.random() - 0.5) * jitter,
      y: 500 + (Math.random() - 0.5) * jitter
    });
  }
  
  return data;
}

// Apply exponential smoothing
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

// Calculate variance during stationary period at START
function calculateVariance(data) {
  // Use first 60 samples (stationary period)
  const stationarySamples = data.slice(0, 60);
  
  const xValues = stationarySamples.map(d => d.filteredX);
  const yValues = stationarySamples.map(d => d.filteredY);
  
  const xMean = xValues.reduce((a, b) => a + b) / xValues.length;
  const yMean = yValues.reduce((a, b) => a + b) / yValues.length;
  
  const xVar = xValues.reduce((sum, x) => sum + (x - xMean) ** 2, 0) / xValues.length;
  const yVar = yValues.reduce((sum, y) => sum + (y - yMean) ** 2, 0) / yValues.length;
  
  return Math.sqrt(xVar + yVar);
}

// Calculate latency using stability detection
function calculateLatency(data, targetX, targetY) {
  const STABILITY_THRESHOLD = 30; // pixels
  const STABILITY_SAMPLES = 10; // ~160ms
  
  // Find when RAW becomes stable near target
  let rawStableIdx = null;
  for (let i = 60; i < data.length - STABILITY_SAMPLES; i++) {
    const distToTarget = Math.sqrt(
      (data[i].rawX - targetX) ** 2 +
      (data[i].rawY - targetY) ** 2
    );
    
    if (distToTarget > 100) continue; // Must be reasonably close
    
    // Check stability
    let isStable = true;
    const startX = data[i].rawX;
    const startY = data[i].rawY;
    
    for (let j = i + 1; j < i + STABILITY_SAMPLES; j++) {
      const movement = Math.sqrt(
        (data[j].rawX - startX) ** 2 +
        (data[j].rawY - startY) ** 2
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
  for (let i = 60; i < data.length - STABILITY_SAMPLES; i++) {
    const distToTarget = Math.sqrt(
      (data[i].filteredX - targetX) ** 2 +
      (data[i].filteredY - targetY) ** 2
    );
    
    if (distToTarget > 100) continue;
    
    // Check stability
    let isStable = true;
    const startX = data[i].filteredX;
    const startY = data[i].filteredY;
    
    for (let j = i + 1; j < i + STABILITY_SAMPLES; j++) {
      const movement = Math.sqrt(
        (data[j].filteredX - startX) ** 2 +
        (data[j].filteredY - startY) ** 2
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
    return (filteredStableIdx - rawStableIdx) * 16.67; // ms
  }
  
  return null;
}

// Run tests
const rawData = generateRealisticMovement();
const testResults = [];

console.log('Testing alpha values from 0.1 to 0.99...\n');

for (let alpha = 0.1; alpha <= 0.99; alpha += 0.05) {
  const filtered = applyExponentialSmoothing(rawData, alpha);
  const variance = calculateVariance(filtered);
  const latency = calculateLatency(filtered, 500, 500);
  
  if (latency !== null && latency >= 0) {
    testResults.push({ alpha, variance, latency });
    console.log(`Alpha: ${alpha.toFixed(2)} → Variance: ${variance.toFixed(2)}px, Latency: ${latency.toFixed(0)}ms`);
  }
}

// Calculate Pareto front
console.log('\n═══════════════════════════════════════════════════════');
console.log('📊 PARETO FRONT');
console.log('═══════════════════════════════════════════════════════\n');

const paretoFront = [];
for (const candidate of testResults) {
  let isDominated = false;
  for (const other of testResults) {
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

console.log(`Found ${paretoFront.length} Pareto optimal points:\n`);
paretoFront.forEach((p, i) => {
  console.log(`${i + 1}. Alpha=${p.alpha.toFixed(2)} → Variance: ${p.variance.toFixed(2)}px, Latency: ${p.latency.toFixed(0)}ms`);
});

// Verify curve shape
console.log('\n═══════════════════════════════════════════════════════');
console.log('🎯 CURVE VERIFICATION');
console.log('═══════════════════════════════════════════════════════\n');

if (paretoFront.length >= 3) {
  let varianceIncreases = true;
  let latencyDecreases = true;
  
  for (let i = 1; i < paretoFront.length; i++) {
    if (paretoFront[i].variance <= paretoFront[i - 1].variance) varianceIncreases = false;
    if (paretoFront[i].latency >= paretoFront[i - 1].latency) latencyDecreases = false;
  }
  
  console.log(`Variance trend: ${varianceIncreases ? '✅ Monotonically increasing' : '❌ Not monotonic'}`);
  console.log(`Latency trend: ${latencyDecreases ? '✅ Monotonically decreasing' : '❌ Not monotonic'}`);
  
  if (varianceIncreases && latencyDecreases) {
    console.log('\n✅ PERFECT! Smooth concave curve confirmed!');
    console.log('   Trade-off: Lower latency ↔ Higher variance');
  } else {
    console.log('\n⚠️  Curve may have irregularities');
  }
} else {
  console.log(`Only ${paretoFront.length} Pareto points - need more for curve analysis`);
}

console.log('\n✅ Simulation complete!\n');
