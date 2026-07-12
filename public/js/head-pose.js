/**
 * Head Pose Estimation Module
 * 
 * PRIMARY: Uses MediaPipe's facialTransformationMatrixes (via FaceLandmarker API)
 *          This is smooth like Timothy's code because MediaPipe has internal filtering
 * 
 * FALLBACK: Uses OpenCV.js solvePnP when matrix not available
 */

// Landmark indices (MediaPipe FaceMesh) - same as Timothy's
const POSE_LANDMARK_INDICES = [1, 152, 33, 263, 61, 291];

// Logging state to avoid spamming console
let _lastLogTime = 0;
let _loggedSource = null;

/**
 * Get head pose angles - prefers smooth matrix method when available
 */
function estimateHeadPose(landmarks, width, height) {
  const now = Date.now();
  
  // PRIMARY: Use pre-computed matrix angles if available (smooth!)
  if (window.state && window.state.lastMatrixAngles) {
    const angles = window.state.lastMatrixAngles;
    
    // Log source change or every 5 seconds
    if (_loggedSource !== 'matrix' || now - _lastLogTime > 5000) {
      console.log('🎯 HEAD POSE SOURCE: Matrix (smooth FaceLandmarker API) ✅', {
        yaw: angles.yaw.toFixed(1),
        pitch: angles.pitch.toFixed(1),
        roll: angles.roll.toFixed(1)
      });
      _loggedSource = 'matrix';
      _lastLogTime = now;
    }
    
    return {
      rotation: null,
      translation: null,
      angles: {
        yaw: angles.yaw,
        pitch: angles.pitch,
        roll: angles.roll
      },
      source: 'matrix'  // For debugging
    };
  }
  
  // Log fallback
  if (_loggedSource !== 'solvepnp' || now - _lastLogTime > 5000) {
    console.log('⚠️ HEAD POSE SOURCE: SolvePnP fallback (matrix not available)');
    _loggedSource = 'solvepnp';
    _lastLogTime = now;
  }
  
  // FALLBACK: Use OpenCV solvePnP
  return estimateHeadPoseSolvePnP(landmarks, width, height);
}

/**
 * Estimate head pose using OpenCV solvePnP
 * EXACT implementation from Timothy's React code for smooth tracking
 */
