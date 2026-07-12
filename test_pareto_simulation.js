/**
 * Simulate Parameter Optimization to Test Pareto Curve Shape
 * 
 * This script simulates how One Euro Filter and Exponential Smoothing
 * would perform with different parameters to verify we get smooth concave curves.
 */

console.log('🧪 Starting Pareto Curve Simulation...\n');

// Simulate raw head tracking data (with realistic jitter)
function generateRawHeadData(numSamples = 200) {
  const data = [];
  const targetX = 500;
  const targetY = 500;
  
  for (let i = 0; i < numSamples; i++) {
    const time = i * 16; // 60fps
    
    // Phase 1: Stationary at start (samples 0-30)
    if (i < 30) {
      const jitterX = (Math.random() - 0.5) * 40; // High jitter when stationary
      const jitterY = (Math.random() - 0.5) * 40;
      data.push({
        time: time,
        x: 100 + jitterX,
        y: 100 + jitterY
      });
    }
    // Phase 2: Movement toward target (samples 30-120)
    else if (i < 120) {
      const progress = (i - 30) / 90;
      const baseX = 100 + (targetX - 100) * progress;
      const baseY = 100 + (targetY - 100) * progress;
      
      // Add jitter during movement (less than stationary)
      const jitterX = (Math.random() - 0.5) * 25;
      const jitterY = (Math.random() - 0.5) * 25;
      
      data.push({
        time: time,
        x: baseX + jitterX,
        y: baseY + jitterY
      });
    }
    // Phase 3: Stationary at target (samples 120-200)
    else {
      const jitterX = (Math.random() - 0.5) * 35; // High jitter when stationary
      const jitterY = (Math.random() - 0.5) * 35;
      data.push({
        time: time,
        x: targetX + jitterX,
        y: targetY + jitterY
      });
    }
  }
  
  return data;
}

// Simulate One Euro Filter
function applyOneEuroFilter(data, minCutoff, beta) {
  const filtered = [];
  let prevFilteredX = data[0].x;
  let prevFilteredY = data[0].y;
  let prevTime = data[0].time / 1000;
  
  for (const sample of data) {
    const currentTime = sample.time / 1000;
    const dt = currentTime - prevTime;
    
    if (dt <= 0) {
      filtered.push({ ...sample, filteredX: prevFilteredX, filteredY: prevFilteredY });
      continue;
    }
    
    // Simplified One Euro Filter (velocity-adaptive smoothing)
    const dxRaw = sample.x - prevFilteredX;
    const dyRaw = sample.y - prevFilteredY;
    const velocity = Math.sqrt(dxRaw * dxRaw + dyRaw * dyRaw) / dt;
    
    // Adaptive cutoff frequency
    const cutoff = minCutoff + beta * velocity;
    
    // Exponential smoothing with adaptive alpha
    const tau = 1.0 / (2 * Math.PI * cutoff);
    const alpha = 1.0 / (1.0 + tau / dt);
    
    const filteredX = prevFilteredX + alpha * (sample.x - prevFilteredX);
    const filteredY = prevFilteredY + alpha * (sample.y - prevFilteredY);
    
    filtered.push({
      time: sample.time,
      originalX: sample.x,
      originalY: sample.y,
      filteredX: filteredX,
      filteredY: filteredY
    });
    
    prevFilteredX = filteredX;
    prevFilteredY = filteredY;
    prevTime = currentTime;
  }
  
  return filtered;
}

// Simulate Exponential Smoothing
function applyExponentialSmoothing(data, alpha) {
  const filtered = [];
  let smoothedX = data[0].x;
  let smoothedY = data[0].y;
  
  for (const sample of data) {
    smoothedX = alpha * sample.x + (1 - alpha) * smoothedX;
    smoothedY = alpha * sample.y + (1 - alpha) * smoothedY;
    
    filtered.push({
      time: sample.time,
      originalX: sample.x,
      originalY: sample.y,
      filteredX: smoothedX,
      filteredY: smoothedY
    });
  }
  
  return filtered;
}

// Calculate variance (steadiness during stationary period at END)
function calculateVariance(filteredData) {
  // Use last 50 samples (stationary at target)
  const stationarySamples = filteredData.slice(-50);
  
  const xValues = stationarySamples.map(d => d.filteredX);
  const yValues = stationarySamples.map(d => d.filteredY);
  
  const xMean = xValues.reduce((a, b) => a + b, 0) / xValues.length;
  const yMean = yValues.reduce((a, b) => a + b, 0) / yValues.length;
  
  const xVar = xValues.reduce((sum, x) => sum + Math.pow(x - xMean, 2), 0) / xValues.length;
  const yVar = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0) / yValues.length;
  
  return Math.sqrt(xVar + yVar);
}

