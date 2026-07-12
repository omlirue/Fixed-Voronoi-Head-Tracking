// state.js
if (typeof window.state === 'undefined') {
  window.state = {
      // Camera and tracking elements
      faceMesh: null,
      camera: null,
      videoElement: null,
      lastLandmarks: null,

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
      },

      // Application configuration
      config: {
          coordinateSystem: "2d",
          landmarkPoints: "3",    // Default to 3 points
          animationStyle: "with-line",
          filterType: "exponential"
      },

      // Calibration data for both 3 and 6 point systems
      calibrationData: {
          landmarkPoints3: [],
          landmarkPoints6: [],
          cursorPositions: [],
      },

      // Transformation matrices for both configurations
      transformationMatrices: {
          threePoint: null,
          sixPoint: null
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

if (typeof window.driveConfig === 'undefined') {
  window.driveConfig = {
    credentials: null,
    isInitialized: false
  };
}