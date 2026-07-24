function startCalibration() {
  console.log("Starting calibration with config:", state.config);

  // Hide the system/mouse cursor for the rest of the session. Participants
  // use head tracking, not a mouse — the arrow pointer just sits on screen
  // doing nothing and is distracting.
  document.body.classList.add('hide-cursor');

  state.isCalibrating = true;
  state.isTracking = false;
  state.currentCalibrationPoint = 0;

  // Initialize calibration data structures properly
  state.calibrationData = {
    cursorPositions: [],
    frames: [],
    calibrationWidth: window.innerWidth,   // Store current window dimensions
    calibrationHeight: window.innerHeight,
    rotationOnlyPoints: []  // Initialize rotation-only array
  };
  state.transformationMatrices = {
    rotationOnly: null,
  };
  
    console.log("🔬 ROTATION-ONLY MODE ENABLED - Will collect rotation data");
  
  // Clear previous collection data
  state.dataCollection.calibrationData = [];

  // Reset other state variables
  state.previousPosition = null;
  state.currentPosition = null;
  state.isLineAnimating = false;

  // CRITICAL FIX: Reset rotation state for clean calibration
  state.smoothedAngles = null;  // Legacy (no longer used, but kept for compatibility)
  state.lastRawAngles = null;    // Current fallback angles
  window._lastAngles = null;     // Reset angle unwrapping state
  window.estimatedFocalLength = null; // Reset focal length for new calibration
  console.log("🔄 Reset angle state for clean calibration start");

  // Generate grid points before showing the first point
  generateGridPoints();

  // Show calibration UI elements
  const calibrationUI = document.getElementById("calibration-ui");
  if (calibrationUI) {
    calibrationUI.classList.remove("hidden");

    // Ensure progress display is visible
    const progressDisplay = document.getElementById("current-point-text");
    if (progressDisplay) {
      progressDisplay.textContent = "1";
    }
  } else {
    console.error("Calibration UI element not found");
    return;
  }

  // Show the first calibration point
  showNextCalibrationPoint();

  console.log("Calibration started successfully");
}

function showNextCalibrationPoint() {
  const point = getNextGridPosition();
  if (!point) {
    finishCalibration();
    return;
  }

  const calibrationUI = document.getElementById("calibration-ui");

  // Remove any leftover "Move here" hint from the previous target before
  // we render the new one.
  const existingHint = calibrationUI.querySelector('.calibration-hint');
  if (existingHint) existingHint.remove();

  // Create new target
  const currentTarget = document.createElement("div");
  currentTarget.id = "calibration-target";
  currentTarget.classList.add("calibration-point");
  currentTarget.style.left = `${point.x}px`;
  currentTarget.style.top = `${point.y}px`;
  currentTarget.style.backgroundColor = "rgba(255, 0, 0, 0.5)";

  // Clear existing points and add new one
  const existingTarget = calibrationUI.querySelector("#calibration-target");
  if (existingTarget) {
    calibrationUI.removeChild(existingTarget);
  }
  calibrationUI.appendChild(currentTarget);

  // Render the "Move here / Press SPACE" hint right below the new red dot,
  // similar to how the Pareto optimization screen labels each target.
  // We measure the rendered hint and clamp/flip it so it always stays
  // fully on screen — including at the corners.
  const hint = document.createElement("div");
  hint.className = "calibration-hint";
  hint.textContent = "Move here · Press SPACE";
  // Render off-transform first so we can measure width, then position.
  hint.style.left = `${point.x}px`;
  hint.style.top = `${point.y}px`;
  hint.style.visibility = "hidden";
  calibrationUI.appendChild(hint);

  const PAD = 12;
  const VERT_GAP = 30;
  const rect = hint.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  // Vertical: prefer below the dot; flip above if it would clip the bottom.
  const placeBelow = point.y + VERT_GAP + h <= window.innerHeight - PAD;
  const ty = placeBelow ? VERT_GAP : -(h + VERT_GAP);

  // Horizontal: center on the dot, then clamp so the hint fits within the
  // viewport with at least PAD px of margin on each side.
  const idealLeft = point.x - w / 2;
  const minLeft = PAD;
  const maxLeft = window.innerWidth - w - PAD;
  const clampedLeft = Math.max(minLeft, Math.min(maxLeft, idealLeft));
  const tx = clampedLeft - point.x; // px from point.x to top-left of hint

  hint.style.transform = `translate(${tx}px, ${ty}px)`;
  hint.style.visibility = "";

  // Update progress display
  const currentPointText = document.getElementById("current-point-text");
  if (currentPointText) {
    currentPointText.textContent = state.gridConfig.currentIndex + 1;
  }

  // Update the current position
  state.currentPosition = point;

  // Log for debugging
  console.log(
    "Showing calibration point:",
    state.gridConfig.currentIndex + 1,
    point
  );
}

function recordCalibrationPoint(point) {
  if (!state.lastLandmarks) {
    console.warn("No landmarks available for recording point");
    return;
  }

  try {


    // // Define landmark indices
    // const threePointIndices = [1, 33, 263]; // nose tip, left eye, right eye
    
    // Calculate head pose if rotation is enabled
    let headPose = null;
    if (window.estimateHeadPose) {
      // IMPORTANT: Use stored calibration dimensions for consistency
      const calibrationWidth = state.calibrationData.calibrationWidth || window.innerWidth;
      const calibrationHeight = state.calibrationData.calibrationHeight || window.innerHeight;
      headPose = estimateHeadPose(state.lastLandmarks, calibrationWidth, calibrationHeight);
      
      // Estimate focal length from first calibration point
      if (state.gridConfig.currentIndex === 0 && !window.estimatedFocalLength && window.estimateFocalLengthFromFaceSize) {
        const estimatedFx = estimateFocalLengthFromFaceSize(state.lastLandmarks, calibrationWidth);
        if (estimatedFx && estimatedFx > 0) {
          window.estimatedFocalLength = estimatedFx;
          console.log(`🎯 Auto-detected focal length at calibration point 1: ${estimatedFx.toFixed(0)} pixels (${(estimatedFx/calibrationWidth).toFixed(2)}x screen width)`);
        }
      }
    }

    console.log("Recording calibration point:", {
      pointNumber: state.gridConfig.currentIndex,
      target: point,
      rotation: headPose ? headPose.angles : null
    });
    
    // ROTATION-ONLY MODE: Create vectors with ONLY rotation components
    if (state.config.rotationOnlyMode) {
      // Build the [bias, yaw, pitch, roll] vector via the shared builder in
      // head-pose.js. CRITICAL: calibration must use the exact same transform
      // (including the asymmetric pitch gain) as live tracking, or the trained
      // matrix won't match the cursor at run time.
      const anglesForVector = (headPose && headPose.angles)
        ? headPose.angles
        : (state.smoothedAngles || { yaw: 0, pitch: 0, roll: 0 });
      if (!(headPose && headPose.angles)) {
        console.warn("⚠️ No head pose data for rotation-only mode point! Using last good angles.");
      }

      const rotationOnlyVector = window.buildRotationVector(anglesForVector);

      console.log("🔬 Rotation-only data collected (4 features):", {
        pointNumber: state.gridConfig.currentIndex + 1,
        yaw: anglesForVector.yaw.toFixed(2),
        pitch: anglesForVector.pitch.toFixed(2),
        roll: anglesForVector.roll.toFixed(2),
        vectorLength: rotationOnlyVector.length
      });

      // Store rotation-only data
      if (!state.calibrationData.rotationOnlyPoints) {
        state.calibrationData.rotationOnlyPoints = [];
      }
      state.calibrationData.rotationOnlyPoints.push(rotationOnlyVector);
      
      console.log(`🔬 Rotation-only points collected so far: ${state.calibrationData.rotationOnlyPoints.length}`);
    }

    // Store the vectors and cursor position
    state.calibrationData.cursorPositions.push([[point.x], [point.y]]);

    // Add to collection data
    // Get calibration dimensions for relative coordinates
    const calWidth = state.calibrationData.calibrationWidth || window.innerWidth;
    const calHeight = state.calibrationData.calibrationHeight || window.innerHeight;
    
    const frameData = {
      calibrationPointNumber: state.gridConfig.currentIndex + 1,
      timestamp: performance.now(),
      frameIndex: 0,
      targetX: point.x,
      targetY: point.y,
      targetXRel: point.x / calWidth,   // Relative position (0-1) for cross-screen compatibility
      targetYRel: point.y / calHeight,  // Relative position (0-1) for cross-screen compatibility
      progress: 1.0,
    };

    // // Add 3-point landmark data - always include Z
    // threePointIndices.forEach((index, i) => {
    //   const landmark = state.lastLandmarks[index];
    //   if (!landmark) {
    //     throw new Error(`Missing landmark ${index} for 3-point configuration`);
    //   }

    //   frameData[`landmark3_${i}_x`] = landmark.x * window.innerWidth;
    //   frameData[`landmark3_${i}_y`] = landmark.y * window.innerHeight;
    //   frameData[`landmark3_${i}_z`] = landmark.z * 1000;
    // });

    
    // Add rotation data if rotation is enabled
    if (headPose && headPose.angles) {
      frameData.yaw = Math.round(headPose.angles.yaw * 1000) / 1000;
      frameData.pitch = Math.round(headPose.angles.pitch * 1000) / 1000;
      frameData.roll = Math.round(headPose.angles.roll * 1000) / 1000;
    } else {
        // Default to 0 if rotation estimation failed
      frameData.yaw = 0;
      frameData.pitch = 0;
      frameData.roll = 0;
    }

    state.dataCollection.calibrationData.push(frameData);

  } catch (error) {
    console.error("Error recording calibration point:", error);
    throw error;
  }
}
function getCSVHeaders() {
  // Get basic headers without isTransition
  const headers = [
    "predictedX",
    "predictedY",
    "timestamp",
    "frameIndex",
    "targetX",
    "targetY",
    "targetXRel",  // Relative position (0-1) for cross-screen compatibility
    "targetYRel"   // Relative position (0-1) for cross-screen compatibility
    // "isTransition" - removed as requested
  ];

//Because we use are only using rotation only no need to include the 3-point landmark headers in the CSV
  headers.push("yaw");
  headers.push("pitch");
  headers.push("roll");

  // Removed these configuration headers
  // headers.push("coordinateSystem");
  // headers.push("filterType");

  return headers;
}

