const fs = require('fs');
let file = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');

const target = `                  { label: 'Total Back Height', key: 'backHeightMm' },
                  { label: 'Base Height', key: 'baseHeightMm' },
                  { label: 'Fascia Height', key: 'roofHeightMm' },`;

const replacement = `                  { label: 'Total Back Height', key: 'backHeightMm' },
                  { label: 'Base Height', key: 'baseHeightMm' },
                  { label: 'Fascia Height', key: 'roofHeightMm' },
                  { label: 'Wall Thickness', key: 'wallThicknessMm' },`;

file = file.replace(target, replacement);

const target2 = `                  if (dim.key === 'backHeightMm') val = (room.backHeightMm ?? room.heightMm ?? 2350) + baseH + roofH;`;
const replacement2 = `                  if (dim.key === 'backHeightMm') val = (room.backHeightMm ?? room.heightMm ?? 2350) + baseH + roofH;
                  if (dim.key === 'wallThicknessMm') val = room.wallThicknessMm || 150;`;

file = file.replace(target2, replacement2);

fs.writeFileSync('src/components/Sidebar.tsx', file);
console.log('Sidebar updated');
