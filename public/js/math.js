function debugMatrixDimensions(matrix, name) {
  try {
    const matObj = math.matrix(matrix);
    const size = math.size(matObj).valueOf();
    console.log(`${name} dimensions:`, size);
    return true;
  } catch (error) {
    console.error(`Error creating matrix ${name}:`, error);
    console.log(`${name} data:`, matrix);
    return false;
  }
}

function getLandmarkIndices() {
  // Return appropriate landmark indices based on configuration
  if (state.config.landmarkPoints === "3") {
    // Basic set: nose tip, left eye, right eye
    return [1, 33, 263];
  } else {
    // Extended set using specific points for better tracking
    return [1, 61, 291, 152, 33, 263];
  }
}

function landmarksToVector(landmarks) {
  if (!landmarks) return null;

  try {
    const indices = getLandmarkIndices();
    let vector = [];
    const is3D = state.config.coordinateSystem === "3d";

    // Different scale factors for different dimensions
    const xyQuadraticScale = 0.00001;
    const zQuadraticScale = 0.00001;

    // Log configuration for debugging
    console.log("Creating landmark vector with config:", {
      coordinateSystem: state.config.coordinateSystem,
      numLandmarks: indices.length,
      is3D: is3D
    });

    for (const index of indices) {
      const landmark = landmarks[index];
      if (!landmark) {
        console.error(`Missing landmark at index ${index}`);
        return null;
      }

      // Validate required coordinates
      if (typeof landmark.x === "undefined" || typeof landmark.y === "undefined") {
        console.error(`Invalid landmark data at index ${index}:`, landmark);
        return null;
      }

      // Scale coordinates using calibration dimensions to maintain consistency
      // This ensures the same scale relationship regardless of current window size
      const calibrationWidth = state.calibrationData.calibrationWidth || window.innerWidth;
      const calibrationHeight = state.calibrationData.calibrationHeight || window.innerHeight;
      
      const x = landmark.x * calibrationWidth;
      const y = landmark.y * calibrationHeight;
      
      // Always get z-coordinate (default to 0 if missing)
      const z = (typeof landmark.z !== "undefined") ? landmark.z * 1000 : 0;

      // Always include z-coordinate for better compatibility between 2D and 3D modes
      vector.push([x]);
      vector.push([y]);
      vector.push([z]);  // Always include Z
      vector.push([x * x * xyQuadraticScale]);
      vector.push([y * y * xyQuadraticScale]);
      vector.push([z * z * zQuadraticScale]);  // Always include Z²
    }

    // Validate vector length
    const expectedLength = indices.length * 6;  // Always use 6 terms per landmark
    if (vector.length !== expectedLength) {
      console.error(`Invalid vector length: ${vector.length}, expected: ${expectedLength}`);
      return null;
    }

    console.log(`Created vector with length:`, vector.length);
    return vector;
  } catch (error) {
    console.error("Error in landmarksToVector:", error);
    return null;
  }
}

