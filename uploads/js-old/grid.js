function generateGridPoints() {
  state.gridConfig = {
    rows: 4,
    cols: 5,
    points: [],
    cornerIndices: [],
    randomizedOrder: [],
    currentIndex: 0,
  };

  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const cellWidth = screenWidth / state.gridConfig.cols;
  const cellHeight = screenHeight / state.gridConfig.rows;
  const margin = Math.min(cellWidth, cellHeight) * 0.1;

  for (let row = 0; row < state.gridConfig.rows; row++) {
    for (let col = 0; col < state.gridConfig.cols; col++) {
      let x, y;

      // Center point remains fixed
      if (row === 1 && col === 2) {
        x = screenWidth / 2;
        y = screenHeight / 2;
      } else {
        // Randomize all other points within their cell boundaries
        const minX = col * cellWidth + margin;
        const maxX = (col + 1) * cellWidth - margin;
        const minY = row * cellHeight + margin;
        const maxY = (row + 1) * cellHeight - margin;

        x = minX + Math.random() * (maxX - minX);
        y = minY + Math.random() * (maxY - minY);
      }

      // Track if it's a corner point for reference
      const isCorner =
        (row === 0 && col === 0) ||
        (row === 0 && col === state.gridConfig.cols - 1) ||
        (row === state.gridConfig.rows - 1 && col === 0) ||
        (row === state.gridConfig.rows - 1 &&
          col === state.gridConfig.cols - 1);

      if (isCorner) {
        state.gridConfig.cornerIndices.push(row * state.gridConfig.cols + col);
      }

      state.gridConfig.points.push({ x, y, row, col, isCorner });
    }
  }

  state.totalCalibrationPoints = state.gridConfig.rows * state.gridConfig.cols;
  randomizeGridOrder();
}

function randomizeGridOrder() {
  const nonCornerIndices = Array.from({ length: 20 }, (_, i) => i).filter(
    (i) => !state.gridConfig.cornerIndices.includes(i)
  );

  for (let i = nonCornerIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nonCornerIndices[i], nonCornerIndices[j]] = [
      nonCornerIndices[j],
      nonCornerIndices[i],
    ];
  }

  state.gridConfig.randomizedOrder = [];
  const cornerPoints = state.gridConfig.cornerIndices.slice();

  // Ensure center point (row 1, col 2) is first
  const centerIndex = 7; // 1 * 5 + 2
  state.gridConfig.randomizedOrder.push(centerIndex);

  // Remove center point from non-corner indices
  const centerPointIndex = nonCornerIndices.indexOf(centerIndex);
  nonCornerIndices.splice(centerPointIndex, 1);

  // Add remaining points
  state.gridConfig.randomizedOrder.push(cornerPoints.shift());
  state.gridConfig.randomizedOrder.push(...nonCornerIndices.slice(0, 5));
  state.gridConfig.randomizedOrder.push(cornerPoints.shift());
  state.gridConfig.randomizedOrder.push(...nonCornerIndices.slice(5, 10));
  state.gridConfig.randomizedOrder.push(cornerPoints.shift());
  state.gridConfig.randomizedOrder.push(...nonCornerIndices.slice(10));
  state.gridConfig.randomizedOrder.push(cornerPoints.shift());

  state.gridConfig.currentIndex = 0;
}

function getNextGridPosition() {
  if (state.gridConfig.currentIndex >= 20) {
    return null;
  }

  const pointIndex =
    state.gridConfig.randomizedOrder[state.gridConfig.currentIndex];
  const position = state.gridConfig.points[pointIndex];

  const progress = (((state.gridConfig.currentIndex + 1) / 20) * 100).toFixed(
    1
  );
  console.log(`Calibration Progress: ${progress}%`);
  console.log(
    `Current point: ${position.isCorner ? "Corner" : "Grid"} at (${
      position.x
    }, ${position.y})`
  );

  return position;
}
