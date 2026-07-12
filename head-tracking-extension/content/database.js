// Minimal database.js for Chrome extension
(function() {
  // Ensure global state exists
  if (typeof window.state === 'undefined') {
    window.state = {
      dataCollection: { 
        videoNumber: 1,
        calibrationData: []
      }
    };
  }

  if (typeof window.driveConfig === 'undefined') {
    window.driveConfig = {
      credentials: null,
      isInitialized: false
    };
  }

  // Singleton database instance
  let db = null;

  // Minimal database functions
  function initDB() {
    console.log('Minimal IndexedDB initialization');
    return new Promise((resolve, reject) => {
      if (db) {
        console.log('Database already initialized');
        resolve(db);
        return;
      }

      const request = indexedDB.open("HeadTrackingDB", 1);

      request.onerror = (event) => {
        console.error("IndexedDB error:", event.target.error);
        reject(event.target.error);
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains("calibrationData")) {
          database.createObjectStore("calibrationData", { 
            keyPath: "id", 
            autoIncrement: true 
          });
        }
      };

      request.onsuccess = (event) => {
        db = event.target.result;
        console.log("IndexedDB initialized successfully");
        resolve(db);
      };
    });
  }

  // Stub functions to prevent undefined errors
  function saveToIndexedDB(data) {
    if (!db) {
      console.warn('Database not initialized');
      return;
    }

    const transaction = db.transaction(["calibrationData"], "readwrite");
    const store = transaction.objectStore("calibrationData");
    
    store.add({
      timestamp: Date.now(),
      data: data
    });
  }

  function uploadToDrive() {
    console.warn('uploadToDrive stub called');
  }

  // Expose functions globally
  window.initDB = initDB;
  window.saveToIndexedDB = saveToIndexedDB;
  window.uploadToDrive = uploadToDrive;
})();

async function initializeDriveAPI() {
  try {
    const response = await fetch("/credentials/service-account.json");
    driveConfig.credentials = await response.json();
    driveConfig.isInitialized = true;
    console.log("Google Drive API initialized");
  } catch (error) {
    console.error("Failed to initialize Google Drive API:", error);
  }
}

async function uploadToDrive(csvContent) {
  if (!driveConfig.isInitialized) {
    console.error("Google Drive API not initialized");
    return;
  }

  try {
    const metadata = {
      name: `calibration_video${state.dataCollection.videoNumber}_${Date.now()}.csv`,
      mimeType: "text/csv",
    };

    const blob = new Blob([csvContent], { type: "text/csv" });
    const formData = new FormData();
    formData.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" })
    );
    formData.append("file", blob);

    const response = await fetch("YOUR_UPLOAD_ENDPOINT", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    console.log("Calibration data uploaded successfully");
  } catch (error) {
    console.error("Error uploading to Drive:", error);
  }
}

function initializeCursors() {
  // Remove existing cursors
  ["head-cursor-clipped", "head-cursor-raw"].forEach(id => {
    const existing = document.getElementById(id);
    if (existing) existing.remove();
  });

  // Reset cursor state
  state.lastHeadX = null;
  state.lastHeadY = null;
  state.cursorX = null;
  state.cursorY = null;
  state.rawCursorX = null;
  state.rawCursorY = null;

  // Create cursors with consistent styles
  const cursors = [
    { id: "head-cursor-clipped", color: "red", zIndex: "1000" },
    { id: "head-cursor-raw", color: "blue", opacity: "0.5", zIndex: "999" }
  ];

  cursors.forEach(({ id, color, opacity = "1", zIndex }) => {
    const cursor = document.createElement("div");
    cursor.id = id;
    cursor.style.position = "fixed";
    cursor.style.width = "20px";
    cursor.style.height = "20px";
    cursor.style.borderRadius = "50%";
    cursor.style.backgroundColor = color;
    cursor.style.opacity = opacity;
    cursor.style.zIndex = zIndex;
    cursor.style.transform = "translate(-50%, -50%)";
    cursor.style.pointerEvents = "none";
    document.body.appendChild(cursor);
  });

  // Initialize positions at center
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  cursors.forEach(({ id }) => {
    const cursor = document.getElementById(id);
    cursor.style.left = `${centerX}px`;
    cursor.style.top = `${centerY}px`;
  });
}

