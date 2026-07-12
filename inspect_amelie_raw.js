const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;

const zipPath = "pilot data 2/pilot data -2 - latency /Amelie/fitts-personal-calibration-P19-2026-06-16T17_25_11.839Z.zip";
const tmpDir = "/tmp/amelie_raw";

if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

execSync(`unzip -o "${zipPath}" fitts-raw-data-2026-06-16T17:25:11.839Z.csv -d "${tmpDir}"`);

const rawCsv = fs.readFileSync(path.join(tmpDir, 'fitts-raw-data-2026-06-16T17:25:11.839Z.csv'), 'utf8');
const lines = rawCsv.split('\n');
console.log("Amelie's raw CSV first 5 lines:");
console.log(lines.slice(0, 6));
