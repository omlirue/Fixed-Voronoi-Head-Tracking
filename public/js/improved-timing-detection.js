/**
 * Improved Timing Detection for Parameter Optimization
 * Addresses the challenge of detecting t_i,in accurately
 */

class ImprovedTimingDetector {
  constructor() {
    this.MOVEMENT_THRESHOLD = 10; // pixels - movement detection sensitivity
    // Professor Roberto: use screen-relative units instead of fixed pixels
    this.ARRIVAL_THRESHOLD = window.innerWidth * 0.025; // 2.5% of screen width (screen-relative)
    this.STABILITY_WINDOW = 500; // ms - time to confirm arrival (increased for better stability)
    this.VELOCITY_THRESHOLD = 5; // pixels/frame - minimum velocity to detect movement (increased sensitivity)
    this.MIN_MOVEMENT_TIME = 200; // ms - minimum time for realistic movement
  }

  /**
   * Improved data collection with automatic movement detection
   */
  async collectAtPositionWithMovementDetection(position) {
    const pixelX = position.x * window.innerWidth;
    const pixelY = position.y * window.innerHeight;

    // Move target to position
    this.target.style.left = `${pixelX}px`;
    this.target.style.top = `${pixelY}px`;

    // Collect continuous data and detect phases automatically
    const allData = [];
    const startTime = performance.now();
    
    return new Promise(resolve => {
      const dataInterval = setInterval(() => {
        if (window.state.lastLandmarks && window.state.lastHeadX !== null) {
          const currentTime = performance.now() - startTime;
          allData.push({
            time: currentTime,
            headX: window.state.lastHeadX,
            headY: window.state.lastHeadY,
            distanceToTarget: Math.sqrt(
              Math.pow(window.state.lastHeadX - pixelX, 2) + 
              Math.pow(window.state.lastHeadY - pixelY, 2)
            )
          });
        }
      }, 16); // 60fps

      // Stop after reasonable time (10 seconds max)
      setTimeout(() => {
        clearInterval(dataInterval);
        
        // Analyze the collected data to detect phases
        const phases = this.detectMovementPhases(allData, pixelX, pixelY);
        resolve({
          rawData: allData,
          phases: phases,
          targetX: pixelX,
          targetY: pixelY
        });
      }, 10000);
    });
  }

  /**
   * Detect movement phases automatically from collected data
   */
  detectMovementPhases(data, targetX, targetY) {
    if (data.length < 60) return null; // Need at least 1 second of data

    const phases = {
      movementStart: null,
      arrivalTime: null,
      stationaryPeriod: null
    };

    // 1. Detect movement start by looking for velocity increase
    const velocities = this.calculateVelocities(data);
    
    for (let i = 5; i < velocities.length - 5; i++) {
      const recentVelocity = velocities.slice(i-5, i+5).reduce((a,b) => a+b, 0) / 10;
      
      if (recentVelocity > this.VELOCITY_THRESHOLD) {
        phases.movementStart = data[i].time;
        break;
      }
    }

    // 2. Detect arrival by looking for proximity + stability
    phases.arrivalTime = this.detectArrivalTime(data, targetX, targetY);

    // 3. Find stationary period (after arrival)
    if (phases.arrivalTime !== null) {
      const arrivalIndex = data.findIndex(d => d.time >= phases.arrivalTime);
      const stationaryStart = arrivalIndex + Math.floor(this.STABILITY_WINDOW / 16); // Wait for stability
      
      if (stationaryStart < data.length - 60) { // Need at least 1 sec of stationary data
        phases.stationaryPeriod = {
          start: data[stationaryStart].time,
          end: data[data.length - 1].time,
          data: data.slice(stationaryStart)
        };
      }
    }

    return phases;
  }

  /**
   * Calculate velocities between consecutive frames
   */
  calculateVelocities(data) {
    const velocities = [0]; // First frame has no velocity
    
    for (let i = 1; i < data.length; i++) {
      const dx = data[i].headX - data[i-1].headX;
      const dy = data[i].headY - data[i-1].headY;
      const dt = (data[i].time - data[i-1].time) / 1000; // Convert to seconds
      
      const velocity = Math.sqrt(dx*dx + dy*dy) / (dt || 0.016); // pixels per second
      velocities.push(velocity);
    }
    
    return velocities;
  }

