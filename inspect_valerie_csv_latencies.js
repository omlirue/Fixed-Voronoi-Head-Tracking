const fs = require('fs');
const path = require('path');

const tmpDir = "/tmp/valerie_fronts";
const csv = fs.readFileSync(path.join(tmpDir, 'exponential.csv'), 'utf8');
const lines = csv.split('\n').filter(l => l.trim().length > 0);
const latencies = lines.slice(1).map(l => parseFloat(l.split(',')[3]));

console.log(`Exponential CSV latencies range: ${Math.min(...latencies)} - ${Math.max(...latencies)} ms`);

const oeCsv = fs.readFileSync(path.join(tmpDir, 'oneeuro.csv'), 'utf8');
const oeLines = oeCsv.split('\n').filter(l => l.trim().length > 0);
const oeLatencies = oeLines.slice(1).map(l => parseFloat(l.split(',')[5]));

console.log(`One Euro CSV latencies range: ${Math.min(...oeLatencies)} - ${Math.max(...oeLatencies)} ms`);
