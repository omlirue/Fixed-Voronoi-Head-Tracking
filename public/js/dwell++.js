const DWELL_TIME_MS = 1000;
const WRONG_REGION_DWELL_TIME_MS = 300; // flat, non-smoothed dwell time for a region that isn't the current target
const GRACE_PERIOD_MS = 700;   // how long the target stays "live" (and glowing) after gaze leaves it
const TIMER_CONTINUE_MS = 500; // look-aways shorter than this don't even pause the dwell timer

let dwellTargetIndex = null;
let dwellAccumulatedMs = 0;
let segmentStartTime = null;
let awayStartTime = null;

// Per-candidacy jitter counters, surfaced in window.lastDwellStats when a
// selection fires so dataCollection.js can log them alongside that row.
let candidateReentries = 0;
let candidateGraceSaves = 0;

let lastConfirmedIndex = null;

// Per-trial "time spent outside the designated target region," in ms.
// Independent of the dwell-candidate machinery above and the border-flicker
// smoothing below (reads the raw, unsmoothed signal) — resets only when the
// actual target index changes (a new trial begins), so repeated wrong-cell
// attempts within the same trial keep accumulating instead of resetting.
let outsideRegionMs = 0;
let outsideRegionTargetIndex = null;
let outsideRegionLastFrameTime = null;

// When tracking drops out entirely (no valid region), the dwell-candidate
// clocks freeze rather than run — see the freeze/shift logic in
// checkDwellState(). Set for the duration of the current dropout, null
// otherwise.
let trackingLostSince = null;

// Without this, whatever cell the participant's head happens to be over the instant a round startsb again
let hasEnteredTargetRegion = false;

function resetErrorGate() {
  hasEnteredTargetRegion = false;
}
window.resetErrorGate = resetErrorGate;

window.DWELL_CONFIG = {
  dwellTimeMs: DWELL_TIME_MS,
  wrongRegionDwellTimeMs: WRONG_REGION_DWELL_TIME_MS,
  gracePeriodMs: GRACE_PERIOD_MS,
  timerContinueMs: TIMER_CONTINUE_MS
};

//  history of raw region hits, used to resolve border flicker: so when it is in a border
//it checks its previous regions for unwanted clicks 
let regionHistory = []; // { index, time }, oldest first
let wasOnBorder = false; // gates the border-flicker log 
function resetDwellProgress() {
  dwellTargetIndex = null;
  dwellAccumulatedMs = 0;
  segmentStartTime = null;
  awayStartTime = null;
  regionHistory = [];
  candidateReentries = 0;
  candidateGraceSaves = 0;
}

function startNewCandidate(rawIndex, now) {
  dwellTargetIndex = rawIndex;
  dwellAccumulatedMs = 0;
  segmentStartTime = now;
  awayStartTime = null;
  candidateReentries = 0;
  candidateGraceSaves = 0;
}

function recordRegionSample(rawIndex, now) {
  regionHistory.push({ index: rawIndex, time: now });
  const cutoff = now - GRACE_PERIOD_MS;
  while (regionHistory.length > 0 && regionHistory[0].time < cutoff) {
    regionHistory.shift();
  }
}

//helps with flickering 
const CURRENT_RUN_TRUST_MS = 120;

// Resolves which region the current tick should count toward.
function resolveBorderRegion(rawIndex, now) {
  if (regionHistory.length <= 1) return rawIndex;

  const firstIndex = regionHistory[0].index;
  const isStable = regionHistory.every(sample => sample.index === firstIndex);
  if (isStable) return rawIndex;

  // regionHistory's last entry is always this frame's rawIndex (recorded
  // just before this call)
  let runStartIdx = regionHistory.length - 1;
  while (runStartIdx > 0 && regionHistory[runStartIdx - 1].index === rawIndex) {
    runStartIdx--;
  }
  if (now - regionHistory[runStartIdx].time >= CURRENT_RUN_TRUST_MS) {
    return rawIndex;
  }

  const durationByRegion = new Map();
  for (let i = 0; i < regionHistory.length; i++) {
    const sample = regionHistory[i];
    const segmentEnd = i + 1 < regionHistory.length ? regionHistory[i + 1].time : now;
    const duration = segmentEnd - sample.time;
    durationByRegion.set(sample.index, (durationByRegion.get(sample.index) || 0) + duration);
  }

  let dominantIndex = rawIndex;
  let longestDuration = -1;
  for (const [index, duration] of durationByRegion) {
    if (duration > longestDuration) {
      longestDuration = duration;
      dominantIndex = index;
    }
  }
  return dominantIndex;
}

