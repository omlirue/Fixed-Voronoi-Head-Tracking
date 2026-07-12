const TrackingControls = () => {
  // Initialize state from window.state.config
  const [landmarks, setLandmarks] = React.useState(() => 
    window.state?.config?.landmarkPoints || "3"
  );
  
  const [filterType, setFilterType] = React.useState(() => 
    window.state?.config?.filterType || "exponential"
  );
  
  const [metrics, setMetrics] = React.useState(null);
  const [error, setError] = React.useState(null);

  // Effect to initialize metrics
  React.useEffect(() => {
    try {
      if (window.state.transformationMatrices) {
        const analysis = window.calculateCalibrationResiduals();
        setMetrics(analysis);
        console.log("Initial metrics calculated:", analysis);
      }
    } catch (err) {
      console.error("Error in initial metrics calculation:", err);
      setError("Failed to calculate initial metrics");
    }
  }, []);

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

      // Update metrics with new configuration
      const analysis = window.calculateCalibrationResiduals();
      setMetrics(analysis);
      
      // Update component state
      setLandmarks(newValue);
      setError(null);

      // Force re-render of buttons
      const buttons = document.querySelectorAll('.button-group button');
      buttons.forEach(button => {
        button.classList.remove('active-button');
        if (button.textContent.includes(newValue)) {
          button.classList.add('active-button');
        }
      });

      console.log("Successfully switched to", newValue, "landmarks");
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
        window.initializeFilters();
      }
      
      setFilterType(newValue);
      setError(null);

      // Force re-render of buttons
      const buttons = document.querySelectorAll('.filter-buttons button');
      buttons.forEach(button => {
        button.classList.remove('active-filter');
        if (button.textContent.includes(newValue)) {
          button.classList.add('active-filter');
        }
      });
      
      const status = document.getElementById("status");
      if (status) {
        status.textContent = `Filter: ${newValue}`;
      }

    } catch (err) {
      console.error("Error switching filter:", err);
      setError(`Failed to switch filter: ${err.message}`);
    }
  }, [filterType]);

  return React.createElement('div', {
    className: 'tracking-controls'
  }, [
    // Title
    React.createElement('h3', { 
      key: 'title',
      className: 'text-lg font-bold text-green-500 mb-4'
    }, 'Tracking Controls'),
    
    // Landmark Controls with updated styling
    React.createElement('div', { 
      className: 'control-group mb-4',
      key: 'landmark-control'
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
            landmarks === "3" ? 'active-button bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'
          }`,
          key: '3-points'
        }, '3 Points'),
        React.createElement('button', {
          onClick: () => handleLandmarkChange("6"),
          className: `flex-1 px-3 py-2 rounded transition-colors ${
            landmarks === "6" ? 'active-button bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'
          }`,
          key: '6-points'
        }, '6 Points')
      ])
    ]),
    
    // Filter Controls with updated styling
    React.createElement('div', { 
      className: 'control-group mb-4',
      key: 'filter-control'
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
      ])
    ]),
    
    // Metrics Display
    metrics && React.createElement('div', { 
      className: 'metrics border-t border-gray-700 pt-4 mt-4',
      key: 'metrics'
    }, [
      React.createElement('p', { 
        key: 'rmse',
        className: 'text-gray-300'
      }, `RMSE: ${metrics.rmse.toFixed(2)} px`),
      React.createElement('p', { 
        key: 'mean-error',
        className: 'text-gray-300'
      }, `Mean Error: ${metrics.meanError.toFixed(2)} px`),
      React.createElement('p', { 
        key: 'max-error',
        className: 'text-gray-300'
      }, `Max Error: ${metrics.maxError.toFixed(2)} px`)
    ]),
    
    // Error Display
    error && React.createElement('div', { 
      className: 'error mt-4 p-2 bg-red-900/50 rounded text-red-400',
      key: 'error'
    }, error)
  ]);
};

// Make component globally available
window.TrackingControls = TrackingControls;