function captureCalibrationPoint() {
  if (!state.lastLandmarks) {
    console.log("Skipping capture - no landmarks");
    return;
  }

  const currentPoint = state.currentPosition;
  if (!currentPoint) {
    console.log("No current point to capture");
    return;
  }

  console.log("Capturing point:", state.gridConfig.currentIndex + 1);

  // Record point data
  recordCalibrationPoint(currentPoint);
  console.log("Recorded calibration point:", state.gridConfig.currentIndex + 1);
  console.log("Current calibration data:", {
    rotationOnlyPoints: state.calibrationData.rotationOnlyPoints.length,
    cursorPositions: state.calibrationData.cursorPositions.length,
  });

  // Increment index and show next point
  state.gridConfig.currentIndex++;

  // Check if we should finish calibration
  if (state.gridConfig.currentIndex >= 20) {
    console.log("Calibration points complete, finishing calibration");
    finishCalibration();
  } else {
    showNextCalibrationPoint();
  }
}


function finishCalibration() {
  console.log("Finishing calibration...");
  console.log(
    "Number of collected data points:",
    state.dataCollection.calibrationData.length
  );

  try {
    // Validate data existence
    if (
      !state.calibrationData ||
      !state.calibrationData.rotationOnlyPoints ||
      !state.calibrationData.cursorPositions
    ) {
      throw new Error("Missing calibration data structures");
    }

    // Log data structure for debugging
    console.log("Calibration data state:", {
      rotationOnlyPoints: state.calibrationData.rotationOnlyPoints.length,
      cursorPoints: state.calibrationData.cursorPositions.length,
      sampleRotationPoint: state.calibrationData.rotationOnlyPoints[0],
    });

    // Calculate transformation matrices for all configurations
    calculateAllTransformationMatrices();

    // Clean up calibration UI
    const calibrationUI = document.getElementById("calibration-ui");
    if (calibrationUI) {
      calibrationUI.classList.add("hidden");
    }

    // Show options instead of starting tracking directly
    showPostCalibrationOptions();

    // Calculate residuals for accuracy analysis
    const residualAnalysis = calculateRotationOnlyResiduals();
    if (!residualAnalysis) {
      console.warn("Could not calculate residuals");
    } else {
      console.log("Residual analysis:", residualAnalysis);
    }

    // Export the calibration data
    try {
      const exportSuccess = exportCalibrationData();
      if (!exportSuccess) {
        console.warn("Failed to export calibration data");
      }
    } catch (exportError) {
      console.warn("Error during data export:", exportError);
    }

    // Update application state
    state.isCalibrating = false;

    // Update status display
    // const statusMessage = residualAnalysis
    //   ? `Calibration complete - select an option (RMSE: ${residualAnalysis.rmse.toFixed(
    //       2
    //     )} px)`
    //   : "Calibration complete - select an option";
    // document.getElementById("status").textContent = statusMessage;

    console.log("Calibration completed successfully");
    
    // Dispatch calibrationComplete event for any listeners
    window.dispatchEvent(new Event('calibrationComplete'));
    
    return true;
  } catch (error) {
    // Error handling code remains the same
    console.error("Error during finishCalibration:", error);
    console.error("Error stack:", error.stack);

    console.error("Calibration state at error:", {
      dataCollectionLength: state.dataCollection.calibrationData.length,
      rotationOnlyPoints: state.calibrationData?.rotationOnlyPoints?.length,
      cursorPositions: state.calibrationData?.cursorPositions?.length,
    });

    state.isCalibrating = false;
    state.isTracking = false;
    state.transformationMatrices = {
      rotationOnly: null,
    };

    clearCalibrationData();

    const statusElement = document.getElementById("status");
    if (statusElement) {
      statusElement.textContent = "Error completing calibration: " + error.message;
    }

    return false;
  }
}


function clearCalibrationData() {
  state.calibrationData = {
    rotationOnlyPoints: [],
    frames: [],
  };
  state.transformationMatrices = {
    rotationOnly: null,
  };
  state.currentCalibrationPoint = 0;
  state.previousPosition = null;
  state.currentPosition = null;
  state.gridConfig.currentIndex = 0;
}

// Make functions globally available
window.calculateCalibrationResiduals = calculateRotationOnlyResiduals;
window.startCalibration = startCalibration;
window.captureCalibrationPoint = captureCalibrationPoint;
window.showNextCalibrationPoint = showNextCalibrationPoint;
window.finishCalibration = finishCalibration;
window.clearCalibrationData = clearCalibrationData;
window.showPredictedPositions = showPredictedPositions;
window.startTracking = startTracking;

