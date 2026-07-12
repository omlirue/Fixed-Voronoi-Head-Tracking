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
    landmarkPoints3: [],
    landmarkPoints6: [],
    cursorPositions: [],
    frames: [],
    calibrationWidth: window.innerWidth,   // Store current window dimensions
    calibrationHeight: window.innerHeight,
    rotationOnlyPoints: []  // Initialize rotation-only array
  };
  state.transformationMatrices = {
    threePoint: null,
    sixPoint: null,
  };
  
  // Log if rotation-only mode is enabled
  if (state.config.rotationOnlyMode) {
    console.log("🔬 ROTATION-ONLY MODE ENABLED - Will collect rotation data");
  }

  
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

function recordFrame(startPoint, endPoint, progress, frameIndex) {
  if (!state.lastLandmarks) {
    console.warn("No landmarks available for recording");
    return;
  }

  const currentTime = performance.now();
  const targetX = startPoint.x + (endPoint.x - startPoint.x) * progress;
  const targetY = startPoint.y + (endPoint.y - startPoint.y) * progress;

  // Calculate head pose (yaw, pitch, roll) if rotation is enabled
  let headPose = null;
  if (state.config.useRotation && window.estimateHeadPose) {
    // IMPORTANT: Use stored calibration dimensions for consistency
    const calibrationWidth = state.calibrationData.calibrationWidth || window.innerWidth;
    const calibrationHeight = state.calibrationData.calibrationHeight || window.innerHeight;
    headPose = estimateHeadPose(state.lastLandmarks, calibrationWidth, calibrationHeight);
    
    // Estimate focal length from first frame of calibration
    if (frameIndex === 0 && !window.estimatedFocalLength && window.estimateFocalLengthFromFaceSize) {
      const estimatedFx = estimateFocalLengthFromFaceSize(state.lastLandmarks, calibrationWidth);
      if (estimatedFx && estimatedFx > 0) {
        window.estimatedFocalLength = estimatedFx;
        console.log(`🎯 Auto-detected focal length: ${estimatedFx.toFixed(0)} pixels (${(estimatedFx/calibrationWidth).toFixed(2)}x screen width)`);
      }
    }
  }

  // Create base frame data
  // Get calibration dimensions for relative coordinates
  const calWidth = state.calibrationData.calibrationWidth || window.innerWidth;
  const calHeight = state.calibrationData.calibrationHeight || window.innerHeight;
  
  const frameData = {
    videoNumber: state.dataCollection.videoNumber,
    calibrationPointNumber: state.currentCalibrationPoint + 1,
    timestamp: currentTime,
    frameIndex: frameIndex,
    targetX: targetX,
    targetY: targetY,
    targetXRel: targetX / calWidth,   // Relative position (0-1) for cross-screen compatibility
    targetYRel: targetY / calHeight,  // Relative position (0-1) for cross-screen compatibility
  };
  
  // Add rotation angles if rotation is enabled
  if (state.config.useRotation) {
    if (headPose && headPose.angles) {
      frameData.yaw = Math.round(headPose.angles.yaw * 1000) / 1000;  // degrees
      frameData.pitch = Math.round(headPose.angles.pitch * 1000) / 1000;
      frameData.roll = Math.round(headPose.angles.roll * 1000) / 1000;
    } else {
      // Default to 0 if rotation estimation failed
      frameData.yaw = 0;
      frameData.pitch = 0;
      frameData.roll = 0;
    }
  }

  // Get landmarks based on configuration
  const threePointIndices = [1, 33, 263]; // nose tip, left eye, right eye
  const sixPointIndices = [1, 61, 291, 152, 33, 263]; // extended set

  // Add data for 3-point landmarks
  threePointIndices.forEach((index, i) => {
    const landmark = state.lastLandmarks[index];
    if (!landmark) {
      console.error(`Missing landmark at index ${index}`);
      return;
    }

    // Store with correct naming convention
    frameData[`landmark3_${i}_x`] =
      Math.round(landmark.x * window.innerWidth * 100) / 100;
    frameData[`landmark3_${i}_y`] =
      Math.round(landmark.y * window.innerHeight * 100) / 100;
    // Always store Z coordinates regardless of mode
    frameData[`landmark3_${i}_z`] = Math.round(landmark.z * 1000 * 100) / 100;
  });

  // Add data for 6-point landmarks
  sixPointIndices.forEach((index, i) => {
    const landmark = state.lastLandmarks[index];
    if (!landmark) {
      console.error(`Missing landmark at index ${index}`);
      return;
    }

    // Store with correct naming convention
    frameData[`landmark6_${i}_x`] =
      Math.round(landmark.x * window.innerWidth * 100) / 100;
    frameData[`landmark6_${i}_y`] =
      Math.round(landmark.y * window.innerHeight * 100) / 100;
    // Always store Z coordinates regardless of mode
    frameData[`landmark6_${i}_z`] = Math.round(landmark.z * 1000 * 100) / 100;
  });

  frameData.progress = progress;

  // Add to data collection for CSV
  state.dataCollection.calibrationData.push(frameData);

  // Add point for transformation matrix calculation
  const quadraticScale = 0.00001;

  // Process 3-point landmarks - always include Z coordinates
  let threePointVector = [];
  for (const index of threePointIndices) {
    const landmark = state.lastLandmarks[index];
    if (!landmark) continue;

    const x = landmark.x * window.innerWidth;
    const y = landmark.y * window.innerHeight;
    const z = landmark.z * 1000;

    // Always include all coordinates for future use
    threePointVector.push([x]);
    threePointVector.push([y]);
    threePointVector.push([z]);
    threePointVector.push([x * x * quadraticScale]);
    threePointVector.push([y * y * quadraticScale]);
    threePointVector.push([z * z * quadraticScale]);
  }

  // Process 6-point landmarks - always include Z coordinates
  let sixPointVector = [];
  for (const index of sixPointIndices) {
    const landmark = state.lastLandmarks[index];
    if (!landmark) continue;

    const x = landmark.x * window.innerWidth;
    const y = landmark.y * window.innerHeight;
    const z = landmark.z * 1000;

    // Always include all coordinates for future use
    sixPointVector.push([x]);
    sixPointVector.push([y]);
    sixPointVector.push([z]);
    sixPointVector.push([x * x * quadraticScale]);
    sixPointVector.push([y * y * quadraticScale]);
    sixPointVector.push([z * z * quadraticScale]);
  }

  // Add rotation angles to vectors if rotation is enabled
  if (state.config.useRotation) {
    if (headPose && headPose.angles) {
      // Convert degrees to radians and scale to match position feature magnitude
      const DEG2RAD = Math.PI / 180;
      const ANGLE_SCALE = 1000;
      threePointVector.push([headPose.angles.yaw * DEG2RAD * ANGLE_SCALE]);
      threePointVector.push([headPose.angles.pitch * DEG2RAD * ANGLE_SCALE]);
      threePointVector.push([headPose.angles.roll * DEG2RAD * ANGLE_SCALE]);
      
      sixPointVector.push([headPose.angles.yaw * DEG2RAD * ANGLE_SCALE]);
      sixPointVector.push([headPose.angles.pitch * DEG2RAD * ANGLE_SCALE]);
      sixPointVector.push([headPose.angles.roll * DEG2RAD * ANGLE_SCALE]);
    } else {
      // If rotation estimation fails, use last good rotation or zeros
      // This prevents the "jump to center" during combined calibration
      const lastAngles = state.smoothedAngles || { yaw: 0, pitch: 0, roll: 0 };
      const DEG2RAD = Math.PI / 180;
      const ANGLE_SCALE = 1000;
      
      threePointVector.push([lastAngles.yaw * DEG2RAD * ANGLE_SCALE]);
      threePointVector.push([lastAngles.pitch * DEG2RAD * ANGLE_SCALE]);
      threePointVector.push([lastAngles.roll * DEG2RAD * ANGLE_SCALE]);
      
      sixPointVector.push([lastAngles.yaw * DEG2RAD * ANGLE_SCALE]);
      sixPointVector.push([lastAngles.pitch * DEG2RAD * ANGLE_SCALE]);
      sixPointVector.push([lastAngles.roll * DEG2RAD * ANGLE_SCALE]);
    }
  }

  // ROTATION-ONLY MODE: Create vectors with ONLY rotation components
  if (state.config.rotationOnlyMode) {
    // Create rotation-only vectors (Bias, yaw, pitch, roll) - 4 features
    let rotationOnlyVector = [];
    
    if (headPose && headPose.angles) {
      const DEG2RAD = Math.PI / 180;
      const ANGLE_SCALE = 1000;
      
      // Rotation gain based on screen width (larger screens need more amplification)
      const screenWidth = state.calibrationData.calibrationWidth || window.innerWidth;
      const ROTATION_GAIN = Math.min(4.0, Math.max(1.0, (screenWidth / 1920) * 1.5)); // 1.0x for laptops, 2.0x for 2560px, 3.0x for 3840px
      
      const yaw = headPose.angles.yaw * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN;
      const pitch = headPose.angles.pitch * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN;
      const roll = headPose.angles.roll * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN;
      
      rotationOnlyVector.push([1.0]); // Bias term
      rotationOnlyVector.push([yaw]);
      rotationOnlyVector.push([pitch]);
      rotationOnlyVector.push([roll]);
      
      if (frameIndex === 0) {
        console.log("🔬 Rotation-only data collected (4 features):", {
          yaw: headPose.angles.yaw.toFixed(2),
          pitch: headPose.angles.pitch.toFixed(2),
          roll: headPose.angles.roll.toFixed(2),
          rotationGain: ROTATION_GAIN.toFixed(2) + 'x',
          vectorLength: rotationOnlyVector.length
        });
      }
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
      
      console.warn("⚠️ No head pose data for rotation-only mode! Using last good angles.");
    }
    
    // Store rotation-only data
    if (!state.calibrationData.rotationOnlyPoints) {
      state.calibrationData.rotationOnlyPoints = [];
    }
    state.calibrationData.rotationOnlyPoints.push(rotationOnlyVector);
    
    if (frameIndex === 0) {
      console.log(`🔬 Rotation-only points collected so far: ${state.calibrationData.rotationOnlyPoints.length}`);
    }
  }

  state.calibrationData.landmarkPoints3.push(threePointVector);
  state.calibrationData.landmarkPoints6.push(sixPointVector);
  state.calibrationData.cursorPositions.push([[targetX], [targetY]]);
  
  // Mark end points (when progress = 1)
  if (progress === 1) {
    // Create the arrays if they don't exist yet
    if (!state.calibrationData.endPointIndices) {
      state.calibrationData.endPointIndices = [];
    }
    // Store the index of this end point
    state.calibrationData.endPointIndices.push(state.calibrationData.cursorPositions.length - 1);
  }

  if (state.lastLandmarks) {
    const landmarks = state.lastLandmarks;
    // Get calibration dimensions for relative coordinates
    const calWidth = state.calibrationData.calibrationWidth || window.innerWidth;
    const calHeight = state.calibrationData.calibrationHeight || window.innerHeight;
    
    const frame = {
      timestamp: Date.now(),
      frameIndex: frameIndex,
      targetX: targetX,
      targetY: targetY,
      targetXRel: targetX / calWidth,   // Relative position (0-1) for cross-screen compatibility
      targetYRel: targetY / calHeight   // Relative position (0-1) for cross-screen compatibility
    };

    // Add 3-point landmark data (with Z)
    [1, 33, 263].forEach((index, i) => {
      if (landmarks[index]) {
        frame[`landmark3_${i}_x`] = landmarks[index].x;
        frame[`landmark3_${i}_y`] = landmarks[index].y;
        frame[`landmark3_${i}_z`] = landmarks[index].z || 0;
      }
    });

    // Add 6-point landmark data (with Z)
    [1, 61, 291, 152, 33, 263].forEach((index, i) => {
      if (landmarks[index]) {
        frame[`landmark6_${i}_x`] = landmarks[index].x;
        frame[`landmark6_${i}_y`] = landmarks[index].y;
        frame[`landmark6_${i}_z`] = landmarks[index].z || 0;
      }
    });

    state.calibrationData.frames.push(frame);
  }
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

  if (state.config.animationStyle === "with-line") {
    // Remove any existing points except the current one
    const existingPoints = calibrationUI.querySelectorAll('.calibration-point');
    existingPoints.forEach(point => {
      if (point.id !== 'calibration-target') {
        point.remove();
      }
    });

    // Update previous target if it exists
    const previousTarget = document.getElementById("calibration-target");
    if (previousTarget) {
      previousTarget.style.backgroundColor = "rgb(255, 0, 0)";
      previousTarget.id = "old-target";
    }

    // Create new target
    const currentTarget = document.createElement("div");
    currentTarget.id = "calibration-target";
    currentTarget.classList.add("calibration-point");
    currentTarget.style.left = `${point.x}px`;
    currentTarget.style.top = `${point.y}px`;
    currentTarget.style.backgroundColor = "rgba(255, 0, 0, 0.5)";

    calibrationUI.appendChild(currentTarget);

    if (state.currentPosition) {
      animateLine(state.currentPosition, point);
    }
  } else {
    // Create new target first
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
  }

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
    const quadraticScale = 0.00001;

    // Define landmark indices
    const threePointIndices = [1, 33, 263]; // nose tip, left eye, right eye
    const sixPointIndices = [1, 61, 291, 152, 33, 263]; // extended set
    
    // Calculate head pose if rotation is enabled
    let headPose = null;
    if (state.config.useRotation && window.estimateHeadPose) {
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

    // Process 3-point landmarks - always include Z coordinates
    let threePointVector = [];
    for (const index of threePointIndices) {
      const landmark = state.lastLandmarks[index];
      if (!landmark) {
        throw new Error(`Missing landmark ${index} for 3-point configuration`);
      }

      const x = landmark.x * window.innerWidth;
      const y = landmark.y * window.innerHeight;
      const z = landmark.z * 1000;

      // Always include all coordinates for future use
      threePointVector.push([x]);
      threePointVector.push([y]);
      threePointVector.push([z]);
      threePointVector.push([x * x * quadraticScale]);
      threePointVector.push([y * y * quadraticScale]);
      threePointVector.push([z * z * quadraticScale]);
    }

    // Process 6-point landmarks - always include Z coordinates
    let sixPointVector = [];
    for (const index of sixPointIndices) {
      const landmark = state.lastLandmarks[index];
      if (!landmark) {
        throw new Error(`Missing landmark ${index} for 6-point configuration`);
      }

      const x = landmark.x * window.innerWidth;
      const y = landmark.y * window.innerHeight;
      const z = landmark.z * 1000;

      // Always include all coordinates for future use
      sixPointVector.push([x]);
      sixPointVector.push([y]);
      sixPointVector.push([z]);
      sixPointVector.push([x * x * quadraticScale]);
      sixPointVector.push([y * y * quadraticScale]);
      sixPointVector.push([z * z * quadraticScale]);
    }

    // Add rotation angles to vectors if rotation is enabled
    if (state.config.useRotation) {
      if (headPose && headPose.angles) {
        // Convert degrees to radians for better numerical stability
        // AND Scale up by 1000 to match pixel coordinate range (feature scaling)
        const DEG2RAD = Math.PI / 180;
        const ANGLE_SCALE = 1000;
        
        threePointVector.push([headPose.angles.yaw * DEG2RAD * ANGLE_SCALE]);
        threePointVector.push([headPose.angles.pitch * DEG2RAD * ANGLE_SCALE]);
        threePointVector.push([headPose.angles.roll * DEG2RAD * ANGLE_SCALE]);
        
        sixPointVector.push([headPose.angles.yaw * DEG2RAD * ANGLE_SCALE]);
        sixPointVector.push([headPose.angles.pitch * DEG2RAD * ANGLE_SCALE]);
        sixPointVector.push([headPose.angles.roll * DEG2RAD * ANGLE_SCALE]);
      } else {
        // If rotation estimation fails, use last good rotation
        const lastAngles = state.smoothedAngles || { yaw: 0, pitch: 0, roll: 0 };
        const DEG2RAD = Math.PI / 180;
        const ANGLE_SCALE = 1000;
        
        threePointVector.push([lastAngles.yaw * DEG2RAD * ANGLE_SCALE]);
        threePointVector.push([lastAngles.pitch * DEG2RAD * ANGLE_SCALE]);
        threePointVector.push([lastAngles.roll * DEG2RAD * ANGLE_SCALE]);
        
        sixPointVector.push([lastAngles.yaw * DEG2RAD * ANGLE_SCALE]);
        sixPointVector.push([lastAngles.pitch * DEG2RAD * ANGLE_SCALE]);
        sixPointVector.push([lastAngles.roll * DEG2RAD * ANGLE_SCALE]);
      }
    }
    
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

    // Verify vector lengths - 6 values per landmark + 3 rotation angles if enabled (no bias term)
    const rotationTerms = state.config.useRotation ? 3 : 0;
    const expectedLength3 = 6 * threePointIndices.length + rotationTerms;
    const expectedLength6 = 6 * sixPointIndices.length + rotationTerms;

    console.log("Vector lengths:", {
      threePoint: threePointVector.length,
      sixPoint: sixPointVector.length,
      expected3: expectedLength3,
      expected6: expectedLength6,
      useRotation: state.config.useRotation
    });

    if (
      threePointVector.length !== expectedLength3 ||
      sixPointVector.length !== expectedLength6
    ) {
      throw new Error(
        `Invalid vector lengths. Expected ${expectedLength3}/${expectedLength6}, got ${threePointVector.length}/${sixPointVector.length}`
      );
    }

    // Store the vectors and cursor position
    state.calibrationData.landmarkPoints3.push(threePointVector);
    state.calibrationData.landmarkPoints6.push(sixPointVector);
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

    // Add 3-point landmark data - always include Z
    threePointIndices.forEach((index, i) => {
      const landmark = state.lastLandmarks[index];
      if (!landmark) {
        throw new Error(`Missing landmark ${index} for 3-point configuration`);
      }

      frameData[`landmark3_${i}_x`] = landmark.x * window.innerWidth;
      frameData[`landmark3_${i}_y`] = landmark.y * window.innerHeight;
      frameData[`landmark3_${i}_z`] = landmark.z * 1000;
    });

    // Add 6-point landmark data - always include Z
    sixPointIndices.forEach((index, i) => {
      const landmark = state.lastLandmarks[index];
      if (!landmark) {
        throw new Error(`Missing landmark ${index} for 6-point configuration`);
      }

      frameData[`landmark6_${i}_x`] = landmark.x * window.innerWidth;
      frameData[`landmark6_${i}_y`] = landmark.y * window.innerHeight;
      frameData[`landmark6_${i}_z`] = landmark.z * 1000;
    });
    
    // Add rotation data if rotation is enabled
    if (state.config.useRotation) {
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
    }

    state.dataCollection.calibrationData.push(frameData);

    console.log("Successfully recorded calibration point data", {
      index: state.gridConfig.currentIndex,
      totalPoints3: state.calibrationData.landmarkPoints3.length,
      totalPoints6: state.calibrationData.landmarkPoints6.length,
    });
  } catch (error) {
    console.error("Error recording calibration point:", error);
    throw error;
  }
}

