/**
 * Filter Equivalence Verification Tool
 * 
 * Verifies Professor's requirement: When head is NOT moving,
 * One Euro Filter = Exponential Smoothing where α is determined by fc_min
 * 
 * Mathematical basis (from Professor's equations):
 * - α = 1 / (1 + τ/Te)         ... (Eq. 4)
 * - τ = 1 / (2πfc)              ... (Eq. 5)
 * - fc = fc_min + β|Ẋ|          ... (Eq. 7)
 * 
 * When velocity = 0: fc = fc_min
 * Therefore: α = 1 / (1 + 1/(2π*fc_min*Te))
 * 
 * This tool:
 * 1. Calculates equivalent α for any minCutoff
 * 2. Verifies the equivalence experimentally
 * 3. Identifies the "red flag" where variance changes when it shouldn't
 */

console.log('📐 Loading Filter Equivalence Verification Tool...');

class FilterEquivalenceVerifier {
  constructor() {
    this.samplingRate = 60; // Hz
    this.Te = 1 / this.samplingRate; // Sampling period in seconds
  }

  /**
   * Calculate the equivalent exponential smoothing α for a given minCutoff
   * When velocity = 0, One Euro should behave exactly like exponential with this α
   * 
   * From the equations:
   * α = 1 / (1 + τ/Te) where τ = 1/(2πfc)
   * When stationary: fc = fc_min
   * 
   * @param {number} minCutoff - The minimum cutoff frequency (fc_min)
   * @param {number} samplingRate - Sampling rate in Hz (default 60)
   * @returns {number} - Equivalent exponential smoothing α
   */
  calculateEquivalentAlpha(minCutoff, samplingRate = 60) {
    const Te = 1 / samplingRate;
    const tau = 1 / (2 * Math.PI * minCutoff);
    const alpha = 1 / (1 + tau / Te);
    return alpha;
  }

  /**
   * Inverse: Calculate the minCutoff that gives a specific α
   * Useful for matching exponential results to One Euro parameters
   * 
   * From α = 1/(1 + τ/Te) and τ = 1/(2πfc):
   * fc = α / (2π * Te * (1 - α))
   * 
   * @param {number} alpha - Target exponential smoothing factor
   * @param {number} samplingRate - Sampling rate in Hz
   * @returns {number} - Equivalent minCutoff (fc_min)
   */
  calculateEquivalentMinCutoff(alpha, samplingRate = 60) {
    const Te = 1 / samplingRate;
    // α = 1/(1 + τ/Te)
    // 1 + τ/Te = 1/α
    // τ/Te = 1/α - 1 = (1-α)/α
    // τ = Te * (1-α)/α
    // 1/(2πfc) = Te * (1-α)/α
    // fc = α / (2π * Te * (1-α))
    if (alpha >= 1) return Infinity;
    if (alpha <= 0) return 0;
    const minCutoff = alpha / (2 * Math.PI * Te * (1 - alpha));
    return minCutoff;
  }

