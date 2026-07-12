// Mode Comparison Experiment - Integrated Version
// Compares Rotation-Only Mode vs 3-Point 2D Mode with Variance Levels 2 & 3
// Updated: 2026-01-19 - Fixed color highlighting with !important styles

class ModeComparisonExperiment {
  constructor() {
    // Experiment configuration
    this.config = {
      // Target sizes as percentage of limiting dimension
      targetSizePercents: [3, 6, 10], // Hard, Medium, Easy
      amplitudePercents: [25, 45], // Short, Long
      
      // Direction sequence (across-the-circle alternation)
      directionSequence: [0, 180, 45, 225, 90, 270, 135, 315],
      
      trialsPerLayout: 8, // 8 trials per layout (one per direction)
      dwellTime: 2000, // 2 seconds in milliseconds
      breakDuration: 60, // 1 minute break between phases (seconds)
      
      // Comparison phases: 2 modes × 2 variance levels = 4 phases
      comparisonPhases: [
        {
          phaseNumber: 1,
          mode: "rotation",
          modeName: "Rotation-Only Mode",
          varianceLevel: 2,
          exponentialRank: 9, // Variance level 2
          expectedVariance: 7.0109
        },
        {
          phaseNumber: 2,
          mode: "threepoint",
          modeName: "3-Point 2D Mode",
          varianceLevel: 2,
          exponentialRank: 9,
          expectedVariance: 7.0109
        },
        {
          phaseNumber: 3,
          mode: "rotation",
          modeName: "Rotation-Only Mode",
          varianceLevel: 3,
          exponentialRank: 23, // Variance level 3
          expectedVariance: 12.5275
        },
        {
          phaseNumber: 4,
          mode: "threepoint",
          modeName: "3-Point 2D Mode",
          varianceLevel: 3,
          exponentialRank: 23,
          expectedVariance: 12.5275
        }
      ]
    };
    
    // State
    this.isRunning = false;
    this.currentPhaseIndex = 0;
    this.currentLayoutIndex = 0;
    this.currentTrialInLayout = 0;
    this.trialData = [];
    this.waitingForHomeCircle = false;
    
    // Store original calibration data
    this.originalCalibrationData = null;
    this.rotationCalibrationData = null;
    this.threepointCalibrationData = null;
    
    // UI elements
    this.experimentUI = null;
    this.targetCircles = {};
    this.homeCircle = null;
    this.dwellIndicator = null;
    this.progressDisplay = null;
    this.phaseIndicator = null;
    
    // Timing
    this.dwellStartTime = null;
    this.movementStartTime = null;
    this.trialStartTime = null;
    
    // Cursor tracking
    this.cursorTrackingInterval = null;
    this.selectionPoint = null;
    this.startPoint = null;
    this.cursorPath = [];
    
    // Layout structure
    this.layouts = [];
    this.totalTrials = 0;
    this.completedTrials = 0;
    
    // Break timer
    this.breakTimeRemaining = 0;
    this.breakInterval = null;
    
    // Bind methods
    this.update = this.update.bind(this);
  }
  
  // Convert percentage to pixels based on limiting dimension
  percentToPixels(percent) {
    const limitingDimension = Math.min(window.innerWidth, window.innerHeight);
    return (percent / 100) * limitingDimension;
  }
  
  // Generate layouts (6 layouts: 3 sizes × 2 amplitudes)
  generateLayouts() {
    const layouts = [];
    const { targetSizePercents, amplitudePercents, directionSequence } = this.config;
    
    const targetSizes = targetSizePercents.map(p => this.percentToPixels(p));
    const amplitudes = amplitudePercents.map(p => this.percentToPixels(p));
    
    const limitingDimension = Math.min(window.innerWidth, window.innerHeight);
    
    for (const size of targetSizes) {
      for (const amplitude of amplitudes) {
        const isLargestAmplitude = amplitude === Math.max(...amplitudes);
        const safeAreaPercent = isLargestAmplitude ? 0.95 : 0.85;
        const safeRadius = (limitingDimension / 2) * safeAreaPercent;
        
        const targetRadius = size / 2;
        const requiredRadius = amplitude + targetRadius;
        
        let finalAmplitude = amplitude;
        if (requiredRadius > safeRadius) {
          finalAmplitude = safeRadius - targetRadius;
          console.warn(`⚠️ Layout auto-scaled amplitude to ${finalAmplitude.toFixed(0)}px`);
        }
        
        layouts.push({
          targetSize: size,
          amplitude: finalAmplitude,
          originalAmplitude: amplitude,
          sequence: [...directionSequence]
        });
      }
    }
    
    return layouts;
  }
  
  // Get current phase
  getCurrentPhase() {
    if (this.currentPhaseIndex < this.config.comparisonPhases.length) {
      return this.config.comparisonPhases[this.currentPhaseIndex];
    }
    return null;
  }
  
  // Get current layout
  getCurrentLayout() {
    if (this.currentLayoutIndex < this.layouts.length) {
      return this.layouts[this.currentLayoutIndex];
    }
    return null;
  }
  
