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
    rotationOnlyPoints: null,
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

// function recordFrame(startPoint, endPoint, progress, frameIndex) {
//   if (!state.lastLandmarks) {
//     console.warn("No landmarks available for recording");
//     return;
//   }

//   const currentTime = performance.now();
//   const targetX = startPoint.x + (endPoint.x - startPoint.x) * progress;
//   const targetY = startPoint.y + (endPoint.y - startPoint.y) * progress;

//   // Calculate head pose (yaw, pitch, roll) if rotation is enabled
//   let headPose = null;
//   if (state.config.useRotation && window.estimateHeadPose) {
//     // IMPORTANT: Use stored calibration dimensions for consistency
//     const calibrationWidth = state.calibrationData.calibrationWidth || window.innerWidth;
//     const calibrationHeight = state.calibrationData.calibrationHeight || window.innerHeight;
//     headPose = estimateHeadPose(state.lastLandmarks, calibrationWidth, calibrationHeight);
    
//     // Estimate focal length from first frame of calibration
//     if (frameIndex === 0 && !window.estimatedFocalLength && window.estimateFocalLengthFromFaceSize) {
//       const estimatedFx = estimateFocalLengthFromFaceSize(state.lastLandmarks, calibrationWidth);
//       if (estimatedFx && estimatedFx > 0) {
//         window.estimatedFocalLength = estimatedFx;
//         console.log(`🎯 Auto-detected focal length: ${estimatedFx.toFixed(0)} pixels (${(estimatedFx/calibrationWidth).toFixed(2)}x screen width)`);
//       }
//     }
//   }

//   // Create base frame data
//   // Get calibration dimensions for relative coordinates
//   const calWidth = state.calibrationData.calibrationWidth || window.innerWidth;
//   const calHeight = state.calibrationData.calibrationHeight || window.innerHeight;
  
//   const frameData = {
//     videoNumber: state.dataCollection.videoNumber,
//     calibrationPointNumber: state.currentCalibrationPoint + 1,
//     timestamp: currentTime,
//     frameIndex: frameIndex,
//     targetX: targetX,
//     targetY: targetY,
//     targetXRel: targetX / calWidth,   // Relative position (0-1) for cross-screen compatibility
//     targetYRel: targetY / calHeight,  // Relative position (0-1) for cross-screen compatibility
//   };
  
//   // Add rotation angles if rotation is enabled
//   if (state.config.useRotation) {
//     if (headPose && headPose.angles) {
//       frameData.yaw = Math.round(headPose.angles.yaw * 1000) / 1000;  // degrees
//       frameData.pitch = Math.round(headPose.angles.pitch * 1000) / 1000;
//       frameData.roll = Math.round(headPose.angles.roll * 1000) / 1000;
//     } else {
//       // Default to 0 if rotation estimation failed
//       frameData.yaw = 0;
//       frameData.pitch = 0;
//       frameData.roll = 0;
//     }
//   }

//   frameData.progress = progress;

//   // Add to data collection for CSV
//   state.dataCollection.calibrationData.push(frameData);

//   // ROTATION-ONLY MODE: Create vectors with ONLY rotation components
//   if (state.config.rotationOnlyMode) {
//     // Create rotation-only vectors (Bias, yaw, pitch, roll) - 4 features
//     let rotationOnlyVector = [];
    
//     if (headPose && headPose.angles) {
//       const DEG2RAD = Math.PI / 180;
//       const ANGLE_SCALE = 1000;
      
//       // Rotation gain based on screen width (larger screens need more amplification)
//       const screenWidth = state.calibrationData.calibrationWidth || window.innerWidth;
//       const ROTATION_GAIN = Math.min(4.0, Math.max(1.0, (screenWidth / 1920) * 1.5)); // 1.0x for laptops, 2.0x for 2560px, 3.0x for 3840px
      
//       const yaw = headPose.angles.yaw * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN;
//       const pitch = headPose.angles.pitch * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN;
//       const roll = headPose.angles.roll * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN;
      
//       rotationOnlyVector.push([1.0]); // Bias term
//       rotationOnlyVector.push([yaw]);
//       rotationOnlyVector.push([pitch]);
//       rotationOnlyVector.push([roll]);
      
//       if (frameIndex === 0) {
//         console.log("🔬 Rotation-only data collected (4 features):", {
//           yaw: headPose.angles.yaw.toFixed(2),
//           pitch: headPose.angles.pitch.toFixed(2),
//           roll: headPose.angles.roll.toFixed(2),
//           rotationGain: ROTATION_GAIN.toFixed(2) + 'x',
//           vectorLength: rotationOnlyVector.length
//         });
//       }
//       } else {
//         // Use last known good angles for rotation-only calibration
//         const lastAngles = state.smoothedAngles || { yaw: 0, pitch: 0, roll: 0 };
//         const DEG2RAD = Math.PI / 180;
//         const ANGLE_SCALE = 1000;
        
