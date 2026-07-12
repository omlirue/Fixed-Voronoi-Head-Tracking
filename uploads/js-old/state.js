const state = {
  faceMesh: null,
  camera: null,
  videoElement: null,
  isCalibrating: false,
  lastLandmarks: null,
  calibrationData: {
    landmarkPoints: [],
    cursorPositions: [],
  },
  gridConfig: {
    rows: 8,
    cols: 5,
    points: [],
    randomizedOrder: [],
    currentIndex: 0,
    cornerIndices: [],
  },
  totalCalibrationPoints: 40,
  currentCalibrationPoint: 0,
  transformationMatrix: null,
  LANDMARK_INDICES: [33, 133, 362],
  isTracking: false,
  previousPosition: null,
  currentPosition: null,
  isLineAnimating: false,
  dataCollection: {
    calibrationData: [],
    videoNumber: 1,
    isRecording: false,
    startTime: null,
  },
  config: {
    coordinateSystem: "2d",
    landmarkPoints: "3",
    animationStyle: "with-line", // 'with-line' or 'without-line'
  },
};

const driveConfig = {
  credentials: null,
  isInitialized: false,
};