  /**
   * Detect when user arrives at target with improved stability check
   */
  detectArrivalTime(data, targetX, targetY) {
    // Look for first time when user gets close AND stays close
    const stabilityFrames = Math.floor(this.STABILITY_WINDOW / 16); // Convert ms to frames
    const minStartIndex = Math.floor(this.MIN_MOVEMENT_TIME / 16); // Skip early unrealistic times
    
    for (let i = minStartIndex; i < data.length - stabilityFrames; i++) {
      const distance = Math.sqrt(
        Math.pow(data[i].headX - targetX, 2) + 
        Math.pow(data[i].headY - targetY, 2)
      );
      
      if (distance < this.ARRIVAL_THRESHOLD) {
        // Check if user stays close for the stability window
        let staysClose = true;
        let avgDistance = 0;
        let checkCount = 0;
        
        for (let j = i; j < i + stabilityFrames && j < data.length; j++) {
          const checkDistance = Math.sqrt(
            Math.pow(data[j].headX - targetX, 2) + 
            Math.pow(data[j].headY - targetY, 2)
          );
          avgDistance += checkDistance;
          checkCount++;
          
          if (checkDistance > this.ARRIVAL_THRESHOLD * 1.3) { // Allow some variance
            staysClose = false;
            break;
          }
        }
        
        // Require both staying close AND average distance being reasonable
        avgDistance /= checkCount;
        if (staysClose && avgDistance < this.ARRIVAL_THRESHOLD * 0.8) {
          console.log(`Arrival detected at ${data[i].time}ms, avg distance: ${avgDistance.toFixed(1)}px`);
          return data[i].time; // This is t_i,in
        }
      }
    }
    
    console.warn(`No arrival detected for target (${targetX}, ${targetY}), closest approach: ${this.findClosestApproach(data, targetX, targetY).toFixed(1)}px`);
    return null;
  }

  /**
   * Helper to find closest approach distance for debugging
   */
  findClosestApproach(data, targetX, targetY) {
    let minDistance = Infinity;
    for (const sample of data) {
      const distance = Math.sqrt(
        Math.pow(sample.headX - targetX, 2) + 
        Math.pow(sample.headY - targetY, 2)
      );
      if (distance < minDistance) {
        minDistance = distance;
      }
    }
    return minDistance;
  }

  /**
   * Improved latency calculation using detected movement phases
   */
  calculateLatencyWithPhases(phases, filteredData, targetX, targetY) {
    if (!phases.arrivalTime) return Infinity;

    // Find when filtered signal reaches target after the original arrival
    const originalArrival = phases.arrivalTime;
    
    // Look for filtered signal arrival starting from original arrival time
    const arrivalIndex = filteredData.findIndex(d => d.time >= originalArrival);
    
    for (let i = arrivalIndex; i < filteredData.length; i++) {
      const distance = Math.sqrt(
        Math.pow(filteredData[i].filteredX - targetX, 2) + 
        Math.pow(filteredData[i].filteredY - targetY, 2)
      );
      
      if (distance < this.ARRIVAL_THRESHOLD) {
        const filteredArrival = filteredData[i].time; // t_i,in,meas
        return Math.max(0, filteredArrival - originalArrival); // Roberto's formula
      }
    }
    
    return Infinity; // Filtered signal never arrived
  }

  /**
   * Calculate variance using only the confirmed stationary period
   */
  calculateVarianceFromStationaryPeriod(phases, filteredData) {
    if (!phases.stationaryPeriod) return Infinity;

    // Filter data to only include stationary period
    const stationaryFiltered = filteredData.filter(d => 
      d.time >= phases.stationaryPeriod.start && 
      d.time <= phases.stationaryPeriod.end
    );

    if (stationaryFiltered.length === 0) return Infinity;

    // Calculate variance
    const xValues = stationaryFiltered.map(d => d.filteredX);
    const yValues = stationaryFiltered.map(d => d.filteredY);

    const xMean = xValues.reduce((a, b) => a + b, 0) / xValues.length;
    const yMean = yValues.reduce((a, b) => a + b, 0) / yValues.length;

    const xVariance = xValues.reduce((sum, x) => sum + Math.pow(x - xMean, 2), 0) / xValues.length;
    const yVariance = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0) / yValues.length;

    return Math.sqrt(xVariance + yVariance);
  }
}

// Export for use in main optimization system
window.ImprovedTimingDetector = ImprovedTimingDetector;
