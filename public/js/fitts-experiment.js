// // Fitts' Law Multidirectional Pointing Experiment
// // Based on ISO 9241-9 standards

// class FittsExperiment {
//   constructor() {
//     // Experiment configuration
//     this.config = {
//       // Target sizes as percentage of LIMITING dimension (smaller of width/height)
//       // ID range ≈ 1.8–3.1 bits with current amplitudes
//       // Reduced from 3 to 2 sizes per Hansen et al. (2018) precedent (2W × 2A)
//       targetSizePercents: [10, 6], // Medium, Hard (larger first so participants ease in)
//       amplitudePercents: [45], // Largest only (professor: experiment was too long with two amplitudes)
      
//       // Specific sequence: across-the-circle alternation
//       // 0° → 180° → 45° → 225° → 90° → 270° → 135° → 315°
//       directionSequence: [0, 180, 45, 225, 90, 270, 135, 315],
      
//       trialsPerLayout: 8,
//       dwellTime: 2000, // 2 seconds dwell to select
//       breakDuration: 60,
//       varianceMeasurementDuration: 5000,
//       conditionTimeLimit: 180000, // 3 minutes per condition (filter phase)
//       // Per-trial timeout (Manduchi, May 2026): if a trial runs longer than this,
//       // it is recorded as 'timeout_trial' and the experiment advances to the next
//       // trial. The cursor stays where it currently is (per his explicit guidance:
//       // do NOT teleport into the target — that would inject artificial bias).
//       // 20 s chosen from: dwellTime (2 s) + reasonable settle-and-find time.
//       // Three-minute layout budget / 8 trials ≈ 22.5 s; rounding to 20 s leaves
//       // headroom for the layout timer to never fire before trials individually do.
//       trialTimeLimit: 20000,
      
//       // Fixed configuration: 2D, 3 landmarks for entire experiment
//       landmarkPoints: "3",
//       coordinateSystem: "2d",
      
//       // Variance-matched pairs configuration (hardcoded fallback)
//       // Latency-capped: no condition exceeds ~600ms worst-case latency.
//       // Levels are equally spaced by latency so each feels perceptually distinct.
//       varianceMatchedPairs: [
//         {
//           pairNumber: 1,
//           description: "Low Variance (latency ~504ms) - Smoothest within cap",
//           variance: 7.0,
//           exponential: { rank: 9, alpha: 0.008992, variance: 7.0109, latency: 504.11 },
//           oneEuro: { rank: 27, minCutoff: 0.061, beta: 0.00001, dCutoff: 0.9, variance: 6.7023, latency: 263.16 }
//         },
//         {
//           pairNumber: 2,
//           description: "Medium Variance (latency ~397ms) - Balanced",
//           variance: 9.75,
//           exponential: { rank: 16, alpha: 0.01599, variance: 9.7692, latency: 397.34 },
//           oneEuro: { rank: 35, minCutoff: 0.131, beta: 0.00001, dCutoff: 0.9, variance: 9.6043, latency: 259.39 }
//         },
//         {
//           pairNumber: 3,
//           description: "High Variance (latency ~291ms) - Most Responsive",
//           variance: 12.5,
//           exponential: { rank: 23, alpha: 0.02298, variance: 12.5275, latency: 290.57 },
//           oneEuro: { rank: 43, minCutoff: 0.201, beta: 0.00001, dCutoff: 0.9, variance: 12.5063, latency: 255.62 }
//         }
//       ]
//     };
    
//     // Participant info
//     this.participantId = null;
//     this.counterbalanceCondition = null;
    
//     // State
//     this.isRunning = false;
//     this.currentPairIndex = 0; // Which variance-matched pair (0-2)
//     this.currentLayoutIndex = 0; // Which layout (0-5)
//     this.currentFilterPhase = 0; // 0 = exponential, 1 = oneEuro (within current pair)
//     this.currentTrialInLayout = 0; // Trial within current layout (0-7)
//     this.currentTrial = null;
//     this.trialData = [];
//     this.completedPaths = []; // Store completed paths for visualization
//     this.waitingForHomeCircle = false; // Whether we're waiting for initial home circle dwell

//     // Practice trial (Manduchi, May 2026): one warm-up block at the very start of
//     // the session so participants understand the Fitts task before real data is
//     // collected. Uses a larger radius/target than the real conditions. Not saved
//     // to trialData. Runs once per session, before the first real condition.
//     this.isPracticeMode = false;
//     this.practiceDone = false;
//     this._savedLayoutsForPractice = null;
    
//     // Part tracking (A = personal calibration, B = standard calibration)
//     this.currentPart = 'Part A';
//     this.partACompleted = false;
//     this.partBCompleted = false;
//     this.allVarianceMatchedPairs = null;
//     this.partAVariancePairs = null;
//     this.calibrationInfo = { 'Part A': '', 'Part B': '' };
//     // Authoritative record of which calibration each part actually ran under.
//     // Set by the swap helpers (not inferred from a free-text source string),
//     // so info.txt can never mislabel a failed swap as a successful one.
//     //   'personal' = participant's own calibration
//     //   'standard' = frozen group-standard calibration
//     this.calibrationKind = { 'Part A': null, 'Part B': null };
//     this._currentCalibrationKind = 'personal';

//     // ---- Filter-block ordering (Manduchi, June 2026) -----------------------
//     // New structure: the session is two FILTER blocks. Each block = that
//     // filter's personal-calibration trials (3 variances) followed by a short
//     // STANDARD-calibration test of the SAME filter at mid variance. So the
//     // standard test runs twice (once per filter), always at the END of its
//     // block. Implemented as 4 ordered "segments":
//     //   seg0: filterFirst  / personal / 3 variances   (stamped Part A)
//     //   seg1: filterFirst  / standard / mid only      (stamped Part B)
//     //   seg2: filterSecond / personal / 3 variances   (stamped Part A)
//     //   seg3: filterSecond / standard / mid only      (stamped Part B)
//     // Mapping personal→"Part A" and standard→"Part B" lets the existing
//     // questionnaire-type selection, calibration swap, and per-part ZIP export
//     // all keep working unchanged. Toggle back to the old interleaved flow with
//     //   window.FITTS_BLOCK_ORDER = 'legacy'   (then restart).
//     this._useFilterBlockOrder =
//       (typeof window === 'undefined' || window.FITTS_BLOCK_ORDER !== 'legacy');
//     this._segments = [];
//     this._segmentIndex = 0;
//     this._activeSegment = null;

//     // Snapshot of the participant's personal calibration captured at the
//     // start of the session (right after they finish the fresh per-participant
//     // calibration). Used to AUTO-restore personal calibration when the
//     // counterbalance order is Part B → Part A — so the experimenter never
//     // has to manually re-upload anything.
//     this._personalCalibrationSnapshot = null;
    
//     // Questionnaire responses
//     this.miniQuestionnaireResponses = [];
//     this.nasaTLXResponses = [];

//     // Condition timer state
//     this.conditionStartTime = null;
//     this.conditionMissedTrials = 0;
    
//     // Variance measurement results
//     this.varianceMeasurementResults = [];
    
//     // UI elements
//     this.experimentUI = null;
//     this.targetCircles = {}; // Store all 8 target circles
//     this.homeCircle = null;
//     this.dwellIndicator = null;
//     this.progressText = null;
//     this.guideLines = null;
    
//     // Timing
//     this.dwellStartTime = null;
//     this.movementStartTime = null;
//     this.trialStartTime = null;
    
//     // Cursor position tracking
//     this.cursorTrackingInterval = null;
//     this.selectionPoint = null;
//     this.startPoint = null;
//     this.previousTargetSize = 100; // Size of previous target (for movement detection)
//     this.cursorPath = []; // Full cursor path with timestamps {x, y, t}
//     this.targetEvents = []; // Target entry/exit events {type: 'enter'|'exit', x, y, t}
//     this.isInsideTarget = false; // Current target containment state
    
//     // Layout structure
//     this.layouts = [];
//     this.totalTrials = 0;
//     this.completedTrials = 0;
    
//     // Break timer
//     this.breakTimeRemaining = 0;
//     this.breakInterval = null;
    
//     // Bind methods
//     this.update = this.update.bind(this);
    
//     // Global spacebar handler: press Space to trigger the primary action button
//     this._spacebarHandler = (e) => {
//       if (e.code !== 'Space') return;
//       // Don't intercept if typing in an input/textarea
//       if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
//       if (!this.experimentUI) return;

//       // Pick the first visible, NON-DISABLED action button. Explicitly
//       // excluding disabled buttons ensures gating screens (e.g. Part B
//       // swap, edge-check failures) can't be bypassed by pressing Space.
//       const candidates = [
//         '.experiment-button.start-button:not([disabled])',
//         '.experiment-button.continue-button:not([disabled])',
//         '.experiment-button:not([disabled])',
//       ];
//       let primaryBtn = null;
//       for (const sel of candidates) {
//         const el = this.experimentUI.querySelector(sel);
//         if (el && el.offsetParent !== null) { primaryBtn = el; break; }
//       }
//       if (primaryBtn) {
//         e.preventDefault();
//         primaryBtn.click();
//       }
//     };
//     document.addEventListener('keydown', this._spacebarHandler);
//   }
  
//   // Convert percentage to pixels based on limiting dimension (smaller of width/height)
//   percentToPixels(percent) {
//     // Limiting dimension = smaller of width or height (adapts to orientation)
//     const limitingDimension = Math.min(window.innerWidth, window.innerHeight);
//     return (percent / 100) * limitingDimension;
//   }

//   // Determine counterbalancing condition from participant ID number
//   // 24 total conditions: 6 variance orderings × 2 filter orders × 2 part orders
//   getCounterbalanceCondition(idNumber) {
//     const variancePermutations = [
//       [0, 1, 2], // Low → Med → High
//       [0, 2, 1], // Low → High → Med
//       [1, 0, 2], // Med → Low → High
//       [1, 2, 0], // Med → High → Low
//       [2, 0, 1], // High → Low → Med
//       [2, 1, 0], // High → Med → Low
//     ];

//     const conditionIndex = (idNumber - 1) % 24;
//     const varianceOrderIndex = conditionIndex % 6;
//     const filterOrderIndex = Math.floor(conditionIndex / 6) % 2;
//     const partOrderIndex = Math.floor(conditionIndex / 12) % 2;

//     return {
//       varianceOrder: variancePermutations[varianceOrderIndex],
//       filterFirst: filterOrderIndex === 0 ? 'exponential' : 'oneEuro',
//       partFirst: partOrderIndex === 0 ? 'A' : 'B',
//       varianceOrderLabel: variancePermutations[varianceOrderIndex].map(i => ['Low', 'Med', 'High'][i]).join(' → '),
//     };
//   }

//   // Show participant ID input screen before experiment starts
//   showParticipantIDScreen() {
//     return new Promise((resolve) => {
//       // If pid is provided via URL, skip the manual entry screen entirely
//       if (window.URL_PARTICIPANT_ID) {
//         const idNum = parseInt(window.URL_PARTICIPANT_ID);
//         if (idNum > 0) {
//           this.participantId = `P${String(idNum).padStart(2, '0')}`;
//           this.counterbalanceCondition = this.getCounterbalanceCondition(idNum);
//           console.log(`👤 Participant (from URL): ${this.participantId}`);
//           console.log(`🔀 Condition:`, this.counterbalanceCondition);
//           this.createUI();
//           resolve();
//           return;
//         }
//       }

//       if (!this.experimentUI) {
//         this.experimentUI = document.createElement('div');
//         this.experimentUI.id = 'fitts-experiment-ui';
//         this.experimentUI.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 10000; background: rgba(0,0,0,0.95); display: flex; align-items: center; justify-content: center;';
//         document.body.appendChild(this.experimentUI);

//         if (!this._backBtn) {
//           const backBtn = document.createElement('button');
//           backBtn.id = 'fitts-back-btn';
//           backBtn.textContent = '← Back to Controls';
//           backBtn.style.cssText = `
//             position: fixed; top: 12px; left: 12px; z-index: 10001;
//             padding: 8px 16px; font-size: 13px; font-weight: bold;
//             background: rgba(80, 80, 80, 0.9); color: #ccc; border: 1px solid #666;
//             border-radius: 6px; cursor: pointer;
//           `;
//           backBtn.onmouseenter = () => { backBtn.style.background = 'rgba(120,120,120,0.9)'; };
//           backBtn.onmouseleave = () => { backBtn.style.background = 'rgba(80,80,80,0.9)'; };
//           backBtn.onclick = () => { this.close(); };
//           document.body.appendChild(backBtn);
//           this._backBtn = backBtn;
//         }
//       }

//       const updateConditionDisplay = () => {
//         const input = document.getElementById('participant-id-input');
//         const display = document.getElementById('condition-display');
//         const startBtn = document.getElementById('participant-start-btn');
//         const val = input.value.replace(/\D/g, '');
        
//         if (val && parseInt(val) > 0) {
//           const idNum = parseInt(val);
//           const condition = this.getCounterbalanceCondition(idNum);
//           const varLabels = ['Low', 'Med', 'High'];
//           const varOrderStr = condition.varianceOrder.map(i => varLabels[i]).join(' → ');
//           const filterStr = condition.filterFirst === 'exponential' ? 'Exponential first' : 'One Euro first';
//           const partStr = condition.partFirst === 'A' ? 'Part A first (personal calibration)' : 'Part B first (standard calibration)';
          
//           display.innerHTML = `
//             <div style="color: #64ff64; font-weight: bold; margin-bottom: 8px;">Assigned Condition (P${String(idNum).padStart(2, '0')}):</div>
//             <div style="color: #ccc; font-size: 13px; line-height: 1.8;">
//               <span style="color: #ffc864;">Variance order:</span> ${varOrderStr}<br>
//               <span style="color: #ffc864;">Filter order:</span> ${filterStr}<br>
//               <span style="color: #ffc864;">Part order:</span> ${partStr}
//             </div>
//           `;
//           display.style.display = 'block';
//           startBtn.disabled = false;
//           startBtn.style.opacity = '1';
//         } else {
//           display.style.display = 'none';
//           startBtn.disabled = true;
//           startBtn.style.opacity = '0.4';
//         }
//       };

//       this.experimentUI.innerHTML = `
//         <div style="background: rgba(30, 30, 40, 0.98); border: 2px solid #64c8ff; border-radius: 12px; padding: 40px; max-width: 500px; width: 90%; text-align: center;">
//           <h2 style="color: #64c8ff; margin: 0 0 8px 0; font-size: 22px;">Fitts' Law Experiment</h2>
//           <p style="color: #888; font-size: 13px; margin: 0 0 30px 0;">ISO 9241-411 Multidirectional Pointing Task</p>
          
//           <div style="margin-bottom: 24px;">
//             <label style="color: #ccc; font-size: 14px; display: block; margin-bottom: 10px;">
//               Enter Participant ID Number:
//             </label>
//             <input 
//               id="participant-id-input" 
//               type="number" 
//               min="1" 
//               placeholder="e.g. 1, 2, 3..."
//               style="
//                 width: 120px; padding: 12px 16px; font-size: 20px; text-align: center;
//                 background: rgba(255,255,255,0.1); border: 2px solid #64c8ff; border-radius: 8px;
//                 color: white; outline: none;
//               "
//             />
//           </div>
          
//           <div id="condition-display" style="
//             display: none; background: rgba(100, 200, 255, 0.08); border: 1px solid rgba(100, 200, 255, 0.2);
//             border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: left;
//           "></div>
          
//           <button id="participant-start-btn" disabled style="
//             padding: 14px 40px; font-size: 16px; font-weight: bold;
//             background: #64c8ff; color: #111; border: none; border-radius: 8px;
//             cursor: pointer; opacity: 0.4; transition: opacity 0.2s;
//           ">
//             Begin Experiment
//           </button>
          
//           <p style="color: #666; font-size: 11px; margin-top: 16px;">
//             The participant ID determines counterbalancing (variance order, filter order, part order).
//           </p>
//         </div>
//       `;

//       const input = document.getElementById('participant-id-input');
//       const startBtn = document.getElementById('participant-start-btn');

//       input.addEventListener('input', updateConditionDisplay);
//       input.focus();

//       const handleStart = () => {
//         const val = input.value.replace(/\D/g, '');
//         if (!val || parseInt(val) <= 0) return;
        
//         const idNum = parseInt(val);
//         this.participantId = `P${String(idNum).padStart(2, '0')}`;
//         this.counterbalanceCondition = this.getCounterbalanceCondition(idNum);
        
//         console.log(`👤 Participant: ${this.participantId}`);
//         console.log(`🔀 Condition:`, this.counterbalanceCondition);
        
//         resolve();
//       };

//       startBtn.addEventListener('click', handleStart);

//       // Spacebar to start
//       const handleKeydown = (e) => {
//         if (e.code === 'Space' && !startBtn.disabled) {
//           e.preventDefault();
//           document.removeEventListener('keydown', handleKeydown);
//           handleStart();
//         }
//       };
//       document.addEventListener('keydown', handleKeydown);
//     });
//   }

//   /**
//    * Linearly interpolate filter parameters to hit an exact target SD.
//    * Finds two bracketing Pareto points and interpolates between them.
//    */
//   interpolateParams(targetVariance, sortedParams, filterType) {
//     if (sortedParams.length === 0) return null;

//     if (targetVariance <= sortedParams[0].meanVariance) {
//       return { ...sortedParams[0], interpolated: false };
//     }
//     if (targetVariance >= sortedParams[sortedParams.length - 1].meanVariance) {
//       return { ...sortedParams[sortedParams.length - 1], interpolated: false };
//     }

//     for (let i = 0; i < sortedParams.length - 1; i++) {
//       const lo = sortedParams[i];
//       const hi = sortedParams[i + 1];
//       if (lo.meanVariance <= targetVariance && hi.meanVariance >= targetVariance) {
//         const range = hi.meanVariance - lo.meanVariance;
//         if (range === 0) return { ...lo, interpolated: false };
//         const t = (targetVariance - lo.meanVariance) / range;
//         const lerp = (a, b) => a + t * (b - a);

//         if (filterType === 'exponential') {
//           return {
//             alpha: lerp(lo.alpha, hi.alpha),
//             meanVariance: targetVariance,
//             meanLatency: lerp(lo.meanLatency, hi.meanLatency),
//             interpolated: true, bracketLow: lo, bracketHigh: hi, t
//           };
//         } else {
//           return {
//             minCutoff: lerp(lo.minCutoff, hi.minCutoff),
//             beta: lerp(lo.beta, hi.beta),
//             dCutoff: lerp(lo.dCutoff, hi.dCutoff),
//             meanVariance: targetVariance,
//             meanLatency: lerp(lo.meanLatency, hi.meanLatency),
//             interpolated: true, bracketLow: lo, bracketHigh: hi, t
//           };
//         }
//       }
//     }
//     return null;
//   }

//   /**
//    * Linearly interpolate filter parameters to hit an exact target LATENCY.
//    * Mirror of interpolateParams but brackets on meanLatency. Used to build
//    * latency-matched pairs, where both filters share a latency and their
//    * resulting variance is whatever the Pareto front dictates.
//    *
//    * @param {number} targetLatency  desired latency in ms
//    * @param {Array}  byLatency      Pareto points sorted ASCENDING by meanLatency
//    * @param {string} filterType     'exponential' | 'oneEuro'
//    */
//   interpolateByLatency(targetLatency, byLatency, filterType) {
//     if (!byLatency || byLatency.length === 0) return null;

//     if (targetLatency <= byLatency[0].meanLatency) {
//       return { ...byLatency[0], meanLatency: byLatency[0].meanLatency, interpolated: false };
//     }
//     if (targetLatency >= byLatency[byLatency.length - 1].meanLatency) {
//       const last = byLatency[byLatency.length - 1];
//       return { ...last, interpolated: false };
//     }

//     for (let i = 0; i < byLatency.length - 1; i++) {
//       const lo = byLatency[i];
//       const hi = byLatency[i + 1];
//       if (lo.meanLatency <= targetLatency && hi.meanLatency >= targetLatency) {
//         const range = hi.meanLatency - lo.meanLatency;
//         if (range === 0) return { ...lo, interpolated: false };
//         const t = (targetLatency - lo.meanLatency) / range;
//         const lerp = (a, b) => a + t * (b - a);

//         if (filterType === 'exponential') {
//           return {
//             alpha: lerp(lo.alpha, hi.alpha),
//             meanVariance: lerp(lo.meanVariance, hi.meanVariance),
//             meanLatency: targetLatency,
//             interpolated: true, bracketLow: lo, bracketHigh: hi, t
//           };
//         } else {
//           return {
//             minCutoff: lerp(lo.minCutoff, hi.minCutoff),
//             beta: lerp(lo.beta, hi.beta),
//             dCutoff: lerp(lo.dCutoff, hi.dCutoff),
//             meanVariance: lerp(lo.meanVariance, hi.meanVariance),
//             meanLatency: targetLatency,
//             interpolated: true, bracketLow: lo, bracketHigh: hi, t
//           };
//         }
//       }
//     }
//     return null;
//   }

//   /**
//    * Compute 3 LATENCY-MATCHED pairs: at each level both filters are tuned to
//    * the same latency, and each filter's variance is whatever its Pareto front
//    * produces at that latency. This is the design the professor requested.
//    *
//    * The usable latency band is the overlap of the two filters' achievable
//    * latency ranges, restricted to points within both usability caps
//    * (variance <= MAX_VARIANCE_PX and latency <= MAX_LATENCY_MS). Because the
//    * One-Euro front spans only a narrow latency range, this overlap can be
//    * small — the console reports it so the experimenter can see the trade-off.
//    *
//    * Returns null on failure so the caller can fall back to variance-matched.
//    */
//   computeLatencyMatchedPairs(MAX_LATENCY_MS, MAX_VARIANCE_PX) {
//     const expParams = window.EXPONENTIAL_PARAMETERS;
//     const oeParams = window.PARETO_FRONT_PARAMETERS;
//     if (!expParams?.length || !oeParams?.length) return null;

//     const limitingDim = Math.min(window.innerWidth, window.innerHeight);

//     // EXPONENTIAL is the reference filter (Manduchi, June 2026): EXP alone sets
//     // the three latency levels; One Euro is then read at those SAME latencies.
//     // Jitter is allowed to float, so we do NOT pre-filter by the jitter cap —
//     // just sort both fronts by latency.
//     const exByLat = [...expParams].sort((a, b) => a.meanLatency - b.meanLatency);
//     const oeByLat = [...oeParams].sort((a, b) => a.meanLatency - b.meanLatency);
//     if (exByLat.length < 2 || oeByLat.length < 2) {
//       console.warn('⚠️ Not enough Pareto points for latency matching.');
//       return null;
//     }

//     // L2 (smooth end): EXP at the 600ms latency cap, or its own maximum if the
//     // participant's EXP front can't even reach the cap.
//     const expMaxLat = exByLat[exByLat.length - 1].meanLatency;
//     const hiLat = Math.min(MAX_LATENCY_MS, expMaxLat);

//     // L0 (responsive end): the lowest-latency EXP point still within the jitter
//     // cap — the most responsive we can be without exceeding the jitter budget.
//     let loLat = null;
//     for (const p of exByLat) {
//       if (p.meanVariance <= MAX_VARIANCE_PX) { loLat = p.meanLatency; break; }
//     }
//     let jitterCapRelaxed = false;
//     if (loLat === null || loLat >= hiLat) {
//       // Noisy participant: EXP only reaches the jitter cap at or beyond the smooth
//       // end (or never), so there's no responsive point under the cap. Per Roberto,
//       // relax the cap rather than excluding them — take EXP's most responsive
//       // (lowest-latency) point and let the jitter run high.
//       loLat = exByLat[0].meanLatency;
//       jitterCapRelaxed = true;
//       console.warn(`⚠️ Exponential can't reach ${MAX_VARIANCE_PX.toFixed(1)}px jitter under `
//         + `${hiLat.toFixed(0)}ms — relaxing the jitter cap; the responsive level will be jitterier than the cap.`);
//     }

//     console.log(`📐 EXP-anchored latency range: ${loLat.toFixed(0)}ms (responsive) – `
//       + `${hiLat.toFixed(0)}ms (smooth). Spread ${(hiLat - loLat).toFixed(0)}ms`
//       + `${jitterCapRelaxed ? ' [jitter cap relaxed]' : ''}.`);

//     // Block on a collapsed range (failed calibration). We DO NOT fall back to
//     // variance-matched — that is a different study design. Stop and ask the
//     // experimenter to redo calibration.
//     if (hiLat - loLat < 60) {
//       const msg = `Calibration produced almost no latency range `
//         + `(${(hiLat - loLat).toFixed(0)}ms; need ≥ 60ms). The three latency levels would `
//         + `feel identical, so the data would be unusable. Please redo calibration: at each `
//         + `target, move the head over, press SPACE, then hold completely still until it advances.`;
//       console.error('🛑 ' + msg);
//       return { error: 'CALIBRATION_TOO_FLAT', message: msg };
//     }

//     // Index 0 = smoothest (high latency), index 2 = most responsive (low latency).
//     // Index 1 (Medium) is what Part B uses, matching the variance-matched layout.
//     const targets = [
//       { level: 'Low',    lat: hiLat },
//       { level: 'Medium', lat: (loLat + hiLat) / 2 },
//       { level: 'High',   lat: loLat }
//     ];

//     const pairs = [];
//     for (const target of targets) {
//       const exp = this.interpolateByLatency(target.lat, exByLat, 'exponential');
//       const oe = this.interpolateByLatency(target.lat, oeByLat, 'oneEuro');
//       if (!exp || !oe) {
//         console.warn(`⚠️ Interpolation failed at ${target.lat.toFixed(0)}ms.`);
//         return null;
//       }

//       const meanVar = (exp.meanVariance + oe.meanVariance) / 2;
//       pairs.push({
//         pairNumber: pairs.length + 1,
//         description: `${target.level} (latency ~${target.lat.toFixed(0)}ms, latency-matched) `
//           + `- OE ${oe.meanVariance.toFixed(1)}px / Exp ${exp.meanVariance.toFixed(1)}px`,
//         // For latency-matched pairs the meaningful matched quantity is latency.
//         matchMode: 'latency',
//         targetLatency: target.lat,
//         variance: meanVar,
//         varianceNormPct: (meanVar / limitingDim) * 100,
//         exponential: {
//           rank: exp.interpolated ? 'interp' : (exp.rank || '?'),
//           alpha: exp.alpha,
//           variance: exp.meanVariance,
//           latency: target.lat
//         },
//         oneEuro: {
//           rank: oe.interpolated ? 'interp' : (oe.rank || '?'),
//           minCutoff: oe.minCutoff,
//           beta: oe.beta,
//           dCutoff: oe.dCutoff,
//           variance: oe.meanVariance,
//           latency: target.lat
//         }
//       });

//       console.log(`  ✅ ${target.level} @ ${target.lat.toFixed(0)}ms: `
//         + `Exp var=${exp.meanVariance.toFixed(1)}px, OE var=${oe.meanVariance.toFixed(1)}px`);
//     }

//     return pairs;
//   }

//   /**
//    * Compute 3 variance-matched pairs using interpolation from current Pareto data.
//    *
//    * Strategy (per professor's guidance):
//    *   1. Cap: discard any variance level where the worst-case filter latency
//    *      exceeds MAX_LATENCY_MS (no condition should feel painfully slow).
//    *   2. Equal-latency spacing: within the valid range pick 3 levels whose
//    *      worst-case latencies are evenly spaced so every step feels
//    *      perceptually distinct.
//    *
//    * Normalized variance (% of limiting dimension) is computed for export.
//    */
//   computeInterpolatedPairs() {
//     // Usability bounds (per Manduchi, May 2026 email exchange):
//     //   - Low-latency end:  cap the worst-case filter latency at 600 ms so the
//     //                       "smoothest" condition isn't painfully sluggish.
//     //   - High-variance end: cap the cursor SD at MAX_VARIANCE_PX so the
//     //                       "most responsive" condition isn't unusably jittery.
//     // Calibrated from n=3 pilot (May 2026): one participant hit ~20 s/trial and
//     // 12.8 re-entries at ~13 px SD. Cap at 12 px keeps all 3 conditions feasible.
//     // Live-overridable from the console for demos / sensitivity checks:
//     //   window.FITTS_MAX_LATENCY = 800;  window.FITTS_MAX_VARIANCE = 20;
//     // (then restart the experiment). Defaults are the pilot-calibrated caps.
//     const MAX_LATENCY_MS  = (typeof window !== 'undefined' && Number.isFinite(window.FITTS_MAX_LATENCY))
//       ? window.FITTS_MAX_LATENCY : 600;
//     // Jitter cap = 1% of screen width (screen-relative, per the pointing
//     // literature and Manduchi's "is it pixel or screen size?" question), so it
//     // means the same fraction of the screen for every participant regardless of
//     // their display. Still console-overridable via window.FITTS_MAX_VARIANCE.
//     const MAX_VARIANCE_PX = (typeof window !== 'undefined' && Number.isFinite(window.FITTS_MAX_VARIANCE))
//       ? window.FITTS_MAX_VARIANCE
//       : (typeof window !== 'undefined' ? window.innerWidth * 0.01 : 12);
//     console.log(`📐 Usability caps in effect: latency ≤ ${MAX_LATENCY_MS}ms, `
//       + `variance ≤ ${MAX_VARIANCE_PX.toFixed(1)}px (1% of ${typeof window !== 'undefined' ? window.innerWidth : '?'}px screen)`);

//     const expParams = window.EXPONENTIAL_PARAMETERS;
//     const oeParams = window.PARETO_FRONT_PARAMETERS;
//     if (!expParams?.length || !oeParams?.length) return null;

