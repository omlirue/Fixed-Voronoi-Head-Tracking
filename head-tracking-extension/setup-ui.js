// Create all necessary UI elements for head tracking
function setupTrackingUI() {
    // Add the status display
    let statusElement = document.getElementById('head-tracking-status');
    if (!statusElement) {
      statusElement = document.createElement('div');
      statusElement.id = 'status';
      statusElement.textContent = 'Head Tracking Ready';
      statusElement.style.position = 'fixed';
      statusElement.style.top = '20px';
      statusElement.style.left = '20px';
      statusElement.style.color = 'white';
      statusElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      statusElement.style.padding = '10px';
      statusElement.style.borderRadius = '5px';
      statusElement.style.zIndex = '10000';
      document.body.appendChild(statusElement);
    }
  
    // Create video element for camera input
    let videoElement = document.getElementById('video-input');
    if (!videoElement) {
      videoElement = document.createElement('video');
      videoElement.id = 'video-input';
      videoElement.style.position = 'fixed';
      videoElement.style.bottom = '20px';
      videoElement.style.right = '20px';
      videoElement.style.width = '320px';
      videoElement.style.height = '240px';
      videoElement.style.transform = 'scaleX(-1)';
      videoElement.style.zIndex = '900';
      videoElement.style.display = 'none'; // Initially hidden
      document.body.appendChild(videoElement);
    }
  
    // Create calibration UI
    let calibrationUI = document.getElementById('calibration-ui');
    if (!calibrationUI) {
      calibrationUI = document.createElement('div');
      calibrationUI.id = 'calibration-ui';
      calibrationUI.style.position = 'fixed';
      calibrationUI.style.top = '0';
      calibrationUI.style.left = '0';
      calibrationUI.style.width = '100%';
      calibrationUI.style.height = '100%';
      calibrationUI.style.zIndex = '999';
      calibrationUI.classList.add('hidden');
      document.body.appendChild(calibrationUI);
  
      // Add calibration instructions
      const instructions = document.createElement('div');
      instructions.id = 'calibration-instructions';
      instructions.innerHTML = `
        <div>Look at each red dot and press ENTER</div>
        <div id="progress">Point <span id="current-point-text">1</span>/20</div>
      `;
      calibrationUI.appendChild(instructions);
    }
  
    // Create tracking controls container
    let controlsContainer = document.getElementById('tracking-controls-container');
    if (!controlsContainer) {
      controlsContainer = document.createElement('div');
      controlsContainer.id = 'tracking-controls-container';
      controlsContainer.style.position = 'fixed';
      controlsContainer.style.bottom = '20px';
      controlsContainer.style.left = '20px';
      controlsContainer.style.zIndex = '1000';
      document.body.appendChild(controlsContainer);
    }
    
    console.log('Head tracking UI elements created');
    return true;
  }
  
  // Run the setup
  setupTrackingUI();
  
  // Add message listener to handle commands from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message);
    
    try {
      switch (message.command) {
        case 'START_TRACKING':
          // Ensure UI is set up
          setupTrackingUI();
          
          // Set configuration
          if (window.state) {
            window.state.config.landmarkPoints = message.points || "3";
          }
          
          // Initialize tracking
          if (window.initialize) {
            window.initialize().then(() => {
              if (window.state) {
                window.state.isTracking = true;
                if (window.updateCursor) {
                  window.updateCursor();
                }
                sendResponse({ success: true, message: 'Tracking started' });
              }
            }).catch(error => {
              console.error('Initialization error:', error);
              sendResponse({ success: false, error: error.message });
            });
          } else {
            sendResponse({ success: false, error: 'Initialization function not available' });
          }
          break;
          
        case 'START_CALIBRATION':
          if (window.startCalibration) {
            window.startCalibration();
            sendResponse({ success: true, message: 'Calibration started' });
          } else {
            sendResponse({ success: false, error: 'Calibration function not available' });
          }
          break;
          
        case 'STOP_TRACKING':
          if (window.state) {
            window.state.isTracking = false;
            window.state.isCalibrating = false;
            
            // Clean up cursors
            ['head-cursor-clipped', 'head-cursor-raw'].forEach(id => {
              const cursor = document.getElementById(id);
              if (cursor) cursor.remove();
            });
            
            // Stop camera if it's running
            if (window.state.camera) {
              window.state.camera.stop();
            }
            
            sendResponse({ success: true, message: 'Tracking stopped' });
          } else {
            sendResponse({ success: false, error: 'State not available' });
          }
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown command' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
    
    return true; // Keep message channel open for async response
  });
  
  console.log('Head tracking setup script loaded and UI initialized');

document.addEventListener('DOMContentLoaded', () => {
  const configButton = document.getElementById('config-button');
  if (configButton) {
    configButton.addEventListener('click', () => {
      console.log('Config button clicked');
      
      // Collect configuration
      const coordinateSystem = document.querySelector('input[name="coordinates"]:checked').value;
      const animationStyle = document.querySelector('input[name="animation"]:checked').value;

      console.log('Coordinate System:', coordinateSystem);
      console.log('Animation Style:', animationStyle);

      // Update state configuration
      if (window.state) {
        window.state.config = {
          coordinateSystem,
          animationStyle,
          landmarkPoints: "3"
        };
      }

      // Hide config screen and show calibration UI
      document.getElementById('config-screen')?.classList.add('hidden');
      document.getElementById('calibration-ui')?.classList.remove('hidden');

      // Start calibration
      if (window.startCalibration) {
        window.startCalibration();
      }
    });
  }
});