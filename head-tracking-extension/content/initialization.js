async function initialize() {
    console.log("Initializing...");

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
    canvasElement.width = 320;
    canvasElement.height = 240;
    document.body.appendChild(canvasElement);

    const canvasCtx = canvasElement.getContext('2d');

    state.faceMesh = new FaceMesh({
        locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    state.faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
    });

    state.faceMesh.onResults((results) => {
        if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
            state.lastLandmarks = results.multiFaceLandmarks[0];
            
            // Clear the canvas
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
            
            // Draw the video frame first
            canvasCtx.save();
            canvasCtx.drawImage(
                results.image,
                0, 0, canvasElement.width, canvasElement.height
            );

            // Add a stronger dimming overlay
            canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';  // Increased dimming
            canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

            if (results.multiFaceLandmarks) {
                for (const landmarks of results.multiFaceLandmarks) {
                    // Draw the face mesh connections
                    drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION,
                        { color: '#C0C0C070', lineWidth: 1 });

                    // Highlight the specific landmarks we're using
                    const indices = getLandmarkIndices();
                    indices.forEach(index => {
                        const landmark = landmarks[index];
                        const x = landmark.x * canvasElement.width;
                        const y = landmark.y * canvasElement.height;

                        // Draw larger dots for tracked landmarks
                        canvasCtx.beginPath();
                        canvasCtx.arc(x, y, 4, 0, 2 * Math.PI);
                        canvasCtx.fillStyle = '#FF0000';
                        canvasCtx.fill();
                        
                        // Add landmark index labels with better visibility
                        canvasCtx.fillStyle = 'white';
                        canvasCtx.strokeStyle = 'black';
                        canvasCtx.lineWidth = 2;
                        canvasCtx.font = 'bold 12px Arial';
                        canvasCtx.strokeText(index.toString(), x + 8, y - 8);
                        canvasCtx.fillText(index.toString(), x + 8, y - 8);
                    });
                }
            }
            canvasCtx.restore();
        }
    });

    state.camera = new Camera(state.videoElement, {
        onFrame: async () => {
            await state.faceMesh.send({ image: state.videoElement });
        },
        width: 1280,
        height: 720,
    });

    await state.camera.start();
    
    // Hide the original video element since we're showing it on canvas
    state.videoElement.style.display = 'none';
    
    document.getElementById("status").textContent = "Ready to start";
    console.log("Initialization complete");
}