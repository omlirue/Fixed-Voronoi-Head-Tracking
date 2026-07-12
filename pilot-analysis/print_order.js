// Prints the EXACT session order each participant gets under the new
// filter-block structure, derived from getCounterbalanceCondition() in
// fitts-experiment.js.
const VAR = [
  [0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]
];
const VLAB = ['Low','Med','High'];

function cond(id){
  const ci = (id-1)%24;
  const v = ci%6;
  const f = Math.floor(ci/6)%2;     // 0 exp, 1 oneEuro
  const p = Math.floor(ci/12)%2;    // partFirst (now MOOT)
  return {
    varianceOrder: VAR[v],
    filterFirst: f===0?'Exponential':'One Euro',
    partFirst: p===0?'A':'B'
  };
}

for(let id=1; id<=24; id++){
  const c = cond(id);
  const first = c.filterFirst;
  const second = first==='Exponential'?'One Euro':'Exponential';
  const order = c.varianceOrder.map(i=>VLAB[i]).join(', ');
  const dup = id>12 ? `  (== P${String(id-12).padStart(2,'0')})` : '';
  console.log(`P${String(id).padStart(2,'0')}: filterFirst=${first}, varianceOrder=${order}${dup}`);
  console.log(`   1) ${first} (personal): ${order}`);
  console.log(`   2) ${first} (STANDARD): Med only`);
  console.log(`   3) ${second} (personal): ${order}`);
  console.log(`   4) ${second} (STANDARD): Med only`);
}