  /**
   * Generate equivalence table for common parameter values
   * Useful for the professor to verify against Pareto front data
   */
  generateEquivalenceTable() {
    console.log('\n=== ONE EURO ↔ EXPONENTIAL EQUIVALENCE TABLE ===');
    console.log('When head is NOT moving (velocity = 0), One Euro = Exponential');
    console.log(`Sampling rate: ${this.samplingRate} Hz (Te = ${this.Te.toFixed(6)} s)\n`);
    
    console.log('From One Euro to Exponential (given minCutoff → equivalent α):');
    console.log('─'.repeat(60));
    console.log('minCutoff (Hz)  →  Equivalent α  →  Smoothing (1-α)');
    console.log('─'.repeat(60));
    
    const minCutoffValues = [0.001, 0.005, 0.01, 0.021, 0.041, 0.061, 0.081, 0.101, 0.201, 0.5, 1.0];
    const tableOneEuroToExp = [];
    
    for (const fc of minCutoffValues) {
      const alpha = this.calculateEquivalentAlpha(fc);
      const smoothing = 1 - alpha;
      console.log(`${fc.toString().padStart(12)}  →  ${alpha.toFixed(6).padStart(12)}  →  ${smoothing.toFixed(6)}`);
      tableOneEuroToExp.push({ minCutoff: fc, alpha: alpha, smoothing: smoothing });
    }
    
    console.log('\n');
    console.log('From Exponential to One Euro (given α → equivalent minCutoff):');
    console.log('─'.repeat(60));
    console.log('α (smoothing)  →  Equivalent minCutoff (Hz)');
    console.log('─'.repeat(60));
    
    const alphaValues = [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 0.7, 0.9];
    const tableExpToOneEuro = [];
    
    for (const alpha of alphaValues) {
      const fc = this.calculateEquivalentMinCutoff(alpha);
      console.log(`${alpha.toString().padStart(12)}  →  ${fc.toFixed(6)} Hz`);
      tableExpToOneEuro.push({ alpha: alpha, minCutoff: fc });
    }
    
    console.log('\n');
    return { oneEuroToExp: tableOneEuroToExp, expToOneEuro: tableExpToOneEuro };
  }

  /**
   * CRITICAL VERIFICATION: Test if One Euro and Exponential give same variance
   * when applied to the same stationary data with equivalent parameters
   * 
   * This addresses the professor's "red flag" concern
   */
  verifyEquivalenceExperimentally(stationaryData, minCutoff) {
    const equivalentAlpha = this.calculateEquivalentAlpha(minCutoff);
    
    console.log(`\n🔬 EXPERIMENTAL VERIFICATION`);
    console.log(`minCutoff: ${minCutoff} → equivalent α: ${equivalentAlpha.toFixed(6)}`);
    console.log(`Testing on ${stationaryData.length} stationary samples...\n`);
    
    // Apply One Euro filter (with beta and dCutoff that shouldn't matter when stationary)
    const oneEuroFiltered = this.applyOneEuroFilter(stationaryData, {
      frequency: this.samplingRate,
      minCutoff: minCutoff,
      beta: 0.001,    // Should not matter when stationary
      dCutoff: 1.0    // Should not matter when stationary
    });
    
    // Apply exponential smoothing with equivalent alpha
    const expFiltered = this.applyExponentialSmoothing(stationaryData, equivalentAlpha);
    
    // Calculate variances
    const oneEuroVariance = this.calculateVariance(oneEuroFiltered);
    const expVariance = this.calculateVariance(expFiltered);
    
    // Compare
    const varianceDiff = Math.abs(oneEuroVariance - expVariance);
    const percentDiff = (varianceDiff / Math.max(oneEuroVariance, expVariance)) * 100;
    
    console.log('Results:');
    console.log(`  One Euro Variance:    ${oneEuroVariance.toFixed(4)} px`);
    console.log(`  Exponential Variance: ${expVariance.toFixed(4)} px`);
    console.log(`  Difference:           ${varianceDiff.toFixed(4)} px (${percentDiff.toFixed(2)}%)`);
    
    const isEquivalent = percentDiff < 1; // Less than 1% difference
    
    if (isEquivalent) {
      console.log('  ✅ VERIFIED: Filters are equivalent when stationary');
    } else {
      console.log('  ⚠️ WARNING: Filters differ more than expected!');
      console.log('     Possible causes:');
      console.log('     - Data may not be truly stationary (some movement)');
      console.log('     - Numerical precision issues');
      console.log('     - Implementation differences');
    }
    
    return {
      minCutoff: minCutoff,
      equivalentAlpha: equivalentAlpha,
      oneEuroVariance: oneEuroVariance,
      expVariance: expVariance,
      difference: varianceDiff,
      percentDiff: percentDiff,
      isEquivalent: isEquivalent
    };
  }

