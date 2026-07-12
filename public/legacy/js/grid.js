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

  // Set the order: corners first, then center, then row-wise
  setCalibrationOrder();
}

function setCalibrationOrder() {
  // Define center point slightly higher than exact center
  const centerRow = Math.floor(state.gridConfig.rows / 2) - 0.5;  // Move up by half a row
  const centerCol = Math.floor(state.gridConfig.cols / 2);
  // Since we need integer indices, we'll round down for the centerRow
  const centerIndex = Math.floor(centerRow) * state.gridConfig.cols + centerCol;
  
  // Create a custom sequence with balanced directions
  const order = [];
  
  // Start with center point
  order.push(centerIndex);
  
  // Create a function to get an index from row and column
  const getIndex = (row, col) => {
    // Ensure row and col are within bounds
    row = Math.max(0, Math.min(row, state.gridConfig.rows - 1));
    col = Math.max(0, Math.min(col, state.gridConfig.cols - 1));
    return row * state.gridConfig.cols + col;
  };
  
  // Define a sequence with mixed directions from center
  // This creates a pattern that alternates between horizontal, vertical, and diagonal movements
  const sequence = [
    // From center to corners with intermediate points
    { row: Math.floor(centerRow), col: centerCol + 2 },      // Horizontal right
    { row: Math.floor(centerRow) - 1, col: centerCol - 2 },  // Diagonal top-left
    { row: Math.floor(centerRow) + 2, col: centerCol },      // Vertical down
    { row: Math.floor(centerRow) - 2, col: centerCol + 1 },  // Diagonal top-right
    
    // Corner points
    { row: 0, col: 0 },                                      // Top-left corner
    { row: Math.floor(centerRow) + 1, col: centerCol - 1 },  // Diagonal bottom-left
    { row: 0, col: state.gridConfig.cols - 1 },              // Top-right corner
    { row: Math.floor(centerRow), col: centerCol - 2 },      // Horizontal left
    
    { row: state.gridConfig.rows - 1, col: 0 },              // Bottom-left corner
    { row: Math.floor(centerRow) - 1, col: centerCol + 1 },  // Diagonal top-right
    { row: state.gridConfig.rows - 1, col: state.gridConfig.cols - 1 }, // Bottom-right corner
    { row: Math.floor(centerRow) + 1, col: centerCol + 2 },  // Diagonal bottom-right
    
    // More grid points with mixed directions
    { row: 1, col: 2 },                                      // Mid-top
    { row: 2, col: 4 },                                      // Mid-right
    { row: 3, col: 1 },                                      // Mid-bottom
    { row: 0, col: 3 },                                      // Top-mid-right
    { row: 2, col: 0 },                                      // Mid-left
    { row: 1, col: 4 },                                      // Top-right (not corner)
    { row: 3, col: 3 }                                       // Bottom-mid-right
  ];
  
  // Add the sequence to the order
  sequence.forEach(pos => {
    const index = getIndex(pos.row, pos.col);
    if (!order.includes(index)) {
      order.push(index);
    }
  });
  
  // If we don't have all 20 points, add any missing ones
  for (let i = 0; i < state.gridConfig.rows * state.gridConfig.cols; i++) {
    if (!order.includes(i)) {
      order.push(i);
    }
  }
  
  // Ensure we have exactly 20 points
  order.length = Math.min(order.length, state.gridConfig.rows * state.gridConfig.cols);
  
  state.gridConfig.randomizedOrder = order;
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
window.setCalibrationOrder = setCalibrationOrder;
window.getNextGridPosition = getNextGridPosition;