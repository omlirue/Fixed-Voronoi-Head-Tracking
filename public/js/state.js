// state.js
if (typeof window !== 'undefined' && !window.state) {
  window.state = {
      // Camera and tracking elements
      faceMesh: null,
      camera: null,
      videoElement: null,
      lastLandmarks: null,
      
      // NEW: Smooth head pose from FaceLandmarker transformation matrix
      lastTransformMatrix: null,  // Raw matrix from MediaPipe
      lastMatrixAngles: null,     // Pre-computed smooth angles {yaw, pitch, roll}

      // Calibration state
      isCalibrating: false,
      isTracking: false,
      currentCalibrationPoint: 0,
      previousPosition: null,
      currentPosition: null,
      isLineAnimating: false,

      // Grid configuration
      gridConfig: {
          rows: 8,
          cols: 5,
          points: [],
          randomizedOrder: [],
          currentIndex: 0,
          cornerIndices: [],
      },

      // Data collection
      dataCollection: {
          calibrationData: [],
          videoNumber: 1,
          isRecording: false,
          startTime: null,

          // Cell-selection task log (Voronoi dwell-selection experiment)
          taskLog: [],
          participant: null,
          condition: null,
          runStartTime: null,
          lastSelectionTime: null,
      },

      // Application configuration
      config: {
          coordinateSystem: "2d",
          landmarkPoints: "3",
          animationStyle: "without-line",
          useRotation: true,
          rotationOnlyMode: true
      },

      calibrationData: {
          cursorPositions: [],
          calibrationWidth: null,    // Store calibration window width
          calibrationHeight: null    // Store calibration window height
      },

      transformationMatrices: {
          rotationOnly: null
      },

      // Cursor tracking state
      lastHeadX: null,
      lastHeadY: null,
      cursorX: null,
      cursorY: null,
      lastRawX: null,
      lastRawY: null,
  };
}

// Drive configuration (if needed)
const driveConfig = {
  credentials: null,
  isInitialized: false,
};

// Make driveConfig available globally if needed
window.driveConfig = driveConfig;