  // Get current direction
  getCurrentDirection() {
    const layout = this.getCurrentLayout();
    if (layout && this.currentTrialInLayout < layout.sequence.length) {
      return layout.sequence[this.currentTrialInLayout];
    }
    return null;
  }
  
  // Start the experiment
  async start() {
    console.log('🚀 Starting Mode Comparison Experiment');
    
    // Hide the rotation control panel (it shows stale mode info during experiment)
    if (window.liveRotationControl && window.liveRotationControl.hide) {
      window.liveRotationControl.hide();
      console.log('🙈 Rotation control panel hidden for mode comparison experiment');
    }
    
    // Also hide the Three.js 3D head visualization
    if (window.threeJSHeadViz && window.threeJSHeadViz.hide) {
      window.threeJSHeadViz.hide();
      console.log('🙈 Three.js head visualization hidden');
    }
    
    // Check if we have calibration data
    if (!window.state.calibrationData || !window.state.transformationMatrices) {
      alert('Please complete calibration first before starting the Mode Comparison experiment!');
      return;
    }
    
    // Store original calibration data
    this.storeOriginalCalibration();
    
    // Check if we need both rotation and 3-point calibrations
    const hasRotation = window.state.config.rotationOnlyMode;
    const hasThreepoint = !window.state.config.rotationOnlyMode && window.state.config.landmarkPoints === "3";
    
    if (!hasRotation && !hasThreepoint) {
      alert('Current calibration is not suitable. Please calibrate with either Rotation-Only mode or 3-Point 2D mode.');
      return;
    }
    
    // Generate layouts
    this.layouts = this.generateLayouts();
    this.totalTrials = this.layouts.length * this.config.trialsPerLayout * this.config.comparisonPhases.length;
    
    console.log(`📊 Total layouts: ${this.layouts.length}`);
    console.log(`📊 Total phases: ${this.config.comparisonPhases.length}`);
    console.log(`📊 Total trials: ${this.totalTrials}`);
    
    // Show welcome screen
    this.showWelcomeScreen();
  }
  
  // Store original calibration
  storeOriginalCalibration() {
    this.originalCalibrationData = {
      calibrationData: JSON.parse(JSON.stringify(window.state.calibrationData)),
      transformationMatrices: JSON.parse(JSON.stringify(window.state.transformationMatrices)),
      config: JSON.parse(JSON.stringify(window.state.config))
    };
    
    console.log('📦 Original calibration stored');
    
    // Determine which mode this calibration is for
    if (window.state.config.rotationOnlyMode) {
      this.rotationCalibrationData = this.originalCalibrationData;
      console.log('✅ Rotation-only calibration available');
    } else if (window.state.config.landmarkPoints === "3") {
      this.threepointCalibrationData = this.originalCalibrationData;
      console.log('✅ 3-point calibration available');
    }
  }
  
  // Show welcome screen
  showWelcomeScreen() {
    const container = document.getElementById('mode-comparison-ui');
    if (!container) {
      console.error('Mode comparison UI container not found');
      return;
    }
    
    // Mark body as experiment active
    document.body.classList.add('experiment-active');
    
    const availableModes = [];
    if (this.rotationCalibrationData) availableModes.push('Rotation-Only');
    if (this.threepointCalibrationData) availableModes.push('3-Point 2D');
    
    container.innerHTML = `
      <div class="modal-screen welcome-screen">
        <h2>Mode Comparison Experiment</h2>
        <p>
          This experiment compares <strong style="color: #ffc864;">Rotation-Only Mode</strong> and 
          <strong style="color: #64c8ff;">3-Point 2D Mode</strong> at two different variance levels 
          using exponential filters.
        </p>
        <div class="info-box">
          <strong>Experiment Structure:</strong><br>
          • 4 phases (2 modes × 2 variance levels)<br>
          • 6 layouts per phase (3 sizes × 2 distances)<br>
          • 8 trials per layout (8 directions)<br>
          • Total: ${this.totalTrials} trials<br>
          • 1-minute break between phases
        </div>
        <div class="warning-box">
          <strong>Note:</strong><br>
          Currently available: <strong>${availableModes.join(', ')}</strong><br>
          ${availableModes.length < 2 ? '⚠️ You only have one mode calibrated. The experiment will use the same calibration for both modes.' : '✅ Both modes are calibrated.'}
        </div>
        <div class="info-box">
          <strong>Instructions:</strong><br>
          • Move the cursor to the highlighted target circle<br>
          • Hold steady for 0.8 seconds to select<br>
          • Return to center (home circle) between trials<br>
          • Try to be as quick and accurate as possible
        </div>
        <button id="begin-mode-comparison-btn" class="btn-primary">
          Begin Experiment
        </button>
        <button id="cancel-mode-comparison-btn" class="btn-secondary">
          Cancel
        </button>
      </div>
    `;
    
    document.getElementById('begin-mode-comparison-btn').addEventListener('click', () => {
      this.startPhase(0);
    });
    
    document.getElementById('cancel-mode-comparison-btn').addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }
  
