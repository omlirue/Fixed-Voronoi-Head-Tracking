async function initialize() {
    // Initialize IndexedDB
    initDB();

    state.videoElement = document.getElementById("video-input");

    // Create canvas overlay that will match video dimensions
    const canvasElement = document.createElement('canvas');
    canvasElement.id = 'face-canvas';
    canvasElement.style.position = 'fixed';
    canvasElement.style.bottom = '20px';
    canvasElement.style.right = '20px';
    canvasElement.style.width = '320px';
    canvasElement.style.height = '240px';
    canvasElement.style.zIndex = '901';
    canvasElement.style.transform = 'scaleX(-1)';
    canvasElement.style.display = 'none'; // Hide by default
    canvasElement.width = 320;
    canvasElement.height = 240;
    document.body.appendChild(canvasElement);

    const canvasCtx = canvasElement.getContext('2d');

    // Initialize FaceLandmarker (lazy init - like Timothy does)
    // This downloads the model only when calibration starts, not on page load
    if (!window.FaceLandmarkerAPI) {
        console.error('❌ FaceLandmarkerAPI not loaded! Check that face-landmarker-init.js is included.');
        alert('Failed to load face tracking. Please refresh the page.');
        return;
    }

    try {
        console.log('🔄 Loading FaceLandmarker model (this may take a moment)...');
        await window.FaceLandmarkerAPI.init();
        
        if (!window.FaceLandmarkerAPI.isReady()) {
            throw new Error('FaceLandmarker failed to initialize');
        }
        
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('✅ FaceLandmarker READY (smooth head pose like Timothy)');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('');
        
    } catch (e) {
        console.error('❌ FaceLandmarker initialization failed:', e);
        alert('Failed to initialize face tracking: ' + e.message + '\nPlease refresh and try again.');
        return;
    }

    // Frame processing loop
    let lastTimestamp = 0;
    let frameCount = 0;
    const MIN_FRAME_TIME = 16; // ~60fps max
    
    const processFrame = () => {
        if (!state.videoElement || state.videoElement.readyState < 2) {
            requestAnimationFrame(processFrame);
            return;
        }
        
        const timestamp = performance.now();
        
        // Throttle to prevent overload
        if (timestamp - lastTimestamp < MIN_FRAME_TIME) {
            requestAnimationFrame(processFrame);
            return;
        }
        lastTimestamp = timestamp;
        frameCount++;
        
        try {
            const results = window.FaceLandmarkerAPI.detect(state.videoElement, timestamp);
            
            if (results && results.faceLandmarks && results.faceLandmarks[0]) {
                // Store landmarks
                state.lastLandmarks = results.faceLandmarks[0];
                
                // Store transformation matrix for smooth head pose
                if (results.facialTransformationMatrixes && results.facialTransformationMatrixes[0]) {
                    state.lastTransformMatrix = results.facialTransformationMatrixes[0];
                    
                    // Pre-compute angles from matrix (the smooth part!)
                    const angles = window.FaceLandmarkerAPI.eulerFromMatrix(state.lastTransformMatrix);
                    if (angles) {
                        state.lastMatrixAngles = angles;
                        
                        // Log first time
                        if (!window._loggedMatrixAnglesOnce) {
                            console.log('🎯 First matrix angles:', {
                                yaw: angles.yaw.toFixed(1),
                                pitch: angles.pitch.toFixed(1),
                                roll: angles.roll.toFixed(1)
                            });
                            window._loggedMatrixAnglesOnce = true;
                        }
                    }
                }
                
                // Draw canvas every 3rd frame to reduce load
                if (frameCount % 3 === 0) {
                    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
                    canvasCtx.save();
                    canvasCtx.drawImage(
                        state.videoElement,
                        0, 0, canvasElement.width, canvasElement.height
                    );
                    canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                    canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
                    
                    // Draw key landmarks only
                    const landmarks = results.faceLandmarks[0];
                    const indices = getLandmarkIndices();
                    canvasCtx.fillStyle = '#FF0000';
                    indices.forEach(index => {
                        if (index < landmarks.length) {
                            const lm = landmarks[index];
                            canvasCtx.beginPath();
                            canvasCtx.arc(lm.x * canvasElement.width, lm.y * canvasElement.height, 4, 0, Math.PI * 2);
                            canvasCtx.fill();
                        }
                    });
                    
                    canvasCtx.restore();
                }
            }
        } catch (e) {
            if (!window._loggedDetectionError) {
                console.warn('Detection error:', e.message);
                window._loggedDetectionError = true;
            }
        }
        
        requestAnimationFrame(processFrame);
    };
    
    // Start webcam
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: 1280, 
                height: 720,
                facingMode: 'user'
            }, 
            audio: false 
        });
        state.videoElement.srcObject = stream;
        await new Promise(resolve => {
            state.videoElement.onloadedmetadata = resolve;
        });
        await state.videoElement.play();
        
        // Start processing
        requestAnimationFrame(processFrame);
        console.log('✅ Camera started');
    } catch (e) {
        console.error('Failed to start camera:', e);
        alert('Failed to access camera: ' + e.message);
    }
    
    // Hide the original video element
    state.videoElement.style.display = 'none';
    
    console.log("Initialization complete");
}
