import React from 'react';
import { useMemo, useState, useRef, useEffect } from 'react';
import { Room } from '../../types';
import { useFrame } from '@react-three/fiber';
import { Geometry, Base, Subtraction, Addition } from '@react-three/csg';
import * as THREE from 'three';
import { Text, Line, Html, Edges, Billboard } from '@react-three/drei';
import { useRealMaterial } from '../../utils/materials';
import { Suspense } from 'react';
import { createWorldScaleBoxGeometry, createWorldScaleGableGeometry } from '../../utils/geometry';
import { createCladdingGeometry, createDeckingGeometry } from '../../utils/geometryUtils';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { DragHandle } from './DragHandles';

function DimText({ value, onValueChange, position, rotation, children, isDraggable, hideOnExport, hideIfZero }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(String(value));
  const { setControlsEnabled, viewMode, isExporting } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTempValue(String(value));
  }, [value]);

  if (viewMode === 'walking') return null;
  if (isExporting && hideOnExport) return null;
  if (hideIfZero && Number(value) === 0) return null;

  if (isExporting) {
    return (
      <group position={position}>
        <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
          <mesh position={[0,0,-0.01]}>
            <planeGeometry args={[0.8, 0.3]} />
            <meshBasicMaterial color="#3b4d4a" />
          </mesh>
          <Text
            color="#ffffff"
            fontSize={0.15}
            anchorX="center"
            anchorY="middle"
          >
            {String(value)}
          </Text>
        </Billboard>
      </group>
    );
  }

  return (
    <Html center position={position} transform rotation={rotation}>
      <div 
        className={`bg-[#3b4d4a] border border-[#3b4d4a] rounded-full font-mono text-[8px] tracking-wider whitespace-nowrap px-1.5 py-0.5 text-white opacity-90 shadow-md transition-all duration-200 ${onValueChange ? (isEditing ? 'cursor-auto ring-1 ring-[#2d3a38]' : 'cursor-pointer hover:bg-[#2d3a38] hover:scale-105') : 'pointer-events-none'}`}
        style={{ pointerEvents: (isEditing || onValueChange || isDraggable) ? 'auto' : 'none' }}
        onClick={(e) => {
          if (onValueChange && !isEditing) {
            e.stopPropagation();
            setIsEditing(true);
            setControlsEnabled(false);
            setTempValue(String(value));
          }
        }}
        onPointerDown={(e) => {
           if (isDraggable) e.stopPropagation();
        }}
      >
        {isEditing ? (
            <input 
              ref={inputRef}
              type="number"
              autoFocus
              className="min-w-[40px] w-auto max-w-[80px] text-center outline-none bg-transparent text-white font-bold" 
              value={tempValue} 
              onChange={e => setTempValue(e.target.value)}
              onFocus={e => e.target.select()}
              onPointerDown={e => e.stopPropagation()}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  inputRef.current?.blur();
                } else if (e.key === 'Escape') {
                  setTempValue(String(value));
                  setIsEditing(false);
                  setControlsEnabled(true);
                }
              }}
              onKeyUp={e => e.stopPropagation()}
              onBlur={(e) => {
                setIsEditing(false);
                setControlsEnabled(true);
                const nv = Number(tempValue);
                if (!isNaN(nv) && onValueChange && String(value) !== tempValue) {
                  onValueChange(nv);
                }
              }}
            />
        ) : (
          children || `${value} mm`
        )}
      </div>
    </Html>
  );
}

