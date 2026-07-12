// Add this at the top or in an appropriate place
console.log('Script.js loaded');

// Add message listener at the top of the file
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  switch(request.command) {
    case 'startTracking':
      if (!state.isTracking) {
        // Update landmark points configuration
        state.config.landmarkPoints = request.points || "3";
        
        initialize().then(() => {
          state.isTracking = true;
          updateCursor();
          updateStatus('Tracking Active');
        }).catch(error => {
          console.error('Initialization error:', error);
          updateStatus('Error: ' + error.message);
        });
      }
      break;
    
    case 'startCalibration':
      if (!state.isCalibrating) {
        startCalibration();
        updateStatus('Calibrating');
      }
      break;
    
    case 'stopTracking':
      cleanupTracking();
      updateStatus('Tracking Stopped');
      break;

    case 'updateLandmarks':
      if (state.isTracking) {
        state.config.landmarkPoints = request.points;
        updateStatus('Updated to ' + request.points + ' points');
      }
      break;
  }
});

// Add helper functions
function updateStatus(status) {
  chrome.runtime.sendMessage({ type: 'statusUpdate', status: status });
}

function cleanupTracking() {
  state.isTracking = false;
  state.isCalibrating = false;
  
  // Clean up cursors
  ['head-cursor-clipped', 'head-cursor-raw'].forEach(id => {
    const cursor = document.getElementById(id);
    if (cursor) cursor.remove();
  });
  
  // Clean up calibration UI
  const calibrationUI = document.getElementById('calibration-ui');
  if (calibrationUI) {
    calibrationUI.classList.add('hidden');
  }
  
  // Stop camera if it's running
  if (state.camera) {
    state.camera.stop();
  }
}

// Add cleanup on extension unload
window.addEventListener('beforeunload', function() {
  cleanupTracking();
});

window.addEventListener('message', (event) => {
  if (event.source === window && event.data.type === 'EXTENSION_MESSAGE') {
    console.log('Received extension message:', event.data);
    
    try {
      switch(event.data.command) {
        case 'startTracking':
          if (!window.state) {
            console.error('State not initialized');
            return;
          }
          state.config.landmarkPoints = event.data.points;
          startCalibration();
          
          // Confirm initialization
          window.postMessage({
            type: 'TRACKING_STATUS',
            status: 'Tracking'
          }, '*');
          break;

        case 'stopTracking':
          state.isTracking = false;
          window.postMessage({
            type: 'TRACKING_STATUS',
            status: 'Inactive'
          }, '*');
          break;
      }
    } catch (error) {
      console.error('Message handling error:', error);
      window.postMessage({
        type: 'TRACKING_STATUS',
        status: 'Error: ' + error.message
      }, '*');
    }
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initialize();
    
    // Send ready signal to extension
    chrome.runtime.sendMessage({
      type: 'contentScriptReady',
      status: 'initialized'
    });

    // Configure the new configuration screen button
    const configButton = document.getElementById("config-button");
    if (configButton) {
      configButton.addEventListener("click", () => {
        // Get selected configuration options
        const coordinateSystem = document.querySelector(
          'input[name="coordinates"]:checked'
        ).value;
        const animationStyle = document.querySelector(
          'input[name="animation"]:checked'
        ).value;

        // Store configuration in state with defaults for landmarks and filter
        state.config = {
          coordinateSystem,
          landmarkPoints: "3", // Default to 3 landmarks initially
          animationStyle,
          filterType: "exponential" // Default to exponential smoothing initially
        };

        console.log("Starting with configuration:", state.config);

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
    updateCursor();
  } catch (error) {
    console.error("Initialization error:", error);
    document.getElementById("status").textContent = "Error: " + error.message;
  }
});

// Modify existing initApp or add a debug function
function debugCalibrationSetup() {
    console.group('Calibration Debug');
    console.log('Window state:', window.state);
    console.log('startCalibration function:', typeof window.startCalibration);
    console.log('captureCalibrationPoint function:', typeof window.captureCalibrationPoint);
    console.log('Config button:', document.getElementById('config-button'));
    console.groupEnd();
}

// Call this function early or in initApp
window.addEventListener('load', debugCalibrationSetup);

// Add this at the top of the file or in a global scope
if (typeof initialize === 'undefined') {
  window.initialize = async function() {
    console.log('Fallback initialize function');
    
    // Basic initialization steps
    if (!window.state) {
      window.state = {
        isTracking: false,
        isCalibrating: false,
        config: {
          landmarkPoints: "3",
          coordinateSystem: "2d",
          animationStyle: "with-line"
        }
      };
    }

    // Add any necessary setup
    return Promise.resolve();
  };
}

// Fallback updateCursor function
function updateCursor() {
  console.log('Fallback updateCursor called');
  
  // Basic cursor update logic
  if (!window.state) {
    console.warn('State not initialized for cursor update');
    return;
  }

  try {
    // Check if tracking is active
    if (!window.state.isTracking) {
      console.log('Not tracking, skipping cursor update');
      return;
    }

    // Create or update cursor elements if they don't exist
    let rawCursor = document.getElementById('head-cursor-raw');
    let clippedCursor = document.getElementById('head-cursor-clipped');

    if (!rawCursor) {
      rawCursor = document.createElement('div');
      rawCursor.id = 'head-cursor-raw';
      rawCursor.style.position = 'fixed';
      rawCursor.style.width = '10px';
      rawCursor.style.height = '10px';
      rawCursor.style.backgroundColor = 'red';
      rawCursor.style.borderRadius = '50%';
      rawCursor.style.zIndex = '9999';
      document.body.appendChild(rawCursor);
    }

    if (!clippedCursor) {
      clippedCursor = document.createElement('div');
      clippedCursor.id = 'head-cursor-clipped';
      clippedCursor.style.position = 'fixed';
      clippedCursor.style.width = '10px';
      clippedCursor.style.height = '10px';
      clippedCursor.style.backgroundColor = 'blue';
      clippedCursor.style.borderRadius = '50%';
      clippedCursor.style.zIndex = '9998';
      document.body.appendChild(clippedCursor);
    }

    // Simulate cursor movement (replace with actual tracking logic)
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;

    rawCursor.style.left = `${x}px`;
    rawCursor.style.top = `${y}px`;
    clippedCursor.style.left = `${x}px`;
    clippedCursor.style.top = `${y}px`;

  } catch (error) {
    console.error('Error in updateCursor:', error);
  }
}

// Ensure the function is globally available
window.updateCursor = updateCursor;

// Modify the startCalibration function to use the content script's version
function startCalibration() {
  console.log('Script.js startCalibration called');
  
  // Delegate to content script's startCalibration
  if (window.startCalibration) {
    window.startCalibration();
  } else {
    console.error('No startCalibration function found in content script');
  }
}