//     // --- Matching mode -------------------------------------------------------
//     // 'latency'  : both filters tuned to the SAME latency, variance floats
//     //              (what the professor asked for).
//     // 'variance' : both filters tuned to the SAME variance, latency floats
//     //              (the previous pilot design).
//     // Toggle at runtime with: window.FITTS_MATCH_BY = 'variance'  (then restart).
//     const MATCH_BY = (typeof window !== 'undefined' && window.FITTS_MATCH_BY)
//       ? window.FITTS_MATCH_BY
//       : 'latency';
//     if (MATCH_BY === 'latency') {
//       console.log('🧭 Pairing mode: LATENCY-MATCHED');
//       const latPairs = this.computeLatencyMatchedPairs(MAX_LATENCY_MS, MAX_VARIANCE_PX);
//       // A degenerate/failed calibration returns an {error, message} object. Pass
//       // it up so the experiment STOPS — never silently fall back to variance-
//       // matched (that is a different study design).
//       if (latPairs && latPairs.error) return latPairs;
//       if (Array.isArray(latPairs) && latPairs.length) return latPairs;
//       return {
//         error: 'LATENCY_MATCH_FAILED',
//         message: 'Could not build latency-matched pairs from the current Pareto data. '
//           + 'Please redo calibration before starting the experiment.'
//       };
//     } else {
//       console.log('🧭 Pairing mode: VARIANCE-MATCHED (explicit override)');
//     }

//     const limitingDim = Math.min(window.innerWidth, window.innerHeight);

//     const expSorted = [...expParams].sort((a, b) => a.meanVariance - b.meanVariance);
//     const oeSorted = [...oeParams].sort((a, b) => a.meanVariance - b.meanVariance);

//     const overlapMin = Math.max(expSorted[0].meanVariance, oeSorted[0].meanVariance);
//     const overlapMaxRaw = Math.min(
//       expSorted[expSorted.length - 1].meanVariance,
//       oeSorted[oeSorted.length - 1].meanVariance
//     );
//     // Clip the upper end of the Pareto overlap by the variance cap.
//     const overlapMax = Math.min(overlapMaxRaw, MAX_VARIANCE_PX);

//     console.log(`📐 Pareto overlap: ${overlapMin.toFixed(2)} – ${overlapMaxRaw.toFixed(2)} px SD`);
//     if (overlapMax < overlapMaxRaw) {
//       console.log(`🔒 Variance cap ${MAX_VARIANCE_PX} px → upper bound clipped from `
//         + `${overlapMaxRaw.toFixed(2)} to ${overlapMax.toFixed(2)} px SD`);
//     }
//     if (overlapMax <= overlapMin) {
//       console.warn("⚠️ Variance cap leaves no usable range — falling back to raw overlap");
//       // graceful fallback if MAX_VARIANCE_PX is set too aggressively for this Pareto front
//       return null;
//     }

//     const worstLatencyAtSD = (sd) => {
//       const exp = this.interpolateParams(sd, expSorted, 'exponential');
//       const oe = this.interpolateParams(sd, oeSorted, 'oneEuro');
//       if (!exp || !oe) return Infinity;
//       return Math.max(exp.meanLatency, oe.meanLatency);
//     };

//     // --- Step 1: find the capped lower bound (lowest SD where worst latency <= cap) ---
//     const margin = (overlapMax - overlapMin) * 0.02;
//     let cappedMin = overlapMin + margin;
//     const highSD = overlapMax - margin;

//     if (worstLatencyAtSD(cappedMin) > MAX_LATENCY_MS) {
//       // Binary search for the SD where worst-case latency == cap
//       let lo = cappedMin, hi = highSD;
//       for (let iter = 0; iter < 40; iter++) {
//         const mid = (lo + hi) / 2;
//         if (worstLatencyAtSD(mid) > MAX_LATENCY_MS) lo = mid;
//         else hi = mid;
//       }
//       cappedMin = hi;
//     }

//     const cappedMinLatency = worstLatencyAtSD(cappedMin);
//     const highLatency = worstLatencyAtSD(highSD);
//     console.log(`🔒 Usable SD range after both caps: ${cappedMin.toFixed(2)} – ${highSD.toFixed(2)} px`);
//     console.log(`   Latency range: ${cappedMinLatency.toFixed(0)}ms (smoothest) – ${highLatency.toFixed(0)}ms (most responsive)`);

//     if (cappedMin >= highSD) {
//       console.warn("⚠️ Latency cap and variance cap conflict — no valid range exists. " +
//         "Exponential filter needs >" + MAX_VARIANCE_PX + "px SD to drop below " +
//         MAX_LATENCY_MS + "ms. Falling back to hardcoded pairs.");
//       return null;
//     }

//     // --- Step 2: pick 3 levels with equal latency spacing ---
//     const targetLatencies = [
//       cappedMinLatency,
//       (cappedMinLatency + highLatency) / 2,
//       highLatency
//     ];

//     const sdForLatency = (targetLat) => {
//       // Higher SD → lower latency, so search from cappedMin to highSD
//       let lo = cappedMin, hi = highSD;
//       for (let iter = 0; iter < 40; iter++) {
//         const mid = (lo + hi) / 2;
//         if (worstLatencyAtSD(mid) > targetLat) lo = mid;
//         else hi = mid;
//       }
//       return (lo + hi) / 2;
//     };

//     const targetSDs = [
//       { level: 'Low',    sd: sdForLatency(targetLatencies[0]) },
//       { level: 'Medium', sd: sdForLatency(targetLatencies[1]) },
//       { level: 'High',   sd: sdForLatency(targetLatencies[2]) }
//     ];

//     console.log(`🎯 Equal-latency SDs:`);
//     for (const t of targetSDs) {
//       console.log(`   ${t.level}: SD=${t.sd.toFixed(2)}, worst latency=${worstLatencyAtSD(t.sd).toFixed(0)}ms`);
//     }

//     // Sanity check: if the 3 levels are too close together (within 1px SD),
//     // the conditions won't feel different. Fall back to hardcoded pairs.
//     const sdSpread = targetSDs[2].sd - targetSDs[0].sd;
//     if (sdSpread < 1.0) {
//       console.warn(`⚠️ Computed levels too similar (spread=${sdSpread.toFixed(2)} px). Falling back to hardcoded pairs.`);
//       return null;
//     }

//     const pairs = [];
//     for (const target of targetSDs) {
//       const exp = this.interpolateParams(target.sd, expSorted, 'exponential');
//       const oe = this.interpolateParams(target.sd, oeSorted, 'oneEuro');
//       if (!exp || !oe) return null;

//       const normPct = (target.sd / limitingDim) * 100;
//       const worstLat = Math.max(exp.meanLatency, oe.meanLatency);

//       pairs.push({
//         pairNumber: pairs.length + 1,
//         description: `${target.level} Variance (latency ~${worstLat.toFixed(0)}ms) - Interpolated`,
//         variance: target.sd,
//         varianceNormPct: normPct,
//         exponential: {
//           rank: exp.interpolated ? 'interp' : (exp.rank || '?'),
//           alpha: exp.alpha,
//           variance: target.sd,
//           latency: exp.meanLatency
//         },
//         oneEuro: {
//           rank: oe.interpolated ? 'interp' : (oe.rank || '?'),
//           minCutoff: oe.minCutoff,
//           beta: oe.beta,
//           dCutoff: oe.dCutoff,
//           variance: target.sd,
//           latency: oe.meanLatency
//         }
//       });

//       console.log(`  ✅ ${target.level} (SD=${target.sd.toFixed(2)}): Exp latency=${exp.meanLatency.toFixed(0)}ms, OE latency=${oe.meanLatency.toFixed(0)}ms`);
//     }

//     return pairs;
//   }

//   // Generate layouts (4 layouts: 2 sizes × 2 amplitudes)
//   generateLayouts() {
//     const layouts = [];
//     const { targetSizePercents, amplitudePercents, directionSequence } = this.config;
    
//     // Convert percentages to pixels based on limiting dimension (adapts to orientation)
//     const targetSizes = targetSizePercents.map(p => this.percentToPixels(p));
//     const amplitudes = amplitudePercents.map(p => this.percentToPixels(p));
    
//     const limitingDimension = Math.min(window.innerWidth, window.innerHeight);
    
//     // For each size × amplitude combination
//     for (const size of targetSizes) {
//       for (const amplitude of amplitudes) {
//         // Use 95% safe area for largest amplitude, 85% for others
//         // This allows testing larger distances while maintaining safety for smaller configs
//         const isLargestAmplitude = amplitude === Math.max(...amplitudes);
//         const safeAreaPercent = isLargestAmplitude ? 0.95 : 0.85;
//         const safeRadius = (limitingDimension / 2) * safeAreaPercent;
        
//         // Validate that target fits within safe viewing area
//         const targetRadius = size / 2;
//         const requiredRadius = amplitude + targetRadius;
        
//         // Auto-scale if needed (with warning)
//         let finalAmplitude = amplitude;
//         if (requiredRadius > safeRadius) {
//           finalAmplitude = safeRadius - targetRadius;
//           console.warn(`⚠️ Layout (size=${size}px, amp=${amplitude}px) exceeds safe area (${safeAreaPercent*100}%). Auto-scaled amplitude to ${finalAmplitude.toFixed(0)}px`);
//         }
        
//         layouts.push({
//           targetSize: size,
//           amplitude: finalAmplitude,
//           originalAmplitude: amplitude, // Store original for reference
//           sequence: [...directionSequence] // 8 directions in specific order
//         });
//       }
//     }
    
//     return layouts;
//   }
  
//   // Get current layout info
//   getCurrentLayout() {
//     if (this.currentLayoutIndex < this.layouts.length) {
//       return this.layouts[this.currentLayoutIndex];
//     }
//     return null;
//   }
  
//   // Get current variance-matched pair
//   getCurrentPair() {
//     if (this.currentPairIndex < this.config.varianceMatchedPairs.length) {
//       return this.config.varianceMatchedPairs[this.currentPairIndex];
//     }
//     return null;
//   }
  
//   // Get current filter type (respects counterbalanced filter order)
//   getCurrentFilter() {
//     // Filter-block mode: the filter is fixed for the whole segment, so there is
//     // no inner filter-phase switching — every pair in the segment uses the
//     // segment's filter.
//     if (this._useFilterBlockOrder && this._activeSegment) {
//       return this._activeSegment.filter;
//     }
//     const first = this.counterbalanceCondition?.filterFirst || 'exponential';
//     const second = first === 'exponential' ? 'oneEuro' : 'exponential';
//     return this.currentFilterPhase === 0 ? first : second;
//   }
  
//   // Get current filter configuration (rank and parameters)
//   getCurrentFilterConfig() {
//     const pair = this.getCurrentPair();
//     if (!pair) return null;
    
//     const filterType = this.getCurrentFilter();
//     return filterType === "exponential" ? pair.exponential : pair.oneEuro;
//   }
  
//   // Get current direction in sequence
//   getCurrentDirection() {
//     const layout = this.getCurrentLayout();
//     if (layout && this.currentTrialInLayout < layout.sequence.length) {
//       return layout.sequence[this.currentTrialInLayout];
//     }
//     return null;
//   }
  
//   hideNonEssentialControls() {
//     const trackingControls = document.querySelector('.tracking-controls');
//     if (!trackingControls) return;

//     if (isTestMode()) {
//       // Test mode: keep filter controls visible, hide the rest
//       const allSections = trackingControls.querySelectorAll('[data-control-type]');
//       allSections.forEach(section => {
//         if (section.getAttribute('data-control-type') !== 'filter-control') {
//           section.style.display = 'none';
//         }
//       });
//       const title = trackingControls.querySelector('h3');
//       if (title) {
//         title.textContent = 'Fitts\' Law Experiment';
//         title.style.color = '#64c8ff';
//       }
//       this.addExperimentPhaseIndicator();
//     } else {
//       // User mode: hide everything except the Back to Start button
//       Array.from(trackingControls.children).forEach(child => {
//         const isBackBtn = child.textContent.includes('Back to Start');
//         if (!isBackBtn) {
//           child.style.display = 'none';
//         }
//       });
//     }

//     trackingControls.style.maxWidth = '280px';
//   }
  
//   addExperimentPhaseIndicator() {
//     if (!isTestMode()) return;

//     const trackingControls = document.querySelector('.tracking-controls');
//     if (!trackingControls) return;
//     trackingControls.style.fontSize = '11px';

//     const existing = document.getElementById('fitts-phase-indicator');
//     if (existing) existing.remove();

//     const pair = this.getCurrentPair();
//     const filterType = this.getCurrentFilter();
//     const filterConfig = this.getCurrentFilterConfig();
//     const filterName = filterType === "exponential" ? "Exponential Smoothing" : "One Euro Filter";
//     const globalPhase = (this.currentPairIndex * 2) + this.currentFilterPhase + 1;

//     const indicator = document.createElement('div');
//     indicator.id = 'fitts-phase-indicator';
//     indicator.style.cssText = 'background: rgba(100,200,255,0.15); border: 1px solid rgba(100,200,255,0.5); border-radius: 3px; padding: 6px; margin-bottom: 8px; color: #64c8ff; font-size: 10px; line-height: 1.3;';
//     indicator.innerHTML = `
//       <div style="font-weight:bold; margin-bottom:2px; font-size:10px;">Phase ${globalPhase}/${this.config.varianceMatchedPairs.length * 2}</div>
//       <div style="font-size:9px; color:#ffc864; font-weight:bold;">Pair ${pair.pairNumber}: Variance ~${Number(pair.variance).toFixed(1)}</div>
//       <div style="font-size:9px; color:#aaa; margin-top:2px;">${filterName}</div>
//       <div style="font-size:8px; color:#888; margin-top:2px;">${isNaN(Number(filterConfig.rank)) ? 'Interpolated' : 'Rank ' + filterConfig.rank} | SD: ${filterConfig.variance.toFixed(2)}</div>
//     `;

//     const title = trackingControls.querySelector('h3');
//     if (title && title.nextSibling) {
//       trackingControls.insertBefore(indicator, title.nextSibling);
//     } else if (title) {
//       title.parentNode.appendChild(indicator);
//     }
//   }
  
//   restoreAllControls() {
//     const container = document.getElementById('tracking-controls-container');
//     if (!container) return;

//     if (isTestMode()) {
//       const trackingControls = document.querySelector('.tracking-controls');
//       if (trackingControls) {
//         trackingControls.style.maxWidth = '';
//         trackingControls.style.fontSize = '';
//         const allSections = trackingControls.querySelectorAll('[data-control-type]');
//         allSections.forEach(section => { section.style.display = ''; });
//         const title = trackingControls.querySelector('h3');
//         if (title) { title.textContent = 'Tracking Controls'; title.style.color = ''; }
//         const phaseIndicator = document.getElementById('fitts-phase-indicator');
//         if (phaseIndicator) phaseIndicator.remove();
//       }
//     } else {
//       // User mode: force full React re-render
//       if (window.TrackingControls && window.ReactDOM) {
//         try {
//           container.innerHTML = '';
//           const root = ReactDOM.createRoot(container);
//           root.render(React.createElement(window.TrackingControls));
//         } catch (e) {
//           console.warn('Could not re-render tracking controls:', e);
//         }
//       }
//     }

//     console.log("✅ Restored tracking controls");
//   }
  
//   // Update parameter display (Alpha, Smoothing Factor, Variance, Latency)
//   updateParameterDisplay(filterType, rank) {
//     if (filterType === 'exponential') {
//       const params = window.EXPONENTIAL_PARAMETERS?.[rank - 1];
//       if (params) {
//         const alpha = params.alpha;
//         const smoothing = 1 - alpha;
        
//         // Find and update the parameter display spans
//         const spans = document.querySelectorAll('.exponential-rank-selector span.font-mono');
//         spans.forEach(span => {
//           const text = span.textContent;
//           // Update Alpha
//           if (text.includes('.') && span.previousSibling?.textContent?.includes('Alpha')) {
//             span.textContent = alpha.toFixed(6);
//           }
//           // Update Smoothing Factor
//           if (text.includes('.') && span.previousSibling?.textContent?.includes('Smoothing')) {
//             span.textContent = smoothing.toFixed(6);
//           }
//           // Update Variance
//           if (text.includes('.') && span.previousSibling?.textContent?.includes('Variance')) {
//             span.textContent = params.meanVariance.toFixed(4);
//           }
//           // Update Latency
//           if (text.includes('ms') && span.previousSibling?.textContent?.includes('Latency')) {
//             span.textContent = params.meanLatency.toFixed(2) + ' ms';
//           }
//         });
//         console.log(`📊 Updated Exponential parameter display for Rank ${rank}`);
//       }
//     } else if (filterType === 'oneEuro') {
//       const params = window.PARETO_FRONT_PARAMETERS?.[rank - 1];
//       if (params) {
//         console.log(`🔍 Looking for One Euro parameter spans...`);
//         // Find and update the parameter display spans
//         const spans = document.querySelectorAll('.pareto-front-selector span.font-mono');
//         console.log(`   Found ${spans.length} font-mono spans`);
        
//         spans.forEach((span, index) => {
//           const text = span.textContent;
//           const prevText = span.previousSibling?.textContent || '';
//           console.log(`   Span ${index}: "${text}", Previous: "${prevText}"`);
          
//           // Update minCutoff
//           if (prevText.includes('minCutoff')) {
//             span.textContent = params.minCutoff.toFixed(6);
//             console.log(`   ✅ Updated minCutoff to ${params.minCutoff.toFixed(6)}`);
//           }
//           // Update beta
//           if (prevText.includes('beta')) {
//             span.textContent = params.beta.toFixed(6);
//             console.log(`   ✅ Updated beta to ${params.beta.toFixed(6)}`);
//           }
//           // Update dCutoff
//           if (prevText.includes('dCutoff')) {
//             span.textContent = params.dCutoff.toFixed(4);
//             console.log(`   ✅ Updated dCutoff to ${params.dCutoff.toFixed(4)}`);
//     }
//           // Update Variance (using meanVariance property)
//           if (prevText.includes('Variance')) {
//             span.textContent = params.meanVariance.toFixed(4);
//             console.log(`   ✅ Updated Variance to ${params.meanVariance.toFixed(4)}`);
//           }
//           // Update Latency (using meanLatency property)
//           if (prevText.includes('Latency')) {
//             span.textContent = params.meanLatency.toFixed(2) + ' ms';
//             console.log(`   ✅ Updated Latency to ${params.meanLatency.toFixed(2)} ms`);
//           }
//         });
        
//         console.log(`📊 One Euro parameter display update complete for Rank ${rank}`);
//       }
//     }
//   }

//   // Measure variance for all filter configurations (before experiment starts)
//   async measureVarianceForAllConfigurations() {
//     console.log("🔬 Measuring actual variance for all filter configurations...");
    
//     // Show variance measurement UI with "Ready" button
//     this.showVarianceMeasurementUI();
    
//     // Allow Space to trigger the "Press Space to Start" button.
//     const varianceSpaceHandler = (e) => {
//       if (e.code !== 'Space') return;
//       const btn = this.experimentUI?.querySelector('button.start-button');
//       if (btn && btn.style.display !== 'none') {
//         e.preventDefault();
//         btn.click();
//       }
//     };
//     document.addEventListener('keydown', varianceSpaceHandler);

//     // Wait for user to click the "Ready" button (or press Space)
//     await new Promise(resolve => {
//       window._varianceMeasurementReady = () => {
//         document.removeEventListener('keydown', varianceSpaceHandler);
//         resolve();
//       };
//     });
    
//     // HIDE CURSORS (red clipped + raw) - Professor's instruction:
//     // "You may not want to show the pointer, otherwise one would move
//     //  their head trying to control it"
//     const cursorRed = document.getElementById('head-cursor-clipped');
//     const cursorRaw = document.getElementById('head-cursor-raw');
//     const cursorRedWasVisible = cursorRed && cursorRed.style.display !== 'none';
//     const cursorRawWasVisible = cursorRaw && cursorRaw.style.display !== 'none';
//     if (cursorRed) cursorRed.style.display = 'none';
//     if (cursorRaw) cursorRaw.style.display = 'none';
//     if (cursorRed || cursorRaw) console.log("🙈 Cursors hidden during variance measurement");
    
//     if (isTestMode()) {
//       // Test mode: simple text countdown
//       for (let i = 3; i >= 1; i--) {
//         this.updateVarianceMeasurementStatus(
//           `Hold Still — Starting in ${i}...`,
//           "Keep your head completely still. The cursor is hidden."
//         );
//         await this.delay(1000);
//       }
//     } else {
//       await this.showFlashyCountdown();
//     }
    
//     console.log("Collecting raw landmark data for 5 seconds...");
//     if (isTestMode()) {
//       this.updateVarianceMeasurementStatus("Recording — Hold Still", "Collecting data for 5 seconds...");
//     } else {
//       this.showRecordingDial(this.config.varianceMeasurementDuration);
//     }
    
//     const rawSamples = await this.collectRawLandmarkData(this.config.varianceMeasurementDuration);
    
//     console.log(`Collected ${rawSamples.length} raw samples`);
//     if (!isTestMode()) this.removeFlashyOverlay();
    
//     // Now apply each filter configuration OFFLINE to the same raw data
//     console.log("🔬 Applying filters offline to measure variance...");
    
//     for (const pair of this.config.varianceMatchedPairs) {
//       // Apply exponential filter offline
//       console.log(`📊 Analyzing Pair ${pair.pairNumber} - Exponential (Rank ${pair.exponential.rank})...`);
//       const expFiltered = this.applyFilterOffline(rawSamples, "exponential", pair.exponential);
//       const expStats = this.calculateVarianceStats(expFiltered);
      
//       const limitingDim = Math.min(window.innerWidth, window.innerHeight);

//       this.varianceMeasurementResults.push({
//         part: this.currentPart,
//         pairNumber: pair.pairNumber,
//         filterType: "exponential",
//         filterRank: pair.exponential.rank,
//         expectedVariance: pair.exponential.variance,
//         measuredVariance: expStats.totalStdDev,
//         stdDevX: expStats.stdDevX,
//         stdDevY: expStats.stdDevY,
//         numSamples: expFiltered.length,
//         screenWidth: window.innerWidth,
//         screenHeight: window.innerHeight,
//         limitingDimension: limitingDim,
//         measuredVarianceNorm: (expStats.totalStdDev / limitingDim) * 100,
//         expectedVarianceNorm: (pair.exponential.variance / limitingDim) * 100
//       });
      
//       // Apply One Euro filter offline
//       console.log(`📊 Analyzing Pair ${pair.pairNumber} - One Euro (Rank ${pair.oneEuro.rank})...`);
//       const oneEuroFiltered = this.applyFilterOffline(rawSamples, "oneEuro", pair.oneEuro);
//       const oneEuroStats = this.calculateVarianceStats(oneEuroFiltered);
      
//       this.varianceMeasurementResults.push({
//         part: this.currentPart,
//         pairNumber: pair.pairNumber,
//         filterType: "oneEuro",
//         filterRank: pair.oneEuro.rank,
//         expectedVariance: pair.oneEuro.variance,
//         measuredVariance: oneEuroStats.totalStdDev,
//         stdDevX: oneEuroStats.stdDevX,
//         stdDevY: oneEuroStats.stdDevY,
//         numSamples: oneEuroFiltered.length,
//         screenWidth: window.innerWidth,
//         screenHeight: window.innerHeight,
//         limitingDimension: limitingDim,
//         measuredVarianceNorm: (oneEuroStats.totalStdDev / limitingDim) * 100,
//         expectedVarianceNorm: (pair.oneEuro.variance / limitingDim) * 100
//       });
//     }
    
//     // RESTORE CURSORS
//     if (cursorRed && cursorRedWasVisible) cursorRed.style.display = '';
//     if (cursorRaw && cursorRawWasVisible) cursorRaw.style.display = '';
//     if (cursorRedWasVisible || cursorRawWasVisible) console.log("👁️ Cursors restored");
    
//     console.log("✅ Variance measurement complete!");
//     console.log("Results:", this.varianceMeasurementResults);
    
//     // Show results to user
//     this.showVarianceMeasurementResults();
//   }
  
//   // Show calibration UI with a big center blue circle and a "Ready" button
//   showVarianceMeasurementUI() {
//     this.experimentUI.innerHTML = `
//       <div class="experiment-instructions" style="
//         text-align: center; padding: 40px; max-width: 640px; margin: 0 auto;
//         display: flex; flex-direction: column; align-items: center;
//       ">
//         <h2 style="font-size: 28px; margin: 0 0 12px;">Calibration</h2>
//         <p style="font-size: 19px; color: #ddd; margin: 6px 0 22px; line-height: 1.5;">
//           Move your head to the blue circle below. Then keep steady until the dial finishes filling.
//         </p>

//         <div style="
//           width: 140px; height: 140px; border-radius: 50%;
//           background: radial-gradient(circle, #2a4a6a 0%, #16324a 100%);
//           border: 4px solid #64c8ff;
//           box-shadow: 0 0 20px rgba(100, 200, 255, 0.5);
//           margin: 4px 0 24px;
//         "></div>

//         <div id="variance-status" style="
//           background: rgba(100, 200, 255, 0.2);
//           padding: 16px 24px; border-radius: 8px;
//           margin: 8px 0 14px; text-align: center; display: none;
//         ">
//           <div style="font-size: 20px; font-weight: bold; color: #64c8ff;">Preparing...</div>
//         </div>

//         <button class="experiment-button start-button" onclick="document.getElementById('variance-status').style.display='block'; this.style.display='none'; if(window._varianceMeasurementReady) window._varianceMeasurementReady();" style="
//           margin-top: 4px; padding: 16px 40px; font-size: 18px; font-weight: bold;
//         ">
//           Press Space to Start
//         </button>
//       </div>
//     `;
//   }
  
//   // Update variance measurement status
//   updateVarianceMeasurementStatus(message, submessage = "") {
//     const statusDiv = document.getElementById('variance-status');
//     if (statusDiv) {
//       statusDiv.innerHTML = `
//         <div style="font-size: 14px; font-weight: bold; color: #64c8ff;">
//           ${message}
//         </div>
//         ${submessage ? `<div style="font-size: 11px; color: #aaa; margin-top: 5px;">${submessage}</div>` : ''}
//       `;
//     }
//   }
  
//   // Collect raw landmark data (no filtering)
//   async collectRawLandmarkData(duration) {
//     const samples = [];
//     const startTime = performance.now();
    
//     return new Promise((resolve) => {
//       const collectInterval = setInterval(() => {
//         // Collect RAW landmark data (before any filtering)
//         if (window.state.lastLandmarks && window.state.lastHeadX !== null && window.state.lastHeadY !== null) {
//           samples.push({
//             timestamp: performance.now() - startTime,
//             headX: window.state.lastHeadX,
//             headY: window.state.lastHeadY
//           });
//         }
//       }, 16); // ~60fps
      
//       // Stop after duration
//       setTimeout(() => {
//         clearInterval(collectInterval);
//         resolve(samples);
//       }, duration);
//     });
//   }
  
//   // Apply filter offline to raw data
//   applyFilterOffline(rawSamples, filterType, filterConfig) {
//     if (filterType === "exponential") {
//       // Apply exponential smoothing
//       const alpha = filterConfig.alpha;
//       const smoothingFactor = 1 - alpha;
      
//       const filtered = [];
//       let smoothedX = rawSamples[0]?.headX || 0;
//       let smoothedY = rawSamples[0]?.headY || 0;
      
//       for (const sample of rawSamples) {
//         smoothedX = smoothingFactor * smoothedX + alpha * sample.headX;
//         smoothedY = smoothingFactor * smoothedY + alpha * sample.headY;
//         filtered.push({ x: smoothedX, y: smoothedY });
//       }
      
//       return filtered;
//     } else if (filterType === "oneEuro") {
//       // Apply One Euro filter
//       const filtered = [];
      
//       // Initialize 2D One Euro filter
//       if (!window.OneEuroFilter2D) {
//         console.error("OneEuroFilter2D not available!");
//         return rawSamples.map(s => ({ x: s.headX, y: s.headY }));
//       }
      
//       const filter2D = new window.OneEuroFilter2D(60, filterConfig.minCutoff, filterConfig.beta, filterConfig.dCutoff);
      
//       for (const sample of rawSamples) {
//         const result = filter2D.filter(sample.headX, sample.headY, sample.timestamp / 1000);
//         filtered.push({ x: result.x, y: result.y });
//       }
      
//       return filtered;
//     }
    
//     return rawSamples.map(s => ({ x: s.headX, y: s.headY }));
//   }
  
//   // Calculate variance statistics
//   calculateVarianceStats(samples) {
//     if (samples.length === 0) {
//       return { stdDevX: 0, stdDevY: 0, totalStdDev: 0 };
//     }
    
//     // Calculate mean
//     const meanX = samples.reduce((sum, s) => sum + s.x, 0) / samples.length;
//     const meanY = samples.reduce((sum, s) => sum + s.y, 0) / samples.length;
    
//     // Calculate variance
//     const varianceX = samples.reduce((sum, s) => sum + Math.pow(s.x - meanX, 2), 0) / samples.length;
//     const varianceY = samples.reduce((sum, s) => sum + Math.pow(s.y - meanY, 2), 0) / samples.length;
    
//     // Standard deviation
//     const stdDevX = Math.sqrt(varianceX);
//     const stdDevY = Math.sqrt(varianceY);
    
//     // Combined standard deviation (Euclidean)
//     const totalStdDev = Math.sqrt(stdDevX * stdDevX + stdDevY * stdDevY);
    
//     return { stdDevX, stdDevY, totalStdDev };
//   }
  
//   showVarianceMeasurementResults() {
//     console.log('Variance measurement results:', this.varianceMeasurementResults);

