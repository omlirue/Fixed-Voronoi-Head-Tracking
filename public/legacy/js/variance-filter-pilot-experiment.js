// Variance × Filter Pilot Experiment
// Based on FittsExperiment but with dynamic variance-matched pair selection
// from the user's personal Pareto front data

class VarianceFilterPilotExperiment extends FittsExperiment {
  constructor() {
    super();
    
    // Override: variance-matched pairs will be computed dynamically at start()
    // Clear the hardcoded pairs from parent
    this.config.varianceMatchedPairs = [];
    
  }

  /**
   * Uses parent's computeInterpolatedPairs() and interpolateParams() methods.
   * findVarianceMatchedPairs() wraps computeInterpolatedPairs() with extra logging
   * and returns the format expected by buildVarianceMatchedPairs().
   */
  findVarianceMatchedPairs() {
    const pairs = this.computeInterpolatedPairs();
    if (!pairs) return null;

    // Convert from computeInterpolatedPairs format to the selected[] format
    return pairs.map(p => ({
      level: p.description.split(' ')[0], // "Low", "Medium", "High"
      pair: {
        exponential: { ...p.exponential, meanLatency: p.exponential.latency, interpolated: p.exponential.rank === 'interp' },
        oneEuro: { ...p.oneEuro, meanLatency: p.oneEuro.latency, interpolated: p.oneEuro.rank === 'interp' },
        avgVariance: p.variance,
        mismatch: 0
      }
    }));
  }

  /**
   * Convert selected pairs to the format expected by FittsExperiment.
   */
  buildVarianceMatchedPairs(selectedPairs) {
    return selectedPairs.map((s, i) => ({
      pairNumber: i + 1,
      description: `${s.level} SD (~${s.pair.avgVariance.toFixed(1)}) - Interpolated Match`,
      variance: s.pair.avgVariance,
      exponential: {
        rank: s.pair.exponential.interpolated ? 'interp' : (s.pair.exponential.rank || '?'),
        alpha: s.pair.exponential.alpha,
        variance: s.pair.avgVariance,
        latency: s.pair.exponential.meanLatency
      },
      oneEuro: {
        rank: s.pair.oneEuro.interpolated ? 'interp' : (s.pair.oneEuro.rank || '?'),
        minCutoff: s.pair.oneEuro.minCutoff,
        beta: s.pair.oneEuro.beta,
        dCutoff: s.pair.oneEuro.dCutoff,
        variance: s.pair.avgVariance,
        latency: s.pair.oneEuro.meanLatency
      }
    }));
  }

  // Override start() to compute pairs dynamically before running
  async start() {
    if (this.isRunning) {
      console.warn("Experiment already running");
      return;
    }
    
    // Check if tracking is active
    if (!window.state || !window.state.isTracking) {
      alert("Error: Head tracking is not active!\n\nPlease make sure:\n1. You've completed calibration OR loaded a calibration file\n2. Face tracking is turned ON\n3. Your face is visible to the webcam");
      return;
    }
    
    // Check if Pareto data is available
    if (!window.PARETO_FRONT_PARAMETERS || !window.EXPONENTIAL_PARAMETERS) {
      alert("Error: No parameter data available!\n\nPlease either:\n1. Run Parameter Optimization first\n2. Upload One Euro and Exponential CSV files\n3. Or use the default parameters");
      return;
    }
    
    // Dynamically find variance-matched pairs
    console.log("🔬 Pilot: Variance × Filter - Finding variance-matched pairs...");
    const selectedPairs = this.findVarianceMatchedPairs();
    
    if (!selectedPairs) {
      alert("Error: Could not find 3 well-matched variance pairs from the current Pareto data.\n\nThis can happen if the Exponential and One Euro Pareto fronts don't overlap enough.\n\nTry running Parameter Optimization to get better data.");
      return;
    }
    
    // Build the pairs in the format expected by FittsExperiment
    this.config.varianceMatchedPairs = this.buildVarianceMatchedPairs(selectedPairs);
    
    console.log("✅ Variance-matched pairs configured:", this.config.varianceMatchedPairs);
    
    // Show summary before starting
    this.showPairSummary(selectedPairs);
  }

