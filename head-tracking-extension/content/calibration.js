function startCalibration() {
  console.log("Starting calibration with config:", state.config);

  state.isCalibrating = true;
  state.isTracking = false;
  state.currentCalibrationPoint = 0;

  // Initialize calibration data structures properly
  state.calibrationData = {
    landmarkPoints3: [],
    landmarkPoints6: [],
    cursorPositions: [],
  };
  state.transformationMatrices = {
    threePoint: null,
    sixPoint: null,
  };

  // Clear previous collection data
  state.dataCollection.calibrationData = [];

  // Reset other state variables
  state.previousPosition = null;
  state.currentPosition = null;
  state.isLineAnimating = false;

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

  // Create base frame data
  const frameData = {
    videoNumber: state.dataCollection.videoNumber,
    calibrationPointNumber: state.currentCalibrationPoint + 1,
    timestamp: currentTime,
    frameIndex: frameIndex,
    targetX: targetX,
    targetY: targetY,
  };

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
    if (state.config.coordinateSystem === "3d") {
      frameData[`landmark3_${i}_z`] = Math.round(landmark.z * 1000 * 100) / 100;
    }
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
    if (state.config.coordinateSystem === "3d") {
      frameData[`landmark6_${i}_z`] = Math.round(landmark.z * 1000 * 100) / 100;
    }
  });

  frameData.progress = progress;

  // Add to data collection for CSV
  state.dataCollection.calibrationData.push(frameData);

  // Add point for transformation matrix calculation
  const quadraticScale = 0.00001;

  // Process 3-point landmarks
  let threePointVector = [];
  for (const index of threePointIndices) {
    const landmark = state.lastLandmarks[index];
    if (!landmark) continue;

    const x = landmark.x * window.innerWidth;
    const y = landmark.y * window.innerHeight;

    threePointVector.push([x]);
    threePointVector.push([y]);
    if (state.config.coordinateSystem === "3d") {
      const z = landmark.z * 1000;
      threePointVector.push([z]);
    }
    threePointVector.push([x * x * quadraticScale]);
    threePointVector.push([y * y * quadraticScale]);
    if (state.config.coordinateSystem === "3d") {
      threePointVector.push([landmark.z * landmark.z * quadraticScale]);
    }
  }

  // Process 6-point landmarks
  let sixPointVector = [];
  for (const index of sixPointIndices) {
    const landmark = state.lastLandmarks[index];
    if (!landmark) continue;

    const x = landmark.x * window.innerWidth;
    const y = landmark.y * window.innerHeight;

    sixPointVector.push([x]);
    sixPointVector.push([y]);
    if (state.config.coordinateSystem === "3d") {
      const z = landmark.z * 1000;
      sixPointVector.push([z]);
    }
    sixPointVector.push([x * x * quadraticScale]);
    sixPointVector.push([y * y * quadraticScale]);
    if (state.config.coordinateSystem === "3d") {
      sixPointVector.push([landmark.z * landmark.z * quadraticScale]);
    }
  }

  state.calibrationData.landmarkPoints3.push(threePointVector);
  state.calibrationData.landmarkPoints6.push(sixPointVector);
  state.calibrationData.cursorPositions.push([[targetX], [targetY]]);
}

