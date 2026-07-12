async function initialize() {
    console.log("Initializing...");

    // Initialize IndexedDB
    initDB();

    state.videoElement = document.getElementById("video-input");

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
    document.getElementById("status").textContent = "Ready to start";
    console.log("Initialization complete");
}
