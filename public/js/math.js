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


// Make functions globally available
window.calculateTransformationMatrixForConfig = calculateTransformationMatrixForConfig;
window.debugMatrixDimensions = debugMatrixDimensions;