function calculateAllTransformationMatrices() {
  // Initialize expanded transformationMatrices structure
  // If rotation was calibrated, we'll store both with-rotation and without-rotation matrices
  state.transformationMatrices = {
    rotationOnly: null,
  };
  
  // Store original config to restore later
  const originalConfig = { ...state.config };
  
  try {    
      console.log("\n🔬 Calculating ROTATION-ONLY matrix...");
      
      try {
        state.config.useRotation = false; // Temporarily disable for calculation
        
        const rotationOnlyData = state.calibrationData.rotationOnlyPoints;
        
        if (rotationOnlyData && rotationOnlyData.length > 0) {
          console.log(`  Using ${rotationOnlyData.length} rotation-only data points`);
          console.log(`  Sample point:`, rotationOnlyData[0]);
          
          // Calculate rotation-only matrix (maps 3 angles to 2D cursor position)
          const rotationOnlyMatrix = calculateTransformationMatrixForConfig(
            rotationOnlyData,
            state.calibrationData.cursorPositions
          );
          
          if (rotationOnlyMatrix) {
            const matrixDims = math.size(math.matrix(rotationOnlyMatrix)).valueOf();
            console.log(`  ✅ Rotation-only matrix: ${matrixDims[0]}×${matrixDims[1]}`);
            
            // Store rotation-only matrix
            state.transformationMatrices.rotationOnly = rotationOnlyMatrix;
          } else {
            console.warn("  ⚠️ Failed to calculate rotation-only matrix");
          }
        } else {
          console.warn("  ⚠️ No rotation-only data points available!");
        }
      } catch (error) {
        console.error("Error calculating rotation-only matrix:", error);
      }
      
      console.log("✅ Rotation-only matrix calculation complete\n");
    
    // After calculating all matrices, update the tracking controls with residuals
    // This is important for both manual calibration and uploaded calibration files
    setTimeout(() => {
      if (window.updateTrackingControlsResiduals) {
        window.updateTrackingControlsResiduals();
        console.log("Updated tracking controls residuals after matrix calculation");
      }
    }, 500);
  } finally {
    // Restore original config
    state.config = { ...originalConfig };
  }
}

function showPostCalibrationOptions() {
  startTracking();
  const checkFn = window.runRegionReachabilityCheck || runPostCalibrationEdgeCheck;
  checkFn().then(passed => {
    if (passed) showReadyToBeginScreen();
  });
}

// New, discrete-system-appropriate replacement for the old
// "parameter optimization" screen. Matches voronoi.html's existing
// .overlay-screen visual style.
function showReadyToBeginScreen() {
  if (document.getElementById('ready-to-begin-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'ready-to-begin-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.92); z-index: 100000;
    display: flex; align-items: center; justify-content: center;
  `;
  overlay.innerHTML = `
    <div style="text-align: center; padding: 50px 60px; background: rgba(30,30,40,0.98);
      border: 2px solid #64c8ff; border-radius: 16px; max-width: 560px;
      font-family: system-ui, -apple-system, sans-serif; color: #eee;">
      <h1 style="color: #64c8ff; font-size: 30px; margin: 0 0 14px;">Calibration Complete</h1>
      <p style="color: #ccc; font-size: 19px; margin: 0 0 22px;">
        Move your head toward each highlighted region until it fills in.
        Holding still on a region selects it.
      </p>
      <div id="ready-to-begin-btn" style="
        padding: 16px 44px; font-size: 20px; font-weight: bold;
        background: #64c8ff; color: #111; border: none; border-radius: 10px;
        display: inline-block; cursor: pointer;
      ">Press SPACE to Begin</div>
    </div>
  `;
  document.body.appendChild(overlay);

  const begin = () => {
  overlay.remove();
  document.removeEventListener('keydown', spaceHandler, true);
  if (window.revealGame) window.revealGame();
};

  document.getElementById('ready-to-begin-btn').onclick = begin;

  // Capture-phase + stopImmediatePropagation, matching the pattern already
  // used elsewhere in this file — keeps this Space press from also reaching
  // voronoi.html's own keydown listener.
  const spaceHandler = (e) => {
    if (e.code !== 'Space') return;
    if (!document.getElementById('ready-to-begin-overlay')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    begin();
  };
  document.addEventListener('keydown', spaceHandler, true);
}

// Standalone edge-check that runs immediately after calibration completes
// (before parameter optimization). Validates that the participant can reach
// all 4 screen edges with their head movement.
// Returns Promise<boolean>: true if passed (or user chose "Continue Anyway"),
// false if user chose to recalibrate (page reloads).
async function runPostCalibrationEdgeCheck() {
  console.log("🎯 Starting post-calibration edge-check");

  const W = window.innerWidth;
  const H = window.innerHeight;
  const limitingDim = Math.min(W, H);
  const targetSize = Math.max(80, (10 / 100) * limitingDim);
  const r = targetSize / 2;
  const insetVert = 0.08;
  const insetHoriz = 0.04;
  const edges = [
    { id: 'top',    label: 'Top edge',    x: W / 2,                y: H * insetVert },
    { id: 'bottom', label: 'Bottom edge', x: W / 2,                y: H * (1 - insetVert) },
    { id: 'left',   label: 'Left edge',   x: W * insetHoriz,       y: H / 2 },
    { id: 'right',  label: 'Right edge',  x: W * (1 - insetHoriz), y: H / 2 }
  ];

  // Ensure the head-tracking cursor is visible above everything during edge-check
  const cursor = document.getElementById('head-cursor-clipped');
  if (cursor) cursor.style.zIndex = '200001';

  // Container overlay for edge-check UI
  let overlay = document.getElementById('edge-check-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'edge-check-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.92); z-index: 100000;
      display: flex; align-items: center; justify-content: center;
    `;
    document.body.appendChild(overlay);
  }

  // Intro screen
  await new Promise(resolve => {
    overlay.innerHTML = `
      <div style="background: rgba(30,30,40,0.98); border: 2px solid #64c8ff;
                  border-radius: 12px; padding: 36px; max-width: 600px;
                  text-align: center;">
        <h2 style="color: #64c8ff; margin: 0 0 8px;">Calibration Check</h2>
        <p style="color: #ccc; font-size: 15px; line-height: 1.55; margin: 14px 0;">
          Let's make sure your calibration covers the whole screen. You'll see
          a target near each edge in turn. Move your head until the cursor
          touches the target.
        </p>
        <p style="color: #aaa; font-size: 13px; margin: 18px 0 8px;">
          You have 12 seconds per edge. If you can't reach one, we'll offer
          to recalibrate.
        </p>
        <button id="edge-check-start" class="experiment-button start-button"
                style="padding: 14px 32px; font-size: 16px; font-weight: bold;
                       background: #64c8ff; color: #111; border: none; border-radius: 10px;
                       cursor: pointer;">
          Press Space to Begin
        </button>
      </div>`;
    const go = () => {
      document.removeEventListener('keydown', kh);
      resolve();
    };
    const kh = (e) => { if (e.code === 'Space') { e.preventDefault(); go(); } };
    document.addEventListener('keydown', kh);
    document.getElementById('edge-check-start').addEventListener('click', go);
  });

  const failed = [];
  const EDGE_TIMEOUT_MS = 12000;

  for (const edge of edges) {
    const passed = await _checkOneEdgeStandalone(overlay, edge, r, EDGE_TIMEOUT_MS);
    if (!passed) failed.push(edge);
  }

  if (failed.length === 0) {
    console.log("✅ Post-calibration edge-check passed");
    overlay.remove();
    _restoreCursorZIndex();
    return true;
  }

  // Show failure dialog
  return await _showEdgeCheckFailureStandalone(overlay, failed);
}