function calculateBothTransformationMatrices() {
  try {
    // Calculate for 3-point configuration
    const threePointMatrix = calculateTransformationMatrixForConfig(
      state.calibrationData.landmarkPoints3,
      state.calibrationData.cursorPositions,
      "3"
    );

    // Calculate for 6-point configuration
    const sixPointMatrix = calculateTransformationMatrixForConfig(
      state.calibrationData.landmarkPoints6,
      state.calibrationData.cursorPositions,
      "6"
    );

    state.transformationMatrices = {
      threePoint: threePointMatrix,
      sixPoint: sixPointMatrix,
    };

    return true;
  } catch (error) {
    console.error("Error calculating transformation matrices:", error);
    return false;
  }
}

// Helper function to get column headers based on configuration
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

  // Add 3-point landmark coordinates with Z
  for (let i = 0; i < 3; i++) {
    headers.push(`landmark3_${i}_x`);
    headers.push(`landmark3_${i}_y`);
    headers.push(`landmark3_${i}_z`);
  }

  // Add 6-point landmark coordinates with Z
  for (let i = 0; i < 6; i++) {
    headers.push(`landmark6_${i}_x`);
    headers.push(`landmark6_${i}_y`);
    headers.push(`landmark6_${i}_z`);
  }
  
  // Add rotation angles if rotation is enabled
  if (state.config.useRotation) {
    headers.push("yaw");
    headers.push("pitch");
    headers.push("roll");
  }

  // Removed these configuration headers
  // headers.push("coordinateSystem");
  // headers.push("filterType");

  return headers;
}

