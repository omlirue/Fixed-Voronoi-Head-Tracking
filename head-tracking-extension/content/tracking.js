// tracking.js
function createReferenceGrid() {
  const gridContainer = document.createElement("div");
  gridContainer.id = "reference-grid";
  gridContainer.style.position = "fixed";
  gridContainer.style.top = "0";
  gridContainer.style.left = "0";
  gridContainer.style.width = "100%";
  gridContainer.style.height = "100%";
  gridContainer.style.pointerEvents = "none";
  gridContainer.style.zIndex = "998";

  const rows = 5;
  const cols = 7;
  const circleSize = 40;

  // Add margins to keep circles fully visible
  const margin = circleSize;

  // Calculate usable space
  const usableWidth = window.innerWidth - 2 * margin;
  const usableHeight = window.innerHeight - 2 * margin;

  // Calculate spacing between circles
  const spacingX = usableWidth / (cols - 1);
  const spacingY = usableHeight / (rows - 1);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const circle = document.createElement("div");
      circle.style.position = "absolute";
      circle.style.width = `${circleSize}px`;
      circle.style.height = `${circleSize}px`;
      circle.style.borderRadius = "50%";
      circle.style.border = "2px solid #333333";
      circle.style.left = `${margin + spacingX * col - circleSize / 2}px`;
      circle.style.top = `${margin + spacingY * row - circleSize / 2}px`;
      gridContainer.appendChild(circle);
    }
  }

  document.body.appendChild(gridContainer);
}

// Initialize filters when starting tracking
function initializeFilters() {
  const config = {
    frequency: 60,
    minCutoff: 1.5, // Lower cutoff for smoother results
    beta: 0.007, // Slower acceleration response
    dcutoff: 1.0,
  };

  state.filterConfig = config;

  // Use same parameters for both X and Y
  state.xFilter = new OneEuroFilter(
    config.frequency,
    config.minCutoff,
    config.beta,
    config.dCutoff
  );

  state.yFilter = new OneEuroFilter(
    config.frequency,
    config.minCutoff,
    config.beta,
    config.dCutoff
  );

  if (state.lastHeadX !== null) {
    const timestamp = performance.now() / 1000;
    state.xFilter.filter(state.lastHeadX, timestamp);
    state.yFilter.filter(state.lastHeadY, timestamp);
  }
}

const cursorSize = 20; // Adjust this value based on your cursor's actual size in pixels

function updateCursor() {
  if (state.isTracking && state.lastLandmarks) {
    try {
      // Get current landmark configuration
      const currentConfig = state.config.landmarkPoints;
      const landmarks = state.lastLandmarks;

      // Create vector based on current configuration
      let vector = [];
      const indices =
        currentConfig === "3" ? [1, 33, 263] : [1, 61, 291, 152, 33, 263];
      const is3D = state.config.coordinateSystem === "3d";
      const quadraticScale = 0.00001;

      // Build landmark vector
      indices.forEach((index) => {
        const landmark = landmarks[index];
        if (!landmark) return;

        const x = landmark.x * window.innerWidth;
        const y = landmark.y * window.innerHeight;

        // Add base coordinates
        vector.push([x]);
        vector.push([y]);
        if (is3D && landmark.z !== undefined) {
          vector.push([landmark.z * 1000]);
        }

        // Add quadratic terms
        vector.push([x * x * quadraticScale]);
        vector.push([y * y * quadraticScale]);
        if (is3D && landmark.z !== undefined) {
          vector.push([landmark.z * landmark.z * quadraticScale]);
        }
      });

      // Get appropriate transformation matrix
      const matrix =
        currentConfig === "3"
          ? state.transformationMatrices.threePoint
          : state.transformationMatrices.sixPoint;

      if (!matrix) {
        console.error("No transformation matrix available");
        return;
      }

      // Calculate cursor position
      const P = math.matrix(vector);
      const B = math.matrix(matrix);
      const Q = math.multiply(B, P);
      const position = Q.toArray();

      const headPositionX = position[0][0];
      const headPositionY = position[1][0];

      // Apply filtering based on selected filter type
      if (state.config.filterType === "oneEuro") {
        const timestamp = performance.now() / 1000;

        // Initialize filters if needed
        if (!state.xFilter || !state.yFilter) {
          state.lastHeadX = headPositionX;
          state.lastHeadY = headPositionY;
          initializeFilters();
          return;
        }

        // Apply 1€ filter
        const filteredX = state.xFilter.filter(headPositionX, timestamp);
        const filteredY = state.yFilter.filter(headPositionY, timestamp);

        // Update cursor directly (no extra smoothing - One Euro filter handles it)
        state.cursorX = filteredX;
        state.cursorY = filteredY;

        // Add rounding here like in old version
        const roundedX = Math.round(state.cursorX);
        const roundedY = Math.round(state.cursorY);
        updateCursorPosition(roundedX, roundedY);
      } else {
        // Exponential smoothing
        if (state.lastHeadX === null) {
          state.lastHeadX = headPositionX;
          state.cursorX = headPositionX;
          state.rawCursorX = headPositionX;
        }
        if (state.lastHeadY === null) {
          state.lastHeadY = headPositionY;
          state.cursorY = headPositionY;
          state.rawCursorY = headPositionY;
        }

        // Get cursor elements
        let cursorWithClipping = document.getElementById("head-cursor-clipped");
        let cursorWithoutClipping = document.getElementById("head-cursor-raw");

        if (!cursorWithClipping || !cursorWithoutClipping) {
          console.error("Cursor elements not found");
          return;
        }

        // Apply stronger smoothing to raw cursor (blue)
        const rawSmoothing = 0.95;
        const rawCurrentX =
          parseFloat(cursorWithoutClipping.style.left) || headPositionX;
        const rawCurrentY =
          parseFloat(cursorWithoutClipping.style.top) || headPositionY;

        const rawSmoothedX =
          rawCurrentX + (headPositionX - rawCurrentX) * (1 - rawSmoothing);
        const rawSmoothedY =
          rawCurrentY + (headPositionY - rawCurrentY) * (1 - rawSmoothing);

        cursorWithoutClipping.style.left = `${Math.round(rawSmoothedX)}px`;
        cursorWithoutClipping.style.top = `${Math.round(rawSmoothedY)}px`;

        // Calculate relative movement with smaller increments
        const deltaX = (headPositionX - state.lastHeadX) * 0.8;
        const deltaY = (headPositionY - state.lastHeadY) * 0.8;

        // Update cursor position with relative movement
        state.cursorX += deltaX;
        state.cursorY += deltaY;

        // Apply bounds using old calculation
        state.cursorX = Math.max(
          0,
          Math.min(window.innerWidth - cursorSize, state.cursorX)
        );
        state.cursorY = Math.max(
          0,
          Math.min(window.innerHeight - cursorSize, state.cursorY)
        );

        // Apply stronger smoothing to clipped cursor (red)
        const smoothing = 0.95;
        const currentX =
          parseFloat(cursorWithClipping.style.left) || state.cursorX;
        const currentY =
          parseFloat(cursorWithClipping.style.top) || state.cursorY;

        const smoothedX =
          currentX + (state.cursorX - currentX) * (1 - smoothing);
        const smoothedY =
          currentY + (state.cursorY - currentY) * (1 - smoothing);

        // Update clipped cursor position
        cursorWithClipping.style.left = `${Math.round(smoothedX)}px`;
        cursorWithClipping.style.top = `${Math.round(smoothedY)}px`;
      }

      // Update last positions
      state.lastHeadX = headPositionX;
      state.lastHeadY = headPositionY;
    } catch (error) {
      console.error("Error updating cursor:", error);
    }
  }
  requestAnimationFrame(updateCursor);
}

