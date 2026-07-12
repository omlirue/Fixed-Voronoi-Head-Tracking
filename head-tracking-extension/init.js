document.addEventListener('DOMContentLoaded', () => {
  const configButton = document.getElementById('config-button');
  if (configButton) {
    configButton.addEventListener('click', () => {
      if (window.startCalibration) {
        window.startCalibration();
      }
    });
  }
  
  if (window.initialize) {
    window.initialize().catch(console.error);
  }
}); 