//     if (isTestMode()) {
//       // Test mode: show detailed per-filter variance stats
//       let resultsHTML = `<div class="experiment-instructions"><h2>Calibration Complete</h2>
//         <p style="font-size:11px; color:#aaa; margin:8px 0;">Actual variance measured in current lighting conditions</p>`;
//       for (let i = 0; i < this.config.varianceMatchedPairs.length; i++) {
//         const pair = this.config.varianceMatchedPairs[i];
//         const pairResults = this.varianceMeasurementResults.filter(
//           r => r.pairNumber === pair.pairNumber && r.part === this.currentPart
//         );
//         if (pairResults.length === 0) continue;
//         resultsHTML += `<div style="background:rgba(255,200,100,0.15); padding:8px; border-radius:4px; margin:8px 0; border-left:3px solid #ffc864;">
//           <h4 style="color:#ffc864; margin:0 0 5px 0; font-size:12px;">Pair ${pair.pairNumber}: Variance ~${Number(pair.variance).toFixed(1)}</h4>`;
//         for (const result of pairResults) {
//           const filterName = result.filterType === "exponential" ? "Exponential" : "One Euro";
//           const match = Math.abs(result.measuredVariance - result.expectedVariance) / result.expectedVariance;
//           const matchIcon = match < 0.2 ? "✅" : (match < 0.5 ? "⚠️" : "❌");
//           resultsHTML += `<div style="background:rgba(50,50,50,0.6); padding:6px; border-radius:3px; margin:4px 0; font-size:10px;">
//             <div style="font-weight:bold; color:#64ff64; font-size:11px;">${filterName} (Rank ${result.filterRank})</div>
//             <div style="margin-top:3px;">Expected: ${result.expectedVariance.toFixed(2)}px | Measured: <strong>${result.measuredVariance.toFixed(2)}px</strong> ${matchIcon}</div>
//             <div style="font-size:9px; color:#888; margin-top:2px;">X: ${result.stdDevX.toFixed(2)}px, Y: ${result.stdDevY.toFixed(2)}px (${result.numSamples} samples)</div>
//           </div>`;
//         }
//         resultsHTML += `</div>`;
//       }
//       resultsHTML += `<button class="experiment-button continue-button" onclick="window.fittsExperiment._afterVarianceMeasurement()">Continue to Experiment</button></div>`;
//       this.experimentUI.innerHTML = resultsHTML;
//     } else {
//       this.experimentUI.innerHTML = `
//         <div class="experiment-instructions" style="text-align: center; padding: 40px;">
//           <h2 style="color: #22cc66;">Calibration Complete</h2>
//           <p style="color: #aaa; font-size: 16px; margin: 20px 0;">
//             Recording complete. Results will be saved with your experiment data.
//           </p>
//           <button class="experiment-button continue-button" onclick="window.fittsExperiment._afterVarianceMeasurement()">
//             Continue to Experiment (or press Space)
//           </button>
//         </div>
//       `;
//     }
//   }
  
//   // Helper: delay function
//   delay(ms) {
//     return new Promise(resolve => setTimeout(resolve, ms));
//   }

//   // Show a fullscreen message overlay (clean, no pulsing animation)
//   showFlashyMessage(text, color = '#ff4444', duration = 1000) {
//     let overlay = document.getElementById('flashy-countdown-overlay');
//     if (!overlay) {
//       overlay = document.createElement('div');
//       overlay.id = 'flashy-countdown-overlay';
//       overlay.style.cssText = `
//         position: fixed; top: 0; left: 0; width: 100%; height: 100%;
//         z-index: 99999; display: flex; align-items: center; justify-content: center;
//         flex-direction: column;
//         background: rgba(0, 0, 0, 0.85); pointer-events: none;
//       `;
//       document.body.appendChild(overlay);
//     }
//     overlay.innerHTML = `
//       <div style="
//         font-size: 72px; font-weight: 900; color: ${color};
//         text-align: center; letter-spacing: 2px;
//       ">${text}</div>
//     `;
//     if (duration > 0) {
//       return new Promise(resolve => setTimeout(() => {
//         overlay.remove();
//         resolve();
//       }, duration));
//     }
//   }
  
//   removeFlashyOverlay() {
//     const overlay = document.getElementById('flashy-countdown-overlay');
//     if (overlay) overlay.remove();
//   }
  
//   // Show a recording progress dial (fills up over duration)
//   showRecordingDial(duration) {
//     let overlay = document.getElementById('flashy-countdown-overlay');
//     if (!overlay) {
//       overlay = document.createElement('div');
//       overlay.id = 'flashy-countdown-overlay';
//       overlay.style.cssText = `
//         position: fixed; top: 0; left: 0; width: 100%; height: 100%;
//         z-index: 99999; display: flex; align-items: center; justify-content: center;
//         flex-direction: column;
//         background: rgba(0, 0, 0, 0.85); pointer-events: none;
//       `;
//       document.body.appendChild(overlay);
//     }
    
//     overlay.innerHTML = `
//       <div style="font-size: 32px; font-weight: bold; color: #ff4444; margin-bottom: 24px;">
//         Hold still
//       </div>
//       <div style="position: relative; width: 120px; height: 120px;">
//         <svg width="120" height="120" viewBox="0 0 120 120">
//           <circle cx="60" cy="60" r="50" fill="none" stroke="#333" stroke-width="8"/>
//           <circle id="recording-dial-circle" cx="60" cy="60" r="50" fill="none"
//             stroke="#64c8ff" stroke-width="8" stroke-linecap="round"
//             stroke-dasharray="314.16" stroke-dashoffset="314.16"
//             transform="rotate(-90 60 60)"/>
//         </svg>
//         <div id="recording-dial-text" style="
//           position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
//           font-size: 18px; font-weight: bold; color: #ccc;
//         ">Recording...</div>
//       </div>
//     `;
//     document.body.appendChild(overlay);

//     const startTime = performance.now();
//     const totalDash = 314.16;
//     const animFrame = () => {
//       const elapsed = performance.now() - startTime;
//       const progress = Math.min(elapsed / duration, 1);
//       const circle = document.getElementById('recording-dial-circle');
//       if (circle) {
//         circle.setAttribute('stroke-dashoffset', totalDash * (1 - progress));
//       }
//       if (progress < 1) {
//         requestAnimationFrame(animFrame);
//       }
//     };
//     requestAnimationFrame(animFrame);
//   }
  
//   // Countdown: 3 → 2 → 1 → "Prepare to hold still" → recording with dial
//   async showFlashyCountdown() {
//     await this.showFlashyMessage("3", "#ccc", 1000);
//     await this.showFlashyMessage("2", "#ccc", 1000);
//     await this.showFlashyMessage("1", "#ccc", 1000);
//     await this.showFlashyMessage("Prepare to hold still", "#ffaa00", 1200);
//   }

//   // Simple visual update of slider and filter buttons - no events, no React
//   updateSliderVisual(filterType, rank) {
//     // Click the button to let React render the correct slider, but store params to reapply after
//     const filterButtons = document.querySelectorAll('.filter-buttons button');
//     let needsClick = false;
    
//     filterButtons.forEach(btn => {
//       const btnText = btn.textContent.trim();
//       const isExpButton = btnText === 'Exponential';
//       const isOneEuroButton = btnText === '1€ Filter';
      
//       // Click the button if it's not already active
//       if ((filterType === 'exponential' && isExpButton && !btn.classList.contains('active-filter')) ||
//           (filterType === 'oneEuro' && isOneEuroButton && !btn.classList.contains('active-filter'))) {
//         console.log(`🖱️ Clicking ${btnText} button to switch view`);
//         btn.click();
//         needsClick = true;
//       }
//     });
    
//     // Wait for React to render, then update slider and re-apply our parameters
//     const numericRank = Number(rank);
//     const isInterpolated = isNaN(numericRank);
    
//     setTimeout(() => {
//       if (filterType === 'exponential') {
//         const slider = document.querySelector('.exponential-rank-selector input[type="range"]');
//         const rankText = document.querySelector('.exponential-rank-selector span.text-sm.font-bold');
        
//         if (!isInterpolated && slider) {
//           slider.value = numericRank;
//         }
//         if (rankText) {
//           const totalRanks = window.EXPONENTIAL_PARAMETERS ? window.EXPONENTIAL_PARAMETERS.length : 107;
//           rankText.textContent = isInterpolated ? `interpolated` : `${numericRank} / ${totalRanks}`;
//         }
//         console.log(`📊 UI updated: Exponential ${isInterpolated ? 'interpolated' : 'Rank ' + numericRank}`);
//       } else if (filterType === 'oneEuro') {
//         const slider = document.querySelector('.pareto-front-selector input[type="range"]');
//         const rankText = document.querySelector('.pareto-front-selector span.text-sm.font-bold');
        
//         if (!isInterpolated && slider) {
//           slider.value = numericRank;
//           console.log(`✅ One Euro slider value set to ${numericRank}`);
//         } else if (isInterpolated) {
//           console.log(`✅ One Euro using interpolated params, slider unchanged`);
//         } else {
//           console.warn('⚠️ One Euro slider not found!');
//         }
//         if (rankText) {
//           const totalRanks = window.PARETO_FRONT_PARAMETERS ? window.PARETO_FRONT_PARAMETERS.length : 85;
//           rankText.textContent = isInterpolated ? `interpolated` : `${numericRank} / ${totalRanks}`;
//           console.log(`✅ One Euro rank text set to ${isInterpolated ? 'interpolated' : numericRank + ' / ' + totalRanks}`);
//         } else {
//           console.warn('⚠️ One Euro rank text not found!');
//         }
//         console.log(`📊 UI updated: One Euro Rank ${rank}`);
//       }
      
//       // Update parameter display
//       this.updateParameterDisplay(filterType, rank);
//     }, 100); // Short delay for React to render
//   }
  
//   // Start the experiment
//   async start() {
//     if (this.isRunning) {
//       console.warn("Experiment already running");
//       return;
//     }
    
//     // Check if tracking is active
//     if (!window.state || !window.state.isTracking) {
//       alert("Error: Head tracking is not active!\n\nPlease make sure:\n1. You've completed calibration OR loaded a calibration file\n2. Face tracking is turned ON\n3. Your face is visible to the webcam\n\nIf you just loaded a calibration file, try refreshing the page and loading it again.");
//       console.error("Cannot start experiment: tracking not active");
//       console.error("Debug info:", {
//         stateExists: !!window.state,
//         isTracking: window.state?.isTracking,
//         hasMatrices: !!(window.state?.transformationMatrices?.threePoint2d || window.state?.transformationMatrices?.threePoint3d),
//         cursorPosition: { x: window.state?.cursorX, y: window.state?.cursorY }
//       });
//       return;
//     }
    
//     // Show participant ID screen and wait for input
//     await this.showParticipantIDScreen();
    
//     console.log(`Starting Fitts' Law Experiment — Participant: ${this.participantId}`);
    
//     // Dynamically compute variance-matched pairs from Pareto data if available
//     if (window.EXPONENTIAL_PARAMETERS && window.PARETO_FRONT_PARAMETERS) {
//       const dynamicPairs = this.computeInterpolatedPairs();
//       // Hard stop on a failed/degenerate calibration: show the experimenter the
//       // reason and abort, instead of running with hardcoded or variance-matched
//       // pairs that would produce unusable (perceptually identical) conditions.
//       if (dynamicPairs && dynamicPairs.error) {
//         alert('⚠️ Cannot start the experiment — calibration problem\n\n' + dynamicPairs.message);
//         console.error('🛑 Experiment blocked:', dynamicPairs.message);
//         return;
//       }
//       if (Array.isArray(dynamicPairs) && dynamicPairs.length) {
//         this.config.varianceMatchedPairs = dynamicPairs;
//         console.log("✅ Using dynamically computed latency-matched pairs");
//       } else {
//         console.warn("⚠️ Interpolation returned nothing usable, using hardcoded fallback pairs");
//       }
//     } else {
//       console.warn("⚠️ No Pareto data available, using hardcoded fallback pairs");
//     }
    
//     // Save all pairs before reordering (needed for Part B medium selection)
//     this.allVarianceMatchedPairs = [...this.config.varianceMatchedPairs];
    
//     // Apply counterbalanced variance ordering
//     if (this.counterbalanceCondition) {
//       const reordered = this.counterbalanceCondition.varianceOrder.map(i => this.config.varianceMatchedPairs[i]);
//       this.config.varianceMatchedPairs = reordered;
//       console.log(`🔀 Variance order: ${this.counterbalanceCondition.varianceOrderLabel}`);
//     }
    
//     // Save Part A's pairs and set initial part based on counterbalancing.
//     // In filter-block mode the session always begins with a personal-calibration
//     // block (Part A); the standard tests are appended at the end of each filter
//     // block instead of being a "Part B first" condition.
//     this.partAVariancePairs = [...this.config.varianceMatchedPairs];
//     this.currentPart = (!this._useFilterBlockOrder && this.counterbalanceCondition?.partFirst === 'B')
//       ? 'Part B' : 'Part A';
    
//     // If Part B first (legacy interleaved flow only), use only medium variance pair
//     if (!this._useFilterBlockOrder && this.currentPart === 'Part B') {
//       this.config.varianceMatchedPairs = [this.allVarianceMatchedPairs[1]];
//       console.log(`🔬 Starting with Part B (standard calibration, medium variance only)`);
//     }
    
//     // Hide non-essential controls, keeping only filter controls
//     this.hideNonEssentialControls();
    
//     // Generate layouts (4 layouts: 2 sizes × 2 amplitudes)
//     this.layouts = this.generateLayouts();
//     this.currentPairIndex = 0; // Start with Pair 1
//     this.currentLayoutIndex = 0;
//     this.currentFilterPhase = 0; // Start with exponential within pair
//     this.currentTrialInLayout = 0;
//     this.trialData = [];
//     this.completedPaths = [];
//     this.completedTrials = 0;
    
//     // Calculate total trials: 3 pairs × 2 filters × layouts × 8 trials
//     this.totalTrials = this.config.varianceMatchedPairs.length * 2 * this.layouts.length * this.config.trialsPerLayout;
    
//     // Create UI
//     this.createUI();
    
//     // Apply fixed configuration (2D, 3 landmarks)
//     await this.applyConfiguration();
    
//     // Snapshot the participant's PERSONAL fresh calibration *before* we do
//     // anything that might overwrite it. We need this for two cases:
//     //   1. counterbalance "Part B first" → standard load happens below, but
//     //      Part A still needs the personal calibration restored after Part B.
//     //   2. counterbalance "Part A first" → snapshot is just a safety net.
//     this._snapshotPersonalCalibration();

//     // Measure variance ONCE, before the experiment starts — regardless of
//     // which part comes first in the counterbalance order. It always runs with
//     // the participant's fresh personal calibration (before any standard-cal
//     // swap) and over the FULL set of variance pairs, so the data is identical
//     // no matter the part order.
//     console.log("🔬 Variance measurement phase (runs once, before the experiment)...");
//     const reducedPairs = this.config.varianceMatchedPairs;
//     this.config.varianceMatchedPairs = this.partAVariancePairs;
//     const varianceContinue = new Promise(resolve => { this._varianceContinueResolve = resolve; });
//     await this.measureVarianceForAllConfigurations();
//     await varianceContinue;
//     this.config.varianceMatchedPairs = reducedPairs;

//     // Filter-block order (June 2026): build the 4 segments and run them in
//     // sequence. Segment 0 is personal calibration (already loaded), so no swap
//     // is needed before it starts.
//     if (this._useFilterBlockOrder) {
//       this._buildSegments();
//       await this._startSegment(0);
//       return;
//     }

//     if (this.currentPart === 'Part B') {
//       // Counterbalance condition is "Part B first". Before running any
//       // trials, we MUST swap to the frozen standard calibration — otherwise
//       // Part B would silently run with the participant's fresh personal cal
//       // (the previous bug).
//       const swapOk = await this._showStartingPartBStandardSwapScreen();
//       if (!swapOk) {
//         console.error('Standard-calibration swap failed at session start. Aborting.');
//         return;
//       }
//       // Re-create UI (the swap screen overwrote experimentUI.innerHTML).
//       this.createUI();
//       this.hideNonEssentialControls();
//       this.addExperimentPhaseIndicator();
//       await this.applyConfiguration();
//     }

//     // Save calibration info for this part *after* any swap has happened, so
//     // partB-info.txt's "Calibration Source" line reflects the post-swap
//     // source ("Uploaded: standard-calibration.csv") rather than the
//     // pre-swap personal one.
//     this.calibrationInfo[this.currentPart] = window.state?.calibrationSource || 'Session calibration';
//     this.calibrationKind[this.currentPart] = this._currentCalibrationKind;
//     console.log(`[swap] ${this.currentPart} will run under: ${this._currentCalibrationKind} calibration`);

//     this.continueToExperimentStart();
//   }

//   // Called by the "Continue" button after variance measurement. When start()
//   // is awaiting the measurement (the once-per-session pre-experiment run),
//   // resolve its promise; otherwise fall back to the old direct flow.
//   _afterVarianceMeasurement() {
//     if (this._varianceContinueResolve) {
//       const resolve = this._varianceContinueResolve;
//       this._varianceContinueResolve = null;
//       resolve();
//     } else {
//       this.continueToExperimentStart();
//     }
//   }

//   // ---- Calibration edge-check (Manduchi, May 2026) ----
//   // Sanity check the calibration: walk the participant through reaching the
//   // four screen edges (top / bottom / left / right). If any edge can't be
//   // reached within a generous timeout, offer to recalibrate before they
//   // commit to the full experiment.
//   //
//   // Returns a Promise<boolean>: true if all edges reached (or user clicked
//   // "Continue Anyway"), false if the user chose to recalibrate (in which
//   // case the experiment is aborted from this call site).
//   async runCalibrationEdgeCheck() {
//     console.log("🎯 Starting calibration edge-check");

//     const W = window.innerWidth;
//     const H = window.innerHeight;
//     const targetSize = Math.max(80, this.percentToPixels(10));
//     const r = targetSize / 2;
//     // Place targets so their CENTER sits 8% in from each edge (clearly off-center
//     // but reachable with normal head movement if calibration is good).
//     const insetVert = 0.08;
//     const insetHoriz = 0.04;
//     const edges = [
//       { id: 'top',    label: 'Top edge',    x: W / 2,                y: H * insetVert },
//       { id: 'bottom', label: 'Bottom edge', x: W / 2,                y: H * (1 - insetVert) },
//       { id: 'left',   label: 'Left edge',   x: W * insetHoriz,       y: H / 2 },
//       { id: 'right',  label: 'Right edge',  x: W * (1 - insetHoriz), y: H / 2 }
//     ];

//     // Intro screen
//     await new Promise(resolve => {
//       this.experimentUI.innerHTML = `
//         <div style="background: rgba(30,30,40,0.98); border: 2px solid #64c8ff;
//                     border-radius: 12px; padding: 36px; max-width: 600px; margin: 60px auto;
//                     text-align: center;">
//           <h2 style="color: #64c8ff; margin: 0 0 8px;">Calibration Check</h2>
//           <p style="color: #ccc; font-size: 15px; line-height: 1.55; margin: 14px 0;">
//             Let's make sure your calibration covers the whole screen. You'll see
//             a target near each edge in turn. Move your head until the cursor
//             touches the target.
//           </p>
//           <p style="color: #aaa; font-size: 13px; margin: 18px 0 8px;">
//             You have 12 seconds per edge. If you can't reach one, we'll offer
//             to recalibrate.
//           </p>
//           <button id="edge-check-start" class="experiment-button start-button"
//                   style="padding: 14px 32px; font-size: 16px; font-weight: bold;">
//             Press Space to Begin
//           </button>
//         </div>`;
//       const go = () => {
//         document.removeEventListener('keydown', kh);
//         resolve();
//       };
//       const kh = (e) => { if (e.code === 'Space') { e.preventDefault(); go(); } };
//       document.addEventListener('keydown', kh);
//       document.getElementById('edge-check-start').addEventListener('click', go);
//     });

//     const failed = [];
//     const EDGE_TIMEOUT_MS = 12000;

//     // Run each edge sequentially.
//     for (const edge of edges) {
//       const passed = await this._checkOneEdge(edge, r, EDGE_TIMEOUT_MS);
//       if (!passed) failed.push(edge);
//     }

//     // Clear edge UI
//     this.experimentUI.innerHTML = '';

//     if (failed.length === 0) {
//       console.log("✅ Calibration edge-check passed");
//       return true;
//     }

//     // One or more edges unreachable — show recalibrate prompt.
//     return await this._showEdgeCheckFailure(failed);
//   }

//   // Render a single edge target and wait for the cursor to enter it (or time out).
//   async _checkOneEdge(edge, targetRadius, timeoutMs) {
//     return new Promise(resolve => {
//       this.experimentUI.innerHTML = `
//         <div id="edge-target" style="
//           position: fixed; left: ${edge.x - targetRadius}px; top: ${edge.y - targetRadius}px;
//           width: ${targetRadius * 2}px; height: ${targetRadius * 2}px;
//           border-radius: 50%; background: rgba(100, 255, 100, 0.55);
//           border: 4px solid #64ff64; z-index: 19000; pointer-events: none;
//           box-shadow: 0 0 30px rgba(100, 255, 100, 0.6);
//         "></div>
//         <div id="edge-label" style="
//           position: fixed; left: 50%; top: 16px; transform: translateX(-50%);
//           background: rgba(0,0,0,0.75); color: #fff; padding: 10px 20px;
//           border-radius: 8px; font-size: 16px; z-index: 19001; pointer-events: none;
//         ">
//           Reach the <strong style="color: #64ff64;">${edge.label}</strong> target
//           <span id="edge-timer" style="color: #ffaa00; margin-left: 12px;"></span>
//         </div>`;

//       const startTime = performance.now();
//       let done = false;
//       const timerEl = document.getElementById('edge-timer');

//       const tick = () => {
//         if (done) return;
//         const elapsed = performance.now() - startTime;
//         const remaining = Math.max(0, (timeoutMs - elapsed) / 1000);
//         if (timerEl) timerEl.textContent = `(${remaining.toFixed(1)} s left)`;

//         const cx = window.state?.cursorX;
//         const cy = window.state?.cursorY;
//         if (cx != null && cy != null) {
//           const dist = Math.sqrt(Math.pow(cx - edge.x, 2) + Math.pow(cy - edge.y, 2));
//           if (dist <= targetRadius) {
//             done = true;
//             console.log(`✅ Edge ${edge.id} reached at ${(elapsed / 1000).toFixed(1)} s`);
//             resolve(true);
//             return;
//           }
//         }
//         if (elapsed >= timeoutMs) {
//           done = true;
//           console.warn(`⏱  Edge ${edge.id} timed out`);
//           resolve(false);
//           return;
//         }
//         requestAnimationFrame(tick);
//       };
//       requestAnimationFrame(tick);
//     });
//   }

//   // Failure dialog: lists unreached edges and offers recalibrate vs continue.
//   async _showEdgeCheckFailure(failed) {
//     return new Promise(resolve => {
//       const list = failed.map(f => `<li>${f.label}</li>`).join('');
//       this.experimentUI.innerHTML = `
//         <div style="background: rgba(40,30,30,0.98); border: 2px solid #ff6464;
//                     border-radius: 12px; padding: 36px; max-width: 600px; margin: 60px auto;
//                     text-align: center;">
//           <h2 style="color: #ff6464; margin: 0 0 8px;">Calibration Issue Detected</h2>
//           <p style="color: #ccc; font-size: 15px; line-height: 1.55; margin: 14px 0;">
//             We couldn't reach the following ${failed.length === 1 ? 'edge' : 'edges'} with
//             your current calibration:
//           </p>
//           <ul style="text-align: left; display: inline-block; color: #ffaa64;
//                      font-size: 15px; margin: 8px auto 18px;">${list}</ul>
//           <p style="color: #aaa; font-size: 13px; margin: 6px 0 22px;">
//             Re-calibrating usually fixes this. You can also continue anyway if
//             you'd like to see how the system behaves with this calibration.
//           </p>
//           <div style="display: flex; gap: 12px; justify-content: center;">
//             <button id="edge-recalibrate" class="experiment-button"
//                     style="padding: 12px 24px; font-size: 15px; font-weight: bold;
//                            background: #ff6464; color: white;">
//               Recalibrate
//             </button>
//             <button id="edge-continue" class="experiment-button"
//                     style="padding: 12px 24px; font-size: 15px; background: #444;">
//               Continue Anyway
//             </button>
//           </div>
//         </div>`;

//       document.getElementById('edge-recalibrate').addEventListener('click', () => {
//         console.log("🔁 Participant chose to recalibrate");
//         // Hard reload to the calibration screen so the participant can redo
//         // tracking from scratch. (Calibration lives outside this experiment
//         // controller; safest move is a full reload.)
//         try { window.location.reload(); } catch (_) {}
//         resolve(false);
//       });

//       document.getElementById('edge-continue').addEventListener('click', () => {
//         console.log("⚠️ Participant chose to continue with bad calibration");
//         // Record this in the calibration info so the analysis script can flag it.
//         const note = `Edge-check failed: ${failed.map(f => f.id).join(', ')}`;
//         this.calibrationInfo[this.currentPart] =
//           (this.calibrationInfo[this.currentPart] || '') + ' | ' + note;
//         resolve(true);
//       });
//     });
//   }

//   // Continue to experiment start (after variance measurement)
//   async continueToExperimentStart() {
//     console.log("📍 Continuing to experiment start...");
    
//     // Get first pair and use counterbalanced filter order
//     const firstPair = this.config.varianceMatchedPairs[0];
//     const firstFilter = this.getCurrentFilter(); // respects counterbalancing
//     const firstFilterConfig = firstFilter === 'exponential' ? firstPair.exponential : firstPair.oneEuro;
    
//     console.log(`📍 Initial filter setup - Pair 1, ${firstFilter}, Rank ${firstFilterConfig.rank}`);
//     await this.setFilter(firstFilter, firstFilterConfig);
//     console.log("✅ Filter parameters set")
    
//     // Run practice block once per session (Manduchi, May 2026). Practice uses
//     // the real Fitts task UI but with a larger target/amplitude so the user
//     // understands the task before real data is recorded. It runs exactly once,
//     // before whichever part comes FIRST in the counterbalance order (A or B).
//     if (!this.practiceDone) {
//       this.runPracticeBlock();
//       return;
//     }

//     // Show instructions
//     this.showInstructions();
//   }

//   // ---- Practice block (Manduchi, May 2026) ----
//   // Self-contained warm-up: 1 layout × 8 trials with larger radius/target than
//   // the real conditions. Reuses the regular trial UI; data is suppressed by
//   // gating `trialData.push` and counter increments on `this.isPracticeMode`.
//   runPracticeBlock() {
//     if (this.practiceDone) return;
//     console.log("🎓 Starting practice block");

//     // Stash real layouts; install one larger-radius practice layout.
//     this._savedLayoutsForPractice = this.layouts;
//     const limitingDimension = Math.min(window.innerWidth, window.innerHeight);
//     const practiceTargetSize = this.percentToPixels(14); // bigger than real (10% / 6%)
//     const practiceAmplitude  = this.percentToPixels(35); // a bit smaller than real (45%)
//     this.layouts = [{
//       targetSize: practiceTargetSize,
//       amplitude: practiceAmplitude,
//       originalAmplitude: practiceAmplitude,
//       sequence: [...this.config.directionSequence]
//     }];

//     this.isPracticeMode = true;
//     this.currentLayoutIndex = 0;
//     this.currentTrialInLayout = 0;

//     // Show intro screen with spacebar to begin.
//     this.experimentUI.innerHTML = `
//       <div style="background: rgba(30,30,40,0.98); border: 2px solid #64c8ff;
//                   border-radius: 12px; padding: 36px; max-width: 600px; margin: 60px auto;
//                   text-align: center;">
//         <h2 style="color: #64c8ff; margin: 0 0 8px;">Practice Round</h2>
//         <p style="color: #ccc; font-size: 15px; line-height: 1.55; margin: 14px 0;">
//           Before the real experiment, let's do a quick practice. The task is the same
//           but the targets are larger so you can get used to moving the cursor with
//           your head.
//         </p>
//         <p style="color: #ccc; font-size: 15px; line-height: 1.55; margin: 14px 0;">
//           Move your head to land the cursor on each highlighted target. Hold still
//           inside the target until it selects automatically.
//         </p>
//         <p style="color: #aaa; font-size: 13px; margin: 18px 0 8px;">
//           The practice data is <strong>not</strong> recorded.
//         </p>
//         <button id="practice-start-btn" class="experiment-button start-button"
//                 style="padding: 14px 32px; font-size: 16px; font-weight: bold;">
//           Press Space to Start Practice
//         </button>
//       </div>`;

//     const startPractice = () => {
//       document.removeEventListener('keydown', spaceHandler);
//       this.startTrials();
//     };
//     const spaceHandler = (e) => {
//       if (e.code === 'Space') { e.preventDefault(); startPractice(); }
//     };
//     document.addEventListener('keydown', spaceHandler);
//     document.getElementById('practice-start-btn').addEventListener('click', startPractice);
//   }

//   // Called from endLayout() when in practice mode (layout completed = 8 trials done).
//   endPracticeBlock() {
//     console.log("🎓 Practice block complete");

//     // Stop timers and cursor-tracking loop that startTrials() started.
//     this._stopConditionTimer();
//     this._stopTrialTimer();
//     if (this.cursorTrackingInterval) {
//       clearInterval(this.cursorTrackingInterval);
//       this.cursorTrackingInterval = null;
//     }
//     this.isRunning = false;
//     document.body.classList.remove('hide-cursor');

//     // Restore real layouts & reset counters so the real experiment starts clean.
//     if (this._savedLayoutsForPractice) {
//       this.layouts = this._savedLayoutsForPractice;
//       this._savedLayoutsForPractice = null;
//     }
//     this.isPracticeMode = false;
//     this.practiceDone = true;
//     this.currentLayoutIndex = 0;
//     this.currentTrialInLayout = 0;
//     this.completedTrials = 0;

//     // Clear the experiment UI of trial widgets.
//     if (this.experimentUI) this.experimentUI.innerHTML = '';

//     // Show completion screen with spacebar to begin the real experiment.
//     this.experimentUI.innerHTML = `
//       <div style="background: rgba(30,30,40,0.98); border: 2px solid #64ff64;
//                   border-radius: 12px; padding: 36px; max-width: 600px; margin: 60px auto;
//                   text-align: center;">
//         <h2 style="color: #64ff64; margin: 0 0 8px;">Practice Complete</h2>
//         <p style="color: #ccc; font-size: 15px; line-height: 1.55; margin: 14px 0;">
//           Great — you've got the idea. The real experiment will use smaller targets,
//           and your performance from now on <strong>will</strong> be recorded.
//         </p>
//         <button id="practice-done-btn" class="experiment-button start-button"
//                 style="padding: 14px 32px; font-size: 16px; font-weight: bold;">
//           Press Space to Begin the Real Experiment
//         </button>
//       </div>`;

//     const beginReal = () => {
//       document.removeEventListener('keydown', spaceHandler);
//       this.continueToExperimentStart();
//     };
//     const spaceHandler = (e) => {
//       if (e.code === 'Space') { e.preventDefault(); beginReal(); }
//     };
//     document.addEventListener('keydown', spaceHandler);
//     document.getElementById('practice-done-btn').addEventListener('click', beginReal);
//   }
  
//   // Apply fixed configuration (2D, 3 landmarks)
//   async applyConfiguration() {
//     console.log("Applying configuration: 2D, 3 landmarks");
    
