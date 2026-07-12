const TrackingControls = () => {
  // Initialize state from window.state.config
  const [landmarks, setLandmarks] = React.useState(() => 
    window.state?.config?.landmarkPoints || "3"
  );
  
  const [filterType, setFilterType] = React.useState(() => 
    window.state?.config?.filterType || "exponential"
  );
  
  // Add coordinate system state
  const [coordinateSystem, setCoordinateSystem] = React.useState(() => 
    window.state?.config?.coordinateSystem || "2d"
  );
  
  // Use pre-calculated metrics if available
  const [metrics, setMetrics] = React.useState(() => {
    if (window.preCalculatedMetrics) {
      console.log("Using pre-calculated metrics:", window.preCalculatedMetrics);
      return window.preCalculatedMetrics;
    }
    return null;
  });
  
  // Add state for end point metrics
  const [endPointMetrics, setEndPointMetrics] = React.useState(null);
  
  const [error, setError] = React.useState(null);

  // Add state for filter parameters
  const [exponentialSmoothingFactor, setExponentialSmoothingFactor] = React.useState(() => 
    window.state?.config?.exponentialSmoothingFactor || 0.95
  );
  
  const [oneEuroParams, setOneEuroParams] = React.useState(() => ({
    frequency: window.state?.filterConfig?.frequency || 60,
    minCutoff: window.state?.filterConfig?.minCutoff || 1.5,
    beta: window.state?.filterConfig?.beta || 0.007,
    dcutoff: window.state?.filterConfig?.dcutoff || 1.0
  }));
  
  // State for Pareto front rank selection (1-85)
  const [paretoRank, setParetoRank] = React.useState(1);
  const [useParetoFront, setUseParetoFront] = React.useState(true); // Changed to true - Rank 1 active by default
  
  // State for Exponential rank selection (1-107)
  const [exponentialRank, setExponentialRank] = React.useState(20);
  const [useExponentialRank, setUseExponentialRank] = React.useState(true); // Changed to true - Rank 20 active by default
  
  // State for showing/hiding the video preview
  const [showVideoPreview, setShowVideoPreview] = React.useState(false);
  
  // State for personal vs default parameter toggle
  const [usePersonalParams, setUsePersonalParams] = React.useState(false);
  
  // Store backup of default (hardcoded) parameters on first load
  // and auto-load personal Pareto data from localStorage if available
  React.useEffect(() => {
    if (!window._DEFAULT_PARETO_FRONT_PARAMETERS && window.PARETO_FRONT_PARAMETERS) {
      window._DEFAULT_PARETO_FRONT_PARAMETERS = [...window.PARETO_FRONT_PARAMETERS];
    }
    if (!window._DEFAULT_EXPONENTIAL_PARAMETERS && window.EXPONENTIAL_PARAMETERS) {
      window._DEFAULT_EXPONENTIAL_PARAMETERS = [...window.EXPONENTIAL_PARAMETERS];
    }

    // Auto-load personal Pareto from localStorage (from previous optimization)
    if (!window.PERSONAL_OPTIMIZATION_DONE) {
      try {
        const savedOE = localStorage.getItem('personalParetoOneEuro');
        const savedExp = localStorage.getItem('personalParetoExponential');
        if (savedOE || savedExp) {
          if (savedOE) {
            const data = JSON.parse(savedOE);
            window._PERSONAL_PARETO_FRONT_PARAMETERS = data;
            window.PARETO_FRONT_PARAMETERS = data;
            // Apply Rank 1 One Euro params
            if (data.length > 0 && window.state?.filterConfig) {
              window.state.filterConfig.minCutoff = data[0].minCutoff;
              window.state.filterConfig.beta = data[0].beta;
              window.state.filterConfig.dcutoff = data[0].dCutoff;
            }
          }
          if (savedExp) {
            const data = JSON.parse(savedExp);
            window._PERSONAL_EXPONENTIAL_PARAMETERS = data;
            window.EXPONENTIAL_PARAMETERS = data;
            // Apply Rank 1 Exponential params
            if (data.length > 0 && window.state?.config) {
              window.state.config.exponentialSmoothingFactor = 1 - data[0].alpha;
            }
          }
          window.PERSONAL_OPTIMIZATION_DONE = true;
          setUsePersonalParams(true);
          setParetoRank(1);
          setExponentialRank(1);
          console.log('✅ Auto-loaded personal Pareto from localStorage');
        }
      } catch (e) {
        console.warn('Could not auto-load Pareto from localStorage:', e.message);
      }
    }
  }, []);
  
  // CRITICAL: Expose state setters to window for external access (e.g., from Fitts experiment)
  // This allows the experiment to update the displayed rank when it changes the slider programmatically
  React.useEffect(() => {
    window.trackingControlsInstance = {
      setParetoRank: setParetoRank,
      setExponentialRank: setExponentialRank,
      setUseParetoFront: setUseParetoFront,
      setUseExponentialRank: setUseExponentialRank
    };
    
    return () => {
      window.trackingControlsInstance = null;
    };
  }, [setParetoRank, setExponentialRank, setUseParetoFront, setUseExponentialRank]);
  
  // Effect to show/hide video preview canvas
  React.useEffect(() => {
    const canvas = document.getElementById('face-canvas');
    if (canvas) {
      canvas.style.display = showVideoPreview ? 'block' : 'none';
    }
  }, [showVideoPreview]);
  
  // Effect to apply Rank 20 parameters on initial load for both filters
  React.useEffect(() => {
    // Apply Exponential Rank 20 if rank mode is active
    if (useExponentialRank && window.EXPONENTIAL_PARAMETERS && window.EXPONENTIAL_PARAMETERS[19]) {
      const params = window.EXPONENTIAL_PARAMETERS[19]; // Rank 20 (0-indexed)
      const smoothingFactor = 1 - params.alpha;
      console.log('🎯 Initializing Exponential with Rank 20:', smoothingFactor);
      window.state.config.exponentialSmoothingFactor = smoothingFactor;
      setExponentialSmoothingFactor(smoothingFactor);
    }
    
    // Apply One Euro Rank 1 if Pareto mode is active
    if (useParetoFront && window.PARETO_FRONT_PARAMETERS && window.PARETO_FRONT_PARAMETERS[0]) {
      const params = window.PARETO_FRONT_PARAMETERS[0]; // Rank 1
      console.log('🎯 Initializing One Euro with Rank 1:', params);
      
      if (!window.state.filterConfig) {
        window.state.filterConfig = {};
      }
      window.state.filterConfig.frequency = 60;
      window.state.filterConfig.minCutoff = params.minCutoff;
      window.state.filterConfig.beta = params.beta;
      window.state.filterConfig.dcutoff = params.dCutoff;
      
      setOneEuroParams({
        frequency: 60,
        minCutoff: params.minCutoff,
        beta: params.beta,
        dcutoff: params.dCutoff
      });
      
      // Initialize filters if One Euro is active
      if (window.state.config.filterType === 'oneEuro' && window.initializeFilters) {
        window.initializeFilters();
      }
    }
  }, []); // Run once on mount
  
  // Effect to initialize metrics if not already set
  React.useEffect(() => {
    // If we already have metrics from pre-calculation, no need to calculate again
    if (metrics) {
      console.log("Already have metrics, skipping calculation");
      
      // Also calculate end point metrics
      try {
        const endPointAnalysis = window.calculateEndPointResiduals();
        if (endPointAnalysis) {
          setEndPointMetrics(endPointAnalysis);
          console.log("End point metrics calculated:", endPointAnalysis);
        }
      } catch (err) {
        console.error("Error calculating end point metrics:", err);
      }
      
      return;
    }
    
    console.log("No pre-calculated metrics, calculating now...");
    try {
      if (window.state.transformationMatrices) {
        // Force immediate calculation
        if (window.forceCalculateAndDisplayMetrics) {
          const forcedMetrics = window.forceCalculateAndDisplayMetrics();
          if (forcedMetrics) {
            setMetrics(forcedMetrics);
            console.log("Forced metrics calculation:", forcedMetrics);
            return;
          }
        }
        
        // Fallback to regular calculation
        const analysis = window.calculateCalibrationResiduals();
        if (analysis) {
          setMetrics(analysis);
          console.log("Initial metrics calculated:", analysis);
        } else {
          console.warn("No analysis results returned from calculateCalibrationResiduals");
          // Try again after a short delay
          setTimeout(() => {
            const retryAnalysis = window.calculateCalibrationResiduals();
            if (retryAnalysis) {
              setMetrics(retryAnalysis);
              console.log("Retry metrics calculated:", retryAnalysis);
            }
          }, 500);
        }
      } else {
        console.warn("No transformation matrices available for metrics calculation");
      }
    } catch (err) {
      console.error("Error in initial metrics calculation:", err);
      setError("Failed to calculate initial metrics");
    }
    
    // After calculating regular metrics, also calculate end point metrics
    try {
      const endPointAnalysis = window.calculateEndPointResiduals();
      if (endPointAnalysis) {
        setEndPointMetrics(endPointAnalysis);
        console.log("End point metrics calculated:", endPointAnalysis);
      }
    } catch (err) {
      console.error("Error calculating end point metrics:", err);
    }
    
    // Update the window.updateTrackingControlsMetrics function to update both metrics
    window.updateTrackingControlsMetrics = () => {
      try {
        const analysis = window.calculateCalibrationResiduals();
        if (analysis) {
          setMetrics(analysis);
          console.log("Metrics updated via external call:", analysis);
        }
        
        const endPointAnalysis = window.calculateEndPointResiduals();
        if (endPointAnalysis) {
          setEndPointMetrics(endPointAnalysis);
          console.log("End point metrics updated via external call:", endPointAnalysis);
        }
      } catch (err) {
        console.error("Error updating metrics:", err);
      }
    };
    
    // Clean up
    return () => {
      window.updateTrackingControlsMetrics = null;
      // Also clean up the pre-calculated metrics
      window.preCalculatedMetrics = null;
    };
  }, [metrics]);

  // Handle landmark configuration change
  const handleLandmarkChange = React.useCallback((newValue) => {
    if (newValue === landmarks) return;
    
    console.log("Switching landmarks to:", newValue);
    try {
      // Update window state
      window.state.config.landmarkPoints = newValue;
      
      // Reset cursor state for clean transition
      window.state.lastHeadX = null;
      window.state.lastHeadY = null;
      window.state.cursorX = null;
      window.state.cursorY = null;

      // CRITICAL FIX: Reset rotation smoothing state
      window.state.smoothedAngles = null;
      window._lastAngles = null;  // Reset angle unwrapping state

      // Update metrics with new configuration - use the new function if available
      let analysis;
      if (window.updateMetricsForLandmarkChange) {
        analysis = window.updateMetricsForLandmarkChange(newValue);
      } else {
        analysis = window.calculateCalibrationResiduals();
      }
      
      setMetrics(analysis);
      
      // Update component state
      setLandmarks(newValue);
      setError(null);

      console.log("Successfully switched to", newValue, "landmarks");

      // Update end point metrics with new configuration
      const endPointAnalysis = window.calculateEndPointResiduals();
      setEndPointMetrics(endPointAnalysis);

    } catch (err) {
      console.error("Error switching landmarks:", err);
      setError(`Failed to switch landmarks: ${err.message}`);
    }
  }, [landmarks]);

  // Handle filter type change with similar visual feedback
  const handleFilterChange = React.useCallback((newValue) => {
    if (newValue === filterType) return;
    
    console.log("Switching filter to:", newValue);
    try {
      window.state.config.filterType = newValue;
      
      // Reset cursor state
      window.state.lastHeadX = null;
      window.state.lastHeadY = null;
      window.state.cursorX = null;
      window.state.cursorY = null;
      
      if (newValue === "oneEuro") {
        // Automatically enable Pareto mode and set to rank 1
        console.log("Initializing One Euro Filter with Pareto Rank 1");
        
        // Enable Pareto mode
        setUseParetoFront(true);
        setParetoRank(1);
        
        // Get rank 1 parameters
        if (window.PARETO_FRONT_PARAMETERS && window.PARETO_FRONT_PARAMETERS[0]) {
          const params = window.PARETO_FRONT_PARAMETERS[0];
          console.log("Applying Pareto Rank 1 parameters:", params);
          
          const newParams = {
            frequency: 60,
            minCutoff: params.minCutoff,
            beta: params.beta,
            dcutoff: params.dCutoff
          };
          
          // Update window state
          if (!window.state.filterConfig) window.state.filterConfig = {};
          window.state.filterConfig.frequency = newParams.frequency;
          window.state.filterConfig.minCutoff = params.minCutoff;
          window.state.filterConfig.beta = params.beta;
          window.state.filterConfig.dcutoff = params.dCutoff;
          
          // Update React state
          setOneEuroParams(newParams);
          
          // Initialize 2D filter with Pareto Rank 1 parameters
          if (window.OneEuroFilter2D) {
            window.state.filter2D = new window.OneEuroFilter2D(
              newParams.frequency,
              newParams.minCutoff,
              newParams.beta,
              newParams.dcutoff
            );
            window.state.xFilter = window.state.filter2D;
            window.state.yFilter = window.state.filter2D;
            console.log("One Euro 2D Filter initialized with Pareto Rank 1");
          }
        } else {
          // Fallback to default initialization
          window.initializeFilters();
        }
        
        // Reset any accumulated smoothing state
        if (window.state.smoothedX !== undefined) {
          window.state.smoothedX = null;
          window.state.smoothedY = null;
        }
      }
      
      setFilterType(newValue);
      setError(null);

      // const status = document.getElementById("status");
      // if (status) {
      //   status.textContent = `Filter: ${newValue}`;
      // }

    } catch (err) {
      console.error("Error switching filter:", err);
      setError(`Failed to switch filter: ${err.message}`);
    }
  }, [filterType]);

  // Add a function to convert 3D landmarks to 2D format
  function convert3DLandmarksTo2D(landmarks3D) {
    if (!landmarks3D || !landmarks3D.length) return null;
    
    try {
      // Create a new array for 2D formatted landmarks
      const landmarks2D = [];
      
      // For each calibration point
      for (let i = 0; i < landmarks3D.length; i++) {
        const point3D = landmarks3D[i];
        const point2D = [];
        
        // For each landmark in a 3D point (which has 6 values per landmark: x,y,z,x²,y²,z²)
        // we convert to 2D format (which has 4 values per landmark: x,y,x²,y²)
        const totalLandmarks = point3D.length / 6; // Calculate number of landmarks
        
        // Process each landmark
        for (let j = 0; j < totalLandmarks; j++) {
          const baseIdx3D = j * 6; // Each landmark has 6 values in 3D
          
          // Extract just x and y values (skip z)
          point2D.push([point3D[baseIdx3D][0]]);     // x
          point2D.push([point3D[baseIdx3D + 1][0]]); // y
          
          // Extract just x² and y² values (skip z²)
          point2D.push([point3D[baseIdx3D + 3][0]]); // x²
          point2D.push([point3D[baseIdx3D + 4][0]]); // y²
        }
        
        landmarks2D.push(point2D);
      }
      
      return landmarks2D;
    } catch (error) {
      console.error("Error converting 3D landmarks to 2D format:", error);
      return null;
    }
  }

  // Handle coordinate system change
  const handleCoordinateSystemChange = React.useCallback((newValue) => {
    if (newValue === coordinateSystem) return;
    
    console.log("Switching coordinate system to:", newValue);
    try {
      // Check if required matrices exist before switching
      if (newValue === "3d") {
        if (!window.state.transformationMatrices.threePoint3d || !window.state.transformationMatrices.sixPoint3d) {
          console.warn("Missing required 3D matrices. Attempting to use available matrices as fallback.");
          
          // Use the generic matrices as fallback
          if (window.state.transformationMatrices.threePoint && !window.state.transformationMatrices.threePoint3d) {
            window.state.transformationMatrices.threePoint3d = window.state.transformationMatrices.threePoint;
            console.log("Using generic three-point matrix for 3D");
          }
          
          if (window.state.transformationMatrices.sixPoint && !window.state.transformationMatrices.sixPoint3d) {
            window.state.transformationMatrices.sixPoint3d = window.state.transformationMatrices.sixPoint;
            console.log("Using generic six-point matrix for 3D");
          }
          
          // Check again after fallback
          if (!window.state.transformationMatrices.threePoint3d || !window.state.transformationMatrices.sixPoint3d) {
            console.error("Still missing required 3D matrices. Cannot switch to 3D mode.");
            setError("Missing 3D transformation matrices. Please reload calibration file.");
            return;
          }
        }
      } else if (newValue === "2d") {
        if (!window.state.transformationMatrices.threePoint2d || !window.state.transformationMatrices.sixPoint2d) {
          console.warn("Missing required 2D matrices. Attempting to use available matrices as fallback.");
          
          // Use the generic matrices as fallback
          if (window.state.transformationMatrices.threePoint && !window.state.transformationMatrices.threePoint2d) {
            // Check dimensions to ensure it's actually a 2D matrix
            // 2D three-point: 12 columns without rotation, 15 with rotation
            try {
              const matrixDim = math.size(math.matrix(window.state.transformationMatrices.threePoint));
              const isTwoDimensional = (matrixDim[1] === 12 || matrixDim[1] === 15);
              
              if (isTwoDimensional) {
                window.state.transformationMatrices.threePoint2d = window.state.transformationMatrices.threePoint;
                console.log("Using generic three-point matrix for 2D (columns:", matrixDim[1], ")");
              } else {
                console.warn("Generic three-point matrix has incompatible dimensions for 2D mode:", matrixDim[1]);
              }
            } catch (dimError) {
              console.error("Error checking matrix dimensions:", dimError);
            }
          }
          
          if (window.state.transformationMatrices.sixPoint && !window.state.transformationMatrices.sixPoint2d) {
            // Check dimensions to ensure it's actually a 2D matrix
            // 2D six-point: 24 columns without rotation, 27 with rotation
            try {
              const matrixDim = math.size(math.matrix(window.state.transformationMatrices.sixPoint));
              const isTwoDimensional = (matrixDim[1] === 24 || matrixDim[1] === 27);
              
              if (isTwoDimensional) {
                window.state.transformationMatrices.sixPoint2d = window.state.transformationMatrices.sixPoint;
                console.log("Using generic six-point matrix for 2D (columns:", matrixDim[1], ")");
              } else {
                console.warn("Generic six-point matrix has incompatible dimensions for 2D mode:", matrixDim[1]);
              }
            } catch (dimError) {
              console.error("Error checking matrix dimensions:", dimError);
            }
          }
          
          // DO NOT use 3D matrices as fallbacks for 2D since dimensions won't match
          // Instead, try to recalculate proper 2D matrices if we have calibration data
          
          if ((!window.state.transformationMatrices.threePoint2d || !window.state.transformationMatrices.sixPoint2d) && 
              window.state.calibrationData && 
              window.state.calibrationData.landmarkPoints3 && 
              window.state.calibrationData.cursorPositions &&
              typeof window.calculateTransformationMatrixForConfig === 'function') {
            
            console.log("Attempting to calculate proper 2D matrices from calibration data");
            
            // Temporarily set state to 2D for matrix calculation
            const oldCoordSystem = window.state.config.coordinateSystem;
            window.state.config.coordinateSystem = "2d";
            
            try {
              // Convert 3D landmark data to 2D format
              const landmarks3_2D = convert3DLandmarksTo2D(window.state.calibrationData.landmarkPoints3);
              const landmarks6_2D = convert3DLandmarksTo2D(window.state.calibrationData.landmarkPoints6);
              
              if (landmarks3_2D && !window.state.transformationMatrices.threePoint2d) {
                window.state.transformationMatrices.threePoint2d = window.calculateTransformationMatrixForConfig(
                  landmarks3_2D, // Use converted 2D data
                  window.state.calibrationData.cursorPositions,
                  "3"
                );
                console.log("Successfully calculated 2D three-point matrix");
              }
              
              if (landmarks6_2D && !window.state.transformationMatrices.sixPoint2d) {
                window.state.transformationMatrices.sixPoint2d = window.calculateTransformationMatrixForConfig(
                  landmarks6_2D, // Use converted 2D data
                  window.state.calibrationData.cursorPositions,
                  "6"
                );
                console.log("Successfully calculated 2D six-point matrix");
              }
            } catch (err) {
              console.error("Error calculating 2D matrices:", err);
            } finally {
              // Restore original coordinate system
              window.state.config.coordinateSystem = oldCoordSystem;
            }
          }
          
          // Check again after all fallback attempts
          if (!window.state.transformationMatrices.threePoint2d || !window.state.transformationMatrices.sixPoint2d) {
            console.error("Still missing required 2D matrices with correct dimensions. Cannot switch to 2D mode.");
            setError("Missing proper 2D transformation matrices. Please reload calibration file.");
            return;
          }
        }
      }
      
      // Update window state
      window.state.config.coordinateSystem = newValue;
      
      // Reset cursor state for clean transition
      window.state.lastHeadX = null;
      window.state.lastHeadY = null;
      window.state.cursorX = null;
      window.state.cursorY = null;
      
      // CRITICAL FIX: Reset rotation state
      window.state.smoothedAngles = null;  // Legacy
      window.state.lastRawAngles = null;    // Current
      window._lastAngles = null;  // Reset angle unwrapping state

      // Update metrics with new configuration
      let analysis;
      if (window.updateMetricsForCoordinateSystemChange) {
        analysis = window.updateMetricsForCoordinateSystemChange(newValue);
      } else {
        analysis = window.calculateCalibrationResiduals();
      }
      
      setMetrics(analysis);
      
      // Update component state
      setCoordinateSystem(newValue);
      setError(null);

      console.log("Successfully switched to", newValue, "coordinate system");

      // Update end point metrics with new configuration
      const endPointAnalysis = window.calculateEndPointResiduals();
      setEndPointMetrics(endPointAnalysis);

    } catch (err) {
      console.error("Error switching coordinate system:", err);
      setError(`Failed to switch coordinate system: ${err.message}`);
    }
  }, [coordinateSystem]);

  // Add handler for exponential smoothing parameter change
  const handleExponentialSmoothingChange = React.useCallback((event) => {
    const newValue = parseFloat(event.target.value);
    console.log("Changing exponential smoothing factor to:", newValue);
    
    // Disable rank mode when manually adjusting
    setUseExponentialRank(false);
    
    try {
      // Update window state
      if (!window.state.config) window.state.config = {};
      window.state.config.exponentialSmoothingFactor = newValue;
      
      // Reset cursor state for clean transition
      window.state.lastHeadX = null;
      window.state.lastHeadY = null;
      window.state.cursorX = null;
      window.state.cursorY = null;
      
      // CRITICAL FIX: Reset rotation state
      window.state.smoothedAngles = null;  // Legacy
      window.state.lastRawAngles = null;    // Current
      window._lastAngles = null;  // Reset angle unwrapping state
      
      // Update component state
      setExponentialSmoothingFactor(newValue);
    } catch (err) {
      console.error("Error updating exponential smoothing:", err);
    }
  }, []);

  // Add handler for 1€ filter parameter changes
  const handleOneEuroParamChange = React.useCallback((param, event) => {
    const newValue = parseFloat(event.target.value);
    console.log(`Changing 1€ filter ${param} to:`, newValue);
    
    // Disable Pareto front mode when manually adjusting
    setUseParetoFront(false);
    
    try {
      // Update config in window state
      if (!window.state.filterConfig) window.state.filterConfig = {};
      window.state.filterConfig[param] = newValue;
      
      // Update state and re-initialize filter
      setOneEuroParams(prev => {
        const updated = { ...prev, [param]: newValue };
        
        // Re-initialize filters with new parameters
        const config = {
          frequency: updated.frequency,
          minCutoff: updated.minCutoff,
          beta: updated.beta,
          dcutoff: updated.dcutoff
        };
        
        // Reset 2D filter with new config
        window.state.filter2D = new OneEuroFilter2D(
          config.frequency,
          config.minCutoff,
          config.beta,
          config.dcutoff
        );
        window.state.xFilter = window.state.filter2D;
        window.state.yFilter = window.state.filter2D;
        
        // Reset cursor state for clean transition
        window.state.lastHeadX = null;
        window.state.lastHeadY = null;
        window.state.cursorX = null;
        window.state.cursorY = null;
        
        // CRITICAL FIX: Reset rotation smoothing state
        window.state.smoothedAngles = null;
        
        return updated;
      });
    } catch (err) {
      console.error(`Error updating 1€ filter ${param}:`, err);
    }
  }, []);

  // Handler for Pareto front rank selection
  const handleParetoRankChange = React.useCallback((event) => {
    const rank = parseInt(event.target.value);
    console.log('Changing Pareto rank to:', rank);
    
    // Enable Pareto front mode
    setUseParetoFront(true);
    setParetoRank(rank);
    
    // Get parameters for this rank
    if (window.PARETO_FRONT_PARAMETERS) {
      const params = window.PARETO_FRONT_PARAMETERS[rank - 1]; // rank is 1-indexed
      
      if (params) {
        console.log('Applying Pareto parameters:', params);
        
        // Update One Euro filter parameters
        const newParams = {
          frequency: 60, // Keep existing frequency
          minCutoff: params.minCutoff,
          beta: params.beta,
          dcutoff: params.dCutoff
        };
        
        // Update window state - ensure filter type is set to oneEuro
        if (!window.state.config) window.state.config = {};
        window.state.config.filterType = 'oneEuro';
        
        if (!window.state.filterConfig) window.state.filterConfig = {};
        window.state.filterConfig.frequency = newParams.frequency;
        window.state.filterConfig.minCutoff = params.minCutoff;
        window.state.filterConfig.beta = params.beta;
        window.state.filterConfig.dcutoff = params.dCutoff;
        
        // Update React state
        setOneEuroParams(newParams);
        
        // ALWAYS re-initialize filters with new parameters (don't check if they exist)
        // This ensures fresh filter state every time
        if (window.OneEuroFilter2D) {
          console.log('Reinitializing 2D filter with:', newParams);
          window.state.filter2D = new window.OneEuroFilter2D(
            newParams.frequency,
            newParams.minCutoff,
            newParams.beta,
            newParams.dcutoff
          );
          window.state.xFilter = window.state.filter2D;
          window.state.yFilter = window.state.filter2D;
          console.log('2D Filter reinitialized successfully');
        } else {
          console.error('OneEuroFilter2D class not available');
        }
        
        // Reset cursor state for clean transition
        window.state.lastHeadX = null;
        window.state.lastHeadY = null;
        window.state.cursorX = null;
        window.state.cursorY = null;
        
        // Reset any accumulated smoothing state
        if (window.state.smoothedX !== undefined) {
          window.state.smoothedX = null;
          window.state.smoothedY = null;
        }
        
        // CRITICAL FIX: Reset rotation state
        window.state.smoothedAngles = null;  // Legacy
        window.state.lastRawAngles = null;    // Current
        console.log("🔄 Reset angle state when changing Pareto rank");
      }
    } else {
      console.error('PARETO_FRONT_PARAMETERS not loaded');
    }
  }, []);

  // Handler for Exponential rank selection
  const handleExponentialRankChange = React.useCallback((event) => {
    const rank = parseInt(event.target.value);
    console.log('Changing Exponential rank to:', rank);
    
    // Enable Exponential rank mode
    setUseExponentialRank(true);
    setExponentialRank(rank);
    
    // Get parameters for this rank
    if (window.EXPONENTIAL_PARAMETERS) {
      const params = window.EXPONENTIAL_PARAMETERS[rank - 1]; // rank is 1-indexed
      
      if (params) {
        console.log('Applying Exponential parameters:', params);
        
        // CRITICAL: Convert alpha to smoothingFactor
        // In optimization: S_t = alpha * X_t + (1-alpha) * S_(t-1)
        // In tracking: S_t = smoothingFactor * S_(t-1) + (1-smoothingFactor) * X_t
        // Therefore: smoothingFactor = (1 - alpha)
        const newSmoothingFactor = 1 - params.alpha;
        
        // Update window state
        if (!window.state.config) window.state.config = {};
        window.state.config.exponentialSmoothingFactor = newSmoothingFactor;
        
        // Update React state
        setExponentialSmoothingFactor(newSmoothingFactor);
        
        // Reset cursor state for clean transition
        window.state.lastHeadX = null;
        window.state.lastHeadY = null;
        window.state.cursorX = null;
        window.state.cursorY = null;
        
        // Reset any accumulated smoothing state
        if (window.state.smoothedX !== undefined) {
          window.state.smoothedX = null;
          window.state.smoothedY = null;
        }
        
        // CRITICAL FIX: Reset rotation state
        window.state.smoothedAngles = null;  // Legacy
        window.state.lastRawAngles = null;    // Current
        console.log("🔄 Reset angle state when changing Exponential rank");
      }
    } else {
      console.error('EXPONENTIAL_PARAMETERS not loaded');
    }
  }, []);

  // Handler for toggling between personal and default parameters
  const handleTogglePersonalParams = React.useCallback(() => {
    const switchToPersonal = !usePersonalParams;
    
    if (switchToPersonal) {
      // Switch to personal - only if personal data exists
      if (!window._PERSONAL_PARETO_FRONT_PARAMETERS && !window._PERSONAL_EXPONENTIAL_PARAMETERS) {
        alert('No personal parameters available. Run Parameter Optimization or upload CSV files first.');
        return;
      }
      if (window._PERSONAL_PARETO_FRONT_PARAMETERS) {
        window.PARETO_FRONT_PARAMETERS = window._PERSONAL_PARETO_FRONT_PARAMETERS;
      }
      if (window._PERSONAL_EXPONENTIAL_PARAMETERS) {
        window.EXPONENTIAL_PARAMETERS = window._PERSONAL_EXPONENTIAL_PARAMETERS;
      }
      window.PERSONAL_OPTIMIZATION_DONE = true;
      console.log('🔄 Switched to PERSONAL parameters');
    } else {
      // Switch to default
      if (window._DEFAULT_PARETO_FRONT_PARAMETERS) {
        window.PARETO_FRONT_PARAMETERS = window._DEFAULT_PARETO_FRONT_PARAMETERS;
      }
      if (window._DEFAULT_EXPONENTIAL_PARAMETERS) {
        window.EXPONENTIAL_PARAMETERS = window._DEFAULT_EXPONENTIAL_PARAMETERS;
      }
      window.PERSONAL_OPTIMIZATION_DONE = false;
      console.log('🔄 Switched to DEFAULT parameters');
    }
    
    setUsePersonalParams(switchToPersonal);
    setParetoRank(1);
    setExponentialRank(1);
    
    // Apply Rank 1 from the new active dataset
    if (window.EXPONENTIAL_PARAMETERS && window.EXPONENTIAL_PARAMETERS[0]) {
      const params = window.EXPONENTIAL_PARAMETERS[0];
      const sf = 1 - params.alpha;
      window.state.config.exponentialSmoothingFactor = sf;
      setExponentialSmoothingFactor(sf);
    }
    if (window.PARETO_FRONT_PARAMETERS && window.PARETO_FRONT_PARAMETERS[0]) {
      const params = window.PARETO_FRONT_PARAMETERS[0];
      if (!window.state.filterConfig) window.state.filterConfig = {};
      window.state.filterConfig.minCutoff = params.minCutoff;
      window.state.filterConfig.beta = params.beta;
      window.state.filterConfig.dcutoff = params.dCutoff;
      setOneEuroParams({
        frequency: 60,
        minCutoff: params.minCutoff,
        beta: params.beta,
        dcutoff: params.dCutoff
      });
    }
  }, [usePersonalParams]);

  // Pareto front calculation from raw results (same algorithm as viewer)
  const calculateParetoFront = React.useCallback((results) => {
    const valid = results.filter(r => 
      r.meanVariance !== Infinity && r.meanLatency !== Infinity && r.validPositions >= 1
    );
    
    // Deduplicate using toFixed(2) key
    const seen = new Map();
    const unique = [];
    for (const r of valid) {
      const key = `${r.meanVariance.toFixed(2)}_${r.meanLatency.toFixed(2)}`;
      if (!seen.has(key)) { seen.set(key, true); unique.push(r); }
    }
    
    // Sort by variance for consistent results
    const sorted = [...unique].sort((a, b) => a.meanVariance - b.meanVariance);
    
    // Incremental Pareto front (matches viewer algorithm exactly)
    const front = [];
    for (const candidate of sorted) {
      let dominated = false;
      for (const p of front) {
        if (p.meanVariance <= candidate.meanVariance &&
            p.meanLatency <= candidate.meanLatency &&
            (p.meanVariance < candidate.meanVariance || p.meanLatency < candidate.meanLatency)) {
          dominated = true;
          break;
        }
      }
      if (!dominated) {
        const filtered = front.filter(p => {
          const d = candidate.meanVariance <= p.meanVariance &&
                    candidate.meanLatency <= p.meanLatency &&
                    (candidate.meanVariance < p.meanVariance || candidate.meanLatency < p.meanLatency);
          return !d;
        });
        front.length = 0;
        front.push(...filtered, candidate);
      }
    }
    front.sort((a, b) => a.meanVariance - b.meanVariance);
    return front;
  }, []);

  // Handler for uploading CSV files
  const handleCSVUpload = React.useCallback((filterType) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target.result;
          const lines = text.trim().split('\n');
          const headers = lines[0].split(',');
          
          const results = [];
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if (values.length < headers.length) continue;
            
            const row = {};
            headers.forEach((h, idx) => { row[h.trim()] = parseFloat(values[idx]); });
            
            if (isNaN(row.meanVariance) || isNaN(row.meanLatency)) continue;
            
            if (filterType === 'oneeuro') {
              results.push({
                meanVariance: row.meanVariance,
                meanLatency: row.meanLatency,
                validPositions: row.validPositions || 9,
                params: { minCutoff: row.minCutoff, beta: row.beta, dCutoff: row.dCutoff }
              });
            } else {
              results.push({
                meanVariance: row.meanVariance,
                meanLatency: row.meanLatency,
                validPositions: row.validPositions || 9,
                params: { alpha: row.alpha }
              });
            }
          }
          
          // Calculate Pareto front from all results
          const front = calculateParetoFront(results);
          
          if (filterType === 'oneeuro') {
            const formatted = front.map((r, i) => ({
              rank: i + 1,
              minCutoff: r.params.minCutoff,
              beta: r.params.beta,
              dCutoff: r.params.dCutoff,
              meanVariance: r.meanVariance,
              meanLatency: r.meanLatency,
              validPositions: r.validPositions
            }));
            window._PERSONAL_PARETO_FRONT_PARAMETERS = formatted;
            window.PARETO_FRONT_PARAMETERS = formatted;
            setParetoRank(1);
            console.log(`📥 Loaded ${results.length} One Euro results → ${formatted.length} Pareto-optimal`);
          } else {
            const formatted = front.map((r, i) => ({
              rank: i + 1,
              alpha: r.params.alpha,
              meanVariance: r.meanVariance,
              meanLatency: r.meanLatency,
              validPositions: r.validPositions
            }));
            window._PERSONAL_EXPONENTIAL_PARAMETERS = formatted;
            window.EXPONENTIAL_PARAMETERS = formatted;
            setExponentialRank(1);
            console.log(`📥 Loaded ${results.length} Exponential results → ${formatted.length} Pareto-optimal`);
          }
          
          window.PERSONAL_OPTIMIZATION_DONE = true;
          setUsePersonalParams(true);
          
          // Apply Rank 1 params
          if (filterType === 'oneeuro' && window.PARETO_FRONT_PARAMETERS[0]) {
            const p = window.PARETO_FRONT_PARAMETERS[0];
            if (!window.state.filterConfig) window.state.filterConfig = {};
            window.state.filterConfig.minCutoff = p.minCutoff;
            window.state.filterConfig.beta = p.beta;
            window.state.filterConfig.dcutoff = p.dCutoff;
            setOneEuroParams({ frequency: 60, minCutoff: p.minCutoff, beta: p.beta, dcutoff: p.dCutoff });
          } else if (filterType === 'exponential' && window.EXPONENTIAL_PARAMETERS[0]) {
            const p = window.EXPONENTIAL_PARAMETERS[0];
            const sf = 1 - p.alpha;
            window.state.config.exponentialSmoothingFactor = sf;
            setExponentialSmoothingFactor(sf);
          }
          
        } catch (err) {
          console.error('Error parsing CSV:', err);
          alert('Failed to parse CSV file: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [calculateParetoFront]);

  return React.createElement('div', {
    className: 'tracking-controls'
  }, [
    // Back to Start button
    React.createElement('button', {
      onClick: () => {
        if (confirm('Go back to the configuration screen? You will need to recalibrate.')) {
          window.location.reload();
        }
      },
      className: 'w-full px-3 py-2 mb-3 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors text-sm',
      key: 'back-to-start',
      style: { borderLeft: '3px solid #64c8ff' }
    }, '\u2190 Back to Start / Recalibrate'),
    
    // Title
    React.createElement('h3', { 
      key: 'title',
      className: 'text-lg font-bold text-green-500 mb-4'
    }, 'Tracking Controls'),
    
    // Checkbox for video preview
    React.createElement('div', {
      className: 'control-group mb-4',
      key: 'video-preview-control'
    }, [
      React.createElement('label', {
        className: 'flex items-center text-gray-300',
        key: 'video-preview-label'
      }, [
        React.createElement('input', {
          type: 'checkbox',
          checked: showVideoPreview,
          onChange: (e) => setShowVideoPreview(e.target.checked),
          className: 'mr-2',
          key: 'video-preview-checkbox'
        }),
        'Show Video Preview'
      ])
    ]),
    
    // Coordinate System Controls (new section)
    React.createElement('div', { 
      className: 'control-group mb-4',
      key: 'coordinate-system-control',
      'data-control-type': 'coordinate-system-control'
    }, [
      React.createElement('p', { 
        key: 'coordinate-label',
        className: 'text-gray-300 mb-2'
      }, 'Coordinate System:'),
      React.createElement('div', { 
        className: 'button-group flex gap-2',
        key: 'coordinate-buttons'
      }, [
        React.createElement('button', {
          onClick: () => handleCoordinateSystemChange("2d"),
          className: `flex-1 px-3 py-2 rounded transition-colors ${
            coordinateSystem === "2d" ? 'active-button bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'
          }`,
          key: '2d-system'
        }, '2D'),
        React.createElement('button', {
          onClick: () => handleCoordinateSystemChange("3d"),
          className: `flex-1 px-3 py-2 rounded transition-colors ${
            coordinateSystem === "3d" ? 'active-button bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'
          }`,
          key: '3d-system'
        }, '3D')
      ])
    ]),
    
    // Landmark Controls with updated styling
    React.createElement('div', { 
      className: 'control-group mb-4',
      key: 'landmark-control',
      'data-control-type': 'landmark-control'
    }, [
      React.createElement('p', { 
        key: 'landmark-label',
        className: 'text-gray-300 mb-2'
      }, 'Landmark Points:'),
      React.createElement('div', { 
        className: 'button-group flex gap-2',
        key: 'landmark-buttons'
      }, [
        React.createElement('button', {
          onClick: () => handleLandmarkChange("3"),
          className: `flex-1 px-3 py-2 rounded transition-colors ${
            landmarks === "3" ? 'active-button bg-white text-black font-bold' : 'bg-gray-200 text-black hover:bg-white'
          }`,
          key: '3-points'
        }, '3 Points'),
        React.createElement('button', {
          onClick: () => handleLandmarkChange("6"),
          className: `flex-1 px-3 py-2 rounded transition-colors ${
            landmarks === "6" ? 'active-button bg-white text-black font-bold' : 'bg-gray-200 text-black hover:bg-white'
          }`,
          key: '6-points'
        }, '6 Points')
      ])
    ]),
    
    // Tracking Mode button (shows rotation panel for mode switching)
    window.liveRotationControl ? React.createElement('div', {
      className: 'control-group mb-4',
      key: 'tracking-mode-control',
      'data-control-type': 'tracking-mode-control'
    }, [
      React.createElement('button', {
        onClick: () => {
          if (window.liveRotationControl && window.liveRotationControl.togglePanel) {
            window.liveRotationControl.togglePanel();
          }
        },
        className: 'w-full px-3 py-2 rounded transition-colors bg-white hover:bg-gray-200 text-black text-sm font-medium',
        key: 'tracking-mode-btn'
      }, `🎯 Tracking Mode: ${window.liveRotationControl?.trackingMode === 'rotation' ? 'Rotation Only' : window.liveRotationControl?.trackingMode === 'landmarks+rotation' ? 'Landmarks + Rotation' : 'Landmarks'}`)
    ]) : null,
    
    // Filter Controls with updated styling
    React.createElement('div', { 
      className: 'control-group mb-4',
      key: 'filter-control',
      'data-control-type': 'filter-control'
    }, [
      React.createElement('p', { 
        key: 'filter-label',
        className: 'text-gray-300 mb-2'
      }, 'Smoothing Filter:'),
      React.createElement('div', { 
        className: 'button-group flex gap-2 filter-buttons',
        key: 'filter-buttons'
      }, [
        React.createElement('button', {
          onClick: () => handleFilterChange("exponential"),
          className: `flex-1 px-3 py-2 rounded transition-colors ${
            filterType === "exponential" ? 'active-filter bg-purple-500' : 'bg-gray-700 hover:bg-gray-600'
          }`,
          key: 'exponential'
        }, 'Exponential'),
        React.createElement('button', {
          onClick: () => handleFilterChange("oneEuro"),
          className: `flex-1 px-3 py-2 rounded transition-colors ${
            filterType === "oneEuro" ? 'active-filter bg-purple-500' : 'bg-gray-700 hover:bg-gray-600'
          }`,
          key: 'one-euro'
        }, '1€ Filter')
      ]),
      
      // Personal/Default toggle and CSV upload (test mode only)
      React.createElement('div', {
        className: 'mt-3 p-2 bg-gray-800 rounded border border-gray-600',
        style: isUserMode() ? { display: 'none' } : {},
        key: 'param-source-controls'
      }, [
        React.createElement('div', {
          className: 'flex items-center justify-between mb-2',
          key: 'param-toggle-row'
        }, [
          React.createElement('span', {
            className: 'text-xs text-gray-300',
            key: 'param-source-label'
          }, 'Parameter Source:'),
          React.createElement('button', {
            onClick: handleTogglePersonalParams,
            className: `px-3 py-1 text-xs rounded transition-colors ${
              usePersonalParams 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-gray-600 hover:bg-gray-500 text-gray-200'
            }`,
            key: 'param-toggle-btn'
          }, usePersonalParams ? 'Personal' : 'Default')
        ]),
        React.createElement('div', {
          className: 'flex gap-2',
          key: 'csv-upload-row'
        }, [
          React.createElement('button', {
            onClick: () => handleCSVUpload('oneeuro'),
            className: 'flex-1 px-2 py-1 text-xs bg-white hover:bg-gray-200 text-black rounded transition-colors',
            key: 'upload-oneeuro-btn'
          }, '📥 Upload 1€ CSV'),
          React.createElement('button', {
            onClick: () => handleCSVUpload('exponential'),
            className: 'flex-1 px-2 py-1 text-xs bg-white hover:bg-gray-200 text-black rounded transition-colors',
            key: 'upload-exp-btn'
          }, '📥 Upload Exp CSV')
        ])
      ]),
      
      // PARETO FRONT SLIDER (test mode only, still functional internally)
      filterType === "oneEuro" && React.createElement('div', {
        className: 'pareto-front-selector mt-3 p-3 bg-gray-900 border border-purple-500 rounded',
        style: isUserMode() ? { display: 'none' } : {},
        key: 'pareto-front-selector'
      }, [
        React.createElement('div', {
          className: 'flex justify-between items-center mb-2',
          key: 'pareto-header'
        }, [
          React.createElement('h4', {
            className: 'text-sm font-bold text-purple-400',
            key: 'pareto-title'
          }, 'Optimized Parameter Sets'),
          React.createElement('span', {
            className: `text-xs ${window.PERSONAL_OPTIMIZATION_DONE ? 'text-green-400' : 'text-gray-400'}`,
            key: 'pareto-mode-indicator'
          }, useParetoFront 
            ? (window.PERSONAL_OPTIMIZATION_DONE ? '🟢 Personal' : '🟢 Default') 
            : '⚪ Manual')
        ]),
        
        React.createElement('div', {
          className: 'param-group mb-3',
          key: 'pareto-rank-slider'
        }, [
          React.createElement('div', {
            className: 'flex justify-between mb-1',
            key: 'pareto-rank-label-row'
          }, [
            React.createElement('label', {
              className: 'text-sm text-gray-300',
              key: 'pareto-rank-label'
            }, 'Configuration Rank:'),
            React.createElement('span', {
              className: 'text-sm font-bold text-purple-300',
              key: 'pareto-rank-value'
            }, `${paretoRank} / ${window.PARETO_FRONT_PARAMETERS ? window.PARETO_FRONT_PARAMETERS.length : 85}`)
          ]),
          React.createElement('input', {
            type: 'range',
            min: '1',
            max: `${window.PARETO_FRONT_PARAMETERS ? window.PARETO_FRONT_PARAMETERS.length : 85}`,
            step: '1',
            value: paretoRank,
            onChange: handleParetoRankChange,
            className: 'w-full',
            key: 'pareto-rank-input'
          })
        ]),
        
        // Display current Pareto parameters
        (() => {
          const params = window.PARETO_FRONT_PARAMETERS ? window.PARETO_FRONT_PARAMETERS[paretoRank - 1] : null;
          if (!params) return null;
          
          return React.createElement('div', {
            className: 'pareto-details bg-gray-800 p-2 rounded text-xs',
            key: 'pareto-details'
          }, [
            React.createElement('div', {
              className: 'grid grid-cols-2 gap-2 mb-2',
              key: 'pareto-params-grid'
            }, [
              React.createElement('div', { key: 'param-mincutoff' }, [
                React.createElement('span', { 
                  className: 'text-gray-400',
                  key: 'mincutoff-label'
                }, 'minCutoff: '),
                React.createElement('span', { 
                  className: 'text-white font-mono',
                  key: 'mincutoff-value'
                }, params.minCutoff.toFixed(4))
              ]),
              React.createElement('div', { key: 'param-beta' }, [
                React.createElement('span', { 
                  className: 'text-gray-400',
                  key: 'beta-label'
                }, 'beta: '),
                React.createElement('span', { 
                  className: 'text-white font-mono',
                  key: 'beta-value'
                }, params.beta.toFixed(6))
              ]),
              React.createElement('div', { key: 'param-dcutoff' }, [
                React.createElement('span', { 
                  className: 'text-gray-400',
                  key: 'dcutoff-label'
                }, 'dCutoff: '),
                React.createElement('span', { 
                  className: 'text-white font-mono',
                  key: 'dcutoff-value'
                }, params.dCutoff.toFixed(4))
              ])
            ]),
            React.createElement('div', {
              className: 'grid grid-cols-2 gap-2 pt-2 border-t border-gray-700',
              key: 'pareto-metrics-grid'
            }, [
              React.createElement('div', { key: 'metric-variance' }, [
                React.createElement('span', { 
                  className: 'text-gray-400',
                  key: 'variance-label'
                }, 'Variance: '),
                React.createElement('span', { 
                  className: 'text-green-400 font-mono',
                  key: 'variance-value'
                }, params.meanVariance.toFixed(4))
              ]),
              React.createElement('div', { key: 'metric-latency' }, [
                React.createElement('span', { 
                  className: 'text-gray-400',
                  key: 'latency-label'
                }, 'Latency: '),
                React.createElement('span', { 
                  className: 'text-blue-400 font-mono',
                  key: 'latency-value'
                }, `${params.meanLatency.toFixed(2)} ms`)
              ])
            ])
          ]);
        })(),
        
        React.createElement('p', {
          className: 'text-xs text-gray-400 mt-2',
          key: 'pareto-description'
        }, window.PERSONAL_OPTIMIZATION_DONE 
          ? 'Using YOUR personal Pareto front from parameter optimization. Lower ranks = more stable, higher ranks = faster response.'
          : 'Using default parameters. Run Parameter Optimization to get your personal Pareto front.')
      ]),
      
      // Exponential rank selector (test mode only, still functional internally)
      filterType === "exponential" ? 
        React.createElement('div', {
          className: 'exponential-rank-selector mt-3 p-3 bg-gray-900 border border-purple-500 rounded',
          style: isUserMode() ? { display: 'none' } : {},
          key: 'exponential-rank-selector'
        }, [
          React.createElement('div', {
            className: 'flex justify-between items-center mb-2',
            key: 'exp-header'
          }, [
            React.createElement('h4', {
              className: 'text-sm font-bold text-purple-400',
              key: 'exp-title'
            }, 'Optimized Parameter Sets'),
            React.createElement('span', {
              className: `text-xs ${window.PERSONAL_OPTIMIZATION_DONE ? 'text-green-400' : 'text-gray-400'}`,
              key: 'exp-mode-indicator'
            }, useExponentialRank 
              ? (window.PERSONAL_OPTIMIZATION_DONE ? '🟢 Personal' : '🟢 Default') 
              : '⚪ Manual')
          ]),
          
          React.createElement('div', {
            className: 'param-group mb-3',
            key: 'exp-rank-slider'
          }, [
            React.createElement('div', {
              className: 'flex justify-between mb-1',
              key: 'exp-rank-label-row'
            }, [
              React.createElement('label', {
                className: 'text-sm text-gray-300',
                key: 'exp-rank-label'
              }, 'Configuration Rank:'),
              React.createElement('span', {
                className: 'text-sm font-bold text-purple-300',
                key: 'exp-rank-value'
              }, `${exponentialRank} / ${window.EXPONENTIAL_PARAMETERS ? window.EXPONENTIAL_PARAMETERS.length : 107}`)
            ]),
            React.createElement('input', {
              type: 'range',
              min: '1',
              max: `${window.EXPONENTIAL_PARAMETERS ? window.EXPONENTIAL_PARAMETERS.length : 107}`,
              step: '1',
              value: exponentialRank,
              onChange: handleExponentialRankChange,
              className: 'w-full',
              key: 'exp-rank-input'
            })
          ]),
          
          // Display current Exponential parameters
          (() => {
            const params = window.EXPONENTIAL_PARAMETERS ? window.EXPONENTIAL_PARAMETERS[exponentialRank - 1] : null;
            if (!params) return null;
            
            return React.createElement('div', {
              className: 'exp-details bg-gray-800 p-2 rounded text-xs',
              key: 'exp-details'
            }, [
              React.createElement('div', {
                className: 'grid grid-cols-1 gap-2 mb-2',
                key: 'exp-params-grid'
              }, [
                React.createElement('div', { key: 'param-alpha' }, [
                  React.createElement('span', { 
                    className: 'text-gray-400',
                    key: 'alpha-label'
                  }, 'Alpha (α): '),
                  React.createElement('span', { 
                    className: 'text-white font-mono',
                    key: 'alpha-value'
                  }, params.alpha.toFixed(6))
                ]),
                React.createElement('div', { key: 'param-smoothing' }, [
                  React.createElement('span', { 
                    className: 'text-gray-400',
                    key: 'smoothing-label'
                  }, 'Smoothing Factor: '),
                  React.createElement('span', { 
                    className: 'text-purple-300 font-mono',
                    key: 'smoothing-value'
                  }, (1 - params.alpha).toFixed(6))
                ])
              ]),
              React.createElement('div', {
                className: 'grid grid-cols-2 gap-2 pt-2 border-t border-gray-700',
                key: 'exp-metrics-grid'
              }, [
                React.createElement('div', { key: 'metric-variance' }, [
                  React.createElement('span', { 
                    className: 'text-gray-400',
                    key: 'variance-label'
                  }, 'Variance: '),
                  React.createElement('span', { 
                    className: 'text-green-400 font-mono',
                    key: 'variance-value'
                  }, params.meanVariance.toFixed(4))
                ]),
                React.createElement('div', { key: 'metric-latency' }, [
                  React.createElement('span', { 
                    className: 'text-gray-400',
                    key: 'latency-label'
                  }, 'Latency: '),
                  React.createElement('span', { 
                    className: 'text-blue-400 font-mono',
                    key: 'latency-value'
                  }, `${params.meanLatency.toFixed(2)} ms`)
                ])
              ])
            ]);
          })(),
          
          React.createElement('p', {
            className: 'text-xs text-gray-400 mt-2',
            key: 'exp-description'
          }, window.PERSONAL_OPTIMIZATION_DONE 
            ? 'Using YOUR personal Pareto front from parameter optimization. Lower ranks = more stable, higher ranks = faster response.'
            : 'Using default parameters. Run Parameter Optimization to get your personal Pareto front.')
        ]) : null
        
        /* COMMENTED OUT - Manual 1€ Filter Parameters
        // 1€ Filter Parameters
        React.createElement('div', {
          className: `filter-params mt-3 p-3 bg-gray-800 rounded ${useParetoFront ? 'opacity-50' : ''}`,
          key: 'one-euro-params'
        }, [
          // Manual mode status notice (hidden per professor's request)
          // Min Cutoff parameter
          React.createElement('div', {
            className: 'param-group mb-2',
            key: 'min-cutoff'
          }, [
            React.createElement('div', {
              className: 'flex justify-between mb-1',
              key: 'min-cutoff-label-row'
            }, [
              React.createElement('label', {
                className: 'text-sm text-gray-300',
                key: 'min-cutoff-label'
              }, 'Min Cutoff:'),
              React.createElement('span', {
                className: 'text-sm text-gray-300',
                key: 'min-cutoff-value'
              }, oneEuroParams.minCutoff.toFixed(3))
            ]),
            React.createElement('input', {
              type: 'range',
              min: '0',
              max: '5.0',
              step: '0.001',
              value: oneEuroParams.minCutoff,
              onChange: (e) => handleOneEuroParamChange('minCutoff', e),
              disabled: useParetoFront,
              className: 'w-full',
              key: 'min-cutoff-slider'
            })
          ]),
          
          // Beta parameter
          React.createElement('div', {
            className: 'param-group mb-2',
            key: 'beta'
          }, [
            React.createElement('div', {
              className: 'flex justify-between mb-1',
              key: 'beta-label-row'
            }, [
              React.createElement('label', {
                className: 'text-sm text-gray-300',
                key: 'beta-label'
              }, 'Beta:'),
              React.createElement('span', {
                className: 'text-sm text-gray-300',
                key: 'beta-value'
              }, oneEuroParams.beta.toFixed(5))
            ]),
            React.createElement('input', {
              type: 'range',
              min: '0',
              max: '0.01',
              step: '0.00001',
              value: oneEuroParams.beta,
              onChange: (e) => handleOneEuroParamChange('beta', e),
              disabled: useParetoFront,
              className: 'w-full',
              key: 'beta-slider'
            })
          ]),
          
          // dcutoff parameter (NEW, after beta)
          React.createElement('div', {
            className: 'param-group mb-2',
            key: 'dcutoff'
          }, [
            React.createElement('div', {
              className: 'flex justify-between mb-1',
              key: 'dcutoff-label-row'
            }, [
              React.createElement('label', {
                className: 'text-sm text-gray-300',
                key: 'dcutoff-label'
              }, 'dCutoff:'),
              React.createElement('span', {
                className: 'text-sm text-gray-300',
                key: 'dcutoff-value'
              }, oneEuroParams.dcutoff.toFixed(5))
            ]),
            React.createElement('input', {
              type: 'range',
              min: '0',
              max: '0.1',
              step: '0.00001',
              value: oneEuroParams.dcutoff,
              onChange: (e) => handleOneEuroParamChange('dcutoff', e),
              disabled: useParetoFront,
              className: 'w-full',
              key: 'dcutoff-slider'
            })
          ]),
          
          React.createElement('p', {
            className: 'text-xs text-gray-400 mt-2',
            key: 'one-euro-description'
          }, 'Lower Min Cutoff = more smoothing, Higher Beta = less lag during fast movements')
        ])
        END OF COMMENTED OUT SECTION */
    ]),
    
    // All Points Metrics Display (test mode only)
    React.createElement('div', { 
      className: 'metrics border-t border-gray-700 pt-4 mt-4',
      key: 'metrics',
      'data-control-type': 'metrics',
      style: isUserMode() ? { display: 'none' } : {}
    }, [
      React.createElement('p', { 
        key: 'all-points-title',
        className: 'text-gray-200 font-bold'
      }, 'All Points Metrics:'),
      React.createElement('p', { 
        key: 'rmse',
        className: 'text-gray-300 rmse-value'
      }, metrics ? `RMSE: ${metrics.rmse.toFixed(2)} px` : 'RMSE: Calculating...'),
      React.createElement('p', { 
        key: 'mean-error',
        className: 'text-gray-300 mean-error-value'
      }, metrics ? `Mean Error: ${metrics.meanError.toFixed(2)} px` : 'Mean Error: Calculating...'),
      React.createElement('p', { 
        key: 'max-error',
        className: 'text-gray-300 max-error-value'
      }, metrics ? `Max Error: ${metrics.maxError.toFixed(2)} px` : 'Max Error: Calculating...')
    ]),
    
    // End Points Metrics Display (test mode only)
    React.createElement('div', { 
      className: 'end-point-metrics border-t border-gray-700 pt-4 mt-4',
      key: 'end-point-metrics',
      'data-control-type': 'end-point-metrics',
      style: isUserMode() ? { display: 'none' } : {}
    }, [
      React.createElement('p', { 
        key: 'end-points-title',
        className: 'text-gray-200 font-bold'
      }, 'End Points Metrics:'),
      React.createElement('p', { 
        key: 'end-points-count',
        className: 'text-gray-300 end-points-count'
      }, endPointMetrics ? `Points: ${endPointMetrics.count}` : 'Points: N/A'),
      React.createElement('p', { 
        key: 'end-points-rmse',
        className: 'text-gray-300 end-points-rmse'
      }, endPointMetrics ? `RMSE: ${endPointMetrics.rmse.toFixed(2)} px` : 'RMSE: N/A'),
      React.createElement('p', { 
        key: 'end-points-mean-error',
        className: 'text-gray-300 end-points-mean-error'
      }, endPointMetrics ? `Mean Error: ${endPointMetrics.meanError.toFixed(2)} px` : 'Mean Error: N/A'),
      React.createElement('p', { 
        key: 'end-points-max-error',
        className: 'text-gray-300 end-points-max-error'
      }, endPointMetrics ? `Max Error: ${endPointMetrics.maxError.toFixed(2)} px` : 'Max Error: N/A')
    ]),
    
    // Experiments Section (only Pareto + Fitts shown)
    React.createElement('div', { 
      className: 'fitts-experiment border-t border-gray-700 pt-4 mt-4',
      key: 'fitts-experiment',
      'data-control-type': 'fitts-experiment'
    }, [
      React.createElement('p', { 
        key: 'experiment-title',
        className: 'text-gray-200 font-bold mb-2'
      }, 'Experiments:'),
      React.createElement('button', {
        onClick: () => {
          console.log('Starting Parameter Optimization...');
          if (!window.state.isTracking) {
            alert('Please ensure face tracking is active before starting!');
            return;
          }
          if (window.startParameterOptimization) {
            window.startParameterOptimization();
          } else if (window.ParameterOptimizer) {
            const optimizer = new window.ParameterOptimizer();
            optimizer.startDataCollection();
          } else {
            alert('Parameter optimization not loaded. Please refresh the page.');
          }
        },
        className: 'w-full px-4 py-2 bg-white hover:bg-gray-200 text-black rounded transition-colors mb-2',
        key: 'param-optimization-main-button'
      }, 'Pareto Optimization'),
      React.createElement('button', {
        onClick: () => {
          console.log('Starting Fitts\' Law Experiment...');
          if (window.fittsExperiment) {
            window.fittsExperiment.start();
          } else {
            console.error('Fitts experiment not loaded');
            alert('Experiment system not loaded. Please refresh the page.');
          }
        },
        className: 'w-full px-4 py-2 bg-white hover:bg-gray-200 text-black rounded transition-colors mb-2',
        key: 'experiment-button'
      }, 'Start Fitts\' Experiment'),
      // Test-mode-only experiment buttons
      isTestMode() && React.createElement('button', {
        onClick: () => {
          if (!window.state.isTracking) { alert('Please ensure face tracking is active!'); return; }
          if (window.modeComparisonExperiment) { window.modeComparisonExperiment.start(); }
          else { alert('Mode Comparison experiment not loaded. Please refresh.'); }
        },
        className: 'w-full px-4 py-2 bg-white hover:bg-gray-200 text-black rounded transition-colors mb-2',
        key: 'mode-comparison-button'
      }, 'Mode Comparison'),
      isTestMode() && React.createElement('button', {
        onClick: () => {
          if (!window.state.isTracking) { alert('Please ensure face tracking is active!'); return; }
          if (window.calibrationTestExperiment) { window.calibrationTestExperiment.start(); }
          else { alert('Calibration Test not loaded. Please refresh.'); }
        },
        className: 'w-full px-4 py-2 bg-white hover:bg-gray-200 text-black rounded transition-colors mb-2',
        key: 'calibration-test-button'
      }, 'Calibration Importance Test'),
      isTestMode() && React.createElement('button', {
        onClick: () => {
          if (!window.state.isTracking) { alert('Please ensure face tracking is active!'); return; }
          if (window.varianceFilterPilot) { window.varianceFilterPilot.start(); }
          else { alert('Variance Filter Pilot not loaded. Please refresh.'); }
        },
        className: 'w-full px-4 py-2 bg-white hover:bg-gray-200 text-black rounded transition-colors mb-2',
        key: 'variance-filter-pilot-button'
      }, 'Pilot: Variance x Filter'),
      isTestMode() && React.createElement('button', {
        onClick: () => {
          if (!window.state.isTracking) { alert('Please ensure face tracking is active!'); return; }
          if (window.calibrationComparePilot) { window.calibrationComparePilot.start(); }
          else { alert('Calibration Compare Pilot not loaded. Please refresh.'); }
        },
        className: 'w-full px-4 py-2 bg-white hover:bg-gray-200 text-black rounded transition-colors',
        key: 'calibration-compare-pilot-button'
      }, 'Pilot: Calibration Compare'),
    ]),
    
    // Professor's Tools Section (test mode only)
    React.createElement('div', { 
      className: 'professor-tools border-t border-gray-700 pt-4 mt-4',
      key: 'professor-tools',
      'data-control-type': 'professor-tools',
      style: isUserMode() ? { display: 'none' } : {}
    }, [
      React.createElement('p', { 
        key: 'professor-tools-title',
        className: 'text-gray-200 font-bold mb-2'
      }, '📊 Filter Analysis Tools:'),
      
      // Parameter Optimization Button
      React.createElement('button', {
        onClick: () => {
          console.log('🔍 Starting Parameter Optimization...');
          if (!window.state.isTracking) {
            alert('Please ensure face tracking is active before starting!');
            return;
          }
          if (window.startParameterOptimization) {
            window.startParameterOptimization();
          } else if (window.ParameterOptimizer) {
            const optimizer = new window.ParameterOptimizer();
            optimizer.startDataCollection();
          } else {
            alert('Parameter optimization not loaded. Please refresh the page.');
          }
        },
        className: 'w-full px-4 py-2 bg-white hover:bg-gray-200 text-black rounded transition-colors mb-2',
        key: 'param-optimization-button'
      }, '🎯 Parameter Optimization'),
      
      // Upload & Re-analyze saved raw data
      React.createElement('button', {
        onClick: () => {
          if (window.ParameterOptimizer) {
            const optimizer = new window.ParameterOptimizer();
            optimizer.loadRawTrialData();
          } else {
            alert('Parameter optimization not loaded. Please refresh the page.');
          }
        },
        className: 'w-full px-4 py-2 bg-white hover:bg-gray-200 text-black rounded transition-colors mb-2',
        key: 'upload-reanalyze-button'
      }, '📂 Upload & Re-analyze Raw Data'),
      
      // // Filter Equivalence Verification Button
      // React.createElement('button', {
      //   onClick: () => {
      //     console.log('📐 Opening Filter Equivalence Verification...');
      //     if (window.filterVerifier) {
      //       window.openFilterVerificationPanel();
      //     } else {
      //       alert('Filter verification tool not loaded. Please refresh the page.');
      //     }
      //   },
      //   className: 'w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors mb-2',
      //   key: 'filter-verification-button'
      // }, '📐 Filter Equivalence Check'),
      
      // Pareto Analysis Button - Opens the standalone viewer in a new tab
      React.createElement('button', {
        onClick: () => {
          console.log('📈 Opening Pareto Curve Viewer...');
          window.open('filter-comparison-viewer.html', '_blank');
        },
        className: 'w-full px-4 py-2 bg-white hover:bg-gray-200 text-black rounded transition-colors mb-2',
        key: 'pareto-analysis-button'
      }, '📈 Pareto Curve Analysis'),
      
      // Quick Info
      React.createElement('p', {
        className: 'text-xs text-gray-400 mt-2',
        key: 'professor-tools-info'
      }, 'Tools for verifying filter math and analyzing variance-latency trade-offs.')
    ]),
    
    /*
    // Parameter Optimization Section
    React.createElement('div', { 
      className: 'parameter-optimization border-t border-gray-700 pt-4 mt-4',
      key: 'parameter-optimization',
      'data-control-type': 'parameter-optimization'
    }, [
      React.createElement('p', { 
        key: 'optimization-title',
        className: 'text-gray-200 font-bold mb-2'
      }, 'Parameter Optimization:'),
      React.createElement('button', {
        onClick: () => {
          console.log('🔍 Checking parameter optimization availability...');
          console.log('window.startParameterOptimization:', typeof window.startParameterOptimization);
          console.log('window.ParameterOptimizer:', typeof window.ParameterOptimizer);
          
          if (window.startParameterOptimization) {
            console.log('✅ Starting parameter optimization...');
            window.startParameterOptimization();
          } else {
            console.error('❌ Parameter optimization not available');
            console.log('Available window properties related to parameter:', 
              Object.keys(window).filter(k => k.toLowerCase().includes('param')));
            
            // Try to manually load the function
            if (window.ParameterOptimizer) {
              console.log('🔧 Trying manual initialization...');
              try {
                const optimizer = new window.ParameterOptimizer();
                optimizer.startDataCollection();
              } catch (error) {
                console.error('Manual initialization failed:', error);
                alert('Parameter optimization failed to load. Please refresh the page and try again.');
              }
            } else {
              alert('Parameter optimization system not loaded. Please refresh the page and ensure all scripts load properly.');
            }
          }
        },
        className: 'w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors',
        key: 'optimization-button'
      }, 'Start Parameter Optimization')
    ]),
    */
    
    // Error Display
    error && React.createElement('div', { 
      className: 'error mt-4 p-2 bg-red-900/50 rounded text-red-400',
      key: 'error'
    }, error)
  ]);
};

// Make component globally available
window.TrackingControls = TrackingControls;

// Add a global function to update metrics from outside the component
window.updateTrackingControlsMetrics = null;

// Add this helper function to avoid direct DOM manipulation
window.updateTrackingControlsElements = function(metrics) {
  // Instead of directly manipulating DOM, use the React state update mechanism
  if (window.updateTrackingControlsMetrics) {
    window.updateTrackingControlsMetrics();
  } else {
    console.warn("updateTrackingControlsMetrics not initialized yet");
    
    // If the update function isn't available yet, store the metrics to be used when component initializes
    if (metrics) {
      console.log("Storing metrics for later use:", metrics);
      window.preCalculatedMetrics = metrics;
    }
  }
};