// undefined/null means "unknown" so that it doesnt call an error when not in the right region
function readCurrentTargetIndex() {
  return (typeof window.getCurrentTargetIndex === 'function') ? window.getCurrentTargetIndex() : undefined;
}

function dwellTimeThresholdFor(index) {
  const targetIndex = readCurrentTargetIndex();
  const targetKnown = targetIndex !== null && targetIndex !== undefined;
  return (!targetKnown || index === targetIndex) ? DWELL_TIME_MS : WRONG_REGION_DWELL_TIME_MS;
}

// helps the glowing process actually happen
function getDwellProgress() {
  if (dwellTargetIndex === null) return { targetIndex: null, progress: 0 };
  // Freeze the progress at the instant tracking was lost, rather
  // than letting it silently keep climbing
  const now = trackingLostSince !== null ? trackingLostSince : performance.now();
  const running = segmentStartTime !== null ? (now - segmentStartTime) : 0;
  const total = dwellAccumulatedMs + running;
  return {
    targetIndex: dwellTargetIndex,
    progress: Math.min(1, total / dwellTimeThresholdFor(dwellTargetIndex))
  };
}

function checkDwellState() {
  if (!window.isStarted) {
    resetDwellProgress();
    lastConfirmedIndex = null;
    outsideRegionLastFrameTime = null; // avoid a bogus giant delta whenever tracking resumes
    trackingLostSince = null;
    return;
  }

  const now = performance.now();
  const trueRawIndex = window.activeIndex;

  // Border-flicker smoothing exists to protect real progress toward the
  // correct target from boundary jitter
  const targetIndex = readCurrentTargetIndex();
  const targetKnown = targetIndex !== null && targetIndex !== undefined;
  const hasValidTrueRegion = trueRawIndex !== null && trueRawIndex !== undefined && trueRawIndex !== -1;
  const isWrongRegion = targetKnown && hasValidTrueRegion && trueRawIndex !== targetIndex;

  if (targetKnown && hasValidTrueRegion && trueRawIndex === targetIndex) {
    hasEnteredTargetRegion = true;
  }

  // A new trial starts as soon as the designated target changes .
  if (targetIndex !== outsideRegionTargetIndex) {
    outsideRegionTargetIndex = targetIndex;
    outsideRegionMs = 0;
    outsideRegionLastFrameTime = now;
  }
  if (outsideRegionLastFrameTime !== null) {
    const frameDelta = now - outsideRegionLastFrameTime;
    if (targetKnown && trueRawIndex !== targetIndex) {
      outsideRegionMs += frameDelta;
    }
  }
  outsideRegionLastFrameTime = now;

  if (!hasValidTrueRegion) {
    if (trackingLostSince === null) trackingLostSince = now;
    return;
  }
  if (trackingLostSince !== null) {
    const gapMs = now - trackingLostSince;
    if (segmentStartTime !== null) segmentStartTime += gapMs;
    if (awayStartTime !== null) awayStartTime += gapMs;
    trackingLostSince = null;
  }

 
  recordRegionSample(trueRawIndex, now);
  const rawIndex = isWrongRegion ? trueRawIndex : resolveBorderRegion(trueRawIndex, now);
  const onBorder = rawIndex !== trueRawIndex;
  if (onBorder && !wasOnBorder) {
    console.log(`[dwell] border flicker: raw hit ${trueRawIndex}, counting toward ${rawIndex} (dominant over last ${GRACE_PERIOD_MS}ms)`);
  }
  wasOnBorder = onBorder;
  const hasValidRegion = rawIndex !== null && rawIndex !== undefined && rawIndex !== -1;
  const dwellTimeThreshold = dwellTimeThresholdFor(rawIndex);

  if (dwellTargetIndex === null) {
    // Still sitting in the region we just confirmed don't re-arm the
    // dwell timer until the user actually leaves it.
    const stillOnConfirmedRegion = hasValidRegion && rawIndex === lastConfirmedIndex;

    if (hasValidRegion && !stillOnConfirmedRegion) {
      console.log(`[dwell] NEW candidate: region ${rawIndex}`);
      startNewCandidate(rawIndex, now);
    }
    if (!stillOnConfirmedRegion) {
      lastConfirmedIndex = null;
    }
    return;
  }

  if (hasValidRegion && rawIndex === dwellTargetIndex) {
    // A re-entry is any return after having left; a grace-save is
    // specifically a return after the look-away was long enough to have
    // actually paused the timer (segmentStartTime cleared below) rather
    // than just a sub-TIMER_CONTINUE_MS blip. - had AI write this comment lol
    const wasAway = awayStartTime !== null;
    const wasPaused = segmentStartTime === null;
    if (wasPaused) {
      console.log(`[dwell] RESUME region ${rawIndex}, had ${dwellAccumulatedMs.toFixed(0)}ms banked`);
      segmentStartTime = now;
    }
    if (wasAway) {
      candidateReentries++;
      if (wasPaused) candidateGraceSaves++;
    }
    awayStartTime = null;

    const totalElapsed = dwellAccumulatedMs + (now - segmentStartTime);
    if (totalElapsed >= dwellTimeThreshold) {
      const isWrongRegionSelection = targetKnown && rawIndex !== targetIndex;
      if (isWrongRegionSelection && !hasEnteredTargetRegion) {
        // Participant hasn't reached the intended region yet this round —
        // don't let a stray starting position count as an error.
        return;
      }
      console.log(`[dwell] ✅ SELECT region ${rawIndex} at ${totalElapsed.toFixed(0)}ms`);
      lastConfirmedIndex = rawIndex;
      window.lastDwellStats = {
        reentries: candidateReentries,
        graceSaves: candidateGraceSaves,
        dwellDurationMs: totalElapsed,
        timeOutsideRegionMs: outsideRegionMs
      };
      resetDwellProgress();
      if (window.attemptAcquisition) window.attemptAcquisition();
    }
    return;
  }

  // Outside the intended region:
  // TIMER_CONTINUE_MS away: the dwell timer keeps running uninterrupted
  // FACE_PERIOD_MS away: timer pauses, but the target stays "live" (still glows)
  // GRACE_PERIOD_MS away: the candidate is lost
  if (awayStartTime === null) {
    console.log(`[dwell] LEFT target ${dwellTargetIndex} for ${hasValidRegion ? rawIndex : 'no region'}, banked ${dwellAccumulatedMs.toFixed(0)}ms, grace clock started`);
    awayStartTime = now;
  }
  const awayElapsed = now - awayStartTime;

  if (awayElapsed >= TIMER_CONTINUE_MS && segmentStartTime !== null) {
    dwellAccumulatedMs += now - segmentStartTime;
    segmentStartTime = null;
  }

  if (awayElapsed >= GRACE_PERIOD_MS) {
   
    if (hasValidTrueRegion) {
      console.log(`[dwell] RESET (grace expired, away ${awayElapsed.toFixed(0)}ms) — lost ${dwellAccumulatedMs.toFixed(0)}ms that was banked on ${dwellTargetIndex}, new candidate ${trueRawIndex}`);
      startNewCandidate(trueRawIndex, now);
    } else {
      console.log(`[dwell] RESET (no valid region, away ${awayElapsed.toFixed(0)}ms) — had ${dwellAccumulatedMs.toFixed(0)}ms banked on target ${dwellTargetIndex}`);
      resetDwellProgress();
    }
  }
}

window.checkDwellState = checkDwellState;
window.resetDwellProgress = resetDwellProgress;
window.getDwellProgress = getDwellProgress;