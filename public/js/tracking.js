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

// Initialize filters when starting tracking
function initializeFilters() {
  // Get parameters from state or use defaults
  const config = {
    frequency: state.filterConfig?.frequency || 60,
    minCutoff: state.filterConfig?.minCutoff || 1.5,
    beta: state.filterConfig?.beta || 0.007,
    dcutoff: state.filterConfig?.dcutoff || 1.0,
  };

  state.filterConfig = config;

  // Use 2D filter with true 2D velocity for isotropic smoothing
  state.filter2D = new OneEuroFilter2D(
    config.frequency,
    config.minCutoff,
    config.beta,
    config.dcutoff
  );
  // Keep xFilter/yFilter references for backward compatibility
  state.xFilter = state.filter2D;
  state.yFilter = state.filter2D;

  if (state.lastHeadX !== null) {
    const timestamp = performance.now() / 1000;
    state.filter2D.filter(state.lastHeadX, state.lastHeadY, timestamp);
  }
}

const cursorSize = 20; // Adjust this value based on your cursor's actual size in pixels

// Helper function to compute shortest angular distance (handles wrapping)
function angleDifference(target, current) {
  let diff = target - current;
  // Normalize to [-180, 180]
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

// Helper function to smooth rotation angles before transformation
function smoothRotationAngles(rawAngles, customAlpha = null) {
  // If rawAngles is missing, just return the last smoothed state (hold-buffer)
  if (!rawAngles) {
    return state.smoothedAngles || { yaw: 0, pitch: 0, roll: 0 };
  }

  // Initialize smoothed angles state if not exists
  if (!state.smoothedAngles) {
    state.smoothedAngles = {
      yaw: rawAngles.yaw,
      pitch: rawAngles.pitch,
      roll: rawAngles.roll
    };
    return rawAngles; // First frame, return raw angles
  }
  
  // Exponential smoothing factor (0 = no change, 1 = no smoothing)
  const alpha = customAlpha !== null ? customAlpha : 0.4; // Default to 0.4 for better responsiveness
  
  // Apply exponential smoothing using angular differences (handles wrapping correctly)
  const yawDiff = angleDifference(rawAngles.yaw, state.smoothedAngles.yaw);
  const pitchDiff = angleDifference(rawAngles.pitch, state.smoothedAngles.pitch);
  const rollDiff = angleDifference(rawAngles.roll, state.smoothedAngles.roll);
  
  state.smoothedAngles.yaw = state.smoothedAngles.yaw + alpha * yawDiff;
  state.smoothedAngles.pitch = state.smoothedAngles.pitch + alpha * pitchDiff;
  state.smoothedAngles.roll = state.smoothedAngles.roll + alpha * rollDiff;
  
  // Normalize smoothed angles to [-180, 180] range
  state.smoothedAngles.yaw = ((state.smoothedAngles.yaw + 180) % 360 + 360) % 360 - 180;
  state.smoothedAngles.pitch = ((state.smoothedAngles.pitch + 180) % 360 + 360) % 360 - 180;
  state.smoothedAngles.roll = ((state.smoothedAngles.roll + 180) % 360 + 360) % 360 - 180;
  
  return {
    yaw: state.smoothedAngles.yaw,
    pitch: state.smoothedAngles.pitch,
    roll: state.smoothedAngles.roll
  };
}

function updateCursor() {
  if (state.isTracking && state.lastLandmarks) {
    try {
      // Get current landmark configuration
      const currentConfig = state.config.landmarkPoints;
      const is3D = state.config.coordinateSystem === "3d";
      const landmarks = state.lastLandmarks;

      // Log at start (once per 60 frames)
      if (!state._trackingFrameCount) state._trackingFrameCount = 0;
      state._trackingFrameCount++;
      if (state._trackingFrameCount === 1) {
        console.log("🚀 updateCursor START - First frame");
        console.log("   - isTracking:", state.isTracking);
        console.log("   - useRotation:", state.config.useRotation);
        console.log("   - rotationOnlyMode:", state.config.rotationOnlyMode);
        console.log("   - trackingMode:", window.liveRotationControl?.trackingMode);
        console.log("   - estimateHeadPose available:", !!window.estimateHeadPose);
        console.log("   - coordinateSystem:", state.config.coordinateSystem);
        console.log("   - landmarkPoints:", state.config.landmarkPoints);
      }
      
      // Get current tracking mode
      const trackingMode = window.liveRotationControl?.trackingMode || 'landmarks';
      
      // ROTATION-ONLY MODE: Use only rotation angles for tracking
      if (trackingMode === 'rotation') {
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
          applyFilteringAndUpdateCursor(headPositionX, headPositionY);
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

      // Define landmark indices
      const indices = currentConfig === "3" ? [1, 33, 263] : [1, 61, 291, 152, 33, 263];
      const quadraticScale = 0.00001;
      
      // Log configuration for debugging (every 60 frames = ~1 second)
      if (state._trackingFrameCount % 60 === 0) {
        const configInfo = {
          is3D,
          landmarks: currentConfig,
          trackingMode: trackingMode,
          rotationCalibrated: state.config.useRotation,
          hasMatrices: {
            threePoint2d: !!state.transformationMatrices?.threePoint2d,
            sixPoint2d: !!state.transformationMatrices?.sixPoint2d,
            threePoint3d: !!state.transformationMatrices?.threePoint3d,
            sixPoint3d: !!state.transformationMatrices?.sixPoint3d,
            threePoint2dNoRotation: !!state.transformationMatrices?.threePoint2dNoRotation,
            sixPoint2dNoRotation: !!state.transformationMatrices?.sixPoint2dNoRotation,
            threePoint3dNoRotation: !!state.transformationMatrices?.threePoint3dNoRotation,
            sixPoint3dNoRotation: !!state.transformationMatrices?.sixPoint3dNoRotation,
            rotationOnly: !!state.transformationMatrices?.rotationOnly
          }
        };
        
        // Add rotation info if available
        if (state.lastHeadPose) {
          configInfo.headPose = {
            yaw: state.lastHeadPose.angles.yaw.toFixed(1) + '°',
            pitch: state.lastHeadPose.angles.pitch.toFixed(1) + '°',
            roll: state.lastHeadPose.angles.roll.toFixed(1) + '°',
            inVector: trackingMode === 'landmarks+rotation' || trackingMode === 'rotation' ? 'YES' : 'NO'
          };
        }
        
        console.log("🔍 Tracking config:", configInfo);
      }
      
      // Create vector with proper format based on mode
      // CRITICAL: Add bias term first (matrices were trained with bias)
      let vector = [[1.0]]; // Bias term
      
      // Simplified vector creation based on mode
      if (is3D) {
        // 3D mode - use x, y, z coordinates
        for (const index of indices) {
          const landmark = landmarks[index];
          if (!landmark) continue;
          
          // Use calibration dimensions to maintain consistency
          const calibrationWidth = state.calibrationData.calibrationWidth || window.innerWidth;
          const calibrationHeight = state.calibrationData.calibrationHeight || window.innerHeight;
          
          const x = landmark.x * calibrationWidth;
          const y = landmark.y * calibrationHeight;
          const z = landmark.z ? landmark.z * 1000 : 0; // Default to 0 if z is missing
          
          vector.push([x]);
          vector.push([y]);
          vector.push([z]);
          vector.push([x * x * quadraticScale]);
          vector.push([y * y * quadraticScale]);
          vector.push([z * z * quadraticScale]);
        }
        
        // Get the appropriate matrix (try specific 3D first, then generic fallback)
        let matrix = currentConfig === "3" ? 
          (state.transformationMatrices.threePoint3d || state.transformationMatrices.threePoint) : 
          (state.transformationMatrices.sixPoint3d || state.transformationMatrices.sixPoint);
        
        // Try non-rotation matrix if available
        const noRotMatrix = currentConfig === "3" ? 
          state.transformationMatrices.threePoint3dNoRotation : 
          state.transformationMatrices.sixPoint3dNoRotation;
        
        if (!matrix && !noRotMatrix) {
          if (state._trackingFrameCount % 60 === 0) {
            console.error("No 3D transformation matrix available. Matrices:", {
              threePoint3d: !!state.transformationMatrices.threePoint3d,
              sixPoint3d: !!state.transformationMatrices.sixPoint3d,
              threePoint: !!state.transformationMatrices.threePoint,
              sixPoint: !!state.transformationMatrices.sixPoint
            });
          }
          requestAnimationFrame(updateCursor);
          return;
        }
        
        // Determine actual matrix dimensions to know if it has rotation terms
        // Matrix includes bias term! Format: [bias, landmarks..., (rotation...)]
        // 3D 3-point: 19 features without rotation (1+18), 22 with rotation (1+18+3)
        // 3D 6-point: 37 features without rotation (1+36), 40 with rotation (1+36+3)
        const baseFeatures = currentConfig === "3" ? 19 : 37;
        const rotationFeatures = 3;
        
        // Check if the main matrix actually has rotation terms by checking its size
        let matrixHasRotation = false;
        if (matrix) {
          try {
            const matrixSize = math.size(math.matrix(matrix));
            const matrixCols = matrixSize.valueOf()[1];
            matrixHasRotation = matrixCols === baseFeatures + rotationFeatures;
          } catch (e) {
            console.warn("Could not determine matrix size:", e);
          }
        }
        
        // Decide which matrix to use based on tracking mode and matrix capabilities
        const wantsCombinedMode = trackingMode === 'landmarks+rotation';
        let needsRotationTerms = false;
        let useCombinedMode = false;
        
        if (wantsCombinedMode && matrixHasRotation) {
          // User wants combined mode and matrix supports it
          useCombinedMode = true;
          needsRotationTerms = true;
        } else if (wantsCombinedMode && !matrixHasRotation) {
          // User wants combined mode but matrix doesn't support it
          // Fall back to landmarks-only
          if (state._trackingFrameCount % 60 === 0) {
            console.warn("⚠️ Combined mode requested but matrix doesn't have rotation terms. Using landmarks only.");
          }
          if (noRotMatrix) {
            matrix = noRotMatrix;
          }
          // matrix stays as is (without rotation terms)
          needsRotationTerms = false;
          useCombinedMode = false;
        } else {
          // Landmarks-only mode
          if (noRotMatrix) {
            matrix = noRotMatrix;
            needsRotationTerms = false;
          } else if (matrixHasRotation) {
            // Only rotation matrix available, use it with zero rotation terms
            needsRotationTerms = true;
          } else {
            // Standard matrix without rotation
            needsRotationTerms = false;
          }
        }
        
        if (!matrix) {
          console.error("No 3D transformation matrix available");
          requestAnimationFrame(updateCursor);
          return;
        }
        
        // Add rotation terms if needed
        if (needsRotationTerms) {
          if (window.estimateHeadPose) {
            const calibrationWidth = state.calibrationData.calibrationWidth || window.innerWidth;
            const calibrationHeight = state.calibrationData.calibrationHeight || window.innerHeight;
            const headPose = estimateHeadPose(landmarks, calibrationWidth, calibrationHeight);
            
            // Store for logging and live display
            state.lastHeadPose = headPose;
            
            if (useCombinedMode && headPose && headPose.angles) {
              // ARCHITECTURE FIX: Use raw angles directly (no pre-smoothing)
              // Smoothing is handled by One Euro/Exponential filter on cursor position
              const angles = headPose.angles;
              
              // Store last good angles for fallback
              state.lastRawAngles = angles;
              
              const DEG2RAD = Math.PI / 180;
              const ANGLE_SCALE = 1000;
              
              vector.push([angles.yaw * DEG2RAD * ANGLE_SCALE]);
              vector.push([angles.pitch * DEG2RAD * ANGLE_SCALE]);
              vector.push([angles.roll * DEG2RAD * ANGLE_SCALE]);
              
              // Update the live display
              if (window.liveRotationControl) {
                window.liveRotationControl.updateAngles(angles);
              }
              
              // Update Three.js 3D head visualization
              if (window.threeJSHeadViz) {
                window.threeJSHeadViz.updateAngles(angles);
              }
            } else if (useCombinedMode) {
              // FALLBACK: If tracking fails, use last known good angles to prevent jumping to center
              const lastAngles = state.lastRawAngles || { yaw: 0, pitch: 0, roll: 0 };
              const DEG2RAD = Math.PI / 180;
              const ANGLE_SCALE = 1000;
              
              vector.push([lastAngles.yaw * DEG2RAD * ANGLE_SCALE]);
              vector.push([lastAngles.pitch * DEG2RAD * ANGLE_SCALE]);
              vector.push([lastAngles.roll * DEG2RAD * ANGLE_SCALE]);
              
              if (window.liveRotationControl) {
                window.liveRotationControl.updateAngles(lastAngles);
              }
            } else {
              // Update live angles display even if not using rotation in vector
              if (headPose && headPose.angles && window.liveRotationControl) {
                window.liveRotationControl.updateAngles(headPose.angles);
              }
              
              // Use zeros - landmarks-only mode with fallback rotation matrix
              vector.push([0]);
              vector.push([0]);
              vector.push([0]);
            }
          } else {
            // estimateHeadPose not available - add zeros for rotation terms
            if (state._trackingFrameCount % 60 === 0) {
              console.warn("⚠️ Head pose estimation not available, using zeros for rotation");
            }
            vector.push([0]);
            vector.push([0]);
            vector.push([0]);
          }
        } else if (window.estimateHeadPose) {
          // Still calculate pose for display, but don't add to vector
          const calibrationWidth = state.calibrationData.calibrationWidth || window.innerWidth;
          const calibrationHeight = state.calibrationData.calibrationHeight || window.innerHeight;
          const headPose = estimateHeadPose(landmarks, calibrationWidth, calibrationHeight);
          
          state.lastHeadPose = headPose;
          
          if (headPose && headPose.angles && window.liveRotationControl) {
            window.liveRotationControl.updateAngles(headPose.angles);
          }
        }
        
        // Verify vector dimensions (1 bias + landmarks + optional rotation)
        const rotationTerms = needsRotationTerms ? 3 : 0;
        const expectedLength = 1 + (currentConfig === "3" ? 18 : 36) + rotationTerms;
        if (vector.length !== expectedLength) {
          console.error(`3D vector has wrong length: ${vector.length}, expected: ${expectedLength}`);
          requestAnimationFrame(updateCursor);
          return;
        }
        
        // Calculate cursor position with 3D matrix
        const P = math.matrix(vector);
        const B = math.matrix(matrix);
        try {
          const Q = math.multiply(B, P);
          const position = Q.toArray();

          const headPositionX = position[0][0];
          const headPositionY = position[1][0];
          
          // Apply filtering and update cursor position
          applyFilteringAndUpdateCursor(headPositionX, headPositionY);
        } catch (error) {
          console.error("❌ Matrix multiplication error in 3D mode:", error);
          console.error("Matrix dimensions:", {
            B: math.size(B),
            P: math.size(P),
            vectorLength: vector.length,
            expectedLength: expectedLength
          });
        }
      } 
      else {
        // 2D mode - only use x and y coordinates
        for (const index of indices) {
          const landmark = landmarks[index];
          if (!landmark) continue;
          
          // Use calibration dimensions to maintain consistency
          const calibrationWidth = state.calibrationData.calibrationWidth || window.innerWidth;
          const calibrationHeight = state.calibrationData.calibrationHeight || window.innerHeight;
          
          const x = landmark.x * calibrationWidth;
          const y = landmark.y * calibrationHeight;
          
          vector.push([x]);
          vector.push([y]);
          vector.push([x * x * quadraticScale]);
          vector.push([y * y * quadraticScale]);
        }
        
        // Get the appropriate matrix (try specific 2D first, then generic fallback)
        let matrix = currentConfig === "3" ? 
          (state.transformationMatrices.threePoint2d || state.transformationMatrices.threePoint) : 
          (state.transformationMatrices.sixPoint2d || state.transformationMatrices.sixPoint);
        
        // Try non-rotation matrix if available
        const noRotMatrix = currentConfig === "3" ? 
          state.transformationMatrices.threePoint2dNoRotation : 
          state.transformationMatrices.sixPoint2dNoRotation;
        
        if (!matrix && !noRotMatrix) {
          if (state._trackingFrameCount % 60 === 0) {
            console.error("No 2D transformation matrix available. Matrices:", {
              threePoint2d: !!state.transformationMatrices.threePoint2d,
              sixPoint2d: !!state.transformationMatrices.sixPoint2d,
              threePoint: !!state.transformationMatrices.threePoint,
              sixPoint: !!state.transformationMatrices.sixPoint
            });
          }
          requestAnimationFrame(updateCursor);
          return;
        }
        
        // Determine actual matrix dimensions to know if it has rotation terms
        // Matrix includes bias term! Format: [bias, landmarks..., (rotation...)]
        // 2D 3-point: 13 features without rotation (1+12), 16 with rotation (1+12+3)
        // 2D 6-point: 25 features without rotation (1+24), 28 with rotation (1+24+3)
        const baseFeatures = currentConfig === "3" ? 13 : 25;
        const rotationFeatures = 3;
        
        // Check if the main matrix actually has rotation terms by checking its size
        let matrixHasRotation = false;
        if (matrix) {
          try {
            const matrixSize = math.size(math.matrix(matrix));
            const matrixCols = matrixSize.valueOf()[1];
            matrixHasRotation = matrixCols === baseFeatures + rotationFeatures;
          } catch (e) {
            console.warn("Could not determine matrix size:", e);
          }
        }
        
        // Decide which matrix to use based on tracking mode and matrix capabilities
        const wantsCombinedMode = trackingMode === 'landmarks+rotation';
        let needsRotationTerms = false;
        let useCombinedMode2d = false;
        
        if (wantsCombinedMode && matrixHasRotation) {
          // User wants combined mode and matrix supports it
          useCombinedMode2d = true;
          needsRotationTerms = true;
        } else if (wantsCombinedMode && !matrixHasRotation) {
          // User wants combined mode but matrix doesn't support it
          // Fall back to landmarks-only
          if (state._trackingFrameCount % 60 === 0) {
            console.warn("⚠️ Combined mode requested but matrix doesn't have rotation terms. Using landmarks only.");
          }
          if (noRotMatrix) {
            matrix = noRotMatrix;
          }
          // matrix stays as is (without rotation terms)
          needsRotationTerms = false;
          useCombinedMode2d = false;
        } else {
          // Landmarks-only mode
          if (noRotMatrix) {
            matrix = noRotMatrix;
            needsRotationTerms = false;
          } else if (matrixHasRotation) {
            // Only rotation matrix available, use it with zero rotation terms
            needsRotationTerms = true;
          } else {
            // Standard matrix without rotation
            needsRotationTerms = false;
          }
        }
        
        if (!matrix) {
          console.error("No 2D transformation matrix available");
          requestAnimationFrame(updateCursor);
          return;
        }
        
        // Add rotation terms if needed
        if (needsRotationTerms) {
          if (window.estimateHeadPose) {
            const calibrationWidth = state.calibrationData.calibrationWidth || window.innerWidth;
            const calibrationHeight = state.calibrationData.calibrationHeight || window.innerHeight;
            const headPose = estimateHeadPose(landmarks, calibrationWidth, calibrationHeight);
            
            // Store for logging and live display
            state.lastHeadPose = headPose;
            
            if (useCombinedMode2d && headPose && headPose.angles) {
              // ARCHITECTURE FIX: Use raw angles directly (no pre-smoothing)
              // Smoothing is handled by One Euro/Exponential filter on cursor position
              const angles = headPose.angles;
              
              // Store last good angles for fallback
              state.lastRawAngles = angles;
              
              const DEG2RAD = Math.PI / 180;
              const ANGLE_SCALE = 1000;
              
              vector.push([angles.yaw * DEG2RAD * ANGLE_SCALE]);
              vector.push([angles.pitch * DEG2RAD * ANGLE_SCALE]);
              vector.push([angles.roll * DEG2RAD * ANGLE_SCALE]);
              
              // Update the live display
              if (window.liveRotationControl) {
                window.liveRotationControl.updateAngles(angles);
              }
              
              // Update Three.js 3D head visualization
              if (window.threeJSHeadViz) {
                window.threeJSHeadViz.updateAngles(angles);
              }
            } else if (useCombinedMode2d) {
              // FALLBACK: If tracking fails, use last known good angles to prevent jumping to center
              const lastAngles = state.lastRawAngles || { yaw: 0, pitch: 0, roll: 0 };
              const DEG2RAD = Math.PI / 180;
              const ANGLE_SCALE = 1000;
              
              vector.push([lastAngles.yaw * DEG2RAD * ANGLE_SCALE]);
              vector.push([lastAngles.pitch * DEG2RAD * ANGLE_SCALE]);
              vector.push([lastAngles.roll * DEG2RAD * ANGLE_SCALE]);
              
              if (window.liveRotationControl) {
                window.liveRotationControl.updateAngles(lastAngles);
              }
            } else {
              // Update live angles display even if not using rotation in vector
              if (headPose && headPose.angles && window.liveRotationControl) {
                window.liveRotationControl.updateAngles(headPose.angles);
              }
              
              // Use zeros - landmarks-only mode with fallback rotation matrix
              vector.push([0]);
              vector.push([0]);
              vector.push([0]);
            }
          } else {
            // estimateHeadPose not available - add zeros for rotation terms
            if (state._trackingFrameCount % 60 === 0) {
              console.warn("⚠️ Head pose estimation not available, using zeros for rotation");
            }
            vector.push([0]);
            vector.push([0]);
            vector.push([0]);
          }
        } else if (window.estimateHeadPose) {
          // Still calculate pose for display, but don't add to vector
          const calibrationWidth = state.calibrationData.calibrationWidth || window.innerWidth;
          const calibrationHeight = state.calibrationData.calibrationHeight || window.innerHeight;
          const headPose = estimateHeadPose(landmarks, calibrationWidth, calibrationHeight);
          
          state.lastHeadPose = headPose;
          
          if (headPose && headPose.angles && window.liveRotationControl) {
            window.liveRotationControl.updateAngles(headPose.angles);
          }
        }
        
        // Verify vector dimensions (1 bias + landmarks + optional rotation)
        const rotationTerms = needsRotationTerms ? 3 : 0;
        const expectedLength = 1 + (currentConfig === "3" ? 12 : 24) + rotationTerms;
        if (vector.length !== expectedLength) {
          console.error(`2D vector has wrong length: ${vector.length}, expected: ${expectedLength}`);
          requestAnimationFrame(updateCursor);
          return;
        }
        
        // Calculate cursor position with 2D matrix
        const P = math.matrix(vector);
        const B = math.matrix(matrix);
        try {
          const Q = math.multiply(B, P);
          const position = Q.toArray();

          const headPositionX = position[0][0];
          const headPositionY = position[1][0];
          
          // Apply filtering and update cursor position
          applyFilteringAndUpdateCursor(headPositionX, headPositionY);
        } catch (error) {
          console.error("❌ Matrix multiplication error in 2D mode:", error);
          console.error("Matrix dimensions:", {
            B: math.size(B),
            P: math.size(P),
            vectorLength: vector.length,
            expectedLength: expectedLength
          });
        }
      }
    } catch (error) {
      console.error("Error updating cursor:", error);
    }
  }
  requestAnimationFrame(updateCursor);
}

// Helper function for applying filtering and updating cursor position
function applyFilteringAndUpdateCursor(headPositionX, headPositionY) {
  // Apply filtering based on selected filter type
  if (state.config.filterType === "oneEuro") {
    const timestamp = performance.now() / 1000;

    // Initialize filters if needed
    if (!state.filter2D) {
      state.lastHeadX = headPositionX;
      state.lastHeadY = headPositionY;
      initializeFilters();
      return;
    }

    // Apply 2D 1€ filter (uses true 2D velocity for isotropic smoothing)
    const filtered = state.filter2D.filter(headPositionX, headPositionY, timestamp);
    const filteredX = filtered.x;
    const filteredY = filtered.y;

    // Update cursor directly (no extra smoothing - One Euro filter handles it)
    state.cursorX = filteredX;
    state.cursorY = filteredY;

    // Add rounding here like in old version
    const roundedX = Math.round(state.cursorX);
    const roundedY = Math.round(state.cursorY);
    updateCursorPosition(roundedX, roundedY);
  } else {
    // Exponential smoothing
    if (state.lastHeadX === null) {
      state.lastHeadX = headPositionX;
      state.cursorX = headPositionX;
      state.rawCursorX = headPositionX;
    }
    if (state.lastHeadY === null) {
      state.lastHeadY = headPositionY;
      state.cursorY = headPositionY;
      state.rawCursorY = headPositionY;
    }

    // Get cursor element
    let cursorWithClipping = document.getElementById("head-cursor-clipped");

    if (!cursorWithClipping) {
      console.error("Cursor element not found");
      return;
    }

    // Apply direct exponential smoothing without relative movements
    const smoothing = state.config.exponentialSmoothingFactor || 0.95; // Uses configurable value
    
    // Log smoothing factor periodically for debugging (every 5 seconds)
    if (!state._lastSmoothingLog || (performance.now() - state._lastSmoothingLog) > 5000) {
      console.log("📊 Exponential smoothing factor in use:", smoothing);
      if (!state.config.exponentialSmoothingFactor) {
        console.warn("⚠️ Using default smoothing factor (0.95) - exponentialSmoothingFactor not set in config!");
      }
      state._lastSmoothingLog = performance.now();
    }
    
    // Apply smoothing directly to cursor position
    if (state.cursorX === null) {
      state.cursorX = headPositionX;
      state.cursorY = headPositionY;
    } else {
      // Direct exponential smoothing
      state.cursorX = state.cursorX + (1 - smoothing) * (headPositionX - state.cursorX);
      state.cursorY = state.cursorY + (1 - smoothing) * (headPositionY - state.cursorY);
    }

    // Apply bounds
    const cursorSize = 20;
    state.cursorX = Math.max(
      0,
      Math.min(window.innerWidth - cursorSize, state.cursorX)
    );
    state.cursorY = Math.max(
      0,
      Math.min(window.innerHeight - cursorSize, state.cursorY)
    );

    // Round for display
    const roundedX = Math.round(state.cursorX);
    const roundedY = Math.round(state.cursorY);

    // Update cursor position
    cursorWithClipping.style.left = `${roundedX}px`;
    cursorWithClipping.style.top = `${roundedY}px`;
  }

  // Update last positions
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
  if (!document.getElementById("head-cursor-raw")) {
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
window.initializeCursors = initializeCursors;