function calculateTransformationMatrixForConfig(landmarkPoints, cursorPositions, configType) {
  try {
      // Detailed debug logging
      console.log(`Starting ${configType}-point matrix calculation:`, {
          landmarkPointsLength: landmarkPoints?.length,
          cursorPositionsLength: cursorPositions?.length,
          samplePoint: landmarkPoints?.[0],
          useRotation: state.config.useRotation,
          rotationOnlyMode: state.config.rotationOnlyMode
      });

      // Basic validation
      if (!landmarkPoints || !cursorPositions || landmarkPoints.length === 0) {
          throw new Error("Missing or empty input data");
      }

      const totalPoints = landmarkPoints.length;
      
      // SPECIAL CASE: Rotation-only mode
      if (configType === "rotation") {
        console.log("🔬 Calculating ROTATION-ONLY matrix (4 features → 2D position)");
        
        // Features: [1, yaw, pitch, roll] - Linear model with focal length correction
        const totalRows = 4;
        
        // Validate first point structure
        const firstPoint = landmarkPoints[0];
        if (!firstPoint || firstPoint.length !== totalRows) {
          console.error("Rotation-only data structure mismatch:", {
            expected: totalRows,
            got: firstPoint?.length,
            firstPoint
          });
          throw new Error(`Invalid rotation-only data: expected ${totalRows} rows, got ${firstPoint?.length}`);
        }
        
        // Initialize P matrix (4 rows × N columns)
        let P = Array.from({ length: totalRows }, () => new Array(totalPoints).fill(0));
        
        // Fill P matrix with rotation data
        for (let j = 0; j < totalPoints; j++) {
          const point = landmarkPoints[j];
          for (let i = 0; i < totalRows; i++) {
            P[i][j] = point[i][0];
          }
        }
        
        // Initialize Q matrix (target positions)
        let Q = Array.from({ length: 2 }, () => new Array(totalPoints).fill(0));
        for (let j = 0; j < totalPoints; j++) {
          const pos = cursorPositions[j];
          Q[0][j] = pos[0][0];
          Q[1][j] = pos[1][0];
        }
        
        // Matrix operations with regularization
        const matP = math.matrix(P);
        const matQ = math.matrix(Q);
        const PT = math.transpose(matP);
        const PPT = math.multiply(matP, PT);
        
        // Regularization - Set to 0.01 for balance of stability and range
        const lambda = 0.01;
        const I = math.identity(totalRows);
        const regularizedPPT = math.add(PPT, math.multiply(lambda, I));
        
        const PPTInv = math.inv(regularizedPPT);
        const QPT = math.multiply(matQ, PT);
        const B = math.multiply(QPT, PPTInv);
        
        console.log(`✅ Successfully calculated rotation-only matrix (2×4)`);
        return B.toArray();
      }
      
      // STANDARD CASE: Landmark-based tracking
      const is3D = state.config.coordinateSystem === "3d";
      
      // Adjust terms per landmark based on coordinate system
      const termsPerLandmark = is3D ? 3 : 2;  // Basic terms (x,y) or (x,y,z)
      const quadraticTerms = is3D ? 3 : 2;    // Quadratic terms (x²,y²) or (x²,y²,z²)
      const totalTermsPerLandmark = termsPerLandmark + quadraticTerms;
      const numLandmarks = parseInt(configType);
      const expectedLandmarkRows = totalTermsPerLandmark * numLandmarks;
      const expected3DLandmarkRows = 6 * numLandmarks; // 3D always has 6 terms per landmark

      // Detect actual data format from first point
      const firstPoint = landmarkPoints[0];
      const actualLength = firstPoint?.length || 0;
      
      // Detect if data includes bias term (first element is 1.0)
      const hasBias = firstPoint && firstPoint[0] && Math.abs(firstPoint[0][0] - 1.0) < 0.001;
      
      // Calculate possible data lengths for detecting format
      // 3D data lengths (with bias):
      const data3DNoRot = 1 + expected3DLandmarkRows;      // e.g., 1+18=19 for 3-point
      const data3DWithRot = 1 + expected3DLandmarkRows + 3; // e.g., 1+18+3=22 for 3-point
      // 2D data lengths (with bias):
      const data2DNoRot = 1 + expectedLandmarkRows;         // e.g., 1+12=13 for 3-point
      const data2DWithRot = 1 + expectedLandmarkRows + 3;   // e.g., 1+12+3=16 for 3-point
      
      // Detect if data is in 3D format (regardless of requested coordinate system)
      const dataIs3D = hasBias && (actualLength === data3DNoRot || actualLength === data3DWithRot);
      
      // Detect if data has rotation terms
      const hasRotation = hasBias && (actualLength === data3DWithRot || actualLength === data2DWithRot);
      
      // Calculate indices for extracting landmark data
      const landmarkStartIndex = hasBias ? 1 : 0;
      
      // Effective landmark rows in the source data
      let effectiveLandmarkRows = dataIs3D ? expected3DLandmarkRows : expectedLandmarkRows;

      console.log("Configuration:", {
          is3D,
          termsPerLandmark,
          numLandmarks,
          expectedLandmarkRows,
          expected3DLandmarkRows,
          actualLength,
          hasBias,
          hasRotation,
          dataIs3D,
          effectiveLandmarkRows
      });

      // Determine the actual total rows for the P matrix
      // Include bias term in matrix for regression (intercept)
      const totalRows = 1 + expectedLandmarkRows + (hasRotation && state.config.useRotation ? 3 : 0);

      // Initialize P matrix with bias
      let P = Array.from({ length: totalRows }, () => new Array(totalPoints).fill(0));

      // Fill P matrix
      for (let j = 0; j < totalPoints; j++) {
          const point = landmarkPoints[j];
          if (!point) {
              throw new Error(`Invalid data at point ${j}`);
          }
          
          // Add bias term (row 0)
          P[0][j] = 1.0;
          
          // Add landmark terms
          if (dataIs3D && !is3D) {
            // Convert 3D data to 2D: extract only x, y, x², y² per landmark
            for (let lm = 0; lm < numLandmarks; lm++) {
              const srcBase = landmarkStartIndex + lm * 6; // 3D has 6 terms per landmark
              const dstBase = 1 + lm * 4; // 2D has 4 terms per landmark
              P[dstBase][j] = point[srcBase][0];       // x
              P[dstBase + 1][j] = point[srcBase + 1][0]; // y
              P[dstBase + 2][j] = point[srcBase + 3][0]; // x² (skip z)
              P[dstBase + 3][j] = point[srcBase + 4][0]; // y² (skip z²)
            }
          } else {
            // Direct copy of landmark data
            for (let i = 0; i < expectedLandmarkRows; i++) {
              const srcIdx = landmarkStartIndex + i;
              if (srcIdx < point.length) {
                P[1 + i][j] = point[srcIdx][0];
              }
            }
          }
          
          // Add rotation terms if present and enabled
          if (hasRotation && state.config.useRotation) {
            const rotationStartIdx = hasBias ? 1 + effectiveLandmarkRows : effectiveLandmarkRows;
            for (let r = 0; r < 3; r++) {
              const srcIdx = rotationStartIdx + r;
              if (srcIdx < point.length) {
                P[1 + expectedLandmarkRows + r][j] = point[srcIdx][0];
              }
            }
          }
      }

      // Initialize Q matrix (target positions)
      let Q = Array.from({ length: 2 }, () => new Array(totalPoints).fill(0));
      for (let j = 0; j < totalPoints; j++) {
          const pos = cursorPositions[j];
          if (!pos || pos.length !== 2) {
              throw new Error(`Invalid cursor position at point ${j}`);
          }
          Q[0][j] = pos[0][0];
          Q[1][j] = pos[1][0];
      }

      // Matrix operations with regularization
      const matP = math.matrix(P);
      const matQ = math.matrix(Q);
      const PT = math.transpose(matP);
      const PPT = math.multiply(matP, PT);

      // Adjust regularization based on coordinate system and points
      const lambda = is3D ? 0.02 : 0.01;
      const I = math.identity(totalRows);
      const regularizedPPT = math.add(PPT, math.multiply(lambda, I));

      const PPTInv = math.inv(regularizedPPT);
      const QPT = math.multiply(matQ, PT);
      const B = math.multiply(QPT, PPTInv);

      console.log(`Successfully calculated ${configType}-point matrix`);
      return B.toArray();

  } catch (error) {
      console.error(`Error calculating ${configType}-point matrix:`, error);
      console.error("Stack:", error.stack);
      return null;
  }
}

