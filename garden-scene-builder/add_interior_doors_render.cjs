const fs = require('fs');
let file = fs.readFileSync('src/components/3d/RoomGeometry.tsx', 'utf8');

const anchor = `      {/* Plan View Annotations (Doors/Windows marked on walls) */}`;

const interiorDoorsBlock = `      {/* Interior Doors */}
      {(room.interiorDoors || []).map(door => {
        const dW = door.widthMm/1000;
        const dH = door.heightMm/1000;
        const dX = door.xMm/1000;
        const dZ = door.zMm/1000;
        const isHovered = hoveredElementId === \`intdoor-\${door.id}\`;
        const rot = door.rotation === 90 ? Math.PI/2 : 0;
        return (
          <group 
            key={door.id}
            position={[dX, dH/2, dZ]}
            rotation={[0, rot, 0]}
            onPointerOver={(e) => { e.stopPropagation(); useStore.getState().setHoveredElementId(\`intdoor-\${door.id}\`); }}
            onPointerOut={() => useStore.getState().setHoveredElementId(null)}
          >
            {/* Wooden Frame */}
            <mesh position={[-dW/2 + 0.015, 0, 0]} castShadow receiveShadow>
               <boxGeometry args={[0.03, dH, 0.12]} />
               <meshStandardMaterial color="#fcd3a1" roughness={0.7} />
            </mesh>
            <mesh position={[dW/2 - 0.015, 0, 0]} castShadow receiveShadow>
               <boxGeometry args={[0.03, dH, 0.12]} />
               <meshStandardMaterial color="#fcd3a1" roughness={0.7} />
            </mesh>
            <mesh position={[0, dH/2 - 0.015, 0]} castShadow receiveShadow>
               <boxGeometry args={[dW - 0.06, 0.03, 0.12]} />
               <meshStandardMaterial color="#fcd3a1" roughness={0.7} />
            </mesh>
            
            {/* Door Leaf (open 45 deg) */}
            <group position={[-dW/2 + 0.03, 0, 0]} rotation={[0, -Math.PI/4, 0]}>
              <mesh position={[dW/2 - 0.03, 0, 0]} castShadow>
                 <boxGeometry args={[dW - 0.06, dH - 0.03, 0.035]} />
                 <meshStandardMaterial color="#ffffff" roughness={0.8} />
              </mesh>
            </group>

            {room.showDimensions && isHovered && (
               <>
                 {door.rotation === 0 ? (
                   <>
                     <DragHandle elementId={\`intdoor-\${door.id}\`} position={[0, -dH/2 + 0.5, 0.15]} axis="z" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updateInteriorDoor(door.id, { zMm: door.zMm + dz*1000 })} />
                     <DragHandle elementId={\`intdoor-\${door.id}\`} position={[0, 0, 0]} axis="x" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updateInteriorDoor(door.id, { xMm: door.xMm + dx*1000 })} />
                   </>
                 ) : (
                   <>
                     <DragHandle elementId={\`intdoor-\${door.id}\`} position={[0, -dH/2 + 0.5, -0.15]} axis="x" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updateInteriorDoor(door.id, { xMm: door.xMm + dx*1000 })} />
                     <DragHandle elementId={\`intdoor-\${door.id}\`} position={[0, 0, 0]} axis="z" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updateInteriorDoor(door.id, { zMm: door.zMm + dz*1000 })} />
                   </>
                 )}
               </>
            )}
          </group>
        );
      })}
      
      {/* Plan View Annotations (Doors/Windows marked on walls) */}`;

if (!file.includes('Interior Doors') && file.includes(anchor)) {
  file = file.replace(anchor, interiorDoorsBlock);
  fs.writeFileSync('src/components/3d/RoomGeometry.tsx', file);
  console.log('Interior Doors added');
} else {
  console.log('Could not find anchor or doors already added');
}
