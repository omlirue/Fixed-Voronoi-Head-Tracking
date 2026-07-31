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
  return [1, 33, 263]; // nose tip, left eye, right eye
  }

function calculateTransformationMatrixForConfig(landmarkPoints, cursorPositions) {
  try {
    console.log("🔬 Calculating rotation-only matrix (4 features → 2D position):", {
      pointsCount: landmarkPoints?.length,
      cursorPositionsCount: cursorPositions?.length,
      samplePoint: landmarkPoints?.[0]
    });

    // Basic validation
    if (!landmarkPoints || !cursorPositions || landmarkPoints.length === 0) {
      throw new Error("Missing or empty input data");
    }

    const totalPoints = landmarkPoints.length;

    // Features: [1, yaw, pitch, roll] — 4 rows, one column per calibration point
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

    // P matrix: 4 rows (bias, yaw, pitch, roll) × N columns (one per calibration point)
    let P = Array.from({ length: totalRows }, () => new Array(totalPoints).fill(0));
    for (let j = 0; j < totalPoints; j++) {
      const point = landmarkPoints[j];
      for (let i = 0; i < totalRows; i++) {
        P[i][j] = point[i][0];
      }
    }

    // Q matrix: target cursor positions (2 rows × N columns)
    let Q = Array.from({ length: 2 }, () => new Array(totalPoints).fill(0));
    for (let j = 0; j < totalPoints; j++) {
      const pos = cursorPositions[j];
      Q[0][j] = pos[0][0];
      Q[1][j] = pos[1][0];
    }

    // Ridge-regularized least squares: B = Q·Pᵀ·(P·Pᵀ + λI)⁻¹
    const matP = math.matrix(P);
    const matQ = math.matrix(Q);
    const PT = math.transpose(matP);
    const PPT = math.multiply(matP, PT);

    const lambda = 0.01; // regularization — balances stability vs. range
    const I = math.identity(totalRows);
    const regularizedPPT = math.add(PPT, math.multiply(lambda, I));

    const PPTInv = math.inv(regularizedPPT);
    const QPT = math.multiply(matQ, PT);
    const B = math.multiply(QPT, PPTInv);

    console.log("✅ Successfully calculated rotation-only matrix (2×4)");
    return B.toArray();

  } catch (error) {
    console.error("Error calculating rotation-only matrix:", error);
    console.error("Stack:", error.stack);
    return null;
  }
}

window.calculateTransformationMatrixForConfig = calculateTransformationMatrixForConfig; 
// Make functions globally available
window.calculateTransformationMatrixForConfig = calculateTransformationMatrixForConfig;
window.debugMatrixDimensions = debugMatrixDimensions;