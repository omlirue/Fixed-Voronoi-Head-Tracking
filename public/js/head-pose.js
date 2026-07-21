let _lastLogTime = 0;
let _loggedSource = null;
 
/**
 * Get head pose angles from MediaPipe's smoothed transformation matrix.
 * Signature keeps (landmarks, width, height) for drop-in compatibility with
 * existing call sites — these params are unused now that the fallback is gone.
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
 
  // No fallback — matrix not ready yet. Caller (RegionClassifier) treats
  // this as "no valid reading this frame" and simply doesn't advance dwell.
  if (_loggedSource !== 'unavailable' || now - _lastLogTime > 5000) {
    console.warn('⚠️ HEAD POSE: matrix not yet available (no SolvePnP fallback in this build)');
    _loggedSource = 'unavailable';
    _lastLogTime = now;
  }
  return null;
}
 
window.estimateHeadPose = estimateHeadPose;
 
console.log('✅ Head Pose Module (fixed-region fork): Matrix only — no SolvePnP/6-point fallback');