//     // DON'T change the configuration - just verify it's correct
//     // The tracking control page already has the configuration set
//     console.log("Current config:", window.state.config.coordinateSystem, window.state.config.landmarkPoints);
    
//     // No need to reset cursor or filter state - we're using the existing tracking
//     console.log("✅ Using existing tracking configuration");
//   }
  
//   // Set filter type with specific configuration
//   async setFilter(filterType, filterConfig) {
//     console.log("========================================");
//     console.log("🎯 SET FILTER CALLED");
//     console.log("========================================");
//     console.log("Filter Type:", filterType);
//     console.log("Rank:", filterConfig.rank);
//     console.log("Full Config:", filterConfig);
    
//     // CRITICAL: Set the filter type so tracking loop knows which filter to use
//     window.state.config.filterType = filterType;
//     console.log("✅ Set window.state.config.filterType =", filterType);
    
//     if (filterType === "exponential") {
//       console.log("--- EXPONENTIAL FILTER SETUP ---");
      
//       // Support both rank-based lookup and direct alpha (interpolated params)
//       let alpha;
//       const numericRank = Number(filterConfig.rank);
//       if (!isNaN(numericRank) && window.EXPONENTIAL_PARAMETERS && window.EXPONENTIAL_PARAMETERS[numericRank - 1]) {
//         alpha = window.EXPONENTIAL_PARAMETERS[numericRank - 1].alpha;
//         console.log("  Using rank-based lookup: EXPONENTIAL_PARAMETERS[" + (numericRank - 1) + "]");
//       } else if (filterConfig.alpha != null) {
//         alpha = filterConfig.alpha;
//         console.log("  Using interpolated alpha directly:", alpha);
//       } else {
//         console.error("❌ Cannot determine alpha — no valid rank or direct alpha");
//         return;
//       }
      
//       const smoothingFactor = 1 - alpha;
//       console.log("  - Alpha:", alpha);
//       console.log("  - Smoothing Factor:", smoothingFactor.toFixed(6));
      
//       window.state.config.exponentialSmoothingFactor = smoothingFactor;
//       console.log("✅ Applied to window.state.config.exponentialSmoothingFactor");
//     } else if (filterType === "oneEuro") {
//       console.log("--- ONE EURO FILTER SETUP ---");
//       console.log("Using parameters directly from filterConfig:");
//       console.log("  - Rank:", filterConfig.rank);
//       console.log("  - minCutoff:", filterConfig.minCutoff);
//       console.log("  - beta:", filterConfig.beta);
//       console.log("  - dCutoff:", filterConfig.dCutoff);
//       console.log("  - Variance:", filterConfig.variance);
//       console.log("  - Latency:", filterConfig.latency);
      
//       // Use parameters directly from filterConfig (from pairs configuration)
//       if (!window.state.filterConfig) window.state.filterConfig = {};
//       window.state.filterConfig.minCutoff = filterConfig.minCutoff;
//       window.state.filterConfig.beta = filterConfig.beta;
//       window.state.filterConfig.dcutoff = filterConfig.dCutoff;
//       console.log("✅ Applied to window.state.filterConfig");
      
//       // Reinitialize 2D One Euro filter
//       if (window.OneEuroFilter2D) {
//         window.state.filter2D = new window.OneEuroFilter2D(60, filterConfig.minCutoff, filterConfig.beta, filterConfig.dCutoff);
//         window.state.xFilter = window.state.filter2D;
//         window.state.yFilter = window.state.filter2D;
//         console.log("✅ Reinitialized 2D filter");
//       } else {
//         console.error("❌ OneEuroFilter2D class not found!");
//       }
      
//       // Verify it was set
//       console.log("VERIFICATION:");
//       console.log("  window.state.filterConfig.minCutoff =", window.state.filterConfig.minCutoff);
//       console.log("  window.state.filterConfig.beta =", window.state.filterConfig.beta);
//       console.log("  window.state.filterConfig.dcutoff =", window.state.filterConfig.dcutoff);
//       console.log("  xFilter exists:", !!window.state.xFilter ? "✅ YES" : "❌ NO");
//       console.log("  yFilter exists:", !!window.state.yFilter ? "✅ YES" : "❌ NO");
//     }
    
//     console.log("--- UPDATING UI ---");
//     // Update slider visual (includes parameter display update after delay)
//     this.updateSliderVisual(filterType, filterConfig.rank);
    
//     // For One Euro, re-apply parameters after React's button click resets them
//     if (filterType === "oneEuro") {
//       setTimeout(() => {
//         console.log("🔄 RE-APPLYING One Euro parameters after React reset...");
//         if (!window.state.filterConfig) window.state.filterConfig = {};
//         window.state.filterConfig.minCutoff = filterConfig.minCutoff;
//         window.state.filterConfig.beta = filterConfig.beta;
//         window.state.filterConfig.dcutoff = filterConfig.dCutoff;
        
//         if (window.OneEuroFilter2D) {
//           window.state.filter2D = new window.OneEuroFilter2D(60, filterConfig.minCutoff, filterConfig.beta, filterConfig.dCutoff);
//           window.state.xFilter = window.state.filter2D;
//           window.state.yFilter = window.state.filter2D;
//           console.log("✅ RE-APPLIED One Euro 2D parameters:");
//           console.log("  - minCutoff:", window.state.filterConfig.minCutoff);
//           console.log("  - beta:", window.state.filterConfig.beta);
//           console.log("  - dCutoff:", window.state.filterConfig.dcutoff);
//         }
//       }, 150); // Apply after React has reset to Rank 1
//     }
    
//     console.log("========================================");
//     console.log("✅ SET FILTER COMPLETE");
//     console.log("========================================");
//   }
  
//   // Show instructions screen
//   showInstructions() {
//     const layout = this.getCurrentLayout();
//     const pair = this.getCurrentPair();
//     const filterConfig = this.getCurrentFilterConfig();
//     const filterName = this.getCurrentFilter() === "exponential" ? "Exponential Smoothing" : "One Euro Filter";
//     const globalPhase = (this.currentPairIndex * 2) + this.currentFilterPhase + 1;
    
//     // Round sizes for cleaner display
//     const targetSizeRounded = Math.round(layout.targetSize);
//     const amplitudeRounded = Math.round(layout.amplitude);
    
//     // Calculate global layout number across all pairs
//     const layoutsPerPhase = this.layouts.length;
//     const globalLayoutNumber = (this.currentPairIndex * 2 * layoutsPerPhase) + (this.currentFilterPhase * layoutsPerPhase) + this.currentLayoutIndex + 1;
//     const totalLayouts = this.config.varianceMatchedPairs.length * 2 * layoutsPerPhase;
    
//     this.experimentUI.innerHTML = `
//       <div class="experiment-instructions" style="text-align: center; padding: 30px;">
//         <h2>Phase ${globalPhase}/${this.config.varianceMatchedPairs.length * 2}</h2>
//         <p style="color: #aaa; font-size: 16px; margin: 10px 0 20px;">
//           ${filterName} · Layout ${this.currentLayoutIndex + 1}/${layoutsPerPhase}
//         </p>

//         <div style="text-align: left; max-width: 440px; margin: 0 auto; font-size: 16px; line-height: 2.2; color: #ccc;">
//           <div>1. Move your head to the <span style="color:#6495ED; font-weight:bold;">blue disk</span> in the center and hold</div>
//           <div>2. Move to the <span style="color:#64ff64; font-weight:bold;">GREEN</span> circle — hold still until it turns <span style="color:#ff4444; font-weight:bold;">RED</span></div>
//           <div>3. Move to the <span style="color:#64ff64; font-weight:bold;">next GREEN</span> circle — <strong style="color:#ffaa00;">NOT</strong> the <span style="color:#ffc864;">yellow</span> one!</div>
//           <div>4. Repeat until all circles are red</div>
//         </div>

//         <p style="color: #888; font-size: 13px; margin: 20px 0 5px;">
//           Progress: ${this.completedTrials} / ${this.totalTrials} trials · <span style="color: #ffaa00;">3 min limit per layout</span>
//         </p>

//         <button class="experiment-button start-button" onclick="window.fittsExperiment.startTrials()" style="
//           margin-top: 15px; padding: 14px 40px; font-size: 18px;
//         ">
//           Start (or press Space)
//         </button>
//       </div>
//     `;
//   }
  
//   startTrials() {
//     this.isRunning = true;
//     document.body.classList.add('hide-cursor');

//     this.ensureCursorVisible();

//     if (!window.state || !window.state.isTracking) {
//       console.error("Tracking stopped! Attempting to resume...");
//       alert("Warning: Tracking seems to have stopped. Please check that face tracking is ON.");
//       return;
//     }

//     // Start a fresh 3-minute timer for THIS layout (8-circle ring). The
//     // timer resets every time the participant starts a new layout so they
//     // get a full budget per ring instead of sharing time across layouts.
//     this._stopConditionTimer();
//     this.conditionStartTime = Date.now();
//     if (this.currentLayoutIndex === 0) {
//       // Reset miss counter only at the start of a new condition.
//       this.conditionMissedTrials = 0;
//     }
//     this._startConditionTimer();

//     this.showNextTrial();

//     this.cursorTrackingInterval = setInterval(this.update, 16);
//   }

//   _startConditionTimer() {
//     // Remove old timer display
//     if (this._conditionTimerEl) this._conditionTimerEl.remove();

//     const el = document.createElement('div');
//     el.id = 'condition-timer';
//     el.style.cssText = `
//       position: fixed; top: 12px; right: 12px; z-index: 20001;
//       padding: 6px 14px; font-size: 16px; font-weight: bold;
//       background: rgba(0,0,0,0.7); color: #64ff64; border-radius: 8px;
//       font-family: monospace; pointer-events: none;
//     `;
//     document.body.appendChild(el);
//     this._conditionTimerEl = el;

//     this._conditionTimerInterval = setInterval(() => {
//       const elapsed = Date.now() - this.conditionStartTime;
//       const remaining = Math.max(0, this.config.conditionTimeLimit - elapsed);
//       const secs = Math.ceil(remaining / 1000);
//       const m = Math.floor(secs / 60);
//       const s = secs % 60;
//       el.textContent = `${m}:${s.toString().padStart(2, '0')}`;

//       if (remaining <= 30000) {
//         el.style.color = '#ff4444';
//       } else if (remaining <= 60000) {
//         el.style.color = '#ffaa00';
//       }

//       if (remaining <= 0) {
//         this._onConditionTimeout();
//       }
//     }, 500);
//   }

//   _stopConditionTimer() {
//     if (this._conditionTimerInterval) {
//       clearInterval(this._conditionTimerInterval);
//       this._conditionTimerInterval = null;
//     }
//     if (this._conditionTimerEl) {
//       this._conditionTimerEl.remove();
//       this._conditionTimerEl = null;
//     }
//   }

//   // ---- Per-trial timeout (Manduchi, May 2026) ----
//   // Each trial gets its own watchdog so one bad trial can't lock up the layout.
//   // Started when the trial begins (after home-circle dwell for trial 1; at
//   // showNextTrial for trials 2-8); cleared on selection or condition timeout.
//   _startTrialTimer() {
//     this._stopTrialTimer();
//     const limit = this.config.trialTimeLimit;
//     this._trialTimerStart = performance.now();
//     this._trialTimerTimeout = setTimeout(() => this._onTrialTimeout(), limit);
//   }

//   _stopTrialTimer() {
//     if (this._trialTimerTimeout) {
//       clearTimeout(this._trialTimerTimeout);
//       this._trialTimerTimeout = null;
//     }
//     this._trialTimerStart = null;
//   }

//   _onTrialTimeout() {
//     // Guard: only fire once per trial, and only if a trial is actually active.
//     if (!this._trialTimerStart || !this.currentTrial) return;
//     this._stopTrialTimer();

//     console.warn(`⏱  Per-trial timeout (${this.config.trialTimeLimit} ms) — recording timeout_trial and advancing.`);

//     const timeoutTimestamp = performance.now();
//     const lastCursor = this.cursorPath.length > 0
//       ? this.cursorPath[this.cursorPath.length - 1]
//       : null;

//     const filterType = this.getCurrentFilter();
//     const pair = this.getCurrentPair();
//     const layout = this.getCurrentLayout();
//     const centerX = window.innerWidth / 2;
//     const centerY = window.innerHeight / 2;
//     const targetX = centerX + this.currentTrial.amplitude
//                   * Math.cos((this.currentTrial.direction * Math.PI) / 180);
//     const targetY = centerY + this.currentTrial.amplitude
//                   * Math.sin((this.currentTrial.direction * Math.PI) / 180);

//     const entryEvents = this.targetEvents.filter(e => e.type === 'enter');
//     const firstEntry = entryEvents[0] || null;
//     const lastEntry  = entryEvents[entryEvents.length - 1] || null;
//     const reEntryCount = Math.max(0, entryEvents.length - 1);

//     // Endpoint = where the cursor was when the trial timed out (not the target).
//     const endpointX = lastCursor ? lastCursor.x : null;
//     const endpointY = lastCursor ? lastCursor.y : null;

//     const effectiveAmplitude = (endpointX != null && this.startPoint)
//       ? Math.sqrt(Math.pow(endpointX - this.startPoint.x, 2)
//                 + Math.pow(endpointY - this.startPoint.y, 2))
//       : null;

//     const trialResult = {
//       status: 'timeout_trial',
//       part: this.currentPart,
//       pairIndex: this.currentTrial.pairIndex,
//       pairNumber: this.currentTrial.pairNumber,
//       pairVariance: this.currentTrial.pairVariance,
//       pairVarianceNormPct: this.currentTrial.pairVarianceNormPct,
//       pairDescription: this.currentTrial.pairDescription,
//       filterPhase: this.currentFilterPhase,
//       filterType: filterType,
//       filterRank: this.currentTrial.filterRank,
//       filterVariance: this.currentTrial.filterVariance,
//       filterLatency: this.currentTrial.filterLatency,
//       layoutIndex: this.currentLayoutIndex,
//       trialInLayout: this.currentTrialInLayout,
//       globalTrialNumber: this.completedTrials + 1,
//       targetSize: this.currentTrial.targetSize,
//       amplitude: this.currentTrial.amplitude,
//       direction: this.currentTrial.direction,
//       directionIndex: this.currentTrialInLayout,
//       // Trial took at least trialTimeLimit; record that as the MT lower bound.
//       movementTime: this.config.trialTimeLimit / 1000,
//       kinematicMT: null,
//       entryBasedMT: null,
//       totalTime: this.config.trialTimeLimit / 1000,
//       effectiveAmplitude: effectiveAmplitude,
//       actualAmplitude: effectiveAmplitude,
//       startX: this.startPoint ? this.startPoint.x : null,
//       startY: this.startPoint ? this.startPoint.y : null,
//       endpointX: endpointX,
//       endpointY: endpointY,
//       lastEntryX: lastEntry ? lastEntry.x : null,
//       lastEntryY: lastEntry ? lastEntry.y : null,
//       selectionX: null,
//       selectionY: null,
//       targetX: targetX,
//       targetY: targetY,
//       reEntryCount: reEntryCount,
//       peakSpeed: null,
//       trialStartTime: this.trialStartTime,
//       movementStartTime: this.movementStartTime,
//       movementOnsetTime: null,
//       movementOffsetTime: null,
//       firstEntryTime: firstEntry ? firstEntry.t : null,
//       lastEntryTime: lastEntry ? lastEntry.t : null,
//       selectionTime: null,
//       cursorPath: this.cursorPath.map(p => ({ x: p.x, y: p.y, t: p.t })),
//       targetEvents: [...this.targetEvents]
//     };

//     if (!this.isPracticeMode) {
//       this.trialData.push(trialResult);
//       this.completedTrials++;
//     }

//     // Advance to next trial — keep cursor where it is (Roberto's call: do not
//     // teleport). startPoint for the NEXT trial is computed in showNextTrial()
//     // based on the previous TARGET position (not the timed-out endpoint), which
//     // preserves the standard layout-ring trial structure.
//     this.currentTrialInLayout++;

//     setTimeout(() => this.showNextTrial(), 300);
//   }

//   _onConditionTimeout() {
//     this._stopConditionTimer();
//     // Also kill any pending per-trial timer — the condition-level one supersedes.
//     this._stopTrialTimer();

//     const pair = this.getCurrentPair();
//     const filterType = this.getCurrentFilter();
//     const filterConfig = filterType === 'exponential' ? pair?.exponential : pair?.oneEuro;
//     const timeoutTimestamp = Date.now();
//     const elapsedMs = timeoutTimestamp - this.conditionStartTime;
//     const centerX = window.innerWidth / 2;
//     const centerY = window.innerHeight / 2;

//     // Per-layout timer: only mark missed trials for the CURRENT layout, then
//     // advance to the next layout (instead of skipping the rest of the condition).
//     const layoutIdx = this.currentLayoutIndex;
//     let trialIdx = this.currentTrialInLayout;
//     let isFirstMissed = true;

//     {
//       const layout = this.layouts[layoutIdx];
//       while (trialIdx < this.config.trialsPerLayout) {
//         const direction = this.config.directionSequence[trialIdx];
//         const targetX = centerX + layout.amplitude * Math.cos((direction * Math.PI) / 180);
//         const targetY = centerY + layout.amplitude * Math.sin((direction * Math.PI) / 180);

//         // The first missed trial = the one in progress when timeout hit
//         // It has cursor path, start point, partial movement data
//         const isInProgress = isFirstMissed &&
//           layoutIdx === this.currentLayoutIndex &&
//           trialIdx === this.currentTrialInLayout;

//         const lastCursorPos = isInProgress && this.cursorPath.length > 0
//           ? this.cursorPath[this.cursorPath.length - 1] : null;

//         const entryEvents = isInProgress ? this.targetEvents.filter(e => e.type === 'enter') : [];
//         const reEntryCount = Math.max(0, entryEvents.length - 1);

//         const trialEntry = {
//           status: isInProgress ? 'timeout_in_progress' : 'timeout_not_attempted',
//           part: this.currentPart,
//           pairIndex: this.currentPairIndex,
//           pairNumber: pair?.pairNumber,
//           pairVariance: pair?.variance,
//           pairVarianceNormPct: pair?.varianceNormPct,
//           pairDescription: pair?.description,
//           filterPhase: this.currentFilterPhase,
//           filterType: filterType,
//           filterRank: filterConfig?.rank,
//           filterVariance: pair?.variance,
//           filterLatency: filterConfig?.latency,
//           layoutIndex: layoutIdx,
//           trialInLayout: trialIdx,
//           globalTrialNumber: null,
//           targetSize: layout.targetSize,
//           amplitude: layout.amplitude,
//           direction: direction,
//           directionIndex: trialIdx,
//           targetX: targetX,
//           targetY: targetY,
//           // For in-progress trial: last cursor position as endpoint
//           endpointX: lastCursorPos ? lastCursorPos.x : null,
//           endpointY: lastCursorPos ? lastCursorPos.y : null,
//           startX: isInProgress && this.startPoint ? this.startPoint.x : null,
//           startY: isInProgress && this.startPoint ? this.startPoint.y : null,
//           effectiveAmplitude: isInProgress && this.startPoint && lastCursorPos
//             ? Math.sqrt(Math.pow(lastCursorPos.x - this.startPoint.x, 2) + Math.pow(lastCursorPos.y - this.startPoint.y, 2))
//             : null,
//           movementTime: isInProgress && this.movementStartTime
//             ? (performance.now() - this.movementStartTime) / 1000 : null,
//           totalTime: isInProgress && this.trialStartTime
//             ? (performance.now() - this.trialStartTime) / 1000 : null,
//           selectionX: null,
//           selectionY: null,
//           reEntryCount: isInProgress ? reEntryCount : null,
//           peakSpeed: null,
//           kinematicMT: null,
//           entryBasedMT: null,
//           lastEntryX: null,
//           lastEntryY: null,
//           trialStartTime: isInProgress ? this.trialStartTime : null,
//           movementStartTime: isInProgress ? this.movementStartTime : null,
//           movementOnsetTime: null,
//           movementOffsetTime: null,
//           firstEntryTime: entryEvents.length > 0 ? entryEvents[0].t : null,
//           lastEntryTime: entryEvents.length > 0 ? entryEvents[entryEvents.length - 1].t : null,
//           selectionTime: null,
//           conditionElapsedMs: elapsedMs,
//           // Save cursor path and target events for the in-progress trial
//           cursorPath: isInProgress ? this.cursorPath.map(p => ({ x: p.x, y: p.y, t: p.t })) : [],
//           targetEvents: isInProgress ? [...this.targetEvents] : [],
//           timestamp: timeoutTimestamp
//         };

//         if (!this.isPracticeMode) {
//           this.trialData.push(trialEntry);
//           this.conditionMissedTrials++;
//         }
//         isFirstMissed = false;
//         trialIdx++;
//       }
//     }

//     const layoutMissed = this.config.trialsPerLayout - this.currentTrialInLayout;
//     console.log(`Layout ${layoutIdx + 1}/${this.layouts.length} timed out. Missed in this layout: ${layoutMissed} (1 in-progress + ${layoutMissed - 1} not attempted). Advancing.`);

//     if (this.cursorTrackingInterval) {
//       clearInterval(this.cursorTrackingInterval);
//       this.cursorTrackingInterval = null;
//     }

//     this.isRunning = false;

//     // Practice mode: condition timer firing in practice means the participant
//     // ran out the 3-minute budget. End the practice block cleanly.
//     if (this.isPracticeMode) {
//       this.endPracticeBlock();
//       return;
//     }

//     // Advance to the next layout. If this was the last layout in the condition,
//     // end the filter phase (move on to feedback / next pair / etc.)
//     this.currentLayoutIndex++;
//     this.currentTrialInLayout = 0;
//     if (this.currentLayoutIndex >= this.layouts.length) {
//       this.endFilterPhase();
//     } else {
//       setTimeout(() => this.showInstructions(), 800);
//     }
//   }
  
//   // Ensure cursor is visible above experiment UI
//   ensureCursorVisible() {
//     const cursor = document.getElementById('head-cursor-clipped');
//     if (cursor) {
//       cursor.style.zIndex = '20000'; // Above all experiment elements
      
//       // Make absolutely sure it's visible
//       cursor.style.display = 'block';
//       cursor.style.visibility = 'visible';
//       cursor.style.opacity = '1';
      
//       console.log("Cursor z-index set to 20000, cursor element:", cursor);
      
//       // Also verify cursor is getting position updates
//       const currentLeft = cursor.style.left;
//       const currentTop = cursor.style.top;
//       console.log("Current cursor position in DOM:", currentLeft, currentTop);
      
//       // Set up a test to monitor if cursor position changes
//       let lastLeft = currentLeft;
//       let lastTop = currentTop;
//       setTimeout(() => {
//         const newLeft = cursor.style.left;
//         const newTop = cursor.style.top;
//         if (newLeft === lastLeft && newTop === lastTop) {
//           console.error("⚠️ CURSOR NOT MOVING! Position hasn't changed in 1 second");
//           console.log("Tracking state:", window.state?.isTracking);
//           console.log("Last landmarks:", window.state?.lastLandmarks ? "Present" : "None");
//         } else {
//           console.log("✓ Cursor is moving correctly");
//         }
//       }, 1000);
//     } else {
//       console.error("Cursor element not found!");
//     }
//   }
  
//   // Show the next trial
//   showNextTrial() {
//     console.log("📍 showNextTrial() called - trialInLayout:", this.currentTrialInLayout, "layoutIndex:", this.currentLayoutIndex);
    
//     const layout = this.getCurrentLayout();
    
//     // Check if current layout is complete
//     if (!layout || this.currentTrialInLayout >= this.config.trialsPerLayout) {
//       console.log("Layout complete, calling endLayout()");
//       this.endLayout();
//       return;
//     }
    
//     const direction = this.getCurrentDirection();
//     const filterType = this.getCurrentFilter();
    
//     console.log("Next trial - direction:", direction, "filter:", filterType);
    
//     // Get current pair and filter config
//     const pair = this.getCurrentPair();
//     const filterConfig = this.getCurrentFilterConfig();
    
//     // Set up current trial
//     this.currentTrial = {
//       part: this.currentPart,
//       pairIndex: this.currentPairIndex,
//       pairNumber: pair.pairNumber,
//       pairVariance: pair.variance,
//       pairVarianceNormPct: pair.varianceNormPct || null,
//       pairDescription: pair.description,
//       layoutIndex: this.currentLayoutIndex,
//       filterType: filterType,
//       filterPhase: this.currentFilterPhase,
//       filterRank: filterConfig.rank,
//       filterVariance: filterConfig.variance,
//       filterLatency: filterConfig.latency,
//       trialInLayout: this.currentTrialInLayout,
//       targetSize: layout.targetSize,
//       amplitude: layout.amplitude,
//       direction: direction,
//       directionIndex: this.currentTrialInLayout,
//       globalTrialNumber: this.completedTrials + 1
//     };
    
//     this.movementStartTime = null;
//     this.dwellStartTime = null;
//     this.selectionRegistered = false; // Reset selection flag
//     this.cursorPath = []; // Reset cursor path
//     this.targetEvents = []; // Reset target events
//     this.isInsideTarget = false; // Reset target state
    
//     // Set start point based on previous trial
//     // First trial: start from center
//     // Subsequent trials: start from previous target
//     if (this.currentTrialInLayout === 0) {
//       // First trial - start from center, must dwell in home circle first
//       this.startPoint = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
//       this.previousTargetSize = layout.targetSize * 1.3; // Home circle size (1.3x target circles)
//       this.waitingForHomeCircle = true; // Wait for home circle dwell before starting trial
//     } else {
//       // Get previous target position
//       const layout = this.getCurrentLayout();
//       const previousDirection = layout.sequence[this.currentTrialInLayout - 1];
//       const centerX = window.innerWidth / 2;
//       const centerY = window.innerHeight / 2;
//       const radians = (previousDirection * Math.PI) / 180;
      
//       this.startPoint = {
//         x: centerX + layout.amplitude * Math.cos(radians),
//         y: centerY + layout.amplitude * Math.sin(radians)
//       };
//       this.previousTargetSize = layout.targetSize;
//       this.waitingForHomeCircle = false; // Not waiting, start measuring immediately
//     }
    
//     // Clear UI
//     this.experimentUI.innerHTML = '';
    
//     // Ensure cursor remains visible
//     this.ensureCursorVisible();
    
//     // Create guide lines (show completed paths in this block)
//     this.createGuideLines();
    
//     // Create all 8 target circles (recreate each time to ensure they're in DOM)
//     this.createAllTargetCircles();
    
//     // Update target highlighting for current trial
//     this.updateTargetHighlighting();
    
//     // Create home circle
//     this.createHomeCircle();
    
//     // Create dwell indicator for current target
//     this.createDwellIndicator();
    
//     // Create progress text
//     this.createProgressText();
    
//     // Record trial start
//     this.trialStartTime = performance.now();
//     // Start per-trial watchdog timer for trials 2-8. For trial 1 the home-circle
//     // dwell precedes the real trial; we start the timer there instead (see the
//     // home-circle dwell-complete branch).
//     if (!this.waitingForHomeCircle) {
//       this._startTrialTimer();
//     }

//     console.log(`Trial ${this.completedTrials + 1}/${this.totalTrials}, Layout ${this.currentLayoutIndex + 1}/${this.layouts.length}, Filter: ${filterType}, Trial in layout: ${this.currentTrialInLayout + 1}/${this.config.trialsPerLayout}:`, this.currentTrial);
//   }
  
//   // Create guide lines showing completed paths in current layout
//   createGuideLines() {
//     if (!this.guideLines) {
//       this.guideLines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
//       this.guideLines.style.cssText = `
//         position: fixed;
//         top: 0;
//         left: 0;
//         width: 100%;
//         height: 100%;
//         pointer-events: none;
//         z-index: 10000;
//       `;
//       this.experimentUI.appendChild(this.guideLines);
//     }
    
//     // Clear existing lines
//     this.guideLines.innerHTML = '';
    
//     const centerX = window.innerWidth / 2;
//     const centerY = window.innerHeight / 2;
//     const layout = this.getCurrentLayout();
    
//     if (!layout) return;
    
//     // Draw dashed lines for completed trials in this layout
//     for (let i = 0; i < this.currentTrialInLayout; i++) {
//       const direction = layout.sequence[i];
//       const radians = (direction * Math.PI) / 180;
//       const targetX = centerX + layout.amplitude * Math.cos(radians);
//       const targetY = centerY + layout.amplitude * Math.sin(radians);
      
//       const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
//       line.setAttribute('x1', centerX);
//       line.setAttribute('y1', centerY);
//       line.setAttribute('x2', targetX);
//       line.setAttribute('y2', targetY);
//       line.setAttribute('stroke', 'rgba(150, 150, 150, 0.4)');
//       line.setAttribute('stroke-width', '2');
//       line.setAttribute('stroke-dasharray', '5,5');
      
//       this.guideLines.appendChild(line);
//     }
//   }
  
//   // Create start indicator (home circle for first trial, or highlight previous target)
//   createHomeCircle() {
//     // Only show home circle for first trial in layout
//     if (this.currentTrialInLayout === 0) {
//       // Make home circle slightly bigger than target circles (1.3x)
//       const layout = this.getCurrentLayout();
//       const homeSize = layout.targetSize * 1.3;
      
//       this.homeCircle = document.createElement('div');
//       this.homeCircle.className = 'fitts-home-circle';
//       this.homeCircle.style.cssText = `
//         position: fixed;
//         left: ${window.innerWidth / 2 - homeSize / 2}px;
//         top: ${window.innerHeight / 2 - homeSize / 2}px;
//         width: ${homeSize}px;
//         height: ${homeSize}px;
//         border-radius: 50%;
//         background-color: rgba(100, 150, 255, 0.6);
//         border: 4px solid rgba(100, 150, 255, 1);
//         pointer-events: none;
//         z-index: 10001;
//         box-shadow: 0 0 20px rgba(100, 150, 255, 0.8);
//       `;
      
//       this.experimentUI.appendChild(this.homeCircle);
//     }
//     // For subsequent trials, the previous target (now green) serves as the start indicator
//   }
  
//   // Create all 8 target circles at once
//   createAllTargetCircles() {
//     const layout = this.getCurrentLayout();
//     if (!layout) return;
    
