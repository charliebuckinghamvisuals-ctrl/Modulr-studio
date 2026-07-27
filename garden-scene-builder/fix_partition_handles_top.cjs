const fs = require('fs');
let file = fs.readFileSync('src/components/3d/RoomGeometry.tsx', 'utf8');

const t1 = `<DragHandle elementId={\`part-\${part.id}\`} position={[0, 0.5, 0]} axis="x" visualAxis="x" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updatePartition(part.id, { xMm: part.xMm + dx*1000 })} />`;
const r1 = `<DragHandle elementId={\`part-\${part.id}\`} position={[0, hP/2 + 0.2, 0]} axis="x" visualAxis="x" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updatePartition(part.id, { xMm: part.xMm + dx*1000 })} />`;

const t2 = `<DragHandle elementId={\`part-\${part.id}\`} position={[0, 0.5, 0]} axis="z" visualAxis="x" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updatePartition(part.id, { zMm: part.zMm + dz*1000 })} />`;
const r2 = `<DragHandle elementId={\`part-\${part.id}\`} position={[0, hP/2 + 0.2, 0]} axis="z" visualAxis="x" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updatePartition(part.id, { zMm: part.zMm + dz*1000 })} />`;

file = file.replace(t1, r1);
file = file.replace(t2, r2);

fs.writeFileSync('src/components/3d/RoomGeometry.tsx', file);
console.log('Fixed partition handles top');
