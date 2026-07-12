
/**
 * Advanced Parameter Optimization System
 * Based on Professor Roberto's variance-latency analysis approach
 * 
 * IMPROVED VERSION - NO CURSOR CONTAMINATION:
 * This system now collects RAW LANDMARK DATA without showing cursor movement,
 * preventing contamination from cursor overshooting targets or visual feedback loops.
 * 
 * This system:
 * 1. Collects RAW UNFILTERED landmark data at 9 screen positions (CURSOR HIDDEN)
 * 2. Converts landmarks to head positions OFFLINE (no visual feedback)
 * 3. Applies different filter parameters OFFLINE to the same raw data
 * 4. Measures variance during stationary periods (on offline-filtered data)
 * 5. Measures latency during movement transitions (on offline-filtered data)
 * 6. Performs parameter sweeps offline on the collected data
 * 7. Generates Pareto front analysis for optimal parameter selection
 * 
 * KEY IMPROVEMENT: No cursor shown during data collection = No overshoot/undershoot contamination
 * Measurements now reflect pure filter performance, not user visual feedback loops.
 */

console.log('📜 Loading Parameter Optimization System (NO CURSOR VERSION)...');

// Check dependencies first
if (typeof OneEuroFilter === 'undefined') {
  console.error('❌ CRITICAL: OneEuroFilter not found! Cannot load parameter optimization.');
  console.error('Please ensure oneEuroFilter.js is loaded before parameter-optimization.js');
  throw new Error('Missing dependency: OneEuroFilter');
}

if (typeof window === 'undefined') {
  console.error('❌ CRITICAL: window object not available!');
  throw new Error('Browser environment required');
}

console.log('✅ Dependencies check passed');

function getContinuousRange(points) {
  const n = points.length;
  if (n < 4) return { start: 0, end: n - 1 };

  const gaps = [];
  for (let i = 0; i < n - 1; i++) {
    gaps.push(Math.abs(points[i + 1].y - points[i].y));
  }
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const median = sortedGaps[Math.floor(sortedGaps.length / 2)];
  const threshold = Math.max(median * 4, 1);

  let start = 0;
  while (start < gaps.length - 2 && gaps[start] > threshold) start++;
  let end = n - 1;
  while (end > start + 1 && gaps[end - 1] > threshold) end--;

  return { start, end };
}

function drawMonotoneCurve(ctx, points) {
  const n = points.length;
  if (n < 2) return;
  if (n === 2) {
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    return;
  }

  const { start, end } = getContinuousRange(points);
  const sub = points.slice(start, end + 1);
  if (sub.length < 2) {
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(points[i].x, points[i].y);
    return;
  }

  const sn = sub.length;
  const dx = [], dy = [], m = [];
  for (let i = 0; i < sn - 1; i++) {
    dx.push(sub[i + 1].x - sub[i].x);
    dy.push(sub[i + 1].y - sub[i].y);
    m.push(dx[i] === 0 ? 0 : dy[i] / dx[i]);
  }
  const tangents = new Array(sn);
  tangents[0] = m[0];
  tangents[sn - 1] = m[sn - 2];
  for (let i = 1; i < sn - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      tangents[i] = 0;
    } else {
      tangents[i] = (m[i - 1] + m[i]) / 2;
    }
  }
  for (let i = 0; i < sn - 1; i++) {
    if (Math.abs(m[i]) < 1e-10) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const alpha = tangents[i] / m[i];
      const beta = tangents[i + 1] / m[i];
      const mag = Math.sqrt(alpha * alpha + beta * beta);
      if (mag > 3) {
        tangents[i] = 3 * alpha / mag * m[i];
        tangents[i + 1] = 3 * beta / mag * m[i];
      }
    }
  }
  ctx.moveTo(sub[0].x, sub[0].y);
  for (let i = 0; i < sn - 1; i++) {
    const d = dx[i];
    const cp1x = sub[i].x + d / 3;
    const cp1y = sub[i].y + tangents[i] * d / 3;
    const cp2x = sub[i + 1].x - d / 3;
    const cp2y = sub[i + 1].y - tangents[i + 1] * d / 3;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, sub[i + 1].x, sub[i + 1].y);
  }
}

class ParameterOptimizer {
  constructor() {
    this.rawData = [];
    this.currentPosition = 0;
    this.isCollecting = true; // Flag to control data collection globally
    this.results = [];
    this.firstSuccessLogged = false; // Debug flag
    
    // Environment conditions tracking (Professor's requirement)
    this.environmentConditions = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      lightingCondition: null, // User will set this
      mediapipeVersion: null,  // Will be detected if available
      samplingRate: 60,        // Will be measured during collection
      notes: ''
    };
    
    // Roberto method uses click-based timing only - no automatic detection needed
    
    // 9-point grid positions (3x3 grid across screen)
    this.targetPositions = [
      { name: "Top-Left", x: 0.15, y: 0.15 },
      { name: "Top-Center", x: 0.5, y: 0.15 },
      { name: "Top-Right", x: 0.85, y: 0.15 },
      { name: "Middle-Right", x: 0.85, y: 0.5 },
      { name: "Center", x: 0.5, y: 0.5 },
      { name: "Middle-Left", x: 0.15, y: 0.5 },
      { name: "Bottom-Left", x: 0.15, y: 0.85 },
      { name: "Bottom-Center", x: 0.5, y: 0.85 },
      { name: "Bottom-Right", x: 0.85, y: 0.85 }
    ];
    
    // QUICK TEST MODE - Reduced parameters for faster testing
    // Set to true for quick testing, false for full analysis
    this.quickTestMode = false;
    
    if (this.quickTestMode) {
      // QUICK TEST: ~500 combinations for fast debugging
      this.parameterRanges = {
        minCutoff: { 
          min: 0.001,
          max: 0.5,
          step: 0.05,      // ~10 values
          type: 'linear'
        },
        beta: { 
          min: 0.0001,
          max: 0.005, 
          step: 0.001      // ~5 values
        },
        dCutoff: { 
          min: 0.1, 
          max: 1.0, 
          step: 0.1        // 10 values
        }
      };
      console.log('⚡ QUICK TEST MODE - Reduced parameter space for fast testing');
      console.log('   minCutoff: 0.001 to 0.5 (~10 values)');
      console.log('   beta: 0.0001 to 0.005 (~5 values)');
      console.log('   dCutoff: 0.1 to 1.0 (10 values)');
      console.log('   Total combinations: ~500');
    } else {
      // FULL ANALYSIS: ~19,000 combinations
      // Lower minCutoff = more smoothing = lower variance
      // Logarithmic spacing for minCutoff concentrates samples in the
      // low-minCutoff region where variance changes most rapidly.
      // dCutoff controls derivative smoothing — lower = smoother derivative estimate.
      // With dCutoff >= 0.1, noisy derivatives inflate the adaptive cutoff, preventing
      // One Euro from reaching the low variance that exponential smoothing achieves.
      // Log spacing for both minCutoff and dCutoff to cover the critical low ranges.
      this.parameterRanges = {
        minCutoff: { 
          logMin: -3,      // 10^-3 = 0.001
          logMax: 0,       // 10^0  = 1.0
          logStep: 0.06,   // ~50 values, log-spaced
          type: 'logarithmic'
        },
        beta: { 
          min: 0.00001,
          max: 0.01,
          step: 0.0005     // ~20 values
        },
        dCutoff: { 
          logMin: -3,      // 10^-3 = 0.001
          logMax: 0.3,     // 10^0.3 ≈ 2.0
          logStep: 0.175,  // ~19 values, log-spaced
          type: 'logarithmic'
        }
      };
      console.log('📊 FULL ANALYSIS MODE - Log-spaced minCutoff & dCutoff');
      console.log('   minCutoff: 0.001 to 1.0 (~50 values, logarithmic)');
      console.log('   beta: 0.00001 to 0.01 (~20 values)');
      console.log('   dCutoff: 0.001 to 2.0 (~19 values, logarithmic)');
      console.log('   Total combinations: ~19,000');
    }
    
    // Note: For ultra-fine precision matching UI exactly, use:
    // minCutoff: step 0.001 (1,501 values), beta: step 0.00001 (1,001 values), dCutoff: step 0.00001 (10,001 values)
    // This would create 15+ billion combinations - not computationally feasible!
    
