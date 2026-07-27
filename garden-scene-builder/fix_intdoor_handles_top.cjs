const fs = require('fs');
let file = fs.readFileSync('src/components/3d/RoomGeometry.tsx', 'utf8');

const t1 = `<DragHandle elementId={\`intdoor-\${door.id}\`} position={[0, -dH/2 + 0.5, 0.15]} axis="z" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updateInteriorDoor(door.id, { zMm: door.zMm + dz*1000 })} />`;
const r1 = `<DragHandle elementId={\`intdoor-\${door.id}\`} position={[0, dH/2 + 0.3, 0]} axis="z" visualAxis="z" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updateInteriorDoor(door.id, { zMm: door.zMm + dz*1000 })} />`;

const t2 = `<DragHandle elementId={\`intdoor-\${door.id}\`} position={[0, 0, 0]} axis="x" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updateInteriorDoor(door.id, { xMm: door.xMm + dx*1000 })} />`;
const r2 = `<DragHandle elementId={\`intdoor-\${door.id}\`} position={[0, dH/2 + 0.3, 0]} axis="x" visualAxis="x" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updateInteriorDoor(door.id, { xMm: door.xMm + dx*1000 })} />`;

const t3 = `<DragHandle elementId={\`intdoor-\${door.id}\`} position={[0, -dH/2 + 0.5, -0.15]} axis="x" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updateInteriorDoor(door.id, { xMm: door.xMm + dx*1000 })} />`;
const r3 = `<DragHandle elementId={\`intdoor-\${door.id}\`} position={[0, dH/2 + 0.3, 0]} axis="x" visualAxis="z" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updateInteriorDoor(door.id, { xMm: door.xMm + dx*1000 })} />`;

const t4 = `<DragHandle elementId={\`intdoor-\${door.id}\`} position={[0, 0, 0]} axis="z" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updateInteriorDoor(door.id, { zMm: door.zMm + dz*1000 })} />`;
const r4 = `<DragHandle elementId={\`intdoor-\${door.id}\`} position={[0, dH/2 + 0.3, 0]} axis="z" visualAxis="x" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updateInteriorDoor(door.id, { zMm: door.zMm + dz*1000 })} />`;

file = file.replace(t1, r1);
file = file.replace(t2, r2);
file = file.replace(t3, r3);
file = file.replace(t4, r4);

fs.writeFileSync('src/components/3d/RoomGeometry.tsx', file);
console.log('Fixed intdoor handles');
