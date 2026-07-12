// Calibration Compare Pilot Experiment
// Exactly like CalibrationTestExperiment but runs 2 phases:
//   Phase 1: With the user's OWN calibration
//   Phase 2: With ANOTHER person's calibration
// Same fixed config: Rotation-Only Mode, Exponential, Variance Level 3
// Copy of calibration-test-experiment.js with minimal 2-phase additions

class CalibrationComparePilotExperiment {
  constructor() {
    this.config = {
      targetSizePercents: [3, 6, 10],
      amplitudePercents: [25, 45],
      
      // Across-the-circle alternation pattern (same as Fitts experiment)
      directionSequence: [0, 180, 45, 225, 90, 270, 135, 315],
      
      trialsPerLayout: 8,
      dwellTime: 2000,
      breakDuration: 60, // 1 minute break between phases
      
      // Fixed configuration: Rotation-Only Mode with Variance Level 3
      // SAME as CalibrationTestExperiment - hardcoded baseline for all users
      experimentConfig: {
        mode: 'rotation',
        modeName: 'Rotation-Only Mode',
        varianceLevel: 3,
        exponentialRank: 23,
        alpha: 0.02298,
        variance: 12.5275,
        description: 'Calibration Compare - Rotation-Only, Variance Level 3'
      }
    };
    
    // State
    this.isRunning = false;
    this.currentPhase = 0; // 0 = own calibration, 1 = other calibration
    this.currentLayoutIndex = 0;
    this.currentTrialInLayout = 0;
    this.trialData = [];
    this.waitingForHomeCircle = false;
    
    // Store calibration info for each phase
    this.phaseCalibrationInfo = ['', ''];
    
    // UI elements
    this.experimentUI = null;
    this.targetCircles = {};
    this.homeCircle = null;
    this.dwellIndicator = null;
    
    // Timing
    this.dwellStartTime = null;
    this.movementStartTime = null;
    this.trialStartTime = null;
    this.breakInterval = null;
    this.breakTimeRemaining = 0;
    
    // Tracking
    this.cursorTrackingInterval = null;
    this.startPoint = null;
    this.cursorPath = [];
    this.previousTargetSize = null;
    
    // Layouts
    this.layouts = [];
    this.totalTrials = 0;
    this.completedTrials = 0;
    this.phaseTrials = 0;
    
    // Bind
    this.update = this.update.bind(this);
  }
  
  // ========== IDENTICAL to CalibrationTestExperiment ==========
  
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
  
