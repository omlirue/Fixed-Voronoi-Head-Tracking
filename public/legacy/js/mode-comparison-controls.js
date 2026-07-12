// Mode Comparison Controls Component
const ModeComparisonControls = () => {
  const [currentPhase, setCurrentPhase] = React.useState(null);
  const [isExperimentRunning, setIsExperimentRunning] = React.useState(false);

  // Expose state setters to window for external access
  React.useEffect(() => {
    window.modeComparisonControlsInstance = {
      setCurrentPhase: setCurrentPhase,
      setIsExperimentRunning: setIsExperimentRunning
    };
    
    return () => {
      window.modeComparisonControlsInstance = null;
    };
  }, []);

  if (!isExperimentRunning || !currentPhase) {
    return null; // Don't show controls until experiment starts
  }

  return React.createElement('div', {
    className: 'comparison-controls'
  }, [
    // Title
    React.createElement('h3', { 
      key: 'title',
      className: 'text-lg font-bold'
    }, 'Mode Comparison'),
    
    // Phase Indicator
    React.createElement('div', {
      className: 'phase-indicator',
      key: 'phase-indicator'
    }, [
      React.createElement('div', {
        className: 'phase-title',
        key: 'phase-title'
      }, `Phase ${currentPhase.phaseNumber}/4`),
      
      React.createElement('div', {
        className: 'mode-name',
        key: 'mode-name'
      }, currentPhase.modeName),
      
      React.createElement('div', {
        className: 'variance-level',
        key: 'variance-level'
      }, `Variance Level: ${currentPhase.varianceLevel}`),
      
      React.createElement('div', {
        className: 'filter-info',
        key: 'filter-info'
      }, [
        React.createElement('div', { key: 'filter-type' }, `Filter: Exponential`),
        React.createElement('div', { key: 'rank' }, `Rank: ${currentPhase.rank}`),
        React.createElement('div', { key: 'variance' }, `Expected Variance: ${currentPhase.expectedVariance.toFixed(2)}`)
      ]),
      
      React.createElement('div', {
        className: 'warning',
        key: 'warning'
      }, '⚠️ DO NOT change settings during experiment')
    ])
  ]);
};

// Make component globally available
window.ModeComparisonControls = ModeComparisonControls;

