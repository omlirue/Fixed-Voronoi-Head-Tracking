const fs = require('fs');
const path = require('path');

const tmpDir = "/tmp/valerie_fronts";
const oe = JSON.parse(fs.readFileSync(path.join(tmpDir, 'pareto-front-oneeuro.json'), 'utf8')).paretoFront || [];
const ex = JSON.parse(fs.readFileSync(path.join(tmpDir, 'pareto-front-exponential.json'), 'utf8')).paretoFront || [];

console.log(`Valerie's total OE points: ${oe.length}, Exp points: ${ex.length}`);

console.log("\nFirst 10 OE points:");
console.log(oe.slice(0, 10).map(p => `lat: ${p.meanLatency.toFixed(2)} ms, var: ${p.meanVariance.toFixed(2)} px`));

console.log("\nFirst 10 Exp points:");
console.log(ex.slice(0, 10).map(p => `lat: ${p.meanLatency.toFixed(2)} ms, var: ${p.meanVariance.toFixed(2)} px`));

console.log("\nMin/Max OE:");
const oeLats = oe.map(p => p.meanLatency);
const oeVars = oe.map(p => p.meanVariance);
console.log(`OE Latency: ${Math.min(...oeLats).toFixed(2)} - ${Math.max(...oeLats).toFixed(2)} ms`);
console.log(`OE Variance: ${Math.min(...oeVars).toFixed(2)} - ${Math.max(...oeVars).toFixed(2)} px`);

console.log("\nMin/Max Exp:");
const exLats = ex.map(p => p.meanLatency);
const exVars = ex.map(p => p.meanVariance);
console.log(`Exp Latency: ${Math.min(...exLats).toFixed(2)} - ${Math.max(...exLats).toFixed(2)} ms`);
console.log(`Exp Variance: ${Math.min(...exVars).toFixed(2)} - ${Math.max(...exVars).toFixed(2)} px`);