function _checkOneEdgeStandalone(overlay, edge, targetRadius, timeoutMs) {
  return new Promise(resolve => {
    overlay.innerHTML = `
      <div id="edge-target" style="
        position: fixed; left: ${edge.x - targetRadius}px; top: ${edge.y - targetRadius}px;
        width: ${targetRadius * 2}px; height: ${targetRadius * 2}px;
        border-radius: 50%; background: rgba(100, 255, 100, 0.55);
        border: 4px solid #64ff64; z-index: 100001; pointer-events: none;
        box-shadow: 0 0 30px rgba(100, 255, 100, 0.6);
      "></div>
      <div id="edge-label" style="
        position: fixed; left: 50%; top: 16px; transform: translateX(-50%);
        background: rgba(0,0,0,0.75); color: #fff; padding: 10px 20px;
        border-radius: 8px; font-size: 16px; z-index: 100002; pointer-events: none;
      ">
        Reach the <strong style="color: #64ff64;">${edge.label}</strong> target
        <span id="edge-timer" style="color: #ffaa00; margin-left: 12px;"></span>
      </div>`;

    const startTime = performance.now();
    let done = false;
    const timerEl = document.getElementById('edge-timer');

    const tick = () => {
      if (done) return;
      const elapsed = performance.now() - startTime;
      const remaining = Math.max(0, (timeoutMs - elapsed) / 1000);
      if (timerEl) timerEl.textContent = `(${remaining.toFixed(1)} s left)`;

      const cx = window.state?.cursorX;
      const cy = window.state?.cursorY;
      if (cx != null && cy != null) {
        const dist = Math.sqrt(Math.pow(cx - edge.x, 2) + Math.pow(cy - edge.y, 2));
        if (dist <= targetRadius) {
          done = true;
          console.log(`✅ Edge ${edge.id} reached at ${(elapsed / 1000).toFixed(1)} s`);
          resolve(true);
          return;
        }
      }
      if (elapsed >= timeoutMs) {
        done = true;
        console.warn(`⏱  Edge ${edge.id} timed out`);
        resolve(false);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function _showEdgeCheckFailureStandalone(overlay, failed) {
  return new Promise(resolve => {
    const list = failed.map(f => `<li>${f.label}</li>`).join('');
    overlay.innerHTML = `
      <div style="background: rgba(40,30,30,0.98); border: 2px solid #ff6464;
                  border-radius: 12px; padding: 36px; max-width: 600px;
                  text-align: center;">
        <h2 style="color: #ff6464; margin: 0 0 8px;">Calibration Issue Detected</h2>
        <p style="color: #ccc; font-size: 15px; line-height: 1.55; margin: 14px 0;">
          We couldn't reach the following ${failed.length === 1 ? 'edge' : 'edges'} with
          your current calibration:
        </p>
        <ul style="text-align: left; display: inline-block; color: #ffaa64;
                   font-size: 15px; margin: 8px auto 18px;">${list}</ul>
        <p style="color: #aaa; font-size: 13px; margin: 6px 0 22px;">
          Re-calibrating usually fixes this. You can also continue anyway if
          you'd like to see how the system behaves with this calibration.
        </p>
        <div style="display: flex; gap: 12px; justify-content: center;">
          <button id="edge-recalibrate" class="experiment-button"
                  style="padding: 12px 24px; font-size: 15px; font-weight: bold;
                         background: #ff6464; color: white; border: none;
                         border-radius: 8px; cursor: pointer;">
            Recalibrate
          </button>
          <button id="edge-continue" class="experiment-button"
                  style="padding: 12px 24px; font-size: 15px; background: #444;
                         color: #eee; border: none; border-radius: 8px; cursor: pointer;">
            Continue Anyway
          </button>
        </div>
      </div>`;

    document.getElementById('edge-recalibrate').addEventListener('click', () => {
      console.log("🔁 Participant chose to recalibrate");
      try { window.location.reload(); } catch (_) {}
      resolve(false);
    });

    document.getElementById('edge-continue').addEventListener('click', () => {
      console.log("⚠️ Participant chose to continue with suboptimal calibration");
      overlay.remove();
      _restoreCursorZIndex();
      resolve(true);
    });
  });
}

function _restoreCursorZIndex() {
  const cursor = document.getElementById('head-cursor-clipped');
  if (cursor) cursor.style.zIndex = '1000';
}


function startTracking() {
  console.log("🚀 startTracking() called");
  console.log("   - state.calibrationData exists:", !!state.calibrationData);
  console.log("   - state.calibrationData.cursorPositions:", state.calibrationData?.cursorPositions?.length || 0);
  console.log("   - state.transformationMatrices exists:", !!state.transformationMatrices);
  console.log("   - state.config:", state.config);
  
  // Set calibration source if not already set (means fresh calibration, not uploaded file)
  if (!state.calibrationSource) {
    state.calibrationSource = `Fresh calibration: ${new Date().toISOString()}`;
    console.log("📁 Calibration source:", state.calibrationSource);
  }
  
  // Set tracking state
  state.isTracking = true;
  
  // Show live rotation control if rotation was calibrated
  if (window.liveRotationControl) {
    window.liveRotationControl.show();
    
    // Re-detect available modes after a short delay to ensure everything is loaded
    setTimeout(() => {
      if (window.liveRotationControl.detectModes) {
        console.log("🔄 Re-detecting available rotation modes...");
        window.liveRotationControl.detectModes();
      }
    }, 500);
  }
  
  // Show Three.js 3D head visualization if rotation-only mode is enabled
  if (window.threeJSHeadViz) {
    console.log('🎨 Auto-showing Three.js head for rotation-only mode');
    window.threeJSHeadViz.show();
  }
  
  // Initialize tracking cursors
  initializeCursors();

  // Calculate metrics before mounting the component
  const metrics = forceCalculateAndDisplayMetrics();
  console.log("Pre-calculated metrics for tracking controls:", metrics);

  // Mount tracking controls
  if (window.React && window.ReactDOM && window.TrackingControls) {
  try {
    let controlsContainer = document.getElementById(
      "tracking-controls-container"
    );
    if (!controlsContainer) {
      controlsContainer = document.createElement("div");
      controlsContainer.id = "tracking-controls-container";
      document.body.appendChild(controlsContainer);
    }
    controlsContainer.innerHTML = "";
    
    // Store metrics in a global variable for the component to access
    window.preCalculatedMetrics = metrics;
    
    const root = ReactDOM.createRoot(controlsContainer);
    root.render(React.createElement(window.TrackingControls));
    console.log("Tracking controls mounted successfully");
    
    // Force update immediately and again after a delay
    updateTrackingControlsResiduals();
    
    setTimeout(() => {
      updateTrackingControlsResiduals();
      console.log("Updated tracking controls residuals after delay");
    }, 300);
  } catch (controlsError) {
    console.error("Error mounting tracking controls:", controlsError);
  }
} else {
  console.log("Skipping tracking-controls mount (React not loaded on this page)");
}

  // Hide the config screen (important for file upload flow)
  const configScreen = document.getElementById("config-screen");
  if (configScreen) {
    configScreen.classList.add("hidden");
    console.log("✅ Config screen hidden");
  }

  // Start cursor tracking
  console.log("🔧 About to call window.updateCursor");
  console.log("   - state.isTracking:", state.isTracking);
  console.log("   - state.lastLandmarks exists:", !!state.lastLandmarks);
  
  if (window.updateCursor && typeof window.updateCursor === 'function') {
    window.updateCursor();
    console.log("✅ Started cursor tracking via window.updateCursor()");
  } else {
    console.error("❌ window.updateCursor not available!");
  }
  
  // Update status with metrics if available
  // const statusText = metrics ? 
  //   `Tracking active (RMSE: ${metrics.rmse.toFixed(2)} px)` : 
  //   "Tracking active";
  // document.getElementById("status").textContent = statusText;
  
  // Also display residuals in the corner
  displayTrackingResiduals(true);
}
// Function to calculate residuals for rotation-only mode
function calculateRotationOnlyResiduals() {
  try {
    if (!state.transformationMatrices.rotationOnly || 
        !state.calibrationData.rotationOnlyPoints ||
        !state.calibrationData.cursorPositions) {
      return null;
    }
    
    const rotationPoints = state.calibrationData.rotationOnlyPoints;
    const cursorPositions = state.calibrationData.cursorPositions;
    const matrix = state.transformationMatrices.rotationOnly;
    
    let totalSquaredError = 0;
    let totalError = 0;
    const residuals = [];
    
    for (let i = 0; i < rotationPoints.length && i < cursorPositions.length; i++) {
      try {
        const P = math.matrix(rotationPoints[i]);
        const B = math.matrix(matrix);
        const Q = math.multiply(B, P);
        const predictedPos = Q.toArray();
        
        const targetX = cursorPositions[i][0][0];
        const targetY = cursorPositions[i][1][0];
        const predictedX = predictedPos[0][0];
        const predictedY = predictedPos[1][0];
        
        const dx = predictedX - targetX;
        const dy = predictedY - targetY;
        const error = Math.sqrt(dx * dx + dy * dy);
        
        totalSquaredError += error * error;
        totalError += error;
        
        residuals.push({
          pointNumber: i + 1,
          targetX,
          targetY,
          predictedX,
          predictedY,
          error
        });
      } catch (e) {
        console.warn(`Error calculating rotation residual for point ${i}:`, e);
      }
    }
    
    if (residuals.length === 0) return null;
    
    const rmse = Math.sqrt(totalSquaredError / residuals.length);
    const meanError = totalError / residuals.length;
    const maxError = Math.max(...residuals.map(r => r.error));
    
    console.log("=== Rotation-Only Residuals Analysis ===");
    console.log(`RMSE: ${rmse.toFixed(2)} pixels`);
    console.log(`Mean Error: ${meanError.toFixed(2)} pixels`);
    console.log(`Max Error: ${maxError.toFixed(2)} pixels`);
    
    return {
      residuals,
      rmse,
      meanError,
      maxError,
      totalError
    };
  } catch (error) {
    console.error("Error calculating rotation-only residuals:", error);
    return null;
  }
}

// Make the function globally available
window.calculateRotationOnlyResiduals = calculateRotationOnlyResiduals;


// Update the robustCalculateResiduals function to respect the current configuration
function robustCalculateResiduals() {
  try {
    console.log("Attempting robust calculation of residuals with current config:", 
                state.config.landmarkPoints, state.config.coordinateSystem);
    
    // Check if we have the necessary data structures
    if (!state.calibrationData || 
        !state.calibrationData.cursorPositions || 
        !state.calibrationData.cursorPositions.length) {
      console.warn("Missing calibration cursor positions");
      return getDefaultMetrics();
    }
    
    // Try the original calculation
    const originalResult = calculateRotationOnlyResiduals();
    if (originalResult) {
      return originalResult;
    }
    
    // If that fails, return default values based on current configuration
    console.log("Using default metrics values for", state.config.landmarkPoints, "points");
    return getDefaultMetrics();
  } catch (error) {
    console.error("Error in robust residual calculation:", error);
    // Return default values on error
    return getDefaultMetrics();
  }
}

// Helper function: returns null when real metrics can't be calculated,
// so callers can distinguish "no data" from actual calibration results.
function getDefaultMetrics() {
  return null;
}


// Make the new function globally available
window.getDefaultMetrics = getDefaultMetrics;

// Update forceCalculateAndDisplayMetrics to use the robust calculation
function forceCalculateAndDisplayMetrics() {
  try {
    console.log("Forcing calculation and display of metrics...");
    
    // Use window.robustCalculateResiduals which may be patched by database.js for uploaded files
    const residualAnalysis = window.robustCalculateResiduals ? window.robustCalculateResiduals() : robustCalculateResiduals();
    
    console.log("Calculated metrics:", residualAnalysis);
    
    // Update DOM elements directly
    updateTrackingControlsElements(residualAnalysis);
    
    // Also try React update
    if (window.updateTrackingControlsMetrics) {
      window.updateTrackingControlsMetrics();
    }
    
    // Store for future use
    window.preCalculatedMetrics = residualAnalysis;
    
    return residualAnalysis;
  } catch (error) {
    console.error("Error forcing metrics calculation:", error);
    return null;
  }
}

// Make the new function globally available
window.robustCalculateResiduals = robustCalculateResiduals;


// Update the displayTrackingResiduals function to accept a forceUpdate parameter
function displayTrackingResiduals(forceUpdate = false) {
  try {
    // Calculate residuals
    const residualAnalysis = calculateRotationOnlyResiduals();
    
    if (!residualAnalysis) {
      console.warn("Could not calculate residuals");
      return;
    }
    
    // Create or update residual display
    let residualDisplay = document.getElementById("residual-display");
    if (!residualDisplay || forceUpdate) {
      if (!residualDisplay) {
        residualDisplay = document.createElement("div");
        residualDisplay.id = "residual-display";
        residualDisplay.style.position = "fixed";
        residualDisplay.style.bottom = "10px";
        residualDisplay.style.right = "10px";
        residualDisplay.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
        residualDisplay.style.color = "white";
        residualDisplay.style.padding = "10px";
        residualDisplay.style.borderRadius = "5px";
        residualDisplay.style.fontFamily = "monospace";
        residualDisplay.style.fontSize = "14px";
        residualDisplay.style.zIndex = "1001";
        document.body.appendChild(residualDisplay);
      }
      
      // Format the residual information
      // const activeConfig = state.config.landmarkPoints === "3" ? "3-point" : "6-point";
      // const html = `
      //   <div style="font-weight: bold; margin-bottom: 5px;">Calibration Quality (${activeConfig}):</div>
      //   <div>RMSE: ${residualAnalysis.rmse.toFixed(2)} px</div>
      //   <div>Mean Error: ${residualAnalysis.meanError.toFixed(2)} px</div>
      //   <div>Max Error: ${residualAnalysis.maxError.toFixed(2)} px</div>
      // `;
      
      // residualDisplay.innerHTML = html;
      
      // Also update the status message
      // const statusElem = document.getElementById("status");
      // if (statusElem) {
      //   statusElem.textContent = `Tracking active using ${state.config.coordinateSystem.toUpperCase()} mode with ${state.config.landmarkPoints}-point tracking (RMSE: ${residualAnalysis.rmse.toFixed(2)} px)`;
      // }
    }
    
    return residualAnalysis;
  } catch (error) {
    console.error("Error displaying residuals:", error);
  }
}


// Make the function globally available
window.setupTracking = setupTracking;

// Update this function to update the tracking controls with current residuals
function updateTrackingControlsResiduals() {
  try {
    // Use patched version if available (database.js patches it for uploaded files)
    const calcFn = window.robustCalculateResiduals || calculateRotationOnlyResiduals;
    const residualAnalysis = calcFn();
    if (!residualAnalysis) {
      console.warn("Could not calculate residuals for tracking controls");
      return;
    }
    
    // First try to update via React component's state if available
    if (window.updateTrackingControlsMetrics) {
      window.updateTrackingControlsMetrics();
      console.log("Updated tracking controls via React state");
    } else {
      console.log("React update function not available, updating DOM directly");
      
      // Find the residual display elements in the tracking controls
      const rmseElement = document.querySelector('#tracking-controls-container .rmse-value');
      const meanErrorElement = document.querySelector('#tracking-controls-container .mean-error-value');
      const maxErrorElement = document.querySelector('#tracking-controls-container .max-error-value');
      
      // Update the values if elements exist
      if (rmseElement) {
        rmseElement.textContent = `RMSE: ${residualAnalysis.rmse.toFixed(2)} px`;
      }
      
      if (meanErrorElement) {
        meanErrorElement.textContent = `Mean Error: ${residualAnalysis.meanError.toFixed(2)} px`;
      }
      
      if (maxErrorElement) {
        maxErrorElement.textContent = `Max Error: ${residualAnalysis.maxError.toFixed(2)} px`;
      }
    }
    
    // Also update the status message
    // const statusElem = document.getElementById("status");
    // if (statusElem) {
    //   statusElem.textContent = `Tracking active using ${state.config.coordinateSystem.toUpperCase()} mode with ${state.config.landmarkPoints}-point tracking (RMSE: ${residualAnalysis.rmse.toFixed(2)} px)`;
    // }
    
    return residualAnalysis;
  } catch (error) {
    console.error("Error updating tracking controls residuals:", error);
  }
}

// Make the new function globally available
window.updateTrackingControlsResiduals = updateTrackingControlsResiduals;

// Enhanced function to ensure metrics are displayed
function ensureMetricsDisplayed() {
  console.log("Ensuring metrics are displayed with actual values");
  
  // Immediately calculate and try to display metrics
  const metrics = forceCalculateAndDisplayMetrics();
  
  if (!metrics) {
    console.warn("No metrics available on first try, will retry");
  } else {
    console.log("Got metrics on first try:", metrics);
    
    // Direct DOM updates for immediate visibility
    document.querySelectorAll('#tracking-controls-container .rmse-value').forEach(el => {
      el.textContent = `RMSE: ${metrics.rmse.toFixed(2)} px`;
    });
    
    document.querySelectorAll('#tracking-controls-container .mean-error-value').forEach(el => {
      el.textContent = `Mean Error: ${metrics.meanError.toFixed(2)} px`;
    });
    
    document.querySelectorAll('#tracking-controls-container .max-error-value').forEach(el => {
      el.textContent = `Max Error: ${metrics.maxError.toFixed(2)} px`;
    });
  }
  
  // Set up a recurring check with more frequent attempts
  let attempts = 0;
  const maxAttempts = 20; // Increase max attempts
  const checkInterval = setInterval(() => {
    attempts++;
    
    // Check if "Calculating..." is still showing in any of the metrics
    const metricsElements = document.querySelectorAll('#tracking-controls-container .rmse-value, #tracking-controls-container .mean-error-value, #tracking-controls-container .max-error-value');
    
    let stillCalculating = false;
    metricsElements.forEach(el => {
      if (el.textContent.includes('Calculating')) {
        stillCalculating = true;
      }
    });
    
    if (stillCalculating && attempts < maxAttempts) {
      console.log(`Metrics still showing 'Calculating...' - attempt ${attempts}`);
      
      // Try to recalculate and update
      const newMetrics = forceCalculateAndDisplayMetrics();
      if (newMetrics) {
        console.log("Got new metrics:", newMetrics);
        
        // Direct DOM updates for each element
        document.querySelectorAll('#tracking-controls-container .rmse-value').forEach(el => {
          el.textContent = `RMSE: ${newMetrics.rmse.toFixed(2)} px`;
        });
        
        document.querySelectorAll('#tracking-controls-container .mean-error-value').forEach(el => {
          el.textContent = `Mean Error: ${newMetrics.meanError.toFixed(2)} px`;
        });
        
        document.querySelectorAll('#tracking-controls-container .max-error-value').forEach(el => {
          el.textContent = `Max Error: ${newMetrics.maxError.toFixed(2)} px`;
        });
        
        // Also update via React if possible
        if (window.updateTrackingControlsMetrics) {
          window.updateTrackingControlsMetrics();
        }
      }
    } else {
      // Either success or we've reached max attempts
      clearInterval(checkInterval);
      console.log(`Finished metrics display check (${stillCalculating ? 'failed' : 'success'})`);
      
      // If we still failed after max attempts, try one last approach - force a React re-render
      if (stillCalculating) {
        console.log("Still showing 'Calculating...' after max attempts, trying last resort approach");
        
        try {
          // Force a complete remount of the tracking controls
          const container = document.getElementById('tracking-controls-container');
          if (container) {
            const calcFn = window.robustCalculateResiduals || calculateRotationOnlyResiduals;
            const metrics = calcFn();
            window.preCalculatedMetrics = metrics;
            
            // Force re-render
            container.innerHTML = '';
            const root = ReactDOM.createRoot(container);
            root.render(React.createElement(window.TrackingControls));
            console.log("Forced complete re-render of tracking controls");
          }
        } catch (e) {
          console.error("Last resort approach failed:", e);
        }
      }
    }
  }, 250); // Check more frequently
}

// Make sure this function is globally available
window.ensureMetricsDisplayed = ensureMetricsDisplayed;

// Add event listeners to detect when calibration file might be loaded
document.addEventListener('DOMContentLoaded', function() {
  // Watch for tracking controls being added to the DOM
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node.id === 'tracking-controls-container' || 
              node.querySelector && node.querySelector('#tracking-controls-container')) {
            console.log("Tracking controls added to DOM - ensuring metrics display");
            ensureMetricsDisplayed();
          }
        }
      }
    });
  });
  
  // Observe the entire document
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Also check for any buttons that might trigger file loading
  document.body.addEventListener('click', function(e) {
    if (e.target.closest('button') && 
        (e.target.textContent.includes('Load') || 
         e.target.textContent.includes('Upload') || 
         e.target.textContent.includes('Import'))) {
      console.log("Detected potential file loading button click");
      // Give time for the file to load
      setTimeout(ensureMetricsDisplayed, 1000);
    }
  });
});