function transformCoordinates(landmarks) {
  if (!landmarks) return null;
  
  // Get the correct matrix based on current configuration (coordinate system + landmark points)
  const is3D = state.config.coordinateSystem === "3d";
  const matrix = state.config.landmarkPoints === "3" ?
    (is3D ? state.transformationMatrices.threePoint3d : state.transformationMatrices.threePoint2d) :
    (is3D ? state.transformationMatrices.sixPoint3d : state.transformationMatrices.sixPoint2d);

  if (!matrix) {
    console.error("No transformation matrix found for current configuration:", {
      coordinateSystem: state.config.coordinateSystem,
      landmarkPoints: state.config.landmarkPoints,
      is3D: is3D
    });
    return null;
  }

  // Add this logging to verify the matrix being used
  console.log("transformCoordinates: Using", state.config.coordinateSystem, state.config.landmarkPoints, "point matrix");

  const landmarkVector = landmarksToVector(landmarks);
  if (!landmarkVector) return null;

  try {
    const P = math.matrix(landmarkVector);
    const B = math.matrix(matrix); // Use selected matrix
    const Q = math.multiply(B, P);
    return Q.toArray();
  } catch (error) {
    console.error("Transformation error:", {
      error: error.message,
      matrixSize: math.size(matrix),
      vectorSize: landmarkVector.length
    });
    return null;
  }
}

