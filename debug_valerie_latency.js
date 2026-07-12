const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;

const zipPath = "pilot data 2/pilot data -2 - latency /Valerie/P20_pareto-optimization-2026-06-16T16-35-09-260Z.zip";
const tmpDir = "/tmp/valerie_debug";

if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

execSync(`unzip -o "${zipPath}" raw-data/position-0-Top-Left.json -d "${tmpDir}"`);

const posData = JSON.parse(fs.readFileSync(path.join(tmpDir, 'raw-data', 'position-0-Top-Left.json'), 'utf8'));

// Re-implement velocity threshold latency calculation with detailed logging
function debugLatency(timingData, headPositions, alpha) {
  if (!timingData || !timingData.t_i_wait_end) return { error: 'no t_i_wait_end' };
  if (headPositions.length < 30) return { error: 'too few headPositions' };

  const tClick = timingData.t_i_click || timingData.variancePeriodStart;
  const tWaitEnd = timingData.t_i_wait_end;

  const allData = headPositions.filter(d => d.time >= tClick);
  if (allData.length < 30) return { error: 'too few allData' };

  const movementData = allData.filter(d => d.time >= tWaitEnd);
  if (movementData.length < 10) return { error: 'too few movementData' };

  // Apply exponential filter to get filtered coordinates
  let prevX = allData[0].headX;
  let prevY = allData[0].headY;
  const filteredData = allData.map(d => {
    prevX = prevX + alpha * (d.headX - prevX);
    prevY = prevY + alpha * (d.headY - prevY);
    return {
      time: d.time,
      originalX: d.headX,
      originalY: d.headY,
      filteredX: prevX,
      filteredY: prevY
    };
  });

  const STEP = 1; // ms
  const tMin = filteredData[0].time;
  const tMax = filteredData[filteredData.length - 1].time;
  const gridLen = Math.floor((tMax - tMin) / STEP) + 1;

  const rawXGrid  = new Float64Array(gridLen);
  const rawYGrid  = new Float64Array(gridLen);
  const filtXGrid = new Float64Array(gridLen);
  const filtYGrid = new Float64Array(gridLen);

  let j = 0;
  for (let g = 0; g < gridLen; g++) {
    const t = tMin + g * STEP;
    while (j < filteredData.length - 2 && filteredData[j + 1].time < t) j++;
    const d0 = filteredData[j], d1 = filteredData[Math.min(j + 1, filteredData.length - 1)];
    const dt = d1.time - d0.time;
    const frac = dt > 0 ? Math.min(1, Math.max(0, (t - d0.time) / dt)) : 0;

    rawXGrid[g]  = d0.originalX + frac * (d1.originalX - d0.originalX);
    rawYGrid[g]  = d0.originalY + frac * (d1.originalY - d0.originalY);
    filtXGrid[g] = d0.filteredX + frac * (d1.filteredX - d0.filteredX);
    filtYGrid[g] = d0.filteredY + frac * (d1.filteredY - d0.filteredY);
  }

  const rawVelRaw  = new Float64Array(gridLen);
  const filtVelRaw = new Float64Array(gridLen);
  for (let i = 1; i < gridLen; i++) {
    const rdx = rawXGrid[i] - rawXGrid[i - 1];
    const rdy = rawYGrid[i] - rawYGrid[i - 1];
    rawVelRaw[i] = Math.sqrt(rdx * rdx + rdy * rdy) / STEP;

    const fdx = filtXGrid[i] - filtXGrid[i - 1];
    const fdy = filtYGrid[i] - filtYGrid[i - 1];
    filtVelRaw[i] = Math.sqrt(fdx * fdx + fdy * fdy) / STEP;
  }
  rawVelRaw[0] = rawVelRaw[1] || 0;
  filtVelRaw[0] = filtVelRaw[1] || 0;

  const VEL_SMOOTH_WINDOW = 50; // ms
  const half = Math.floor(VEL_SMOOTH_WINDOW / 2);

  const smoothVel = (src) => {
    const out = new Float64Array(gridLen);
    let windowSum = 0;
    const initEnd = Math.min(half + 1, gridLen);
    for (let k = 0; k < initEnd; k++) windowSum += src[k];
    out[0] = windowSum / initEnd;

    for (let i = 1; i < gridLen; i++) {
      const addIdx = i + half;
      const remIdx = i - half - 1;
      if (addIdx < gridLen) windowSum += src[addIdx];
      if (remIdx >= 0) windowSum -= src[remIdx];
      const lo = Math.max(0, i - half);
      const hi = Math.min(gridLen - 1, i + half);
      out[i] = windowSum / (hi - lo + 1);
    }
    return out;
  };

  const rawVel  = smoothVel(rawVelRaw);
  const filtVel = smoothVel(filtVelRaw);

  const stationaryEnd = Math.floor((tWaitEnd - tMin) / STEP);
  const stationaryStart = Math.floor(stationaryEnd * 0.2);
  const nStat = stationaryEnd - stationaryStart;

  let rawVelSum = 0, rawVelSqSum = 0;
  let filtVelSum = 0, filtVelSqSum = 0;
  for (let i = stationaryStart; i < stationaryEnd; i++) {
    rawVelSum   += rawVel[i];
    rawVelSqSum += rawVel[i] * rawVel[i];
    filtVelSum   += filtVel[i];
    filtVelSqSum += filtVel[i] * filtVel[i];
  }
  const rawVelMean  = rawVelSum / nStat;
  const filtVelMean = filtVelSum / nStat;
  const rawSigma  = Math.sqrt(Math.max(0, rawVelSqSum / nStat - rawVelMean * rawVelMean));
  const filtSigma = Math.sqrt(Math.max(0, filtVelSqSum / nStat - filtVelMean * filtVelMean));

  const SIGMA_MULT = 4;
  const rawThreshold  = rawVelMean + SIGMA_MULT * Math.max(rawSigma, 0.0001);
  const filtThreshold = filtVelMean + SIGMA_MULT * Math.max(filtSigma, 0.0001);

  const moveStart = stationaryEnd;
  let rawPeakVal = 0;
  let rawPeakIdx = moveStart;
  for (let i = moveStart; i < gridLen; i++) {
    if (rawVel[i] > rawPeakVal) { rawPeakVal = rawVel[i]; rawPeakIdx = i; }
  }

  let filtPeakVal = 0;
  for (let i = moveStart; i < gridLen; i++) {
    if (filtVel[i] > filtPeakVal) filtPeakVal = filtVel[i];
  }

  const findLastCrossing = (vel, threshold, startIdx) => {
    let lastAbove = -1;
    for (let i = gridLen - 1; i >= startIdx; i--) {
      if (vel[i] >= threshold) {
        lastAbove = i;
        break;
      }
    }
    if (lastAbove < 0) return null;
    if (lastAbove >= gridLen - 1) return tMin + (gridLen - 1) * STEP;

    const vAbove = vel[lastAbove];
    const vBelow = vel[lastAbove + 1];
    const dv = vAbove - vBelow;
    const interpFrac = dv > 0 ? (vAbove - threshold) / dv : 0;
    return tMin + (lastAbove + interpFrac) * STEP;
  };

  const tStoppedRaw  = findLastCrossing(rawVel, rawThreshold, rawPeakIdx);
  const tStoppedFilt = findLastCrossing(filtVel, filtThreshold, moveStart);

  return {
    tMin, tMax, gridLen,
    stationaryEnd,
    rawVelMean, rawSigma, rawThreshold, rawPeakVal, tStoppedRaw,
    filtVelMean, filtSigma, filtThreshold, filtPeakVal, tStoppedFilt,
    latency: tStoppedRaw !== null && tStoppedFilt !== null ? Math.max(0, tStoppedFilt - tStoppedRaw) : Infinity
  };
}

console.log("=== Debugging Valerie's Latency for alpha = 0.01 ===");
console.log(debugLatency(posData.timingData, posData.headPositions, 0.01));

console.log("\n=== Debugging Valerie's Latency for alpha = 0.5 ===");
console.log(debugLatency(posData.timingData, posData.headPositions, 0.5));