  /**
   * Show the selected pairs to the user before starting the experiment
   */
  showPairSummary(selectedPairs) {
    // Remove any existing experiment UI first
    const existingUI = document.getElementById('fitts-experiment-ui');
    if (existingUI) {
      existingUI.remove();
    }
    
    // Create UI
    this.createUI();
    this.hideNonEssentialControls();
    
    console.log('📋 Showing pair summary screen with', selectedPairs.length, 'pairs');
    
    let pairsHTML = '';
    for (const s of selectedPairs) {
      const exp = s.pair.exponential;
      const oe = s.pair.oneEuro;
      const expLabel = exp.interpolated
        ? `α=${exp.alpha.toFixed(6)} (interpolated)`
        : `Rank ${exp.rank} (α=${exp.alpha.toFixed(6)})`;
      const oeLabel = oe.interpolated
        ? `minCutoff=${oe.minCutoff.toFixed(4)}, β=${oe.beta.toFixed(6)}, dCutoff=${oe.dCutoff.toFixed(3)} (interpolated)`
        : `Rank ${oe.rank} (minCutoff=${oe.minCutoff.toFixed(4)})`;
      pairsHTML += `
        <div style="background: rgba(255, 200, 100, 0.15); padding: 8px; border-radius: 4px; margin: 6px 0; border-left: 3px solid #ffc864;">
          <div style="font-weight: bold; color: #ffc864; font-size: 12px;">${s.level} SD: ~${s.pair.avgVariance.toFixed(1)} px</div>
          <div style="font-size: 10px; color: #aaa; margin-top: 4px;">
            Target SD: ${s.pair.avgVariance.toFixed(2)}px (both filters matched exactly)<br>
            Exponential: ${expLabel} (lat: ${exp.meanLatency.toFixed(0)}ms)<br>
            One Euro: ${oeLabel} (lat: ${oe.meanLatency.toFixed(0)}ms)
          </div>
        </div>
      `;
    }
    
    const isPersonal = window.PERSONAL_OPTIMIZATION_DONE ? 
      '<span style="color: #64ff64;">✅ Using YOUR personal Pareto front</span>' :
      '<span style="color: #ffaa00;">⚠️ Using default parameters (run optimization for personal data)</span>';
    
    this.experimentUI.innerHTML = `
      <div class="experiment-instructions" style="max-width: 380px;">
        <h2 style="color: #64ff64; border-bottom: 2px solid #64ff64; padding-bottom: 8px;">
          🔬 Pilot: Variance × Filter
        </h2>
        <p style="font-size: 11px; color: #aaa;">
          3 variance levels × 2 filters = <strong>6 conditions</strong><br>
          Each condition: 6 layouts × 8 trials = 48 trials<br>
          <strong style="color: #ffc864;">Total: 288 trials</strong>
        </p>
        
        <p style="font-size: 10px; margin: 8px 0;">${isPersonal}</p>
        
        <h3 style="font-size: 14px; color: #ffc864; margin-top: 12px;">
          📊 Selected Variance-Matched Pairs
        </h3>
        ${pairsHTML}
        
        <p class="tip" style="font-size: 10px; margin-top: 10px;">
          SD levels span the full achievable range of both filters (5th–95th percentile of overlap).
          Parameters interpolated for exact matching (0% mismatch).
        </p>
        
        <div style="display: flex; gap: 8px; justify-content: center; margin-top: 14px;">
          <button class="experiment-button" onclick="window.varianceFilterPilot.confirmAndStart()" 
            style="flex: 1; font-size: 13px; padding: 10px; background: linear-gradient(135deg, #64ff64, #32cc32);">
            ▶ Start Experiment
          </button>
          <button class="experiment-button" onclick="window.varianceFilterPilot.close()" 
            style="background: linear-gradient(135deg, #ff6464, #cc3232); flex: 0.5; font-size: 11px; padding: 10px;">
            ✕ Cancel
          </button>
        </div>
      </div>
    `;
    
    console.log('✅ Pair summary screen rendered. Waiting for user to click Start or Cancel.');
  }

