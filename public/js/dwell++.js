const DWELL_TIME_MS = 700;
const GRACE_PERIOD_MS = 500;

let dwellTargetIndex = null;
let dwellAccumulatedMs = 0;
let segmentStartTime = null;
let awayStartTime = null;

function resetDwellProgress() {
  dwellTargetIndex = null;
  dwellAccumulatedMs = 0;
  segmentStartTime = null;
  awayStartTime = null;
}

function startNewCandidate(rawIndex, now) {
  dwellTargetIndex = rawIndex;
  dwellAccumulatedMs = 0;
  segmentStartTime = now;
  awayStartTime = null;
}

// For a future progress-ring indicator: returns which region is being
// dwelled on and how far along (0-1) it is toward selection.
function getDwellProgress() {
  if (dwellTargetIndex === null) return { targetIndex: null, progress: 0 };
  const now = performance.now();
  const running = segmentStartTime !== null ? (now - segmentStartTime) : 0;
  const total = dwellAccumulatedMs + running;
  return {
    targetIndex: dwellTargetIndex,
    progress: Math.min(1, total / DWELL_TIME_MS)
  };
}

// function checkDwellState() {
//   if (!window.isStarted) { resetDwellProgress(); return; }

//   const now = performance.now();
//   const rawIndex = window.activeIndex;

//   if (rawIndex == null || rawIndex === -1) {
//     if (dwellTargetIndex === null) return;
//     if (segmentStartTime !== null) {
//       dwellAccumulatedMs += now - segmentStartTime;
//       segmentStartTime = null;
//     }
//     if (awayStartTime === null) awayStartTime = now;
//     if (now - awayStartTime >= GRACE_PERIOD_MS) resetDwellProgress();
//     return;
//   }

//   if (dwellTargetIndex === null) {
//     startNewCandidate(rawIndex, now);
//     return;
//   }

//   if (rawIndex === dwellTargetIndex) {
//     if (segmentStartTime === null) segmentStartTime = now;
//     awayStartTime = null;

//     const totalElapsed = dwellAccumulatedMs + (now - segmentStartTime);
//     if (totalElapsed >= DWELL_TIME_MS) {
//       resetDwellProgress();
//       if (window.attemptAcquisition) window.attemptAcquisition();
//     }
//   } else {
//     if (segmentStartTime !== null) {
//       dwellAccumulatedMs += now - segmentStartTime;
//       segmentStartTime = null;
//     }
//     if (awayStartTime === null) awayStartTime = now;

//     if (now - awayStartTime >= GRACE_PERIOD_MS) {
//       startNewCandidate(rawIndex, now);
//     }
//   }
// }

// TEMPORARY — verbose logging to diagnose the reset. Remove once fixed.
function checkDwellState() {
  if (!window.isStarted) { resetDwellProgress(); return; }

  const now = performance.now();
  const rawIndex = window.activeIndex;

  if (rawIndex == null || rawIndex === -1) {
    if (dwellTargetIndex === null) return;
    if (segmentStartTime !== null) {
      dwellAccumulatedMs += now - segmentStartTime;
      segmentStartTime = null;
    }
    if (awayStartTime === null) awayStartTime = now;
    if (now - awayStartTime >= GRACE_PERIOD_MS) {
      console.log(`[dwell] RESET (no valid region, away ${(now - awayStartTime).toFixed(0)}ms) — had ${dwellAccumulatedMs.toFixed(0)}ms banked on target ${dwellTargetIndex}`);
      resetDwellProgress();
    }
    return;
  }

  if (dwellTargetIndex === null) {
    console.log(`[dwell] NEW candidate: region ${rawIndex}`);
    startNewCandidate(rawIndex, now);
    return;
  }

  if (rawIndex === dwellTargetIndex) {
    if (segmentStartTime === null) {
      console.log(`[dwell] RESUME region ${rawIndex}, had ${dwellAccumulatedMs.toFixed(0)}ms banked`);
      segmentStartTime = now;
    }
    awayStartTime = null;

    const totalElapsed = dwellAccumulatedMs + (now - segmentStartTime);
    if (totalElapsed >= DWELL_TIME_MS) {
      console.log(`[dwell] ✅ SELECT region ${rawIndex} at ${totalElapsed.toFixed(0)}ms`);
      resetDwellProgress();
      if (window.attemptAcquisition) window.attemptAcquisition();
    }
  } else {
    if (segmentStartTime !== null) {
      dwellAccumulatedMs += now - segmentStartTime;
      segmentStartTime = null;
    }
    if (awayStartTime === null) {
      console.log(`[dwell] LEFT target ${dwellTargetIndex} for ${rawIndex}, banked ${dwellAccumulatedMs.toFixed(0)}ms, grace clock started`);
      awayStartTime = now;
    }

    if (now - awayStartTime >= GRACE_PERIOD_MS) {
      console.log(`[dwell] RESET (grace expired, away ${(now - awayStartTime).toFixed(0)}ms on region ${rawIndex}) — lost ${dwellAccumulatedMs.toFixed(0)}ms that was banked on ${dwellTargetIndex}`);
      startNewCandidate(rawIndex, now);
    }
  }
}

window.checkDwellState = checkDwellState;
window.resetDwellProgress = resetDwellProgress;
window.getDwellProgress = getDwellProgress;