//     const { targetSize, amplitude } = layout;
//     const centerX = window.innerWidth / 2;
//     const centerY = window.innerHeight / 2;
    
//     // All 8 directions
//     const allDirections = [0, 45, 90, 135, 180, 225, 270, 315];
    
//     // Clear previous circles
//     this.targetCircles = {};
    
//     for (const direction of allDirections) {
//       const radians = (direction * Math.PI) / 180;
//       const targetX = centerX + amplitude * Math.cos(radians);
//       const targetY = centerY + amplitude * Math.sin(radians);
      
//       // Create target circle
//       const circle = document.createElement('div');
//       circle.className = 'fitts-target-circle';
//       circle.setAttribute('data-direction', direction);
//       circle.style.cssText = `
//         position: fixed;
//         left: ${targetX - targetSize / 2}px;
//         top: ${targetY - targetSize / 2}px;
//         width: ${targetSize}px;
//         height: ${targetSize}px;
//         border-radius: 50%;
//         background-color: rgba(150, 150, 150, 0.3);
//         border: 3px solid rgba(150, 150, 150, 0.6);
//         pointer-events: none;
//         z-index: 10001;
//         transition: all 0.3s ease;
//       `;
      
//       this.experimentUI.appendChild(circle);
//       this.targetCircles[direction] = circle;
//     }
//   }
  
//   // Update highlighting to show current and next targets
//   updateTargetHighlighting() {
//     const layout = this.getCurrentLayout();
//     if (!layout) return;
    
//     const currentDirection = this.getCurrentDirection();
//     console.log("🎨 Updating target highlighting - current direction:", currentDirection, "trial:", this.currentTrialInLayout);
    
//     // Update all circles
//     let highlightedCount = 0;
//     for (const [direction, circle] of Object.entries(this.targetCircles)) {
//       const dir = parseInt(direction);
//       const sequenceIndex = layout.sequence.indexOf(dir);
      
//       if (dir === currentDirection) {
//         // Current target — GREEN = "go here" (traffic light logic)
//         if (this.waitingForHomeCircle) {
//           circle.style.backgroundColor = 'rgba(255, 200, 100, 0.5)';
//           circle.style.borderColor = 'rgba(255, 200, 100, 0.8)';
//           circle.style.borderWidth = '3px';
//           circle.style.boxShadow = '0 0 15px rgba(255, 200, 100, 0.6)';
//           circle.style.transform = 'scale(1.05)';
//           console.log(`  🟡 Direction ${dir}° = YELLOW (waiting for home circle)`);
//         } else {
//           circle.style.backgroundColor = 'rgba(100, 255, 100, 0.8)';
//           circle.style.borderColor = 'rgba(100, 255, 100, 1)';
//           circle.style.borderWidth = '4px';
//           circle.style.boxShadow = '0 0 30px rgba(100, 255, 100, 1)';
//           circle.style.transform = 'scale(1.1)';
//           console.log(`  ➡️ Direction ${dir}° = GREEN (current target — go here)`);
//         }
//         highlightedCount++;
//       } else if (sequenceIndex !== -1 && sequenceIndex < this.currentTrialInLayout) {
//         // Completed target — RED = "done / stop" (traffic light logic)
//         circle.style.backgroundColor = 'rgba(255, 100, 100, 0.4)';
//         circle.style.borderColor = 'rgba(255, 100, 100, 0.7)';
//         circle.style.borderWidth = '3px';
//         circle.style.boxShadow = 'none';
//         circle.style.transform = 'scale(1)';
//         console.log(`  🔴 Direction ${dir}° = RED (completed, seqIdx=${sequenceIndex} < ${this.currentTrialInLayout})`);
//       } else if (sequenceIndex === this.currentTrialInLayout + 1) {
//         // Next target — yellow (traffic light: prepare)
//         if (this.waitingForHomeCircle) {
//           circle.style.backgroundColor = 'rgba(150, 150, 150, 0.3)';
//           circle.style.borderColor = 'rgba(150, 150, 150, 0.6)';
//           circle.style.borderWidth = '3px';
//           circle.style.boxShadow = 'none';
//           circle.style.transform = 'scale(1)';
//           console.log(`  ⚪ Direction ${dir}° = GRAY (waiting for home circle)`);
//         } else {
//           circle.style.backgroundColor = 'rgba(255, 200, 100, 0.5)';
//           circle.style.borderColor = 'rgba(255, 200, 100, 0.8)';
//           circle.style.borderWidth = '3px';
//           circle.style.boxShadow = '0 0 15px rgba(255, 200, 100, 0.6)';
//           circle.style.transform = 'scale(1.05)';
//           console.log(`  🟠 Direction ${dir}° = YELLOW (next target)`);
//         }
//       } else {
//         circle.style.backgroundColor = 'rgba(150, 150, 150, 0.3)';
//         circle.style.borderColor = 'rgba(150, 150, 150, 0.6)';
//         circle.style.borderWidth = '3px';
//         circle.style.boxShadow = 'none';
//         circle.style.transform = 'scale(1)';
//       }
//     }
    
//     if (highlightedCount === 0) {
//       console.error("⚠️ NO RED TARGET HIGHLIGHTED! Current direction:", currentDirection);
//     }
//   }
  
//   // Create dwell indicator for current target
//   createDwellIndicator() {
//     const { targetSize, amplitude, direction } = this.currentTrial;
//     const centerX = window.innerWidth / 2;
//     const centerY = window.innerHeight / 2;
    
//     const radians = (direction * Math.PI) / 180;
//     const targetX = centerX + amplitude * Math.cos(radians);
//     const targetY = centerY + amplitude * Math.sin(radians);
    
//     this.dwellIndicator = document.createElement('div');
//     this.dwellIndicator.className = 'fitts-dwell-indicator';
//     this.dwellIndicator.style.cssText = `
//       position: fixed;
//       left: ${targetX - targetSize / 2 - 5}px;
//       top: ${targetY - targetSize / 2 - 5}px;
//       width: ${targetSize + 10}px;
//       height: ${targetSize + 10}px;
//       border-radius: 50%;
//       border: 4px solid transparent;
//       background-clip: padding-box; /* Prevents square outline on gradient */
//       pointer-events: none;
//       z-index: 10002;
//       transition: border-color 0.1s;
//     `;
    
//     this.experimentUI.appendChild(this.dwellIndicator);
//   }
  
//   // Create progress text
//   createProgressText() {
//     this.progressText = document.createElement('div');
//     this.progressText.className = 'fitts-progress';
//     this.progressText.style.cssText = `
//       position: fixed;
//       top: 12px;
//       left: 12px;
//       background-color: rgba(0, 0, 0, 0.9);
//       color: white;
//       padding: 14px 18px;
//       border-radius: 8px;
//       font-size: 16px;
//       z-index: 10003;
//       text-align: left;
//       border: 1px solid rgba(100, 200, 255, 0.5);
//       box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
//       pointer-events: auto;
//       min-width: 200px;
//     `;
    
//     this.updateProgressText();
//     this.experimentUI.appendChild(this.progressText);
//   }
  
//   // Update progress text content
//   updateProgressText() {
//     if (!this.progressText) return;
    
//     const filterName = this.getCurrentFilter() === "exponential" ? "Exponential" : "One Euro";
//     const layout = this.getCurrentLayout();
    
//     const globalLayoutNumber = this.currentLayoutIndex + 1 + (this.currentFilterPhase * this.layouts.length);
    
//     const totalLayoutsThisPart = this.config.varianceMatchedPairs.length * 2 * this.layouts.length;
//     let content = `
//       <div style="font-weight: bold; font-size: 16px;">Trial ${this.completedTrials + 1}/${this.totalTrials}</div>
//       <div style="font-size: 14px; margin-top: 4px; color: #aaa;">${filterName}</div>
//       <div style="font-size: 14px; margin-top: 4px; color: #888;">
//         Layout ${globalLayoutNumber}/${totalLayoutsThisPart} | T${this.currentTrialInLayout + 1}/8
//       </div>
//     `;
    
//     // Add special message if waiting for home circle
//     if (this.waitingForHomeCircle) {
//       content += `
//         <div style="font-size: 12px; margin-top: 5px; color: #64c8ff; font-weight: bold;">
//           ⬇️ Move to blue circle
//         </div>
//       `;
//     }
    
//     // Add skip and back buttons (test mode only)
//     if (typeof isTestMode === 'function' && isTestMode()) {
//       content += `
//         <div style="display: flex; gap: 4px; margin-top: 7px;">
//           <button 
//             onclick="window.fittsExperiment.skipLayout()" 
//             style="
//               padding: 5px 8px;
//               font-size: 11px;
//               background: rgba(255, 152, 0, 0.3);
//               border: 1px solid rgba(255, 152, 0, 0.5);
//               border-radius: 3px;
//               color: #ff9800;
//               cursor: pointer;
//               flex: 1;
//               pointer-events: auto;
//             "
//             onmouseover="this.style.background='rgba(255, 152, 0, 0.5)'"
//             onmouseout="this.style.background='rgba(255, 152, 0, 0.3)'"
//           >
//             skip this layout
//           </button>
//           <button 
//             onclick="window.fittsExperiment.close()" 
//             style="
//               padding: 5px 8px;
//               font-size: 11px;
//               background: rgba(100, 168, 255, 0.3);
//               border: 1px solid rgba(100, 168, 255, 0.5);
//               border-radius: 3px;
//               color: #64a8ff;
//               cursor: pointer;
//               flex: 1;
//               pointer-events: auto;
//             "
//             onmouseover="this.style.background='rgba(100, 168, 255, 0.5)'"
//             onmouseout="this.style.background='rgba(100, 168, 255, 0.3)'"
//           >
//             go back
//           </button>
//         </div>
//       `;
//     }
    
//     this.progressText.innerHTML = content;
//     // Make progress text accept pointer events for the button
//     this.progressText.style.pointerEvents = 'auto';
//   }
  
//   // Update loop - check cursor position and dwell
//   update() {
//     if (!this.isRunning || !this.currentTrial) return;
    
//     // Get cursor position
//     const cursorX = window.state.cursorX;
//     const cursorY = window.state.cursorY;
    
//     // Debug: Log every 60 frames (~1 second)
//     if (!this.frameCount) this.frameCount = 0;
//     this.frameCount++;
//     if (this.frameCount % 60 === 0) {
//       const filterType = window.state.config.filterType;
//       if (filterType === 'exponential') {
//         const smoothing = window.state.config.exponentialSmoothingFactor;
//         const alpha = 1 - smoothing;
//         console.log("📊 Fitts Update (Exponential):", {
//           cursor: `(${cursorX.toFixed(1)}, ${cursorY.toFixed(1)})`,
//           smoothing: smoothing.toFixed(5),
//           alpha: alpha.toFixed(5),
//           tracking: window.state.isTracking
//         });
//       } else if (filterType === 'oneEuro') {
//         const params = window.state.filterConfig;
//         console.log("📊 Fitts Update (One Euro):", {
//           cursor: `(${cursorX.toFixed(1)}, ${cursorY.toFixed(1)})`,
//           minCutoff: params?.minCutoff,
//           beta: params?.beta,
//           tracking: window.state.isTracking
//         });
//       }
//     }
    
//     if (cursorX === null || cursorY === null) {
//       if (this.frameCount % 60 === 0) {
//         console.warn("Cursor position is null!");
//       }
//       return;
//     }
    
//     // Special case: waiting for home circle dwell before first trial
//     if (this.waitingForHomeCircle) {
//       this.handleHomeCircleDwell(cursorX, cursorY);
//       return; // Don't process trial logic yet
//     }
    
//     // If selection has been registered, stop processing this trial
//     // This prevents the dwell indicator from restarting during the transition to next trial
//     if (this.selectionRegistered) {
//       return;
//     }
    
//     // Always record cursor path with timestamps (needed for velocity-based MT analysis)
//     this.cursorPath.push({
//       x: cursorX,
//       y: cursorY,
//       t: performance.now()
//     });
    
//     // Check if movement has started (cursor left previous target/start point)
//     if (!this.movementStartTime) {
//       const distFromStart = Math.sqrt(
//         Math.pow(cursorX - this.startPoint.x, 2) + Math.pow(cursorY - this.startPoint.y, 2)
//       );
      
//       // Movement starts when cursor exits previous target area
//       if (distFromStart > this.previousTargetSize / 2) {
//         this.movementStartTime = performance.now();
//         console.log("Movement started from:", this.startPoint);
//       }
//     }
    
//     // Check if cursor is over target
//     const { targetSize, amplitude, direction } = this.currentTrial;
//     const centerX = window.innerWidth / 2;
//     const centerY = window.innerHeight / 2;
//     const radians = (direction * Math.PI) / 180;
//     const targetX = centerX + amplitude * Math.cos(radians);
//     const targetY = centerY + amplitude * Math.sin(radians);
    
//     const distFromTarget = Math.sqrt(
//       Math.pow(cursorX - targetX, 2) + Math.pow(cursorY - targetY, 2)
//     );
    
//     const isOverTarget = distFromTarget <= targetSize / 2;
    
//     // Track target entry/exit events
//     const now = performance.now();
//     if (isOverTarget && !this.isInsideTarget) {
//       this.isInsideTarget = true;
//       this.targetEvents.push({ type: 'enter', x: cursorX, y: cursorY, t: now });
//     } else if (!isOverTarget && this.isInsideTarget) {
//       this.isInsideTarget = false;
//       this.targetEvents.push({ type: 'exit', x: cursorX, y: cursorY, t: now });
//     }
    
//     if (isOverTarget) {
//       // Start or continue dwell
//       if (!this.dwellStartTime) {
//         this.dwellStartTime = now;
//       }
      
//       const dwellProgress = (now - this.dwellStartTime) / this.config.dwellTime;
      
//       // Update dwell indicator — transitions from green (go) → yellow → red (stop/complete)
//       if (dwellProgress < 1) {
//         const degrees = dwellProgress * 360;
//         const r = Math.round(100 + dwellProgress * 155);
//         const g = Math.round(255 - dwellProgress * 155);
//         const b = Math.round(100 - dwellProgress * 100);
//         this.dwellIndicator.style.borderColor = `rgba(${r}, ${g}, ${b}, ${0.3 + dwellProgress * 0.7})`;
//         this.dwellIndicator.style.backgroundImage = `conic-gradient(
//           rgba(${r}, ${g}, ${b}, 0.6) ${degrees}deg,
//           transparent ${degrees}deg
//         )`;
//       } else {
//         // Dwell complete - register selection
//         // Prevent multiple registrations
//         if (!this.selectionRegistered) {
//           this.selectionRegistered = true;
//           this.registerSelection(cursorX, cursorY);
//         }
//       }
//     } else {
//       // Reset dwell if cursor leaves target
//       if (this.dwellStartTime) {
//         this.dwellStartTime = null;
//         this.dwellIndicator.style.borderColor = 'transparent';
//         this.dwellIndicator.style.backgroundImage = 'none';
//       }
//     }
//   }
  
//   // Handle home circle dwell before first trial starts
//   handleHomeCircleDwell(cursorX, cursorY) {
//     const centerX = window.innerWidth / 2;
//     const centerY = window.innerHeight / 2;
//     // Use the same size as the visual home circle (1.3x target size)
//     const layout = this.getCurrentLayout();
//     const homeSize = layout ? layout.targetSize * 1.3 : 100;
    
//     const distFromCenter = Math.sqrt(
//       Math.pow(cursorX - centerX, 2) + Math.pow(cursorY - centerY, 2)
//     );
    
//     const isInHomeCircle = distFromCenter <= homeSize / 2;
    
//     if (isInHomeCircle) {
//       // Start or continue dwell in home circle
//       if (!this.dwellStartTime) {
//         this.dwellStartTime = performance.now();
//         console.log("Started dwelling in home circle");
//       }
      
//       const dwellProgress = (performance.now() - this.dwellStartTime) / this.config.dwellTime;
      
//       // Update visual feedback on home circle
//       if (this.homeCircle) {
//         if (dwellProgress < 1) {
//           const degrees = dwellProgress * 360;
//           const r = Math.round(100 + dwellProgress * 155);
//           const g = Math.round(150 + dwellProgress * 50);
//           const b = Math.round(255 - dwellProgress * 155);
//           this.homeCircle.style.background = `conic-gradient(
//             rgba(${r}, ${g}, ${b}, 0.8) ${degrees}deg,
//             rgba(100, 150, 255, 0.6) ${degrees}deg
//           )`;
//           this.homeCircle.style.borderColor = `rgba(${r}, ${g}, ${b}, ${0.6 + dwellProgress * 0.4})`;
//         } else {
//           // Home circle dwell complete!
//           console.log("Home circle dwell complete - starting Trial 1");
//           this.waitingForHomeCircle = false;
//           this.dwellStartTime = null;
//           this.trialStartTime = performance.now();
//           // Trial 1 starts now (after home dwell) — kick off its watchdog.
//           this._startTrialTimer();
          
//           // Turn home circle red (completed — traffic light: stop)
//           this.homeCircle.style.background = 'rgba(255, 100, 100, 0.4)';
//           this.homeCircle.style.borderColor = 'rgba(255, 100, 100, 0.7)';
//           this.homeCircle.style.boxShadow = 'none';
          
//           // Update target highlighting: first target yellow→red, next target gray→yellow
//           this.updateTargetHighlighting();
          
//           // Update progress text to remove "waiting" message
//           this.updateProgressText();
//         }
//       }
//     } else {
//       // Cursor left home circle, reset dwell
//       if (this.dwellStartTime) {
//         this.dwellStartTime = null;
//         if (this.homeCircle) {
//           this.homeCircle.style.background = 'rgba(100, 150, 255, 0.6)';
//           this.homeCircle.style.borderColor = 'rgba(100, 150, 255, 1)';
//         }
//       }
//     }
//   }
  
//   // Compute velocity-based kinematic metrics from cursor path
//   // Movement onset = first frame velocity > 5% of peak, cursor leaving start area
//   // Movement offset = first frame velocity < threshold, cursor inside target, sustained for N frames
//   computeKinematicMetrics() {
//     const path = this.cursorPath;
//     if (path.length < 10) return null;
    
//     const { amplitude, direction, targetSize } = this.currentTrial;
//     const centerX = window.innerWidth / 2;
//     const centerY = window.innerHeight / 2;
//     const radians = (direction * Math.PI) / 180;
//     const targetX = centerX + amplitude * Math.cos(radians);
//     const targetY = centerY + amplitude * Math.sin(radians);
//     const targetRadius = targetSize / 2;
    
//     // Compute speed per frame (pixels/second)
//     const speeds = [0];
//     for (let i = 1; i < path.length; i++) {
//       const dx = path[i].x - path[i - 1].x;
//       const dy = path[i].y - path[i - 1].y;
//       const dt = (path[i].t - path[i - 1].t) / 1000;
//       if (dt <= 0) { speeds.push(0); continue; }
//       speeds.push(Math.sqrt(dx * dx + dy * dy) / dt);
//     }
    
//     // Smooth speed with 5-frame moving average
//     const smoothed = [];
//     const hw = 2; // half-window
//     for (let i = 0; i < speeds.length; i++) {
//       const lo = Math.max(0, i - hw);
//       const hi = Math.min(speeds.length, i + hw + 1);
//       let sum = 0;
//       for (let j = lo; j < hi; j++) sum += speeds[j];
//       smoothed.push(sum / (hi - lo));
//     }
    
//     const peakSpeed = Math.max(...smoothed);
//     if (peakSpeed === 0) return null;
//     const threshold = peakSpeed * 0.05;
    
//     // Find movement onset
//     const startRadius = this.previousTargetSize / 2;
//     let onsetIdx = null;
//     for (let i = 0; i < path.length; i++) {
//       const distFromStart = Math.sqrt(
//         Math.pow(path[i].x - this.startPoint.x, 2) +
//         Math.pow(path[i].y - this.startPoint.y, 2)
//       );
//       if (smoothed[i] > threshold && distFromStart > startRadius) {
//         onsetIdx = i;
//         break;
//       }
//     }
    
//     // Find movement offset: sustained low-speed period inside target
//     // Use the LAST re-entry that leads to successful dwell, not the first entry.
//     // Search backwards from end of path to find the final stop inside the target.
//     const hysteresis = 3;
//     let offsetIdx = null;
    
//     // Find the last target entry (the one that led to successful dwell)
//     const entries = this.targetEvents.filter(e => e.type === 'enter');
//     const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;
    
//     if (lastEntry) {
//       // Search forward from the last entry for sustained low speed
//       const searchStart = path.findIndex(p => p.t >= lastEntry.t);
//       if (searchStart >= 0) {
//         for (let i = searchStart; i < path.length - hysteresis; i++) {
//           const dist = Math.sqrt(
//             Math.pow(path[i].x - targetX, 2) +
//             Math.pow(path[i].y - targetY, 2)
//           );
//           if (dist <= targetRadius && smoothed[i] < threshold) {
//             let sustained = true;
//             for (let j = 1; j <= hysteresis; j++) {
//               if (i + j >= smoothed.length || smoothed[i + j] >= threshold) {
//                 sustained = false;
//                 break;
//               }
//             }
//             if (sustained) { offsetIdx = i; break; }
//           }
//         }
//       }
//       // Fallback: use the last entry position itself
//       if (offsetIdx === null && searchStart >= 0) {
//         offsetIdx = searchStart;
//       }
//     }
    
//     // Final fallback: search forward from onset (no entry events available)
//     if (offsetIdx === null) {
//       for (let i = (onsetIdx || 0) + 1; i < path.length - hysteresis; i++) {
//         const dist = Math.sqrt(
//           Math.pow(path[i].x - targetX, 2) +
//           Math.pow(path[i].y - targetY, 2)
//         );
//         if (dist <= targetRadius && smoothed[i] < threshold) {
//           let sustained = true;
//           for (let j = 1; j <= hysteresis; j++) {
//             if (i + j >= smoothed.length || smoothed[i + j] >= threshold) {
//               sustained = false;
//               break;
//             }
//           }
//           if (sustained) { offsetIdx = i; break; }
//         }
//       }
//     }
    
//     if (onsetIdx === null || offsetIdx === null) return null;
    
//     return {
//       movementOnsetTime: path[onsetIdx].t,
//       movementOffsetTime: path[offsetIdx].t,
//       kinematicMT: (path[offsetIdx].t - path[onsetIdx].t) / 1000,
//       endpointX: path[offsetIdx].x,
//       endpointY: path[offsetIdx].y,
//       peakSpeed,
//       speedThreshold: threshold
//     };
//   }
  
//   // Register a successful selection
//   registerSelection(x, y) {
//     // Trial completed normally — cancel the per-trial watchdog.
//     this._stopTrialTimer();
//     const selectionTime = performance.now();
    
//     // Calculate legacy movement time (includes dwell, kept for backward compatibility)
//     const movementTime = this.movementStartTime 
//       ? (selectionTime - this.movementStartTime) / 1000
//       : null;
    
//     // Store selection point
//     this.selectionPoint = { x, y };
    
//     // Calculate actual amplitude (distance from start to selection)
//     const actualAmplitude = Math.sqrt(
//       Math.pow(x - this.startPoint.x, 2) + Math.pow(y - this.startPoint.y, 2)
//     );
    
//     // Get current filter and layout
//     const filterType = this.getCurrentFilter();
//     const layout = this.getCurrentLayout();
    
//     // Calculate target center (from screen center, matching how targets are rendered)
//     const centerX = window.innerWidth / 2;
//     const centerY = window.innerHeight / 2;
//     const targetX = centerX + this.currentTrial.amplitude * Math.cos((this.currentTrial.direction * Math.PI) / 180);
//     const targetY = centerY + this.currentTrial.amplitude * Math.sin((this.currentTrial.direction * Math.PI) / 180);
    
//     // Re-entry count: number of times cursor entered the target beyond the first
//     const entryEvents = this.targetEvents.filter(e => e.type === 'enter');
//     const reEntryCount = Math.max(0, entryEvents.length - 1);
    
//     const lastEntry = entryEvents.length > 0 ? entryEvents[entryEvents.length - 1] : null;
//     const firstEntry = entryEvents.length > 0 ? entryEvents[0] : null;
    
//     // Velocity-based kinematic analysis (for onset detection)
//     const kinematic = this.computeKinematicMetrics();
//     const kinematicMT = kinematic ? kinematic.kinematicMT : null;
    
//     // Endpoint = cursor position at selection (standard Fitts' Law per ISO 9241-411)
//     const endpointX = x;
//     const endpointY = y;
    
//     // Effective amplitude: start to selection endpoint
//     const effectiveAmplitude = Math.sqrt(
//       Math.pow(endpointX - this.startPoint.x, 2) + Math.pow(endpointY - this.startPoint.y, 2)
//     );
    
//     // Entry-based MT (last entry time - movement start, kept for record)
//     const entryBasedMT = (this.movementStartTime && lastEntry)
//       ? (lastEntry.t - this.movementStartTime) / 1000
//       : null;
    
//     // PRIMARY MT: movement onset to dwell completion (includes dwell time)
//     // For dwell-based selection, MT should include the time to settle and complete
//     // the dwell, matching methodology of other dwell-based Fitts studies.
//     const onsetTime = kinematic ? kinematic.movementOnsetTime : this.movementStartTime;
//     const primaryMT = onsetTime ? (selectionTime - onsetTime) / 1000 : movementTime;
    
//     // Record trial data
//     const trialResult = {
//       status: 'completed',
//       part: this.currentPart,
//       // Pair configuration
//       pairIndex: this.currentTrial.pairIndex,
//       pairNumber: this.currentTrial.pairNumber,
//       pairVariance: this.currentTrial.pairVariance,
//       pairVarianceNormPct: this.currentTrial.pairVarianceNormPct,
//       pairDescription: this.currentTrial.pairDescription,
      
//       // Filter configuration
//       filterPhase: this.currentFilterPhase,
//       filterType: filterType,
//       filterRank: this.currentTrial.filterRank,
//       filterVariance: this.currentTrial.filterVariance,
//       filterLatency: this.currentTrial.filterLatency,
      
//       // Layout and trial info
//       layoutIndex: this.currentLayoutIndex,
//       trialInLayout: this.currentTrialInLayout,
//       globalTrialNumber: this.completedTrials + 1,
      
//       // Trial parameters
//       targetSize: this.currentTrial.targetSize,
//       amplitude: this.currentTrial.amplitude,
//       direction: this.currentTrial.direction,
//       directionIndex: this.currentTrialInLayout,
      
//       // Primary: MT from onset to dwell completion (includes dwell)
//       movementTime: primaryMT,
//       endpointX: endpointX,
//       endpointY: endpointY,
//       effectiveAmplitude: effectiveAmplitude,
//       peakSpeed: kinematic ? kinematic.peakSpeed : null,
//       startX: this.startPoint.x,
//       startY: this.startPoint.y,
//       targetX: targetX,
//       targetY: targetY,
      
//       // Secondary: kinematic MT (onset to velocity offset, dwell excluded)
//       kinematicMT: kinematicMT,
      
//       // Entry-based MT (for record / alternative analysis)
//       entryBasedMT: entryBasedMT,
//       lastEntryX: lastEntry ? lastEntry.x : null,
//       lastEntryY: lastEntry ? lastEntry.y : null,
      
//       // Legacy (movementStartTime to selectionTime, includes dwell)
//       totalTime: movementTime,
//       selectionX: x,
//       selectionY: y,
//       actualAmplitude: actualAmplitude,
      
//       // Dwell-specific metrics
//       reEntryCount: reEntryCount,
//       firstEntryTime: firstEntry ? firstEntry.t : null,
//       lastEntryTime: lastEntry ? lastEntry.t : null,
//       targetEventCount: this.targetEvents.length,
      
//       // Timestamps
//       trialStartTime: this.trialStartTime,
//       movementStartTime: this.movementStartTime,
//       movementOnsetTime: kinematic ? kinematic.movementOnsetTime : null,
//       movementOffsetTime: kinematic ? kinematic.movementOffsetTime : null,
//       selectionTime: selectionTime,
      
//       // Full cursor path for offline multi-dwell replay
//       cursorPath: this.cursorPath.map(p => ({ x: p.x, y: p.y, t: p.t })),
//       targetEvents: [...this.targetEvents]
//     };
    
//     // Practice trials are not recorded.
//     if (!this.isPracticeMode) {
//       this.trialData.push(trialResult);
//       this.completedTrials++;
//     }

//     console.log(this.isPracticeMode
//       ? "🎓 Practice trial completed (not recorded)"
//       : "✅ Trial completed:", trialResult);
//     console.log("Moving to next trial - currentTrialInLayout:", this.currentTrialInLayout, "→", this.currentTrialInLayout + 1);

//     // Increment counters
//     this.currentTrialInLayout++;
    
//     console.log("Updated counters - trialInLayout:", this.currentTrialInLayout, "completedTrials:", this.completedTrials);
    
//     // Small delay before next trial
//     setTimeout(() => {
//       console.log("Calling showNextTrial()...");
//       this.showNextTrial();
//     }, 500);
//   }
  
//   // Skip current layout
//   skipLayout() {
//     if (!confirm("Skip this layout and move to the next one? Progress will not be saved for this layout.")) {
//       return;
//     }
    
//     console.log(`⏭️ Skipping layout ${this.currentLayoutIndex + 1}`);
    
//     // Stop any running trial
//     if (this.cursorTrackingInterval) {
//       clearInterval(this.cursorTrackingInterval);
//       this.cursorTrackingInterval = null;
//     }
    
//     this.isRunning = false;
    
//     // Move to next layout without saving data
//     this.currentLayoutIndex++;
//     this.currentTrialInLayout = 0;
    
//     // Check if all layouts are complete for this filter phase
//     if (this.currentLayoutIndex >= this.layouts.length) {
//       this.endFilterPhase();
//     } else {
//       // Continue to next layout
//       this.showInstructions();
//     }
//   }
  
//   // End current layout
//   endLayout() {
//     console.log(`Layout ${this.currentLayoutIndex + 1}/${this.layouts.length} completed for ${this.getCurrentFilter()}`);

//     // Practice block: a single layout = the whole practice block. End here
//     // instead of advancing into a normal filter phase.
//     if (this.isPracticeMode) {
//       this.endPracticeBlock();
//       return;
//     }

//     // Move to next layout
//     this.currentLayoutIndex++;
//     this.currentTrialInLayout = 0;
    