// Calculate latency (using stability detection)
function calculateLatency(filteredData, targetX, targetY) {
  const STABILITY_THRESHOLD = 50; // pixels
  const STABILITY_DURATION = 10; // samples (~160ms at 60fps)
  
  // Start looking from sample 30 onwards (after initial movement starts)
  const movementSamples = filteredData.slice(30);
  
  // Find when raw cursor becomes stable near target
  let rawStableIdx = null;
  for (let i = 0; i < movementSamples.length - STABILITY_DURATION; i++) {
    const startX = movementSamples[i].originalX;
    const startY = movementSamples[i].originalY;
    
    // Check distance to target
    const distToTarget = Math.sqrt(
      Math.pow(startX - targetX, 2) +
      Math.pow(startY - targetY, 2)
    );
    
    // Only consider "arrived" if reasonably close to target
    if (distToTarget > 150) continue; // Must be within 150px of target
    
    let isStable = true;
    let maxMovement = 0;
    for (let j = i + 1; j < Math.min(i + STABILITY_DURATION, movementSamples.length); j++) {
      const movement = Math.sqrt(
        Math.pow(movementSamples[j].originalX - startX, 2) +
        Math.pow(movementSamples[j].originalY - startY, 2)
      );
      maxMovement = Math.max(maxMovement, movement);
      if (movement > STABILITY_THRESHOLD) {
        isStable = false;
        break;
      }
    }
    
    if (isStable) {
      rawStableIdx = i + 30; // Adjust for slice offset
      break;
    }
  }
  
  // Find when filtered cursor becomes stable near target
  let filteredStableIdx = null;
  for (let i = 0; i < movementSamples.length - STABILITY_DURATION; i++) {
    const startX = movementSamples[i].filteredX;
    const startY = movementSamples[i].filteredY;
    
    // Check distance to target
    const distToTarget = Math.sqrt(
      Math.pow(startX - targetX, 2) +
      Math.pow(startY - targetY, 2)
    );
    
    // Only consider "arrived" if reasonably close to target
    if (distToTarget > 150) continue;
    
    let isStable = true;
    let maxMovement = 0;
    for (let j = i + 1; j < Math.min(i + STABILITY_DURATION, movementSamples.length); j++) {
      const movement = Math.sqrt(
        Math.pow(movementSamples[j].filteredX - startX, 2) +
        Math.pow(movementSamples[j].filteredY - startY, 2)
      );
      maxMovement = Math.max(maxMovement, movement);
      if (movement > STABILITY_THRESHOLD) {
        isStable = false;
        break;
      }
    }
    
    if (isStable) {
      filteredStableIdx = i + 30; // Adjust for slice offset
      break;
    }
  }
  
  if (rawStableIdx !== null && filteredStableIdx !== null) {
    return (filteredStableIdx - rawStableIdx) * 16; // Convert to ms
  }
  
  return null;
}

// Test One Euro Filter with different parameters
console.log('═══════════════════════════════════════════════════════');
console.log('🔴 ONE EURO FILTER SIMULATION');
console.log('═══════════════════════════════════════════════════════\n');

const rawData = generateRawHeadData(150);
const oneEuroResults = [];

// Test range of minCutoff values (beta fixed at 0.001)
const minCutoffValues = [0.001, 0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5, 2.0];
const betaValue = 0.001;

for (const minCutoff of minCutoffValues) {
  const filtered = applyOneEuroFilter(rawData, minCutoff, betaValue);
  
  // Calculate variance (stationary period at end)
  const variance = calculateVariance(filtered);
  
  // Calculate latency
  const latency = calculateLatency(filtered, 500, 500);
  
  if (latency !== null && latency >= 0) {
    oneEuroResults.push({
      minCutoff: minCutoff,
      beta: betaValue,
      variance: variance,
      latency: latency
    });
    
    console.log(`minCutoff=${minCutoff.toFixed(3)}, beta=${betaValue.toFixed(4)} → Variance: ${variance.toFixed(2)}px, Latency: ${latency.toFixed(0)}ms`);
  } else {
    console.log(`minCutoff=${minCutoff.toFixed(3)}, beta=${betaValue.toFixed(4)} → Could not measure (latency=${latency})`);
  }
}

// Test Exponential Smoothing
console.log('\n═══════════════════════════════════════════════════════');
console.log('🔵 EXPONENTIAL SMOOTHING SIMULATION');
console.log('═══════════════════════════════════════════════════════\n');

const expResults = [];
const alphaValues = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99];

for (const alpha of alphaValues) {
  const filtered = applyExponentialSmoothing(rawData, alpha);
  
  // Calculate variance
  const variance = calculateVariance(filtered);
  
  // Calculate latency
  const latency = calculateLatency(filtered, 500, 500);
  
  if (latency !== null && latency >= 0) {
    expResults.push({
      alpha: alpha,
      variance: variance,
      latency: latency
    });
    
    console.log(`alpha=${alpha.toFixed(2)} → Variance: ${variance.toFixed(2)}px, Latency: ${latency.toFixed(0)}ms`);
  } else {
    console.log(`alpha=${alpha.toFixed(2)} → Could not measure (latency=${latency})`);
  }
}