// Helper function to directly update DOM elements with metrics
function updateTrackingControlsElements(metrics) {
  if (!metrics) return;
  
  // Find the elements
  const rmseElement = document.querySelector('#tracking-controls-container .rmse-value');
  const meanErrorElement = document.querySelector('#tracking-controls-container .mean-error-value');
  const maxErrorElement = document.querySelector('#tracking-controls-container .max-error-value');
  
  // Update if found
  if (rmseElement) {
    rmseElement.textContent = `RMSE: ${metrics.rmse.toFixed(2)} px`;
    console.log("Updated RMSE element to:", rmseElement.textContent);
  } else {
    console.warn("RMSE element not found");
  }
  
  if (meanErrorElement) {
    meanErrorElement.textContent = `Mean Error: ${metrics.meanError.toFixed(2)} px`;
  }
  
  if (maxErrorElement) {
    maxErrorElement.textContent = `Max Error: ${metrics.maxError.toFixed(2)} px`;
  }
  
  console.log("Updated tracking controls DOM elements with metrics");
}

// Make these functions globally available
window.updateTrackingControlsElements = updateTrackingControlsElements;
window.forceCalculateAndDisplayMetrics = forceCalculateAndDisplayMetrics;

function showPredictedPositions() {
  // Create visualization container
  const visualizationContainer = document.createElement("div");
  visualizationContainer.id = "prediction-visualization";
  visualizationContainer.style.position = "fixed";
  visualizationContainer.style.top = "0";
  visualizationContainer.style.left = "0";
  visualizationContainer.style.width = "100%";
  visualizationContainer.style.height = "100%";
  visualizationContainer.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
  visualizationContainer.style.zIndex = "1000";
  visualizationContainer.style.overflow = "auto";

  // Simple header — no toggle buttons needed, only one config exists
  const header = document.createElement("div");
  header.style.position = "fixed";
  header.style.top = "10px";
  header.style.left = "0";
  header.style.width = "100%";
  header.style.padding = "10px";
  header.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
  header.style.zIndex = "1001";
  header.style.textAlign = "center";
  header.style.color = "white";
  header.style.fontSize = "13px";
  header.textContent = "White dots = Actual Points • Orange dots/lines = Rotation-Only Predictions";

  visualizationContainer.appendChild(header);

  // Close button (fixed at bottom)
  const closeButton = document.createElement("button");
  closeButton.textContent = "Close & Start Tracking";
  closeButton.style.padding = "10px 15px";
  closeButton.style.backgroundColor = "rgba(33, 150, 243, 0.7)";
  closeButton.style.border = "none";
  closeButton.style.borderRadius = "5px";
  closeButton.style.color = "white";
  closeButton.style.cursor = "pointer";
  closeButton.style.fontWeight = "bold";
  closeButton.style.position = "fixed";
  closeButton.style.bottom = "20px";
  closeButton.style.left = "50%";
  closeButton.style.transform = "translateX(-50%)";
  closeButton.style.zIndex = "1003";
  closeButton.style.boxShadow = "0 2px 5px rgba(0,0,0,0.3)";
  closeButton.onclick = () => {
    document.body.removeChild(visualizationContainer);
    startTracking();
  };

  visualizationContainer.appendChild(closeButton);

  // Draw actual calibration points and rotation-only predictions
  drawPredictionVisualization(visualizationContainer);

  document.body.appendChild(visualizationContainer);
}

