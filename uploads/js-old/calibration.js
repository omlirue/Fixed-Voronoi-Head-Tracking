function startCalibration() {
  console.log("Starting calibration...");

  state.isCalibrating = true;
  state.isTracking = false;
  state.currentCalibrationPoint = 0;
  state.calibrationData = {
    landmarkPoints: [],
    cursorPositions: [],
  };
  state.transformationMatrix = null;
  state.previousPosition = null;
  state.currentPosition = null;
  state.isLineAnimating = false;

  // Initialize data collection
  state.dataCollection.calibrationData = [];

  // Generate grid points before showing the first point
  generateGridPoints();

  // Show calibration UI
  document.getElementById("calibration-ui").classList.remove("hidden");

  // Show the first calibration point
  showNextCalibrationPoint();
}

function recordFrame(startPoint, endPoint, progress, frameIndex) {
  if (!state.lastLandmarks) return;

  const currentTime = performance.now();

  // Calculate current position using the same progress for both coordinates
  const targetX = startPoint.x + (endPoint.x - startPoint.x) * progress;
  const targetY = startPoint.y + (endPoint.y - startPoint.y) * progress;

  // Get chosen landmark indices
  const indices = getLandmarkIndices();

  // Create frame data
  const frameData = {
    videoNumber: state.dataCollection.videoNumber,
    calibrationPointNumber: state.currentCalibrationPoint + 1,
    timestamp: currentTime,
    frameIndex: frameIndex,
    targetX: targetX,
    targetY: targetY,
  };

  // Add data for each landmark
  indices.forEach((index, i) => {
    const landmark = state.lastLandmarks[index];
    frameData[`landmark${i}_x`] = landmark.x * window.innerWidth;
    frameData[`landmark${i}_y`] = landmark.y * window.innerHeight;
    if (state.config.coordinateSystem === "3d") {
      frameData[`landmark${i}_z`] = landmark.z;
    }
  });

  frameData.progress = progress;

  // Add to data collection for CSV
  state.dataCollection.calibrationData.push(frameData);

  // Add point for transformation matrix calculation
  const landmarkVector = landmarksToVector(state.lastLandmarks);
  if (landmarkVector) {
    state.calibrationData.landmarkPoints.push(landmarkVector);
    state.calibrationData.cursorPositions.push([[targetX], [targetY]]);
  }
}

function showNextCalibrationPoint() {
  const point = getNextGridPosition();
  if (!point) {
    finishCalibration();
    return;
  }

  const calibrationUI = document.getElementById("calibration-ui");

  // Update the previous target to dark red before creating a new one
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

  // Update progress display
  const currentPointText = document.getElementById("current-point-text");
  if (currentPointText) {
    currentPointText.textContent = state.gridConfig.currentIndex + 1;
  }

  // Only handle animation if in animation mode
  if (state.config.animationStyle === "with-line" && state.currentPosition) {
    animateLine(state.currentPosition, point);
  }

  // Update the current position
  state.currentPosition = point;
}

function recordCalibrationPoint(point) {
  if (!state.lastLandmarks) return;

  const indices = getLandmarkIndices();
  const frameData = {
    videoNumber: state.dataCollection.videoNumber,
    calibrationPointNumber: state.gridConfig.currentIndex + 1,
    timestamp: performance.now(),
    frameIndex: 0,
    targetX: point.x,
    targetY: point.y,
  };

  // Add data for each landmark
  indices.forEach((index, i) => {
    const landmark = state.lastLandmarks[index];
    frameData[`landmark${i}_x`] = landmark.x * window.innerWidth;
    frameData[`landmark${i}_y`] = landmark.y * window.innerHeight;
    if (state.config.coordinateSystem === "3d") {
      frameData[`landmark${i}_z`] = landmark.z;
    }
  });

  frameData.progress = 1;

  // Add to data collection for CSV
  state.dataCollection.calibrationData.push(frameData);

  // Add point for transformation matrix calculation
  const landmarkVector = landmarksToVector(state.lastLandmarks);
  if (landmarkVector) {
    state.calibrationData.landmarkPoints.push(landmarkVector);
    state.calibrationData.cursorPositions.push([[point.x], [point.y]]);
  }
}

function captureCalibrationPoint() {
  if (
    !state.lastLandmarks ||
    (state.config.animationStyle === "with-line" && state.isLineAnimating)
  )
    return;

  const currentPoint = state.currentPosition;
  if (!currentPoint) return;

  // Remove previous target and line
  const oldTarget = document.getElementById("old-target");
  const line = document.getElementById("calibration-line");
  const circle = document.getElementById("line-tip-circle");

  if (oldTarget) oldTarget.remove();
  if (line) line.style.opacity = "0";
  if (circle) circle.style.opacity = "0";

  // Record point when Enter is pressed in non-animation mode
  if (state.config.animationStyle === "without-line") {
    recordCalibrationPoint(currentPoint);
  }

  state.gridConfig.currentIndex++;
  showNextCalibrationPoint();
}

function animateLine(startPoint, endPoint) {
  const line = document.getElementById("calibration-line");
  if (!line) return;

  // Create or get the circle element
  let circle = document.getElementById("line-tip-circle");
  if (!circle) {
    circle = document.createElement("div");
    circle.id = "line-tip-circle";
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

  const speedPerFrame = 2.2;
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

  if (typeof exportCalibrationData === "function") {
    exportCalibrationData();
  }

  state.dataCollection.calibrationData = [];
  console.log(
    "Calibration data points:",
    state.calibrationData.landmarkPoints.length
  );

  state.transformationMatrix = calculateTransformationMatrix();
  console.log("Calculated transformation matrix:", state.transformationMatrix);

  if (state.transformationMatrix) {
    state.isCalibrating = false;
    state.isTracking = true;

    document.getElementById("calibration-ui").classList.add("hidden");
    document.getElementById("status").textContent =
      "Calibration complete - tracking active";

    if (!document.getElementById("head-cursor")) {
      const cursor = document.createElement("div");
      cursor.id = "head-cursor";
      cursor.style.left = "0px";
      cursor.style.top = "0px";
      document.body.appendChild(cursor);
    }

    const line = document.getElementById("calibration-line");
    if (line) {
      line.style.opacity = "0";
    }

    console.log("Calibration completed successfully");
  } else {
    document.getElementById("status").textContent =
      "Calibration failed - please try again";
    console.error("Failed to calculate transformation matrix");

    state.isCalibrating = false;
    state.isTracking = false;
    clearCalibrationData();
  }
}

function clearCalibrationData() {
  state.calibrationData = {
    landmarkPoints: [],
    cursorPositions: [],
  };
  state.currentCalibrationPoint = 0;
  state.transformationMatrix = null;
  state.previousPosition = null;
  state.currentPosition = null;
  state.isLineAnimating = false;
  state.dataCollection.calibrationData = [];
  state.gridConfig.currentIndex = 0;
}

// Make functions globally available
window.startCalibration = startCalibration;
window.captureCalibrationPoint = captureCalibrationPoint;
window.showNextCalibrationPoint = showNextCalibrationPoint;
window.animateLine = animateLine;
window.finishCalibration = finishCalibration;
window.clearCalibrationData = clearCalibrationData;