function updateCursorPosition(x, y) {
  const cursorSize = 20; // Size of cursor in pixels

  // Create or get cursor elements
  let cursorWithoutClipping = document.getElementById("head-cursor-raw");
  if (!cursorWithoutClipping) {
    cursorWithoutClipping = document.createElement("div");
    cursorWithoutClipping.id = "head-cursor-raw";
    cursorWithoutClipping.style.position = "fixed";
    cursorWithoutClipping.style.width = `${cursorSize}px`;
    cursorWithoutClipping.style.height = `${cursorSize}px`;
    cursorWithoutClipping.style.borderRadius = "50%";
    cursorWithoutClipping.style.backgroundColor = "blue";
    cursorWithoutClipping.style.opacity = "0.5";
    cursorWithoutClipping.style.zIndex = "999";
    cursorWithoutClipping.style.pointerEvents = "none";
    cursorWithoutClipping.style.transform = "translate(-50%, -50%)";
    document.body.appendChild(cursorWithoutClipping);
  }

  let cursorWithClipping = document.getElementById("head-cursor-clipped");
  if (!cursorWithClipping) {
    cursorWithClipping = document.createElement("div");
    cursorWithClipping.id = "head-cursor-clipped";
    cursorWithClipping.style.position = "fixed";
    cursorWithClipping.style.width = `${cursorSize}px`;
    cursorWithClipping.style.height = `${cursorSize}px`;
    cursorWithClipping.style.borderRadius = "50%";
    cursorWithClipping.style.backgroundColor = "red";
    cursorWithClipping.style.zIndex = "1000";
    cursorWithClipping.style.pointerEvents = "none";
    cursorWithClipping.style.transform = "translate(-50%, -50%)";
    document.body.appendChild(cursorWithClipping);
  }

  // Apply positions
  const boundedX = Math.max(0, Math.min(window.innerWidth - cursorSize, x));
  const boundedY = Math.max(0, Math.min(window.innerHeight - cursorSize, y));

  cursorWithoutClipping.style.left = `${x}px`;
  cursorWithoutClipping.style.top = `${y}px`;
  cursorWithClipping.style.left = `${boundedX}px`;
  cursorWithClipping.style.top = `${boundedY}px`;
}

// Make functions globally available
window.updateCursor = updateCursor;
window.updateCursorPosition = updateCursorPosition;

// Make functions globally available
window.updateCursor = updateCursor;
window.createReferenceGrid = createReferenceGrid;