//         const screenWidth = state.calibrationData.calibrationWidth || window.innerWidth;
//         const ROTATION_GAIN = Math.min(4.0, Math.max(1.0, (screenWidth / 1920) * 1.5));
        
//         rotationOnlyVector.push([1.0]); // Bias
//         rotationOnlyVector.push([lastAngles.yaw * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN]);
//         rotationOnlyVector.push([lastAngles.pitch * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN]);
//         rotationOnlyVector.push([lastAngles.roll * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN]);
      
//       console.warn("⚠️ No head pose data for rotation-only mode! Using last good angles.");
//     }
    
//     // Store rotation-only data
//     if (!state.calibrationData.rotationOnlyPoints) {
//       state.calibrationData.rotationOnlyPoints = [];
//     }
//     state.calibrationData.rotationOnlyPoints.push(rotationOnlyVector);
    
//     if (frameIndex === 0) {
//       console.log(`🔬 Rotation-only points collected so far: ${state.calibrationData.rotationOnlyPoints.length}`);
//     }
//   }

//   state.calibrationData.cursorPositions.push([[targetX], [targetY]]);
  
//   // Mark end points (when progress = 1)
//   if (progress === 1) {
//     // Create the arrays if they don't exist yet
//     if (!state.calibrationData.endPointIndices) {
//       state.calibrationData.endPointIndices = [];
//     }
//     // Store the index of this end point
//     state.calibrationData.endPointIndices.push(state.calibrationData.cursorPositions.length - 1);
//   }

//   if (state.lastLandmarks) {
//     const landmarks = state.lastLandmarks;
//     // Get calibration dimensions for relative coordinates
//     const calWidth = state.calibrationData.calibrationWidth || window.innerWidth;
//     const calHeight = state.calibrationData.calibrationHeight || window.innerHeight;
    
//     const frame = {
//       timestamp: Date.now(),
//       frameIndex: frameIndex,
//       targetX: targetX,
//       targetY: targetY,
//       targetXRel: targetX / calWidth,   // Relative position (0-1) for cross-screen compatibility
//       targetYRel: targetY / calHeight   // Relative position (0-1) for cross-screen compatibility
//     };