function drawPredictionVisualization(container) {
  // Configuration parameters
  const pointSize = 8;
  const predictionSize = 4;
  
  // Make sure we have calibration data
  if (!state.calibrationData || !state.calibrationData.cursorPositions) {
    const errorMsg = document.createElement("div");
    errorMsg.textContent = "No calibration data available";
    errorMsg.style.color = "white";
    errorMsg.style.textAlign = "center";
    errorMsg.style.marginTop = "100px";
    container.appendChild(errorMsg);
    return;
  }
  
  // Get actual calibration points
  const actualPoints = state.calibrationData.cursorPositions.map(pos => ({
    x: pos[0][0], 
    y: pos[1][0]
  }));
  
  // Log available matrices at start
  console.log("Available transformation matrices:", {
    threePoint2d: !!state.transformationMatrices.threePoint2d,
    sixPoint2d: !!state.transformationMatrices.sixPoint2d,
    threePoint3d: !!state.transformationMatrices.threePoint3d,
    sixPoint3d: !!state.transformationMatrices.sixPoint3d,
    rotationOnly: !!state.transformationMatrices.rotationOnly
  });

  // Function to predict positions using different configurations
  const getPredictedPositions = (point, landmarks, dimensions) => {
    // Store original config
    const originalConfig = { ...state.config };
    
    try {
      // Set configuration temporarily
      state.config.landmarkPoints = landmarks;
      state.config.coordinateSystem = dimensions;
      
      // Get appropriate landmarks for this point
      const pointIndex = actualPoints.findIndex(p => p.x === point.x && p.y === point.y);
      if (pointIndex === -1) {
        console.warn(`Point not found for ${dimensions} ${landmarks}-point prediction`);
        return null;
      }
      
      // Get landmark vector based on configuration
      let landmarkData;
      if (dimensions === "2d") {
        // For 2D, extract only X, Y components from our 3D data
        const sourceData = landmarks === "3" ? 
          state.calibrationData.landmarkPoints3[pointIndex] : 
          state.calibrationData.landmarkPoints6[pointIndex];
        
        if (!sourceData || !sourceData.length) {
          console.warn(`No source data for ${dimensions} ${landmarks}-point at index ${pointIndex}`);
          return null;
        }
        
        const numLandmarks = landmarks === "3" ? 3 : 6;
        landmarkData = [];
        
        // CRITICAL: Add bias term first (matrices were trained with bias)
        landmarkData.push([1.0]);
        
        for (let i = 0; i < numLandmarks; i++) {
          // For each landmark, extract only X, Y and their quadratic terms
          const baseIndex = i * 6;
          if (baseIndex + 4 >= sourceData.length) {
            console.warn(`Source data too short for ${dimensions} ${landmarks}-point: need index ${baseIndex + 4}, have ${sourceData.length}`);
            return null;
          }
          landmarkData.push([sourceData[baseIndex][0]]);     // x
          landmarkData.push([sourceData[baseIndex + 1][0]]); // y
          landmarkData.push([sourceData[baseIndex + 3][0]]); // x²
          landmarkData.push([sourceData[baseIndex + 4][0]]); // y²
        }
        
        // DO NOT add rotation terms for 2D predictions - they're not in the 2D matrix
        // The 2D matrices were calculated without rotation terms
      } else {
        // For 3D, get landmark data (strip rotation terms if present)
        const sourceData3D = landmarks === "3" ? 
          state.calibrationData.landmarkPoints3[pointIndex] : 
          state.calibrationData.landmarkPoints6[pointIndex];
          
        if (!sourceData3D || !sourceData3D.length) {
          console.warn(`No landmark data for ${dimensions} ${landmarks}-point at index ${pointIndex}`);
          return null;
        }
        
        // Strip rotation terms - 3D matrices use only landmark terms (x, y, z, x², y², z² per landmark)
        const numLandmarks3D = landmarks === "3" ? 3 : 6;
        const expectedLandmarkTerms = numLandmarks3D * 6;
        
        // CRITICAL: Add bias term first (matrices were trained with bias)
        landmarkData = [[1.0]];
        
        // Add landmark data (without rotation terms)
        const landmarkOnly = sourceData3D.length > expectedLandmarkTerms 
          ? sourceData3D.slice(0, expectedLandmarkTerms)
          : sourceData3D;
        
        landmarkData = landmarkData.concat(landmarkOnly);
      }
      
      // Get appropriate matrix
      let matrix;
      let matrixName;
      if (dimensions === "2d") {
        if (landmarks === "3") {
          matrix = state.transformationMatrices.threePoint2d;
          matrixName = "threePoint2d";
        } else {
          matrix = state.transformationMatrices.sixPoint2d;
          matrixName = "sixPoint2d";
        }
      } else {
        if (landmarks === "3") {
          matrix = state.transformationMatrices.threePoint3d;
          matrixName = "threePoint3d";
        } else {
          matrix = state.transformationMatrices.sixPoint3d;
          matrixName = "sixPoint3d";
        }
      }
      
      if (!matrix) {
        if (pointIndex === 0) {
          console.warn(`Matrix ${matrixName} not available for ${dimensions} ${landmarks}-point prediction`);
        }
        return null;
      }
      
      // Verify dimensions match
      const matrixCols = matrix[0] ? matrix[0].length : 0;
      const vectorRows = landmarkData.length;
      
      if (matrixCols !== vectorRows) {
        if (pointIndex === 0) {
          console.warn(`Dimension mismatch for ${dimensions} ${landmarks}-point: matrix expects ${matrixCols} cols, vector has ${vectorRows} rows`);
        }
        return null;
      }
      
      // Calculate predicted position
      const P = math.matrix(landmarkData);
      const B = math.matrix(matrix);
      const Q = math.multiply(B, P);
      const position = Q.toArray();
      
      return {
        x: position[0][0],
        y: position[1][0]
      };
    } catch (error) {
      console.error(`Error calculating prediction for ${dimensions} ${landmarks}-point:`, error);
      return null;
    } finally {
      // Restore original config
      state.config = { ...originalConfig };
    }
  };
  
  // Function to predict positions using rotation-only mode
  const getRotationOnlyPrediction = (pointIndex) => {
    try {
      // Check if rotation-only matrix and data are available
      if (!state.transformationMatrices.rotationOnly || 
          !state.calibrationData.rotationOnlyPoints ||
          !state.calibrationData.rotationOnlyPoints[pointIndex]) {
        return null;
      }
      
      const rotationData = state.calibrationData.rotationOnlyPoints[pointIndex];
      const matrix = state.transformationMatrices.rotationOnly;
      
      // Calculate predicted position
      const P = math.matrix(rotationData);
      const B = math.matrix(matrix);
      const Q = math.multiply(B, P);
      const position = Q.toArray();
      
      return {
        x: position[0][0],
        y: position[1][0]
      };
    } catch (error) {
      console.error(`Error calculating rotation-only prediction for point ${pointIndex}:`, error);
      return null;
    }
  };
  
  // Draw actual points and their predictions
  actualPoints.forEach((point, index) => {
    // Draw actual point
    const actualPoint = document.createElement("div");
    actualPoint.style.position = "absolute";
    actualPoint.style.left = `${point.x}px`;
    actualPoint.style.top = `${point.y}px`;
    actualPoint.style.width = `${pointSize}px`;
    actualPoint.style.height = `${pointSize}px`;
    actualPoint.style.backgroundColor = "white";
    actualPoint.style.borderRadius = "50%";
    actualPoint.style.transform = "translate(-50%, -50%)";
    actualPoint.style.zIndex = "1002";
    
    // Add point number
    const pointLabel = document.createElement("div");
    pointLabel.textContent = (index + 1).toString();
    pointLabel.style.position = "absolute";
    pointLabel.style.color = "white";
    pointLabel.style.fontSize = "10px";
    pointLabel.style.top = "10px";
    pointLabel.style.left = "10px";
    actualPoint.appendChild(pointLabel);
    
    container.appendChild(actualPoint);
    
    // Get and draw predicted positions for standard configurations
    const configurations = [
      { landmarks: "3", dimensions: "2d", color: "red", cssClass: "prediction-2d-3" },
      { landmarks: "6", dimensions: "2d", color: "green", cssClass: "prediction-2d-6" },
      { landmarks: "3", dimensions: "3d", color: "blue", cssClass: "prediction-3d-3" },
      { landmarks: "6", dimensions: "3d", color: "purple", cssClass: "prediction-3d-6" }
    ];
    
    configurations.forEach(config => {
      const prediction = getPredictedPositions(point, config.landmarks, config.dimensions);
      
      if (prediction) {
        const predictionPoint = document.createElement("div");
        predictionPoint.className = config.cssClass;
        predictionPoint.style.position = "absolute";
        predictionPoint.style.left = `${prediction.x}px`;
        predictionPoint.style.top = `${prediction.y}px`;
        predictionPoint.style.width = `${predictionSize}px`;
        predictionPoint.style.height = `${predictionSize}px`;
        predictionPoint.style.backgroundColor = config.color;
        predictionPoint.style.borderRadius = "50%";
        predictionPoint.style.transform = "translate(-50%, -50%)";
        predictionPoint.style.zIndex = "1001";
        
        container.appendChild(predictionPoint);
        
        // Draw line connecting actual point to prediction
        const line = document.createElement("div");
        line.className = config.cssClass;
        line.style.position = "absolute";
        line.style.zIndex = "1000";
        
        // Line geometry calculations
        const dx = prediction.x - point.x;
        const dy = prediction.y - point.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        line.style.width = `${length}px`;
        line.style.height = "1px";
        line.style.backgroundColor = config.color;
        line.style.opacity = "0.4";
        line.style.left = `${point.x}px`;
        line.style.top = `${point.y}px`;
        line.style.transformOrigin = "left center";
        line.style.transform = `rotate(${angle}deg)`;
        
        container.appendChild(line);
      }
    });
    
    // Draw rotation-only prediction
    const rotationPrediction = getRotationOnlyPrediction(index);
    if (rotationPrediction) {
      const predictionPoint = document.createElement("div");
      predictionPoint.className = "prediction-rotation";
      predictionPoint.style.position = "absolute";
      predictionPoint.style.left = `${rotationPrediction.x}px`;
      predictionPoint.style.top = `${rotationPrediction.y}px`;
      predictionPoint.style.width = `${predictionSize}px`;
      predictionPoint.style.height = `${predictionSize}px`;
      predictionPoint.style.backgroundColor = "orange";
      predictionPoint.style.borderRadius = "50%";
      predictionPoint.style.transform = "translate(-50%, -50%)";
      predictionPoint.style.zIndex = "1001";
      
      container.appendChild(predictionPoint);
      
      // Draw line connecting actual point to rotation prediction
      const line = document.createElement("div");
      line.className = "prediction-rotation";
      line.style.position = "absolute";
      line.style.zIndex = "1000";
      
      const dx = rotationPrediction.x - point.x;
      const dy = rotationPrediction.y - point.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      
      line.style.width = `${length}px`;
      line.style.height = "1px";
      line.style.backgroundColor = "orange";
      line.style.opacity = "0.4";
      line.style.left = `${point.x}px`;
      line.style.top = `${point.y}px`;
      line.style.transformOrigin = "left center";
      line.style.transform = `rotate(${angle}deg)`;
      
      container.appendChild(line);
    }
  });
  
  // Add error statistics table
  createErrorStatisticsTable(container);
}

