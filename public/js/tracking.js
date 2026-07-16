// tracking.js
function createReferenceGrid() {
  const gridContainer = document.createElement("div");
  gridContainer.id = "reference-grid";
  gridContainer.style.position = "fixed";
  gridContainer.style.top = "0";
  gridContainer.style.left = "0";
  gridContainer.style.width = "100%";
  gridContainer.style.height = "100%";
  gridContainer.style.pointerEvents = "none";
  gridContainer.style.zIndex = "998";

  const rows = 5;
  const cols = 7;
  const circleSize = 40;

  // Add margins to keep circles fully visible
  const margin = circleSize;

  // Calculate usable space
  const usableWidth = window.innerWidth - 2 * margin;
  const usableHeight = window.innerHeight - 2 * margin;

  // Calculate spacing between circles
  const spacingX = usableWidth / (cols - 1);
  const spacingY = usableHeight / (rows - 1);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const circle = document.createElement("div");
      circle.style.position = "absolute";
      circle.style.width = `${circleSize}px`;
      circle.style.height = `${circleSize}px`;
      circle.style.borderRadius = "50%";
      circle.style.border = "2px solid #333333";
      circle.style.left = `${margin + spacingX * col - circleSize / 2}px`;
      circle.style.top = `${margin + spacingY * row - circleSize / 2}px`;
      gridContainer.appendChild(circle);
    }
  }

  document.body.appendChild(gridContainer);
}

function updateCursor() {
  if (state.isTracking && state.lastLandmarks) {
    try {
      // Get current landmark configuration
      const landmarks = state.lastLandmarks;

      // Log at start (once per 60 frames)
      if (!state._trackingFrameCount) state._trackingFrameCount = 0;
      state._trackingFrameCount++;
      if (state._trackingFrameCount === 1) {
        console.log("🚀 updateCursor START - First frame");
        console.log("   - isTracking:", state.isTracking);
        console.log("   - useRotation:", state.config.useRotation);
        console.log("   - rotationOnlyMode:", state.config.rotationOnlyMode);
        console.log("   - estimateHeadPose available:", !!window.estimateHeadPose);
      }
      
      // Get current tracking mode
      // Rotation-only tracking: estimate head pose from 3-point landmarks
      {
        const rotationOnlyMatrix = state.transformationMatrices.rotationOnly;
        
        if (!rotationOnlyMatrix) {
          if (state._trackingFrameCount % 60 === 0) {
            console.warn("⚠️ Rotation-only mode active but no rotation-only matrix available");
          }
          requestAnimationFrame(updateCursor);
          return;
        }
        
        if (!window.estimateHeadPose) {
          if (state._trackingFrameCount % 60 === 0) {
            console.warn("⚠️ Head pose estimation not available");
          }   
          requestAnimationFrame(updateCursor);
          return;
        }
        
        // Get head pose
        const calibrationWidth = state.calibrationData.calibrationWidth || window.innerWidth;
        const calibrationHeight = state.calibrationData.calibrationHeight || window.innerHeight;
        const headPose = estimateHeadPose(landmarks, calibrationWidth, calibrationHeight);
        
        // ARCHITECTURE FIX: Use raw angles directly (no pre-smoothing)
        // Smoothing is handled by One Euro/Exponential filter on cursor position
        // This makes rotation-only consistent with position-based tracking
        const angles = headPose ? headPose.angles : (state.lastRawAngles || { yaw: 0, pitch: 0, roll: 0 });
        
        // Store last good angles for fallback
        if (headPose && headPose.angles) {
          state.lastRawAngles = headPose.angles;
        }
        
        // Update live angles display
        if (window.liveRotationControl) {
          window.liveRotationControl.updateAngles(angles);
        }
        
        // Update Three.js 3D head visualization
        if (window.threeJSHeadViz) {
          window.threeJSHeadViz.updateAngles(angles);
        }
        
        // Create rotation-only vector (4 features: Bias, yaw, pitch, roll)
        const DEG2RAD = Math.PI / 180;
        const ANGLE_SCALE = 1000; // Match calibration scaling
        
        // Apply same rotation gain as calibration (screen-size adaptive)
        const screenWidth = state.calibrationData.calibrationWidth || window.innerWidth;
        const ROTATION_GAIN = Math.min(4.0, Math.max(1.0, (screenWidth / 1920) * 1.5));
        
        const yaw = angles.yaw * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN;
        const pitch = angles.pitch * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN;
        const roll = angles.roll * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN;
        
        const rotationVector = [
          [1.0], // Bias term
          [yaw],
          [pitch],
          [roll]
        ];
        
        // Log periodically with cursor position
        if (state._trackingFrameCount % 60 === 0) {
          console.log("🔬 Rotation-only tracking (raw angles):", {
            yaw: angles.yaw.toFixed(1) + '°',
            pitch: angles.pitch.toFixed(1) + '°',
            roll: angles.roll.toFixed(1) + '°',
            gain: ROTATION_GAIN.toFixed(2) + 'x',
            cursorX: state.cursorX ? state.cursorX.toFixed(0) : 'N/A',
            cursorY: state.cursorY ? state.cursorY.toFixed(0) : 'N/A',
            matrixSize: math.size(math.matrix(rotationOnlyMatrix)).valueOf()
          });
        }
        
        // Calculate cursor position using rotation-only matrix
        try {
          const P = math.matrix(rotationVector);
          const B = math.matrix(rotationOnlyMatrix);
          const Q = math.multiply(B, P);
          const position = Q.toArray();
          
          const headPositionX = position[0][0];
          const headPositionY = position[1][0];
          
          // Apply filtering and update cursor position
          updateCursorFromHeadPosition(headPositionX, headPositionY);
        } catch (error) {
          console.error("❌ Rotation-only matrix multiplication error:", error);
          console.error("Matrix dimensions:", {
            B: math.size(math.matrix(rotationOnlyMatrix)),
            P: math.size(math.matrix(rotationVector))
          });
        }
        
        requestAnimationFrame(updateCursor);
        return;
      }
      
    } catch (error) {
      console.error("Error updating cursor:", error);
    }
  }
  requestAnimationFrame(updateCursor);
}

