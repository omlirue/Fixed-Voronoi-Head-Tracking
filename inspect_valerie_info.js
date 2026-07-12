const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;

const zipA = "pilot data 2/pilot data -2 - latency /Valerie/fitts-personal-calibration-P20-2026-06-16T17_45_21.003Z (2).zip";
const zipB = "pilot data 2/pilot data -2 - latency /Valerie/fitts-standard-calibration-P20-2026-06-16T17_45_21.003Z (2).zip";
const tmpDir = "/tmp/valerie_info";

if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

execSync(`unzip -o "${zipA}" info.txt -d "${tmpDir}/A"`);
execSync(`unzip -o "${zipB}" info.txt -d "${tmpDir}/B"`);

console.log("=== Valerie Part A info.txt ===");
console.log(fs.readFileSync(path.join(tmpDir, 'A', 'info.txt'), 'utf8'));

console.log("=== Valerie Part B info.txt ===");
console.log(fs.readFileSync(path.join(tmpDir, 'B', 'info.txt'), 'utf8'));
