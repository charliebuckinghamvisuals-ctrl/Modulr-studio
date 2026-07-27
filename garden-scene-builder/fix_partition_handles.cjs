const fs = require('fs');
let file = fs.readFileSync('src/components/3d/RoomGeometry.tsx', 'utf8');

// For Rotation 0:
// Center Move Handle Z
const t1 = `<DragHandle elementId={\`part-\${part.id}\`} position={[0, 0, pT/2 + 0.2]} axis="z" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updatePartition(part.id, { zMm: part.zMm + dz*1000 })} />`;
const r1 = `<DragHandle elementId={\`part-\${part.id}\`} position={[0, 0, pT/2 + 0.2]} axis="z" visualAxis="z" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updatePartition(part.id, { zMm: part.zMm + dz*1000 })} />`;
file = file.replace(t1, r1);

// Center Move Handle X
const t2 = `<DragHandle elementId={\`part-\${part.id}\`} position={[0, 0.5, 0]} axis="x" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updatePartition(part.id, { xMm: part.xMm + dx*1000 })} />`;
const r2 = `<DragHandle elementId={\`part-\${part.id}\`} position={[0, 0.5, 0]} axis="x" visualAxis="x" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updatePartition(part.id, { xMm: part.xMm + dx*1000 })} />`;
file = file.replace(t2, r2);

// For Rotation 90:
// Center Move Handle X (needs visualAxis="z" because Local Z = World X)
const t3 = `<DragHandle elementId={\`part-\${part.id}\`} position={[0, 0, -pT/2 - 0.2]} axis="x" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updatePartition(part.id, { xMm: part.xMm + dx*1000 })} />`;
const r3 = `<DragHandle elementId={\`part-\${part.id}\`} position={[0, 0, -pT/2 - 0.2]} axis="x" visualAxis="z" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updatePartition(part.id, { xMm: part.xMm + dx*1000 })} />`;
file = file.replace(t3, r3);

// Center Move Handle Z (needs visualAxis="x" because Local X = World -Z)
const t4 = `<DragHandle elementId={\`part-\${part.id}\`} position={[0, 0.5, 0]} axis="z" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updatePartition(part.id, { zMm: part.zMm + dz*1000 })} />`;
const r4 = `<DragHandle elementId={\`part-\${part.id}\`} position={[0, 0.5, 0]} axis="z" visualAxis="x" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updatePartition(part.id, { zMm: part.zMm + dz*1000 })} />`;
file = file.replace(t4, r4);

fs.writeFileSync('src/components/3d/RoomGeometry.tsx', file);
console.log('fixed partition visual axes');
