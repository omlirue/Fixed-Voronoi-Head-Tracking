//Connects UI to Backend
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initialize();

    // Configure the new configuration screen button
    const configButton = document.getElementById("config-button");
    if (configButton) {
      configButton.addEventListener("click", () => {
        const animationStyle = document.querySelector('input[name="animation"]:checked').value;
        
        state.config = {
          ...state.config,
          coordinateSystem: "2d",
          animationStyle: animationStyle,
          landmarkPoints: "3",
          filterType: "exponential",
          useRotation: true,
          rotationOnlyMode: true
        };
        
        console.log("Starting calibration with config:", state.config);
        
        // Hide config screen and start calibration
        document.getElementById('config-screen').classList.add('hidden');
        startCalibration();
      });
    }

    // Spacebar handler for calibration
    document.addEventListener("keydown", (e) => {
      if (e.code === "Space" && state.isCalibrating && !state.isLineAnimating) {
        e.preventDefault();
        captureCalibrationPoint();
      }
    });

    // Initialize upload handler
const uploadButton = document.getElementById('upload-button');
const fileInput = document.getElementById('calibration-upload');
const fileName = document.getElementById('file-name');

if (uploadButton && fileInput) {
    uploadButton.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            fileName.textContent = file.name;
            const success = await handleCalibrationUpload(file);
            if (success) {
                // Hide configuration screen if calibration was successful
                document.getElementById('config-screen').classList.add('hidden');
            }
        }
    });
}
    // Start the cursor update loop (will only track when state.isTracking is true)
    if (window.updateCursor && typeof window.updateCursor === 'function') {
      window.updateCursor();
    }
  } catch (error) {
    console.error("Initialization error:", error);
    document.getElementById("status").textContent = "Error: " + error.message;
  }
});
