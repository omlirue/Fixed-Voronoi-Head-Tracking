function generateGridPoints() {
  // Reset grid configuration
  state.gridConfig = {
    rows: 4,
    cols: 5,
    points: [],
    randomizedOrder: [],
    currentIndex: 0,
    cornerIndices: [] // Track corner points
  };

  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const margin = Math.min(screenWidth, screenHeight) * 0.05;  // Reduced to 5% for more extreme points
  
  // Create fixed grid positions
  for (let row = 0; row < state.gridConfig.rows; row++) {
    for (let col = 0; col < state.gridConfig.cols; col++) {
      let x, y;
      
      // Handle extreme points at corners
      if (row === 0 && col === 0) {               // Top-left
        x = margin;
        y = margin;
        state.gridConfig.cornerIndices.push(state.gridConfig.points.length);
      } else if (row === 0 && col === state.gridConfig.cols - 1) {  // Top-right
        x = screenWidth - margin;
        y = margin;
        state.gridConfig.cornerIndices.push(state.gridConfig.points.length);
      } else if (row === state.gridConfig.rows - 1 && col === 0) {  // Bottom-left
        x = margin;
        y = screenHeight - margin;
        state.gridConfig.cornerIndices.push(state.gridConfig.points.length);
      } else if (row === state.gridConfig.rows - 1 && col === state.gridConfig.cols - 1) {  // Bottom-right
        x = screenWidth - margin;
        y = screenHeight - margin;
        state.gridConfig.cornerIndices.push(state.gridConfig.points.length);
      } else {
        // Regular grid points
        x = margin + ((screenWidth - 2 * margin) * col / (state.gridConfig.cols - 1));
        y = margin + ((screenHeight - 2 * margin) * row / (state.gridConfig.rows - 1));
      }
      
      state.gridConfig.points.push({ x, y, isCorner: state.gridConfig.cornerIndices.includes(state.gridConfig.points.length) });
    }
  }

  // Randomize the order (but keep center point first)
  randomizeOrder();
}

function randomizeOrder() {
  const centerIndex = 7;  // Center point (row 1, col 2 in a 4x5 grid)
  
  // Create array of all indices except center
  const indices = Array.from({ length: 20 }, (_, i) => i)
    .filter(i => i !== centerIndex);
  
  // Shuffle all points except center using Fisher-Yates
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  // Set final order with center point first
  state.gridConfig.randomizedOrder = [centerIndex, ...indices];
  state.gridConfig.currentIndex = 0;
}

function getNextGridPosition() {
  if (state.gridConfig.currentIndex >= 20) {
    return null;
  }

  const pointIndex = state.gridConfig.randomizedOrder[state.gridConfig.currentIndex];
  const position = state.gridConfig.points[pointIndex];

  const progress = (((state.gridConfig.currentIndex + 1) / 20) * 100).toFixed(1);
  console.log(`Calibration Progress: ${progress}%`);
  console.log(`Current point: ${position.isCorner ? 'Corner' : 'Grid'} at (${position.x}, ${position.y})`);

  return position;
}

// Make functions globally available
window.generateGridPoints = generateGridPoints;
window.randomizeOrder = randomizeOrder;
window.getNextGridPosition = getNextGridPosition;