function captureCalibrationPoint() {
  if (
    !state.lastLandmarks ||
    (state.config.animationStyle === "with-line" && state.isLineAnimating)
  ) {
    console.log("Skipping capture - no landmarks or animation in progress");
    return;
  }

  const currentPoint = state.currentPosition;
  if (!currentPoint) {
    console.log("No current point to capture");
    return;
  }

  console.log("Capturing point:", state.gridConfig.currentIndex + 1);

  if (state.config.animationStyle === "with-line") {
    // Handle animated mode cleanup
    const oldTarget = document.getElementById("old-target");
    const line = document.getElementById("calibration-line");
    const circle = document.getElementById("line-tip-circle");

    if (oldTarget) oldTarget.remove();
    if (line) line.style.opacity = "0";
    if (circle) circle.style.opacity = "0";
  }

  // Record point data
  recordCalibrationPoint(currentPoint);
  console.log("Recorded calibration point:", state.gridConfig.currentIndex + 1);
  console.log("Current calibration data:", {
    points3: state.calibrationData.landmarkPoints3.length,
    points6: state.calibrationData.landmarkPoints6.length,
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

function animateLine(startPoint, endPoint) {
  // Get or create the line element
  let line = document.getElementById("calibration-line");
  if (!line) {
    line = document.createElement("div");
    line.id = "calibration-line";
    line.style.position = "absolute";
    line.style.height = "2px";
    line.style.backgroundColor = "red";
    line.style.transformOrigin = "left center";
    document.getElementById("calibration-ui").appendChild(line);
  }

  // Create or get the circle element
  let circle = document.getElementById("line-tip-circle");
  if (!circle) {
    circle = document.createElement("div");
    circle.id = "line-tip-circle";
    circle.style.position = "absolute";
    circle.style.width = "4px";
    circle.style.height = "4px";
    circle.style.borderRadius = "50%";
    circle.style.backgroundColor = "red";
    circle.style.transform = "translate(-50%, -50%)";
    document.getElementById("calibration-ui").appendChild(circle);
  }

  const sourceRadius = 15;
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const totalLength = Math.sqrt(dx * dx + dy * dy);
  const adjustedLength = totalLength - sourceRadius;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const angleRad = Math.atan2(dy, dx);

  const adjustedStartX = startPoint.x + Math.cos(angleRad) * sourceRadius;
  const adjustedStartY = startPoint.y + Math.sin(angleRad) * sourceRadius;

  line.style.transition = "none";
  line.style.left = `${adjustedStartX}px`;
  line.style.top = `${adjustedStartY}px`;
  line.style.width = "0";
  line.style.transform = `rotate(${angle}deg)`;
  line.style.opacity = "1";

  circle.style.left = `${adjustedStartX}px`;
  circle.style.top = `${adjustedStartY}px`;
  circle.style.opacity = "1";

  const speedPerFrame = 4.4;
  let distanceCovered = 0;
  let frameIndex = 0;
  state.dataCollection.isRecording = true;
  state.isLineAnimating = true;

  function animate() {
    distanceCovered += speedPerFrame;
    const progress = distanceCovered / adjustedLength;

    if (distanceCovered < adjustedLength) {
      line.style.width = `${distanceCovered}px`;

      const circleX = adjustedStartX + Math.cos(angleRad) * distanceCovered;
      const circleY = adjustedStartY + Math.sin(angleRad) * distanceCovered;
      circle.style.left = `${circleX}px`;
      circle.style.top = `${circleY}px`;

      recordFrame(startPoint, endPoint, progress, frameIndex);
      frameIndex++;

      requestAnimationFrame(animate);
    } else {
      line.style.width = `${adjustedLength}px`;
      state.isLineAnimating = false;
      state.dataCollection.isRecording = false;

      const previousTarget = document.getElementById("old-target");
      if (previousTarget) {
        previousTarget.style.backgroundColor = "rgba(255, 0, 0, 0.5)";
      }

      const currentTarget = document.getElementById("calibration-target");
      if (currentTarget) {
        currentTarget.style.backgroundColor = "rgb(255, 0, 0)";
      }
    }
  }

  animate();
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
      !state.calibrationData.landmarkPoints3 ||
      !state.calibrationData.landmarkPoints6 ||
      !state.calibrationData.cursorPositions
    ) {
      throw new Error("Missing calibration data structures");
    }

    // Log data structure for debugging
    console.log("Calibration data state:", {
      points3: state.calibrationData.landmarkPoints3.length,
      points6: state.calibrationData.landmarkPoints6.length,
      cursorPoints: state.calibrationData.cursorPositions.length,
      samplePoint3: state.calibrationData.landmarkPoints3[0],
      samplePoint6: state.calibrationData.landmarkPoints6[0],
    });

    // Calculate transformation matrices for all configurations
    calculateAllTransformationMatrices();
    
    // Add predictions to calibration data frames
    updateCalibrationDataWithPredictions();

    // Clean up calibration UI
    const calibrationUI = document.getElementById("calibration-ui");
    if (calibrationUI) {
      calibrationUI.classList.add("hidden");
    }

    // Show options instead of starting tracking directly
    showPostCalibrationOptions();

    // Calculate residuals for accuracy analysis
    const residualAnalysis = calculateCalibrationResiduals();
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
      landmarkPoints3: state.calibrationData?.landmarkPoints3?.length,
      landmarkPoints6: state.calibrationData?.landmarkPoints6?.length,
      cursorPositions: state.calibrationData?.cursorPositions?.length,
    });

    state.isCalibrating = false;
    state.isTracking = false;
    state.transformationMatrices = {
      threePoint: null,
      sixPoint: null,
    };

    clearCalibrationData();

    const statusElement = document.getElementById("status");
    if (statusElement) {
      statusElement.textContent = "Error completing calibration: " + error.message;
    }

    return false;
  }
}

