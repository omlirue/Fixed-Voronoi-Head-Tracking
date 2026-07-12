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

function initializeCursors() {
  // Remove existing cursors
  ["head-cursor-clipped", "head-cursor-raw"].forEach(id => {
    const existing = document.getElementById(id);
    if (existing) existing.remove();
  });

  // Reset cursor state
  state.lastHeadX = null;
  state.lastHeadY = null;
  state.cursorX = null;
  state.cursorY = null;
  state.rawCursorX = null;
  state.rawCursorY = null;

  // Create cursors with consistent styles
  const cursors = [
    { id: "head-cursor-clipped", color: "red", zIndex: "1000" },
    { id: "head-cursor-raw", color: "blue", opacity: "0.5", zIndex: "999" }
  ];

  cursors.forEach(({ id, color, opacity = "1", zIndex }) => {
    const cursor = document.createElement("div");
    cursor.id = id;
    cursor.style.position = "fixed";
    cursor.style.width = "20px";
    cursor.style.height = "20px";
    cursor.style.borderRadius = "50%";
    cursor.style.backgroundColor = color;
    cursor.style.opacity = opacity;
    cursor.style.zIndex = zIndex;
    cursor.style.transform = "translate(-50%, -50%)";
    cursor.style.pointerEvents = "none";
    document.body.appendChild(cursor);
  });

  // Initialize positions at center
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  cursors.forEach(({ id }) => {
    const cursor = document.getElementById(id);
    cursor.style.left = `${centerX}px`;
    cursor.style.top = `${centerY}px`;
  });
}

