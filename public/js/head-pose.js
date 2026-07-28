let _lastLogTime = 0;
let _loggedSource = null;
 
/**
 * Get head pose angles from MediaPipe's smoothed transformation matrix,
 * falling back to the 3-point landmark estimate below when the matrix
 * isn't ready yet. Signature keeps (landmarks, width, height) for drop-in
 * compatibility with existing call sites — width/height are unused now.
 */
function estimateHeadPose(landmarks, width, height) {
  const now = Date.now();
 
  if (window.state && window.state.lastMatrixAngles) {
    const angles = window.state.lastMatrixAngles;
 
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
      angles: {
        yaw: angles.yaw,
        pitch: angles.pitch,
        roll: angles.roll
      },
      source: 'matrix'
    };
  }
 
  // FALLBACK: matrix not ready yet — derive angles directly from MediaPipe's
  // own face mesh landmarks (nose tip, left eye, right eye) instead.
  if (_loggedSource !== 'threepoint' || now - _lastLogTime > 5000) {
    console.warn('⚠️ HEAD POSE: matrix not yet available, using 3-point landmark fallback');
    _loggedSource = 'threepoint';
    _lastLogTime = now;
  }

  return estimateHeadPoseThreePoint(landmarks);
}

/**
 * Estimate head pose from 3 MediaPipe face mesh landmarks: nose tip (1),
 * left eye (33), right eye (263). Used only when the smoothed
 * facialTransformationMatrix isn't available yet.
 *
 * These are geometric approximations, not a rigid 6DOF solve — but that's
 * fine here: buildRotationVector() feeds them into a per-participant
 * calibration regression, which fits its own gain/offset per axis. What
 * matters is that each angle moves monotonically (and in a consistent
 * direction) with the corresponding real head motion, not its absolute
 * degree value.
 */
function estimateHeadPoseThreePoint(landmarks) {
  if (!landmarks || landmarks.length < 468) {
    return null;
  }

  const nose = landmarks[1];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  if (!nose || !leftEye || !rightEye) {
    return null;
  }

  const RAD2DEG = 180 / Math.PI;

  // Eye line gives roll directly (in-plane tilt) and an inter-eye distance
  // to normalize the other two axes against, so the estimate stays stable
  // as the participant moves closer to/further from the camera.
  const eyeDx = rightEye.x - leftEye.x;
  const eyeDy = rightEye.y - leftEye.y;
  const interEyeDist = Math.hypot(eyeDx, eyeDy) || 1e-6;
  const roll = Math.atan2(eyeDy, eyeDx) * RAD2DEG;

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeMidZ = ((leftEye.z || 0) + (rightEye.z || 0)) / 2;

  // Yaw: turning the head shifts the nose horizontally away from the
  // eye-line midpoint.
  const yaw = Math.atan((nose.x - eyeMidX) / interEyeDist) * RAD2DEG;

  // Pitch: nodding swings the nose toward/away from the camera (z) relative
  // to the eye line.
  const pitch = Math.atan((eyeMidZ - (nose.z || 0)) / interEyeDist) * RAD2DEG;

  return {
    rotation: null,
    translation: null,
    angles: { yaw, pitch, roll },
    source: 'threepoint'
  };
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

// ---------------------------------------------------------------------------
// Rotation feature vector — SINGLE SOURCE OF TRUTH
//
// calibration.js (recordCalibrationPoint), tracking.js (updateCursor) and
// dataCollection.js (offline prediction) all need to turn head angles into the
// [bias, yaw, pitch, roll] vector that gets multiplied by the trained matrix.
// The same formula used to be copy-pasted in all three; if any copy drifted, the
// live cursor would stop matching what the matrix was trained on. They now all
// call buildRotationVector() so they can never disagree.
const _DEG2RAD = Math.PI / 180;
const _ANGLE_SCALE = 1000;

function rotationGainForWidth() {
  const screenWidth =
    (window.state && state.calibrationData && state.calibrationData.calibrationWidth) ||
    window.innerWidth;
  return Math.min(4.0, Math.max(1.0, (screenWidth / 1920) * 1.5));
}

function buildRotationVector(angles) {
  const s = _DEG2RAD * _ANGLE_SCALE * rotationGainForWidth();
  return [
    [1.0],            // bias
    [angles.yaw * s],
    [angles.pitch * s],
    [angles.roll * s]
  ];
}

// Make functions globally available
window.estimateHeadPose = estimateHeadPose;
window.estimateHeadPoseThreePoint = estimateHeadPoseThreePoint;
window.estimateFocalLengthFromFaceSize = estimateFocalLengthFromFaceSize;
window.buildRotationVector = buildRotationVector;
window.rotationGainForWidth = rotationGainForWidth;

console.log('✅ Head Pose Module: Matrix (smooth) → 3-point landmark (fallback)');