  // Start a specific phase
  async startPhase(phaseIndex) {
    this.currentPhaseIndex = phaseIndex;
    const phase = this.getCurrentPhase();
    
    if (!phase) {
      this.showCompletionScreen();
      return;
    }
    
    console.log(`🎯 Starting Phase ${phase.phaseNumber}: ${phase.modeName} (Variance Level ${phase.varianceLevel})`);
    
    // Apply configuration for this phase
    this.applyPhaseConfiguration(phase);
    
    // Reset layout and trial counters
    this.currentLayoutIndex = 0;
    this.currentTrialInLayout = 0;
    
    // Show phase start screen
    this.showPhaseStartScreen(phase);
  }
  
  // Apply configuration for specific phase
  applyPhaseConfiguration(phase) {
    console.log(`🔧 Applying configuration for ${phase.modeName}...`);
    console.log(`   Phase ${phase.phaseNumber}: ${phase.mode} mode, Variance Level ${phase.varianceLevel}`);
    
    // Set mode configuration
    if (phase.mode === "rotation") {
      window.state.config.rotationOnlyMode = true;
      window.state.config.useRotation = true;
      console.log('✅ Rotation-only mode config enabled');
      
      // CRITICAL FIX: Also set the tracking mode that tracking.js actually uses
      if (window.liveRotationControl) {
        window.liveRotationControl.trackingMode = 'rotation';
        console.log('✅ liveRotationControl.trackingMode set to: rotation');
      } else {
        console.warn('⚠️ liveRotationControl not available!');
      }
    } else {
      window.state.config.rotationOnlyMode = false;
      window.state.config.useRotation = false; // Explicitly disable rotation
      window.state.config.landmarkPoints = "3";
      window.state.config.coordinateSystem = "2d";
      console.log('✅ 3-point 2D mode config enabled');
      
      // CRITICAL FIX: Also set the tracking mode that tracking.js actually uses
      if (window.liveRotationControl) {
        window.liveRotationControl.trackingMode = 'landmarks';
        console.log('✅ liveRotationControl.trackingMode set to: landmarks');
      } else {
        console.warn('⚠️ liveRotationControl not available!');
      }
    }
    
    // Apply exponential filter with specified rank
    this.applyExponentialFilter(phase.exponentialRank);
    
    // Reset cursor state to ensure clean transition between modes
    window.state.lastHeadX = null;
    window.state.lastHeadY = null;
    window.state.cursorX = null;
    window.state.cursorY = null;
    window.state.smoothedX = null;
    window.state.smoothedY = null;
    window.state.smoothedAngles = null;
    window.state.lastRawAngles = null;
    
    // Log final state for verification
    console.log(`✅ Phase ${phase.phaseNumber} configuration applied:`);
    console.log(`   Final trackingMode: ${window.liveRotationControl?.trackingMode || 'N/A'}`);
    console.log(`   Final smoothingFactor: ${window.state.config.exponentialSmoothingFactor}`);
  }
  
  // Apply exponential filter with specified rank
  applyExponentialFilter(rank) {
    console.log(`🔧 Applying Exponential Filter Rank ${rank}`);
    
    if (!window.EXPONENTIAL_PARAMETERS || !window.EXPONENTIAL_PARAMETERS[rank - 1]) {
      console.error(`Exponential parameters for rank ${rank} not found`);
      return;
    }
    
    const params = window.EXPONENTIAL_PARAMETERS[rank - 1];
    const smoothingFactor = 1 - params.alpha;
    
    // Update window state
    window.state.config.filterType = 'exponential';
    window.state.config.exponentialSmoothingFactor = smoothingFactor;
    
    console.log(`✅ Exponential filter configured: smoothingFactor=${smoothingFactor.toFixed(6)}`);
  }
  
  // Show phase start screen
  showPhaseStartScreen(phase) {
    const container = document.getElementById('mode-comparison-ui');
    container.innerHTML = `
      <div class="modal-screen phase-start-screen">
        <h2>Phase ${phase.phaseNumber}/4</h2>
        <h3>${phase.modeName}</h3>
        <p>
          Variance Level: ${phase.varianceLevel} | Exponential Rank: ${phase.exponentialRank}
        </p>
        <div class="info-box" style="text-align: left;">
          <strong>This Phase:</strong><br>
          • ${this.layouts.length} layouts<br>
          • ${this.layouts.length * this.config.trialsPerLayout} trials total<br>
          • Estimated time: ~${Math.ceil(this.layouts.length * this.config.trialsPerLayout * 5 / 60)} minutes
        </div>
        <p>Click "Start Phase" when you're ready to begin.</p>
        <button id="start-phase-btn" class="btn-primary">
          Start Phase ${phase.phaseNumber}
        </button>
      </div>
    `;
    
    document.getElementById('start-phase-btn').addEventListener('click', () => {
      this.startLayout();
    });
  }
  