function createErrorStatisticsTable(container) {
  // Create table container
  const tableContainer = document.createElement("div");
  tableContainer.style.position = "fixed";
  tableContainer.style.bottom = "70px";
  tableContainer.style.right = "20px";
  tableContainer.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
  tableContainer.style.padding = "15px";
  tableContainer.style.borderRadius = "5px";
  tableContainer.style.zIndex = "1002";
  tableContainer.style.maxHeight = "300px";
  tableContainer.style.overflowY = "auto";

  // Create table
  const table = document.createElement("table");
  table.style.color = "white";
  table.style.borderCollapse = "collapse";

  // Create header row
  const headerRow = document.createElement("tr");
  ["Configuration", "RMSE (px)", "Mean Error (px)"].forEach(text => {
    const th = document.createElement("th");
    th.textContent = text;
    th.style.padding = "5px 10px";
    th.style.textAlign = "left";
    th.style.borderBottom = "1px solid #444";
    headerRow.appendChild(th);
  });
  table.appendChild(headerRow);

  // Rotation-only row — the only real config in this design
  if (state.transformationMatrices.rotationOnly &&
      state.calibrationData.rotationOnlyPoints &&
      state.calibrationData.rotationOnlyPoints.length > 0) {

    try {
      const rotationResiduals = calculateRotationOnlyResiduals();

      if (rotationResiduals) {
        const dataRow = document.createElement("tr");

        const configCell = document.createElement("td");
        configCell.style.padding = "5px 10px";
        configCell.style.borderBottom = "1px solid #444";

        const colorBox = document.createElement("span");
        colorBox.style.display = "inline-block";
        colorBox.style.width = "10px";
        colorBox.style.height = "10px";
        colorBox.style.backgroundColor = "orange";
        colorBox.style.marginRight = "8px";
        colorBox.style.borderRadius = "50%";

        configCell.appendChild(colorBox);
        configCell.appendChild(document.createTextNode("Rotation Only"));
        dataRow.appendChild(configCell);

        const rmseCell = document.createElement("td");
        rmseCell.textContent = rotationResiduals.rmse.toFixed(2);
        rmseCell.style.padding = "5px 10px";
        rmseCell.style.borderBottom = "1px solid #444";
        dataRow.appendChild(rmseCell);

        const meanCell = document.createElement("td");
        meanCell.textContent = rotationResiduals.meanError.toFixed(2);
        meanCell.style.padding = "5px 10px";
        meanCell.style.borderBottom = "1px solid #444";
        dataRow.appendChild(meanCell);

        table.appendChild(dataRow);
      }
    } catch (error) {
      console.error("Error calculating rotation-only residuals:", error);
    }
  }

  tableContainer.appendChild(table);
  container.appendChild(tableContainer);
}


