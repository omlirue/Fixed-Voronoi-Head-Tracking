document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initialize();

    // Configure the new configuration screen button
    const configButton = document.getElementById("config-button");
    if (configButton) {
      configButton.addEventListener("click", () => {
        // Get selected configuration options
        const coordinateSystem = document.querySelector(
          'input[name="coordinates"]:checked'
        ).value;
        const landmarkPoints = document.querySelector(
          'input[name="landmarks"]:checked'
        ).value;
        const animationStyle = document.querySelector(
          'input[name="animation"]:checked'
        ).value;

        // Store configuration in state
        state.config = {
          coordinateSystem,
          landmarkPoints,
          animationStyle,
        };

        // Hide config screen
        document.getElementById("config-screen").classList.add("hidden");

        // Show calibration UI
        document.getElementById("calibration-ui").classList.remove("hidden");

        // Start calibration
        startCalibration();
      });
    }

    // Keep the existing key press handler
    document.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && state.isCalibrating && !state.isLineAnimating) {
        captureCalibrationPoint();
      }
    });

    updateCursor();
  } catch (error) {
    console.error("Initialization error:", error);
    document.getElementById("status").textContent = "Error: " + error.message;
  }
});