function estimateHeadPoseSolvePnP(landmarks, width, height) {
  if (!landmarks || landmarks.length < 468) {
    return null;
  }

  // Check if OpenCV is available
  if (typeof cv === 'undefined' || !cv.solvePnP) {
    console.warn('OpenCV.js not loaded, cannot estimate head pose');
    return null;
  }

  try {
    // Build Nx2 image points (pixels) - EXACT same as Timothy's
    const imagePointsData = [];
    for (const i of POSE_LANDMARK_INDICES) {
      const p = landmarks[i];
      imagePointsData.push(p.x * width, p.y * height);
    }
    const imagePoints = cv.matFromArray(6, 2, cv.CV_64F, imagePointsData);

    // Build Nx3 object points (generic head model) - EXACT same as Timothy's
    const modelPointsData = [
      0.0, 0.0, 0.0,           // nose tip
      0.0, -330.0, -65.0,      // chin
      -225.0, 170.0, -135.0,   // left eye corner
      225.0, 170.0, -135.0,    // right eye corner
      -150.0, -150.0, -125.0,  // left mouth corner
      150.0, -150.0, -125.0    // right mouth corner
    ];
    const modelPoints = cv.matFromArray(6, 3, cv.CV_64F, modelPointsData);

    // Camera intrinsics (approx) - EXACT same as Timothy's
    const fx = width, fy = width, cx = width / 2, cy = height / 2;
    const cameraMatrix = cv.matFromArray(3, 3, cv.CV_64F, [
      fx, 0, cx,
      0, fy, cy,
      0, 0, 1
    ]);

    const distCoeffs = cv.Mat.zeros(4, 1, cv.CV_64F);
    
    // Fresh rvec/tvec each frame like Timothy's code
    const rvec = cv.Mat.zeros(3, 1, cv.CV_64F);
    const tvec = cv.Mat.zeros(3, 1, cv.CV_64F);

    // Use SOLVEPNP_ITERATIVE without extrinsic guess - exactly like Timothy
    const ok = cv.solvePnP(
      modelPoints, imagePoints, cameraMatrix, distCoeffs,
      rvec, tvec, false, cv.SOLVEPNP_ITERATIVE
    );

    let angles = null;

    if (ok) {
      const R = cv.Mat.zeros(3, 3, cv.CV_64F);
      cv.Rodrigues(rvec, R); // rvec->R

      // Read rotation matrix - EXACT same as Timothy's
      const d = R.data64F; // Float64Array length 9
      const Rjs = [
        [d[0], d[1], d[2]],
        [d[3], d[4], d[5]],
        [d[6], d[7], d[8]]
      ];

      // Z-Y-X Euler (yaw, pitch, roll) - EXACT same as Timothy's
      const RAD2DEG = 180 / Math.PI;
      const r20 = Rjs[2][0], r00 = Rjs[0][0], r10 = Rjs[1][0];
      const r21 = Rjs[2][1], r22 = Rjs[2][2];
      const r01 = Rjs[0][1], r11 = Rjs[1][1];

      let yaw = Math.asin(Math.max(-1, Math.min(1, -r20)));
      const cosYaw = Math.cos(yaw);
      let roll, pitch;

      if (Math.abs(cosYaw) > 1e-6) {
        roll = Math.atan2(r10, r00);
        pitch = Math.atan2(r21, r22);
      } else {
        roll = Math.atan2(-r01, r11);
        pitch = 0;
      }
      

      // Timothy's pitch adjustment
      if (pitch < 0) {
        pitch = pitch * RAD2DEG + 180;
      } else {
        pitch = pitch * RAD2DEG - 180;
      }
      yaw *= RAD2DEG;
      roll *= RAD2DEG;

      // Timothy's roll wrap
      if (roll < -90 && roll >= -180) {
        roll = 180 + roll;
      } else if (roll > 90 && roll < 180) {
        roll = -180 + roll;
      }

      // Timothy's final output
      angles = { 
        yaw: yaw, 
        pitch: pitch * -1, 
        roll: roll * -1 
      };

      R.delete();
    }

    // Clean up
    imagePoints.delete();
    modelPoints.delete();
    cameraMatrix.delete();
    distCoeffs.delete();
    rvec.delete();
    tvec.delete();

    if (!angles) {
      return null;
    }

    return {
      rotation: null,
      translation: null,
      angles: {
        yaw: angles.yaw,
        pitch: angles.pitch,
        roll: angles.roll
      },
      source: 'solvepnp'  // For debugging
    };

  } catch (error) {
    console.error('Error in OpenCV solvePnP:', error);
    return null;
  }
}

/**
 * Estimate focal length from face size in the image
 */
function estimateFocalLengthFromFaceSize(landmarks, imageWidth) {
  if (!landmarks || landmarks.length < 468) {
    return null;
  }
  
  try {
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    
    if (!leftEye || !rightEye) {
      return null;
    }
    
    const eyeDistancePixels = Math.abs(rightEye.x - leftEye.x) * imageWidth;
    const AVERAGE_IPD_MM = 63;
    const TYPICAL_DISTANCE_MM = 550;
    const estimatedFocalLength = (eyeDistancePixels * TYPICAL_DISTANCE_MM) / AVERAGE_IPD_MM;
    
    if (estimatedFocalLength < imageWidth * 0.3 || estimatedFocalLength > imageWidth * 2.0) {
      return null;
    }
    
    return estimatedFocalLength;
  } catch (error) {
    console.error('Error estimating focal length:', error);
    return null;
  }
}

// Make functions globally available
window.estimateHeadPose = estimateHeadPose;
window.estimateHeadPoseSolvePnP = estimateHeadPoseSolvePnP;
window.estimateFocalLengthFromFaceSize = estimateFocalLengthFromFaceSize;

console.log('✅ Head Pose Module: Matrix (smooth) → SolvePnP (fallback)');