// New function to compare 3 vs 6 landmarks
function compareLandmarkConfigurations() {
  // Save original configuration
  const originalConfig = { ...state.config };
  const results = {};

  // Test both configurations
  ["3", "6"].forEach((numLandmarks) => {
    state.config.landmarkPoints = numLandmarks;
    const analysis = calculateCalibrationResiduals();
    if (analysis) {
      results[numLandmarks] = {
        rmse: analysis.rmse,
        meanError: analysis.meanError,
        totalError: analysis.totalError,
      };
    }
  });

  // Restore original configuration
  state.config = originalConfig;

  // Display comparison
  console.log("\n=== Landmark Configuration Comparison ===");
  for (const [landmarks, metrics] of Object.entries(results)) {
    console.log(`\n${landmarks} Landmarks Configuration:`);
    console.log(`RMSE: ${metrics.rmse.toFixed(2)} pixels`);
    console.log(`Mean Error: ${metrics.meanError.toFixed(2)} pixels`);
    console.log(`Total Error: ${metrics.totalError.toFixed(2)} pixels`);
  }

  return results;
}

function clearCalibrationData() {
  state.calibrationData = {
    landmarkPoints3: [],
    landmarkPoints6: [],
    cursorPositions: [],
    frames: [],
  };
  state.transformationMatrices = {
    threePoint: null,
    sixPoint: null,
  };
  state.currentCalibrationPoint = 0;
  state.previousPosition = null;
  state.currentPosition = null;
  state.isLineAnimating = false;
  state.gridConfig.currentIndex = 0;
}

// Make functions globally available
window.calculateCalibrationResiduals = calculateCalibrationResiduals;
window.compareLandmarkConfigurations = compareLandmarkConfigurations;
window.startCalibration = startCalibration;
window.captureCalibrationPoint = captureCalibrationPoint;
window.showNextCalibrationPoint = showNextCalibrationPoint;
window.animateLine = animateLine;
window.finishCalibration = finishCalibration;
window.clearCalibrationData = clearCalibrationData;
window.showPredictedPositions = showPredictedPositions;
window.startTracking = startTracking;

