const fs = require('fs');
let file = fs.readFileSync('src/components/3d/RoomGeometry.tsx', 'utf8');

file = file.replace(
  'const wallThickness = 0.15; // 150mm walls',
  'const wallThickness = (room.wallThicknessMm || 150) / 1000;'
);

fs.writeFileSync('src/components/3d/RoomGeometry.tsx', file);
console.log('RoomGeometry updated');