// Helper function for applying filtering and updating cursor position
// REPLACES applyFilteringAndUpdateCursor()
function updateCursorFromHeadPosition(headPositionX, headPositionY) {
  // No smoothing filter — this is a discrete region system, not continuous

  // pointing. Boundary flicker is handled downstream by dwell-time hysteresis

  // in the region classifier, not by signal smoothing here.
  state.cursorX = headPositionX;
  state.cursorY = headPositionY;

  const roundedX = Math.round(state.cursorX);
  const roundedY = Math.round(state.cursorY);
  updateCursorPosition(roundedX, roundedY);

  // TODO: region classification + dwell-time hysteresis goes here.

  // e.g. const region = classifyRegion(state.cursorX, state.cursorY);

  //      updateDwellState(region, performance.now());
  state.lastHeadX = headPositionX;
  state.lastHeadY = headPositionY;
}

function updateCursorPosition(x, y) {
  const cursorSize = 20; // Size of cursor in pixels

  // Create or get cursor element (only need the clipped one now)
  let cursorWithClipping = document.getElementById("head-cursor-clipped");
  if (!cursorWithClipping) {
    cursorWithClipping = document.createElement("div");
    cursorWithClipping.id = "head-cursor-clipped";
    cursorWithClipping.style.position = "fixed";
    cursorWithClipping.style.width = `${cursorSize}px`;
    cursorWithClipping.style.height = `${cursorSize}px`;
    cursorWithClipping.style.borderRadius = "50%";
    cursorWithClipping.style.backgroundColor = "red";
    cursorWithClipping.style.zIndex = "1000";
    cursorWithClipping.style.pointerEvents = "none";
    cursorWithClipping.style.transform = "translate(-50%, -50%)";
    document.body.appendChild(cursorWithClipping);
  }

  // Apply positions
  const boundedX = Math.max(0, Math.min(window.innerWidth - cursorSize, x));
  const boundedY = Math.max(0, Math.min(window.innerHeight - cursorSize, y));

  cursorWithClipping.style.left = `${boundedX}px`;
  cursorWithClipping.style.top = `${boundedY}px`;
}

// Initialize cursors for tracking
function initializeCursors() {
  // Create cursor elements if they don't exist
  if (!document.getElementById("head-cursor-clipped")) {
  updateCursorPosition(window.innerWidth / 2, window.innerHeight / 2);
}
  
  // Create reference grid if enabled
  if (state.config.showReferenceGrid) {
    createReferenceGrid();
  }
}

// Make functions globally available
window.updateCursor = updateCursor;
window.updateCursorPosition = updateCursorPosition;
window.createReferenceGrid = createReferenceGrid;
window.initializeCursors = initializeCursors; //hi