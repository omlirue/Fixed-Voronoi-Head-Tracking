// Replicate the EXACT computeLatencyMatchedPairs guards against the global
// Pareto fronts the live experiment loads, to see why it returned null.
const fs = require('fs');
const path = require('path');

const window = {};
const load = (f) => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
  // files do `window.X = X;` at the end; eval in a scope that has `window`.
  new Function('window', code)(window);
};
load('pareto-front-parameters.js');
load('exponential-parameters.js');

const oeParams = window.PARETO_FRONT_PARAMETERS;
const expParams = window.EXPONENTIAL_PARAMETERS;
console.log(`OE points: ${oeParams.length}, Exp points: ${expParams.length}`);

const MAX_LATENCY_MS = 600, MAX_VARIANCE_PX = 12;
const within = (p) => p.meanVariance <= MAX_VARIANCE_PX && p.meanLatency <= MAX_LATENCY_MS;
const exByLat = [...expParams].filter(within).sort((a,b)=>a.meanLatency-b.meanLatency);
const oeByLat = [...oeParams].filter(within).sort((a,b)=>a.meanLatency-b.meanLatency);
console.log(`in-cap: exByLat=${exByLat.length}, oeByLat=${oeByLat.length}`);
if (exByLat.length < 2 || oeByLat.length < 2) { console.log('NULL: not enough in-cap points'); process.exit(0); }

const exLo=exByLat[0].meanLatency, exHi=exByLat[exByLat.length-1].meanLatency;
const oeLo=oeByLat[0].meanLatency, oeHi=oeByLat[oeByLat.length-1].meanLatency;
const overlapLo=Math.max(exLo,oeLo), overlapHi=Math.min(exHi,oeHi);
console.log(`Exp latency ${exLo.toFixed(0)}-${exHi.toFixed(0)}, OE ${oeLo.toFixed(0)}-${oeHi.toFixed(0)}`);
console.log(`overlap ${overlapLo.toFixed(0)}-${overlapHi.toFixed(0)} (width ${(overlapHi-overlapLo).toFixed(0)}ms)`);
if (overlapHi <= overlapLo) { console.log('NULL: no shared latency overlap'); process.exit(0); }

const interpByLat=(t,arr)=>{
  if (t<=arr[0].meanLatency) return {...arr[0]};
  if (t>=arr[arr.length-1].meanLatency) return {...arr[arr.length-1]};
  for(let i=0;i<arr.length-1;i++){const lo=arr[i],hi=arr[i+1];if(lo.meanLatency<=t&&hi.meanLatency>=t){const r=hi.meanLatency-lo.meanLatency;const k=r===0?0:(t-lo.meanLatency)/r;return {meanVariance:lo.meanVariance+k*(hi.meanVariance-lo.meanVariance),meanLatency:t};}}
  return null;
};
const margin=(overlapHi-overlapLo)*0.02;
const loLat=overlapLo+margin, hiLat=overlapHi-margin;
const targets=[{l:'Low',lat:hiLat},{l:'Medium',lat:(loLat+hiLat)/2},{l:'High',lat:loLat}];
for(const t of targets){
  const ex=interpByLat(t.lat,exByLat), oe=interpByLat(t.lat,oeByLat);
  if(!ex||!oe){console.log(`NULL: interp failed at ${t.lat.toFixed(0)}ms`);process.exit(0);}
  console.log(`${t.l} @ ${t.lat.toFixed(0)}ms -> OE var=${oe.meanVariance.toFixed(2)}px, Exp var=${ex.meanVariance.toFixed(2)}px, gap=${Math.abs(ex.meanVariance-oe.meanVariance).toFixed(2)}px`);
}
console.log('RESULT: would return 3 pairs (NO fallback) on global fronts.');
