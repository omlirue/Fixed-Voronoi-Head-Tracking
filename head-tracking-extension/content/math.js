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

      // Scale coordinates
      const x = landmark.x * window.innerWidth;
      const y = landmark.y * window.innerHeight;

      if (is3D) {
        if (typeof landmark.z === "undefined") {
          console.error(`Missing Z coordinate for 3D mode at index ${index}`);
          return null;
        }
        const z = landmark.z * 1000; // Scale Z appropriately

        // Add all coordinates and their quadratic terms for 3D
        vector.push([x]);
        vector.push([y]);
        vector.push([z]);
        vector.push([x * x * xyQuadraticScale]);
        vector.push([y * y * xyQuadraticScale]);
        vector.push([z * z * zQuadraticScale]);
      } else {
        // Add coordinates and quadratic terms for 2D
        vector.push([x]);
        vector.push([y]);
        vector.push([x * x * xyQuadraticScale]);
        vector.push([y * y * xyQuadraticScale]);
      }
    }

    // Validate vector length
    const expectedLength = is3D ? indices.length * 6 : indices.length * 4;
    if (vector.length !== expectedLength) {
      console.error(`Invalid vector length: ${vector.length}, expected: ${expectedLength}`);
      return null;
    }

    console.log(`Created ${is3D ? '3D' : '2D'} vector with length:`, vector.length);
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
          samplePoint: landmarkPoints?.[0]
      });

      // Basic validation
      if (!landmarkPoints || !cursorPositions || landmarkPoints.length === 0) {
          throw new Error("Missing or empty input data");
      }

      const totalPoints = landmarkPoints.length;
      const is3D = state.config.coordinateSystem === "3d";
      
      // Adjust terms per landmark based on coordinate system
      const termsPerLandmark = is3D ? 3 : 2;  // Basic terms (x,y) or (x,y,z)
      const quadraticTerms = is3D ? 3 : 2;    // Quadratic terms (x²,y²) or (x²,y²,z²)
      const totalTermsPerLandmark = termsPerLandmark + quadraticTerms;
      const numLandmarks = parseInt(configType);
      const totalRows = totalTermsPerLandmark * numLandmarks;

      console.log("Configuration:", {
          is3D,
          termsPerLandmark,
          quadraticTerms,
          totalTermsPerLandmark,
          numLandmarks,
          totalRows
      });

      // Validate first point structure
      const firstPoint = landmarkPoints[0];
      if (!firstPoint || firstPoint.length !== totalRows) {
          console.error("Data structure mismatch:", {
              expected: totalRows,
              got: firstPoint?.length,
              firstPoint
          });
          throw new Error(`Invalid data structure: expected ${totalRows} rows, got ${firstPoint?.length}`);
      }

      // Initialize P matrix
      let P = Array.from({ length: totalRows }, () => new Array(totalPoints).fill(0));

      // Fill P matrix
      for (let j = 0; j < totalPoints; j++) {
          const point = landmarkPoints[j];
          if (!point || point.length !== totalRows) {
              throw new Error(`Invalid data at point ${j}`);
          }
          for (let i = 0; i < totalRows; i++) {
              P[i][j] = point[i][0];
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
  
  // Get the correct matrix based on current configuration
  const matrix = state.config.landmarkPoints === "3" ?
    state.transformationMatrices.threePoint :
    state.transformationMatrices.sixPoint;

  if (!matrix) {
    console.error("No transformation matrix found for current configuration");
    return null;
  }

  // Add this logging to verify the matrix being used
  console.log("transformCoordinates: Using", state.config.landmarkPoints, "point matrix");

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
      const points = currentConfig === "3" ? 
          state.calibrationData.landmarkPoints3 : 
          state.calibrationData.landmarkPoints6;
      const matrix = currentConfig === "3" ? 
          state.transformationMatrices.threePoint : 
          state.transformationMatrices.sixPoint;

      if (!points || !state.calibrationData.cursorPositions || !matrix) {
          console.error("Missing required data for residual calculation");
          return null;
      }

      const residuals = [];
      let totalSquaredError = 0;
      let totalError = 0;

      // For each calibration point
      for (let i = 0; i < points.length; i++) {
          const landmarks = points[i];
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
      console.log(`Number of landmarks: ${state.config.landmarkPoints}`);
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

// Make function globally available
window.calculateCalibrationResiduals = calculateCalibrationResiduals;
// Make functions globally available
window.landmarksToVector = landmarksToVector;
window.calculateTransformationMatrixForConfig = calculateTransformationMatrixForConfig;
window.transformCoordinates = transformCoordinates;
window.debugMatrixDimensions = debugMatrixDimensions;