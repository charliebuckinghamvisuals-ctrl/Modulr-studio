const fs = require('fs');
let file = fs.readFileSync('src/store.ts', 'utf8');

file = file.replace(
  'depthMm: 3000,',
  'depthMm: 3000,\n    wallThicknessMm: 150,'
);

fs.writeFileSync('src/store.ts', file);
console.log('store updated');
