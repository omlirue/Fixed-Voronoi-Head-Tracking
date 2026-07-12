/**
 * FaceLandmarker Initialization Module
 * Uses the new @mediapipe/tasks-vision API which provides smooth facialTransformationMatrixes
 * This is what Timothy's code uses for smooth head pose tracking
 */

import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/+esm';

// Global state for the landmarker
let faceLandmarker = null;
let isInitialized = false;
let initPromise = null;

/**
 * Initialize the FaceLandmarker with transformation matrix output enabled
 * Uses setTimeout to yield to browser and prevent "Page Unresponsive"
 */
async function initFaceLandmarker() {
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    try {
      console.log('🔄 Initializing FaceLandmarker (tasks-vision API)...');
      console.log('   This may take a few seconds to download the model...');
      
      // Yield to browser before heavy work
      await new Promise(r => setTimeout(r, 100));
      
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm'
      );
      
      // Yield again after WASM load
      await new Promise(r => setTimeout(r, 50));
      
      const modelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
      
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { 
          modelAssetPath: modelUrl, 
          delegate: 'GPU' 
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,  // We don't need these
        outputFacialTransformationMatrixes: true  // THIS is key for smooth head pose!
      });
      
      isInitialized = true;
      console.log('✅ FaceLandmarker initialized with transformation matrix output');
      return faceLandmarker;
    } catch (error) {
      console.error('❌ Failed to initialize FaceLandmarker:', error);
      throw error;
    }
  })();
  
  return initPromise;
}

/**
 * Process a video frame and return landmarks + transformation matrix
 */
function detectForVideo(videoElement, timestamp) {
  if (!faceLandmarker || !isInitialized) {
    return null;
  }
  
  try {
    const results = faceLandmarker.detectForVideo(videoElement, timestamp);
    return results;
  } catch (error) {
    console.error('Detection error:', error);
    return null;
  }
}

/**
 * Extract Euler angles from MediaPipe's transformation matrix
 * EXACT implementation from Timothy's euler.ts
 */
function eulerFromMediapipeMatrix(mat) {
  if (!mat) return null;
  
  const RAD2DEG = 180 / Math.PI;
  
  const rows = mat.rows ?? 4;
  const cols = mat.columns ?? mat.cols ?? 4;
  const data = Array.from(mat.data);
  
  if (rows < 3 || cols < 3) return null;
  
  // MediaPipe documents the Matrix as column-major.
  // Build 4x4 in row-major for easier math.
  const M = Array.from({length: rows}, (_, r) => 
    Array.from({length: cols}, (_, c) => data[c * rows + r] ?? 0)
  );
  
  // Extract 3x3 and remove per-column scale
  const R = [
    [M[0][0], M[0][1], M[0][2]],
    [M[1][0], M[1][1], M[1][2]],
    [M[2][0], M[2][1], M[2][2]]
  ];
  
  // Normalize columns
  for (let j = 0; j < 3; j++) {
    const s = Math.hypot(R[0][j], R[1][j], R[2][j]) || 1;
    R[0][j] /= s; 
    R[1][j] /= s; 
    R[2][j] /= s;
  }
  
  // ZYX Euler (yaw, pitch, roll)
  const r20 = R[2][0], r00 = R[0][0], r10 = R[1][0];
  const r21 = R[2][1], r22 = R[2][2];
  const r01 = R[0][1], r11 = R[1][1];
  
  const yaw = Math.asin(Math.max(-1, Math.min(1, -r20)));
  const cosYaw = Math.cos(yaw);
  
  let roll, pitch;
  if (Math.abs(cosYaw) > 1e-6) {
    roll = Math.atan2(r10, r00);
    pitch = Math.atan2(r21, r22);
  } else {
    roll = Math.atan2(-r01, r11);
    pitch = 0;
  }
  
  // Return with Timothy's sign conventions
  return { 
    yaw: yaw * RAD2DEG * -1, 
    pitch: pitch * RAD2DEG * -1, 
    roll: roll * RAD2DEG 
  };
}

// Expose to global scope
window.FaceLandmarkerAPI = {
  init: initFaceLandmarker,
  detect: detectForVideo,
  eulerFromMatrix: eulerFromMediapipeMatrix,
  isReady: () => isInitialized,
  getLandmarker: () => faceLandmarker
};

// DON'T auto-initialize on load - wait until camera starts (like Timothy does)
// This prevents page freezing on load
console.log('📦 FaceLandmarker module loaded (will initialize when camera starts)');

export { initFaceLandmarker, detectForVideo, eulerFromMediapipeMatrix };

