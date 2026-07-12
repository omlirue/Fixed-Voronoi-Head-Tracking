document.addEventListener('DOMContentLoaded', () => {
  // Safe initialization pattern
  const init = async () => {
    try {
      if (typeof initialize === 'function') {
        await initialize();
      }
      
      if (typeof initApp === 'function') {
        initApp();
      }

      // Setup event listeners
      const configButton = document.getElementById('config-button');
      if (configButton) {
        configButton.addEventListener('click', () => {
          if (typeof startCalibration === 'function') {
            startCalibration();
          }
        });
      }
    } catch (error) {
      console.error('Initialization error:', error);
    }
  };

  // Start initialization
  init();
}); 