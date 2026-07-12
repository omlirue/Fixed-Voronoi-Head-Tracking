/**
 * Analyze the professor's real data to show:
 * 1. The old method's Pareto curve (non-smooth)
 * 2. What the new velocity-threshold method would produce
 *
 * Run: node test_real_data_pareto.js
 */

const fs = require('fs');

// ─── Parse CSV ───────────────────────────────────────────────────────────────

function parseCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const header = lines[0].split(',');
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const row = {};
    header.forEach((h, i) => { row[h.trim()] = parseFloat(vals[i]); });
    return row;
  }).filter(r => !isNaN(r[header[0].trim()]));
}

// ─── Pareto front extraction ─────────────────────────────────────────────────

function extractPareto(points) {
  const pareto = [];
  for (const p of points) {
    const dominated = points.some(o =>
      o.meanVariance <= p.meanVariance && o.meanLatency <= p.meanLatency &&
      (o.meanVariance < p.meanVariance || o.meanLatency < p.meanLatency)
    );
    if (!dominated) pareto.push(p);
  }
  return pareto.sort((a, b) => a.meanVariance - b.meanVariance);
}

// ─── Smoothness analysis ─────────────────────────────────────────────────────

function analyzeSmoothnessDetailed(pareto, label) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${label}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Total Pareto-optimal points: ${pareto.length}`);

  if (pareto.length < 3) {
    console.log('Too few points for analysis');
    return;
  }

  // Print the Pareto front
  console.log('\n' + 'variance(px)'.padEnd(14) + 'latency(ms)'.padEnd(14) + 'Δlatency'.padEnd(12));
  console.log('─'.repeat(40));

  const jumps = [];
  for (let i = 0; i < pareto.length; i++) {
    const dLat = i > 0 ? (pareto[i].meanLatency - pareto[i - 1].meanLatency).toFixed(1) : '—';
    console.log(
      pareto[i].meanVariance.toFixed(3).padEnd(14) +
      pareto[i].meanLatency.toFixed(1).padEnd(14) +
      String(dLat).padEnd(12)
    );
    if (i > 0) jumps.push(Math.abs(pareto[i].meanLatency - pareto[i - 1].meanLatency));
  }

  const meanJump = jumps.reduce((a, b) => a + b, 0) / jumps.length;
  const maxJump = Math.max(...jumps);
  const abruptCount = jumps.filter(j => j > meanJump * 3).length;

  // Check monotonicity (latency should decrease as variance increases for a good Pareto)
  let nonMonotone = 0;
  for (let i = 1; i < pareto.length; i++) {
    if (pareto[i].meanLatency > pareto[i - 1].meanLatency) nonMonotone++;
  }

  console.log('\nSmoothing metrics:');
  console.log(`  Mean Δlatency: ${meanJump.toFixed(1)}ms`);
  console.log(`  Max Δlatency: ${maxJump.toFixed(1)}ms`);
  console.log(`  Abrupt jumps (>3× mean): ${abruptCount}/${jumps.length}`);
  console.log(`  Non-monotone steps (latency increases): ${nonMonotone}/${jumps.length}`);
  console.log(`  Variance range: ${pareto[0].meanVariance.toFixed(2)} – ${pareto[pareto.length - 1].meanVariance.toFixed(2)}px`);
  console.log(`  Latency range: ${Math.min(...pareto.map(p => p.meanLatency)).toFixed(1)} – ${Math.max(...pareto.map(p => p.meanLatency)).toFixed(1)}ms`);

  const smooth = abruptCount === 0 && nonMonotone <= 1;
  console.log(`\n  VERDICT: ${smooth ? '✅ SMOOTH Pareto curve' : '⚠️  NON-SMOOTH Pareto curve'}`);

  return { meanJump, maxJump, abruptCount, nonMonotone };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Analysis of Professor\'s Real Data ===\n');

  // 1. Load One Euro results (old method)
  const oneEuroPath = '/Users/soha/Downloads/oneeuro-2026-02-17T19-59-23-573Z (2).csv';
  const oneEuro = parseCSV(oneEuroPath);
  console.log(`One Euro results: ${oneEuro.length} parameter combinations`);

  // Show variance and latency ranges
  const varRange = [Math.min(...oneEuro.map(r => r.meanVariance)), Math.max(...oneEuro.map(r => r.meanVariance))];
  const latRange = [Math.min(...oneEuro.map(r => r.meanLatency)), Math.max(...oneEuro.map(r => r.meanLatency))];
  console.log(`  Variance range: ${varRange[0].toFixed(2)} – ${varRange[1].toFixed(2)}px`);
  console.log(`  Latency range: ${latRange[0].toFixed(1)} – ${latRange[1].toFixed(1)}ms`);

  // 2. Load Exponential results (old method)
  const expPath = '/Users/soha/Downloads/exponential-2026-02-17T19-59-31-197Z (2).csv';
  const expData = parseCSV(expPath);
  console.log(`\nExponential results: ${expData.length} parameter combinations`);

  // 3. Extract Pareto fronts from old method
  const oneEuroPareto = extractPareto(oneEuro);
  analyzeSmoothnessDetailed(oneEuroPareto, 'ONE EURO — OLD METHOD (arrival radius) Pareto Front');

  const expPareto = extractPareto(expData);
  analyzeSmoothnessDetailed(expPareto, 'EXPONENTIAL — OLD METHOD (arrival radius) Pareto Front');

  // 4. Detailed jump analysis — look at the worst jumps
  console.log('\n\n' + '='.repeat(70));
  console.log('DETAILED JUMP ANALYSIS — One Euro Old Method');
  console.log('='.repeat(70));

  for (let i = 1; i < oneEuroPareto.length; i++) {
    const dLat = Math.abs(oneEuroPareto[i].meanLatency - oneEuroPareto[i - 1].meanLatency);
    const dVar = Math.abs(oneEuroPareto[i].meanVariance - oneEuroPareto[i - 1].meanVariance);
    if (dLat > 10) {
      console.log(`\n  Jump at index ${i}:`);
      console.log(`    From: variance=${oneEuroPareto[i - 1].meanVariance.toFixed(3)}, latency=${oneEuroPareto[i - 1].meanLatency.toFixed(1)}ms`);
      if (oneEuroPareto[i - 1].minCutoff !== undefined)
        console.log(`           params: minCutoff=${oneEuroPareto[i - 1].minCutoff}, beta=${oneEuroPareto[i - 1].beta}, dCutoff=${oneEuroPareto[i - 1].dCutoff}`);
      console.log(`    To:   variance=${oneEuroPareto[i].meanVariance.toFixed(3)}, latency=${oneEuroPareto[i].meanLatency.toFixed(1)}ms`);
      if (oneEuroPareto[i].minCutoff !== undefined)
        console.log(`           params: minCutoff=${oneEuroPareto[i].minCutoff}, beta=${oneEuroPareto[i].beta}, dCutoff=${oneEuroPareto[i].dCutoff}`);
      console.log(`    Δvariance: ${dVar.toFixed(3)}px, Δlatency: ${dLat.toFixed(1)}ms`);
    }
  }

  // 5. Distribution of latency values (check for quantization/clustering)
  console.log('\n\n' + '='.repeat(70));
  console.log('LATENCY DISTRIBUTION — One Euro (all 19000 points)');
  console.log('='.repeat(70));

  const latencyValues = oneEuro.map(r => r.meanLatency);
  const uniqueLatencies = [...new Set(latencyValues.map(l => l.toFixed(1)))];
  console.log(`\nUnique latency values: ${uniqueLatencies.length} out of ${latencyValues.length} total`);

  // Histogram of latency values
  const bucketSize = 10;
  const buckets = {};
  for (const l of latencyValues) {
    const bucket = Math.floor(l / bucketSize) * bucketSize;
    buckets[bucket] = (buckets[bucket] || 0) + 1;
  }
  const sortedBuckets = Object.keys(buckets).map(Number).sort((a, b) => a - b);
  console.log('\nLatency histogram (10ms buckets):');
  for (const b of sortedBuckets) {
    const bar = '█'.repeat(Math.min(Math.ceil(buckets[b] / 50), 60));
    console.log(`  ${String(b).padStart(4)}–${String(b + bucketSize).padStart(4)}ms: ${String(buckets[b]).padStart(5)} ${bar}`);
  }

  // Write old Pareto front to CSV for comparison
  const paretoCSV = 'variance,latency,minCutoff,beta,dCutoff\n' +
    oneEuroPareto.map(p =>
      `${p.meanVariance.toFixed(4)},${p.meanLatency.toFixed(2)},${p.minCutoff || ''},${p.beta || ''},${p.dCutoff || ''}`
    ).join('\n');
  fs.writeFileSync('old_method_pareto.csv', paretoCSV);
  console.log('\nOld method Pareto front written to old_method_pareto.csv');
}

main();
