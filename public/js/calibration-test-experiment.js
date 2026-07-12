// Calibration Importance Test Experiment
// Tests if individual calibration matters by running Fitts test with 
// Rotation-Only Mode and Variance Level 3
// Uses the exact calibration the user uploaded or created

class CalibrationTestExperiment {
  constructor() {
    this.config = {
      targetSizePercents: [3, 6, 10],
      amplitudePercents: [25, 45],
      
      // Across-the-circle alternation pattern (same as Fitts experiment)
      directionSequence: [0, 180, 45, 225, 90, 270, 135, 315],
      
      trialsPerLayout: 8,
      dwellTime: 2000,
      
      // Fixed configuration: Rotation-Only Mode with Variance Level 3
      experimentConfig: {
        mode: 'rotation',
        modeName: 'Rotation-Only Mode',
        varianceLevel: 3,
        exponentialRank: 23,
        alpha: 0.02298,
        variance: 12.5275,
        description: 'Calibration Test - Rotation-Only, Variance Level 3'
      }
    };
    
    // State
    this.isRunning = false;
    this.currentLayoutIndex = 0;
    this.currentTrialInLayout = 0;
    this.trialData = [];
    this.waitingForHomeCircle = false;
    
    // UI elements
    this.experimentUI = null;
    this.targetCircles = {};
    this.homeCircle = null;
    this.dwellIndicator = null;
    
    // Timing
    this.dwellStartTime = null;
    this.movementStartTime = null;
    this.trialStartTime = null;
    
    // Tracking
    this.cursorTrackingInterval = null;
    this.startPoint = null;
    this.cursorPath = [];
    this.previousTargetSize = null; // For exit detection (like original Fitts)
    
    // Layouts
    this.layouts = [];
    this.totalTrials = 0;
    this.completedTrials = 0;
    
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
      console.warn('Calibration Test already running');
      return;
    }
    
    console.log('🔬 Starting Calibration Importance Test');
    
    if (!window.state.isTracking) {
      alert('Please ensure face tracking is active!');
      return;
    }
    
    // Check for calibration data
    if (!window.state.transformationMatrices || 
        (!window.state.transformationMatrices.rotationOnly && 
         !window.state.transformationMatrices.threePoint2d)) {
      alert('No calibration data found! Please calibrate or upload a calibration file first.');
      return;
    }
    
    this.isRunning = true;
    
    // Hide non-essential controls
    this.hideNonEssentialControls();
    
    // Generate layouts
    this.layouts = this.generateLayouts();
    this.totalTrials = this.layouts.length * this.config.trialsPerLayout;
    
    console.log(`📊 Total layouts: ${this.layouts.length}`);
    console.log(`📊 Total trials: ${this.totalTrials}`);
    