  /**
   * User confirmed, proceed with the actual experiment
   */
  async confirmAndStart() {
    // Generate layouts
    this.layouts = this.generateLayouts();
    this.currentPairIndex = 0;
    this.currentLayoutIndex = 0;
    this.currentFilterPhase = 0;
    this.currentTrialInLayout = 0;
    this.trialData = [];
    this.completedPaths = [];
    this.completedTrials = 0;
    this.varianceMeasurementResults = [];
    
    // Calculate total trials
    this.totalTrials = this.config.varianceMatchedPairs.length * 2 * this.layouts.length * this.config.trialsPerLayout;
    
    // Apply fixed configuration
    await this.applyConfiguration();
    
    // Run variance measurement
    console.log("🔬 Starting variance measurement phase...");
    await this.measureVarianceForAllConfigurations();
  }

  // Override continueToExperimentStart to use the correct global reference
  async continueToExperimentStart() {
    console.log("📍 Continuing to experiment start...");
    
    const firstPair = this.config.varianceMatchedPairs[0];
    const firstFilterConfig = firstPair.exponential;
    
    console.log(`📍 Initial filter setup - Pair 1, Exponential Rank ${firstFilterConfig.rank}`);
    await this.setFilter("exponential", firstFilterConfig);
    
    this.showInstructions();
  }

  // Override displayResults - parent already shows per-filter breakdown for each pair
  displayResults(results) {
    super.displayResults(results);
  }

  // Override exportData to use pilot-specific filenames
  exportData(results) {
    const timestamp = new Date().toISOString();
    
    const resultsCSV = this.generateResultsCSV(results);
    this.downloadCSV(resultsCSV, `pilot-variance-filter-results-${timestamp}.csv`);
    
    const rawCSV = this.generateRawDataCSV(this.trialData);
    this.downloadCSV(rawCSV, `pilot-variance-filter-raw-data-${timestamp}.csv`);
    
    if (this.varianceMeasurementResults.length > 0) {
      const varianceCSV = this.generateVarianceMeasurementCSV(this.varianceMeasurementResults);
      this.downloadCSV(varianceCSV, `pilot-variance-filter-variance-measurement-${timestamp}.csv`);
    }
  }

  // Override showInstructions to reference correct global
  showInstructions() {
    const layout = this.getCurrentLayout();
    const pair = this.getCurrentPair();
    const filterConfig = this.getCurrentFilterConfig();
    const filterName = this.getCurrentFilter() === "exponential" ? "Exponential Smoothing" : "One Euro Filter";
    const globalPhase = (this.currentPairIndex * 2) + this.currentFilterPhase + 1;
    
    const targetSizeRounded = Math.round(layout.targetSize);
    const amplitudeRounded = Math.round(layout.amplitude);
    const globalLayoutNumber = (this.currentPairIndex * 2 * 6) + (this.currentFilterPhase * 6) + this.currentLayoutIndex + 1;
    const totalLayouts = this.config.varianceMatchedPairs.length * 2 * 6;
    
    this.experimentUI.innerHTML = `
      <div class="experiment-instructions">
        <h2>Pilot: Variance × Filter</h2>
        <h3>Phase ${globalPhase}/6: ${filterName}</h3>
        <p class="config-info" style="background: rgba(255, 200, 100, 0.2); border-left-color: #ffc864;">
          <strong>Pair ${pair.pairNumber}:</strong> ${pair.description}<br>
          Rank ${filterConfig.rank} | Variance: ${filterConfig.variance.toFixed(2)} | Latency: ${filterConfig.latency.toFixed(1)}ms
        </p>
        <p class="config-info">Layout ${this.currentLayoutIndex + 1}/6 (${globalLayoutNumber}/${totalLayouts} total) | Target: ${targetSizeRounded}px | Distance: ${amplitudeRounded}px</p>
        
        <div class="instructions-content">
          <h4>Instructions:</h4>
          <ol>
            <li>Move cursor to the <strong>blue home circle</strong> and hold for 0.8s</li>
            <li>Move to the <strong style="color: #ff6464">RED</strong> target</li>
            <li>Hold inside the target for <strong>0.8 seconds</strong> to select</li>
            <li>Continue to each highlighted target in sequence</li>
          </ol>
          
          <p class="trial-info">
            <strong>8 trials</strong> per layout | Progress: ${this.completedTrials} / ${this.totalTrials} total
          </p>
        </div>
        
        <div style="display: flex; gap: 6px; justify-content: center;">
          <button class="experiment-button start-button" onclick="window.varianceFilterPilot.startTrials()" style="flex: 1; font-size: 11px; padding: 6px 10px;">
            Start Trials
          </button>
          <button class="experiment-button" onclick="window.varianceFilterPilot.close()" style="background: linear-gradient(135deg, #64a8ff, #4285f4); flex: 0.5; font-size: 10px; padding: 6px 8px;">
            Back
          </button>
        </div>
      </div>
    `;
  }

