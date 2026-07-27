const fs = require('fs');
let file = fs.readFileSync('src/store.ts', 'utf8');

file = file.replace(
  /widthMm: 4000,\s*depthMm: 3000,\s*wallThicknessMm: 150,\s*heightMm: 2200,\s*baseHeightMm: 100,\s*roofHeightMm: 200,/,
  `widthMm: 8000,
    depthMm: 4300,
    wallThicknessMm: 150,
    heightMm: 2050,
    backHeightMm: 2010,
    baseHeightMm: 150,
    roofHeightMm: 300,`
);

file = file.replace(
  "cladding: 'timber',",
  "cladding: 'composite_grey',"
);

fs.writeFileSync('src/store.ts', file);
console.log('store updated');
