// database.js
let db;

function initDB() {
  const request = indexedDB.open("HeadTrackingDB", 1);

  request.onerror = (event) => {
    console.error("IndexedDB error:", event.target.error);
  };

  request.onupgradeneeded = (event) => {
    db = event.target.result;
    if (!db.objectStoreNames.contains("calibrationData")) {
      db.createObjectStore("calibrationData", { keyPath: "id" });
    }
  };

  request.onsuccess = (event) => {
    db = event.target.result;
  };
}

async function initializeDriveAPI() {
  try {
    const response = await fetch("/credentials/service-account.json");
    driveConfig.credentials = await response.json();
    driveConfig.isInitialized = true;
    console.log("Google Drive API initialized");
  } catch (error) {
    console.error("Failed to initialize Google Drive API:", error);
  }
}

async function uploadToDrive(csvContent) {
  if (!driveConfig.isInitialized) {
    console.error("Google Drive API not initialized");
    return;
  }

  try {
    const metadata = {
      name: `calibration_video${state.dataCollection.videoNumber}_${Date.now()}.csv`,
      mimeType: "text/csv",
    };

    const blob = new Blob([csvContent], { type: "text/csv" });
    const formData = new FormData();
    formData.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" })
    );
    formData.append("file", blob);

    const response = await fetch("YOUR_UPLOAD_ENDPOINT", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    console.log("Calibration data uploaded successfully");
  } catch (error) {
    console.error("Error uploading to Drive:", error);
  }
}

function saveToIndexedDB(videoNumber, data) {
  if (!db) return;

  const transaction = db.transaction(["calibrationData"], "readwrite");
  const store = transaction.objectStore("calibrationData");
  store.add({
    id: Date.now(),
    videoNumber: videoNumber,
    data: data,
  });
}

function determineConfiguration(headers) {
  const config = {
    landmarkPoints: "3",
    rotationOnlyMode: headers.includes("yaw") && headers.includes("pitch") && headers.includes("roll"),
  };
  
  if (config.rotationOnlyMode) {
    console.log("Detected rotation data (yaw, pitch, roll) in calibration file");
  } else {
    console.warn("⚠️ Uploaded file has no yaw/pitch/roll columns — not a valid rotation-only calibration file");
  }
  
  console.log("Determined configuration:", config);
  return config;
}

function updateConfigurationUI(config) {
  try {
      // Check if elements exist before trying to update them
      const coordRadio = document.querySelector(
          `input[name="coordinates"][value="${config.coordinateSystem}"]`
      );
      if (coordRadio) {
          coordRadio.checked = true;
      } else {
          console.warn(`Coordinate system radio button for ${config.coordinateSystem} not found`);
      }

      // Store configuration in state
      state.config = {
          ...config,
          animationStyle: "without-line", // Default to no animation for uploaded calibration
          filterType: config.filterType || "exponential" // Default to exponential if not specified
      };

      console.log("Updated configuration:", state.config);
  } catch (error) {
      console.error("Error updating configuration UI:", error);
      throw new Error("Failed to update configuration UI");
  }
}

