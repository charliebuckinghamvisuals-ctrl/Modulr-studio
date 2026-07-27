const fs = require('fs');
let file = fs.readFileSync('src/components/3d/RoomGeometry.tsx', 'utf8');

// 1. Update partitions to use CSG Subtraction for interior doors
const oldPartitionBody = `<mesh castShadow receiveShadow>
               <boxGeometry args={[pL, isPitched && !isGable ? (frontH + backH)/2 : h, pT]} />
               <meshStandardMaterial color={room.interiorColor || '#ffffff'} roughness={0.9} />
             </mesh>`;

const newPartitionBody = `<mesh castShadow receiveShadow>
               <Geometry>
                 <Base>
                   <boxGeometry args={[pL, hP, pT]} />
                 </Base>
                 {(room.interiorDoors || []).map(door => {
                   const dW = door.widthMm/1000;
                   const dH = door.heightMm/1000;
                   const dx = door.xMm/1000 - pX;
                   const dz = door.zMm/1000 - pZ;
                   const dy = dH/2 - hP/2;
                   
                   let localX = dx;
                   let localZ = dz;
                   if (part.rotation === 90) {
                     localX = -dz;
                     localZ = dx;
                   }
                   
                   const relRot = door.rotation === part.rotation ? 0 : Math.PI/2;

                   return (
                     <Subtraction key={door.id} position={[localX, dy, localZ]} rotation={[0, relRot, 0]}>
                       <boxGeometry args={[dW, dH, 0.4]} />
                     </Subtraction>
                   );
                 })}
               </Geometry>
               <meshStandardMaterial color={room.interiorColor || '#ffffff'} roughness={0.9} />
             </mesh>`;

// Note: I also need to make sure hP is defined in the script
const hPDef = `const hP = isPitched && !isGable ? (frontH + backH)/2 : h;`;
if (!file.includes('const hP =')) {
  file = file.replace(`const rotAngle = part.rotation === 90 ? Math.PI/2 : 0;\n         const isHovered = hoveredElementId === \`part-\${part.id}\`;`, 
  `const rotAngle = part.rotation === 90 ? Math.PI/2 : 0;\n         const isHovered = hoveredElementId === \`part-\${part.id}\`;\n         const hP = isPitched && !isGable ? (frontH + backH)/2 : h;`);
}
file = file.replace(oldPartitionBody, newPartitionBody);

// Also fix the position in partition group
const oldPos = `position={[pX, (isPitched && !isGable ? (frontH + backH)/2 : h)/2, pZ]}`;
const newPos = `position={[pX, hP/2, pZ]}`;
file = file.replace(oldPos, newPos);

// 2. Add Interior Doors rendering block right after Internal Partitions
const partitionsEnd = `      })}
      
      {/* Interior warm lights */}`;

const interiorDoorsBlock = `      })}

      {/* Interior Doors */}
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
                     <DragHandle elementId={\`intdoor-\${door.id}\`} position={[0, 0, 0]} axis="x" visualAxis="x" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updateInteriorDoor(door.id, { xMm: door.xMm + dx*1000 })} />
                   </>
                 ) : (
                   <>
                     <DragHandle elementId={\`intdoor-\${door.id}\`} position={[0, -dH/2 + 0.5, -0.15]} axis="x" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updateInteriorDoor(door.id, { xMm: door.xMm + dx*1000 })} />
                     <DragHandle elementId={\`intdoor-\${door.id}\`} position={[0, 0, 0]} axis="z" visualAxis="x" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updateInteriorDoor(door.id, { zMm: door.zMm + dz*1000 })} />
                   </>
                 )}
               </>
            )}
          </group>
        );
      })}
      
      {/* Interior warm lights */}`;

if (!file.includes('Interior Doors')) {
  file = file.replace(partitionsEnd, interiorDoorsBlock);
}

fs.writeFileSync('src/components/3d/RoomGeometry.tsx', file);
console.log('room geometry updated');