  /**
   * Test the "RED FLAG": Does variance change when only beta/dCutoff change?
   * (It shouldn't if data is truly stationary)
   */
  testRedFlag(stationaryData, minCutoff) {
    console.log(`\n🚩 RED FLAG TEST: Does variance change when beta/dCutoff change?`);
    console.log(`   (With constant minCutoff = ${minCutoff})\n`);
    
    const betaValues = [0.00001, 0.0001, 0.001, 0.01];
    const dCutoffValues = [0.1, 0.5, 1.0, 2.0];
    
    const results = [];
    
    for (const beta of betaValues) {
      for (const dCutoff of dCutoffValues) {
        const filtered = this.applyOneEuroFilter(stationaryData, {
          frequency: this.samplingRate,
          minCutoff: minCutoff,
          beta: beta,
          dCutoff: dCutoff
        });
        
        const variance = this.calculateVariance(filtered);
        results.push({ beta, dCutoff, variance });
      }
    }
    
    // Calculate variance of variances (should be ~0 if truly stationary)
    const variances = results.map(r => r.variance);
    const meanVar = variances.reduce((a, b) => a + b, 0) / variances.length;
    const varianceOfVariances = variances.reduce((sum, v) => sum + Math.pow(v - meanVar, 2), 0) / variances.length;
    const stdDevOfVariances = Math.sqrt(varianceOfVariances);
    const coefficientOfVariation = (stdDevOfVariances / meanVar) * 100;
    
    console.log('Results (all combinations of beta × dCutoff):');
    console.log('─'.repeat(50));
    console.log('beta       dCutoff    Variance (px)');
    console.log('─'.repeat(50));
    
    for (const r of results) {
      console.log(`${r.beta.toExponential(2).padStart(10)}  ${r.dCutoff.toFixed(1).padStart(7)}    ${r.variance.toFixed(4)}`);
    }
    
    console.log('─'.repeat(50));
    console.log(`Mean variance:         ${meanVar.toFixed(4)} px`);
    console.log(`Std dev of variances:  ${stdDevOfVariances.toFixed(4)} px`);
    console.log(`Coefficient of variation: ${coefficientOfVariation.toFixed(2)}%`);
    
    const hasRedFlag = coefficientOfVariation > 5; // More than 5% variation is suspicious
    
    if (hasRedFlag) {
      console.log('\n🚨 RED FLAG CONFIRMED: Variance changes significantly!');
      console.log('   This suggests the data is NOT truly stationary.');
      console.log('   The "variance measurement" period may include movement.');
    } else {
      console.log('\n✅ NO RED FLAG: Variance is consistent across parameters.');
      console.log('   Beta and dCutoff do not affect variance when stationary (as expected).');
    }
    
    return {
      results: results,
      meanVariance: meanVar,
      stdDevOfVariances: stdDevOfVariances,
      coefficientOfVariation: coefficientOfVariation,
      hasRedFlag: hasRedFlag
    };
  }

  /**
   * Apply One Euro filter to data
   */
  applyOneEuroFilter(data, params) {
    if (!window.OneEuroFilter2D) {
      console.error('OneEuroFilter2D not available');
      return data;
    }
    
    const filter2D = new OneEuroFilter2D(
      params.frequency,
      params.minCutoff,
      params.beta,
      params.dCutoff
    );
    
    return data.map((point, i) => {
      const filtered = filter2D.filter(point.x, point.y, i / params.frequency);
      return { x: filtered.x, y: filtered.y };
    });
  }

  /**
   * Apply exponential smoothing to data
   */
  applyExponentialSmoothing(data, alpha) {
    if (data.length === 0) return [];
    
    const result = [{ x: data[0].x, y: data[0].y }];
    
    for (let i = 1; i < data.length; i++) {
      result.push({
        x: alpha * data[i].x + (1 - alpha) * result[i - 1].x,
        y: alpha * data[i].y + (1 - alpha) * result[i - 1].y
      });
    }
    
    return result;
  }