  // Start a layout
  startLayout() {
    const layout = this.getCurrentLayout();
    if (!layout) {
      this.finishPhase();
      return;
    }
    
    console.log(`📐 Starting layout ${this.currentLayoutIndex + 1}/${this.layouts.length}`);
    console.log(`   Size: ${layout.targetSize.toFixed(0)}px, Amplitude: ${layout.amplitude.toFixed(0)}px`);
    
    // Clear experiment UI
    const container = document.getElementById('mode-comparison-ui');
    container.innerHTML = '';
    
    // Create target circles and home circle
    this.createTargetCircles(layout);
    this.createHomeCircle();
    this.createDwellIndicator();
    this.createProgressDisplay();
    this.createPhaseIndicator();
    
    // Reset trial counter
    this.currentTrialInLayout = 0;
    
    // Start first trial
    this.startTrial();
  }
  
  // Create target circles (8 directions) - exactly like Fitts experiment
  createTargetCircles(layout) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    // Remove existing circles
    Object.values(this.targetCircles).forEach(circle => circle.remove());
    this.targetCircles = {};
    
    // All 8 directions (same as Fitts)
    const allDirections = [0, 45, 90, 135, 180, 225, 270, 315];
    
    for (const direction of allDirections) {
      const radians = (direction * Math.PI) / 180;
      const targetX = centerX + layout.amplitude * Math.cos(radians);
      const targetY = centerY + layout.amplitude * Math.sin(radians);
      
      // Create target circle with exact Fitts styling
      const circle = document.createElement('div');
      circle.className = 'mode-comparison-target-circle';
      circle.setAttribute('data-direction', direction);
      circle.style.cssText = `
        position: fixed;
        left: ${targetX - layout.targetSize / 2}px;
        top: ${targetY - layout.targetSize / 2}px;
        width: ${layout.targetSize}px;
        height: ${layout.targetSize}px;
        border-radius: 50%;
        background-color: rgba(150, 150, 150, 0.3);
        border: 3px solid rgba(150, 150, 150, 0.6);
        pointer-events: none;
        z-index: 10001;
        transition: all 0.3s ease;
      `;
      
      document.body.appendChild(circle);
      this.targetCircles[direction] = circle;
      console.log(`  ✅ Created circle at direction ${direction}° at (${targetX.toFixed(0)}, ${targetY.toFixed(0)})`);
    }
    
