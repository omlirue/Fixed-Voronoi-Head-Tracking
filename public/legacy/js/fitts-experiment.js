// Fitts' Law Multidirectional Pointing Experiment
// Based on ISO 9241-9 standards

class FittsExperiment {
  constructor() {
    // Experiment configuration
    this.config = {
      // Target sizes as percentage of LIMITING dimension (smaller of width/height)
      // ID range ≈ 1.8–3.1 bits with current amplitudes
      // Reduced from 3 to 2 sizes per Hansen et al. (2018) precedent (2W × 2A)
      targetSizePercents: [10, 6], // Medium, Hard (larger first so participants ease in)
      amplitudePercents: [25, 45], // Short, Long (% of limiting dimension, max safe for ISO circular layout)
      
      // Specific sequence: across-the-circle alternation
      // 0° → 180° → 45° → 225° → 90° → 270° → 135° → 315°
      directionSequence: [0, 180, 45, 225, 90, 270, 135, 315],
      
      trialsPerLayout: 8,
      dwellTime: 2000, // 2 seconds dwell to select
      breakDuration: 60,
      varianceMeasurementDuration: 5000,
      conditionTimeLimit: 180000, // 3 minutes per condition (filter phase)
      
      // Fixed configuration: 2D, 3 landmarks for entire experiment
      landmarkPoints: "3",
      coordinateSystem: "2d",
      
      // Variance-matched pairs configuration
      // Each pair compares Exponential vs One Euro at similar variance levels
      varianceMatchedPairs: [
        {
          pairNumber: 1,
          description: "Very Low Variance (~1.0) - Maximum Stability",
          variance: 1.0,
          exponential: { rank: 1, alpha: 0.001, variance: 1.0276, latency: 1092.43 },
          oneEuro: { rank: 1, minCutoff: 0.001, beta: 0.00001, dCutoff: 0.1, variance: 1.0410, latency: 383.47 }
        },
        {
          pairNumber: 2,
          description: "Medium Variance (~7.0) - Balanced",
          variance: 7.0,
          exponential: { rank: 9, alpha: 0.008992, variance: 7.0109, latency: 504.11 },
          oneEuro: { rank: 27, minCutoff: 0.061, beta: 0.00001, dCutoff: 0.9, variance: 6.7023, latency: 263.16 }
        },
        {
          pairNumber: 3,
          description: "Higher Variance (~12.5) - More Responsive",
          variance: 12.5,
          exponential: { rank: 23, alpha: 0.02298, variance: 12.5275, latency: 290.57 },
          oneEuro: { rank: 43, minCutoff: 0.201, beta: 0.00001, dCutoff: 0.9, variance: 12.5063, latency: 255.62 }
        }
      ]
    };
    
    // Participant info
    this.participantId = null;
    this.counterbalanceCondition = null;
    
    // State
    this.isRunning = false;
    this.currentPairIndex = 0; // Which variance-matched pair (0-2)
    this.currentLayoutIndex = 0; // Which layout (0-5)
    this.currentFilterPhase = 0; // 0 = exponential, 1 = oneEuro (within current pair)
    this.currentTrialInLayout = 0; // Trial within current layout (0-7)
    this.currentTrial = null;
    this.trialData = [];
    this.completedPaths = []; // Store completed paths for visualization
    this.waitingForHomeCircle = false; // Whether we're waiting for initial home circle dwell
    
    // Part tracking (A = personal calibration, B = standard calibration)
    this.currentPart = 'Part A';
    this.partACompleted = false;
    this.partBCompleted = false;
    this.allVarianceMatchedPairs = null;
    this.partAVariancePairs = null;
    this.calibrationInfo = { 'Part A': '', 'Part B': '' };
    
    // Questionnaire responses
    this.miniQuestionnaireResponses = [];
    this.nasaTLXResponses = [];

    // Condition timer state
    this.conditionStartTime = null;
    this.conditionMissedTrials = 0;
    
    // Variance measurement results
    this.varianceMeasurementResults = [];
    
    // UI elements
    this.experimentUI = null;
    this.targetCircles = {}; // Store all 8 target circles
    this.homeCircle = null;
    this.dwellIndicator = null;
    this.progressText = null;
    this.guideLines = null;
    
    // Timing
    this.dwellStartTime = null;
    this.movementStartTime = null;
    this.trialStartTime = null;
    
    // Cursor position tracking
    this.cursorTrackingInterval = null;
    this.selectionPoint = null;
    this.startPoint = null;
    this.previousTargetSize = 100; // Size of previous target (for movement detection)
    this.cursorPath = []; // Full cursor path with timestamps {x, y, t}
    this.targetEvents = []; // Target entry/exit events {type: 'enter'|'exit', x, y, t}
    this.isInsideTarget = false; // Current target containment state
    
    // Layout structure
    this.layouts = [];
    this.totalTrials = 0;
    this.completedTrials = 0;
    
    // Break timer
    this.breakTimeRemaining = 0;
    this.breakInterval = null;
    
    // Bind methods
    this.update = this.update.bind(this);
    
    // Global spacebar handler: press Space to trigger the primary action button
    this._spacebarHandler = (e) => {
      if (e.code !== 'Space') return;
      // Don't intercept if typing in an input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (!this.experimentUI) return;
      
      const primaryBtn = this.experimentUI.querySelector('.experiment-button.start-button') 
        || this.experimentUI.querySelector('.experiment-button.continue-button')
        || this.experimentUI.querySelector('.experiment-button:not([disabled])');
      if (primaryBtn && primaryBtn.offsetParent !== null) {
        e.preventDefault();
        primaryBtn.click();
      }
    };
    document.addEventListener('keydown', this._spacebarHandler);
  }
  
  // Convert percentage to pixels based on limiting dimension (smaller of width/height)
  percentToPixels(percent) {
    // Limiting dimension = smaller of width or height (adapts to orientation)
    const limitingDimension = Math.min(window.innerWidth, window.innerHeight);
    return (percent / 100) * limitingDimension;
  }

  // Determine counterbalancing condition from participant ID number
  // 24 total conditions: 6 variance orderings × 2 filter orders × 2 part orders
  getCounterbalanceCondition(idNumber) {
    const variancePermutations = [
      [0, 1, 2], // Low → Med → High
      [0, 2, 1], // Low → High → Med
      [1, 0, 2], // Med → Low → High
      [1, 2, 0], // Med → High → Low
      [2, 0, 1], // High → Low → Med
      [2, 1, 0], // High → Med → Low
    ];

    const conditionIndex = (idNumber - 1) % 24;
    const varianceOrderIndex = conditionIndex % 6;
    const filterOrderIndex = Math.floor(conditionIndex / 6) % 2;
    const partOrderIndex = Math.floor(conditionIndex / 12) % 2;

    return {
      varianceOrder: variancePermutations[varianceOrderIndex],
      filterFirst: filterOrderIndex === 0 ? 'exponential' : 'oneEuro',
      partFirst: partOrderIndex === 0 ? 'A' : 'B',
      varianceOrderLabel: variancePermutations[varianceOrderIndex].map(i => ['Low', 'Med', 'High'][i]).join(' → '),
    };
  }

  // Show participant ID input screen before experiment starts
  showParticipantIDScreen() {
    return new Promise((resolve) => {
      if (!this.experimentUI) {
        this.experimentUI = document.createElement('div');
        this.experimentUI.id = 'fitts-experiment-ui';
        this.experimentUI.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 10000; background: rgba(0,0,0,0.95); display: flex; align-items: center; justify-content: center;';
        document.body.appendChild(this.experimentUI);

        if (!this._backBtn) {
          const backBtn = document.createElement('button');
          backBtn.id = 'fitts-back-btn';
          backBtn.textContent = '← Back to Controls';
          backBtn.style.cssText = `
            position: fixed; top: 12px; left: 12px; z-index: 10001;
            padding: 8px 16px; font-size: 13px; font-weight: bold;
            background: rgba(80, 80, 80, 0.9); color: #ccc; border: 1px solid #666;
            border-radius: 6px; cursor: pointer;
          `;
          backBtn.onmouseenter = () => { backBtn.style.background = 'rgba(120,120,120,0.9)'; };
          backBtn.onmouseleave = () => { backBtn.style.background = 'rgba(80,80,80,0.9)'; };
          backBtn.onclick = () => { this.close(); };
          document.body.appendChild(backBtn);
          this._backBtn = backBtn;
        }
      }

      const updateConditionDisplay = () => {
        const input = document.getElementById('participant-id-input');
        const display = document.getElementById('condition-display');
        const startBtn = document.getElementById('participant-start-btn');
        const val = input.value.replace(/\D/g, '');
        
        if (val && parseInt(val) > 0) {
          const idNum = parseInt(val);
          const condition = this.getCounterbalanceCondition(idNum);
          const varLabels = ['Low', 'Med', 'High'];
          const varOrderStr = condition.varianceOrder.map(i => varLabels[i]).join(' → ');
          const filterStr = condition.filterFirst === 'exponential' ? 'Exponential first' : 'One Euro first';
          const partStr = condition.partFirst === 'A' ? 'Part A first (personal calibration)' : 'Part B first (standard calibration)';
          
          display.innerHTML = `
            <div style="color: #64ff64; font-weight: bold; margin-bottom: 8px;">Assigned Condition (P${String(idNum).padStart(2, '0')}):</div>
            <div style="color: #ccc; font-size: 13px; line-height: 1.8;">
              <span style="color: #ffc864;">Variance order:</span> ${varOrderStr}<br>
              <span style="color: #ffc864;">Filter order:</span> ${filterStr}<br>
              <span style="color: #ffc864;">Part order:</span> ${partStr}
            </div>
          `;
          display.style.display = 'block';
          startBtn.disabled = false;
          startBtn.style.opacity = '1';
        } else {
          display.style.display = 'none';
          startBtn.disabled = true;
          startBtn.style.opacity = '0.4';
        }
      };

      this.experimentUI.innerHTML = `
        <div style="background: rgba(30, 30, 40, 0.98); border: 2px solid #64c8ff; border-radius: 12px; padding: 40px; max-width: 500px; width: 90%; text-align: center;">
          <h2 style="color: #64c8ff; margin: 0 0 8px 0; font-size: 22px;">Fitts' Law Experiment</h2>
          <p style="color: #888; font-size: 13px; margin: 0 0 30px 0;">ISO 9241-411 Multidirectional Pointing Task</p>
          
          <div style="margin-bottom: 24px;">
            <label style="color: #ccc; font-size: 14px; display: block; margin-bottom: 10px;">
              Enter Participant ID Number:
            </label>
            <input 
              id="participant-id-input" 
              type="number" 
              min="1" 
              placeholder="e.g. 1, 2, 3..."
              style="
                width: 120px; padding: 12px 16px; font-size: 20px; text-align: center;
                background: rgba(255,255,255,0.1); border: 2px solid #64c8ff; border-radius: 8px;
                color: white; outline: none;
              "
            />
          </div>
          
          <div id="condition-display" style="
            display: none; background: rgba(100, 200, 255, 0.08); border: 1px solid rgba(100, 200, 255, 0.2);
            border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: left;
          "></div>
          
          <button id="participant-start-btn" disabled style="
            padding: 14px 40px; font-size: 16px; font-weight: bold;
            background: #64c8ff; color: #111; border: none; border-radius: 8px;
            cursor: pointer; opacity: 0.4; transition: opacity 0.2s;
          ">
            Begin Experiment
          </button>
          
          <p style="color: #666; font-size: 11px; margin-top: 16px;">
            The participant ID determines counterbalancing (variance order, filter order, part order).
          </p>
        </div>
      `;

      const input = document.getElementById('participant-id-input');
      const startBtn = document.getElementById('participant-start-btn');

      input.addEventListener('input', updateConditionDisplay);
      input.focus();

      const handleStart = () => {
        const val = input.value.replace(/\D/g, '');
        if (!val || parseInt(val) <= 0) return;
        
        const idNum = parseInt(val);
        this.participantId = `P${String(idNum).padStart(2, '0')}`;
        this.counterbalanceCondition = this.getCounterbalanceCondition(idNum);
        
        console.log(`👤 Participant: ${this.participantId}`);
        console.log(`🔀 Condition:`, this.counterbalanceCondition);
        
        resolve();
      };

      startBtn.addEventListener('click', handleStart);

      // Spacebar to start
      const handleKeydown = (e) => {
        if (e.code === 'Space' && !startBtn.disabled) {
          e.preventDefault();
          document.removeEventListener('keydown', handleKeydown);
          handleStart();
        }
      };
      document.addEventListener('keydown', handleKeydown);
    });
  }

  /**
   * Linearly interpolate filter parameters to hit an exact target SD.
   * Finds two bracketing Pareto points and interpolates between them.
   */
  interpolateParams(targetVariance, sortedParams, filterType) {
    if (sortedParams.length === 0) return null;

    if (targetVariance <= sortedParams[0].meanVariance) {
      return { ...sortedParams[0], interpolated: false };
    }
    if (targetVariance >= sortedParams[sortedParams.length - 1].meanVariance) {
      return { ...sortedParams[sortedParams.length - 1], interpolated: false };
    }

    for (let i = 0; i < sortedParams.length - 1; i++) {
      const lo = sortedParams[i];
      const hi = sortedParams[i + 1];
      if (lo.meanVariance <= targetVariance && hi.meanVariance >= targetVariance) {
        const range = hi.meanVariance - lo.meanVariance;
        if (range === 0) return { ...lo, interpolated: false };
        const t = (targetVariance - lo.meanVariance) / range;
        const lerp = (a, b) => a + t * (b - a);

        if (filterType === 'exponential') {
          return {
            alpha: lerp(lo.alpha, hi.alpha),
            meanVariance: targetVariance,
            meanLatency: lerp(lo.meanLatency, hi.meanLatency),
            interpolated: true, bracketLow: lo, bracketHigh: hi, t
          };
        } else {
          return {
            minCutoff: lerp(lo.minCutoff, hi.minCutoff),
            beta: lerp(lo.beta, hi.beta),
            dCutoff: lerp(lo.dCutoff, hi.dCutoff),
            meanVariance: targetVariance,
            meanLatency: lerp(lo.meanLatency, hi.meanLatency),
            interpolated: true, bracketLow: lo, bracketHigh: hi, t
          };
        }
      }
    }
    return null;
  }

  /**
   * Compute 3 variance-matched pairs using interpolation from current Pareto data.
   * SD levels span the full achievable overlap range of both filters (in pixels).
   * Normalized variance (% of limiting dimension) is computed for export/cross-participant comparison.
   */
  computeInterpolatedPairs() {
    const expParams = window.EXPONENTIAL_PARAMETERS;
    const oeParams = window.PARETO_FRONT_PARAMETERS;
    if (!expParams?.length || !oeParams?.length) return null;

    const limitingDim = Math.min(window.innerWidth, window.innerHeight);

    const expSorted = [...expParams].sort((a, b) => a.meanVariance - b.meanVariance);
    const oeSorted = [...oeParams].sort((a, b) => a.meanVariance - b.meanVariance);

    const overlapMin = Math.max(expSorted[0].meanVariance, oeSorted[0].meanVariance);
    const overlapMax = Math.min(
      expSorted[expSorted.length - 1].meanVariance,
      oeSorted[oeSorted.length - 1].meanVariance
    );

    console.log(`📐 Pareto overlap: ${overlapMin.toFixed(2)} – ${overlapMax.toFixed(2)} px SD`);
    if (overlapMax <= overlapMin) return null;

    const margin = (overlapMax - overlapMin) * 0.05;
    const lowSD  = overlapMin + margin;
    const highSD = overlapMax - margin;
    const midSD  = (lowSD + highSD) / 2;
    const targetSDs = [
      { level: 'Low', sd: lowSD },
      { level: 'Medium', sd: midSD },
      { level: 'High', sd: highSD }
    ];

    console.log(`🎯 Target SDs: Low=${lowSD.toFixed(2)}, Med=${midSD.toFixed(2)}, High=${highSD.toFixed(2)}`);

    const pairs = [];
    for (const target of targetSDs) {
      const exp = this.interpolateParams(target.sd, expSorted, 'exponential');
      const oe = this.interpolateParams(target.sd, oeSorted, 'oneEuro');
      if (!exp || !oe) return null;

      const normPct = (target.sd / limitingDim) * 100;

      pairs.push({
        pairNumber: pairs.length + 1,
        description: `${target.level} SD (~${target.sd.toFixed(1)}) - Interpolated`,
        variance: target.sd,
        varianceNormPct: normPct,
        exponential: {
          rank: exp.interpolated ? 'interp' : (exp.rank || '?'),
          alpha: exp.alpha,
          variance: target.sd,
          latency: exp.meanLatency
        },
        oneEuro: {
          rank: oe.interpolated ? 'interp' : (oe.rank || '?'),
          minCutoff: oe.minCutoff,
          beta: oe.beta,
          dCutoff: oe.dCutoff,
          variance: target.sd,
          latency: oe.meanLatency
        }
      });

      console.log(`  ✅ ${target.level} (SD=${target.sd.toFixed(2)}): Exp α=${exp.alpha.toFixed(6)}, OE minCutoff=${oe.minCutoff.toFixed(4)}`);
    }

    return pairs;
  }