function calculateAllTransformationMatrices() {
  // Define configurations to calculate
  const configurations = [
    { dimensions: "2d", landmarks: "3" },
    { dimensions: "2d", landmarks: "6" },
    { dimensions: "3d", landmarks: "3" },
    { dimensions: "3d", landmarks: "6" }
  ];
  
  // Initialize expanded transformationMatrices structure
  // If rotation was calibrated, we'll store both with-rotation and without-rotation matrices
  state.transformationMatrices = {
    threePoint: null,
    sixPoint: null,
    threePoint2d: null,
    sixPoint2d: null,
    threePoint3d: null,
    sixPoint3d: null,
    // Non-rotation matrices (calculated from same data, excluding rotation terms)
    threePoint2dNoRotation: null,
    sixPoint2dNoRotation: null,
    threePoint3dNoRotation: null,
    sixPoint3dNoRotation: null
  };
  
  // Store original config to restore later
  const originalConfig = { ...state.config };
  
  try {
    // Calculate matrices for each configuration
    for (const config of configurations) {
      // Temporarily modify state.config
      state.config.coordinateSystem = config.dimensions;
      state.config.landmarkPoints = config.landmarks;
      
      console.log(`Calculating matrix for ${config.dimensions} ${config.landmarks}-point configuration`);
      
      // Check if we have the necessary data
      const sourceData = config.landmarks === "3" ? 
        state.calibrationData.landmarkPoints3 : 
        state.calibrationData.landmarkPoints6;
      
      if (!sourceData || !sourceData.length || !state.calibrationData.cursorPositions) {
        console.warn(`Missing data for ${config.dimensions} ${config.landmarks}-point configuration`);
        continue;
      }
      
      // For 2D configurations, we need to extract only the 2D components from our 3D data
      let landmarkData;
      if (config.dimensions === "2d") {
        try {
          // Get the original data
          // Convert to 2D format by removing Z coordinates
          landmarkData = sourceData.map(point => {
            if (!point || !Array.isArray(point)) {
              console.warn("Invalid point data:", point);
              return null;
            }
            
            const numLandmarks = config.landmarks === "3" ? 3 : 6;
            const result = [];
            
            // Check if we have the expected 3D format (with Z coordinates)
            // Account for rotation terms if present
            const rotationTerms = originalConfig.useRotation ? 3 : 0;
            const expectedLength3D = numLandmarks * 6 + rotationTerms;
            const has3dFormat = point.length >= numLandmarks * 6;
            
            if (has3dFormat) {
              // Original format: [x, y, z, x², y², z²] for each landmark + optional [ψ, θ, φ]
              for (let i = 0; i < numLandmarks; i++) {
                const baseIndex = i * 6;
                if (baseIndex + 4 < point.length) {
                  result.push([point[baseIndex][0]]);     // x
                  result.push([point[baseIndex + 1][0]]); // y
                  result.push([point[baseIndex + 3][0]]); // x²
                  result.push([point[baseIndex + 4][0]]); // y²
                }
              }
              
              // NOTE: Do NOT add rotation terms to 2D data
              // 2D matrices use only landmark positions (x, y, x², y²) without rotation
              // This keeps 2D matrices simple and consistent
            } else {
              // We might already have 2D format: [x, y, x², y²] for each landmark + optional rotation
              // Just use it directly
              return point;
            }
            
            return result;
          }).filter(p => p !== null);
        } catch (error) {
          console.error(`Error processing 2D data for ${config.landmarks}-point:`, error);
          continue;
        }
      } else {
        // For 3D, use the landmark data (strip rotation terms if present)
        const numLandmarks = config.landmarks === "3" ? 3 : 6;
        const expectedLandmarkTerms = numLandmarks * 6;  // x, y, z, x², y², z² per landmark
        
        if (originalConfig.useRotation) {
          // Strip rotation terms from 3D data - matrices use only landmark terms
          landmarkData = sourceData.map(point => {
            if (!point || point.length <= expectedLandmarkTerms) {
              return point;  // Already correct length or shorter
            }
            // Take only the first expectedLandmarkTerms (exclude rotation)
            return point.slice(0, expectedLandmarkTerms);
          });
        } else {
          landmarkData = sourceData;
        }
      }
      
      if (!landmarkData || !landmarkData.length) {
        console.warn(`No valid landmark data for ${config.dimensions} ${config.landmarks}-point configuration`);
        continue;
      }
      
      try {
        const matrix = calculateTransformationMatrixForConfig(
          landmarkData,
          state.calibrationData.cursorPositions,
          config.landmarks
        );
        
        if (!matrix) {
          console.warn(`Failed to calculate ${config.dimensions} ${config.landmarks}-point matrix`);
          continue;
        }
        
        // Log matrix dimensions
        const matrixDims = math.size(math.matrix(matrix)).valueOf();
        console.log(`✅ Calculated ${config.dimensions} ${config.landmarks}-point matrix: ${matrixDims[0]}×${matrixDims[1]}`);
        
        // Store in appropriate location
        if (config.dimensions === "2d") {
          if (config.landmarks === "3") {
            state.transformationMatrices.threePoint2d = matrix;
          } else {
            state.transformationMatrices.sixPoint2d = matrix;
          }
        } else {
          if (config.landmarks === "3") {
            state.transformationMatrices.threePoint3d = matrix;
          } else {
            state.transformationMatrices.sixPoint3d = matrix;
          }
        }
        
        // Also store in original locations for backward compatibility
        if (config.landmarks === "3") {
          state.transformationMatrices.threePoint = matrix;
        } else {
          state.transformationMatrices.sixPoint = matrix;
        }
      } catch (error) {
        console.error(`Error calculating ${config.dimensions} ${config.landmarks}-point matrix:`, error);
      }
    }
    
    // If rotation was enabled during calibration, also calculate non-rotation matrices
    // This allows live toggling between rotation and non-rotation during tracking
    if (originalConfig.useRotation) {
      console.log("\n🔄 Calculating non-rotation matrices for comparison...");
      
      // Temporarily disable rotation flag
      const tempConfig = { ...originalConfig, useRotation: false };
      
      for (const config of configurations) {
        try {
          state.config.coordinateSystem = config.dimensions;
          state.config.landmarkPoints = config.landmarks;
          state.config.useRotation = false; // Calculate without rotation
          
          const sourceData = config.landmarks === "3" ? 
            state.calibrationData.landmarkPoints3 : 
            state.calibrationData.landmarkPoints6;
          
          if (!sourceData || !sourceData.length) continue;
          
          // For non-rotation matrices, strip rotation terms from the data
          let landmarkDataNoRotation;
          if (config.dimensions === "2d") {
            // Convert 3D to 2D WITHOUT rotation terms
            landmarkDataNoRotation = sourceData.map(point => {
              const numLandmarks = config.landmarks === "3" ? 3 : 6;
              const result = [];
              
              // Extract x, y, x², y² for each landmark (skip z and z²)
              for (let i = 0; i < numLandmarks; i++) {
                const baseIndex = i * 6;
                if (baseIndex + 4 < point.length) {
                  result.push([point[baseIndex][0]]);     // x
                  result.push([point[baseIndex + 1][0]]); // y
                  result.push([point[baseIndex + 3][0]]); // x²
                  result.push([point[baseIndex + 4][0]]); // y²
                }
              }
              // Do NOT include rotation terms
              return result;
            });
          } else {
            // 3D: Just take the first N terms (excluding the last 3 rotation terms)
            landmarkDataNoRotation = sourceData.map(point => {
              const numLandmarks = config.landmarks === "3" ? 3 : 6;
              const termsPerLandmark = 6; // x, y, z, x², y², z²
              const expectedLengthNoRotation = numLandmarks * termsPerLandmark;
              
              // Just take the first N terms (landmarks, excluding the last 3 rotation terms)
              return point.slice(0, expectedLengthNoRotation);
            });
          }
          
          // Calculate matrix without rotation
          const matrixNoRotation = calculateTransformationMatrixForConfig(
            landmarkDataNoRotation,
            state.calibrationData.cursorPositions,
            config.landmarks  // Pass landmarks ("3" or "6"), not dimensions!
          );
          
          if (matrixNoRotation) {
            const matrixDims = math.size(math.matrix(matrixNoRotation)).valueOf();
            console.log(`  ✅ ${config.dimensions} ${config.landmarks}-point (no rotation): ${matrixDims[0]}×${matrixDims[1]}`);
            
            // Store in non-rotation locations
            if (config.dimensions === "2d") {
              if (config.landmarks === "3") {
                state.transformationMatrices.threePoint2dNoRotation = matrixNoRotation;
              } else {
                state.transformationMatrices.sixPoint2dNoRotation = matrixNoRotation;
              }
            } else {
              if (config.landmarks === "3") {
                state.transformationMatrices.threePoint3dNoRotation = matrixNoRotation;
              } else {
                state.transformationMatrices.sixPoint3dNoRotation = matrixNoRotation;
              }
            }
          }
        } catch (error) {
          console.error(`Error calculating non-rotation ${config.dimensions} ${config.landmarks}-point matrix:`, error);
        }
      }
      
      console.log("✅ Non-rotation matrices calculated\n");
    }
    
    // If rotation-only mode was enabled, calculate rotation-only matrix
    console.log("🔬 Checking rotation-only mode:", {
      rotationOnlyMode: originalConfig.rotationOnlyMode,
      hasRotationOnlyPoints: !!state.calibrationData.rotationOnlyPoints,
      pointsLength: state.calibrationData.rotationOnlyPoints?.length || 0
    });
    
    if (originalConfig.rotationOnlyMode && state.calibrationData.rotationOnlyPoints) {
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
    } else {
      console.log("❌ Skipping rotation-only matrix (not enabled or no data)");
    }
    
    console.log("=== MATRIX CALCULATION SUMMARY ===");
    console.log(`Configuration: ${originalConfig.coordinateSystem}, ${originalConfig.landmarkPoints}-point, rotation=${originalConfig.useRotation}, rotationOnly=${originalConfig.rotationOnlyMode}`);
    console.log("Matrix availability:", {
      threePoint2d: !!state.transformationMatrices.threePoint2d,
      sixPoint2d: !!state.transformationMatrices.sixPoint2d,
      threePoint3d: !!state.transformationMatrices.threePoint3d,
      sixPoint3d: !!state.transformationMatrices.sixPoint3d,
      rotationOnly: !!state.transformationMatrices.rotationOnly
    });
    
    // Show with-rotation matrices
    if (state.transformationMatrices.threePoint2d) {
      const size = math.size(math.matrix(state.transformationMatrices.threePoint2d));
      console.log(`2D 3-point matrix (with rotation): ${size.valueOf()[0]}×${size.valueOf()[1]}`);
    }
    if (state.transformationMatrices.threePoint3d) {
      const size = math.size(math.matrix(state.transformationMatrices.threePoint3d));
      console.log(`3D 3-point matrix (with rotation): ${size.valueOf()[0]}×${size.valueOf()[1]}`);
    }
    
    // Show non-rotation matrices if available
    if (originalConfig.useRotation) {
      console.log("\nNon-rotation matrices:");
      if (state.transformationMatrices.threePoint2dNoRotation) {
        const size = math.size(math.matrix(state.transformationMatrices.threePoint2dNoRotation));
        console.log(`2D 3-point matrix (no rotation): ${size.valueOf()[0]}×${size.valueOf()[1]}`);
      }
      if (state.transformationMatrices.threePoint3dNoRotation) {
        const size = math.size(math.matrix(state.transformationMatrices.threePoint3dNoRotation));
        console.log(`3D 3-point matrix (no rotation): ${size.valueOf()[0]}×${size.valueOf()[1]}`);
      }
    }
    console.log("==================================");
    
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
  if (state.config.useRotation && window.liveRotationControl) {
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
  if (state.config.rotationOnlyMode && window.threeJSHeadViz) {
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

function showPredictedPositions() {
  // Track which configurations are visible
  const visibilityState = {
    "2d-3": true,
    "2d-6": true,
    "3d-3": true,
    "3d-6": true,
    "rotation": true
  };

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
  
  // Add header with toggle buttons and close button
  const header = document.createElement("div");
  header.style.position = "fixed";
  header.style.top = "10px";
  header.style.left = "0";
  header.style.width = "100%";
  header.style.padding = "10px";
  header.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
  header.style.zIndex = "1001";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.flexWrap = "wrap";
  header.style.gap = "10px";
  
  // Add toggle buttons container
  const toggleContainer = document.createElement("div");
  toggleContainer.style.display = "flex";
  toggleContainer.style.gap = "10px";
  toggleContainer.style.flexWrap = "wrap";
  
  // Check if rotation-only matrix is available
  const hasRotationOnly = !!state.transformationMatrices.rotationOnly;
  
  // Toggle button configurations
  const toggleConfigs = [
    { id: "2d-3", color: "red", label: "2D 3-Point", available: true },
    { id: "2d-6", color: "green", label: "2D 6-Point", available: true },
    { id: "3d-3", color: "blue", label: "3D 3-Point", available: true },
    { id: "3d-6", color: "purple", label: "3D 6-Point", available: true },
    { id: "rotation", color: "orange", label: "Rotation Only", available: hasRotationOnly }
  ];
  
  toggleConfigs.forEach(config => {
    const button = document.createElement("button");
    button.id = `toggle-${config.id}`;
    button.style.display = "flex";
    button.style.alignItems = "center";
    button.style.gap = "5px";
    button.style.padding = "8px 12px";
    button.style.backgroundColor = config.available ? config.color : "#555";
    button.style.border = "2px solid white";
    button.style.borderRadius = "5px";
    button.style.color = "white";
    button.style.cursor = config.available ? "pointer" : "not-allowed";
    button.style.fontWeight = "bold";
    button.style.opacity = config.available ? "1" : "0.5";
    button.style.transition = "opacity 0.2s, background-color 0.2s";
    
    const colorBox = document.createElement("div");
    colorBox.style.width = "12px";
    colorBox.style.height = "12px";
    colorBox.style.backgroundColor = "white";
    colorBox.style.borderRadius = "50%";
    
    const label = document.createElement("span");
    label.textContent = config.label + (config.available ? "" : " (N/A)");
    
    button.appendChild(colorBox);
    button.appendChild(label);
    
    if (config.available) {
      button.onclick = () => {
        visibilityState[config.id] = !visibilityState[config.id];
        button.style.opacity = visibilityState[config.id] ? "1" : "0.4";
        button.style.borderStyle = visibilityState[config.id] ? "solid" : "dashed";
        
        // Toggle visibility of prediction elements
        const elements = visualizationContainer.querySelectorAll(`.prediction-${config.id}`);
        elements.forEach(el => {
          el.style.display = visibilityState[config.id] ? "block" : "none";
        });
      };
    }
    
    toggleContainer.appendChild(button);
  });
  
  header.appendChild(toggleContainer);
  
  // Add legend note
  const legendNote = document.createElement("div");
  legendNote.style.color = "white";
  legendNote.style.fontSize = "12px";
  legendNote.textContent = "Click buttons to toggle visibility • White dots = Actual Points";
  header.appendChild(legendNote);
  
  visualizationContainer.appendChild(header);
  
  // Add close button (fixed at bottom)
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
  
  // Draw actual calibration points and predictions
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
  
  // Calculate errors for each configuration
  const configurations = [
    { name: "2D 3-Point", landmarks: "3", dimensions: "2d", color: "red" },
    { name: "2D 6-Point", landmarks: "6", dimensions: "2d", color: "green" },
    { name: "3D 3-Point", landmarks: "3", dimensions: "3d", color: "blue" },
    { name: "3D 6-Point", landmarks: "6", dimensions: "3d", color: "purple" }
  ];
  
  // Store original config
  const originalConfig = { ...state.config };
  
  configurations.forEach(config => {
    try {
      // Set configuration temporarily
      state.config.landmarkPoints = config.landmarks;
      state.config.coordinateSystem = config.dimensions;
      
      // Calculate residuals
      const analysis = calculateCalibrationResiduals();
      
      if (analysis) {
        // Create data row
        const dataRow = document.createElement("tr");
        
        // Configuration cell
        const configCell = document.createElement("td");
        configCell.style.padding = "5px 10px";
        configCell.style.borderBottom = "1px solid #444";
        
        // Create color indicator
        const colorBox = document.createElement("span");
        colorBox.style.display = "inline-block";
        colorBox.style.width = "10px";
        colorBox.style.height = "10px";
        colorBox.style.backgroundColor = config.color;
        colorBox.style.marginRight = "8px";
        colorBox.style.borderRadius = "50%";
        
        configCell.appendChild(colorBox);
        configCell.appendChild(document.createTextNode(config.name));
        dataRow.appendChild(configCell);
        
        // RMSE cell
        const rmseCell = document.createElement("td");
        rmseCell.textContent = analysis.rmse.toFixed(2);
        rmseCell.style.padding = "5px 10px";
        rmseCell.style.borderBottom = "1px solid #444";
        dataRow.appendChild(rmseCell);
        
        // Mean error cell
        const meanCell = document.createElement("td");
        meanCell.textContent = analysis.meanError.toFixed(2);
        meanCell.style.padding = "5px 10px";
        meanCell.style.borderBottom = "1px solid #444";
        dataRow.appendChild(meanCell);
        
        table.appendChild(dataRow);
      }
    } finally {
      // Restore original config
      state.config = { ...originalConfig };
    }
  });
  
  // Add rotation-only row if available
  if (state.transformationMatrices.rotationOnly && 
      state.calibrationData.rotationOnlyPoints &&
      state.calibrationData.rotationOnlyPoints.length > 0) {
    
    try {
      // Calculate rotation-only residuals
      const rotationResiduals = calculateRotationOnlyResiduals();
      
      if (rotationResiduals) {
        const dataRow = document.createElement("tr");
        
        // Configuration cell
        const configCell = document.createElement("td");
        configCell.style.padding = "5px 10px";
        configCell.style.borderBottom = "1px solid #444";
        
        // Create color indicator
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
        
        // RMSE cell
        const rmseCell = document.createElement("td");
        rmseCell.textContent = rotationResiduals.rmse.toFixed(2);
        rmseCell.style.padding = "5px 10px";
        rmseCell.style.borderBottom = "1px solid #444";
        dataRow.appendChild(rmseCell);
        
        // Mean error cell
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

// Update the updateCalibrationDataWithPredictions function to respect user dimension setting
function updateCalibrationDataWithPredictions() {
  // Check if matrices are available
  if (!state.transformationMatrices.threePoint2d || 
      !state.transformationMatrices.sixPoint2d ||
      !state.transformationMatrices.threePoint3d ||
      !state.transformationMatrices.sixPoint3d) {
    console.warn("Missing transformation matrices, cannot calculate predictions");
    return false;
  }

  // Determine which matrices to use based on user configuration
  const is3D = state.config.coordinateSystem === "3d";
  
  // Select appropriate matrices
  const threePointMatrix = is3D ? 
    state.transformationMatrices.threePoint3d : 
    state.transformationMatrices.threePoint2d;
    
  const sixPointMatrix = is3D ? 
    state.transformationMatrices.sixPoint3d : 
    state.transformationMatrices.sixPoint2d;

  console.log(`Updating calibration data with ${is3D ? '3D' : '2D'} predicted positions...`);

  state.dataCollection.calibrationData.forEach((frame, index) => {
    try {
      // Build prediction vectors that match the matrix format:
      // Matrices are built WITH a bias term [1.0] in row 0 and WITHOUT rotation terms.
      // So prediction vectors must also have: [1.0, landmark_terms...]
      let threePointVector, sixPointVector;
      
      const sourceTPoint = state.calibrationData.landmarkPoints3[index];
      const sourceSPoint = state.calibrationData.landmarkPoints6[index];
      
      if (!sourceTPoint || !sourceSPoint) {
        console.warn(`Missing landmark vectors for frame ${index}`);
        return;
      }
      
      if (is3D) {
        // 3D: use landmark terms only (strip rotation), add bias
        // Stored format: [x,y,z,x²,y²,z²] per landmark + optional [yaw,pitch,roll]
        const numTerms3 = 3 * 6; // 18 landmark terms for 3-point
        const numTerms6 = 6 * 6; // 36 landmark terms for 6-point
        
        threePointVector = [[1.0]]; // bias term
        for (let i = 0; i < numTerms3 && i < sourceTPoint.length; i++) {
          threePointVector.push(sourceTPoint[i]);
        }
        
        sixPointVector = [[1.0]]; // bias term
        for (let i = 0; i < numTerms6 && i < sourceSPoint.length; i++) {
          sixPointVector.push(sourceSPoint[i]);
        }
      } else {
        // 2D: extract x, y, x², y² per landmark (skip z, z²), NO rotation, add bias
        // Stored 3D format: [x,y,z,x²,y²,z²] per landmark
        threePointVector = [[1.0]]; // bias term
        for (let i = 0; i < 3; i++) {
          const baseIndex = i * 6;
          threePointVector.push([sourceTPoint[baseIndex][0]]);     // x
          threePointVector.push([sourceTPoint[baseIndex + 1][0]]); // y
          threePointVector.push([sourceTPoint[baseIndex + 3][0]]); // x²
          threePointVector.push([sourceTPoint[baseIndex + 4][0]]); // y²
        }
        
        sixPointVector = [[1.0]]; // bias term
        for (let i = 0; i < 6; i++) {
          const baseIndex = i * 6; 
          sixPointVector.push([sourceSPoint[baseIndex][0]]);     // x
          sixPointVector.push([sourceSPoint[baseIndex + 1][0]]); // y
          sixPointVector.push([sourceSPoint[baseIndex + 3][0]]); // x²
          sixPointVector.push([sourceSPoint[baseIndex + 4][0]]); // y²
        }
        // NOTE: Do NOT add rotation terms - 2D matrices are built without them
      }

      // Calculate 3-point prediction
      const threePointPrediction = calculatePositionFromMatrix(
        threePointVector,
        threePointMatrix
      );
      
      // Calculate 6-point prediction
      const sixPointPrediction = calculatePositionFromMatrix(
        sixPointVector,
        sixPointMatrix
      );
      
      // Add predictions to the frame data
      frame.predicted3X = threePointPrediction ? Math.round(threePointPrediction.x * 100) / 100 : null;
      frame.predicted3Y = threePointPrediction ? Math.round(threePointPrediction.y * 100) / 100 : null;
      frame.predicted6X = sixPointPrediction ? Math.round(sixPointPrediction.x * 100) / 100 : null;
      frame.predicted6Y = sixPointPrediction ? Math.round(sixPointPrediction.y * 100) / 100 : null;
    } catch (error) {
      console.error(`Error calculating predictions for frame ${index}:`, error);
    }
  });

  console.log("Updated calibration data with predictions");
  return true;
}

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
    const originalResult = calculateCalibrationResiduals();
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

// Add a function to update metrics when landmark configuration changes
function updateMetricsForLandmarkChange(newLandmarkCount) {
  console.log(`Updating metrics for ${newLandmarkCount}-point configuration`);
  
  // Update the configuration
  state.config.landmarkPoints = newLandmarkCount;
  
  // Force recalculation with the new configuration
  const metrics = window.robustCalculateResiduals ? window.robustCalculateResiduals() : robustCalculateResiduals();
  console.log(`New metrics for ${newLandmarkCount}-point:`, metrics);
  
  // Update DOM elements
  updateTrackingControlsElements(metrics);
  
  // Update React component if available
  if (window.updateTrackingControlsMetrics) {
    window.updateTrackingControlsMetrics();
  }
  
  // Store for future use
  window.preCalculatedMetrics = metrics;
  
  return metrics;
}

// Make the new function globally available
window.updateMetricsForLandmarkChange = updateMetricsForLandmarkChange;
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

// Add this function to calibration.js
function verifyTrackingConfiguration() {
  console.log("=== TRACKING CONFIGURATION VERIFICATION ===");
  console.log(`Active configuration: ${state.config.coordinateSystem.toUpperCase()} mode with ${state.config.landmarkPoints}-point tracking`);
  
  // Check which matrices are being used
  const is3D = state.config.coordinateSystem === "3d";
  const matrixType = is3D ? "3D" : "2D";
  const landmarkCount = state.config.landmarkPoints;
  
  console.log(`Expected to use: ${matrixType} matrices with ${landmarkCount}-point landmarks`);
  
  // Verify matrices exist
  if (is3D) {
    console.log(`3-point 3D matrix exists: ${state.transformationMatrices.threePoint3d !== null}`);
    console.log(`6-point 3D matrix exists: ${state.transformationMatrices.sixPoint3d !== null}`);
    
    // Check which matrix is active based on landmark configuration
    const activeMatrix = landmarkCount === "3" ? 
      state.transformationMatrices.threePoint3d : 
      state.transformationMatrices.sixPoint3d;
      
    console.log(`Active matrix (${landmarkCount}-point ${matrixType}) exists: ${activeMatrix !== null}`);
    
    // Verify the matrix dimensions match expectations for 3D
    if (activeMatrix) {
      const rows = activeMatrix.length;
      const expectedRows = 2; // X and Y output
      console.log(`Matrix dimensions: ${rows}x${activeMatrix[0]?.length || 0} (expected ${expectedRows}x?)`);
    }
  } else {
    console.log(`3-point 2D matrix exists: ${state.transformationMatrices.threePoint2d !== null}`);
    console.log(`6-point 2D matrix exists: ${state.transformationMatrices.sixPoint2d !== null}`);
    
    // Check which matrix is active based on landmark configuration
    const activeMatrix = landmarkCount === "3" ? 
      state.transformationMatrices.threePoint2d : 
      state.transformationMatrices.sixPoint2d;
      
    console.log(`Active matrix (${landmarkCount}-point ${matrixType}) exists: ${activeMatrix !== null}`);
    
    // Verify the matrix dimensions match expectations for 2D
    if (activeMatrix) {
      const rows = activeMatrix.length;
      const expectedRows = 2; // X and Y output
      console.log(`Matrix dimensions: ${rows}x${activeMatrix[0]?.length || 0} (expected ${expectedRows}x?)`);
    }
  }
  
  // Check if the correct matrix is being used in updateCursor
  console.log("\nVerifying updateCursor function is using correct matrix...");
  console.log(`Current matrix selection logic: ${landmarkCount === "3" ? "threePoint" : "sixPoint"}`);
  
  // Verify the vector construction in updateCursor matches the configuration
  const vectorDimensions = is3D ? "3D (x,y,z)" : "2D (x,y)";
  console.log(`Vector construction: ${vectorDimensions} with quadratic terms`);
  
  console.log("=== END VERIFICATION ===");
}

// Make the function globally available
window.verifyTrackingConfiguration = verifyTrackingConfiguration;

// Update the displayTrackingResiduals function to accept a forceUpdate parameter
function displayTrackingResiduals(forceUpdate = false) {
  try {
    // Calculate residuals
    const residualAnalysis = calculateCalibrationResiduals();
    
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

    // Verify tracking configuration
    if (window.verifyTrackingConfiguration) {
      window.verifyTrackingConfiguration();
    }

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
    const calcFn = window.robustCalculateResiduals || calculateCalibrationResiduals;
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
            const calcFn = window.robustCalculateResiduals || calculateCalibrationResiduals;
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

// Add a function to update metrics when coordinate system changes
function updateMetricsForCoordinateSystemChange(newCoordinateSystem) {
  console.log(`Updating metrics for ${newCoordinateSystem} coordinate system`);
  
  // Update the configuration
  state.config.coordinateSystem = newCoordinateSystem;
  
  // Force recalculation with the new configuration
  const metrics = window.robustCalculateResiduals ? window.robustCalculateResiduals() : robustCalculateResiduals();
  console.log(`New metrics for ${newCoordinateSystem}:`, metrics);
  
  // Update DOM elements
  updateTrackingControlsElements(metrics);
  
  // Update React component if available
  if (window.updateTrackingControlsMetrics) {
    window.updateTrackingControlsMetrics();
  }
  
  // Store for future use
  window.preCalculatedMetrics = metrics;
  
  return metrics;
}

// Make the new function globally available
window.updateMetricsForCoordinateSystemChange = updateMetricsForCoordinateSystemChange;

// Check if you have environment-specific code like this
if (window.location.hostname === 'localhost') {
  // Local-specific code
} else {
  // Production-specific code
}