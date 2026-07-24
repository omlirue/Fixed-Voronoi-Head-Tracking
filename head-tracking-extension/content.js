// Wrap in an IIFE to prevent global scope pollution
(function() {
  // Early logging
  console.log('Content script initializing');

  // Ensure initialize function is available
  if (typeof window.initialize === 'undefined') {
    window.initialize = async function() {
      console.log('Content script fallback initialization');
      
      // Ensure state exists
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

      return Promise.resolve();
    };
  }

  // Ensure state exists early
  if (!window.state) {
    window.state = {
      isTracking: false,
      isCalibrating: false,
      currentCalibrationPoint: 0,
      config: {
        landmarkPoints: "3",
        coordinateSystem: "2d",
        animationStyle: "with-line"
      },
      gridConfig: {
        rows: 8,
        cols: 5,
        points: [],
        randomizedOrder: [],
        currentIndex: 0,
        cornerIndices: []
      },
      calibrationData: {
        landmarkPoints3: [],
        landmarkPoints6: [],
        cursorPositions: []
      }
    };
  }

  // Function to create and inject calibration UI
  function injectCalibrationUI() {
    console.log('Injecting Calibration UI');
    
    // Remove any existing calibration UI
    const existingUI = document.getElementById('calibration-ui');
    if (existingUI) {
      existingUI.remove();
    }

    // Create calibration UI
    const calibrationUI = document.createElement('div');
    calibrationUI.id = 'calibration-ui';
    calibrationUI.style.display = 'block';
    calibrationUI.style.position = 'fixed';
    calibrationUI.style.top = '0';
    calibrationUI.style.left = '0';
    calibrationUI.style.width = '100%';
    calibrationUI.style.height = '100%';
    calibrationUI.style.background = 'rgba(0,0,0,0.8)';
    calibrationUI.style.zIndex = '9999';
    calibrationUI.style.pointerEvents = 'all';  // Changed from 'none' to 'all'

    // Calibration target
    const calibrationTarget = document.createElement('div');
    calibrationTarget.id = 'calibration-target';
    calibrationTarget.style.position = 'absolute';
    calibrationTarget.style.width = '50px';
    calibrationTarget.style.height = '50px';
    calibrationTarget.style.background = 'red';
    calibrationTarget.style.borderRadius = '50%';
    calibrationTarget.style.transform = 'translate(-50%, -50%)';
    calibrationTarget.style.left = '50%';  // Center horizontally
    calibrationTarget.style.top = '50%';   // Center vertically

    // Progress text
    const progressText = document.createElement('div');
    progressText.id = 'calibration-instructions';
    progressText.innerHTML = `
      <div style="
        position: absolute;
        bottom: 50px;
        width: 100%;
        text-align: center;
        color: white;
        font-size: 18px;
      ">
       Place your head on the Red circle and press ENTER
        <div id="progress">
          Progress: <span id="current-point-text">1</span>/20
        </div>
      </div>
    `;

    calibrationUI.appendChild(calibrationTarget);
    calibrationUI.appendChild(progressText);

    document.body.appendChild(calibrationUI);

    console.log('Calibration UI injected');
    return calibrationUI;
  }

  // Calibration-related functions
  function generateGridPoints() {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const margin = Math.min(screenWidth, screenHeight) * 0.05;
    
    window.state.gridConfig.points = [];
    window.state.gridConfig.randomizedOrder = [];
    window.state.gridConfig.currentIndex = 0;
    window.state.gridConfig.cornerIndices = [];

    // Create grid points
    for (let row = 0; row < window.state.gridConfig.rows; row++) {
      for (let col = 0; col < window.state.gridConfig.cols; col++) {
        let x = margin + (screenWidth - 2 * margin) * (col / (window.state.gridConfig.cols - 1));
        let y = margin + (screenHeight - 2 * margin) * (row / (window.state.gridConfig.rows - 1));
        
        const isCorner = 
          (row === 0 && col === 0) ||  // Top-left
          (row === 0 && col === window.state.gridConfig.cols - 1) ||  // Top-right
          (row === window.state.gridConfig.rows - 1 && col === 0) ||  // Bottom-left
          (row === window.state.gridConfig.rows - 1 && col === window.state.gridConfig.cols - 1);  // Bottom-right

        window.state.gridConfig.points.push({
          x, 
          y, 
          isCorner
        });

        if (isCorner) {
          window.state.gridConfig.cornerIndices.push(window.state.gridConfig.points.length - 1);
        }
      }
    }

    // Randomize order with center point first
    const centerIndex = Math.floor(window.state.gridConfig.points.length / 2);
    const indices = window.state.gridConfig.points
      .map((_, index) => index)
      .filter(index => index !== centerIndex)
      .sort(() => Math.random() - 0.5);

    window.state.gridConfig.randomizedOrder = [centerIndex, ...indices];
  }

  function getNextGridPosition() {
    if (window.state.gridConfig.currentIndex >= 20) {
      return null;
    }

    const pointIndex = window.state.gridConfig.randomizedOrder[window.state.gridConfig.currentIndex];
    const position = window.state.gridConfig.points[pointIndex];

    const progress = (((window.state.gridConfig.currentIndex + 1) / 20) * 100).toFixed(1);
    console.log(`Calibration Progress: ${progress}%`);
    console.log(`Current point: ${position.isCorner ? 'Corner' : 'Grid'} at (${position.x}, ${position.y})`);

    return position;
  }

  function startCalibration() {
    console.log("Starting calibration");
    
    // Inject UI
    const calibrationUI = injectCalibrationUI();
    
    // Ensure UI is visible
    if (calibrationUI) {
      calibrationUI.style.display = 'block';
    }

    // Reset calibration state
    if (window.state) {
      window.state.isCalibrating = true;
      window.state.isTracking = false;
      window.state.currentCalibrationPoint = 0;
    }

    console.log('Calibration started, UI should be visible');
  }

  function captureCalibrationPoint() {
    if (!window.state.isCalibrating) return;

    window.state.gridConfig.currentIndex++;
    const currentPointText = document.getElementById('current-point-text');
    const calibrationTarget = document.getElementById('calibration-target');

    if (window.state.gridConfig.currentIndex >= 20) {
      // Calibration complete
      finishCalibration();
      return;
    }

    const nextPoint = getNextGridPosition();
    if (nextPoint && calibrationTarget) {
      calibrationTarget.style.left = `${nextPoint.x}px`;
      calibrationTarget.style.top = `${nextPoint.y}px`;
      currentPointText.textContent = `${window.state.gridConfig.currentIndex + 1}`;
    }
  }

  function finishCalibration() {
    window.state.isCalibrating = false;
    const calibrationUI = document.getElementById('calibration-ui');
    if (calibrationUI) calibrationUI.remove();
    
    console.log('Calibration complete');
  }

  // Key event listener for calibration
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && window.state.isCalibrating) {
      console.log('Enter pressed during calibration');
      captureCalibrationPoint();
    }
  });

  // Expose functions globally
  window.startCalibration = startCalibration;
  window.captureCalibrationPoint = captureCalibrationPoint;
  window.finishCalibration = finishCalibration;

  // Simplified message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message);

    try {
      // Normalize message type to uppercase
      const messageType = (message.type || '').toUpperCase();

      switch (messageType) {
        case 'START_CALIBRATION':
          console.log('Received START_CALIBRATION message');
          
          // Ensure startCalibration function exists
          if (typeof window.startCalibration === 'function') {
            window.startCalibration();
            sendResponse({ 
              success: true, 
              message: 'Calibration started' 
            });
          } else {
            console.error('startCalibration function not found');
            sendResponse({ 
              success: false, 
              error: 'startCalibration function not found' 
            });
          }
          break;

        case 'TOGGLE_TRACKING':
          console.log('Received TOGGLE_TRACKING message');
          
          // Toggle tracking state
          window.state.isTracking = !window.state.isTracking;
          
          if (window.state.isTracking) {
            // Start tracking logic
            injectCalibrationScripts()
              .then(() => {
                setupCalibration();
                sendResponse({ 
                  success: true, 
                  message: 'Tracking started' 
                });
              })
              .catch(error => {
                console.error('Script injection error:', error);
                sendResponse({ 
                  success: false, 
                  error: error.message 
                });
              });
            
            // Return true to keep message channel open for async response
            return true;
          } else {
            // Stop tracking logic
            window.state.isCalibrating = false;
            
            // Remove calibration UI
            const calibrationUI = document.getElementById('calibration-ui');
            if (calibrationUI) calibrationUI.remove();
            
            sendResponse({ 
              success: true, 
              message: 'Tracking stopped' 
            });
          }
          break;

        default:
          console.warn('Unknown message type:', messageType);
          sendResponse({ 
            success: false, 
            error: 'Unknown command' 
          });
      }
    } catch (error) {
      console.error('Message handling error:', error);
      sendResponse({ 
        success: false, 
        error: error.message 
      });
    }

    // Keep message channel open
    return true;
  });

  console.log('Calibration script fully initialized');
})();