  // Override showVarianceMeasurementResults to use correct global reference for continue button
  showVarianceMeasurementResults() {
    let resultsHTML = `
      <div class="experiment-instructions">
        <h2>Variance Measurement Complete ✅</h2>
        <p style="font-size: 11px; color: #aaa; margin: 8px 0;">
          Actual variance measured in your current lighting conditions
        </p>
    `;
    
    for (let pairNum = 1; pairNum <= this.config.varianceMatchedPairs.length; pairNum++) {
      const pairResults = this.varianceMeasurementResults.filter(r => r.pairNumber === pairNum);
      if (pairResults.length === 0) continue;
      
      const pair = this.config.varianceMatchedPairs[pairNum - 1];
      
      resultsHTML += `
        <div style="background: rgba(255, 200, 100, 0.15); padding: 8px; border-radius: 4px; margin: 8px 0; border-left: 3px solid #ffc864;">
          <h4 style="color: #ffc864; margin: 0 0 5px 0; font-size: 12px;">Pair ${pairNum}: Variance ~${pair.variance.toFixed(1)}</h4>
      `;
      
      for (const result of pairResults) {
        const filterName = result.filterType === "exponential" ? "Exponential" : "One Euro";
        const match = Math.abs(result.measuredVariance - result.expectedVariance) / result.expectedVariance;
        const matchIcon = match < 0.2 ? "✅" : (match < 0.5 ? "⚠️" : "❌");
        
        resultsHTML += `
          <div style="background: rgba(50, 50, 50, 0.6); padding: 6px; border-radius: 3px; margin: 4px 0; font-size: 10px;">
            <div style="font-weight: bold; color: #64ff64; font-size: 11px;">${filterName} (Rank ${result.filterRank})</div>
            <div style="margin-top: 3px;">
              Expected: ${result.expectedVariance.toFixed(2)}px | 
              Measured: <strong>${result.measuredVariance.toFixed(2)}px</strong> ${matchIcon}
            </div>
          </div>
        `;
      }
      
      resultsHTML += `</div>`;
    }
    
    resultsHTML += `
        <button class="experiment-button" onclick="window.varianceFilterPilot.continueToExperimentStart()">
          Continue to Experiment
        </button>
      </div>
    `;
    
    this.experimentUI.innerHTML = resultsHTML;
  }

