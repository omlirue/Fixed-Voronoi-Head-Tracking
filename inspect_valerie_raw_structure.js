const fs = require('fs');
const path = require('path');

const tmpDir = "/tmp/valerie_raw";
const rawData = JSON.parse(fs.readFileSync(path.join(tmpDir, 'raw-data', 'position-0-Top-Left.json'), 'utf8'));
console.log("Keys of rawData:", Object.keys(rawData));
if (Array.isArray(rawData)) {
  console.log("rawData is an array of length:", rawData.length);
  console.log("First element:", rawData[0]);
} else {
  console.log("rawData is an object");
  for (const k of Object.keys(rawData)) {
    console.log(`  ${k}: type=${typeof rawData[k]}, isArray=${Array.isArray(rawData[k])}`);
  }
}
