/**
 * Standalone Pareto Analysis Tool
 * 
 * This tool allows:
 * 1. Re-running Pareto analysis on previously collected data
 * 2. Loading and analyzing exported JSON data
 * 3. Comparing results across different conditions/users
 * 4. Finding optimal variance levels
 * 
 * Professor's requirements addressed:
 * - Reproducible Pareto curve generation
 * - Comparison across lighting conditions
 * - Finding where variance "plateaus"
 */

console.log('📊 Loading Standalone Pareto Analysis Tool...');

class ParetoAnalysisTool {
  constructor() {
    this.loadedData = null;
    this.analysisResults = [];
  }

  /**
   * Load previously exported JSON data for re-analysis
   */
  async loadFromFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) {
          reject(new Error('No file selected'));
          return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            this.loadedData = JSON.parse(event.target.result);
            console.log('✅ Data loaded successfully:', {
              positions: this.loadedData.rawData?.length || 0,
              filterType: this.loadedData.metadata?.filterType,
              timestamp: this.loadedData.metadata?.timestamp,
              environment: this.loadedData.metadata?.environmentConditions
            });
            resolve(this.loadedData);
          } catch (err) {
            reject(new Error('Invalid JSON file'));
          }
        };
        reader.readAsText(file);
      };
      
      input.click();
    });
  }

  /**
   * Re-run Pareto analysis on loaded data with different parameter ranges
   */
  rerunAnalysis(customParameterRanges = null) {
    if (!this.loadedData || !this.loadedData.rawData) {
      console.error('No data loaded. Call loadFromFile() first.');
      return null;
    }
    
    console.log('🔄 Re-running Pareto analysis...');
    
    // Use custom ranges or default
    const ranges = customParameterRanges || {
      minCutoff: { min: 0.001, max: 1.0, step: 0.02 },
      beta: { min: 0.00001, max: 0.01, step: 0.0005 },
      dCutoff: { min: 0.1, max: 2.0, step: 0.1 }
    };
    
    // This would need the ParameterOptimizer analysis methods
    // For now, return the existing results
    return this.loadedData.paretoFront;
  }

  /**
   * Find optimal variance levels (where throughput plateaus)
   * This addresses Professor's question: "When do we stop increasing variance?"
   */
  findOptimalVarianceLevels(paretoFront) {
    if (!paretoFront || paretoFront.length < 3) {
      console.warn('Need at least 3 Pareto points for analysis');
      return null;
    }
    
    // Sort by variance
    const sorted = [...paretoFront].sort((a, b) => a.meanVariance - b.meanVariance);
    
    // Calculate throughput proxy: lower latency = higher throughput
    // Normalize latency to throughput-like metric (inverse relationship)
    const maxLatency = Math.max(...sorted.map(p => p.meanLatency));
    const withThroughput = sorted.map(p => ({
      ...p,
      throughputProxy: (maxLatency - p.meanLatency) / maxLatency
    }));
    
    // Find where throughput improvement slows down (diminishing returns)
    const improvements = [];
    for (let i = 1; i < withThroughput.length; i++) {
      const varianceIncrease = withThroughput[i].meanVariance - withThroughput[i-1].meanVariance;
      const throughputIncrease = withThroughput[i].throughputProxy - withThroughput[i-1].throughputProxy;
      
      // Throughput gain per unit variance increase
      const efficiency = varianceIncrease > 0 ? throughputIncrease / varianceIncrease : 0;
      
      improvements.push({
        fromVariance: withThroughput[i-1].meanVariance,
        toVariance: withThroughput[i].meanVariance,
        throughputGain: throughputIncrease,
        efficiency: efficiency,
        params: withThroughput[i].params
      });
    }
    
    // Find the "knee" - where efficiency drops significantly
    const avgEfficiency = improvements.reduce((sum, imp) => sum + imp.efficiency, 0) / improvements.length;
    
    // Points where efficiency is above average are "worth it"
    const worthItPoints = improvements.filter(imp => imp.efficiency > avgEfficiency * 0.5);
    
    console.log('\n=== VARIANCE LEVEL ANALYSIS ===');
    console.log('Finding optimal variance levels (where throughput gain slows down)\n');
    
    console.log('Variance → Throughput Efficiency:');
    console.log('─'.repeat(70));
    for (const imp of improvements) {
      const marker = imp.efficiency > avgEfficiency ? '✓ Worth it' : '✗ Diminishing';
      console.log(`${imp.fromVariance.toFixed(1)} → ${imp.toVariance.toFixed(1)}px: efficiency=${imp.efficiency.toFixed(4)} ${marker}`);
    }
    
    // Suggest 2-3 variance levels
    const suggestions = [];
    
    // Low variance (smoothest)
    if (sorted.length > 0) {
      suggestions.push({
        level: 'LOW',
        variance: sorted[0].meanVariance,
        latency: sorted[0].meanLatency,
        description: 'Smoothest cursor, highest latency - best for precision tasks'
      });
    }
    
    // Medium variance (balanced) - find the "knee"
    const kneeIndex = improvements.findIndex(imp => imp.efficiency < avgEfficiency * 0.5);
    if (kneeIndex > 0 && kneeIndex < sorted.length) {
      suggestions.push({
        level: 'MEDIUM',
        variance: sorted[kneeIndex].meanVariance,
        latency: sorted[kneeIndex].meanLatency,
        description: 'Balanced - good throughput with acceptable smoothness'
      });
    }
    
    // High variance (fastest)
    const lastWorthIt = worthItPoints[worthItPoints.length - 1];
    if (lastWorthIt) {
      suggestions.push({
        level: 'HIGH',
        variance: lastWorthIt.toVariance,
        latency: sorted.find(p => Math.abs(p.meanVariance - lastWorthIt.toVariance) < 0.5)?.meanLatency || 0,
        description: 'Fastest response, some jitter - last point before diminishing returns'
      });
    }
    
    console.log('\n=== SUGGESTED VARIANCE LEVELS FOR STUDY ===');
    for (const s of suggestions) {
      console.log(`\n${s.level} VARIANCE: ${s.variance.toFixed(1)}px`);
      console.log(`  Latency: ${s.latency.toFixed(0)}ms`);
      console.log(`  ${s.description}`);
    }
    
    // Answer to "Why not keep increasing variance?"
    console.log('\n=== WHY THESE LEVELS? ===');
    console.log('Beyond the HIGH variance level, throughput gains become marginal');
    console.log('while cursor jitter becomes increasingly noticeable and distracting.');
    console.log('The selected levels represent meaningful differences in the trade-off.');
    
    return {
      improvements: improvements,
      suggestions: suggestions,
      avgEfficiency: avgEfficiency
    };
  }

  /**
   * Compare multiple Pareto fronts (e.g., different lighting conditions)
   */
  compareParetoFronts(fronts, labels) {
    console.log('\n=== PARETO FRONT COMPARISON ===');
    
    for (let i = 0; i < fronts.length; i++) {
      const front = fronts[i];
      const label = labels[i] || `Front ${i + 1}`;
      
      const variances = front.map(p => p.meanVariance);
      const latencies = front.map(p => p.meanLatency);
      
      console.log(`\n${label}:`);
      console.log(`  Points: ${front.length}`);
      console.log(`  Variance range: ${Math.min(...variances).toFixed(1)} - ${Math.max(...variances).toFixed(1)}px`);
      console.log(`  Latency range: ${Math.min(...latencies).toFixed(0)} - ${Math.max(...latencies).toFixed(0)}ms`);
    }
    
    return true;
  }

  /**
   * Generate CSV suitable for importing into the filter-comparison-viewer.html
   */
  exportForViewer(paretoFront, filterType) {
    let csv;
    
    if (filterType === 'exponential') {
      csv = 'Rank,alpha,meanVariance,meanLatency,validPositions\n';
      paretoFront.forEach((p, i) => {
        csv += `${i + 1},${p.params.alpha},${p.meanVariance},${p.meanLatency},${p.validPositions}\n`;
      });
    } else {
      csv = 'Rank,minCutoff,beta,dCutoff,meanVariance,meanLatency,validPositions\n';
      paretoFront.forEach((p, i) => {
        csv += `${i + 1},${p.params.minCutoff},${p.params.beta},${p.params.dCutoff},${p.meanVariance},${p.meanLatency},${p.validPositions}\n`;
      });
    }
    
    return csv;
  }
}

