const TrackingControls = () => {
  // Use pre-calculated metrics if available
  const [metrics, setMetrics] = React.useState(() => {
    if (window.preCalculatedMetrics) {
      console.log("Using pre-calculated metrics:", window.preCalculatedMetrics);
      return window.preCalculatedMetrics;
    }
    return null;
  });
 
  const [error, setError] = React.useState(null);
 
  // State for showing/hiding the video preview
  const [showVideoPreview, setShowVideoPreview] = React.useState(false);
 
  // Effect to show/hide video preview canvas
  React.useEffect(() => {
    const canvas = document.getElementById('face-canvas');
    if (canvas) {
      canvas.style.display = showVideoPreview ? 'block' : 'none';
    }
  }, [showVideoPreview]);
 
  // Effect to initialize metrics if not already set
  React.useEffect(() => {
    // If we already have metrics from pre-calculation, no need to calculate again
    if (metrics) {
      console.log("Already have metrics, skipping calculation");
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
 
    // Update the window.updateTrackingControlsMetrics function
    window.updateTrackingControlsMetrics = () => {
      try {
        const analysis = window.calculateCalibrationResiduals();
        if (analysis) {
          setMetrics(analysis);
          console.log("Metrics updated via external call:", analysis);
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
 
    // Experiments Section
    React.createElement('div', {
      className: 'region-experiment border-t border-gray-700 pt-4 mt-4',
      key: 'region-experiment',
      'data-control-type': 'region-experiment'
    }, [
      React.createElement('p', {
        key: 'experiment-title',
        className: 'text-gray-200 font-bold mb-2'
      }, 'Experiments:'),
      React.createElement('button', {
        onClick: () => {
          if (!window.state.isTracking) { alert('Please ensure face tracking is active!'); return; }
          if (window.regionSelectionExperiment) { window.regionSelectionExperiment.start(); }
          else { alert('Region selection experiment not loaded.'); }
        },
        className: 'w-full px-4 py-2 bg-white hover:bg-gray-200 text-black rounded transition-colors mb-2',
        key: 'region-experiment-button'
      }, 'Start Region Selection Experiment')
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
 