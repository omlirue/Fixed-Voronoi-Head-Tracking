function createReferenceGrid() {
    const gridContainer = document.createElement("div");
    gridContainer.id = "reference-grid";
    gridContainer.style.position = "fixed";
    gridContainer.style.top = "0";
    gridContainer.style.left = "0";
    gridContainer.style.width = "100%";
    gridContainer.style.height = "100%";
    gridContainer.style.pointerEvents = "none";
    gridContainer.style.zIndex = "998";

    const rows = 5;
    const cols = 7;
    const circleSize = 40;
    
    // Add margins to keep circles fully visible
    const margin = circleSize;
    
    // Calculate usable space
    const usableWidth = window.innerWidth - (2 * margin);
    const usableHeight = window.innerHeight - (2 * margin);
    
    // Calculate spacing between circles
    const spacingX = usableWidth / (cols - 1);
    const spacingY = usableHeight / (rows - 1);

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const circle = document.createElement("div");
            circle.style.position = "absolute";
            circle.style.width = `${circleSize}px`;
            circle.style.height = `${circleSize}px`;
            circle.style.borderRadius = "50%";
            circle.style.border = "2px solid #333333";
            circle.style.left = `${margin + (spacingX * col) - circleSize/2}px`;
            circle.style.top = `${margin + (spacingY * row) - circleSize/2}px`;
            gridContainer.appendChild(circle);
        }
    }

    document.body.appendChild(gridContainer);
}

function updateCursor() {
    if (!document.getElementById("reference-grid") && state.isTracking) {
        createReferenceGrid();
    }

    if (state.isTracking && state.transformationMatrix && state.lastLandmarks) {
        try {
            // Remove old single cursor
            const oldCursor = document.getElementById("head-cursor");
            if (oldCursor) {
                oldCursor.remove();
            }

            const currentLandmarks = landmarksToVector(state.lastLandmarks);
            if (!currentLandmarks) return;
            
            const P = math.matrix(currentLandmarks);
            const B = math.matrix(state.transformationMatrix);
            const Q = math.multiply(B, P);
            const position = Q.toArray();
            
            // Create or get clipped cursor (red)
            let cursorWithClipping = document.getElementById("head-cursor-clipped");
            if (!cursorWithClipping) {
                cursorWithClipping = document.createElement("div");
                cursorWithClipping.id = "head-cursor-clipped";
                cursorWithClipping.style.position = "absolute";
                cursorWithClipping.style.width = "20px";
                cursorWithClipping.style.height = "20px";
                cursorWithClipping.style.borderRadius = "50%";
                cursorWithClipping.style.backgroundColor = "red";
                cursorWithClipping.style.zIndex = "1000";
                document.body.appendChild(cursorWithClipping);
            }
            
            // Create or get raw cursor (blue)
            let cursorWithoutClipping = document.getElementById("head-cursor-raw");
            if (!cursorWithoutClipping) {
                cursorWithoutClipping = document.createElement("div");
                cursorWithoutClipping.id = "head-cursor-raw";
                cursorWithoutClipping.style.position = "absolute";
                cursorWithoutClipping.style.width = "20px";
                cursorWithoutClipping.style.height = "20px";
                cursorWithoutClipping.style.borderRadius = "50%";
                cursorWithoutClipping.style.backgroundColor = "blue";
                cursorWithoutClipping.style.opacity = "0.5";
                cursorWithoutClipping.style.zIndex = "999";
                document.body.appendChild(cursorWithoutClipping);
            }
            
            const currentClippedX = parseFloat(cursorWithClipping.style.left) || position[0][0];
            const currentClippedY = parseFloat(cursorWithClipping.style.top) || position[1][0];
            const currentRawX = parseFloat(cursorWithoutClipping.style.left) || position[0][0];
            const currentRawY = parseFloat(cursorWithoutClipping.style.top) || position[1][0];
            
            const headPositionX = position[0][0];
            const headPositionY = position[1][0];
            
            // Initialize if needed
            if (!state.offsetX) state.offsetX = 0;
            if (!state.offsetY) state.offsetY = 0;
            if (!state.lastHeadX) state.lastHeadX = headPositionX;
            if (!state.lastHeadY) state.lastHeadY = headPositionY;

            // Calculate movement directions
            const movingRight = headPositionX > state.lastHeadX;
            const movingDown = headPositionY > state.lastHeadY;
            
            // Handle left/right edges
            if (headPositionX < 0) {  // Left edge
                state.offsetX = -headPositionX;
            } else if (headPositionX > window.innerWidth - 5) {  // Right edge
                state.offsetX = (window.innerWidth - 5) - headPositionX;
            } else {
                state.offsetX *= 0.95;  // Normal range
            }
            
            // Handle top/bottom edges
            if (headPositionY < 0) {  // Top edge
                state.offsetY = -headPositionY;
            } else if (headPositionY > window.innerHeight - 5) {  // Bottom edge
                state.offsetY = (window.innerHeight - 5) - headPositionY;
            } else {
                state.offsetY *= 0.95;  // Normal range
            }
            
            // Calculate adjusted positions
            const adjustedPositionX = headPositionX + state.offsetX;
            const adjustedPositionY = headPositionY + state.offsetY;
            
            const smoothing = 0.95;
            
            // Update raw cursor (blue) - follows head directly
            const newRawX = currentRawX + (headPositionX - currentRawX) * (1 - smoothing);
            const newRawY = currentRawY + (headPositionY - currentRawY) * (1 - smoothing);
            cursorWithoutClipping.style.left = `${Math.round(newRawX)}px`;
            cursorWithoutClipping.style.top = `${Math.round(newRawY)}px`;
            
            // Update clipped cursor (red) - with immediate edge response
            const newClippedX = currentClippedX + (adjustedPositionX - currentClippedX) * (1 - smoothing);
            const newClippedY = currentClippedY + (adjustedPositionY - currentClippedY) * (1 - smoothing);
            const boundedX = Math.max(0, Math.min(window.innerWidth - 5, Math.round(newClippedX)));
            const boundedY = Math.max(0, Math.min(window.innerHeight - 5, Math.round(newClippedY)));
            cursorWithClipping.style.left = `${boundedX}px`;
            cursorWithClipping.style.top = `${boundedY}px`;
            
            // Store head positions for next frame
            state.lastHeadX = headPositionX;
            state.lastHeadY = headPositionY;
            
            console.log({
                headPositionX,
                headPositionY,
                offsetX: state.offsetX,
                offsetY: state.offsetY,
                rawX: newRawX,
                rawY: newRawY,
                clippedX: boundedX,
                clippedY: boundedY
            });
            
        } catch (error) {
            console.error("Error updating cursor position:", error);
        }
    } else if (!state.isTracking) {
        // Remove grid if tracking stops
        const grid = document.getElementById("reference-grid");
        if (grid) {
            grid.remove();
        }
    }
    requestAnimationFrame(updateCursor);
}