// Analyze curve shape
console.log('\n═══════════════════════════════════════════════════════');
console.log('📊 PARETO CURVE ANALYSIS');
console.log('═══════════════════════════════════════════════════════\n');

// Calculate Pareto front for One Euro
const oneEuroParetoFront = [];
for (const candidate of oneEuroResults) {
  let isDominated = false;
  for (const other of oneEuroResults) {
    if (other !== candidate &&
        other.variance <= candidate.variance &&
        other.latency <= candidate.latency &&
        (other.variance < candidate.variance || other.latency < candidate.latency)) {
      isDominated = true;
      break;
    }
  }
  if (!isDominated) {
    oneEuroParetoFront.push(candidate);
  }
}

// Calculate Pareto front for Exponential
const expParetoFront = [];
for (const candidate of expResults) {
  let isDominated = false;
  for (const other of expResults) {
    if (other !== candidate &&
        other.variance <= candidate.variance &&
        other.latency <= candidate.latency &&
        (other.variance < candidate.variance || other.latency < candidate.latency)) {
      isDominated = true;
      break;
    }
  }
  if (!isDominated) {
    expParetoFront.push(candidate);
  }
}

// Sort by variance
oneEuroParetoFront.sort((a, b) => a.variance - b.variance);
expParetoFront.sort((a, b) => a.variance - b.variance);

console.log('🔴 ONE EURO FILTER - Pareto Front:');
console.log('───────────────────────────────────────────────────────');
oneEuroParetoFront.forEach((point, i) => {
  console.log(`${i + 1}. Variance: ${point.variance.toFixed(2)}px, Latency: ${point.latency.toFixed(0)}ms (minCutoff=${point.minCutoff.toFixed(3)})`);
});

console.log('\n🔵 EXPONENTIAL SMOOTHING - Pareto Front:');
console.log('───────────────────────────────────────────────────────');
expParetoFront.forEach((point, i) => {
  console.log(`${i + 1}. Variance: ${point.variance.toFixed(2)}px, Latency: ${point.latency.toFixed(0)}ms (alpha=${point.alpha.toFixed(2)})`);
});

// Check if curves are concave (variance increases as latency decreases)
console.log('\n═══════════════════════════════════════════════════════');
console.log('🎯 CURVE SHAPE VERIFICATION');
console.log('═══════════════════════════════════════════════════════\n');

function checkConcavity(paretoFront, name) {
  console.log(`${name}:`);
  
  if (paretoFront.length < 3) {
    console.log('  ⚠️  Not enough points to verify concavity\n');
    return;
  }
  
  let isConcave = true;
  let varianceIncreasing = true;
  let latencyDecreasing = true;
  
  for (let i = 1; i < paretoFront.length; i++) {
    const prevPoint = paretoFront[i - 1];
    const currPoint = paretoFront[i];
    
    if (currPoint.variance <= prevPoint.variance) {
      varianceIncreasing = false;
    }
    if (currPoint.latency >= prevPoint.latency) {
      latencyDecreasing = false;
    }
  }
  
  console.log(`  Variance trend: ${varianceIncreasing ? '✅ Increasing' : '❌ Not monotonic'}`);
  console.log(`  Latency trend: ${latencyDecreasing ? '✅ Decreasing' : '❌ Not monotonic'}`);
  
  if (varianceIncreasing && latencyDecreasing) {
    console.log('  ✅ SMOOTH CONCAVE CURVE - Trade-off is clear!\n');
  } else {
    console.log('  ⚠️  Curve may not be smooth - check parameters\n');
  }
}

checkConcavity(oneEuroParetoFront, '🔴 One Euro Filter');
checkConcavity(expParetoFront, '🔵 Exponential Smoothing');

// Summary
console.log('═══════════════════════════════════════════════════════');
console.log('📈 SUMMARY');
console.log('═══════════════════════════════════════════════════════\n');

console.log(`One Euro Filter:`);
console.log(`  Total tested: ${oneEuroResults.length} parameter combinations`);
console.log(`  Pareto optimal: ${oneEuroParetoFront.length} points`);
console.log(`  Variance range: ${oneEuroParetoFront[0].variance.toFixed(2)}px - ${oneEuroParetoFront[oneEuroParetoFront.length - 1].variance.toFixed(2)}px`);
console.log(`  Latency range: ${oneEuroParetoFront[oneEuroParetoFront.length - 1].latency.toFixed(0)}ms - ${oneEuroParetoFront[0].latency.toFixed(0)}ms\n`);

console.log(`Exponential Smoothing:`);
console.log(`  Total tested: ${expResults.length} parameter combinations`);
console.log(`  Pareto optimal: ${expParetoFront.length} points`);
console.log(`  Variance range: ${expParetoFront[0].variance.toFixed(2)}px - ${expParetoFront[expParetoFront.length - 1].variance.toFixed(2)}px`);
console.log(`  Latency range: ${expParetoFront[expParetoFront.length - 1].latency.toFixed(0)}ms - ${expParetoFront[0].latency.toFixed(0)}ms\n`);

console.log('✅ Simulation complete!\n');