//     // Check if all layouts are complete for this filter phase
//     if (this.currentLayoutIndex >= this.layouts.length) {
//       this.endFilterPhase();
//     } else {
//       // Continue to next layout (brief pause)
//       setTimeout(() => {
//         this.showInstructions();
//       }, 1000);
//     }
//   }
  
//   async endFilterPhase() {
//     this._stopConditionTimer();
//     const pair = this.getCurrentPair();
//     console.log(`Filter phase ${this.currentFilterPhase + 1} for Pair ${pair.pairNumber} completed (missed: ${this.conditionMissedTrials || 0})`);

//     // ---- Filter-block mode -------------------------------------------------
//     // No inner filter-phase switching. A "condition" = one variance level of
//     // the segment's fixed filter. After each condition show the questionnaire,
//     // then advance to the next variance (pair) or, at the end of the segment,
//     // to the next segment (swapping calibration when it changes).
//     if (this._useFilterBlockOrder) {
//       const isLastPairInSegment =
//         this.currentPairIndex >= this.config.varianceMatchedPairs.length - 1;
//       const isLastSegment = this._segmentIndex >= this._segments.length - 1;
//       const isFinalCondition = isLastPairInSegment && isLastSegment;

//       if (isFinalCondition) {
//         await this._finalizeAndAutoDownload();
//       }

//       this.showMiniQuestionnaire(async () => {
//         if (!isLastPairInSegment) {
//           this.showPairTransition();
//         } else if (!isLastSegment) {
//           await this._advanceSegment();
//         } else {
//           await this._redownloadWithFinalFeedback();
//           this.calculateResults();
//         }
//       });
//       return;
//     }

//     // Detect the very last condition of the experiment: last filter phase, last
//     // pair, and Part A is already complete (so we're inside Part B).
//     const isFinalCondition = (
//       this.currentFilterPhase === 1 &&
//       this.currentPairIndex === this.config.varianceMatchedPairs.length - 1 &&
//       this.partACompleted === true
//     );

//     // Fire auto-download + /api/complete BEFORE the final feedback so that
//     // we GUARANTEE the data is saved even if the participant closes the tab
//     // during feedback. The final feedback is captured by a second download
//     // triggered after the questionnaire is submitted (see below).
//     if (isFinalCondition) {
//       await this._finalizeAndAutoDownload();
//     }

//     // Show mini questionnaire, then proceed to break/transition
//     this.showMiniQuestionnaire(async () => {
//       if (this.currentFilterPhase === 0) {
//         this.showFilterBreak();
//       } else {
//         if (this.currentPairIndex < this.config.varianceMatchedPairs.length - 1) {
//           this.showPairTransition();
//         } else {
//           // Final feedback just submitted — re-download both ZIPs so the
//           // researcher has a copy that includes the last feedback row.
//           await this._redownloadWithFinalFeedback();
//           this.endExperiment();
//         }
//       }
//     });
//   }

//   // Re-trigger downloadPartZip after the final feedback was submitted. Uses a
//   // distinct timestamp so the new files don't collide with the pre-feedback
//   // pair already on the participant's device.
//   async _redownloadWithFinalFeedback() {
//     if (!this._finalized) return; // safety: skip if early download didn't run
//     try {
//       this._exportTimestamp = new Date().toISOString();
//       await this.downloadPartZip('Part A');
//       await new Promise(r => setTimeout(r, 400));
//       await this.downloadPartZip('Part B');
//       console.log('Re-download with final feedback completed');
//     } catch (err) {
//       console.warn('Re-download with feedback failed:', err);
//     }
//   }
  
//   showMiniQuestionnaire(onComplete) {
//     const pair = this.getCurrentPair();
//     const filterType = this.getCurrentFilter();
//     const conditionNum = (this.miniQuestionnaireResponses?.length || 0) + 1;

//     // Hide the head cursors during the feedback screen so the participant
//     // isn't tempted to move their head to control a pointer while reading
//     // and answering the questions. Spacebar/Enter (and mouse) still work.
//     const _fbCursorRed = document.getElementById('head-cursor-clipped');
//     const _fbCursorRaw = document.getElementById('head-cursor-raw');
//     const _fbRedWasVisible = _fbCursorRed && _fbCursorRed.style.display !== 'none';
//     const _fbRawWasVisible = _fbCursorRaw && _fbCursorRaw.style.display !== 'none';
//     if (_fbCursorRed) _fbCursorRed.style.display = 'none';
//     if (_fbCursorRaw) _fbCursorRaw.style.display = 'none';
//     // Show the MOUSE cursor while the form is open so the participant can
//     // click the scale buttons and type into the text fields.
//     const _fbHadHideCursor = document.body.classList.contains('hide-cursor');
//     document.body.classList.remove('hide-cursor');
//     const restoreFeedbackCursors = () => {
//       if (_fbCursorRed && _fbRedWasVisible) _fbCursorRed.style.display = '';
//       if (_fbCursorRaw && _fbRawWasVisible) _fbCursorRaw.style.display = '';
//       if (_fbHadHideCursor) document.body.classList.add('hide-cursor');
//     };

//     // Mini-questionnaire — Likert 1–5 (Completely Disagree → Completely Agree).
//     // Wording per Manduchi (June 2026): drop the near-duplicate "natural" item,
//     // add an explicit jitter item, and balance two negative (jitter, delay) with
//     // two positive (accuracy, low effort) statements to break acquiescence bias.
//     //
//     // The standard-calibration test (Part B) gets a DIFFERENT, comparison-style
//     // questionnaire that asks whether this test felt different from the earlier
//     // ones and which the participant preferred — with NO priming beforehand.
//     const isComparisonPart = this.currentPart === 'Part B';
//     const questions = isComparisonPart
//       ? [
//           { id: 'noticedDifference', label: 'These last tests felt different from the earlier ones', polarity: 'neutral' },
//           { id: 'preferredThese',    label: 'I preferred these last tests over the earlier ones',    polarity: 'neutral' }
//         ]
//       : [
//           { id: 'tooMuchJitter',     label: 'I think there was too much jitter or shakiness in the cursor',      polarity: 'negative' },
//           { id: 'noticeableDelay',   label: 'I think there was too much delay between my head and the cursor',   polarity: 'negative' },
//           { id: 'accurateFollowing', label: 'I think the cursor was following my head very accurately',          polarity: 'positive' },
//           { id: 'lowEffort',         label: 'I did not have to put a lot of effort to keep the cursor on target', polarity: 'positive' }
//         ];

//     let currentQuestionIndex = 0;
//     let currentCycleValue = 0;

//     const scaleHTML = (q, idx) => `
//       <div id="q-row-${q.id}" style="margin: 18px 0; padding: 12px; border-radius: 8px; border: 2px solid transparent;
//         ${idx === 0 ? 'border-color: #64c8ff; background: rgba(100, 200, 255, 0.08);' : ''}">
//         <label style="display: block; margin-bottom: 8px; font-weight: bold; font-size: 16px;">${q.label}</label>
//         <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
//           <span style="font-size: 12px; color: #888;">Completely Disagree</span>
//           <span style="font-size: 12px; color: #888;">Completely Agree</span>
//         </div>
//         <div style="display: flex; gap: 8px; justify-content: center;">
//           ${[1,2,3,4,5].map(n => `
//             <button class="scale-btn" data-question="${q.id}" data-value="${n}"
//               style="width: 56px; height: 56px; border-radius: 8px; border: 2px solid #555;
//               background: rgba(255,255,255,0.1); color: white; font-size: 20px; font-weight: bold;
//               cursor: pointer; transition: all 0.15s;">${n}</button>
//           `).join('')}
//         </div>
//       </div>
//     `;

//     this.experimentUI.innerHTML = `
//       <div class="experiment-instructions" style="max-width: 520px; margin: 0 auto; padding: 30px;">
//         <h2 style="font-size: 22px;">Feedback (${conditionNum}/7)</h2>
//         <p style="color: #aaa; font-size: 14px; margin-bottom: 6px;">
//           For each statement, indicate how much you agree or disagree:<br>
//           <strong>1</strong> = Completely Disagree &nbsp;·&nbsp; <strong>5</strong> = Completely Agree
//         </p>
//         <div style="background: rgba(100, 200, 255, 0.06); border: 1px solid rgba(100, 200, 255, 0.2);
//           border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; color: #bbb; line-height: 1.6;">
//           <strong style="color: #ccc;">How to answer:</strong><br>
//           <span style="color: #64c8ff;">Space</span> &rarr; cycle through 1, 2, 3, 4, 5 &nbsp;&nbsp;
//           <span style="color: #64c8ff;">Enter</span> &rarr; confirm your choice<br>
//           Or simply <span style="color: #64c8ff;">click</span> a number directly.
//         </div>
//         ${questions.map((q, i) => scaleHTML(q, i)).join('')}
//         <div style="margin: 22px 0; padding: 12px; border-radius: 8px;">
//           <label for="mini-q-preference" style="display: block; margin-bottom: 8px; font-weight: bold; font-size: 16px;">
//             ${isComparisonPart
//               ? 'Did you notice any difference between these last tests and the earlier ones? Which did you prefer, and why?'
//               : 'What is more important to you: a faster cursor or one with less jitter?'}
//           </label>
//           <textarea id="mini-q-preference" rows="2"
//             style="width: 100%; box-sizing: border-box; border-radius: 6px; border: 2px solid #555;
//             background: rgba(255,255,255,0.08); color: white; font-size: 14px; padding: 10px;
//             resize: vertical;" placeholder="Type your answer here (optional)"></textarea>
//         </div>
//         <div style="margin: 18px 0; padding: 12px; border-radius: 8px;">
//           <label for="mini-q-comments" style="display: block; margin-bottom: 8px; font-weight: bold; font-size: 16px;">
//             Any other thoughts or comments?
//           </label>
//           <textarea id="mini-q-comments" rows="2"
//             style="width: 100%; box-sizing: border-box; border-radius: 6px; border: 2px solid #555;
//             background: rgba(255,255,255,0.08); color: white; font-size: 14px; padding: 10px;
//             resize: vertical;" placeholder="Type here if anything comes to mind (optional)"></textarea>
//         </div>
//         <button id="mini-q-submit" class="experiment-button continue-button" disabled
//           style="margin-top: 20px; opacity: 0.4; cursor: not-allowed; font-size: 16px; padding: 14px 30px;">
//           Continue
//         </button>
//       </div>
//     `;

//     const selected = {};
//     const totalQs = questions.length;

//     const highlightQuestion = (idx) => {
//       questions.forEach((q, i) => {
//         const row = document.getElementById(`q-row-${q.id}`);
//         if (row) {
//           row.style.borderColor = i === idx ? '#64c8ff' : 'transparent';
//           row.style.background = i === idx ? 'rgba(100, 200, 255, 0.08)' : 'transparent';
//         }
//       });
//     };

//     const selectValue = (qid, val) => {
//       selected[qid] = val;
//       this.experimentUI.querySelectorAll(`.scale-btn[data-question="${qid}"]`).forEach(b => {
//         b.style.background = parseInt(b.dataset.value) === val ? '#4a90d9' : 'rgba(255,255,255,0.1)';
//         b.style.borderColor = parseInt(b.dataset.value) === val ? '#4a90d9' : '#555';
//       });
//       if (Object.keys(selected).length === totalQs) {
//         const submitBtn = document.getElementById('mini-q-submit');
//         submitBtn.disabled = false;
//         submitBtn.style.opacity = '1';
//         submitBtn.style.cursor = 'pointer';
//         // All scale questions answered — move focus into the first text field
//         // so the participant can start typing right away.
//         const pref = document.getElementById('mini-q-preference');
//         if (pref) setTimeout(() => pref.focus(), 50);
//       }
//     };

//     const highlightCycleValue = (qid, val) => {
//       this.experimentUI.querySelectorAll(`.scale-btn[data-question="${qid}"]`).forEach(b => {
//         const bVal = parseInt(b.dataset.value);
//         if (bVal === val && selected[qid] !== val) {
//           b.style.background = 'rgba(100, 200, 255, 0.3)';
//           b.style.borderColor = '#64c8ff';
//         } else if (selected[qid] === bVal) {
//           b.style.background = '#4a90d9';
//           b.style.borderColor = '#4a90d9';
//         } else {
//           b.style.background = 'rgba(255,255,255,0.1)';
//           b.style.borderColor = '#555';
//         }
//       });
//     };

//     // Click handlers
//     this.experimentUI.querySelectorAll('.scale-btn').forEach(btn => {
//       btn.addEventListener('click', () => {
//         const qid = btn.dataset.question;
//         const val = parseInt(btn.dataset.value);
//         selectValue(qid, val);

//         const qIdx = questions.findIndex(q => q.id === qid);
//         if (qIdx !== -1 && qIdx < totalQs - 1) {
//           currentQuestionIndex = qIdx + 1;
//           currentCycleValue = 0;
//           highlightQuestion(currentQuestionIndex);
//         }
//       });
//     });

//     // Keyboard handler: Space cycles 1→2→3→4→5, Enter confirms.
//     // Never intercept keys while the participant is typing in a text field.
//     const keyHandler = (e) => {
//       if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
//       if (e.code === 'Space') {
//         e.preventDefault();
//         if (currentQuestionIndex >= totalQs) return;
//         currentCycleValue = (currentCycleValue % 5) + 1;
//         const qid = questions[currentQuestionIndex].id;
//         highlightCycleValue(qid, currentCycleValue);
//       } else if (e.code === 'Enter') {
//         e.preventDefault();
//         if (currentQuestionIndex >= totalQs) {
//           // All questions answered — submit
//           const submitBtn = document.getElementById('mini-q-submit');
//           if (!submitBtn.disabled) submitBtn.click();
//           return;
//         }
//         if (currentCycleValue > 0) {
//           const qid = questions[currentQuestionIndex].id;
//           selectValue(qid, currentCycleValue);
//           currentQuestionIndex++;
//           currentCycleValue = 0;
//           if (currentQuestionIndex < totalQs) {
//             highlightQuestion(currentQuestionIndex);
//           } else {
//             highlightQuestion(-1);
//           }
//         }
//       }
//     };
//     document.addEventListener('keydown', keyHandler);

//     document.getElementById('mini-q-submit').addEventListener('click', () => {
//       document.removeEventListener('keydown', keyHandler);
//       restoreFeedbackCursors();
//       const preference = (document.getElementById('mini-q-preference')?.value || '').trim();
//       const comments = (document.getElementById('mini-q-comments')?.value || '').trim();
//       this.miniQuestionnaireResponses.push({
//         part: this.currentPart,
//         pairNumber: pair.pairNumber,
//         pairVariance: pair.variance,
//         filterType: filterType,
//         filterPhase: this.currentFilterPhase,
//         // Part A (personal) main questionnaire:
//         tooMuchJitter: selected.tooMuchJitter,
//         noticeableDelay: selected.noticeableDelay,
//         accurateFollowing: selected.accurateFollowing,
//         lowEffort: selected.lowEffort,
//         // Part B (standard) comparison questionnaire:
//         noticedDifference: selected.noticedDifference,
//         preferredThese: selected.preferredThese,
//         // free-text (preference for Part A; difference/preference for Part B):
//         speedVsJitter: preference,
//         comments: comments,
//         timestamp: Date.now()
//       });
//       onComplete();
//     });
//   }

//   // Show NASA-TLX questionnaire (called after each part)
//   showNASATLX(partLabel, onComplete) {
//     const scales = [
//       { id: 'mental',     label: 'Mental Demand',   low: 'Very Low', high: 'Very High',
//         desc: 'How mentally demanding was the task?' },
//       { id: 'physical',   label: 'Physical Demand',  low: 'Very Low', high: 'Very High',
//         desc: 'How physically demanding was the task?' },
//       { id: 'temporal',   label: 'Temporal Demand',   low: 'Very Low', high: 'Very High',
//         desc: 'How hurried or rushed was the pace of the task?' },
//       { id: 'performance', label: 'Performance',      low: 'Perfect', high: 'Failure',
//         desc: 'How successful were you in accomplishing the task?' },
//       { id: 'effort',     label: 'Effort',            low: 'Very Low', high: 'Very High',
//         desc: 'How hard did you have to work to accomplish your level of performance?' },
//       { id: 'frustration', label: 'Frustration',      low: 'Very Low', high: 'Very High',
//         desc: 'How insecure, discouraged, or irritated did you feel?' }
//     ];

//     this.experimentUI.innerHTML = `
//       <div class="experiment-instructions" style="max-width: 600px; margin: 0 auto;">
//         <h2>${partLabel} — Experience (NASA-TLX)</h2>
//         <p style="margin-bottom: 15px; opacity: 0.8;">Please rate your experience for the section you just completed.</p>
        
//         ${scales.map(s => `
//           <div style="margin: 16px 0; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px;">
//             <label style="display: block; font-weight: bold; margin-bottom: 2px;">${s.label}</label>
//             <div style="font-size: 12px; opacity: 0.7; margin-bottom: 8px;">${s.desc}</div>
//             <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
//               <span style="font-size: 11px; opacity: 0.7;">${s.low}</span>
//               <span style="font-size: 11px; opacity: 0.7;">${s.high}</span>
//             </div>
//             <input type="range" id="tlx-${s.id}" min="1" max="21" value="11" class="tlx-slider"
//               style="width: 100%; accent-color: #4a90d9;">
//             <div style="text-align: center; font-size: 14px; font-weight: bold;" id="tlx-${s.id}-val">11</div>
//           </div>
//         `).join('')}

//         <div style="margin: 16px 0;">
//           <label style="display: block; font-weight: bold; margin-bottom: 6px;">Comments (optional)</label>
//           <textarea id="tlx-comments" rows="3" placeholder="Any additional feedback about your experience..."
//             style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #555;
//             background: rgba(255,255,255,0.1); color: white; font-size: 13px; resize: vertical;
//             box-sizing: border-box;"></textarea>
//         </div>

//         <button id="tlx-submit" class="experiment-button continue-button" style="margin-top: 10px;">
//           Submit &amp; Continue
//         </button>
//       </div>
//     `;

//     // Live value display for sliders
//     this.experimentUI.querySelectorAll('.tlx-slider').forEach(slider => {
//       slider.addEventListener('input', () => {
//         document.getElementById(`${slider.id}-val`).textContent = slider.value;
//       });
//     });

//     document.getElementById('tlx-submit').addEventListener('click', () => {
//       const response = {
//         part: partLabel,
//         participantId: this.participantId || '',
//         timestamp: Date.now()
//       };
//       scales.forEach(s => {
//         response[s.id] = parseInt(document.getElementById(`tlx-${s.id}`).value);
//       });
//       response.comments = document.getElementById('tlx-comments').value.trim();
//       this.nasaTLXResponses.push(response);
//       console.log(`📝 NASA-TLX (${partLabel}):`, response);
//       onComplete();
//     });
//   }

//   // Show 1-minute break between filter phases within a pair
//   showFilterBreak() {
//     this.breakTimeRemaining = this.config.breakDuration;
//     const pair = this.getCurrentPair();
//     const completedFilter = this.getCurrentFilter();
//     const completedFilterName = completedFilter === 'exponential' ? 'Exponential Smoothing' : 'One Euro Filter';
//     const completedConfig = completedFilter === 'exponential' ? pair.exponential : pair.oneEuro;
//     const nextFilter = completedFilter === 'exponential' ? 'oneEuro' : 'exponential';
//     const nextFilterName = nextFilter === 'exponential' ? 'Exponential Smoothing' : 'One Euro Filter';
//     const nextConfig = nextFilter === 'exponential' ? pair.exponential : pair.oneEuro;
    
//     this.experimentUI.innerHTML = `
//       <div class="experiment-instructions" style="text-align: center; padding: 30px;">
//         <h2>Phase Complete!</h2>
//         <p style="color: #aaa; font-size: 16px; margin: 10px 0;">
//           ${this.completedTrials} / ${this.totalTrials} trials done
//         </p>

//         <h3 style="margin-top: 25px;">Break</h3>
//         <div style="font-size: 48px; font-weight: bold; color: #64ff64; margin: 15px 0;" id="break-timer">
//           ${this.formatTime(this.breakTimeRemaining)}
//         </div>
//         <p style="color: #888; font-size: 14px;">Relax your neck and eyes. Next filter starts automatically.</p>

//         <button class="experiment-button continue-button" onclick="window.fittsExperiment.skipBreak()" style="margin-top: 20px;">
//           Skip Break (or press Space)
//         </button>
//       </div>
//     `;
    
//     // Start countdown
//     this.breakInterval = setInterval(() => {
//       this.breakTimeRemaining--;
//       const timerElement = document.getElementById('break-timer');
//       if (timerElement) {
//         timerElement.textContent = this.formatTime(this.breakTimeRemaining);
//       }
      
//       if (this.breakTimeRemaining <= 0) {
//         clearInterval(this.breakInterval);
//         this.continueToNextFilterPhase();
//       }
//     }, 1000);
//   }
  
//   // Format time as MM:SS
//   formatTime(seconds) {
//     const mins = Math.floor(seconds / 60);
//     const secs = seconds % 60;
//     return `${mins}:${secs.toString().padStart(2, '0')}`;
//   }
  
//   // Skip break
//   skipBreak() {
//     if (this.breakInterval) {
//       clearInterval(this.breakInterval);
//       this.breakInterval = null;
//     }
//     this.continueToNextFilterPhase();
//   }
  
//   // Continue to next filter phase (within same pair)
//   async continueToNextFilterPhase() {
//     const pair = this.getCurrentPair();
    
//     // Move to second filter phase within same pair
//     this.currentFilterPhase = 1;
//     this.currentLayoutIndex = 0;
//     this.currentTrialInLayout = 0;
    
//     const nextFilter = this.getCurrentFilter(); // now returns the second filter
//     const filterConfig = nextFilter === 'exponential' ? pair.exponential : pair.oneEuro;
    
//     console.log(`🔄 Continuing to ${nextFilter} (Rank ${filterConfig.rank}) for Pair ${pair.pairNumber}`);
//     await this.setFilter(nextFilter, filterConfig);
    
//     // Update phase indicator
//     console.log("Updating phase indicator...");
//     this.addExperimentPhaseIndicator();
    
//     // Verify the configuration rank slider is visible
//     setTimeout(() => {
//       const paretoSelector = document.querySelector('.pareto-front-selector');
//       if (paretoSelector) {
//         console.log("✅ Configuration rank slider is visible!");
//       } else {
//         console.error("❌ Configuration rank slider NOT visible - React may not have re-rendered");
//         console.log("Attempting forced re-render...");
//         if (window.trackingControlsRoot && window.TrackingControls) {
//           window.trackingControlsRoot.render(React.createElement(window.TrackingControls));
//         }
//       }
//     }, 500);
    
//     // Ensure cursor is still visible
//     this.ensureCursorVisible();
    
//     // Show instructions for first layout with One Euro
//     this.showInstructions();
//   }
  
//   // Show transition screen between pairs
//   showPairTransition() {
//     const completedPair = this.getCurrentPair();
//     const nextPairIndex = this.currentPairIndex + 1;
//     const nextPair = this.config.varianceMatchedPairs[nextPairIndex];
    
//     this.breakTimeRemaining = this.config.breakDuration;
    
//     this.experimentUI.innerHTML = `
//       <div class="experiment-instructions" style="text-align: center; padding: 30px;">
//         <h2>Pair ${completedPair.pairNumber} Complete!</h2>
//         <p style="color: #aaa; font-size: 16px; margin: 10px 0;">
//           ${this.completedTrials} / ${this.totalTrials} trials done
//         </p>

//         <h3 style="margin-top: 25px;">Break</h3>
//         <div style="font-size: 48px; font-weight: bold; color: #64ff64; margin: 15px 0;" id="break-timer">
//           ${this.formatTime(this.breakTimeRemaining)}
//         </div>
//         <p style="color: #888; font-size: 14px;">Relax your neck and eyes. Next pair starts automatically.</p>

//         <button class="experiment-button continue-button" onclick="window.fittsExperiment.skipPairBreak()" style="margin-top: 20px;">
//           Skip Break (or press Space)
//         </button>
//       </div>
//     `;
    
//     // Start countdown
//     this.breakInterval = setInterval(() => {
//       this.breakTimeRemaining--;
//       const timerElement = document.getElementById('break-timer');
//       if (timerElement) {
//         timerElement.textContent = this.formatTime(this.breakTimeRemaining);
//       }
      
//       if (this.breakTimeRemaining <= 0) {
//         clearInterval(this.breakInterval);
//         this.continueToNextPair();
//       }
//     }, 1000);
//   }
  
//   // Skip pair transition break
//   skipPairBreak() {
//     if (this.breakInterval) {
//       clearInterval(this.breakInterval);
//       this.breakInterval = null;
//     }
//     this.continueToNextPair();
//   }
  
//   // Continue to next pair
//   async continueToNextPair() {
//     console.log(`🔄 Moving to Pair ${this.currentPairIndex + 2}`);
    
//     // Move to next pair, reset to first filter phase
//     this.currentPairIndex++;
//     this.currentFilterPhase = 0;
//     this.currentLayoutIndex = 0;
//     this.currentTrialInLayout = 0;
    
//     const pair = this.getCurrentPair();
//     const firstFilter = this.getCurrentFilter(); // respects counterbalancing
//     const filterConfig = firstFilter === 'exponential' ? pair.exponential : pair.oneEuro;
    
//     console.log(`Setting filter to ${firstFilter} Rank ${filterConfig.rank}...`);
//     await this.setFilter(firstFilter, filterConfig);
    
//     // Update phase indicator
//     this.addExperimentPhaseIndicator();
    
//     // Ensure cursor is still visible
//     this.ensureCursorVisible();
    
//     // Show instructions for first layout
//     this.showInstructions();
//   }
  
  
//   // End current part of the experiment
//   endExperiment() {
//     console.log(`${this.currentPart} completed!`);
    
//     // Stop update loop
//     if (this.cursorTrackingInterval) {
//       clearInterval(this.cursorTrackingInterval);
//       this.cursorTrackingInterval = null;
//     }
    
//     this.isRunning = false;
    
//     const isFirstPartDone = !this.partACompleted && !this.partBCompleted;
//     if (this.currentPart === 'Part A') this.partACompleted = true;
//     else this.partBCompleted = true;

//     // Skip NASA-TLX — professor only wants the 4-question feedback after each condition
//     if (isFirstPartDone) {
//       this.showCalibrationSwapScreen();
//     } else {
//       this.calculateResults();
//     }
//   }

//   // ---- Calibration swap helpers (used by showCalibrationSwapScreen AND by
//   // start() when counterbalancing puts Part B first) ----

//   // URL of the frozen group-standard calibration file (anyone running the
//   // experiment will fetch this same file for Part B's "standard"
//   // calibration so the personal-vs-standard contrast is well-defined).
//   static get STANDARD_CALIBRATION_URL()  { return '/standard-calibration.csv'; }
//   static get STANDARD_CALIBRATION_NAME() { return 'standard-calibration.csv'; }

//   // Capture a deep copy of the participant's personal calibration so we
//   // can restore it later without re-uploading. Idempotent: only the first
//   // call wins, so we don't accidentally snapshot the standard after a
//   // swap.
//   _snapshotPersonalCalibration() {
//     if (this._personalCalibrationSnapshot) return;
//     if (!window.state || !window.state.calibrationData) return;
//     try {
//       this._personalCalibrationSnapshot = {
//         calibrationData: JSON.parse(JSON.stringify(window.state.calibrationData)),
//         config:          JSON.parse(JSON.stringify(window.state.config || {})),
//         calibrationSource: window.state.calibrationSource || 'Fresh calibration (snapshot)',
//       };
//       console.log('📸 Personal calibration snapshotted:', this._personalCalibrationSnapshot.calibrationSource);
//     } catch (err) {
//       console.warn('Failed to snapshot personal calibration:', err);
//       this._personalCalibrationSnapshot = null;
//     }
//   }

//   // Restore the snapshotted personal calibration. Returns true on success,
//   // false if there's no snapshot or restoration fails. Triggers the same
//   // tracking-reinit path as a manual upload so the downstream cursor loop
//   // sees consistent state.
//   async _restorePersonalCalibration() {
//     const snap = this._personalCalibrationSnapshot;
//     if (!snap || !window.state) return false;
//     try {
//       window.state.calibrationData   = JSON.parse(JSON.stringify(snap.calibrationData));
//       window.state.config            = JSON.parse(JSON.stringify(snap.config));
//       window.state.calibrationSource = snap.calibrationSource;
//       if (window.startTracking && typeof window.startTracking === 'function') {
//         await window.startTracking();
//       }
//       this._currentCalibrationKind = 'personal';
//       console.log('♻️ Personal calibration restored:', snap.calibrationSource);
//       return true;
//     } catch (err) {
//       console.error('Failed to restore personal calibration:', err);
//       return false;
//     }
//   }

//   // Fetch and apply the frozen standard calibration through the same
//   // handleCalibrationUpload code path as a manual upload. Returns
//   // true on success, false otherwise. The optional statusFn callback
//   // receives human-readable progress strings for inline UI updates.
//   async _loadStandardCalibration(statusFn) {
//     const name = FittsExperiment.STANDARD_CALIBRATION_NAME;
//     const status = (s, color) => { if (typeof statusFn === 'function') statusFn(s, color); };

//     if (!window.handleCalibrationUpload) {
//       status('handleCalibrationUpload not available on this page.', '#ff6464');
//       return false;
//     }

//     // Retry the WHOLE load+confirm cycle automatically. Transient hiccups
//     // (a slow tracking re-init, a momentary fetch blip) are the only realistic
//     // failure modes here, and they self-heal on a retry — so the swap should
//     // never get permanently stuck for a participant.
//     const MAX_ATTEMPTS = 5;
//     for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
//       if (attempt > 1) {
//         console.warn(`[swap] retrying standard calibration (attempt ${attempt}/${MAX_ATTEMPTS})…`);
//         status(`Getting the next test ready… (retry ${attempt}/${MAX_ATTEMPTS})`, '#ffc864');
//         await new Promise(r => setTimeout(r, 600));  // brief backoff between tries
//       }
//       const ok = await this._attemptStandardLoad(name, status);
//       if (ok) return true;
//     }

//     console.error(`[swap] ❌ standard calibration FAILED after ${MAX_ATTEMPTS} attempts. `
//       + `Continue stays disabled (never silently runs on personal calibration).`);
//     status('⚠️ Setup issue — please let the experimenter know.', '#ffc864');
//     return false;
//   }