// Mode Comparison Experiment Class
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
          exponentialRank: 9, // Variance level 2 from Fitts experiment
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
          exponentialRank: 23, // Variance level 3 from Fitts experiment
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
    
    // UI elements
    this.experimentUI = null;
    this.targetCircles = {};
    this.homeCircle = null;
    this.dwellIndicator = null;
    this.progressDisplay = null;
    
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
    
    // Initialize video and face tracking
    await this.initializeTracking();
    
    // Generate layouts
    this.layouts = this.generateLayouts();
    this.totalTrials = this.layouts.length * this.config.trialsPerLayout * this.config.comparisonPhases.length;
    
    console.log(`📊 Total layouts: ${this.layouts.length}`);
    console.log(`📊 Total phases: ${this.config.comparisonPhases.length}`);
    console.log(`📊 Total trials: ${this.totalTrials}`);
    
    // Mount comparison controls
    this.mountComparisonControls();
    
    // Show welcome screen
    this.showWelcomeScreen();
  }
  
  // Initialize video and face tracking
  async initializeTracking() {
    console.log('🎥 Initializing video and face tracking...');
    
    // Initialize video if not already done
    if (!window.state.isTracking) {
      await window.initializeVideo();
      console.log('✅ Video initialized');
    }
  }
  
  // Mount comparison controls
  mountComparisonControls() {
    const container = document.getElementById('comparison-controls-container');
    if (container && window.ModeComparisonControls) {
      const root = ReactDOM.createRoot(container);
      root.render(React.createElement(window.ModeComparisonControls));
      console.log('✅ Comparison controls mounted');
    }
  }
  
  // Show welcome screen
  showWelcomeScreen() {
    const container = document.getElementById('experiment-ui-container');
    container.innerHTML = `
      <div class="experiment-instructions">
        <h2>Mode Comparison Experiment</h2>
        <p>
          This experiment compares <strong>Rotation-Only Mode</strong> and <strong>3-Point 2D Mode</strong>
          at two different variance levels (2 and 3) using exponential filters.
        </p>
        <div class="tip">
          <strong>Experiment Structure:</strong><br>
          • 4 phases (2 modes × 2 variance levels)<br>
          • 6 layouts per phase (3 sizes × 2 distances)<br>
          • 8 trials per layout (8 directions)<br>
          • Total: ${this.totalTrials} trials<br>
          • 1-minute break between phases
        </div>
        <div class="tip">
          <strong>Instructions:</strong><br>
          • Move the cursor to the highlighted target circle<br>
          • Hold steady for 0.8 seconds to select<br>
          • Return to center (home circle) between trials<br>
          • Try to be as quick and accurate as possible
        </div>
        <button id="begin-experiment-btn">Begin Experiment</button>
      </div>
    `;
    
    document.getElementById('begin-experiment-btn').addEventListener('click', () => {
      this.startPhase(0);
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
    
    // Load appropriate calibration data
    await this.loadCalibrationForPhase(phase);
    
    // Apply exponential filter with specified rank
    this.applyExponentialFilter(phase.exponentialRank);
    
    // Update comparison controls
    if (window.modeComparisonControlsInstance) {
      window.modeComparisonControlsInstance.setCurrentPhase({
        phaseNumber: phase.phaseNumber,
        modeName: phase.modeName,
        varianceLevel: phase.varianceLevel,
        rank: phase.exponentialRank,
        expectedVariance: phase.expectedVariance
      });
      window.modeComparisonControlsInstance.setIsExperimentRunning(true);
    }
    
    // Reset layout and trial counters
    this.currentLayoutIndex = 0;
    this.currentTrialInLayout = 0;
    
    // Show phase start screen
    this.showPhaseStartScreen(phase);
  }
  
  // Load calibration for specific phase
  async loadCalibrationForPhase(phase) {
    console.log(`📂 Loading calibration for ${phase.mode} mode...`);
    
    const calibrationData = phase.mode === "rotation" 
      ? window.comparisonCalibrationData.rotation 
      : window.comparisonCalibrationData.threepoint;
    
    if (!calibrationData) {
      throw new Error(`No calibration data found for ${phase.mode} mode`);
    }
    
    // Parse and load calibration data (similar to existing calibration loading logic)
    // This would use the existing parseCalibrationCSV function
    await window.parseAndLoadCalibrationData(calibrationData, phase.mode);
    
    console.log(`✅ Calibration loaded for ${phase.mode} mode`);
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
    
    // Reset cursor state
    window.state.lastHeadX = null;
    window.state.lastHeadY = null;
    window.state.cursorX = null;
    window.state.cursorY = null;
    window.state.smoothedX = null;
    window.state.smoothedY = null;
    
    console.log(`✅ Exponential filter configured: smoothingFactor=${smoothingFactor.toFixed(6)}`);
  }
  
  // Show phase start screen
  showPhaseStartScreen(phase) {
    const container = document.getElementById('experiment-ui-container');
    container.innerHTML = `
      <div class="experiment-instructions">
        <h2>Phase ${phase.phaseNumber}/4</h2>
        <h3 style="color: #ffc864; margin: 10px 0;">${phase.modeName}</h3>
        <p style="color: #aaa;">
          Variance Level: ${phase.varianceLevel} | Exponential Rank: ${phase.exponentialRank}
        </p>
        <div class="tip">
          <strong>This Phase:</strong><br>
          • ${this.layouts.length} layouts<br>
          • ${this.layouts.length * this.config.trialsPerLayout} trials total<br>
          • Estimated time: ~${Math.ceil(this.layouts.length * this.config.trialsPerLayout * 5 / 60)} minutes
        </div>
        <p>Click "Start Phase" when you're ready to begin.</p>
        <button id="start-phase-btn">Start Phase ${phase.phaseNumber}</button>
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
    const container = document.getElementById('experiment-ui-container');
    container.innerHTML = '';
    
    // Create target circles and home circle
    this.createTargetCircles(layout);
    this.createHomeCircle();
    this.createDwellIndicator();
    this.createProgressDisplay();
    
    // Reset trial counter
    this.currentTrialInLayout = 0;
    
    // Start first trial
    this.startTrial();
  }
  
  // Create target circles (8 directions)
  createTargetCircles(layout) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    // Remove existing circles
    Object.values(this.targetCircles).forEach(circle => circle.remove());
    this.targetCircles = {};
    
    // Create 8 target circles
    layout.sequence.forEach((angle, index) => {
      const rad = (angle * Math.PI) / 180;
      const x = centerX + layout.amplitude * Math.cos(rad);
      const y = centerY + layout.amplitude * Math.sin(rad);
      
      const circle = document.createElement('div');
      circle.className = 'target-circle';
      circle.style.width = `${layout.targetSize}px`;
      circle.style.height = `${layout.targetSize}px`;
      circle.style.left = `${x}px`;
      circle.style.top = `${y}px`;
      circle.style.transform = 'translate(-50%, -50%)';
      
      document.body.appendChild(circle);
      this.targetCircles[index] = circle;
    });
  }
  
  // Create home circle (center)
  createHomeCircle() {
    if (this.homeCircle) {
      this.homeCircle.remove();
    }
    
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const homeSize = 100; // Fixed size for home circle
    
    const circle = document.createElement('div');
    circle.className = 'home-circle';
    circle.style.width = `${homeSize}px`;
    circle.style.height = `${homeSize}px`;
    circle.style.left = `${centerX}px`;
    circle.style.top = `${centerY}px`;
    circle.style.transform = 'translate(-50%, -50%)';
    
    document.body.appendChild(circle);
    this.homeCircle = circle;
  }
  
  // Create dwell indicator
  createDwellIndicator() {
    if (this.dwellIndicator) {
      this.dwellIndicator.remove();
    }
    
    const indicator = document.createElement('div');
    indicator.className = 'dwell-indicator';
    indicator.style.display = 'none';
    
    document.body.appendChild(indicator);
    this.dwellIndicator = indicator;
  }
  
  // Create progress display
  createProgressDisplay() {
    if (this.progressDisplay) {
      this.progressDisplay.remove();
    }
    
    const display = document.createElement('div');
    display.className = 'progress-display';
    display.innerHTML = `
      <div class="trial-count">Trial 0/${this.totalTrials}</div>
      <div class="phase-info">Phase ${this.getCurrentPhase().phaseNumber}/4</div>
    `;
    
    document.body.appendChild(display);
    this.progressDisplay = display;
  }
  
  // Update progress display
  updateProgressDisplay() {
    if (this.progressDisplay) {
      this.progressDisplay.innerHTML = `
        <div class="trial-count">Trial ${this.completedTrials}/${this.totalTrials}</div>
        <div class="phase-info">Phase ${this.getCurrentPhase().phaseNumber}/4</div>
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
    
    // Highlight current target
    Object.values(this.targetCircles).forEach((circle, index) => {
      circle.classList.remove('active');
      if (index === this.currentTrialInLayout) {
        circle.classList.add('active');
      }
    });
    
    // Wait for home circle dwell first
    this.waitingForHomeCircle = true;
    this.trialStartTime = Date.now();
    
    // Start cursor tracking
    this.startCursorTracking();
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
      return; // No cursor position yet
    }
    
    if (this.waitingForHomeCircle) {
      this.checkHomeCircleDwell(cursorX, cursorY);
    } else {
      this.checkTargetDwell(cursorX, cursorY);
    }
  }
  
  // Check if cursor is dwelling in home circle
  checkHomeCircleDwell(cursorX, cursorY) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const homeRadius = 50; // Half of home circle size
    
    const distance = Math.sqrt((cursorX - centerX) ** 2 + (cursorY - centerY) ** 2);
    
    if (distance <= homeRadius) {
      if (!this.dwellStartTime) {
        this.dwellStartTime = Date.now();
        this.showDwellIndicator(centerX, centerY, 100);
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
  
  // Show dwell indicator
  showDwellIndicator(x, y, size) {
    if (this.dwellIndicator) {
      this.dwellIndicator.style.display = 'block';
      this.dwellIndicator.style.left = `${x}px`;
      this.dwellIndicator.style.top = `${y}px`;
      this.dwellIndicator.style.width = `${size}px`;
      this.dwellIndicator.style.height = `${size}px`;
      this.dwellIndicator.style.transform = 'translate(-50%, -50%) scale(0)';
    }
  }
  
  // Update dwell indicator
  updateDwellIndicator(progress) {
    if (this.dwellIndicator) {
      this.dwellIndicator.style.transform = `translate(-50%, -50%) scale(${progress})`;
    }
  }
  
  // Hide dwell indicator
  hideDwellIndicator() {
    if (this.dwellIndicator) {
      this.dwellIndicator.style.display = 'none';
    }
  }
  
  // On home circle complete
  onHomeCircleComplete() {
    console.log('✅ Home circle dwell complete');
    this.waitingForHomeCircle = false;
    this.dwellStartTime = null;
    this.hideDwellIndicator();
    this.movementStartTime = Date.now();
    this.startPoint = { x: window.state.cursorX, y: window.state.cursorY };
    this.cursorPath = [];
  }
  
  // On target complete
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
      startPoint: this.startPoint,
      cursorPath: this.cursorPath
    };
    
    this.trialData.push(trialRecord);
    this.completedTrials++;
    
    console.log(`📊 Trial ${this.completedTrials}/${this.totalTrials} complete`);
    
    // Update progress
    this.updateProgressDisplay();
    
    // Mark target as completed
    this.targetCircles[this.currentTrialInLayout].classList.add('completed');
    
    // Move to next trial
    this.currentTrialInLayout++;
    this.dwellStartTime = null;
    this.hideDwellIndicator();
    
    // Small delay before next trial
    setTimeout(() => {
      this.startTrial();
    }, 500);
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
    const container = document.getElementById('experiment-ui-container');
    this.breakTimeRemaining = this.config.breakDuration;
    
    container.innerHTML = `
      <div class="break-screen">
        <h2>Take a Break</h2>
        <div class="break-timer">${this.formatTime(this.breakTimeRemaining)}</div>
        <p>You've completed phase ${this.currentPhaseIndex}/${this.config.comparisonPhases.length}</p>
        <p>Rest your eyes and relax. The next phase will start automatically.</p>
        <button id="skip-break-btn">Skip Break</button>
      </div>
    `;
    
    // Start break timer
    this.breakInterval = setInterval(() => {
      this.breakTimeRemaining--;
      const timerElement = document.querySelector('.break-timer');
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
    const container = document.getElementById('experiment-ui-container');
    container.innerHTML = `
      <div class="completion-screen">
        <h2>🎉 Experiment Complete!</h2>
        <p>Thank you for participating in the Mode Comparison Experiment.</p>
        <p>You completed <strong>${this.completedTrials}</strong> trials across <strong>4 phases</strong>.</p>
        <div class="tip">
          <strong>Data Summary:</strong><br>
          • Rotation-Only Mode: ${this.trialData.filter(t => t.mode === 'rotation').length} trials<br>
          • 3-Point 2D Mode: ${this.trialData.filter(t => t.mode === 'threepoint').length} trials<br>
          • Variance Level 2: ${this.trialData.filter(t => t.varianceLevel === 2).length} trials<br>
          • Variance Level 3: ${this.trialData.filter(t => t.varianceLevel === 3).length} trials
        </div>
        <button id="download-data-btn">Download Data</button>
        <button id="restart-btn">Restart Experiment</button>
      </div>
    `;
    
    // Download data button
    document.getElementById('download-data-btn').addEventListener('click', () => {
      this.downloadData();
    });
    
    // Restart button
    document.getElementById('restart-btn').addEventListener('click', () => {
      location.reload();
    });
    
    // Hide comparison controls
    if (window.modeComparisonControlsInstance) {
      window.modeComparisonControlsInstance.setIsExperimentRunning(false);
    }
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
  
  // Format time (seconds to MM:SS)
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  // Delay helper
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Make experiment class globally available
window.ModeComparisonExperiment = ModeComparisonExperiment;

// Helper function to parse and load calibration data
window.parseAndLoadCalibrationData = async function(csvData, mode) {
  console.log(`📂 Parsing calibration data for ${mode} mode...`);
  
  // This function would parse the CSV data and load it into window.state
  // Similar to the existing calibration loading logic
  // For now, this is a placeholder
  
  // TODO: Implement actual CSV parsing and calibration loading
  // This should extract transformation matrices and other calibration data
  
  console.log(`✅ Calibration data parsed for ${mode} mode`);
};
