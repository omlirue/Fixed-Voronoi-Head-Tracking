function trySaveToExtension(filename, csvContent, timeoutMs = 1000) {
  return new Promise((resolve) => {
    let done = false;

    const onAck = (e) => {
      console.log("Ack Received");
      if (done) return;
      done = true;
      window.removeEventListener('htx:saveCalibration:ack', onAck);
      const { ok } = e.detail || {};
      resolve(!!ok);
    };

    window.addEventListener('htx:saveCalibration:ack', onAck, { once: true });

    // Dispatch to the content script bridge (if extension is installed)
    window.dispatchEvent(new CustomEvent('htx:saveCalibration', {
      detail: { filename, csv: csvContent }
    }));

    setTimeout(() => {
      console.log("timeout");
      if (done) return;
      done = true;
      window.removeEventListener('htx:saveCalibration:ack', onAck);
      resolve(false);
    }, timeoutMs);
  });
}

function exportCalibrationData() {
  if (!state.dataCollection.calibrationData.length) {
    console.warn("No calibration data to export");
    return false;
  }

  try {
    const headers = getCSVHeaders();

    // Add metadata
    const metadata = {
      timestamp: Date.now(),
      calibrationWidth: state.calibrationData.calibrationWidth,
      calibrationHeight: state.calibrationData.calibrationHeight,
      rotationOnlyMode: true, // Indicate that this export is for rotation-only predictions
    };
    const metadataLine = `#${JSON.stringify(metadata)}`;

    // Calculate predictions for both 3-point and 6-point configurations
    const validData = state.dataCollection.calibrationData.map((frame) => {
  // Rotation-only prediction: rebuild [1, yaw, pitch, roll] and multiply
  // against the trained rotationOnly matrix.
  if (frame.yaw === undefined || frame.pitch === undefined || frame.roll === undefined) {
    console.warn("Frame missing yaw/pitch/roll, skipping prediction:", frame);
    return frame;
  }

  // Shared builder (head-pose.js) so offline predictions match the trained
  // matrix and the live cursor exactly.
  const rotationVector = window.buildRotationVector({
    yaw: frame.yaw,
    pitch: frame.pitch,
    roll: frame.roll
  });

  try {
    const matrix = state.transformationMatrices.rotationOnly;
    if (!matrix) {
      console.warn("No rotationOnly matrix available for prediction");
      return frame;
    }

    const predicted = math
      .multiply(math.matrix(matrix), math.matrix(rotationVector))
      .toArray();

    return {
      ...frame,
      predictedX: Number(predicted[0][0].toFixed(3)),
      predictedY: Number(predicted[1][0].toFixed(3))
    };
  } catch (e) {
    console.warn("Error calculating prediction:", e);
    return frame;
  }
});

    // Generate CSV rows
    const rows = validData.map((frame) =>
      headers
        .map((header) => {
          const value = frame[header];
          if (value === undefined || value === null) return "";
          return typeof value === "number" ? value.toFixed(3) : value;
        })
        .join(",")
    );

    // Debug log to check headers and first row
    console.log("Headers:", headers);
    console.log("First row:", rows[0]);

    // Combine everything into CSV content
    const csvContent = [metadataLine, headers.join(","), ...rows].join("\n");

    const filename = `calibration_video${state.dataCollection.videoNumber}_${Date.now()}.csv`;

    // Fallback: Create and trigger download
    const doFallbackDownload = () => {
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    trySaveToExtension(filename, csvContent)
      .then((ok) => {
        console.log("Saved to Chrome Extension:", ok);
        doFallbackDownload();
      })
      .catch((err) => {
        console.error("Error during extension save:", err);
        doFallbackDownload();
      })
      .finally(() => {
        state.dataCollection.videoNumber++;
      });

    return true;
  } catch (error) {
    console.error("Error exporting calibration data:", error);
    return false;
  }
}

window.exportCalibrationData = exportCalibrationData;

// ---------------------------------------------------------------------------
// Cell-selection task logging (Fitts'-law-style dwell selection experiment)
// ---------------------------------------------------------------------------

const TASK_LOG_HEADERS = [
  "rowType", "timestamp", "participant", "condition", "round", "trialIndex",
  "selectedCell", "targetCell", "correct", "timeSincePreviousMs",
  "reentries", "graceSaves", "dwellDurationMs",
  "totalTimeMs", "totalErrors", "totalCells", "meanTimePerCellMs",
  "errorRate", "avgReentries", "avgGraceSaves",
  "dwellTimeThresholdMs", "wrongRegionDwellTimeMs", "gracePeriodMs", "timerContinueMs"
];

function csvEscape(value) {
  if (value === undefined || value === null) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

// Participant/condition labels come from URL params (?participant=P1&condition=A)
// so a run can be labeled without adding dedicated UI; defaults to "unknown".
function getRunLabels() {
  if (!state.dataCollection.participant) {
    const params = new URLSearchParams(window.location.search);
    state.dataCollection.participant = params.get("participant") || "unknown";
    state.dataCollection.condition = params.get("condition") || "unknown";
  }
  return {
    participant: state.dataCollection.participant,
    condition: state.dataCollection.condition
  };
}

function startTaskRun() {
  const now = performance.now();
  state.dataCollection.runStartTime = now;
  state.dataCollection.lastSelectionTime = now;
}

// Called once per meaningful cell selection (correct advance, or a new
// wrong-cell error) — not for repeat dwells on an already-resolved cell.
function logCellSelection({ round, trialIndex, selectedCell, targetCell, correct, dwellDurationMs }) {
  const now = performance.now();
  const dwellStats = window.lastDwellStats || { reentries: 0, graceSaves: 0 };
  const cfg = window.DWELL_CONFIG || {};
  const { participant, condition } = getRunLabels();

  const lastTime = state.dataCollection.lastSelectionTime;
  const timeSincePreviousMs = lastTime !== null ? now - lastTime : 0;
  state.dataCollection.lastSelectionTime = now;

  state.dataCollection.taskLog.push({
    rowType: "selection",
    timestamp: new Date().toISOString(),
    participant,
    condition,
    round,
    trialIndex,
    selectedCell,
    targetCell,
    correct,
    timeSincePreviousMs: Math.round(timeSincePreviousMs),
    reentries: dwellStats.reentries,
    graceSaves: dwellStats.graceSaves,
    dwellDurationMs: dwellDurationMs !== undefined ? Math.round(dwellDurationMs) : "",
    dwellTimeThresholdMs: cfg.dwellTimeMs ?? "",
    wrongRegionDwellTimeMs: cfg.wrongRegionDwellTimeMs ?? "",
    gracePeriodMs: cfg.gracePeriodMs ?? "",
    timerContinueMs: cfg.timerContinueMs ?? ""
  });
}

// Called once per completed round; appends a summary row derived from that
// round's selection rows (already pushed via logCellSelection).
function finishTaskRun({ round, totalErrors, totalCells }) {
  const now = performance.now();
  const totalTimeMs = state.dataCollection.runStartTime !== null
    ? now - state.dataCollection.runStartTime
    : 0;
  const cfg = window.DWELL_CONFIG || {};
  const { participant, condition } = getRunLabels();

  const roundRows = state.dataCollection.taskLog.filter(
    (row) => row.rowType === "selection" && row.round === round
  );
  const rowCount = roundRows.length || 1;
  const reentrySum = roundRows.reduce((sum, r) => sum + (r.reentries || 0), 0);
  const graceSaveSum = roundRows.reduce((sum, r) => sum + (r.graceSaves || 0), 0);

  state.dataCollection.taskLog.push({
    rowType: "summary",
    timestamp: new Date().toISOString(),
    participant,
    condition,
    round,
    totalTimeMs: Math.round(totalTimeMs),
    totalErrors,
    totalCells,
    meanTimePerCellMs: Math.round(totalTimeMs / totalCells),
    errorRate: Number((totalErrors / totalCells).toFixed(4)),
    avgReentries: Number((reentrySum / rowCount).toFixed(3)),
    avgGraceSaves: Number((graceSaveSum / rowCount).toFixed(3)),
    dwellTimeThresholdMs: cfg.dwellTimeMs ?? "",
    wrongRegionDwellTimeMs: cfg.wrongRegionDwellTimeMs ?? "",
    gracePeriodMs: cfg.gracePeriodMs ?? "",
    timerContinueMs: cfg.timerContinueMs ?? ""
  });
}

function exportTaskData() {
  if (!state.dataCollection.taskLog.length) {
    console.warn("No task data to export");
    return false;
  }

  try {
    const rows = state.dataCollection.taskLog.map((entry) =>
      TASK_LOG_HEADERS.map((h) => csvEscape(entry[h])).join(",")
    );
    const csvContent = [TASK_LOG_HEADERS.join(","), ...rows].join("\n");
    const filename = `task_data_${state.dataCollection.participant || "unknown"}_${Date.now()}.csv`;

    const doFallbackDownload = () => {
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    trySaveToExtension(filename, csvContent)
      .then((ok) => {
        console.log("Saved task data to Chrome Extension:", ok);
        doFallbackDownload();
      })
      .catch((err) => {
        console.error("Error during extension save:", err);
        doFallbackDownload();
      });

    return true;
  } catch (error) {
    console.error("Error exporting task data:", error);
    return false;
  }
}

window.startTaskRun = startTaskRun;
window.logCellSelection = logCellSelection;
window.finishTaskRun = finishTaskRun;
window.exportTaskData = exportTaskData;