  /**
   * Calculate 2D variance (standard deviation of positions)
   */
  calculateVariance(data) {
    if (data.length < 2) return 0;
    
    const xValues = data.map(d => d.x);
    const yValues = data.map(d => d.y);
    
    const xMean = xValues.reduce((a, b) => a + b, 0) / xValues.length;
    const yMean = yValues.reduce((a, b) => a + b, 0) / yValues.length;
    
    const xVar = xValues.reduce((sum, x) => sum + Math.pow(x - xMean, 2), 0) / xValues.length;
    const yVar = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0) / yValues.length;
    
    return Math.sqrt(xVar + yVar);
  }

  /**
   * Match Pareto front parameters to exponential alpha values
   * Useful for comparing One Euro Pareto front with Exponential Pareto front
   */
  matchParetoFronts() {
    console.log('\n=== PARETO FRONT MATCHING ===');
    console.log('Comparing One Euro minCutoff values to equivalent Exponential α values\n');
    
    if (!window.PARETO_FRONT_PARAMETERS) {
      console.warn('PARETO_FRONT_PARAMETERS not loaded');
      return null;
    }
    
    if (!window.EXPONENTIAL_PARAMETERS) {
      console.warn('EXPONENTIAL_PARAMETERS not loaded');
      return null;
    }
    
    const matches = [];
    
    // For each One Euro Pareto point, find matching Exponential point
    for (const oneEuro of window.PARETO_FRONT_PARAMETERS.slice(0, 10)) { // First 10
      const equivalentAlpha = this.calculateEquivalentAlpha(oneEuro.minCutoff);
      
      // Find closest exponential parameter
      let closestExp = null;
      let closestDiff = Infinity;
      
      for (const exp of window.EXPONENTIAL_PARAMETERS) {
        const diff = Math.abs(exp.alpha - equivalentAlpha);
        if (diff < closestDiff) {
          closestDiff = diff;
          closestExp = exp;
        }
      }
      
      if (closestExp) {
        matches.push({
          oneEuro: {
            minCutoff: oneEuro.minCutoff,
            beta: oneEuro.beta,
            dCutoff: oneEuro.dCutoff,
            variance: oneEuro.meanVariance,
            latency: oneEuro.meanLatency
          },
          equivalentAlpha: equivalentAlpha,
          closestExp: {
            alpha: closestExp.alpha,
            variance: closestExp.meanVariance,
            latency: closestExp.meanLatency
          },
          alphaDiff: closestDiff,
          varianceDiff: Math.abs(oneEuro.meanVariance - closestExp.meanVariance),
          latencyDiff: Math.abs(oneEuro.meanLatency - closestExp.meanLatency)
        });
      }
    }
    
    console.log('One Euro (minCutoff) → Equivalent α → Closest Exponential α');
    console.log('─'.repeat(80));
    
    for (const m of matches) {
      console.log(`minCutoff=${m.oneEuro.minCutoff.toFixed(3)} → α=${m.equivalentAlpha.toFixed(4)} → closest=${m.closestExp.alpha.toFixed(4)} (diff=${m.alphaDiff.toFixed(4)})`);
      console.log(`  One Euro: var=${m.oneEuro.variance.toFixed(2)}px, lat=${m.oneEuro.latency.toFixed(0)}ms`);
      console.log(`  Exponent: var=${m.closestExp.variance.toFixed(2)}px, lat=${m.closestExp.latency.toFixed(0)}ms`);
      console.log(`  Difference: Δvar=${m.varianceDiff.toFixed(2)}px, Δlat=${m.latencyDiff.toFixed(0)}ms`);
      console.log('');
    }
    
    return matches;
  }

  /**
   * Generate report for professor
   */
  generateProfessorReport() {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║     FILTER EQUIVALENCE VERIFICATION REPORT FOR PROFESSOR       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    
    // 1. Equivalence table
    this.generateEquivalenceTable();
    
    // 2. Pareto front matching
    this.matchParetoFronts();
    
    // 3. Instructions for verification
    console.log('\n=== HOW TO VERIFY EXPERIMENTALLY ===');
    console.log('');
    console.log('To verify that One Euro = Exponential when stationary:');
    console.log('');
    console.log('1. Run Parameter Optimization to collect stationary data');
    console.log('2. Call: verifier.runFullVerification()');
    console.log('3. This will use the collected data to verify equivalence');
    console.log('');
    console.log('To check for the RED FLAG (variance changing when it shouldn\'t):');
    console.log('');
    console.log('1. Collect stationary data at a single position');
    console.log('2. Call: verifier.testRedFlag(stationaryData, minCutoff)');
    console.log('3. If coefficient of variation > 5%, there\'s a problem');
    console.log('');
    
    return true;
  }

  /**
   * Run full verification using collected parameter optimization data
   */
  runFullVerification() {
    console.log('\n🔬 RUNNING FULL VERIFICATION...\n');
    
    // Check if we have collected data
    if (!window.parameterOptimizer || !window.parameterOptimizer.rawData) {
      console.log('No collected data found. Please run Parameter Optimization first.');
      console.log('Then call this function again.');
      return null;
    }
    
    const rawData = window.parameterOptimizer.rawData;
    const results = [];
    
    // For each position that has stationary data
    for (const positionData of rawData) {
      if (!positionData.data || !positionData.data.varianceData) continue;
      
      // Extract stationary period data
      const stationaryData = positionData.data.varianceData.map(d => ({
        x: d.x || d.headX,
        y: d.y || d.headY
      })).filter(d => d.x !== undefined && d.y !== undefined);
      
      if (stationaryData.length < 10) continue;
      
      console.log(`\nPosition: ${positionData.position.name}`);
      console.log(`Stationary samples: ${stationaryData.length}`);
      
      // Test equivalence for common minCutoff values
      for (const minCutoff of [0.001, 0.021, 0.061]) {
        const result = this.verifyEquivalenceExperimentally(stationaryData, minCutoff);
        results.push({
          position: positionData.position.name,
          ...result
        });
      }
      
      // Run red flag test
      this.testRedFlag(stationaryData, 0.021);
    }
    
    // Summary
    console.log('\n=== VERIFICATION SUMMARY ===');
    const equivalentCount = results.filter(r => r.isEquivalent).length;
    console.log(`${equivalentCount}/${results.length} tests passed (< 1% difference)`);
    
    if (equivalentCount === results.length) {
      console.log('✅ ALL TESTS PASSED: One Euro = Exponential when stationary');
    } else {
      console.log('⚠️ SOME TESTS FAILED: Check individual results above');
    }
    
    return results;
  }
}

