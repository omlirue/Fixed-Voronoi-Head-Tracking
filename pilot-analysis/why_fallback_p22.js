// Run the EXACT computeLatencyMatchedPairs guards against P22's PERSONAL
// Pareto fronts (what the live experiment uses after optimization).
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', '.p22opt');
const oe = JSON.parse(fs.readFileSync(path.join(dir, 'pareto-front-oneeuro.json'), 'utf8')).paretoFront;
const ex = JSON.parse(fs.readFileSync(path.join(dir, 'pareto-front-exponential.json'), 'utf8')).paretoFront;
console.log(`OE points: ${oe.length}, Exp points: ${ex.length}`);

const MAX_LATENCY_MS = 600, MAX_VARIANCE_PX = 12;
const within = (p) => p.meanVariance <= MAX_VARIANCE_PX && p.meanLatency <= MAX_LATENCY_MS;
const exByLat = [...ex].filter(within).sort((a,b)=>a.meanLatency-b.meanLatency);
const oeByLat = [...oe].filter(within).sort((a,b)=>a.meanLatency-b.meanLatency);
console.log(`in-cap (var<=12 & lat<=600): exByLat=${exByLat.length}, oeByLat=${oeByLat.length}`);

// show the in-cap extremes
const span=(arr)=>arr.length?`${arr[0].meanLatency.toFixed(0)}-${arr[arr.length-1].meanLatency.toFixed(0)}ms, var ${Math.min(...arr.map(p=>p.meanVariance)).toFixed(1)}-${Math.max(...arr.map(p=>p.meanVariance)).toFixed(1)}px`:'(none)';
console.log(`  Exp in-cap: ${span(exByLat)}`);
console.log(`  OE  in-cap: ${span(oeByLat)}`);

if (exByLat.length < 2 || oeByLat.length < 2) { console.log('>>> FALLBACK CAUSE: not enough in-cap points (need >=2 each)'); process.exit(0); }

const exLo=exByLat[0].meanLatency, exHi=exByLat[exByLat.length-1].meanLatency;
const oeLo=oeByLat[0].meanLatency, oeHi=oeByLat[oeByLat.length-1].meanLatency;
const overlapLo=Math.max(exLo,oeLo), overlapHi=Math.min(exHi,oeHi);
console.log(`shared latency overlap: ${overlapLo.toFixed(0)}-${overlapHi.toFixed(0)} (width ${(overlapHi-overlapLo).toFixed(0)}ms)`);
if (overlapHi <= overlapLo) { console.log('>>> FALLBACK CAUSE: no shared latency overlap between filters'); process.exit(0); }

const interp=(t,arr)=>{
  if (t<=arr[0].meanLatency) return {...arr[0]};
  if (t>=arr[arr.length-1].meanLatency) return {...arr[arr.length-1]};
  for(let i=0;i<arr.length-1;i++){const lo=arr[i],hi=arr[i+1];if(lo.meanLatency<=t&&hi.meanLatency>=t){const r=hi.meanLatency-lo.meanLatency;const k=r===0?0:(t-lo.meanLatency)/r;return {meanVariance:lo.meanVariance+k*(hi.meanVariance-lo.meanVariance),meanLatency:t};}}
  return null;
};
const margin=(overlapHi-overlapLo)*0.02, loLat=overlapLo+margin, hiLat=overlapHi-margin;
const targets=[{l:'Low',lat:hiLat},{l:'Medium',lat:(loLat+hiLat)/2},{l:'High',lat:loLat}];
for(const t of targets){
  const e=interp(t.lat,exByLat), o=interp(t.lat,oeByLat);
  if(!e||!o){console.log(`>>> FALLBACK CAUSE: interp failed at ${t.lat.toFixed(0)}ms`);process.exit(0);}
  console.log(`${t.l} @ ${t.lat.toFixed(0)}ms -> OE var=${o.meanVariance.toFixed(2)}px, Exp var=${e.meanVariance.toFixed(2)}px, gap=${Math.abs(e.meanVariance-o.meanVariance).toFixed(2)}px`);
}
console.log('RESULT: would SUCCEED (latency-matched) on P22 personal fronts.');
