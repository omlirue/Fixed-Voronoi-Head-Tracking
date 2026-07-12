function exportCalibrationData() {
    if (!state.dataCollection.calibrationData.length) {
        console.warn('No calibration data to export');
        return;
    }

    try {
        // Convert data to CSV format
        const headers = [
            'videoNumber',
            'calibrationPointNumber',
            'timestamp',
            'frameIndex',
            'targetX',
            'targetY',
            'noseX',
            'noseY',
            'noseZ',
            'leftEyeX',
            'leftEyeY',
            'leftEyeZ',
            'rightEyeX',
            'rightEyeY',
            'rightEyeZ',
            'progress'
        ].join(',');

        const rows = state.dataCollection.calibrationData.map(frame => [
            frame.videoNumber,
            frame.calibrationPointNumber,
            frame.timestamp,
            frame.frameIndex,
            frame.targetX,
            frame.targetY,
            frame.noseX,
            frame.noseY,
            frame.noseZ,
            frame.leftEyeX,
            frame.leftEyeY,
            frame.leftEyeZ,
            frame.rightEyeX,
            frame.rightEyeY,
            frame.rightEyeZ,
            frame.progress
        ].join(','));

        const csvContent = [headers, ...rows].join('\n');

        // Create CSV file and download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `calibration_video${state.dataCollection.videoNumber}_${Date.now()}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }

        // Save to IndexedDB
        saveToIndexedDB(state.dataCollection.videoNumber, state.dataCollection.calibrationData);

        // Try to upload to Drive if configured
        if (driveConfig.isInitialized) {
            uploadToDrive(csvContent);
        }

        // Increment video number for next session
        state.dataCollection.videoNumber++;

        console.log('Calibration data exported successfully');
        return true;
    } catch (error) {
        console.error('Error exporting calibration data:', error);
        return false;
    }
}