function determineConfiguration(headers) {
  const config = {
    coordinateSystem: "2d",
    landmarkPoints: "3",
    filterType: "exponential",
    useRotation: false
  };

  // Improved 3D coordinate detection
  const has3DCoordinates = headers.some(header => 
    header.includes("_z") || 
    header.includes("landmark3_2_z") || 
    header.includes("landmark6_2_z")
  );
  
  if (has3DCoordinates) {
    config.coordinateSystem = "3d";
    console.log("Detected 3D coordinates in calibration data");
  }

  // Determine number of landmarks
  const landmarkCount = Math.max(
    headers.filter(h => h.match(/landmark3_\d+_x/)).length,
    headers.filter(h => h.match(/landmark6_\d+_x/)).length
  );

  if (landmarkCount > 3) {
    config.landmarkPoints = "6";
  }
  
  // Detect rotation data (yaw, pitch, roll)
  const hasRotation = headers.includes("yaw") && headers.includes("pitch") && headers.includes("roll");
  if (hasRotation) {
    config.useRotation = true;
    console.log("Detected rotation data (yaw, pitch, roll) in calibration file");
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

// Add our own implementation of residual calculation
function calculateResidualsDirectly() {
  try {
    if (!state.calibrationData || 
        !state.calibrationData.cursorPositions ||
        !state.transformationMatrices) {
      console.warn("calculateResidualsDirectly: missing data");
      return null;
    }
    
    const numLandmarks = state.config.landmarkPoints === "3" ? 3 : 6;
    
    const rawLandmarks = numLandmarks === 3 ? 
      state.calibrationData.landmarkPoints3 : 
      state.calibrationData.landmarkPoints6;
    
    if (!rawLandmarks || !rawLandmarks.length) {
      console.warn("calculateResidualsDirectly: no landmark data");
      return null;
    }

    // Use calculateTransformationMatrixForConfig's own approach:
    // It builds a P matrix internally from the raw data and solves B*P=Q.
    // To get the exact same residuals, we replicate its P-matrix construction
    // and multiply B*p for each column.
    // 
    // Simplest correct approach: call the same function that trains the matrix
    // to build the P matrix, then multiply. But we don't have access to the
    // internal P matrix.
    //
    // Instead, use the fact that the NATIVE-mode matrix was trained directly
    // with the raw landmark data. The raw data includes bias, and the function
    // handles it. We just need to match the matrix to the data format.
    //
    // Strategy: try each available matrix with the raw data. The one that
    // was trained with the raw data will produce small residuals (training error).
    
    // Try matrices in order of preference
    const matricesToTry = [];
    
    if (numLandmarks === 3) {
      // Try 3D matrix first (raw data is always in 3D format)
      if (state.transformationMatrices.threePoint3d) matricesToTry.push({ name: 'threePoint3d', m: state.transformationMatrices.threePoint3d });
      if (state.transformationMatrices.threePoint) matricesToTry.push({ name: 'threePoint', m: state.transformationMatrices.threePoint });
      if (state.transformationMatrices.threePoint2d) matricesToTry.push({ name: 'threePoint2d', m: state.transformationMatrices.threePoint2d });
    } else {
      if (state.transformationMatrices.sixPoint3d) matricesToTry.push({ name: 'sixPoint3d', m: state.transformationMatrices.sixPoint3d });
      if (state.transformationMatrices.sixPoint) matricesToTry.push({ name: 'sixPoint', m: state.transformationMatrices.sixPoint });
      if (state.transformationMatrices.sixPoint2d) matricesToTry.push({ name: 'sixPoint2d', m: state.transformationMatrices.sixPoint2d });
    }
    
    if (matricesToTry.length === 0) {
      console.warn("calculateResidualsDirectly: no matrices available");
      return null;
    }
    
    const actualPositions = state.calibrationData.cursorPositions.map(pos => ({
      x: pos[0][0], y: pos[1][0]
    }));
    
    let bestResult = null;
    
    for (const { name, m } of matricesToTry) {
      try {
        const matrixCols = math.size(math.matrix(m)).valueOf()[1];
        
        let sumSqErr = 0, sumErr = 0, maxErr = 0, count = 0;
        
        for (let i = 0; i < rawLandmarks.length; i++) {
          const rawPoint = rawLandmarks[i];
          
          // Adjust input to match matrix width
          let inputVector = rawPoint;
          if (rawPoint.length > matrixCols) {
            inputVector = rawPoint.slice(0, matrixCols);
          } else if (rawPoint.length < matrixCols) {
            // Pad with zeros (missing rotation terms)
            inputVector = [...rawPoint];
            while (inputVector.length < matrixCols) inputVector.push([0]);
          }
          
          const result = math.multiply(m, inputVector);
          const predX = result[0][0];
          const predY = result[1][0];
          
          const dx = predX - actualPositions[i].x;
          const dy = predY - actualPositions[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          sumSqErr += dist * dist;
          sumErr += dist;
          maxErr = Math.max(maxErr, dist);
          count++;
        }
        
        if (count > 0) {
          const rmse = Math.sqrt(sumSqErr / count);
          const meanError = sumErr / count;
          
          console.log(`calculateResidualsDirectly [${name}]: RMSE=${rmse.toFixed(2)}, mean=${meanError.toFixed(2)}, max=${maxErr.toFixed(2)}, cols=${matrixCols}, dataLen=${rawLandmarks[0].length}`);
          
          // Keep the result with lowest RMSE (the matrix that actually matches the data)
          if (!bestResult || rmse < bestResult.rmse) {
            bestResult = { rmse, meanError, maxError: maxErr };
          }
        }
      } catch (err) {
        console.warn(`calculateResidualsDirectly: ${name} failed:`, err.message);
      }
    }
    
    if (bestResult) {
      console.log("calculateResidualsDirectly best result:", bestResult);
    }
    
    return bestResult;
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
      state.transformationMatrices = {
          threePoint: calculateTransformationMatrixForConfig(
              processedData.landmarkPoints3,
              processedData.cursorPositions,
              "3"
          ),
          sixPoint: calculateTransformationMatrixForConfig(
              processedData.landmarkPoints6,
              processedData.cursorPositions,
              "6"
          )
      };

      // Store in coordinate-system-specific locations
      if (nativeCoordinateSystem === "2d") {
          state.transformationMatrices.threePoint2d = state.transformationMatrices.threePoint;
          state.transformationMatrices.sixPoint2d = state.transformationMatrices.sixPoint;
          
          // Now calculate 3D matrices
          console.log("Pre-calculating 3D matrices");
          
          // Temporarily switch to 3D mode for calculation
          config.coordinateSystem = "3d";
          state.config.coordinateSystem = "3d";
          
          try {
              state.transformationMatrices.threePoint3d = calculateTransformationMatrixForConfig(
                  processedData.landmarkPoints3,
                  processedData.cursorPositions,
                  "3"
              );
              
              state.transformationMatrices.sixPoint3d = calculateTransformationMatrixForConfig(
                  processedData.landmarkPoints6,
                  processedData.cursorPositions,
                  "6"
              );
              
              console.log("Successfully pre-calculated 3D matrices");
          } catch (error) {
              console.error("Error pre-calculating 3D matrices:", error);
              
              // Fall back to conversion if direct calculation fails
              if (window.convert2DMatrixTo3D) {
                  console.log("Trying 2D to 3D matrix conversion");
                  state.transformationMatrices.threePoint3d = window.convert2DMatrixTo3D(
                      state.transformationMatrices.threePoint2d, 3
                  );
                  state.transformationMatrices.sixPoint3d = window.convert2DMatrixTo3D(
                      state.transformationMatrices.sixPoint2d, 6
                  );
              }
              
              // Final fallback - copy 2D matrices if all else fails
              if (!state.transformationMatrices.threePoint3d) {
                  console.warn("Using 2D matrices for 3D as fallback");
                  state.transformationMatrices.threePoint3d = state.transformationMatrices.threePoint2d;
                  state.transformationMatrices.sixPoint3d = state.transformationMatrices.sixPoint2d;
              }
          }
      } else {
          // For 3D native files
          state.transformationMatrices.threePoint3d = state.transformationMatrices.threePoint;
          state.transformationMatrices.sixPoint3d = state.transformationMatrices.sixPoint;
          
          // Now calculate 2D matrices
          console.log("Pre-calculating 2D matrices");
          
          // Temporarily switch to 2D mode for calculation
          config.coordinateSystem = "2d";
          state.config.coordinateSystem = "2d";
          
          try {
              state.transformationMatrices.threePoint2d = calculateTransformationMatrixForConfig(
                  processedData.landmarkPoints3,
                  processedData.cursorPositions,
                  "3"
              );
              
              state.transformationMatrices.sixPoint2d = calculateTransformationMatrixForConfig(
                  processedData.landmarkPoints6,
                  processedData.cursorPositions,
                  "6"
              );
              
              console.log("Successfully pre-calculated 2D matrices");
          } catch (error) {
              console.error("Error pre-calculating 2D matrices:", error);
              
              // Fall back to 3D matrices if calculation fails
              console.warn("Using 3D matrices for 2D as fallback");
              state.transformationMatrices.threePoint2d = state.transformationMatrices.threePoint3d;
              state.transformationMatrices.sixPoint2d = state.transformationMatrices.sixPoint3d;
          }
      }

      // Default to 2D mode after file upload (users can switch to 3D if needed)
      // This is more intuitive since most users expect 2D tracking
      config.coordinateSystem = "2d";
      state.config.coordinateSystem = "2d";
      console.log("Defaulting to 2D coordinate system after file upload (native was:", nativeCoordinateSystem, ")");

      // Calculate rotation-only matrix if rotation-only mode was used
      if (config.rotationOnlyMode && processedData.rotationOnlyPoints && processedData.rotationOnlyPoints.length > 0) {
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

      // CRITICAL FIX: Calculate NoRotation matrices if file had rotation enabled
      // This allows switching between "landmarks only" and "landmarks+rotation" modes
      if (config.useRotation) {
          console.log("🔄 Calculating NoRotation matrices for landmarks-only mode...");
          
          // Helper function to strip rotation terms from landmark vectors
          const stripRotationTerms = (points, numLandmarks) => {
              return points.map(point => {
                  if (!point || !Array.isArray(point)) return null;
                  
                  // Each point structure: [bias=1, ...landmarks, yaw, pitch, roll]
                  // 3D has 6 terms per landmark (x, y, z, x², y², z²)
                  // We need to keep: [bias=1, ...landmarks] and strip [yaw, pitch, roll]
                  const termsPerLandmark = 6; // Always 6 for 3D format
                  const biasTerms = 1;
                  const rotationTerms = 3;
                  const landmarkTerms = numLandmarks * termsPerLandmark;
                  const totalWithRotation = biasTerms + landmarkTerms + rotationTerms;
                  
                  // Check if point has rotation terms
                  if (point.length >= totalWithRotation) {
                      // Strip rotation terms (last 3 elements)
                      return point.slice(0, biasTerms + landmarkTerms);
                  }
                  return point; // Already doesn't have rotation
              }).filter(p => p !== null);
          };
          
          // Temporarily disable rotation in config for matrix calculation
          const savedUseRotation = state.config.useRotation;
          state.config.useRotation = false;
          
          try {
              // Strip rotation terms from 3-point and 6-point data
              const landmarks3NoRot = stripRotationTerms(processedData.landmarkPoints3, 3);
              const landmarks6NoRot = stripRotationTerms(processedData.landmarkPoints6, 6);
              
              console.log("  Processing 3-point NoRotation data:", {
                  originalLength: processedData.landmarkPoints3[0]?.length,
                  strippedLength: landmarks3NoRot[0]?.length,
                  count: landmarks3NoRot.length
              });
              
              // Calculate 2D NoRotation matrices
              state.config.coordinateSystem = "2d";
              
              if (landmarks3NoRot.length > 0) {
                  const matrix3_2d = calculateTransformationMatrixForConfig(
                      landmarks3NoRot,
                      processedData.cursorPositions,
                      "3"
                  );
                  if (matrix3_2d) {
                      state.transformationMatrices.threePoint2dNoRotation = matrix3_2d;
                      const dims = math.size(math.matrix(matrix3_2d)).valueOf();
                      console.log(`  ✅ threePoint2dNoRotation: ${dims[0]}×${dims[1]}`);
                  }
              }
              
              if (landmarks6NoRot.length > 0) {
                  const matrix6_2d = calculateTransformationMatrixForConfig(
                      landmarks6NoRot,
                      processedData.cursorPositions,
                      "6"
                  );
                  if (matrix6_2d) {
                      state.transformationMatrices.sixPoint2dNoRotation = matrix6_2d;
                      const dims = math.size(math.matrix(matrix6_2d)).valueOf();
                      console.log(`  ✅ sixPoint2dNoRotation: ${dims[0]}×${dims[1]}`);
                  }
              }
              
              // Calculate 3D NoRotation matrices
              state.config.coordinateSystem = "3d";
              
              if (landmarks3NoRot.length > 0) {
                  const matrix3_3d = calculateTransformationMatrixForConfig(
                      landmarks3NoRot,
                      processedData.cursorPositions,
                      "3"
                  );
                  if (matrix3_3d) {
                      state.transformationMatrices.threePoint3dNoRotation = matrix3_3d;
                      const dims = math.size(math.matrix(matrix3_3d)).valueOf();
                      console.log(`  ✅ threePoint3dNoRotation: ${dims[0]}×${dims[1]}`);
                  }
              }
              
              if (landmarks6NoRot.length > 0) {
                  const matrix6_3d = calculateTransformationMatrixForConfig(
                      landmarks6NoRot,
                      processedData.cursorPositions,
                      "6"
                  );
                  if (matrix6_3d) {
                      state.transformationMatrices.sixPoint3dNoRotation = matrix6_3d;
                      const dims = math.size(math.matrix(matrix6_3d)).valueOf();
                      console.log(`  ✅ sixPoint3dNoRotation: ${dims[0]}×${dims[1]}`);
                  }
              }
              
              console.log("✅ NoRotation matrices calculated for landmarks-only mode");
          } catch (error) {
              console.error("Error calculating NoRotation matrices:", error);
          } finally {
              // Restore config
              state.config.useRotation = savedUseRotation;
              state.config.coordinateSystem = "2d"; // Reset to 2d as default
          }
      }

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
      landmarkPoints3: [],
      landmarkPoints6: [],
      cursorPositions: [],
      allPoints: [],
      rotationOnlyPoints: [] // For rotation-only mode
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

  data.forEach((row, index) => {
      try {
          if (!row.targetX || !row.targetY) {
              console.warn(`Missing target coordinates in row ${index}`);
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

          // Process 3-point landmarks
          const threePointVector = [[1.0]]; // Bias term
          let validThreePoint = true;

          // Handle 3-point landmarks
          for (let i = 0; i < 3; i++) {
              const x = row[`landmark3_${i}_x`];
              const y = row[`landmark3_${i}_y`];
              // Always read z even if in 2D mode (makes it more robust when switching)
              const z = row[`landmark3_${i}_z`] || 0;
              
              if (typeof x === 'undefined' || typeof y === 'undefined') {
                  console.warn(`Missing data for 3-point landmark ${i}`);
                  validThreePoint = false;
                  break;
              }

              threePointVector.push([x], [y]);
              // Always include z in the vector (for compatibility with 3D mode)
              threePointVector.push([z]);
              
              // Add quadratic terms (must match calibration.js scale: 0.00001 for all)
              threePointVector.push([x * x * 0.00001], [y * y * 0.00001]);
              threePointVector.push([z * z * 0.00001]);
          }

          // Process 6-point landmarks
          const sixPointVector = [[1.0]]; // Bias term
          let validSixPoint = true;

          // Handle 6-point landmarks
          for (let i = 0; i < 6; i++) {
              const x = row[`landmark6_${i}_x`];
              const y = row[`landmark6_${i}_y`];
              // Always read z even if in 2D mode
              const z = row[`landmark6_${i}_z`] || 0;
              
              if (typeof x === 'undefined' || typeof y === 'undefined') {
                  console.warn(`Missing data for 6-point landmark ${i}`);
                  validSixPoint = false;
                  break;
              }

              sixPointVector.push([x], [y]);
              // Always include z in the vector
              sixPointVector.push([z]);
              
              // Add quadratic terms (must match calibration.js scale: 0.00001 for all)
              sixPointVector.push([x * x * 0.00001], [y * y * 0.00001]);
              sixPointVector.push([z * z * 0.00001]);
          }

          // Add rotation data if available
          if (config.useRotation && typeof row.yaw !== 'undefined' && typeof row.pitch !== 'undefined' && typeof row.roll !== 'undefined') {
              // Convert degrees to radians and scale to match position feature magnitude
              const DEG2RAD = Math.PI / 180;
              const ANGLE_SCALE = 1000;
              threePointVector.push([row.yaw * DEG2RAD * ANGLE_SCALE]);
              threePointVector.push([row.pitch * DEG2RAD * ANGLE_SCALE]);
              threePointVector.push([row.roll * DEG2RAD * ANGLE_SCALE]);
              
              sixPointVector.push([row.yaw * DEG2RAD * ANGLE_SCALE]);
              sixPointVector.push([row.pitch * DEG2RAD * ANGLE_SCALE]);
              sixPointVector.push([row.roll * DEG2RAD * ANGLE_SCALE]);
              
              // Add rotation-only data if in rotation-only mode
              if (config.rotationOnlyMode) {
                  const DEG2RAD = Math.PI / 180;
                  const ANGLE_SCALE = 1000; // Match calibration scaling
                  
                  // Apply screen-size adaptive rotation gain
                  // IMPORTANT: Use ORIGINAL screen width to match tracking code!
                  // The tracking code uses calibrationWidth (original), so import must match.
                  const screenWidth = originalWidth || window.innerWidth;
                  const ROTATION_GAIN = Math.min(4.0, Math.max(1.0, (screenWidth / 1920) * 1.5));
                  
                  const yaw = row.yaw * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN;
                  const pitch = row.pitch * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN;
                  const roll = row.roll * DEG2RAD * ANGLE_SCALE * ROTATION_GAIN;
                  
                  const rotationOnlyVector = [
                      [1.0], // Bias term
                      [yaw],
                      [pitch],
                      [roll]
                  ];
                  processedData.rotationOnlyPoints.push(rotationOnlyVector);
              }
          }

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
  if (!processedData.landmarkPoints3.length || 
      !processedData.landmarkPoints6.length || 
      !processedData.cursorPositions.length) {
      throw new Error("No valid calibration points found in data");
  }

  console.log("Processed calibration data:", {
      points3: processedData.landmarkPoints3.length,
      points6: processedData.landmarkPoints6.length,
      cursorPositions: processedData.cursorPositions.length,
      is3D: is3D,
      sampleAllPoint: processedData.allPoints[0] // Log sample for debugging
  });

  return processedData;
}

function calculateCalibrationResiduals() {
  try {
    if (!state.calibrationData || !state.transformationMatrices) {
      console.warn("Cannot calculate residuals: missing calibration data or transformation matrices");
      return null;
    }

    const { landmarkPoints3, landmarkPoints6, cursorPositions } = state.calibrationData;
    const currentPoints = state.config.landmarkPoints === "3" ? landmarkPoints3 : landmarkPoints6;
    const currentMatrix = state.config.landmarkPoints === "3" 
      ? state.transformationMatrices.threePoint 
      : state.transformationMatrices.sixPoint;
    
    if (!currentPoints || !currentPoints.length || !currentMatrix) {
      console.warn("Cannot calculate residuals: missing points or transformation matrix");
      return null;
    }

    // Calculate predicted cursor positions using our transformation matrix
    const predictedPositions = currentPoints.map(point => {
      const result = math.multiply(currentMatrix, point);
      return [result[0][0], result[1][0]]; // Extract x, y as simple array
    });

    // Get actual cursor positions
    const actualPositions = cursorPositions.map(pos => [pos[0][0], pos[1][0]]);

    // Calculate residuals (Euclidean distance between predicted and actual)
    const residuals = predictedPositions.map((pred, i) => {
      const actual = actualPositions[i];
      const dx = pred[0] - actual[0];
      const dy = pred[1] - actual[1];
      return Math.sqrt(dx * dx + dy * dy);
    });

    // Calculate statistics
    const meanResidual = residuals.reduce((sum, val) => sum + val, 0) / residuals.length;
    const maxResidual = Math.max(...residuals);
    
    console.log("Calculated residuals:", {
      mean: meanResidual.toFixed(2),
      max: maxResidual.toFixed(2),
      individual: residuals.map(r => r.toFixed(2))
    });

    return {
      mean: meanResidual,
      max: maxResidual,
      individual: residuals
    };
  } catch (error) {
    console.error("Error calculating residuals:", error);
    return null;
  }
}

// Make functions globally available
window.initDB = initDB;
window.handleCalibrationUpload = handleCalibrationUpload;
window.initializeDriveAPI = initializeDriveAPI;
window.uploadToDrive = uploadToDrive;
window.saveToIndexedDB = saveToIndexedDB;
window.calculateResidualsDirectly = calculateResidualsDirectly;