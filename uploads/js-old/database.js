let db;

function initDB() {
    const request = indexedDB.open("HeadTrackingDB", 1);
    
    request.onerror = (event) => {
        console.error("IndexedDB error:", event.target.error);
    };

    request.onupgradeneeded = (event) => {
        db = event.target.result;
        if (!db.objectStoreNames.contains("calibrationData")) {
            db.createObjectStore("calibrationData", { keyPath: "id" });
        }
    };

    request.onsuccess = (event) => {
        db = event.target.result;
    };
}
 async function initializeDriveAPI() {
    try {
        const response = await fetch('/credentials/service-account.json');
        driveConfig.credentials = await response.json();
        driveConfig.isInitialized = true;
        console.log('Google Drive API initialized');
    } catch (error) {
        console.error('Failed to initialize Google Drive API:', error);
    }
}

 async function uploadToDrive(csvContent) {
    if (!driveConfig.isInitialized) {
        console.error('Google Drive API not initialized');
        return;
    }

    try {
        const metadata = {
            name: `calibration_video${state.dataCollection.videoNumber}_${Date.now()}.csv`,
            mimeType: 'text/csv',
        };

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', blob);

        const response = await fetch('YOUR_UPLOAD_ENDPOINT', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.statusText}`);
        }

        console.log('Calibration data uploaded successfully');
    } catch (error) {
        console.error('Error uploading to Drive:', error);
    }
}

function saveToIndexedDB(videoNumber, data) {
    if (!db) return;
    
    const transaction = db.transaction(["calibrationData"], "readwrite");
    const store = transaction.objectStore("calibrationData");
    store.add({
        id: Date.now(),
        videoNumber: videoNumber,
        data: data
    });
}