  // Override showFilterBreak to use correct global reference
  showFilterBreak() {
    this.breakTimeRemaining = this.config.breakDuration;
    const pair = this.getCurrentPair();
    const filterConfig = pair.oneEuro;
    
    this.experimentUI.innerHTML = `
      <div class="experiment-instructions">
        <h2>Filter Phase Complete!</h2>
        <p>Completed Exponential Smoothing (Rank ${pair.exponential.rank})</p>
        <p style="background: rgba(255, 200, 100, 0.2); padding: 8px; border-radius: 4px; margin: 10px 0;">
          <strong>Pair ${pair.pairNumber}:</strong> ${pair.description}
        </p>
        <p>Progress: ${this.completedTrials} / ${this.totalTrials} trials</p>
        
        <h3>1-Minute Break</h3>
        <div style="background: rgba(100, 150, 255, 0.2); padding: 20px; border-radius: 8px; margin: 20px 0;">
          <div style="font-size: 48px; font-weight: bold; color: #64ff64;" id="break-timer">
            ${this.formatTime(this.breakTimeRemaining)}
          </div>
          <p style="margin-top: 10px;">Relax your neck and eyes</p>
        </div>
        
        <p class="tip">
          <strong>Next:</strong> One Euro Filter (Rank ${filterConfig.rank}) at same variance level
        </p>
        
        <button class="experiment-button" onclick="window.varianceFilterPilot.skipBreak()">
          Skip Break
        </button>
      </div>
    `;
    
    this.breakInterval = setInterval(() => {
      this.breakTimeRemaining--;
      const timerElement = document.getElementById('break-timer');
      if (timerElement) {
        timerElement.textContent = this.formatTime(this.breakTimeRemaining);
      }
      if (this.breakTimeRemaining <= 0) {
        clearInterval(this.breakInterval);
        this.continueToNextFilterPhase();
      }
    }, 1000);
  }

  // Override showPairTransition to use correct global reference
  showPairTransition() {
    const completedPair = this.getCurrentPair();
    const nextPairIndex = this.currentPairIndex + 1;
    const nextPair = this.config.varianceMatchedPairs[nextPairIndex];
    
    this.breakTimeRemaining = this.config.breakDuration;
    
    this.experimentUI.innerHTML = `
      <div class="experiment-instructions">
        <h2>Pair ${completedPair.pairNumber} Complete! 🎉</h2>
        <p>Completed both filters at Variance ~${completedPair.variance.toFixed(1)}</p>
        <p>Progress: ${this.completedTrials} / ${this.totalTrials} trials</p>
        
        <h3>1-Minute Break</h3>
        <div style="background: rgba(100, 150, 255, 0.2); padding: 20px; border-radius: 8px; margin: 20px 0;">
          <div style="font-size: 48px; font-weight: bold; color: #64ff64;" id="break-timer">
            ${this.formatTime(this.breakTimeRemaining)}
          </div>
          <p style="margin-top: 10px;">Relax your neck and eyes</p>
        </div>
        
        <p class="tip">
          <strong>Next: Pair ${nextPair.pairNumber}</strong> - ${nextPair.description}<br>
          Starting with Exponential Rank ${nextPair.exponential.rank}
        </p>
        
        <button class="experiment-button" onclick="window.varianceFilterPilot.skipPairBreak()">
          Skip Break
        </button>
      </div>
    `;
    
    this.breakInterval = setInterval(() => {
      this.breakTimeRemaining--;
      const timerElement = document.getElementById('break-timer');
      if (timerElement) {
        timerElement.textContent = this.formatTime(this.breakTimeRemaining);
      }
      if (this.breakTimeRemaining <= 0) {
        clearInterval(this.breakInterval);
        this.continueToNextPair();
      }
    }, 1000);
  }

  // Override hideNonEssentialControls to use pilot title
  hideNonEssentialControls() {
    super.hideNonEssentialControls();
    const trackingControls = document.querySelector('.tracking-controls');
    if (trackingControls) {
      const title = trackingControls.querySelector('h3');
      if (title) {
        title.textContent = 'Pilot: Variance × Filter';
      }
    }
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  window.varianceFilterPilot = new VarianceFilterPilotExperiment();
  console.log("✅ Variance × Filter Pilot Experiment initialized");
});