// Create global instance
window.FilterEquivalenceVerifier = FilterEquivalenceVerifier;
window.filterVerifier = new FilterEquivalenceVerifier();

/**
 * Open the Filter Verification Panel UI
 * This creates a modal panel for the professor to use
 */
window.openFilterVerificationPanel = function() {
  // Remove existing panel if any
  const existing = document.getElementById('filter-verification-panel');
  if (existing) existing.remove();
  
  const panel = document.createElement('div');
  panel.id = 'filter-verification-panel';
  panel.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 900px;
    max-height: 85vh;
    background: #1a1a2e;
    color: #eee;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
    z-index: 10001;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  `;
  
  panel.innerHTML = `
    <div style="padding: 20px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center;">
      <h2 style="margin: 0; color: #00d4ff;">📐 Filter Equivalence Verification</h2>
      <button id="close-verification-panel" style="
        background: #ff4444;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 5px;
        cursor: pointer;
        font-weight: bold;
      ">✕ Close</button>
    </div>
    
    <div style="padding: 20px; overflow-y: auto; flex: 1;">
      <!-- Mathematical Explanation -->
      <div style="background: #252542; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: #ffaa00;">📚 Mathematical Basis</h3>
        <p>When head is <strong>NOT moving</strong> (velocity = 0), One Euro Filter = Exponential Smoothing:</p>
        <div style="background: #1a1a2e; padding: 10px; border-radius: 5px; font-family: monospace; margin: 10px 0;">
          α = 1 / (1 + τ/Te)<br>
          τ = 1 / (2π × fc_min)<br>
          ∴ α = 1 / (1 + 1/(2π × fc_min × Te))
        </div>
        <p style="color: #888; font-size: 14px;">Where Te = sampling period (1/60 ≈ 0.0167s at 60fps)</p>
      </div>
      
      <!-- Equivalence Table -->
      <div style="background: #252542; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: #00ff88;">📊 Equivalence Table</h3>
        <p style="color: #aaa; font-size: 14px;">One Euro minCutoff ↔ Equivalent Exponential α</p>
        <div id="equivalence-table-container" style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background: #1a1a2e;">
                <th style="padding: 10px; border: 1px solid #444; text-align: left;">minCutoff (Hz)</th>
                <th style="padding: 10px; border: 1px solid #444; text-align: left;">Equivalent α</th>
                <th style="padding: 10px; border: 1px solid #444; text-align: left;">Smoothing (1-α)</th>
                <th style="padding: 10px; border: 1px solid #444; text-align: left;">Description</th>
              </tr>
            </thead>
            <tbody id="equivalence-table-body">
            </tbody>
          </table>
        </div>
      </div>
      
      <!-- Calculator Section -->
      <div style="background: #252542; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: #ff88ff;">🧮 Interactive Calculator</h3>
        <div style="display: flex; gap: 20px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 250px;">
            <label style="display: block; margin-bottom: 5px; color: #aaa;">minCutoff → α:</label>
            <div style="display: flex; gap: 10px;">
              <input type="number" id="mincutoff-input" value="0.021" step="0.001" min="0.001" max="10"
                style="flex: 1; padding: 10px; border-radius: 5px; border: 1px solid #444; background: #1a1a2e; color: #fff;">
              <span id="alpha-result" style="padding: 10px; background: #00aa00; color: white; border-radius: 5px; min-width: 100px; text-align: center;">
                α = 0.0022
              </span>
            </div>
          </div>
          <div style="flex: 1; min-width: 250px;">
            <label style="display: block; margin-bottom: 5px; color: #aaa;">α → minCutoff:</label>
            <div style="display: flex; gap: 10px;">
              <input type="number" id="alpha-input" value="0.02" step="0.001" min="0.001" max="0.999"
                style="flex: 1; padding: 10px; border-radius: 5px; border: 1px solid #444; background: #1a1a2e; color: #fff;">
              <span id="mincutoff-result" style="padding: 10px; background: #0088ff; color: white; border-radius: 5px; min-width: 100px; text-align: center;">
                fc = 0.194 Hz
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Red Flag Test Section -->
      <div style="background: #252542; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: #ff4444;">🚩 Red Flag Test</h3>
        <p style="color: #aaa; font-size: 14px;">
          Test if variance changes when beta/dCutoff change (it shouldn't when stationary).
        </p>
        <button id="run-red-flag-test" style="
          padding: 12px 24px;
          background: #ff6600;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-weight: bold;
          margin-top: 10px;
        ">Run Red Flag Test (requires collected data)</button>
        <div id="red-flag-results" style="margin-top: 15px; display: none;"></div>
      </div>
      
      <!-- Pareto Matching Section -->
      <div style="background: #252542; padding: 15px; border-radius: 8px;">
        <h3 style="margin-top: 0; color: #ffff00;">🔗 Pareto Front Matching</h3>
        <p style="color: #aaa; font-size: 14px;">
          Compare One Euro and Exponential Pareto fronts at equivalent parameters.
        </p>
        <button id="match-pareto-fronts" style="
          padding: 12px 24px;
          background: #8844ff;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-weight: bold;
          margin-top: 10px;
        ">Match Pareto Fronts</button>
        <div id="pareto-matching-results" style="margin-top: 15px; display: none;"></div>
      </div>
    </div>
  `;
  
  document.body.appendChild(panel);
  
  // Add backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'filter-verification-backdrop';
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.7);
    z-index: 10000;
  `;
  backdrop.onclick = () => {
    panel.remove();
    backdrop.remove();
  };
  document.body.appendChild(backdrop);
  
  // Populate equivalence table
  populateEquivalenceTable();
  
  // Setup event handlers
  document.getElementById('close-verification-panel').onclick = () => {
    panel.remove();
    backdrop.remove();
  };
  
  // Calculator handlers
  const minCutoffInput = document.getElementById('mincutoff-input');
  const alphaInput = document.getElementById('alpha-input');
  
  minCutoffInput.oninput = () => {
    const fc = parseFloat(minCutoffInput.value);
    if (fc > 0) {
      const alpha = window.filterVerifier.calculateEquivalentAlpha(fc);
      document.getElementById('alpha-result').textContent = `α = ${alpha.toFixed(6)}`;
    }
  };
  
  alphaInput.oninput = () => {
    const alpha = parseFloat(alphaInput.value);
    if (alpha > 0 && alpha < 1) {
      const fc = window.filterVerifier.calculateEquivalentMinCutoff(alpha);
      document.getElementById('mincutoff-result').textContent = `fc = ${fc.toFixed(4)} Hz`;
    }
  };
  
  // Red flag test handler
  document.getElementById('run-red-flag-test').onclick = () => {
    const resultsDiv = document.getElementById('red-flag-results');
    resultsDiv.style.display = 'block';
    
    // Check if we have collected data
    if (!window.parameterOptimizer || !window.parameterOptimizer.rawData || window.parameterOptimizer.rawData.length === 0) {
      resultsDiv.innerHTML = `
        <div style="background: #442222; padding: 15px; border-radius: 5px; color: #ff8888;">
          ⚠️ No collected data available. Please run Parameter Optimization first to collect stationary data.
        </div>
      `;
      return;
    }
    
    resultsDiv.innerHTML = `<div style="color: #888;">Running test...</div>`;
    
    // Run the test
    setTimeout(() => {
      try {
        const rawData = window.parameterOptimizer.rawData;
        const firstPosition = rawData[0];
        
        if (!firstPosition || !firstPosition.data || !firstPosition.data.varianceData) {
          resultsDiv.innerHTML = `<div style="color: #ff8888;">No variance data found in collected data.</div>`;
          return;
        }
        
        // Extract stationary data
        const stationaryData = firstPosition.data.varianceData.map(d => ({
          x: d.headX || d.x || 0,
          y: d.headY || d.y || 0
        })).filter(d => d.x !== 0 || d.y !== 0);
        
        if (stationaryData.length < 10) {
          resultsDiv.innerHTML = `<div style="color: #ff8888;">Insufficient stationary data (${stationaryData.length} samples).</div>`;
          return;
        }
        
        const result = window.filterVerifier.testRedFlag(stationaryData, 0.021);
        
        const flagColor = result.hasRedFlag ? '#ff4444' : '#00ff88';
        const flagIcon = result.hasRedFlag ? '🚨' : '✅';
        
        resultsDiv.innerHTML = `
          <div style="background: ${result.hasRedFlag ? '#442222' : '#224422'}; padding: 15px; border-radius: 5px;">
            <h4 style="margin-top: 0; color: ${flagColor};">${flagIcon} ${result.hasRedFlag ? 'RED FLAG DETECTED' : 'NO RED FLAG'}</h4>
            <p>Mean variance: ${result.meanVariance.toFixed(4)} px</p>
            <p>Std dev of variances: ${result.stdDevOfVariances.toFixed(4)} px</p>
            <p>Coefficient of variation: ${result.coefficientOfVariation.toFixed(2)}%</p>
            <p style="color: #888; font-size: 13px; margin-top: 10px;">
              ${result.hasRedFlag 
                ? 'Variance changed significantly when beta/dCutoff changed - data may not be truly stationary.'
                : 'Variance stayed consistent - beta/dCutoff do not affect variance when stationary (as expected).'}
            </p>
          </div>
        `;
      } catch (err) {
        resultsDiv.innerHTML = `<div style="color: #ff8888;">Error: ${err.message}</div>`;
      }
    }, 100);
  };
  
  // Pareto matching handler
  document.getElementById('match-pareto-fronts').onclick = () => {
    const resultsDiv = document.getElementById('pareto-matching-results');
    resultsDiv.style.display = 'block';
    
    if (!window.PARETO_FRONT_PARAMETERS || !window.EXPONENTIAL_PARAMETERS) {
      resultsDiv.innerHTML = `
        <div style="background: #442222; padding: 15px; border-radius: 5px; color: #ff8888;">
          ⚠️ Pareto front data not loaded. Make sure PARETO_FRONT_PARAMETERS and EXPONENTIAL_PARAMETERS are available.
        </div>
      `;
      return;
    }
    
    const matches = window.filterVerifier.matchParetoFronts();
    
    if (!matches) {
      resultsDiv.innerHTML = `<div style="color: #ff8888;">Could not match Pareto fronts.</div>`;
      return;
    }
    
    let html = `
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #1a1a2e;">
            <th style="padding: 8px; border: 1px solid #444;">One Euro<br>minCutoff</th>
            <th style="padding: 8px; border: 1px solid #444;">Equiv.<br>α</th>
            <th style="padding: 8px; border: 1px solid #444;">One Euro<br>Variance</th>
            <th style="padding: 8px; border: 1px solid #444;">Exp.<br>Variance</th>
            <th style="padding: 8px; border: 1px solid #444;">Δ Var</th>
            <th style="padding: 8px; border: 1px solid #444;">Δ Lat</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    for (const m of matches) {
      const varDiffColor = m.varianceDiff < 1 ? '#00ff88' : '#ffaa00';
      html += `
        <tr>
          <td style="padding: 8px; border: 1px solid #444;">${m.oneEuro.minCutoff.toFixed(3)}</td>
          <td style="padding: 8px; border: 1px solid #444;">${m.equivalentAlpha.toFixed(4)}</td>
          <td style="padding: 8px; border: 1px solid #444;">${m.oneEuro.variance.toFixed(2)}px</td>
          <td style="padding: 8px; border: 1px solid #444;">${m.closestExp.variance.toFixed(2)}px</td>
          <td style="padding: 8px; border: 1px solid #444; color: ${varDiffColor};">${m.varianceDiff.toFixed(2)}px</td>
          <td style="padding: 8px; border: 1px solid #444;">${m.latencyDiff.toFixed(0)}ms</td>
        </tr>
      `;
    }
    
    html += `</tbody></table>`;
    resultsDiv.innerHTML = html;
  };
};

function populateEquivalenceTable() {
  const tbody = document.getElementById('equivalence-table-body');
  const verifier = window.filterVerifier;
  
  const data = [
    { fc: 0.001, desc: 'Very heavy smoothing (lowest variance)' },
    { fc: 0.005, desc: 'Heavy smoothing' },
    { fc: 0.01, desc: 'Strong smoothing' },
    { fc: 0.021, desc: 'Medium-heavy smoothing' },
    { fc: 0.041, desc: 'Medium smoothing' },
    { fc: 0.061, desc: 'Medium-light smoothing' },
    { fc: 0.101, desc: 'Light smoothing' },
    { fc: 0.201, desc: 'Very light smoothing' },
    { fc: 0.5, desc: 'Minimal smoothing' },
    { fc: 1.0, desc: 'Almost no smoothing (highest variance)' }
  ];
  
  tbody.innerHTML = data.map(d => {
    const alpha = verifier.calculateEquivalentAlpha(d.fc);
    const smoothing = 1 - alpha;
    return `
      <tr>
        <td style="padding: 10px; border: 1px solid #444;">${d.fc}</td>
        <td style="padding: 10px; border: 1px solid #444; color: #00ff88;">${alpha.toFixed(6)}</td>
        <td style="padding: 10px; border: 1px solid #444;">${smoothing.toFixed(6)}</td>
        <td style="padding: 10px; border: 1px solid #444; color: #888; font-size: 13px;">${d.desc}</td>
      </tr>
    `;
  }).join('');
}

console.log('✅ Filter Equivalence Verification Tool loaded');
console.log('   Use the "📐 Filter Equivalence Check" button in the webapp');