function calculateCalibrationResiduals() {
  try {
      // Get current configuration
      const currentConfig = state.config.landmarkPoints;
      const is3D = state.config.coordinateSystem === "3d";
      
      // Select appropriate data and matrix based on configuration
      const points = currentConfig === "3" ? 
          state.calibrationData.landmarkPoints3 : 
          state.calibrationData.landmarkPoints6;
          
      const matrix = is3D ? 
          (currentConfig === "3" ? 
              state.transformationMatrices.threePoint3d : 
              state.transformationMatrices.sixPoint3d) :
          (currentConfig === "3" ? 
              state.transformationMatrices.threePoint2d : 
              state.transformationMatrices.sixPoint2d);

      if (!points || !state.calibrationData.cursorPositions || !matrix) {
          console.error("Missing required data for residual calculation", {
              hasPoints: !!points,
              hasCursorPositions: !!state.calibrationData.cursorPositions,
              hasMatrix: !!matrix,
              is3D,
              currentConfig
          });
          return null;
      }

      const residuals = [];
      let totalSquaredError = 0;
      let totalError = 0;
      
      const numLandmarks = currentConfig === "3" ? 3 : 6;
      // Expected landmark terms: 6 per landmark for 3D (x, y, z, x², y², z²), 4 per landmark for 2D (x, y, x², y²)
      const expectedLandmarkTerms = is3D ? numLandmarks * 6 : numLandmarks * 4;

      // For each calibration point
      for (let i = 0; i < points.length; i++) {
          let landmarks;
          
          if (!is3D) {
              // 2D mode: convert the 3D data to 2D format (x, y, x², y² per landmark)
              landmarks = [];
              
              for (let j = 0; j < numLandmarks; j++) {
                  const baseIndex = j * 6;
                  landmarks.push([points[i][baseIndex][0]]);     // x
                  landmarks.push([points[i][baseIndex + 1][0]]); // y
                  landmarks.push([points[i][baseIndex + 3][0]]); // x²
                  landmarks.push([points[i][baseIndex + 4][0]]); // y²
              }
          } else {
              // 3D mode: use full 3D data but strip rotation terms if present
              // Raw data may have rotation terms appended (yaw, pitch, roll)
              // Matrix was calculated with only landmark terms, so we must strip rotation
              const rawPoint = points[i];
              
              if (rawPoint.length > expectedLandmarkTerms) {
                  // Strip rotation terms - take only the first expectedLandmarkTerms
                  landmarks = rawPoint.slice(0, expectedLandmarkTerms);
              } else {
                  landmarks = rawPoint;
              }
          }

          // CRITICAL FIX: Add bias term (matrices were trained with bias at index 0)
          landmarks.unshift([1.0]);

          const targetPos = state.calibrationData.cursorPositions[i];

          const P = math.matrix(landmarks);
          const B = math.matrix(matrix);
          const predictedPos = math.multiply(B, P).toArray();

          const dx = predictedPos[0][0] - targetPos[0][0];
          const dy = predictedPos[1][0] - targetPos[1][0];
          const error = Math.sqrt(dx * dx + dy * dy);

          totalSquaredError += error * error;
          totalError += error;

          residuals.push({
              pointNumber: i + 1,
              targetX: targetPos[0][0],
              targetY: targetPos[1][0],
              predictedX: predictedPos[0][0],
              predictedY: predictedPos[1][0],
              error: error,
          });
      }

      const rmse = Math.sqrt(totalSquaredError / residuals.length);
      const meanError = totalError / residuals.length;
      const maxError = Math.max(...residuals.map((r) => r.error));

      console.log("=== Calibration Residuals Analysis ===");
      console.log(`Configuration: ${is3D ? '3D' : '2D'} ${currentConfig}-point`);
      console.log(`RMSE: ${rmse.toFixed(2)} pixels`);
      console.log(`Mean Error: ${meanError.toFixed(2)} pixels`);
      console.log(`Total Error: ${totalError.toFixed(2)} pixels`);
      console.log(`Max Error: ${maxError.toFixed(2)} pixels`);
      console.log("\nDetailed residuals for each point:", residuals);

      return {
          residuals,
          rmse,
          meanError,
          totalError,
          maxError,
      };
  } catch (error) {
      console.error("Error calculating residuals:", error);
      return null;
  }
}

