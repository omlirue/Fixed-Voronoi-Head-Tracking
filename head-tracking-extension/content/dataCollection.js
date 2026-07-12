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
    };
    const metadataLine = `#${JSON.stringify(metadata)}`;

    // Calculate predictions for both 3-point and 6-point configurations
    const validData = state.dataCollection.calibrationData.map((frame) => {
      const is3D = state.config.coordinateSystem === "3d";

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

      try {
        // Calculate predictions using both matrices
        const predicted3 = math
          .multiply(
            math.matrix(state.transformationMatrices.threePoint),
            math.matrix(threePointVector)
          )
          .toArray();

        const predicted6 = math
          .multiply(
            math.matrix(state.transformationMatrices.sixPoint),
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

    // Create and trigger download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const filename = `calibration_video${
      state.dataCollection.videoNumber
    }_${Date.now()}.csv`;

    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Increment video number for next session
    state.dataCollection.videoNumber++;

    return true;
  } catch (error) {
    console.error("Error exporting calibration data:", error);
    return false;
  }
}

window.exportCalibrationData = exportCalibrationData;