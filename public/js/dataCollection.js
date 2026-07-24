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