  // Generate layouts (4 layouts: 2 sizes × 2 amplitudes)
  generateLayouts() {
    const layouts = [];
    const { targetSizePercents, amplitudePercents, directionSequence } = this.config;
    
    // Convert percentages to pixels based on limiting dimension (adapts to orientation)
    const targetSizes = targetSizePercents.map(p => this.percentToPixels(p));
    const amplitudes = amplitudePercents.map(p => this.percentToPixels(p));
    
    const limitingDimension = Math.min(window.innerWidth, window.innerHeight);
    
    // For each size × amplitude combination
    for (const size of targetSizes) {
      for (const amplitude of amplitudes) {
        // Use 95% safe area for largest amplitude, 85% for others
        // This allows testing larger distances while maintaining safety for smaller configs
        const isLargestAmplitude = amplitude === Math.max(...amplitudes);
        const safeAreaPercent = isLargestAmplitude ? 0.95 : 0.85;
        const safeRadius = (limitingDimension / 2) * safeAreaPercent;
        
        // Validate that target fits within safe viewing area
        const targetRadius = size / 2;
        const requiredRadius = amplitude + targetRadius;
        
        // Auto-scale if needed (with warning)
        let finalAmplitude = amplitude;
        if (requiredRadius > safeRadius) {
          finalAmplitude = safeRadius - targetRadius;
          console.warn(`⚠️ Layout (size=${size}px, amp=${amplitude}px) exceeds safe area (${safeAreaPercent*100}%). Auto-scaled amplitude to ${finalAmplitude.toFixed(0)}px`);
        }
        
        layouts.push({
          targetSize: size,
          amplitude: finalAmplitude,
          originalAmplitude: amplitude, // Store original for reference
          sequence: [...directionSequence] // 8 directions in specific order
        });
      }
    }
    
    return layouts;
  }
  
  // Get current layout info
  getCurrentLayout() {
    if (this.currentLayoutIndex < this.layouts.length) {
      return this.layouts[this.currentLayoutIndex];
    }
    return null;
  }
  
  // Get current variance-matched pair
  getCurrentPair() {
    if (this.currentPairIndex < this.config.varianceMatchedPairs.length) {
      return this.config.varianceMatchedPairs[this.currentPairIndex];
    }
    return null;
  }
  
  // Get current filter type (respects counterbalanced filter order)
  getCurrentFilter() {
    const first = this.counterbalanceCondition?.filterFirst || 'exponential';
    const second = first === 'exponential' ? 'oneEuro' : 'exponential';
    return this.currentFilterPhase === 0 ? first : second;
  }
  
  // Get current filter configuration (rank and parameters)
  getCurrentFilterConfig() {
    const pair = this.getCurrentPair();
    if (!pair) return null;
    
    const filterType = this.getCurrentFilter();
    return filterType === "exponential" ? pair.exponential : pair.oneEuro;
  }
  
  // Get current direction in sequence
  getCurrentDirection() {
    const layout = this.getCurrentLayout();
    if (layout && this.currentTrialInLayout < layout.sequence.length) {
      return layout.sequence[this.currentTrialInLayout];
    }
    return null;
  }
  
  hideNonEssentialControls() {
    const trackingControls = document.querySelector('.tracking-controls');
    if (!trackingControls) return;

    // Hide everything except the Back to Start button
    Array.from(trackingControls.children).forEach(child => {
      const isBackBtn = child.textContent.includes('Back to Start');
      if (!isBackBtn) {
        child.style.display = 'none';
      }
    });

    trackingControls.style.maxWidth = '280px';
    console.log("✅ Hidden tracking controls for Fitts experiment");
  }
  
  addExperimentPhaseIndicator() {
    // Phase info is no longer shown in the control panel
  }
  
  restoreAllControls() {
    const container = document.getElementById('tracking-controls-container');
    if (!container) return;

    // Force full React re-render so the panel returns to its correct state
    if (window.TrackingControls && window.ReactDOM) {
      try {
        container.innerHTML = '';
        const root = ReactDOM.createRoot(container);
        root.render(React.createElement(window.TrackingControls));
      } catch (e) {
        console.warn('Could not re-render tracking controls:', e);
      }
    }

    console.log("✅ Restored tracking controls");
  }
  
  // Update parameter display (Alpha, Smoothing Factor, Variance, Latency)
  updateParameterDisplay(filterType, rank) {
    if (filterType === 'exponential') {
      const params = window.EXPONENTIAL_PARAMETERS?.[rank - 1];
      if (params) {
        const alpha = params.alpha;
        const smoothing = 1 - alpha;
        
        // Find and update the parameter display spans
        const spans = document.querySelectorAll('.exponential-rank-selector span.font-mono');
        spans.forEach(span => {
          const text = span.textContent;
          // Update Alpha
          if (text.includes('.') && span.previousSibling?.textContent?.includes('Alpha')) {
            span.textContent = alpha.toFixed(6);
          }
          // Update Smoothing Factor
          if (text.includes('.') && span.previousSibling?.textContent?.includes('Smoothing')) {
            span.textContent = smoothing.toFixed(6);
          }
          // Update Variance
          if (text.includes('.') && span.previousSibling?.textContent?.includes('Variance')) {
            span.textContent = params.meanVariance.toFixed(4);
          }
          // Update Latency
          if (text.includes('ms') && span.previousSibling?.textContent?.includes('Latency')) {
            span.textContent = params.meanLatency.toFixed(2) + ' ms';
          }
        });
        console.log(`📊 Updated Exponential parameter display for Rank ${rank}`);
      }
    } else if (filterType === 'oneEuro') {
      const params = window.PARETO_FRONT_PARAMETERS?.[rank - 1];
      if (params) {
        console.log(`🔍 Looking for One Euro parameter spans...`);
        // Find and update the parameter display spans
        const spans = document.querySelectorAll('.pareto-front-selector span.font-mono');
        console.log(`   Found ${spans.length} font-mono spans`);
        
        spans.forEach((span, index) => {
          const text = span.textContent;
          const prevText = span.previousSibling?.textContent || '';
          console.log(`   Span ${index}: "${text}", Previous: "${prevText}"`);
          
          // Update minCutoff
          if (prevText.includes('minCutoff')) {
            span.textContent = params.minCutoff.toFixed(6);
            console.log(`   ✅ Updated minCutoff to ${params.minCutoff.toFixed(6)}`);
          }
          // Update beta
          if (prevText.includes('beta')) {
            span.textContent = params.beta.toFixed(6);
            console.log(`   ✅ Updated beta to ${params.beta.toFixed(6)}`);
          }
          // Update dCutoff
          if (prevText.includes('dCutoff')) {
            span.textContent = params.dCutoff.toFixed(4);
            console.log(`   ✅ Updated dCutoff to ${params.dCutoff.toFixed(4)}`);
    }
          // Update Variance (using meanVariance property)
          if (prevText.includes('Variance')) {
            span.textContent = params.meanVariance.toFixed(4);
            console.log(`   ✅ Updated Variance to ${params.meanVariance.toFixed(4)}`);
          }
          // Update Latency (using meanLatency property)
          if (prevText.includes('Latency')) {
            span.textContent = params.meanLatency.toFixed(2) + ' ms';
            console.log(`   ✅ Updated Latency to ${params.meanLatency.toFixed(2)} ms`);
          }
        });
        
        console.log(`📊 One Euro parameter display update complete for Rank ${rank}`);
      }
    }
  }

  // Measure variance for all filter configurations (before experiment starts)
  async measureVarianceForAllConfigurations() {
    console.log("🔬 Measuring actual variance for all filter configurations...");
    
    // Show variance measurement UI with "Ready" button
    this.showVarianceMeasurementUI();
    
    // Wait for user to click the "Ready" button
    await new Promise(resolve => {
      window._varianceMeasurementReady = resolve;
    });
    
    // HIDE CURSOR - Professor's instruction: "You may not want to show the pointer, 
    // otherwise one would move their head trying to control it"
    const cursor = document.getElementById('head-cursor-clipped');
    const cursorWasVisible = cursor && cursor.style.display !== 'none';
    if (cursor) {
      cursor.style.display = 'none';
      console.log("🙈 Cursor hidden during variance measurement");
    }
    
    // Flashy fullscreen countdown: HOLD STILL! 3, 2, 1, GO!
    await this.showFlashyCountdown();
    
    // Collect RAW data ONCE (5 seconds) - then apply all filters offline
    console.log("📊 Collecting raw landmark data for 5 seconds...");
    this.showFlashyMessage("RECORDING... HOLD STILL!", "#ff4444", 0);
    
    const rawSamples = await this.collectRawLandmarkData(this.config.varianceMeasurementDuration);
    
    console.log(`✅ Collected ${rawSamples.length} raw samples`);
    this.removeFlashyOverlay();
    
    // Now apply each filter configuration OFFLINE to the same raw data
    console.log("🔬 Applying filters offline to measure variance...");
    
    for (const pair of this.config.varianceMatchedPairs) {
      // Apply exponential filter offline
      console.log(`📊 Analyzing Pair ${pair.pairNumber} - Exponential (Rank ${pair.exponential.rank})...`);
      const expFiltered = this.applyFilterOffline(rawSamples, "exponential", pair.exponential);
      const expStats = this.calculateVarianceStats(expFiltered);
      
      const limitingDim = Math.min(window.innerWidth, window.innerHeight);

      this.varianceMeasurementResults.push({
        part: this.currentPart,
        pairNumber: pair.pairNumber,
        filterType: "exponential",
        filterRank: pair.exponential.rank,
        expectedVariance: pair.exponential.variance,
        measuredVariance: expStats.totalStdDev,
        stdDevX: expStats.stdDevX,
        stdDevY: expStats.stdDevY,
        numSamples: expFiltered.length,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        limitingDimension: limitingDim,
        measuredVarianceNorm: (expStats.totalStdDev / limitingDim) * 100,
        expectedVarianceNorm: (pair.exponential.variance / limitingDim) * 100
      });
      
      // Apply One Euro filter offline
      console.log(`📊 Analyzing Pair ${pair.pairNumber} - One Euro (Rank ${pair.oneEuro.rank})...`);
      const oneEuroFiltered = this.applyFilterOffline(rawSamples, "oneEuro", pair.oneEuro);
      const oneEuroStats = this.calculateVarianceStats(oneEuroFiltered);
      
      this.varianceMeasurementResults.push({
        part: this.currentPart,
        pairNumber: pair.pairNumber,
        filterType: "oneEuro",
        filterRank: pair.oneEuro.rank,
        expectedVariance: pair.oneEuro.variance,
        measuredVariance: oneEuroStats.totalStdDev,
        stdDevX: oneEuroStats.stdDevX,
        stdDevY: oneEuroStats.stdDevY,
        numSamples: oneEuroFiltered.length,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        limitingDimension: limitingDim,
        measuredVarianceNorm: (oneEuroStats.totalStdDev / limitingDim) * 100,
        expectedVarianceNorm: (pair.oneEuro.variance / limitingDim) * 100
      });
    }
    
    // RESTORE CURSOR
    if (cursor && cursorWasVisible) {
      cursor.style.display = '';
      console.log("👁️ Cursor restored");
    }
    
    console.log("✅ Variance measurement complete!");
    console.log("Results:", this.varianceMeasurementResults);
    
    // Show results to user
    this.showVarianceMeasurementResults();
  }
  
  // Show variance measurement UI with "Ready" button
  showVarianceMeasurementUI() {
    this.experimentUI.innerHTML = `
      <div class="experiment-instructions" style="text-align: center; padding: 40px;">
        <h2>Variance Measurement</h2>
        <p style="font-size: 18px; color: #ccc; margin: 16px 0;">
          Look at the center of the screen and hold still after pressing start.
        </p>
        <div id="variance-status" style="
          background: rgba(100, 200, 255, 0.2);
          padding: 16px;
          border-radius: 5px;
          margin: 14px 0;
          text-align: center;
          display: none;
        ">
          <div style="font-size: 20px; font-weight: bold; color: #64c8ff;">Preparing...</div>
        </div>
        <button class="experiment-button start-button" onclick="document.getElementById('variance-status').style.display='block'; this.style.display='none'; if(window._varianceMeasurementReady) window._varianceMeasurementReady();" style="
          margin-top: 16px; padding: 16px 40px; font-size: 18px; font-weight: bold;
        ">
          Start Measurement (or press Space)
        </button>
      </div>
    `;
  }
  
  // Update variance measurement status
  updateVarianceMeasurementStatus(message, submessage = "") {
    const statusDiv = document.getElementById('variance-status');
    if (statusDiv) {
      statusDiv.innerHTML = `
        <div style="font-size: 14px; font-weight: bold; color: #64c8ff;">
          ${message}
        </div>
        ${submessage ? `<div style="font-size: 11px; color: #aaa; margin-top: 5px;">${submessage}</div>` : ''}
      `;
    }
  }
  
  // Collect raw landmark data (no filtering)
  async collectRawLandmarkData(duration) {
    const samples = [];
    const startTime = performance.now();
    
    return new Promise((resolve) => {
      const collectInterval = setInterval(() => {
        // Collect RAW landmark data (before any filtering)
        if (window.state.lastLandmarks && window.state.lastHeadX !== null && window.state.lastHeadY !== null) {
          samples.push({
            timestamp: performance.now() - startTime,
            headX: window.state.lastHeadX,
            headY: window.state.lastHeadY
          });
        }
      }, 16); // ~60fps
      
      // Stop after duration
      setTimeout(() => {
        clearInterval(collectInterval);
        resolve(samples);
      }, duration);
    });
  }
  
  // Apply filter offline to raw data
  applyFilterOffline(rawSamples, filterType, filterConfig) {
    if (filterType === "exponential") {
      // Apply exponential smoothing
      const alpha = filterConfig.alpha;
      const smoothingFactor = 1 - alpha;
      
      const filtered = [];
      let smoothedX = rawSamples[0]?.headX || 0;
      let smoothedY = rawSamples[0]?.headY || 0;
      
      for (const sample of rawSamples) {
        smoothedX = smoothingFactor * smoothedX + alpha * sample.headX;
        smoothedY = smoothingFactor * smoothedY + alpha * sample.headY;
        filtered.push({ x: smoothedX, y: smoothedY });
      }
      
      return filtered;
    } else if (filterType === "oneEuro") {
      // Apply One Euro filter
      const filtered = [];
      
      // Initialize 2D One Euro filter
      if (!window.OneEuroFilter2D) {
        console.error("OneEuroFilter2D not available!");
        return rawSamples.map(s => ({ x: s.headX, y: s.headY }));
      }
      
      const filter2D = new window.OneEuroFilter2D(60, filterConfig.minCutoff, filterConfig.beta, filterConfig.dCutoff);
      
      for (const sample of rawSamples) {
        const result = filter2D.filter(sample.headX, sample.headY, sample.timestamp / 1000);
        filtered.push({ x: result.x, y: result.y });
      }
      
      return filtered;
    }
    
    return rawSamples.map(s => ({ x: s.headX, y: s.headY }));
  }
  
  // Calculate variance statistics
  calculateVarianceStats(samples) {
    if (samples.length === 0) {
      return { stdDevX: 0, stdDevY: 0, totalStdDev: 0 };
    }
    
    // Calculate mean
    const meanX = samples.reduce((sum, s) => sum + s.x, 0) / samples.length;
    const meanY = samples.reduce((sum, s) => sum + s.y, 0) / samples.length;
    
    // Calculate variance
    const varianceX = samples.reduce((sum, s) => sum + Math.pow(s.x - meanX, 2), 0) / samples.length;
    const varianceY = samples.reduce((sum, s) => sum + Math.pow(s.y - meanY, 2), 0) / samples.length;
    
    // Standard deviation
    const stdDevX = Math.sqrt(varianceX);
    const stdDevY = Math.sqrt(varianceY);
    
    // Combined standard deviation (Euclidean)
    const totalStdDev = Math.sqrt(stdDevX * stdDevX + stdDevY * stdDevY);
    
    return { stdDevX, stdDevY, totalStdDev };
  }
  
  showVarianceMeasurementResults() {
    // Log full details to console for debugging
    console.log('Variance measurement results:', this.varianceMeasurementResults);

    this.experimentUI.innerHTML = `
      <div class="experiment-instructions" style="text-align: center; padding: 40px;">
        <h2 style="color: #22cc66;">Variance Measurement Done ✅</h2>
        <p style="color: #aaa; font-size: 16px; margin: 20px 0;">
          Calibration recorded. Results will be saved with your experiment data.
        </p>
        <button class="experiment-button continue-button" onclick="window.fittsExperiment.continueToExperimentStart()">
          Continue to Experiment (or press Space)
        </button>
      </div>
    `;
  }
  
