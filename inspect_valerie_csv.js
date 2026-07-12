const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;

const zipPath = "pilot data 2/pilot data -2 - latency /Valerie/P20_pareto-optimization-2026-06-16T16-35-09-260Z.zip";
const tmpDir = "/tmp/valerie_fronts";

if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

execSync(`unzip -o "${zipPath}" oneeuro.csv exponential.csv -d "${tmpDir}"`);

const csv = fs.readFileSync(path.join(tmpDir, 'exponential.csv'), 'utf8');
const lines = csv.split('\n');
console.log("Exponential CSV header and first 10 lines:");
console.log(lines.slice(0, 11));

const oeCsv = fs.readFileSync(path.join(tmpDir, 'oneeuro.csv'), 'utf8');
const oeLines = oeCsv.split('\n');
console.log("\nOne Euro CSV header and first 10 lines:");
console.log(oeLines.slice(0, 11));
