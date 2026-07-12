const fs = require('fs');
const path = require('path');

const tmpDir = "/tmp/valerie_trials";
const resultsB = fs.readFileSync(path.join(tmpDir, 'B', 'fitts-results-2026-06-16T17:45:21.003Z.csv'), 'utf8');
console.log("=== Part B Results ===");
console.log(resultsB);

const resultsA = fs.readFileSync(path.join(tmpDir, 'A', 'fitts-results-2026-06-16T17:45:21.003Z.csv'), 'utf8');
console.log("=== Part A Results ===");
console.log(resultsA);
