// Mode Comparison Experiment - Automatic Sequence Like Fitts
// Compares: Rotation-Only vs 3-Point 2D × Variance Levels 2 & 3

class ModeComparisonExperiment {
  constructor() {
    this.config = {
      targetSizePercents: [3, 6, 10],
      amplitudePercents: [25, 45],
      
      // Across-the-circle alternation pattern (same as Fitts experiment)
      // Start at 0° (right), then to opposite side at 180° (left), then 45° (upper-right), etc.
      // Pattern: right → left → upper-right → lower-left → top → bottom → upper-left → lower-right
      directionSequence: [0, 180, 45, 225, 90, 270, 135, 315],
      
      trialsPerLayout: 8,
      dwellTime: 2000,
      breakDuration: 60,
      
      // Automatic phase sequence: Mode × Variance (4 phases total)
      phaseSequence: [
        {
          phaseNumber: 1,
          mode: 'rotation',
          modeName: 'Rotation-Only Mode',
          varianceLevel: 2,
          exponentialRank: 9,
          alpha: 0.008992,
          variance: 7.0109,
          description: 'Rotation-Only, Variance Level 2'
        },
        {
          phaseNumber: 2,
          mode: 'threepoint',
          modeName: '3-Point 2D Mode',
          varianceLevel: 2,
          exponentialRank: 9,
          alpha: 0.008992,
          variance: 7.0109,
          description: '3-Point 2D, Variance Level 2'
        },
        {
          phaseNumber: 3,
          mode: 'rotation',
          modeName: 'Rotation-Only Mode',
          varianceLevel: 3,
          exponentialRank: 23,
          alpha: 0.02298,
          variance: 12.5275,
          description: 'Rotation-Only, Variance Level 3'
        },
        {
          phaseNumber: 4,
          mode: 'threepoint',
          modeName: '3-Point 2D Mode',
          varianceLevel: 3,
          exponentialRank: 23,
          alpha: 0.02298,
          variance: 12.5275,
          description: '3-Point 2D, Variance Level 3'
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
    
    // UI elements
    this.experimentUI = null;
    this.targetCircles = {};
    this.homeCircle = null;
    this.dwellIndicator = null;
    this.progressText = null;
    
    // Timing
    this.dwellStartTime = null;
    this.movementStartTime = null;
    this.trialStartTime = null;
    
    // Tracking
    this.cursorTrackingInterval = null;
    this.startPoint = null;
    this.selectionPoint = null;
    this.cursorPath = [];
    
    // Layouts
    this.layouts = [];
    this.totalTrials = 0;
    this.completedTrials = 0;
    
    // Break
    this.breakTimeRemaining = 0;
    this.breakInterval = null;
    
    // Bind
    this.update = this.update.bind(this);
  }
  
  percentToPixels(percent) {
    const limitingDimension = Math.min(window.innerWidth, window.innerHeight);
    return (percent / 100) * limitingDimension;
  }
  
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
        let finalAmplitude = amplitude;
        if (amplitude + targetRadius > safeRadius) {
          finalAmplitude = safeRadius - targetRadius;
          console.warn(`⚠️ Layout auto-scaled: ${finalAmplitude.toFixed(0)}px`);
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
  
  getCurrentPhase() {
    if (this.currentPhaseIndex < this.config.phaseSequence.length) {
      return this.config.phaseSequence[this.currentPhaseIndex];
    }
    return null;
  }
  
  getCurrentLayout() {
    if (this.currentLayoutIndex < this.layouts.length) {
      return this.layouts[this.currentLayoutIndex];
    }
    return null;
  }
  
  getCurrentDirection() {
    const layout = this.getCurrentLayout();
    if (layout && this.currentTrialInLayout < layout.sequence.length) {
      return layout.sequence[this.currentTrialInLayout];
    }
    return null;
  }
  
  async start() {
    if (this.isRunning) {
      console.warn('Experiment already running');
      return;
    }
    
    console.log('🚀 Starting Mode Comparison Experiment');
    
    if (!window.state.isTracking) {
      alert('Please ensure face tracking is active!');
      return;
    }
    
    this.isRunning = true;
    this.currentPhaseIndex = 0;
    
    // Hide non-essential controls
    this.hideNonEssentialControls();
    
    // Generate layouts
    this.layouts = this.generateLayouts();
    this.totalTrials = this.layouts.length * this.config.trialsPerLayout * this.config.phaseSequence.length;
    
    console.log(`📊 Total phases: ${this.config.phaseSequence.length}`);
    console.log(`📊 Layouts per phase: ${this.layouts.length}`);
    console.log(`📊 Total trials: ${this.totalTrials}`);
    
    // Show welcome screen
    this.showWelcomeScreen();
  }
  
  hideNonEssentialControls() {
    const trackingControls = document.querySelector('.tracking-controls');
    if (!trackingControls) return;
    
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
    
    // Ensure tracking controls are clickable and above everything
    trackingControls.style.pointerEvents = 'auto';
    trackingControls.style.zIndex = '20000'; // Above all experiment elements
    
    const allSections = trackingControls.querySelectorAll('[data-control-type]');
    allSections.forEach(section => {
      section.style.display = 'none';
    });
    
    const title = trackingControls.querySelector('h3');
    if (title) {
      title.textContent = 'Mode Comparison';
      title.style.color = '#a855f7';
    }
    
    this.addPhaseIndicator();
  }
  
  addPhaseIndicator() {
    const trackingControls = document.querySelector('.tracking-controls');
    if (!trackingControls) return;
    
    trackingControls.style.maxWidth = '280px';
    trackingControls.style.fontSize = '11px';
    
    const existingIndicator = document.getElementById('mode-comparison-phase-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }
    
    const phase = this.getCurrentPhase();
    if (!phase) return;
    
    const indicator = document.createElement('div');
    indicator.id = 'mode-comparison-phase-indicator';
    indicator.style.cssText = `
      background: rgba(168, 85, 247, 0.15);
      border: 1px solid rgba(168, 85, 247, 0.5);
      border-radius: 3px;
      padding: 6px;
      margin-bottom: 8px;
      color: #a855f7;
      font-size: 10px;
      line-height: 1.3;
      pointer-events: auto;
    `;
    
    indicator.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 2px; font-size: 10px;">📊 Phase ${phase.phaseNumber}/4</div>
      <div style="font-size: 9px; color: #ffc864; font-weight: bold;">${phase.modeName}</div>
      <div style="font-size: 9px; color: #aaa; margin-top: 2px;">Variance Level ${phase.varianceLevel} (Rank ${phase.exponentialRank})</div>
      <div style="font-size: 8px; color: #888; margin-top: 2px;">
        Expected Var: ${phase.variance.toFixed(2)}
      </div>
      <div style="font-size: 8px; color: #888; margin-top: 2px;">
        Trial: ${this.completedTrials}/${this.totalTrials}
      </div>
      <div style="display: flex; gap: 4px; margin-top: 6px; pointer-events: auto; position: relative; z-index: 999999;">
        <button 
          id="skip-phase-btn-inline"
          style="
            padding: 5px 8px;
            font-size: 10px;
            background: rgba(255, 152, 0, 0.3);
            border: 1px solid rgba(255, 152, 0, 0.5);
            border-radius: 3px;
            color: #ff9800;
            cursor: pointer;
            flex: 1;
            pointer-events: auto;
            position: relative;
            z-index: 999999;
          "
          onmouseover="this.style.background='rgba(255, 152, 0, 0.5)'"
          onmouseout="this.style.background='rgba(255, 152, 0, 0.3)'"
        >
          ⏭️ Skip Phase
        </button>
        <button 
          id="go-back-btn-inline"
          style="
            padding: 5px 8px;
            font-size: 10px;
            background: rgba(100, 168, 255, 0.3);
            border: 1px solid rgba(100, 168, 255, 0.5);
            border-radius: 3px;
            color: #64a8ff;
            cursor: pointer;
            flex: 1;
            pointer-events: auto;
            position: relative;
            z-index: 999999;
          "
          onmouseover="this.style.background='rgba(100, 168, 255, 0.5)'"
          onmouseout="this.style.background='rgba(100, 168, 255, 0.3)'"
        >
          🔙 Go Back
        </button>
      </div>
    `;
    
    const title = trackingControls.querySelector('h3');
    if (title && title.nextSibling) {
      trackingControls.insertBefore(indicator, title.nextSibling);
    } else if (title) {
      title.parentNode.appendChild(indicator);
    }
    
    // Attach event listeners to buttons (must be done after adding to DOM)
    setTimeout(() => {
      const skipBtn = document.getElementById('skip-phase-btn-inline');
      const goBackBtn = document.getElementById('go-back-btn-inline');
      
      if (skipBtn) {
        skipBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Skip Phase button clicked!');
          this.skipPhase();
        });
      }
      
      if (goBackBtn) {
        goBackBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Go Back button clicked!');
          this.close();
        });
      }
    }, 0);
  }
  
  restoreAllControls() {
    const trackingControls = document.querySelector('.tracking-controls');
    if (!trackingControls) return;
    
    trackingControls.style.maxWidth = '';
    trackingControls.style.fontSize = '';
    
    const allSections = trackingControls.querySelectorAll('[data-control-type]');
    allSections.forEach(section => {
      section.style.display = '';
    });
    
    const title = trackingControls.querySelector('h3');
    if (title) {
      title.textContent = 'Tracking Controls';
      title.style.color = '';
    }
    
    const phaseIndicator = document.getElementById('mode-comparison-phase-indicator');
    if (phaseIndicator) {
      phaseIndicator.remove();
    }
  }
  
  showWelcomeScreen() {
    const container = this.getOrCreateExperimentUI();
    container.innerHTML = `
      <div class="experiment-instructions">
        <h2>Mode Comparison Experiment</h2>
        <p style="font-size: 12px; color: #aaa; margin: 8px 0;">
          Automatic sequence comparing Rotation-Only and 3-Point 2D modes at 2 variance levels
        </p>
        <div class="info-box">
          <strong>Experiment Structure:</strong><br>
          • 4 phases (automatic sequence)<br>
          • 6 layouts per phase (3 sizes × 2 distances)<br>
          • 8 trials per layout (8 circular directions)<br>
          • Total: ${this.totalTrials} trials<br>
          • 1-minute break between phases
        </div>
        <div class="phase-list">
          <strong style="color: #a855f7;">Phase Sequence:</strong>
          ${this.config.phaseSequence.map(p => `
            <div style="margin: 5px 0; padding: 5px; background: rgba(168, 85, 247, 0.1); border-radius: 3px;">
              <strong>Phase ${p.phaseNumber}:</strong> ${p.description}
            </div>
          `).join('')}
        </div>
        <div class="info-box" style="background: rgba(76, 175, 80, 0.1); border-left: 3px solid #4caf50;">
          <strong>Instructions:</strong><br>
          • Move cursor to the highlighted green target<br>
          • Hold steady for 0.8 seconds to select<br>
          • Return to center (yellow circle) between trials<br>
          • Be as quick and accurate as possible
        </div>
        <div class="info-box" style="background: rgba(100, 150, 255, 0.2); border-left: 3px solid #64c8ff;">
          <strong>Across-the-Circle Pattern:</strong><br>
          Right → Left → Upper-Right → Lower-Left → Top → Bottom → Upper-Left → Lower-Right<br>
          <span style="font-size: 10px; color: #888;">(0° → 180° → 45° → 225° → 90° → 270° → 135° → 315°)</span>
        </div>
        <button id="begin-mode-comparison-btn" class="start-button" style="
          width: 100%;
          padding: 15px;
          font-size: 16px;
          background: #a855f7;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-weight: bold;
          margin-top: 20px;
          transition: background 0.3s;
        " onmouseover="this.style.background='#9333ea'" onmouseout="this.style.background='#a855f7'">
          Begin Experiment
        </button>
        <button id="cancel-mode-comparison-btn" class="cancel-button" style="
          width: 100%;
          padding: 10px;
          font-size: 13px;
          background: rgba(255, 255, 255, 0.1);
          color: #ccc;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 5px;
          cursor: pointer;
          margin-top: 10px;
          transition: all 0.3s;
        " onmouseover="this.style.background='rgba(255, 255, 255, 0.2)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'">
          Cancel
        </button>
      </div>
    `;
    
    document.getElementById('begin-mode-comparison-btn').addEventListener('click', () => {
      this.startPhase(0);
    });
    
    document.getElementById('cancel-mode-comparison-btn').addEventListener('click', () => {
      this.cleanup();
    });
  }
  
  startPhase(phaseIndex) {
    this.currentPhaseIndex = phaseIndex;
    const phase = this.getCurrentPhase();
    
    if (!phase) {
      this.showCompletionScreen();
      return;
    }
    
    console.log(`🎯 Starting Phase ${phase.phaseNumber}: ${phase.description}`);
    
    // Apply phase configuration
    this.applyPhaseConfiguration(phase);
    
    // Update phase indicator
    this.addPhaseIndicator();
    
    // Reset counters
    this.currentLayoutIndex = 0;
    this.currentTrialInLayout = 0;
    
    // Show phase start screen
    this.showPhaseStartScreen(phase);
  }
  
  applyPhaseConfiguration(phase) {
    console.log(`🔧 Phase ${phase.phaseNumber} Configuration:`);
    console.log(`   Mode: ${phase.modeName} (${phase.mode})`);
    console.log(`   Variance Level: ${phase.varianceLevel}`);
    console.log(`   Exponential Rank: ${phase.exponentialRank}`);
    console.log(`   Expected Variance: ${phase.variance.toFixed(4)}`);
    console.log(`   Alpha: ${phase.alpha.toFixed(6)}`);
    
    // Set mode in config
    if (phase.mode === 'rotation') {
      window.state.config.rotationOnlyMode = true;
      window.state.config.useRotation = true;
      console.log(`   ✅ Rotation-Only Mode config: ENABLED`);
      
      // CRITICAL FIX: Also set the tracking mode that tracking.js actually uses
      if (window.liveRotationControl) {
        window.liveRotationControl.trackingMode = 'rotation';
        console.log(`   ✅ liveRotationControl.trackingMode: 'rotation'`);
      } else {
        console.warn(`   ⚠️ liveRotationControl not available!`);
      }
    } else {
      window.state.config.rotationOnlyMode = false;
      window.state.config.useRotation = false; // Explicitly disable rotation
      window.state.config.landmarkPoints = "3";
      window.state.config.coordinateSystem = "2d";
      console.log(`   ✅ 3-Point 2D Mode config: ENABLED (rotation disabled)`);
      
      // CRITICAL FIX: Also set the tracking mode that tracking.js actually uses
      if (window.liveRotationControl) {
        window.liveRotationControl.trackingMode = 'landmarks';
        console.log(`   ✅ liveRotationControl.trackingMode: 'landmarks'`);
      } else {
        console.warn(`   ⚠️ liveRotationControl not available!`);
      }
    }
    
    // Set filter - exponential smoothing with specified alpha
    const smoothingFactor = 1 - phase.alpha;
    window.state.config.filterType = 'exponential';
    window.state.config.exponentialSmoothingFactor = smoothingFactor;
    console.log(`   ✅ Exponential Filter: smoothing=${smoothingFactor.toFixed(6)}, alpha=${phase.alpha.toFixed(6)}`);
    console.log(`   ✅ Expected cursor variance: ${phase.variance.toFixed(4)}`);
    
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
    console.log(`✅ Phase ${phase.phaseNumber} configuration complete:`);
    console.log(`   Final trackingMode: ${window.liveRotationControl?.trackingMode || 'N/A'}`);
    console.log(`   Final smoothingFactor: ${window.state.config.exponentialSmoothingFactor}`);
  }
  
  showPhaseStartScreen(phase) {
    const container = this.getOrCreateExperimentUI();
    container.innerHTML = `
      <div class="experiment-instructions" style="border: 2px solid #a855f7;">
        <h2 style="color: #a855f7;">Phase ${phase.phaseNumber}/4</h2>
        <h3 style="color: #ffc864; margin: 10px 0;">${phase.modeName}</h3>
        <p style="color: #aaa; font-size: 13px;">
          Variance Level: ${phase.varianceLevel} | Exponential Rank: ${phase.exponentialRank}
        </p>
        <div class="info-box">
          <strong>This Phase:</strong><br>
          • ${this.layouts.length} layouts<br>
          • ${this.layouts.length * this.config.trialsPerLayout} trials total<br>
          • Estimated time: ~${Math.ceil(this.layouts.length * this.config.trialsPerLayout * 5 / 60)} minutes
        </div>
        <p style="color: #ccc; font-size: 13px;">Click "Start Phase" when ready</p>
        <button id="start-phase-btn" class="start-button" style="
          width: 100%;
          padding: 15px;
          font-size: 16px;
          background: #a855f7;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-weight: bold;
          margin-top: 15px;
          transition: background 0.3s;
        " onmouseover="this.style.background='#9333ea'" onmouseout="this.style.background='#a855f7'">
          Start Phase ${phase.phaseNumber}
        </button>
      </div>
    `;
    
    document.getElementById('start-phase-btn').addEventListener('click', () => {
      this.startLayout();
    });
  }
  
  getOrCreateExperimentUI() {
    if (!this.experimentUI) {
      this.experimentUI = document.createElement('div');
      this.experimentUI.id = 'mode-comparison-ui';
      this.experimentUI.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 2000;';
      document.body.appendChild(this.experimentUI);
    }
    return this.experimentUI;
  }
  
  hideExperimentUI() {
    if (this.experimentUI) {
      this.experimentUI.innerHTML = '';
    }
  }
  
  startLayout() {
    const layout = this.getCurrentLayout();
    if (!layout) {
      this.finishPhase();
      return;
    }
    
    console.log(`📐 Layout ${this.currentLayoutIndex + 1}/${this.layouts.length}`);
    
    this.hideExperimentUI();
    this.createTargetCircles(layout);
    this.createHomeCircle();
    this.createDwellIndicator();
    
    this.currentTrialInLayout = 0;
    this.startTrial();
  }
  
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
    }
    
    console.log(`✅ Created ${Object.keys(this.targetCircles).length} target circles`);
  }
  
  createHomeCircle() {
    if (this.homeCircle) {
      this.homeCircle.remove();
    }
    
    // Only show home circle for first trial in layout (just like Fitts)
    if (this.currentTrialInLayout === 0) {
      const layout = this.getCurrentLayout();
      const homeSize = layout.targetSize * 1.3; // Slightly bigger than targets (1.3x)
      
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
      console.log('   ✅ Blue home circle created');
    }
  }
  
  createDwellIndicator() {
    if (this.dwellIndicator) this.dwellIndicator.remove();
    
    const indicator = document.createElement('div');
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
  
  startTrial() {
    const layout = this.getCurrentLayout();
    const direction = this.getCurrentDirection();
    
    if (direction === null) {
      this.finishLayout();
      return;
    }
    
    const phase = this.getCurrentPhase();
    console.log(`🎯 Phase ${phase.phaseNumber}, Trial ${this.completedTrials + 1}/${this.totalTrials}: Direction ${direction}°`);
    
    // Set waiting for home circle only on first trial
    if (this.currentTrialInLayout === 0) {
      this.waitingForHomeCircle = true;
    } else {
      this.waitingForHomeCircle = false;
    }
    
    // Update target highlighting - exact copy of Fitts logic
    this.updateTargetHighlighting();
    
    this.trialStartTime = Date.now();
    this.startCursorTracking();
  }
  
  // Update target highlighting - exactly like Fitts experiment
  updateTargetHighlighting() {
    const layout = this.getCurrentLayout();
    if (!layout) return;
    
    const currentDirection = this.getCurrentDirection();
    console.log("🎨 Updating target highlighting - current direction:", currentDirection, "trial:", this.currentTrialInLayout);
    
    // Update all circles
    for (const [direction, circle] of Object.entries(this.targetCircles)) {
      const dir = parseInt(direction);
      const sequenceIndex = layout.sequence.indexOf(dir);
      
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
      } else if (sequenceIndex !== -1 && sequenceIndex < this.currentTrialInLayout) {
        // Completed target - green
        circle.style.setProperty('background-color', 'rgba(100, 255, 100, 0.4)', 'important');
        circle.style.setProperty('border-color', 'rgba(100, 255, 100, 0.7)', 'important');
        circle.style.setProperty('border-width', '3px', 'important');
        circle.style.setProperty('box-shadow', 'none', 'important');
        circle.style.setProperty('transform', 'scale(1)', 'important');
        console.log(`  ✅ Direction ${dir}° = GREEN (completed)`);
      } else if (sequenceIndex === this.currentTrialInLayout + 1) {
        // Next target - check if we're waiting for home circle
        if (this.waitingForHomeCircle) {
          // Before starting: next target is gray (not shown yet)
          circle.style.setProperty('background-color', 'rgba(150, 150, 150, 0.3)', 'important');
          circle.style.setProperty('border-color', 'rgba(150, 150, 150, 0.6)', 'important');
          circle.style.setProperty('border-width', '3px', 'important');
          circle.style.setProperty('box-shadow', 'none', 'important');
          circle.style.setProperty('transform', 'scale(1)', 'important');
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
  }
  
  startCursorTracking() {
    if (this.cursorTrackingInterval) {
      clearInterval(this.cursorTrackingInterval);
    }
    
    this.cursorTrackingInterval = setInterval(() => {
      this.update();
    }, 16);
  }
  
  update() {
    const cursorX = window.state.cursorX;
    const cursorY = window.state.cursorY;
    
    if (cursorX === null || cursorY === null) return;
    
    if (this.waitingForHomeCircle) {
      this.checkHomeCircleDwell(cursorX, cursorY);
    } else {
      this.checkTargetDwell(cursorX, cursorY);
    }
  }
  
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
  
  checkTargetDwell(cursorX, cursorY) {
    const layout = this.getCurrentLayout();
    const direction = this.getCurrentDirection();
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    const rad = (direction * Math.PI) / 180;
    const targetX = centerX + layout.amplitude * Math.cos(rad);
    const targetY = centerY + layout.amplitude * Math.sin(rad);
    const distance = Math.sqrt((cursorX - targetX) ** 2 + (cursorY - targetY) ** 2);
    
    if (distance <= layout.targetSize / 2) {
      if (!this.dwellStartTime) {
        this.dwellStartTime = Date.now();
        this.showDwellIndicator(targetX, targetY, layout.targetSize);
      }
      
      const dwellDuration = Date.now() - this.dwellStartTime;
      this.updateDwellIndicator(dwellDuration / this.config.dwellTime);
      
      if (dwellDuration >= this.config.dwellTime) {
        this.onTargetComplete(cursorX, cursorY, targetX, targetY);
      }
    } else {
      this.dwellStartTime = null;
      this.hideDwellIndicator();
    }
  }
  
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
  
  updateDwellIndicator(progress) {
    if (this.dwellIndicator) {
      // Gradually change border from transparent to green as progress increases
      const alpha = Math.min(progress, 1);
      this.dwellIndicator.style.borderColor = `rgba(76, 175, 80, ${alpha})`;
    }
  }
  
  hideDwellIndicator() {
    if (this.dwellIndicator) {
      this.dwellIndicator.style.display = 'none';
    }
  }
  
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
  
  onTargetComplete(cursorX, cursorY, targetX, targetY) {
    const layout = this.getCurrentLayout();
    const direction = this.getCurrentDirection();
    const phase = this.getCurrentPhase();
    const movementTime = (Date.now() - this.movementStartTime) / 1000; // Convert to seconds
    const selectionTime = Date.now();
    
    // Calculate actual amplitude
    const actualAmplitude = Math.sqrt(
      (cursorX - this.startPoint.x) ** 2 + 
      (cursorY - this.startPoint.y) ** 2
    );
    
    // Calculate selection error (distance from selection point to target center)
    const selectionError = Math.sqrt(
      (cursorX - targetX) ** 2 + 
      (cursorY - targetY) ** 2
    );
    
    // Per-trial We approximation; true We requires aggregate directional projection (ISO 9241-9)
    const effectiveWidth = 4.133 * selectionError;
    
    const IDe = Math.log2(layout.amplitude / Math.max(effectiveWidth, 1) + 1);
    
    // Calculate throughput: TP = ID_e / MT (bits per second)
    const throughput = movementTime > 0 ? IDe / movementTime : 0;
    
    // Record trial data
    const trialResult = {
      timestamp: new Date().toISOString(),
      globalTrialNumber: this.completedTrials + 1,
      phaseNumber: phase.phaseNumber,
      mode: phase.mode,
      modeName: phase.modeName,
      varianceLevel: phase.varianceLevel,
      exponentialRank: phase.exponentialRank,
      expectedVariance: phase.variance,
      alpha: phase.alpha,
      smoothingFactor: 1 - phase.alpha,
      layoutIndex: this.currentLayoutIndex,
      trialInLayout: this.currentTrialInLayout,
      targetSize: layout.targetSize,
      amplitude: layout.amplitude,
      direction: direction,
      directionIndex: this.currentTrialInLayout,
      movementTime: movementTime,
      actualAmplitude: actualAmplitude,
      selectionError: selectionError,
      effectiveWidth: effectiveWidth,
      IDe: IDe,
      throughput: throughput,
      startX: this.startPoint.x,
      startY: this.startPoint.y,
      selectionX: cursorX,
      selectionY: cursorY,
      targetX: targetX,
      targetY: targetY,
      trialStartTime: this.trialStartTime,
      movementStartTime: this.movementStartTime,
      selectionTime: selectionTime
    };
    
    this.trialData.push(trialResult);
    this.completedTrials++;
    
    // Log trial results
    console.log(`✅ Trial ${this.completedTrials}/${this.totalTrials} complete:`, {
      mode: phase.modeName,
      variance: phase.varianceLevel,
      rank: phase.exponentialRank,
      MT: `${movementTime.toFixed(3)}s`,
      throughput: `${throughput.toFixed(3)} bps`,
      error: `${selectionError.toFixed(1)}px`,
      IDe: IDe.toFixed(3)
    });
    
    // Update phase indicator with new trial count
    this.addPhaseIndicator();
    
    // Move to next trial
    this.currentTrialInLayout++;
    this.dwellStartTime = null;
    this.hideDwellIndicator();
    
    // Small delay before next trial
    setTimeout(() => {
      this.startTrial();
    }, 500);
  }
  
  finishLayout() {
    console.log(`✅ Layout ${this.currentLayoutIndex + 1}/${this.layouts.length} complete`);
    
    Object.values(this.targetCircles).forEach(circle => circle.remove());
    this.targetCircles = {};
    
    this.currentLayoutIndex++;
    this.currentTrialInLayout = 0;
    
    if (this.currentLayoutIndex < this.layouts.length) {
      this.startLayout();
    } else {
      this.finishPhase();
    }
  }
  
  finishPhase() {
    const phase = this.getCurrentPhase();
    console.log(`✅ Phase ${phase.phaseNumber}/4 complete`);
    
    // Calculate phase statistics
    const phaseTrials = this.trialData.filter(t => t.phaseNumber === phase.phaseNumber);
    if (phaseTrials.length > 0) {
      const avgMT = phaseTrials.reduce((sum, t) => sum + t.movementTime, 0) / phaseTrials.length;
      const avgTP = phaseTrials.reduce((sum, t) => sum + t.throughput, 0) / phaseTrials.length;
      const avgError = phaseTrials.reduce((sum, t) => sum + t.selectionError, 0) / phaseTrials.length;
      
      console.log(`📊 Phase ${phase.phaseNumber} Summary (${phase.modeName}, Variance ${phase.varianceLevel}):`);
      console.log(`   Trials: ${phaseTrials.length}`);
      console.log(`   Average MT: ${avgMT.toFixed(3)}s`);
      console.log(`   Average Throughput: ${avgTP.toFixed(3)} bps`);
      console.log(`   Average Error: ${avgError.toFixed(1)}px`);
      console.log(`   Exponential Rank: ${phase.exponentialRank}`);
      console.log(`   Expected Variance: ${phase.variance.toFixed(4)}`);
    }
    
    // Stop tracking
    if (this.cursorTrackingInterval) {
      clearInterval(this.cursorTrackingInterval);
      this.cursorTrackingInterval = null;
    }
    
    // Clean up UI
    if (this.homeCircle) this.homeCircle.remove();
    if (this.dwellIndicator) this.dwellIndicator.remove();
    
    // Move to next phase
    this.currentPhaseIndex++;
    
    if (this.currentPhaseIndex < this.config.phaseSequence.length) {
      this.showBreakScreen();
    } else {
      this.showCompletionScreen();
    }
  }
  
  showBreakScreen() {
    const container = this.getOrCreateExperimentUI();
    this.breakTimeRemaining = this.config.breakDuration;
    
    container.innerHTML = `
      <div class="experiment-instructions" style="border: 2px solid #ffc864;">
        <h2 style="color: #ffc864;">Take a Break</h2>
        <div id="break-timer" style="font-size: 64px; font-weight: bold; color: #4caf50; margin: 30px 0; font-family: 'Courier New', monospace; text-shadow: 0 0 20px rgba(76, 175, 80, 0.5);">
          ${this.formatTime(this.breakTimeRemaining)}
        </div>
        <p>Phase ${this.currentPhaseIndex}/${this.config.phaseSequence.length} complete</p>
        <p style="color: #aaa; font-size: 13px;">Rest your eyes. The next phase will start automatically.</p>
        <button id="skip-break-btn" class="cancel-button" style="
          width: 100%;
          padding: 10px;
          font-size: 13px;
          background: rgba(255, 255, 255, 0.1);
          color: #ccc;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 5px;
          cursor: pointer;
          margin-top: 20px;
          transition: all 0.3s;
        " onmouseover="this.style.background='rgba(255, 255, 255, 0.2)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'">
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
  
  showCompletionScreen() {
    const container = this.getOrCreateExperimentUI();
    
    container.innerHTML = `
      <div class="experiment-instructions" style="border: 2px solid #64ff64;">
        <h2 style="color: #64ff64;">🎉 Experiment Complete!</h2>
        <p>Thank you for participating in the Mode Comparison Experiment.</p>
        <p>Completed <strong>${this.completedTrials}</strong> trials across <strong>4 phases</strong>.</p>
        <div class="info-box">
          <strong>Data Summary:</strong><br>
          • Rotation-Only Mode: ${this.trialData.filter(t => t.mode === 'rotation').length} trials<br>
          • 3-Point 2D Mode: ${this.trialData.filter(t => t.mode === 'threepoint').length} trials<br>
          • Variance Level 2: ${this.trialData.filter(t => t.varianceLevel === 2).length} trials<br>
          • Variance Level 3: ${this.trialData.filter(t => t.varianceLevel === 3).length} trials
        </div>
        <button id="download-data-btn" class="start-button" style="
          width: 100%;
          padding: 15px;
          font-size: 16px;
          background: #4caf50;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-weight: bold;
          margin-top: 15px;
          transition: background 0.3s;
        " onmouseover="this.style.background='#45a049'" onmouseout="this.style.background='#4caf50'">
          Download Data
        </button>
        <button id="close-experiment-btn" class="cancel-button" style="
          width: 100%;
          padding: 10px;
          font-size: 13px;
          background: rgba(255, 255, 255, 0.1);
          color: #ccc;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 5px;
          cursor: pointer;
          margin-top: 10px;
          transition: all 0.3s;
        " onmouseover="this.style.background='rgba(255, 255, 255, 0.2)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'">
          Close
        </button>
      </div>
    `;
    
    document.getElementById('download-data-btn').addEventListener('click', () => {
      this.downloadData();
    });
    
    document.getElementById('close-experiment-btn').addEventListener('click', () => {
      this.cleanup();
    });
  }
  
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
  
  // Skip current phase
  skipPhase() {
    console.log('⏭️ Skip Phase button clicked!');
    
    if (!confirm("Skip this phase and move to the next one? Progress will not be saved for this phase.")) {
      return;
    }
    
    const phase = this.getCurrentPhase();
    console.log(`⏭️ Skipping phase ${phase.phaseNumber}/4: ${phase.modeName}`);
    
    // Stop any running trial
    if (this.cursorTrackingInterval) {
      clearInterval(this.cursorTrackingInterval);
      this.cursorTrackingInterval = null;
    }
    
    // Clean up UI
    Object.values(this.targetCircles).forEach(circle => circle.remove());
    this.targetCircles = {};
    if (this.homeCircle) this.homeCircle.remove();
    if (this.dwellIndicator) this.dwellIndicator.remove();
    
    // Move to next phase
    this.currentPhaseIndex++;
    this.currentLayoutIndex = 0;
    this.currentTrialInLayout = 0;
    
    // Check if all phases are complete
    if (this.currentPhaseIndex >= this.config.phaseSequence.length) {
      console.log('All phases complete or skipped');
      this.showCompletionScreen();
    } else {
      // Show break screen before next phase
      this.showBreakScreen();
    }
  }
  
  // Close experiment and go back to tracking controls
  close() {
    console.log('🔙 Go Back button clicked!');
    
    if (!confirm("Exit the Mode Comparison experiment? Progress will not be saved.")) {
      return;
    }
    
    console.log('🔙 Closing Mode Comparison Experiment');
    
    // Stop tracking
    if (this.cursorTrackingInterval) {
      clearInterval(this.cursorTrackingInterval);
      this.cursorTrackingInterval = null;
    }
    
    // Stop break timer
    if (this.breakInterval) {
      clearInterval(this.breakInterval);
      this.breakInterval = null;
    }
    
    // Clean up all UI elements
    Object.values(this.targetCircles).forEach(circle => circle.remove());
    this.targetCircles = {};
    if (this.homeCircle) this.homeCircle.remove();
    if (this.dwellIndicator) this.dwellIndicator.remove();
    this.hideExperimentUI();
    if (this.experimentUI) {
      this.experimentUI.remove();
      this.experimentUI = null;
    }
    
    // Restore controls
    this.restoreAllControls();
    
    // Reset state
    this.isRunning = false;
    this.currentPhaseIndex = 0;
    this.currentLayoutIndex = 0;
    this.currentTrialInLayout = 0;
    
    console.log('✅ Mode Comparison experiment closed');
  }
  
  cleanup() {
    console.log('🧹 Cleaning up Mode Comparison Experiment');
    
    // Stop tracking
    if (this.cursorTrackingInterval) {
      clearInterval(this.cursorTrackingInterval);
    }
    
    // Stop break timer
    if (this.breakInterval) {
      clearInterval(this.breakInterval);
    }
    
    // Clean up UI
    Object.values(this.targetCircles).forEach(circle => circle.remove());
    if (this.homeCircle) this.homeCircle.remove();
    if (this.dwellIndicator) this.dwellIndicator.remove();
    this.hideExperimentUI();
    if (this.experimentUI) {
      this.experimentUI.remove();
      this.experimentUI = null;
    }
    
    // Restore controls
    this.restoreAllControls();
    
    // Reset state
    this.isRunning = false;
    this.currentPhaseIndex = 0;
    this.currentLayoutIndex = 0;
    this.completedTrials = 0;
    
    console.log('✅ Cleanup complete');
  }
  
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

// Initialize experiment instance
window.modeComparisonExperiment = new ModeComparisonExperiment();
console.log('✅ Mode Comparison Experiment initialized - VERSION 2026-01-27 MODE SWITCHING FIXED');
console.log('   Fix: Now properly sets liveRotationControl.trackingMode for actual mode switching');
