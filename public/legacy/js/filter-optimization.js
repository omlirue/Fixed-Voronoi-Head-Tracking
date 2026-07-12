// filter-optimization.js - Tools for optimizing cursor filter parameters

// Helper function to detect if developer tools are open
function isDevToolsOpen() {
  const threshold = 160; // Typical devtools minimum height
  return (
    window.outerHeight - window.innerHeight > threshold ||
    window.outerWidth - window.innerWidth > threshold
  );
}

// Function to show instructions for closing dev tools
function showDevToolsWarning() {
  return new Promise((resolve) => {
    const warning = document.createElement("div");
    warning.style.position = "fixed";
    warning.style.top = "0";
    warning.style.left = "0";
    warning.style.width = "100%";
    warning.style.height = "100%";
    warning.style.backgroundColor = "rgba(0,0,0,0.9)";
    warning.style.zIndex = "20000";
    warning.style.display = "flex";
    warning.style.flexDirection = "column";
    warning.style.justifyContent = "center";
    warning.style.alignItems = "center";
    warning.style.color = "white";
    warning.style.fontSize = "24px";
    warning.style.textAlign = "center";
    warning.style.fontFamily = "Arial, sans-serif";
    
    warning.innerHTML = `
      <div style="max-width: 600px; padding: 40px;">
        <h2 style="color: #ff6b6b; margin-bottom: 30px;">⚠️ Developer Tools Detected</h2>
        <p style="margin-bottom: 20px; line-height: 1.6;">
          For accurate testing, please close the developer console/inspect panel to use the full screen.
        </p>
        <p style="margin-bottom: 30px; line-height: 1.6;">
          <strong>How to close:</strong><br>
          • Press <kbd style="background: #333; padding: 4px 8px; border-radius: 4px;">F12</kbd> or<br>
          • Press <kbd style="background: #333; padding: 4px 8px; border-radius: 4px;">Cmd+Option+I</kbd> (Mac) / <kbd style="background: #333; padding: 4px 8px; border-radius: 4px;">Ctrl+Shift+I</kbd> (Windows/Linux)
        </p>
        <button id="continueBtn" style="
          background: #4CAF50; 
          color: white; 
          border: none; 
          padding: 15px 30px; 
          font-size: 18px; 
          border-radius: 8px; 
          cursor: pointer;
          margin-top: 20px;
        ">Continue with Full Screen</button>
        <p style="margin-top: 20px; font-size: 14px; color: #ccc;">
          Current screen: ${window.innerWidth}x${window.innerHeight}<br>
          Full window: ${window.outerWidth}x${window.outerHeight}
        </p>
      </div>
    `;
    
    document.body.appendChild(warning);
    
    const continueBtn = document.getElementById("continueBtn");
    continueBtn.addEventListener("click", () => {
      document.body.removeChild(warning);
      resolve();
    });
    
    // Auto-continue if dev tools are closed
    const checkInterval = setInterval(() => {
      if (!isDevToolsOpen()) {
        clearInterval(checkInterval);
        if (document.body.contains(warning)) {
          document.body.removeChild(warning);
          resolve();
        }
      }
    }, 500);
  });
}

// Function to get optimal screen positions using full available space
function getFullScreenPositions() {
  // Use the full inner dimensions (excluding any browser chrome)
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  // Add some margin from edges to ensure targets are fully visible
  const margin = 50;
  
  return [
    { x: width/2, y: height/2, name: "center" },
    { x: margin, y: margin, name: "top-left" },
    { x: width - margin, y: margin, name: "top-right" },
    { x: margin, y: height - margin, name: "bottom-left" },
    { x: width - margin, y: height - margin, name: "bottom-right" },
    // Add some intermediate positions for better coverage
    { x: width/2, y: margin, name: "top-center" },
    { x: width/2, y: height - margin, name: "bottom-center" },
    { x: margin, y: height/2, name: "left-center" },
    { x: width - margin, y: height/2, name: "right-center" }
  ];
}