// Add a more aggressive approach to catch file uploads
function setupFileUploadHandlers() {
  console.log("Setting up file upload handlers");
  
  // Find any file input elements
  const fileInputs = document.querySelectorAll('input[type="file"]');
  fileInputs.forEach(input => {
    input.addEventListener('change', () => {
      console.log("File input changed, scheduling metrics update");
      // Schedule multiple attempts with increasing delays
      setTimeout(ensureMetricsDisplayed, 500);
      setTimeout(ensureMetricsDisplayed, 1500);
      setTimeout(ensureMetricsDisplayed, 3000);
    });
  });
  
  // Watch for any file drag-and-drop events
  document.addEventListener('drop', () => {
    console.log("Drop event detected, scheduling metrics update");
    setTimeout(ensureMetricsDisplayed, 1000);
    setTimeout(ensureMetricsDisplayed, 2000);
  });
  
  // Also check for any "Start Tracking" buttons that might appear after file load
  document.addEventListener('click', (e) => {
    if (e.target.textContent === "Start Tracking" || 
        e.target.textContent === "Track" ||
        e.target.textContent.includes("Track")) {
      console.log("Start Tracking button clicked");
      setTimeout(ensureMetricsDisplayed, 500);
      setTimeout(ensureMetricsDisplayed, 1500);
    }
  });
}

// Call this function when the document is ready
document.addEventListener('DOMContentLoaded', setupFileUploadHandlers);