// Create translation matric for own rotation only landmarks if it don't work ima go back to AZ, prolly because I didn't make it lmao-Jesus
function calculateResidualsDirectly() {
  try {
    if (!state.calibrationData ||
        !state.calibrationData.cursorPositions ||
        !state.calibrationData.rotationOnlyPoints ||
        !state.transformationMatrices ||
        !state.transformationMatrices.rotationOnly) {
      console.warn("calculateResidualsDirectly: missing rotation-only data or matrix");
      return null;
    }

    const rotationPoints = state.calibrationData.rotationOnlyPoints;
    const matrix = state.transformationMatrices.rotationOnly;
    const actualPositions = state.calibrationData.cursorPositions.map(pos => ({
      x: pos[0][0], y: pos[1][0]
    }));

    let sumSqErr = 0, sumErr = 0, maxErr = 0, count = 0;

    for (let i = 0; i < rotationPoints.length; i++) {
      const result = math.multiply(matrix, rotationPoints[i]);
      const dx = result[0][0] - actualPositions[i].x;
      const dy = result[1][0] - actualPositions[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      sumSqErr += dist * dist;
      sumErr += dist;
      maxErr = Math.max(maxErr, dist);
      count++;
    }

    if (count === 0) return null;

    const rmse = Math.sqrt(sumSqErr / count);
    const meanError = sumErr / count;
    console.log(`calculateResidualsDirectly [rotationOnly]: RMSE=${rmse.toFixed(2)}, mean=${meanError.toFixed(2)}, max=${maxErr.toFixed(2)}`);

    return { rmse, meanError, maxError: maxErr };
  } catch (error) {
    console.error("calculateResidualsDirectly error:", error);
    return null;
  }
}

// Override the handleCalibrationUpload function again to use our direct calculation
async function handleCalibrationUpload(file) {
  try {
      console.log("Starting calibration file upload:", file.name);
      const text = await file.text();
      
      // Extract metadata from first line
      const lines = text.split('\n');
      let metadata = {};
      
      if (!lines || !lines.length) {
          throw new Error("Empty file");
      }

      if (lines[0].startsWith('#')) {
          try {
              metadata = JSON.parse(lines[0].substring(1));
              console.log("Parsed metadata:", metadata);
              lines.shift();
          } catch (e) {
              console.warn("Failed to parse metadata:", e);
          }
      }

      const result = Papa.parse(lines.join('\n'), {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          transform: (value) => {
              if (typeof value === 'number') {
                  return Number(value.toFixed(8));
              }
              return value;
          }
      });

      if (!result.data || !result.data.length) {
          throw new Error("No data found in CSV file");
      }

      // Determine configuration
      const headers = Object.keys(result.data[0]);
      const detectedConfig = determineConfiguration(headers);
      const config = {
          ...detectedConfig,
          filterType: metadata.filterType || "exponential", // Default to exponential if not specified
          landmarkPoints: "3", // Start with 3 points, can be changed via UI
          useRotation: metadata.useRotation || detectedConfig.useRotation || false,
          rotationOnlyMode: metadata.rotationOnlyMode || false
      };

      console.log("Determined configuration:", config);

      // Update state configuration
      state.config = config;

      // Get original calibration dimensions from metadata
      const originalWidth = metadata.calibrationWidth || null;
      const originalHeight = metadata.calibrationHeight || null;
      const currentWidth = window.innerWidth;
      const currentHeight = window.innerHeight;
      
      console.log("Screen size comparison:", {
        original: originalWidth && originalHeight ? `${originalWidth}x${originalHeight}` : "unknown",
        current: `${currentWidth}x${currentHeight}`
      });

      // Process the calibration data with scaling info
      const processedData = processCalibrationData(result.data, config, {
        originalWidth,
        originalHeight,
        currentWidth,
        currentHeight
      });

      // Update state with processed data
      state.calibrationData = processedData;
      
      // IMPORTANT: Keep ORIGINAL calibration dimensions for landmark scaling during tracking!
      // The transformation matrix was trained with landmarks scaled by original dimensions.
      // Target positions are scaled to current screen, but landmark scaling must match training.
      if (originalWidth && originalHeight) {
        state.calibrationData.calibrationWidth = originalWidth;
        state.calibrationData.calibrationHeight = originalHeight;
        console.log("Using original calibration dimensions for landmark scaling:", {
          width: originalWidth,
          height: originalHeight
        });
      } else {
        // Fallback: if no original dimensions, use current (may cause issues cross-screen)
        state.calibrationData.calibrationWidth = currentWidth;
        state.calibrationData.calibrationHeight = currentHeight;
        console.warn("No original dimensions - using current screen (landmark scaling may be off)");
      }
      
      // Always calculate all matrices for both coordinate systems and point configurations
      console.log("Pre-calculating all transformation matrices");

      // First calculate matrices for the file's native coordinate system
      const nativeCoordinateSystem = config.coordinateSystem;
      console.log(`Calculating matrices for native coordinate system: ${nativeCoordinateSystem}`);

      // Calculate matrices in the native mode
      state.transformationMatrices = { rotationOnly: null };

      if (processedData.rotationOnlyPoints && processedData.rotationOnlyPoints.length > 0) {
        console.log("🔬 Calculating rotation-only matrix from loaded data...");
        try {
          const rotationOnlyMatrix = calculateTransformationMatrixForConfig(
          processedData.rotationOnlyPoints,
          processedData.cursorPositions,
          "rotation"
          );
          if (rotationOnlyMatrix) {
            state.transformationMatrices.rotationOnly = rotationOnlyMatrix;
            console.log("✅ Rotation-only matrix calculated successfully");
           } else {
            console.warn("⚠️ Failed to calculate rotation-only matrix");
           }
        } catch (error) {
          console.error("Error calculating rotation-only matrix:", error);
      }
    }

console.log("=== TRANSFORMATION MATRICES STATUS ===");
console.log("rotationOnly matrix available:", !!state.transformationMatrices.rotationOnly);

      // Verify all matrices exist
      console.log("=== TRANSFORMATION MATRICES STATUS ===");
      console.log("threePoint2d matrix available:", !!state.transformationMatrices.threePoint2d);
      console.log("sixPoint2d matrix available:", !!state.transformationMatrices.sixPoint2d);
      console.log("threePoint3d matrix available:", !!state.transformationMatrices.threePoint3d);
      console.log("sixPoint3d matrix available:", !!state.transformationMatrices.sixPoint3d);
      console.log("rotationOnly matrix available:", !!state.transformationMatrices.rotationOnly);
      console.log("threePoint2dNoRotation available:", !!state.transformationMatrices.threePoint2dNoRotation);
      console.log("sixPoint2dNoRotation available:", !!state.transformationMatrices.sixPoint2dNoRotation);
      console.log("threePoint3dNoRotation available:", !!state.transformationMatrices.threePoint3dNoRotation);
      console.log("sixPoint3dNoRotation available:", !!state.transformationMatrices.sixPoint3dNoRotation);
      
      // CRITICAL FIX: Ensure backward compatibility - set threePoint/sixPoint to match current mode
      if (state.config.coordinateSystem === "2d") {
          state.transformationMatrices.threePoint = state.transformationMatrices.threePoint2d;
          state.transformationMatrices.sixPoint = state.transformationMatrices.sixPoint2d;
          console.log("Set threePoint/sixPoint to 2D matrices for backward compatibility");
      } else {
          state.transformationMatrices.threePoint = state.transformationMatrices.threePoint3d;
          state.transformationMatrices.sixPoint = state.transformationMatrices.sixPoint3d;
          console.log("Set threePoint/sixPoint to 3D matrices for backward compatibility");
      }

      // Initialize filters
      if (config.filterType === "oneEuro") {
          initializeFilters();
      }

      // Reset cursor state
      state.lastHeadX = null;
      state.lastHeadY = null;
      state.cursorX = null;
      state.cursorY = null;

      // CRITICAL FIX: Reset rotation state to prevent old angles from bleeding into new calibration
      state.smoothedAngles = null;  // Legacy (no longer used, but kept for compatibility)
      state.lastRawAngles = null;    // Current fallback angles
      window._lastAngles = null;     // Reset angle unwrapping state
      window.estimatedFocalLength = null; // Reset focal length for new calibration
      console.log("🔄 Reset angle state to prevent state carryover from previous calibration");
      
      // Estimate focal length from current landmarks if available
      if (state.lastLandmarks && window.estimateFocalLengthFromFaceSize) {
        const width = state.calibrationData.calibrationWidth || window.innerWidth;
        const estimatedFx = estimateFocalLengthFromFaceSize(state.lastLandmarks, width);
        if (estimatedFx && estimatedFx > 0) {
          window.estimatedFocalLength = estimatedFx;
          console.log(`🎯 Auto-detected focal length from uploaded file: ${estimatedFx.toFixed(0)} pixels (${(estimatedFx/width).toFixed(2)}x screen width)`);
        }
      }

      // Calculate residuals directly and store immediately so startTracking() can find them
      const residuals = calculateResidualsDirectly();
      console.log("Calculated residuals directly:", residuals);
      
      state.calculatedResiduals = residuals;
      window.preCalculatedMetrics = residuals;
      
      // Patch window.robustCalculateResiduals to use our direct calculation
      const originalRobustCalculate = window.robustCalculateResiduals;
      window.robustCalculateResiduals = function() {
        console.log("Using direct residual calculation");
        const direct = calculateResidualsDirectly();
        if (direct) {
          return direct;
        }
        // Fall back to original implementation
        if (originalRobustCalculate) {
          return originalRobustCalculate();
        }
        return null;
      };
      
      // Also patch calculateCalibrationResiduals if it's globally available
      if (window.calculateCalibrationResiduals) {
        const originalCalculate = window.calculateCalibrationResiduals;
        window.calculateCalibrationResiduals = function() {
          console.log("Using direct residual calculation from patched function");
          const direct = calculateResidualsDirectly();
          if (direct) {
            return direct;
          }
          // Fall back to original implementation
          return originalCalculate();
        };
      }

      // Update application state
      state.isCalibrating = false;

      // Hide configuration screen
      const configScreen = document.getElementById("config-screen");
      if (configScreen) {
          configScreen.classList.add("hidden");
      }

      // Initialize cursor position at center (CRITICAL FIX)
      state.cursorX = window.innerWidth / 2;
      state.cursorY = window.innerHeight / 2;
      console.log("Initialized cursor position:", state.cursorX, state.cursorY);

      // Initialize exponential smoothing factor if using exponential filter (CRITICAL FIX)
      if (config.filterType === "exponential") {
          if (!state.config.exponentialSmoothingFactor) {
              state.config.exponentialSmoothingFactor = 0.95; // Default value
              console.log("Initialized exponential smoothing factor:", state.config.exponentialSmoothingFactor);
          }
      }

      // After calculating transformation matrices, log status
      console.log("=== FINAL TRANSFORMATION MATRICES STATUS ===");
      console.log("With rotation matrices:");
      console.log("  threePoint2d:", !!state.transformationMatrices.threePoint2d);
      console.log("  sixPoint2d:", !!state.transformationMatrices.sixPoint2d);
      console.log("  threePoint3d:", !!state.transformationMatrices.threePoint3d);
      console.log("  sixPoint3d:", !!state.transformationMatrices.sixPoint3d);
      console.log("NoRotation matrices (for landmarks-only mode):");
      console.log("  threePoint2dNoRotation:", !!state.transformationMatrices.threePoint2dNoRotation);
      console.log("  sixPoint2dNoRotation:", !!state.transformationMatrices.sixPoint2dNoRotation);
      console.log("  threePoint3dNoRotation:", !!state.transformationMatrices.threePoint3dNoRotation);
      console.log("  sixPoint3dNoRotation:", !!state.transformationMatrices.sixPoint3dNoRotation);
      console.log("Rotation-only matrix:", !!state.transformationMatrices.rotationOnly);

      // Check matrix dimensions
      if (state.transformationMatrices.threePoint2d) {
        try {
          const dims = math.size(math.matrix(state.transformationMatrices.threePoint2d));
          console.log("threePoint2d dimensions:", dims.toString());
        } catch (e) {
          console.error("Error checking threePoint2d dimensions:", e);
        }
      }

      if (state.transformationMatrices.sixPoint2d) {
        try {
          const dims = math.size(math.matrix(state.transformationMatrices.sixPoint2d));
          console.log("sixPoint2d dimensions:", dims.toString());
        } catch (e) {
          console.error("Error checking sixPoint2d dimensions:", e);
        }
      }
      
      // Check NoRotation matrix dimensions if available
      if (state.transformationMatrices.threePoint2dNoRotation) {
        try {
          const dims = math.size(math.matrix(state.transformationMatrices.threePoint2dNoRotation));
          console.log("threePoint2dNoRotation dimensions:", dims.toString());
        } catch (e) {
          console.error("Error checking threePoint2dNoRotation dimensions:", e);
        }
      }

      // Log final tracking configuration
      console.log("Final tracking configuration:", {
        coordinateSystem: state.config.coordinateSystem,
        landmarkPoints: state.config.landmarkPoints,
        filterType: state.config.filterType,
        useRotation: state.config.useRotation,
        rotationOnlyMode: state.config.rotationOnlyMode,
        cursorInitialized: state.cursorX !== null && state.cursorY !== null,
        exponentialSmoothingFactor: state.config.exponentialSmoothingFactor
      });

      // Store calibration source for experiment tracking
      state.calibrationSource = `Uploaded: ${file.name}`;
      console.log("📁 Calibration source:", state.calibrationSource);

      // CRITICAL FIX: Use the same startTracking() function as manual calibration
      // This ensures the same tracking page appears for both manual calibration and file upload
      if (window.startTracking && typeof window.startTracking === 'function') {
          console.log("✅ Calling startTracking() for consistent tracking page experience");
          window.startTracking();
      } else {
          console.error("❌ startTracking function not available! Falling back to direct setup");
          // Fallback: Initialize cursors and start tracking directly
          if (window.initializeCursors) {
              initializeCursors();
          }
          
          state.isTracking = true;
          
          // Mount tracking controls
          const controlsContainer = document.getElementById('tracking-controls-container');
          if (!controlsContainer) {
              const newContainer = document.createElement('div');
              newContainer.id = 'tracking-controls-container';
              document.body.appendChild(newContainer);
          }
          
          const container = document.getElementById('tracking-controls-container');
          if (container && window.TrackingControls && window.ReactDOM) {
              try {
                  const root = ReactDOM.createRoot(container);
                  root.render(React.createElement(window.TrackingControls));
                  console.log("✅ Tracking controls mounted (fallback)");
              } catch (error) {
                  console.error("Error mounting tracking controls:", error);
              }
          }
          
          // Start cursor tracking
          if (window.updateCursor && typeof window.updateCursor === 'function') {
              window.updateCursor();
              console.log("✅ Started cursor update loop (fallback)");
          }
      }

      return true;
  } catch (error) {
      console.error("Error processing calibration file:", error);
      document.getElementById("status").textContent = "Error loading calibration file: " + error.message;
      return false;
  }
}

function processCalibrationData(data, config, screenInfo = {}) {
  if (!data || !Array.isArray(data)) {
      console.error("Invalid data format:", data);
      throw new Error("Invalid calibration data format");
  }

  console.log("Processing calibration data with config:", config);

  const processedData = {
      rotationOnlyPoints: [],
      allPoints: [],
      cursorPositions: [],
  };

  const is3D = config.coordinateSystem === "3d";
  
  // Screen scaling info for cross-screen compatibility
  const { originalWidth, originalHeight, currentWidth, currentHeight } = screenInfo;
  const hasRelativeCoords = data.length > 0 && 
      typeof data[0].targetXRel === 'number' && 
      typeof data[0].targetYRel === 'number';
  const hasOriginalDimensions = originalWidth && originalHeight;
  
  // Log scaling strategy
  if (hasRelativeCoords) {
      console.log("📐 Using relative coordinates (targetXRel, targetYRel) - scaling to current screen");
  } else if (hasOriginalDimensions && currentWidth && currentHeight) {
      console.log(`📐 Scaling absolute coordinates from ${originalWidth}x${originalHeight} to ${currentWidth}x${currentHeight}`);
  } else {
      console.warn("⚠️ No relative coords and no original dimensions - using absolute positions as-is");
  }

  const DEG2RAD = Math.PI / 180;
  const ANGLE_SCALE = 1000; // Match calibration scaling
  const screenWidthforGain = originalWidth || window.innerWidth;
  const ROTATION_GAIN = Math.min(4.0, Math.max(1.0, (screenWidthforGain / 1920) * 1.5));

  data.forEach((row, index) => {
      try {
          if (!row.targetX || !row.targetY) {
              console.warn(`Missing target coordinates in row ${index}`);
              return;
          }

          if (typeof row.yaw == 'undefined' || typeof row.pitch == 'undefined' || typeof row.roll == 'undefined') {
              console.warn('you are missing yaw/pitch/roll ${index} - lock in');
              return;
          }
          
          // Calculate scaled target positions for cross-screen compatibility
          let scaledTargetX, scaledTargetY;
          
          if (hasRelativeCoords) {
              // Best case: use relative coordinates and scale to current screen
              scaledTargetX = row.targetXRel * currentWidth;
              scaledTargetY = row.targetYRel * currentHeight;
          } else if (hasOriginalDimensions && currentWidth && currentHeight) {
              // Fallback: scale absolute coordinates based on screen size ratio
              scaledTargetX = (row.targetX / originalWidth) * currentWidth;
              scaledTargetY = (row.targetY / originalHeight) * currentHeight;
          } else {
              // Last resort: use absolute values as-is (may not work well cross-screen)
              scaledTargetX = row.targetX;
              scaledTargetY = row.targetY;
          }

          const yaw = row.yaw * DEG2RAD * ROTATION_GAIN;
          const pitch = row.pitch * DEG2RAD * ROTATION_GAIN;
          const roll = row.roll * DEG2RAD * ROTATION_GAIN;

          processedData.rotationOnlyPoints.push([[1,0], [yaw], [pitch], [roll]]);
          processedData.rotationOnlyPoints.push([[scaledTargetX], [scaledTargetY]]);
          processedData.allPoints.push({
            targetX: scaledTargetX,
            targetY: scaledTargetY,
            yaw: row.yaw,
            pitch: row.pitch,
            roll: row.roll
          });

          // Only add valid data points
          if (validThreePoint && validSixPoint) {
              processedData.landmarkPoints3.push(threePointVector);
              processedData.landmarkPoints6.push(sixPointVector);
              // Use scaled target positions for cross-screen compatibility
              processedData.cursorPositions.push([[scaledTargetX], [scaledTargetY]]);
              
              // Add a complete point record for residual calculation
              processedData.allPoints.push({
                  targetX: scaledTargetX,  // Use scaled positions
                  targetY: scaledTargetY,  // Use scaled positions
                  landmarks3: threePointVector.map(v => v[0]),  // Flatten for easier access
                  landmarks6: sixPointVector.map(v => v[0]),    // Flatten for easier access
                  yaw: config.useRotation ? row.yaw : null,
                  pitch: config.useRotation ? row.pitch : null,
                  roll: config.useRotation ? row.roll : null
              });
          }
      } catch (error) {
          console.error(`Error processing row ${index}:`, error);
      }
  });

  // Validate processed data
  if (!processedData.rotationOnlyPoints.length || !processedData.cursorPositions.length) {
      throw new Error("No valid calibration points found in data");
  }

  console.log("Processed calibration data:", {
    rotationOnlyPoints: processedData.rotationOnlyPoints.length,
    cursorPositions: processedData.cursorPositions.length,
  });

  return processedData;
}


// Make functions globally available
window.initDB = initDB;
window.handleCalibrationUpload = handleCalibrationUpload;
window.initializeDriveAPI = initializeDriveAPI;
window.uploadToDrive = uploadToDrive;
window.saveToIndexedDB = saveToIndexedDB;
window.calculateResidualsDirectly = calculateResidualsDirectly;