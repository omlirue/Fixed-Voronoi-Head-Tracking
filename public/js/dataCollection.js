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
      coordinateSystem: state.config.coordinateSystem,
      timestamp: Date.now(),
      calibrationWidth: state.calibrationData.calibrationWidth,
      calibrationHeight: state.calibrationData.calibrationHeight,
      useRotation: state.config.useRotation || false,
      rotationOnlyMode: state.config.rotationOnlyMode || false
    };
    const metadataLine = `#${JSON.stringify(metadata)}`;

    // Calculate predictions for both 3-point and 6-point configurations
    const validData = state.dataCollection.calibrationData.map((frame) => {
      const is3D = state.config.coordinateSystem === "3d";
      const useRotation = state.config.useRotation || false;

      // Reconstruct vectors with 3D components if needed
      const threePointVector = [];
      for (let i = 0; i < 3; i++) {
        const x = frame[`landmark3_${i}_x`];
        const y = frame[`landmark3_${i}_y`];
        const z = is3D ? frame[`landmark3_${i}_z`] : null;

        threePointVector.push([x], [y]);
        if (is3D && z !== undefined) threePointVector.push([z]);

        threePointVector.push([x * x * 0.00001], [y * y * 0.00001]);
        if (is3D && z !== undefined) threePointVector.push([z * z * 0.00001]);
      }

      // Similar reconstruction for sixPointVector
      const sixPointVector = [];
      for (let i = 0; i < 6; i++) {
        const x = frame[`landmark6_${i}_x`];
        const y = frame[`landmark6_${i}_y`];
        const z = is3D ? frame[`landmark6_${i}_z`] : null;

        sixPointVector.push([x], [y]);
        if (is3D && z !== undefined) sixPointVector.push([z]);

        sixPointVector.push([x * x * 0.00001], [y * y * 0.00001]);
        if (is3D && z !== undefined) sixPointVector.push([z * z * 0.00001]);
      }

      // Add rotation terms if rotation was used during calibration
      if (useRotation) {
        // Check if frame has rotation data
        if (frame.yaw !== undefined && frame.pitch !== undefined && frame.roll !== undefined) {
          // Convert degrees to radians (frame data is in degrees)
          // AND Scale by 1000 to match feature scaling
          const DEG2RAD = Math.PI / 180;
          const ANGLE_SCALE = 1000;
          
          threePointVector.push([frame.yaw * DEG2RAD * ANGLE_SCALE]);
          threePointVector.push([frame.pitch * DEG2RAD * ANGLE_SCALE]);
          threePointVector.push([frame.roll * DEG2RAD * ANGLE_SCALE]);
          
          sixPointVector.push([frame.yaw * DEG2RAD * ANGLE_SCALE]);
          sixPointVector.push([frame.pitch * DEG2RAD * ANGLE_SCALE]);
          sixPointVector.push([frame.roll * DEG2RAD * ANGLE_SCALE]);
        } else {
          // No rotation data in frame, use zeros
          threePointVector.push([0], [0], [0]);
          sixPointVector.push([0], [0], [0]);
        }
      }

      try {
        // Select appropriate matrices based on coordinate system and rotation
        let matrix3, matrix6;
        
        if (is3D) {
          matrix3 = useRotation ? 
            state.transformationMatrices.threePoint3d : 
            (state.transformationMatrices.threePoint3dNoRotation || state.transformationMatrices.threePoint3d);
          matrix6 = useRotation ? 
            state.transformationMatrices.sixPoint3d : 
            (state.transformationMatrices.sixPoint3dNoRotation || state.transformationMatrices.sixPoint3d);
        } else {
          matrix3 = useRotation ? 
            state.transformationMatrices.threePoint2d : 
            (state.transformationMatrices.threePoint2dNoRotation || state.transformationMatrices.threePoint2d);
          matrix6 = useRotation ? 
            state.transformationMatrices.sixPoint2d : 
            (state.transformationMatrices.sixPoint2dNoRotation || state.transformationMatrices.sixPoint2d);
        }

        // Calculate predictions using both matrices
        const predicted3 = math
          .multiply(
            math.matrix(matrix3),
            math.matrix(threePointVector)
          )
          .toArray();

        const predicted6 = math
          .multiply(
            math.matrix(matrix6),
            math.matrix(sixPointVector)
          )
          .toArray();

        // Add predictions to frame data
        const enrichedFrame = {
          ...frame,
          predicted3X: Number(predicted3[0][0].toFixed(3)),
          predicted3Y: Number(predicted3[1][0].toFixed(3)),
          predicted6X: Number(predicted6[0][0].toFixed(3)),
          predicted6Y: Number(predicted6[1][0].toFixed(3)),
        };

        // Debug log to check data
        console.log("Frame data:", enrichedFrame);

        return enrichedFrame;
      } catch (e) {
        console.warn("Error calculating predictions:", e);
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