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
    return [33, 133, 362];
  } else {
    // Extended set using specific points for better tracking
    return [4, 61, 152, 159, 291, 386];
  }
}

function landmarksToVector(landmarks) {
  if (!landmarks) return null;

  try {
    const indices = getLandmarkIndices();
    let vector = [];
    const quadraticScale = 0.00001; // Uniform scaling for quadratic terms

    // Choose vector construction based on coordinate system setting
    if (state.config.coordinateSystem === "2d") {
      indices.forEach((index) => {
        const landmark = landmarks[index];
        if (
          !landmark ||
          typeof landmark.x === "undefined" ||
          typeof landmark.y === "undefined"
        ) {
          return null;
        }

        const x = landmark.x * window.innerWidth;
        const y = landmark.y * window.innerHeight;

        // Linear terms
        vector.push([x]); // x term
        vector.push([y]); // y term

        // Quadratic terms
        vector.push([x * x * quadraticScale]); // x² term
        vector.push([y * y * quadraticScale]); // y² term
      });
    } else {
      // 3D mode
      indices.forEach((index) => {
        const landmark = landmarks[index];
        if (
          !landmark ||
          typeof landmark.x === "undefined" ||
          typeof landmark.y === "undefined" ||
          typeof landmark.z === "undefined"
        ) {
          return null;
        }

        const x = landmark.x * window.innerWidth;
        const y = landmark.y * window.innerHeight;
        const z = landmark.z * 1000; // Scale Z appropriately

        // Linear terms
        vector.push([x]); // x term
        vector.push([y]); // y term
        vector.push([z]); // z term

        // Quadratic terms
        vector.push([x * x * quadraticScale]); // x² term
        vector.push([y * y * quadraticScale]); // y² term
        vector.push([z * z * quadraticScale]); // z² term

        // Cross terms for 3D
        vector.push([x * y * quadraticScale]); // xy term
        vector.push([y * z * quadraticScale]); // yz term
        vector.push([x * z * quadraticScale]); // xz term
      });
    }

    return vector;
  } catch (error) {
    console.error("Error in landmarksToVector:", error);
    return null;
  }
}

function calculateTransformationMatrix() {
  try {
    console.log("Starting transformation matrix calculation...");
    console.log("Coordinate system:", state.config.coordinateSystem);
    console.log("Landmark points:", state.config.landmarkPoints);

    const totalPoints = state.calibrationData.landmarkPoints.length;
    if (totalPoints === 0) {
      throw new Error("No calibration points available");
    }

    console.log(`Using ${totalPoints} points for transformation calculation`);

    // Calculate dimensions based on coordinate system and number of landmarks
    const is3D = state.config.coordinateSystem === "3d";
    const termsPerLandmark = is3D ? 9 : 4; // 3D: (x,y,z, x²,y²,z², xy,yz,xz) or 2D: (x,y, x²,y²)
    const numLandmarks = state.config.landmarkPoints === "3" ? 3 : 6;
    const totalRows = termsPerLandmark * numLandmarks;

    let P = Array.from({ length: totalRows }, () =>
      new Array(totalPoints).fill(0)
    );

    for (let j = 0; j < totalPoints; j++) {
      const landmarkData = state.calibrationData.landmarkPoints[j];
      if (!landmarkData || landmarkData.length !== totalRows) {
        throw new Error(`Invalid landmark data at calibration point ${j}`);
      }
      for (let i = 0; i < totalRows; i++) {
        P[i][j] = landmarkData[i][0];
      }
    }

    let Q = Array.from({ length: 2 }, () => new Array(totalPoints).fill(0));
    for (let j = 0; j < totalPoints; j++) {
      const pos = state.calibrationData.cursorPositions[j];
      if (!pos || pos.length !== 2) {
        throw new Error(`Invalid cursor position at calibration point ${j}`);
      }
      Q[0][j] = pos[0][0];
      Q[1][j] = pos[1][0];
    }

    const matP = math.matrix(P);
    const matQ = math.matrix(Q);
    const PT = math.transpose(matP);
    const PPT = math.multiply(matP, PT);

    // Adjust regularization based on number of landmarks
    const lambda = 0.01 * (totalPoints / 20) * (numLandmarks / 3);
    const I = math.identity(totalRows);
    const regularizedPPT = math.add(PPT, math.multiply(lambda, I));
    const PPTInv = math.inv(regularizedPPT);
    const QPT = math.multiply(matQ, PT);
    const B = math.multiply(QPT, PPTInv);

    debugMatrixDimensions(matP, "P");
    debugMatrixDimensions(matQ, "Q");
    debugMatrixDimensions(B, "B");

    return B.toArray();
  } catch (error) {
    console.error("Error in transformation calculation:", error);
    return null;
  }
}

function transformCoordinates(landmarks) {
  if (!state.transformationMatrix || !landmarks) return null;

  const landmarkVector = landmarksToVector(landmarks);
  if (!landmarkVector) return null;

  try {
    const P = math.matrix(landmarkVector);
    const B = math.matrix(state.transformationMatrix);
    const Q = math.multiply(B, P);
    return Q.toArray();
  } catch (error) {
    console.error("Error in coordinate transformation:", error);
    return null;
  }
}

// Make functions globally available
window.landmarksToVector = landmarksToVector;
window.calculateTransformationMatrix = calculateTransformationMatrix;
window.transformCoordinates = transformCoordinates;