// Ensure content script is only initialized once
if (!window.headTrackingContentScriptInitialized) {
  window.headTrackingContentScriptInitialized = true;
  console.log('Head Tracking Content Script Initializing');

  console.log('Attempting to load state:', window.state);

  // Ensure state is loaded before proceeding
  if (!window.state) {
    console.error('State not initialized');
    window.state = {
      isTracking: false,
      isCalibrating: false,
      currentCalibrationPoint: 0,
      gridConfig: {
        rows: 8,
        cols: 5,
        points: [],
        randomizedOrder: [],
        currentIndex: 0,
        cornerIndices: []
      },
      calibrationData: {
        landmarkPoints3: [],
        landmarkPoints6: [],
        cursorPositions: []
      },
      config: {
        coordinateSystem: "2d",
        landmarkPoints: "3",
        animationStyle: "with-line"
      }
    };
  }

  // Function to inject script with error handling
  function injectScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => {
        console.log(`Loaded script: ${src}`);
        resolve();
      };
      script.onerror = (error) => {
        console.error(`Failed to load script: ${src}`, error);
        reject(error);
      };
      document.head.appendChild(script);
    });
  }

  // Function to inject multiple scripts sequentially
  async function injectScripts(scripts) {
    for (const script of scripts) {
      try {
        await injectScript(script);
      } catch (error) {
        console.error(`Error injecting ${script}:`, error);
      }
    }

    // Try to initialize app after scripts are loaded
    if (window.initApp) {
      window.initApp();
    }
  }

  // List of scripts to inject (with CDN fallbacks)
  const scriptsToInject = [
    'https://cdnjs.cloudflare.com/ajax/libs/mathjs/9.4.4/math.js',
    'libs/math.js',
    'content/state.js',
    'content/database.js',
    'content/script.js',
    'content/calibration.js'
  ];

  // Inject scripts when page loads
  window.addEventListener('load', () => {
    injectScripts(scriptsToInject);
  });

  // Function to inject all necessary scripts for calibration
  function injectCalibrationScripts() {
    const scripts = [
      'https://cdnjs.cloudflare.com/ajax/libs/mathjs/9.4.4/math.js',
      'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
      'https://cdn.jsdelivr.net/npm/@mediapipe/control_utils/control_utils.js',
      'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js',
      'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js'
    ];

    return Promise.all(scripts.map(injectScript));
  }

  // Function to inject calibration UI and scripts
  function setupCalibration() {
    // Create and style calibration UI elements
    const calibrationUI = document.createElement('div');
    calibrationUI.id = 'calibration-ui';
    calibrationUI.innerHTML = `
      <div id="calibration-target"></div>
      <div id="calibration-line"></div>
      <div id="calibration-instructions">
        Look at the red circle and press ENTER
        <div id="progress">
          Progress: <span id="current-point-text">1</span>/20
        </div>
      </div>
    `;
    
    // Inject CSS
    const style = document.createElement('style');
    style.textContent = `
      #calibration-ui {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 5000;
      }

      .calibration-hint {
        position: absolute;
        color: #fff;
        font-size: 14px;
        background: rgba(0, 0, 0, 0.6);
        padding: 4px 10px;
        border-radius: 6px;
        white-space: nowrap;
      }

      #calibration-target {
        position: absolute;
        width: 50px;
        height: 50px;
        background: red;
        border-radius: 50%;
        transform: translate(-50%, -50%);
      }

      #calibration-line {
        position: absolute;
        background: white;
        height: 2px;
        transform-origin: left center;
      }

      #calibration-instructions {
        position: absolute;
        bottom: 50px;
        width: 100%;
        text-align: center;
        color: white;
        font-size: 18px;
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(calibrationUI);

    // Add event listener for configuration button
    const configButton = document.getElementById('config-button');
    configButton.addEventListener('click', () => {
      // Collect configuration
      const coordinateSystem = document.querySelector('input[name="coordinates"]:checked').value;
      const animationStyle = document.querySelector('input[name="animation"]:checked').value;

      // Update state configuration
      window.state.config = {
        coordinateSystem,
        animationStyle,
        landmarkPoints: "3"  // Default to 3 points
      };

      // Hide config screen
      configScreen.classList.add('hidden');

      // Show calibration UI
      calibrationUI.classList.remove('hidden');

      // Trigger calibration start
      window.state.isCalibrating = true;
      
      // Call original website's calibration function if available
      if (window.startCalibration) {
        window.startCalibration();
      } else {
        console.warn('startCalibration function not found');
      }
    });

    // Add key press handler for calibration
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && window.state.isCalibrating) {
        console.log('Enter pressed during calibration');
        if (window.captureCalibrationPoint) {
          window.captureCalibrationPoint();
        } else {
          console.warn('captureCalibrationPoint function not found');
        }
      }
    });
  }

  console.log('Head Tracking Content Script Fully Initialized');
}

// Add explicit logging for script loading
console.log('Content script loading');
console.log('Window state:', window.state);
console.log('Window initDB:', window.initDB);

// Ensure database functions are available
if (typeof window.initDB === 'function') {
  window.initDB();
} else {
  console.error('initDB function not found');
}

// Add this at the top of your IIFE
console.log('Content script loaded');
console.log('Window object:', window);
console.log('Available functions:', {
  startCalibration: typeof window.startCalibration,
  captureCalibrationPoint: typeof window.captureCalibrationPoint
});

// Ensure functions are globally accessible
window.startCalibration = function() {
    console.log('Global startCalibration called');
    
    // Delegate to the actual implementation
    if (window.state) {
        window.state.isCalibrating = true;
        window.state.isTracking = false;
    }

    // Try to call the original startCalibration if it exists
    const originalStartCalibration = window.startCalibration || window.calibration?.startCalibration;
    if (originalStartCalibration) {
        console.log('Calling original startCalibration');
        originalStartCalibration();
    } else {
        console.error('No startCalibration function found');
    }
};

window.captureCalibrationPoint = function() {
    console.log('Global captureCalibrationPoint called');
    
    // Delegate to the original implementation
    const originalCaptureCalibrationPoint = 
        window.captureCalibrationPoint || 
        window.calibration?.captureCalibrationPoint;
    
    if (originalCaptureCalibrationPoint) {
        originalCaptureCalibrationPoint();
    } else {
        console.error('No captureCalibrationPoint function found');
    }
};

// Ensure the original website's scripts are fully loaded
function injectOriginalScripts() {
  const scripts = [
    'content/state.js',
    'content/database.js',
    'content/script.js',
    'content/calibration.js'
  ];

  scripts.forEach(src => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(src);
    document.head.appendChild(script);
  });
}

// Initialize the application
function initializeApplication() {
  if (window.initApp) {
    window.initApp();
  }
}

// Inject and initialize
injectOriginalScripts();
initializeApplication();

// Function to inject and initialize scripts
function initializeScripts() {
  const scriptsToLoad = [
    'content/state.js',
    'content/database.js',
    'content/script.js',
    'content/calibration.js'
  ];

  // Load scripts sequentially
  function loadScript(index) {
    if (index >= scriptsToLoad.length) {
      // All scripts loaded, initialize app
      if (window.initApp) {
        window.initApp();
      }
      return;
    }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(scriptsToLoad[index]);
    script.onload = () => {
      console.log(`Loaded ${scriptsToLoad[index]}`);
      loadScript(index + 1);
    };
    script.onerror = () => {
      console.error(`Failed to load ${scriptsToLoad[index]}`);
      loadScript(index + 1);
    };
    document.head.appendChild(script);
  }

  // Start loading scripts
  loadScript(0);
}

// Initialize scripts when page loads
window.addEventListener('load', initializeScripts);

// Add this near the top of the file
if (typeof window.updateCursor === 'undefined') {
  window.updateCursor = function() {
    console.log('Content script fallback updateCursor');
    
    // Basic cursor creation logic
    let cursor = document.getElementById('head-cursor');
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.id = 'head-cursor';
      cursor.style.position = 'fixed';
      cursor.style.width = '10px';
      cursor.style.height = '10px';
      cursor.style.backgroundColor = 'red';
      cursor.style.borderRadius = '50%';
      cursor.style.zIndex = '9999';
      document.body.appendChild(cursor);
    }

    // Simulate cursor at screen center
    cursor.style.left = `${window.innerWidth / 2}px`;
    cursor.style.top = `${window.innerHeight / 2}px`;
  };
}