// Calculate residuals for end points only
function calculateEndPointResiduals() {
  try {
    // Get current configuration
    const currentConfig = state.config.landmarkPoints;
    const is3D = state.config.coordinateSystem === "3d";
    
    // Select appropriate data and matrix based on configuration
    const points = currentConfig === "3" ? 
      state.calibrationData.landmarkPoints3 : 
      state.calibrationData.landmarkPoints6;
        
    const matrix = is3D ? 
      (currentConfig === "3" ? 
        state.transformationMatrices.threePoint3d : 
        state.transformationMatrices.sixPoint3d) :
      (currentConfig === "3" ? 
        state.transformationMatrices.threePoint2d : 
        state.transformationMatrices.sixPoint2d);

    if (!points || !state.calibrationData.cursorPositions || !matrix) {
      console.error("Missing required data for end point residual calculation");
      return null;
    }

    // Determine end point indices
    let endPointIndices = [];
    
    if (state.calibrationData.endPointIndices && state.calibrationData.endPointIndices.length > 0) {
      // Use existing indices if available
      endPointIndices = state.calibrationData.endPointIndices;
      console.log("Using explicitly marked end points:", endPointIndices.length);
    } else {
      // For older data without explicit end point marking:
      // Group points by their target positions (rounded to nearest integer to handle slight variations)
      const targetPositionMap = new Map();
      
      state.calibrationData.cursorPositions.forEach((pos, index) => {
        // Create a key from rounded target position
        const key = `${Math.round(pos[0][0])},${Math.round(pos[1][0])}`;
        
        // Store the latest index for each position
        targetPositionMap.set(key, index);
      });
      
      // Use the last point for each unique target position
      endPointIndices = Array.from(targetPositionMap.values());
      console.log("Using last point for each grid position:", endPointIndices.length);
    }

    const residuals = [];
    let totalSquaredError = 0;
    let totalError = 0;
    
    const numLandmarks = currentConfig === "3" ? 3 : 6;
    // Expected landmark terms: 6 per landmark for 3D (x, y, z, x², y², z²), 4 per landmark for 2D (x, y, x², y²)
    const expectedLandmarkTerms = is3D ? numLandmarks * 6 : numLandmarks * 4;

    // Only process end points
    for (const i of endPointIndices) {
      if (i >= points.length) continue; // Skip if index is out of bounds
      
      let landmarks;
      
      if (!is3D) {
        // 2D mode: convert the 3D data to 2D format: [bias, x, y, x², y²] per landmark
        landmarks = [[1.0]]; // bias term - matrices are trained with bias in row 0
        
        for (let j = 0; j < numLandmarks; j++) {
          const baseIndex = j * 6;
          landmarks.push([points[i][baseIndex][0]]);     // x
          landmarks.push([points[i][baseIndex + 1][0]]); // y
          landmarks.push([points[i][baseIndex + 3][0]]); // x²
          landmarks.push([points[i][baseIndex + 4][0]]); // y²
        }
      } else {
        // 3D mode: add bias + landmark terms, strip rotation terms if present
        const rawPoint = points[i];
        
        landmarks = [[1.0]]; // bias term - matrices are trained with bias in row 0
        const landmarkOnly = rawPoint.length > expectedLandmarkTerms 
          ? rawPoint.slice(0, expectedLandmarkTerms) 
          : rawPoint;
        for (let k = 0; k < landmarkOnly.length; k++) {
          landmarks.push(landmarkOnly[k]);
        }
      }

      const targetPos = state.calibrationData.cursorPositions[i];

      const P = math.matrix(landmarks);
      const B = math.matrix(matrix);
      const predictedPos = math.multiply(B, P).toArray();

      const dx = predictedPos[0][0] - targetPos[0][0];
      const dy = predictedPos[1][0] - targetPos[1][0];
      const error = Math.sqrt(dx * dx + dy * dy);

      totalSquaredError += error * error;
      totalError += error;

      residuals.push({
        pointNumber: i + 1,
        targetX: targetPos[0][0],
        targetY: targetPos[1][0],
        predictedX: predictedPos[0][0],
        predictedY: predictedPos[1][0],
        error: error,
      });
    }

    if (residuals.length === 0) {
      console.warn("No end point residuals calculated - no end points found");
      return null;
    }

    const rmse = Math.sqrt(totalSquaredError / residuals.length);
    const meanError = totalError / residuals.length;
    const maxError = Math.max(...residuals.map((r) => r.error));

    console.log("=== End Point Residuals Analysis ===");
    console.log(`Configuration: ${is3D ? '3D' : '2D'} ${currentConfig}-point`);
    console.log(`RMSE: ${rmse.toFixed(2)} pixels`);
    console.log(`Mean Error: ${meanError.toFixed(2)} pixels`);
    console.log(`Total Error: ${totalError.toFixed(2)} pixels`);
    console.log(`Max Error: ${maxError.toFixed(2)} pixels`);
    console.log(`End Points Analyzed: ${residuals.length}`);
    console.log("\nDetailed residuals for end points:", residuals);

    return {
      residuals,
      rmse,
      meanError,
      totalError,
      maxError,
      count: residuals.length
    };
  } catch (error) {
    console.error("Error calculating end point residuals:", error);
    return null;
  }
}