function AnimatedDoorLeaves({ door, frameColorHex, frameThickness, sashThickness, depth, room }: { door: any, frameColorHex: string, frameThickness: number, sashThickness: number, depth: number, room: Room }) {
  const { areDoorsOpen, toggleDoors, viewMode } = useStore();
  const leavesRef = useRef<THREE.Group[]>([]);

  useFrame((_, delta) => {
    if (!door) return;
    
    // Sliders mostly open by pushing all but one leaf to one side
    const leafW = (door.widthMm/1000 - frameThickness*1.5) / door.leaves;
    const isSingle = door.leaves === 1;

    leavesRef.current.forEach((leaf, i) => {
      if (!leaf) return;

      const targetX = areDoorsOpen && !isSingle 
        ? - (door.widthMm/1000 - frameThickness*1.5)/2 + (leafW/2) + Math.min(i, 0.5) * leafW * 0.2 // Cascade to left
        : - (door.widthMm/1000 - frameThickness*1.5)/2 + (leafW/2) + i * leafW;
      
      const targetRotY = areDoorsOpen && isSingle 
        ? Math.PI / 2 // Swing 90 deg
        : 0;

      // Animate position
      leaf.position.x = THREE.MathUtils.lerp(leaf.position.x, targetX, 5 * delta);
      // Animate rotation (important for swing)
      leaf.rotation.y = THREE.MathUtils.lerp(leaf.rotation.y, targetRotY, 5 * delta);
      
      // Pivot offset for swinging doors
      if (isSingle) {
         leaf.position.x = targetX + Math.sin(leaf.rotation.y) * leafW/2;
         leaf.position.z = Math.cos(leaf.rotation.y) * leafW/2 - leafW/2;
      }
    });
  });

  if (!door) return null;

  return (
    <>
      {Array.from({ length: door.leaves }).map((_, i) => {
        const leafW = (door.widthMm/1000 - frameThickness*1.5) / door.leaves;
        const xPos = - (door.widthMm/1000 - frameThickness*1.5)/2 + (leafW/2) + i * leafW;
        // Slightly offset alternating leaves to look like bifolds or sliders
        const zOffset = (i % 2 === 0) ? -0.01 : 0.01;
        
        return (
          <group 
            key={`leaf-${i}`} 
            position={[xPos, 0, zOffset]}
            ref={el => { if(el) leavesRef.current[i] = el; }}
          >
            {/* Leaf Frame (Sash) */}
            <mesh position={[0, (door.heightMm/1000)/2 - frameThickness - sashThickness/2, 0]}><boxGeometry args={[leafW, sashThickness, depth*0.5]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
            <mesh position={[0, -(door.heightMm/1000)/2 + frameThickness + sashThickness/2, 0]}><boxGeometry args={[leafW, sashThickness, depth*0.5]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
            <mesh position={[-leafW/2 + sashThickness/2, 0, 0]}><boxGeometry args={[sashThickness, door.heightMm/1000 - frameThickness*2, depth*0.5]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
            <mesh position={[leafW/2 - sashThickness/2, 0, 0]}><boxGeometry args={[sashThickness, door.heightMm/1000 - frameThickness*2, depth*0.5]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
            
            {/* Door Handle */}
            {room.hasDoorHandles && (
              <group position={[i === 0 ? leafW/2 - sashThickness/2 - 0.03 : -leafW/2 + sashThickness/2 + 0.03, 0, depth*0.25 + 0.005]}>
                {/* Backplate */}
                <mesh position={[0, 0, 0]}><boxGeometry args={[0.04, 0.22, 0.01]} /><meshStandardMaterial color="#333" metalness={0.8} roughness={0.2} /></mesh>
                {/* Handle lever */}
                <mesh position={[i === 0 ? -0.04 : 0.04, 0, 0.03]}><boxGeometry args={[0.12, 0.02, 0.02]} /><meshStandardMaterial color="#333" metalness={0.8} roughness={0.2} /></mesh>
              </group>
            )}

            {viewMode === 'walking' && i === door.leaves - 1 && (
               <Html position={[0, 0, depth * 0.5 + 0.1]} transform center>
                 <button 
                   onClick={(e) => { e.stopPropagation(); toggleDoors(); }}
                   className="bg-black/80 hover:bg-black text-white px-3 py-2 rounded-lg border border-white/20 text-xs font-bold transition-all shadow-xl pointer-events-auto"
                   style={{ cursor: 'pointer' }}
                 >
                   {areDoorsOpen ? "Close Door" : "Open Door"}
                 </button>
               </Html>
            )}

            {/* Glass */}
            <mesh>
              <boxGeometry args={[leafW - sashThickness*2, door.heightMm/1000 - frameThickness*2 - sashThickness*2, 0.02]} />
              <meshPhysicalMaterial color="#aabed1" transmission={0.9} ior={1.5} thickness={0.05} roughness={0.1} clearcoat={1} envMapIntensity={3} />
            </mesh>
          </group>
        )
      })}
    </>
  );
}

function useCladdingTextures(cladding: string, orientation: string | undefined, widthMm: number | undefined) {
  const baseMaps = useMemo(() => generateCladdingTextures(cladding, 1), [cladding]);
  
  const clonedMaps = useMemo(() => {
    const maps = {
        map: baseMaps.map.clone(),
        bumpMap: baseMaps.bumpMap.clone(),
        roughnessMap: baseMaps.roughnessMap.clone() 
    };

    const numBoards = 16;
    const boardW = (widthMm ?? 100) / 1000;
    const texTotalWidth = numBoards * boardW;
    
    const yRepeat = 1 / texTotalWidth; 
    const xRepeat = 1 / 4; 

    const isVert = orientation === 'vertical';
    const rotation = isVert ? Math.PI / 2 : 0;

    const configureMap = (m: THREE.Texture) => {
        m.repeat.set(xRepeat, yRepeat);
        m.center.set(0.5, 0.5);
        m.rotation = rotation;
    };

    configureMap(maps.map);
    configureMap(maps.bumpMap);
    configureMap(maps.roughnessMap);

    return maps;
  }, [baseMaps, orientation, widthMm]);
  
  
  return clonedMaps;
}

export function RoomGeometry() {
  const roomStore = useStore(s => s.scene.room);
  const viewModeStore = useStore(s => s.viewMode);
  const room = { ...roomStore, showDimensions: roomStore.showDimensions && viewModeStore !== 'render' };
  const { selectedElementId, setSelectedElementId, updateDoor, updateWindow, setControlsEnabled, viewMode, controlsEnabled } = useStore(useShallow(s => ({
    selectedElementId: s.selectedElementId,
    setSelectedElementId: s.setSelectedElementId,
    updateDoor: s.updateDoor,
    updateWindow: s.updateWindow,
    setControlsEnabled: s.setControlsEnabled,
    viewMode: s.viewMode,
    controlsEnabled: s.controlsEnabled
  })));
  const isPlanView = viewMode === 'plan';
  const isNight = false;
  const w = Math.max(0.5, room.widthMm / 1000);
  const d = Math.max(0.5, room.depthMm / 1000);
  
  const wallThickness = (room.wallThicknessMm || 150) / 1000;
  
  const isUltraSlim = room.frameStyle === 'ultra-slim';
  const isSlim = room.frameStyle === 'slim' || isUltraSlim;
  const frameThickness = isUltraSlim ? 0.015 : (room.frameStyle === 'slim' ? 0.025 : 0.04);
  const sashThickness = isUltraSlim ? 0.015 : (room.frameStyle === 'slim' ? 0.025 : 0.08);
  const frameDepth = 0.07; // 70mm deep frame, typical aluminum window


  // Canopy overhang
  const isCanopy = room.hasCanopy || room.hasPictureFrame;
  const ohFront = isCanopy ? (room.canopySizeMm ? room.canopySizeMm/1000 : 0) : 0;
  const ohBack = room.overhangBackMm ? room.overhangBackMm/1000 : 0;
  const ohLeft = room.overhangLeftMm ? room.overhangLeftMm/1000 : 0;
  const ohRight = room.overhangRightMm ? room.overhangRightMm/1000 : 0;

  const roofW = w + ohLeft + ohRight;
  const roofD = d + ohBack + ohFront;
  const roofX = (ohRight - ohLeft) / 2;
  const roofZ = (ohFront - ohBack) / 2;

  const isDecking = room.hasDecking || room.hasPictureFrame;
  let deckFront = 0;
  if (isDecking) {
    deckFront = (room.deckingSizeMm ?? 1500) / 1000;
  }

  const baseW = w + ohLeft + ohRight;
  const baseD = d + ohBack + deckFront;
  const baseX = (ohRight - ohLeft) / 2;
  const baseZ = (deckFront - ohBack) / 2;

  // LShape dimensions
  const isLShape = room.shape === 'LShape';
  const cutW = isLShape ? Math.min(((room.lShapeCutoutWidthMm ?? 2000) / 1000), w - 0.35) : 0;
  const cutD = isLShape ? Math.min(((room.lShapeCutoutDepthMm ?? 1500) / 1000), d - 0.35) : 0;


  // Heights and pitch
  const isGable = room.shape === 'Gable';
  const roofHRaw = (room.roofHeightMm ?? 200) / 1000;

  // For Gable, room.heightMm is the TOTAL height (base + wall + roof)
  // Therefore wall height = total height - base - roof
  const frontH = isGable 
    ? (room.heightMm / 1000) - baseH - roofHRaw
    : room.heightMm / 1000;

  const backH = isGable
    ? frontH
    : (room.backHeightMm ?? room.heightMm) / 1000;

  const isPitched = Math.abs(frontH - backH) > 0.001;
  const roofPitch = isPitched ? Math.atan2(backH - frontH, d) : 0;
  const maxH = Math.max(frontH, backH);
  const gablePitch = isGable ? Math.atan2(roofHRaw, w/2) : 0;

  
  const hoveredElementId = useStore((s) => s.hoveredElementId);
  const isHoveredRoom = hoveredElementId === 'room';

  // Quba mono-pitch slope
  const isQuba = room.shape === 'Quba';

  // Base h for backward compatibility in variables
  const h = maxH; 
  
  const rot = room.claddingOrientation === 'vertical' ? Math.PI / 2 : 0;
  const texFront = useRealMaterial(room.claddingFront || room.cladding || 'timber', w, frontH, rot);
  const texBack = useRealMaterial(room.claddingBack || room.cladding || 'timber', w, backH, rot);
  const texLeft = useRealMaterial(room.claddingLeft || room.cladding || 'timber', d, maxH, rot);
  const texRight = useRealMaterial(room.claddingRight || room.cladding || 'timber', d, maxH, rot);
  const texRoof = useRealMaterial(room.roofMaterial || 'epdm', roofW, roofD, 0);
  const texBase = useRealMaterial(room.baseMaterial || 'concrete', baseW, baseD, 0);
  const texDecking = useRealMaterial(room.deckingMaterial || room.cladding || 'timber', baseW, deckFront, 0);
  const texFloor = useRealMaterial(room.interiorFloorType || 'oak', w, d, 0);

  const isVert = room.claddingOrientation === 'vertical';
  const geomFrontWall = useMemo(() => createCladdingGeometry(w, frontH, isVert), [w, frontH, isVert]);
  const geomBackWall = useMemo(() => createCladdingGeometry(w, backH, isVert), [w, backH, isVert]);
  const geomLeftWall = useMemo(() => createCladdingGeometry(d, maxH, isVert), [d, maxH, isVert]);
  const geomRightWall = useMemo(() => createCladdingGeometry(d, maxH, isVert), [d, maxH, isVert]);
  const geomDecking = useMemo(() => createDeckingGeometry(baseW, deckFront), [baseW, deckFront]);



  const isDeckingMaterial = room.hasDecking || room.hasPictureFrame || room.baseMaterial === 'timber_decking' || room.baseMaterial === 'composite_decking';
  const deckingTexture = useCladdingTextures(room.deckingMaterial || room.cladding || 'timber', 'horizontal', 150);

  const baseMaterialColors: Record<string, string> = { concrete: '#8a8d8f', timber_decking: '#a3794a', composite_decking: '#545a5e' };
  const roofMaterialColors: Record<string, string> = { epdm: '#222222', sedum: '#2d3032', upvc: '#d3d5d7', metal: '#6a6d70' };
  const frameColors: Record<string, string> = { anthracite: '#2d3032', black: '#1a1a1a', white: '#f0f0f0', silver: '#a0a4a8' };
  
  const baseColorHex = baseMaterialColors[room.baseMaterial as string] || '#8a8d8f';
  const roofColorHex = roofMaterialColors[room.roofMaterial as string] || '#222222';
  const frameColorHex = frameColors[room.frameColor] || frameColors.anthracite;

  const baseH = (room.baseHeightMm ?? 100) / 1000;
  const roofH = (room.roofHeightMm ?? 200) / 1000;

  const cutBoxSize = 50;
  // LShape
  const cutBoxPosX = (w/2 - cutW + ohRight) - roofX + cutBoxSize/2;
  const cutBoxPosZ = (d/2 - cutD + ohFront) - roofZ + cutBoxSize/2;
  const baseCutBoxPosX = (w/2 - cutW + ohRight) - baseX + cutBoxSize/2;
  const baseCutBoxPosZ = (d/2 - cutD + deckFront) - baseZ + cutBoxSize/2;

  // TShape
  const tCutBoxPosXRight = (w/2 - tCutW + ohRight) - roofX + cutBoxSize/2;
  const tCutBoxPosXLeft = (-w/2 + tCutW - ohLeft) - roofX - cutBoxSize/2;
  const tCutBoxPosZ = (d/2 - tCutD + ohFront) - roofZ + cutBoxSize/2;
  const baseTCutBoxPosXRight = (w/2 - tCutW + ohRight) - baseX + cutBoxSize/2;
  const baseTCutBoxPosXLeft = (-w/2 + tCutW - ohLeft) - baseX - cutBoxSize/2;
  const baseTCutBoxPosZ = (d/2 - tCutD + deckFront) - baseZ + cutBoxSize/2;

  // CornerCut
  const cornerCutBoxPosX = w/2 - roofX;
  const cornerCutBoxPosZ = d/2 - roofZ;
  const baseCornerCutBoxPosX = w/2 - baseX;
  const baseCornerCutBoxPosZ = d/2 - baseZ;

  const floorBaseGeom = useMemo(() => createWorldScaleBoxGeometry(baseW, baseH, baseD, false, 0, 0, 0), [baseW, baseH, baseD]);
  const lShapeBaseCutGeom = useMemo(() => createWorldScaleBoxGeometry(cutBoxSize, baseH + 1, cutBoxSize, false, 0, 0, 0), [cutBoxSize, baseH]);
  
  const pfHeight = isGable ? h+roofH : h+0.05;
  const pfLeftGeom = useMemo(() => createWorldScaleBoxGeometry(wallThickness + 0.002, pfHeight + 0.002, ohFront + 0.01, false, -w/2 + wallThickness/2, 0, d/2 + ohFront/2 - 0.005), [wallThickness, pfHeight, ohFront, w, d]);
  const pfRightGeom = useMemo(() => createWorldScaleBoxGeometry(wallThickness + 0.002, pfHeight + 0.002, ohFront + 0.01, false, w/2 - wallThickness/2, 0, d/2 + ohFront/2 - 0.005), [wallThickness, pfHeight, ohFront, w, d]);
  const pfTopGeom = useMemo(() => createWorldScaleBoxGeometry(w + 0.002, 0.3 + 0.002, ohFront + 0.01, false, 0, pfHeight - 0.3, d/2 + ohFront/2 - 0.005), [w, ohFront, pfHeight, d]);

  const claddingBoxGeom = useMemo(() => createWorldScaleBoxGeometry(w, h + 0.05, d, true, 0, 0, 0), [w, h, d]);
  const gableTriangleGeom = useMemo(() => createWorldScaleGableGeometry(w, roofH, wallThickness, 0, h + 0.05, 0), [w, roofH, wallThickness, h]);
  const lShapeCutOuterGeom = useMemo(() => createWorldScaleBoxGeometry(cutW + 0.2, h + 1, cutD + 0.2, false, 0, 0, 0), [cutW, cutD, h, roofH, isGable]);
  const roofFlatGeom = useMemo(() => createWorldScaleBoxGeometry(roofW + 0.2, roofH, roofD + 0.2, false, 0, 0, 0), [roofW, roofH, roofD]);
  const roofGableLeftGeom = useMemo(() => createWorldScaleBoxGeometry((w/2 + ohLeft) / Math.cos(gablePitch), 0.1, roofD + 0.2, false, 0, 0, 0), [w, ohLeft, gablePitch, roofD]);
  const roofGableRightGeom = useMemo(() => createWorldScaleBoxGeometry((w/2 + ohRight) / Math.cos(gablePitch), 0.1, roofD + 0.2, false, 0, 0, 0), [w, ohRight, gablePitch, roofD]);


  const renderBaseMeshes = () => {
    const materialProps = isDeckingMaterial ? {
      color: "#ffffff",
      map: texDecking.map,
      roughnessMap: texDecking.roughnessMap,
      normalMap: texDecking.normalMap, aoMap: texDecking.aoMap,
      
    } : {
      color: baseColorHex,
      roughness: 0.9,
      metalness: 0.1,
      bumpMap: noiseMap,
      
    };

    const pointerEvents = {
      onPointerOver: (e: any) => { e.stopPropagation(); useStore.getState().setHoveredElementId('room'); },
      onPointerOut: () => useStore.getState().setHoveredElementId(null)
    };

    if (isLShape) {
      const leftW = baseW - cutW;
      const leftD = baseD;
      const leftX = baseX - baseW/2 + leftW/2;
      const leftZ = baseZ;

      const rightW = cutW;
      const rightD = baseD - cutD;
      const rightX = baseX + baseW/2 - rightW/2;
      const rightZ = baseZ + baseD/2 - rightD/2;

      return (
        <group {...pointerEvents}>
          <mesh position={[leftX, baseH/2, leftZ]} receiveShadow>
            <primitive object={createWorldScaleBoxGeometry(leftW, baseH, leftD, false, leftX, 0, leftZ)} attach="geometry" />
            <meshStandardMaterial key={`${room.deckingMaterial || room.cladding || 'default'}-${room.baseMaterial}-${isDeckingMaterial}`} attach="material" {...materialProps} />
          </mesh>
          <mesh position={[rightX, baseH/2, rightZ]} receiveShadow>
            <primitive object={createWorldScaleBoxGeometry(rightW, baseH, rightD, false, rightX, 0, rightZ)} attach="geometry" />
            <meshStandardMaterial key={`${room.deckingMaterial || room.cladding || 'default'}-${room.baseMaterial}-${isDeckingMaterial}`} attach="material" {...materialProps} />
          </mesh>
        </group>
      );
    }

    if (isTShape) {
      const frontW = baseW;
      const frontD = baseD - tCutD;
      const frontX = baseX;
      const frontZ = baseZ + baseD/2 - frontD/2;

      const backW = baseW - 2 * tCutW;
      const backD = tCutD;
      const backX = baseX;
      const backZ = baseZ - baseD/2 + backD/2;

      return (
        <group {...pointerEvents}>
          <mesh position={[frontX, baseH/2, frontZ]} receiveShadow>
            <primitive object={createWorldScaleBoxGeometry(frontW, baseH, frontD, false, frontX, 0, frontZ)} attach="geometry" />
            <meshStandardMaterial key={`${room.deckingMaterial || room.cladding || 'default'}-${room.baseMaterial}-${isDeckingMaterial}`} attach="material" {...materialProps} />
          </mesh>
          <mesh position={[backX, baseH/2, backZ]} receiveShadow>
            <primitive object={createWorldScaleBoxGeometry(backW, baseH, backD, false, backX, 0, backZ)} attach="geometry" />
            <meshStandardMaterial key={`${room.deckingMaterial || room.cladding || 'default'}-${room.baseMaterial}-${isDeckingMaterial}`} attach="material" {...materialProps} />
          </mesh>
        </group>
      );
    }

    // Corner cut is complex to do without CSG, so we just use a single box for now
    // which might slightly overlap the cut, but preserves the texture.
    return (
      <mesh 
        position={[baseX, baseH/2, baseZ]} 
        receiveShadow
        {...pointerEvents}
      >
        <primitive object={createWorldScaleBoxGeometry(baseW, baseH, baseD, false, 0, 0, 0)} attach="geometry" />
        <meshStandardMaterial key={`${room.deckingMaterial || room.cladding || 'default'}-${room.baseMaterial}-${isDeckingMaterial}`} attach="material" {...materialProps} />
      </mesh>
    );
  };

  return (
    <group position={[room.x / 1000, 0, room.z / 1000]} rotation={[0, room.rot, 0]}>
      {/* Interior light to prevent partitions from being too dark */}
      <pointLight position={[0, h - 0.5, 0]} intensity={1.5} distance={15} decay={2} castShadow={false} />

      {/* Base Plinth / Decking Area */}
      {renderBaseMeshes()}

      {/* Main Elevated Structure */}
      <group position={[0, baseH, 0]}>
        {/* Main Structure via CSG */}
        <mesh 
          castShadow 
          receiveShadow
          onPointerOver={(e) => { e.stopPropagation(); useStore.getState().setHoveredElementId('room'); }}
          onPointerOut={() => useStore.getState().setHoveredElementId(null)}
        >
          <Geometry useGroups>
            {/* Main block */}
            <Base position={[0, (h + 0.05)/2, 0]}>
              <primitive object={claddingBoxGeom} attach="geometry" />
              <meshStandardMaterial key="mat-0" attach="material-0" color="#ffffff" {...texRight}  metalness={propsRight.metalness}  bumpScale={0.1} />
              <meshStandardMaterial key="mat-1" attach="material-1" color="#ffffff" {...texLeft}  metalness={propsLeft.metalness}  bumpScale={0.1} />
              <meshStandardMaterial key="mat-2" attach="material-2" color="#ffffff" {...texFront}  metalness={propsFront.metalness}  bumpScale={0.1} />
              <meshStandardMaterial key="mat-3" attach="material-3" color="#ffffff" {...texFront}  metalness={propsFront.metalness}  bumpScale={0.1} />
              <meshStandardMaterial attach="material-4" color="#ffffff" {...texFront}  metalness={propsFront.metalness}  bumpScale={0.1} />
              <meshStandardMaterial attach="material-5" color="#ffffff" {...texBack}  metalness={propsBack.metalness}  bumpScale={0.1} />
            </Base>

            {room.hasPictureFrame && (
              <>
                <Addition position={[-w/2 + wallThickness/2, isGable ? (h+roofH)/2 : (h+0.05)/2, d/2 + ohFront/2 - 0.005]}>
                  <primitive object={pfLeftGeom} attach="geometry" />
                  <meshStandardMaterial color="#ffffff" {...texFront}  metalness={propsFront.metalness}  bumpScale={0.1} />
                </Addition>
                <Addition position={[w/2 - wallThickness/2, isGable ? (h+roofH)/2 : (h+0.05)/2, d/2 + ohFront/2 - 0.005]}>
                  <primitive object={pfRightGeom} attach="geometry" />
                  <meshStandardMaterial color="#ffffff" {...texFront}  metalness={propsFront.metalness}  bumpScale={0.1} />
                </Addition>
                <Addition position={[0, pfHeight - 0.15, d/2 + ohFront/2 - 0.005]}>
                  <primitive object={pfTopGeom} attach="geometry" />
                  <meshStandardMaterial color="#ffffff" {...texFront}  metalness={propsFront.metalness}  bumpScale={0.1} />
                </Addition>
              </>
            )}

            {/* LShape Outer Cutout */}
            {isLShape && (
              <Subtraction position={[w/2 - cutW/2 + 0.1, h/2, d/2 - cutD/2 + 0.1]}>
                <primitive object={lShapeCutOuterGeom} attach="geometry" />
                <meshStandardMaterial 
                  color="#ffffff"
                  {...texFront}
                   
                  metalness={claddingProps.metalness} 
                   
                  bumpScale={0.1} 
                />
              </Subtraction>
            )}

            {/* TShape Outer Cutout */}
            

            {/* CornerCut Outer Cutout */}
            

            {/* Gable Roof Cuts */}
            {/* gable subtractions removed temporarily */}
          
            {isGable && (

          
              <>

          
                <Addition position={[0, h + 0.025, d/2 - wallThickness/2]}>

          
                  <primitive object={gableTriangleGeom} attach="geometry" />

          
                  <meshStandardMaterial color="#ffffff" {...texFront}  metalness={propsFront.metalness}  bumpScale={0.1} />

          
                </Addition>

          
                <Addition position={[0, h + 0.025, -d/2 + wallThickness/2]}>

          
                  <primitive object={gableTriangleGeom} attach="geometry" />

          
                  <meshStandardMaterial color="#ffffff" {...texBack}  metalness={propsBack.metalness}  bumpScale={0.1} />

          
                </Addition>

          
              </>

          
            )}

          
            {/* Main Interior Cutout (split into non-overlapping boxes to avoid nested Geometry issues) */}
            {(!isLShape && !isTShape && !isCornerCut) && (
              <Subtraction position={[0, h/2, 0]}>
                <boxGeometry args={[w - wallThickness*2, h + 0.1, d - wallThickness*2]} />
                <meshStandardMaterial color={room.interiorColor || '#ffffff'} roughness={0.9} />
              </Subtraction>
            )}

            {isLShape && (
              <>
                {/* Left part of the L */}
                <Subtraction position={[-cutW/2, h/2, 0]}>
                  <boxGeometry args={[w - cutW - wallThickness*2, h + 0.1, d - wallThickness*2]} />
                  <meshStandardMaterial color={room.interiorColor || '#ffffff'} roughness={0.9} />
                </Subtraction>
                {/* Back-right part of the L */}
                <Subtraction position={[w/2 - cutW/2 - wallThickness, h/2, -cutD/2]}>
                  <boxGeometry args={[cutW + wallThickness*2, h + 0.1, d - cutD - wallThickness*2]} />
                  <meshStandardMaterial color={room.interiorColor || '#ffffff'} roughness={0.9} />
                </Subtraction>
              </>
            )}

            

            

            {/* Top Cutout for flat roofs to enforce wall top color */}
            {!isPitched && !isGable && (
              <Subtraction position={[0, h + 0.025, 0]}>
                 <boxGeometry args={[w + 1, 0.05 + 0.001, d + 1]} />
                 <meshStandardMaterial color={room.interiorColor || '#ffffff'} roughness={0.9} />
              </Subtraction>
            )}

            {/* Doors Cutouts */}
            {(room.doors || []).map(door => {
              const doorW = door.widthMm / 1000;
              const doorH = door.heightMm / 1000;
              const offset = door.offsetMm / 1000;
              
              let pos: [number, number, number] = [0, doorH/2 - 0.05, 0];
              let size: [number, number, number] = [doorW, doorH + 0.1, wallThickness * 3];

              if (door.wall === 'front') {
                pos = [offset, doorH/2 - 0.05, d/2];
              } else if (door.wall === 'back') {
                pos = [offset, doorH/2 - 0.05, -d/2];
              } else if (door.wall === 'left') {
                pos = [-w/2, doorH/2 - 0.05, offset];
                size = [wallThickness * 3, doorH + 0.1, doorW];
              } else { // right
                pos = [w/2, doorH/2 - 0.05, offset];
                size = [wallThickness * 3, doorH + 0.1, doorW];
              }

              return (
                <Subtraction key={door.id} position={pos}>
                  <boxGeometry args={size} />
                  <meshStandardMaterial color={room.interiorColor || '#ffffff'} roughness={0.9} />
                </Subtraction>
              );
            })}

            {/* Slope Cutout (Top) to slice walls at an angle */}
            {isPitched && (
              <Subtraction 
                position={[
                  0, 
                  (frontH + backH) / 2 + 2 * Math.cos(roofPitch) - 0.001, 
                  2 * Math.sin(roofPitch)
                ]} 
                rotation={[roofPitch, 0, 0]}
              >
                 <boxGeometry args={[w + 1, 4, d + 2]} />
                 <meshStandardMaterial color={room.interiorColor || '#ffffff'} roughness={0.9} />
              </Subtraction>
            )}

            {/* Window Cutouts */}
            {room.windows.map(win => {
              const winW = win.widthMm / 1000;
              const winH = win.heightMm / 1000;
              const sill = (win.sillMm ?? 0) / 1000;
              const offset = (win.offsetMm ?? 0) / 1000;
              
              let pos: [number, number, number] = [0, sill + winH/2, 0];
              let size: [number, number, number] = [winW, winH, wallThickness * 3];

              // Windows mapping
              if (win.wall === 'front') {
                pos = [offset, sill + winH/2, d/2];
                size = [winW, winH, wallThickness * 3];
              } else if (win.wall === 'back') {
                pos = [offset, sill + winH/2, -d/2];
                size = [winW, winH, wallThickness * 3];
              } else if (win.wall === 'left') {
                pos = [-w/2, sill + winH/2, offset];
                size = [wallThickness * 3, winH, winW];
              } else { // right
                pos = [w/2, sill + winH/2, offset];
                size = [wallThickness * 3, winH, winW];
              }

              return (
                <Subtraction key={`cut-${win.id}`} position={pos}>
                  <boxGeometry args={size} />
                  <meshStandardMaterial color={room.interiorColor || '#ffffff'} roughness={0.9} />
                </Subtraction>
              );
            })}
          </Geometry>
        </mesh>

        {/* Internal Floor */}
        <mesh position={[0, 0.005, 0]} receiveShadow>
          <meshStandardMaterial {...texFloor}  bumpScale={0.05} roughness={0.7} />
          <Geometry>
             <Base>
               <boxGeometry args={[w - wallThickness*2, 0.01, d - wallThickness*2]} />
             </Base>
             {isLShape && (
                <Subtraction position={[w/2 - cutW/2 + 0.1, 0, d/2 - cutD/2 + 0.1]}>
                  <boxGeometry args={[cutW + 0.2, 0.02, cutD + 0.2]} />
                </Subtraction>
             )}
             
             
          </Geometry>
        </mesh>

        {/* Internal Ceiling */}
        {!isPlanView && isGable && (
          <group position={[roofX, h, roofZ]}>
            {/* Left Roof Plane */}
            <mesh position={[-w/4 - ohLeft/2, roofH/2 - ohLeft * Math.tan(gablePitch)/2, 0]} rotation={[0, 0, gablePitch]} castShadow receiveShadow>
               <primitive object={roofGableLeftGeom} attach="geometry" />

               {(() => {
                const getFasciaMat = (side) => {
                  const matKey = 'fascia-left-' + side + '-' + room.fasciaMaterial + '-' + room.cladding + '-' + room.claddingOrientation;
                  if (room.fasciaMaterial === 'match_cladding') {
                    const tex = side === 'front' ? texFront : side === 'back' ? texBack : side === 'left' ? texLeft : texRight;
                    const props = side === 'front' ? propsFront : side === 'back' ? propsBack : side === 'left' ? propsLeft : propsRight;
                    return <meshStandardMaterial key={matKey} color="#ffffff" map={tex.map}  metalness={props.metalness}  bumpScale={0.1} />;
                  } else if (room.fasciaMaterial === 'white') {
                    return <meshStandardMaterial key={matKey} color="#ffffff" roughness={0.6} metalness={0.1} />;
                  } else if (room.fasciaMaterial === 'grey') {
                    return <meshStandardMaterial key={matKey} color="#6a6d70" roughness={0.6} metalness={0.2} />;
                  } else if (room.fasciaMaterial === 'black') {
                    return <meshStandardMaterial key={matKey} color="#1a1a1a" roughness={0.6} metalness={0.2} />;
                  } else {
                    return <meshStandardMaterial key={matKey} color="#2d3032" roughness={0.6} metalness={0.2} />; // anthracite default
                  }
                };
                return [
                  <meshStandardMaterial key="mat-0" attach="material-0" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Right
                  <meshStandardMaterial key="mat-1" attach="material-1" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Left
                  <meshStandardMaterial key="mat-2" attach="material-2" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Top
                  <meshStandardMaterial key="mat-3" attach="material-3" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Bottom
                  React.cloneElement(getFasciaMat('front'), { key: 'mat-4', attach: 'material-4' }), // Front fascia
                  React.cloneElement(getFasciaMat('back'), { key: 'mat-5', attach: 'material-5' }), // Back fascia
                ];
              })()}

            </mesh>
            {/* Right Roof Plane */}
            <mesh position={[w/4 + ohRight/2, roofH/2 - ohRight * Math.tan(gablePitch)/2, 0]} rotation={[0, 0, -gablePitch]} castShadow receiveShadow>
               <primitive object={roofGableRightGeom} attach="geometry" />
               
               {(() => {
                const getFasciaMat = (side) => {
                  const matKey = 'fascia-right-' + side + '-' + room.fasciaMaterial + '-' + room.cladding + '-' + room.claddingOrientation;
                  if (room.fasciaMaterial === 'match_cladding') {
                    const tex = side === 'front' ? texFront : side === 'back' ? texBack : side === 'left' ? texLeft : texRight;
                    const props = side === 'front' ? propsFront : side === 'back' ? propsBack : side === 'left' ? propsLeft : propsRight;
                    return <meshStandardMaterial key={matKey} color="#ffffff" map={tex.map}  metalness={props.metalness}  bumpScale={0.1} />;
                  } else if (room.fasciaMaterial === 'white') {
                    return <meshStandardMaterial key={matKey} color="#ffffff" roughness={0.6} metalness={0.1} />;
                  } else if (room.fasciaMaterial === 'grey') {
                    return <meshStandardMaterial key={matKey} color="#6a6d70" roughness={0.6} metalness={0.2} />;
                  } else if (room.fasciaMaterial === 'black') {
                    return <meshStandardMaterial key={matKey} color="#1a1a1a" roughness={0.6} metalness={0.2} />;
                  } else {
                    return <meshStandardMaterial key={matKey} color="#2d3032" roughness={0.6} metalness={0.2} />; // anthracite default
                  }
                };
                return [
                  <meshStandardMaterial key="mat-0" attach="material-0" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Right
                  <meshStandardMaterial key="mat-1" attach="material-1" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Left
                  <meshStandardMaterial key="mat-2" attach="material-2" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Top
                  <meshStandardMaterial key="mat-3" attach="material-3" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Bottom
                  React.cloneElement(getFasciaMat('front'), { key: 'mat-4', attach: 'material-4' }), // Front fascia
                  React.cloneElement(getFasciaMat('back'), { key: 'mat-5', attach: 'material-5' }), // Back fascia
                ];
              })()}

            </mesh>
            {room.roofMaterial === 'sedum' && (
              <>
                <mesh position={[-w/4 - ohLeft/2 - 0.06 * Math.sin(gablePitch), roofH/2 - ohLeft * Math.tan(gablePitch)/2 + 0.06 * Math.cos(gablePitch), 0]} rotation={[0, 0, gablePitch]} castShadow receiveShadow>
                   <boxGeometry args={[(w/2 + ohLeft) / Math.cos(gablePitch), 0.02, roofD + 0.18]} />
                   <meshStandardMaterial color="#ffffff" {...texRoof}  bumpScale={0.1} roughness={0.9} />
                </mesh>
                <mesh position={[w/4 + ohRight/2 + 0.06 * Math.sin(gablePitch), roofH/2 - ohRight * Math.tan(gablePitch)/2 + 0.06 * Math.cos(gablePitch), 0]} rotation={[0, 0, -gablePitch]} castShadow receiveShadow>
                   <boxGeometry args={[(w/2 + ohRight) / Math.cos(gablePitch), 0.02, roofD + 0.18]} />
                   <meshStandardMaterial color="#ffffff" {...texRoof}  bumpScale={0.1} roughness={0.9} />
                </mesh>
              </>
            )}
          </group>
        )}
        {!isPlanView && !isGable && (
          <mesh position={[0, (isPitched && !isGable ? (frontH + backH)/2 : h) - 0.005, 0]} rotation={[isPitched && !isGable ? roofPitch : 0, 0, 0]} receiveShadow>
            <meshStandardMaterial color={room.interiorColor || '#ffffff'} roughness={0.9} />
            <Geometry>
               <Base>
                 <boxGeometry args={[w - wallThickness*2, 0.01, isPitched && !isGable ? Math.sqrt((frontH-backH)**2 + d**2) - wallThickness*2 : d - wallThickness*2]} />
               </Base>
               {isLShape && (
                  <Subtraction position={[w/2 - cutW/2 + 0.1, 0, d/2 - cutD/2 + 0.1]}>
                    <boxGeometry args={[cutW + 0.2, 0.02, cutD + 0.2]} />
                  </Subtraction>
               )}
            </Geometry>
          </mesh>
        )}

        {/* Roof Fascia & EPDM flat roof */}
        {!isPlanView && (
          <group 
            position={[roofX, isGable ? h + roofH/2 : (frontH + backH)/2 + roofH/2, roofZ]} 
            rotation={[isPitched && !isGable ? roofPitch : 0, 0, 0]}
          >
            <mesh castShadow receiveShadow position={[0, 0, 0]}>
              
              {(() => {
                const getFasciaMat = (side) => {
                  const matKey = 'fascia-flat-' + side + '-' + room.fasciaMaterial + '-' + room.cladding + '-' + room.claddingOrientation;
                  if (room.fasciaMaterial === 'match_cladding') {
                    const tex = side === 'front' ? texFront : side === 'back' ? texBack : side === 'left' ? texLeft : texRight;
                    const props = side === 'front' ? propsFront : side === 'back' ? propsBack : side === 'left' ? propsLeft : propsRight;
                    return <meshStandardMaterial key={matKey} color="#ffffff" map={tex.map}  metalness={props.metalness}  bumpScale={0.1} />;
                  } else if (room.fasciaMaterial === 'white') {
                    return <meshStandardMaterial key={matKey} color="#ffffff" roughness={0.6} metalness={0.1} />;
                  } else if (room.fasciaMaterial === 'grey') {
                    return <meshStandardMaterial key={matKey} color="#6a6d70" roughness={0.6} metalness={0.2} />;
                  } else if (room.fasciaMaterial === 'black') {
                    return <meshStandardMaterial key={matKey} color="#1a1a1a" roughness={0.6} metalness={0.2} />;
                  } else {
                    return <meshStandardMaterial key={matKey} color="#2d3032" roughness={0.6} metalness={0.2} />; // anthracite default
                  }
                };
                return [
                  React.cloneElement(getFasciaMat('right'), { key: 'mat-0', attach: 'material-0' }),
                  React.cloneElement(getFasciaMat('left'), { key: 'mat-1', attach: 'material-1' }),
                  <meshStandardMaterial key="mat-2" attach="material-2" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Top
                  <meshStandardMaterial key="mat-3" attach="material-3" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Bottom
                  React.cloneElement(getFasciaMat('front'), { key: 'mat-4', attach: 'material-4' }),
                  React.cloneElement(getFasciaMat('back'), { key: 'mat-5', attach: 'material-5' }),
                ];
              })()}
              <Geometry>
                <Base>
                  {room.fasciaMaterial === 'match_cladding' ? <primitive object={roofFlatGeom} attach="geometry" /> : <boxGeometry args={[roofW + 0.2, roofH, roofD + 0.2]} />}
                </Base>
                {isLShape && (
                  <Subtraction position={[cutBoxPosX, 0, cutBoxPosZ]}>
                    <boxGeometry args={[cutBoxSize, roofH + 0.5, cutBoxSize]} />
                  </Subtraction>
                )}
                
                
                {isGable && (
                  <>
                    <Subtraction position={[-w/4 - roofX - Math.sin(gablePitch)*(w)/2, Math.cos(gablePitch)*(w)/2, -roofZ]} rotation={[0, 0, gablePitch]}><boxGeometry args={[w*2, w, roofD + 2]} />
                    </Subtraction>
                    <Subtraction position={[w/4 - roofX + Math.sin(gablePitch)*(w)/2, Math.cos(gablePitch)*(w)/2, -roofZ]} rotation={[0, 0, -gablePitch]}><boxGeometry args={[w*2, w, roofD + 2]} />
                    </Subtraction>
                  </>
                )}
                {(room.skylights || []).map(sky => (
                  <Subtraction key={sky.id} position={[sky.offsetX/1000 - roofX, 0, sky.offsetZ/1000 - roofZ]}>
                    <boxGeometry args={[sky.widthMm/1000, roofH + 0.5, sky.lengthMm/1000]} />
                  </Subtraction>
                ))}
              </Geometry>
            </mesh>
          {/* Metal Flashing Trim */}
          <mesh position={[0, roofH/2 + 0.01, 0]}>
            <meshStandardMaterial color="#444" metalness={0.8} roughness={0.2} />
            <Geometry>
              <Base>
                <boxGeometry args={[roofW + 0.22, 0.02, roofD + 0.22]} />
              </Base>
              {isLShape && (
                <Subtraction position={[cutBoxPosX, 0, cutBoxPosZ]}>
                  <boxGeometry args={[cutBoxSize, 0.5, cutBoxSize]} />
                </Subtraction>
              )}
              
              
              {isGable && (
                  <>
                    <Subtraction position={[-w/4 - roofX - Math.sin(gablePitch)*(w)/2, -roofH/2 + Math.cos(gablePitch)*(w)/2, -roofZ]} rotation={[0, 0, gablePitch]}><boxGeometry args={[w*2, w, roofD + 2]} />
                </Subtraction>
                    <Subtraction position={[w/4 - roofX + Math.sin(gablePitch)*(w)/2, -roofH/2 + Math.cos(gablePitch)*(w)/2, -roofZ]} rotation={[0, 0, -gablePitch]}><boxGeometry args={[w*2, w, roofD + 2]} />
                </Subtraction>
                  </>
                )}
                {(room.skylights || []).map(sky => (
                  <Subtraction key={sky.id} position={[sky.offsetX/1000 - roofX, 0, sky.offsetZ/1000 - roofZ]}>
                    <boxGeometry args={[sky.widthMm/1000, 0.5, sky.lengthMm/1000]} />
                  </Subtraction>
                ))}
            </Geometry>
          </mesh>
          {room.roofMaterial === 'sedum' && (
            <mesh position={[0, roofH/2 + 0.02, 0]} receiveShadow>
              <meshStandardMaterial color="#ffffff" {...texRoof}  bumpScale={0.1} roughness={0.9} />
              <Geometry>
                <Base>
                  <boxGeometry args={[roofW + 0.18, 0.02, roofD + 0.18]} />
                </Base>
                {isLShape && (
                  <Subtraction position={[cutBoxPosX, 0, cutBoxPosZ]}>
                    <boxGeometry args={[cutBoxSize, 0.5, cutBoxSize]} />
                  </Subtraction>
                )}
                
                
                {isGable && (
                  <>
                    <Subtraction position={[-w/4 - roofX - Math.sin(gablePitch)*(w)/2, -roofH/2 + Math.cos(gablePitch)*(w)/2, -roofZ]} rotation={[0, 0, gablePitch]}><boxGeometry args={[w*2, w, roofD + 2]} />
                </Subtraction>
                    <Subtraction position={[w/4 - roofX + Math.sin(gablePitch)*(w)/2, -roofH/2 + Math.cos(gablePitch)*(w)/2, -roofZ]} rotation={[0, 0, -gablePitch]}><boxGeometry args={[w*2, w, roofD + 2]} />
                </Subtraction>
                  </>
                )}
                {(room.skylights || []).map(sky => (
                  <Subtraction key={sky.id} position={[sky.offsetX/1000 - roofX, 0, sky.offsetZ/1000 - roofZ]}>
                    <boxGeometry args={[sky.widthMm/1000, 0.5, sky.lengthMm/1000]} />
                  </Subtraction>
                ))}
              </Geometry>
            </mesh>
          )}
        </group>
        )}

      {/* Interior warm lights */}
      <pointLight position={[0, h - 0.5, 0]} intensity={3} color="#ffe5b4" distance={10} shadow-mapSize={[1024, 1024]} castShadow />

      {/* Render Door frames and glass */}
      {(room.doors || []).map((door) => {
        const doorH = door.heightMm / 1000;
        const offset = door.offsetMm / 1000;
        const frameZ = d/2 - frameDepth/2; 
        const frameX = w/2 - frameDepth/2;
        let pos: [number, number, number] = [offset, doorH/2, frameZ];
        let rot: [number, number, number] = [0, 0, 0];
        const isDraggingThis = selectedElementId === door.id && !controlsEnabled;
        const dragZOffset = isDraggingThis ? 0.015 : 0;

        if (door.wall === 'front') { pos = [offset, doorH/2, frameZ + dragZOffset]; } 
        else if (door.wall === 'back') { pos = [offset, doorH/2, -frameZ - dragZOffset]; rot = [0, Math.PI, 0]; } 
        else if (door.wall === 'left') { pos = [-frameX - dragZOffset, doorH/2, offset]; rot = [0, -Math.PI/2, 0]; } 
        else { pos = [frameX + dragZOffset, doorH/2, offset]; rot = [0, Math.PI/2, 0]; }

        return (
        <group 
          key={door.id}
          position={pos}
          rotation={rot}
          onClick={(e) => { 
            e.stopPropagation(); 
            if (viewMode !== 'walking') setSelectedElementId(door.id); 
          }}
        >
          {isDraggingThis && (
            <mesh position={[0, 0, frameDepth/2 - 0.005]}>
              <planeGeometry args={[door.widthMm/1000, doorH]} />
              <meshBasicMaterial color="#111111" />
            </mesh>
          )}
          {selectedElementId === door.id && (
            <>
              <mesh position={[0, 0, 0]}>
                <boxGeometry args={[door.widthMm/1000 + 0.1, door.heightMm/1000 + 0.1, 0.2]} />
                <meshBasicMaterial color="#5A5A40" opacity={0.3} transparent wireframe />
              </mesh>
              <DragHandle
                elementId={door.id}
                position={[0, 0, 0.15]}
                axis="x"
                color="#00ff00"
                onChange={(dx) => {
                  useStore.getState().updateDoor(door.id, { offsetMm: door.offsetMm + dx * 1000 });
                }}
              />
              <DragHandle
                elementId={door.id}
                position={[-door.widthMm/2000, 0, 0.15]}
                axis="x"
                color="#ff0000"
                snapInterval={0.05}
                onChange={(dx) => {
                  const store = useStore.getState();
                  const targetDoor = store.scene.room.doors?.find(d => d.id === door.id);
                  if (targetDoor) {
                    store.updateDoor(door.id, { widthMm: Math.max(10, targetDoor.widthMm - dx * 2000) });
                  }
                }}
              />
              <DragHandle
                elementId={door.id}
                position={[door.widthMm/2000, 0, 0.15]}
                axis="x"
                color="#ff0000"
                snapInterval={0.05}
                onChange={(dx) => {
                  const store = useStore.getState();
                  const targetDoor = store.scene.room.doors?.find(d => d.id === door.id);
                  if (targetDoor) {
                    store.updateDoor(door.id, { widthMm: Math.max(10, targetDoor.widthMm + dx * 2000) });
                  }
                }}
              />
              <DimText 
                position={[0, door.heightMm/2000 + 0.2, 0.1]}
                rotation={[0, 0, 0]}
                value={Math.round(door.widthMm)}
                onValueChange={(val: number) => {
                  useStore.getState().updateDoor(door.id, { widthMm: Math.max(10, val) });
                }}
              />
            </>
          )}
          {/* Main frame border */}
          <group>
             <mesh position={[0, -door.heightMm/2000 + frameThickness/2, 0]} castShadow><boxGeometry args={[door.widthMm/1000 - frameThickness*2, frameThickness, frameDepth]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
             <mesh position={[0, door.heightMm/2000 - frameThickness/2, 0]} castShadow><boxGeometry args={[door.widthMm/1000 - frameThickness*2, frameThickness, frameDepth]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
             <mesh position={[-door.widthMm/2000 + frameThickness/2, 0, 0]} castShadow><boxGeometry args={[frameThickness, door.heightMm/1000, frameDepth]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
             <mesh position={[door.widthMm/2000 - frameThickness/2, 0, 0]} castShadow><boxGeometry args={[frameThickness, door.heightMm/1000, frameDepth]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
          </group>
          {/* Leaves */}
          <AnimatedDoorLeaves door={door} room={room} frameColorHex={frameColorHex} frameThickness={frameThickness} sashThickness={sashThickness} depth={frameDepth} />
        </group>
      )})}


      {/* Render Windows frames and glass */}
      {room.windows.map(win => {
        const winW = win.widthMm / 1000;
        const winH = win.heightMm / 1000;
        const sill = (win.sillMm ?? 0) / 1000;
        const offset = (win.offsetMm ?? 0) / 1000;
        
        let pos: [number, number, number] = [0, sill + winH/2, 0];
        let rot: [number, number, number] = [0, 0, 0];
        const isDraggingThis = selectedElementId === win.id && !controlsEnabled;
        const dragZOffset = isDraggingThis ? 0.015 : 0;
        // Calculate offset to be flush with the wall surface
        const frameZ = d/2 - frameDepth/2; 
        const frameX = w/2 - frameDepth/2;

        if (win.wall === 'front') { pos = [offset, sill + winH/2, frameZ + dragZOffset]; } 
        else if (win.wall === 'back') { pos = [offset, sill + winH/2, -frameZ - dragZOffset]; rot = [0, Math.PI, 0]; } 
        else if (win.wall === 'left') { pos = [-frameX - dragZOffset, sill + winH/2, offset]; rot = [0, -Math.PI/2, 0]; } 
        else { pos = [frameX + dragZOffset, sill + winH/2, offset]; rot = [0, Math.PI/2, 0]; }

        return (
          <group 
            key={`win-${win.id}`} 
            position={pos} 
            rotation={rot}
            onClick={(e) => { 
              e.stopPropagation(); 
              if (viewMode !== 'walking') setSelectedElementId(win.id); 
            }}
          >
            {isDraggingThis && (
            <mesh position={[0, 0, frameDepth/2 - 0.005]}>
              <planeGeometry args={[winW, winH]} />
              <meshBasicMaterial color="#111111" />
            </mesh>
          )}
          {selectedElementId === win.id && (
              <>
                <DimText 
                  position={[0, winH/2 + 0.2, 0.1]}
                  rotation={[0, 0, 0]}
                  value={Math.round(win.widthMm)}
                  onValueChange={(val: number) => {
                    useStore.getState().updateWindow(win.id, { widthMm: Math.max(10, val) });
                  }}
                />
                <mesh position={[0, 0, 0]}>
                  <boxGeometry args={[winW + 0.1, winH + 0.1, 0.2]} />
                  <meshBasicMaterial color="#5A5A40" opacity={0.3} transparent wireframe />
                </mesh>
                <DragHandle
                  position={[0, 0, 0.15]}
                  axis={(win.wall === 'front' || win.wall === 'back') ? 'x' : 'z'}
                  visualAxis="x"
                  color="#0000ff"
                  onChange={(delta) => {
                     const store = useStore.getState();
                     const targetWin = store.scene.room.windows.find(w => w.id === win.id);
                     if (targetWin) {
                       store.updateWindow(win.id, { offsetMm: (targetWin.offsetMm ?? 0) + delta * 1000 });
                     }
                  }}
                />
                <DragHandle
                  position={[-winW/2, 0, 0.15]}
                  axis={(win.wall === 'front' || win.wall === 'back') ? 'x' : 'z'}
                  color="#ff0000"
                  snapInterval={0.05}
                  onChange={(delta) => {
                     const store = useStore.getState();
                     const targetWin = store.scene.room.windows.find(w => w.id === win.id);
                     if (targetWin) {
                       store.updateWindow(win.id, { widthMm: Math.max(10, (targetWin.widthMm ?? 1000) - delta * 2000) });
                     }
                  }}
                />
                <DragHandle
                  position={[winW/2, 0, 0.15]}
                  axis={(win.wall === 'front' || win.wall === 'back') ? 'x' : 'z'}
                  color="#ff0000"
                  snapInterval={0.05}
                  onChange={(delta) => {
                     const store = useStore.getState();
                     const targetWin = store.scene.room.windows.find(w => w.id === win.id);
                     if (targetWin) {
                       store.updateWindow(win.id, { widthMm: Math.max(10, (targetWin.widthMm ?? 1000) + delta * 2000) });
                     }
                  }}
                />
              </>
            )}
             {/* Outer Frame */}
             <mesh position={[0, winH/2-frameThickness/2, 0]} castShadow><boxGeometry args={[winW, frameThickness, frameDepth]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
             <mesh position={[0, -winH/2+frameThickness/2, 0]} castShadow><boxGeometry args={[winW, frameThickness, frameDepth]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
             <mesh position={[-winW/2+frameThickness/2, 0, 0]} castShadow><boxGeometry args={[frameThickness, winH - frameThickness*2, frameDepth]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
             <mesh position={[winW/2-frameThickness/2, 0, 0]} castShadow><boxGeometry args={[frameThickness, winH - frameThickness*2, frameDepth]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
             
             {/* Protruding Sill */}
             <mesh position={[0, -winH/2-0.01, frameDepth/2 + 0.02]} rotation={[0.08, 0, 0]} castShadow><boxGeometry args={[winW + 0.1, 0.04, 0.10]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
             
             {/* Sash Details & Glass panes */}
             {Array.from({ length: win.leaves || 1 }).map((_, i) => {
               const panesCount = win.leaves || 1;
               const paneW = (winW - frameThickness*2) / panesCount;
               const posX = - ((winW - frameThickness*2)/2) + paneW/2 + i * paneW;

               return (
                 <group key={`pane-${i}`} position={[posX, 0, 0]}>
                   <mesh position={[0, winH/2-frameThickness-sashThickness/2, 0]}><boxGeometry args={[paneW, sashThickness, frameDepth*0.3]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
                   <mesh position={[0, -winH/2+frameThickness+sashThickness/2, 0]}><boxGeometry args={[paneW, sashThickness, frameDepth*0.3]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
                   <mesh position={[-paneW/2+sashThickness/2, 0, 0]}><boxGeometry args={[sashThickness, winH - frameThickness*2 - sashThickness*2, frameDepth*0.3]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
                   <mesh position={[paneW/2-sashThickness/2, 0, 0]}><boxGeometry args={[sashThickness, winH - frameThickness*2 - sashThickness*2, frameDepth*0.3]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
                   {/* Glass */}
                   <mesh>
                     <boxGeometry args={[paneW - sashThickness*2, winH - frameThickness*2 - sashThickness*2, 0.02]} />
                     <meshPhysicalMaterial color="#aabed1" transmission={0.9} ior={1.5} thickness={0.05} roughness={0.1} clearcoat={1} envMapIntensity={3} />
                   </mesh>

                   {/* Window Handle */}
                   {room.hasDoorHandles && (
                     <group position={[i === 0 ? paneW/2 - sashThickness/2 - 0.02 : -paneW/2 + sashThickness/2 + 0.02, -0.1, frameDepth*0.15 + 0.005]}>
                       <mesh position={[0, 0, 0]}><boxGeometry args={[0.02, 0.12, 0.01]} /><meshStandardMaterial color="#333" metalness={0.8} roughness={0.2} /></mesh>
                       <mesh position={[i === 0 ? -0.03 : 0.03, -0.04, 0.02]}><boxGeometry args={[0.08, 0.015, 0.015]} /><meshStandardMaterial color="#333" metalness={0.8} roughness={0.2} /></mesh>
                     </group>
                   )}
                 </group>
               );
             })}
          </group>
        );
      })}

      {/* Render Skylights */}
      {(room.skylights || []).map(sky => {
        const skyW = sky.widthMm / 1000;
        const skyL = sky.lengthMm / 1000;
        const sX = sky.offsetX / 1000;
        const sZ = sky.offsetZ / 1000;
        const roofY = (isPitched && !isGable ? (frontH + backH)/2 : h) + roofH;
        const isHovered = hoveredElementId === `sky-${sky.id}`;

        return (
          <group 
            key={sky.id} 
            position={[sX, roofY + 0.05, sZ]}
            onPointerOver={(e) => { e.stopPropagation(); useStore.getState().setHoveredElementId(`sky-${sky.id}`); }}
            onPointerOut={() => useStore.getState().setHoveredElementId(null)}
          >
            {/* Kerb (Upstand) */}
            <mesh position={[0, -0.05, 0]}>
               <boxGeometry args={[skyW, 0.1, skyL]} />
               <meshStandardMaterial color="#333333" />
            </mesh>

            {sky.type === 'lantern' ? (
              <group position={[0, 0, 0]} rotation={[0, Math.PI/4, 0]}>
                {/* Lantern shape (pyramid-ish) */}
                <mesh position={[0, 0.2, 0]}>
                   <coneGeometry args={[Math.max(skyW, skyL)/2, 0.4, 4]} />
                   <meshPhysicalMaterial color="#aabed1" transmission={0.9} opacity={1} ior={1.5} thickness={0.05} roughness={0.1} transparent />
                </mesh>
                <mesh position={[0, 0.2, 0]}>
                   <coneGeometry args={[Math.max(skyW, skyL)/2 + 0.02, 0.42, 4]} />
                   <meshStandardMaterial color={frameColorHex} wireframe wireframeLinewidth={3} />
                </mesh>
              </group>
            ) : (
              <group position={[0, 0, 0]}>
                {/* Flat skylight glass */}
                <mesh position={[0, 0.02, 0]}>
                  <boxGeometry args={[skyW, 0.02, skyL]} />
                  <meshPhysicalMaterial color="#aabed1" transmission={0.9} opacity={1} ior={1.5} thickness={0.05} roughness={0.0} transparent />
                </mesh>
                {/* Metal Frame */}
                {/* Front */}
                <mesh position={[0, 0.03, skyL/2]}><boxGeometry args={[skyW + 0.04, 0.04, 0.04]} /><meshStandardMaterial color={frameColorHex} /></mesh>
                {/* Back */}
                <mesh position={[0, 0.03, -skyL/2]}><boxGeometry args={[skyW + 0.04, 0.04, 0.04]} /><meshStandardMaterial color={frameColorHex} /></mesh>
                {/* Left */}
                <mesh position={[-skyW/2, 0.03, 0]}><boxGeometry args={[0.04, 0.04, skyL + 0.04]} /><meshStandardMaterial color={frameColorHex} /></mesh>
                {/* Right */}
                <mesh position={[skyW/2, 0.03, 0]}><boxGeometry args={[0.04, 0.04, skyL + 0.04]} /><meshStandardMaterial color={frameColorHex} /></mesh>
              </group>
            )}

            {room.showDimensions && isHovered && (
               <>
                 <DragHandle elementId={`sky-${sky.id}`} position={[0, 0.2, skyL/2 + 0.3]} axis="z" onChange={(dz) => useStore.getState().updateSkylight(sky.id, { offsetZ: sky.offsetZ + dz*1000 })} />
                 <DragHandle elementId={`sky-${sky.id}`} position={[skyW/2 + 0.3, 0.2, 0]} axis="x" onChange={(dx) => useStore.getState().updateSkylight(sky.id, { offsetX: sky.offsetX + dx*1000 })} />
                 
                 <DragHandle elementId={`sky-${sky.id}`} position={[skyW/2 + 0.1, 0.2, skyL/2]} axis="x" color="#ff0000" visualAxis="x" onChange={(dx) => useStore.getState().updateSkylight(sky.id, { widthMm: Math.max(300, sky.widthMm + dx*2000) })} />
                 <DragHandle elementId={`sky-${sky.id}`} position={[skyW/2, 0.2, skyL/2 + 0.1]} axis="z" color="#ff0000" visualAxis="z" onChange={(dz) => useStore.getState().updateSkylight(sky.id, { lengthMm: Math.max(300, sky.lengthMm + dz*2000) })} />
               </>
            )}
          </group>
        );
      })}

      {/* Internal Partitions */}
      {room.partitions?.map(part => {
         const pL = part.lengthMm/1000;
         const pT = part.thicknessMm/1000;
         const pX = part.xMm/1000;
         const pZ = part.zMm/1000;
         const rotAngle = part.rotation === 90 ? Math.PI/2 : 0;
         const isHovered = hoveredElementId === `part-${part.id}`;
         const hP = isPitched && !isGable ? (frontH + backH)/2 : h;
         
         return (
           <group 
             key={part.id} 
             position={[pX, hP/2, pZ]} 
             rotation={[0, rotAngle, 0]}
             onPointerOver={(e) => { e.stopPropagation(); useStore.getState().setHoveredElementId(`part-${part.id}`); }}
             onPointerOut={() => useStore.getState().setHoveredElementId(null)}
           >
             <mesh castShadow receiveShadow>
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
             </mesh>
             {room.showDimensions && isHovered && (
               <>
                 {part.rotation === 0 ? (
                   <>
                     {/* Right End Handle */}
                     <DragHandle elementId={`part-${part.id}`} position={[pL/2, 0, 0]} axis="x" color="#ff0000" visualAxis="x" snapInterval={0.05} onChange={(dx) => {
                       const current = useStore.getState().scene.room.partitions.find(p => p.id === part.id);
                       if (!current) return;
                       const newL = Math.max(100, current.lengthMm + dx * 1000);
                       const diff = newL - current.lengthMm;
                       useStore.getState().updatePartition(part.id, { lengthMm: newL, xMm: current.xMm + diff / 2 });
                     }} />
                     {/* Left End Handle */}
                     <DragHandle elementId={`part-${part.id}`} position={[-pL/2, 0, 0]} axis="x" color="#ff0000" visualAxis="x" snapInterval={0.05} onChange={(dx) => {
                       const current = useStore.getState().scene.room.partitions.find(p => p.id === part.id);
                       if (!current) return;
                       const newL = Math.max(100, current.lengthMm - dx * 1000);
                       const diff = newL - current.lengthMm;
                       useStore.getState().updatePartition(part.id, { lengthMm: newL, xMm: current.xMm + dx * 1000 + diff / 2 });
                     }} />
                     {/* Center Move Handle Z */}
                     <DragHandle elementId={`part-${part.id}`} position={[0, 0, pT/2 + 0.2]} axis="z" visualAxis="z" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updatePartition(part.id, { zMm: part.zMm + dz*1000 })} />
                     {/* Center Move Handle X */}
                     <DragHandle elementId={`part-${part.id}`} position={[0, hP/2 + 0.2, 0]} axis="x" visualAxis="x" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updatePartition(part.id, { xMm: part.xMm + dx*1000 })} />
                   </>
                 ) : (
                   <>
                     {/* Top End Handle (Local +X, World -Z) */}
                     <DragHandle elementId={`part-${part.id}`} position={[pL/2, 0, 0]} axis="z" color="#ff0000" visualAxis="x" snapInterval={0.05} onChange={(dz) => {
                       const current = useStore.getState().scene.room.partitions.find(p => p.id === part.id);
                       if (!current) return;
                       const newL = Math.max(100, current.lengthMm - dz * 1000);
                       const diff = newL - current.lengthMm;
                       useStore.getState().updatePartition(part.id, { lengthMm: newL, zMm: current.zMm + dz * 1000 + diff / 2 });
                     }} />
                     {/* Bottom End Handle (Local -X, World +Z) */}
                     <DragHandle elementId={`part-${part.id}`} position={[-pL/2, 0, 0]} axis="z" color="#ff0000" visualAxis="x" snapInterval={0.05} onChange={(dz) => {
                       const current = useStore.getState().scene.room.partitions.find(p => p.id === part.id);
                       if (!current) return;
                       const newL = Math.max(100, current.lengthMm + dz * 1000);
                       const diff = newL - current.lengthMm;
                       useStore.getState().updatePartition(part.id, { lengthMm: newL, zMm: current.zMm + diff / 2 });
                     }} />
                     {/* Center Move Handle X */}
                     <DragHandle elementId={`part-${part.id}`} position={[0, 0, -pT/2 - 0.2]} axis="x" visualAxis="z" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updatePartition(part.id, { xMm: part.xMm + dx*1000 })} />
                     {/* Center Move Handle Z */}
                     <DragHandle elementId={`part-${part.id}`} position={[0, hP/2 + 0.2, 0]} axis="z" visualAxis="x" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updatePartition(part.id, { zMm: part.zMm + dz*1000 })} />
                   </>
                 )}
               </>
             )}
           </group>
         )
      })}

      {/* Interior Doors */}
      {(room.interiorDoors || []).map(door => {
        const dW = door.widthMm/1000;
        const dH = door.heightMm/1000;
        const dX = door.xMm/1000;
        const dZ = door.zMm/1000;
        const isHovered = hoveredElementId === `intdoor-${door.id}`;
        const rot = door.rotation === 90 ? Math.PI/2 : 0;
        return (
          <group 
            key={door.id}
            position={[dX, dH/2, dZ]}
            rotation={[0, rot, 0]}
            onPointerOver={(e) => { e.stopPropagation(); useStore.getState().setHoveredElementId(`intdoor-${door.id}`); }}
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
                     <DragHandle elementId={`intdoor-${door.id}`} position={[0, dH/2 + 0.3, 0]} axis="z" visualAxis="z" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updateInteriorDoor(door.id, { zMm: door.zMm + dz*1000 })} />
                     <DragHandle elementId={`intdoor-${door.id}`} position={[0, dH/2 + 0.3, 0]} axis="x" visualAxis="x" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updateInteriorDoor(door.id, { xMm: door.xMm + dx*1000 })} />
                   </>
                 ) : (
                   <>
                     <DragHandle elementId={`intdoor-${door.id}`} position={[0, dH/2 + 0.3, 0]} axis="x" visualAxis="z" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updateInteriorDoor(door.id, { xMm: door.xMm + dx*1000 })} />
                     <DragHandle elementId={`intdoor-${door.id}`} position={[0, dH/2 + 0.3, 0]} axis="z" visualAxis="x" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updateInteriorDoor(door.id, { zMm: door.zMm + dz*1000 })} />
                   </>
                 )}
               </>
            )}
          </group>
        );
      })}
      
      {/* Plan View Annotations (Doors/Windows marked on walls) */}
      {isPlanView && (
        <group position={[0, h + 0.2, 0]}>
          {room.windows.map(win => {
            const winW = win.widthMm / 1000;
            const offset = (win.offsetMm ?? 0) / 1000;
            let pos: [number, number, number] = [0, 0, 0];
            let rot: [number, number, number] = [0, 0, 0];
            const frameZ = d/2 - frameDepth/2; 
            const frameX = w/2 - frameDepth/2;
            
            if (win.wall === 'front') { pos = [offset, 0, frameZ]; } 
            else if (win.wall === 'back') { pos = [offset, 0, -frameZ]; rot = [0, Math.PI, 0]; } 
            else if (win.wall === 'left') { pos = [-frameX, 0, offset]; rot = [0, -Math.PI/2, 0]; } 
            else { pos = [frameX, 0, offset]; rot = [0, Math.PI/2, 0]; }

            return (
              <mesh key={`plan-win-${win.id}`} position={pos} rotation={[...rot] as [number, number, number]}>
                {/* Main Box outline */}
                <mesh position={[0, 0, 0]} rotation={[-Math.PI/2, 0, 0]}>
                  <planeGeometry args={[winW, wallThickness]} />
                  <meshBasicMaterial color="white" />
                  <Edges color="black" scale={1} />
                </mesh>
                {/* Center Glass Line */}
                <mesh position={[0, 0, 0]} rotation={[-Math.PI/2, 0, 0]}>
                  <planeGeometry args={[winW, 0.05]} />
                  <meshBasicMaterial color="black" />
                </mesh>
              </mesh>
            );
          })}
          {(room.doors || []).map(door => {
            const offset = door.offsetMm / 1000;
            const frameZ = d/2 - frameDepth/2; 
            const frameX = w/2 - frameDepth/2;
            let pos: [number, number, number] = [offset, 0, frameZ];
            let rot: [number, number, number] = [0, 0, 0];
            
            if (door.wall === 'front') { pos = [offset, 0, frameZ]; } 
            else if (door.wall === 'back') { pos = [offset, 0, -frameZ]; rot = [0, Math.PI, 0]; } 
            else if (door.wall === 'left') { pos = [-frameX, 0, offset]; rot = [0, -Math.PI/2, 0]; } 
            else { pos = [frameX, 0, offset]; rot = [0, Math.PI/2, 0]; }
            
            return (
            <mesh key={door.id} position={pos} rotation={rot}>
              {/* Door Swing Arc / Frame block */}
              <mesh position={[0, 0, 0]} rotation={[-Math.PI/2, 0, 0]}>
                <planeGeometry args={[door.widthMm/1000, frameDepth]} />
                <meshBasicMaterial color="white" />
                <Edges color="black" scale={1} />
              </mesh>
              {/* Center Door Line */}
              <mesh position={[0, 0, 0]} rotation={[-Math.PI/2, 0, 0]}>
                <planeGeometry args={[door.widthMm/1000, 0.05]} />
                <meshBasicMaterial color="black" />
              </mesh>
            </mesh>
          )
          })}
        </group>
      )}

      {/* Dimension Line Labels */}
      {room.showDimensions && (isHoveredRoom || isPlanView || useStore.getState().isExporting) && (
        <group>
          {/* Width */}
          {false && (
          <group position={[roofX, -0.05, d/2 + 0.5 + Math.max(0, ohFront)]}>
            <Line points={[[-roofW/2, 0, 0], [roofW/2, 0, 0]]} color="#000" lineWidth={1} />
            <Line points={[-roofW/2 - 0.05, 0, -0.05, -roofW/2 + 0.05, 0, 0.05]} color="#000" lineWidth={1} />
            <Line points={[roofW/2 - 0.05, 0, -0.05, roofW/2 + 0.05, 0, 0.05]} color="#000" lineWidth={1} />
            <Line points={[[-roofW/2, 0, -0.4], [-roofW/2, 0, 0.1]]} color="#000" lineWidth={0.5} opacity={0.3} transparent />
            <Line points={[[roofW/2, 0, -0.4], [roofW/2, 0, 0.1]]} color="#000" lineWidth={0.5} opacity={0.3} transparent />
            <DimText 
              position={[0, 0, 0]} 
              rotation={[-Math.PI/2, 0, 0]}
              value={Math.round(roofW * 1000)}
              onValueChange={(val: number) => {
                const store = useStore.getState();
                const newW = val - (store.scene.room.overhangLeftMm || 0) - (store.scene.room.overhangRightMm || 0);
                store.updateRoom({ widthMm: Math.max(10, newW) });
              }}
            />
            {room.showDimensions && (
              <>
                <DragHandle 
                  position={[roofW/2, 0, 0]} 
                  axis="x" 
                  label="Room Width"
                  onChange={(dx) => {
                    const store = useStore.getState();
                    store.updateRoom({ widthMm: Math.max(10, Math.round(store.scene.room.widthMm + dx * 2000)) });
                  }} 
                />
                <DragHandle 
                  position={[-roofW/2, 0, 0]} 
                  axis="x" 
                  label="Room Width"
                  onChange={(dx) => {
                    const store = useStore.getState();
                    store.updateRoom({ widthMm: Math.max(10, Math.round(store.scene.room.widthMm - dx * 2000)) });
                  }} 
                />
              </>
            )}
          </group>
          )}

          {/* Depth */}
          {false && (
          <group position={[w/2 + 0.5 + Math.max(0, ohRight), -0.05, roofZ]}>
            <Line points={[[0, 0, -roofD/2], [0, 0, roofD/2]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, 0, -roofD/2 - 0.05], [0.05, 0, -roofD/2 + 0.05]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, 0, roofD/2 - 0.05], [0.05, 0, roofD/2 + 0.05]]} color="#000" lineWidth={1} />
            <Line points={[[-0.4, 0, -roofD/2], [0.1, 0, -roofD/2]]} color="#000" lineWidth={0.5} opacity={0.3} transparent />
            <Line points={[[-0.4, 0, roofD/2], [0.1, 0, roofD/2]]} color="#000" lineWidth={0.5} opacity={0.3} transparent />
            <DimText 
              position={[0, 0, 0]} 
              rotation={[-Math.PI/2, 0, Math.PI/2]}
              value={Math.round(roofD * 1000)}
              onValueChange={(val: number) => {
                const store = useStore.getState();
                const newD = val - (store.scene.room.canopySizeMm || 0) - (store.scene.room.overhangBackMm || 0);
                store.updateRoom({ depthMm: Math.max(10, newD) });
              }}
            />
            {room.showDimensions && (
              <>
                <DragHandle 
                  position={[0, 0, roofD/2]} 
                  axis="z" 
                  label="Room Depth"
                  onChange={(dz) => {
                    const store = useStore.getState();
                    // Z axis goes backwards!
                    store.updateRoom({ depthMm: Math.max(10, Math.round(store.scene.room.depthMm + dz * 2000)) });
                  }} 
                />
                <DragHandle 
                  position={[0, 0, -roofD/2]} 
                  axis="z" 
                  label="Room Depth"
                  onChange={(dz) => {
                    const store = useStore.getState();
                    store.updateRoom({ depthMm: Math.max(10, Math.round(store.scene.room.depthMm - dz * 2000)) });
                  }} 
                />
              </>
            )}
          </group>
          )}

          {/* Front Height */}
          {!isPlanView && (
          <group position={[-w/2 - 0.5, (frontH + baseH + roofH)/2, d/2]}>
            <Line points={[[0, -(frontH + baseH + roofH)/2, 0], [0, (frontH + baseH + roofH)/2, 0]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, -(frontH + baseH + roofH)/2 - 0.05, 0], [0.05, -(frontH + baseH + roofH)/2 + 0.05, 0]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, (frontH + baseH + roofH)/2 - 0.05, 0], [0.05, (frontH + baseH + roofH)/2 + 0.05, 0]]} color="#000" lineWidth={1} />
            <Line points={[[0.4, -(frontH + baseH + roofH)/2, 0], [-0.1, -(frontH + baseH + roofH)/2, 0]]} color="#000" lineWidth={0.5} opacity={0.3} transparent />
            <Line points={[[0.4, (frontH + baseH + roofH)/2, 0], [-0.1, (frontH + baseH + roofH)/2, 0]]} color="#000" lineWidth={0.5} opacity={0.3} transparent />
            <DimText 
              position={[0, 0, 0]} 
              rotation={[0, -Math.PI/2, 0]}
              value={Math.round((frontH + baseH + roofH) * 1000)}
              onValueChange={(val: number) => {
                const store = useStore.getState();
                const newTotal = val;
                const newFrontH = newTotal - (store.scene.room.baseHeightMm || 100) - (store.scene.room.roofHeightMm || 200);
                store.updateRoom({ heightMm: Math.max(10, newFrontH) });
              }}
            />
            {room.showDimensions && (
              <DragHandle 
                position={[0, (frontH + baseH + roofH)/2, 0]} 
                axis="y" 
                label={isGable || isPitched ? "Eaves Height" : "Front Height"}
                onChange={(dy) => {
                  const store = useStore.getState();
                  store.updateRoom({ heightMm: Math.max(10, Math.round(store.scene.room.heightMm + dy * 1000)) });
                }} 
              />
            )}
          </group>
          )}
          {/* Roof Height (Ridge) Handle */}
          {(isGable || isPitched) && room.showDimensions && (
            <group position={[0, h + roofH + 0.1, d/2 + 0.1]} rotation={[0, 0, 0]}>
              <DimText 
                position={[0, 0, 0]}
                rotation={[0, 0, 0]}
                value={Math.round(roofH * 1000)}
                onValueChange={(val) => {
                  useStore.getState().updateRoom({ roofHeightMm: Math.max(10, val) });
                }}
              />
              <DragHandle 
                position={[0, 0, 0]} 
                axis="y" 
                label="Ridge Height"
                color="#8a2be2"
                onChange={(dy) => {
                  const store = useStore.getState();
                  store.updateRoom({ roofHeightMm: Math.max(10, Math.round((store.scene.room.roofHeightMm || 200) + dy * 1000)) });
                }} 
              />
            </group>
          )}


          {/* LShape Cutout Dimensions */}
          {false && (
            <group position={[w/2 - cutW/2, 0.5, d/2 - cutD/2]}>
              <DimText 
                position={[-cutW/2, 0.1, cutD/2]}
                rotation={[-Math.PI/2, 0, 0]}
                value={Math.round(room.lShapeCutoutWidthMm ?? 2000)}
                onValueChange={(val: number) => {
                  useStore.getState().updateRoom({ lShapeCutoutWidthMm: Math.max(10, val) });
                }}
              />
              <DragHandle
                position={[-cutW/2, 0, cutD/2]}
                axis="x"
                color="#ff8c00"
                onChange={(dx) => {
                   const store = useStore.getState();
                   const curW = store.scene.room.lShapeCutoutWidthMm ?? 2000;
                   store.updateRoom({ lShapeCutoutWidthMm: Math.max(10, Math.round(curW - dx * 1000)) });
                }}
              />
              <DimText 
                position={[cutW/2, 0.1, -cutD/2]}
                rotation={[-Math.PI/2, 0, Math.PI/2]}
                value={Math.round(room.lShapeCutoutDepthMm ?? 1500)}
                onValueChange={(val: number) => {
                  useStore.getState().updateRoom({ lShapeCutoutDepthMm: Math.max(10, val) });
                }}
              />
              <DragHandle
                position={[cutW/2, 0, -cutD/2]}
                axis="z"
                color="#ff8c00"
                onChange={(dz) => {
                   const store = useStore.getState();
                   const curD = store.scene.room.lShapeCutoutDepthMm ?? 1500;
                   store.updateRoom({ lShapeCutoutDepthMm: Math.max(10, Math.round(curD - dz * 1000)) });
                }}
              />
            </group>
          )}

          {/* Back Height */}
          {!isPlanView && (
          <group position={[-w/2 - 0.5, (backH + baseH + roofH)/2, -d/2]}>
            <Line points={[[0, -(backH + baseH + roofH)/2, 0], [0, (backH + baseH + roofH)/2, 0]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, -(backH + baseH + roofH)/2 - 0.05, 0], [0.05, -(backH + baseH + roofH)/2 + 0.05, 0]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, (backH + baseH + roofH)/2 - 0.05, 0], [0.05, (backH + baseH + roofH)/2 + 0.05, 0]]} color="#000" lineWidth={1} />
            <Line points={[[0.4, -(backH + baseH + roofH)/2, 0], [-0.1, -(backH + baseH + roofH)/2, 0]]} color="#000" lineWidth={0.5} opacity={0.3} transparent />
            <Line points={[[0.4, (backH + baseH + roofH)/2, 0], [-0.1, (backH + baseH + roofH)/2, 0]]} color="#000" lineWidth={0.5} opacity={0.3} transparent />
            <DimText 
              position={[0, 0, 0]} 
              rotation={[0, -Math.PI/2, 0]}
              value={Math.round((backH + baseH + roofH) * 1000)}
              onValueChange={(val: number) => {
                const store = useStore.getState();
                const newTotal = val;
                const newBackH = newTotal - (store.scene.room.baseHeightMm || 100) - (store.scene.room.roofHeightMm || 200);
                store.updateRoom({ backHeightMm: Math.max(10, newBackH) });
              }}
            />
            {room.showDimensions && room.shape !== 'Gable' && (
              <DragHandle 
                position={[0, (backH + baseH + roofH)/2, 0]} 
                axis="y" 
                onChange={(dy) => {
                  const store = useStore.getState();
                  const curBackH = store.scene.room.backHeightMm ?? store.scene.room.heightMm;
                  store.updateRoom({ backHeightMm: Math.max(10, Math.round(curBackH + dy * 1000)) });
                }} 
              />
            )}
          </group>
          )}

          {/* Roof Thickness & Overhang Controls */}
          {room.showDimensions && !isPlanView && (
            <group position={[0, baseH + Math.max(frontH, backH) + roofH/2, 0]}>

              {isCanopy && (
                <>
                  <DimText 
                    position={[0, 0, d/2 + ohFront + 0.15]}
                    rotation={[-Math.PI/2, 0, Math.PI/2]}
                    hideIfZero value={Math.round(room.canopySizeMm || 0)}
                    onValueChange={(val: number) => {
                      useStore.getState().updateRoom({ canopySizeMm: Math.max(0, val) });
                    }}
                  />
                  <DragHandle
                    position={[0, 0, d/2 + ohFront + 0.1]}
                    axis="z"
                    color="#4a5568"
                    onChange={(dz) => {
                      const store = useStore.getState();
                      const newSize = Math.max(0, Math.round((store.scene.room.canopySizeMm || 0) + dz * 1000));
                      store.updateRoom({ canopySizeMm: newSize });
                    }}
                  />
                </>
              )}

              <DimText 
                position={[0, 0, -d/2 - ohBack - 0.15]}
                rotation={[-Math.PI/2, 0, Math.PI/2]}
                hideIfZero value={Math.round(room.overhangBackMm || 0)}
                onValueChange={(val: number) => {
                  useStore.getState().updateRoom({ overhangBackMm: Math.max(0, val) });
                }}
              />
              <DragHandle
                position={[0, 0, -d/2 - ohBack - 0.1]}
                axis="z"
                color="#4a5568"
                onChange={(dz) => {
                  const store = useStore.getState();
                  store.updateRoom({ overhangBackMm: Math.max(0, Math.round((store.scene.room.overhangBackMm || 0) - dz * 1000)) });
                }}
              />

              <DimText 
                position={[-w/2 - ohLeft - 0.15, 0, 0]}
                rotation={[-Math.PI/2, 0, 0]}
                hideIfZero value={Math.round(room.overhangLeftMm || 0)}
                onValueChange={(val: number) => {
                  useStore.getState().updateRoom({ overhangLeftMm: Math.max(0, val) });
                }}
              />
              <DragHandle
                position={[-w/2 - ohLeft - 0.1, 0, 0]}
                axis="x"
                color="#4a5568"
                onChange={(dx) => {
                  const store = useStore.getState();
                  store.updateRoom({ overhangLeftMm: Math.max(0, Math.round((store.scene.room.overhangLeftMm || 0) - dx * 1000)) });
                }}
              />

              <DimText 
                position={[w/2 + ohRight + 0.15, 0, 0]}
                rotation={[-Math.PI/2, 0, 0]}
                hideIfZero value={Math.round(room.overhangRightMm || 0)}
                onValueChange={(val: number) => {
                  useStore.getState().updateRoom({ overhangRightMm: Math.max(0, val) });
                }}
              />
              <DragHandle
                position={[w/2 + ohRight + 0.1, 0, 0]}
                axis="x"
                color="#4a5568"
                onChange={(dx) => {
                  const store = useStore.getState();
                  store.updateRoom({ overhangRightMm: Math.max(0, Math.round((store.scene.room.overhangRightMm || 0) + dx * 1000)) });
                }}
              />
            </group>
          )}

          {/* Base Thickness & Decking Control */}
          {room.showDimensions && !isPlanView && (
            <group position={[0, baseH/2, 0]}>

              {room.hasDecking && (
                <>
                  <DimText 
                    position={[0, 0, d/2 + deckFront + 0.15]}
                    rotation={[-Math.PI/2, 0, Math.PI/2]}
                    hideIfZero value={Math.round(room.deckingSizeMm || 0)}
                    onValueChange={(val: number) => {
                      useStore.getState().updateRoom({ deckingSizeMm: Math.max(0, val) });
                    }}
                  />
                  <DragHandle
                    position={[0, 0, d/2 + deckFront + 0.1]}
                    axis="z"
                    color="#8a6e4d"
                    onChange={(dz) => {
                      const store = useStore.getState();
                      const newSize = Math.max(0, Math.round((store.scene.room.deckingSizeMm || 0) + dz * 1000));
                      store.updateRoom({ deckingSizeMm: newSize });
                    }}
                  />
                </>
              )}
            </group>
          )}
        </group>
      )}

      {/* Plan View Dimensions */}
      {isPlanView && (
        <group position={[0, baseH + 0.1, 0]}>
          {/* Back Wall (Always full width w) */}
          <group position={[0, 0, -d/2 - Math.max(1.2, ohBack + 0.8)]}>
            <Line points={[[-w/2, 0, 0], [w/2, 0, 0]]} color="#000" lineWidth={1} />
            <Line points={[[-w/2, 0, -0.05], [-w/2, 0, 0.05]]} color="#000" lineWidth={1} />
            <Line points={[[w/2, 0, -0.05], [w/2, 0, 0.05]]} color="#000" lineWidth={1} />
            {room.showDimensions && (isPlanView) && (
              <DimText 
                position={[0, 0, 0]} 
                rotation={[-Math.PI/2, 0, Math.PI]}
                value={Math.round(w * 1000)}
                onValueChange={isPlanView ? ((val: number) => useStore.getState().updateRoom({ widthMm: Math.max(10, val) })) : undefined}
              />
            )}
            {room.showDimensions && isPlanView && (
              <>
                {room.shape !== 'LShape' && <DragHandle elementId="room" position={[w/2, 0, 0]} axis="x" label="Width" onChange={(dx) => useStore.getState().updateRoom({ widthMm: Math.max(10, Math.round(useStore.getState().scene.room.widthMm + dx * 2000)) })} />}
                <DragHandle elementId="room" position={[-w/2, 0, 0]} axis="x" label="Width" onChange={(dx) => useStore.getState().updateRoom({ widthMm: Math.max(10, Math.round(useStore.getState().scene.room.widthMm - dx * 2000)) })} />
              </>
            )}
          </group>

          {/* Left Wall (Always full depth d) */}
          <group position={[-w/2 - Math.max(1.2, ohLeft + 0.8), 0, 0]}>
            <Line points={[[0, 0, -d/2], [0, 0, d/2]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, 0, -d/2], [0.05, 0, -d/2]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, 0, d/2], [0.05, 0, d/2]]} color="#000" lineWidth={1} />
            {room.showDimensions && (isPlanView) && (
              <DimText 
                position={[0, 0, 0]} 
                rotation={[-Math.PI/2, 0, -Math.PI/2]}
                value={Math.round(d * 1000)}
                onValueChange={isPlanView ? ((val: number) => useStore.getState().updateRoom({ depthMm: Math.max(10, val) })) : undefined}
              />
            )}
            {room.showDimensions && isPlanView && (
              <>
                {room.shape !== 'LShape' && <DragHandle elementId="room" position={[0, 0, d/2]} axis="z" label="Depth" onChange={(dz) => useStore.getState().updateRoom({ depthMm: Math.max(10, Math.round(useStore.getState().scene.room.depthMm + dz * 2000)) })} />}
                <DragHandle elementId="room" position={[0, 0, -d/2]} axis="z" label="Depth" onChange={(dz) => useStore.getState().updateRoom({ depthMm: Math.max(10, Math.round(useStore.getState().scene.room.depthMm - dz * 2000)) })} />
              </>
            )}
          </group>

          {/* Front Wall */}
          <group position={[0, 0, d/2 + Math.max(1.2, deckFront + 0.8)]}>
            <Line points={[[-w/2, 0, 0], [w/2 - (room.shape === 'LShape' ? cutW : 0), 0, 0]]} color="#000" lineWidth={1} />
            <Line points={[[-w/2, 0, -0.05], [-w/2, 0, 0.05]]} color="#000" lineWidth={1} />
            <Line points={[[w/2 - (room.shape === 'LShape' ? cutW : 0), 0, -0.05], [w/2 - (room.shape === 'LShape' ? cutW : 0), 0, 0.05]]} color="#000" lineWidth={1} />
            {room.showDimensions && (isPlanView) && (
              <DimText 
                position={[-(room.shape === 'LShape' ? cutW : 0)/2, 0, 0]} 
                rotation={[-Math.PI/2, 0, 0]}
                value={Math.round((w - (room.shape === 'LShape' ? cutW : 0)) * 1000)}
                onValueChange={isPlanView ? ((val: number) => { if (room.shape !== 'LShape') useStore.getState().updateRoom({ widthMm: Math.max(10, val) }); }) : undefined}
              />
            )}
            {room.showDimensions && isPlanView && (
              <>
                {room.shape !== 'LShape' && <DragHandle elementId="room" position={[w/2, 0, 0]} axis="x" label="Width" onChange={(dx) => useStore.getState().updateRoom({ widthMm: Math.max(10, Math.round(useStore.getState().scene.room.widthMm + dx * 2000)) })} />}
                <DragHandle elementId="room" position={[-w/2, 0, 0]} axis="x" label="Width" onChange={(dx) => useStore.getState().updateRoom({ widthMm: Math.max(10, Math.round(useStore.getState().scene.room.widthMm - dx * 2000)) })} />
              </>
            )}
          </group>

          {/* Right Wall */}
          <group position={[w/2 + Math.max(1.2, ohRight + 0.8), 0, 0]}>
            <Line points={[[0, 0, -d/2], [0, 0, d/2 - (room.shape === 'LShape' ? cutD : 0)]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, 0, -d/2], [0.05, 0, -d/2]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, 0, d/2 - (room.shape === 'LShape' ? cutD : 0)], [0.05, 0, d/2 - (room.shape === 'LShape' ? cutD : 0)]]} color="#000" lineWidth={1} />
            {room.showDimensions && (isPlanView) && (
              <DimText 
                position={[0, 0, -(room.shape === 'LShape' ? cutD : 0)/2]} 
                rotation={[-Math.PI/2, 0, Math.PI/2]}
                value={Math.round((d - (room.shape === 'LShape' ? cutD : 0)) * 1000)}
                onValueChange={isPlanView ? ((val: number) => { if (room.shape !== 'LShape') useStore.getState().updateRoom({ depthMm: Math.max(10, val) }); }) : undefined}
              />
            )}
            {room.showDimensions && isPlanView && (
              <>
                {room.shape !== 'LShape' && <DragHandle elementId="room" position={[0, 0, d/2]} axis="z" label="Depth" onChange={(dz) => useStore.getState().updateRoom({ depthMm: Math.max(10, Math.round(useStore.getState().scene.room.depthMm + dz * 2000)) })} />}
                <DragHandle elementId="room" position={[0, 0, -d/2]} axis="z" label="Depth" onChange={(dz) => useStore.getState().updateRoom({ depthMm: Math.max(10, Math.round(useStore.getState().scene.room.depthMm - dz * 2000)) })} />
              </>
            )}
          </group>

          {/* LShape Inner Walls */}
          {room.shape === 'LShape' && (
            <>
              {/* Inner Front-facing wall (cutW width) */}
              <group position={[w/2 - cutW/2, 0, d/2 - cutD + 0.3]}>
                <Line points={[[-cutW/2, 0, 0], [cutW/2, 0, 0]]} color="#000" lineWidth={1} />
                <Line points={[[-cutW/2, 0, -0.05], [-cutW/2, 0, 0.05]]} color="#000" lineWidth={1} />
                <Line points={[[cutW/2, 0, -0.05], [cutW/2, 0, 0.05]]} color="#000" lineWidth={1} />
                <DimText 
                  position={[0, 0, 0]} 
                  rotation={[-Math.PI/2, 0, 0]}
                  value={Math.round(cutW * 1000)}
                  onValueChange={(val: number) => useStore.getState().updateRoom({ lShapeCutoutWidthMm: Math.max(10, val) })}
                />
                {room.showDimensions && (
                  <>
                    <DragHandle position={[-cutW/2, 0, -0.3]} axis="x" label="Cutout" color="#ff8c00" onChange={(dx) => useStore.getState().updateRoom({ lShapeCutoutWidthMm: Math.max(10, Math.round((useStore.getState().scene.room.lShapeCutoutWidthMm ?? 2000) - dx * 1000)) })} />
                  </>
                )}
              </group>

              {/* Inner Right-facing wall (cutD depth) */}
              <group position={[w/2 - cutW + 0.3, 0, d/2 - cutD/2]}>
                <Line points={[[0, 0, -cutD/2], [0, 0, cutD/2]]} color="#000" lineWidth={1} />
                <Line points={[[-0.05, 0, -cutD/2], [0.05, 0, -cutD/2]]} color="#000" lineWidth={1} />
                <Line points={[[-0.05, 0, cutD/2], [0.05, 0, cutD/2]]} color="#000" lineWidth={1} />
                <DimText 
                  position={[0, 0, 0]} 
                  rotation={[-Math.PI/2, 0, Math.PI/2]}
                  value={Math.round(cutD * 1000)}
                  onValueChange={(val: number) => useStore.getState().updateRoom({ lShapeCutoutDepthMm: Math.max(10, val) })}
                />
                {room.showDimensions && (
                  <>
                    <DragHandle position={[-0.3, 0, -cutD/2]} axis="z" label="Cutout" color="#ff8c00" onChange={(dz) => useStore.getState().updateRoom({ lShapeCutoutDepthMm: Math.max(10, Math.round((useStore.getState().scene.room.lShapeCutoutDepthMm ?? 1500) - dz * 1000)) })} />
                  </>
                )}
              </group>
            </>
          )}

          {/* Wall Openings Dimensions */}
          {(['front', 'back', 'left', 'right'] as const).map(wall => {
            // Collect elements on this wall
            type Opening = { id: string, type: 'door'|'window', offset: number, width: number, onUpdateWidth?: (val: number) => void };
            const elements: Opening[] = [];
            if (wall === 'front' && room.doors) {
               room.doors.forEach(door => {
                 elements.push({
                   id: door.id, type: 'door', offset: door.offsetMm / 1000, width: door.widthMm / 1000,
                   onUpdateWidth: (val) => useStore.getState().updateDoor(door.id, { widthMm: Math.max(10, val) })
                 });
               });
            }
            room.windows.filter(w => w.wall === wall).forEach(win => {
               elements.push({
                 id: win.id, type: 'window', offset: (win.offsetMm ?? 0) / 1000, width: win.widthMm / 1000,
                 onUpdateWidth: (val) => useStore.getState().updateWindow(win.id, { widthMm: Math.max(10, val) })
               });
            });

            if (elements.length === 0) return null;

            // Sort by offset ascending
            elements.sort((a, b) => a.offset - b.offset);

            const isHorizontal = wall === 'front' || wall === 'back';
            const totalLen = isHorizontal ? w : d;
            
            let startEdge = -totalLen / 2;
            let endEdge = totalLen / 2;

            // Adjust LShape cutout boundaries so dimensions don't overlap empty space
            if (room.shape === 'LShape') {
              if (wall === 'front') {
                endEdge = w/2 - cutW; // Only measure to the cutout
              } else if (wall === 'right') {
                startEdge = -d/2 + cutD; // Only measure past cutout
              }
            }

            // Generate segments
            const segments: Array<{ isOpening: boolean, start: number, end: number, length: number, element?: Opening, onValueChange?: (val: number) => void }> = [];
            let currentPt = startEdge;

            elements.forEach((el) => {
               const elStart = Math.max(startEdge, el.offset - el.width / 2);
               const elEnd = Math.min(endEdge, el.offset + el.width / 2);
               
               const spaceBefore = elStart - currentPt;
               const savedCurrentPt = currentPt; // capture for closure
               if (spaceBefore > 0.01) {
                  segments.push({ 
                    isOpening: false, 
                    start: savedCurrentPt, 
                    end: elStart, 
                    length: spaceBefore,
                    onValueChange: (valMm) => {
                      const newLength = valMm / 1000;
                      const newOffsetMm = (savedCurrentPt + newLength + el.width / 2) * 1000;
                      if (el.type === 'door') {
                        useStore.getState().updateDoor(el.id, { offsetMm: Math.round(newOffsetMm) });
                      } else {
                        useStore.getState().updateWindow(el.id, { offsetMm: Math.round(newOffsetMm) });
                      }
                    }
                  });
               }

               if (elEnd > elStart) {
                 segments.push({ isOpening: true, element: el, start: elStart, end: elEnd, length: elEnd - elStart });
                 currentPt = elEnd;
               }
            });

            const spaceAfter = endEdge - currentPt;
            if (spaceAfter > 0.01) {
               const lastEl = elements[elements.length - 1];
               segments.push({ 
                 isOpening: false, 
                 start: currentPt, 
                 end: endEdge, 
                 length: spaceAfter,
                 onValueChange: (valMm) => {
                   if (lastEl) {
                     const newLength = valMm / 1000;
                     const newOffsetMm = (endEdge - newLength - lastEl.width / 2) * 1000;
                     if (lastEl.type === 'door') {
                       useStore.getState().updateDoor(lastEl.id, { offsetMm: Math.round(newOffsetMm) });
                     } else {
                       useStore.getState().updateWindow(lastEl.id, { offsetMm: Math.round(newOffsetMm) });
                     }
                   }
                 }
               });
            }

            let rot: [number, number, number] = [-Math.PI/2, 0, 0];
            let getPos: (center: number) => [number, number, number];

            if (wall === 'front') {
              const out = d/2 + Math.max(0.6, deckFront + 0.2);
              rot = [-Math.PI/2, 0, 0];
              getPos = (c) => [c, 0, out];
            } else if (wall === 'back') {
              const out = -d/2 - Math.max(0.6, ohBack + 0.2) - (room.shape === 'LShape' ? cutD : 0);
              rot = [-Math.PI/2, 0, Math.PI];
              getPos = (c) => [c, 0, out];
            } else if (wall === 'left') {
              const out = -w/2 - Math.max(0.6, ohLeft + 0.2) - (room.shape === 'LShape' ? cutW : 0);
              rot = [-Math.PI/2, 0, -Math.PI/2];
              getPos = (c) => [out, 0, c];
            } else {
              const out = w/2 + Math.max(0.6, ohRight + 0.2);
              rot = [-Math.PI/2, 0, Math.PI/2];
              getPos = (c) => [out, 0, c];
            }

            return (
              <group key={`dim-wall-${wall}`}>
                 {segments.map((seg, i) => {
                    const center = (seg.start + seg.end) / 2;
                    return (
                      <DimText 
                         key={`${wall}-seg-${i}`}
                         position={getPos(center)}
                         rotation={rot}
                         value={Math.round(seg.length * 1000)}
                         onValueChange={seg.isOpening && seg.element?.onUpdateWidth ? seg.element.onUpdateWidth : seg.onValueChange}
                      />
                    );
                 })}
              </group>
            );
          })}
        </group>
      )}

      {/* Interior Lighting / Night Glow */}
      {isNight && !isPlanView && (
        <group position={[0, h - 0.5, 0]}>
          <pointLight color="#ffeecc" intensity={2} distance={Math.max(w, d) * 1.5} decay={2} castShadow={false} />
          <ambientLight color="#ffebd6" intensity={0.5} />
        </group>
      )}

      </group> {/* End Elevated Structure */}
    </group>
  );
}
