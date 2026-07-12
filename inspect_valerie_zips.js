const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;

const zipA = "pilot data 2/pilot data -2 - latency /Valerie/fitts-personal-calibration-P20-2026-06-16T17_45_21.003Z (2).zip";
const zipB = "pilot data 2/pilot data -2 - latency /Valerie/fitts-standard-calibration-P20-2026-06-16T17_45_21.003Z (2).zip";
const tmpDir = "/tmp/valerie_trials";

if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

execSync(`unzip -o "${zipA}" -d "${tmpDir}/A"`);
execSync(`unzip -o "${zipB}" -d "${tmpDir}/B"`);

const filesA = fs.readdirSync(`${tmpDir}/A`);
const filesB = fs.readdirSync(`${tmpDir}/B`);

console.log("Files in A:", filesA);
console.log("Files in B:", filesB);

const resultsA = fs.readFileSync(path.join(tmpDir, 'A', filesA.find(f => f.startsWith('fitts-results'))), 'utf8');
const resultsB = fs.readFileSync(path.join(tmpDir, 'B', filesB.find(f => f.startsWith('fitts-results'))), 'utf8');

console.log(`Results A rows: ${resultsA.split('\n').filter(l => l.trim()).length}`);
console.log(`Results B rows: ${resultsB.split('\n').filter(l => l.trim()).length}`);

const rawA = fs.readFileSync(path.join(tmpDir, 'A', filesA.find(f => f.startsWith('fitts-raw-data'))), 'utf8');
const rawB = fs.readFileSync(path.join(tmpDir, 'B', filesB.find(f => f.startsWith('fitts-raw-data'))), 'utf8');

console.log(`Raw A rows: ${rawA.split('\n').filter(l => l.trim()).length}`);
console.log(`Raw B rows: ${rawB.split('\n').filter(l => l.trim()).length}`);