    console.log(`✅ Created ${Object.keys(this.targetCircles).length} target circles`);
  }
  
  // Create home circle (center) - exactly like Fitts experiment
  createHomeCircle() {
    console.log('🔵 CREATE HOME CIRCLE CALLED - NEW VERSION WITH BLUE STYLING');
    console.log('   currentTrialInLayout:', this.currentTrialInLayout);
    
    if (this.homeCircle) {
      this.homeCircle.remove();
    }
    
    // Only show home circle for first trial in layout (just like Fitts)
    if (this.currentTrialInLayout === 0) {
      const layout = this.getCurrentLayout();
      const homeSize = layout.targetSize * 1.3; // Slightly bigger than targets (1.3x)
      
      console.log('   ✅ Creating BLUE home circle, size:', homeSize);
      
      const circle = document.createElement('div');
      circle.className = 'mode-comparison-home-circle';
      circle.style.cssText = `
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
      
      document.body.appendChild(circle);
      this.homeCircle = circle;
      console.log('   ✅ Blue home circle added to DOM');
    } else {
      console.log('   ⏭️ Skipping home circle (not first trial)');
    }
  }
  
  // Create dwell indicator - exactly like Fitts experiment
  createDwellIndicator() {
    if (this.dwellIndicator) {
      this.dwellIndicator.remove();
    }
    
    const indicator = document.createElement('div');
    indicator.className = 'mode-comparison-dwell-indicator';
    indicator.style.cssText = `
      position: fixed;
      border-radius: 50%;
      border: 4px solid transparent;
      background-clip: padding-box;
      pointer-events: none;
      z-index: 10002;
      display: none;
      transition: border-color 0.1s;
    `;
    
    document.body.appendChild(indicator);
    this.dwellIndicator = indicator;
  }
  
  // Create progress display
  createProgressDisplay() {
    console.log('📊 Creating progress display with skip/back buttons');
    if (this.progressDisplay) {
      this.progressDisplay.remove();
    }
    
    const display = document.createElement('div');
    display.className = 'progress-display';
    display.style.pointerEvents = 'auto';
    display.innerHTML = `
      <div class="trial-count">Trial ${this.completedTrials}/${this.totalTrials}</div>
      <div class="phase-info">Phase ${this.getCurrentPhase().phaseNumber}/4</div>
      <div style="display: flex; gap: 4px; margin-top: 7px;">
        <button 
          onclick="window.modeComparisonExperiment.skipLayout()" 
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
          onclick="window.modeComparisonExperiment.close()" 
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
    
    document.body.appendChild(display);
    this.progressDisplay = display;
    console.log('✅ Progress display added to DOM with buttons');
  }
  
  // Create phase indicator
  createPhaseIndicator() {
    if (this.phaseIndicator) {
      this.phaseIndicator.remove();
    }
    
    const phase = this.getCurrentPhase();
    const indicator = document.createElement('div');
    indicator.className = 'phase-indicator';
    indicator.innerHTML = `
      <div class="mode-name">${phase.modeName}</div>
      <div class="details">Variance Level ${phase.varianceLevel} | Rank ${phase.exponentialRank}</div>
    `;
    
    document.body.appendChild(indicator);
    this.phaseIndicator = indicator;
  }
  
  // Update progress display
  updateProgressDisplay() {
    if (this.progressDisplay) {
      this.progressDisplay.innerHTML = `
        <div class="trial-count">Trial ${this.completedTrials}/${this.totalTrials}</div>
        <div class="phase-info">Phase ${this.getCurrentPhase().phaseNumber}/4</div>
        <div style="display: flex; gap: 4px; margin-top: 7px;">
          <button 
            onclick="window.modeComparisonExperiment.skipLayout()" 
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
            onclick="window.modeComparisonExperiment.close()" 
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
    }
  }
  
  // Start a trial
  startTrial() {
    const layout = this.getCurrentLayout();
    const direction = this.getCurrentDirection();
    const phase = this.getCurrentPhase();
    
    if (direction === null) {
      this.finishLayout();
      return;
    }
    
    console.log(`🎯 Trial ${this.completedTrials + 1}/${this.totalTrials}: Direction ${direction}°`);
    
    // Set waiting for home circle only on first trial
    if (this.currentTrialInLayout === 0) {
      this.waitingForHomeCircle = true;
    } else {
      this.waitingForHomeCircle = false;
    }
    
    // Recreate home circle (only shows on first trial)
    this.createHomeCircle();
    
    // Update target highlighting - exact copy of Fitts logic
    this.updateTargetHighlighting();
    
    this.trialStartTime = Date.now();
    
    // Start cursor tracking
    this.startCursorTracking();
  }
  
  // Update target highlighting - exactly like Fitts experiment
  updateTargetHighlighting() {
    const layout = this.getCurrentLayout();
    if (!layout) {
      console.warn("⚠️ updateTargetHighlighting: no layout");
      return;
    }
    
    const currentDirection = this.getCurrentDirection();
    console.log("🎨 [VERSION 2026-01-19] Updating target highlighting - current direction:", currentDirection, "trial:", this.currentTrialInLayout);
    console.log("   waitingForHomeCircle:", this.waitingForHomeCircle);
    console.log("   Available circles:", Object.keys(this.targetCircles));
    console.log("   Layout sequence:", layout.sequence);
    
    // Update all circles
    let highlightedCount = 0;
    for (const [direction, circle] of Object.entries(this.targetCircles)) {
      const dir = parseInt(direction);
      const sequenceIndex = layout.sequence.indexOf(dir);
      
      console.log(`   Checking direction ${dir}°: seqIdx=${sequenceIndex}, current=${currentDirection}`);
      
      if (dir === currentDirection) {
        // Current target - check if we're waiting for home circle
        if (this.waitingForHomeCircle) {
          // Before starting: current target is yellow (not red yet)
          circle.style.setProperty('background-color', 'rgba(255, 200, 100, 0.5)', 'important');
          circle.style.setProperty('border-color', 'rgba(255, 200, 100, 0.8)', 'important');
          circle.style.setProperty('border-width', '3px', 'important');
          circle.style.setProperty('box-shadow', '0 0 15px rgba(255, 200, 100, 0.6)', 'important');
          circle.style.setProperty('transform', 'scale(1.05)', 'important');
          console.log(`  🟡 Direction ${dir}° = YELLOW (waiting for home circle)`);
        } else {
          // After home circle: current target is red
          circle.style.setProperty('background-color', 'rgba(255, 100, 100, 0.8)', 'important');
          circle.style.setProperty('border-color', 'rgba(255, 100, 100, 1)', 'important');
          circle.style.setProperty('border-width', '4px', 'important');
          circle.style.setProperty('box-shadow', '0 0 30px rgba(255, 100, 100, 1)', 'important');
          circle.style.setProperty('transform', 'scale(1.1)', 'important');
          console.log(`  ➡️ Direction ${dir}° = RED (current target)`);
        }
        highlightedCount++;
      } else if (sequenceIndex !== -1 && sequenceIndex < this.currentTrialInLayout) {
        // Completed target - green
        circle.style.setProperty('background-color', 'rgba(100, 255, 100, 0.4)', 'important');
        circle.style.setProperty('border-color', 'rgba(100, 255, 100, 0.7)', 'important');
        circle.style.setProperty('border-width', '3px', 'important');
        circle.style.setProperty('box-shadow', 'none', 'important');
        circle.style.setProperty('transform', 'scale(1)', 'important');
        console.log(`  ✅ Direction ${dir}° = GREEN (completed, seqIdx=${sequenceIndex} < ${this.currentTrialInLayout})`);
      } else if (sequenceIndex === this.currentTrialInLayout + 1) {
        // Next target - check if we're waiting for home circle
        if (this.waitingForHomeCircle) {
          // Before starting: next target is gray (not shown yet)
          circle.style.setProperty('background-color', 'rgba(150, 150, 150, 0.3)', 'important');
          circle.style.setProperty('border-color', 'rgba(150, 150, 150, 0.6)', 'important');
          circle.style.setProperty('border-width', '3px', 'important');
          circle.style.setProperty('box-shadow', 'none', 'important');
          circle.style.setProperty('transform', 'scale(1)', 'important');
          console.log(`  ⚪ Direction ${dir}° = GRAY (waiting for home circle)`);
        } else {
          // After home circle: next target is yellow/orange
          circle.style.setProperty('background-color', 'rgba(255, 200, 100, 0.5)', 'important');
          circle.style.setProperty('border-color', 'rgba(255, 200, 100, 0.8)', 'important');
          circle.style.setProperty('border-width', '3px', 'important');
          circle.style.setProperty('box-shadow', '0 0 15px rgba(255, 200, 100, 0.6)', 'important');
          circle.style.setProperty('transform', 'scale(1.05)', 'important');
          console.log(`  🟠 Direction ${dir}° = ORANGE (next target)`);
        }
      } else {
        // Inactive target - gray
        circle.style.setProperty('background-color', 'rgba(150, 150, 150, 0.3)', 'important');
        circle.style.setProperty('border-color', 'rgba(150, 150, 150, 0.6)', 'important');
        circle.style.setProperty('border-width', '3px', 'important');
        circle.style.setProperty('box-shadow', 'none', 'important');
        circle.style.setProperty('transform', 'scale(1)', 'important');
      }
    }
    
    if (highlightedCount === 0) {
      console.error("⚠️ NO TARGET HIGHLIGHTED! Current direction:", currentDirection);
      console.error("   Layout sequence:", layout.sequence);
      console.error("   currentTrialInLayout:", this.currentTrialInLayout);
    }
  }
  
  // Start cursor tracking
  startCursorTracking() {
    if (this.cursorTrackingInterval) {
      clearInterval(this.cursorTrackingInterval);
    }
    
    this.cursorTrackingInterval = setInterval(() => {
      this.update();
    }, 16); // ~60 FPS
  }
  
  // Update loop (called every frame)
  update() {
    const cursorX = window.state.cursorX;
    const cursorY = window.state.cursorY;
    
    if (cursorX === null || cursorY === null) {
      return;
    }
    
    if (this.waitingForHomeCircle) {
      this.checkHomeCircleDwell(cursorX, cursorY);
    } else {
      this.checkTargetDwell(cursorX, cursorY);
    }
  }
  
  // Check if cursor is dwelling in home circle - exactly like Fitts experiment
  checkHomeCircleDwell(cursorX, cursorY) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const layout = this.getCurrentLayout();
    const homeSize = layout.targetSize * 1.3; // Same as Fitts
    const homeRadius = homeSize / 2;
    
    const distance = Math.sqrt((cursorX - centerX) ** 2 + (cursorY - centerY) ** 2);
    
    if (distance <= homeRadius) {
      if (!this.dwellStartTime) {
        this.dwellStartTime = Date.now();
        this.showDwellIndicator(centerX, centerY, homeSize);
      }
      
      const dwellDuration = Date.now() - this.dwellStartTime;
      this.updateDwellIndicator(dwellDuration / this.config.dwellTime);
      
      if (dwellDuration >= this.config.dwellTime) {
        this.onHomeCircleComplete();
      }
    } else {
      this.dwellStartTime = null;
      this.hideDwellIndicator();
    }
  }
  
  // Check if cursor is dwelling in target circle
  checkTargetDwell(cursorX, cursorY) {
    const layout = this.getCurrentLayout();
    const direction = this.getCurrentDirection();
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    const rad = (direction * Math.PI) / 180;
    const targetX = centerX + layout.amplitude * Math.cos(rad);
    const targetY = centerY + layout.amplitude * Math.sin(rad);
    const targetRadius = layout.targetSize / 2;
    
    const distance = Math.sqrt((cursorX - targetX) ** 2 + (cursorY - targetY) ** 2);
    
    if (distance <= targetRadius) {
      if (!this.dwellStartTime) {
        this.dwellStartTime = Date.now();
        this.showDwellIndicator(targetX, targetY, layout.targetSize);
      }
      
      const dwellDuration = Date.now() - this.dwellStartTime;
      this.updateDwellIndicator(dwellDuration / this.config.dwellTime);
      
      if (dwellDuration >= this.config.dwellTime) {
        this.onTargetComplete(cursorX, cursorY);
      }
    } else {
      this.dwellStartTime = null;
      this.hideDwellIndicator();
    }
  }
  
  // Show dwell indicator - exactly like Fitts experiment
  showDwellIndicator(x, y, size) {
    if (this.dwellIndicator) {
      this.dwellIndicator.style.display = 'block';
      this.dwellIndicator.style.left = `${x - size / 2 - 5}px`;
      this.dwellIndicator.style.top = `${y - size / 2 - 5}px`;
      this.dwellIndicator.style.width = `${size + 10}px`;
      this.dwellIndicator.style.height = `${size + 10}px`;
      this.dwellIndicator.style.borderColor = 'transparent';
    }
  }
  
  // Update dwell indicator - exactly like Fitts experiment
  updateDwellIndicator(progress) {
    if (this.dwellIndicator) {
      // Gradually change border from transparent to green as progress increases
      const alpha = Math.min(progress, 1);
      this.dwellIndicator.style.borderColor = `rgba(76, 175, 80, ${alpha})`;
    }
  }
  
  // Hide dwell indicator
  hideDwellIndicator() {
    if (this.dwellIndicator) {
      this.dwellIndicator.style.display = 'none';
    }
  }
  
  // On home circle complete - exactly like Fitts experiment
  onHomeCircleComplete() {
    console.log('✅ Home circle dwell complete');
    this.waitingForHomeCircle = false;
    this.dwellStartTime = null;
    this.hideDwellIndicator();
    this.movementStartTime = Date.now();
    this.startPoint = { x: window.state.cursorX, y: window.state.cursorY };
    this.cursorPath = [];
    
    // Remove home circle (it's only for the initial dwell)
    if (this.homeCircle) {
      this.homeCircle.remove();
      this.homeCircle = null;
    }
    
    // Update target highlighting (current target should turn red now, next target turns orange)
    this.updateTargetHighlighting();
  }
  
  // On target complete - exactly like Fitts experiment
  onTargetComplete(cursorX, cursorY) {
    console.log('✅ Target dwell complete');
    
    const layout = this.getCurrentLayout();
    const direction = this.getCurrentDirection();
    const phase = this.getCurrentPhase();
    const movementTime = Date.now() - this.movementStartTime;
    
    // Record trial data
    const trialRecord = {
      timestamp: new Date().toISOString(),
      phaseNumber: phase.phaseNumber,
      mode: phase.mode,
      modeName: phase.modeName,
      varianceLevel: phase.varianceLevel,
      exponentialRank: phase.exponentialRank,
      expectedVariance: phase.expectedVariance,
      layoutIndex: this.currentLayoutIndex,
      trialInLayout: this.currentTrialInLayout,
      targetSize: layout.targetSize,
      amplitude: layout.amplitude,
      direction: direction,
      movementTime: movementTime,
      selectionPoint: { x: cursorX, y: cursorY },
      startPoint: this.startPoint
    };
    
    this.trialData.push(trialRecord);
    this.completedTrials++;
    
    console.log(`📊 Trial ${this.completedTrials}/${this.totalTrials} complete`);
    
    // Update progress
    this.updateProgressDisplay();
    
    // Move to next trial
    this.currentTrialInLayout++;
    this.dwellStartTime = null;
    this.hideDwellIndicator();
    
    // Small delay before next trial
    setTimeout(() => {
      this.startTrial();
    }, 500);
  }
  
  // Skip current layout
  skipLayout() {
    console.log('🔔 skipLayout() method called');
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
    
    // Clean up UI elements
    Object.values(this.targetCircles).forEach(circle => circle.remove());
    this.targetCircles = {};
    if (this.homeCircle) this.homeCircle.remove();
    if (this.dwellIndicator) this.dwellIndicator.remove();
    
    // Move to next layout without saving data
    this.currentLayoutIndex++;
    this.currentTrialInLayout = 0;
    
    // Check if all layouts are complete for this phase
    if (this.currentLayoutIndex >= this.layouts.length) {
      this.finishPhase();
    } else {
      // Continue to next layout
      this.startLayout();
    }
  }
  
  // Finish current layout
  finishLayout() {
    console.log(`✅ Layout ${this.currentLayoutIndex + 1}/${this.layouts.length} complete`);
    
    // Clean up UI elements
    Object.values(this.targetCircles).forEach(circle => circle.remove());
    this.targetCircles = {};
    
    // Move to next layout
    this.currentLayoutIndex++;
    this.currentTrialInLayout = 0;
    
    // Start next layout or finish phase
    if (this.currentLayoutIndex < this.layouts.length) {
      this.startLayout();
    } else {
      this.finishPhase();
    }
  }
  
  // Finish current phase
  finishPhase() {
    console.log(`✅ Phase ${this.getCurrentPhase().phaseNumber}/4 complete`);
    
    // Stop cursor tracking
    if (this.cursorTrackingInterval) {
      clearInterval(this.cursorTrackingInterval);
      this.cursorTrackingInterval = null;
    }
    
    // Clean up UI elements
    if (this.homeCircle) this.homeCircle.remove();
    if (this.dwellIndicator) this.dwellIndicator.remove();
    if (this.progressDisplay) this.progressDisplay.remove();
    if (this.phaseIndicator) this.phaseIndicator.remove();
    
    // Move to next phase or show completion
    this.currentPhaseIndex++;
    
    if (this.currentPhaseIndex < this.config.comparisonPhases.length) {
      this.showBreakScreen();
    } else {
      this.showCompletionScreen();
    }
  }
  
  // Show break screen
  showBreakScreen() {
    const container = document.getElementById('mode-comparison-ui');
    this.breakTimeRemaining = this.config.breakDuration;
    
    container.innerHTML = `
      <div class="modal-screen break-screen">
        <h2>Take a Break</h2>
        <div id="break-timer" class="break-timer">
          ${this.formatTime(this.breakTimeRemaining)}
        </div>
        <p>
          You've completed phase ${this.currentPhaseIndex}/${this.config.comparisonPhases.length}
        </p>
        <p style="color: #aaa; font-size: 13px;">
          Rest your eyes and relax. The next phase will start automatically.
        </p>
        <button id="skip-break-btn" class="btn-secondary">
          Skip Break
        </button>
      </div>
    `;
    
    // Start break timer
    this.breakInterval = setInterval(() => {
      this.breakTimeRemaining--;
      const timerElement = document.getElementById('break-timer');
      if (timerElement) {
        timerElement.textContent = this.formatTime(this.breakTimeRemaining);
      }
      
      if (this.breakTimeRemaining <= 0) {
        clearInterval(this.breakInterval);
        this.startPhase(this.currentPhaseIndex);
      }
    }, 1000);
    
    // Skip break button
    document.getElementById('skip-break-btn').addEventListener('click', () => {
      clearInterval(this.breakInterval);
      this.startPhase(this.currentPhaseIndex);
    });
  }
  
  // Show completion screen
  showCompletionScreen() {
    const container = document.getElementById('mode-comparison-ui');
    
    // Remove experiment-active class
    document.body.classList.remove('experiment-active');
    
    container.innerHTML = `
      <div class="modal-screen completion-screen">
        <h2>🎉 Experiment Complete!</h2>
        <p>
          Thank you for participating in the Mode Comparison Experiment.
        </p>
        <p style="color: #aaa; font-size: 14px;">
          You completed <strong>${this.completedTrials}</strong> trials across <strong>4 phases</strong>.
        </p>
        <div class="summary-box">
          <strong>Data Summary:</strong><br>
          • Rotation-Only Mode: ${this.trialData.filter(t => t.mode === 'rotation').length} trials<br>
          • 3-Point 2D Mode: ${this.trialData.filter(t => t.mode === 'threepoint').length} trials<br>
          • Variance Level 2: ${this.trialData.filter(t => t.varianceLevel === 2).length} trials<br>
          • Variance Level 3: ${this.trialData.filter(t => t.varianceLevel === 3).length} trials
        </div>
        <button id="download-data-btn" class="btn-primary">
          Download Data
        </button>
        <button id="close-experiment-btn" class="btn-secondary">
          Back to Home
        </button>
      </div>
    `;
    
    // Download data button
    document.getElementById('download-data-btn').addEventListener('click', () => {
      this.downloadData();
    });
    
    // Close button
    document.getElementById('close-experiment-btn').addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }
  
  // Download experiment data as CSV
  downloadData() {
    const csv = Papa.unparse(this.trialData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mode-comparison-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    console.log('📥 Data downloaded');
  }
  
  // Close experiment and return to home
  close() {
    console.log('🔔 close() method called');
    if (!confirm("Are you sure you want to exit the experiment? All progress will be lost.")) {
      return;
    }
    
    console.log('🚪 Closing Mode Comparison experiment...');
    
    // Clean up everything
    this.cleanup();
    
    // Navigate back to home page
    window.location.href = 'index.html';
  }
  
  // Clean up and restore original state
  cleanup() {
    console.log('🧹 Cleaning up Mode Comparison experiment...');
    
    // Remove experiment-active class
    document.body.classList.remove('experiment-active');
    
    // Stop cursor tracking
    if (this.cursorTrackingInterval) {
      clearInterval(this.cursorTrackingInterval);
      this.cursorTrackingInterval = null;
    }
    
    // Stop break timer
    if (this.breakInterval) {
      clearInterval(this.breakInterval);
      this.breakInterval = null;
    }
    
    // Remove all UI elements
    Object.values(this.targetCircles).forEach(circle => circle.remove());
    if (this.homeCircle) this.homeCircle.remove();
    if (this.dwellIndicator) this.dwellIndicator.remove();
    if (this.progressDisplay) this.progressDisplay.remove();
    if (this.phaseIndicator) this.phaseIndicator.remove();
    
    const container = document.getElementById('mode-comparison-ui');
    if (container) container.innerHTML = '';
    
    // Restore original calibration if available
    if (this.originalCalibrationData) {
      window.state.calibrationData = this.originalCalibrationData.calibrationData;
      window.state.transformationMatrices = this.originalCalibrationData.transformationMatrices;
      window.state.config = this.originalCalibrationData.config;
      console.log('✅ Original calibration restored');
    }
    
    this.isRunning = false;
    console.log('✅ Cleanup complete');
  }
  
  // Format time (seconds to MM:SS)
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

// Make experiment class globally available
window.ModeComparisonExperiment = ModeComparisonExperiment;

// Initialize experiment instance
window.modeComparisonExperiment = new ModeComparisonExperiment();
console.log('✅ Mode Comparison Experiment initialized - VERSION 2026-01-27 MODE SWITCHING FIXED');
console.log('   Fix: Now properly sets liveRotationControl.trackingMode for actual mode switching');
console.log('   Methods available:', {
  skipLayout: typeof window.modeComparisonExperiment.skipLayout,
  close: typeof window.modeComparisonExperiment.close
});
