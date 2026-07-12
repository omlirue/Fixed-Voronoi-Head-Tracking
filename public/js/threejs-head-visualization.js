// threejs-head-visualization.js - 3D Head Visualization using Three.js
// This provides visual feedback for head rotation (yaw, pitch, roll) similar to Timothy's implementation

class ThreeJSHeadVisualization {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.head = null;
    this.container = null;
    this.animationFrameId = null;
    this.isActive = false;
    
    // Target angles (what we want to rotate to)
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.targetRoll = 0;
    
    // Current angles (smoothly interpolated)
    this.currentYaw = 0;
    this.currentPitch = 0;
    this.currentRoll = 0;
    
    // Smoothing factor (0 = no smoothing, 1 = instant)
    this.smoothingFactor = 0.15;
  }
  
  init() {
    console.log('🎨 Initializing Three.js Head Visualization...');
    
    // Get container
    this.container = document.getElementById('threejs-head-container');
    if (!this.container) {
      console.error('❌ Three.js container not found');
      return false;
    }
    
    // Set container styles
    this.container.style.position = 'fixed';
    this.container.style.bottom = '20px';
    this.container.style.right = '20px';
    this.container.style.width = '200px';
    this.container.style.height = '200px';
    this.container.style.zIndex = '900';
    this.container.style.border = '2px solid rgba(255, 255, 255, 0.3)';
    this.container.style.borderRadius = '10px';
    this.container.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    this.container.style.overflow = 'hidden';
    
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);
    
    // Create camera
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    this.camera.position.z = 3;
    
    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(200, 200);
    this.container.appendChild(this.renderer.domElement);
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    this.scene.add(directionalLight);
    
    // Create a simple head model (sphere with facial features)
    this.createHeadModel();
    
    // Add axis helper for debugging (optional)
    // const axesHelper = new THREE.AxesHelper(2);
    // this.scene.add(axesHelper);
    
    console.log('✅ Three.js Head Visualization initialized');
    return true;
  }
  
  createHeadModel() {
    // Create head group
    this.head = new THREE.Group();
    
    // Head (sphere)
    const headGeometry = new THREE.SphereGeometry(1, 32, 32);
    const headMaterial = new THREE.MeshPhongMaterial({ 
      color: 0xffdbac,
      shininess: 30
    });
    const headMesh = new THREE.Mesh(headGeometry, headMaterial);
    this.head.add(headMesh);
    
    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.1, 16, 16);
    const eyeMaterial = new THREE.MeshPhongMaterial({ color: 0x000000 });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.3, 0.2, 0.85);
    this.head.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.3, 0.2, 0.85);
    this.head.add(rightEye);
    
    // Nose (small cone)
    const noseGeometry = new THREE.ConeGeometry(0.1, 0.3, 8);
    const noseMaterial = new THREE.MeshPhongMaterial({ color: 0xffdbac });
    const nose = new THREE.Mesh(noseGeometry, noseMaterial);
    nose.position.set(0, -0.1, 0.9);
    nose.rotation.x = Math.PI / 2;
    this.head.add(nose);
    
    // Mouth (torus/line)
    const mouthGeometry = new THREE.TorusGeometry(0.2, 0.03, 8, 16, Math.PI);
    const mouthMaterial = new THREE.MeshPhongMaterial({ color: 0x000000 });
    const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
    mouth.position.set(0, -0.4, 0.85);
    mouth.rotation.x = Math.PI;
    this.head.add(mouth);
    
    // Ears
    const earGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const earMaterial = new THREE.MeshPhongMaterial({ color: 0xffdbac });
    
    const leftEar = new THREE.Mesh(earGeometry, earMaterial);
    leftEar.position.set(-0.9, 0, 0.2);
    leftEar.scale.set(0.5, 1, 0.3);
    this.head.add(leftEar);
    
    const rightEar = new THREE.Mesh(earGeometry, earMaterial);
    rightEar.position.set(0.9, 0, 0.2);
    rightEar.scale.set(0.5, 1, 0.3);
    this.head.add(rightEar);
    
    // Add to scene
    this.scene.add(this.head);
  }
  
  updateAngles(angles) {
    if (!angles) {
      return;
    }
    
    if (!this.isActive) {
      return;
    }
    
    // Update target angles (in degrees, convert to radians for Three.js)
    this.targetYaw = angles.yaw || 0;
    this.targetPitch = angles.pitch || 0;
    this.targetRoll = angles.roll || 0;
    
    // Debug: Log angle updates (throttled to avoid spam)
    if (!this._lastLogTime || Date.now() - this._lastLogTime > 1000) {
      console.log('🎨 Three.js head updating:', {
        yaw: this.targetYaw.toFixed(1),
        pitch: this.targetPitch.toFixed(1),
        roll: this.targetRoll.toFixed(1),
        isActive: this.isActive
      });
      this._lastLogTime = Date.now();
    }
  }
  
  animate() {
    if (!this.isActive) return;
    
    // Smooth interpolation towards target angles (exponential smoothing)
    this.currentYaw += (this.targetYaw - this.currentYaw) * this.smoothingFactor;
    this.currentPitch += (this.targetPitch - this.currentPitch) * this.smoothingFactor;
    this.currentRoll += (this.targetRoll - this.currentRoll) * this.smoothingFactor;
    
    // Apply rotation to head (Z-Y-X order to match our Euler calculation)
    // Convert degrees to radians
    const DEG2RAD = Math.PI / 180;
    
    // Reset rotation
    this.head.rotation.set(0, 0, 0);
    
    // Apply rotations in Z-Y-X order (yaw, pitch, roll)
    // Note: Three.js uses Y-up coordinate system, so we need to adjust
    this.head.rotation.y = this.currentYaw * DEG2RAD;      // Yaw (rotate around Y-axis)
    this.head.rotation.x = -this.currentPitch * DEG2RAD;   // Pitch (rotate around X-axis, inverted)
    this.head.rotation.z = -this.currentRoll * DEG2RAD;    // Roll (rotate around Z-axis, inverted)
    
    // Render scene
    this.renderer.render(this.scene, this.camera);
    
    // Continue animation loop
    this.animationFrameId = requestAnimationFrame(() => this.animate());
  }
  
  show() {
  }
  
  hide() {
    if (this.container) {
      this.container.style.display = 'none';
      this.isActive = false;
      
      // Stop animation loop
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      
      console.log('👁️ Three.js Head Visualization hidden');
    }
  }
  
  reset() {
    // Reset angles
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.targetRoll = 0;
    this.currentYaw = 0;
    this.currentPitch = 0;
    this.currentRoll = 0;
    
    // Reset head rotation
    if (this.head) {
      this.head.rotation.set(0, 0, 0);
    }
  }
  
  destroy() {
    this.hide();
    
    // Clean up Three.js resources
    if (this.renderer) {
      this.renderer.dispose();
      if (this.container && this.renderer.domElement) {
        this.container.removeChild(this.renderer.domElement);
      }
    }
    
    if (this.scene) {
      // Dispose geometries and materials
      this.scene.traverse((object) => {
        if (object.geometry) {
          object.geometry.dispose();
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    }
    
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.head = null;
    
    console.log('🗑️ Three.js Head Visualization destroyed');
  }
  
  // Test function - manually rotate the head
  test() {
    console.log('🧪 Testing Three.js head with manual rotation...');
    this.show();
    let angle = 0;
    const testInterval = setInterval(() => {
      angle += 5;
      this.updateAngles({
        yaw: Math.sin(angle * Math.PI / 180) * 30,
        pitch: Math.cos(angle * Math.PI / 180) * 20,
        roll: Math.sin(angle * Math.PI / 180 * 0.5) * 15
      });
      if (angle > 360) {
        clearInterval(testInterval);
        console.log('🧪 Test complete');
      }
    }, 50);
  }
}

// Create global instance
window.threeJSHeadViz = new ThreeJSHeadVisualization();

// Initialize when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  console.log('🎨 Three.js Head Viz: DOMContentLoaded event fired');
  console.log('🎨 Three.js available:', typeof THREE !== 'undefined');
  console.log('🎨 Container exists:', !!document.getElementById('threejs-head-container'));
  
  if (typeof THREE !== 'undefined') {
    const success = window.threeJSHeadViz.init();
    if (success) {
      console.log('✅ Three.js Head Visualization ready!');
    } else {
      console.error('❌ Three.js Head Visualization initialization failed');
    }
  } else {
    console.error('❌ Three.js not loaded - check if CDN script loaded');
  }
});

// Also try to initialize after a delay as a fallback
setTimeout(() => {
  if (!window.threeJSHeadViz.scene && typeof THREE !== 'undefined') {
    console.log('🎨 Late initialization attempt...');
    window.threeJSHeadViz.init();
  }
}, 2000);

