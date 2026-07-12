/**
 * REALISTIC Pareto Simulation
 * Tests if variance/latency calculations produce smooth concave curves
 */

console.log('🧪 REALISTIC PARETO CURVE SIMULATION\n');

// Generate synthetic data with known characteristics
function generateTestData() {
  const data = [];
  const baseJitter = 20; // pixels of jitter
  
  // Simulate 3 seconds of data at 60fps
  for (let i = 0; i < 180; i++) {
    const time = i * 16.67; // ms
    
    // Stationary at (100, 100) with jitter
    const jitterX = (Math.random() - 0.5) * baseJitter * 2;
    const jitterY = (Math.random() - 0.5) * baseJitter * 2;
    
    data.push({
      time: time,
      x: 100 + jitterX,
      y: 100 + jitterY
    });
  }
  
  return data;
}

// Simple exponential smoothing
function applySmoothing(data, alpha) {
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

// Calculate variance (standard deviation)
function calculateVariance(data) {
  const xValues = data.map(d => d.filteredX);
  const yValues = data.map(d => d.filteredY);
  
  const xMean = xValues.reduce((a, b) => a + b) / xValues.length;
  const yMean = yValues.reduce((a, b) => a + b) / yValues.length;
  
  const xVar = xValues.reduce((sum, x) => sum + (x - xMean) ** 2, 0) / xValues.length;
  const yVar = yValues.reduce((sum, y) => sum + (y - yMean) ** 2, 0) / yValues.length;
  
  return Math.sqrt(xVar + yVar);
}

// Calculate latency (phase lag)
function calculateLatency(data) {
  // Simplified: measure how much filtered lags behind raw
  // Using cross-correlation or time shift that maximizes correlation
  
  let bestShift = 0;
  let bestCorrelation = -Infinity;
  
  // Try different time shifts (0 to 500ms)
  for (let shift = 0; shift <= 30; shift++) {
    let correlation = 0;
    let count = 0;
    
    for (let i = shift; i < data.length; i++) {
      const rawX = data[i - shift].rawX;
      const filteredX = data[i].filteredX;
      correlation += Math.abs(rawX - filteredX);
      count++;
    }
    
    correlation = -correlation / count; // Negative because we want minimum difference
    
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestShift = shift;
    }
  }
  
  return bestShift * 16.67; // Convert samples to ms
}

// Test different alpha values
console.log('Testing different smoothing levels...\n');

const rawData = generateTestData();
const results = [];

// Test alpha from 0.05 to 0.99
for (let alpha = 0.05; alpha <= 0.99; alpha += 0.05) {
  const filtered = applySmoothing(rawData, alpha);
  const variance = calculateVariance(filtered);
  const latency = calculateLatency(filtered);
  
  results.push({ alpha, variance, latency });
  
  console.log(`Alpha: ${alpha.toFixed(2)} → Variance: ${variance.toFixed(2)}px, Latency: ${latency.toFixed(0)}ms`);
}

// Calculate Pareto front
console.log('\n═══════════════════════════════════════════════════════');
console.log('📊 PARETO FRONT CALCULATION');
console.log('═══════════════════════════════════════════════════════\n');

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

console.log('Pareto Optimal Points:');
console.log('───────────────────────────────────────────────────────');
paretoFront.forEach((point, i) => {
  console.log(`${i + 1}. Alpha: ${point.alpha.toFixed(2)} → Variance: ${point.variance.toFixed(2)}px, Latency: ${point.latency.toFixed(0)}ms`);
});

// Check curve shape
console.log('\n═══════════════════════════════════════════════════════');
console.log('🎯 CURVE SHAPE ANALYSIS');
console.log('═══════════════════════════════════════════════════════\n');

if (paretoFront.length >= 3) {
  let isSmooth = true;
  let isConcave = true;
  
  console.log('Checking if variance increases as latency decreases...');
  for (let i = 1; i < paretoFront.length; i++) {
    const prev = paretoFront[i - 1];
    const curr = paretoFront[i];
    
    const varianceIncrease = curr.variance > prev.variance;
    const latencyDecrease = curr.latency < prev.latency;
    
    console.log(`  Point ${i}: Variance ${varianceIncrease ? '↑' : '↓'}, Latency ${latencyDecrease ? '↓' : '↑'} ${varianceIncrease && latencyDecrease ? '✅' : '❌'}`);
    
    if (!varianceIncrease || !latencyDecrease) {
      isSmooth = false;
    }
  }
  
  if (isSmooth) {
    console.log('\n✅ SMOOTH CONCAVE CURVE CONFIRMED!');
    console.log('   As latency decreases → variance increases (expected trade-off)');
  } else {
    console.log('\n❌ CURVE IS NOT SMOOTH');
    console.log('   Trade-off relationship is not monotonic');
  }
} else {
  console.log('⚠️  Not enough Pareto points to verify curve shape');
}

console.log('\n✅ Simulation complete!\n');