  applyConfiguration() {
    const config = this.config.experimentConfig;
    
    console.log(`🔧 Applying Calibration Compare Configuration:`);
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
  
  getOrCreateExperimentUI() {
    if (!this.experimentUI) {
      this.experimentUI = document.createElement('div');
      this.experimentUI.id = 'calib-compare-ui';
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
  
  hideNonEssentialControls() {
    const trackingControls = document.querySelector('.tracking-controls');
    if (!trackingControls) return;
    
    if (window.liveRotationControl && window.liveRotationControl.hide) {
      window.liveRotationControl.hide();
    }
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
      title.textContent = 'Pilot: Calibration Compare';
      title.style.color = '#a855f7';
    }
    
    this.addProgressIndicator();
  }
  
  addProgressIndicator() {
    const trackingControls = document.querySelector('.tracking-controls');
    if (!trackingControls) return;
    
    trackingControls.style.maxWidth = '280px';
    trackingControls.style.fontSize = '11px';
    
    const existingIndicator = document.getElementById('calib-compare-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }
    
    const config = this.config.experimentConfig;
    const phaseName = `Phase ${this.currentPhase + 1}: ${this.phaseCalibrationInfo[this.currentPhase] || 'Calibration ' + (this.currentPhase + 1)}`;
    
    const indicator = document.createElement('div');
    indicator.id = 'calib-compare-indicator';
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
      <div style="font-weight: bold; margin-bottom: 2px; font-size: 10px;">🔬 Calibration Compare</div>
      <div style="font-size: 9px; color: #c084fc; font-weight: bold;">Phase ${this.currentPhase + 1}/2: ${phaseName}</div>
      <div style="font-size: 9px; color: #aaa; margin-top: 2px;">${config.modeName} - Variance Level ${config.varianceLevel}</div>
      <div style="font-size: 8px; color: #888; margin-top: 2px;">
        Trial: ${this.completedTrials}/${this.totalTrials}
      </div>
      <div style="display: flex; gap: 4px; margin-top: 6px; pointer-events: auto;">
        <button 
          id="cancel-calib-compare-btn"
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
    
    setTimeout(() => {
      const cancelBtn = document.getElementById('cancel-calib-compare-btn');
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
    
    const indicator = document.getElementById('calib-compare-indicator');
    if (indicator) {
      indicator.remove();
    }
  }
  
  createTargetCircles(layout) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    Object.values(this.targetCircles).forEach(circle => circle.remove());
    this.targetCircles = {};
    
    const allDirections = [0, 45, 90, 135, 180, 225, 270, 315];
    
    for (const direction of allDirections) {
      const radians = (direction * Math.PI) / 180;
      const targetX = centerX + layout.amplitude * Math.cos(radians);
      const targetY = centerY + layout.amplitude * Math.sin(radians);
      
      const circle = document.createElement('div');
      circle.className = 'calib-compare-target-circle';
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
      circle.className = 'calib-compare-home-circle';
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
  
  updateTargetHighlighting() {
    const layout = this.getCurrentLayout();
    if (!layout) return;
    
    const currentDirection = this.getCurrentDirection();
    
    for (const [direction, circle] of Object.entries(this.targetCircles)) {
      const dir = parseInt(direction);
      const sequenceIndex = layout.sequence.indexOf(dir);
      
      if (dir === currentDirection) {
        if (this.waitingForHomeCircle) {
          circle.style.setProperty('background-color', 'rgba(255, 200, 100, 0.5)', 'important');
          circle.style.setProperty('border-color', 'rgba(255, 200, 100, 0.8)', 'important');
          circle.style.setProperty('border-width', '3px', 'important');
          circle.style.setProperty('box-shadow', '0 0 15px rgba(255, 200, 100, 0.6)', 'important');
          circle.style.setProperty('transform', 'scale(1.05)', 'important');
        } else {
          circle.style.setProperty('background-color', 'rgba(255, 100, 100, 0.8)', 'important');
          circle.style.setProperty('border-color', 'rgba(255, 100, 100, 1)', 'important');
          circle.style.setProperty('border-width', '4px', 'important');
          circle.style.setProperty('box-shadow', '0 0 30px rgba(255, 100, 100, 1)', 'important');
          circle.style.setProperty('transform', 'scale(1.1)', 'important');
        }
      } else if (sequenceIndex !== -1 && sequenceIndex < this.currentTrialInLayout) {
        circle.style.setProperty('background-color', 'rgba(100, 255, 100, 0.4)', 'important');
        circle.style.setProperty('border-color', 'rgba(100, 255, 100, 0.7)', 'important');
        circle.style.setProperty('border-width', '3px', 'important');
        circle.style.setProperty('box-shadow', 'none', 'important');
        circle.style.setProperty('transform', 'scale(1)', 'important');
      } else if (sequenceIndex === this.currentTrialInLayout + 1 && !this.waitingForHomeCircle) {
        circle.style.setProperty('background-color', 'rgba(255, 200, 100, 0.5)', 'important');
        circle.style.setProperty('border-color', 'rgba(255, 200, 100, 0.8)', 'important');
        circle.style.setProperty('border-width', '3px', 'important');
        circle.style.setProperty('box-shadow', '0 0 15px rgba(255, 200, 100, 0.6)', 'important');
        circle.style.setProperty('transform', 'scale(1.05)', 'important');
      } else {
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
    
    // Track cursor path
    if (this.movementStartTime) {
      this.cursorPath.push({ x: cursorX, y: cursorY, timestamp: performance.now() });
      if (this.cursorPath.length > 5000) this.cursorPath.shift();
    }
    
    // Check if movement has started (cursor exited previous target)
    if (!this.movementStartTime && this.startPoint && this.previousTargetSize) {
      const distFromStart = Math.sqrt(
        Math.pow(cursorX - this.startPoint.x, 2) + Math.pow(cursorY - this.startPoint.y, 2)
      );
      if (distFromStart > this.previousTargetSize / 2) {
        this.movementStartTime = performance.now();
        console.log("⏱️ Movement started (cursor exited previous target)");
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
    
    this.movementStartTime = null;
    this.startPoint = { x: window.state.cursorX, y: window.state.cursorY };
    this.cursorPath = [];
    
    const layout = this.getCurrentLayout();
    this.previousTargetSize = layout.targetSize * 1.3;
    
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
    const selectionTimeMs = Date.now();
    
    const movementTime = this.movementStartTime 
      ? (selectionTimePerf - this.movementStartTime) / 1000
      : null;
    
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
    
    let calibrationSource = this.phaseCalibrationInfo[this.currentPhase] || 'Unknown';
    
    const trialResult = {
      timestamp: new Date().toISOString(),
      trialNumber: this.completedTrials + 1,
      phase: this.currentPhase + 1,
      phaseName: this.phaseCalibrationInfo[this.currentPhase] || `Calibration ${this.currentPhase + 1}`,
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
    
    console.log(`✅ Trial ${this.completedTrials}/${this.totalTrials} (Phase ${this.currentPhase + 1}):`, {
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
  
  calculateAggregateMetrics(phase, layoutIndex) {
    const layoutTrials = this.trialData.filter(t => 
      t.phase === phase + 1 && t.layoutIndex === layoutIndex && t.movementTime !== null
    );
    if (layoutTrials.length === 0) return;
    
    const meanMT = layoutTrials.reduce((sum, t) => sum + t.movementTime, 0) / layoutTrials.length;
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
    const IDe = Math.log2((Ae / We) + 1);
    const aggregateTP = IDe / meanMT;
    
    console.log(`📊 Phase ${phase + 1}, Layout ${layoutIndex + 1} - TP: ${aggregateTP.toFixed(3)} bps, MT: ${meanMT.toFixed(3)}s`);
    
    layoutTrials.forEach(trial => {
      trial.aggregateMeanMT = meanMT;
      trial.aggregateAe = Ae;
      trial.aggregateSDx = SDx;
      trial.aggregateWe = We;
      trial.aggregateIDe = IDe;
      trial.aggregateThroughput = aggregateTP;
    });
  }
  
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  // ========== 2-PHASE FLOW (only new parts) ==========
  
  async start() {
    if (this.isRunning) {
      console.warn('Calibration Compare already running');
      return;
    }
    
    console.log('🔬 Starting Calibration Compare Pilot');
    
    if (!window.state || !window.state.isTracking) {
      alert('Please ensure face tracking is active!');
      return;
    }
    
    if (!window.state.transformationMatrices || 
        (!window.state.transformationMatrices.rotationOnly && 
         !window.state.transformationMatrices.threePoint2d &&
         !window.state.transformationMatrices.threePoint3d)) {
      alert('No calibration data found! Please calibrate or upload a calibration file first.');
      return;
    }
    
    this.isRunning = true;
    
    this.layouts = this.generateLayouts();
    this.phaseTrials = this.layouts.length * this.config.trialsPerLayout;
    this.totalTrials = this.phaseTrials * 2;
    
    this.hideNonEssentialControls();
    this.showWelcomeScreen();
  }
  
  showWelcomeScreen() {
    const container = this.getOrCreateExperimentUI();
    const config = this.config.experimentConfig;
    
    let calibrationInfo = 'Unknown';
    if (window.state.calibrationSource) {
      calibrationInfo = window.state.calibrationSource;
    } else if (window.state.transformationMatrices) {
      calibrationInfo = 'Current session calibration';
    }
    
    container.innerHTML = `
      <div class="experiment-instructions" style="border: 2px solid #a855f7;">
        <h2 style="color: #a855f7;">🔬 Pilot: Calibration Compare</h2>
        <p style="font-size: 12px; color: #aaa; margin: 8px 0;">
          Does personal calibration matter? Same test, two calibrations.
        </p>
        <div class="info-box" style="background: rgba(168, 85, 247, 0.1); border-left: 3px solid #a855f7;">
          <strong>Experiment Configuration:</strong><br>
          • Mode: <span style="color: #c084fc; font-weight: bold;">${config.modeName}</span><br>
          • Variance Level: ${config.varianceLevel} (Rank ${config.exponentialRank})<br>
          • ${this.layouts.length} layouts × ${this.config.trialsPerLayout} trials × 2 phases<br>
          • Total: <strong>${this.totalTrials} trials</strong>
        </div>
        
        <div class="info-box" style="background: rgba(100, 200, 255, 0.1); border-left: 3px solid #64c8ff;">
          <strong style="color: #64c8ff;">Phase 1 Calibration:</strong><br>
          <span style="font-size: 10px; color: #aaa;">Currently loaded:</span>
          <span style="color: #64c8ff; font-size: 11px;" id="phase1-calib-name">${calibrationInfo}</span>
          <div style="margin-top: 6px;">
            <button id="upload-phase1-calib-btn" style="
              padding: 6px 12px; font-size: 11px;
              background: rgba(100, 200, 255, 0.2); border: 1px solid rgba(100, 200, 255, 0.5);
              border-radius: 3px; color: #64c8ff; cursor: pointer;
            ">📁 Upload Different Calibration</button>
            <input type="file" id="phase1-calib-input" accept=".csv,.json" style="display: none;">
          </div>
        </div>
        
        <p class="tip" style="font-size: 10px;">
          You can use the currently loaded calibration or upload a different one.
          After Phase 1, you'll choose the calibration for Phase 2.
        </p>
        
        <button id="begin-calib-compare-btn" class="start-button" style="
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
          Begin Phase 1
        </button>
        <button id="cancel-calib-compare-welcome-btn" class="cancel-button" style="
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
    
    // Phase 1 calibration upload
    const phase1Input = document.getElementById('phase1-calib-input');
    document.getElementById('upload-phase1-calib-btn').addEventListener('click', () => phase1Input.click());
    phase1Input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file || !window.handleCalibrationUpload) return;
      document.getElementById('phase1-calib-name').textContent = `Loading: ${file.name}...`;
      window.handleCalibrationUpload(file);
      setTimeout(() => {
        calibrationInfo = window.state.calibrationSource || file.name;
        document.getElementById('phase1-calib-name').textContent = `✅ ${calibrationInfo}`;
        document.getElementById('phase1-calib-name').style.color = '#64ff64';
        // Re-hide controls that calibration upload may have restored
        this.hideNonEssentialControls();
      }, 1000);
    });
    
    document.getElementById('begin-calib-compare-btn').addEventListener('click', () => {
      this.currentPhase = 0;
      this.phaseCalibrationInfo[0] = window.state.calibrationSource || calibrationInfo;
      this.applyConfiguration();
      this.startPhase();
    });
    
    document.getElementById('cancel-calib-compare-welcome-btn').addEventListener('click', () => {
      this.cleanup();
    });
  }
  
  startPhase() {
    console.log(`🎯 Starting Phase ${this.currentPhase + 1}/2`);
    
    this.currentLayoutIndex = 0;
    this.currentTrialInLayout = 0;
    
    this.addProgressIndicator();
    this.startLayout();
  }
  
  startLayout() {
    const layout = this.getCurrentLayout();
    if (!layout) {
      this.endPhase();
      return;
    }
    
    console.log(`📐 Phase ${this.currentPhase + 1}, Layout ${this.currentLayoutIndex + 1}/${this.layouts.length}`);
    
    this.hideExperimentUI();
    this.createTargetCircles(layout);
    this.createHomeCircle();
    this.createDwellIndicator();
    
    this.currentTrialInLayout = 0;
    this.startTrial();
  }
  
  startTrial() {
    const direction = this.getCurrentDirection();
    
    if (direction === null) {
      this.finishLayout();
      return;
    }
    
    console.log(`🎯 Trial ${this.completedTrials + 1}/${this.totalTrials}: Phase ${this.currentPhase + 1}, Direction ${direction}°`);
    
    if (this.currentTrialInLayout === 0) {
      this.waitingForHomeCircle = true;
    } else {
      this.waitingForHomeCircle = false;
      this.movementStartTime = null;
      this.startPoint = { x: window.state.cursorX, y: window.state.cursorY };
      this.cursorPath = [];
    }
    
    this.updateTargetHighlighting();
    this.addProgressIndicator();
    
    this.trialStartTime = Date.now();
    this.startCursorTracking();
  }
  
  finishLayout() {
    console.log(`✅ Phase ${this.currentPhase + 1}, Layout ${this.currentLayoutIndex + 1}/${this.layouts.length} complete`);
    
    this.calculateAggregateMetrics(this.currentPhase, this.currentLayoutIndex);
    
    Object.values(this.targetCircles).forEach(circle => circle.remove());
    this.targetCircles = {};
    
    this.currentLayoutIndex++;
    this.currentTrialInLayout = 0;
    
    if (this.currentLayoutIndex < this.layouts.length) {
      this.startLayout();
    } else {
      this.endPhase();
    }
  }
  
  endPhase() {
    if (this.cursorTrackingInterval) {
      clearInterval(this.cursorTrackingInterval);
      this.cursorTrackingInterval = null;
    }
    
    Object.values(this.targetCircles).forEach(circle => circle.remove());
    this.targetCircles = {};
    if (this.homeCircle) { this.homeCircle.remove(); this.homeCircle = null; }
    if (this.dwellIndicator) { this.dwellIndicator.remove(); this.dwellIndicator = null; }
    
    if (this.currentPhase === 0) {
      this.showCalibrationSwitch();
    } else {
      this.showCompletionScreen();
    }
  }
  
  showCalibrationSwitch() {
    const container = this.getOrCreateExperimentUI();
    
    // Calculate Phase 1 summary
    const phase1Trials = this.trialData.filter(t => t.phase === 1 && t.movementTime !== null && t.aggregateThroughput);
    const layoutTPs1 = [...new Set(phase1Trials.map(t => t.layoutIndex))].map(layoutIdx => {
      const trial = phase1Trials.find(t => t.layoutIndex === layoutIdx);
      return trial ? trial.aggregateThroughput : 0;
    });
    const avgTP1 = layoutTPs1.length > 0 ? layoutTPs1.reduce((a, b) => a + b, 0) / layoutTPs1.length : 0;
    const avgMT1 = phase1Trials.length > 0 ? phase1Trials.reduce((sum, t) => sum + t.movementTime, 0) / phase1Trials.length : 0;
    
    this.breakTimeRemaining = this.config.breakDuration;
    
    container.innerHTML = `
      <div class="experiment-instructions" style="border: 2px solid #a855f7;">
        <h2 style="color: #64ff64;">Phase 1 Complete! 🎉</h2>
        <p style="font-size: 11px; color: #aaa;">
          Calibration used: <span style="color: #64c8ff;">${this.phaseCalibrationInfo[0]}</span>
        </p>
        
        <div class="info-box" style="background: rgba(100, 255, 100, 0.1); border-left: 3px solid #64ff64;">
          <strong style="color: #64ff64;">Phase 1 Results:</strong><br>
          Throughput: <strong style="color: #ffc864;">${avgTP1.toFixed(3)} bits/s</strong><br>
          Movement Time: <strong>${(avgMT1 * 1000).toFixed(0)} ms</strong>
        </div>
        
        <h3 style="color: #a855f7;">1-Minute Break</h3>
        <div style="background: rgba(168, 85, 247, 0.2); padding: 20px; border-radius: 8px; margin: 10px 0; text-align: center;">
          <div style="font-size: 48px; font-weight: bold; color: #c084fc;" id="calib-break-timer">
            ${this.formatTime(this.breakTimeRemaining)}
          </div>
          <p style="margin-top: 8px; font-size: 11px; color: #aaa;">Relax your neck and eyes</p>
        </div>
        
        <button id="skip-calib-break-btn" class="start-button" style="
          width: 100%;
          padding: 12px;
          font-size: 14px;
          background: #a855f7;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-weight: bold;
          margin-top: 10px;
          transition: background 0.3s;
        " onmouseover="this.style.background='#9333ea'" onmouseout="this.style.background='#a855f7'">
          Skip Break → Choose Phase 2 Calibration
        </button>
        <button id="skip-phase2-btn" class="cancel-button" style="
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
          Skip Phase 2 → Show Results
        </button>
      </div>
    `;
    
    this.breakInterval = setInterval(() => {
      this.breakTimeRemaining--;
      const timerElement = document.getElementById('calib-break-timer');
      if (timerElement) {
        timerElement.textContent = this.formatTime(this.breakTimeRemaining);
      }
      if (this.breakTimeRemaining <= 0) {
        clearInterval(this.breakInterval);
        this.breakInterval = null;
        this.showPhase2CalibrationScreen();
      }
    }, 1000);
    
    document.getElementById('skip-calib-break-btn').addEventListener('click', () => {
      if (this.breakInterval) {
        clearInterval(this.breakInterval);
        this.breakInterval = null;
      }
      this.showPhase2CalibrationScreen();
    });
    
    document.getElementById('skip-phase2-btn').addEventListener('click', () => {
      if (this.breakInterval) {
        clearInterval(this.breakInterval);
        this.breakInterval = null;
      }
      this.showCompletionScreen();
    });
  }
  
  showPhase2CalibrationScreen() {
    const container = this.getOrCreateExperimentUI();
    let currentCalib = window.state.calibrationSource || 'Current calibration';
    
    container.innerHTML = `
      <div class="experiment-instructions" style="border: 2px solid #ffc864;">
        <h2 style="color: #ffc864;">Choose Calibration for Phase 2</h2>
        <p style="font-size: 11px; color: #aaa; margin: 8px 0;">
          Upload a different calibration file, or keep the currently loaded one.
        </p>
        
        <div class="info-box" style="background: rgba(100, 200, 255, 0.1); border-left: 3px solid #64c8ff;">
          <strong style="color: #64c8ff;">Currently loaded:</strong><br>
          <span style="color: #64c8ff; font-size: 12px;" id="phase2-calib-name">${currentCalib}</span>
        </div>
        
        <div style="background: rgba(255, 200, 100, 0.15); padding: 12px; border-radius: 4px; margin: 12px 0; text-align: center;">
          <button id="upload-phase2-calib-btn" style="
            padding: 12px 24px;
            font-size: 14px;
            background: linear-gradient(135deg, #ffc864, #f59e0b);
            color: #1a1a2e;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
          ">
            📁 Upload Different Calibration
          </button>
          <input type="file" id="phase2-calib-input" accept=".csv,.json" style="display: none;">
        </div>
        
        <button id="start-phase2-btn" class="start-button" style="
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
          Begin Phase 2
        </button>
        <button id="cancel-phase2-btn" class="cancel-button" style="
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
          Skip Phase 2 → Show Results
        </button>
      </div>
    `;
    
    const phase2Input = document.getElementById('phase2-calib-input');
    document.getElementById('upload-phase2-calib-btn').addEventListener('click', () => phase2Input.click());
    phase2Input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file || !window.handleCalibrationUpload) return;
      document.getElementById('phase2-calib-name').textContent = `Loading: ${file.name}...`;
      window.handleCalibrationUpload(file);
      setTimeout(() => {
        currentCalib = window.state.calibrationSource || file.name;
        document.getElementById('phase2-calib-name').textContent = `✅ ${currentCalib}`;
        document.getElementById('phase2-calib-name').style.color = '#64ff64';
        this.hideNonEssentialControls();
      }, 1000);
    });
    
    document.getElementById('start-phase2-btn').addEventListener('click', () => {
      this.phaseCalibrationInfo[1] = window.state.calibrationSource || currentCalib;
      this.currentPhase = 1;
      this.applyConfiguration();
      this.addProgressIndicator();
      this.startPhase();
    });
    
    document.getElementById('cancel-phase2-btn').addEventListener('click', () => {
      this.showCompletionScreen();
    });
  }
  
  showCompletionScreen() {
    if (this.cursorTrackingInterval) {
      clearInterval(this.cursorTrackingInterval);
      this.cursorTrackingInterval = null;
    }
    
    Object.values(this.targetCircles).forEach(circle => circle.remove());
    if (this.homeCircle) this.homeCircle.remove();
    if (this.dwellIndicator) this.dwellIndicator.remove();
    
    const container = this.getOrCreateExperimentUI();
    const config = this.config.experimentConfig;
    
    // Calculate per-phase stats
    const phaseStats = [];
    for (let phase = 1; phase <= 2; phase++) {
      const phaseTrials = this.trialData.filter(t => t.phase === phase && t.movementTime !== null && t.aggregateThroughput);
      if (phaseTrials.length === 0) continue;
      
      const layoutTPs = [...new Set(phaseTrials.map(t => t.layoutIndex))].map(layoutIdx => {
        const trial = phaseTrials.find(t => t.layoutIndex === layoutIdx);
        return trial ? trial.aggregateThroughput : 0;
      });
      const avgTP = layoutTPs.reduce((sum, tp) => sum + tp, 0) / layoutTPs.length;
      const avgMT = phaseTrials.reduce((sum, t) => sum + t.movementTime, 0) / phaseTrials.length;
      const avgError = phaseTrials.reduce((sum, t) => sum + t.selectionError, 0) / phaseTrials.length;
      
      phaseStats.push({
        phase: phase,
        phaseName: this.phaseCalibrationInfo[phase - 1] || `Calibration ${phase}`,
        calibration: this.phaseCalibrationInfo[phase - 1] || 'Unknown',
        avgTP: avgTP,
        avgMT: avgMT,
        avgError: avgError,
        trialCount: phaseTrials.length
      });
    }
    
    let comparisonHTML = '';
    if (phaseStats.length === 2) {
      const diff = phaseStats[0].avgTP - phaseStats[1].avgTP;
      const pctDiff = (diff / phaseStats[1].avgTP) * 100;
      const winner = diff > 0 ? `Phase 1 (${phaseStats[0].calibration})` : `Phase 2 (${phaseStats[1].calibration})`;
      const winnerColor = diff > 0 ? '#64ff64' : '#ffc864';
      
      comparisonHTML = `
        <div class="info-box" style="background: rgba(168, 85, 247, 0.15); border-left: 3px solid #a855f7; text-align: center;">
          <strong style="color: #a855f7; font-size: 13px;">Comparison Result</strong><br>
          <span style="font-size: 14px; color: ${winnerColor}; font-weight: bold;">
            ${winner} wins by ${Math.abs(pctDiff).toFixed(1)}%
          </span><br>
          <span style="font-size: 10px; color: #aaa;">
            TP difference: ${Math.abs(diff).toFixed(3)} bits/s
          </span>
        </div>
      `;
    }
    
    let phasesHTML = '';
    for (const stat of phaseStats) {
      const phaseColor = stat.phase === 1 ? '#64ff64' : '#ffc864';
      const bgColor = stat.phase === 1 ? '100, 255, 100' : '255, 200, 100';
      phasesHTML += `
        <div class="info-box" style="background: rgba(${bgColor}, 0.1); border-left: 3px solid ${phaseColor};">
          <strong style="color: ${phaseColor};">Phase ${stat.phase}: ${stat.phaseName}</strong><br>
          <span style="font-size: 10px; color: #aaa;">Calibration: ${stat.calibration}</span><br>
          • Throughput (ISO): <span style="color: #4caf50;">${stat.avgTP.toFixed(3)} bps</span><br>
          • Movement Time: <span style="color: #ffc864;">${(stat.avgMT * 1000).toFixed(0)} ms</span>
        </div>
      `;
    }
    
    container.innerHTML = `
      <div class="experiment-instructions" style="border: 2px solid #64ff64;">
        <h2 style="color: #64ff64;">🎉 Calibration Compare Complete!</h2>
        <p>Thank you for participating!</p>
        <div class="info-box" style="background: rgba(100, 200, 255, 0.1); border-left: 3px solid #64c8ff;">
          <strong>Configuration:</strong> ${config.modeName}, Variance Level ${config.varianceLevel}
        </div>
        ${phasesHTML}
        ${comparisonHTML}
        <div class="info-box" style="background: rgba(168, 85, 247, 0.1); border-left: 3px solid #a855f7;">
          <strong>💡 Interpretation:</strong><br>
          If Own Calibration wins significantly, personal calibration matters 
          and should be done for each user. If results are similar, a generic 
          calibration may be sufficient.
        </div>
        <button id="download-calib-compare-btn" class="start-button" style="
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
        <button id="close-calib-compare-btn" class="cancel-button" style="
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
    
    document.getElementById('download-calib-compare-btn').addEventListener('click', () => {
      this.downloadData();
    });
    
    document.getElementById('close-calib-compare-btn').addEventListener('click', () => {
      this.cleanup();
    });
  }
  
  downloadData() {
    const csv = Papa.unparse(this.trialData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pilot-calibration-compare-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    console.log('📥 Calibration Compare data downloaded');
  }
  
  close() {
    if (!confirm("Exit the Calibration Compare experiment? Progress will not be saved.")) {
      return;
    }
    this.cleanup();
  }
  
  cleanup() {
    console.log('🧹 Cleaning up Calibration Compare');
    
    if (this.cursorTrackingInterval) {
      clearInterval(this.cursorTrackingInterval);
      this.cursorTrackingInterval = null;
    }
    if (this.breakInterval) {
      clearInterval(this.breakInterval);
      this.breakInterval = null;
    }
    
    Object.values(this.targetCircles).forEach(circle => circle.remove());
    this.targetCircles = {};
    if (this.homeCircle) this.homeCircle.remove();
    if (this.dwellIndicator) this.dwellIndicator.remove();
    this.hideExperimentUI();
    if (this.experimentUI) {
      this.experimentUI.remove();
      this.experimentUI = null;
    }
    
    this.restoreAllControls();
    
    this.isRunning = false;
    this.currentPhase = 0;
    this.currentLayoutIndex = 0;
    this.currentTrialInLayout = 0;
    this.completedTrials = 0;
    
    console.log('✅ Calibration Compare cleanup complete');
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  window.calibrationComparePilot = new CalibrationComparePilotExperiment();
  console.log('✅ Calibration Compare Pilot Experiment initialized');
});