// Add a function to create a compatible 3D transformation matrix from 2D data
function convert2DMatrixTo3D(matrix2D, landmarkCount) {
  try {
    console.log("Converting 2D matrix to 3D format");
    
    // Verify the input matrix dimensions
    const matrixSize = math.size(math.matrix(matrix2D));
    const expectedWidth = landmarkCount === 3 ? 12 : 24;
    
    if (matrixSize[1] !== expectedWidth) {
      console.error(`Invalid 2D matrix dimensions for conversion: expected width ${expectedWidth}, got ${matrixSize[1]}`);
      return null;
    }
    
    // Extract the core transformation coefficients from 2D matrix
    // In a 2D matrix, we have rows that transform x,y coordinates
    const xCoefficients = matrix2D[0]; // First row controls x output
    const yCoefficients = matrix2D[1]; // Second row controls y output
    
    // Create a new 3D matrix (adding z = 0 mapping)
    // For each landmark in 2D we have 4 coefficients: x, y, x², y²
    // For each landmark in 3D we need 6 coefficients: x, y, z, x², y², z²
    
    // For 3-point setup: need matrix with 2×18 dimensions
    // For 6-point setup: need matrix with 2×36 dimensions
    
    // Create empty arrays with correct capacity
    const xRow = new Array(landmarkCount * 6).fill(0);
    const yRow = new Array(landmarkCount * 6).fill(0);
    
    // For each landmark, map the 2D coefficients to 3D positions
    for (let i = 0; i < landmarkCount; i++) {
      const baseIdx2D = i * 4; // Each landmark has 4 coefficients in 2D
      const baseIdx3D = i * 6; // Each landmark will have 6 coefficients in 3D
      
      // Copy x, y coefficients
      xRow[baseIdx3D] = xCoefficients[baseIdx2D];     // x coefficient for x output
      xRow[baseIdx3D + 1] = xCoefficients[baseIdx2D + 1]; // y coefficient for x output
      xRow[baseIdx3D + 2] = 0;                        // z coefficient for x output (zero)
      
      yRow[baseIdx3D] = yCoefficients[baseIdx2D];     // x coefficient for y output
      yRow[baseIdx3D + 1] = yCoefficients[baseIdx2D + 1]; // y coefficient for y output
      yRow[baseIdx3D + 2] = 0;                        // z coefficient for y output (zero)
      
      // Copy quadratic terms
      xRow[baseIdx3D + 3] = xCoefficients[baseIdx2D + 2]; // x² coefficient for x output
      xRow[baseIdx3D + 4] = xCoefficients[baseIdx2D + 3]; // y² coefficient for x output
      xRow[baseIdx3D + 5] = 0;                        // z² coefficient for x output (zero)
      
      yRow[baseIdx3D + 3] = yCoefficients[baseIdx2D + 2]; // x² coefficient for y output
      yRow[baseIdx3D + 4] = yCoefficients[baseIdx2D + 3]; // y² coefficient for y output
      yRow[baseIdx3D + 5] = 0;                        // z² coefficient for y output (zero)
    }
    
    // Build the matrix
    const matrix3D = [xRow, yRow];
    
    // Verify the output matrix dimensions
    const outputSize = math.size(math.matrix(matrix3D));
    const expectedColumns = landmarkCount * 6;
    if (outputSize[0] !== 2 || outputSize[1] !== expectedColumns) {
      console.error(`Invalid output matrix dimensions: got ${outputSize}, expected [2,${expectedColumns}]`);
      return null;
    }
    
    console.log(`Successfully converted 2D matrix to 3D format with dimensions [2,${expectedColumns}]`);
    return matrix3D;
  } catch (error) {
    console.error("Error converting 2D matrix to 3D:", error);
    return null;
  }
}

// Make function globally available
window.calculateCalibrationResiduals = calculateCalibrationResiduals;
// Make functions globally available
window.landmarksToVector = landmarksToVector;
window.calculateTransformationMatrixForConfig = calculateTransformationMatrixForConfig;
window.transformCoordinates = transformCoordinates;
window.debugMatrixDimensions = debugMatrixDimensions;
window.calculateEndPointResiduals = calculateEndPointResiduals;
// Make the function globally available
window.convert2DMatrixTo3D = convert2DMatrixTo3D;