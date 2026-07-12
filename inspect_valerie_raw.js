const fs = require('fs');
const path = require('path');

const tmpDir = "/tmp/valerie_raw";
const rawData = JSON.parse(fs.readFileSync(path.join(tmpDir, 'raw-data', 'position-0-Top-Left.json'), 'utf8'));
console.log(`Valerie's raw data samples count: ${rawData.headPositions.length}`);
console.log("First 5 samples:");
console.log(rawData.headPositions.slice(0, 5).map(s => ({ time: s.time, headX: s.headX, headY: s.headY })));
console.log("Last 5 samples:");
console.log(rawData.headPositions.slice(-5).map(s => ({ time: s.time, headX: s.headX, headY: s.headY })));

const xs = rawData.headPositions.map(s => s.headX);
const ys = rawData.headPositions.map(s => s.headY);
console.log(`X range: ${Math.min(...xs)} - ${Math.max(...xs)}`);
console.log(`Y range: ${Math.min(...ys)} - ${Math.max(...ys)}`);
