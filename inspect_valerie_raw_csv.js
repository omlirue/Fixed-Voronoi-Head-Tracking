const fs = require('fs');
const path = require('path');

const tmpDir = "/tmp/valerie_trials";
const rawCsv = fs.readFileSync(path.join(tmpDir, 'A', 'fitts-raw-data-2026-06-16T17:45:21.003Z.csv'), 'utf8');
const lines = rawCsv.split('\n');
console.log("Valerie's raw CSV first 5 lines:");
console.log(lines.slice(0, 6));