    // Show welcome screen
    this.showWelcomeScreen();
  }
  
  hideNonEssentialControls() {
    const trackingControls = document.querySelector('.tracking-controls');
    if (!trackingControls) return;
    
    // Hide rotation control panel
    if (window.liveRotationControl && window.liveRotationControl.hide) {
      window.liveRotationControl.hide();
    }
    
    // Hide Three.js head visualization
    if (window.threeJSHeadViz && window.threeJSHeadViz.hide) {
      window.threeJSHeadViz.hide();
    }
    
    trackingControls.style.pointerEvents = 'auto';
    trackingControls.style.zIndex = '20000';
    
    const allSections = trackingControls.querySelectorAll('[data-control-type]');
    allSections.forEach(section => {
      section.style.display = 'none';
    });
    
    const title = trackingControls.querySelector('h3');
    if (title) {
      title.textContent = 'Calibration Test';
      title.style.color = '#f59e0b'; // Amber color
    }
    
    this.addProgressIndicator();
  }
  
  addProgressIndicator() {
    const trackingControls = document.querySelector('.tracking-controls');
    if (!trackingControls) return;
    
    trackingControls.style.maxWidth = '280px';
    trackingControls.style.fontSize = '11px';
    
    const existingIndicator = document.getElementById('calibration-test-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }
    
    const config = this.config.experimentConfig;
    
    const indicator = document.createElement('div');
    indicator.id = 'calibration-test-indicator';
    indicator.style.cssText = `
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.5);
      border-radius: 3px;
      padding: 6px;
      margin-bottom: 8px;
      color: #f59e0b;
      font-size: 10px;
      line-height: 1.3;
      pointer-events: auto;
    `;
    
    indicator.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 2px; font-size: 10px;">🔬 Calibration Test</div>
      <div style="font-size: 9px; color: #ffc864; font-weight: bold;">${config.modeName}</div>
      <div style="font-size: 9px; color: #aaa; margin-top: 2px;">Variance Level ${config.varianceLevel} (Rank ${config.exponentialRank})</div>
      <div style="font-size: 8px; color: #888; margin-top: 2px;">
        Trial: ${this.completedTrials}/${this.totalTrials}
      </div>
      <div style="display: flex; gap: 4px; margin-top: 6px; pointer-events: auto;">
        <button 
          id="cancel-calibration-test-btn"
          style="
            padding: 5px 8px;
            font-size: 10px;
            background: rgba(239, 68, 68, 0.3);
            border: 1px solid rgba(239, 68, 68, 0.5);
            border-radius: 3px;
            color: #ef4444;
            cursor: pointer;
            flex: 1;
            pointer-events: auto;
          "
          onmouseover="this.style.background='rgba(239, 68, 68, 0.5)'"
          onmouseout="this.style.background='rgba(239, 68, 68, 0.3)'"
        >
          ❌ Cancel
        </button>
      </div>
    `;
    
    const title = trackingControls.querySelector('h3');
    if (title && title.nextSibling) {
      trackingControls.insertBefore(indicator, title.nextSibling);
    } else if (title) {
      title.parentNode.appendChild(indicator);
    }
    
    // Attach event listener
    setTimeout(() => {
      const cancelBtn = document.getElementById('cancel-calibration-test-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
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
    
    const indicator = document.getElementById('calibration-test-indicator');
    if (indicator) {
      indicator.remove();
    }
  }
  
  showWelcomeScreen() {
    const container = this.getOrCreateExperimentUI();
    const config = this.config.experimentConfig;
    
    // Get calibration info
    let calibrationInfo = 'Unknown';
    if (window.state.calibrationSource) {
      calibrationInfo = window.state.calibrationSource;
    } else if (window.state.transformationMatrices) {
      calibrationInfo = 'Current session calibration';
    }
    
    container.innerHTML = `
      <div class="experiment-instructions" style="border: 2px solid #f59e0b;">
        <h2 style="color: #f59e0b;">🔬 Calibration Importance Test</h2>
        <p style="font-size: 12px; color: #aaa; margin: 8px 0;">
          Test how well your personal calibration works with Rotation-Only mode
        </p>
        <div class="info-box" style="background: rgba(245, 158, 11, 0.1); border-left: 3px solid #f59e0b;">
          <strong>Experiment Configuration:</strong><br>
          • Mode: <span style="color: #ffc864; font-weight: bold;">${config.modeName}</span><br>
          • Variance Level: ${config.varianceLevel} (Rank ${config.exponentialRank})<br>
          • Alpha: ${config.alpha.toFixed(6)}<br>
          • Expected Variance: ${config.variance.toFixed(4)}<br>
          • ${this.layouts.length} layouts (3 sizes × 2 distances)<br>
          • ${this.config.trialsPerLayout} trials per layout<br>
          • Total: <strong>${this.totalTrials} trials</strong>
        </div>
        <div class="info-box" style="background: rgba(100, 200, 255, 0.1); border-left: 3px solid #64c8ff;">
          <strong>🎯 Current Calibration:</strong><br>
          <span style="color: #64c8ff;">${calibrationInfo}</span>
        </div>
        <div class="info-box" style="background: rgba(76, 175, 80, 0.1); border-left: 3px solid #4caf50;">
          <strong>Instructions:</strong><br>
          • Start at center (blue circle), then move to the red target<br>
          • Hold steady for 0.8 seconds to select each target<br>
          • After selecting, move directly to the next target (across the circle)<br>
          • Pattern: Right → Left → Upper-Right → Lower-Left → etc.<br>
          • Be as quick and accurate as possible
        </div>
        <div class="info-box" style="background: rgba(168, 85, 247, 0.1); border-left: 3px solid #a855f7;">
          <strong>Purpose:</strong><br>
          This test helps determine if your personal calibration makes a 
          difference compared to using a "standard" calibration. Run this 
          test with your own calibration, then try with someone else's 
          calibration file to compare!
        </div>
        <button id="begin-calibration-test-btn" class="start-button" style="
          width: 100%;
          padding: 15px;
          font-size: 16px;
          background: #f59e0b;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-weight: bold;
          margin-top: 20px;
          transition: background 0.3s;
        " onmouseover="this.style.background='#d97706'" onmouseout="this.style.background='#f59e0b'">
          Begin Test
        </button>
        <button id="cancel-calibration-test-welcome-btn" class="cancel-button" style="
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
    
    document.getElementById('begin-calibration-test-btn').addEventListener('click', () => {
      this.applyConfiguration();
      this.startExperiment();
    });
    
    document.getElementById('cancel-calibration-test-welcome-btn').addEventListener('click', () => {
      this.cleanup();
    });
  }
  
  applyConfiguration() {
    const config = this.config.experimentConfig;
    
    console.log(`🔧 Applying Calibration Test Configuration:`);
    console.log(`   Mode: ${config.modeName}`);
    console.log(`   Variance Level: ${config.varianceLevel}`);
    console.log(`   Exponential Rank: ${config.exponentialRank}`);
    console.log(`   Alpha: ${config.alpha.toFixed(6)}`);
    
    // Set rotation-only mode
    window.state.config.rotationOnlyMode = true;
    window.state.config.useRotation = true;
    
    // Set tracking mode
    if (window.liveRotationControl) {
      window.liveRotationControl.trackingMode = 'rotation';
      console.log(`   ✅ liveRotationControl.trackingMode: 'rotation'`);
    }
    
    // Set filter - exponential smoothing with variance level 3
    const smoothingFactor = 1 - config.alpha;
    window.state.config.filterType = 'exponential';
    window.state.config.exponentialSmoothingFactor = smoothingFactor;
    console.log(`   ✅ Exponential Filter: smoothing=${smoothingFactor.toFixed(6)}`);
    
    // Reset cursor state
    window.state.lastHeadX = null;
    window.state.lastHeadY = null;
    window.state.cursorX = null;
    window.state.cursorY = null;
    window.state.smoothedX = null;
    window.state.smoothedY = null;
    window.state.smoothedAngles = null;
    window.state.lastRawAngles = null;
    
    console.log(`✅ Configuration applied`);
  }
  
  startExperiment() {
    console.log('🎯 Starting Calibration Test experiment');
    
    // Reset counters
    this.currentLayoutIndex = 0;
    this.currentTrialInLayout = 0;
    this.completedTrials = 0;
    this.trialData = [];
    
    // Start first layout
    this.startLayout();
  }
  
  getOrCreateExperimentUI() {
    if (!this.experimentUI) {
      this.experimentUI = document.createElement('div');
      this.experimentUI.id = 'calibration-test-ui';
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
      this.showCompletionScreen();
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
    
    const allDirections = [0, 45, 90, 135, 180, 225, 270, 315];
    
    for (const direction of allDirections) {
      const radians = (direction * Math.PI) / 180;
      const targetX = centerX + layout.amplitude * Math.cos(radians);
      const targetY = centerY + layout.amplitude * Math.sin(radians);
      
      const circle = document.createElement('div');
      circle.className = 'calibration-test-target-circle';
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
  }
  
  createHomeCircle() {
    if (this.homeCircle) {
      this.homeCircle.remove();
    }
    
    if (this.currentTrialInLayout === 0) {
      const layout = this.getCurrentLayout();
      const homeSize = layout.targetSize * 1.3;
      
      const circle = document.createElement('div');
      circle.className = 'calibration-test-home-circle';
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
    }
  }
  
  createDwellIndicator() {
    if (this.dwellIndicator) this.dwellIndicator.remove();
    
    const indicator = document.createElement('div');
    indicator.style.cssText = `
      position: fixed;
      border-radius: 50%;
      border: 4px solid transparent;
      pointer-events: none;
      z-index: 10002;
      display: none;
    `;
    
    document.body.appendChild(indicator);
    this.dwellIndicator = indicator;
  }
  
  startTrial() {
    const direction = this.getCurrentDirection();
    
    if (direction === null) {
      this.finishLayout();
      return;
    }
    
    console.log(`🎯 Trial ${this.completedTrials + 1}/${this.totalTrials}: Direction ${direction}°`);
    
    if (this.currentTrialInLayout === 0) {
      this.waitingForHomeCircle = true;
    } else {
      this.waitingForHomeCircle = false;
      // For subsequent trials: set start point but don't start timer yet
      // Timer starts when cursor EXITS the previous target (like original Fitts)
      this.movementStartTime = null; // Will be set when cursor exits previous target
      this.startPoint = { x: window.state.cursorX, y: window.state.cursorY };
      this.cursorPath = [];
    }
    
    this.updateTargetHighlighting();
    this.addProgressIndicator();
    
    this.trialStartTime = Date.now();
    this.startCursorTracking();
  }
  
  updateTargetHighlighting() {
    const layout = this.getCurrentLayout();
    if (!layout) return;
    
    const currentDirection = this.getCurrentDirection();
    
    for (const [direction, circle] of Object.entries(this.targetCircles)) {
      const dir = parseInt(direction);
      const sequenceIndex = layout.sequence.indexOf(dir);
      
      if (dir === currentDirection) {
        if (this.waitingForHomeCircle) {
          // Yellow when waiting for home
          circle.style.setProperty('background-color', 'rgba(255, 200, 100, 0.5)', 'important');
          circle.style.setProperty('border-color', 'rgba(255, 200, 100, 0.8)', 'important');
          circle.style.setProperty('border-width', '3px', 'important');
          circle.style.setProperty('box-shadow', '0 0 15px rgba(255, 200, 100, 0.6)', 'important');
          circle.style.setProperty('transform', 'scale(1.05)', 'important');
        } else {
          // Red when active target
          circle.style.setProperty('background-color', 'rgba(255, 100, 100, 0.8)', 'important');
          circle.style.setProperty('border-color', 'rgba(255, 100, 100, 1)', 'important');
          circle.style.setProperty('border-width', '4px', 'important');
          circle.style.setProperty('box-shadow', '0 0 30px rgba(255, 100, 100, 1)', 'important');
          circle.style.setProperty('transform', 'scale(1.1)', 'important');
        }
      } else if (sequenceIndex !== -1 && sequenceIndex < this.currentTrialInLayout) {
        // Green for completed
        circle.style.setProperty('background-color', 'rgba(100, 255, 100, 0.4)', 'important');
        circle.style.setProperty('border-color', 'rgba(100, 255, 100, 0.7)', 'important');
        circle.style.setProperty('border-width', '3px', 'important');
        circle.style.setProperty('box-shadow', 'none', 'important');
        circle.style.setProperty('transform', 'scale(1)', 'important');
      } else if (sequenceIndex === this.currentTrialInLayout + 1 && !this.waitingForHomeCircle) {
        // Orange for next target
        circle.style.setProperty('background-color', 'rgba(255, 200, 100, 0.5)', 'important');
        circle.style.setProperty('border-color', 'rgba(255, 200, 100, 0.8)', 'important');
        circle.style.setProperty('border-width', '3px', 'important');
        circle.style.setProperty('box-shadow', '0 0 15px rgba(255, 200, 100, 0.6)', 'important');
        circle.style.setProperty('transform', 'scale(1.05)', 'important');
      } else {
        // Gray for inactive
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
    const homeSize = layout.targetSize * 1.3;
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
    
    // Track cursor path (sample every frame) - same as original Fitts
    if (this.movementStartTime) {
      this.cursorPath.push({
        x: cursorX,
        y: cursorY,
        timestamp: performance.now()
      });
      // Limit path length
      if (this.cursorPath.length > 5000) {
        this.cursorPath.shift();
      }
    }
    
    // Check if movement has started (cursor exited previous target/start point)
    // This is the EXACT same method as original Fitts experiment
    if (!this.movementStartTime && this.startPoint && this.previousTargetSize) {
      const distFromStart = Math.sqrt(
        Math.pow(cursorX - this.startPoint.x, 2) + Math.pow(cursorY - this.startPoint.y, 2)
      );
      
      // Movement starts when cursor exits previous target area
      if (distFromStart > this.previousTargetSize / 2) {
        this.movementStartTime = performance.now();
        console.log("⏱️ Movement started (cursor exited previous target):", this.startPoint);
      }
    }
    
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
      const dwellProgress = Math.min(progress, 1);
      const degrees = dwellProgress * 360;
      this.dwellIndicator.style.borderColor = `rgba(100, 255, 100, ${0.3 + dwellProgress * 0.7})`;
      this.dwellIndicator.style.backgroundImage = `conic-gradient(
        rgba(100, 255, 100, 0.6) ${degrees}deg,
        transparent ${degrees}deg
      )`;
    }
  }
  
  hideDwellIndicator() {
    if (this.dwellIndicator) {
      this.dwellIndicator.style.display = 'none';
      this.dwellIndicator.style.borderColor = 'transparent';
      this.dwellIndicator.style.backgroundImage = 'none';
    }
  }
  
  onHomeCircleComplete() {
    console.log('✅ Home circle dwell complete');
    this.waitingForHomeCircle = false;
    this.dwellStartTime = null;
    this.hideDwellIndicator();
    
    // Don't start timer yet - wait for cursor to exit home circle area
    // (Same method as original Fitts experiment)
    this.movementStartTime = null;
    this.startPoint = { x: window.state.cursorX, y: window.state.cursorY };
    this.cursorPath = [];
    
    // Store home circle size for exit detection
    const layout = this.getCurrentLayout();
    this.previousTargetSize = layout.targetSize * 1.3; // Home circle is 1.3x target size
    
    if (this.homeCircle) {
      this.homeCircle.remove();
      this.homeCircle = null;
    }
    
    this.updateTargetHighlighting();
  }
  
  onTargetComplete(cursorX, cursorY, targetX, targetY) {
    const layout = this.getCurrentLayout();
    const direction = this.getCurrentDirection();
    const config = this.config.experimentConfig;
    const selectionTimePerf = performance.now();
    const selectionTimeMs = Date.now(); // For CSV timestamp
    
    // Calculate movement time (same as original Fitts - using performance.now() for precision)
    const movementTime = this.movementStartTime 
      ? (selectionTimePerf - this.movementStartTime) / 1000  // Convert to seconds
      : null;
    
    // Store current target size for next trial's exit detection
    this.previousTargetSize = layout.targetSize;
    
    const actualAmplitude = Math.sqrt(
      (cursorX - this.startPoint.x) ** 2 + 
      (cursorY - this.startPoint.y) ** 2
    );
    
    const selectionError = Math.sqrt(
      (cursorX - targetX) ** 2 + 
      (cursorY - targetY) ** 2
    );
    
    // Per-trial We is an approximation; aggregate We (directional projection) is computed in calculateAggregateMetrics
    const effectiveWidth = 4.133 * selectionError;
    const IDe = Math.log2(layout.amplitude / Math.max(effectiveWidth, 1) + 1);
    const throughput = (movementTime && movementTime > 0) ? IDe / movementTime : 0;
    
    // Get calibration source info
    let calibrationSource = 'Unknown';
    if (window.state.calibrationSource) {
      calibrationSource = window.state.calibrationSource;
    }
    
    const trialResult = {
      timestamp: new Date().toISOString(),
      trialNumber: this.completedTrials + 1,
      mode: config.mode,
      modeName: config.modeName,
      varianceLevel: config.varianceLevel,
      exponentialRank: config.exponentialRank,
      expectedVariance: config.variance,
      alpha: config.alpha,
      smoothingFactor: 1 - config.alpha,
      calibrationSource: calibrationSource,
      layoutIndex: this.currentLayoutIndex,
      trialInLayout: this.currentTrialInLayout,
      targetSize: layout.targetSize,
      amplitude: layout.amplitude,
      direction: direction,
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
      selectionTime: selectionTimeMs
    };
    
    this.trialData.push(trialResult);
    this.completedTrials++;
    
    console.log(`✅ Trial ${this.completedTrials}/${this.totalTrials} complete:`, {
      MT: movementTime ? `${movementTime.toFixed(3)}s` : 'null',
      throughput: `${throughput.toFixed(3)} bps`,
      error: `${selectionError.toFixed(1)}px`
    });
    
    this.currentTrialInLayout++;
    this.dwellStartTime = null;
    this.hideDwellIndicator();
    
    setTimeout(() => {
      this.startTrial();
    }, 500);
  }
  
  finishLayout() {
    console.log(`✅ Layout ${this.currentLayoutIndex + 1}/${this.layouts.length} complete`);
    
    // Calculate aggregate metrics for this layout (ISO 9241-9 standard method)
    this.calculateAggregateMetrics(this.currentLayoutIndex);
    
    Object.values(this.targetCircles).forEach(circle => circle.remove());
    this.targetCircles = {};
    
    this.currentLayoutIndex++;
    this.currentTrialInLayout = 0;
    
    if (this.currentLayoutIndex < this.layouts.length) {
      this.startLayout();
    } else {
      this.showCompletionScreen();
    }
  }
  
  // Calculate aggregate metrics per layout (same as original Fitts experiment)
  calculateAggregateMetrics(layoutIndex) {
    // Get all trials for this layout
    const layoutTrials = this.trialData.filter(t => t.layoutIndex === layoutIndex && t.movementTime !== null);
    
    if (layoutTrials.length === 0) return;
    
    // Calculate mean movement time
    const meanMT = layoutTrials.reduce((sum, t) => sum + t.movementTime, 0) / layoutTrials.length;
    
    // Calculate effective amplitude (Ae) - mean of actual amplitudes
    const Ae = layoutTrials.reduce((sum, t) => sum + t.actualAmplitude, 0) / layoutTrials.length;
    
    // ISO 9241-9 directional projection: project endpoint deviation onto movement direction
    const projections = layoutTrials.map(t => {
      const thetaRad = t.direction * Math.PI / 180;
      const dx = t.selectionX - t.targetX;
      const dy = t.selectionY - t.targetY;
      return dx * Math.cos(thetaRad) + dy * Math.sin(thetaRad);
    });
    const meanProjection = projections.reduce((a, b) => a + b, 0) / projections.length;
    const projVariance = projections.reduce((sum, p) => sum + Math.pow(p - meanProjection, 2), 0) / (projections.length - 1);
    const SDx = Math.sqrt(projVariance);
    
    const We = 4.133 * SDx;
    
    // Calculate effective index of difficulty (IDe)
    const IDe = Math.log2((Ae / We) + 1);
    
    // Calculate aggregate throughput (TP = IDe / meanMT)
    const aggregateTP = IDe / meanMT;
    
    console.log(`📊 Layout ${layoutIndex + 1} Aggregate Metrics (ISO 9241-9):`);
    console.log(`   Mean MT: ${meanMT.toFixed(3)}s`);
    console.log(`   Ae: ${Ae.toFixed(2)}px`);
    console.log(`   SDx: ${SDx.toFixed(2)}px`);
    console.log(`   We: ${We.toFixed(2)}px`);
    console.log(`   IDe: ${IDe.toFixed(3)} bits`);
    console.log(`   Aggregate TP: ${aggregateTP.toFixed(3)} bps`);
    
    // Update trial data with aggregate metrics
    layoutTrials.forEach(trial => {
      trial.aggregateMeanMT = meanMT;
      trial.aggregateAe = Ae;
      trial.aggregateSDx = SDx;
      trial.aggregateWe = We;
      trial.aggregateIDe = IDe;
      trial.aggregateThroughput = aggregateTP;
    });
  }
  
  showCompletionScreen() {
    // Stop tracking
    if (this.cursorTrackingInterval) {
      clearInterval(this.cursorTrackingInterval);
      this.cursorTrackingInterval = null;
    }
    
    // Clean up circles
    Object.values(this.targetCircles).forEach(circle => circle.remove());
    if (this.homeCircle) this.homeCircle.remove();
    if (this.dwellIndicator) this.dwellIndicator.remove();
    
    const container = this.getOrCreateExperimentUI();
    const config = this.config.experimentConfig;
    
    // Calculate summary statistics using aggregate metrics (ISO 9241-9 standard)
    const validTrials = this.trialData.filter(t => t.movementTime !== null && t.aggregateThroughput);
    const avgMT = validTrials.reduce((sum, t) => sum + t.movementTime, 0) / validTrials.length;
    
    // Use aggregate throughput (proper ISO method) - average across layouts
    const layoutTPs = [...new Set(validTrials.map(t => t.layoutIndex))].map(layoutIdx => {
      const layoutTrial = validTrials.find(t => t.layoutIndex === layoutIdx);
      return layoutTrial ? layoutTrial.aggregateThroughput : 0;
    });
    const avgTP = layoutTPs.reduce((sum, tp) => sum + tp, 0) / layoutTPs.length;
    
    const avgError = this.trialData.reduce((sum, t) => sum + t.selectionError, 0) / this.trialData.length;
    
    // Get calibration source
    let calibrationSource = 'Unknown';
    if (this.trialData.length > 0) {
      calibrationSource = this.trialData[0].calibrationSource;
    }
    
    container.innerHTML = `
      <div class="experiment-instructions" style="border: 2px solid #64ff64;">
        <h2 style="color: #64ff64;">🎉 Calibration Test Complete!</h2>
        <p>Thank you for completing the Calibration Importance Test.</p>
        <div class="info-box" style="background: rgba(100, 200, 255, 0.1); border-left: 3px solid #64c8ff;">
          <strong>🎯 Calibration Used:</strong><br>
          <span style="color: #64c8ff;">${calibrationSource}</span>
        </div>
        <div class="info-box">
          <strong>Test Summary:</strong><br>
          • Mode: ${config.modeName}<br>
          • Variance Level: ${config.varianceLevel}<br>
          • Total Trials: ${this.completedTrials}<br>
          • Average Movement Time: <span style="color: #ffc864;">${avgMT.toFixed(3)}s</span><br>
          • Average Throughput (ISO): <span style="color: #4caf50;">${avgTP.toFixed(3)} bps</span><br>
          • Average Selection Error: <span style="color: #ff6464;">${avgError.toFixed(1)}px</span>
        </div>
        <div class="info-box" style="background: rgba(168, 85, 247, 0.1); border-left: 3px solid #a855f7;">
          <strong>💡 Next Steps:</strong><br>
          Try running this test again with a different calibration file 
          (e.g., from another person) to see if personal calibration 
          makes a difference in your performance!
        </div>
        <button id="download-calibration-test-data-btn" class="start-button" style="
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
        <button id="close-calibration-test-btn" class="cancel-button" style="
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
    
    document.getElementById('download-calibration-test-data-btn').addEventListener('click', () => {
      this.downloadData();
    });
    
    document.getElementById('close-calibration-test-btn').addEventListener('click', () => {
      this.cleanup();
    });
  }
  
  downloadData() {
    const csv = Papa.unparse(this.trialData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calibration-test-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    console.log('📥 Calibration test data downloaded');
  }
  
  close() {
    if (!confirm("Exit the Calibration Test? Progress will not be saved.")) {
      return;
    }
    
    this.cleanup();
  }
  
  cleanup() {
    console.log('🧹 Cleaning up Calibration Test');
    
    // Stop tracking
    if (this.cursorTrackingInterval) {
      clearInterval(this.cursorTrackingInterval);
      this.cursorTrackingInterval = null;
    }
    
    // Clean up UI
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
    this.currentLayoutIndex = 0;
    this.currentTrialInLayout = 0;
    this.completedTrials = 0;
    
    console.log('✅ Calibration Test cleanup complete');
  }
}

// Initialize experiment instance
window.calibrationTestExperiment = new CalibrationTestExperiment();
console.log('✅ Calibration Test Experiment initialized');
console.log('   Purpose: Test importance of individual calibration');
console.log('   Mode: Rotation-Only with Variance Level 3');