//   // One load+confirm attempt. Returns true only when the standard calibration
//   // is DEFINITIVELY active. Never throws — failures resolve to false so the
//   // caller can retry.
//   async _attemptStandardLoad(name, status) {
//     const url = FittsExperiment.STANDARD_CALIBRATION_URL;
//     try {
//       console.log(`[swap] loading standard calibration from ${url}…`);
//       status(`Getting the next test ready…`, '#ffc864');
//       const resp = await fetch(url, { cache: 'no-store' });
//       if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
//       const blob = await resp.blob();
//       const file = new File([blob], name, { type: 'text/csv' });

//       const beforeSource = window.state?.calibrationSource || '';
//       const ok = await window.handleCalibrationUpload(file);
//       if (!ok) {
//         console.warn(`[swap] handleCalibrationUpload returned false for ${url}.`);
//         return false;
//       }
//       // Poll and confirm the swap DEFINITIVELY took effect. We require two
//       // independent signals, not just "the source string changed":
//       //   1. calibrationSource now names the standard file specifically, and
//       //   2. calibration data is actually present in state.
//       // handleCalibrationUpload sets calibrationSource = "Uploaded: <name>"
//       // only AFTER it has parsed and installed the data (database.js), so this
//       // pair of checks can't pass unless the standard calibration is really
//       // active. This is what makes the swap certain rather than best-effort.
//       const t0 = Date.now();
//       while (Date.now() - t0 < 5000) {
//         const now = (window.state?.calibrationSource || '').trim();
//         const namesStandard = now.includes(name);          // "...standard-calibration.csv"
//         const hasData = !!window.state?.calibrationData;
//         const changed = now !== beforeSource.trim();
//         if (namesStandard && hasData && changed) {
//           console.log(`[swap] ✅ standard calibration CONFIRMED active: "${now}" (data present)`);
//           this._currentCalibrationKind = 'standard';
//           status(`✅ Ready`, '#64ff96');
//           return true;
//         }
//         await new Promise(r => setTimeout(r, 100));
//       }
//       console.warn(`[swap] not confirmed within 5s `
//         + `(source="${window.state?.calibrationSource || ''}").`);
//       return false;
//     } catch (err) {
//       console.warn('[swap] attempt error:', err && err.message ? err.message : err);
//       return false;
//     }
//   }

//   // Inline blocking screen used at session start when counterbalancing puts
//   // Part B first. Snapshots the fresh personal calibration (so we can
//   // restore it for Part A later) and auto-loads the frozen standard so
//   // Part B actually runs under standard calibration — the previous code
//   // path just ran Part B with whatever fresh calibration was loaded,
//   // silently breaking the personal-vs-standard contrast.
//   // Returns a Promise<boolean>: true if the swap completed, false on
//   // failure (caller should abort the experiment in that case).
//   async _showStartingPartBStandardSwapScreen() {
//     this._snapshotPersonalCalibration();
//     this.experimentUI.innerHTML = `
//       <div class="experiment-instructions" style="text-align: center; padding: 30px; max-width: 540px; margin: 0 auto;">
//         <h2>Setting up the next test</h2>
//         <p style="color: #aaa; font-size: 14px;">
//           Please wait a moment while we get the next test ready.
//         </p>
//         <p id="start-swap-status" style="color: #ffc864; font-size: 13px; margin-top: 16px;">
//           Setting up…
//         </p>
//         <button id="start-swap-continue-btn" class="experiment-button continue-button" disabled
//           style="opacity: 0.5; cursor: not-allowed; margin-top: 24px;">
//           Waiting…
//         </button>
//       </div>
//     `;
//     const statusEl = document.getElementById('start-swap-status');
//     const setStatus = (s, color) => {
//       if (!statusEl) return;
//       statusEl.innerHTML = s;
//       if (color) statusEl.style.color = color;
//     };
//     const ok = await this._loadStandardCalibration(setStatus);
//     if (!ok) return false;

//     const btn = document.getElementById('start-swap-continue-btn');
//     return await new Promise(resolve => {
//       if (btn) {
//         btn.disabled = false;
//         btn.style.opacity = '1';
//         btn.style.cursor = 'pointer';
//         btn.textContent = 'Continue (or press Space)';
//         btn.addEventListener('click', () => resolve(true), { once: true });
//       } else {
//         resolve(true);
//       }
//     });
//   }

//   // Show screen to swap calibration between Part A and Part B
//   showCalibrationSwapScreen() {
//     const nextPart = this.currentPart === 'Part A' ? 'Part B' : 'Part A';
//     const isEnteringPartB = nextPart === 'Part B';
//     const nextCalibLabel = isEnteringPartB
//       ? 'Standard Calibration (provided by experimenter)'
//       : 'Personal Calibration (your own)';

//     // Capture the source string BEFORE the swap so we can detect that a real
//     // swap actually happened. The RQ3 audit in pilot_analysis.py uses this
//     // same source string — keeping these two ends honest is what makes the
//     // personal-vs-standard comparison interpretable.
//     const sourceBeforeSwap = window.state?.calibrationSource || 'Current calibration';

//     this.breakTimeRemaining = this.config.breakDuration;

//     // For Part A entry (i.e., the participant is returning from Part B), we
//     // try to AUTO-restore their personal calibration from the snapshot taken
//     // at session start. The manual upload control is only revealed as a
//     // fallback if restoration fails. For Part B entry, the snapshot is taken
//     // here too so we can restore later if the experiment is ever extended to
//     // > 2 parts.
//     if (isEnteringPartB) this._snapshotPersonalCalibration();

//     // Same screen layout for both directions of the swap: rest-break timer +
//     // an auto-running status line + a Continue button that is enabled only
//     // once the calibration has been swapped successfully. NO manual upload
//     // controls — the swap is always automatic (Part A ⇒ personal restored
//     // from snapshot, Part B ⇒ frozen standard fetched). If the automatic
//     // path fails, the status line surfaces the error and the Continue
//     // button stays disabled — the experimenter is expected to fix the
//     // protocol issue (re-deploy / DNS / etc.) rather than work around it
//     // with an upload escape hatch.
//     // Participant-facing status is intentionally neutral — no mention of
//     // "standard"/"personal" calibration or Part A/B, so participants are not
//     // primed that the next test will feel different (per Manduchi, June 2026).
//     // The real swap label is logged to the console for the experimenter.
//     console.log(`[swap] entering ${nextPart}; calibration will be: ${nextCalibLabel}`);
//     const initialStatus = 'Getting the next test ready…';

//     this.experimentUI.innerHTML = `
//       <div class="experiment-instructions" style="text-align: center; padding: 30px; max-width: 500px; margin: 0 auto;">
//         <h2>Section complete!</h2>
//         <p style="color: #aaa; font-size: 16px;">${this.completedTrials} trials done</p>

//         <div style="font-size: 48px; font-weight: bold; color: #64ff64; margin: 20px 0;" id="part-break-timer">
//           ${this.formatTime(this.breakTimeRemaining)}
//         </div>
//         <p style="color: #888; font-size: 14px;">Take a short break — relax your neck and eyes</p>

//         <div style="background: rgba(255, 200, 100, 0.1); padding: 15px; border-radius: 8px; margin: 20px 0;">
//           <p id="swap-status-line" style="font-size: 13px; color: #aaa; margin: 0;">
//             ${initialStatus}
//           </p>
//         </div>

//         <button id="start-next-part-btn" class="experiment-button continue-button" disabled
//           style="opacity: 0.5; cursor: not-allowed;">
//           Setting up…
//         </button>
//       </div>
//     `;

//     // Break countdown
//     this.breakInterval = setInterval(() => {
//       this.breakTimeRemaining--;
//       const el = document.getElementById('part-break-timer');
//       if (el) el.textContent = this.formatTime(this.breakTimeRemaining);
//       if (this.breakTimeRemaining <= 0) {
//         clearInterval(this.breakInterval);
//         this.breakInterval = null;
//       }
//     }, 1000);

//     const statusEl = () => document.getElementById('swap-status-line');
//     const startBtn = () => document.getElementById('start-next-part-btn');

//     const setStatus = (s, color) => {
//       const el = statusEl();
//       if (!el) return;
//       el.innerHTML = s;
//       if (color) el.style.color = color;
//     };

//     const markReady = (sourceNow) => {
//       console.log(`[swap] ready — calibration now: ${sourceNow}`);
//       setStatus(`✅ Ready to continue`, '#64ff96');
//       const btn = startBtn();
//       if (btn) {
//         btn.disabled = false;
//         btn.style.opacity = '1';
//         btn.style.cursor = 'pointer';
//         btn.textContent = `Continue (or press Space)`;
//       }
//       this.hideNonEssentialControls();
//     };

//     // Automatic path. Part B = fetch frozen standard. Part A = restore
//     // snapshot. No manual UI fallback — failures surface clearly in the
//     // status line and the Continue button stays disabled.
//     (async () => {
//       if (isEnteringPartB) {
//         const ok = await this._loadStandardCalibration(setStatus);
//         if (ok) markReady(window.state?.calibrationSource || 'Uploaded: standard-calibration.csv');
//         // On failure, _loadStandardCalibration already wrote the error.
//       } else {
//         if (!this._personalCalibrationSnapshot) {
//           setStatus('❌ No personal-calibration snapshot available. ' +
//                     'Please reload the page and start a new session.', '#ff6464');
//           return;
//         }
//         const ok = await this._restorePersonalCalibration();
//         if (ok) {
//           markReady(window.state?.calibrationSource
//                      || this._personalCalibrationSnapshot.calibrationSource
//                      || 'Personal calibration restored');
//         } else {
//           setStatus('❌ Could not restore personal calibration. ' +
//                     'Please reload the page and start a new session.', '#ff6464');
//         }
//       }
//     })();

//     // Start next part — only fires once the disabled attribute has been
//     // removed by markReady() above.
//     document.getElementById('start-next-part-btn').addEventListener('click', () => {
//       if (document.getElementById('start-next-part-btn').disabled) return;
//       if (this.breakInterval) {
//         clearInterval(this.breakInterval);
//         this.breakInterval = null;
//       }
//       this.startNextPart(nextPart);
//     });
//   }

//   // Start the next part (Part B or Part A, depending on counterbalancing)
//   async startNextPart(partLabel) {
//     this.currentPart = partLabel;
//     this.isRunning = true;

//     if (partLabel === 'Part B') {
//       const mediumPair = this.allVarianceMatchedPairs[1];
//       this.config.varianceMatchedPairs = [mediumPair];
//       console.log(`🔬 Part B: Using medium variance pair only (variance ~${mediumPair.variance})`);
//     } else {
//       this.config.varianceMatchedPairs = this.partAVariancePairs;
//     }

//     // Reset trial state for new part — per-part progress so the participant
//     // sees "1 / 64" at the start of Part B (instead of cumulative "X / Y").
//     this.currentPairIndex = 0;
//     this.currentLayoutIndex = 0;
//     this.currentFilterPhase = 0;
//     this.currentTrialInLayout = 0;
//     this.completedTrials = 0;

//     // Total trials for THIS part
//     this.totalTrials = this.config.varianceMatchedPairs.length * 2 * this.layouts.length * this.config.trialsPerLayout;

//     console.log(`🚀 Starting ${partLabel}: ${this.totalTrials} trials`);

//     // Save calibration info for this part
//     this.calibrationInfo[partLabel] = window.state?.calibrationSource || 'Session calibration';
//     this.calibrationKind[partLabel] = this._currentCalibrationKind;
//     console.log(`[swap] ${partLabel} running under: ${this._currentCalibrationKind} calibration`);

//     // Re-create UI (calibration upload via startTracking() may have disrupted it)
//     this.createUI();
//     this.hideNonEssentialControls();
//     this.addExperimentPhaseIndicator();

//     // Re-apply configuration for new calibration
//     await this.applyConfiguration();

//     // NOTE: the calibration edge-check and the variance measurement each run
//     // exactly ONCE before the experiment starts (edge-check in calibration.js,
//     // variance measurement in start()). Neither is repeated at the part swap.
//     this.continueToExperimentStart();
//   }

//   // ===== Filter-block segment engine (June 2026) ==========================

//   // Build the 4-segment session plan from the counterbalanced filter order.
//   // Two filter blocks; each block ends with a standard-cal mid-variance test
//   // of that same filter. Personal segments are stamped "Part A", standard
//   // segments "Part B", so questionnaire selection and ZIP export are reused.
//   _buildSegments() {
//     const first  = this.counterbalanceCondition?.filterFirst || 'exponential';
//     const second = first === 'exponential' ? 'oneEuro' : 'exponential';
//     const personalPairs = this.partAVariancePairs;            // counterbalance-ordered 3
//     const midPair = this.allVarianceMatchedPairs[1];          // true Medium level

//     this._segments = [
//       { filter: first,  calib: 'personal', pairs: personalPairs, part: 'Part A' },
//       { filter: first,  calib: 'standard', pairs: [midPair],     part: 'Part B' },
//       { filter: second, calib: 'personal', pairs: personalPairs, part: 'Part A' },
//       { filter: second, calib: 'standard', pairs: [midPair],     part: 'Part B' },
//     ];
//     this._segmentIndex = 0;
//     this._activeSegment = null;
//     console.log('🧱 Filter-block order: '
//       + this._segments.map((s, i) => `(${i + 1}) ${s.filter}/${s.calib}`).join('  →  '));
//   }

//   // Configure and launch one segment. Calibration must already be correct for
//   // this segment (segment 0 = fresh personal; later segments are swapped by
//   // _advanceSegment before this runs). Reuses continueToExperimentStart so the
//   // practice block still runs exactly once (before segment 0 only).
//   async _startSegment(i) {
//     const seg = this._segments[i];
//     this._segmentIndex = i;
//     this._activeSegment = seg;

//     this.currentPart = seg.part;
//     this._currentCalibrationKind = seg.calib;
//     this.config.varianceMatchedPairs = seg.pairs;

//     // Reset per-segment trial state (filter is fixed → phase stays 0).
//     this.currentPairIndex = 0;
//     this.currentLayoutIndex = 0;
//     this.currentFilterPhase = 0;
//     this.currentTrialInLayout = 0;
//     this.completedTrials = 0;
//     // One filter per segment (not two), so no ×2 here.
//     this.totalTrials = seg.pairs.length * this.layouts.length * this.config.trialsPerLayout;

//     this.calibrationInfo[seg.part] = window.state?.calibrationSource || 'Session calibration';
//     this.calibrationKind[seg.part] = seg.calib;
//     this.isRunning = true;

//     console.log(`▶️ Segment ${i + 1}/${this._segments.length}: `
//       + `${seg.filter} / ${seg.calib} — ${seg.pairs.length} variance level(s), `
//       + `${this.totalTrials} trials  [${seg.part}]`);

//     this.createUI();
//     this.hideNonEssentialControls();
//     this.addExperimentPhaseIndicator();
//     await this.applyConfiguration();
//     await this.continueToExperimentStart();
//   }

//   // Called when a segment's last condition + questionnaire are done. Swaps
//   // calibration if the next segment needs a different one (always the case in
//   // the personal→standard→personal→standard plan), then starts it.
//   async _advanceSegment() {
//     const nextIndex = this._segmentIndex + 1;
//     const cur = this._segments[this._segmentIndex];
//     const next = this._segments[nextIndex];
//     if (!next) { this.calculateResults(); return; }

//     if (next.calib !== cur.calib) {
//       // Show the neutral swap/break screen; it starts the next segment on success.
//       this._showSegmentSwapScreen(nextIndex);
//     } else {
//       await this._startSegment(nextIndex);
//     }
//   }

//   // Neutral break + automatic calibration swap between two segments. Mirrors
//   // showCalibrationSwapScreen but targets a specific segment and launches it.
//   // The Continue button stays disabled until the swap/restore actually
//   // succeeds, so a failed swap can never silently run on the wrong calibration.
//   _showSegmentSwapScreen(nextIndex) {
//     const next = this._segments[nextIndex];
//     const enteringStandard = next.calib === 'standard';
//     this.breakTimeRemaining = this.config.breakDuration;

//     // Snapshot personal calibration before the first standard load so we can
//     // restore it for the following personal segment.
//     if (enteringStandard) this._snapshotPersonalCalibration();

//     console.log(`[swap] segment ${nextIndex + 1} needs ${next.calib} calibration`);

//     this.experimentUI.innerHTML = `
//       <div class="experiment-instructions" style="text-align: center; padding: 30px; max-width: 500px; margin: 0 auto;">
//         <h2>Section complete!</h2>
//         <p style="color: #aaa; font-size: 16px;">${this.completedTrials} trials done</p>
//         <div style="font-size: 48px; font-weight: bold; color: #64ff64; margin: 20px 0;" id="seg-break-timer">
//           ${this.formatTime(this.breakTimeRemaining)}
//         </div>
//         <p style="color: #888; font-size: 14px;">Take a short break — relax your neck and eyes</p>
//         <div style="background: rgba(255, 200, 100, 0.1); padding: 15px; border-radius: 8px; margin: 20px 0;">
//           <p id="seg-swap-status" style="font-size: 13px; color: #aaa; margin: 0;">Getting the next test ready…</p>
//         </div>
//         <button id="seg-next-btn" class="experiment-button continue-button" disabled
//           style="opacity: 0.5; cursor: not-allowed;">Setting up…</button>
//       </div>
//     `;

//     this.breakInterval = setInterval(() => {
//       this.breakTimeRemaining--;
//       const el = document.getElementById('seg-break-timer');
//       if (el) el.textContent = this.formatTime(this.breakTimeRemaining);
//       if (this.breakTimeRemaining <= 0) { clearInterval(this.breakInterval); this.breakInterval = null; }
//     }, 1000);

//     const setStatus = (s, color) => {
//       const el = document.getElementById('seg-swap-status');
//       if (!el) return;
//       el.innerHTML = s;
//       if (color) el.style.color = color;
//     };
//     const markReady = () => {
//       setStatus('✅ Ready to continue', '#64ff96');
//       const btn = document.getElementById('seg-next-btn');
//       if (btn) {
//         btn.disabled = false;
//         btn.style.opacity = '1';
//         btn.style.cursor = 'pointer';
//         btn.textContent = 'Continue (or press Space)';
//       }
//       this.hideNonEssentialControls();
//     };

//     (async () => {
//       let ok = false;
//       if (enteringStandard) {
//         ok = await this._loadStandardCalibration(setStatus);
//       } else {
//         if (!this._personalCalibrationSnapshot) {
//           setStatus('❌ No personal-calibration snapshot available. Please reload and restart.', '#ff6464');
//           return;
//         }
//         ok = await this._restorePersonalCalibration();
//         if (ok) setStatus('✅ Ready', '#64ff96');
//       }
//       if (ok) markReady();
//       // On failure the status line shows the error and the button stays disabled.
//     })();

//     const go = () => {
//       const btn = document.getElementById('seg-next-btn');
//       if (!btn || btn.disabled) return;
//       if (this.breakInterval) { clearInterval(this.breakInterval); this.breakInterval = null; }
//       this._startSegment(nextIndex);
//     };
//     document.getElementById('seg-next-btn').addEventListener('click', go);
//   }

//   // Calculate performance metrics
//   calculateResults() {
//     // Use cached results if we already computed them (e.g. during the early
//     // pre-feedback finalize) — otherwise build fresh.
//     const results = this._cachedResults || this._buildResults();
//     if (!this._cachedResults) {
//       this._cachedResults = results;
//       this.prepareExportData(results);
//     }
//     this.displayResults(results);
//   }

//   // Pure data computation: turn this.trialData into the per-pair/filter/layout
//   // metrics array used for both export and the summary UI.
//   _buildResults() {
//     console.log("Calculating experiment results...");

//     // Group trials by pair, filter, and layout
//     const resultsByPair = {};
    
//     for (const trial of this.trialData) {
//       // Skip trials with no usable data
//       if (trial.status === 'timeout_not_attempted' || trial.type === 'condition_timeout') continue;

//       const pairKey = `${trial.part || 'Part A'}_pair${trial.pairNumber}`;

//       if (!resultsByPair[pairKey]) {
//         resultsByPair[pairKey] = {
//           part: trial.part || 'Part A',
//           pairNumber: trial.pairNumber,
//           pairVariance: trial.pairVariance,
//           pairVarianceNormPct: trial.pairVarianceNormPct,
//           pairDescription: trial.pairDescription,
//           filters: {}
//         };
//       }
      
//       const filterKey = `${trial.filterType}_rank${trial.filterRank}`;
      
//       if (!resultsByPair[pairKey].filters[filterKey]) {
//         resultsByPair[pairKey].filters[filterKey] = {
//           filterType: trial.filterType,
//           filterRank: trial.filterRank,
//           filterVariance: trial.filterVariance,
//           filterLatency: trial.filterLatency,
//           layouts: {}
//         };
//       }
      
//       // Group by layout (size × amplitude)
//       const layoutKey = `${trial.targetSize}-${trial.amplitude}`;
      
//       if (!resultsByPair[pairKey].filters[filterKey].layouts[layoutKey]) {
//         resultsByPair[pairKey].filters[filterKey].layouts[layoutKey] = {
//           targetSize: trial.targetSize,
//           amplitude: trial.amplitude,
//           trials: []
//         };
//       }
      
//       resultsByPair[pairKey].filters[filterKey].layouts[layoutKey].trials.push(trial);
//     }
    
//     // Calculate metrics for each pair/filter/layout combination
//     const results = [];
    
//     for (const pairKey in resultsByPair) {
//       const pairData = resultsByPair[pairKey];
      
//       for (const filterKey in pairData.filters) {
//         const filterData = pairData.filters[filterKey];
        
//         for (const layoutKey in filterData.layouts) {
//           const layout = filterData.layouts[layoutKey];
//           const trials = layout.trials;
        
//         // Only trials with endpoint data contribute to spatial metrics (We, Ae, IDe)
//         const trialsWithEndpoints = trials.filter(t => t.endpointX != null && t.endpointY != null);
//         const completedTrials = trials.filter(t => t.status === 'completed');

//         // MT from completed trials only (timeout_in_progress has partial MT, not comparable)
//         const movementTimes = completedTrials.map(t => t.movementTime).filter(mt => mt !== null);
//         const meanMT = movementTimes.length > 0
//           ? movementTimes.reduce((a, b) => a + b, 0) / movementTimes.length : NaN;

//         // Effective amplitude: from all trials with endpoints (includes in-progress)
//         const effectiveAmplitudes = trialsWithEndpoints.map(t => t.effectiveAmplitude).filter(a => a != null);
//         const Ae = effectiveAmplitudes.length > 0
//           ? effectiveAmplitudes.reduce((a, b) => a + b, 0) / effectiveAmplitudes.length : NaN;

//         // Effective width: endpoint spread includes in-progress trials per research recommendation
//         const projections = trialsWithEndpoints.map(t => {
//           const thetaRad = t.direction * Math.PI / 180;
//           const dx = t.endpointX - t.targetX;
//           const dy = t.endpointY - t.targetY;
//           return dx * Math.cos(thetaRad) + dy * Math.sin(thetaRad);
//         });
//         const meanProjection = projections.reduce((a, b) => a + b, 0) / projections.length;
//         const projVariance = projections.reduce((sum, p) => sum + Math.pow(p - meanProjection, 2), 0) / (projections.length - 1);
//         const SDx = Math.sqrt(projVariance);
//         const We = 4.133 * SDx;
        
//         // Effective index of difficulty (Shannon formulation)
//         const IDe = Math.log2((Ae / We) + 1);
        
//           // Throughput
//           const TP = IDe / meanMT;
          
//           const meanReEntries = completedTrials.length > 0
//             ? completedTrials.reduce((sum, t) => sum + (t.reEntryCount || 0), 0) / completedTrials.length : 0;

//           const nCompleted = completedTrials.length;
//           const nInProgress = trials.filter(t => t.status === 'timeout_in_progress').length;
//           const nNotAttempted = trials.filter(t => t.status === 'timeout_not_attempted').length;
//           const nTrialTimeout = trials.filter(t => t.status === 'timeout_trial').length;
//           const nTotal = nCompleted + nInProgress + nNotAttempted + nTrialTimeout;
//           const completionRate = nTotal > 0 ? nCompleted / nTotal : 1;

//           results.push({
//             part: pairData.part,
//             pairNumber: pairData.pairNumber,
//             pairVariance: pairData.pairVariance,
//             pairVarianceNormPct: pairData.pairVarianceNormPct,
//             pairDescription: pairData.pairDescription,
//             filterType: filterData.filterType,
//             filterRank: filterData.filterRank,
//             filterVariance: filterData.filterVariance,
//             filterLatency: filterData.filterLatency,
//             layout: {
//               targetSize: layout.targetSize,
//               amplitude: layout.amplitude
//             },
//             metrics: {
//               n: nCompleted,
//               nTotal: nTotal,
//               nTimedOutInProgress: nInProgress,
//               nTimedOutNotAttempted: nNotAttempted,
//               nTimedOutTrial: nTrialTimeout,
//               completionRate: completionRate,
//               meanMT: meanMT,
//               Ae: Ae,
//               We: We,
//               IDe: IDe,
//               TP: TP,
//               meanReEntries: meanReEntries
//             }
//           });
//         }
//       }
//     }
    
//     return results;
//   }

//   // Display results screen
//   displayResults(results) {
//     // Calculate average throughput by pair and filter
//     const pairAverages = {};
    
//     for (const result of results) {
//       const pairKey = `pair${result.pairNumber}`;
      
//       if (!pairAverages[pairKey]) {
//         pairAverages[pairKey] = {
//           pairNumber: result.pairNumber,
//           pairVariance: result.pairVariance,
//           pairDescription: result.pairDescription,
//           filters: {}
//         };
//       }
      
//       const filterKey = `${result.filterType}_rank${result.filterRank}`;
      
//       if (!pairAverages[pairKey].filters[filterKey]) {
//         pairAverages[pairKey].filters[filterKey] = {
//           filterType: result.filterType,
//           filterRank: result.filterRank,
//           filterVariance: result.filterVariance,
//           filterLatency: result.filterLatency,
//           throughputs: [],
//           movementTimes: []
//         };
//       }
      
//       pairAverages[pairKey].filters[filterKey].throughputs.push(result.metrics.TP);
//       pairAverages[pairKey].filters[filterKey].movementTimes.push(result.metrics.meanMT);
//     }
    
//     let summaryHTML = '<div class="results-summary">';
    
//     // Display results by pair
//     for (let pairNum = 1; pairNum <= 3; pairNum++) {
//       const pairKey = `pair${pairNum}`;
//       const pairData = pairAverages[pairKey];
      
//       if (!pairData) continue;
      
//       summaryHTML += `
//         <div style="background: rgba(255, 200, 100, 0.15); padding: 10px; border-radius: 5px; margin: 10px 0; border-left: 3px solid #ffc864;">
//           <h4 style="color: #ffc864; margin-bottom: 5px;">Pair ${pairData.pairNumber}: Variance ~${Number(pairData.pairVariance).toFixed(1)}</h4>
//           <p style="font-size: 10px; color: #aaa; margin-bottom: 8px;">${pairData.pairDescription}</p>
//       `;
      
//       // Display each filter in the pair
//       for (const filterKey in pairData.filters) {
//         const filterData = pairData.filters[filterKey];
//         const avgTP = filterData.throughputs.reduce((a, b) => a + b, 0) / filterData.throughputs.length;
//         const avgMT = filterData.movementTimes.reduce((a, b) => a + b, 0) / filterData.movementTimes.length;
        
//         const displayName = filterData.filterType === "oneEuro" ? "One Euro Filter" : "Exponential Smoothing";
        
//         summaryHTML += `
//           <div class="config-result" style="margin: 5px 0; font-size: 11px;">
//             <h4 style="font-size: 12px;">${displayName} (Rank ${filterData.filterRank})</h4>
//             <p>Throughput: <strong>${avgTP.toFixed(3)} bits/s</strong></p>
//             <p>Movement Time: <strong>${avgMT.toFixed(3)} s</strong></p>
//             <p style="font-size: 9px; color: #888;">Var: ${filterData.filterVariance.toFixed(2)} | Latency: ${filterData.filterLatency.toFixed(1)}ms</p>
//           </div>
//         `;
//       }
      
//       summaryHTML += `</div>`;
//     }
    
//     summaryHTML += '</div>';
    
//     // Add pair-wise comparisons
//     let comparisonHTML = '<div class="comparison-result"><h3>Pair Comparisons</h3>';
    
//     for (let pairNum = 1; pairNum <= 3; pairNum++) {
//       const pairKey = `pair${pairNum}`;
//       const pairData = pairAverages[pairKey];
      
//       if (!pairData) continue;
      
//       // Find exponential and oneEuro results
//       let exponentialData = null;
//       let oneEuroData = null;
      
//       for (const filterKey in pairData.filters) {
//         const filterData = pairData.filters[filterKey];
//         if (filterData.filterType === 'exponential') {
//           exponentialData = filterData;
//         } else if (filterData.filterType === 'oneEuro') {
//           oneEuroData = filterData;
//         }
//       }
      
//       if (exponentialData && oneEuroData) {
//         const expTP = exponentialData.throughputs.reduce((a, b) => a + b, 0) / exponentialData.throughputs.length;
//         const oneTP = oneEuroData.throughputs.reduce((a, b) => a + b, 0) / oneEuroData.throughputs.length;
//         const diff = ((oneTP - expTP) / expTP * 100);
//         const better = diff > 0 ? "One Euro" : "Exponential";
        
//         comparisonHTML += `
//           <p style="margin: 5px 0; font-size: 11px;">
//             <strong>Pair ${pairNum} (Var ~${pairData.pairVariance}):</strong> 
//             ${better} performed better by <strong>${Math.abs(diff).toFixed(1)}%</strong>
//           </p>
//         `;
//       }
//     }
    
//     comparisonHTML += '</div>';
    
//     // Log detailed results to console
//     console.log('Experiment results summary:', summaryHTML);
//     console.log('Experiment comparison:', comparisonHTML);

//     // Final page: show the mouse cursor (and hide the head cursors) so the
//     // participant can click the Download Part A / Part B buttons.
//     document.body.classList.remove('hide-cursor');
//     const endCursorRed = document.getElementById('head-cursor-clipped');
//     const endCursorRaw = document.getElementById('head-cursor-raw');
//     if (endCursorRed) endCursorRed.style.display = 'none';
//     if (endCursorRaw) endCursorRaw.style.display = 'none';