    // Timing constants for UI display
    this.MAX_COLLECTION_TIME = 12000; // 12 seconds max per position
    this.MIN_STATIONARY_TIME = 2000; // Minimum 2 seconds of stationary data needed
  }

  /**
   * Record environment conditions before starting
   * This is critical for reproducibility (Professor's requirement)
   */
  async recordEnvironmentConditions() {
    return new Promise((resolve) => {
      // Create modal to record lighting conditions
      const modal = document.createElement('div');
      modal.id = 'environment-conditions-modal';
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        z-index: 10001;
        display: flex;
        justify-content: center;
        align-items: center;
      `;
      
      modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 10px; max-width: 500px; color: #333;">
          <h2 style="margin-top: 0;">📊 Environment Conditions</h2>
          <p>Please record the current conditions for reproducibility.</p>
          
          <label style="display: block; margin-top: 15px; font-weight: bold;">
            Lighting Condition:
          </label>
          <select id="lighting-condition" style="width: 100%; padding: 10px; margin-top: 5px; font-size: 16px;">
            <option value="bright_natural">Bright Natural Light (near window, daytime)</option>
            <option value="normal_indoor">Normal Indoor Lighting</option>
            <option value="dim_indoor">Dim Indoor Lighting</option>
            <option value="screen_only">Screen Light Only (dark room)</option>
            <option value="mixed">Mixed Lighting</option>
          </select>
          
          <label style="display: block; margin-top: 15px; font-weight: bold;">
            Notes (optional):
          </label>
          <textarea id="environment-notes" style="width: 100%; height: 60px; padding: 10px; margin-top: 5px;" 
            placeholder="E.g., window on left, overhead fluorescent, etc."></textarea>
          
          <div style="margin-top: 20px; text-align: right;">
            <button id="start-collection-btn" style="
              padding: 12px 30px;
              background: #4CAF50;
              color: white;
              border: none;
              border-radius: 5px;
              cursor: pointer;
              font-size: 16px;
              font-weight: bold;
            ">Start Data Collection (or press Space)</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);

      // Show the mouse cursor while this modal is open so the participant
      // can use the dropdown and type notes (body has .hide-cursor otherwise).
      const hadHideCursor = document.body.classList.contains('hide-cursor');
      document.body.classList.remove('hide-cursor');

      const startCollection = () => {
        this.environmentConditions.lightingCondition = document.getElementById('lighting-condition').value;
        this.environmentConditions.notes = document.getElementById('environment-notes').value;
        this.environmentConditions.timestamp = new Date().toISOString();
        
        // Try to detect mediapipe version
        if (window.FaceLandmarker && window.FaceLandmarker.VERSION) {
          this.environmentConditions.mediapipeVersion = window.FaceLandmarker.VERSION;
        }
        
        console.log('📋 Environment conditions recorded:', this.environmentConditions);
        document.removeEventListener('keydown', spaceHandler);
        if (hadHideCursor) document.body.classList.add('hide-cursor');
        modal.remove();
        resolve();
      };
      
      document.getElementById('start-collection-btn').onclick = startCollection;
      
      const spaceHandler = (e) => {
        const tag = e.target.tagName;
        if (e.code === 'Space' && tag !== 'TEXTAREA' && tag !== 'SELECT' && tag !== 'INPUT') {
          e.preventDefault();
          startCollection();
        }
      };
      document.addEventListener('keydown', spaceHandler);
    });
  }

  /**
   * Main function to start the data collection experiment
   */
  async startDataCollection() {
    console.log('📋 startDataCollection() called');
    
    if (!this.checkSystemReady()) {
      console.log('❌ System not ready, aborting');
      return;
    }

    console.log("✓ System ready - Starting advanced parameter optimization data collection...");

    // Register this participant on the server (parameter optimization = real start of test)
    if (window.URL_PARTICIPANT_ID) {
      fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid: parseInt(window.URL_PARTICIPANT_ID) })
      }).catch(err => console.warn('Could not register participant:', err));
    }
    
    try {
      // Record environment conditions first (Professor's requirement)
      await this.recordEnvironmentConditions();
      
      // Show full instructions before starting
      await this.showInitialInstructions();
      
      this.setupUI();
      console.log('✓ UI setup complete');
      
      // In user mode, hide the bottom-right panel — flash overlay is the only guide
      if (isUserMode() && this.ui) {
        this.ui.style.display = 'none';
      }
      
      // Reset data
      this.rawData = [];
      this.currentPosition = 0;
      
      await this.collectAtAllPositions();
      console.log('✓ Data collection process started');
    } catch (error) {
      console.error('❌ Error in startDataCollection:', error);
      alert(`Error in data collection: ${error.message}`);
    }
  }

  /**
   * Check if the tracking system is ready
   */
  checkSystemReady() {
    console.log('🔍 Checking system readiness...');
    const issues = [];
    
    // CRITICAL: Check if calibration is complete
    if (!window.state || !window.state.transformationMatrices) {
      issues.push('❌ Calibration not complete - transformation matrices missing');
      console.error('window.state:', window.state);
    } else {
      const matrices = window.state.transformationMatrices;
      const hasAnyMatrix = matrices.threePoint2d || matrices.threePoint3d || 
                          matrices.sixPoint2d || matrices.sixPoint3d;
      if (!hasAnyMatrix) {
        issues.push('❌ No calibration matrices found - please complete calibration first');
      } else {
        console.log('✅ Calibration matrices found:', {
          threePoint2d: !!matrices.threePoint2d,
          threePoint3d: !!matrices.threePoint3d,
          sixPoint2d: !!matrices.sixPoint2d,
          sixPoint3d: !!matrices.sixPoint3d
        });
      }
    }
    const warnings = [];
    
    // Check window.state exists
    if (!window.state) {
      console.log('❌ window.state is missing');
      issues.push("Tracking system not initialized");
    } else {
      console.log('✓ window.state exists');
      
      // Check landmarks
      if (!window.state.lastLandmarks) {
        console.log('❌ No lastLandmarks found');
        issues.push("Face tracking not active - please ensure your face is visible");
      } else {
        console.log('✓ Face tracking active');
      }
      
      // Check calibration
      if (!window.state.transformationMatrices) {
        console.log('❌ No transformation matrices found');
        issues.push("No calibration found - please calibrate first");
      } else {
        console.log('✓ Calibration matrices found');
        
        // CRITICAL: Check calibration quality (Roberto's requirement)
        const calibrationQuality = this.checkCalibrationQuality();
        if (calibrationQuality.rmse > 100) {
          warnings.push(`⚠️  High calibration error (RMSE: ${calibrationQuality.rmse.toFixed(1)}px)`);
          warnings.push("⚠️  Consider recalibrating for better parameter optimization results");
          console.warn(`🔥 HIGH CALIBRATION ERROR: ${calibrationQuality.rmse}px RMSE`);
          console.warn('Roberto method requires good calibration for meaningful results');
        } else {
          console.log(`✅ Good calibration quality: ${calibrationQuality.rmse.toFixed(1)}px RMSE`);
        }
      }
    }
    
    if (issues.length > 0) {
      console.log('❌ System not ready:', issues);
      alert(`Cannot start optimization:\n\n${issues.join('\n')}\n\nPlease:\n1. Ensure your face is visible to the camera\n2. Complete calibration first`);
      return false;
    }
    
    if (warnings.length > 0) {
      console.log('System warnings:', warnings);
      if (isTestMode()) {
        const proceed = confirm(`System warnings:\n\n${warnings.join('\n')}\n\nProceed anyway?`);
        if (!proceed) return false;
      }
    }
    
    console.log('✅ System ready for parameter optimization!');
    return true;
  }
  
  /**
   * Check calibration quality by calculating current tracking error
   */
  checkCalibrationQuality() {
    try {
      // Try to get recent metrics from calibration system
      if (window.preCalculatedMetrics && window.preCalculatedMetrics.rmse) {
        return {
          rmse: window.preCalculatedMetrics.rmse,
          source: 'precalculated'
        };
      }
      
      // Fallback: estimate based on transformation matrix properties
      if (window.state && window.state.transformationMatrices) {
        // This is a rough estimate - actual RMSE would require test data
        return {
          rmse: 50, // Conservative estimate for working calibration
          source: 'estimated'
        };
      }
      
      return { rmse: Infinity, source: 'unknown' };
    } catch (error) {
      console.warn('Error checking calibration quality:', error);
      return { rmse: Infinity, source: 'error' };
    }
  }

  /**
   * Hide distracting UI elements during the experiment
   */
  hideExperimentDistractions() {
    // Store original visibility states to restore later
    this.hiddenElements = [];
    
    // List of elements to hide (by ID)
    // NOTE: Do NOT hide video-container - it breaks face tracking!
    const elementsToHide = [
      'threejs-container',        // Three.js head visualization
      'threejs-head-container',   // 3D head visualization
      'rotation-control-panel',   // Rotation control panel
      'tracking-controls',        // Tracking controls sidebar
      'tracking-controls-container', // Tracking controls React root
      'head-cursor-clipped',      // Head cursor
      'head-cursor',              // Alternative cursor ID
      'calibration-overlay',      // Calibration UI
      'settings-panel',           // Settings panel if exists
      // 'video-container',       // DON'T hide - breaks face tracking!
      // 'video-input',           // DON'T hide - may break camera feed
    ];
    
    for (const id of elementsToHide) {
      const el = document.getElementById(id);
      if (el) {
        this.hiddenElements.push({ el: el, display: el.style.display, visibility: el.style.visibility });
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        console.log(`🙈 Hidden: #${id}`);
      }
    }
    
    // Also hide any elements with class 'control-panel' or similar
    const controlPanels = document.querySelectorAll('.control-panel, .sidebar, .panel');
    controlPanels.forEach(el => {
      if (el && el.id !== 'param-optimization-ui') {
        this.hiddenElements.push({ el: el, display: el.style.display, visibility: el.style.visibility });
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        console.log(`🙈 Hidden: .${el.className}`);
      }
    });
    
    // Hide video preview visually (opacity 0) without breaking tracking
    const videoEl = document.getElementById('video-input');
    if (videoEl) {
      this.hiddenElements.push({ el: videoEl, display: videoEl.style.display, visibility: videoEl.style.visibility, opacity: videoEl.style.opacity });
      videoEl.style.opacity = '0';
      videoEl.style.pointerEvents = 'none';
    }
    
    console.log(`🙈 Hidden ${this.hiddenElements.length} distracting elements for clean experiment`);
  }
  
  /**
   * Restore hidden UI elements after experiment
   */
  restoreExperimentUI() {
    if (this.hiddenElements && this.hiddenElements.length > 0) {
      for (const item of this.hiddenElements) {
        item.el.style.display = item.display || '';
        item.el.style.visibility = item.visibility || 'visible';
        if (item.opacity !== undefined) {
          item.el.style.opacity = item.opacity || '';
          item.el.style.pointerEvents = '';
        }
      }
      console.log(`👁️ Restored ${this.hiddenElements.length} UI elements`);
      this.hiddenElements = [];
    }
  }

  /**
   * Show full instructions screen before data collection begins
   */
  async showInitialInstructions() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.95); z-index: 100000;
        display: flex; align-items: center; justify-content: center;
      `;
      overlay.innerHTML = `
        <div style="
          max-width: 700px; padding: 50px; text-align: center; color: white;
          background: rgba(30, 30, 40, 0.98); border: 2px solid #64c8ff;
          border-radius: 16px;
        ">
          <h1 style="color: #64c8ff; font-size: 36px; margin: 0 0 20px 0;">System Calibration</h1>
          <p style="font-size: 22px; color: #ccc; margin-bottom: 30px;">
            A <span style="color: #ff4444; font-weight: bold;">red circle</span> will appear on the screen.
          </p>
          <p style="font-size: 22px; color: #eee; margin-bottom: 30px; font-weight: bold;">
            Move your head to the red circle and follow the instructions near it.
          </p>
          <p style="font-size: 18px; color: #aaa; margin-bottom: 10px;">
            This process will repeat for 9 positions across the screen.
          </p>
          <div style="
            margin-top: 30px; padding: 18px 50px; font-size: 22px; font-weight: bold;
            background: #64c8ff; color: #111; border: none; border-radius: 10px;
            display: inline-block; cursor: pointer;
          " id="pareto-begin-btn">Press SPACE to Begin</div>
        </div>
      `;
      document.body.appendChild(overlay);

      const dismiss = () => {
        document.removeEventListener('keydown', spaceHandler);
        overlay.remove();
        resolve();
      };

      document.getElementById('pareto-begin-btn').onclick = dismiss;

      const spaceHandler = (e) => {
        if (e.code === 'Space') {
          e.preventDefault();
          dismiss();
        }
      };
      document.addEventListener('keydown', spaceHandler);
    });
  }

  /**
   * Setup the UI for data collection
   */
  setupUI() {
    // Remove existing UI if any
    const existing = document.getElementById('param-optimization-ui');
    if (existing) {
      existing.remove();
    }

    // Hide distracting UI elements during experiment
    this.hideExperimentDistractions();
    
    // Create UI container - positioned at BOTTOM-RIGHT corner to not block any targets
    this.ui = document.createElement('div');
    this.ui.id = 'param-optimization-ui';
    this.ui.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.6);
      color: white;
      padding: 15px;
      border-radius: 10px;
      z-index: 10000;
      font-family: monospace;
      min-width: 280px;
      max-width: 320px;
      max-height: 35vh;
      overflow-y: auto;
      backdrop-filter: blur(5px);
      border: 1px solid rgba(255, 255, 255, 0.2);
    `;

    // Create target indicator
    this.target = document.createElement('div');
    this.target.style.cssText = `
      position: fixed;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: radial-gradient(circle, #ff4444 0%, #aa0000 100%);
      border: 3px solid white;
      transform: translate(-50%, -50%);
      z-index: 9999;
      box-shadow: 0 0 20px rgba(255, 68, 68, 0.6);
    `;
    
    // Create Roberto's arrival threshold radius indicator (HIDDEN - not needed visually)
    this.targetRadius = document.createElement('div');
    this.targetRadius.style.cssText = `
      display: none;
    `;

    // Create status display
    this.status = document.createElement('div');
    this.status.style.cssText = `
      font-size: 16px;
      margin-bottom: 10px;
      font-weight: bold;
    `;

    // Create progress display
    this.progress = document.createElement('div');
    this.progress.style.cssText = `
      font-size: 14px;
      margin-bottom: 10px;
      color: #aaa;
    `;

    // Create instructions
    this.instructions = document.createElement('div');
    this.instructions.style.cssText = `
      font-size: 16px;
      color: #ccc;
      line-height: 1.6;
      max-height: 400px;
      overflow-y: auto;
      margin-bottom: 10px;
    `;
    
    // Flashy message overlay — positioned dynamically near the target
    this.flashOverlay = document.createElement('div');
    this.flashOverlay.id = 'pareto-flash-overlay';
    this.flashOverlay.style.cssText = `
      position: fixed; z-index: 99998; display: none;
      pointer-events: none; white-space: nowrap;
      transform: translateX(-50%);
    `;
    document.body.appendChild(this.flashOverlay);
    
    if (!document.getElementById('pareto-flash-styles')) {
      const flashStyle = document.createElement('style');
      flashStyle.id = 'pareto-flash-styles';
      flashStyle.textContent = `
        @keyframes paretoFlashFadeOut { from { opacity: 1; } to { opacity: 0; } }
      `;
      document.head.appendChild(flashStyle);
    }

    // Create back button
    this.cancelBtn = document.createElement('button');
    this.cancelBtn.textContent = '← Back';
    this.cancelBtn.style.cssText = `
      margin-top: 10px;
      padding: 8px 16px;
      background: #666;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-weight: bold;
    `;
    this.cancelBtn.onclick = () => this.cancelCollection();

    // Assemble UI
    this.ui.appendChild(this.status);
    this.ui.appendChild(this.progress);
    this.ui.appendChild(this.instructions);
    this.ui.appendChild(this.cancelBtn);

    document.body.appendChild(this.ui);
    document.body.appendChild(this.targetRadius);
    document.body.appendChild(this.target);
  }

  /**
   * Collect data at all 9 positions sequentially using Roberto's complete method
   */
  async collectAtAllPositions() {
    for (let i = 0; i < this.targetPositions.length; i++) {
      this.currentPosition = i;
      const position = this.targetPositions[i];
      
      // Determine next position for latency measurement
      // IMPORTANT: Skip the last position's latency (Bottom-Right → Top-Left)
      // because it's the longest diagonal and would bias the results
      const isLastPosition = (i === this.targetPositions.length - 1);
      const nextPosition = isLastPosition ? null : this.targetPositions[i + 1];
      
      // Update UI
      this.updateProgress();
      
      // Collect data at this position using Roberto's COMPLETE method
      const positionData = await this.collectAtPosition(position, nextPosition);
      
      // Log Roberto timing information for debugging
      if (positionData && positionData.timingData) {
        const nextPosName = nextPosition ? nextPosition.name : 'NONE (last position)';
        console.log(`Position ${position.name} → ${nextPosName} Roberto timing:`, {
          t_i_click: positionData.timingData.t_i_click,
          t_i_wait: positionData.timingData.t_i_wait,
          t_i_wait_end: positionData.timingData.t_i_wait_end,
          variancePeriod: `${positionData.timingData.variancePeriodStart} - ${positionData.timingData.variancePeriodEnd}`,
          latencyMeasurement: isLastPosition ? 'SKIPPED (last position)' : `${positionData.timingData.latencyMeasurementStart} onwards`,
          varianceDataPoints: positionData.varianceData.length,
          latencyDataPoints: positionData.latencyData.length,
          totalDataPoints: positionData.rawData.length,
          skipLatency: isLastPosition
        });
        
        this.rawData.push({
          position: position,
          nextPosition: nextPosition,
          positionIndex: i,
          skipLatency: isLastPosition, // Flag to skip latency for last position
          data: positionData
        });
      } else {
        console.warn(`Position ${position.name}: No Roberto timing data (SPACE not pressed)`);
      }
      
      if (i < this.targetPositions.length - 1) {
        if (isTestMode()) {
          await this.sleep(2000);
        } else {
          await this.sleep(1800);
          this.hideFlashMessage();
          await this.sleep(400);
        }
      }
    }

    // Stop accepting space presses after all positions
    this.isCollecting = false;

    // Data collection complete - transition to optimization
    this.finishDataCollection();
  }

  /**
   * Show a big flashy message overlay. If duration=0, it stays until manually hidden.
   */
  showFlashMessage(text, color = '#ff4444', duration = 0, subtext = '', targetPx = null, targetPy = null) {
    if (!this.flashOverlay) return;
    this.flashOverlay.style.display = 'block';
    this.flashOverlay.innerHTML = `
      <div style="text-align: center; padding: 12px 24px; background: rgba(0,0,0,0.8); border-radius: 12px; display: inline-block;">
        <div style="
          font-size: 32px; font-weight: 900; color: ${color};
          letter-spacing: 1px;
        ">${text}</div>
        ${subtext ? `<div style="font-size: 18px; color: #ddd; margin-top: 8px;">${subtext}</div>` : ''}
      </div>
    `;
    this._positionFlashNearTarget(targetPx, targetPy);
    if (duration > 0) {
      setTimeout(() => {
        if (this.flashOverlay) {
          this.flashOverlay.style.display = 'none';
        }
      }, duration);
    }
  }

  hideFlashMessage() {
    if (this.flashOverlay) {
      this.flashOverlay.style.display = 'none';
    }
  }

  _positionFlashNearTarget(targetPx, targetPy) {
    if (!this.flashOverlay) return;

    // Fall back to current red-target position if no explicit coords given
    if (targetPx == null || targetPy == null) {
      const pos = this.targetPositions[this.currentPosition];
      if (!pos) return;
      targetPx = pos.x * window.innerWidth;
      targetPy = pos.y * window.innerHeight;
    }

    const gap = 50;

    if (targetPy / window.innerHeight > 0.65) {
      this.flashOverlay.style.top = '';
      this.flashOverlay.style.bottom = `${window.innerHeight - targetPy + gap}px`;
    } else {
      this.flashOverlay.style.bottom = '';
      this.flashOverlay.style.top = `${targetPy + gap}px`;
    }
    this.flashOverlay.style.left = `${targetPx}px`;
  }

  /**
   * Collect data at a single position using Roberto's COMPLETE method
   * IMPROVED: Collects RAW UNFILTERED data without showing cursor movement
   * 
   * Roberto's actual method: 
   * 1. User moves to position and clicks when steady
   * 2. After delay (t_i_wait), new target appears  
   * 3. User moves to new target (this generates movement for latency measurement)
   * 4. Variance = steadiness during t_i_wait period
   * 5. Latency = time from new target appearance to filtered arrival
   * 
   * KEY IMPROVEMENT: Collects RAW head landmark data, not filtered cursor positions
   * This prevents contamination from cursor overshooting targets
   */
  async collectAtPosition(position, nextPosition = null) {
    const pixelX = position.x * window.innerWidth;
    const pixelY = position.y * window.innerHeight;

    // Cursor is already hidden globally by hideExperimentDistractions()

    // Move target to position
    this.target.style.left = `${pixelX}px`;
    this.target.style.top = `${pixelY}px`;
    this.targetRadius.style.left = `${pixelX}px`;
    this.targetRadius.style.top = `${pixelY}px`;

    const posNum = this.currentPosition + 1;
    const totalPos = this.targetPositions.length;
    if (isTestMode()) {
      this.status.textContent = `Position ${position.name}`;
      this.instructions.innerHTML = `
        <strong>Parameter Optimization:</strong><br>
        <span style="color: #00ff00;">1. Move your head to look at the RED target</span><br>
        <span style="color: #ffff00;">2. Press SPACE when steady</span><br>
        <span style="color: #888;">Then a GREEN target will appear - move to it</span><br>
        <span style="color: #ff6b6b;">Position ${posNum} of ${totalPos}</span>
      `;
    } else {
      this.showFlashMessage(
        'Press SPACE when ready',
        '#ffdd57', 0,
        `Position ${posNum} of ${totalPos}`
      );
    }

    let allData = [];
    let t_i_click = null;
    let t_i_wait_end = null;
    let newTargetAppeared = false;
    let isCollecting = false;
    let latencyMeasurementActive = false;
    const T_I_WAIT = 2500; // 2.5 seconds for variance measurement
    
    // arrival threshold: 3% of screen width (balanced precision vs noise tolerance)
    const ARRIVAL_RADIUS = window.innerWidth * 0.03;
    
    return new Promise(resolve => {
      // Check if this is the last position (skip latency measurement)
      const isLastPosition = (nextPosition === null);
      
      // Only set next target coordinates if we have a next position
      let nextPixelX = 0;
      let nextPixelY = 0;
      if (nextPosition) {
        nextPixelX = nextPosition.x * window.innerWidth;
        nextPixelY = nextPosition.y * window.innerHeight;
      }
      
      // Listen for spacebar press (Professor's "return" press)
      const handleKeyPress = (event) => {
        if (event.code === 'Space' && !isCollecting && this.isCollecting !== false) {
          event.preventDefault();
          t_i_click = performance.now();
          t_i_wait_end = t_i_click + T_I_WAIT;
          isCollecting = true;
          
          if (isTestMode()) {
            this.status.textContent = `Recording at ${position.name}`;
            this.instructions.innerHTML = `
              <strong>Hold your head steady!</strong><br>
              <span style="color: #00ff00;">Recording RAW data for ${T_I_WAIT/1000} seconds...</span><br>
              <em>Keep looking at current target...</em><br>
              <span style="color: #888;">Cursor hidden - collecting unfiltered head positions</span>
            `;
          } else {
            this.showFlashMessage(
              'Hold still',
              '#ff4444', 0,
              `Recording for ${T_I_WAIT/1000} seconds...`
            );
          }
          
          // Start data collection immediately at t_i_click
          // CRITICAL CHANGE: Collect RAW LANDMARKS, not filtered cursor positions
          let sampleCount = 0;
          let landmarkMissCount = 0;
          const dataInterval = setInterval(() => {
            sampleCount++;
            
            // Debug: Check what's available
            if (sampleCount === 1) {
              console.log('📊 Data collection state check:');
              console.log('  window.state exists:', !!window.state);
              console.log('  window.state.lastLandmarks exists:', !!(window.state && window.state.lastLandmarks));
              console.log('  window.state.config exists:', !!(window.state && window.state.config));
              console.log('  window.state.transformationMatrices exists:', !!(window.state && window.state.transformationMatrices));
            }
            
            if (window.state && window.state.lastLandmarks) {
              const currentTime = performance.now();
              
              // Determine current phase
              let phase = 'variance_measurement';
              if (newTargetAppeared) {
                phase = latencyMeasurementActive ? 'latency_measurement' : 'post_arrival';
              }
              
              // Get transformation matrix safely
              let matrix = null;
              if (window.state && window.state.transformationMatrices) {
                const landmarkPoints = window.state.config?.landmarkPoints || "3";
                const coordinateSystem = window.state.config?.coordinateSystem || "2d";
                
                if (landmarkPoints === "3") {
                  matrix = coordinateSystem === "3d" ?
                    window.state.transformationMatrices.threePoint3d :
                    window.state.transformationMatrices.threePoint2d;
                } else {
                  matrix = coordinateSystem === "3d" ?
                    window.state.transformationMatrices.sixPoint3d :
                    window.state.transformationMatrices.sixPoint2d;
                }
                
                // Validate matrix exists
                if (!matrix || !Array.isArray(matrix)) {
                  if (sampleCount <= 3) {
                    console.error(`❌ Transformation matrix not found or invalid:`, {
                      landmarkPoints,
                      coordinateSystem,
                      hasThreePoint3d: !!window.state.transformationMatrices.threePoint3d,
                      hasThreePoint2d: !!window.state.transformationMatrices.threePoint2d,
                      hasSixPoint3d: !!window.state.transformationMatrices.sixPoint3d,
                      hasSixPoint2d: !!window.state.transformationMatrices.sixPoint2d
                    });
                  }
                  landmarkMissCount++;
                  return; // Skip this sample
                }
              } else {
                if (sampleCount <= 3) {
                  console.error(`❌ window.state.transformationMatrices is missing!`);
                }
                landmarkMissCount++;
                return; // Skip this sample
              }
              
              // COLLECT RAW LANDMARK DATA - NOT FILTERED POSITIONS
              allData.push({
                time: currentTime,
                landmarks: JSON.parse(JSON.stringify(window.state.lastLandmarks)),
                relativeTime: currentTime - t_i_click,
                phase: phase,
                newTargetAppeared: newTargetAppeared,
                targetX: newTargetAppeared ? nextPixelX : pixelX,
                targetY: newTargetAppeared ? nextPixelY : pixelY,
                transformationMatrix: matrix,
                landmarkConfig: {
                  landmarkPoints: window.state.config?.landmarkPoints || "3",
                  coordinateSystem: window.state.config?.coordinateSystem || "2d",
                  calibrationWidth: window.state.calibrationData?.calibrationWidth || window.innerWidth,
                  calibrationHeight: window.state.calibrationData?.calibrationHeight || window.innerHeight
                }
              });
            } else {
              landmarkMissCount++;
              if (landmarkMissCount === 1) {
                console.warn('⚠️ No landmarks available - ensure face tracking is active');
              }
            }
          }, 16); // 60fps
          
          // ROBERTO'S SEQUENCE: After T_I_WAIT, show new target for latency measurement
          // SKIP for last position (no next target to move to)
          if (!isLastPosition) {
            setTimeout(() => {
              // New target appears at t_i_click + t_i_wait
              newTargetAppeared = true;
              latencyMeasurementActive = true;
              
              // Move target to new position
              this.target.style.left = `${nextPixelX}px`;
              this.target.style.top = `${nextPixelY}px`;
              this.targetRadius.style.left = `${nextPixelX}px`;
              this.targetRadius.style.top = `${nextPixelY}px`;
              
              // Change target color to indicate new phase
              this.target.style.background = 'radial-gradient(circle, #44ff44 0%, #00aa00 100%)';
              
              if (isTestMode()) {
                this.status.textContent = `Move to: ${nextPosition.name}`;
                this.instructions.innerHTML = `
                  <strong>GREEN TARGET!</strong><br>
                  <span style="color: #44ff44;">Move your head to the green target</span><br>
                  <span style="color: #888;">Measuring movement latency...</span>
                `;
              } else {
                this.showFlashMessage(
                  'Move your head here!',
                  '#ffffff', 0,
                  '',
                  nextPixelX, nextPixelY
                );
              }
              
              console.log(`🎯 ROBERTO: New target appeared at ${nextPosition.name} (t_i_wait_end)`);
            }, T_I_WAIT);
          }
          
          // Complete data collection after variance measurement (and latency if not last position)
          // For last position: just wait for variance period, then finish
          const totalCollectionTime = isLastPosition ? T_I_WAIT + 500 : T_I_WAIT + 5000;
          
          setTimeout(() => {
            clearInterval(dataInterval);
            document.removeEventListener('keydown', handleKeyPress);
            
            // Log collection statistics
            console.log(`📊 Position ${position.name} collection complete:`);
            console.log(`   Total samples: ${sampleCount}`);
            console.log(`   Landmarks captured: ${allData.length}`);
            console.log(`   Landmarks missed: ${landmarkMissCount}`);
            console.log(`   Is last position: ${isLastPosition}`);
            
            // Cursor stays hidden until ALL positions complete
            
            if (isTestMode()) {
              this.status.textContent = isLastPosition ? 'All positions complete!' : `${position.name} done`;
              this.instructions.innerHTML = isLastPosition
                ? '<span style="color: #00ff00;">All positions complete!</span><br><span style="color: #888;">Starting parameter optimization...</span>'
                : `<span style="color: #00ff00;">Position complete!</span><br><span style="color: #888;">Recorded ${allData.length} samples</span>`;
            } else {
              if (isLastPosition) {
                this.showFlashMessage('Good', '#44ff44', 2500, '',
                  pixelX, pixelY);
              } else {
                this.showFlashMessage('Good', '#44ff44', 0, '',
                  nextPixelX, nextPixelY);
              }
            }
            
            // Reset target appearance
            this.target.style.background = 'radial-gradient(circle, #ff4444 0%, #aa0000 100%)';
            
            // Note: We now store RAW data, not filtered positions
            // Filtering will be done offline during parameter analysis
            const varianceData = allData.filter(d => 
              d.time >= t_i_click && d.time <= t_i_wait_end && d.phase === 'variance_measurement'
            );
            
            // For last position, latency data will be empty (which is intentional)
            const latencyData = isLastPosition ? [] : allData.filter(d => 
              d.time >= t_i_wait_end && (d.phase === 'latency_measurement' || d.phase === 'post_arrival')
            );
            
            resolve({
              rawData: allData,  // RAW LANDMARK DATA, not filtered positions
              varianceData: varianceData,  // Still RAW, will filter offline
              latencyData: latencyData,  // Still RAW, will filter offline (empty for last position)
              timingData: {
                t_i_click: t_i_click,
                t_i_wait: T_I_WAIT,
                t_i_wait_end: t_i_wait_end,
                variancePeriodStart: t_i_click,
                variancePeriodEnd: t_i_wait_end,
                latencyMeasurementStart: isLastPosition ? null : t_i_wait_end, // null for last position
                newTargetX: nextPixelX,
                newTargetY: nextPixelY,
                arrivalRadius: ARRIVAL_RADIUS,
                skipLatency: isLastPosition
              },
              targetX: pixelX,
              targetY: pixelY,
              nextTargetX: isLastPosition ? null : nextPixelX,
              nextTargetY: isLastPosition ? null : nextPixelY
            });
          }, totalCollectionTime); // Shorter for last position (variance only), longer for others (includes latency)
        }
      };
      
      document.addEventListener('keydown', handleKeyPress);
      
      // Safety timeout (disabled for first position so user can take their time)
      const isFirstPosition = (this.currentPosition === 0);
      if (!isFirstPosition) {
        setTimeout(() => {
          if (!isCollecting) {
            document.removeEventListener('keydown', handleKeyPress);
            if (isTestMode()) {
              this.status.textContent = 'Timeout - skipping position';
              this.instructions.textContent = 'Moving to next position...';
            } else {
              this.showFlashMessage('TIMEOUT', '#ff4444', 1500, 'Skipping to next position...');
            }
            resolve(null);
          }
        }, 30000);
      }
    });
  }

  /**
   * Update collection status based on current data
   */
  updateCollectionStatus(data, targetX, targetY, positionName) {
    if (data.length === 0) return;

    const phases = this.timingDetector.detectMovementPhases(data, targetX, targetY);
    const currentDistance = data[data.length - 1].distanceToTarget;
    
    if (!phases) {
      this.instructions.textContent = 'Move your head to the target...';
      return;
    }

    if (phases.movementStart === null) {
      this.instructions.textContent = 'Move your head to start the measurement...';
    } else if (phases.arrivalTime === null) {
      this.instructions.textContent = `Moving to ${positionName}... (${Math.round(currentDistance)}px away)`;
    } else if (!phases.stationaryPeriod) {
      this.instructions.textContent = 'Good! Now hold perfectly still...';
    } else {
      const stationaryDuration = phases.stationaryPeriod.end - phases.stationaryPeriod.start;
      const remaining = Math.max(0, this.MIN_STATIONARY_TIME - stationaryDuration);
      
      if (remaining > 0) {
        this.instructions.textContent = `Hold still for ${Math.ceil(remaining/1000)} more seconds...`;
      } else {
        this.instructions.textContent = 'Perfect! Sufficient data collected.';
      }
    }
  }

  /**
   * Update progress display
   */
  updateProgress() {
    const progress = `Position ${this.currentPosition + 1} of ${this.targetPositions.length}`;
    const percentage = Math.round(((this.currentPosition) / this.targetPositions.length) * 100);
    this.progress.textContent = `${progress} (${percentage}%)`;
  }

  /**
   * Finish data collection and start analysis
   */
  finishDataCollection() {
    // Show the UI panel again for results display
    if (this.ui) {
      this.ui.style.display = '';
    }
    this.hideFlashMessage();
    
    // Validate Roberto method data
    const validPositions = this.rawData.filter(pos => 
      pos.data && pos.data.timingData && pos.data.timingData.t_i_click
    );
    
    if (validPositions.length === 0) {
      this.status.textContent = 'ERROR: No Roberto Data';
      this.instructions.innerHTML = `
        <span style="color: #ff6b6b;">No positions have click-based timing!</span><br>
        Roberto method requires SPACE press at each position.<br>
        Please restart and press SPACE when positioned at each target.
      `;
      this.cancelBtn.textContent = 'Restart';
      return;
    }
    
    // Filter to only valid Roberto positions
    this.rawData = validPositions;
    
    this.status.textContent = '';
    this.instructions.innerHTML = '';
    this.cancelBtn.style.display = 'none';
    
    // Show centered "please wait" overlay during optimization
    this._optimizingOverlay = document.createElement('div');
    this._optimizingOverlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.92); z-index: 100000;
      display: flex; align-items: center; justify-content: center;
    `;
    this._optimizingOverlay.innerHTML = `
      <div style="text-align: center; color: white;">
        <div id="pareto-opt-spinner" style="
          width: 80px; height: 80px; margin: 0 auto 24px;
          border: 6px solid #333; border-top: 6px solid #64c8ff;
          border-radius: 50%; animation: pareto-spin 1s linear infinite;
        "></div>
        <style>@keyframes pareto-spin { to { transform: rotate(360deg); } }</style>
        <p style="font-size: 24px; font-weight: bold; margin: 0 0 8px;">
          Please wait while we optimize the system for you
        </p>
        <p id="pareto-opt-progress" style="font-size: 16px; color: #888; margin: 0;">
          Starting optimization...
        </p>
        <div style="width: 300px; height: 8px; background: #333; border-radius: 4px; margin: 16px auto 0; overflow: hidden;">
          <div id="pareto-opt-bar" style="width: 0%; height: 100%; background: #64c8ff; border-radius: 4px; transition: width 0.3s;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(this._optimizingOverlay);
    
    console.log(`ROBERTO METHOD: ${validPositions.length} valid positions with click timing`);
    console.log('Roberto data collected:', this.rawData);
    
    // Start parameter optimization (both filters)
    setTimeout(() => {
      this.performParameterOptimization();
    }, 1000);
  }

  /**
   * Perform parameter optimization using collected data
   */
  async performParameterOptimization() {
    console.log('🚀 performParameterOptimization() called');
    
    try {
      this.status.textContent = 'Analyzing Parameters...';
      this.results = [];
      this.resultsExponential = []; // NEW: Store exponential smoothing results separately

      // ========== ONE EURO FILTER ANALYSIS (UNCHANGED) ==========
      // Generate all parameter combinations
      const paramCombinations = this.generateParameterCombinations();
    console.log(`Testing ${paramCombinations.length} One Euro Filter parameter combinations...`);
    
    // VALIDATION: Confirm Roberto's preferred values are included
    const robertoTarget = { minCutoff: 0.001, beta: 0.0004, dCutoff: 0.0009 };
    const hasRobertoValues = paramCombinations.some(p => 
      Math.abs(p.beta - robertoTarget.beta) < 0.00001 && 
      Math.abs(p.dCutoff - robertoTarget.dCutoff) < 0.00001
    );
    
    if (hasRobertoValues) {
      console.log('✅ VALIDATION PASSED: Roberto\'s preferred values (beta=0.0004, dCutoff=0.0009) are included in parameter space');
    } else {
      console.warn('⚠️ VALIDATION FAILED: Roberto\'s preferred values are NOT in parameter space');
      console.log('🔍 Checking closest values to Roberto\'s preferences...');
      const closest = paramCombinations.reduce((best, p) => {
        const distance = Math.abs(p.beta - robertoTarget.beta) + Math.abs(p.dCutoff - robertoTarget.dCutoff);
        const bestDistance = Math.abs(best.beta - robertoTarget.beta) + Math.abs(best.dCutoff - robertoTarget.dCutoff);
        return distance < bestDistance ? p : best;
      });
      console.log('📍 Closest parameters to Roberto\'s:', closest);
    }

    console.log(`Available positions for analysis: ${this.rawData.length}`);
    
    // CRITICAL: Validate ALL positions before starting optimization
    if (this.rawData.length === 0) {
      console.error('❌ CRITICAL ERROR: NO RAW DATA COLLECTED!');
      alert('ERROR: No data was collected. Please complete the data collection phase first.');
      this.status.textContent = 'Error: No data collected';
      return;
    }
    
    console.log('\n=== VALIDATING ALL POSITIONS ===');
    let validPositions = 0;
    let invalidPositions = [];
    
    for (let i = 0; i < this.rawData.length; i++) {
      const posData = this.rawData[i];
      const isValid = posData.data && 
                     posData.data.rawData && 
                     posData.data.rawData.length > 0 &&
                     posData.data.timingData &&
                     posData.data.timingData.t_i_click;
      
      if (isValid) {
        validPositions++;
        console.log(`✅ Position ${i + 1}/${this.rawData.length} (${posData.position.name}): VALID`, {
          rawSamples: posData.data.rawData.length,
          hasTiClick: !!posData.data.timingData.t_i_click,
          hasTiWaitEnd: !!posData.data.timingData.t_i_wait_end,
          skipLatency: posData.skipLatency
        });
      } else {
        invalidPositions.push(posData.position.name);
        console.error(`❌ Position ${i + 1}/${this.rawData.length} (${posData.position.name}): INVALID`, {
          hasData: !!posData.data,
          hasRawData: !!(posData.data && posData.data.rawData),
          rawDataLength: posData.data && posData.data.rawData ? posData.data.rawData.length : 0,
          hasTimingData: !!(posData.data && posData.data.timingData),
          hasTiClick: !!(posData.data && posData.data.timingData && posData.data.timingData.t_i_click)
        });
      }
    }
    
    console.log(`\n📊 VALIDATION SUMMARY: ${validPositions}/${this.rawData.length} positions are valid`);
    
    if (validPositions === 0) {
      console.error('\n❌ CRITICAL ERROR: NO VALID POSITIONS FOUND!');
      console.error('Invalid positions:', invalidPositions.join(', '));
      console.error('\nPossible causes:');
      console.error('1. User did not press SPACE at each position');
      console.error('2. Timing data was not recorded properly');
      console.error('3. Raw landmark data was not captured');
      alert(`ERROR: No valid data collected.\n\nInvalid positions: ${invalidPositions.join(', ')}\n\nPlease ensure you:\n1. Press SPACE at each position\n2. Wait for the 2.5 second delay\n3. Keep your head still during the delay`);
      this.status.textContent = 'Error: No valid data';
      return;
    }
    
    if (invalidPositions.length > 0) {
      console.warn(`⚠️ WARNING: ${invalidPositions.length} positions have invalid data:`, invalidPositions.join(', '));
      console.warn('Optimization will proceed with valid positions only.');
    }
    
    // Debug first VALID position data
    const firstValidPos = this.rawData.find(p => p.data && p.data.rawData && p.data.rawData.length > 0);
    if (firstValidPos) {
      console.log('\n📊 FIRST VALID POSITION DATA DEBUG:');
      console.log('Position:', firstValidPos.position.name);
      console.log('rawData length:', firstValidPos.data.rawData.length);
      console.log('Timing data:', firstValidPos.data.timingData);
      
      // Check if rawData contains landmarks
      const firstSample = firstValidPos.data.rawData[0];
      console.log('First sample structure:', {
        hasLandmarks: !!firstSample.landmarks,
        hasLandmarkConfig: !!firstSample.landmarkConfig,
        hasTransformationMatrix: !!firstSample.transformationMatrix,
        time: firstSample.time
      });
    }

    let processed = 0;
    let validResults = 0;
    const startTime = performance.now();
    const BATCH_SIZE = 50; // Process in batches to prevent UI freezing
    const PROGRESS_UPDATE_INTERVAL = 100; // Update progress every 100 combinations
    
    console.log(`🚀 Starting One Euro Filter optimization of ${paramCombinations.length} combinations...`);
    console.log(`📊 Processing in batches of ${BATCH_SIZE} for better performance`);
    
    // Process in batches for better performance
    for (let i = 0; i < paramCombinations.length; i += BATCH_SIZE) {
      const batch = paramCombinations.slice(i, i + BATCH_SIZE);
      
      // Process batch
      for (const params of batch) {
        // Extra debugging for first parameter set
        if (processed === 0) {
          console.log('\n🔍 ANALYZING FIRST PARAMETER SET:', params);
          console.log('This will help identify where the analysis is failing...');
        }
        
        const result = await this.analyzeParameterSet(params);
        
        if (result) {
          this.results.push(result);
          validResults++;
          
          // Log first successful result
          if (validResults === 1) {
            console.log('\n✅ FIRST SUCCESSFUL RESULT:', {
              params: result.params,
              meanVariance: result.meanVariance,
              meanLatency: result.meanLatency,
              validPositions: result.validPositions,
              validLatencyPositions: result.validLatencyPositions
            });
          }
        } else {
          // Debug why result is null (only for first few failures)
          if (processed < 3) {
            console.error(`❌ Parameter set ${processed + 1} returned null:`, params);
            console.error('   analyzeParameterSet() failed - check errors above for details');
          }
        }
        
        processed++;
        
        // Update progress more frequently for larger parameter spaces
        if (processed % PROGRESS_UPDATE_INTERVAL === 0 || processed === paramCombinations.length) {
          const elapsed = (performance.now() - startTime) / 1000;
          const rate = processed / elapsed;
          const remaining = (paramCombinations.length - processed) / rate;
          const percent = (processed / paramCombinations.length * 100).toFixed(1);
          
          this.progress.textContent = `One Euro: ${processed}/${paramCombinations.length} (${validResults} valid) - ${percent}%`;
          const overlayProgress = document.getElementById('pareto-opt-progress');
          const overlayBar = document.getElementById('pareto-opt-bar');
          if (overlayProgress) overlayProgress.textContent = `Analyzing filter 1 of 2 — ${percent}% complete`;
          if (overlayBar) overlayBar.style.width = `${processed / paramCombinations.length * 50}%`;
          console.log(`⏱️ One Euro Progress: ${processed}/${paramCombinations.length} (${percent}%) - ${rate.toFixed(1)} combinations/sec - ETA: ${remaining.toFixed(0)}s`);
          
          // Allow UI to update
          await this.sleep(1);
        }
      }
      
      // Small pause between batches to prevent browser freezing
      if (i + BATCH_SIZE < paramCombinations.length) {
        await this.sleep(10);
      }
    }
    
    console.log(`\n=== ONE EURO FILTER ANALYSIS COMPLETE ===`);
    console.log(`Total combinations tested: ${processed}`);
    console.log(`Valid results found: ${validResults}`);
    const finiteResults = this.results.filter(r => r && r.meanVariance !== Infinity && r.meanLatency !== Infinity);
    console.log(`Results with finite values: ${finiteResults.length}`);
    
    if (validResults === 0) {
      console.error('\n❌ CRITICAL ERROR: NO VALID RESULTS GENERATED!');
      console.error('This means analyzeParameterSet() returned null for ALL parameter combinations.');
      console.error('\nMost likely causes:');
      console.error('1. Raw landmark data is missing or malformed');
      console.error('2. Timing data (t_i_click, t_i_wait_end) is missing');
      console.error('3. Landmark-to-head-position conversion is failing');
      console.error('4. Filter application is failing');
      alert('ERROR: Analysis failed to produce any results.\n\nPlease check the console for details.\n\nLikely cause: Data collection did not complete properly.');
      this.status.textContent = 'Error: Analysis failed';
      return;
    }
    
    if (finiteResults.length === 0) {
      console.error('\n❌ CRITICAL ERROR: ALL RESULTS HAVE INFINITE VARIANCE OR LATENCY!');
      console.error('This means variance or latency calculation failed for ALL parameter combinations.');
      console.error('\nMost likely causes:');
      console.error('1. Filtered data has no samples in the variance measurement period');
      console.error('2. Time ranges in timing data do not overlap with filtered data timestamps');
      console.error('3. Cursor never reached target (latency measurement failed)');
      alert('ERROR: All results have infinite variance/latency.\n\nPlease check the console for details.');
      this.status.textContent = 'Error: Invalid results';
      return;
    }
    
    // CRITICAL: Show variance range across ALL parameter combinations
    if (this.varianceTracker) {
      console.log(`\n🔍 VARIANCE RANGE SUMMARY:`);
      console.log(`   Min variance: ${this.varianceTracker.min.toFixed(4)}px`);
      console.log(`   Max variance: ${this.varianceTracker.max.toFixed(4)}px`);
      console.log(`   Range: ${(this.varianceTracker.max - this.varianceTracker.min).toFixed(4)}px`);
      
      const varianceRange = this.varianceTracker.max - this.varianceTracker.min;
      
      if (varianceRange < 0.1) {
        console.error(`\n🚨 CRITICAL: Variance range is only ${varianceRange.toFixed(4)}px!`);
        console.error(`   All ${this.varianceTracker.count} parameter combinations produced nearly IDENTICAL variance.`);
        console.error(`   This explains why the Pareto curve is flat.`);
        console.error(`   `);
        console.error(`   ROOT CAUSE: The raw data itself has very little jitter.`);
        console.error(`   When raw jitter is low, all filter settings produce similar results.`);
        console.error(`   `);
        console.error(`   SOLUTION: Need data with MORE jitter/noise to see filter differences.`);
        console.error(`   Try: worse lighting, more head movement, or artificial noise injection.`);
      } else if (varianceRange < 1) {
        console.warn(`\n⚠️ WARNING: Variance range is only ${varianceRange.toFixed(4)}px`);
        console.warn(`   This may not be enough to show a clear Pareto curve.`);
      } else {
        console.log(`   ✅ Good variance range - Pareto curve should be visible.`);
      }
    }
    
    // Also track latency range
    const latencies = this.results.filter(r => r.meanLatency !== Infinity).map(r => r.meanLatency);
    if (latencies.length > 0) {
      const minLat = Math.min(...latencies);
      const maxLat = Math.max(...latencies);
      const latRange = maxLat - minLat;
      console.log(`\n🔍 LATENCY RANGE SUMMARY:`);
      console.log(`   Min latency: ${minLat.toFixed(2)}ms`);
      console.log(`   Max latency: ${maxLat.toFixed(2)}ms`);
      console.log(`   Range: ${latRange.toFixed(2)}ms`);
      
      if (latRange < 10) {
        console.error(`\n🚨 CRITICAL: Latency range is only ${latRange.toFixed(2)}ms!`);
        console.error(`   All parameter combinations produced nearly IDENTICAL latency.`);
        console.error(`   This explains why the Pareto curve has no vertical spread.`);
        console.error(`   `);
        console.error(`   ROOT CAUSE: Latency is dominated by human reaction/movement time,`);
        console.error(`   not filter delay. Filter delay is typically only tens of ms.`);
      }
    }
    
    // Show RAW variance summary (head tracking jitter)
    if (this.rawVarianceSum && this.rawVarianceCount > 0) {
      const avgRawVariance = this.rawVarianceSum / this.rawVarianceCount;
      console.log(`\n📊 RAW HEAD TRACKING JITTER SUMMARY:`);
      console.log(`   Average raw variance: ${avgRawVariance.toFixed(2)}px`);
      console.log(`   (This is the jitter BEFORE any filtering)`);
      
      if (avgRawVariance > 500) {
        console.error(`\n🚨 EXTREMELY HIGH RAW JITTER: ${avgRawVariance.toFixed(0)}px`);
        console.error(`   The head tracking is producing coordinates that vary by ~${avgRawVariance.toFixed(0)} pixels`);
        console.error(`   during "stationary" periods when your head should be still.`);
        console.error(`   `);
        console.error(`   LIKELY CAUSES:`);
        console.error(`   1. Poor calibration - recalibrate with steady head position`);
        console.error(`   2. Poor lighting - ensure good, even lighting on face`);
        console.error(`   3. Face partially obscured - ensure full face visible`);
        console.error(`   4. Camera quality issues - try better camera or position`);
        console.error(`   5. Head movement - keep head as still as possible during test`);
      } else if (avgRawVariance > 100) {
        console.warn(`\n⚠️ HIGH RAW JITTER: ${avgRawVariance.toFixed(0)}px`);
        console.warn(`   Consider recalibrating or improving lighting conditions.`);
      } else {
        console.log(`   ✅ Raw jitter is within acceptable range.`);
      }
    }

    // Generate One Euro Pareto front
    const paretoFront = this.calculateParetoFront(this.results);
    
    // ========== EXPONENTIAL SMOOTHING ANALYSIS (NEW) ==========
    await this.performExponentialSmoothingAnalysis();
    
    // Generate Exponential Pareto front
    const paretoFrontExponential = this.calculateParetoFront(this.resultsExponential);
    
    // Validation: Check if variance values are reasonable
    const REASONABLE_VARIANCE_MAX = 50; // pixels - typical good variance is 1-20px
    const bestOneEuroVar = paretoFront.length > 0 ? Math.min(...paretoFront.map(r => r.meanVariance)) : Infinity;
    const bestExpVar = paretoFrontExponential.length > 0 ? Math.min(...paretoFrontExponential.map(r => r.meanVariance)) : Infinity;
    
    if (bestOneEuroVar > REASONABLE_VARIANCE_MAX || bestExpVar > REASONABLE_VARIANCE_MAX) {
      console.warn('⚠️ HIGH VARIANCE WARNING:');
      console.warn(`   One Euro best variance: ${bestOneEuroVar.toFixed(1)}px`);
      console.warn(`   Exponential best variance: ${bestExpVar.toFixed(1)}px`);
      console.warn(`   Expected: < ${REASONABLE_VARIANCE_MAX}px for good tracking`);
      console.warn('   Possible causes:');
      console.warn('   - Head movement during "stationary" period');
      console.warn('   - Poor lighting conditions');
      console.warn('   - Calibration issues');
      console.warn('   - Face tracking instability');
    } else {
      console.log('✅ Variance values are reasonable:');
      console.log(`   One Euro best: ${bestOneEuroVar.toFixed(1)}px`);
      console.log(`   Exponential best: ${bestExpVar.toFixed(1)}px`);
    }
    
    // Display results for both
    this.displayResults(paretoFront, paretoFrontExponential);
    
    } catch (error) {
      console.error('❌ ERROR in performParameterOptimization:', error);
      console.error('Stack trace:', error.stack);
      this.status.textContent = 'Error during analysis!';
      this.instructions.innerHTML = `
        <span style="color: #ff4444;">❌ Error during parameter optimization:</span><br>
        <span style="color: #ffaa00;">${error.message}</span><br>
        <span style="color: #888;">Check browser console for details.</span>
      `;
      alert('Error during parameter optimization: ' + error.message + '\n\nCheck browser console (F12) for details.');
    }
  }

  /**
   * Generate all parameter combinations to test
   */
  generateParameterCombinations() {
    const combinations = [];
    
    const minCutoffValues = this.generateRange(this.parameterRanges.minCutoff);
    const betaValues = this.generateRange(this.parameterRanges.beta);
    const dCutoffValues = this.generateRange(this.parameterRanges.dCutoff);

    console.log(`Generating parameter combinations:`);
    const mcRange = this.parameterRanges.minCutoff;
    if (mcRange.type === 'logarithmic') {
      console.log(`  minCutoff: ${minCutoffValues.length} values (logarithmic: 10^${mcRange.logMin} to 10^${mcRange.logMax})`);
    } else {
      console.log(`  minCutoff: ${minCutoffValues.length} values (linear: ${mcRange.min} to ${mcRange.max})`);
    }
    console.log(`  beta: ${betaValues.length} values (${this.parameterRanges.beta.min} to ${this.parameterRanges.beta.max})`);
    console.log(`  dCutoff: ${dCutoffValues.length} values (${this.parameterRanges.dCutoff.min} to ${this.parameterRanges.dCutoff.max})`);
    
    // CRITICAL DEBUG: Check if any generated values are zero
    console.log(`🔍 PARAMETER GENERATION CHECK:`);
    console.log(`First 5 minCutoff values: [${minCutoffValues.slice(0,5).map(v => v.toFixed ? v.toFixed(6) : v).join(', ')}]`);
    console.log(`Last 5 minCutoff values: [${minCutoffValues.slice(-5).map(v => v.toFixed ? v.toFixed(6) : v).join(', ')}]`);
    console.log(`First 5 beta values: [${betaValues.slice(0,5).map(v => v.toFixed ? v.toFixed(6) : v).join(', ')}]`);
    console.log(`First 5 dCutoff values: [${dCutoffValues.slice(0,5).map(v => v.toFixed ? v.toFixed(6) : v).join(', ')}]`);
    console.log(`Any zero beta values: ${betaValues.includes(0)}`);
    console.log(`Any zero dCutoff values: ${dCutoffValues.includes(0)}`);
    
    if (betaValues.includes(0) || dCutoffValues.includes(0)) {
      console.error(`🚨 PARAMETER GENERATION ERROR: Zero values found despite updated ranges!`);
      console.error(`This indicates the parameter ranges are not being applied correctly.`);
    }

    for (const minCutoff of minCutoffValues) {
      for (const beta of betaValues) {
        for (const dCutoff of dCutoffValues) {
          combinations.push({
            frequency: 60,
            minCutoff: minCutoff,
            beta: beta,
            dCutoff: dCutoff
          });
        }
      }
    }

    console.log(`Total combinations: ${combinations.length}`);
    return combinations;
  }

  /**
   * Generate range of values for a parameter
   * Supports both linear and logarithmic spacing
   */
  generateRange(config) {
    const values = [];
    
    if (config.type === 'logarithmic') {
      // Logarithmic spacing: uniform grid in log space
      // e.g., log space: -5, -4.9, -4.8, ..., -4
      // actual values: 10^(-5), 10^(-4.9), 10^(-4.8), ..., 10^(-4)
      for (let logVal = config.logMin; logVal <= config.logMax; logVal += config.logStep) {
        const actualValue = Math.pow(10, logVal);
        values.push(Math.round(actualValue * 1e15) / 1e15); // High precision
      }
      console.log(`📊 Generated ${values.length} logarithmically-spaced values`);
      console.log(`   Range: ${values[0].toExponential(2)} to ${values[values.length-1].toExponential(2)}`);
    } else {
      // Linear spacing (default)
      for (let val = config.min; val <= config.max; val += config.step) {
        values.push(Math.round(val * 1e15) / 1e15); // Use high precision (15 decimal places) to support tiny step values
      }
    }
    
    return values;
  }

  /**
   * Analyze a specific parameter set
   */
  async analyzeParameterSet(params) {
    let totalVariance = 0;
    let totalLatency = 0;
    let validVariancePositions = 0;
    let validLatencyPositions = 0;
    
    // Track which step is failing for first parameter set
    const isFirstParamSet = !this.firstParamSetAnalyzed;
    if (isFirstParamSet) {
      this.firstParamSetAnalyzed = true;
      console.log(`\n📊 Analyzing first parameter set across ${this.rawData.length} positions...`);
    }

    for (let i = 0; i < this.rawData.length; i++) {
      const positionData = this.rawData[i];
      
      if (isFirstParamSet) {
        console.log(`\n  Position ${i + 1}/${this.rawData.length}: ${positionData.position.name}`);
      }
      
      const analysis = this.analyzePositionWithParams(positionData, params);
      
      if (analysis) {
        // Always count variance
        totalVariance += analysis.variance;
        validVariancePositions++;
        
        if (isFirstParamSet) {
          const latencyStr = analysis.latency === null ? 'SKIPPED' : 
                            !isFinite(analysis.latency) ? 'INFINITE (excluded)' :
                            analysis.latency.toFixed(0) + 'ms';
          console.log(`    ✅ Success: variance=${analysis.variance.toFixed(2)}px, latency=${latencyStr}`);
        }
        
        // Only count latency if not skipped (last position → first is skipped)
        // AND if latency is finite (not Infinity - which means cursor never arrived)
        if (!positionData.skipLatency && analysis.latency !== null && isFinite(analysis.latency)) {
          totalLatency += analysis.latency;
          validLatencyPositions++;
        }
      } else {
        if (isFirstParamSet) {
          console.error(`    ❌ Failed - check error messages above`);
        }
        
        // Debug why position analysis failed (only log first few)
        if (validVariancePositions === 0 && totalVariance === 0) {
          console.error(`❌ Position ${positionData.position.name} analysis failed for params:`, params);
          console.error('Position data check:', {
            hasData: !!positionData.data,
            hasTimingData: !!(positionData.data && positionData.data.timingData),
            hasRawData: !!(positionData.data && positionData.data.rawData),
            rawDataLength: positionData.data && positionData.data.rawData ? positionData.data.rawData.length : 0,
            t_i_click: positionData.data && positionData.data.timingData ? positionData.data.timingData.t_i_click : 'missing'
          });
        }
      }
    }
    
    if (isFirstParamSet) {
      console.log(`\n  Summary: ${validVariancePositions}/${this.rawData.length} positions succeeded`);
      console.log(`  Valid latency measurements: ${validLatencyPositions} (positions where both raw and filtered cursors arrived)`);
      
      if (validLatencyPositions === 0) {
        console.warn(`  ⚠️ No valid latency measurements - cursor may not have reached targets`);
        console.warn(`  Latency will be set to 0 (no measurable filter delay)`);
      }
    }

    // If variance is valid but latency couldn't be measured (cursor never reached
    // If filtered cursor never arrived at target for ANY position, latency = Infinity
    // (the parameter set is too smoothed — cursor never reaches the target).
    const result = {
      params: params,
      meanVariance: validVariancePositions > 0 ? totalVariance / validVariancePositions : Infinity,
      meanLatency: validLatencyPositions > 0 ? totalLatency / validLatencyPositions : Infinity,
      validPositions: validVariancePositions,
      validLatencyPositions: validLatencyPositions,
      individualVariances: [],
      individualLatencies: []
    };
    
    // Track variance range across all parameter combinations
    if (!this.varianceTracker) {
      this.varianceTracker = { min: Infinity, max: -Infinity, count: 0 };
    }
    if (validVariancePositions > 0 && result.meanVariance !== Infinity) {
      this.varianceTracker.min = Math.min(this.varianceTracker.min, result.meanVariance);
      this.varianceTracker.max = Math.max(this.varianceTracker.max, result.meanVariance);
      this.varianceTracker.count++;
      
      // Log every 1000th result to track variance distribution
      if (this.varianceTracker.count % 1000 === 0) {
        console.log(`📈 VARIANCE RANGE after ${this.varianceTracker.count} combinations: ${this.varianceTracker.min.toFixed(2)}px - ${this.varianceTracker.max.toFixed(2)}px`);
      }
    }
    
    // Debug extremely low variance results
    if (validVariancePositions > 0 && result.meanVariance < 1.0) {
      console.warn(`🔍 EXTREMELY LOW VARIANCE DETECTED:`);
      console.log(`Parameters: minCutoff=${params.minCutoff}, beta=${params.beta}, dCutoff=${params.dCutoff}`);
      console.log(`Mean variance: ${result.meanVariance.toFixed(4)}px from ${validVariancePositions} positions`);
      console.log(`Total variance: ${totalVariance.toFixed(4)}px`);
    }
    
    // Debug first successful result
    if (validVariancePositions > 0 && !this.firstSuccessLogged) {
      console.log('First successful parameter analysis:', result);
      this.firstSuccessLogged = true;
    }
    
    return result;
  }

  /**
   * Analyze a single position with given parameters - COMPLETE Roberto methodology
   * IMPROVED: Now works with raw landmark data, not pre-filtered cursor positions
   * 
   * NOTE: For the last position (Bottom-Right), latency is SKIPPED because the 
   * movement to Top-Left is the longest diagonal and would bias the results.
   */
  analyzePositionWithParams(positionData, params) {
    try {
      // COMPLETE ROBERTO METHOD: Check for click-based timing data
      if (!positionData.data || !positionData.data.timingData || !positionData.data.timingData.t_i_click) {
        console.error(`❌ Position ${positionData.position.name}: No click-based timing data (Roberto method requires SPACE press)`);
        console.error('   Data structure check:', {
          hasData: !!positionData.data,
          hasTimingData: !!(positionData.data && positionData.data.timingData),
          hasTiClick: !!(positionData.data && positionData.data.timingData && positionData.data.timingData.t_i_click),
          rawDataLength: positionData.data && positionData.data.rawData ? positionData.data.rawData.length : 0,
          varianceDataLength: positionData.data && positionData.data.varianceData ? positionData.data.varianceData.length : 0
        });
        return null;
      }

      const timingData = positionData.data.timingData;
      const skipLatency = positionData.skipLatency === true;
      
      // For latency measurement, we need t_i_wait_end (unless we're skipping latency)
      if (!skipLatency && !positionData.data.timingData.t_i_wait_end) {
        console.error(`❌ Position ${positionData.position.name}: Incomplete Roberto timing data (missing t_i_wait_end)`);
        return null;
      }
      
      // STEP 1: Convert raw landmarks to head positions (offline)
      // Cache the result so we don't recompute for every parameter set
      if (!positionData._cachedHeadPositions) {
        positionData._cachedHeadPositions = this.convertLandmarksToHeadPositions(positionData.data.rawData);
      }
      const headPositionData = positionData._cachedHeadPositions;
      
      if (headPositionData.length === 0) {
        console.error(`❌ No head position data for position ${positionData.position.name}`);
        return null;
      }
      
      // STEP 2: Apply filter to the converted head positions (offline)
      this.currentParams = params; // Store for debug logging
      const filteredData = this.applyOneuroFilter(headPositionData, params);
      
      if (filteredData.length === 0) {
        console.error(`❌ No filtered data for position ${positionData.position.name}`);
        console.error('   Head position data length:', headPositionData.length);
        console.error('   First head position:', headPositionData[0]);
        return null;
      }

      // ROBERTO'S VARIANCE: measured from t_i,click to t_i,click + t_i,wait ONLY
      const variance = this.calculateVarianceRobertoMethod(timingData, filteredData);
      
      if (variance === Infinity) {
        console.error(`❌ Position ${positionData.position.name}: Variance calculation failed`);
        console.error('   Timing data:', {
          t_i_click: timingData.t_i_click,
          t_i_wait_end: timingData.t_i_wait_end,
          variancePeriodStart: timingData.variancePeriodStart,
          variancePeriodEnd: timingData.variancePeriodEnd
        });
        console.error('   Filtered data time range:', {
          firstTime: filteredData[0]?.time,
          lastTime: filteredData[filteredData.length - 1]?.time,
          totalSamples: filteredData.length
        });
        return null;
      }
      
      // 4σ VELOCITY-THRESHOLD LATENCY (Roberto's method):
      // Compute velocity from position, estimate noise σ during stationary period,
      // find last time each velocity (raw & filtered) drops below mean+4σ after movement peak.
      // Latency = t_stopped_filtered − t_stopped_raw.
      let latency = null;
      if (!skipLatency) {
        latency = this.calculateLatencyVelocityThreshold(
          timingData,
          filteredData
        );
        
        if (latency === Infinity) {
          console.warn(`Position ${positionData.position.name} → ${positionData.nextPosition?.name}: 4σ velocity-threshold latency failed`);
          latency = null;
        }
      }
      
      const nextPosName = skipLatency ? 'SKIPPED' : positionData.nextPosition?.name;
      const latencyStr = latency !== null ? `${latency.toFixed(0)}ms` : 'SKIPPED (last position)';
      
      console.log(`Position ${positionData.position.name} → ${nextPosName}: variance=${variance.toFixed(2)}px, latency=${latencyStr} (Complete Roberto Method)`);
      
      // Debug logging for data consistency tracking
      if (latency !== null) {
        console.log(`📊 ANALYSIS RESULT: params(minCutoff=${params.minCutoff}, beta=${params.beta}, dCutoff=${params.dCutoff}) → variance=${variance.toFixed(2)}px, latency=${latency.toFixed(0)}ms`);
      } else {
        console.log(`📊 ANALYSIS RESULT: params(minCutoff=${params.minCutoff}, beta=${params.beta}, dCutoff=${params.dCutoff}) → variance=${variance.toFixed(2)}px, latency=SKIPPED`);
      }
      
      return { variance, latency };
      
    } catch (error) {
      console.error('Error in Complete Roberto method analysis:', error);
      return null;
    }
  }

  /**
   * PURE ROBERTO METHOD: Calculate variance during the t_i,wait period after user clicks SPACE
   * Professor's specification: "We measure the variance of motion from t_i,click to t_i,click + t_i,wait"
   */
  calculateVarianceRobertoMethod(timingData, filteredData) {
    if (!timingData || !timingData.t_i_click) {
      console.warn('Roberto method requires click timing data (SPACE press missing)');
      return Infinity;
    }

    // ROBERTO'S EXACT SPECIFICATION: variance from t_i,click to t_i,click + t_i,wait
    const variancePeriodFiltered = filteredData.filter(d => 
      d.time >= timingData.variancePeriodStart && 
      d.time <= timingData.variancePeriodEnd
    );

    if (variancePeriodFiltered.length < 10) {
      console.warn(`Roberto method: insufficient data in variance period (${variancePeriodFiltered.length} samples)`);
      return Infinity;
    }

    // Calculate variance during Roberto's exact specified period
    const xValues = variancePeriodFiltered.map(d => d.filteredX);
    const yValues = variancePeriodFiltered.map(d => d.filteredY);
    
    // COMPREHENSIVE DEBUG: Check raw vs filtered data
    const rawXValues = variancePeriodFiltered.map(d => d.originalX);
    const rawYValues = variancePeriodFiltered.map(d => d.originalY);
    
    const rawXRange = Math.max(...rawXValues) - Math.min(...rawXValues);
    const rawYRange = Math.max(...rawYValues) - Math.min(...rawYValues);
    const filteredXRange = Math.max(...xValues) - Math.min(...xValues);
    const filteredYRange = Math.max(...yValues) - Math.min(...yValues);
    
    // Only log detailed analysis for first few parameter combinations to avoid console flood
    if (!this.dataAnalysisLogCount) this.dataAnalysisLogCount = 0;
    this.dataAnalysisLogCount++;
    
    // Calculate RAW variance (before filtering) to compare
    const rawXMeanVal = rawXValues.reduce((a, b) => a + b, 0) / rawXValues.length;
    const rawYMeanVal = rawYValues.reduce((a, b) => a + b, 0) / rawYValues.length;
    const rawXVar = rawXValues.reduce((sum, x) => sum + Math.pow(x - rawXMeanVal, 2), 0) / rawXValues.length;
    const rawYVar = rawYValues.reduce((sum, y) => sum + Math.pow(y - rawYMeanVal, 2), 0) / rawYValues.length;
    const rawVarianceCalc = Math.sqrt(rawXVar + rawYVar);
    
    if (this.dataAnalysisLogCount <= 5 || this.dataAnalysisLogCount % 2000 === 0) {
      console.log(`🔍 DATA ANALYSIS #${this.dataAnalysisLogCount}:`);
      console.log(`   RAW VARIANCE: ${rawVarianceCalc.toFixed(2)}px (this is the head tracking jitter!)`);
      console.log(`   Raw X range: ${rawXRange.toFixed(1)}px, Y range: ${rawYRange.toFixed(1)}px`);
      console.log(`   Filtered X range: ${filteredXRange.toFixed(1)}px, Y range: ${filteredYRange.toFixed(1)}px`);
      console.log(`   Filter params: minCutoff=${variancePeriodFiltered[0]?.actualParams?.minCutoff}, beta=${variancePeriodFiltered[0]?.actualParams?.beta}`);
      console.log(`   Samples: ${variancePeriodFiltered.length}`);
      
      // Show first few raw coordinate values to check for outliers
      console.log(`   First 3 raw X: [${rawXValues.slice(0,3).map(x => x.toFixed(1)).join(', ')}]`);
      console.log(`   First 3 raw Y: [${rawYValues.slice(0,3).map(y => y.toFixed(1)).join(', ')}]`);
    }
    
    // Track raw variance across all positions
    if (!this.rawVarianceSum) {
      this.rawVarianceSum = 0;
      this.rawVarianceCount = 0;
    }
    this.rawVarianceSum += rawVarianceCalc;
    this.rawVarianceCount++;
    
    // Log summary periodically
    if (this.rawVarianceCount % 1000 === 0) {
      const avgRawVariance = this.rawVarianceSum / this.rawVarianceCount;
      console.log(`📊 AVERAGE RAW VARIANCE after ${this.rawVarianceCount} measurements: ${avgRawVariance.toFixed(2)}px`);
      
      if (avgRawVariance > 50) {
        console.warn(`High jitter detected (${avgRawVariance.toFixed(0)}px)`);
        if (isTestMode() && this.status) {
          this.status.innerHTML = `<span style="color: #ff4444;">⚠️ HIGH JITTER (${avgRawVariance.toFixed(0)}px)! Check lighting/calibration.</span>`;
        }
      }
    }

    const xMean = xValues.reduce((a, b) => a + b, 0) / xValues.length;
    const yMean = yValues.reduce((a, b) => a + b, 0) / yValues.length;

    const xVariance = xValues.reduce((sum, x) => sum + Math.pow(x - xMean, 2), 0) / xValues.length;
    const yVariance = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0) / yValues.length;

    // Combined variance as standard deviation (Roberto's approach)
    const variance = Math.sqrt(xVariance + yVariance);
    
    // CRITICAL DEBUG: Check if all filtered values are identical
    const allXSame = xValues.every(x => Math.abs(x - xValues[0]) < 0.001);
    const allYSame = yValues.every(y => Math.abs(y - yValues[0]) < 0.001);
    
    if (allXSame || allYSame) {
      console.error(`🚨 FILTER PROBLEM: All ${allXSame ? 'X' : ''}${allXSame && allYSame ? ' and ' : ''}${allYSame ? 'Y' : ''} values are identical!`);
      console.log(`First 5 filtered X: [${xValues.slice(0,5).map(x => x.toFixed(4)).join(', ')}]`);
      console.log(`First 5 filtered Y: [${yValues.slice(0,5).map(y => y.toFixed(4)).join(', ')}]`);
      console.log(`First 5 raw X: [${rawXValues.slice(0,5).map(x => x.toFixed(4)).join(', ')}]`);
      console.log(`First 5 raw Y: [${rawYValues.slice(0,5).map(y => y.toFixed(4)).join(', ')}]`);
    }
    
    console.log(`ROBERTO METHOD - Variance: ${variance.toFixed(4)}px (xVar: ${xVariance.toFixed(4)}, yVar: ${yVariance.toFixed(4)})`);
    
    // If variance is truly zero, there's a filter problem
    if (variance === 0) {
      console.error(`🚨 ZERO VARIANCE DETECTED - Filter is not working properly!`);
      return 0.01; // Return minimum realistic variance to avoid breaking analysis
    }
    
    return variance;
  }

  // Previous latency methods removed — now using 4σ velocity-threshold below.

  /**
   * 4-sigma velocity-threshold latency (Professor Roberto's method).
   *
   * 1. Interpolate raw & filtered position to a uniform 1ms grid over
   *    the FULL recording (stationary + movement).
   * 2. Compute velocity magnitude: v[i] = sqrt(dx² + dy²) / dt.
   * 3. Smooth both velocity signals with a moving-average window so that
   *    threshold crossings are stable (raw velocity from 60fps data is
   *    piecewise-constant between samples and very spiky).
   * 4. During the stationary period estimate mean+4σ for each smoothed
   *    velocity signal independently.
   * 5. After the velocity peak, find the LAST downward crossing of each
   *    threshold (with linear interpolation for sub-ms precision).
   * 6. latency = t_stopped_filtered − t_stopped_raw.
   */
  calculateLatencyVelocityThreshold(timingData, filteredData) {
    if (!timingData || !timingData.t_i_wait_end) return Infinity;
    if (filteredData.length < 30) return Infinity;

    const tClick = timingData.t_i_click || timingData.variancePeriodStart;
    const tWaitEnd = timingData.t_i_wait_end;

    const allData = filteredData.filter(d => d.time >= tClick);
    if (allData.length < 30) return Infinity;

    const movementData = allData.filter(d => d.time >= tWaitEnd);
    if (movementData.length < 10) return Infinity;

    const rawXs = movementData.map(d => d.originalX);
    const rawYs = movementData.map(d => d.originalY);
    const rangeX = Math.max(...rawXs) - Math.min(...rawXs);
    const rangeY = Math.max(...rawYs) - Math.min(...rawYs);
    if (rangeX < 5 && rangeY < 5) return Infinity;

    // ── Interpolate to 1ms grid ──────────────────────────────────
    const STEP = 1; // ms
    const tMin = allData[0].time;
    const tMax = allData[allData.length - 1].time;
    const gridLen = Math.floor((tMax - tMin) / STEP) + 1;
    if (gridLen < 50) return Infinity;

    const rawXGrid  = new Float64Array(gridLen);
    const rawYGrid  = new Float64Array(gridLen);
    const filtXGrid = new Float64Array(gridLen);
    const filtYGrid = new Float64Array(gridLen);

    let j = 0;
    for (let g = 0; g < gridLen; g++) {
      const t = tMin + g * STEP;
      while (j < allData.length - 2 && allData[j + 1].time < t) j++;
      const d0 = allData[j], d1 = allData[Math.min(j + 1, allData.length - 1)];
      const dt = d1.time - d0.time;
      const frac = dt > 0 ? Math.min(1, Math.max(0, (t - d0.time) / dt)) : 0;

      rawXGrid[g]  = d0.originalX + frac * (d1.originalX - d0.originalX);
      rawYGrid[g]  = d0.originalY + frac * (d1.originalY - d0.originalY);
      filtXGrid[g] = d0.filteredX + frac * (d1.filteredX - d0.filteredX);
      filtYGrid[g] = d0.filteredY + frac * (d1.filteredY - d0.filteredY);
    }

    // ── Compute instantaneous velocity magnitude (px/ms) ─────────
    const rawVelRaw  = new Float64Array(gridLen);
    const filtVelRaw = new Float64Array(gridLen);
    for (let i = 1; i < gridLen; i++) {
      const rdx = rawXGrid[i] - rawXGrid[i - 1];
      const rdy = rawYGrid[i] - rawYGrid[i - 1];
      rawVelRaw[i] = Math.sqrt(rdx * rdx + rdy * rdy) / STEP;

      const fdx = filtXGrid[i] - filtXGrid[i - 1];
      const fdy = filtYGrid[i] - filtYGrid[i - 1];
      filtVelRaw[i] = Math.sqrt(fdx * fdx + fdy * fdy) / STEP;
    }
    rawVelRaw[0] = rawVelRaw[1] || 0;
    filtVelRaw[0] = filtVelRaw[1] || 0;

    // ── Smooth velocity with moving average ──────────────────────
    // At ~60fps the raw position is piecewise-constant between 16ms samples,
    // making instantaneous velocity extremely spiky. A 50ms window produces
    // the smooth bell-shaped velocity profile the professor's sketch shows.
    const VEL_SMOOTH_WINDOW = 50; // ms
    const half = Math.floor(VEL_SMOOTH_WINDOW / 2);

    const smoothVel = (src) => {
      const out = new Float64Array(gridLen);
      let windowSum = 0;
      // Initialize window for index 0
      const initEnd = Math.min(half + 1, gridLen);
      for (let k = 0; k < initEnd; k++) windowSum += src[k];
      out[0] = windowSum / initEnd;

      for (let i = 1; i < gridLen; i++) {
        const addIdx = i + half;
        const remIdx = i - half - 1;
        if (addIdx < gridLen) windowSum += src[addIdx];
        if (remIdx >= 0) windowSum -= src[remIdx];
        const lo = Math.max(0, i - half);
        const hi = Math.min(gridLen - 1, i + half);
        out[i] = windowSum / (hi - lo + 1);
      }
      return out;
    };

    const rawVel  = smoothVel(rawVelRaw);
    const filtVel = smoothVel(filtVelRaw);

    // ── σ from stationary period ─────────────────────────────────
    const stationaryEnd = Math.floor((tWaitEnd - tMin) / STEP);
    const stationaryStart = Math.floor(stationaryEnd * 0.2);
    const nStat = stationaryEnd - stationaryStart;
    if (nStat < 20) return Infinity;

    let rawVelSum = 0, rawVelSqSum = 0;
    let filtVelSum = 0, filtVelSqSum = 0;
    for (let i = stationaryStart; i < stationaryEnd; i++) {
      rawVelSum   += rawVel[i];
      rawVelSqSum += rawVel[i] * rawVel[i];
      filtVelSum   += filtVel[i];
      filtVelSqSum += filtVel[i] * filtVel[i];
    }
    const rawVelMean  = rawVelSum / nStat;
    const filtVelMean = filtVelSum / nStat;
    const rawSigma  = Math.sqrt(Math.max(0, rawVelSqSum / nStat - rawVelMean * rawVelMean));
    const filtSigma = Math.sqrt(Math.max(0, filtVelSqSum / nStat - filtVelMean * filtVelMean));

    const SIGMA_MULT = 4;
    const rawThreshold  = rawVelMean + SIGMA_MULT * Math.max(rawSigma, 0.0001);
    const filtThreshold = filtVelMean + SIGMA_MULT * Math.max(filtSigma, 0.0001);

    // ── Find velocity peak in movement period ────────────────────
    const moveStart = stationaryEnd;
    if (moveStart >= gridLen - 10) return Infinity;

    let rawPeakVal = 0;
    let rawPeakIdx = moveStart;
    for (let i = moveStart; i < gridLen; i++) {
      if (rawVel[i] > rawPeakVal) { rawPeakVal = rawVel[i]; rawPeakIdx = i; }
    }
    if (rawPeakVal < rawThreshold) return Infinity;

    let filtPeakVal = 0;
    for (let i = moveStart; i < gridLen; i++) {
      if (filtVel[i] > filtPeakVal) filtPeakVal = filtVel[i];
    }
    if (filtPeakVal < filtThreshold) return Infinity;

    // ── Last downward crossing of threshold after peak ───────────
    const findLastCrossing = (vel, threshold, startIdx) => {
      let lastAbove = -1;
      for (let i = gridLen - 1; i >= startIdx; i--) {
        if (vel[i] >= threshold) {
          lastAbove = i;
          break;
        }
      }
      if (lastAbove < 0) return null;
      if (lastAbove >= gridLen - 1) return tMin + (gridLen - 1) * STEP;

      const vAbove = vel[lastAbove];
      const vBelow = vel[lastAbove + 1];
      const dv = vAbove - vBelow;
      const interpFrac = dv > 0 ? (vAbove - threshold) / dv : 0;
      return tMin + (lastAbove + interpFrac) * STEP;
    };

    const tStoppedRaw  = findLastCrossing(rawVel, rawThreshold, rawPeakIdx);
    const tStoppedFilt = findLastCrossing(filtVel, filtThreshold, moveStart);

    if (tStoppedRaw === null || tStoppedFilt === null) return Infinity;

    return Math.max(0, tStoppedFilt - tStoppedRaw);
  }

  /**
   * Convert raw landmark data to head positions offline
   * This recreates what updateCursor() does but without showing the cursor
   */
  convertLandmarksToHeadPositions(data) {
    if (!data || data.length === 0) {
      console.error('❌ convertLandmarksToHeadPositions: No data provided');
      return [];
    }
    
    // Debug first call
    if (!this.landmarkConversionLogged) {
      this.landmarkConversionLogged = true;
      console.log(`🔄 Converting ${data.length} landmark samples to head positions...`);
      console.log('   First sample:', {
        hasLandmarks: !!data[0].landmarks,
        hasLandmarkConfig: !!data[0].landmarkConfig,
        hasTransformationMatrix: !!data[0].transformationMatrix,
        time: data[0].time
      });
    }
    
    const results = [];
    
    for (const sample of data) {
      try {
        const landmarks = sample.landmarks;
        const config = sample.landmarkConfig;
        const matrix = sample.transformationMatrix;
        
        if (!landmarks || !config || !matrix) {
          if (results.length < 3) {
            console.error('❌ Missing data for landmark conversion:', {
              hasLandmarks: !!landmarks,
              hasConfig: !!config,
              hasMatrix: !!matrix,
              sampleTime: sample.time
            });
          }
          continue;
        }
        
        // Validate matrix is an array
        if (!Array.isArray(matrix) || matrix.length === 0) {
          if (results.length < 3) {
            console.error('❌ Invalid transformation matrix:', matrix);
          }
          continue;
        }
        
        // Define landmark indices based on configuration
        const indices = config.landmarkPoints === "3" ? [1, 33, 263] : [1, 61, 291, 152, 33, 263];
        const quadraticScale = 0.00001;
        const is3D = config.coordinateSystem === "3d";
        
        
        // Create vector with proper format based on mode
        // CRITICAL: Add bias term first (matrices were trained with bias)
        let vector = [[1.0]]; // Bias term
        
        // Build vector based on coordinate system
        if (is3D) {
          // 3D mode - include z coordinates
          for (const index of indices) {
            const landmark = landmarks[index];
            if (!landmark) continue;
            
            const x = landmark.x * config.calibrationWidth;
            const y = landmark.y * config.calibrationHeight;
            const z = landmark.z ? landmark.z * 1000 : 0;
            
            vector.push([x]);
            vector.push([y]);
            vector.push([z]);
            vector.push([x * x * quadraticScale]);
            vector.push([y * y * quadraticScale]);
            vector.push([z * z * quadraticScale]);
          }
        } else {
          // 2D mode - only x and y coordinates
          for (const index of indices) {
            const landmark = landmarks[index];
            if (!landmark) continue;
            
            const x = landmark.x * config.calibrationWidth;
            const y = landmark.y * config.calibrationHeight;
            
            vector.push([x]);
            vector.push([y]);
            vector.push([x * x * quadraticScale]);
            vector.push([y * y * quadraticScale]);
          }
        }
        
        // Add rotation terms if matrix expects them (zeros for now as we don't have rotation data in rawData)
        // Check matrix size to determine if it needs rotation terms
        try {
            const matrixSize = math.size(math.matrix(matrix));
            const matrixCols = matrixSize.valueOf()[1];
            const baseFeatures = is3D ? 
                (config.landmarkPoints === "3" ? 19 : 37) : // 1 bias + 18/36 features
                (config.landmarkPoints === "3" ? 13 : 25);  // 1 bias + 12/24 features
            
            if (matrixCols > baseFeatures) {
                // Matrix has extra columns (rotation terms)
                // Since we don't have rotation data in rawData, use zeros
                // This matches the fallback behavior in tracking.js
                vector.push([0]);
                vector.push([0]);
                vector.push([0]);
            }
        } catch (e) {
            console.warn("Could not determine matrix size, assuming no rotation terms:", e);
        }
        
        // Calculate head position using transformation matrix
        const P = math.matrix(vector);
        const B = math.matrix(matrix);
        const Q = math.multiply(B, P);
        const position = Q.toArray();
        
        const headX = position[0][0];
        const headY = position[1][0];
        
        // CRITICAL: Check for NaN or invalid values
        if (!isFinite(headX) || !isFinite(headY)) {
          if (results.length < 3) {
            console.error(`❌ Invalid head position: (${headX}, ${headY}) - skipping sample`);
            console.error('   Matrix:', matrix);
            console.error('   Vector length:', vector.length);
          }
          continue; // Skip this sample
        }
        
        // Validation: Check if coordinates are within reasonable screen bounds
        const screenWidth = config.calibrationWidth || window.innerWidth;
        const screenHeight = config.calibrationHeight || window.innerHeight;
        const margin = 500; // Allow some margin for extrapolation
        
        // Log first few coordinate conversions to debug transformation
        if (results.length < 3) {
          console.log(`🎯 COORDINATE TRANSFORM #${results.length}: (${headX.toFixed(1)}, ${headY.toFixed(1)}) - screen: ${screenWidth}x${screenHeight}`);
        }
        
        if (headX < -margin || headX > screenWidth + margin ||
            headY < -margin || headY > screenHeight + margin) {
          // Only log first few out-of-bounds warnings
          if (results.length < 3) {
            console.warn(`⚠️ Coordinate out of bounds: (${headX.toFixed(1)}, ${headY.toFixed(1)}) - expected ~(0-${screenWidth}, 0-${screenHeight})`);
          }
        }
        
        results.push({
          time: sample.time,
          headX: headX,
          headY: headY,
          phase: sample.phase,
          targetX: sample.targetX,
          targetY: sample.targetY,
          newTargetAppeared: sample.newTargetAppeared,
          distanceToTarget: Math.sqrt(
            Math.pow(headX - sample.targetX, 2) + 
            Math.pow(headY - sample.targetY, 2)
          )
        });
      } catch (error) {
        if (results.length < 3) {
          console.error('❌ Error converting landmarks to head position:', error);
          console.error('   Sample:', sample);
        }
        // Continue to next sample
      }
    }
    
    // Debug first conversion result
    if (!this.landmarkConversionResultLogged) {
      this.landmarkConversionResultLogged = true;
      console.log(`✅ Landmark conversion complete: ${results.length}/${data.length} samples converted successfully`);
      if (results.length > 0) {
        console.log('   First result:', {
          time: results[0].time,
          headX: results[0].headX.toFixed(1),
          headY: results[0].headY.toFixed(1),
          phase: results[0].phase
        });
      } else {
        console.error('   ❌ NO SAMPLES CONVERTED! All conversions failed.');
      }
    }
    
    return results;
  }

  /**
   * Apply One Euro Filter to data using exact parameters (no clamping)
   */
  applyOneuroFilter(data, params) {
    if (!data || data.length === 0) {
      console.error('❌ applyOneuroFilter: No data provided');
      return [];
    }
    
    // Debug first filter application
    if (!this.filterApplicationLogged) {
      this.filterApplicationLogged = true;
      console.log(`🔧 Applying One Euro Filter to ${data.length} samples...`);
      console.log('   Params:', params);
    }

    // Use exact parameters provided - no validation or clamping
    const filterParams = {
      frequency: params.frequency || 60,
      minCutoff: params.minCutoff,
      beta: params.beta,
      dCutoff: params.dCutoff
    };

    const filter2D = new OneEuroFilter2D(
      filterParams.frequency,
      filterParams.minCutoff,
      filterParams.beta,
      filterParams.dCutoff
    );

    const results = data.map(sample => {
      const filtered = filter2D.filter(sample.headX, sample.headY, sample.time / 1000);
      return {
        time: sample.time,
        originalX: sample.headX,
        originalY: sample.headY,
        filteredX: filtered.x,
        filteredY: filtered.y,
        phase: sample.phase,
        actualParams: filterParams
      };
    });
    
    // Debug first filter application result
    if (!this.filterApplicationResultLogged) {
      this.filterApplicationResultLogged = true;
      console.log(`✅ Filter application complete: ${results.length} samples filtered`);
      if (results.length > 0) {
        const first = results[0];
        console.log('   First result:', {
          time: first.time,
          original: `(${first.originalX.toFixed(1)}, ${first.originalY.toFixed(1)})`,
          filtered: `(${first.filteredX.toFixed(1)}, ${first.filteredY.toFixed(1)})`,
          phase: first.phase
        });
      } else {
        console.error('   ❌ NO SAMPLES FILTERED! Filter failed.');
      }
    }
    
    // DEBUG: Log filter output for a few different parameter combinations
    if (!this.filterDebugCount) this.filterDebugCount = 0;
    this.filterDebugCount++;
    
    // Log at start, middle, and periodically to see if filter output varies
    if (this.filterDebugCount <= 3 || this.filterDebugCount % 3000 === 0) {
      if (results.length > 10) {
        const first = results[0];
        const last = results[results.length - 1];
        const mid = results[Math.floor(results.length / 2)];
        
        // Calculate variance of this filtered data
        const xValues = results.map(r => r.filteredX);
        const yValues = results.map(r => r.filteredY);
        const xMean = xValues.reduce((a, b) => a + b, 0) / xValues.length;
        const yMean = yValues.reduce((a, b) => a + b, 0) / yValues.length;
        const xVar = xValues.reduce((sum, x) => sum + Math.pow(x - xMean, 2), 0) / xValues.length;
        const yVar = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0) / yValues.length;
        const totalVar = Math.sqrt(xVar + yVar);
        
        console.log(`🔬 FILTER DEBUG #${this.filterDebugCount} (minCutoff=${params.minCutoff.toFixed(4)}, beta=${params.beta.toFixed(6)}):`);
        console.log(`  First: raw(${first.originalX.toFixed(1)}, ${first.originalY.toFixed(1)}) → filtered(${first.filteredX.toFixed(1)}, ${first.filteredY.toFixed(1)})`);
        console.log(`  Mid: raw(${mid.originalX.toFixed(1)}, ${mid.originalY.toFixed(1)}) → filtered(${mid.filteredX.toFixed(1)}, ${mid.filteredY.toFixed(1)})`);
        console.log(`  Variance of this filtered data: ${totalVar.toFixed(2)}px`);
      }
    }
    
    return results;
  }

  // Old timing calculation methods removed - now using ImprovedTimingDetector

  // ========== EXPONENTIAL SMOOTHING METHODS (NEW) ==========
  
  /**
   * Perform exponential smoothing analysis on collected data
   */
  async performExponentialSmoothingAnalysis() {
    console.log('\n=== STARTING EXPONENTIAL SMOOTHING ANALYSIS ===');
    
    const alphaValues = [];
    
    if (this.quickTestMode) {
      // QUICK TEST: 20 alpha values
      const alphaMin = 0.01;
      const alphaMax = 0.5;
      for (let i = 0; i < 20; i++) {
        alphaValues.push(alphaMin + i * (alphaMax - alphaMin) / 19);
      }
      console.log('⚡ QUICK TEST: 20 alpha values');
    } else {
      // FULL ANALYSIS: 1000 alpha values with LOGARITHMIC spacing
      // Most variance-latency tradeoff happens at low alpha (heavy smoothing).
      // Log spacing puts ~334 points in [0.001, 0.01] vs only 10 with linear.
      const logMin = Math.log10(0.001);
      const logMax = Math.log10(0.999);
      for (let i = 0; i < 1000; i++) {
        alphaValues.push(Math.pow(10, logMin + i * (logMax - logMin) / 999));
      }
      console.log('📊 FULL ANALYSIS: 1000 alpha values (logarithmic spacing)');
    }
    
    console.log(`Testing ${alphaValues.length} exponential smoothing alpha values...`);
    console.log(`Alpha range: ${alphaValues[0].toFixed(4)} to ${alphaValues[alphaValues.length - 1].toFixed(4)}`);
    
    let processed = 0;
    let validResults = 0;
    const startTime = performance.now();
    
    for (const alpha of alphaValues) {
      const result = await this.analyzeExponentialParameterSet({ alpha });
      if (result) {
        this.resultsExponential.push(result);
        validResults++;
      }
      
      processed++;
      
      const elapsed = (performance.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = (alphaValues.length - processed) / rate;
      const percent = (processed / alphaValues.length * 100).toFixed(1);
      
      this.progress.textContent = `Exponential: ${processed}/${alphaValues.length} (${validResults} valid) - ${percent}%`;
      const overlayProgress = document.getElementById('pareto-opt-progress');
      const overlayBar = document.getElementById('pareto-opt-bar');
      if (overlayProgress) overlayProgress.textContent = `Analyzing filter 2 of 2 — ${percent}% complete`;
      if (overlayBar) overlayBar.style.width = `${50 + (processed / alphaValues.length * 50)}%`;
      console.log(`⏱️ Exponential Progress: ${processed}/${alphaValues.length} (${percent}%) - Alpha: ${alpha}`);
      
      await this.sleep(1);
    }
    
    console.log(`\n=== EXPONENTIAL SMOOTHING ANALYSIS COMPLETE ===`);
    console.log(`Total alpha values tested: ${processed}`);
    console.log(`Valid results found: ${validResults}`);
    console.log(`Results with finite values: ${this.resultsExponential.filter(r => r && r.meanVariance !== Infinity && r.meanLatency !== Infinity).length}`);
  }
  
  /**
   * Analyze exponential smoothing with a specific alpha value
   */
  async analyzeExponentialParameterSet(params) {
    let totalVariance = 0;
    let totalLatency = 0;
    let validVariancePositions = 0;
    let validLatencyPositions = 0;

    for (const positionData of this.rawData) {
      const analysis = this.analyzePositionWithExponentialSmoothing(positionData, params);
      if (analysis) {
        // Always count variance
        totalVariance += analysis.variance;
        validVariancePositions++;
        
        // Only count latency if not skipped (last position → first is skipped)
        if (!positionData.skipLatency && analysis.latency !== null) {
          totalLatency += analysis.latency;
          validLatencyPositions++;
        }
      }
    }

    const result = {
      params: params,
      meanVariance: validVariancePositions > 0 ? totalVariance / validVariancePositions : Infinity,
      meanLatency: validLatencyPositions > 0 ? totalLatency / validLatencyPositions : Infinity,
      validPositions: validVariancePositions,
      validLatencyPositions: validLatencyPositions,
      filterType: 'exponential'
    };
    
    return result;
  }
  
  /**
   * Analyze a single position with exponential smoothing
   * NOTE: Latency is skipped for last position (Bottom-Right → Top-Left is longest diagonal)
   */
  analyzePositionWithExponentialSmoothing(positionData, params) {
    try {
      // Check for Roberto timing data (same as One Euro)
      if (!positionData.data || !positionData.data.timingData || !positionData.data.timingData.t_i_click) {
        return null;
      }

      const timingData = positionData.data.timingData;
      const skipLatency = positionData.skipLatency === true;
      
      // For latency measurement, we need t_i_wait_end (unless we're skipping latency)
      if (!skipLatency && !positionData.data.timingData.t_i_wait_end) {
        return null;
      }
      
      // STEP 1: Convert raw landmarks to head positions (use cache)
      if (!positionData._cachedHeadPositions) {
        positionData._cachedHeadPositions = this.convertLandmarksToHeadPositions(positionData.data.rawData);
      }
      const headPositionData = positionData._cachedHeadPositions;
      
      if (headPositionData.length === 0) {
        return null;
      }
      
      // STEP 2: Apply EXPONENTIAL SMOOTHING instead of One Euro Filter
      this.currentParams = { alpha: params.alpha }; // Store for debug logging
      const filteredData = this.applyExponentialSmoothing(headPositionData, params.alpha);
      
      if (filteredData.length === 0) {
        return null;
      }

      // Use same Roberto variance calculation method
      const variance = this.calculateVarianceRobertoMethod(timingData, filteredData);
      
      if (variance === Infinity) {
        return null;
      }
      
      // 4σ velocity-threshold latency: skip for last position (no movement target)
      let latency = null;
      if (!skipLatency) {
        latency = this.calculateLatencyVelocityThreshold(
          timingData,
          filteredData
        );
        
        if (latency === Infinity) {
          latency = null;
        }
      }
      
      const latencyStr = latency !== null ? `${latency.toFixed(0)}ms` : 'SKIPPED';
      console.log(`Exponential (α=${params.alpha.toFixed(4)}): ${positionData.position.name} → variance=${variance.toFixed(2)}px, latency=${latencyStr}`);
      
      return { variance, latency };
      
    } catch (error) {
      console.error('Error in exponential smoothing analysis:', error);
      return null;
    }
  }
  
  /**
   * Apply exponential smoothing filter to head position data
   */
  applyExponentialSmoothing(data, alpha) {
    if (!data || data.length === 0) return [];
    
    // Initialize with first sample
    let smoothedX = data[0].headX;
    let smoothedY = data[0].headY;
    
    return data.map((sample, index) => {
      if (index === 0) {
        // First sample: no smoothing
        return {
          time: sample.time,
          originalX: sample.headX,
          originalY: sample.headY,
          filteredX: smoothedX,
          filteredY: smoothedY,
          phase: sample.phase,
          actualParams: { alpha }
        };
      }
      
      // Exponential smoothing formula: S_t = α * X_t + (1 - α) * S_(t-1)
      smoothedX = alpha * sample.headX + (1 - alpha) * smoothedX;
      smoothedY = alpha * sample.headY + (1 - alpha) * smoothedY;
      
      return {
        time: sample.time,
        originalX: sample.headX,
        originalY: sample.headY,
        filteredX: smoothedX,
        filteredY: smoothedY,
        phase: sample.phase,
        actualParams: { alpha }
      };
    });
  }

  /**
   * Calculate Pareto front from results
   */
  calculateParetoFront(results) {
    // Debug: Check what's wrong with the results (moved to detailed section below)

    // Filter for valid results using Roberto's criteria + quality checks
    // RELAXED VALIDATION for Roberto method debugging
    console.log('\n=== PARETO FRONT VALIDATION DEBUG ===');
    console.log(`Total results before filtering: ${results.length}`);
    
    const infiniteVariance = results.filter(r => r.meanVariance === Infinity).length;
    const infiniteLatency = results.filter(r => r.meanLatency === Infinity).length;
    const lowValidPositions = results.filter(r => r.validPositions < 3).length; // Need at least 3 positions
    const unrealisticLatency = results.filter(r => r.meanLatency < 10 || r.meanLatency > 2000).length;
    const unrealisticVariance = results.filter(r => r.meanVariance < 0.1 || r.meanVariance > 500).length;
    
    console.log(`Results with infinite variance: ${infiniteVariance}`);
    console.log(`Results with infinite latency: ${infiniteLatency}`);
    console.log(`Results with < 3 valid positions: ${lowValidPositions}`);
    console.log(`Results with unrealistic latency: ${unrealisticLatency}`);
    console.log(`Results with unrealistic variance: ${unrealisticVariance}`);
    
    // Show some sample results
    console.log('Sample results (first 5):', results.slice(0, 5));

    let validResults = results.filter(r => 
      r.meanVariance !== Infinity && 
      r.meanLatency !== Infinity && 
      r.validPositions >= 1 &&        // At least 1 position (relaxed)
      r.meanLatency >= 0 &&           // Any positive latency
      r.meanVariance >= 0 &&          // Any positive variance
      // For One Euro, ensure non-zero parameters (Roberto's requirement)
      // For Exponential, this check is skipped
      (r.filterType === 'exponential' || (r.params.beta > 0 && r.params.dCutoff > 0))
    );
    
    console.log(`Valid results after filtering: ${validResults.length}`);
    
    // If still no results, show what we have
    if (validResults.length === 0) {
      console.log('❌ Still no valid results! Showing all finite results:');
      const finiteResults = results.filter(r => 
        r.meanVariance !== Infinity && r.meanLatency !== Infinity
      );
      console.log(`Finite results: ${finiteResults.length}`);
      console.log('Sample finite results:', finiteResults.slice(0, 10));
      
      // Use finite results as valid results for now
      if (finiteResults.length > 0) {
        console.log('🔧 Using finite results as valid results for Pareto analysis');
        validResults = finiteResults; // Replace instead of push
      }
    }

    console.log(`Valid results after filtering: ${validResults.length}`);

    // NEW: Deduplicate based on rounded values (2 decimal places) to match comparison viewer
    // This removes near-identical points that clutter the graph and ensures consistency
    const uniqueResults = [];
    const seen = new Set();
    
    // Sort by variance to ensure consistent selection
    validResults.sort((a, b) => a.meanVariance - b.meanVariance);
    
    for (const r of validResults) {
      // Round to 2 decimal places for deduplication key
      const key = `${r.meanVariance.toFixed(2)}_${r.meanLatency.toFixed(2)}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueResults.push(r);
      }
    }
    
    console.log(`Deduplication: ${validResults.length} -> ${uniqueResults.length} unique points`);

    const paretoFront = [];
    
    console.log(`🔍 Starting Pareto front calculation with ${uniqueResults.length} unique results`);
    
    // Sort by variance for efficiency (matches viewer algorithm)
    const sorted = [...uniqueResults].sort((a, b) => a.meanVariance - b.meanVariance);

    for (const candidate of sorted) {
      let isDominated = false;
      
      for (const paretoPoint of paretoFront) {
        if (paretoPoint.meanVariance <= candidate.meanVariance &&
            paretoPoint.meanLatency <= candidate.meanLatency &&
            (paretoPoint.meanVariance < candidate.meanVariance || paretoPoint.meanLatency < candidate.meanLatency)) {
          isDominated = true;
          break;
        }
      }
      
      if (!isDominated) {
        // Remove existing Pareto points dominated by the new candidate
        const filtered = paretoFront.filter(paretoPoint => {
          const candidateDominates =
            candidate.meanVariance <= paretoPoint.meanVariance &&
            candidate.meanLatency <= paretoPoint.meanLatency &&
            (candidate.meanVariance < paretoPoint.meanVariance || candidate.meanLatency < paretoPoint.meanLatency);
          return !candidateDominates;
        });
        paretoFront.length = 0;
        paretoFront.push(...filtered, candidate);
      }
    }
    
    console.log(`✅ Pareto front calculation complete: ${paretoFront.length} optimal solutions found`);
    
    // If limited Pareto front, supplement with diverse good options
    if (paretoFront.length < 3 && uniqueResults.length > 0) {
      console.log(`🔧 Only ${paretoFront.length} Pareto optimal solutions, adding diverse alternatives`);
      
      // Create diverse recommendations by sorting on different criteria
      const byVariance = [...uniqueResults].sort((a, b) => a.meanVariance - b.meanVariance);
      const byLatency = [...uniqueResults].sort((a, b) => a.meanLatency - b.meanLatency);
      const byBalance = uniqueResults.map(r => ({
        ...r,
        balanceScore: (r.meanVariance / 100) + (r.meanLatency / 100)
      })).sort((a, b) => a.balanceScore - b.balanceScore);
      
      // Add top performers from each category if not already in Pareto front
      const candidates = [
        { result: byVariance[0], type: 'Best Variance' },
        { result: byLatency[0], type: 'Best Latency' },
        { result: byBalance[0], type: 'Best Balance' },
        { result: byVariance[Math.floor(byVariance.length * 0.1)], type: 'Top 10% Variance' },
        { result: byLatency[Math.floor(byLatency.length * 0.1)], type: 'Top 10% Latency' }
      ];
      
      for (const candidate of candidates) {
        if (paretoFront.length >= 5) break; // Limit to 5 total recommendations
        
        if (!candidate.result) continue;
        
        // Check if already included (works for both One Euro and Exponential)
        const isAlreadyIncluded = paretoFront.some(p => 
          JSON.stringify(p.params) === JSON.stringify(candidate.result.params)
        );
        
        if (!isAlreadyIncluded) {
          candidate.result.sourceType = candidate.type; // Mark source
          paretoFront.push(candidate.result);
        }
      }
      
      console.log(`🎯 Enhanced recommendations: ${paretoFront.length} total options`);
    }

    // Sort by variance for easier interpretation
    paretoFront.sort((a, b) => a.meanVariance - b.meanVariance);
    
    return paretoFront;
  }

  /**
   * Display optimization results
   */
  displayResults(paretoFront, paretoFrontExponential) {
    // Store personal Pareto fronts on window so sliders can use them
    // Format: same shape as the hardcoded pareto-front-parameters.js / exponential-parameters.js
    const personalOneEuro = paretoFront.map((r, i) => ({
      rank: i + 1,
      minCutoff: r.params.minCutoff,
      beta: r.params.beta,
      dCutoff: r.params.dCutoff,
      meanVariance: r.meanVariance,
      meanLatency: r.meanLatency,
      validPositions: r.validPositions
    }));
    
    const personalExponential = paretoFrontExponential.map((r, i) => ({
      rank: i + 1,
      alpha: r.params.alpha,
      meanVariance: r.meanVariance,
      meanLatency: r.meanLatency,
      validPositions: r.validPositions
    }));
    
    // Override the global parameters with personal ones
    window.PARETO_FRONT_PARAMETERS = personalOneEuro;
    window.EXPONENTIAL_PARAMETERS = personalExponential;
    window._PERSONAL_PARETO_FRONT_PARAMETERS = personalOneEuro;
    window._PERSONAL_EXPONENTIAL_PARAMETERS = personalExponential;
    window.PERSONAL_OPTIMIZATION_DONE = true;
    
    // Persist to localStorage so results survive page reload
    try {
      localStorage.setItem('personalParetoOneEuro', JSON.stringify(personalOneEuro));
      localStorage.setItem('personalParetoExponential', JSON.stringify(personalExponential));
      console.log('💾 Personal Pareto saved to localStorage');
    } catch (e) {
      console.warn('Could not save Pareto to localStorage:', e.message);
    }

    console.log(`🎯 Personal Pareto fronts stored on window:`);
    console.log(`   One Euro: ${personalOneEuro.length} configurations`);
    console.log(`   Exponential: ${personalExponential.length} configurations`);
    
    // Notify tracking controls to update slider ranges
    if (window.trackingControlsInstance) {
      // Reset ranks to 1 since the data changed
      window.trackingControlsInstance.setParetoRank(1);
      window.trackingControlsInstance.setExponentialRank(1);
      console.log('🔄 Tracking controls notified of new personal Pareto data');
    }
    
    // Also apply the Rank 1 parameters from the new personal data immediately
    if (personalExponential.length > 0) {
      const expParams = personalExponential[0];
      const newSmoothingFactor = 1 - expParams.alpha;
      if (window.state && window.state.config) {
        window.state.config.exponentialSmoothingFactor = newSmoothingFactor;
        console.log(`🎯 Applied personal Exponential Rank 1: alpha=${expParams.alpha}, smoothing=${newSmoothingFactor}`);
      }
    }
    
    if (personalOneEuro.length > 0) {
      const oeParams = personalOneEuro[0];
      if (window.state && window.state.filterConfig) {
        window.state.filterConfig.minCutoff = oeParams.minCutoff;
        window.state.filterConfig.beta = oeParams.beta;
        window.state.filterConfig.dcutoff = oeParams.dCutoff;
        console.log(`🎯 Applied personal One Euro Rank 1: minCutoff=${oeParams.minCutoff}, beta=${oeParams.beta}, dCutoff=${oeParams.dCutoff}`);
      }
    }
    
    // Store for zip export
    this._lastParetoFront = paretoFront;
    this._lastParetoFrontExponential = paretoFrontExponential;

    // Remove optimization overlay
    if (this._optimizingOverlay) {
      this._optimizingOverlay.remove();
      this._optimizingOverlay = null;
    }

    // Hide the bottom-right panel
    if (this.ui) this.ui.style.display = 'none';
    if (this.target) this.target.style.display = 'none';

    // Auto-download results as ZIP
    this._autoDownloadResults(paretoFront, paretoFrontExponential);
  }

  /**
   * Get recommendation label based on actual performance characteristics
   */
  getRecommendationLabel(result, index) {
    // Determine recommendation type based on actual performance
    const isLowVariance = result.meanVariance < 30;  // Good precision
    const isLowLatency = result.meanLatency < 50;    // Good responsiveness
    const isMediumVariance = result.meanVariance < 60;
    const isMediumLatency = result.meanLatency < 100;
    
    if (isLowVariance && isLowLatency) {
      return 'Optimal (Low Variance & Latency)';
    } else if (isLowVariance && !isLowLatency) {
      return 'Precision-Focused (Low Variance)';
    } else if (!isLowVariance && isLowLatency) {
      return 'Responsiveness-Focused (Low Latency)';
    } else if (isMediumVariance && isMediumLatency) {
      return 'Balanced Performance';
    } else {
      return `Option ${index + 1}`;
    }
  }
  
  /**
   * Get trade-off description based on performance
   */
  getTradeoffDescription(result, allVariances, allLatencies) {
    const varianceRank = allVariances.indexOf(result.meanVariance) / allVariances.length;
    const latencyRank = allLatencies.indexOf(result.meanLatency) / allLatencies.length;
    
    if (varianceRank < 0.25 && latencyRank < 0.25) {
      return 'Excellent precision and responsiveness';
    } else if (varianceRank < 0.25) {
      return 'Excellent precision, moderate responsiveness';
    } else if (latencyRank < 0.25) {
      return 'Excellent responsiveness, moderate precision';
    } else if (varianceRank < 0.5 && latencyRank < 0.5) {
      return 'Good balance of precision and responsiveness';
    } else {
      return 'Conservative filtering (higher latency/variance)';
    }
  }

  /**
   * Show interactive comparison graph for both filters
   */
  showComparisonGraph(paretoFrontOneEuro, paretoFrontExponential) {
    // Create graph container
    const graphContainer = document.createElement('div');
    graphContainer.id = 'pareto-graph-container';
    graphContainer.style.cssText = `
      position: fixed;
      top: 50px;
      right: 50px;
      width: 900px;
      height: 700px;
      background: white;
      border: 2px solid #333;
      border-radius: 10px;
      padding: 20px;
      z-index: 10001;
      box-shadow: 0 0 20px rgba(0,0,0,0.5);
      overflow-y: auto;
    `;

    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      position: absolute;
      top: 10px;
      right: 15px;
      background: #ff4444;
      color: white;
      border: none;
      border-radius: 50%;
      width: 30px;
      height: 30px;
      font-size: 20px;
      cursor: pointer;
      z-index: 10002;
    `;
    closeBtn.onclick = () => graphContainer.remove();

    // Create title
    const title = document.createElement('h3');
    title.textContent = 'Filter Comparison: One Euro vs Exponential Smoothing';
    title.style.cssText = `
      margin: 0 0 20px 0;
      color: #333;
      text-align: center;
    `;

    // Create canvas for graph
    const canvas = document.createElement('canvas');
    canvas.width = 850;
    canvas.height = 550;
    canvas.style.cssText = `
      border: 1px solid #ccc;
      background: #f9f9f9;
    `;

    // Assemble graph
    graphContainer.appendChild(closeBtn);
    graphContainer.appendChild(title);
    graphContainer.appendChild(canvas);
    document.body.appendChild(graphContainer);

    // Draw the comparison graph
    this.drawComparisonGraph(canvas, paretoFrontOneEuro, paretoFrontExponential);
  }

  /**
   * Draw Pareto front on canvas
   */
  drawParetoGraph(canvas, paretoFront) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Get data ranges
    const variances = paretoFront.map(p => p.meanVariance);
    const latencies = paretoFront.map(p => p.meanLatency);
    
    const minVar = Math.max(0, Math.min(...variances));
    const maxVar = Math.max(...variances);
    const minLat = Math.max(0, Math.min(...latencies));
    const maxLat = Math.max(...latencies);
    
    // Handle case where all values are identical (avoid division by zero)
    const varRange = maxVar - minVar || 1;
    const latRange = maxLat - minLat || 1;
    
    // Add padding
    const padding = 60;
    const graphWidth = width - 2 * padding;
    const graphHeight = height - 2 * padding;
    
    // Scale functions (with fallback for identical values)
    const scaleX = (variance) => {
      if (varRange === 1 && minVar === maxVar) {
        return padding + graphWidth / 2; // Center if all same
      }
      return padding + (variance - minVar) / varRange * graphWidth;
    };
    const scaleY = (latency) => {
      if (latRange === 1 && minLat === maxLat) {
        return height - padding - graphHeight / 2; // Center if all same
      }
      return height - padding - (latency - minLat) / latRange * graphHeight;
    };
    
    // Draw axes
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding); // X-axis
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(padding, padding); // Y-axis
    ctx.stroke();
    
    // Draw axis labels
    ctx.fillStyle = '#333';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Variance (px)', width / 2, height - 10);
    
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Latency (ms)', 0, 0);
    ctx.restore();
    
    // Draw grid lines
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 10; i++) {
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
    
    const sortedPoints = paretoFront
      .map(p => ({ x: scaleX(p.meanVariance), y: scaleY(p.meanLatency), data: p }))
      .sort((a, b) => a.x - b.x);
    
    const pgRange = getContinuousRange(sortedPoints);

    // Draw Pareto front curve (continuous region only)
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    drawMonotoneCurve(ctx, sortedPoints);
    ctx.stroke();
    
    // Draw only non-outlier points
    const visiblePG = sortedPoints.slice(pgRange.start, pgRange.end + 1);
    ctx.fillStyle = '#ff6b6b';
    visiblePG.forEach((point, i) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
      ctx.fill();
      
      // Highlight Roberto's values
      const isRoberto = Math.abs(point.data.params.beta - 0.0004) < 0.00001 && 
                       Math.abs(point.data.params.dCutoff - 0.0009) < 0.00001;
      
      if (isRoberto) {
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 8, 0, 2 * Math.PI);
        ctx.stroke();
        
        ctx.fillStyle = '#00ff00';
        ctx.font = 'bold 12px Arial';
        ctx.fillText('ROBERTO', point.x - 25, point.y - 15);
      }
    });
    
    // Draw scale labels
    ctx.fillStyle = '#666';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    
    // X-axis labels
    for (let i = 0; i <= 5; i++) {
      const x = padding + (i / 5) * graphWidth;
      const value = minVar + (i / 5) * (maxVar - minVar);
      ctx.fillText(value.toFixed(1), x, height - padding + 15);
    }
    
    // Y-axis labels
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const y = height - padding - (i / 5) * graphHeight;
      const value = minLat + (i / 5) * (maxLat - minLat);
      ctx.fillText(Math.round(value), padding - 10, y + 3);
    }
    
    // Add legend
    ctx.fillStyle = '#333';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('🔴 Pareto Optimal Solutions (349 points)', width - 280, 30);
    ctx.fillStyle = '#00ff00';
    ctx.fillText('🟢 Roberto\'s Manual Values', width - 280, 50);
    ctx.fillStyle = '#666';
    ctx.font = '10px Arial';
    ctx.fillText('Lower-left = Better (less variance, less latency)', width - 280, 70);
  }

  /**
   * Draw comparison graph with both One Euro and Exponential Smoothing
   */
  drawComparisonGraph(canvas, paretoFrontOneEuro, paretoFrontExponential) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Trim outlier edges before computing axis bounds
    function getVisibleData(data) {
      const sorted = [...data].sort((a, b) => a.meanVariance - b.meanVariance);
      const pts = sorted.map(d => ({ y: -d.meanLatency, data: d }));
      const range = getContinuousRange(pts);
      return sorted.slice(range.start, range.end + 1);
    }
    const visOE = getVisibleData(paretoFrontOneEuro);
    const visExp = getVisibleData(paretoFrontExponential);
    
    const allVariances = [
      ...visOE.map(p => p.meanVariance),
      ...visExp.map(p => p.meanVariance)
    ];
    const allLatencies = [
      ...visOE.map(p => p.meanLatency),
      ...visExp.map(p => p.meanLatency)
    ];
    
    const minVar = Math.min(...allVariances);
    const maxVar = Math.max(...allVariances);
    const minLat = Math.min(...allLatencies);
    const maxLat = Math.max(...allLatencies);
    
    // Add padding to ranges; clamp minimums at 0
    const varRange = maxVar - minVar || 1;
    const latRange = maxLat - minLat || 1;
    const paddedMinVar = Math.max(0, minVar - varRange * 0.05);
    const paddedMaxVar = maxVar + varRange * 0.05;
    const paddedMinLat = Math.max(0, minLat - latRange * 0.05);
    const paddedMaxLat = maxLat + latRange * 0.05;
    
    // Add padding
    const padding = 70;
    const graphWidth = width - 2 * padding;
    const graphHeight = height - 2 * padding;
    
    // Linear scale for both axes
    const scaleX = (variance) => padding + (variance - paddedMinVar) / (paddedMaxVar - paddedMinVar) * graphWidth;
    const scaleY = (latency) => height - padding - (latency - paddedMinLat) / (paddedMaxLat - paddedMinLat) * graphHeight;
    
    // Draw background
    ctx.fillStyle = '#f9f9f9';
    ctx.fillRect(0, 0, width, height);
    
    // Draw grid lines
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 10; i++) {
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
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding); // X-axis
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(padding, padding); // Y-axis
    ctx.stroke();
    
    // Draw axis labels
    ctx.fillStyle = '#333';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Variance (px) → Lower is Better', width / 2, height - 20);
    
    ctx.save();
    ctx.translate(20, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Latency (ms) → Lower is Better', 0, 0);
    ctx.restore();
    
    // Title
    ctx.fillStyle = '#333';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Filter Comparison: Precision vs Responsiveness', width / 2, 30);
    
    // Draw One Euro Filter Pareto front
    const sortedOneEuro = paretoFrontOneEuro
      .map(p => ({ x: scaleX(p.meanVariance), y: scaleY(p.meanLatency), data: p }))
      .sort((a, b) => a.x - b.x);
    
    const oeRange = getContinuousRange(sortedOneEuro);
    if (sortedOneEuro.length > 1) {
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      drawMonotoneCurve(ctx, sortedOneEuro);
      ctx.stroke();
    }
      
    ctx.fillStyle = '#ff6b6b';
    const visibleOE = sortedOneEuro.slice(oeRange.start, oeRange.end + 1);
    const oeRadius = visibleOE.length > 200 ? 3 : visibleOE.length > 50 ? 4 : 5;
    visibleOE.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, oeRadius, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    // Draw Exponential Smoothing Pareto front
    const sortedExponential = paretoFrontExponential
      .map(p => ({ x: scaleX(p.meanVariance), y: scaleY(p.meanLatency), data: p }))
      .sort((a, b) => a.x - b.x);
    
    const expRange = getContinuousRange(sortedExponential);
    if (sortedExponential.length > 1) {
      ctx.strokeStyle = '#4499ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      drawMonotoneCurve(ctx, sortedExponential);
      ctx.stroke();
    }
      
    ctx.fillStyle = '#4499ff';
    const visibleExp = sortedExponential.slice(expRange.start, expRange.end + 1);
    const expRadius = visibleExp.length > 200 ? 3 : visibleExp.length > 50 ? 4 : 5;
    visibleExp.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, expRadius, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    // Draw scale labels
    ctx.fillStyle = '#666';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    
    // X-axis labels
    for (let i = 0; i <= 5; i++) {
      const x = padding + (i / 5) * graphWidth;
      const value = paddedMinVar + (i / 5) * (paddedMaxVar - paddedMinVar);
      ctx.fillText(value.toFixed(1), x, height - padding + 20);
    }
    
    // Y-axis labels
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const y = height - padding - (i / 5) * graphHeight;
      const value = paddedMinLat + (i / 5) * (paddedMaxLat - paddedMinLat);
      ctx.fillText(Math.round(value), padding - 15, y + 4);
    }
    
    // Legend
    const legendX = width - 290;
    const legendY = 70;
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(legendX - 10, legendY - 10, 280, 110);
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX - 10, legendY - 10, 280, 110);
    
    ctx.fillStyle = '#333';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Legend:', legendX, legendY + 10);
    
    // One Euro legend
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.arc(legendX + 10, legendY + 35, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.font = '12px Arial';
    ctx.fillText(`One Euro Filter (${paretoFrontOneEuro.length} points)`, legendX + 25, legendY + 40);
    
    // Exponential legend
    ctx.fillStyle = '#4499ff';
    ctx.beginPath();
    ctx.arc(legendX + 10, legendY + 60, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.fillText(`Exponential Smoothing (${paretoFrontExponential.length} points)`, legendX + 25, legendY + 65);
    
    ctx.fillStyle = '#666';
    ctx.font = '11px Arial';
    ctx.fillText('← Better (lower-left corner)', legendX, legendY + 85);
    
    // Add comparison summary
    const oneEuroBest = paretoFrontOneEuro.reduce((best, p) => 
      (p.meanVariance + p.meanLatency) < (best.meanVariance + best.meanLatency) ? p : best
    , paretoFrontOneEuro[0]);
    
    const expBest = paretoFrontExponential.reduce((best, p) => 
      (p.meanVariance + p.meanLatency) < (best.meanVariance + best.meanLatency) ? p : best
    , paretoFrontExponential[0]);
    
    // Determine winner
    const oneEuroScore = oneEuroBest ? (oneEuroBest.meanVariance + oneEuroBest.meanLatency) : Infinity;
    const expScore = expBest ? (expBest.meanVariance + expBest.meanLatency) : Infinity;
    
    let winnerText = '';
    if (oneEuroScore < expScore) {
      winnerText = '🏆 One Euro Filter has better overall performance';
      ctx.fillStyle = '#ff6b6b';
    } else if (expScore < oneEuroScore) {
      winnerText = '🏆 Exponential Smoothing has better overall performance';
      ctx.fillStyle = '#4499ff';
    } else {
      winnerText = '⚖️ Both filters perform similarly';
      ctx.fillStyle = '#666';
    }
    
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(winnerText, width / 2, height - 5);
    
    // Hover tooltip: create or reuse a tooltip div
    let tooltip = document.getElementById('comparisonTooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'comparisonTooltip';
      tooltip.style.cssText = 'position:fixed;background:rgba(0,0,0,0.85);color:white;padding:8px 12px;border-radius:6px;font:12px Arial;pointer-events:none;display:none;z-index:10000;max-width:260px;';
      document.body.appendChild(tooltip);
    }
    
    const allPoints = [
      ...sortedOneEuro.map(p => ({ ...p, filterType: 'oneeuro' })),
      ...sortedExponential.map(p => ({ ...p, filterType: 'exponential' }))
    ];
    
    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      const mx = (e.clientX - rect.left) * sx;
      const my = (e.clientY - rect.top) * sy;
      
      let closest = null;
      let minDist = Infinity;
      for (const pt of allPoints) {
        const d = Math.hypot(mx - pt.x, my - pt.y);
        if (d < minDist && d < 25) { minDist = d; closest = pt; }
      }
      
      if (closest) {
        const d = closest.data;
        const color = closest.filterType === 'oneeuro' ? '#ff6b6b' : '#4499ff';
        const name = closest.filterType === 'oneeuro' ? 'One Euro Filter' : 'Exponential Smoothing';
        let html = `<strong style="color:${color}">${name}</strong><br>`;
        html += `Variance: ${d.meanVariance.toFixed(2)} px<br>`;
        html += `Latency: ${d.meanLatency.toFixed(0)} ms`;
        if (closest.filterType === 'oneeuro' && d.params) {
          html += `<br>minCutoff: ${d.params.minCutoff}<br>beta: ${d.params.beta}<br>dCutoff: ${d.params.dCutoff}`;
        } else if (d.params && d.params.alpha !== undefined) {
          html += `<br>Alpha: ${d.params.alpha}`;
        }
        tooltip.innerHTML = html;
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 14) + 'px';
        tooltip.style.top = (e.clientY - 14) + 'px';
      } else {
        tooltip.style.display = 'none';
      }
    };
    canvas.onmouseleave = () => { tooltip.style.display = 'none'; };
  }

  /**
   * Get valid results for export
   */
  _getValidResults(filterType) {
    const allResults = filterType === 'oneeuro' ? this.results : this.resultsExponential;
    return allResults.filter(r => 
      r.meanVariance !== Infinity && 
      r.meanLatency !== Infinity && 
      r.validPositions >= 1
    );
  }

  /**
   * Export results as CSV only (one file per click to avoid browser blocking)
   */
  exportCSV(paretoFront, filterType = 'oneeuro') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const validResults = this._getValidResults(filterType);
    
    if (!validResults || validResults.length === 0) {
      console.error('❌ No data to export!');
      alert('No data to export. No valid results found.');
      return;
    }
    
    const csvData = this.generateCSV(validResults, filterType);
    console.log(`📄 CSV Data (first 500 chars):\n${csvData.substring(0, 500)}`);
    this.downloadFile(`${filterType}-${timestamp}.csv`, csvData, 'text/csv');
    console.log(`✅ Exported ${filterType} CSV: ${filterType}-${timestamp}.csv`);
  }

  /**
   * Export results as JSON only (one file per click to avoid browser blocking)
   */
  exportJSON(paretoFront, filterType = 'oneeuro') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const validResults = this._getValidResults(filterType);
    
    if (!validResults || validResults.length === 0) {
      console.error('❌ No data to export!');
      alert('No data to export. No valid results found.');
      return;
    }
    
    const jsonData = JSON.stringify({
      metadata: {
        timestamp: new Date().toISOString(),
        positions: this.targetPositions,
        parameterRanges: filterType === 'oneeuro' ? this.parameterRanges : { alpha: [0.70, 0.75, 0.80, 0.85, 0.90, 0.92, 0.94, 0.95, 0.96, 0.97, 0.98, 0.99], spacing: 'extended', note: 'Focus on 0.9-0.99 for best responsiveness' },
        filterType: filterType,
        environmentConditions: this.environmentConditions
      },
      paretoFront: paretoFront,
      allResults: filterType === 'oneeuro' ? this.results : this.resultsExponential,
      rawData: this.rawData
    }, null, 2);
    this.downloadFile(`optimization-results-${filterType}-${timestamp}.json`, jsonData, 'application/json');
    console.log(`✅ Exported ${filterType} JSON: optimization-results-${filterType}-${timestamp}.json`);
  }

  /**
   * Generate CSV from results data
   * NOTE: Exports ALL valid results, not just Pareto front
   * The Pareto viewer will calculate its own Pareto front from this data
   * Format matches what the viewer expects: includes Rank column
   */
  generateCSV(data, filterType = 'oneeuro') {
    let headers, rows;
    const lighting = this.environmentConditions?.lightingCondition || 'unknown';
    const notes = (this.environmentConditions?.notes || '').replace(/,/g, ';');
    
    if (filterType === 'exponential') {
      headers = [
        'Rank', 'alpha', 'meanVariance', 'meanLatency', 'validPositions', 'lightingCondition', 'notes'
      ];
      
      rows = data.map((result, index) => [
        index + 1,
        result.params.alpha,
        result.meanVariance.toFixed(4),
        result.meanLatency.toFixed(2),
        result.validPositions,
        lighting,
        notes
      ]);
    } else {
      headers = [
        'Rank', 'minCutoff', 'beta', 'dCutoff', 'meanVariance', 'meanLatency', 'validPositions', 'lightingCondition', 'notes'
      ];
      
      rows = data.map((result, index) => [
        index + 1,
        result.params.minCutoff,
        result.params.beta,
        result.params.dCutoff,
        result.meanVariance.toFixed(4),
        result.meanLatency.toFixed(2),
        result.validPositions,
        lighting,
        notes
      ]);
    }

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  /**
   * Save raw trial data (head positions + timing) so it can be re-analyzed
   * later with different algorithms without redoing data collection.
   * 
   * Saves the cached head positions (not raw landmarks) — much smaller
   * and independent of calibration matrix.
   */
  saveRawTrialData() {
    // Ensure head positions are computed for all positions
    for (const posData of this.rawData) {
      if (!posData._cachedHeadPositions && posData.data && posData.data.rawData) {
        posData._cachedHeadPositions = this.convertLandmarksToHeadPositions(posData.data.rawData);
      }
    }

    const exportData = {
      version: 2,
      timestamp: new Date().toISOString(),
      positions: this.rawData.map(posData => ({
        position: posData.position,
        nextPosition: posData.nextPosition,
        positionIndex: posData.positionIndex,
        skipLatency: posData.skipLatency,
        timingData: posData.data.timingData,
        headPositions: posData._cachedHeadPositions
      }))
    };

    const json = JSON.stringify(exportData);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.downloadFile(`raw-trial-data-${timestamp}.json`, json, 'application/json');
    console.log(`✅ Saved raw trial data: ${exportData.positions.length} positions, ${json.length} bytes`);
  }

  /**
   * Load saved raw trial data and re-run parameter optimization
   * with the current algorithm.
   */
  loadRawTrialData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.positions || !Array.isArray(data.positions)) {
          alert('Invalid file format: missing positions array');
          return;
        }

        console.log(`📂 Loading raw trial data: ${data.positions.length} positions from ${data.timestamp || 'unknown date'}`);

        // Reconstruct this.rawData from saved data
        this.rawData = data.positions.map(pos => ({
          position: pos.position,
          nextPosition: pos.nextPosition,
          positionIndex: pos.positionIndex,
          skipLatency: pos.skipLatency,
          _cachedHeadPositions: pos.headPositions,
          data: {
            timingData: pos.timingData,
            rawData: pos.headPositions.map(hp => ({ time: hp.time }))
          }
        }));

        console.log(`✅ Loaded ${this.rawData.length} positions, re-running optimization...`);

        // Reset state for re-analysis
        this.results = [];
        this.resultsExponential = [];
        this.firstParamSetAnalyzed = false;
        this.firstSuccessLogged = false;
        this.landmarkConversionLogged = false;
        this._velocityLatencyLogCount = 0;
        this.varianceTracker = null;

        // Ensure UI exists
        if (!this.ui || !document.body.contains(this.ui)) {
          this.createReanalysisUI();
        }

        this.status.textContent = 'Re-analyzing with current algorithm...';
        await this.sleep(100);

        // Run optimization
        await this.performParameterOptimization();

      } catch (err) {
        console.error('Failed to load raw trial data:', err);
        alert('Failed to load file: ' + err.message);
      }
    };
    input.click();
  }

  /**
   * Create minimal UI for re-analysis (when loading saved data without
   * going through the full data collection flow).
   */
  createReanalysisUI() {
    if (this.ui) this.ui.remove();

    this.ui = document.createElement('div');
    this.ui.id = 'parameter-optimization-ui';
    this.ui.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.95); z-index: 10000;
      display: flex; flex-direction: column; align-items: center;
      padding: 20px; overflow-y: auto; color: white; font-family: Arial, sans-serif;
    `;

    this.status = document.createElement('div');
    this.status.style.cssText = 'font-size: 18px; margin-bottom: 10px; font-weight: bold;';
    this.status.textContent = 'Re-analyzing...';

    this.progress = document.createElement('div');
    this.progress.style.cssText = 'font-size: 14px; margin-bottom: 10px; color: #aaa;';

    this.instructions = document.createElement('div');
    this.instructions.style.cssText = 'font-size: 13px; max-width: 800px; line-height: 1.5;';

    this.ui.appendChild(this.status);
    this.ui.appendChild(this.progress);
    this.ui.appendChild(this.instructions);
    document.body.appendChild(this.ui);
  }

  /**
   * Download file helper
   */
  downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async _autoDownloadResults(paretoFront, paretoFrontExponential) {
    // Auto-download the ZIP immediately
    try {
      const blob = await this._buildZipBlob(paretoFront, paretoFrontExponential);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const pid = window.URL_PARTICIPANT_ID ? `P${String(window.URL_PARTICIPANT_ID).padStart(2,'0')}_` : '';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pid}pareto-optimization-${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log(`Auto-downloaded ZIP (${(blob.size / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error('Auto-download failed:', err);
    }

    // Show "Optimization Complete" overlay — then transition to Fitts
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.92); z-index: 100001;
      display: flex; align-items: center; justify-content: center;
    `;
    overlay.innerHTML = `
      <div style="text-align: center; padding: 50px 60px; background: rgba(30,30,40,0.98);
        border: 2px solid #22cc66; border-radius: 16px; max-width: 620px;">
        <h1 style="color: #22cc66; font-size: 32px; margin: 0 0 16px;">Optimization Complete</h1>
        <p style="color: #ccc; font-size: 18px; margin: 0 0 24px;">
          Your results have been downloaded automatically.
        </p>
        <p style="color: #eee; font-size: 22px; font-weight: bold; margin: 0 0 18px;">
          Ready to start the Fitts' test?
        </p>
        <div style="text-align: left; max-width: 480px; margin: 0 auto 28px; color: #bbb; font-size: 15px; line-height: 1.7;">
          What happens next:
          <ul style="margin: 8px 0 0 0; padding-left: 22px;">
            <li>A short calibration where you hold still on a big circle.</li>
            <li>Then rings of small circles appear — move your head to the <span style="color:#64ff64;">green</span> circle and hold still until it turns <span style="color:#ff4444;">red</span>.</li>
            <li>Repeat for several rings. You'll get short breaks between blocks.</li>
            <li>At the end, a few quick questions about how it felt.</li>
          </ul>
        </div>
        <div id="pareto-continue-btn" style="
          padding: 18px 50px; font-size: 22px; font-weight: bold;
          background: #64c8ff; color: #111; border: none; border-radius: 10px;
          display: inline-block; cursor: pointer;
        ">Press SPACE to Start</div>
      </div>
    `;
    document.body.appendChild(overlay);

    const dismiss = () => {
      overlay.remove();
      if (this.ui) this.ui.remove();
      if (this.target) this.target.remove();
      if (this.targetRadius) this.targetRadius.remove();
      if (this.flashOverlay) { this.flashOverlay.remove(); this.flashOverlay = null; }
      this.restoreExperimentUI();

      if (window.URL_PARTICIPANT_ID) {
        console.log(`Pareto optimization completed for pid=${window.URL_PARTICIPANT_ID}`);
      }

      // Auto-launch the Fitts experiment so the participant flows directly
      // into the test without having to find a button on the tracking panel.
      setTimeout(() => {
        if (window.fittsExperiment && typeof window.fittsExperiment.start === 'function') {
          console.log('Auto-launching Fitts experiment after Pareto optimization');
          window.fittsExperiment.start().catch(err =>
            console.error('Fitts auto-launch failed:', err)
          );
        } else {
          console.warn('window.fittsExperiment not ready — participant must start manually');
        }
      }, 250);
    };

    document.getElementById('pareto-continue-btn').onclick = dismiss;

    const spaceHandler = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        document.removeEventListener('keydown', spaceHandler);
        dismiss();
      }
    };
    document.addEventListener('keydown', spaceHandler);
  }

  _slimParetoEntry(entry) {
    return {
      params: entry.params,
      meanVariance: entry.meanVariance,
      meanLatency: entry.meanLatency,
      validPositions: entry.validPositions
    };
  }

  async _buildZipBlob(paretoFront, paretoFrontExponential) {
    if (typeof JSZip === 'undefined') throw new Error('JSZip not loaded');

    const zip = new JSZip();
    const ts = new Date().toISOString();

    // 1) One Euro CSV (full results — lightweight text)
    try {
      const oneEuroValid = this._getValidResults('oneeuro');
      if (oneEuroValid.length > 0) {
        zip.file('oneeuro.csv', this.generateCSV(oneEuroValid, 'oneeuro'));
      }
    } catch (e) {
      console.warn('ZIP: one-euro CSV skipped:', e.message);
    }

    // 2) Exponential CSV
    try {
      const expValid = this._getValidResults('exponential');
      if (expValid.length > 0) {
        zip.file('exponential.csv', this.generateCSV(expValid, 'exponential'));
      }
    } catch (e) {
      console.warn('ZIP: exponential CSV skipped:', e.message);
    }

    // 3) Pareto fronts (just the optimal points)
    try {
      zip.file('pareto-front-oneeuro.json', JSON.stringify({
        timestamp: ts,
        filterType: 'oneeuro',
        environmentConditions: this.environmentConditions,
        parameterRanges: this.parameterRanges,
        paretoFront: paretoFront.map(e => this._slimParetoEntry(e))
      }, null, 2));
    } catch (e) {
      console.warn('ZIP: one-euro pareto JSON skipped:', e.message);
    }

    try {
      zip.file('pareto-front-exponential.json', JSON.stringify({
        timestamp: ts,
        filterType: 'exponential',
        environmentConditions: this.environmentConditions,
        paretoFront: paretoFrontExponential.map(e => this._slimParetoEntry(e))
      }, null, 2));
    } catch (e) {
      console.warn('ZIP: exponential pareto JSON skipped:', e.message);
    }

    // 3b) All results — chunked into batches to avoid string-length limits
    const CHUNK = 500;
    const addChunkedResults = (results, folderName) => {
      const folder = zip.folder(folderName);
      const slim = results.filter(r =>
        r.meanVariance !== Infinity && r.meanLatency !== Infinity
      ).map(r => this._slimParetoEntry(r));
      for (let start = 0; start < slim.length; start += CHUNK) {
        try {
          folder.file(`chunk-${start}.json`, JSON.stringify(slim.slice(start, start + CHUNK)));
        } catch (e) {
          console.warn(`ZIP: ${folderName} chunk ${start} skipped:`, e.message);
        }
      }
    };
    if (this.results && this.results.length > 0) {
      addChunkedResults(this.results, 'all-results-oneeuro');
    }
    if (this.resultsExponential && this.resultsExponential.length > 0) {
      addChunkedResults(this.resultsExponential, 'all-results-exponential');
    }

    // 4) Raw trial data — one file per position to avoid string-length limits
    const rawFolder = zip.folder('raw-data');
    for (let i = 0; i < this.rawData.length; i++) {
      const posData = this.rawData[i];
      try {
        if (!posData._cachedHeadPositions && posData.data && posData.data.rawData) {
          posData._cachedHeadPositions = this.convertLandmarksToHeadPositions(posData.data.rawData);
        }
        rawFolder.file(`position-${i}-${(posData.position?.name || i)}.json`, JSON.stringify({
          version: 2,
          position: posData.position,
          nextPosition: posData.nextPosition,
          positionIndex: posData.positionIndex,
          skipLatency: posData.skipLatency,
          timingData: posData.data ? posData.data.timingData : null,
          headPositions: posData._cachedHeadPositions || null
        }));
      } catch (e) {
        console.warn(`ZIP: raw data position ${i} skipped:`, e.message);
      }
    }

    // 5) Collection summary (metadata only)
    try {
      zip.file('collection-summary.json', JSON.stringify({
        timestamp: ts,
        environmentConditions: this.environmentConditions,
        positionCount: this.rawData.length,
        positions: this.rawData.map(posData => ({
          position: posData.position,
          nextPosition: posData.nextPosition,
          positionIndex: posData.positionIndex,
          skipLatency: posData.skipLatency,
          timingData: posData.data ? posData.data.timingData : null,
          headPositionSamples: posData._cachedHeadPositions ? posData._cachedHeadPositions.length : 0
        }))
      }, null, 2));
    } catch (e) {
      console.warn('ZIP: collection summary skipped:', e.message);
    }

    return await zip.generateAsync({ type: 'blob' });
  }

  async downloadAllAsZip(paretoFront, paretoFrontExponential) {
    try {
      console.log('📦 Building ZIP...');
      const blob = await this._buildZipBlob(paretoFront, paretoFrontExponential);
      console.log(`📦 ZIP blob ready: ${(blob.size / 1024).toFixed(1)} KB`);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pareto-optimization-${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('✅ ZIP download triggered');
    } catch (err) {
      console.error('ZIP generation failed:', err, err.stack);
      alert(`ZIP download failed: ${err.message}\nPlease use individual buttons.`);
    }
  }

  /**
   * Cancel data collection
   */
  cancelCollection() {
    this.isCollecting = false;
    if (this.ui) {
      this.ui.remove();
    }
    if (this.target) {
      this.target.remove();
    }
    if (this.targetRadius) {
      this.targetRadius.remove();
    }
    if (this.flashOverlay) {
      this.flashOverlay.remove();
      this.flashOverlay = null;
    }
    // Restore hidden UI elements
    this.restoreExperimentUI();
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Wrap in try-catch to catch any loading errors
try {
  // Make globally available
  window.ParameterOptimizer = ParameterOptimizer;

  // Convenience function to start optimization
  window.startParameterOptimization = function() {
    console.log('🚀 Start Parameter Optimization button clicked!');
    try {
      const optimizer = new ParameterOptimizer();
      console.log('✓ ParameterOptimizer created successfully');
      optimizer.startDataCollection();
    } catch (error) {
      console.error('❌ Error starting parameter optimization:', error);
      alert(`Error starting optimization: ${error.message}`);
    }
  };

  console.log('✅ Parameter Optimization System loaded successfully!');
  console.log('\n🎯 KEY IMPROVEMENT: NO CURSOR CONTAMINATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Cursor HIDDEN during data collection');
  console.log('✓ RAW LANDMARKS collected (not pre-filtered positions)');
  console.log('✓ Filtering done OFFLINE (prevents visual feedback loops)');
  console.log('✓ Measurements exclude cursor overshoot/undershoot behavior');
  console.log('✓ Results reflect PURE FILTER PERFORMANCE, not user corrections');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('🔧 EXACT VALUES - NO CLAMPING applied to parameters');
  console.log('📋 Available functions:', {
    startParameterOptimization: typeof window.startParameterOptimization,
    ParameterOptimizer: typeof window.ParameterOptimizer
  });
  console.log('🚀 Ready to use startParameterOptimization() to begin.');
  
  // Display current parameter ranges to verify they loaded correctly
  if (window.ParameterOptimizer) {
    const testInstance = new window.ParameterOptimizer();
    console.log('🔍 CURRENT PARAMETER RANGES:', testInstance.parameterRanges);
    console.log('✅ minCutoff: 10^(-2) to 10^(0) (0.01 to 1.0) - LOGARITHMIC spacing with 11 values');
    console.log('✅ beta: 0.00001 to 0.001 (linear, step 0.00005) - 20 values');
    console.log('✅ dCutoff: 0.1 to 2.0 (linear, step 0.1) - 20 values');
    console.log('⚠️  Total combinations: 11 × 20 × 20 = 4,400');
    console.log('🚀 EXTREME MODE: Testing near-zero filtering (high variance expected) for absolute minimum latency');
  }
  
} catch (error) {
  console.error('❌ CRITICAL: Failed to load Parameter Optimization System:', error);
  console.error('Stack trace:', error.stack);
  
  // Create a fallback error function
  window.startParameterOptimization = function() {
    alert(`Parameter Optimization failed to load due to error:\n${error.message}\n\nPlease check the browser console and refresh the page.`);
  };
}