//     state.calibrationData.frames.push(frame);
//   }
//}

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
      // Create rotation-only vectors (Bias, yaw, pitch, roll) - 4 features
      let rotationOnlyVector = [];
      
      if (headPose && headPose.angles) {
        const DEG2RAD = Math.PI / 180;
        const ANGLE_SCALE = 1000;
        
        // Rotation gain based on screen width (larger screens need more amplification)
        const screenWidth = state.calibrationData.calibrationWidth || window.innerWidth;
        const ROTATION_GAIN = Math.min(4.0, Math.max(1.0, (screenWidth / 1920) * 1.5));
        
        const yaw = headPose.angles.yaw * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN;
        const pitch = headPose.angles.pitch * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN;
        const roll = headPose.angles.roll * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN;
        
        rotationOnlyVector.push([1.0]); // Bias
        rotationOnlyVector.push([yaw]);
        rotationOnlyVector.push([pitch]);
        rotationOnlyVector.push([roll]);
        
        console.log("🔬 Rotation-only data collected (4 features):", {
          pointNumber: state.gridConfig.currentIndex + 1,
          yaw: headPose.angles.yaw.toFixed(2),
          pitch: headPose.angles.pitch.toFixed(2),
          roll: headPose.angles.roll.toFixed(2),
          rotationGain: ROTATION_GAIN.toFixed(2) + 'x',
          vectorLength: rotationOnlyVector.length
        });
      } else {
        // Use last known good angles for rotation-only calibration
        const lastAngles = state.smoothedAngles || { yaw: 0, pitch: 0, roll: 0 };
        const DEG2RAD = Math.PI / 180;
        const ANGLE_SCALE = 1000;
        
        const screenWidth = state.calibrationData.calibrationWidth || window.innerWidth;
        const ROTATION_GAIN = Math.min(4.0, Math.max(1.0, (screenWidth / 1920) * 1.5));
        
        rotationOnlyVector.push([1.0]); // Bias
        rotationOnlyVector.push([lastAngles.yaw * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN]);
        rotationOnlyVector.push([lastAngles.pitch * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN]);
        rotationOnlyVector.push([lastAngles.roll * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN]);
        
        console.warn("⚠️ No head pose data for rotation-only mode point! Using last good angles.");
      }
      
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
            state.calibrationData.cursorPositions,
            "rotation" // Special identifier for rotation-only
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
  // In user mode, start tracking, then run the edge-check to validate
  // calibration BEFORE proceeding to parameter optimization.
  if (typeof isUserMode === 'function' && isUserMode()) {
    startTracking();
    runPostCalibrationEdgeCheck().then(passed => {
      if (passed) {
        showUserModeReadyForParameterOptimization();
      }
      // If not passed, the user chose to recalibrate (page reloads).
    });
    return;
  }

  // Test mode: show options
  const optionsContainer = document.createElement("div");
  optionsContainer.id = "post-calibration-options";
  optionsContainer.style.position = "fixed";
  optionsContainer.style.top = "50%";
  optionsContainer.style.left = "50%";
  optionsContainer.style.transform = "translate(-50%, -50%)";
  optionsContainer.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
  optionsContainer.style.padding = "20px";
  optionsContainer.style.borderRadius = "10px";
  optionsContainer.style.zIndex = "1000";
  optionsContainer.style.display = "flex";
  optionsContainer.style.flexDirection = "column";
  optionsContainer.style.gap = "15px";
  optionsContainer.style.minWidth = "300px";
  optionsContainer.style.textAlign = "center";
  
  const description = document.createElement("p");
  description.textContent = "Choose an option:";
  description.style.color = "white";
  optionsContainer.appendChild(description);
  
  const showPredictionsButton = document.createElement("button");
  showPredictionsButton.textContent = "Show Predicted Positions";
  showPredictionsButton.style.padding = "10px";
  showPredictionsButton.style.backgroundColor = "#4CAF50";
  showPredictionsButton.style.border = "none";
  showPredictionsButton.style.borderRadius = "5px";
  showPredictionsButton.style.color = "white";
  showPredictionsButton.style.cursor = "pointer";
  showPredictionsButton.style.fontWeight = "bold";
  showPredictionsButton.onclick = () => {
    document.body.removeChild(optionsContainer);
    showPredictedPositions();
  };
  optionsContainer.appendChild(showPredictionsButton);
  
  const startTrackingButton = document.createElement("button");
  startTrackingButton.textContent = "Start Tracking";
  startTrackingButton.style.padding = "10px";
  startTrackingButton.style.backgroundColor = "#2196F3";
  startTrackingButton.style.border = "none";
  startTrackingButton.style.borderRadius = "5px";
  startTrackingButton.style.color = "white";
  startTrackingButton.style.cursor = "pointer";
  startTrackingButton.style.fontWeight = "bold";
  startTrackingButton.onclick = () => {
    document.body.removeChild(optionsContainer);
    startTracking();
  };
  optionsContainer.appendChild(startTrackingButton);
  
  document.body.appendChild(optionsContainer);
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