function determineConfiguration(headers) {
  const config = {
    coordinateSystem: "2d",
    landmarkPoints: "3",
    filterType: "exponential"
  };

  // Improved 3D coordinate detection
  const has3DCoordinates = headers.some(header => 
    header.includes("_z") || 
    header.includes("landmark3_2_z") || 
    header.includes("landmark6_2_z")
  );
  
  if (has3DCoordinates) {
    config.coordinateSystem = "3d";
    console.log("Detected 3D coordinates in calibration data");
  }

  // Determine number of landmarks
  const landmarkCount = Math.max(
    headers.filter(h => h.match(/landmark3_\d+_x/)).length,
    headers.filter(h => h.match(/landmark6_\d+_x/)).length
  );

  if (landmarkCount > 3) {
    config.landmarkPoints = "6";
  }

  console.log("Determined configuration:", config);
  return config;
}

function updateConfigurationUI(config) {
  try {
      // Check if elements exist before trying to update them
      const coordRadio = document.querySelector(
          `input[name="coordinates"][value="${config.coordinateSystem}"]`
      );
      if (coordRadio) {
          coordRadio.checked = true;
      } else {
          console.warn(`Coordinate system radio button for ${config.coordinateSystem} not found`);
      }

      // Store configuration in state
      state.config = {
          ...config,
          animationStyle: "without-line", // Default to no animation for uploaded calibration
          filterType: config.filterType || "exponential" // Default to exponential if not specified
      };

      console.log("Updated configuration:", state.config);
  } catch (error) {
      console.error("Error updating configuration UI:", error);
      throw new Error("Failed to update configuration UI");
  }
}

async function handleCalibrationUpload(file) {
  try {
      console.log("Starting calibration file upload:", file.name);
      const text = await file.text();
      
      // Extract metadata from first line
      const lines = text.split('\n');
      let metadata = {};
      
      if (!lines || !lines.length) {
          throw new Error("Empty file");
      }

      if (lines[0].startsWith('#')) {
          try {
              metadata = JSON.parse(lines[0].substring(1));
              console.log("Parsed metadata:", metadata);
              lines.shift();
          } catch (e) {
              console.warn("Failed to parse metadata:", e);
          }
      }

      const result = Papa.parse(lines.join('\n'), {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          transform: (value) => {
              if (typeof value === 'number') {
                  return Number(value.toFixed(8));
              }
              return value;
          }
      });

      if (!result.data || !result.data.length) {
          throw new Error("No data found in CSV file");
      }

      // Determine configuration
      const headers = Object.keys(result.data[0]);
      const config = {
          ...determineConfiguration(headers),
          filterType: metadata.filterType || "exponential", // Default to exponential if not specified
          landmarkPoints: "3" // Start with 3 points, can be changed via UI
      };

      console.log("Determined configuration:", config);

      // Update state configuration
      state.config = config;

      // Process the calibration data
      const processedData = processCalibrationData(result.data, config);

      // Update state with processed data
      state.calibrationData = processedData;
      
      // Calculate transformation matrices for both configurations
      state.transformationMatrices = {
          threePoint: calculateTransformationMatrixForConfig(
              processedData.landmarkPoints3,
              processedData.cursorPositions,
              "3"
          ),
          sixPoint: calculateTransformationMatrixForConfig(
              processedData.landmarkPoints6,
              processedData.cursorPositions,
              "6"
          )
      };

      // Initialize filters
      if (config.filterType === "oneEuro") {
          initializeFilters();
      }

      // Reset cursor state
      state.lastHeadX = null;
      state.lastHeadY = null;
      state.cursorX = null;
      state.cursorY = null;

      // Update application state
      state.isCalibrating = false;
      state.isTracking = true;

      // Hide configuration screen
      document.getElementById("config-screen").classList.add("hidden");

      // Initialize cursors
      initializeCursors();

      // Mount tracking controls (will show filter and landmark options)
      const controlsContainer = document.getElementById('tracking-controls-container');
      if (controlsContainer) {
          const root = ReactDOM.createRoot(controlsContainer);
          root.render(React.createElement(window.TrackingControls));
      }

      // Start tracking
      updateCursor();

      // Update status with current filter
      document.getElementById("status").textContent = `Using Filter: ${config.filterType}`;

      return true;
  } catch (error) {
      console.error("Error processing calibration file:", error);
      document.getElementById("status").textContent = "Error loading calibration file: " + error.message;
      return false;
  }
}

