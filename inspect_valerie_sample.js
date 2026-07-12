const fs = require('fs');
const path = require('path');

const tmpDir = "/tmp/valerie_raw";
const rawData = JSON.parse(fs.readFileSync(path.join(tmpDir, 'raw-data', 'position-0-Top-Left.json'), 'utf8'));

console.log("First headPosition sample keys:", Object.keys(rawData.headPositions[0]));
console.log("First headPosition sample details:", {
  time: rawData.headPositions[0].time,
  landmarks: !!rawData.headPositions[0].landmarks,
  landmarkConfig: rawData.headPositions[0].landmarkConfig,
  transformationMatrix: !!rawData.headPositions[0].transformationMatrix,
  rotation: rawData.headPositions[0].rotation
});
