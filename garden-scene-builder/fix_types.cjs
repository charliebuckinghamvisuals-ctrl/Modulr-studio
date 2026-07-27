const fs = require('fs');
let file = fs.readFileSync('src/types.ts', 'utf8');

if (!file.includes('wallThicknessMm?: number;')) {
  file = file.replace(
    '  depthMm: number;',
    '  depthMm: number;\n  wallThicknessMm?: number;'
  );
  fs.writeFileSync('src/types.ts', file);
  console.log('types updated');
}