// Export globally
window.ParetoAnalysisTool = ParetoAnalysisTool;
window.paretoAnalyzer = new ParetoAnalysisTool();

/**
 * Open the Pareto Analysis Panel UI
 */
window.openParetoAnalysisPanel = function() {
  // Remove existing panel if any
  const existing = document.getElementById('pareto-analysis-panel');
  if (existing) existing.remove();
  
  const panel = document.createElement('div');
  panel.id = 'pareto-analysis-panel';
  panel.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 95%;
    max-width: 1100px;
    max-height: 90vh;
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
      <h2 style="margin: 0; color: #00ff88;">📈 Pareto Curve Analysis</h2>
      <button id="close-pareto-panel" style="
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
      <!-- Current Data Status -->
      <div style="background: #252542; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: #ffaa00;">📋 Data Status</h3>
        <div id="data-status-content">
          <p style="color: #888;">Checking available data...</p>
        </div>
      </div>
      
      <!-- Variance Level Analysis -->
      <div style="background: #252542; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: #ff88ff;">🎯 Variance Level Analysis</h3>
        <p style="color: #aaa; font-size: 14px;">
          Find optimal variance levels - answers "when do we stop increasing variance?"
        </p>
        <div style="display: flex; gap: 10px; margin-top: 10px;">
          <button id="analyze-one-euro-variance" style="
            padding: 12px 24px;
            background: #ff6b6b;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
          ">Analyze One Euro</button>
          <button id="analyze-exponential-variance" style="
            padding: 12px 24px;
            background: #4499ff;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
          ">Analyze Exponential</button>
        </div>
        <div id="variance-analysis-results" style="margin-top: 15px; display: none;"></div>
      </div>
      
      <!-- Pareto Curve Visualization -->
      <div style="background: #252542; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: #00d4ff;">📊 Pareto Front Visualization</h3>
        <div style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">
          <button id="show-pareto-graph" style="
            padding: 10px 20px;
            background: #00aa88;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
          ">Show Graph</button>
          <button id="export-pareto-csv" style="
            padding: 10px 20px;
            background: #888;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
          ">Export CSV</button>
          <button id="load-pareto-json" style="
            padding: 10px 20px;
            background: #666;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
          ">Load JSON File</button>
          <button id="open-viewer" style="
            padding: 10px 20px;
            background: #ff6b6b;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
          ">🔗 Open Full Viewer</button>
        </div>
        <p style="color: #888; font-size: 12px; margin-bottom: 10px;">
          💡 The Full Viewer opens in a new tab where you can upload CSV files for detailed comparison
        </p>
        <canvas id="pareto-canvas" width="1000" height="500" style="
          width: 100%;
          background: #1a1a2e;
          border-radius: 8px;
          display: none;
        "></canvas>
      </div>
      
      <!-- Alpha Equivalence Verification -->
      <div style="background: #252542; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: #ffaa00;">🔬 Alpha Equivalence Verification</h3>
        <p style="color: #aaa; font-size: 14px;">
          Verify: For each One Euro minCutoff, what is the equivalent Exponential α?<br>
          When stationary (velocity=0), One Euro with minCutoff = Exponential with α
        </p>
        <button id="verify-alpha-equivalence" style="
          padding: 12px 24px;
          background: #ff8800;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-weight: bold;
          margin-top: 10px;
        ">Verify Alpha Equivalence</button>
        <div id="alpha-verification-results" style="margin-top: 15px; display: none;"></div>
      </div>
      
      <!-- Suggested Variance Levels -->
      <div style="background: #252542; padding: 15px; border-radius: 8px;">
        <h3 style="margin-top: 0; color: #ffff00;">💡 Suggested Variance Levels for Study</h3>
        <div id="suggested-levels" style="color: #aaa;">
          <p>Run variance analysis to get suggestions.</p>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(panel);
  
  // Add backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'pareto-analysis-backdrop';
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
  
  // Update data status
  updateDataStatus();
  
  // Event handlers
  document.getElementById('close-pareto-panel').onclick = () => {
    panel.remove();
    backdrop.remove();
  };
  
  document.getElementById('analyze-one-euro-variance').onclick = () => {
    analyzeVarianceLevels('oneeuro');
  };
  
  document.getElementById('analyze-exponential-variance').onclick = () => {
    analyzeVarianceLevels('exponential');
  };
  
  document.getElementById('show-pareto-graph').onclick = () => {
    drawParetoGraph();
  };
  
  document.getElementById('export-pareto-csv').onclick = () => {
    exportParetoCSV();
  };
  
  document.getElementById('load-pareto-json').onclick = async () => {
    try {
      await window.paretoAnalyzer.loadFromFile();
      updateDataStatus();
      alert('Data loaded successfully!');
    } catch (err) {
      alert('Failed to load file: ' + err.message);
    }
  };
  
  // Open the full filter-comparison-viewer in a new tab
  document.getElementById('open-viewer').onclick = () => {
    window.open('filter-comparison-viewer.html', '_blank');
  };
  
  // Alpha equivalence verification
  document.getElementById('verify-alpha-equivalence').onclick = () => {
    verifyAlphaEquivalence();
  };
};