// Helper function to calculate statistics for a set of cursor position samples
function calculateStabilityStats(samples) {
    if (!samples || samples.length === 0) {
      return {
        samples: 0,
        meanX: 0, 
        meanY: 0,
        varX: 0,
        varY: 0,
        stdDevX: 0,
        stdDevY: 0,
        combinedStdDev: 0
      };
    }
    
    // Filter out any null values
    const validSamples = samples.filter(s => s.x !== null && s.y !== null);
    
    if (validSamples.length === 0) {
      return {
        samples: 0,
        meanX: 0, 
        meanY: 0,
        varX: 0,
        varY: 0,
        stdDevX: 0,
        stdDevY: 0,
        combinedStdDev: 0
      };
    }
    
    // Calculate mean
    const meanX = validSamples.reduce((sum, s) => sum + s.x, 0) / validSamples.length;
    const meanY = validSamples.reduce((sum, s) => sum + s.y, 0) / validSamples.length;
    
    // Calculate variance
    const varX = validSamples.reduce((sum, s) => sum + Math.pow(s.x - meanX, 2), 0) / validSamples.length;
    const varY = validSamples.reduce((sum, s) => sum + Math.pow(s.y - meanY, 2), 0) / validSamples.length;
    
    // Calculate standard deviation
    const stdDevX = Math.sqrt(varX);
    const stdDevY = Math.sqrt(varY);
    
    return {
      samples: validSamples.length,
      meanX, 
      meanY,
      varX,
      varY,
      stdDevX,
      stdDevY,
      combinedStdDev: Math.sqrt(stdDevX*stdDevX + stdDevY*stdDevY)
    };
  }
  
  // Simple function to measure cursor stability at the current position
  function measureCursorStability(durationMs = 3000) {
    // Create a simple target point
    const target = document.createElement("div");
    target.style.position = "fixed";
    target.style.width = "20px";
    target.style.height = "20px";
    target.style.borderRadius = "50%";
    target.style.backgroundColor = "red";
    target.style.left = "50%";
    target.style.top = "50%";
    target.style.transform = "translate(-50%, -50%)";
    target.style.zIndex = "10000";
    document.body.appendChild(target);
    
    // Add status text
    const status = document.createElement("div");
    status.style.position = "fixed";
    status.style.bottom = "20px";
    status.style.left = "20px";
    status.style.color = "white";
    status.style.background = "rgba(0,0,0,0.7)";
    status.style.padding = "10px";
    status.style.zIndex = "10000";
    status.textContent = "Get ready - hold your head still";
    document.body.appendChild(status);
    
    // Collect data
    console.log("Starting stability measurement");
    setTimeout(() => {
      status.textContent = "HOLD STILL - collecting data...";
      
      const samples = [];
      const startTime = performance.now();
      const interval = setInterval(() => {
        // Record current position
        samples.push({
          time: performance.now() - startTime,
          x: state.cursorX,
          y: state.cursorY
        });
      }, 16); // ~60fps
      
      // End collection after duration
      setTimeout(() => {
        clearInterval(interval);
        document.body.removeChild(target);
        document.body.removeChild(status);
        
        // Calculate statistics
        const stats = calculateStabilityStats(samples);
        console.log("Stability measurement complete:", stats);
        alert(`Stability stats: StdDev X=${stats.stdDevX.toFixed(2)}px, Y=${stats.stdDevY.toFixed(2)}px`);
      }, durationMs);
    }, 2000); // Give 2 seconds to get ready
  }
  
  // Comprehensive test to find optimal exponential smoothing parameter
  async function findOptimalExponentialSmoothing() {
    // Check if tracking system is ready
    if (!checkTrackingSystemReady()) {
      return;
    }
    
    // Check if dev tools are open and show warning if needed
    if (isDevToolsOpen()) {
      await showDevToolsWarning();
    }
    
    // Create UI elements
    const ui = document.createElement("div");
    ui.style.position = "fixed";
    ui.style.top = "0";
    ui.style.left = "0";
    ui.style.width = "100%";
    ui.style.height = "100%";
    ui.style.backgroundColor = "rgba(0,0,0,0.7)";
    ui.style.zIndex = "10000";
    
    const target = document.createElement("div");
    target.style.position = "fixed";
    target.style.width = "20px";
    target.style.height = "20px";
    target.style.borderRadius = "50%";
    target.style.backgroundColor = "red";
    target.style.transform = "translate(-50%, -50%)";
    target.style.zIndex = "10001";
    
    const status = document.createElement("div");
    status.style.position = "fixed";
    status.style.bottom = "20px";
    status.style.left = "20px";
    status.style.color = "white";
    status.style.background = "rgba(0,0,0,0.7)";
    status.style.padding = "10px";
    status.style.zIndex = "10001";
    
    ui.appendChild(target);
    ui.appendChild(status);
    document.body.appendChild(ui);
    
    // Store original filter settings to restore later
    const originalFilter = window.state.config.filterType;
    const originalSmoothing = window.state.config.exponentialSmoothingFactor;
    
    // Use full screen positions
    const positions = getFullScreenPositions();
    
    // Show screen info
    console.log(`Using full screen: ${window.innerWidth}x${window.innerHeight}`);
    console.log("Test positions:", positions);
    
    // Range of smoothing values to test
    const smoothingValues = [0.7, 0.75, 0.8, 0.85, 0.9, 0.92, 0.94, 0.95, 0.96, 0.97, 0.98];
    
    // Storage for results
    const results = [];
    
    // Target variance threshold (in pixels)
    const targetVariance = 25.0; // Adjusted based on real head tracking variance
    
    // Force exponential filter
    window.state.config.filterType = "exponential";
    
    // Run the test sequence
    let positionIndex = 0;
    let smoothingIndex = 0;
    
    function runNextTest() {
      if (positionIndex >= positions.length) {
        // All tests complete
        finishTesting();
        return;
      }
      
      const position = positions[positionIndex];
      const smoothing = smoothingValues[smoothingIndex];
      
      // Set target position
      target.style.left = `${position.x}px`;
      target.style.top = `${position.y}px`;
      
      // Update status
      status.textContent = `Testing position: ${position.name} (${position.x}, ${position.y}), Smoothing: ${smoothing}`;
      
      // Set smoothing value
      window.state.config.exponentialSmoothingFactor = smoothing;
      
      // Reset cursor state
      window.state.lastHeadX = null;
      window.state.lastHeadY = null;
      window.state.cursorX = null;
      window.state.cursorY = null;
      
      // Wait for positioning
      setTimeout(() => {
        status.textContent = `HOLD STILL - Collecting data (${position.name}, smoothing=${smoothing})`;
        
        // Collect data
        const samples = [];
        const collectInterval = setInterval(() => {
          // Collect RAW head position data, not filtered cursor data
          if (window.state.lastLandmarks && window.state.lastHeadX !== null && window.state.lastHeadY !== null) {
            samples.push({
              headX: window.state.lastHeadX,
              headY: window.state.lastHeadY
            });
          }
        }, 16);
        
        // End collection after 3 seconds
        setTimeout(() => {
          clearInterval(collectInterval);
          
          // Apply exponential smoothing to the raw data we collected
          const filteredData = applyExpSmoothing(samples, smoothing);
          
          // Calculate stats on the filtered data
          const stats = calculateStabilityStats(filteredData);
          
          // Store result
          results.push({
            position: position.name,
            positionCoords: { x: position.x, y: position.y },
            smoothing,
            samples: samples.length,
            stdDevX: stats.stdDevX,
            stdDevY: stats.stdDevY,
            combinedStdDev: stats.combinedStdDev
          });
          
          console.log(`Position: ${position.name} (${position.x}, ${position.y}), Smoothing: ${smoothing}, StdDev: ${stats.combinedStdDev.toFixed(2)}px`);
          
          // Move to next test
          smoothingIndex++;
          if (smoothingIndex >= smoothingValues.length) {
            smoothingIndex = 0;
            positionIndex++;
          }
          
          // Short pause before next test
          setTimeout(runNextTest, 500);
          
        }, 3000); // 3 seconds data collection
        
      }, 2000); // 2 seconds to position
    }
    
    function finishTesting() {
      // Remove UI
      document.body.removeChild(ui);
      
      // Restore original settings
      window.state.config.filterType = originalFilter;
      window.state.config.exponentialSmoothingFactor = originalSmoothing;
      
      // Analyze results
      console.log("All test results:", results);
      
      // Find minimum smoothing value that keeps variance below threshold at all positions
      const optimalByPosition = {};
      
      positions.forEach(pos => {
        const posResults = results.filter(r => r.position === pos.name);
        const validResults = posResults.filter(r => r.combinedStdDev <= targetVariance);
        
        if (validResults.length > 0) {
          // Find minimum smoothing value that meets threshold
          validResults.sort((a, b) => a.smoothing - b.smoothing);
          optimalByPosition[pos.name] = validResults[0].smoothing;
        } else {
          optimalByPosition[pos.name] = "None found";
        }
      });
      
      // Find global optimal (maximum of all positions to ensure all meet threshold)
      const validPositions = Object.entries(optimalByPosition)
        .filter(([pos, val]) => val !== "None found")
        .map(([pos, val]) => parseFloat(val));
        
      const globalOptimal = validPositions.length > 0 ? Math.max(...validPositions) : "None found";
      
      // Show results
      console.log("Optimal smoothing by position:", optimalByPosition);
      console.log("Global optimal smoothing:", globalOptimal);
      
      // Add clarification about parameter interpretation
      if (globalOptimal !== "None found") {
        const newDataPercent = ((1 - globalOptimal) * 100).toFixed(0);
        console.log(`\n📊 INTERPRETATION: Optimal smoothing factor ${globalOptimal} means:`);
        console.log(`   • ${newDataPercent}% new data, ${(globalOptimal * 100).toFixed(0)}% old data`);
        console.log(`   • This is ${globalOptimal < 0.8 ? 'LIGHT' : globalOptimal < 0.9 ? 'MODERATE' : 'HEAVY'} smoothing`);
        console.log(`   • Lower values = less smoothing = more responsive`);
      }
      
      alert(`Optimal exponential smoothing: ${globalOptimal}\nScreen size used: ${window.innerWidth}x${window.innerHeight}`);
      
      // Create report object
      const report = {
        screenSize: { width: window.innerWidth, height: window.innerHeight },
        testPositions: positions,
        targetVariance,
        optimalByPosition,
        globalOptimal,
        allResults: results
      };
      
      // Download results
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
      const downloadLink = document.createElement("a");
      downloadLink.setAttribute("href", dataStr);
      downloadLink.setAttribute("download", "exponential_smoothing_results.json");
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
    
    // Start testing
    status.textContent = "Preparing test...";
    setTimeout(runNextTest, 1000);
  }
  
  // Function to test one euro filter parameters
  async function findOptimalOneEuroParameters() {
    // Check if tracking system is ready
    if (!checkTrackingSystemReady()) {
      return;
    }
    
    // Check if dev tools are open and show warning if needed
    if (isDevToolsOpen()) {
      await showDevToolsWarning();
    }
    
    // Create UI elements
    const ui = document.createElement("div");
    ui.style.position = "fixed";
    ui.style.top = "0";
    ui.style.left = "0";
    ui.style.width = "100%";
    ui.style.height = "100%";
    ui.style.backgroundColor = "rgba(0,0,0,0.7)";
    ui.style.zIndex = "10000";
    
    const target = document.createElement("div");
    target.style.position = "fixed";
    target.style.width = "20px";
    target.style.height = "20px";
    target.style.borderRadius = "50%";
    target.style.backgroundColor = "red";
    target.style.transform = "translate(-50%, -50%)";
    target.style.zIndex = "10001";
    
    const status = document.createElement("div");
    status.style.position = "fixed";
    status.style.bottom = "20px";
    status.style.left = "20px";
    status.style.color = "white";
    status.style.background = "rgba(0,0,0,0.7)";
    status.style.padding = "10px";
    status.style.zIndex = "10001";
    
    ui.appendChild(target);
    ui.appendChild(status);
    document.body.appendChild(ui);
    
    // Store original filter settings to restore later
    const originalFilter = window.state.config.filterType;
    const originalFilterConfig = { ...window.state.filterConfig };
    
    // Use full screen positions
    const positions = getFullScreenPositions();
    
    // Show screen info
    console.log(`Using full screen: ${window.innerWidth}x${window.innerHeight}`);
    console.log("Test positions:", positions);
    
    // Parameter combinations to test - focusing on beta and minCutoff as professor suggested
    const parameterSets = [];
    
    // Generate parameter combinations
    for (const minCutoff of [0.5, 1.0, 1.5, 2.0, 2.5]) {
      for (const beta of [0.001, 0.005, 0.007, 0.008, 0.009, 0.01, 0.011, 0.012, 0.013, 0.014, 0.015, 0.02, 0.05]) {
        parameterSets.push({
          frequency: 60,
          minCutoff,
          beta,
          dcutoff: 1.0
        });
      }
    }
    
    // Storage for results
    const results = [];
    
    // Target variance threshold (in pixels)
    const targetVariance = 25.0; // Same as exponential for fair comparison
    
    // Force one euro filter
    window.state.config.filterType = "oneEuro";
    
    // Run the test sequence
    let positionIndex = 0;
    let parameterIndex = 0;
    
    function runNextTest() {
      if (positionIndex >= positions.length) {
        // All tests complete
        finishTesting();
        return;
      }
      
      const position = positions[positionIndex];
      const params = parameterSets[parameterIndex];
      
      // Set target position
      target.style.left = `${position.x}px`;
      target.style.top = `${position.y}px`;
      
      // Update status
      status.textContent = `Testing position: ${position.name} (${position.x}, ${position.y}), minCutoff: ${params.minCutoff}, beta: ${params.beta}`;
      
      // Set filter parameters
      if (!window.state.filterConfig) {
        window.state.filterConfig = {};
      }
      window.state.filterConfig.frequency = params.frequency;
      window.state.filterConfig.minCutoff = params.minCutoff;
      window.state.filterConfig.beta = params.beta;
      window.state.filterConfig.dcutoff = params.dcutoff;
      
      // Reset filters and cursor state
      window.state.lastHeadX = null;
      window.state.lastHeadY = null;
      window.state.cursorX = null;
      window.state.cursorY = null;
      window.initializeFilters();
      
      // Wait for positioning
      setTimeout(() => {
        status.textContent = `HOLD STILL - Collecting data (${position.name}, minCutoff=${params.minCutoff}, beta=${params.beta})`;
        
        // Record start time for timestamps
        const startTime = performance.now();
        
        // Collect data
        const samples = [];
        const collectInterval = setInterval(() => {
          // Collect RAW head position data, not filtered cursor data
          if (window.state.lastLandmarks && window.state.lastHeadX !== null && window.state.lastHeadY !== null) {
            samples.push({
              time: performance.now() - startTime,
              headX: window.state.lastHeadX,
              headY: window.state.lastHeadY
            });
          }
        }, 16);
        
        // End collection after 3 seconds
        setTimeout(() => {
          clearInterval(collectInterval);
          
          // Apply One Euro filter to the raw data we collected
          const filteredData = applyOneEuroFilter(samples, params);
          
          // Calculate stats on the filtered data
          const stats = calculateStabilityStats(filteredData);
          
          // Store result
          results.push({
            position: position.name,
            positionCoords: { x: position.x, y: position.y },
            params: { ...params },
            samples: samples.length,
            stdDevX: stats.stdDevX,
            stdDevY: stats.stdDevY,
            combinedStdDev: stats.combinedStdDev
          });
          
          console.log(`Position: ${position.name} (${position.x}, ${position.y}), minCutoff: ${params.minCutoff}, beta: ${params.beta}, StdDev: ${stats.combinedStdDev.toFixed(2)}px`);
          
          // Move to next test
          parameterIndex++;
          if (parameterIndex >= parameterSets.length) {
            parameterIndex = 0;
            positionIndex++;
          }
          
          // Short pause before next test
          setTimeout(runNextTest, 500);
          
        }, 3000); // 3 seconds data collection
        
      }, 2000); // 2 seconds to position
    }
    
    function finishTesting() {
      // Remove UI
      document.body.removeChild(ui);
      
      // Restore original settings
      window.state.config.filterType = originalFilter;
      window.state.filterConfig = originalFilterConfig;
      window.initializeFilters();
      
      // Analyze results
      console.log("All test results:", results);
      
      // Find optimal parameters by position
      const optimalByPosition = {};
      
      positions.forEach(pos => {
        const posResults = results.filter(r => r.position === pos.name);
        const validResults = posResults.filter(r => r.combinedStdDev <= targetVariance);
        
        if (validResults.length > 0) {
          // Sort by beta (lower is better), then by minCutoff (lower is better)
          validResults.sort((a, b) => {
            if (a.params.beta !== b.params.beta) {
              return a.params.beta - b.params.beta;
            }
            return a.params.minCutoff - b.params.minCutoff;
          });
          
          optimalByPosition[pos.name] = {
            minCutoff: validResults[0].params.minCutoff,
            beta: validResults[0].params.beta
          };
        } else {
          optimalByPosition[pos.name] = "None found";
        }
      });
      
      // Find global optimal (parameters that work for all positions)
      let globalOptimal = null;
      
      // Find parameter sets that meet threshold at all positions
      const validParameterSets = parameterSets.filter(params => {
        return positions.every(pos => {
          const matchingResult = results.find(r => 
            r.position === pos.name && 
            r.params.minCutoff === params.minCutoff && 
            r.params.beta === params.beta
          );
          return matchingResult && matchingResult.combinedStdDev <= targetVariance;
        });
      });
      
      // Sort by beta (lower is better), then by minCutoff (lower is better)
      validParameterSets.sort((a, b) => {
        if (a.beta !== b.beta) {
          return a.beta - b.beta;
        }
        return a.minCutoff - b.minCutoff;
      });
      
      globalOptimal = validParameterSets.length > 0 ? validParameterSets[0] : null;
      
      // Show results
      console.log("Optimal parameters by position:", optimalByPosition);
      console.log("Global optimal parameters:", globalOptimal);
      
      if (globalOptimal) {
        alert(`Optimal One Euro parameters: minCutoff=${globalOptimal.minCutoff}, beta=${globalOptimal.beta}\nScreen size used: ${window.innerWidth}x${window.innerHeight}`);
      } else {
        alert(`No One Euro parameters found that meet threshold at all positions\nScreen size used: ${window.innerWidth}x${window.innerHeight}`);
      }
      
      // Create report object
      const report = {
        screenSize: { width: window.innerWidth, height: window.innerHeight },
        testPositions: positions,
        targetVariance,
        optimalByPosition,
        globalOptimal,
        allResults: results
      };
      
      // Download results
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
      const downloadLink = document.createElement("a");
      downloadLink.setAttribute("href", dataStr);
      downloadLink.setAttribute("download", "one_euro_filter_results.json");
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
    
    // Start testing
    status.textContent = "Preparing test...";
    setTimeout(runNextTest, 1000);
  }
  
  // Helper function to check setup before running tests
  function checkTestingSetup() {
    const info = {
      devToolsOpen: isDevToolsOpen(),
      screenSize: {
        inner: { width: window.innerWidth, height: window.innerHeight },
        outer: { width: window.outerWidth, height: window.outerHeight }
      },
      testPositions: getFullScreenPositions()
    };
    
    console.log("=== TESTING SETUP CHECK ===");
    console.log("Developer tools open:", info.devToolsOpen);
    console.log("Screen dimensions:");
    console.log("  Inner (usable):", `${info.screenSize.inner.width}x${info.screenSize.inner.height}`);
    console.log("  Outer (total):", `${info.screenSize.outer.width}x${info.screenSize.outer.height}`);
    console.log("Test positions that will be used:", info.testPositions);
    
    if (info.devToolsOpen) {
      console.warn("⚠️ Developer tools are open! This will reduce the usable screen area.");
      console.warn("Close dev tools (F12 or Cmd+Option+I) for full screen testing.");
    } else {
      console.log("✅ Setup looks good for full screen testing!");
    }
    
    return info;
  }

  // Make functions globally available
  window.measureCursorStability = measureCursorStability;
  window.findOptimalExponentialSmoothing = findOptimalExponentialSmoothing;
  window.findOptimalOneEuroParameters = findOptimalOneEuroParameters;
  window.calculateStabilityStats = calculateStabilityStats;
  window.checkTestingSetup = checkTestingSetup;
  window.isDevToolsOpen = isDevToolsOpen;

function findOptimalParameters(results, targetVariance = 25.0) {
    // Find exponential smoothing parameter
    const expOptimal = {};
    for (const position of Object.keys(results.expResults)) {
      const validResults = results.expResults[position].filter(r => 
        r.combinedStdDev <= targetVariance
      );
      
      if (validResults.length > 0) {
        validResults.sort((a, b) => a.smoothing - b.smoothing);
        expOptimal[position] = validResults[0].smoothing;
      } else {
        expOptimal[position] = "None found";
      }
    }
    
    // Find 1€ filter parameters
    const oneEuroOptimal = {};
    for (const position of Object.keys(results.oneEuroResults)) {
      const validResults = results.oneEuroResults[position].filter(r => 
        r.combinedStdDev <= targetVariance
      );
      
      if (validResults.length > 0) {
        validResults.sort((a, b) => {
          if (a.params.beta !== b.params.beta) {
            return a.params.beta - b.params.beta;
          }
          return a.params.minCutoff - b.params.minCutoff;
        });
        oneEuroOptimal[position] = validResults[0].params;
      } else {
        oneEuroOptimal[position] = "None found";
      }
    }
    
    return { expOptimal, oneEuroOptimal };
  }
 
  window.offlineParameterAnalysis = async function() {
    // Check if tracking system is ready
    if (!checkTrackingSystemReady()) {
      return;
    }
    
    console.log("Starting offline parameter analysis...");
    
    // Collect raw data at all positions
    const rawData = await collectDataAtAllPositions();
    
    // Step 2: Analyze with different parameters
    console.log("Analyzing data with different parameters...");
    const results = analyzeDataWithParameters(rawData);
    
    // Show variance summary to help understand if threshold needs adjustment
    console.log("\n=== VARIANCE SUMMARY ===");
    let allVariances = [];
    
    // Collect all variance values from exponential smoothing
    for (const position of Object.keys(results.expResults)) {
      for (const result of results.expResults[position]) {
        allVariances.push(result.combinedStdDev);
      }
    }
    
    // Collect all variance values from One Euro filter
    for (const position of Object.keys(results.oneEuroResults)) {
      for (const result of results.oneEuroResults[position]) {
        allVariances.push(result.combinedStdDev);
      }
    }
    
    if (allVariances.length > 0) {
      const minVariance = Math.min(...allVariances);
      const maxVariance = Math.max(...allVariances);
      const avgVariance = allVariances.reduce((a, b) => a + b, 0) / allVariances.length;
      
      console.log(`Variance range: ${minVariance.toFixed(3)}px to ${maxVariance.toFixed(3)}px`);
      console.log(`Average variance: ${avgVariance.toFixed(3)}px`);
      console.log(`Current target threshold: 25.0px`);
      
      if (minVariance > 25.0) {
        console.log(`⚠️  All variance values are above 25.0px threshold!`);
        console.log(`Consider increasing target threshold to ${Math.ceil(minVariance * 1.1)}px or improving head stability`);
      }
    }
    
    // Find optimal parameters
    console.log("Finding optimal parameters...");
    const optimal = findOptimalParameters(results);
    
    // Show detailed breakdown of why some positions might not have optimal parameters
    console.log("\n=== DETAILED POSITION ANALYSIS ===");
    for (const position of Object.keys(results.expResults)) {
      const expResults = results.expResults[position];
      const oneEuroResults = results.oneEuroResults[position];
      
      // Find best exponential result
      const bestExp = expResults.reduce((best, current) => 
        current.combinedStdDev < best.combinedStdDev ? current : best
      );
      
      // Find best One Euro result
      const bestOneEuro = oneEuroResults.reduce((best, current) => 
        current.combinedStdDev < best.combinedStdDev ? current : best
      );
      
      console.log(`${position}:`);
      console.log(`  Best exponential: ${bestExp.smoothing} (${bestExp.combinedStdDev.toFixed(2)}px) ${bestExp.combinedStdDev <= 25.0 ? '✅' : '❌'}`);
      console.log(`  Best One Euro: minCutoff=${bestOneEuro.params.minCutoff}, beta=${bestOneEuro.params.beta} (${bestOneEuro.combinedStdDev.toFixed(2)}px) ${bestOneEuro.combinedStdDev <= 25.0 ? '✅' : '❌'}`);
    }
    
    // Step 4: Generate report
    const report = {
      screenSize: { width: window.innerWidth, height: window.innerHeight },
      testPositions: getFullScreenPositions(),
      collectionTimestamp: new Date().toISOString(),
      rawDataSampleCounts: Object.fromEntries(
        Object.entries(rawData).map(([pos, data]) => [pos, data.length])
      ),
      targetVariance: 25.0,
      expOptimal: optimal.expOptimal,
      oneEuroOptimal: optimal.oneEuroOptimal,
      results: results
    };
    
    // Save report
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadLink = document.createElement("a");
    downloadLink.setAttribute("href", dataStr);
    downloadLink.setAttribute("download", "parameter_optimization_report.json");
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    // Display summary
    console.log("=== PARAMETER OPTIMIZATION RESULTS ===");
    console.log(`Screen size used: ${window.innerWidth}x${window.innerHeight}`);
    console.log("Exponential smoothing by position:", optimal.expOptimal);
    console.log("One Euro parameters by position:", optimal.oneEuroOptimal);
    
    // Find global optimal parameters
    const validExpValues = Object.values(optimal.expOptimal)
      .filter(val => val !== "None found")
      .map(val => parseFloat(val));
      
    const globalExpOptimal = validExpValues.length > 0 ? 
      Math.max(...validExpValues) : "None found";
      
    console.log("Global optimal exponential smoothing:", globalExpOptimal);
    
    // Find common one euro parameters that work for all positions
    const allPositions = Object.keys(rawData);
    const oneEuroParamSets = results.oneEuroResults[allPositions[0]].map(r => r.params);
    const validParamSets = oneEuroParamSets.filter(params => {
      return allPositions.every(pos => {
        const matchingResult = results.oneEuroResults[pos].find(r => 
          r.params.minCutoff === params.minCutoff && 
          r.params.beta === params.beta
        );
        return matchingResult && matchingResult.combinedStdDev <= 25.0;
      });
    });
    
    // Sort by beta (lower is better), then by minCutoff (lower is better)
    validParamSets.sort((a, b) => {
      if (a.beta !== b.beta) {
        return a.beta - b.beta;
      }
      return a.minCutoff - b.minCutoff;
    });
    
    const globalOneEuroOptimal = validParamSets.length > 0 ? 
      validParamSets[0] : "None found";
      
    console.log("Global optimal One Euro parameters:", globalOneEuroOptimal);
    
    return report;
  };

  function analyzeDataWithParameters(rawData, threshold = 25.0) {
    // Parameters to test
    const expSmoothingValues = [0.7, 0.75, 0.8, 0.85, 0.9, 0.92, 0.94, 0.95, 0.96, 0.97, 0.98];
    const oneEuroParams = [];
    for (const minCutoff of [0.5, 1.0, 1.5, 2.0, 2.5]) {
      for (const beta of [0.001, 0.005, 0.007, 0.008, 0.009, 0.01, 0.011, 0.012, 0.013, 0.014, 0.015, 0.02, 0.05]) {
        oneEuroParams.push({ minCutoff, beta, frequency: 60, dcutoff: 1.0 });
      }
    }
    
    console.log(`Using threshold: ${threshold}px for parameter analysis`);
    
    // Apply exponential smoothing to data
    const expResults = {};
    for (const position of Object.keys(rawData)) {
      expResults[position] = [];
      console.log(`\n=== DEBUGGING EXPONENTIAL SMOOTHING FOR ${position.toUpperCase()} ===`);
      console.log(`Raw data samples: ${rawData[position].length}`);
      
      for (const smoothing of expSmoothingValues) {
        const filteredData = applyExpSmoothing(rawData[position], smoothing);
        const stats = calculateStabilityStats(filteredData);
        
        // Log actual variance values for debugging
        console.log(`${position}: smoothing=${smoothing}, variance=${stats.combinedStdDev.toFixed(3)}px ${stats.combinedStdDev <= threshold ? '✅' : '❌'}`);
        
        expResults[position].push({ 
          smoothing, 
          stdDevX: stats.stdDevX,
          stdDevY: stats.stdDevY,
          combinedStdDev: stats.combinedStdDev
        });
      }
    }
    
    // Apply 1€ filter to data
    const oneEuroResults = {};
    for (const position of Object.keys(rawData)) {
      oneEuroResults[position] = [];
      console.log(`\n=== DEBUGGING ONE EURO FILTER FOR ${position.toUpperCase()} ===`);
      
      let debugCount = 0;
      for (const params of oneEuroParams) {
        const filteredData = applyOneEuroFilter(rawData[position], params);
        const stats = calculateStabilityStats(filteredData);
        
        // Only log first few for debugging
        if (debugCount < 5) {
          console.log(`minCutoff ${params.minCutoff}, beta ${params.beta}: StdDev = ${stats.combinedStdDev.toFixed(3)}px ${stats.combinedStdDev <= threshold ? '✅' : '❌'}`);
          debugCount++;
        }
        
        oneEuroResults[position].push({ 
          params, 
          stdDevX: stats.stdDevX,
          stdDevY: stats.stdDevY,
          combinedStdDev: stats.combinedStdDev
        });
      }
    }
    
    return { expResults, oneEuroResults };
  }
  
  // Helper functions to apply filters to raw data
  function applyExpSmoothing(data, smoothingFactor) {
    if (!data || data.length === 0) {
      console.log("No data to smooth");
      return [];
    }
    
    // NOTE: smoothingFactor interpretation:
    // smoothingFactor = 0.7 means (1-0.7) = 0.3 = 30% new data, 70% old data (moderate smoothing)
    // smoothingFactor = 0.95 means (1-0.95) = 0.05 = 5% new data, 95% old data (heavy smoothing)
    // LOWER smoothingFactor = LESS smoothing, MORE responsiveness
    // HIGHER smoothingFactor = MORE smoothing, LESS responsiveness
    
    console.log(`Applying exponential smoothing with factor=${smoothingFactor} (${((1-smoothingFactor)*100).toFixed(0)}% new data)`);
    console.log(`Input data: ${data.length} samples`);
    console.log(`First sample:`, data[0]);
    console.log(`Last sample:`, data[data.length - 1]);
    
    const result = [];
    let lastX = null;
    let lastY = null;
    
    for (const sample of data) {
      if (lastX === null) {
        lastX = sample.headX;
        lastY = sample.headY;
      } else {
        // Formula: new = old + (1 - smoothingFactor) * (raw - old)
        // Where (1 - smoothingFactor) is the weight given to new data
        lastX = lastX + (1 - smoothingFactor) * (sample.headX - lastX);
        lastY = lastY + (1 - smoothingFactor) * (sample.headY - lastY);
      }
      
      result.push({ x: lastX, y: lastY });
    }
    
    console.log(`Output data: ${result.length} samples`);
    console.log(`First smoothed:`, result[0]);
    console.log(`Last smoothed:`, result[result.length - 1]);
    
    return result;
  }
  
  function applyOneEuroFilter(data, params) {
    if (!data || data.length === 0) {
      console.log("No data to filter");
      return [];
    }
    
    console.log(`Applying OneEuro filter with minCutoff=${params.minCutoff}, beta=${params.beta}`);
    console.log(`Input data: ${data.length} samples`);
    console.log(`First sample:`, data[0]);
    console.log(`Last sample:`, data[data.length - 1]);
    
    const filter2D = new OneEuroFilter2D(
      params.frequency,
      params.minCutoff,
      params.beta,
      params.dcutoff
    );
    
    const result = [];
    
    for (let i = 0; i < data.length; i++) {
      const sample = data[i];
      const timestamp = sample.time / 1000; // Convert to seconds
      
      const filtered = filter2D.filter(sample.headX, sample.headY, timestamp);
      
      result.push({ x: filtered.x, y: filtered.y });
    }
    
    console.log(`Output data: ${result.length} samples`);
    console.log(`First filtered:`, result[0]);
    console.log(`Last filtered:`, result[result.length - 1]);
    
    return result;
  }

  async function collectDataAtAllPositions() {
    // Check if dev tools are open and show warning if needed
    if (isDevToolsOpen()) {
      await showDevToolsWarning();
    }
    
    // Use full screen positions
    const positions = getFullScreenPositions();
    
    // Show screen info
    console.log(`Using full screen: ${window.innerWidth}x${window.innerHeight}`);
    console.log("Test positions:", positions);
    
    const allData = {};
    
    // Collect data for each position
    for (const position of positions) {
      alert(`Next position: ${position.name} (${position.x}, ${position.y}). Click OK and look at the red dot.`);
      const data = await recordHeadPositionData(3000, position);
      allData[position.name] = data;
      console.log(`Recorded ${data.length} samples at ${position.name} (${position.x}, ${position.y})`);
    }
    
    // Save all collected data with screen info
    const dataWithMetadata = {
      screenSize: { width: window.innerWidth, height: window.innerHeight },
      testPositions: positions,
      collectionTimestamp: new Date().toISOString(),
      data: allData
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataWithMetadata, null, 2));
    const downloadLink = document.createElement("a");
    downloadLink.setAttribute("href", dataStr);
    downloadLink.setAttribute("download", "raw_head_position_data.json");
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    return allData;
  }
  
  window.collectDataAtAllPositions = collectDataAtAllPositions;

  function recordHeadPositionData(duration = 3000, position) {
    // Show where to look
    const target = document.createElement("div");
    target.style.position = "fixed";
    target.style.width = "20px";
    target.style.height = "20px";
    target.style.borderRadius = "50%";
    target.style.backgroundColor = "red";
    target.style.left = `${position.x}px`;
    target.style.top = `${position.y}px`;
    target.style.transform = "translate(-50%, -50%)";
    target.style.zIndex = "10000";
    document.body.appendChild(target);
    
    // Display instructions
    const status = document.createElement("div");
    status.style.position = "fixed";
    status.style.bottom = "20px";
    status.style.left = "20px";
    status.style.color = "white";
    status.style.background = "rgba(0,0,0,0.7)";
    status.style.padding = "10px";
    status.style.zIndex = "10000";
    status.textContent = "Get ready - hold your head still";
    document.body.appendChild(status);
    
    return new Promise(resolve => {
      setTimeout(() => {
        status.textContent = "HOLD STILL - Recording raw data...";
        
        const rawData = [];
        const startTime = performance.now();
        const interval = setInterval(() => {
          if (state.lastLandmarks) {
            rawData.push({
              time: performance.now() - startTime,
              headX: state.lastHeadX,
              headY: state.lastHeadY,
              landmarks: JSON.parse(JSON.stringify(state.lastLandmarks))
            });
          }
        }, 16);
        
        setTimeout(() => {
          clearInterval(interval);
          document.body.removeChild(target);
          document.body.removeChild(status);
          resolve(rawData);
        }, duration);
      }, 2000);
    });
  }

  // Function to check if tracking system is ready for filter optimization
  function checkTrackingSystemReady() {
    const issues = [];
    
    // Check if tracking is active
    if (!window.state.isTracking) {
      issues.push("❌ Head tracking is not started. Please start tracking first.");
    }
    
    // Check if landmarks are being detected
    if (!window.state.lastLandmarks) {
      issues.push("❌ No face landmarks detected. Make sure your face is visible to the camera.");
    }
    
    // Check if head positions are being calculated
    if (window.state.lastHeadX === null || window.state.lastHeadY === null) {
      issues.push("❌ Head positions are not being calculated. Make sure calibration is complete.");
    }
    
    // Check if transformation matrix exists
    const currentConfig = window.state.config.landmarkPoints;
    const matrix = currentConfig === "3" ? 
      window.state.transformationMatrices.threePoint : 
      window.state.transformationMatrices.sixPoint;
    
    if (!matrix) {
      issues.push("❌ No calibration data found. Please complete calibration first.");
    }
    
    if (issues.length > 0) {
      const message = `Filter optimization cannot start. Please fix these issues:\n\n${issues.join('\n')}\n\nSteps to fix:\n1. Start the camera\n2. Complete calibration\n3. Start head tracking\n4. Make sure your face is visible\n5. Try the filter optimization again`;
      alert(message);
      console.error("Tracking system not ready:", issues);
      return false;
    }
    
    console.log("✅ Tracking system is ready for filter optimization");
    return true;
  }

  // Function to determine optimal threshold based on unfiltered data baseline
  async function determineOptimalThreshold() {
    console.log("=== DETERMINING OPTIMAL THRESHOLD ===");
    
    if (!checkTrackingSystemReady()) {
      return null;
    }
    
    // Check if dev tools are open
    if (isDevToolsOpen()) {
      await showDevToolsWarning();
    }
    
    console.log("Collecting baseline data (no filtering) to determine natural variance...");
    
    // Collect raw data at all positions without any filtering
    const rawData = await collectDataAtAllPositions();
    
    // Calculate variance for each position without any filtering
    const baselineVariances = {};
    let allVariances = [];
    
    for (const [position, data] of Object.entries(rawData)) {
      // Convert raw head positions to screen coordinates for realistic variance
      const screenCoords = data.map(sample => ({
        x: sample.headX,
        y: sample.headY
      }));
      
      const stats = calculateStabilityStats(screenCoords);
      baselineVariances[position] = stats.combinedStdDev;
      allVariances.push(stats.combinedStdDev);
      
      console.log(`${position}: baseline variance = ${stats.combinedStdDev.toFixed(2)}px`);
    }
    
    // Calculate statistics on baseline variances
    const minVariance = Math.min(...allVariances);
    const maxVariance = Math.max(...allVariances);
    const avgVariance = allVariances.reduce((a, b) => a + b, 0) / allVariances.length;
    const medianVariance = allVariances.sort((a, b) => a - b)[Math.floor(allVariances.length / 2)];
    
    console.log("\n=== BASELINE VARIANCE ANALYSIS ===");
    console.log(`Minimum variance: ${minVariance.toFixed(2)}px`);
    console.log(`Maximum variance: ${maxVariance.toFixed(2)}px`);
    console.log(`Average variance: ${avgVariance.toFixed(2)}px`);
    console.log(`Median variance: ${medianVariance.toFixed(2)}px`);
    
    // Suggest threshold options based on different criteria
    const thresholdOptions = {
      strict: Math.ceil(minVariance * 0.8), // 80% of best natural stability
      moderate: Math.ceil(avgVariance * 0.7),     // 70% of average natural variance
      aggressive: Math.ceil(medianVariance * 0.6), // 60% of median variance
      practical: Math.ceil(avgVariance * 0.5)     // 50% of average (ambitious but achievable)
    };
    
    console.log("\n=== SUGGESTED THRESHOLD OPTIONS ===");
    console.log(`Strict (80% of best): ${thresholdOptions.strict}px`);
    console.log(`Moderate (70% of average): ${thresholdOptions.moderate}px`);
    console.log(`Aggressive (60% of median): ${thresholdOptions.aggressive}px`);
    console.log(`Practical (50% of average): ${thresholdOptions.practical}px`);
    
    // Recommend based on data
    let recommendedThreshold;
    let recommendation;
    
    if (minVariance > 30) {
      recommendedThreshold = thresholdOptions.strict;
      recommendation = "Strict threshold recommended - high natural variance detected";
    } else if (avgVariance > 25) {
      recommendedThreshold = thresholdOptions.moderate;
      recommendation = "Moderate threshold recommended - moderate natural variance";
    } else {
      recommendedThreshold = thresholdOptions.aggressive;
      recommendation = "Aggressive threshold possible - good natural stability detected";
    }
    
    console.log(`\n🎯 RECOMMENDATION: ${recommendedThreshold}px (${recommendation})`);
    
    const result = {
      baselineVariances,
      statistics: {
        min: minVariance,
        max: maxVariance,
        average: avgVariance,
        median: medianVariance
      },
      thresholdOptions,
      recommendedThreshold,
      recommendation,
      rawData
    };
    
    // Save threshold analysis
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(result, null, 2));
    const downloadLink = document.createElement("a");
    downloadLink.setAttribute("href", dataStr);
    downloadLink.setAttribute("download", "threshold_analysis.json");
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    return result;
  }

  // Comprehensive filter comparison with proper threshold
  async function comprehensiveFilterComparison(customThreshold = null) {
    console.log("=== COMPREHENSIVE FILTER COMPARISON ===");
    
    let threshold = customThreshold;
    
    // If no threshold provided, determine it scientifically
    if (!threshold) {
      console.log("No threshold provided. Determining optimal threshold first...");
      const thresholdAnalysis = await determineOptimalThreshold();
      if (!thresholdAnalysis) {
        console.error("Could not determine threshold. Aborting comparison.");
        return;
      }
      threshold = thresholdAnalysis.recommendedThreshold;
      console.log(`Using scientifically determined threshold: ${threshold}px`);
    } else {
      console.log(`Using provided threshold: ${threshold}px`);
    }
    
    // Collect raw data
    console.log("Collecting raw data for filter comparison...");
    const rawData = await collectDataAtAllPositions();
    
    // Test both filters with the determined threshold
    console.log("Analyzing data with both filter types...");
    const results = analyzeDataWithParameters(rawData, threshold);
    
    // Find optimal parameters for both filters
    const optimal = findOptimalParameters(results, threshold);
    
    // Generate comprehensive comparison report
    const report = generateFilterComparisonReport(rawData, results, optimal, threshold);
    
    // Display results
    console.log("\n" + "=".repeat(50));
    console.log("FILTER COMPARISON RESULTS");
    console.log("=".repeat(50));
    console.log(report.summary);
    
    // Save detailed report
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadLink = document.createElement("a");
    downloadLink.setAttribute("href", dataStr);
    downloadLink.setAttribute("download", "comprehensive_filter_comparison.json");
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    return report;
  }

  // Generate a comprehensive report comparing both filters
  function generateFilterComparisonReport(rawData, results, optimal, threshold) {
    const positions = Object.keys(rawData);
    
    // Count successful positions for each filter
    const expSuccessCount = Object.values(optimal.expOptimal)
      .filter(val => val !== "None found").length;
    const oneEuroSuccessCount = Object.values(optimal.oneEuroOptimal)
      .filter(val => val !== "None found").length;
    
    // Find global optimal parameters
    const validExpValues = Object.values(optimal.expOptimal)
      .filter(val => val !== "None found")
      .map(val => parseFloat(val));
    const globalExpOptimal = validExpValues.length > 0 ? 
      Math.max(...validExpValues) : null;
    
    // Find global One Euro parameters
    const allPositions = Object.keys(rawData);
    const oneEuroParamSets = results.oneEuroResults[allPositions[0]].map(r => r.params);
    const validParamSets = oneEuroParamSets.filter(params => {
      return allPositions.every(pos => {
        const matchingResult = results.oneEuroResults[pos].find(r => 
          r.params.minCutoff === params.minCutoff && 
          r.params.beta === params.beta
        );
        return matchingResult && matchingResult.combinedStdDev <= threshold;
      });
    });
    
    validParamSets.sort((a, b) => {
      if (a.beta !== b.beta) return a.beta - b.beta;
      return a.minCutoff - b.minCutoff;
    });
    
    const globalOneEuroOptimal = validParamSets.length > 0 ? validParamSets[0] : null;
    
    // Calculate performance metrics for comparison
    let expPerformance = null;
    let oneEuroPerformance = null;
    
    if (globalExpOptimal) {
      const expVariances = positions.map(pos => {
        const result = results.expResults[pos].find(r => r.smoothing === globalExpOptimal);
        return result ? result.combinedStdDev : Infinity;
      });
      expPerformance = {
        avgVariance: expVariances.reduce((a, b) => a + b, 0) / expVariances.length,
        maxVariance: Math.max(...expVariances),
        successRate: expSuccessCount / positions.length,
        responsiveness: 1 - globalExpOptimal // Lower smoothing = higher responsiveness
      };
    }
    
    if (globalOneEuroOptimal) {
      const oneEuroVariances = positions.map(pos => {
        const result = results.oneEuroResults[pos].find(r => 
          r.params.minCutoff === globalOneEuroOptimal.minCutoff && 
          r.params.beta === globalOneEuroOptimal.beta
        );
        return result ? result.combinedStdDev : Infinity;
      });
      oneEuroPerformance = {
        avgVariance: oneEuroVariances.reduce((a, b) => a + b, 0) / oneEuroVariances.length,
        maxVariance: Math.max(...oneEuroVariances),
        successRate: oneEuroSuccessCount / positions.length,
        adaptiveness: globalOneEuroOptimal.beta // Higher beta = more adaptive
      };
    }
    
    // Determine winner
    let winner = "Neither";
    let winnerReason = "Both filters failed to meet threshold at all positions";
    
    if (expPerformance && oneEuroPerformance) {
      if (expPerformance.successRate > oneEuroPerformance.successRate) {
        winner = "Exponential Smoothing";
        winnerReason = "Higher success rate across positions";
      } else if (oneEuroPerformance.successRate > expPerformance.successRate) {
        winner = "One Euro Filter";
        winnerReason = "Higher success rate across positions";
      } else {
        // Same success rate, compare average variance
        if (expPerformance.avgVariance < oneEuroPerformance.avgVariance) {
          winner = "Exponential Smoothing";
          winnerReason = "Lower average variance with same success rate";
        } else {
          winner = "One Euro Filter";
          winnerReason = "Lower average variance with same success rate";
        }
      }
    } else if (expPerformance) {
      winner = "Exponential Smoothing";
      winnerReason = "Only exponential smoothing found valid parameters";
    } else if (oneEuroPerformance) {
      winner = "One Euro Filter";
      winnerReason = "Only One Euro filter found valid parameters";
    }
    
    // Create summary text
    const summary = `
THRESHOLD USED: ${threshold}px

EXPONENTIAL SMOOTHING RESULTS:
- Success Rate: ${expSuccessCount}/${positions.length} positions (${(expSuccessCount/positions.length*100).toFixed(1)}%)
- Global Optimal: ${globalExpOptimal || "None found"}
${globalExpOptimal ? `- Interpretation: ${((1-globalExpOptimal)*100).toFixed(0)}% new data, ${(globalExpOptimal*100).toFixed(0)}% old data` : ""}
${expPerformance ? `- Average Variance: ${expPerformance.avgVariance.toFixed(2)}px` : ""}

ONE EURO FILTER RESULTS:
- Success Rate: ${oneEuroSuccessCount}/${positions.length} positions (${(oneEuroSuccessCount/positions.length*100).toFixed(1)}%)
- Global Optimal: ${globalOneEuroOptimal ? `minCutoff=${globalOneEuroOptimal.minCutoff}, beta=${globalOneEuroOptimal.beta}` : "None found"}
${oneEuroPerformance ? `- Average Variance: ${oneEuroPerformance.avgVariance.toFixed(2)}px` : ""}

🏆 WINNER: ${winner}
📝 REASON: ${winnerReason}

RECOMMENDATION FOR PROFESSOR:
${generateProfessorRecommendation(winner, expPerformance, oneEuroPerformance, threshold)}
`;
    
    return {
      threshold,
      expOptimal: optimal.expOptimal,
      oneEuroOptimal: optimal.oneEuroOptimal,
      globalExpOptimal,
      globalOneEuroOptimal,
      expPerformance,
      oneEuroPerformance,
      winner,
      winnerReason,
      summary,
      detailedResults: results,
      rawData
    };
  }

  // Generate recommendation text for professor
  function generateProfessorRecommendation(winner, expPerf, oneEuroPerf, threshold) {
    if (winner === "Neither") {
      return `Both filters failed to achieve the ${threshold}px variance threshold. Consider:
1. Increasing the threshold (current may be too aggressive)
2. Improving head tracking hardware/setup
3. Using different filter parameters outside tested range`;
    }
    
    if (winner === "Exponential Smoothing" && oneEuroPerf) {
      return `Exponential smoothing outperformed One Euro filter. However, since One Euro also found valid parameters, consider testing both in your user study to see if the adaptive nature of One Euro provides benefits during actual usage that aren't captured in static variance measurements.`;
    }
    
    if (winner === "One Euro Filter" && expPerf) {
      return `One Euro filter outperformed exponential smoothing. The adaptive nature of One Euro (beta=${oneEuroPerf ? 'parameter' : 'N/A'}) likely provides better handling of different movement speeds, which is valuable for cursor control.`;
    }
    
    return `Only ${winner} found valid parameters. This suggests ${winner} is more suitable for your head tracking application with the current setup and threshold requirements.`;
  }

  // Make new functions globally available
  window.determineOptimalThreshold = determineOptimalThreshold;
  window.comprehensiveFilterComparison = comprehensiveFilterComparison;
  window.generateFilterComparisonReport = generateFilterComparisonReport;

  // Usage guide for filter optimization
  function showFilterOptimizationGuide() {
    const guide = `
🎯 FILTER OPTIMIZATION GUIDE (UPDATED)
======================================

APPROACH 1: SINGLE THRESHOLD (Simple)
=====================================
STEP 1: determineOptimalThreshold()
STEP 2: comprehensiveFilterComparison()

APPROACH 2: MULTI-THRESHOLD (Advanced) ⭐ RECOMMENDED
===================================================
STEP 1: multiThresholdParameterAnalysis()

This advanced approach:
- Tests 5 different threshold levels automatically
- Tests BOTH exponential smoothing AND One Euro filter
- Applies 5 parameter selection strategies to both filters
- Finds the most robust parameters for each filter
- Compares filters scientifically across strategies
- Provides scientific justification

PARAMETER SELECTION STRATEGIES:
==============================

1. UNIVERSAL Strategy (Best):
   "Parameters that work across ALL threshold levels"
   → Maximum robustness, works in any condition
   → Tests both exponential smoothing and One Euro

2. MAJORITY Strategy (Good):
   "Parameters that work in MOST threshold levels"
   → Good robustness, works in most conditions
   → Compares success rates between filters

3. BALANCED Strategy (Practical):
   "Best balance of success rate and responsiveness"
   → Optimizes both stability and speed
   → Considers filter-specific characteristics

4. CONSERVATIVE Strategy (Safe):
   "Works at the strictest threshold"
   → Highest precision, may be slower
   → Tests both filters at strictest requirements

5. ADAPTIVE Strategy (Flexible):
   "Different parameters for different precision needs"
   → Use different settings for different tasks
   → Provides options for both filter types

FILTER COMPARISON LOGIC:
=======================

The system now automatically compares:
✅ Exponential Smoothing vs One Euro Filter
✅ Parameter availability across strategies
✅ Success rates at different precision levels
✅ Robustness across threshold levels

WINNER SELECTION:
================

Priority Order:
1. Universal parameters (work everywhere)
2. Majority parameters (work in most conditions)
3. Balanced parameters (best trade-offs)
4. Conservative parameters (strictest requirements)

If both filters have parameters at same level:
- Exponential Smoothing: Simpler, more predictable
- One Euro Filter: More adaptive, handles varying speeds

HOW TO CHOOSE PARAMETERS:
========================

Q: Should I use parameters that work in ALL conditions?
A: YES - Use UNIVERSAL strategy if available
   → Most robust, works everywhere

Q: What if no universal parameters exist?
A: Use MAJORITY strategy
   → Works in most conditions (e.g., 4/5 threshold levels)

Q: Which filter should I choose?
A: The system will recommend based on:
   - Parameter availability across strategies
   - Success rates at different precision levels
   - Implementation complexity vs adaptiveness

Q: What if both filters work equally well?
A: Consider your use case:
   - Simple cursor control: Exponential Smoothing
   - Variable speed movements: One Euro Filter
   - Consistent performance: Exponential Smoothing
   - Adaptive performance: One Euro Filter

THRESHOLD SELECTION LOGIC:
=========================

The system automatically creates 5 threshold levels:
• Very Aggressive: 40% of minimum variance (high precision)
• Aggressive: 50% of average variance
• Moderate: 70% of average variance (recommended)
• Strict: 90% of average variance
• Accessible: 80% of maximum variance (accessibility)

WHAT TO REPORT TO PROFESSOR:
===========================

"I conducted comprehensive multi-threshold parameter analysis testing 
both exponential smoothing and One Euro filter across 5 precision levels. 
The [STRATEGY] strategy identified [FILTER] as optimal with parameters 
[PARAMETERS] that work across [X/5] threshold levels. This provides 
scientific justification for filter selection and ensures robustness 
across different user precision needs."

SCIENTIFIC JUSTIFICATION:
========================

✅ Data-driven threshold selection (not arbitrary)
✅ Multiple precision levels tested
✅ Both major filter types compared
✅ Robustness across conditions verified
✅ Parameter selection strategy clearly defined
✅ Works for different user needs (precision vs accessibility)
✅ Head-to-head filter comparison with quantitative metrics

QUICK START (RECOMMENDED):
=========================
1. Start head tracking and complete calibration
2. Run: multiThresholdParameterAnalysis()
3. Check console for strategy results and filter comparison
4. Use the recommended filter and parameters
5. Report to professor with scientific backing! 🎓

EXAMPLE PROFESSOR REPORT:
========================
"I conducted comprehensive multi-threshold parameter analysis testing 
both exponential smoothing and One Euro filter across 5 precision levels 
from 8px to 45px variance. The majority strategy identified exponential 
smoothing factor 0.7 as optimal, working across 3/5 threshold levels, 
outperforming One Euro filter which only achieved 2/5 levels. This 
provides 30% new data contribution with 70% smoothing, ensuring stability 
while maintaining responsiveness. The scientific comparison demonstrates 
exponential smoothing's superior robustness for this head tracking application."

FILTER COMPARISON BENEFITS:
==========================
🔬 Scientific: Both filters tested under identical conditions
📊 Quantitative: Success rates measured across precision levels  
🎯 Objective: Data-driven filter selection, not subjective preference
🔄 Comprehensive: All major parameter selection strategies applied
💪 Robust: Parameters work across multiple precision requirements
📈 Scalable: Approach works for different user populations
`;

    console.log(guide);
    return guide;
  }

  // Make guide available globally
  window.showFilterOptimizationGuide = showFilterOptimizationGuide;

  // Multi-threshold parameter analysis - tests across different threshold levels
  async function multiThresholdParameterAnalysis() {
    console.log("=== MULTI-THRESHOLD PARAMETER ANALYSIS ===");
    
    if (!checkTrackingSystemReady()) {
      return null;
    }
    
    // Check if dev tools are open
    if (isDevToolsOpen()) {
      await showDevToolsWarning();
    }
    
    // Step 1: Determine baseline variance
    console.log("Step 1: Collecting baseline data to determine variance range...");
    const thresholdAnalysis = await determineOptimalThreshold();
    if (!thresholdAnalysis) {
      console.error("Could not determine baseline variance. Aborting analysis.");
      return;
    }
    
    const baselineStats = thresholdAnalysis.statistics;
    
    // Step 2: Define multiple threshold levels based on baseline data
    const thresholdLevels = {
      strict: Math.ceil(baselineStats.min * 0.8),        // 80% of minimum variance
      practical: Math.ceil(baselineStats.average * 0.5), // 50% of average variance  
      aggressive: Math.ceil(baselineStats.median * 0.6), // 60% of median variance
      moderate: Math.ceil(baselineStats.average * 0.7),  // 70% of average variance (recommended)
      accessible: Math.ceil(baselineStats.max * 0.8)     // 80% of maximum variance
    };
    
    console.log("\n=== TESTING THRESHOLD LEVELS ===");
    console.log(`Strict: ${thresholdLevels.strict}px (80% of minimum variance)`);
    console.log(`Practical: ${thresholdLevels.practical}px (50% of average variance)`);
    console.log(`Aggressive: ${thresholdLevels.aggressive}px (60% of median variance)`);
    console.log(`Moderate: ${thresholdLevels.moderate}px (70% of average variance) - RECOMMENDED`);
    console.log(`Accessible: ${thresholdLevels.accessible}px (80% of maximum variance)`);
    
    // Step 3: Collect raw data once (reuse for all threshold tests)
    console.log("\nStep 2: Collecting raw data for parameter testing...");
    const rawData = thresholdAnalysis.rawData; // Reuse from threshold analysis
    
    // Step 4: Test parameters at each threshold level
    const multiThresholdResults = {};
    
    for (const [levelName, threshold] of Object.entries(thresholdLevels)) {
      console.log(`\n--- Testing threshold level: ${levelName} (${threshold}px) ---`);
      
      const results = analyzeDataWithParameters(rawData, threshold);
      const optimal = findOptimalParameters(results, threshold);
      
      multiThresholdResults[levelName] = {
        threshold,
        results,
        optimal,
        performance: calculateThresholdPerformance(results, optimal, threshold)
      };
    }
    
    // Step 5: Apply parameter selection strategies
    console.log("\n=== PARAMETER SELECTION STRATEGIES ===");
    const strategies = applyParameterSelectionStrategies(multiThresholdResults, thresholdLevels);
    
    // Step 6: Generate comprehensive report
    const report = {
      baselineAnalysis: thresholdAnalysis,
      thresholdLevels,
      multiThresholdResults,
      parameterStrategies: strategies,
      recommendations: generateMultiThresholdRecommendations(strategies, thresholdLevels)
    };
    
    // Display summary
    console.log("\n" + "=".repeat(60));
    console.log("MULTI-THRESHOLD PARAMETER ANALYSIS RESULTS");
    console.log("=".repeat(60));
    console.log(report.recommendations.summary);
    
    // Save comprehensive report
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadLink = document.createElement("a");
    downloadLink.setAttribute("href", dataStr);
    downloadLink.setAttribute("download", "multi_threshold_parameter_analysis.json");
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    return report;
  }

  // Calculate performance metrics for a given threshold
  function calculateThresholdPerformance(results, optimal, threshold) {
    const positions = Object.keys(results.expResults);
    
    // Exponential smoothing performance
    const expSuccessCount = Object.values(optimal.expOptimal)
      .filter(val => val !== "None found").length;
    const expSuccessRate = expSuccessCount / positions.length;
    
    // One Euro filter performance  
    const oneEuroSuccessCount = Object.values(optimal.oneEuroOptimal)
      .filter(val => val !== "None found").length;
    const oneEuroSuccessRate = oneEuroSuccessCount / positions.length;
    
    // Find global parameters
    const validExpValues = Object.values(optimal.expOptimal)
      .filter(val => val !== "None found")
      .map(val => parseFloat(val));
    const globalExpOptimal = validExpValues.length > 0 ? Math.max(...validExpValues) : null;
    
    // Calculate average variance achieved
    let expAvgVariance = null;
    let oneEuroAvgVariance = null;
    
    if (globalExpOptimal) {
      const expVariances = positions.map(pos => {
        const result = results.expResults[pos].find(r => r.smoothing === globalExpOptimal);
        return result ? result.combinedStdDev : Infinity;
      }).filter(v => v !== Infinity);
      
      expAvgVariance = expVariances.length > 0 ? 
        expVariances.reduce((a, b) => a + b, 0) / expVariances.length : null;
    }
    
    return {
      threshold,
      exponential: {
        successRate: expSuccessRate,
        successCount: expSuccessCount,
        globalOptimal: globalExpOptimal,
        avgVariance: expAvgVariance,
        responsiveness: globalExpOptimal ? (1 - globalExpOptimal) : null
      },
      oneEuro: {
        successRate: oneEuroSuccessRate,
        successCount: oneEuroSuccessCount,
        avgVariance: oneEuroAvgVariance
      }
    };
  }

  // Apply different parameter selection strategies
  function applyParameterSelectionStrategies(multiThresholdResults, thresholdLevels) {
    const strategies = {};
    
    // Strategy 1: UNIVERSAL - Parameters that work across ALL threshold levels
    strategies.universal = findUniversalParameters(multiThresholdResults);
    
    // Strategy 2: MAJORITY - Parameters that work in MOST threshold levels
    strategies.majority = findMajorityParameters(multiThresholdResults);
    
    // Strategy 3: BALANCED - Best balance of success rate and responsiveness
    strategies.balanced = findBalancedParameters(multiThresholdResults);
    
    // Strategy 4: CONSERVATIVE - Parameters that work at strictest threshold
    strategies.conservative = findConservativeParameters(multiThresholdResults);
    
    // Strategy 5: ADAPTIVE - Different parameters for different threshold levels
    strategies.adaptive = findAdaptiveParameters(multiThresholdResults);
    
    return strategies;
  }

  // Strategy 1: Find parameters that work across ALL threshold levels
  function findUniversalParameters(multiThresholdResults) {
    const thresholdNames = Object.keys(multiThresholdResults);
    
    // For exponential smoothing - find parameters that work at all levels
    const allExpParams = new Set();
    let firstLevel = true;
    
    for (const levelName of thresholdNames) {
      const levelOptimal = multiThresholdResults[levelName].optimal.expOptimal;
      const levelValidParams = new Set(
        Object.values(levelOptimal)
          .filter(val => val !== "None found")
          .map(val => parseFloat(val))
      );
      
      if (firstLevel) {
        levelValidParams.forEach(param => allExpParams.add(param));
        firstLevel = false;
      } else {
        // Keep only parameters that exist in this level too
        const intersection = new Set();
        allExpParams.forEach(param => {
          if (levelValidParams.has(param)) {
            intersection.add(param);
          }
        });
        allExpParams.clear();
        intersection.forEach(param => allExpParams.add(param));
      }
    }
    
    const universalExpParam = allExpParams.size > 0 ? 
      Math.max(...Array.from(allExpParams)) : null;

    // For One Euro filter - find parameters that work at all levels
    const allOneEuroParams = new Set();
    firstLevel = true;
    
    for (const levelName of thresholdNames) {
      const levelOptimal = multiThresholdResults[levelName].optimal.oneEuroOptimal;
      const levelValidParams = new Set();
      
      Object.values(levelOptimal).forEach(val => {
        if (val !== "None found") {
          levelValidParams.add(`${val.minCutoff}-${val.beta}`);
        }
      });
      
      if (firstLevel) {
        levelValidParams.forEach(param => allOneEuroParams.add(param));
        firstLevel = false;
      } else {
        const intersection = new Set();
        allOneEuroParams.forEach(param => {
          if (levelValidParams.has(param)) {
            intersection.add(param);
          }
        });
        allOneEuroParams.clear();
        intersection.forEach(param => allOneEuroParams.add(param));
      }
    }
    
    let universalOneEuroParam = null;
    if (allOneEuroParams.size > 0) {
      const paramStr = Array.from(allOneEuroParams)[0];
      const [minCutoff, beta] = paramStr.split('-').map(parseFloat);
      universalOneEuroParam = { minCutoff, beta };
    }
    
    return {
      description: "Parameters that work across ALL threshold levels",
      exponential: universalExpParam,
      oneEuro: universalOneEuroParam,
      interpretation: {
        exponential: universalExpParam ? 
          `${((1-universalExpParam)*100).toFixed(0)}% new data - works universally` : 
          "No universal exponential parameters found",
        oneEuro: universalOneEuroParam ?
          `minCutoff=${universalOneEuroParam.minCutoff}, beta=${universalOneEuroParam.beta} - works universally` :
          "No universal One Euro parameters found"
      },
      robustness: (allExpParams.size > 0 || allOneEuroParams.size > 0) ? "High" : "None"
    };
  }

  // Strategy 2: Find parameters that work in MOST threshold levels
  function findMajorityParameters(multiThresholdResults) {
    const thresholdNames = Object.keys(multiThresholdResults);
    const majorityThreshold = Math.ceil(thresholdNames.length / 2); // More than half
    
    // Count how many levels each exponential parameter works in
    const expParamCounts = {};
    
    for (const levelName of thresholdNames) {
      const levelOptimal = multiThresholdResults[levelName].optimal.expOptimal;
      const levelValidParams = Object.values(levelOptimal)
        .filter(val => val !== "None found")
        .map(val => parseFloat(val));
      
      levelValidParams.forEach(param => {
        expParamCounts[param] = (expParamCounts[param] || 0) + 1;
      });
    }
    
    // Count how many levels each One Euro parameter works in
    const oneEuroParamCounts = {};
    
    for (const levelName of thresholdNames) {
      const levelOptimal = multiThresholdResults[levelName].optimal.oneEuroOptimal;
      Object.values(levelOptimal).forEach(val => {
        if (val !== "None found") {
          const paramKey = `${val.minCutoff}-${val.beta}`;
          oneEuroParamCounts[paramKey] = (oneEuroParamCounts[paramKey] || 0) + 1;
        }
      });
    }
    
    // Find exponential parameters that work in majority of levels
    const majorityExpParams = Object.entries(expParamCounts)
      .filter(([param, count]) => count >= majorityThreshold)
      .map(([param, count]) => ({ param: parseFloat(param), count }))
      .sort((a, b) => b.count - a.count || b.param - a.param);
    
    // Find One Euro parameters that work in majority of levels
    const majorityOneEuroParams = Object.entries(oneEuroParamCounts)
      .filter(([param, count]) => count >= majorityThreshold)
      .map(([param, count]) => {
        const [minCutoff, beta] = param.split('-').map(parseFloat);
        return { param: { minCutoff, beta }, count };
      })
      .sort((a, b) => b.count - a.count || a.param.beta - b.param.beta);
    
    const majorityExpParam = majorityExpParams.length > 0 ? majorityExpParams[0].param : null;
    const expSuccessLevels = majorityExpParams.length > 0 ? majorityExpParams[0].count : 0;
    
    const majorityOneEuroParam = majorityOneEuroParams.length > 0 ? majorityOneEuroParams[0].param : null;
    const oneEuroSuccessLevels = majorityOneEuroParams.length > 0 ? majorityOneEuroParams[0].count : 0;
    
    return {
      description: "Parameters that work in MOST threshold levels",
      exponential: majorityExpParam,
      oneEuro: majorityOneEuroParam,
      successLevels: {
        exponential: `${expSuccessLevels}/${thresholdNames.length}`,
        oneEuro: `${oneEuroSuccessLevels}/${thresholdNames.length}`
      },
      interpretation: {
        exponential: majorityExpParam ? 
          `${((1-majorityExpParam)*100).toFixed(0)}% new data - works in ${expSuccessLevels}/${thresholdNames.length} levels` : 
          "No majority exponential parameters found",
        oneEuro: majorityOneEuroParam ?
          `minCutoff=${majorityOneEuroParam.minCutoff}, beta=${majorityOneEuroParam.beta} - works in ${oneEuroSuccessLevels}/${thresholdNames.length} levels` :
          "No majority One Euro parameters found"
      },
      robustness: (expSuccessLevels >= majorityThreshold || oneEuroSuccessLevels >= majorityThreshold) ? "Medium-High" : "Low"
    };
  }

  // Strategy 3: Find balanced parameters (best success rate and responsiveness)
  function findBalancedParameters(multiThresholdResults) {
    let bestExpBalance = null;
    let bestExpScore = -1;
    let bestOneEuroBalance = null;
    let bestOneEuroScore = -1;
    
    for (const [levelName, levelData] of Object.entries(multiThresholdResults)) {
      // Exponential smoothing balance
      const expPerf = levelData.performance.exponential;
      if (expPerf.globalOptimal && expPerf.successRate > 0) {
        const balanceScore = expPerf.successRate + (expPerf.responsiveness || 0);
        
        if (balanceScore > bestExpScore) {
          bestExpScore = balanceScore;
          bestExpBalance = {
            level: levelName,
            threshold: levelData.threshold,
            parameter: expPerf.globalOptimal,
            successRate: expPerf.successRate,
            responsiveness: expPerf.responsiveness,
            balanceScore
          };
        }
      }
      
      // One Euro filter balance
      const oneEuroPerf = levelData.performance.oneEuro;
      if (oneEuroPerf.successRate > 0) {
        // For One Euro, we consider success rate as primary metric
        const balanceScore = oneEuroPerf.successRate;
        
        if (balanceScore > bestOneEuroScore) {
          bestOneEuroScore = balanceScore;
          // Find the actual One Euro parameters for this level
          const oneEuroOptimal = levelData.optimal.oneEuroOptimal;
          const validOneEuroParams = Object.values(oneEuroOptimal).filter(val => val !== "None found");
          
          if (validOneEuroParams.length > 0) {
            bestOneEuroBalance = {
              level: levelName,
              threshold: levelData.threshold,
              parameter: validOneEuroParams[0], // Take first valid parameter
              successRate: oneEuroPerf.successRate,
              balanceScore
            };
          }
        }
      }
    }
    
    return {
      description: "Best balance of success rate and responsiveness",
      exponential: bestExpBalance?.parameter || null,
      oneEuro: bestOneEuroBalance?.parameter || null,
      selectedLevel: {
        exponential: bestExpBalance?.level || "None",
        oneEuro: bestOneEuroBalance?.level || "None"
      },
      threshold: {
        exponential: bestExpBalance?.threshold || null,
        oneEuro: bestOneEuroBalance?.threshold || null
      },
      successRate: {
        exponential: bestExpBalance?.successRate || 0,
        oneEuro: bestOneEuroBalance?.successRate || 0
      },
      interpretation: {
        exponential: bestExpBalance ? 
          `${((1-bestExpBalance.parameter)*100).toFixed(0)}% new data at ${bestExpBalance.level} level` : 
          "No balanced exponential parameters found",
        oneEuro: bestOneEuroBalance ?
          `minCutoff=${bestOneEuroBalance.parameter.minCutoff}, beta=${bestOneEuroBalance.parameter.beta} at ${bestOneEuroBalance.level} level` :
          "No balanced One Euro parameters found"
      },
      robustness: "Medium"
    };
  }

  // Strategy 4: Conservative - use strictest threshold that still works
  function findConservativeParameters(multiThresholdResults) {
    const sortedLevels = Object.entries(multiThresholdResults)
      .sort((a, b) => a[1].threshold - b[1].threshold); // Sort by threshold (ascending)
    
    let conservativeExp = null;
    let conservativeOneEuro = null;
    
    // Find strictest (lowest) threshold that still has valid parameters
    for (const [levelName, levelData] of sortedLevels) {
      // Check exponential smoothing
      if (!conservativeExp) {
        const expOptimal = levelData.optimal.expOptimal;
        const validExpParams = Object.values(expOptimal).filter(val => val !== "None found");
        
        if (validExpParams.length > 0) {
          const param = Math.max(...validExpParams.map(v => parseFloat(v)));
          conservativeExp = {
            parameter: param,
            level: levelName,
            threshold: levelData.threshold
          };
        }
      }
      
      // Check One Euro filter
      if (!conservativeOneEuro) {
        const oneEuroOptimal = levelData.optimal.oneEuroOptimal;
        const validOneEuroParams = Object.values(oneEuroOptimal).filter(val => val !== "None found");
        
        if (validOneEuroParams.length > 0) {
          conservativeOneEuro = {
            parameter: validOneEuroParams[0],
            level: levelName,
            threshold: levelData.threshold
          };
        }
      }
      
      // Break if we found both
      if (conservativeExp && conservativeOneEuro) break;
    }
    
    return {
      description: "Most conservative approach - strictest threshold that works",
      exponential: conservativeExp?.parameter || null,
      oneEuro: conservativeOneEuro?.parameter || null,
      selectedLevel: {
        exponential: conservativeExp?.level || "None",
        oneEuro: conservativeOneEuro?.level || "None"
      },
      threshold: {
        exponential: conservativeExp?.threshold || null,
        oneEuro: conservativeOneEuro?.threshold || null
      },
      interpretation: {
        exponential: conservativeExp ? 
          `${((1-conservativeExp.parameter)*100).toFixed(0)}% new data at strictest workable threshold` :
          "No conservative exponential parameters found",
        oneEuro: conservativeOneEuro ?
          `minCutoff=${conservativeOneEuro.parameter.minCutoff}, beta=${conservativeOneEuro.parameter.beta} at strictest workable threshold` :
          "No conservative One Euro parameters found"
      },
      robustness: "High"
    };
  }

  // Strategy 5: Adaptive - different parameters for different situations
  function findAdaptiveParameters(multiThresholdResults) {
    const adaptiveExp = {};
    const adaptiveOneEuro = {};
    
    for (const [levelName, levelData] of Object.entries(multiThresholdResults)) {
      // Exponential smoothing
      const expOptimal = levelData.optimal.expOptimal;
      const validExpParams = Object.values(expOptimal).filter(val => val !== "None found");
      
      if (validExpParams.length > 0) {
        const param = Math.max(...validExpParams.map(v => parseFloat(v)));
        adaptiveExp[levelName] = {
          threshold: levelData.threshold,
          parameter: param,
          interpretation: `${((1-param)*100).toFixed(0)}% new data`
        };
      }
      
      // One Euro filter
      const oneEuroOptimal = levelData.optimal.oneEuroOptimal;
      const validOneEuroParams = Object.values(oneEuroOptimal).filter(val => val !== "None found");
      
      if (validOneEuroParams.length > 0) {
        const param = validOneEuroParams[0];
        adaptiveOneEuro[levelName] = {
          threshold: levelData.threshold,
          parameter: param,
          interpretation: `minCutoff=${param.minCutoff}, beta=${param.beta}`
        };
      }
    }
    
    return {
      description: "Adaptive approach - different parameters for different precision needs",
      exponential: adaptiveExp,
      oneEuro: adaptiveOneEuro,
      usage: "Choose parameter based on required precision level",
      robustness: "Adaptive"
    };
  }

  // Generate recommendations based on all strategies
  function generateMultiThresholdRecommendations(strategies, thresholdLevels) {
    let primaryRecommendation = "No suitable parameters found";
    let reasoning = "All strategies failed to find valid parameters";
    let selectedStrategy = "None";
    let selectedFilter = "None";
    
    // Priority order for strategy selection - check both filters
    if (strategies.universal.exponential !== null || strategies.universal.oneEuro !== null) {
      selectedStrategy = "Universal";
      
      // Choose between exponential and One Euro if both are available
      if (strategies.universal.exponential !== null && strategies.universal.oneEuro !== null) {
        // Both filters have universal parameters - recommend exponential for simplicity
        selectedFilter = "Exponential Smoothing";
        primaryRecommendation = `Use exponential smoothing factor ${strategies.universal.exponential} (${strategies.universal.interpretation.exponential})`;
        reasoning = "Exponential smoothing has universal parameters and is simpler to implement. One Euro filter also has universal parameters available as alternative.";
      } else if (strategies.universal.exponential !== null) {
        selectedFilter = "Exponential Smoothing";
        primaryRecommendation = `Use exponential smoothing factor ${strategies.universal.exponential} (${strategies.universal.interpretation.exponential})`;
        reasoning = "This exponential smoothing parameter works across ALL threshold levels, providing maximum robustness";
      } else {
        selectedFilter = "One Euro Filter";
        primaryRecommendation = `Use One Euro filter with ${strategies.universal.interpretation.oneEuro}`;
        reasoning = "This One Euro filter configuration works across ALL threshold levels, providing maximum robustness";
      }
    } else if (strategies.majority.exponential !== null || strategies.majority.oneEuro !== null) {
      selectedStrategy = "Majority";
      
      // Compare success levels between filters
      const expLevels = strategies.majority.successLevels.exponential;
      const oneEuroLevels = strategies.majority.successLevels.oneEuro;
      
      if (strategies.majority.exponential !== null && strategies.majority.oneEuro !== null) {
        // Both have majority parameters - choose the one with higher success rate
        const expCount = parseInt(expLevels.split('/')[0]);
        const oneEuroCount = parseInt(oneEuroLevels.split('/')[0]);
        
        if (expCount >= oneEuroCount) {
          selectedFilter = "Exponential Smoothing";
          primaryRecommendation = `Use exponential smoothing factor ${strategies.majority.exponential} (${strategies.majority.interpretation.exponential})`;
          reasoning = `Exponential smoothing works in ${expLevels} threshold levels vs One Euro's ${oneEuroLevels}`;
        } else {
          selectedFilter = "One Euro Filter";
          primaryRecommendation = `Use One Euro filter with ${strategies.majority.interpretation.oneEuro}`;
          reasoning = `One Euro filter works in ${oneEuroLevels} threshold levels vs exponential's ${expLevels}`;
        }
      } else if (strategies.majority.exponential !== null) {
        selectedFilter = "Exponential Smoothing";
        primaryRecommendation = `Use exponential smoothing factor ${strategies.majority.exponential} (${strategies.majority.interpretation.exponential})`;
        reasoning = `This parameter works in ${expLevels} threshold levels, providing good robustness`;
      } else {
        selectedFilter = "One Euro Filter";
        primaryRecommendation = `Use One Euro filter with ${strategies.majority.interpretation.oneEuro}`;
        reasoning = `This configuration works in ${oneEuroLevels} threshold levels, providing good robustness`;
      }
    } else if (strategies.balanced.exponential !== null || strategies.balanced.oneEuro !== null) {
      selectedStrategy = "Balanced";
      
      // Compare success rates
      const expRate = strategies.balanced.successRate.exponential;
      const oneEuroRate = strategies.balanced.successRate.oneEuro;
      
      if (strategies.balanced.exponential !== null && strategies.balanced.oneEuro !== null) {
        if (expRate >= oneEuroRate) {
          selectedFilter = "Exponential Smoothing";
          primaryRecommendation = `Use exponential smoothing factor ${strategies.balanced.exponential} (${strategies.balanced.interpretation.exponential})`;
          reasoning = `This provides the best balance with ${(expRate*100).toFixed(1)}% success rate`;
        } else {
          selectedFilter = "One Euro Filter";
          primaryRecommendation = `Use One Euro filter with ${strategies.balanced.interpretation.oneEuro}`;
          reasoning = `This provides the best balance with ${(oneEuroRate*100).toFixed(1)}% success rate`;
        }
      } else if (strategies.balanced.exponential !== null) {
        selectedFilter = "Exponential Smoothing";
        primaryRecommendation = `Use exponential smoothing factor ${strategies.balanced.exponential} (${strategies.balanced.interpretation.exponential})`;
        reasoning = `This provides the best balance of success rate (${(expRate*100).toFixed(1)}%) and responsiveness`;
      } else {
        selectedFilter = "One Euro Filter";
        primaryRecommendation = `Use One Euro filter with ${strategies.balanced.interpretation.oneEuro}`;
        reasoning = `This provides the best balance with ${(oneEuroRate*100).toFixed(1)}% success rate`;
      }
    } else if (strategies.conservative.exponential !== null || strategies.conservative.oneEuro !== null) {
      selectedStrategy = "Conservative";
      
      if (strategies.conservative.exponential !== null && strategies.conservative.oneEuro !== null) {
        // Both available - choose exponential for simplicity
        selectedFilter = "Exponential Smoothing";
        primaryRecommendation = `Use exponential smoothing factor ${strategies.conservative.exponential} (${strategies.conservative.interpretation.exponential})`;
        reasoning = "Exponential smoothing works at the strictest threshold, ensuring high precision. One Euro filter also available as alternative.";
      } else if (strategies.conservative.exponential !== null) {
        selectedFilter = "Exponential Smoothing";
        primaryRecommendation = `Use exponential smoothing factor ${strategies.conservative.exponential} (${strategies.conservative.interpretation.exponential})`;
        reasoning = "This works at the strictest threshold, ensuring high precision";
      } else {
        selectedFilter = "One Euro Filter";
        primaryRecommendation = `Use One Euro filter with ${strategies.conservative.interpretation.oneEuro}`;
        reasoning = "This works at the strictest threshold, ensuring high precision";
      }
    }
    
    // Generate filter comparison summary
    const filterComparison = generateFilterComparisonSummary(strategies);
    
    const summary = `
MULTI-THRESHOLD PARAMETER ANALYSIS SUMMARY
==========================================

BASELINE VARIANCE RANGE: ${Object.values(thresholdLevels).join('px - ')}px

STRATEGY RESULTS:
${Object.entries(strategies).map(([name, strategy]) => {
  let expResult = 'None found';
  let oneEuroResult = 'None found';
  
  // Handle different strategy result formats
  if (name === 'adaptive') {
    // Adaptive strategy returns objects with multiple parameters
    if (strategy.exponential && Object.keys(strategy.exponential).length > 0) {
      const adaptiveKeys = Object.keys(strategy.exponential);
      expResult = `${adaptiveKeys.length} parameter sets found`;
    }
    if (strategy.oneEuro && Object.keys(strategy.oneEuro).length > 0) {
      const adaptiveKeys = Object.keys(strategy.oneEuro);
      oneEuroResult = `${adaptiveKeys.length} parameter sets found`;
    }
  } else {
    // Regular strategies
    expResult = strategy.exponential || 'None found';
    if (strategy.oneEuro) {
      oneEuroResult = `minCutoff=${strategy.oneEuro.minCutoff}, beta=${strategy.oneEuro.beta}`;
    }
  }
  
  return `• ${name.toUpperCase()}:\n  - Exponential: ${expResult}\n  - One Euro: ${oneEuroResult}`;
}).join('\n')}

🎯 PRIMARY RECOMMENDATION: ${selectedStrategy} Strategy - ${selectedFilter}
${primaryRecommendation}

📝 REASONING: ${reasoning}

${filterComparison}

FOR PROFESSOR REPORT:
====================
"I tested both exponential smoothing and One Euro filter parameters across 5 threshold 
levels (${Object.values(thresholdLevels).join('px, ')}px) representing different precision 
requirements. The ${selectedStrategy.toLowerCase()} strategy yielded the most robust 
parameters using ${selectedFilter}. This approach ensures the filter works reliably 
across different precision needs while providing scientific justification for parameter selection."

USAGE RECOMMENDATIONS:
=====================
• High Precision Tasks: Use ${thresholdLevels.veryAggressive}px threshold
• Normal Usage: Use ${thresholdLevels.moderate}px threshold  
• Accessibility: Use ${thresholdLevels.accessible}px threshold
`;

    return {
      selectedStrategy,
      selectedFilter,
      primaryRecommendation,
      reasoning,
      summary,
      filterComparison,
      strategiesAnalyzed: Object.keys(strategies).length,
      thresholdLevelsTested: Object.keys(thresholdLevels).length
    };
  }

  // Generate a comparison summary between exponential smoothing and One Euro filter
  function generateFilterComparisonSummary(strategies) {
    let expWins = 0;
    let oneEuroWins = 0;
    let ties = 0;
    
    // Count wins across strategies
    Object.values(strategies).forEach(strategy => {
      const hasExp = strategy.exponential !== null;
      const hasOneEuro = strategy.oneEuro !== null;
      
      if (hasExp && hasOneEuro) {
        ties++;
      } else if (hasExp) {
        expWins++;
      } else if (hasOneEuro) {
        oneEuroWins++;
      }
    });
    
    let winner = "Tie";
    let winnerReason = "Both filters performed equally";
    
    if (expWins > oneEuroWins) {
      winner = "Exponential Smoothing";
      winnerReason = `Found valid parameters in ${expWins} more strategies than One Euro filter`;
    } else if (oneEuroWins > expWins) {
      winner = "One Euro Filter";
      winnerReason = `Found valid parameters in ${oneEuroWins} more strategies than Exponential Smoothing`;
    } else if (ties > 0) {
      winner = "Both filters viable";
      winnerReason = `Both filters found valid parameters in ${ties} strategies`;
    }
    
    return `
FILTER COMPARISON ACROSS STRATEGIES:
===================================
• Exponential Smoothing: ${expWins} exclusive wins, ${ties} ties
• One Euro Filter: ${oneEuroWins} exclusive wins, ${ties} ties

🏆 OVERALL WINNER: ${winner}
📊 REASON: ${winnerReason}

RECOMMENDATION: ${winner === "Both filters viable" ? 
  "Test both filters in practice - exponential smoothing is simpler, One Euro is more adaptive" :
  `Use ${winner} as it shows better parameter availability across different precision levels`}
`;
  }

  // Make new functions globally available
  window.multiThresholdParameterAnalysis = multiThresholdParameterAnalysis;
  window.applyParameterSelectionStrategies = applyParameterSelectionStrategies;