//     this.experimentUI.innerHTML = `
//       <div class="experiment-instructions" style="text-align: center; padding: 40px; max-width: 560px; margin: 0 auto;">
//         <h2 style="font-size: 28px;">Experiment Complete!</h2>
//         <p style="color: #ccc; font-size: 18px; margin: 18px 0 8px;">Thank you for participating!</p>
//         <div style="background: rgba(100, 200, 255, 0.1); border: 1px solid rgba(100, 200, 255, 0.3);
//           border-radius: 10px; padding: 20px; margin: 18px 0 20px; text-align: left;">
//           <p style="color: #fff; font-size: 16px; font-weight: bold; margin: 0 0 8px;">
//             Please email the downloaded files
//           </p>
//           <p style="color: #ccc; font-size: 14px; margin: 0 0 6px;">
//             Your experiment data was automatically saved to your Downloads folder.
//             Please email <strong>all the downloaded ZIP files</strong> to the researcher
//             as described in the instructions you received.
//           </p>
//           <p style="color: #aaa; font-size: 13px; margin: 10px 0 0;">
//             If your browser asked whether to allow multiple downloads, please choose
//             <strong>Allow</strong>. If the files did <strong>not</strong> download
//             automatically, click the buttons below to save them, then email them to
//             the researcher.
//           </p>
//         </div>
//         <div style="margin-top: 12px;">
//           ${this.partACompleted ? `
//           <button class="experiment-button" onclick="window.fittsExperiment.downloadPartZip('Part A')"
//             style="background: linear-gradient(135deg, #22cc66, #118844); margin: 4px; padding: 12px 24px; font-size: 15px;">
//             Download data file 1
//           </button>` : ''}
//           ${this.partBCompleted ? `
//           <button class="experiment-button" onclick="window.fittsExperiment.downloadPartZip('Part B')"
//             style="background: linear-gradient(135deg, #22cc66, #118844); margin: 4px; padding: 12px 24px; font-size: 15px;">
//             Download data file 2
//           </button>` : ''}
//         </div>
//       </div>
//     `;
//   }
  
//   // Prepare export data (called when experiment ends, but doesn't download yet)
//   prepareExportData(results) {
//     this._exportTimestamp = new Date().toISOString();
//     this._exportResults = results;
//   }

//   // Called the moment the last Fitts trial of the experiment finishes — BEFORE
//   // the final feedback questionnaire — so that the participant's data is
//   // guaranteed to download even if they close the tab during feedback.
//   // Marks them complete on the server, computes results, and auto-downloads
//   // both Part ZIPs. The final feedback is added to a second download fired
//   // after the questionnaire is submitted (see _redownloadWithFinalFeedback).
//   async _finalizeAndAutoDownload() {
//     if (this._finalized) return;
//     this._finalized = true;

//     // Make sure both parts are flagged as complete so the ZIP files are produced.
//     // (endExperiment normally sets these; we set them early here.)
//     this.partACompleted = true;
//     this.partBCompleted = true;

//     // Build & cache results so calculateResults() doesn't redo the work later.
//     const results = this._buildResults();
//     this._cachedResults = results;
//     this.prepareExportData(results);

//     // Mark participant complete on the server (does not require the user to
//     // submit feedback or click anything).
//     if (window.URL_PARTICIPANT_ID) {
//       fetch('/api/complete', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ pid: parseInt(window.URL_PARTICIPANT_ID) })
//       }).catch(err => console.warn('Could not mark participant as completed:', err));
//     }

//     // Exit fullscreen before downloading — Chrome silently blocks programmatic
//     // downloads (a.click()) while in fullscreen mode.
//     if (document.fullscreenElement) {
//       try { await document.exitFullscreen(); } catch (_) {}
//       await new Promise(r => setTimeout(r, 300));
//     }

//     // Auto-download both parts. Each part is wrapped in its own try/catch so
//     // a failure in one can never block the other, and a generous gap avoids
//     // Chrome's throttling of back-to-back programmatic downloads.
//     try {
//       await this.downloadPartZip('Part A');
//       console.log('Auto-download Part A triggered');
//     } catch (err) {
//       console.warn('Part A auto-download failed (manual button remains available):', err);
//     }
//     await new Promise(r => setTimeout(r, 1200));
//     try {
//       await this.downloadPartZip('Part B');
//       console.log('Auto-download Part B triggered');
//     } catch (err) {
//       console.warn('Part B auto-download failed (manual button remains available):', err);
//     }
//   }

//   // Download results for a specific part as a ZIP file
//   async downloadPartZip(partLabel) {
//     const timestamp = this._exportTimestamp;
//     const calibType = partLabel === 'Part A' ? 'personal-calibration' : 'standard-calibration';
//     const calibSource = this.calibrationInfo[partLabel] || 'unknown';

//     // Filter data for this part
//     const partTrials = this.trialData.filter(t => t.part === partLabel);
//     const partResults = this._exportResults.filter(r => r.part === partLabel);
//     // Variance measurement runs ONCE per session (before the experiment), so
//     // include the full measurement in both parts' ZIPs.
//     const partVariance = this.varianceMeasurementResults;
//     const partMiniQ = this.miniQuestionnaireResponses.filter(q => q.part === partLabel);
//     const partTLX = this.nasaTLXResponses.filter(r => r.part === partLabel);

//     const zip = new JSZip();

//     // Metadata file
//     zip.file('info.txt', [
//       `Part: ${partLabel}`,
//       // Calibration Type was previously hard-coded based on part name. That
//       // label was misleading because the swap-screen Upload control was
//       // optional (participants could skip it and run Part B with their Part
//       // A calibration). The truth is now derived from the actual source
//       // string: anything beginning with "Uploaded:" counts as a swap-in
//       // (Standard for Part B / Personal for Part A); anything beginning
//       // with "Fresh calibration:" is whatever was on the system at the
//       // start of the part.
//       // Authoritative: derived from this.calibrationKind, which the swap
//       // helpers set only when a swap/restore actually succeeded. Falls back to
//       // the old source-string heuristic only if the flag was never recorded
//       // (e.g. legacy sessions).
//       `Calibration Type: ${
//         this.calibrationKind && this.calibrationKind[partLabel]
//           ? (this.calibrationKind[partLabel] === 'standard' ? 'Standard' : 'Personal')
//               + (partLabel === 'Part B' && this.calibrationKind[partLabel] !== 'standard'
//                   ? ' (⚠️ expected Standard — swap did NOT apply)'
//                   : '')
//           : (typeof calibSource === 'string' && /^uploaded:/i.test(calibSource)
//               ? (partLabel === 'Part A' ? 'Personal (uploaded)' : 'Standard (uploaded)')
//               : (partLabel === 'Part A' ? 'Personal (fresh)' : 'Personal (inherited from Part A — no swap performed)'))
//       }`,
//       `Calibration Source: ${calibSource}`,
//       `Participant: ${this.participantId || 'unknown'}`,
//       `Filter Order: ${this.counterbalanceCondition?.filterFirst || 'exponential'} first`,
//       `Variance Order: ${this.counterbalanceCondition?.varianceOrderLabel || 'default'}`,
//       `Trials Completed: ${partTrials.filter(t => t.status !== 'timeout_missed').length}`,
//       `Trials Missed (timeout): ${partTrials.filter(t => t.status === 'timeout_missed').length}`,
//       `Timestamp: ${timestamp}`
//     ].join('\n'));

//     zip.file(`fitts-results-${timestamp}.csv`, this.generateResultsCSV(partResults));
//     zip.file(`fitts-raw-data-${timestamp}.csv`, this.generateRawDataCSV(partTrials));

//     const cb = this.counterbalanceCondition;
//     const pathData = partTrials.map(t => ({
//       participantId: this.participantId || '',
//       part: t.part || '',
//       filterOrder: cb?.filterFirst || '',
//       varianceOrder: cb?.varianceOrderLabel || '',
//       globalTrialNumber: t.globalTrialNumber,
//       pairNumber: t.pairNumber,
//       filterType: t.filterType,
//       filterRank: t.filterRank,
//       targetSize: t.targetSize,
//       amplitude: t.amplitude,
//       direction: t.direction,
//       startX: t.startX,
//       startY: t.startY,
//       targetX: t.targetX,
//       targetY: t.targetY,
//       cursorPath: t.cursorPath || [],
//       targetEvents: t.targetEvents || []
//     }));
//     zip.file(`fitts-cursor-paths-${timestamp}.json`, JSON.stringify(pathData));

//     if (partVariance.length > 0) {
//       zip.file(`fitts-variance-measurement-${timestamp}.csv`,
//         this.generateVarianceMeasurementCSV(partVariance));
//     }

//     if (partMiniQ.length > 0) {
//       zip.file(`fitts-mini-questionnaire-${timestamp}.csv`,
//         this.generateMiniQuestionnaireCSVFromData(partMiniQ));
//     }

//     if (partTLX.length > 0) {
//       zip.file(`fitts-nasa-tlx-${timestamp}.csv`,
//         this.generateNASATLXCSVFromData(partTLX));
//     }

//     const blob = await zip.generateAsync({ type: 'blob' });
//     const url = URL.createObjectURL(blob);
//     const a = document.createElement('a');
//     a.href = url;
//     a.download = `fitts-${calibType}-${this.participantId || 'unknown'}-${timestamp}.zip`;
//     document.body.appendChild(a);
//     a.click();
//     document.body.removeChild(a);
//     URL.revokeObjectURL(url);
//   }
  
//   // Generate mini questionnaire CSV
//   generateMiniQuestionnaireCSV() {
//     return this.generateMiniQuestionnaireCSVFromData(this.miniQuestionnaireResponses);
//   }

//   generateMiniQuestionnaireCSVFromData(data) {
//     // Part A (personal) uses the 4 balanced items (TooMuchJitter, NoticeableDelay,
//     // AccurateFollowing, LowEffort). Part B (standard) uses the comparison items
//     // (NoticedDifference, PreferredThese). Each row only fills the columns for the
//     // questionnaire it actually showed; the others stay blank.
//     const headers = [
//       'ParticipantID', 'Part', 'PairNumber', 'PairVariance', 'FilterType', 'FilterPhase',
//       'TooMuchJitter', 'NoticeableDelay', 'AccurateFollowing', 'LowEffort',
//       'NoticedDifference', 'PreferredThese',
//       'FreeTextResponse', 'Comments', 'Timestamp'
//     ];
//     let csv = headers.join(',') + '\n';
//     for (const r of data) {
//       csv += [
//         this.participantId || '', r.part || '', r.pairNumber, r.pairVariance,
//         r.filterType, r.filterPhase,
//         r.tooMuchJitter     ?? '',
//         r.noticeableDelay   ?? r.cursorSlow     ?? '',
//         r.accurateFollowing ?? r.cursorAccurate ?? '',
//         r.lowEffort         ?? '',
//         r.noticedDifference ?? '',
//         r.preferredThese    ?? '',
//         `"${(r.speedVsJitter || '').replace(/"/g, '""')}"`,
//         `"${(r.comments || '').replace(/"/g, '""')}"`,
//         r.timestamp
//       ].join(',') + '\n';
//     }
//     return csv;
//   }

//   // Generate NASA-TLX CSV
//   generateNASATLXCSV() {
//     return this.generateNASATLXCSVFromData(this.nasaTLXResponses);
//   }

//   generateNASATLXCSVFromData(data) {
//     const headers = [
//       'ParticipantID', 'Part', 'Mental', 'Physical', 'Temporal',
//       'Performance', 'Effort', 'Frustration', 'Comments', 'Timestamp'
//     ];
//     let csv = headers.join(',') + '\n';
//     for (const r of data) {
//       csv += [
//         this.participantId || '', r.part, r.mental, r.physical, r.temporal,
//         r.performance, r.effort, r.frustration,
//         `"${(r.comments || '').replace(/"/g, '""')}"`, r.timestamp
//       ].join(',') + '\n';
//     }
//     return csv;
//   }

//   // Generate results CSV
//   generateResultsCSV(results) {
//     const headers = [
//       'ParticipantID', 'Part', 'FilterOrder', 'VarianceOrder',
//       'PairNumber', 'PairVariance_px', 'PairVariance_pct', 'PairDescription',
//       'FilterType', 'FilterRank', 'FilterVariance_px', 'FilterLatency',
//       'TargetSize', 'Amplitude',
//       'NCompleted', 'NTotal', 'NTimedOutInProgress', 'NTimedOutNotAttempted', 'NTimedOutTrial', 'CompletionRate',
//       'MeanMT', 'Ae', 'We', 'IDe', 'TP', 'MeanReEntries'
//     ];

//     let csv = headers.join(',') + '\n';

//     const cb = this.counterbalanceCondition;
//     for (const result of results) {
//       const m = result.metrics;
//       const fmtNum = (v) => (v != null && !isNaN(v)) ? v.toFixed(4) : '';
//       const row = [
//         this.participantId || '',
//         result.part || '',
//         cb?.filterFirst || '',
//         cb?.varianceOrderLabel || '',
//         result.pairNumber,
//         result.pairVariance,
//         result.pairVarianceNormPct != null ? result.pairVarianceNormPct.toFixed(4) : '',
//         `"${result.pairDescription}"`,
//         result.filterType,
//         result.filterRank,
//         result.filterVariance.toFixed(4),
//         result.filterLatency.toFixed(2),
//         result.layout.targetSize,
//         result.layout.amplitude,
//         m.n,
//         m.nTotal,
//         m.nTimedOutInProgress || 0,
//         m.nTimedOutNotAttempted || 0,
//         m.nTimedOutTrial || 0,
//         (m.completionRate != null ? m.completionRate.toFixed(4) : '1.0000'),
//         fmtNum(m.meanMT),
//         fmtNum(m.Ae),
//         fmtNum(m.We),
//         fmtNum(m.IDe),
//         fmtNum(m.TP),
//         (m.meanReEntries || 0).toFixed(2)
//       ];
      
//       csv += row.join(',') + '\n';
//     }
    
//     return csv;
//   }
  
//   // Generate raw data CSV
//   generateRawDataCSV(trialData) {
//     const headers = [
//       'ParticipantID', 'Part', 'FilterOrder', 'VarianceOrder',
//       'Status',
//       'GlobalTrialNumber', 'PairNumber', 'PairVariance_px', 'PairVariance_pct', 'PairDescription',
//       'FilterPhase', 'FilterType', 'FilterRank', 'FilterVariance_px', 'FilterLatency',
//       'LayoutIndex', 'TrialInLayout',
//       'TargetSize', 'Amplitude', 'Direction', 'DirectionIndex',
//       'MovementTime', 'KinematicMT', 'EntryBasedMT', 'TotalTime',
//       'EffectiveAmplitude', 'ActualAmplitude',
//       'StartX', 'StartY', 'EndpointX', 'EndpointY',
//       'LastEntryX', 'LastEntryY', 'SelectionX', 'SelectionY', 'TargetX', 'TargetY',
//       'ReEntryCount', 'PeakSpeed',
//       'TrialStartTime', 'MovementStartTime', 'MovementOnsetTime', 'MovementOffsetTime',
//       'FirstEntryTime', 'LastEntryTime', 'SelectionTime'
//     ];

//     let csv = headers.join(',') + '\n';

//     const cb = this.counterbalanceCondition;
//     for (const trial of trialData) {
//       // Skip legacy summary-only timeout entries (old format)
//       if (trial.type === 'condition_timeout') continue;

//       const fmt = (v, d = 2) => v != null ? Number(v).toFixed(d) : '';
//       const row = [
//         this.participantId || '',
//         trial.part || '',
//         cb?.filterFirst || '',
//         cb?.varianceOrderLabel || '',
//         trial.status || 'completed',
//         trial.globalTrialNumber ?? '',
//         trial.pairNumber,
//         trial.pairVariance,
//         trial.pairVarianceNormPct != null ? trial.pairVarianceNormPct.toFixed(4) : '',
//         `"${trial.pairDescription || ''}"`,
//         trial.filterPhase,
//         trial.filterType,
//         trial.filterRank,
//         fmt(trial.filterVariance, 4),
//         fmt(trial.filterLatency, 2),
//         trial.layoutIndex,
//         trial.trialInLayout,
//         trial.targetSize,
//         trial.amplitude,
//         trial.direction,
//         trial.directionIndex,
//         fmt(trial.movementTime, 4),
//         fmt(trial.kinematicMT, 4),
//         fmt(trial.entryBasedMT, 4),
//         fmt(trial.totalTime, 4),
//         fmt(trial.effectiveAmplitude),
//         fmt(trial.actualAmplitude),
//         fmt(trial.startX),
//         fmt(trial.startY),
//         fmt(trial.endpointX),
//         fmt(trial.endpointY),
//         fmt(trial.lastEntryX),
//         fmt(trial.lastEntryY),
//         fmt(trial.selectionX),
//         fmt(trial.selectionY),
//         fmt(trial.targetX),
//         fmt(trial.targetY),
//         trial.reEntryCount ?? '',
//         fmt(trial.peakSpeed, 1),
//         fmt(trial.trialStartTime),
//         fmt(trial.movementStartTime),
//         fmt(trial.movementOnsetTime),
//         fmt(trial.movementOffsetTime),
//         fmt(trial.firstEntryTime),
//         fmt(trial.lastEntryTime),
//         fmt(trial.selectionTime)
//       ];
      
//       csv += row.join(',') + '\n';
//     }
    
//     return csv;
//   }
  
//   // Generate variance measurement CSV
//   generateVarianceMeasurementCSV(varianceData) {
//     const headers = [
//       'ParticipantID', 'Part', 'FilterOrder', 'VarianceOrder',
//       'PairNumber', 'FilterType', 'FilterRank',
//       'ExpectedVariance_px', 'MeasuredVariance_px', 'Difference_px', 'DifferencePercent',
//       'ExpectedVariance_pct', 'MeasuredVariance_pct',
//       'StdDevX_px', 'StdDevY_px', 'NumSamples',
//       'ScreenWidth', 'ScreenHeight', 'LimitingDimension'
//     ];
    
//     let csv = headers.join(',') + '\n';
    
//     const cb = this.counterbalanceCondition;
//     for (const result of varianceData) {
//       const difference = result.measuredVariance - result.expectedVariance;
//       const differencePercent = (difference / result.expectedVariance * 100);
      
//       const row = [
//         this.participantId || '',
//         result.part || '',
//         cb?.filterFirst || '',
//         cb?.varianceOrderLabel || '',
//         result.pairNumber,
//         result.filterType,
//         result.filterRank,
//         result.expectedVariance.toFixed(4),
//         result.measuredVariance.toFixed(4),
//         difference.toFixed(4),
//         differencePercent.toFixed(2),
//         (result.expectedVarianceNorm || 0).toFixed(4),
//         (result.measuredVarianceNorm || 0).toFixed(4),
//         result.stdDevX.toFixed(4),
//         result.stdDevY.toFixed(4),
//         result.numSamples,
//         result.screenWidth || '',
//         result.screenHeight || '',
//         result.limitingDimension || ''
//       ];
      
//       csv += row.join(',') + '\n';
//     }
    
//     return csv;
//   }
  
//   // Download CSV file
//   downloadCSV(csvContent, filename) {
//     const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
//     const link = document.createElement('a');
//     const url = URL.createObjectURL(blob);
    
//     link.setAttribute('href', url);
//     link.setAttribute('download', filename);
//     link.style.visibility = 'hidden';
    
//     document.body.appendChild(link);
//     link.click();
//     document.body.removeChild(link);
//   }
  
//   // Create UI container
//   createUI() {
//     if (this.experimentUI) {
//       this.experimentUI.remove();
//     }
//     this.experimentUI = document.createElement('div');
//     this.experimentUI.id = 'fitts-experiment-ui';
//     this.experimentUI.style.cssText = `
//       position: fixed;
//       top: 0;
//       left: 0;
//       width: 100%;
//       height: 100%;
//       z-index: 10000;
//       pointer-events: none;
//       cursor: none;
//     `;
    
//     document.body.appendChild(this.experimentUI);

//     // Hide tracking controls panel during experiment
//     const trackingContainer = document.getElementById('tracking-controls-container');
//     if (trackingContainer) {
//       trackingContainer.style.display = 'none';
//     }

//     // Back button (test mode only)
//     if (typeof isTestMode === 'function' && isTestMode()) {
//       const backBtn = document.createElement('button');
//       backBtn.id = 'fitts-back-btn';
//       backBtn.textContent = '← Back to Controls';
//       backBtn.style.cssText = `
//         position: fixed; top: 12px; left: 12px; z-index: 10001;
//         padding: 8px 16px; font-size: 13px; font-weight: bold;
//         background: rgba(80, 80, 80, 0.9); color: #ccc; border: 1px solid #666;
//         border-radius: 6px; cursor: pointer; pointer-events: auto;
//       `;
//       backBtn.onmouseenter = () => { backBtn.style.background = 'rgba(120,120,120,0.9)'; };
//       backBtn.onmouseleave = () => { backBtn.style.background = 'rgba(80,80,80,0.9)'; };
//       backBtn.onclick = () => {
//         if (!this.isRunning || confirm('Leave the experiment? Progress will be lost.')) {
//           this.close();
//         }
//       };
//       document.body.appendChild(backBtn);
//       this._backBtn = backBtn;
//     }

//     // Add styles
//     this.addStyles();
//   }
  
//   // Add CSS styles
//   addStyles() {
//     if (document.getElementById('fitts-experiment-styles')) return;
    
//     const style = document.createElement('style');
//     style.id = 'fitts-experiment-styles';
//     style.textContent = `
//       .experiment-instructions {
//         position: fixed;
//         top: 50%;
//         left: 50%;
//         transform: translate(-50%, -50%);
//         background: rgba(20, 20, 20, 0.96);
//         border: 2px solid rgba(100, 255, 100, 0.6);
//         border-radius: 10px;
//         padding: 24px 32px;
//         max-width: 550px;
//         max-height: 88vh;
//         overflow-y: auto;
//         color: white;
//         z-index: 10000;
//         pointer-events: auto;
//         box-shadow: 0 0 30px rgba(0, 0, 0, 0.8);
//         font-size: 18px;
//       }
      
//       .experiment-instructions h2 {
//         margin: 0 0 10px 0;
//         color: #64ff64;
//         font-size: 28px;
//       }
      
//       .experiment-instructions h3 {
//         margin: 12px 0 8px 0;
//         color: #64ff64;
//         font-size: 22px;
//       }
      
//       .experiment-instructions h4 {
//         margin: 12px 0 8px 0;
//         color: #88ff88;
//         font-size: 20px;
//       }
      
//       .config-info {
//         background: rgba(100, 100, 255, 0.2);
//         padding: 10px 14px;
//         border-radius: 5px;
//         margin: 8px 0;
//         font-size: 16px;
//         border-left: 3px solid rgba(100, 100, 255, 0.6);
//       }
      
//       .instructions-content {
//         margin: 14px 0;
//         text-align: left;
//         font-size: 16px;
//       }
      
//       .instructions-content ol {
//         margin: 8px 0;
//         padding-left: 24px;
//       }
      
//       .instructions-content li {
//         margin: 6px 0;
//         line-height: 1.6;
//       }
      
//       .trial-info {
//         background: rgba(255, 200, 100, 0.15);
//         padding: 12px;
//         border-radius: 5px;
//         margin: 10px 0;
//         text-align: center;
//         border-left: 3px solid rgba(255, 200, 100, 0.6);
//         font-size: 15px;
//       }
      
//       .tip {
//         background: rgba(100, 200, 255, 0.15);
//         padding: 10px 12px;
//         border-radius: 5px;
//         font-size: 15px;
//         margin-top: 10px;
//         border-left: 3px solid rgba(100, 200, 255, 0.6);
//       }
      
//       .experiment-button {
//         background: linear-gradient(135deg, #64ff64, #32cd32);
//         color: #000;
//         border: none;
//         padding: 14px 28px;
//         font-size: 18px;
//         font-weight: bold;
//         border-radius: 6px;
//         cursor: pointer;
//         margin-top: 12px;
//         transition: all 0.2s;
//         box-shadow: 0 2px 10px rgba(100, 255, 100, 0.4);
//       }
      
//       .experiment-button:hover {
//         transform: translateY(-2px);
//         box-shadow: 0 4px 14px rgba(100, 255, 100, 0.6);
//       }
      
//       .break-info {
//         background: rgba(50, 50, 50, 0.8);
//         padding: 12px;
//         border-radius: 5px;
//         margin: 10px 0;
//         font-size: 15px;
//       }
      
//       .progress-bar {
//         width: 100%;
//         height: 16px;
//         background: rgba(100, 100, 100, 0.3);
//         border-radius: 8px;
//         overflow: hidden;
//         margin-top: 8px;
//       }
      
//       .progress-fill {
//         height: 100%;
//         background: linear-gradient(90deg, #64ff64, #32cd32);
//         transition: width 0.5s;
//       }
      
//       .results-summary {
//         margin: 8px 0;
//       }
      
//       .config-result {
//         background: rgba(50, 50, 50, 0.8);
//         padding: 8px;
//         border-radius: 4px;
//         margin: 6px 0;
//         border-left: 2px solid #64ff64;
//         font-size: 10px;
//       }
      
//       .config-result h4 {
//         margin: 0 0 4px 0;
//         color: #64ff64;
//         font-size: 12px;
//       }
      
//       .config-result p {
//         margin: 3px 0;
//         font-size: 10px;
//       }
      
//       .export-info {
//         background: rgba(100, 150, 255, 0.2);
//         padding: 8px;
//         border-radius: 3px;
//         margin: 8px 0;
//         font-size: 9px;
//         border-left: 2px solid rgba(100, 150, 255, 0.6);
//       }
      
//       .export-info code {
//         background: rgba(0, 0, 0, 0.4);
//         padding: 1px 3px;
//         border-radius: 2px;
//         font-family: monospace;
//         color: #64ff64;
//         font-size: 9px;
//       }
      
//       .comparison-result {
//         background: rgba(100, 200, 255, 0.2);
//         padding: 8px;
//         border-radius: 4px;
//         margin: 8px 0;
//         border-left: 2px solid #64c8ff;
//         font-size: 10px;
//       }
      
//       .comparison-result h3 {
//         margin: 0 0 4px 0;
//         color: #64c8ff;
//         font-size: 13px;
//       }
      
//       .comparison-result p {
//         margin: 3px 0;
//         font-size: 11px;
//       }
//     `;
    
//     document.head.appendChild(style);
//   }
  
//   // Close experiment
//   close() {
//     if (this.experimentUI) {
//       this.experimentUI.remove();
//       this.experimentUI = null;
//     }

//     if (this._backBtn) {
//       this._backBtn.remove();
//       this._backBtn = null;
//     }
    
//     if (this.cursorTrackingInterval) {
//       clearInterval(this.cursorTrackingInterval);
//       this.cursorTrackingInterval = null;
//     }

//     this._stopConditionTimer();

//     if (this._spacebarHandler) {
//       document.removeEventListener('keydown', this._spacebarHandler);
//     }
    
//     this.isRunning = false;
    
//     // Restore all tracking controls
//     this.restoreAllControls();
    
//     // Restore tracking controls container visibility
//     const trackingContainer = document.getElementById('tracking-controls-container');
//     if (trackingContainer) {
//       trackingContainer.style.display = '';
//     }
    
//     // CRITICAL FIX: Reset filter to Rank 1 with proper React state update
//     console.log("Resetting filter to Rank 1 after experiment close...");
//     setTimeout(() => {
//       this.resetToRankOne();
//     }, 500);
    
//     console.log("Experiment closed");
//   }
  
//   // Reset filter to default (Rank 20 for Exponential, Rank 1 for One Euro)
//   resetToRankOne() {
//     console.log("========================================");
//     console.log("🔄 RESETTING FILTERS TO DEFAULT");
//     console.log("========================================");
    
//     // Reset to Exponential filter (default)
//     window.state.config.filterType = "exponential";
//     console.log("✅ Set filterType = exponential");
    
//     // Click Exponential button to let React switch view
//     const filterButtons = document.querySelectorAll('.filter-buttons button');
//     filterButtons.forEach(btn => {
//       if (btn.textContent.trim() === 'Exponential' && !btn.classList.contains('active-filter')) {
//         console.log("🖱️ Clicking Exponential button");
//         btn.click();
//       }
//     });
    
//     // Wait for React to update, then set sliders
//     setTimeout(() => {
//       // Reset Exponential to Rank 20 (default)
//       const expSlider = document.querySelector('.exponential-rank-selector input[type="range"]');
//       const expRankText = document.querySelector('.exponential-rank-selector span.text-sm.font-bold');
    
//       if (expSlider) {
//         expSlider.value = 20;
//         // Trigger events to update React
//         expSlider.dispatchEvent(new Event('input', { bubbles: true }));
//         expSlider.dispatchEvent(new Event('change', { bubbles: true }));
//         console.log("✅ Exponential slider set to 20");
//       }
//       if (expRankText) {
//         const totalRanks = window.EXPONENTIAL_PARAMETERS ? window.EXPONENTIAL_PARAMETERS.length : 107;
//         expRankText.textContent = `20 / ${totalRanks}`;
//         console.log("✅ Exponential text set to 20 / " + totalRanks);
//       }
      
//       // Apply Exponential Rank 20 parameters
//       if (window.EXPONENTIAL_PARAMETERS && window.EXPONENTIAL_PARAMETERS[19]) {
//         const params = window.EXPONENTIAL_PARAMETERS[19];
//           const smoothingFactor = 1 - params.alpha;
//           window.state.config.exponentialSmoothingFactor = smoothingFactor;
//         console.log(`✅ Applied Exponential Rank 20 parameters:`);
//         console.log(`   - Alpha: ${params.alpha}`);
//         console.log(`   - Smoothing Factor: ${smoothingFactor.toFixed(6)}`);
//       }
      
//       console.log("========================================");
//       console.log("✅ RESET COMPLETE");
//       console.log("========================================");
//     }, 200);
//   }
// }

// // Initialize experiment on page load
// window.addEventListener('DOMContentLoaded', () => {
//   window.fittsExperiment = new FittsExperiment();
//   console.log("Fitts' Law Experiment initialized");
// });