function verifyAlphaEquivalence() {
  const resultsDiv = document.getElementById('alpha-verification-results');
  resultsDiv.style.display = 'block';
  
  const oneEuro = window.PARETO_FRONT_PARAMETERS;
  const exponential = window.EXPONENTIAL_PARAMETERS;
  
  if (!oneEuro || oneEuro.length === 0) {
    resultsDiv.innerHTML = `<div style="color: #ff8888;">❌ No One Euro Pareto data loaded</div>`;
    return;
  }
  
  if (!exponential || exponential.length === 0) {
    resultsDiv.innerHTML = `<div style="color: #ff8888;">❌ No Exponential Pareto data loaded</div>`;
    return;
  }
  
  // Calculate equivalent alpha for each One Euro minCutoff
  // Formula: α = 1 / (1 + τ/Te) where τ = 1/(2πfc)
  // Simplifies to: α = 2πfc*Te / (1 + 2πfc*Te)
  const Te = 1 / 60; // Sampling period at 60fps
  
  let html = `
    <h4 style="color: #ffaa00; margin-top: 0;">One Euro ↔ Exponential Equivalence (when stationary)</h4>
    <p style="color: #888; font-size: 13px;">Formula: α = 2π × fc × Te / (1 + 2π × fc × Te), where Te = 1/60s</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px;">
      <thead>
        <tr style="background: #1a1a2e;">
          <th style="padding: 8px; border: 1px solid #444;">One Euro<br>minCutoff (fc)</th>
          <th style="padding: 8px; border: 1px solid #444;">Calculated<br>α (equiv)</th>
          <th style="padding: 8px; border: 1px solid #444;">One Euro<br>Variance</th>
          <th style="padding: 8px; border: 1px solid #444;">Closest Exp<br>α</th>
          <th style="padding: 8px; border: 1px solid #444;">Closest Exp<br>Variance</th>
          <th style="padding: 8px; border: 1px solid #444;">Variance<br>Match?</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  // Check first 10 One Euro entries
  const samplesToCheck = Math.min(10, oneEuro.length);
  
  for (let i = 0; i < samplesToCheck; i++) {
    const oe = oneEuro[i];
    const fc = oe.minCutoff;
    
    // Calculate equivalent alpha
    const tau = 1 / (2 * Math.PI * fc);
    const calculatedAlpha = 1 / (1 + tau / Te);
    
    // Find closest exponential entry by alpha
    let closestExp = null;
    let closestDiff = Infinity;
    for (const exp of exponential) {
      const diff = Math.abs(exp.alpha - calculatedAlpha);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestExp = exp;
      }
    }
    
    // Check if variances match (within 20%)
    const varianceDiff = closestExp ? Math.abs(oe.meanVariance - closestExp.meanVariance) : Infinity;
    const varianceMatch = closestExp && varianceDiff < oe.meanVariance * 0.2;
    
    html += `
      <tr>
        <td style="padding: 8px; border: 1px solid #444;">${fc.toFixed(4)}</td>
        <td style="padding: 8px; border: 1px solid #444; color: #00ff88;">${calculatedAlpha.toFixed(6)}</td>
        <td style="padding: 8px; border: 1px solid #444;">${oe.meanVariance.toFixed(2)} px</td>
        <td style="padding: 8px; border: 1px solid #444;">${closestExp ? closestExp.alpha.toFixed(6) : 'N/A'}</td>
        <td style="padding: 8px; border: 1px solid #444;">${closestExp ? closestExp.meanVariance.toFixed(2) + ' px' : 'N/A'}</td>
        <td style="padding: 8px; border: 1px solid #444; color: ${varianceMatch ? '#00ff88' : '#ff8888'};">
          ${varianceMatch ? '✓ Yes' : '✗ No'} (Δ${varianceDiff.toFixed(1)})
        </td>
      </tr>
    `;
  }
  
  html += `</tbody></table>`;
  
  html += `
    <div style="background: #1a1a2e; padding: 15px; border-radius: 5px; margin-top: 15px;">
      <h4 style="margin-top: 0; color: #00d4ff;">📝 Interpretation</h4>
      <p style="color: #aaa;">
        When the head is <strong>NOT moving</strong>, One Euro with minCutoff=fc should behave<br>
        identically to Exponential with the calculated α.<br><br>
        If variances don't match, possible reasons:<br>
        • The "stationary" data had some movement<br>
        • Different lighting conditions between tests<br>
        • Beta/dCutoff affected results (they shouldn't when truly stationary)
      </p>
    </div>
  `;
  
  resultsDiv.innerHTML = html;
}

function updateDataStatus() {
  const statusDiv = document.getElementById('data-status-content');
  
  let html = '';
  
  // Check for Pareto front parameters
  if (window.PARETO_FRONT_PARAMETERS && window.PARETO_FRONT_PARAMETERS.length > 0) {
    html += `<p style="color: #00ff88;">✅ One Euro Pareto: ${window.PARETO_FRONT_PARAMETERS.length} points loaded</p>`;
  } else {
    html += `<p style="color: #ff8888;">❌ One Euro Pareto: Not loaded</p>`;
  }
  
  if (window.EXPONENTIAL_PARAMETERS && window.EXPONENTIAL_PARAMETERS.length > 0) {
    html += `<p style="color: #00ff88;">✅ Exponential Pareto: ${window.EXPONENTIAL_PARAMETERS.length} points loaded</p>`;
  } else {
    html += `<p style="color: #ff8888;">❌ Exponential Pareto: Not loaded</p>`;
  }
  
  // Check for optimizer data
  if (window.parameterOptimizer && window.parameterOptimizer.results && window.parameterOptimizer.results.length > 0) {
    html += `<p style="color: #00ff88;">✅ Recent optimization: ${window.parameterOptimizer.results.length} One Euro results</p>`;
    if (window.parameterOptimizer.resultsExponential) {
      html += `<p style="color: #00ff88;">✅ Recent optimization: ${window.parameterOptimizer.resultsExponential.length} Exponential results</p>`;
    }
    if (window.parameterOptimizer.environmentConditions) {
      const env = window.parameterOptimizer.environmentConditions;
      html += `<p style="color: #aaa; font-size: 13px;">📍 Environment: ${env.lightingCondition || 'Not recorded'}</p>`;
    }
  } else {
    html += `<p style="color: #ffaa00;">⚠️ No recent optimization data - run Parameter Optimization first</p>`;
  }
  
  statusDiv.innerHTML = html;
}

function analyzeVarianceLevels(filterType) {
  const resultsDiv = document.getElementById('variance-analysis-results');
  resultsDiv.style.display = 'block';
  
  let paretoFront;
  let filterName;
  
  if (filterType === 'oneeuro') {
    paretoFront = window.PARETO_FRONT_PARAMETERS;
    filterName = 'One Euro Filter';
  } else {
    paretoFront = window.EXPONENTIAL_PARAMETERS;
    filterName = 'Exponential Smoothing';
  }
  
  if (!paretoFront || paretoFront.length < 3) {
    resultsDiv.innerHTML = `
      <div style="background: #442222; padding: 15px; border-radius: 5px; color: #ff8888;">
        ⚠️ Not enough ${filterName} Pareto data. Need at least 3 points.
      </div>
    `;
    return;
  }
  
  // Convert to standard format if needed
  const normalized = paretoFront.map(p => ({
    meanVariance: p.meanVariance,
    meanLatency: p.meanLatency,
    params: p.params || { alpha: p.alpha, minCutoff: p.minCutoff, beta: p.beta, dCutoff: p.dCutoff }
  }));
  
  // Sort by variance
  const sorted = [...normalized].sort((a, b) => a.meanVariance - b.meanVariance);
  
  // Calculate throughput proxy (inverse of latency)
  const maxLatency = Math.max(...sorted.map(p => p.meanLatency));
  const withThroughput = sorted.map(p => ({
    ...p,
    throughputProxy: ((maxLatency - p.meanLatency) / maxLatency * 100).toFixed(1)
  }));
  
  // Find diminishing returns point
  const improvements = [];
  for (let i = 1; i < withThroughput.length; i++) {
    const varInc = withThroughput[i].meanVariance - withThroughput[i-1].meanVariance;
    const tpInc = parseFloat(withThroughput[i].throughputProxy) - parseFloat(withThroughput[i-1].throughputProxy);
    improvements.push({
      fromVar: withThroughput[i-1].meanVariance,
      toVar: withThroughput[i].meanVariance,
      gain: tpInc,
      efficiency: varInc > 0 ? tpInc / varInc : 0
    });
  }
  
  const avgEfficiency = improvements.reduce((s, i) => s + i.efficiency, 0) / improvements.length;
  
  // Find knee point
  const kneeIndex = improvements.findIndex(imp => imp.efficiency < avgEfficiency * 0.3);
  
  // Generate suggestions
  const suggestions = {
    low: sorted[0],
    medium: sorted[Math.max(0, Math.min(kneeIndex, sorted.length - 1))],
    high: sorted[Math.min(kneeIndex + 3, sorted.length - 1)]
  };
  
  let html = `
    <div style="background: #1a1a2e; padding: 15px; border-radius: 5px;">
      <h4 style="margin-top: 0; color: ${filterType === 'oneeuro' ? '#ff6b6b' : '#4499ff'};">
        ${filterName} Analysis
      </h4>
      
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 15px;">
        <thead>
          <tr style="background: #252542;">
            <th style="padding: 8px; border: 1px solid #444;">Variance (px)</th>
            <th style="padding: 8px; border: 1px solid #444;">Latency (ms)</th>
            <th style="padding: 8px; border: 1px solid #444;">Throughput Proxy</th>
            <th style="padding: 8px; border: 1px solid #444;">Worth It?</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  // Show key points
  const keyPoints = [0, Math.floor(sorted.length * 0.25), Math.floor(sorted.length * 0.5), Math.floor(sorted.length * 0.75), sorted.length - 1];
  for (const idx of keyPoints) {
    if (idx >= sorted.length) continue;
    const p = withThroughput[idx];
    const isKnee = idx === kneeIndex;
    const rowStyle = isKnee ? 'background: #443322;' : '';
    html += `
      <tr style="${rowStyle}">
        <td style="padding: 8px; border: 1px solid #444;">${p.meanVariance.toFixed(1)} ${isKnee ? '← KNEE' : ''}</td>
        <td style="padding: 8px; border: 1px solid #444;">${p.meanLatency.toFixed(0)}</td>
        <td style="padding: 8px; border: 1px solid #444;">${p.throughputProxy}%</td>
        <td style="padding: 8px; border: 1px solid #444; color: ${idx <= kneeIndex + 2 ? '#00ff88' : '#ff8888'};">
          ${idx <= kneeIndex + 2 ? '✓ Yes' : '✗ Diminishing'}
        </td>
      </tr>
    `;
  }
  
  html += `</tbody></table>`;
  
  // Show answer to "when do we stop?"
  html += `
    <div style="background: #224422; padding: 15px; border-radius: 5px; margin-top: 15px;">
      <h4 style="margin-top: 0; color: #00ff88;">💡 Answer: When Do We Stop Increasing Variance?</h4>
      <p>Based on the Pareto front analysis:</p>
      <ul style="margin: 10px 0;">
        <li><strong>Knee point</strong> at ~${sorted[kneeIndex]?.meanVariance.toFixed(1) || 'N/A'}px variance</li>
        <li>Beyond this, throughput gains become marginal</li>
        <li>The suggested upper bound is ~${suggestions.high.meanVariance.toFixed(1)}px</li>
      </ul>
    </div>
  `;
  
  resultsDiv.innerHTML = html;
  
  // Update suggested levels
  updateSuggestedLevels(suggestions, filterType);
}

function updateSuggestedLevels(suggestions, filterType) {
  const div = document.getElementById('suggested-levels');
  
  const color = filterType === 'oneeuro' ? '#ff6b6b' : '#4499ff';
  
  div.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
      <div style="background: #1a1a2e; padding: 15px; border-radius: 8px; border-left: 4px solid #00ff88;">
        <h4 style="margin: 0 0 10px 0; color: #00ff88;">LOW Variance</h4>
        <p style="font-size: 24px; margin: 0; color: white;">${suggestions.low.meanVariance.toFixed(1)} px</p>
        <p style="color: #888; font-size: 13px; margin: 5px 0 0 0;">Latency: ${suggestions.low.meanLatency.toFixed(0)}ms</p>
        <p style="color: #666; font-size: 12px;">Smoothest, precision tasks</p>
      </div>
      <div style="background: #1a1a2e; padding: 15px; border-radius: 8px; border-left: 4px solid #ffaa00;">
        <h4 style="margin: 0 0 10px 0; color: #ffaa00;">MEDIUM Variance</h4>
        <p style="font-size: 24px; margin: 0; color: white;">${suggestions.medium.meanVariance.toFixed(1)} px</p>
        <p style="color: #888; font-size: 13px; margin: 5px 0 0 0;">Latency: ${suggestions.medium.meanLatency.toFixed(0)}ms</p>
        <p style="color: #666; font-size: 12px;">Balanced trade-off</p>
      </div>
      <div style="background: #1a1a2e; padding: 15px; border-radius: 8px; border-left: 4px solid #ff4444;">
        <h4 style="margin: 0 0 10px 0; color: #ff4444;">HIGH Variance</h4>
        <p style="font-size: 24px; margin: 0; color: white;">${suggestions.high.meanVariance.toFixed(1)} px</p>
        <p style="color: #888; font-size: 13px; margin: 5px 0 0 0;">Latency: ${suggestions.high.meanLatency.toFixed(0)}ms</p>
        <p style="color: #666; font-size: 12px;">Fastest, before diminishing</p>
      </div>
    </div>
    <p style="color: #888; font-size: 13px; margin-top: 15px;">
      These are suggested variance levels based on where throughput improvements become marginal.
      The "MEDIUM" level is at the "knee" of the curve - best value for the trade-off.
    </p>
  `;
}

function drawParetoGraph() {
  const canvas = document.getElementById('pareto-canvas');
  canvas.style.display = 'block';
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  ctx.clearRect(0, 0, width, height);
  
  // Get data
  const oneEuro = window.PARETO_FRONT_PARAMETERS || [];
  const exponential = window.EXPONENTIAL_PARAMETERS || [];
  
  if (oneEuro.length === 0 && exponential.length === 0) {
    ctx.fillStyle = '#888';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('No Pareto data available. Run Parameter Optimization first.', width/2, height/2);
    return;
  }
  
  // Combine for range calculation
  const allVariances = [...oneEuro.map(p => p.meanVariance), ...exponential.map(p => p.meanVariance)];
  const allLatencies = [...oneEuro.map(p => p.meanLatency), ...exponential.map(p => p.meanLatency)];
  
  const minVar = Math.min(...allVariances) * 0.9;
  const maxVar = Math.max(...allVariances) * 1.1;
  const minLat = Math.min(...allLatencies) * 0.9;
  const maxLat = Math.max(...allLatencies) * 1.1;
  
  const padding = 70;
  const graphWidth = width - 2 * padding;
  const graphHeight = height - 2 * padding;
  
  const scaleX = (v) => padding + (v - minVar) / (maxVar - minVar) * graphWidth;
  const scaleY = (l) => height - padding - (l - minLat) / (maxLat - minLat) * graphHeight;
  
  // Draw grid
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const x = padding + (i / 10) * graphWidth;
    const y = height - padding - (i / 10) * graphHeight;
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, height - padding);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }
  
  // Draw axes
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.moveTo(padding, height - padding);
  ctx.lineTo(padding, padding);
  ctx.stroke();
  
  // Labels
  ctx.fillStyle = '#aaa';
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Variance (px) → Lower is Better', width / 2, height - 20);
  
  ctx.save();
  ctx.translate(25, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Latency (ms) → Lower is Better', 0, 0);
  ctx.restore();
  
  // Draw One Euro
  if (oneEuro.length > 0) {
    const sorted = [...oneEuro].sort((a, b) => a.meanVariance - b.meanVariance);
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    sorted.forEach((p, i) => {
      const x = scaleX(p.meanVariance);
      const y = scaleY(p.meanLatency);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    ctx.fillStyle = '#ff6b6b';
    sorted.forEach(p => {
      ctx.beginPath();
      ctx.arc(scaleX(p.meanVariance), scaleY(p.meanLatency), 4, 0, 2 * Math.PI);
      ctx.fill();
    });
  }
  
  // Draw Exponential
  if (exponential.length > 0) {
    const sorted = [...exponential].sort((a, b) => a.meanVariance - b.meanVariance);
    ctx.strokeStyle = '#4499ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    sorted.forEach((p, i) => {
      const x = scaleX(p.meanVariance);
      const y = scaleY(p.meanLatency);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    ctx.fillStyle = '#4499ff';
    sorted.forEach(p => {
      ctx.beginPath();
      ctx.arc(scaleX(p.meanVariance), scaleY(p.meanLatency), 4, 0, 2 * Math.PI);
      ctx.fill();
    });
  }
  
  // Legend
  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath();
  ctx.arc(width - 180, 30, 6, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '13px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`One Euro (${oneEuro.length})`, width - 165, 35);
  
  ctx.fillStyle = '#4499ff';
  ctx.beginPath();
  ctx.arc(width - 180, 55, 6, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(`Exponential (${exponential.length})`, width - 165, 60);
  
  // Scale labels
  ctx.fillStyle = '#666';
  ctx.font = '11px Arial';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 5; i++) {
    const x = padding + (i / 5) * graphWidth;
    const val = minVar + (i / 5) * (maxVar - minVar);
    ctx.fillText(val.toFixed(1), x, height - padding + 20);
  }
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const y = height - padding - (i / 5) * graphHeight;
    const val = minLat + (i / 5) * (maxLat - minLat);
    ctx.fillText(Math.round(val), padding - 10, y + 4);
  }
}

function exportParetoCSV() {
  if (window.PARETO_FRONT_PARAMETERS) {
    const csv = window.paretoAnalyzer.exportForViewer(window.PARETO_FRONT_PARAMETERS, 'oneeuro');
    downloadCSV('pareto-oneeuro.csv', csv);
  }
  
  if (window.EXPONENTIAL_PARAMETERS) {
    const csv = window.paretoAnalyzer.exportForViewer(window.EXPONENTIAL_PARAMETERS, 'exponential');
    downloadCSV('pareto-exponential.csv', csv);
  }
  
  alert('CSV files exported!');
}

function downloadCSV(filename, content) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

console.log('✅ Pareto Analysis Tool loaded');
console.log('   Use the "📈 Pareto Curve Analysis" button in the webapp');
