const fs = require('fs');
let file = fs.readFileSync('src/components/3d/RoomGeometry.tsx', 'utf8');

const t1 = `<DragHandle elementId={\`intdoor-\${door.id}\`} position={[0, -dH/2 + 0.5, -0.15]} axis="x" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updateInteriorDoor(door.id, { xMm: door.xMm + dx*1000 })} />`;
const r1 = `<DragHandle elementId={\`intdoor-\${door.id}\`} position={[0, -dH/2 + 0.5, -0.15]} axis="x" visualAxis="z" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updateInteriorDoor(door.id, { xMm: door.xMm + dx*1000 })} />`;

file = file.replace(t1, r1);
fs.writeFileSync('src/components/3d/RoomGeometry.tsx', file);