function processCalibrationData(data, config) {
  if (!data || !Array.isArray(data)) {
      console.error("Invalid data format:", data);
      throw new Error("Invalid calibration data format");
  }

  console.log("Processing calibration data with config:", config);

  const processedData = {
      landmarkPoints3: [],
      landmarkPoints6: [],
      cursorPositions: []
  };

  const is3D = config.coordinateSystem === "3d";

  data.forEach((row, index) => {
      try {
          if (!row.targetX || !row.targetY) {
              console.warn(`Missing target coordinates in row ${index}`);
              return;
          }

          // Process 3-point landmarks
          const threePointVector = [];
          let validThreePoint = true;

          // Handle 3-point landmarks
          for (let i = 0; i < 3; i++) {
              const x = row[`landmark3_${i}_x`];
              const y = row[`landmark3_${i}_y`];
              const z = is3D ? row[`landmark3_${i}_z`] : null;
              
              if (typeof x === 'undefined' || typeof y === 'undefined' || 
                  (is3D && typeof z === 'undefined')) {
                  console.warn(`Missing ${is3D ? '3D' : '2D'} data for 3-point landmark ${i}`);
                  validThreePoint = false;
                  break;
              }

              threePointVector.push([x], [y]);
              if (is3D) threePointVector.push([z]);
              
              // Add quadratic terms
              threePointVector.push([x * x * 0.00001], [y * y * 0.00001]);
              if (is3D) threePointVector.push([z * z * 0.0001]);
          }

          // Process 6-point landmarks
          const sixPointVector = [];
          let validSixPoint = true;

          // Handle 6-point landmarks
          for (let i = 0; i < 6; i++) {
              const x = row[`landmark6_${i}_x`];
              const y = row[`landmark6_${i}_y`];
              const z = is3D ? row[`landmark6_${i}_z`] : null;
              
              if (typeof x === 'undefined' || typeof y === 'undefined' || 
                  (is3D && typeof z === 'undefined')) {
                  console.warn(`Missing ${is3D ? '3D' : '2D'} data for 6-point landmark ${i}`);
                  validSixPoint = false;
                  break;
              }

              sixPointVector.push([x], [y]);
              if (is3D) sixPointVector.push([z]);
              
              // Add quadratic terms
              sixPointVector.push([x * x * 0.00001], [y * y * 0.00001]);
              if (is3D) sixPointVector.push([z * z * 0.0001]);
          }

          // Only add valid data points
          if (validThreePoint && validSixPoint) {
              processedData.landmarkPoints3.push(threePointVector);
              processedData.landmarkPoints6.push(sixPointVector);
              processedData.cursorPositions.push([[row.targetX], [row.targetY]]);
          }

      } catch (error) {
          console.error(`Error processing row ${index}:`, error);
      }
  });

  // Validate processed data
  if (!processedData.landmarkPoints3.length || 
      !processedData.landmarkPoints6.length || 
      !processedData.cursorPositions.length) {
      throw new Error("No valid calibration points found in data");
  }

  console.log("Processed calibration data:", {
      points3: processedData.landmarkPoints3.length,
      points6: processedData.landmarkPoints6.length,
      cursorPositions: processedData.cursorPositions.length,
      is3D: is3D
  });

  return processedData;
}

// Make functions globally available
window.handleCalibrationUpload = handleCalibrationUpload;
window.initializeDriveAPI = initializeDriveAPI;
window.uploadToDrive = uploadToDrive;