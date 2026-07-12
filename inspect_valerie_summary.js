const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;

const zipPath = "pilot data 2/pilot data -2 - latency /Valerie/P20_pareto-optimization-2026-06-16T16-35-09-260Z.zip";
const tmpDir = "/tmp/valerie_fronts";

execSync(`unzip -o "${zipPath}" collection-summary.json -d "${tmpDir}"`);

const summary = JSON.parse(fs.readFileSync(path.join(tmpDir, 'collection-summary.json'), 'utf8'));
console.log(JSON.stringify(summary, null, 2));