// Shown to participants (user mode) right after calibration completes and
// tracking starts, so they have a clear "Press SPACE to begin" prompt
// instead of a blank screen with a hidden tracking controls panel.
function showUserModeReadyForParameterOptimization() {
  if (document.getElementById('user-ready-for-pareto-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'user-ready-for-pareto-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.92); z-index: 100000;
    display: flex; align-items: center; justify-content: center;
  `;
  overlay.innerHTML = `
    <div style="text-align: center; padding: 50px 60px; background: rgba(30,30,40,0.98);
      border: 2px solid #64c8ff; border-radius: 16px; max-width: 620px;
      font-family: system-ui, -apple-system, sans-serif; color: #eee;">
      <h1 style="color: #64c8ff; font-size: 30px; margin: 0 0 14px;">Calibration Complete</h1>
      <p style="color: #ccc; font-size: 19px; margin: 0 0 22px;">
        Ready to start the parameter optimization?
      </p>
      <div style="text-align: left; max-width: 480px; margin: 0 auto 26px;
        color: #bbb; font-size: 15px; line-height: 1.7;">
        What happens next:
        <ul style="margin: 8px 0 0 0; padding-left: 22px;">
          <li>A red circle will appear on screen.</li>
          <li>Move your head to point at it, then press <kbd style="background:#222;border:1px solid #444;border-radius:4px;padding:1px 7px;">Space</kbd> and hold still while it records.</li>
          <li>A green circle will then appear — move your head to it.</li>
          <li>Repeat for several positions. The system tunes itself for you.</li>
        </ul>
      </div>
      <div id="user-ready-pareto-btn" style="
        padding: 16px 44px; font-size: 20px; font-weight: bold;
        background: #64c8ff; color: #111; border: none; border-radius: 10px;
        display: inline-block; cursor: pointer;
      ">Press SPACE to Start</div>
    </div>
  `;
  document.body.appendChild(overlay);

  const launchPareto = () => {
    overlay.remove();
    document.removeEventListener('keydown', spaceHandler, true);
    if (typeof window.startParameterOptimization === 'function') {
      try {
        window.startParameterOptimization();
      } catch (err) {
        console.error('Failed to start parameter optimization:', err);
      }
    } else {
      console.warn('window.startParameterOptimization not ready yet');
    }
  };

  document.getElementById('user-ready-pareto-btn').onclick = launchPareto;

  // Use capture-phase so this same Space press doesn't reach the
  // calibration spacebar handler (state.isCalibrating should already be
  // false here, but we guard anyway).
  const spaceHandler = (e) => {
    if (e.code !== 'Space') return;
    if (!document.getElementById('user-ready-for-pareto-overlay')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    launchPareto();
  };
  document.addEventListener('keydown', spaceHandler, true);
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

// Helper function to calculate position from transformation matrix
function calculatePositionFromMatrix(landmarkVector, matrix) {
  if (!landmarkVector || !matrix) return null;
  
  try {
    const P = math.matrix(landmarkVector);
    const B = math.matrix(matrix);
    const Q = math.multiply(B, P);
    const position = Q.toArray();
    
    return {
      x: position[0][0],
      y: position[1][0]
    };
  } catch (error) {
    console.error("Error calculating position from matrix:", error);
    return null;
  }
}

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

// Add a function to update residuals when configuration changes
function updateResidualsOnConfigChange() {
  // Add direct event listeners to the landmark buttons in the tracking controls
  const landmarkButtons = document.querySelectorAll('#tracking-controls-container button');
  
  landmarkButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Short timeout to allow state to update
      setTimeout(() => {
        // Update both displays
        displayTrackingResiduals(true);
        updateTrackingControlsResiduals();
      }, 100);
    });
  });
  
  // Also add a MutationObserver to watch for changes to the DOM
  const observer = new MutationObserver((mutations) => {
    // Check if any mutations affect the landmark buttons
    const shouldUpdate = mutations.some(mutation => {
      return mutation.target.id === 'tracking-controls-container' || 
             mutation.target.closest('#tracking-controls-container');
    });
    
    if (shouldUpdate) {
      setTimeout(() => {
        updateTrackingControlsResiduals();
      }, 100);
    }
  });
  
  // Observe the tracking controls container
  const controlsContainer = document.getElementById('tracking-controls-container');
  if (controlsContainer) {
    observer.observe(controlsContainer, { 
      childList: true, 
      subtree: true, 
      attributes: true,
      attributeFilter: ['class']
    });
  }
  
  return observer;
}

// Update setupTracking to call the new function
function setupTracking(residualAnalysis) {
  try {
    // Update application state
    state.isCalibrating = false;
    state.isTracking = true;

    // Clean up calibration UI if it exists
    const calibrationUI = document.getElementById("calibration-ui");
    if (calibrationUI) {
      calibrationUI.classList.add("hidden");
    }

    // Initialize tracking cursors
    initializeCursors();

    // Mount tracking controls
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
      const root = ReactDOM.createRoot(controlsContainer);
      root.render(React.createElement(window.TrackingControls));
      console.log("Tracking controls mounted successfully");
    } catch (controlsError) {
      console.error("Error mounting tracking controls:", controlsError);
    }

    // Start cursor tracking
    if (window.updateCursor && typeof window.updateCursor === 'function') {
      window.updateCursor();
      console.log("✅ Started cursor tracking via window.updateCursor()");
    } else {
      console.error("❌ window.updateCursor not available!");
    }
    
    // Display residuals
    if (window.displayTrackingResiduals) {
      window.displayTrackingResiduals();
      
      // Set up observer for config changes after a short delay
      // to ensure the UI is fully rendered
      setTimeout(() => {
        if (window.updateResidualsOnConfigChange) {
          window.updateResidualsOnConfigChange();
        }
        
        // Also update the tracking controls residuals
        if (window.updateTrackingControlsResiduals) {
          window.updateTrackingControlsResiduals();
        }
      }, 500);
    }

    // Update status display
    // const statusMessage = residualAnalysis
    //   ? `Tracking active using ${state.config.coordinateSystem.toUpperCase()} mode with ${state.config.landmarkPoints}-point tracking (RMSE: ${residualAnalysis.rmse.toFixed(2)} px)`
    //   : `Tracking active using ${state.config.coordinateSystem.toUpperCase()} mode with ${state.config.landmarkPoints}-point tracking`;
    // document.getElementById("status").textContent = statusMessage;

    return true;
  } catch (error) {
    console.error("Error setting up tracking:", error);
    return false;
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

// Robust function to force calculation and display of metrics
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

// Make these functions globally available
window.updateTrackingControlsElements = updateTrackingControlsElements;
window.forceCalculateAndDisplayMetrics = forceCalculateAndDisplayMetrics;

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

// Check if you have environment-specific code like this
if (window.location.hostname === 'localhost') {
  // Local-specific code
} else {
  // Production-specific code
}