const fs = require('fs');
const path = require('path');

const tmpDir = "/tmp/valerie_trials";
const filesA = fs.readdirSync(`${tmpDir}/A`);
const filesB = fs.readdirSync(`${tmpDir}/B`);

console.log("=== Files in A ===");
filesA.forEach(f => {
  const stats = fs.statSync(path.join(tmpDir, 'A', f));
  console.log(`${f}: ${stats.size} bytes`);
});

console.log("\n=== Files in B ===");
filesB.forEach(f => {
  const stats = fs.statSync(path.join(tmpDir, 'B', f));
  console.log(`${f}: ${stats.size} bytes`);
});