  // Helper: delay function
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Show a big flashy fullscreen message (for countdown, hold still, etc.)
  showFlashyMessage(text, color = '#ff4444', duration = 1000) {
    let overlay = document.getElementById('flashy-countdown-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'flashy-countdown-overlay';
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        z-index: 99999; display: flex; align-items: center; justify-content: center;
        background: rgba(0, 0, 0, 0.85); pointer-events: none;
      `;
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div style="
        font-size: 80px; font-weight: 900; color: ${color};
        text-shadow: 0 0 40px ${color}, 0 0 80px ${color}, 0 0 120px ${color};
        text-align: center; animation: flashPulse 0.5s ease-in-out infinite alternate;
        letter-spacing: 4px;
      ">${text}</div>
    `;
    if (!document.getElementById('flashy-countdown-styles')) {
      const s = document.createElement('style');
      s.id = 'flashy-countdown-styles';
      s.textContent = `@keyframes flashPulse { from { transform: scale(1); opacity: 0.8; } to { transform: scale(1.08); opacity: 1; } }`;
      document.head.appendChild(s);
    }
    if (duration > 0) {
      return new Promise(resolve => setTimeout(() => {
        overlay.remove();
        resolve();
      }, duration));
    }
  }
  
  removeFlashyOverlay() {
    const overlay = document.getElementById('flashy-countdown-overlay');
    if (overlay) overlay.remove();
  }
  
  // Big flashy countdown: HOLD STILL! → 3 → 2 → 1 → GO!
  async showFlashyCountdown() {
    await this.showFlashyMessage("HOLD STILL!", "#ff4444", 1200);
    await this.showFlashyMessage("3", "#ffaa00", 1000);
    await this.showFlashyMessage("2", "#ffaa00", 1000);
    await this.showFlashyMessage("1", "#ffaa00", 1000);
    await this.showFlashyMessage("GO!", "#00ff66", 600);
  }

  // Simple visual update of slider and filter buttons - no events, no React
  updateSliderVisual(filterType, rank) {
    // Click the button to let React render the correct slider, but store params to reapply after
    const filterButtons = document.querySelectorAll('.filter-buttons button');
    let needsClick = false;
    
    filterButtons.forEach(btn => {
      const btnText = btn.textContent.trim();
      const isExpButton = btnText === 'Exponential';
      const isOneEuroButton = btnText === '1€ Filter';
      
      // Click the button if it's not already active
      if ((filterType === 'exponential' && isExpButton && !btn.classList.contains('active-filter')) ||
          (filterType === 'oneEuro' && isOneEuroButton && !btn.classList.contains('active-filter'))) {
        console.log(`🖱️ Clicking ${btnText} button to switch view`);
        btn.click();
        needsClick = true;
      }
    });
    
    // Wait for React to render, then update slider and re-apply our parameters
    const numericRank = Number(rank);
    const isInterpolated = isNaN(numericRank);
    
    setTimeout(() => {
      if (filterType === 'exponential') {
        const slider = document.querySelector('.exponential-rank-selector input[type="range"]');
        const rankText = document.querySelector('.exponential-rank-selector span.text-sm.font-bold');
        
        if (!isInterpolated && slider) {
          slider.value = numericRank;
        }
        if (rankText) {
          const totalRanks = window.EXPONENTIAL_PARAMETERS ? window.EXPONENTIAL_PARAMETERS.length : 107;
          rankText.textContent = isInterpolated ? `interpolated` : `${numericRank} / ${totalRanks}`;
        }
        console.log(`📊 UI updated: Exponential ${isInterpolated ? 'interpolated' : 'Rank ' + numericRank}`);
      } else if (filterType === 'oneEuro') {
        const slider = document.querySelector('.pareto-front-selector input[type="range"]');
        const rankText = document.querySelector('.pareto-front-selector span.text-sm.font-bold');
        
        if (!isInterpolated && slider) {
          slider.value = numericRank;
          console.log(`✅ One Euro slider value set to ${numericRank}`);
        } else if (isInterpolated) {
          console.log(`✅ One Euro using interpolated params, slider unchanged`);
        } else {
          console.warn('⚠️ One Euro slider not found!');
        }
        if (rankText) {
          const totalRanks = window.PARETO_FRONT_PARAMETERS ? window.PARETO_FRONT_PARAMETERS.length : 85;
          rankText.textContent = isInterpolated ? `interpolated` : `${numericRank} / ${totalRanks}`;
          console.log(`✅ One Euro rank text set to ${isInterpolated ? 'interpolated' : numericRank + ' / ' + totalRanks}`);
        } else {
          console.warn('⚠️ One Euro rank text not found!');
        }
        console.log(`📊 UI updated: One Euro Rank ${rank}`);
      }
      
      // Update parameter display
      this.updateParameterDisplay(filterType, rank);
    }, 100); // Short delay for React to render
  }
  
  // Start the experiment
  async start() {
    if (this.isRunning) {
      console.warn("Experiment already running");
      return;
    }
    
    // Check if tracking is active
    if (!window.state || !window.state.isTracking) {
      alert("Error: Head tracking is not active!\n\nPlease make sure:\n1. You've completed calibration OR loaded a calibration file\n2. Face tracking is turned ON\n3. Your face is visible to the webcam\n\nIf you just loaded a calibration file, try refreshing the page and loading it again.");
      console.error("Cannot start experiment: tracking not active");
      console.error("Debug info:", {
        stateExists: !!window.state,
        isTracking: window.state?.isTracking,
        hasMatrices: !!(window.state?.transformationMatrices?.threePoint2d || window.state?.transformationMatrices?.threePoint3d),
        cursorPosition: { x: window.state?.cursorX, y: window.state?.cursorY }
      });
      return;
    }
    
    // Show participant ID screen and wait for input
    await this.showParticipantIDScreen();
    
    console.log(`Starting Fitts' Law Experiment — Participant: ${this.participantId}`);
    
    // Dynamically compute variance-matched pairs from Pareto data if available
    if (window.EXPONENTIAL_PARAMETERS && window.PARETO_FRONT_PARAMETERS) {
      const dynamicPairs = this.computeInterpolatedPairs();
      if (dynamicPairs) {
        this.config.varianceMatchedPairs = dynamicPairs;
        console.log("✅ Using dynamically interpolated variance-matched pairs");
      } else {
        console.warn("⚠️ Interpolation failed, using hardcoded fallback pairs");
      }
    } else {
      console.warn("⚠️ No Pareto data available, using hardcoded fallback pairs");
    }
    
    // Save all pairs before reordering (needed for Part B medium selection)
    this.allVarianceMatchedPairs = [...this.config.varianceMatchedPairs];
    
    // Apply counterbalanced variance ordering
    if (this.counterbalanceCondition) {
      const reordered = this.counterbalanceCondition.varianceOrder.map(i => this.config.varianceMatchedPairs[i]);
      this.config.varianceMatchedPairs = reordered;
      console.log(`🔀 Variance order: ${this.counterbalanceCondition.varianceOrderLabel}`);
    }
    
    // Save Part A's pairs and set initial part based on counterbalancing
    this.partAVariancePairs = [...this.config.varianceMatchedPairs];
    this.currentPart = (this.counterbalanceCondition?.partFirst === 'B') ? 'Part B' : 'Part A';
    
    // If Part B first, use only medium variance pair
    if (this.currentPart === 'Part B') {
      this.config.varianceMatchedPairs = [this.allVarianceMatchedPairs[1]];
      console.log(`🔬 Starting with Part B (standard calibration, medium variance only)`);
    }
    
    // Hide non-essential controls, keeping only filter controls
    this.hideNonEssentialControls();
    
    // Generate layouts (4 layouts: 2 sizes × 2 amplitudes)
    this.layouts = this.generateLayouts();
    this.currentPairIndex = 0; // Start with Pair 1
    this.currentLayoutIndex = 0;
    this.currentFilterPhase = 0; // Start with exponential within pair
    this.currentTrialInLayout = 0;
    this.trialData = [];
    this.completedPaths = [];
    this.completedTrials = 0;
    
    // Calculate total trials: 3 pairs × 2 filters × 4 layouts × 8 trials = 192
    this.totalTrials = this.config.varianceMatchedPairs.length * 2 * this.layouts.length * this.config.trialsPerLayout;
    
    // Create UI
    this.createUI();
    
    // Apply fixed configuration (2D, 3 landmarks)
    await this.applyConfiguration();
    
    // Save calibration info for this part
    this.calibrationInfo[this.currentPart] = window.state?.calibrationSource || 'Session calibration';
    
    // STEP 1: Run variance measurement for all filter configurations
    console.log("🔬 Starting variance measurement phase...");
    await this.measureVarianceForAllConfigurations();
    
    // Wait for user to click "Continue" button
    // (The button calls continueToExperimentStart())
  }
  
  // Continue to experiment start (after variance measurement)
  async continueToExperimentStart() {
    console.log("📍 Continuing to experiment start...");
    
    // Get first pair and use counterbalanced filter order
    const firstPair = this.config.varianceMatchedPairs[0];
    const firstFilter = this.getCurrentFilter(); // respects counterbalancing
    const firstFilterConfig = firstFilter === 'exponential' ? firstPair.exponential : firstPair.oneEuro;
    
    console.log(`📍 Initial filter setup - Pair 1, ${firstFilter}, Rank ${firstFilterConfig.rank}`);
    await this.setFilter(firstFilter, firstFilterConfig);
    console.log("✅ Filter parameters set")
    
    // Show instructions
    this.showInstructions();
  }
  
  // Apply fixed configuration (2D, 3 landmarks)
  async applyConfiguration() {
    console.log("Applying configuration: 2D, 3 landmarks");
    
    // DON'T change the configuration - just verify it's correct
    // The tracking control page already has the configuration set
    console.log("Current config:", window.state.config.coordinateSystem, window.state.config.landmarkPoints);
    
    // No need to reset cursor or filter state - we're using the existing tracking
    console.log("✅ Using existing tracking configuration");
  }
  
  // Set filter type with specific configuration
  async setFilter(filterType, filterConfig) {
    console.log("========================================");
    console.log("🎯 SET FILTER CALLED");
    console.log("========================================");
    console.log("Filter Type:", filterType);
    console.log("Rank:", filterConfig.rank);
    console.log("Full Config:", filterConfig);
    
    // CRITICAL: Set the filter type so tracking loop knows which filter to use
    window.state.config.filterType = filterType;
    console.log("✅ Set window.state.config.filterType =", filterType);
    
    if (filterType === "exponential") {
      console.log("--- EXPONENTIAL FILTER SETUP ---");
      
      // Support both rank-based lookup and direct alpha (interpolated params)
      let alpha;
      const numericRank = Number(filterConfig.rank);
      if (!isNaN(numericRank) && window.EXPONENTIAL_PARAMETERS && window.EXPONENTIAL_PARAMETERS[numericRank - 1]) {
        alpha = window.EXPONENTIAL_PARAMETERS[numericRank - 1].alpha;
        console.log("  Using rank-based lookup: EXPONENTIAL_PARAMETERS[" + (numericRank - 1) + "]");
      } else if (filterConfig.alpha != null) {
        alpha = filterConfig.alpha;
        console.log("  Using interpolated alpha directly:", alpha);
      } else {
        console.error("❌ Cannot determine alpha — no valid rank or direct alpha");
        return;
      }
      
      const smoothingFactor = 1 - alpha;
      console.log("  - Alpha:", alpha);
      console.log("  - Smoothing Factor:", smoothingFactor.toFixed(6));
      
      window.state.config.exponentialSmoothingFactor = smoothingFactor;
      console.log("✅ Applied to window.state.config.exponentialSmoothingFactor");
    } else if (filterType === "oneEuro") {
      console.log("--- ONE EURO FILTER SETUP ---");
      console.log("Using parameters directly from filterConfig:");
      console.log("  - Rank:", filterConfig.rank);
      console.log("  - minCutoff:", filterConfig.minCutoff);
      console.log("  - beta:", filterConfig.beta);
      console.log("  - dCutoff:", filterConfig.dCutoff);
      console.log("  - Variance:", filterConfig.variance);
      console.log("  - Latency:", filterConfig.latency);
      
      // Use parameters directly from filterConfig (from pairs configuration)
      if (!window.state.filterConfig) window.state.filterConfig = {};
      window.state.filterConfig.minCutoff = filterConfig.minCutoff;
      window.state.filterConfig.beta = filterConfig.beta;
      window.state.filterConfig.dcutoff = filterConfig.dCutoff;
      console.log("✅ Applied to window.state.filterConfig");
      
      // Reinitialize 2D One Euro filter
      if (window.OneEuroFilter2D) {
        window.state.filter2D = new window.OneEuroFilter2D(60, filterConfig.minCutoff, filterConfig.beta, filterConfig.dCutoff);
        window.state.xFilter = window.state.filter2D;
        window.state.yFilter = window.state.filter2D;
        console.log("✅ Reinitialized 2D filter");
      } else {
        console.error("❌ OneEuroFilter2D class not found!");
      }
      
      // Verify it was set
      console.log("VERIFICATION:");
      console.log("  window.state.filterConfig.minCutoff =", window.state.filterConfig.minCutoff);
      console.log("  window.state.filterConfig.beta =", window.state.filterConfig.beta);
      console.log("  window.state.filterConfig.dcutoff =", window.state.filterConfig.dcutoff);
      console.log("  xFilter exists:", !!window.state.xFilter ? "✅ YES" : "❌ NO");
      console.log("  yFilter exists:", !!window.state.yFilter ? "✅ YES" : "❌ NO");
    }
    
    console.log("--- UPDATING UI ---");
    // Update slider visual (includes parameter display update after delay)
    this.updateSliderVisual(filterType, filterConfig.rank);
    
    // For One Euro, re-apply parameters after React's button click resets them
    if (filterType === "oneEuro") {
      setTimeout(() => {
        console.log("🔄 RE-APPLYING One Euro parameters after React reset...");
        if (!window.state.filterConfig) window.state.filterConfig = {};
        window.state.filterConfig.minCutoff = filterConfig.minCutoff;
        window.state.filterConfig.beta = filterConfig.beta;
        window.state.filterConfig.dcutoff = filterConfig.dCutoff;
        
        if (window.OneEuroFilter2D) {
          window.state.filter2D = new window.OneEuroFilter2D(60, filterConfig.minCutoff, filterConfig.beta, filterConfig.dCutoff);
          window.state.xFilter = window.state.filter2D;
          window.state.yFilter = window.state.filter2D;
          console.log("✅ RE-APPLIED One Euro 2D parameters:");
          console.log("  - minCutoff:", window.state.filterConfig.minCutoff);
          console.log("  - beta:", window.state.filterConfig.beta);
          console.log("  - dCutoff:", window.state.filterConfig.dcutoff);
        }
      }, 150); // Apply after React has reset to Rank 1
    }
    
    console.log("========================================");
    console.log("✅ SET FILTER COMPLETE");
    console.log("========================================");
  }
  
  // Show instructions screen
  showInstructions() {
    const layout = this.getCurrentLayout();
    const pair = this.getCurrentPair();
    const filterConfig = this.getCurrentFilterConfig();
    const filterName = this.getCurrentFilter() === "exponential" ? "Exponential Smoothing" : "One Euro Filter";
    const globalPhase = (this.currentPairIndex * 2) + this.currentFilterPhase + 1;
    
    // Round sizes for cleaner display
    const targetSizeRounded = Math.round(layout.targetSize);
    const amplitudeRounded = Math.round(layout.amplitude);
    
    // Calculate global layout number across all pairs
    const layoutsPerPhase = this.layouts.length;
    const globalLayoutNumber = (this.currentPairIndex * 2 * layoutsPerPhase) + (this.currentFilterPhase * layoutsPerPhase) + this.currentLayoutIndex + 1;
    const totalLayouts = this.config.varianceMatchedPairs.length * 2 * layoutsPerPhase;
    
    this.experimentUI.innerHTML = `
      <div class="experiment-instructions" style="text-align: center; padding: 30px;">
        <h2>Phase ${globalPhase}/${this.config.varianceMatchedPairs.length * 2}</h2>
        <p style="color: #aaa; font-size: 16px; margin: 10px 0 20px;">
          ${filterName} · Layout ${this.currentLayoutIndex + 1}/${layoutsPerPhase}
        </p>

        <div style="text-align: left; max-width: 440px; margin: 0 auto; font-size: 16px; line-height: 2.2; color: #ccc;">
          <div>1. Move head to the <span style="color:#6495ED; font-weight:bold;">blue disk</span> in the center and hold</div>
          <div>2. Move to the <span style="color:#ff4444; font-weight:bold;">RED</span> target — hold 2 seconds → it turns <span style="color:#64ff64; font-weight:bold;">GREEN</span></div>
          <div>3. Move to the <span style="color:#ff4444; font-weight:bold;">next RED</span> target — <strong style="color:#ffaa00;">NOT</strong> the <span style="color:#ffc864;">yellow</span> one!</div>
          <div>4. Repeat until all targets are green</div>
        </div>

        <p style="color: #888; font-size: 13px; margin: 20px 0 5px;">
          Progress: ${this.completedTrials} / ${this.totalTrials} trials · <span style="color: #ffaa00;">3 min limit per condition</span>
        </p>

        <button class="experiment-button start-button" onclick="window.fittsExperiment.startTrials()" style="
          margin-top: 15px; padding: 14px 40px; font-size: 18px;
        ">
          Start (or press Space)
        </button>
      </div>
    `;
  }
  
  startTrials() {
    this.isRunning = true;

    this.ensureCursorVisible();

    if (!window.state || !window.state.isTracking) {
      console.error("Tracking stopped! Attempting to resume...");
      alert("Warning: Tracking seems to have stopped. Please check that face tracking is ON.");
      return;
    }

    // Start 3-minute condition timer (only once per condition, persists across layouts)
    if (!this._conditionTimerInterval) {
      this.conditionStartTime = Date.now();
      this.conditionMissedTrials = 0;
      this._startConditionTimer();
    }

    this.showNextTrial();

    this.cursorTrackingInterval = setInterval(this.update, 16);
  }

  _startConditionTimer() {
    // Remove old timer display
    if (this._conditionTimerEl) this._conditionTimerEl.remove();

    const el = document.createElement('div');
    el.id = 'condition-timer';
    el.style.cssText = `
      position: fixed; top: 12px; right: 12px; z-index: 20001;
      padding: 6px 14px; font-size: 16px; font-weight: bold;
      background: rgba(0,0,0,0.7); color: #64ff64; border-radius: 8px;
      font-family: monospace; pointer-events: none;
    `;
    document.body.appendChild(el);
    this._conditionTimerEl = el;

    this._conditionTimerInterval = setInterval(() => {
      const elapsed = Date.now() - this.conditionStartTime;
      const remaining = Math.max(0, this.config.conditionTimeLimit - elapsed);
      const secs = Math.ceil(remaining / 1000);
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      el.textContent = `${m}:${s.toString().padStart(2, '0')}`;

      if (remaining <= 30000) {
        el.style.color = '#ff4444';
      } else if (remaining <= 60000) {
        el.style.color = '#ffaa00';
      }

      if (remaining <= 0) {
        this._onConditionTimeout();
      }
    }, 500);
  }

  _stopConditionTimer() {
    if (this._conditionTimerInterval) {
      clearInterval(this._conditionTimerInterval);
      this._conditionTimerInterval = null;
    }
    if (this._conditionTimerEl) {
      this._conditionTimerEl.remove();
      this._conditionTimerEl = null;
    }
  }

  _onConditionTimeout() {
    this._stopConditionTimer();

    const pair = this.getCurrentPair();
    const filterType = this.getCurrentFilter();
    const filterConfig = filterType === 'exponential' ? pair?.exponential : pair?.oneEuro;
    const timeoutTimestamp = Date.now();
    const elapsedMs = timeoutTimestamp - this.conditionStartTime;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    let layoutIdx = this.currentLayoutIndex;
    let trialIdx = this.currentTrialInLayout;
    let isFirstMissed = true;

    while (layoutIdx < this.layouts.length) {
      const layout = this.layouts[layoutIdx];
      while (trialIdx < this.config.trialsPerLayout) {
        const direction = this.config.directionSequence[trialIdx];
        const targetX = centerX + layout.amplitude * Math.cos((direction * Math.PI) / 180);
        const targetY = centerY + layout.amplitude * Math.sin((direction * Math.PI) / 180);

        // The first missed trial = the one in progress when timeout hit
        // It has cursor path, start point, partial movement data
        const isInProgress = isFirstMissed &&
          layoutIdx === this.currentLayoutIndex &&
          trialIdx === this.currentTrialInLayout;

        const lastCursorPos = isInProgress && this.cursorPath.length > 0
          ? this.cursorPath[this.cursorPath.length - 1] : null;

        const entryEvents = isInProgress ? this.targetEvents.filter(e => e.type === 'enter') : [];
        const reEntryCount = Math.max(0, entryEvents.length - 1);

        const trialEntry = {
          status: isInProgress ? 'timeout_in_progress' : 'timeout_not_attempted',
          part: this.currentPart,
          pairIndex: this.currentPairIndex,
          pairNumber: pair?.pairNumber,
          pairVariance: pair?.variance,
          pairVarianceNormPct: pair?.varianceNormPct,
          pairDescription: pair?.description,
          filterPhase: this.currentFilterPhase,
          filterType: filterType,
          filterRank: filterConfig?.rank,
          filterVariance: pair?.variance,
          filterLatency: filterConfig?.latency,
          layoutIndex: layoutIdx,
          trialInLayout: trialIdx,
          globalTrialNumber: null,
          targetSize: layout.targetSize,
          amplitude: layout.amplitude,
          direction: direction,
          directionIndex: trialIdx,
          targetX: targetX,
          targetY: targetY,
          // For in-progress trial: last cursor position as endpoint
          endpointX: lastCursorPos ? lastCursorPos.x : null,
          endpointY: lastCursorPos ? lastCursorPos.y : null,
          startX: isInProgress && this.startPoint ? this.startPoint.x : null,
          startY: isInProgress && this.startPoint ? this.startPoint.y : null,
          effectiveAmplitude: isInProgress && this.startPoint && lastCursorPos
            ? Math.sqrt(Math.pow(lastCursorPos.x - this.startPoint.x, 2) + Math.pow(lastCursorPos.y - this.startPoint.y, 2))
            : null,
          movementTime: isInProgress && this.movementStartTime
            ? (performance.now() - this.movementStartTime) / 1000 : null,
          totalTime: isInProgress && this.trialStartTime
            ? (performance.now() - this.trialStartTime) / 1000 : null,
          selectionX: null,
          selectionY: null,
          reEntryCount: isInProgress ? reEntryCount : null,
          peakSpeed: null,
          kinematicMT: null,
          entryBasedMT: null,
          lastEntryX: null,
          lastEntryY: null,
          trialStartTime: isInProgress ? this.trialStartTime : null,
          movementStartTime: isInProgress ? this.movementStartTime : null,
          movementOnsetTime: null,
          movementOffsetTime: null,
          firstEntryTime: entryEvents.length > 0 ? entryEvents[0].t : null,
          lastEntryTime: entryEvents.length > 0 ? entryEvents[entryEvents.length - 1].t : null,
          selectionTime: null,
          conditionElapsedMs: elapsedMs,
          // Save cursor path and target events for the in-progress trial
          cursorPath: isInProgress ? this.cursorPath.map(p => ({ x: p.x, y: p.y, t: p.t })) : [],
          targetEvents: isInProgress ? [...this.targetEvents] : [],
          timestamp: timeoutTimestamp
        };

        this.trialData.push(trialEntry);
        this.conditionMissedTrials++;
        isFirstMissed = false;
        trialIdx++;
      }
      trialIdx = 0;
      layoutIdx++;
    }

    console.log(`⏰ Condition timed out! Missed: ${this.conditionMissedTrials} (1 in-progress + ${this.conditionMissedTrials - 1} not attempted)`);

    if (this.cursorTrackingInterval) {
      clearInterval(this.cursorTrackingInterval);
      this.cursorTrackingInterval = null;
    }
    this.endFilterPhase();
  }
  
  // Ensure cursor is visible above experiment UI
  ensureCursorVisible() {
    const cursor = document.getElementById('head-cursor-clipped');
    if (cursor) {
      cursor.style.zIndex = '20000'; // Above all experiment elements
      
      // Make absolutely sure it's visible
      cursor.style.display = 'block';
      cursor.style.visibility = 'visible';
      cursor.style.opacity = '1';
      
      console.log("Cursor z-index set to 20000, cursor element:", cursor);
      
      // Also verify cursor is getting position updates
      const currentLeft = cursor.style.left;
      const currentTop = cursor.style.top;
      console.log("Current cursor position in DOM:", currentLeft, currentTop);
      
      // Set up a test to monitor if cursor position changes
      let lastLeft = currentLeft;
      let lastTop = currentTop;
      setTimeout(() => {
        const newLeft = cursor.style.left;
        const newTop = cursor.style.top;
        if (newLeft === lastLeft && newTop === lastTop) {
          console.error("⚠️ CURSOR NOT MOVING! Position hasn't changed in 1 second");
          console.log("Tracking state:", window.state?.isTracking);
          console.log("Last landmarks:", window.state?.lastLandmarks ? "Present" : "None");
        } else {
          console.log("✓ Cursor is moving correctly");
        }
      }, 1000);
    } else {
      console.error("Cursor element not found!");
    }
  }
  
  // Show the next trial
  showNextTrial() {
    console.log("📍 showNextTrial() called - trialInLayout:", this.currentTrialInLayout, "layoutIndex:", this.currentLayoutIndex);
    
    const layout = this.getCurrentLayout();
    
    // Check if current layout is complete
    if (!layout || this.currentTrialInLayout >= this.config.trialsPerLayout) {
      console.log("Layout complete, calling endLayout()");
      this.endLayout();
      return;
    }
    
    const direction = this.getCurrentDirection();
    const filterType = this.getCurrentFilter();
    
    console.log("Next trial - direction:", direction, "filter:", filterType);
    
    // Get current pair and filter config
    const pair = this.getCurrentPair();
    const filterConfig = this.getCurrentFilterConfig();
    
    // Set up current trial
    this.currentTrial = {
      part: this.currentPart,
      pairIndex: this.currentPairIndex,
      pairNumber: pair.pairNumber,
      pairVariance: pair.variance,
      pairVarianceNormPct: pair.varianceNormPct || null,
      pairDescription: pair.description,
      layoutIndex: this.currentLayoutIndex,
      filterType: filterType,
      filterPhase: this.currentFilterPhase,
      filterRank: filterConfig.rank,
      filterVariance: filterConfig.variance,
      filterLatency: filterConfig.latency,
      trialInLayout: this.currentTrialInLayout,
      targetSize: layout.targetSize,
      amplitude: layout.amplitude,
      direction: direction,
      directionIndex: this.currentTrialInLayout,
      globalTrialNumber: this.completedTrials + 1
    };
    
    this.movementStartTime = null;
    this.dwellStartTime = null;
    this.selectionRegistered = false; // Reset selection flag
    this.cursorPath = []; // Reset cursor path
    this.targetEvents = []; // Reset target events
    this.isInsideTarget = false; // Reset target state
    
    // Set start point based on previous trial
    // First trial: start from center
    // Subsequent trials: start from previous target
    if (this.currentTrialInLayout === 0) {
      // First trial - start from center, must dwell in home circle first
      this.startPoint = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      this.previousTargetSize = layout.targetSize * 1.3; // Home circle size (1.3x target circles)
      this.waitingForHomeCircle = true; // Wait for home circle dwell before starting trial
    } else {
      // Get previous target position
      const layout = this.getCurrentLayout();
      const previousDirection = layout.sequence[this.currentTrialInLayout - 1];
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const radians = (previousDirection * Math.PI) / 180;
      
      this.startPoint = {
        x: centerX + layout.amplitude * Math.cos(radians),
        y: centerY + layout.amplitude * Math.sin(radians)
      };
      this.previousTargetSize = layout.targetSize;
      this.waitingForHomeCircle = false; // Not waiting, start measuring immediately
    }
    
    // Clear UI
    this.experimentUI.innerHTML = '';
    
    // Ensure cursor remains visible
    this.ensureCursorVisible();
    
    // Create guide lines (show completed paths in this block)
    this.createGuideLines();
    
    // Create all 8 target circles (recreate each time to ensure they're in DOM)
    this.createAllTargetCircles();
    
    // Update target highlighting for current trial
    this.updateTargetHighlighting();
    
    // Create home circle
    this.createHomeCircle();
    
    // Create dwell indicator for current target
    this.createDwellIndicator();
    
    // Create progress text
    this.createProgressText();
    
    // Record trial start
    this.trialStartTime = performance.now();
    
    console.log(`Trial ${this.completedTrials + 1}/${this.totalTrials}, Layout ${this.currentLayoutIndex + 1}/${this.layouts.length}, Filter: ${filterType}, Trial in layout: ${this.currentTrialInLayout + 1}/${this.config.trialsPerLayout}:`, this.currentTrial);
  }
  
  // Create guide lines showing completed paths in current layout
  createGuideLines() {
    if (!this.guideLines) {
      this.guideLines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.guideLines.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 10000;
      `;
      this.experimentUI.appendChild(this.guideLines);
    }
    
    // Clear existing lines
    this.guideLines.innerHTML = '';
    
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const layout = this.getCurrentLayout();
    
    if (!layout) return;
    
    // Draw dashed lines for completed trials in this layout
    for (let i = 0; i < this.currentTrialInLayout; i++) {
      const direction = layout.sequence[i];
      const radians = (direction * Math.PI) / 180;
      const targetX = centerX + layout.amplitude * Math.cos(radians);
      const targetY = centerY + layout.amplitude * Math.sin(radians);
      
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', centerX);
      line.setAttribute('y1', centerY);
      line.setAttribute('x2', targetX);
      line.setAttribute('y2', targetY);
      line.setAttribute('stroke', 'rgba(150, 150, 150, 0.4)');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '5,5');
      
      this.guideLines.appendChild(line);
    }
  }
  
  // Create start indicator (home circle for first trial, or highlight previous target)
  createHomeCircle() {
    // Only show home circle for first trial in layout
    if (this.currentTrialInLayout === 0) {
      // Make home circle slightly bigger than target circles (1.3x)
      const layout = this.getCurrentLayout();
      const homeSize = layout.targetSize * 1.3;
      
      this.homeCircle = document.createElement('div');
      this.homeCircle.className = 'fitts-home-circle';
      this.homeCircle.style.cssText = `
        position: fixed;
        left: ${window.innerWidth / 2 - homeSize / 2}px;
        top: ${window.innerHeight / 2 - homeSize / 2}px;
        width: ${homeSize}px;
        height: ${homeSize}px;
        border-radius: 50%;
        background-color: rgba(100, 150, 255, 0.6);
        border: 4px solid rgba(100, 150, 255, 1);
        pointer-events: none;
        z-index: 10001;
        box-shadow: 0 0 20px rgba(100, 150, 255, 0.8);
      `;
      
      this.experimentUI.appendChild(this.homeCircle);
    }
    // For subsequent trials, the previous target (now green) serves as the start indicator
  }
  
  // Create all 8 target circles at once
  createAllTargetCircles() {
    const layout = this.getCurrentLayout();
    if (!layout) return;
    
    const { targetSize, amplitude } = layout;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    // All 8 directions
    const allDirections = [0, 45, 90, 135, 180, 225, 270, 315];
    
    // Clear previous circles
    this.targetCircles = {};
    
    for (const direction of allDirections) {
      const radians = (direction * Math.PI) / 180;
      const targetX = centerX + amplitude * Math.cos(radians);
      const targetY = centerY + amplitude * Math.sin(radians);
      
      // Create target circle
      const circle = document.createElement('div');
      circle.className = 'fitts-target-circle';
      circle.setAttribute('data-direction', direction);
      circle.style.cssText = `
        position: fixed;
        left: ${targetX - targetSize / 2}px;
        top: ${targetY - targetSize / 2}px;
        width: ${targetSize}px;
        height: ${targetSize}px;
        border-radius: 50%;
        background-color: rgba(150, 150, 150, 0.3);
        border: 3px solid rgba(150, 150, 150, 0.6);
        pointer-events: none;
        z-index: 10001;
        transition: all 0.3s ease;
      `;
      
      this.experimentUI.appendChild(circle);
      this.targetCircles[direction] = circle;
    }
  }
  
  // Update highlighting to show current and next targets
  updateTargetHighlighting() {
    const layout = this.getCurrentLayout();
    if (!layout) return;
    
    const currentDirection = this.getCurrentDirection();
    console.log("🎨 Updating target highlighting - current direction:", currentDirection, "trial:", this.currentTrialInLayout);
    
    // Update all circles
    let highlightedCount = 0;
    for (const [direction, circle] of Object.entries(this.targetCircles)) {
      const dir = parseInt(direction);
      const sequenceIndex = layout.sequence.indexOf(dir);
      
      if (dir === currentDirection) {
        // Current target - check if we're waiting for home circle
        if (this.waitingForHomeCircle) {
          // Before starting: current target is yellow (not red yet)
          circle.style.backgroundColor = 'rgba(255, 200, 100, 0.5)';
          circle.style.borderColor = 'rgba(255, 200, 100, 0.8)';
          circle.style.borderWidth = '3px';
          circle.style.boxShadow = '0 0 15px rgba(255, 200, 100, 0.6)';
          circle.style.transform = 'scale(1.05)';
          console.log(`  🟡 Direction ${dir}° = YELLOW (waiting for home circle)`);
        } else {
          // After home circle: current target is red
          circle.style.backgroundColor = 'rgba(255, 100, 100, 0.8)';
          circle.style.borderColor = 'rgba(255, 100, 100, 1)';
          circle.style.borderWidth = '4px';
          circle.style.boxShadow = '0 0 30px rgba(255, 100, 100, 1)';
          circle.style.transform = 'scale(1.1)';
          console.log(`  ➡️ Direction ${dir}° = RED (current target)`);
        }
        highlightedCount++;
      } else if (sequenceIndex !== -1 && sequenceIndex < this.currentTrialInLayout) {
        // Completed target - green
        circle.style.backgroundColor = 'rgba(100, 255, 100, 0.4)';
        circle.style.borderColor = 'rgba(100, 255, 100, 0.7)';
        circle.style.borderWidth = '3px';
        circle.style.boxShadow = 'none';
        circle.style.transform = 'scale(1)';
        console.log(`  ✅ Direction ${dir}° = GREEN (completed, seqIdx=${sequenceIndex} < ${this.currentTrialInLayout})`);
      } else if (sequenceIndex === this.currentTrialInLayout + 1) {
        // Next target - check if we're waiting for home circle
        if (this.waitingForHomeCircle) {
          // Before starting: next target is gray (not shown yet)
          circle.style.backgroundColor = 'rgba(150, 150, 150, 0.3)';
          circle.style.borderColor = 'rgba(150, 150, 150, 0.6)';
          circle.style.borderWidth = '3px';
          circle.style.boxShadow = 'none';
          circle.style.transform = 'scale(1)';
          console.log(`  ⚪ Direction ${dir}° = GRAY (waiting for home circle)`);
        } else {
          // After home circle: next target is yellow/orange
          circle.style.backgroundColor = 'rgba(255, 200, 100, 0.5)';
          circle.style.borderColor = 'rgba(255, 200, 100, 0.8)';
          circle.style.borderWidth = '3px';
          circle.style.boxShadow = '0 0 15px rgba(255, 200, 100, 0.6)';
          circle.style.transform = 'scale(1.05)';
          console.log(`  🟠 Direction ${dir}° = ORANGE (next target)`);
        }
      } else {
        // Inactive target - gray
        circle.style.backgroundColor = 'rgba(150, 150, 150, 0.3)';
        circle.style.borderColor = 'rgba(150, 150, 150, 0.6)';
        circle.style.borderWidth = '3px';
        circle.style.boxShadow = 'none';
        circle.style.transform = 'scale(1)';
      }
    }
    
    if (highlightedCount === 0) {
      console.error("⚠️ NO RED TARGET HIGHLIGHTED! Current direction:", currentDirection);
    }
  }
  
  // Create dwell indicator for current target
  createDwellIndicator() {
    const { targetSize, amplitude, direction } = this.currentTrial;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    const radians = (direction * Math.PI) / 180;
    const targetX = centerX + amplitude * Math.cos(radians);
    const targetY = centerY + amplitude * Math.sin(radians);
    
    this.dwellIndicator = document.createElement('div');
    this.dwellIndicator.className = 'fitts-dwell-indicator';
    this.dwellIndicator.style.cssText = `
      position: fixed;
      left: ${targetX - targetSize / 2 - 5}px;
      top: ${targetY - targetSize / 2 - 5}px;
      width: ${targetSize + 10}px;
      height: ${targetSize + 10}px;
      border-radius: 50%;
      border: 4px solid transparent;
      background-clip: padding-box; /* Prevents square outline on gradient */
      pointer-events: none;
      z-index: 10002;
      transition: border-color 0.1s;
    `;
    
    this.experimentUI.appendChild(this.dwellIndicator);
  }
  
  // Create progress text
  createProgressText() {
    this.progressText = document.createElement('div');
    this.progressText.className = 'fitts-progress';
    this.progressText.style.cssText = `
      position: fixed;
      top: 8px;
      left: 8px;
      background-color: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 10px 14px;
      border-radius: 5px;
      font-size: 13px;
      z-index: 10003;
      text-align: left;
      border: 1px solid rgba(100, 255, 100, 0.5);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
      pointer-events: auto;
      max-width: 240px;
    `;
    
    this.updateProgressText();
    this.experimentUI.appendChild(this.progressText);
  }
  
  // Update progress text content
  updateProgressText() {
    if (!this.progressText) return;
    
    const filterName = this.getCurrentFilter() === "exponential" ? "Exponential" : "One Euro";
    const layout = this.getCurrentLayout();
    
    const globalLayoutNumber = this.currentLayoutIndex + 1 + (this.currentFilterPhase * this.layouts.length);
    
    let content = `
      <div style="font-weight: bold; font-size: 14px;">Trial ${this.completedTrials + 1}/${this.totalTrials}</div>
      <div style="font-size: 12px; margin-top: 3px; color: #aaa;">${filterName}</div>
      <div style="font-size: 11px; margin-top: 3px; color: #888;">
        Layout ${globalLayoutNumber}/12 | T${this.currentTrialInLayout + 1}/8
      </div>
      <div style="font-size: 11px; margin-top: 2px; color: #888;">
        ${this.currentTrial.targetSize}px ${this.currentTrial.amplitude}px ${this.currentTrial.direction}°
      </div>
    `;
    
    // Add special message if waiting for home circle
    if (this.waitingForHomeCircle) {
      content += `
        <div style="font-size: 12px; margin-top: 5px; color: #64c8ff; font-weight: bold;">
          ⬇️ Move to blue circle
        </div>
      `;
    }
    
    // Add skip and back buttons
    content += `
      <div style="display: flex; gap: 4px; margin-top: 7px;">
        <button 
          onclick="window.fittsExperiment.skipLayout()" 
          style="
            padding: 5px 8px;
            font-size: 11px;
            background: rgba(255, 152, 0, 0.3);
            border: 1px solid rgba(255, 152, 0, 0.5);
            border-radius: 3px;
            color: #ff9800;
            cursor: pointer;
            flex: 1;
            pointer-events: auto;
          "
          onmouseover="this.style.background='rgba(255, 152, 0, 0.5)'"
          onmouseout="this.style.background='rgba(255, 152, 0, 0.3)'"
        >
          skip this layout
        </button>
        <button 
          onclick="window.fittsExperiment.close()" 
          style="
            padding: 5px 8px;
            font-size: 11px;
            background: rgba(100, 168, 255, 0.3);
            border: 1px solid rgba(100, 168, 255, 0.5);
            border-radius: 3px;
            color: #64a8ff;
            cursor: pointer;
            flex: 1;
            pointer-events: auto;
          "
          onmouseover="this.style.background='rgba(100, 168, 255, 0.5)'"
          onmouseout="this.style.background='rgba(100, 168, 255, 0.3)'"
        >
          go back
        </button>
      </div>
    `;
    
    this.progressText.innerHTML = content;
    // Make progress text accept pointer events for the button
    this.progressText.style.pointerEvents = 'auto';
  }
  
  // Update loop - check cursor position and dwell
  update() {
    if (!this.isRunning || !this.currentTrial) return;
    
    // Get cursor position
    const cursorX = window.state.cursorX;
    const cursorY = window.state.cursorY;
    
    // Debug: Log every 60 frames (~1 second)
    if (!this.frameCount) this.frameCount = 0;
    this.frameCount++;
    if (this.frameCount % 60 === 0) {
      const filterType = window.state.config.filterType;
      if (filterType === 'exponential') {
        const smoothing = window.state.config.exponentialSmoothingFactor;
        const alpha = 1 - smoothing;
        console.log("📊 Fitts Update (Exponential):", {
          cursor: `(${cursorX.toFixed(1)}, ${cursorY.toFixed(1)})`,
          smoothing: smoothing.toFixed(5),
          alpha: alpha.toFixed(5),
          tracking: window.state.isTracking
        });
      } else if (filterType === 'oneEuro') {
        const params = window.state.filterConfig;
        console.log("📊 Fitts Update (One Euro):", {
          cursor: `(${cursorX.toFixed(1)}, ${cursorY.toFixed(1)})`,
          minCutoff: params?.minCutoff,
          beta: params?.beta,
          tracking: window.state.isTracking
        });
      }
    }
    
    if (cursorX === null || cursorY === null) {
      if (this.frameCount % 60 === 0) {
        console.warn("Cursor position is null!");
      }
      return;
    }
    
    // Special case: waiting for home circle dwell before first trial
    if (this.waitingForHomeCircle) {
      this.handleHomeCircleDwell(cursorX, cursorY);
      return; // Don't process trial logic yet
    }
    
    // If selection has been registered, stop processing this trial
    // This prevents the dwell indicator from restarting during the transition to next trial
    if (this.selectionRegistered) {
      return;
    }
    
    // Always record cursor path with timestamps (needed for velocity-based MT analysis)
    this.cursorPath.push({
      x: cursorX,
      y: cursorY,
      t: performance.now()
    });
    
    // Check if movement has started (cursor left previous target/start point)
    if (!this.movementStartTime) {
      const distFromStart = Math.sqrt(
        Math.pow(cursorX - this.startPoint.x, 2) + Math.pow(cursorY - this.startPoint.y, 2)
      );
      
      // Movement starts when cursor exits previous target area
      if (distFromStart > this.previousTargetSize / 2) {
        this.movementStartTime = performance.now();
        console.log("Movement started from:", this.startPoint);
      }
    }
    
    // Check if cursor is over target
    const { targetSize, amplitude, direction } = this.currentTrial;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const radians = (direction * Math.PI) / 180;
    const targetX = centerX + amplitude * Math.cos(radians);
    const targetY = centerY + amplitude * Math.sin(radians);
    
    const distFromTarget = Math.sqrt(
      Math.pow(cursorX - targetX, 2) + Math.pow(cursorY - targetY, 2)
    );
    
    const isOverTarget = distFromTarget <= targetSize / 2;
    
    // Track target entry/exit events
    const now = performance.now();
    if (isOverTarget && !this.isInsideTarget) {
      this.isInsideTarget = true;
      this.targetEvents.push({ type: 'enter', x: cursorX, y: cursorY, t: now });
    } else if (!isOverTarget && this.isInsideTarget) {
      this.isInsideTarget = false;
      this.targetEvents.push({ type: 'exit', x: cursorX, y: cursorY, t: now });
    }
    
    if (isOverTarget) {
      // Start or continue dwell
      if (!this.dwellStartTime) {
        this.dwellStartTime = now;
      }
      
      const dwellProgress = (now - this.dwellStartTime) / this.config.dwellTime;
      
      // Update dwell indicator
      if (dwellProgress < 1) {
        const degrees = dwellProgress * 360;
        this.dwellIndicator.style.borderColor = `rgba(100, 255, 100, ${0.3 + dwellProgress * 0.7})`;
        this.dwellIndicator.style.backgroundImage = `conic-gradient(
          rgba(100, 255, 100, 0.6) ${degrees}deg,
          transparent ${degrees}deg
        )`;
      } else {
        // Dwell complete - register selection
        // Prevent multiple registrations
        if (!this.selectionRegistered) {
          this.selectionRegistered = true;
          this.registerSelection(cursorX, cursorY);
        }
      }
    } else {
      // Reset dwell if cursor leaves target
      if (this.dwellStartTime) {
        this.dwellStartTime = null;
        this.dwellIndicator.style.borderColor = 'transparent';
        this.dwellIndicator.style.backgroundImage = 'none';
      }
    }
  }
  
  // Handle home circle dwell before first trial starts
  handleHomeCircleDwell(cursorX, cursorY) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    // Use the same size as the visual home circle (1.3x target size)
    const layout = this.getCurrentLayout();
    const homeSize = layout ? layout.targetSize * 1.3 : 100;
    
    const distFromCenter = Math.sqrt(
      Math.pow(cursorX - centerX, 2) + Math.pow(cursorY - centerY, 2)
    );
    
    const isInHomeCircle = distFromCenter <= homeSize / 2;
    
    if (isInHomeCircle) {
      // Start or continue dwell in home circle
      if (!this.dwellStartTime) {
        this.dwellStartTime = performance.now();
        console.log("Started dwelling in home circle");
      }
      
      const dwellProgress = (performance.now() - this.dwellStartTime) / this.config.dwellTime;
      
      // Update visual feedback on home circle
      if (this.homeCircle) {
        if (dwellProgress < 1) {
          const degrees = dwellProgress * 360;
          this.homeCircle.style.background = `conic-gradient(
            rgba(100, 255, 100, 0.8) ${degrees}deg,
            rgba(100, 150, 255, 0.6) ${degrees}deg
          )`;
          this.homeCircle.style.borderColor = `rgba(100, 255, 100, ${0.6 + dwellProgress * 0.4})`;
        } else {
          // Home circle dwell complete!
          console.log("✅ Home circle dwell complete - starting Trial 1");
          this.waitingForHomeCircle = false;
          this.dwellStartTime = null;
          this.trialStartTime = performance.now(); // Now the trial officially starts
          
          // Turn home circle green like other targets
          this.homeCircle.style.background = 'rgba(100, 255, 100, 0.4)';
          this.homeCircle.style.borderColor = 'rgba(100, 255, 100, 0.7)';
          this.homeCircle.style.boxShadow = 'none';
          
          // Update target highlighting: first target yellow→red, next target gray→yellow
          this.updateTargetHighlighting();
          
          // Update progress text to remove "waiting" message
          this.updateProgressText();
        }
      }
    } else {
      // Cursor left home circle, reset dwell
      if (this.dwellStartTime) {
        this.dwellStartTime = null;
        if (this.homeCircle) {
          this.homeCircle.style.background = 'rgba(100, 150, 255, 0.6)';
          this.homeCircle.style.borderColor = 'rgba(100, 150, 255, 1)';
        }
      }
    }
  }
  
  // Compute velocity-based kinematic metrics from cursor path
  // Movement onset = first frame velocity > 5% of peak, cursor leaving start area
  // Movement offset = first frame velocity < threshold, cursor inside target, sustained for N frames
  computeKinematicMetrics() {
    const path = this.cursorPath;
    if (path.length < 10) return null;
    
    const { amplitude, direction, targetSize } = this.currentTrial;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const radians = (direction * Math.PI) / 180;
    const targetX = centerX + amplitude * Math.cos(radians);
    const targetY = centerY + amplitude * Math.sin(radians);
    const targetRadius = targetSize / 2;
    
    // Compute speed per frame (pixels/second)
    const speeds = [0];
    for (let i = 1; i < path.length; i++) {
      const dx = path[i].x - path[i - 1].x;
      const dy = path[i].y - path[i - 1].y;
      const dt = (path[i].t - path[i - 1].t) / 1000;
      if (dt <= 0) { speeds.push(0); continue; }
      speeds.push(Math.sqrt(dx * dx + dy * dy) / dt);
    }
    
    // Smooth speed with 5-frame moving average
    const smoothed = [];
    const hw = 2; // half-window
    for (let i = 0; i < speeds.length; i++) {
      const lo = Math.max(0, i - hw);
      const hi = Math.min(speeds.length, i + hw + 1);
      let sum = 0;
      for (let j = lo; j < hi; j++) sum += speeds[j];
      smoothed.push(sum / (hi - lo));
    }
    
    const peakSpeed = Math.max(...smoothed);
    if (peakSpeed === 0) return null;
    const threshold = peakSpeed * 0.05;
    
    // Find movement onset
    const startRadius = this.previousTargetSize / 2;
    let onsetIdx = null;
    for (let i = 0; i < path.length; i++) {
      const distFromStart = Math.sqrt(
        Math.pow(path[i].x - this.startPoint.x, 2) +
        Math.pow(path[i].y - this.startPoint.y, 2)
      );
      if (smoothed[i] > threshold && distFromStart > startRadius) {
        onsetIdx = i;
        break;
      }
    }
    
    // Find movement offset: sustained low-speed period inside target
    // Use the LAST re-entry that leads to successful dwell, not the first entry.
    // Search backwards from end of path to find the final stop inside the target.
    const hysteresis = 3;
    let offsetIdx = null;
    
    // Find the last target entry (the one that led to successful dwell)
    const entries = this.targetEvents.filter(e => e.type === 'enter');
    const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;
    
    if (lastEntry) {
      // Search forward from the last entry for sustained low speed
      const searchStart = path.findIndex(p => p.t >= lastEntry.t);
      if (searchStart >= 0) {
        for (let i = searchStart; i < path.length - hysteresis; i++) {
          const dist = Math.sqrt(
            Math.pow(path[i].x - targetX, 2) +
            Math.pow(path[i].y - targetY, 2)
          );
          if (dist <= targetRadius && smoothed[i] < threshold) {
            let sustained = true;
            for (let j = 1; j <= hysteresis; j++) {
              if (i + j >= smoothed.length || smoothed[i + j] >= threshold) {
                sustained = false;
                break;
              }
            }
            if (sustained) { offsetIdx = i; break; }
          }
        }
      }
      // Fallback: use the last entry position itself
      if (offsetIdx === null && searchStart >= 0) {
        offsetIdx = searchStart;
      }
    }
    
    // Final fallback: search forward from onset (no entry events available)
    if (offsetIdx === null) {
      for (let i = (onsetIdx || 0) + 1; i < path.length - hysteresis; i++) {
        const dist = Math.sqrt(
          Math.pow(path[i].x - targetX, 2) +
          Math.pow(path[i].y - targetY, 2)
        );
        if (dist <= targetRadius && smoothed[i] < threshold) {
          let sustained = true;
          for (let j = 1; j <= hysteresis; j++) {
            if (i + j >= smoothed.length || smoothed[i + j] >= threshold) {
              sustained = false;
              break;
            }
          }
          if (sustained) { offsetIdx = i; break; }
        }
      }
    }
    
    if (onsetIdx === null || offsetIdx === null) return null;
    
    return {
      movementOnsetTime: path[onsetIdx].t,
      movementOffsetTime: path[offsetIdx].t,
      kinematicMT: (path[offsetIdx].t - path[onsetIdx].t) / 1000,
      endpointX: path[offsetIdx].x,
      endpointY: path[offsetIdx].y,
      peakSpeed,
      speedThreshold: threshold
    };
  }
  
  // Register a successful selection
  registerSelection(x, y) {
    const selectionTime = performance.now();
    
    // Calculate legacy movement time (includes dwell, kept for backward compatibility)
    const movementTime = this.movementStartTime 
      ? (selectionTime - this.movementStartTime) / 1000
      : null;
    
    // Store selection point
    this.selectionPoint = { x, y };
    
    // Calculate actual amplitude (distance from start to selection)
    const actualAmplitude = Math.sqrt(
      Math.pow(x - this.startPoint.x, 2) + Math.pow(y - this.startPoint.y, 2)
    );
    
    // Get current filter and layout
    const filterType = this.getCurrentFilter();
    const layout = this.getCurrentLayout();
    
    // Calculate target center (from screen center, matching how targets are rendered)
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const targetX = centerX + this.currentTrial.amplitude * Math.cos((this.currentTrial.direction * Math.PI) / 180);
    const targetY = centerY + this.currentTrial.amplitude * Math.sin((this.currentTrial.direction * Math.PI) / 180);
    
    // Re-entry count: number of times cursor entered the target beyond the first
    const entryEvents = this.targetEvents.filter(e => e.type === 'enter');
    const reEntryCount = Math.max(0, entryEvents.length - 1);
    
    const lastEntry = entryEvents.length > 0 ? entryEvents[entryEvents.length - 1] : null;
    const firstEntry = entryEvents.length > 0 ? entryEvents[0] : null;
    
    // Velocity-based kinematic analysis (for onset detection)
    const kinematic = this.computeKinematicMetrics();
    const kinematicMT = kinematic ? kinematic.kinematicMT : null;
    
    // Endpoint = cursor position at selection (standard Fitts' Law per ISO 9241-411)
    const endpointX = x;
    const endpointY = y;
    
    // Effective amplitude: start to selection endpoint
    const effectiveAmplitude = Math.sqrt(
      Math.pow(endpointX - this.startPoint.x, 2) + Math.pow(endpointY - this.startPoint.y, 2)
    );
    
    // Entry-based MT (last entry time - movement start, kept for record)
    const entryBasedMT = (this.movementStartTime && lastEntry)
      ? (lastEntry.t - this.movementStartTime) / 1000
      : null;
    
    // PRIMARY MT: movement onset to dwell completion (includes dwell time)
    // For dwell-based selection, MT should include the time to settle and complete
    // the dwell, matching methodology of other dwell-based Fitts studies.
    const onsetTime = kinematic ? kinematic.movementOnsetTime : this.movementStartTime;
    const primaryMT = onsetTime ? (selectionTime - onsetTime) / 1000 : movementTime;
    
    // Record trial data
    const trialResult = {
      status: 'completed',
      part: this.currentPart,
      // Pair configuration
      pairIndex: this.currentTrial.pairIndex,
      pairNumber: this.currentTrial.pairNumber,
      pairVariance: this.currentTrial.pairVariance,
      pairVarianceNormPct: this.currentTrial.pairVarianceNormPct,
      pairDescription: this.currentTrial.pairDescription,
      
      // Filter configuration
      filterPhase: this.currentFilterPhase,
      filterType: filterType,
      filterRank: this.currentTrial.filterRank,
      filterVariance: this.currentTrial.filterVariance,
      filterLatency: this.currentTrial.filterLatency,
      
      // Layout and trial info
      layoutIndex: this.currentLayoutIndex,
      trialInLayout: this.currentTrialInLayout,
      globalTrialNumber: this.completedTrials + 1,
      
      // Trial parameters
      targetSize: this.currentTrial.targetSize,
      amplitude: this.currentTrial.amplitude,
      direction: this.currentTrial.direction,
      directionIndex: this.currentTrialInLayout,
      
      // Primary: MT from onset to dwell completion (includes dwell)
      movementTime: primaryMT,
      endpointX: endpointX,
      endpointY: endpointY,
      effectiveAmplitude: effectiveAmplitude,
      peakSpeed: kinematic ? kinematic.peakSpeed : null,
      startX: this.startPoint.x,
      startY: this.startPoint.y,
      targetX: targetX,
      targetY: targetY,
      
      // Secondary: kinematic MT (onset to velocity offset, dwell excluded)
      kinematicMT: kinematicMT,
      
      // Entry-based MT (for record / alternative analysis)
      entryBasedMT: entryBasedMT,
      lastEntryX: lastEntry ? lastEntry.x : null,
      lastEntryY: lastEntry ? lastEntry.y : null,
      
      // Legacy (movementStartTime to selectionTime, includes dwell)
      totalTime: movementTime,
      selectionX: x,
      selectionY: y,
      actualAmplitude: actualAmplitude,
      
      // Dwell-specific metrics
      reEntryCount: reEntryCount,
      firstEntryTime: firstEntry ? firstEntry.t : null,
      lastEntryTime: lastEntry ? lastEntry.t : null,
      targetEventCount: this.targetEvents.length,
      
      // Timestamps
      trialStartTime: this.trialStartTime,
      movementStartTime: this.movementStartTime,
      movementOnsetTime: kinematic ? kinematic.movementOnsetTime : null,
      movementOffsetTime: kinematic ? kinematic.movementOffsetTime : null,
      selectionTime: selectionTime,
      
      // Full cursor path for offline multi-dwell replay
      cursorPath: this.cursorPath.map(p => ({ x: p.x, y: p.y, t: p.t })),
      targetEvents: [...this.targetEvents]
    };
    
    this.trialData.push(trialResult);
    
    console.log("✅ Trial completed:", trialResult);
    console.log("Moving to next trial - currentTrialInLayout:", this.currentTrialInLayout, "→", this.currentTrialInLayout + 1);
    
    // Increment counters
    this.currentTrialInLayout++;
    this.completedTrials++;
    
    console.log("Updated counters - trialInLayout:", this.currentTrialInLayout, "completedTrials:", this.completedTrials);
    
    // Small delay before next trial
    setTimeout(() => {
      console.log("Calling showNextTrial()...");
      this.showNextTrial();
    }, 500);
  }
  
  // Skip current layout
  skipLayout() {
    if (!confirm("Skip this layout and move to the next one? Progress will not be saved for this layout.")) {
      return;
    }
    
    console.log(`⏭️ Skipping layout ${this.currentLayoutIndex + 1}`);
    
    // Stop any running trial
    if (this.cursorTrackingInterval) {
      clearInterval(this.cursorTrackingInterval);
      this.cursorTrackingInterval = null;
    }
    
    this.isRunning = false;
    
    // Move to next layout without saving data
    this.currentLayoutIndex++;
    this.currentTrialInLayout = 0;
    
    // Check if all layouts are complete for this filter phase
    if (this.currentLayoutIndex >= this.layouts.length) {
      this.endFilterPhase();
    } else {
      // Continue to next layout
      this.showInstructions();
    }
  }
  
  // End current layout
  endLayout() {
    console.log(`Layout ${this.currentLayoutIndex + 1}/${this.layouts.length} completed for ${this.getCurrentFilter()}`);
    
    // Move to next layout
    this.currentLayoutIndex++;
    this.currentTrialInLayout = 0;
    
    // Check if all layouts are complete for this filter phase
    if (this.currentLayoutIndex >= this.layouts.length) {
      this.endFilterPhase();
    } else {
      // Continue to next layout (brief pause)
      setTimeout(() => {
        this.showInstructions();
      }, 1000);
    }
  }
  
  async endFilterPhase() {
    this._stopConditionTimer();
    const pair = this.getCurrentPair();
    console.log(`Filter phase ${this.currentFilterPhase + 1} for Pair ${pair.pairNumber} completed (missed: ${this.conditionMissedTrials || 0})`);
    
    // Show mini questionnaire, then proceed to break/transition
    this.showMiniQuestionnaire(() => {
      if (this.currentFilterPhase === 0) {
        this.showFilterBreak();
      } else {
        if (this.currentPairIndex < this.config.varianceMatchedPairs.length - 1) {
          this.showPairTransition();
        } else {
          this.endExperiment();
        }
      }
    });
  }
  
  showMiniQuestionnaire(onComplete) {
    const pair = this.getCurrentPair();
    const filterType = this.getCurrentFilter();
    const conditionNum = (this.miniQuestionnaireResponses?.length || 0) + 1;

    const questions = [
      { id: 'easyToHit', label: 'It was very easy to hit the targets' },
      { id: 'concentration', label: 'It required a lot of concentration' },
      { id: 'control', label: 'I was able to control with my head' },
      { id: 'effort', label: 'I had to put a lot of effort' }
    ];

    const scaleHTML = (q) => `
      <div style="margin: 18px 0;">
        <label style="display: block; margin-bottom: 8px; font-weight: bold; font-size: 15px;">${q.label}</label>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 11px; color: #888;">Strongly Agree</span>
          <span style="font-size: 11px; color: #888;">Strongly Disagree</span>
        </div>
        <div style="display: flex; gap: 8px; justify-content: center;">
          ${[1,2,3,4,5].map(n => `
            <button class="scale-btn" data-question="${q.id}" data-value="${n}"
              style="width: 50px; height: 50px; border-radius: 8px; border: 2px solid #555;
              background: rgba(255,255,255,0.1); color: white; font-size: 18px; font-weight: bold;
              cursor: pointer; transition: all 0.15s;">${n}</button>
          `).join('')}
        </div>
      </div>
    `;

    this.experimentUI.innerHTML = `
      <div class="experiment-instructions" style="max-width: 520px; margin: 0 auto; padding: 30px;">
        <h2>Feedback (${conditionNum}/7)</h2>
        ${questions.map(q => scaleHTML(q)).join('')}
        <button id="mini-q-submit" class="experiment-button continue-button" disabled
          style="margin-top: 20px; opacity: 0.4; cursor: not-allowed;">
          Continue
        </button>
      </div>
    `;

    const selected = {};
    const totalQs = questions.length;

    this.experimentUI.querySelectorAll('.scale-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const qid = btn.dataset.question;
        const val = parseInt(btn.dataset.value);
        selected[qid] = val;

        this.experimentUI.querySelectorAll(`.scale-btn[data-question="${qid}"]`).forEach(b => {
          b.style.background = parseInt(b.dataset.value) === val ? '#4a90d9' : 'rgba(255,255,255,0.1)';
          b.style.borderColor = parseInt(b.dataset.value) === val ? '#4a90d9' : '#555';
        });

        if (Object.keys(selected).length === totalQs) {
          const submitBtn = document.getElementById('mini-q-submit');
          submitBtn.disabled = false;
          submitBtn.style.opacity = '1';
          submitBtn.style.cursor = 'pointer';
        }
      });
    });

    document.getElementById('mini-q-submit').addEventListener('click', () => {
      this.miniQuestionnaireResponses.push({
        part: this.currentPart,
        pairNumber: pair.pairNumber,
        pairVariance: pair.variance,
        filterType: filterType,
        filterPhase: this.currentFilterPhase,
        easyToHit: selected.easyToHit,
        concentration: selected.concentration,
        control: selected.control,
        effort: selected.effort,
        timestamp: Date.now()
      });
      console.log('📝 Questionnaire:', selected);
      onComplete();
    });
  }

  // Show NASA-TLX questionnaire (called after each part)
  showNASATLX(partLabel, onComplete) {
    const scales = [
      { id: 'mental',     label: 'Mental Demand',   low: 'Very Low', high: 'Very High',
        desc: 'How mentally demanding was the task?' },
      { id: 'physical',   label: 'Physical Demand',  low: 'Very Low', high: 'Very High',
        desc: 'How physically demanding was the task?' },
      { id: 'temporal',   label: 'Temporal Demand',   low: 'Very Low', high: 'Very High',
        desc: 'How hurried or rushed was the pace of the task?' },
      { id: 'performance', label: 'Performance',      low: 'Perfect', high: 'Failure',
        desc: 'How successful were you in accomplishing the task?' },
      { id: 'effort',     label: 'Effort',            low: 'Very Low', high: 'Very High',
        desc: 'How hard did you have to work to accomplish your level of performance?' },
      { id: 'frustration', label: 'Frustration',      low: 'Very Low', high: 'Very High',
        desc: 'How insecure, discouraged, or irritated did you feel?' }
    ];

    this.experimentUI.innerHTML = `
      <div class="experiment-instructions" style="max-width: 600px; margin: 0 auto;">
        <h2>${partLabel} — Experience (NASA-TLX)</h2>
        <p style="margin-bottom: 15px; opacity: 0.8;">Please rate your experience for the section you just completed.</p>
        
        ${scales.map(s => `
          <div style="margin: 16px 0; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px;">
            <label style="display: block; font-weight: bold; margin-bottom: 2px;">${s.label}</label>
            <div style="font-size: 12px; opacity: 0.7; margin-bottom: 8px;">${s.desc}</div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-size: 11px; opacity: 0.7;">${s.low}</span>
              <span style="font-size: 11px; opacity: 0.7;">${s.high}</span>
            </div>
            <input type="range" id="tlx-${s.id}" min="1" max="21" value="11" class="tlx-slider"
              style="width: 100%; accent-color: #4a90d9;">
            <div style="text-align: center; font-size: 14px; font-weight: bold;" id="tlx-${s.id}-val">11</div>
          </div>
        `).join('')}

        <div style="margin: 16px 0;">
          <label style="display: block; font-weight: bold; margin-bottom: 6px;">Comments (optional)</label>
          <textarea id="tlx-comments" rows="3" placeholder="Any additional feedback about your experience..."
            style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #555;
            background: rgba(255,255,255,0.1); color: white; font-size: 13px; resize: vertical;
            box-sizing: border-box;"></textarea>
        </div>

        <button id="tlx-submit" class="experiment-button continue-button" style="margin-top: 10px;">
          Submit &amp; Continue
        </button>
      </div>
    `;

    // Live value display for sliders
    this.experimentUI.querySelectorAll('.tlx-slider').forEach(slider => {
      slider.addEventListener('input', () => {
        document.getElementById(`${slider.id}-val`).textContent = slider.value;
      });
    });

    document.getElementById('tlx-submit').addEventListener('click', () => {
      const response = {
        part: partLabel,
        participantId: this.participantId || '',
        timestamp: Date.now()
      };
      scales.forEach(s => {
        response[s.id] = parseInt(document.getElementById(`tlx-${s.id}`).value);
      });
      response.comments = document.getElementById('tlx-comments').value.trim();
      this.nasaTLXResponses.push(response);
      console.log(`📝 NASA-TLX (${partLabel}):`, response);
      onComplete();
    });
  }

  // Show 1-minute break between filter phases within a pair
  showFilterBreak() {
    this.breakTimeRemaining = this.config.breakDuration;
    const pair = this.getCurrentPair();
    const completedFilter = this.getCurrentFilter();
    const completedFilterName = completedFilter === 'exponential' ? 'Exponential Smoothing' : 'One Euro Filter';
    const completedConfig = completedFilter === 'exponential' ? pair.exponential : pair.oneEuro;
    const nextFilter = completedFilter === 'exponential' ? 'oneEuro' : 'exponential';
    const nextFilterName = nextFilter === 'exponential' ? 'Exponential Smoothing' : 'One Euro Filter';
    const nextConfig = nextFilter === 'exponential' ? pair.exponential : pair.oneEuro;
    
    this.experimentUI.innerHTML = `
      <div class="experiment-instructions" style="text-align: center; padding: 30px;">
        <h2>Phase Complete!</h2>
        <p style="color: #aaa; font-size: 16px; margin: 10px 0;">
          ${this.completedTrials} / ${this.totalTrials} trials done
        </p>

        <h3 style="margin-top: 25px;">Break</h3>
        <div style="font-size: 48px; font-weight: bold; color: #64ff64; margin: 15px 0;" id="break-timer">
          ${this.formatTime(this.breakTimeRemaining)}
        </div>
        <p style="color: #888; font-size: 14px;">Relax your neck and eyes. Next filter starts automatically.</p>

        <button class="experiment-button continue-button" onclick="window.fittsExperiment.skipBreak()" style="margin-top: 20px;">
          Skip Break (or press Space)
        </button>
      </div>
    `;
    
    // Start countdown
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
  
  // Format time as MM:SS
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  // Skip break
  skipBreak() {
    if (this.breakInterval) {
      clearInterval(this.breakInterval);
      this.breakInterval = null;
    }
    this.continueToNextFilterPhase();
  }
  
  // Continue to next filter phase (within same pair)
  async continueToNextFilterPhase() {
    const pair = this.getCurrentPair();
    
    // Move to second filter phase within same pair
    this.currentFilterPhase = 1;
    this.currentLayoutIndex = 0;
    this.currentTrialInLayout = 0;
    
    const nextFilter = this.getCurrentFilter(); // now returns the second filter
    const filterConfig = nextFilter === 'exponential' ? pair.exponential : pair.oneEuro;
    
    console.log(`🔄 Continuing to ${nextFilter} (Rank ${filterConfig.rank}) for Pair ${pair.pairNumber}`);
    await this.setFilter(nextFilter, filterConfig);
    
    // Update phase indicator
    console.log("Updating phase indicator...");
    this.addExperimentPhaseIndicator();
    
    // Verify the configuration rank slider is visible
    setTimeout(() => {
      const paretoSelector = document.querySelector('.pareto-front-selector');
      if (paretoSelector) {
        console.log("✅ Configuration rank slider is visible!");
      } else {
        console.error("❌ Configuration rank slider NOT visible - React may not have re-rendered");
        console.log("Attempting forced re-render...");
        if (window.trackingControlsRoot && window.TrackingControls) {
          window.trackingControlsRoot.render(React.createElement(window.TrackingControls));
        }
      }
    }, 500);
    
    // Ensure cursor is still visible
    this.ensureCursorVisible();
    
    // Show instructions for first layout with One Euro
    this.showInstructions();
  }
  
  // Show transition screen between pairs
  showPairTransition() {
    const completedPair = this.getCurrentPair();
    const nextPairIndex = this.currentPairIndex + 1;
    const nextPair = this.config.varianceMatchedPairs[nextPairIndex];
    
    this.breakTimeRemaining = this.config.breakDuration;
    
    this.experimentUI.innerHTML = `
      <div class="experiment-instructions" style="text-align: center; padding: 30px;">
        <h2>Pair ${completedPair.pairNumber} Complete!</h2>
        <p style="color: #aaa; font-size: 16px; margin: 10px 0;">
          ${this.completedTrials} / ${this.totalTrials} trials done
        </p>

        <h3 style="margin-top: 25px;">Break</h3>
        <div style="font-size: 48px; font-weight: bold; color: #64ff64; margin: 15px 0;" id="break-timer">
          ${this.formatTime(this.breakTimeRemaining)}
        </div>
        <p style="color: #888; font-size: 14px;">Relax your neck and eyes. Next pair starts automatically.</p>

        <button class="experiment-button continue-button" onclick="window.fittsExperiment.skipPairBreak()" style="margin-top: 20px;">
          Skip Break (or press Space)
        </button>
      </div>
    `;
    
    // Start countdown
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
  
  // Skip pair transition break
  skipPairBreak() {
    if (this.breakInterval) {
      clearInterval(this.breakInterval);
      this.breakInterval = null;
    }
    this.continueToNextPair();
  }
  
  // Continue to next pair
  async continueToNextPair() {
    console.log(`🔄 Moving to Pair ${this.currentPairIndex + 2}`);
    
    // Move to next pair, reset to first filter phase
    this.currentPairIndex++;
    this.currentFilterPhase = 0;
    this.currentLayoutIndex = 0;
    this.currentTrialInLayout = 0;
    
    const pair = this.getCurrentPair();
    const firstFilter = this.getCurrentFilter(); // respects counterbalancing
    const filterConfig = firstFilter === 'exponential' ? pair.exponential : pair.oneEuro;
    
    console.log(`Setting filter to ${firstFilter} Rank ${filterConfig.rank}...`);
    await this.setFilter(firstFilter, filterConfig);
    
    // Update phase indicator
    this.addExperimentPhaseIndicator();
    
    // Ensure cursor is still visible
    this.ensureCursorVisible();
    
    // Show instructions for first layout
    this.showInstructions();
  }
  
  
  // End current part of the experiment
  endExperiment() {
    console.log(`${this.currentPart} completed!`);
    
    // Stop update loop
    if (this.cursorTrackingInterval) {
      clearInterval(this.cursorTrackingInterval);
      this.cursorTrackingInterval = null;
    }
    
    this.isRunning = false;
    
    const isFirstPartDone = !this.partACompleted && !this.partBCompleted;
    if (this.currentPart === 'Part A') this.partACompleted = true;
    else this.partBCompleted = true;

    // Skip NASA-TLX — professor only wants the 4-question feedback after each condition
    if (isFirstPartDone) {
      this.showCalibrationSwapScreen();
    } else {
      this.calculateResults();
    }
  }

  // Show screen to swap calibration between Part A and Part B
  showCalibrationSwapScreen() {
    const nextPart = this.currentPart === 'Part A' ? 'Part B' : 'Part A';
    const nextCalibLabel = nextPart === 'Part B'
      ? 'Standard Calibration (provided by experimenter)'
      : 'Personal Calibration (your own)';
    let currentCalib = window.state?.calibrationSource || 'Current calibration';

    this.breakTimeRemaining = this.config.breakDuration;

    this.experimentUI.innerHTML = `
      <div class="experiment-instructions" style="text-align: center; padding: 30px; max-width: 500px; margin: 0 auto;">
        <h2>${this.currentPart} Complete!</h2>
        <p style="color: #aaa; font-size: 16px;">${this.completedTrials} trials done</p>

        <div style="font-size: 48px; font-weight: bold; color: #64ff64; margin: 20px 0;" id="part-break-timer">
          ${this.formatTime(this.breakTimeRemaining)}
        </div>
        <p style="color: #888; font-size: 14px;">Relax your neck and eyes</p>

        <div style="background: rgba(255, 200, 100, 0.1); padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="font-size: 14px; color: #ffc864; margin: 0 0 10px;">
            ${nextPart} requires: ${nextCalibLabel}
          </p>
          <p style="font-size: 12px; color: #aaa; margin: 0 0 10px;">
            Current: <span id="swap-calib-name" style="color: #64c8ff;">${currentCalib}</span>
          </p>
          <button id="upload-swap-calib-btn" style="
            padding: 8px 16px; font-size: 13px;
            background: rgba(255, 200, 100, 0.3); border: 1px solid rgba(255, 200, 100, 0.5);
            border-radius: 5px; color: #ffc864; cursor: pointer;
          ">Upload Calibration File</button>
          <input type="file" id="swap-calib-input" accept=".csv,.json" style="display: none;">
        </div>

        <button id="start-next-part-btn" class="experiment-button continue-button">
          Start ${nextPart} (or press Space)
        </button>
      </div>
    `;

    // Break countdown
    this.breakInterval = setInterval(() => {
      this.breakTimeRemaining--;
      const el = document.getElementById('part-break-timer');
      if (el) el.textContent = this.formatTime(this.breakTimeRemaining);
      if (this.breakTimeRemaining <= 0) {
        clearInterval(this.breakInterval);
        this.breakInterval = null;
      }
    }, 1000);

    // Calibration upload
    const fileInput = document.getElementById('swap-calib-input');
    document.getElementById('upload-swap-calib-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file || !window.handleCalibrationUpload) return;
      document.getElementById('swap-calib-name').textContent = `Loading: ${file.name}...`;
      window.handleCalibrationUpload(file);
      setTimeout(() => {
        currentCalib = window.state?.calibrationSource || file.name;
        const nameEl = document.getElementById('swap-calib-name');
        if (nameEl) {
          nameEl.textContent = `✅ ${currentCalib}`;
          nameEl.style.color = '#64ff64';
        }
        this.hideNonEssentialControls();
      }, 2000);
    });

    // Start next part
    document.getElementById('start-next-part-btn').addEventListener('click', () => {
      if (this.breakInterval) {
        clearInterval(this.breakInterval);
        this.breakInterval = null;
      }
      this.startNextPart(nextPart);
    });
  }

  // Start the next part (Part B or Part A, depending on counterbalancing)
  async startNextPart(partLabel) {
    this.currentPart = partLabel;
    this.isRunning = true;

    if (partLabel === 'Part B') {
      const mediumPair = this.allVarianceMatchedPairs[1];
      this.config.varianceMatchedPairs = [mediumPair];
      console.log(`🔬 Part B: Using medium variance pair only (variance ~${mediumPair.variance})`);
    } else {
      this.config.varianceMatchedPairs = this.partAVariancePairs;
    }

    // Reset trial state for new part
    this.currentPairIndex = 0;
    this.currentLayoutIndex = 0;
    this.currentFilterPhase = 0;
    this.currentTrialInLayout = 0;

    // Recalculate total trials for this part
    const partTrials = this.config.varianceMatchedPairs.length * 2 * this.layouts.length * this.config.trialsPerLayout;
    this.totalTrials = this.completedTrials + partTrials;

    console.log(`🚀 Starting ${partLabel}: ${partTrials} trials`);

    // Save calibration info for this part
    this.calibrationInfo[partLabel] = window.state?.calibrationSource || 'Session calibration';

    // Re-create UI (calibration upload via startTracking() may have disrupted it)
    this.createUI();
    this.hideNonEssentialControls();
    this.addExperimentPhaseIndicator();

    // Re-apply configuration for new calibration
    await this.applyConfiguration();

    // Run variance measurement for new calibration
    await this.measureVarianceForAllConfigurations();
    
    // After variance measurement, "Continue to Experiment" button calls continueToExperimentStart()
  }
  
  // Calculate performance metrics
  calculateResults() {
    console.log("Calculating experiment results...");
    
    // Group trials by pair, filter, and layout
    const resultsByPair = {};
    
    for (const trial of this.trialData) {
      // Skip trials with no usable data
      if (trial.status === 'timeout_not_attempted' || trial.type === 'condition_timeout') continue;

      const pairKey = `${trial.part || 'Part A'}_pair${trial.pairNumber}`;

      if (!resultsByPair[pairKey]) {
        resultsByPair[pairKey] = {
          part: trial.part || 'Part A',
          pairNumber: trial.pairNumber,
          pairVariance: trial.pairVariance,
          pairVarianceNormPct: trial.pairVarianceNormPct,
          pairDescription: trial.pairDescription,
          filters: {}
        };
      }
      
      const filterKey = `${trial.filterType}_rank${trial.filterRank}`;
      
      if (!resultsByPair[pairKey].filters[filterKey]) {
        resultsByPair[pairKey].filters[filterKey] = {
          filterType: trial.filterType,
          filterRank: trial.filterRank,
          filterVariance: trial.filterVariance,
          filterLatency: trial.filterLatency,
          layouts: {}
        };
      }
      
      // Group by layout (size × amplitude)
      const layoutKey = `${trial.targetSize}-${trial.amplitude}`;
      
      if (!resultsByPair[pairKey].filters[filterKey].layouts[layoutKey]) {
        resultsByPair[pairKey].filters[filterKey].layouts[layoutKey] = {
          targetSize: trial.targetSize,
          amplitude: trial.amplitude,
          trials: []
        };
      }
      
      resultsByPair[pairKey].filters[filterKey].layouts[layoutKey].trials.push(trial);
    }
    
    // Calculate metrics for each pair/filter/layout combination
    const results = [];
    
    for (const pairKey in resultsByPair) {
      const pairData = resultsByPair[pairKey];
      
      for (const filterKey in pairData.filters) {
        const filterData = pairData.filters[filterKey];
        
        for (const layoutKey in filterData.layouts) {
          const layout = filterData.layouts[layoutKey];
          const trials = layout.trials;
        
        // Only trials with endpoint data contribute to spatial metrics (We, Ae, IDe)
        const trialsWithEndpoints = trials.filter(t => t.endpointX != null && t.endpointY != null);
        const completedTrials = trials.filter(t => t.status === 'completed');

        // MT from completed trials only (timeout_in_progress has partial MT, not comparable)
        const movementTimes = completedTrials.map(t => t.movementTime).filter(mt => mt !== null);
        const meanMT = movementTimes.length > 0
          ? movementTimes.reduce((a, b) => a + b, 0) / movementTimes.length : NaN;

        // Effective amplitude: from all trials with endpoints (includes in-progress)
        const effectiveAmplitudes = trialsWithEndpoints.map(t => t.effectiveAmplitude).filter(a => a != null);
        const Ae = effectiveAmplitudes.length > 0
          ? effectiveAmplitudes.reduce((a, b) => a + b, 0) / effectiveAmplitudes.length : NaN;

        // Effective width: endpoint spread includes in-progress trials per research recommendation
        const projections = trialsWithEndpoints.map(t => {
          const thetaRad = t.direction * Math.PI / 180;
          const dx = t.endpointX - t.targetX;
          const dy = t.endpointY - t.targetY;
          return dx * Math.cos(thetaRad) + dy * Math.sin(thetaRad);
        });
        const meanProjection = projections.reduce((a, b) => a + b, 0) / projections.length;
        const projVariance = projections.reduce((sum, p) => sum + Math.pow(p - meanProjection, 2), 0) / (projections.length - 1);
        const SDx = Math.sqrt(projVariance);
        const We = 4.133 * SDx;
        
        // Effective index of difficulty (Shannon formulation)
        const IDe = Math.log2((Ae / We) + 1);
        
          // Throughput
          const TP = IDe / meanMT;
          
          const meanReEntries = completedTrials.length > 0
            ? completedTrials.reduce((sum, t) => sum + (t.reEntryCount || 0), 0) / completedTrials.length : 0;

          const nCompleted = completedTrials.length;
          const nInProgress = trials.filter(t => t.status === 'timeout_in_progress').length;
          const nNotAttempted = trials.filter(t => t.status === 'timeout_not_attempted').length;
          const nTotal = nCompleted + nInProgress + nNotAttempted;
          const completionRate = nTotal > 0 ? nCompleted / nTotal : 1;

          results.push({
            part: pairData.part,
            pairNumber: pairData.pairNumber,
            pairVariance: pairData.pairVariance,
            pairVarianceNormPct: pairData.pairVarianceNormPct,
            pairDescription: pairData.pairDescription,
            filterType: filterData.filterType,
            filterRank: filterData.filterRank,
            filterVariance: filterData.filterVariance,
            filterLatency: filterData.filterLatency,
            layout: {
              targetSize: layout.targetSize,
              amplitude: layout.amplitude
            },
            metrics: {
              n: nCompleted,
              nTotal: nTotal,
              nTimedOutInProgress: nInProgress,
              nTimedOutNotAttempted: nNotAttempted,
              completionRate: completionRate,
              meanMT: meanMT,
              Ae: Ae,
              We: We,
              IDe: IDe,
              TP: TP,
              meanReEntries: meanReEntries
            }
          });
        }
      }
    }
    
    // Display results
    this.displayResults(results);
    
    // Prepare data for download (user will click button to download)
    this.prepareExportData(results);
  }
  
  // Display results screen
  displayResults(results) {
    // Calculate average throughput by pair and filter
    const pairAverages = {};
    
    for (const result of results) {
      const pairKey = `pair${result.pairNumber}`;
      
      if (!pairAverages[pairKey]) {
        pairAverages[pairKey] = {
          pairNumber: result.pairNumber,
          pairVariance: result.pairVariance,
          pairDescription: result.pairDescription,
          filters: {}
        };
      }
      
      const filterKey = `${result.filterType}_rank${result.filterRank}`;
      
      if (!pairAverages[pairKey].filters[filterKey]) {
        pairAverages[pairKey].filters[filterKey] = {
          filterType: result.filterType,
          filterRank: result.filterRank,
          filterVariance: result.filterVariance,
          filterLatency: result.filterLatency,
          throughputs: [],
          movementTimes: []
        };
      }
      
      pairAverages[pairKey].filters[filterKey].throughputs.push(result.metrics.TP);
      pairAverages[pairKey].filters[filterKey].movementTimes.push(result.metrics.meanMT);
    }
    
    let summaryHTML = '<div class="results-summary">';
    
    // Display results by pair
    for (let pairNum = 1; pairNum <= 3; pairNum++) {
      const pairKey = `pair${pairNum}`;
      const pairData = pairAverages[pairKey];
      
      if (!pairData) continue;
      
      summaryHTML += `
        <div style="background: rgba(255, 200, 100, 0.15); padding: 10px; border-radius: 5px; margin: 10px 0; border-left: 3px solid #ffc864;">
          <h4 style="color: #ffc864; margin-bottom: 5px;">Pair ${pairData.pairNumber}: Variance ~${Number(pairData.pairVariance).toFixed(1)}</h4>
          <p style="font-size: 10px; color: #aaa; margin-bottom: 8px;">${pairData.pairDescription}</p>
      `;
      
      // Display each filter in the pair
      for (const filterKey in pairData.filters) {
        const filterData = pairData.filters[filterKey];
        const avgTP = filterData.throughputs.reduce((a, b) => a + b, 0) / filterData.throughputs.length;
        const avgMT = filterData.movementTimes.reduce((a, b) => a + b, 0) / filterData.movementTimes.length;
        
        const displayName = filterData.filterType === "oneEuro" ? "One Euro Filter" : "Exponential Smoothing";
        
        summaryHTML += `
          <div class="config-result" style="margin: 5px 0; font-size: 11px;">
            <h4 style="font-size: 12px;">${displayName} (Rank ${filterData.filterRank})</h4>
            <p>Throughput: <strong>${avgTP.toFixed(3)} bits/s</strong></p>
            <p>Movement Time: <strong>${avgMT.toFixed(3)} s</strong></p>
            <p style="font-size: 9px; color: #888;">Var: ${filterData.filterVariance.toFixed(2)} | Latency: ${filterData.filterLatency.toFixed(1)}ms</p>
          </div>
        `;
      }
      
      summaryHTML += `</div>`;
    }
    
    summaryHTML += '</div>';
    
    // Add pair-wise comparisons
    let comparisonHTML = '<div class="comparison-result"><h3>Pair Comparisons</h3>';
    
    for (let pairNum = 1; pairNum <= 3; pairNum++) {
      const pairKey = `pair${pairNum}`;
      const pairData = pairAverages[pairKey];
      
      if (!pairData) continue;
      
      // Find exponential and oneEuro results
      let exponentialData = null;
      let oneEuroData = null;
      
      for (const filterKey in pairData.filters) {
        const filterData = pairData.filters[filterKey];
        if (filterData.filterType === 'exponential') {
          exponentialData = filterData;
        } else if (filterData.filterType === 'oneEuro') {
          oneEuroData = filterData;
        }
      }
      
      if (exponentialData && oneEuroData) {
        const expTP = exponentialData.throughputs.reduce((a, b) => a + b, 0) / exponentialData.throughputs.length;
        const oneTP = oneEuroData.throughputs.reduce((a, b) => a + b, 0) / oneEuroData.throughputs.length;
        const diff = ((oneTP - expTP) / expTP * 100);
        const better = diff > 0 ? "One Euro" : "Exponential";
        
        comparisonHTML += `
          <p style="margin: 5px 0; font-size: 11px;">
            <strong>Pair ${pairNum} (Var ~${pairData.pairVariance}):</strong> 
            ${better} performed better by <strong>${Math.abs(diff).toFixed(1)}%</strong>
          </p>
        `;
      }
    }
    
    comparisonHTML += '</div>';
    
    // Log detailed results to console
    console.log('Experiment results summary:', summaryHTML);
    console.log('Experiment comparison:', comparisonHTML);

    this.experimentUI.innerHTML = `
      <div class="experiment-instructions" style="text-align: center; padding: 40px;">
        <h2>Experiment Complete! 🎉</h2>
        <p style="color: #aaa; font-size: 18px; margin: 15px 0 30px;">Thank you for participating!</p>
        
        ${this.partACompleted ? `
        <button class="experiment-button" onclick="window.fittsExperiment.downloadPartZip('Part A')" style="
          background: linear-gradient(135deg, #22cc66, #118844);
          margin-bottom: 10px; padding: 14px 30px; font-size: 16px;
        ">
          📦 Download Part A Results (.zip)
        </button>` : ''}
        
        ${this.partBCompleted ? `
        <button class="experiment-button" onclick="window.fittsExperiment.downloadPartZip('Part B')" style="
          background: linear-gradient(135deg, #22cc66, #118844);
          margin-bottom: 10px; padding: 14px 30px; font-size: 16px;
        ">
          📦 Download Part B Results (.zip)
        </button>` : ''}
        
        <button class="experiment-button" onclick="window.fittsExperiment.close()" style="
          background: linear-gradient(135deg, #666, #444); margin-top: 10px;
        ">
          Close
        </button>
      </div>
    `;
  }
  
  // Prepare export data (called when experiment ends, but doesn't download yet)
  prepareExportData(results) {
    this._exportTimestamp = new Date().toISOString();
    this._exportResults = results;
  }

  // Download results for a specific part as a ZIP file
  async downloadPartZip(partLabel) {
    const timestamp = this._exportTimestamp;
    const calibType = partLabel === 'Part A' ? 'personal-calibration' : 'standard-calibration';
    const calibSource = this.calibrationInfo[partLabel] || 'unknown';

    // Filter data for this part
    const partTrials = this.trialData.filter(t => t.part === partLabel);
    const partResults = this._exportResults.filter(r => r.part === partLabel);
    const partVariance = this.varianceMeasurementResults.filter(v => v.part === partLabel);
    const partMiniQ = this.miniQuestionnaireResponses.filter(q => q.part === partLabel);
    const partTLX = this.nasaTLXResponses.filter(r => r.part === partLabel);

    const zip = new JSZip();

    // Metadata file
    zip.file('info.txt', [
      `Part: ${partLabel}`,
      `Calibration Type: ${partLabel === 'Part A' ? 'Personal' : 'Standard'}`,
      `Calibration Source: ${calibSource}`,
      `Participant: ${this.participantId || 'unknown'}`,
      `Filter Order: ${this.counterbalanceCondition?.filterFirst || 'exponential'} first`,
      `Variance Order: ${this.counterbalanceCondition?.varianceOrderLabel || 'default'}`,
      `Trials Completed: ${partTrials.filter(t => t.status !== 'timeout_missed').length}`,
      `Trials Missed (timeout): ${partTrials.filter(t => t.status === 'timeout_missed').length}`,
      `Timestamp: ${timestamp}`
    ].join('\n'));

    zip.file(`fitts-results-${timestamp}.csv`, this.generateResultsCSV(partResults));
    zip.file(`fitts-raw-data-${timestamp}.csv`, this.generateRawDataCSV(partTrials));

    const cb = this.counterbalanceCondition;
    const pathData = partTrials.map(t => ({
      participantId: this.participantId || '',
      part: t.part || '',
      filterOrder: cb?.filterFirst || '',
      varianceOrder: cb?.varianceOrderLabel || '',
      globalTrialNumber: t.globalTrialNumber,
      pairNumber: t.pairNumber,
      filterType: t.filterType,
      filterRank: t.filterRank,
      targetSize: t.targetSize,
      amplitude: t.amplitude,
      direction: t.direction,
      startX: t.startX,
      startY: t.startY,
      targetX: t.targetX,
      targetY: t.targetY,
      cursorPath: t.cursorPath || [],
      targetEvents: t.targetEvents || []
    }));
    zip.file(`fitts-cursor-paths-${timestamp}.json`, JSON.stringify(pathData));

    if (partVariance.length > 0) {
      zip.file(`fitts-variance-measurement-${timestamp}.csv`,
        this.generateVarianceMeasurementCSV(partVariance));
    }

    if (partMiniQ.length > 0) {
      zip.file(`fitts-mini-questionnaire-${timestamp}.csv`,
        this.generateMiniQuestionnaireCSVFromData(partMiniQ));
    }

    if (partTLX.length > 0) {
      zip.file(`fitts-nasa-tlx-${timestamp}.csv`,
        this.generateNASATLXCSVFromData(partTLX));
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitts-${calibType}-${this.participantId || 'unknown'}-${timestamp}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  // Generate mini questionnaire CSV
  generateMiniQuestionnaireCSV() {
    return this.generateMiniQuestionnaireCSVFromData(this.miniQuestionnaireResponses);
  }

  generateMiniQuestionnaireCSVFromData(data) {
    const headers = [
      'ParticipantID', 'Part', 'PairNumber', 'PairVariance', 'FilterType', 'FilterPhase',
      'EasyToHit', 'Concentration', 'Control', 'Effort', 'Timestamp'
    ];
    let csv = headers.join(',') + '\n';
    for (const r of data) {
      csv += [
        this.participantId || '', r.part || '', r.pairNumber, r.pairVariance,
        r.filterType, r.filterPhase,
        r.easyToHit, r.concentration, r.control, r.effort,
        r.timestamp
      ].join(',') + '\n';
    }
    return csv;
  }

  // Generate NASA-TLX CSV
  generateNASATLXCSV() {
    return this.generateNASATLXCSVFromData(this.nasaTLXResponses);
  }

  generateNASATLXCSVFromData(data) {
    const headers = [
      'ParticipantID', 'Part', 'Mental', 'Physical', 'Temporal',
      'Performance', 'Effort', 'Frustration', 'Comments', 'Timestamp'
    ];
    let csv = headers.join(',') + '\n';
    for (const r of data) {
      csv += [
        this.participantId || '', r.part, r.mental, r.physical, r.temporal,
        r.performance, r.effort, r.frustration,
        `"${(r.comments || '').replace(/"/g, '""')}"`, r.timestamp
      ].join(',') + '\n';
    }
    return csv;
  }

  // Generate results CSV
  generateResultsCSV(results) {
    const headers = [
      'ParticipantID', 'Part', 'FilterOrder', 'VarianceOrder',
      'PairNumber', 'PairVariance_px', 'PairVariance_pct', 'PairDescription',
      'FilterType', 'FilterRank', 'FilterVariance_px', 'FilterLatency',
      'TargetSize', 'Amplitude',
      'NCompleted', 'NTotal', 'NTimedOutInProgress', 'NTimedOutNotAttempted', 'CompletionRate',
      'MeanMT', 'Ae', 'We', 'IDe', 'TP', 'MeanReEntries'
    ];

    let csv = headers.join(',') + '\n';

    const cb = this.counterbalanceCondition;
    for (const result of results) {
      const m = result.metrics;
      const fmtNum = (v) => (v != null && !isNaN(v)) ? v.toFixed(4) : '';
      const row = [
        this.participantId || '',
        result.part || '',
        cb?.filterFirst || '',
        cb?.varianceOrderLabel || '',
        result.pairNumber,
        result.pairVariance,
        result.pairVarianceNormPct != null ? result.pairVarianceNormPct.toFixed(4) : '',
        `"${result.pairDescription}"`,
        result.filterType,
        result.filterRank,
        result.filterVariance.toFixed(4),
        result.filterLatency.toFixed(2),
        result.layout.targetSize,
        result.layout.amplitude,
        m.n,
        m.nTotal,
        m.nTimedOutInProgress || 0,
        m.nTimedOutNotAttempted || 0,
        (m.completionRate != null ? m.completionRate.toFixed(4) : '1.0000'),
        fmtNum(m.meanMT),
        fmtNum(m.Ae),
        fmtNum(m.We),
        fmtNum(m.IDe),
        fmtNum(m.TP),
        (m.meanReEntries || 0).toFixed(2)
      ];
      
      csv += row.join(',') + '\n';
    }
    
    return csv;
  }
  
  // Generate raw data CSV
  generateRawDataCSV(trialData) {
    const headers = [
      'ParticipantID', 'Part', 'FilterOrder', 'VarianceOrder',
      'Status',
      'GlobalTrialNumber', 'PairNumber', 'PairVariance_px', 'PairVariance_pct', 'PairDescription',
      'FilterPhase', 'FilterType', 'FilterRank', 'FilterVariance_px', 'FilterLatency',
      'LayoutIndex', 'TrialInLayout',
      'TargetSize', 'Amplitude', 'Direction', 'DirectionIndex',
      'MovementTime', 'KinematicMT', 'EntryBasedMT', 'TotalTime',
      'EffectiveAmplitude', 'ActualAmplitude',
      'StartX', 'StartY', 'EndpointX', 'EndpointY',
      'LastEntryX', 'LastEntryY', 'SelectionX', 'SelectionY', 'TargetX', 'TargetY',
      'ReEntryCount', 'PeakSpeed',
      'TrialStartTime', 'MovementStartTime', 'MovementOnsetTime', 'MovementOffsetTime',
      'FirstEntryTime', 'LastEntryTime', 'SelectionTime'
    ];

    let csv = headers.join(',') + '\n';

    const cb = this.counterbalanceCondition;
    for (const trial of trialData) {
      // Skip legacy summary-only timeout entries (old format)
      if (trial.type === 'condition_timeout') continue;

      const fmt = (v, d = 2) => v != null ? Number(v).toFixed(d) : '';
      const row = [
        this.participantId || '',
        trial.part || '',
        cb?.filterFirst || '',
        cb?.varianceOrderLabel || '',
        trial.status || 'completed',
        trial.globalTrialNumber ?? '',
        trial.pairNumber,
        trial.pairVariance,
        trial.pairVarianceNormPct != null ? trial.pairVarianceNormPct.toFixed(4) : '',
        `"${trial.pairDescription || ''}"`,
        trial.filterPhase,
        trial.filterType,
        trial.filterRank,
        fmt(trial.filterVariance, 4),
        fmt(trial.filterLatency, 2),
        trial.layoutIndex,
        trial.trialInLayout,
        trial.targetSize,
        trial.amplitude,
        trial.direction,
        trial.directionIndex,
        fmt(trial.movementTime, 4),
        fmt(trial.kinematicMT, 4),
        fmt(trial.entryBasedMT, 4),
        fmt(trial.totalTime, 4),
        fmt(trial.effectiveAmplitude),
        fmt(trial.actualAmplitude),
        fmt(trial.startX),
        fmt(trial.startY),
        fmt(trial.endpointX),
        fmt(trial.endpointY),
        fmt(trial.lastEntryX),
        fmt(trial.lastEntryY),
        fmt(trial.selectionX),
        fmt(trial.selectionY),
        fmt(trial.targetX),
        fmt(trial.targetY),
        trial.reEntryCount ?? '',
        fmt(trial.peakSpeed, 1),
        fmt(trial.trialStartTime),
        fmt(trial.movementStartTime),
        fmt(trial.movementOnsetTime),
        fmt(trial.movementOffsetTime),
        fmt(trial.firstEntryTime),
        fmt(trial.lastEntryTime),
        fmt(trial.selectionTime)
      ];
      
      csv += row.join(',') + '\n';
    }
    
    return csv;
  }
  
  // Generate variance measurement CSV
  generateVarianceMeasurementCSV(varianceData) {
    const headers = [
      'ParticipantID', 'Part', 'FilterOrder', 'VarianceOrder',
      'PairNumber', 'FilterType', 'FilterRank',
      'ExpectedVariance_px', 'MeasuredVariance_px', 'Difference_px', 'DifferencePercent',
      'ExpectedVariance_pct', 'MeasuredVariance_pct',
      'StdDevX_px', 'StdDevY_px', 'NumSamples',
      'ScreenWidth', 'ScreenHeight', 'LimitingDimension'
    ];
    
    let csv = headers.join(',') + '\n';
    
    const cb = this.counterbalanceCondition;
    for (const result of varianceData) {
      const difference = result.measuredVariance - result.expectedVariance;
      const differencePercent = (difference / result.expectedVariance * 100);
      
      const row = [
        this.participantId || '',
        result.part || '',
        cb?.filterFirst || '',
        cb?.varianceOrderLabel || '',
        result.pairNumber,
        result.filterType,
        result.filterRank,
        result.expectedVariance.toFixed(4),
        result.measuredVariance.toFixed(4),
        difference.toFixed(4),
        differencePercent.toFixed(2),
        (result.expectedVarianceNorm || 0).toFixed(4),
        (result.measuredVarianceNorm || 0).toFixed(4),
        result.stdDevX.toFixed(4),
        result.stdDevY.toFixed(4),
        result.numSamples,
        result.screenWidth || '',
        result.screenHeight || '',
        result.limitingDimension || ''
      ];
      
      csv += row.join(',') + '\n';
    }
    
    return csv;
  }
  
  // Download CSV file
  downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  
  // Create UI container
  createUI() {
    if (this.experimentUI) {
      this.experimentUI.remove();
    }
    this.experimentUI = document.createElement('div');
    this.experimentUI.id = 'fitts-experiment-ui';
    this.experimentUI.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 10000;
      pointer-events: none;
    `;
    
    document.body.appendChild(this.experimentUI);

    // Persistent back button at top-left
    const backBtn = document.createElement('button');
    backBtn.id = 'fitts-back-btn';
    backBtn.textContent = '← Back to Controls';
    backBtn.style.cssText = `
      position: fixed; top: 12px; left: 12px; z-index: 10001;
      padding: 8px 16px; font-size: 13px; font-weight: bold;
      background: rgba(80, 80, 80, 0.9); color: #ccc; border: 1px solid #666;
      border-radius: 6px; cursor: pointer; pointer-events: auto;
    `;
    backBtn.onmouseenter = () => { backBtn.style.background = 'rgba(120,120,120,0.9)'; };
    backBtn.onmouseleave = () => { backBtn.style.background = 'rgba(80,80,80,0.9)'; };
    backBtn.onclick = () => {
      if (!this.isRunning || confirm('Leave the experiment? Progress will be lost.')) {
        this.close();
      }
    };
    document.body.appendChild(backBtn);
    this._backBtn = backBtn;

    // Add styles
    this.addStyles();
  }
  
  // Add CSS styles
  addStyles() {
    if (document.getElementById('fitts-experiment-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'fitts-experiment-styles';
    style.textContent = `
      .experiment-instructions {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(20, 20, 20, 0.96);
        border: 2px solid rgba(100, 255, 100, 0.6);
        border-radius: 10px;
        padding: 24px 32px;
        max-width: 550px;
        max-height: 88vh;
        overflow-y: auto;
        color: white;
        z-index: 10000;
        pointer-events: auto;
        box-shadow: 0 0 30px rgba(0, 0, 0, 0.8);
        font-size: 18px;
      }
      
      .experiment-instructions h2 {
        margin: 0 0 10px 0;
        color: #64ff64;
        font-size: 28px;
      }
      
      .experiment-instructions h3 {
        margin: 12px 0 8px 0;
        color: #64ff64;
        font-size: 22px;
      }
      
      .experiment-instructions h4 {
        margin: 12px 0 8px 0;
        color: #88ff88;
        font-size: 20px;
      }
      
      .config-info {
        background: rgba(100, 100, 255, 0.2);
        padding: 10px 14px;
        border-radius: 5px;
        margin: 8px 0;
        font-size: 16px;
        border-left: 3px solid rgba(100, 100, 255, 0.6);
      }
      
      .instructions-content {
        margin: 14px 0;
        text-align: left;
        font-size: 16px;
      }
      
      .instructions-content ol {
        margin: 8px 0;
        padding-left: 24px;
      }
      
      .instructions-content li {
        margin: 6px 0;
        line-height: 1.6;
      }
      
      .trial-info {
        background: rgba(255, 200, 100, 0.15);
        padding: 12px;
        border-radius: 5px;
        margin: 10px 0;
        text-align: center;
        border-left: 3px solid rgba(255, 200, 100, 0.6);
        font-size: 15px;
      }
      
      .tip {
        background: rgba(100, 200, 255, 0.15);
        padding: 10px 12px;
        border-radius: 5px;
        font-size: 15px;
        margin-top: 10px;
        border-left: 3px solid rgba(100, 200, 255, 0.6);
      }
      
      .experiment-button {
        background: linear-gradient(135deg, #64ff64, #32cd32);
        color: #000;
        border: none;
        padding: 14px 28px;
        font-size: 18px;
        font-weight: bold;
        border-radius: 6px;
        cursor: pointer;
        margin-top: 12px;
        transition: all 0.2s;
        box-shadow: 0 2px 10px rgba(100, 255, 100, 0.4);
      }
      
      .experiment-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 14px rgba(100, 255, 100, 0.6);
      }
      
      .break-info {
        background: rgba(50, 50, 50, 0.8);
        padding: 12px;
        border-radius: 5px;
        margin: 10px 0;
        font-size: 15px;
      }
      
      .progress-bar {
        width: 100%;
        height: 16px;
        background: rgba(100, 100, 100, 0.3);
        border-radius: 8px;
        overflow: hidden;
        margin-top: 8px;
      }
      
      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #64ff64, #32cd32);
        transition: width 0.5s;
      }
      
      .results-summary {
        margin: 8px 0;
      }
      
      .config-result {
        background: rgba(50, 50, 50, 0.8);
        padding: 8px;
        border-radius: 4px;
        margin: 6px 0;
        border-left: 2px solid #64ff64;
        font-size: 10px;
      }
      
      .config-result h4 {
        margin: 0 0 4px 0;
        color: #64ff64;
        font-size: 12px;
      }
      
      .config-result p {
        margin: 3px 0;
        font-size: 10px;
      }
      
      .export-info {
        background: rgba(100, 150, 255, 0.2);
        padding: 8px;
        border-radius: 3px;
        margin: 8px 0;
        font-size: 9px;
        border-left: 2px solid rgba(100, 150, 255, 0.6);
      }
      
      .export-info code {
        background: rgba(0, 0, 0, 0.4);
        padding: 1px 3px;
        border-radius: 2px;
        font-family: monospace;
        color: #64ff64;
        font-size: 9px;
      }
      
      .comparison-result {
        background: rgba(100, 200, 255, 0.2);
        padding: 8px;
        border-radius: 4px;
        margin: 8px 0;
        border-left: 2px solid #64c8ff;
        font-size: 10px;
      }
      
      .comparison-result h3 {
        margin: 0 0 4px 0;
        color: #64c8ff;
        font-size: 13px;
      }
      
      .comparison-result p {
        margin: 3px 0;
        font-size: 11px;
      }
    `;
    
    document.head.appendChild(style);
  }
  
  // Close experiment
  close() {
    if (this.experimentUI) {
      this.experimentUI.remove();
      this.experimentUI = null;
    }

    if (this._backBtn) {
      this._backBtn.remove();
      this._backBtn = null;
    }
    
    if (this.cursorTrackingInterval) {
      clearInterval(this.cursorTrackingInterval);
      this.cursorTrackingInterval = null;
    }

    this._stopConditionTimer();

    if (this._spacebarHandler) {
      document.removeEventListener('keydown', this._spacebarHandler);
    }
    
    this.isRunning = false;
    
    // Restore all tracking controls
    this.restoreAllControls();
    
    // CRITICAL FIX: Reset filter to Rank 1 with proper React state update
    console.log("Resetting filter to Rank 1 after experiment close...");
    setTimeout(() => {
      this.resetToRankOne();
    }, 500);
    
    console.log("Experiment closed");
  }
  
  // Reset filter to default (Rank 20 for Exponential, Rank 1 for One Euro)
  resetToRankOne() {
    console.log("========================================");
    console.log("🔄 RESETTING FILTERS TO DEFAULT");
    console.log("========================================");
    
    // Reset to Exponential filter (default)
    window.state.config.filterType = "exponential";
    console.log("✅ Set filterType = exponential");
    
    // Click Exponential button to let React switch view
    const filterButtons = document.querySelectorAll('.filter-buttons button');
    filterButtons.forEach(btn => {
      if (btn.textContent.trim() === 'Exponential' && !btn.classList.contains('active-filter')) {
        console.log("🖱️ Clicking Exponential button");
        btn.click();
      }
    });
    
    // Wait for React to update, then set sliders
    setTimeout(() => {
      // Reset Exponential to Rank 20 (default)
      const expSlider = document.querySelector('.exponential-rank-selector input[type="range"]');
      const expRankText = document.querySelector('.exponential-rank-selector span.text-sm.font-bold');
    
      if (expSlider) {
        expSlider.value = 20;
        // Trigger events to update React
        expSlider.dispatchEvent(new Event('input', { bubbles: true }));
        expSlider.dispatchEvent(new Event('change', { bubbles: true }));
        console.log("✅ Exponential slider set to 20");
      }
      if (expRankText) {
        const totalRanks = window.EXPONENTIAL_PARAMETERS ? window.EXPONENTIAL_PARAMETERS.length : 107;
        expRankText.textContent = `20 / ${totalRanks}`;
        console.log("✅ Exponential text set to 20 / " + totalRanks);
      }
      
      // Apply Exponential Rank 20 parameters
      if (window.EXPONENTIAL_PARAMETERS && window.EXPONENTIAL_PARAMETERS[19]) {
        const params = window.EXPONENTIAL_PARAMETERS[19];
          const smoothingFactor = 1 - params.alpha;
          window.state.config.exponentialSmoothingFactor = smoothingFactor;
        console.log(`✅ Applied Exponential Rank 20 parameters:`);
        console.log(`   - Alpha: ${params.alpha}`);
        console.log(`   - Smoothing Factor: ${smoothingFactor.toFixed(6)}`);
      }
      
      console.log("========================================");
      console.log("✅ RESET COMPLETE");
      console.log("========================================");
    }, 200);
  }
}

// Initialize experiment on page load
window.addEventListener('DOMContentLoaded', () => {
  window.fittsExperiment = new FittsExperiment();
  console.log("Fitts' Law Experiment initialized");
});