function showNextCalibrationPoint() {
  const point = getNextGridPosition();
  if (!point) {
    finishCalibration();
    return;
  }

  const calibrationUI = document.getElementById("calibration-ui");

  if (state.config.animationStyle === "with-line") {
    // For animated mode - keep existing behavior
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
    const is3D = state.config.coordinateSystem === "3d";
    const quadraticScale = 0.00001;

    // Define landmark indices
    const threePointIndices = [1, 33, 263]; // nose tip, left eye, right eye
    const sixPointIndices = [1, 61, 291, 152, 33, 263]; // extended set

    console.log("Recording calibration point:", {
      pointNumber: state.gridConfig.currentIndex,
      is3D: is3D,
      target: point,
    });

    // Process 3-point landmarks
    let threePointVector = [];
    for (const index of threePointIndices) {
      const landmark = state.lastLandmarks[index];
      if (!landmark) {
        throw new Error(`Missing landmark ${index} for 3-point configuration`);
      }

      const x = landmark.x * window.innerWidth;
      const y = landmark.y * window.innerHeight;

      // Basic coordinates
      threePointVector.push([x]);
      threePointVector.push([y]);
      if (is3D && typeof landmark.z !== "undefined") {
        const z = landmark.z * 1000;
        threePointVector.push([z]);
      }

      // Quadratic terms
      threePointVector.push([x * x * quadraticScale]);
      threePointVector.push([y * y * quadraticScale]);
      if (is3D && typeof landmark.z !== "undefined") {
        threePointVector.push([landmark.z * landmark.z * quadraticScale]);
      }
    }

    // Process 6-point landmarks
    let sixPointVector = [];
    for (const index of sixPointIndices) {
      const landmark = state.lastLandmarks[index];
      if (!landmark) {
        throw new Error(`Missing landmark ${index} for 6-point configuration`);
      }

      const x = landmark.x * window.innerWidth;
      const y = landmark.y * window.innerHeight;

      // Basic coordinates
      sixPointVector.push([x]);
      sixPointVector.push([y]);
      if (is3D && typeof landmark.z !== "undefined") {
        const z = landmark.z * 1000;
        sixPointVector.push([z]);
      }

      // Quadratic terms
      sixPointVector.push([x * x * quadraticScale]);
      sixPointVector.push([y * y * quadraticScale]);
      if (is3D && typeof landmark.z !== "undefined") {
        sixPointVector.push([landmark.z * landmark.z * quadraticScale]);
      }
    }

    // Verify vector lengths
    const expectedLength3 = is3D
      ? 3 * 2 * threePointIndices.length
      : 2 * 2 * threePointIndices.length;
    const expectedLength6 = is3D
      ? 3 * 2 * sixPointIndices.length
      : 2 * 2 * sixPointIndices.length;

    console.log("Vector lengths:", {
      threePoint: threePointVector.length,
      sixPoint: sixPointVector.length,
      expected3: expectedLength3,
      expected6: expectedLength6,
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
    const frameData = {
      calibrationPointNumber: state.gridConfig.currentIndex + 1,
      timestamp: performance.now(),
      frameIndex: 0,
      targetX: point.x,
      targetY: point.y,
      progress: 1.0,
    };

    // Add 3-point landmark data
    threePointIndices.forEach((index, i) => {
      const landmark = state.lastLandmarks[index];
      if (!landmark) {
        throw new Error(`Missing landmark ${index} for 3-point configuration`);
      }

      frameData[`landmark3_${i}_x`] = landmark.x * window.innerWidth;
      frameData[`landmark3_${i}_y`] = landmark.y * window.innerHeight;
      if (is3D) {
        frameData[`landmark3_${i}_z`] = landmark.z * 1000;
      }
    });

    // Add 6-point landmark data
    sixPointIndices.forEach((index, i) => {
      const landmark = state.lastLandmarks[index];
      if (!landmark) {
        throw new Error(`Missing landmark ${index} for 6-point configuration`);
      }

      frameData[`landmark6_${i}_x`] = landmark.x * window.innerWidth;
      frameData[`landmark6_${i}_y`] = landmark.y * window.innerHeight;
      if (is3D) {
        frameData[`landmark6_${i}_z`] = landmark.z * 1000;
      }
    });

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
  const is3D = state.config.coordinateSystem === "3d";
  const headers = [
    "calibrationPointNumber",
    "timestamp",
    "frameIndex",
    "targetX",
    "targetY",
    "predicted3X",
    "predicted3Y",
    "predicted6X",
    "predicted6Y",
  ];

  // Add headers for 3-point landmarks
  for (let i = 0; i < 3; i++) {
    headers.push(`landmark3_${i}_x`, `landmark3_${i}_y`);
    if (is3D) headers.push(`landmark3_${i}_z`);
  }

  // Add headers for 6-point landmarks
  for (let i = 0; i < 6; i++) {
    headers.push(`landmark6_${i}_x`, `landmark6_${i}_y`);
    if (is3D) headers.push(`landmark6_${i}_z`);
  }

  headers.push("progress");
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

    // Calculate 3-point transformation matrix
    console.log("Calculating matrix for 3-point configuration");
    const threePointMatrix = calculateTransformationMatrixForConfig(
      state.calibrationData.landmarkPoints3,
      state.calibrationData.cursorPositions,
      "3"
    );

    if (!threePointMatrix) {
      throw new Error("Failed to calculate 3-point transformation matrix");
    }
    state.transformationMatrices.threePoint = threePointMatrix;
    console.log("3-point matrix calculated successfully");

    // Calculate 6-point transformation matrix
    console.log("Calculating matrix for 6-point configuration");
    const sixPointMatrix = calculateTransformationMatrixForConfig(
      state.calibrationData.landmarkPoints6,
      state.calibrationData.cursorPositions,
      "6"
    );

    if (!sixPointMatrix) {
      throw new Error("Failed to calculate 6-point transformation matrix");
    }
    state.transformationMatrices.sixPoint = sixPointMatrix;
    console.log("6-point matrix calculated successfully");

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
    state.isTracking = true;

    // Clean up calibration UI
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
    updateCursor();

    // Update status display
    const statusMessage = residualAnalysis
      ? `Calibration complete - tracking active (RMSE: ${residualAnalysis.rmse.toFixed(
          2
        )} px)`
      : "Calibration complete - tracking active";
    document.getElementById("status").textContent = statusMessage;

    console.log("Calibration completed successfully");
    return true;
  } catch (error) {
    // Log the complete error with stack trace
    console.error("Error during finishCalibration:", error);
    console.error("Error stack:", error.stack);

    // Log the state for debugging
    console.error("Calibration state at error:", {
      dataCollectionLength: state.dataCollection.calibrationData.length,
      landmarkPoints3: state.calibrationData?.landmarkPoints3?.length,
      landmarkPoints6: state.calibrationData?.landmarkPoints6?.length,
      cursorPositions: state.calibrationData?.cursorPositions?.length,
    });

    // Reset state and clean up
    state.isCalibrating = false;
    state.isTracking = false;
    state.transformationMatrices = {
      threePoint: null,
      sixPoint: null,
    };

    // Clear calibration data
    clearCalibrationData();

    // Update status with error message
    document.getElementById("status").textContent =
      "Error completing calibration: " + error.message;

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