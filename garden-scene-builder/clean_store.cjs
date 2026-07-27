const fs = require('fs');
let file = fs.readFileSync('src/store.ts', 'utf8');

const t = `export interface InteriorDoorData {
  id: string;
  xMm: number;
  zMm: number;
  rotation: number;
  widthMm: number;
  heightMm: number;
}

export interface PartitionData {`;

if (file.includes(t)) {
  file = file.replace(t, 'export interface PartitionData {');
  fs.writeFileSync('src/store.ts', file);
  console.log('cleaned store');
} else {
  console.log('no clean store');
}
