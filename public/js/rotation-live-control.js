/**
 * LIVE ROTATION CONTROL
 * Real-time toggle and display for rotation features during tracking
 * 
 * Three tracking modes:
 * 1. 'landmarks' - Only facial landmarks (x, y, z positions)
 * 2. 'landmarks+rotation' - Landmarks + head rotation angles
 * 3. 'rotation' - Only rotation angles (yaw, pitch, roll)
 */

(function() {
  'use strict';
  
  console.log('🎮 Loading Live Rotation Control...');
  
  // State for live rotation control - using clear tracking mode
  window.liveRotationControl = {
    // Current tracking mode: 'landmarks', 'landmarks+rotation', or 'rotation'
    trackingMode: 'landmarks',
    // Legacy compatibility flags (computed from trackingMode)
    get enabled() { return this.trackingMode === 'landmarks+rotation'; },
    get rotationOnlyEnabled() { return this.trackingMode === 'rotation'; },
    uiVisible: false,
    lastAngles: { yaw: 0, pitch: 0, roll: 0 },
    // Available modes based on calibration
    availableModes: {
      landmarks: false,
      'landmarks+rotation': false,
      rotation: false
    }
  };
  
  // Create the UI overlay
  function createRotationControlUI() {
    // Check if already exists
    if (document.getElementById('live-rotation-control')) {
      return;
    }
    
    const controlPanel = document.createElement('div');
    controlPanel.id = 'live-rotation-control';
    controlPanel.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      z-index: 9999;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      min-width: 280px;
      display: none;
    `;
    
    controlPanel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h3 style="margin: 0; font-size: 16px; display: flex; align-items: center; gap: 8px;">
          <span>🎯</span> Tracking Mode
        </h3>
        <button id="rotation-control-close" style="
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          padding: 5px 10px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
        ">✕</button>
      </div>
      
      <!-- Current Mode Status -->
      <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; margin-bottom: 15px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 14px;">Current Mode:</span>
          <span id="rotation-status-badge" style="
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
            background: #4caf50;
          ">LANDMARKS</span>
        </div>
        <div id="mode-description" style="
          font-size: 11px;
          opacity: 0.8;
          line-height: 1.4;
          padding-top: 8px;
          border-top: 1px solid rgba(255,255,255,0.1);
        ">
          Using landmarks only (x, y, z positions)
        </div>
      </div>
      
      <!-- Live Angles Display -->
      <div id="live-angles-display" style="
        background: rgba(0,0,0,0.2);
        padding: 15px;
        border-radius: 8px;
        margin-bottom: 15px;
      ">
        <div style="font-size: 12px; margin-bottom: 10px; opacity: 0.8;">Live Head Angles:</div>
        <div style="display: flex; justify-content: space-between; font-family: monospace;">
          <div style="text-align: center;">
            <div style="opacity: 0.7; font-size: 11px;">YAW</div>
            <div style="font-size: 20px; font-weight: bold; color: #4ecdc4;" id="live-yaw">0.0°</div>
          </div>
          <div style="text-align: center;">
            <div style="opacity: 0.7; font-size: 11px;">PITCH</div>
            <div style="font-size: 20px; font-weight: bold; color: #95e1d3;" id="live-pitch">0.0°</div>
          </div>
          <div style="text-align: center;">
            <div style="opacity: 0.7; font-size: 11px;">ROLL</div>
            <div style="font-size: 20px; font-weight: bold; color: #f38181;" id="live-roll">0.0°</div>
          </div>
        </div>
      </div>
      
      <!-- Three Mode Buttons -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <!-- Mode 1: Landmarks Only -->
        <button id="mode-landmarks-btn" style="
          width: 100%;
          background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);
          border: 3px solid white;
          color: white;
          padding: 12px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: bold;
          transition: all 0.3s;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        ">
          📍 Landmarks Only
        </button>
        
        <!-- Mode 2: Landmarks + Rotation (hidden) -->
        <button id="mode-combined-btn" style="
          display: none;
          width: 100%;
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          border: 2px solid transparent;
          color: white;
          padding: 12px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: bold;
          transition: all 0.3s;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          opacity: 0.5;
        ">
          🔄 Landmarks + Rotation
        </button>
        
        <!-- Mode 3: Rotation Only -->
        <button id="mode-rotation-btn" style="
          width: 100%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: 2px solid transparent;
          color: white;
          padding: 12px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: bold;
          transition: all 0.3s;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          opacity: 0.5;
        ">
          🔬 Rotation Only
        </button>
      </div>
      
      <!-- Availability note -->
      <div id="mode-availability-note" style="
        margin-top: 12px;
        padding: 10px;
        background: rgba(255,255,255,0.1);
        border-radius: 6px;
        font-size: 11px;
        line-height: 1.4;
        display: none;
      ">
        <strong>Note:</strong> Some modes require specific calibration settings.
      </div>
    `;
    
    document.body.appendChild(controlPanel);
    
    // Setup event listeners
    setupEventListeners();
    
    console.log('✅ Live Rotation Control UI created');
  }
  
  function setupEventListeners() {
    // Close button
    const closeBtn = document.getElementById('rotation-control-close');
    if (closeBtn) {
      closeBtn.onclick = () => {
        hideRotationControl();
      };
    }
    
    // Mode buttons
    const landmarksBtn = document.getElementById('mode-landmarks-btn');
    const combinedBtn = document.getElementById('mode-combined-btn');
    const rotationBtn = document.getElementById('mode-rotation-btn');
    
    if (landmarksBtn) {
      landmarksBtn.onclick = () => setTrackingMode('landmarks');
    }
    if (combinedBtn) {
      combinedBtn.onclick = () => setTrackingMode('landmarks+rotation');
    }
    if (rotationBtn) {
      rotationBtn.onclick = () => setTrackingMode('rotation');
    }
  }
  
  function setTrackingMode(mode) {
    // Check if mode is available
    if (!window.liveRotationControl.availableModes[mode]) {
      console.warn(`⚠️ Mode '${mode}' is not available with current calibration`);
      showNotification(`Mode not available. Requires specific calibration.`, 'warning');
      return;
    }
    
    const previousMode = window.liveRotationControl.trackingMode;
    window.liveRotationControl.trackingMode = mode;
    
    console.log(`🎯 Tracking mode changed: ${previousMode} → ${mode}`);
    
    // Handle Three.js 3D head visualization
    if (window.threeJSHeadViz) {
      if (mode === 'rotation') {
        window.threeJSHeadViz.show();
      } else {
        window.threeJSHeadViz.hide();
      }
    }
    
    updateUI();
    
    // Show notification
    const modeNames = {
      'landmarks': 'Landmarks Only',
      'landmarks+rotation': 'Landmarks + Rotation',
      'rotation': 'Rotation Only'
    };
    showNotification(`Mode: ${modeNames[mode]}`, 'success');
  }
  
  function updateUI() {
    const mode = window.liveRotationControl.trackingMode;
    const availableModes = window.liveRotationControl.availableModes;
    
    // Update status badge
    const badge = document.getElementById('rotation-status-badge');
    if (badge) {
      const badgeConfig = {
        'landmarks': { text: 'LANDMARKS', color: '#4caf50' },
        'landmarks+rotation': { text: 'COMBINED', color: '#f5576c' },
        'rotation': { text: 'ROTATION', color: '#9c27b0' }
      };
      badge.textContent = badgeConfig[mode].text;
      badge.style.background = badgeConfig[mode].color;
    }
    
    // Update mode description
    const modeDesc = document.getElementById('mode-description');
    if (modeDesc) {
      const descriptions = {
        'landmarks': 'Using landmarks only (x, y, z positions)',
        'landmarks+rotation': '✅ Using landmarks + rotation angles',
        'rotation': '🔬 Using ONLY rotation angles (yaw, pitch, roll)'
      };
      const colors = {
        'landmarks': 'rgba(255,255,255,0.8)',
        'landmarks+rotation': '#c8e6c9',
        'rotation': '#e1bee7'
      };
      modeDesc.textContent = descriptions[mode];
      modeDesc.style.color = colors[mode];
    }
    
    // Update mode buttons
    const buttons = {
      'landmarks': document.getElementById('mode-landmarks-btn'),
      'landmarks+rotation': document.getElementById('mode-combined-btn'),
      'rotation': document.getElementById('mode-rotation-btn')
    };
    
    Object.entries(buttons).forEach(([btnMode, btn]) => {
      if (!btn) return;
      
      const isAvailable = availableModes[btnMode];
      const isActive = mode === btnMode;
      
      // Visual state
      btn.style.border = isActive ? '3px solid white' : '2px solid transparent';
      btn.style.opacity = isAvailable ? '1' : '0.4';
      btn.style.cursor = isAvailable ? 'pointer' : 'not-allowed';
      btn.disabled = !isAvailable;
      
      // Add unavailable indicator
      if (!isAvailable && !btn.dataset.originalText) {
        btn.dataset.originalText = btn.textContent;
        btn.textContent = btn.textContent + ' (N/A)';
      } else if (isAvailable && btn.dataset.originalText) {
        btn.textContent = btn.dataset.originalText;
        delete btn.dataset.originalText;
      }
    });
    
    // Show/hide availability note
    const note = document.getElementById('mode-availability-note');
    if (note) {
      const unavailableCount = Object.values(availableModes).filter(v => !v).length;
      if (unavailableCount > 0) {
        note.style.display = 'block';
        const missing = [];
        if (!availableModes['landmarks+rotation']) missing.push('Landmarks+Rotation (calibrate with rotation enabled)');
        if (!availableModes['rotation']) missing.push('Rotation Only (calibrate with rotation-only mode)');
        note.innerHTML = `<strong>Note:</strong> ${missing.join(', ')} not available.`;
      } else {
        note.style.display = 'none';
      }
    }
  }
  
  function updateLiveAngles(angles) {
    if (!angles) return;
    
    window.liveRotationControl.lastAngles = angles;
    
    const yawEl = document.getElementById('live-yaw');
    const pitchEl = document.getElementById('live-pitch');
    const rollEl = document.getElementById('live-roll');
    
    if (yawEl) yawEl.textContent = angles.yaw.toFixed(1) + '°';
    if (pitchEl) pitchEl.textContent = angles.pitch.toFixed(1) + '°';
    if (rollEl) rollEl.textContent = angles.roll.toFixed(1) + '°';
  }
  
  function showRotationControl(showPanel) {
    const panel = document.getElementById('live-rotation-control');
    if (panel) {
      // Detect available modes based on calibration and existing matrices
      detectAvailableModes();
      
      // Set initial mode based on what's available
      const availableModes = window.liveRotationControl.availableModes;
      
      console.log('🎯 Available tracking modes:', availableModes);
      
      // Set default mode based on calibration type
      if (window.state && window.state.config) {
        const rotationOnlyMode = window.state.config.rotationOnlyMode;
        
        if (rotationOnlyMode && availableModes['rotation']) {
          window.liveRotationControl.trackingMode = 'rotation';
          
          if (window.threeJSHeadViz) {
            console.log('🎨 Auto-showing Three.js head for rotation-only mode');
            window.threeJSHeadViz.show();
          }
        } else if (availableModes['landmarks+rotation']) {
          window.liveRotationControl.trackingMode = 'landmarks+rotation';
        } else {
          window.liveRotationControl.trackingMode = 'landmarks';
        }
      }
      
      // Only show the panel UI if explicitly requested
      if (showPanel) {
        panel.style.display = 'block';
        window.liveRotationControl.uiVisible = true;
      }
      
      updateUI();
      console.log('👁️ Live Rotation Control initialized, mode:', window.liveRotationControl.trackingMode, ', panel visible:', !!showPanel);
    }
  }
  
  function detectAvailableModes() {
    const availableModes = {
      landmarks: false,
      'landmarks+rotation': false,
      rotation: false
    };
    
    console.log('🔍 detectAvailableModes called');
    console.log('   window.state exists:', !!window.state);
    console.log('   window.state.transformationMatrices exists:', !!window.state?.transformationMatrices);
    console.log('   window.state.config:', window.state?.config);
    console.log('   window.estimateHeadPose exists:', !!window.estimateHeadPose);
    
    if (!window.state || !window.state.transformationMatrices) {
      console.warn('   ⚠️ Missing state or transformation matrices');
      window.liveRotationControl.availableModes = availableModes;
      return;
    }
    
    const matrices = window.state.transformationMatrices;
    const config = window.state.config || {};
    
    // Helper function to check if a matrix has rotation terms by examining dimensions
    function getMatrixCols(matrix) {
      if (!matrix) return 0;
      try {
        // Try using math.js if available
        if (typeof math !== 'undefined' && math.size) {
          const matrixSize = math.size(math.matrix(matrix));
          return matrixSize.valueOf()[1];
        }
        // Fallback: check array structure directly
        if (Array.isArray(matrix) && matrix.length > 0) {
          if (Array.isArray(matrix[0])) {
            return matrix[0].length;
          }
        }
        return 0;
      } catch (e) {
        console.warn('Could not determine matrix columns:', e);
        return 0;
      }
    }
    
    // Check for Landmarks Only mode
    // Available if we have any landmark matrix (check all possible locations)
    const hasLandmarkMatrix = 
      matrices.threePoint || matrices.sixPoint ||
      matrices.threePoint2d || matrices.sixPoint2d || 
      matrices.threePoint3d || matrices.sixPoint3d ||
      matrices.threePoint2dNoRotation || matrices.sixPoint2dNoRotation ||
      matrices.threePoint3dNoRotation || matrices.sixPoint3dNoRotation;
    availableModes.landmarks = !!hasLandmarkMatrix;
    
    console.log('   Landmarks mode available:', availableModes.landmarks, '(hasLandmarkMatrix:', hasLandmarkMatrix ? 'yes' : 'no', ')');
    
    // Check for Landmarks + Rotation mode
    // Check both config flag AND actual matrix dimensions
    const is3D = config.coordinateSystem === "3d";
    const is3Point = config.landmarkPoints === "3";
    
    // Expected dimensions (including bias term!)
    // Matrix format: B × P where P = [bias, landmarks..., (rotation...)]
    // 2D: 3-point = 13 (no rot) or 16 (rot), 6-point = 25 (no rot) or 28 (rot)
    // 3D: 3-point = 19 (no rot) or 22 (rot), 6-point = 37 (no rot) or 40 (rot)
    // Formula: 1 (bias) + landmarks × termsPerLandmark + rotation (0 or 3)
    // 2D termsPerLandmark = 4 (x, y, x², y²)
    // 3D termsPerLandmark = 6 (x, y, z, x², y², z²)
    let matrixWithRotation = false;
    let actualCols = 0;
    let expectedWithRotation = 0;
    let expectedWithoutRotation = 0;
    
    if (is3D) {
      // 3D: 1 bias + (3 or 6 landmarks) × 6 terms + 3 rotation
      expectedWithoutRotation = is3Point ? (1 + 3*6) : (1 + 6*6);  // 19 or 37
      expectedWithRotation = expectedWithoutRotation + 3;  // 22 or 40
      const matrix = is3Point ? matrices.threePoint3d : matrices.sixPoint3d;
      actualCols = getMatrixCols(matrix);
      matrixWithRotation = actualCols === expectedWithRotation;
    } else {
      // 2D: 1 bias + (3 or 6 landmarks) × 4 terms + 3 rotation
      expectedWithoutRotation = is3Point ? (1 + 3*4) : (1 + 6*4);  // 13 or 25
      expectedWithRotation = expectedWithoutRotation + 3;  // 16 or 28
      const matrix = is3Point ? matrices.threePoint2d : matrices.sixPoint2d;
      actualCols = getMatrixCols(matrix);
      matrixWithRotation = actualCols === expectedWithRotation;
    }
    
    // Also allow combined mode if config says rotation was used (trust the calibration)
    // The tracking code will handle graceful fallback if matrix doesn't actually support it
    const configSaysRotation = config.useRotation === true;
    
    availableModes['landmarks+rotation'] = (matrixWithRotation || configSaysRotation) && !!window.estimateHeadPose;
    
    console.log('   Landmarks+Rotation mode:', {
      available: availableModes['landmarks+rotation'],
      matrixWithRotation,
      configSaysRotation,
      hasEstimateHeadPose: !!window.estimateHeadPose
    });
    
    // Check for Rotation Only mode
    // Available if we have the rotation-only matrix
    availableModes.rotation = !!matrices.rotationOnly && !!window.estimateHeadPose;
    
    console.log('🔍 Mode detection:', {
      hasLandmarkMatrix,
      matrixWithRotation,
      actualCols,
      expectedWithRotation,
      configSaysRotation,
      hasRotationOnlyMatrix: !!matrices.rotationOnly,
      hasEstimateHeadPose: !!window.estimateHeadPose,
      useRotation: config.useRotation,
      rotationOnlyMode: config.rotationOnlyMode,
      is3D,
      is3Point
    });
    
    window.liveRotationControl.availableModes = availableModes;
  }
  
  function hideRotationControl() {
    const panel = document.getElementById('live-rotation-control');
    if (panel) {
      panel.style.display = 'none';
      window.liveRotationControl.uiVisible = false;
      console.log('🙈 Live Rotation Control hidden');
    }
  }
  
  function showNotification(message, type = 'info') {
    const colors = {
      success: '#4caf50',
      info: '#2196f3',
      warning: '#ff9800',
      error: '#f44336'
    };
    
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${colors[type]};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: bold;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideDown 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideUp 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }
  
  function toggleRotationPanel() {
    const panel = document.getElementById('live-rotation-control');
    if (panel) {
      const isVisible = panel.style.display !== 'none';
      panel.style.display = isVisible ? 'none' : 'block';
      window.liveRotationControl.uiVisible = !isVisible;
    }
  }

  // Export functions
  window.liveRotationControl.show = showRotationControl;
  window.liveRotationControl.hide = hideRotationControl;
  window.liveRotationControl.togglePanel = toggleRotationPanel;
  window.liveRotationControl.updateAngles = updateLiveAngles;
  window.liveRotationControl.updateUI = updateUI;
  window.liveRotationControl.setMode = setTrackingMode;
  window.liveRotationControl.detectModes = detectAvailableModes;
  
  // Auto-create UI when tracking starts
  document.addEventListener('DOMContentLoaded', () => {
    createRotationControlUI();
  });
  
  // Create UI immediately if DOM is already ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createRotationControlUI);
  } else {
    createRotationControlUI();
  }
  
  console.log('✅ Live Rotation Control loaded');
  
})();

