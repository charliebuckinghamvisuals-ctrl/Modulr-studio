import React from 'react';
import { useMemo, useState, useRef, useEffect, useDeferredValue } from 'react';
import { Room } from '../../types';
import { useFrame } from '@react-three/fiber';
// SafeCsg = fork of @react-three/csg whose failed boolean evaluations keep
// the previous geometry instead of blanking the mesh (see SafeCsg.tsx).
import { Geometry, Base, Subtraction, Addition } from './SafeCsg';
import * as THREE from 'three';
import { Text, Line, Html, Edges, Billboard } from '@react-three/drei';
import { useRealMaterial, resolveDeckingKey } from '../../utils/materials';
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
    // PDF-bound labels read like architectural drawings: dark figures on a
    // white plate with a hairline frame, sized to the number. The old dark
    // blob at fixed width clipped long values and sank into the linework.
    const label = String(value);
    const plateW = 0.28 + label.length * 0.11;
    return (
      <group position={position}>
        <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
          <mesh position={[0, 0, -0.012]}>
            <planeGeometry args={[plateW + 0.04, 0.34]} />
            <meshBasicMaterial color="#3b4d4a" />
          </mesh>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[plateW, 0.3]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <Text
            color="#1d1d1f"
            fontSize={0.17}
            anchorX="center"
            anchorY="middle"
          >
            {label}
          </Text>
        </Billboard>
      </group>
    );
  }

  const isPlanLabel = viewMode === 'plan';

  return (
    <Html center position={position} transform rotation={rotation}>
      <div
        className={`${isPlanLabel
          // Plan view is a working drawing: bigger, dark-on-light labels that
          // stand clear of the dimension lines instead of tiny dark blobs.
          ? 'bg-white border border-[#3b4d4a]/50 rounded-md font-mono text-[11px] font-bold tracking-wide whitespace-nowrap px-2 py-0.5 text-[#1d1d1f] shadow'
          : 'bg-[#3b4d4a] border border-[#3b4d4a] rounded-full font-mono text-[8px] tracking-wider whitespace-nowrap px-1.5 py-0.5 text-white opacity-90 shadow-md'} transition-all duration-200 ${onValueChange ? (isEditing ? 'cursor-auto ring-1 ring-[#2d3a38]' : 'cursor-pointer hover:scale-105') : 'pointer-events-none'}`}
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
              className={`min-w-[40px] w-auto max-w-[80px] text-center outline-none bg-transparent font-bold ${isPlanLabel ? 'text-[#1d1d1f]' : 'text-white'}`}
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

// Crittall-style glazing bars: grid of slim steel bars over a glass panel.
// Pane sizes adapt to the glass dimensions (targeting ~800mm wide x ~650mm tall panes,
// so a normal leaf gets no internal vertical bars and only 2-3 horizontal ones).
function CrittallBars({ glassW, glassH, depth, color }: { glassW: number, glassH: number, depth: number, color: string }) {
  const barT = 0.018;
  const cols = Math.max(1, Math.round(glassW / 0.80));
  const rows = Math.max(2, Math.round(glassH / 0.65));
  return (
    <group>
      {Array.from({ length: cols - 1 }).map((_, i) => (
        <mesh key={`v-${i}`} position={[-glassW/2 + (glassW/cols)*(i+1), 0, 0]}>
          <boxGeometry args={[barT, glassH, depth]} />
          <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
        </mesh>
      ))}
      {Array.from({ length: rows - 1 }).map((_, i) => (
        <mesh key={`h-${i}`} position={[0, -glassH/2 + (glassH/rows)*(i+1), 0]}>
          <boxGeometry args={[glassW, barT, depth]} />
          <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Click-to-add chip: click a bare wall and choose "+ Window" or "+ Door" at
 * that exact spot - no more spawning centred and dragging across the wall.
 * Works in room-local space so it lands correctly on moved/rotated rooms.
 */
function WallAddChip({ room, h, baseH }: { room: Room, h: number, baseH: number }) {
  const [hit, setHit] = useState<{ wall: 'front' | 'back' | 'left' | 'right', offsetMm: number, pos: [number, number, number] } | null>(null);

  useEffect(() => {
    const onWallClick = (e: any) => {
      const st = useStore.getState();
      if (st.viewMode === 'walking' || st.toolMode === 'place') return;
      const { x, y, z } = e.detail;
      const rx = (room.x ?? 0) / 1000, rz = (room.z ?? 0) / 1000, rot = room.rot ?? 0;
      const cos = Math.cos(-rot), sin = Math.sin(-rot);
      const lx = (x - rx) * cos - (z - rz) * sin;
      const lz = (x - rx) * sin + (z - rz) * cos;
      const w = room.widthMm / 1000, d = room.depthMm / 1000;
      const band = ((room.wallThicknessMm ?? 150) / 1000) + 0.06;
      if (y < baseH + 0.15 || y > baseH + h + 0.1) { setHit(null); return; }
      let wall: 'front' | 'back' | 'left' | 'right' | null = null;
      let offsetMm = 0;
      if (Math.abs(Math.abs(lz) - d / 2) < band && Math.abs(lx) < w / 2 - 0.05) {
        wall = lz > 0 ? 'front' : 'back';
        offsetMm = Math.round(lx * 1000);
      } else if (Math.abs(Math.abs(lx) - w / 2) < band && Math.abs(lz) < d / 2 - 0.05) {
        wall = lx > 0 ? 'right' : 'left';
        offsetMm = Math.round(lz * 1000);
      }
      if (!wall) { setHit(null); return; }
      setHit({ wall, offsetMm, pos: [lx, Math.min(Math.max(y, baseH + 0.8), baseH + h - 0.2), lz] });
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setHit(null); };
    window.addEventListener('wall-clicked', onWallClick);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('wall-clicked', onWallClick); window.removeEventListener('keydown', onKey); };
  }, [room.x, room.z, room.rot, room.widthMm, room.depthMm, room.wallThicknessMm, h, baseH]);

  const viewMode = useStore(s => s.viewMode);
  const isExporting = useStore(s => s.isExporting);
  if (viewMode === 'walking' || viewMode === 'capture' || viewMode === 'render' || isExporting) return null;

  const add = (kind: 'door' | 'window') => {
    if (!hit) return;
    const st = useStore.getState();
    st.saveState();
    if (kind === 'door') st.addDoorAt(hit.wall, hit.offsetMm);
    else st.addWindowAt(hit.wall, hit.offsetMm);
    setHit(null);
  };

  // A permanent + button on the middle of each wall, plus the popup chip at
  // whatever point was chosen (via a + button or a direct wall click).
  const w = room.widthMm / 1000, d = room.depthMm / 1000;
  const midY = baseH + h * 0.55;
  const wallButtons: { wall: 'front' | 'back' | 'left' | 'right'; pos: [number, number, number] }[] = [
    { wall: 'front', pos: [0, midY, d / 2 + 0.12] },
    { wall: 'back', pos: [0, midY, -d / 2 - 0.12] },
    { wall: 'left', pos: [-w / 2 - 0.12, midY, 0] },
    { wall: 'right', pos: [w / 2 + 0.12, midY, 0] },
  ];

  return (
    <>
      {wallButtons.map(b => (
        <Html key={`wall-add-${b.wall}`} position={b.pos} center zIndexRange={[125, 0]}>
          <button
            title={`Add a window or door to the ${b.wall} wall`}
            style={{ pointerEvents: 'auto' }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setHit({ wall: b.wall, offsetMm: 0, pos: b.pos }); }}
            className="w-7 h-7 rounded-full bg-white/90 backdrop-blur-md border border-black/10 shadow-md text-[#3b4d4a] text-base font-bold leading-none hover:bg-[#3b4d4a] hover:text-white hover:scale-110 transition-all"
          >
            +
          </button>
        </Html>
      ))}
      {hit && (
        <Html position={hit.pos} center zIndexRange={[130, 0]}>
          <div
            style={{ pointerEvents: 'auto' }}
            className="flex items-center gap-1 bg-white/95 backdrop-blur-md border border-black/10 rounded-full shadow-xl px-2 py-1.5 whitespace-nowrap"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button onClick={() => add('window')} className="px-3 py-1.5 rounded-full text-[11px] font-bold text-white bg-[#3b4d4a] hover:bg-[#2d3a38] transition-colors">+ Window</button>
            <button onClick={() => add('door')} className="px-3 py-1.5 rounded-full text-[11px] font-bold text-[#3b4d4a] bg-black/5 hover:bg-black/10 transition-colors">+ Door</button>
            <button onClick={() => setHit(null)} className="px-2 py-1.5 rounded-full text-[11px] font-bold text-gray-400 hover:text-gray-600">✕</button>
          </div>
        </Html>
      )}
    </>
  );
}

function AnimatedDoorLeaves({ door, frameColorHex, frameThickness, sashThickness, depth, room }: { door: any, frameColorHex: string, frameThickness: number, sashThickness: number, depth: number, room: Room }) {
  const { areDoorsOpen, toggleDoors, viewMode } = useStore();
  const leavesRef = useRef<THREE.Group[]>([]);

  /**
   * True once every leaf has reached its target, so the loop can stop working.
   *
   * lerp approaches its target asymptotically and never quite arrives, so
   * without this the door maths ran for every leaf of every door on every
   * frame, for the entire session, long after the doors had visibly stopped
   * moving. Reset whenever the target changes.
   */
  const settledRef = useRef(false);
  useEffect(() => { settledRef.current = false; }, [areDoorsOpen, door?.leaves, door?.widthMm]);

  useFrame((_, delta) => {
    if (!door || settledRef.current) return;

    // Sliders mostly open by pushing all but one leaf to one side
    const leafW = (door.widthMm/1000 - frameThickness*1.5) / door.leaves;
    const isSingle = door.leaves === 1;
    let moving = false;

    leavesRef.current.forEach((leaf, i) => {
      if (!leaf) return;

      const targetX = areDoorsOpen && !isSingle 
        ? - (door.widthMm/1000 - frameThickness*1.5)/2 + (leafW/2) + Math.min(i, 0.5) * leafW * 0.2 // Cascade to left
        : - (door.widthMm/1000 - frameThickness*1.5)/2 + (leafW/2) + i * leafW;
      
      const targetRotY = areDoorsOpen && isSingle 
        ? Math.PI / 2 // Swing 90 deg
        : 0;

      // Sub-millimetre at this scale, and well under a pixel on screen.
      if (Math.abs(leaf.position.x - targetX) > 0.0005 || Math.abs(leaf.rotation.y - targetRotY) > 0.0005) {
          moving = true;
      }

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

    // Snap to the exact target on the last frame, so parking the animation can
    // never leave a leaf a fraction out of place.
    if (!moving) {
      leavesRef.current.forEach((leaf, i) => {
        if (!leaf) return;
        leaf.position.x = areDoorsOpen && !isSingle
          ? - (door.widthMm/1000 - frameThickness*1.5)/2 + (leafW/2) + Math.min(i, 0.5) * leafW * 0.2
          : - (door.widthMm/1000 - frameThickness*1.5)/2 + (leafW/2) + i * leafW;
        leaf.rotation.y = areDoorsOpen && isSingle ? Math.PI / 2 : 0;
        if (isSingle) {
          leaf.position.x += Math.sin(leaf.rotation.y) * leafW/2;
          leaf.position.z = Math.cos(leaf.rotation.y) * leafW/2 - leafW/2;
        }
      });
      settledRef.current = true;
    }
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

            {/* Panel: glass, or a solid slab for the entrance-door style */}
            {door.style === 'solid' ? (
              <mesh castShadow>
                <boxGeometry args={[leafW - sashThickness*2, door.heightMm/1000 - frameThickness*2 - sashThickness*2, 0.045]} />
                <meshStandardMaterial color={frameColorHex} metalness={0.35} roughness={0.55} />
              </mesh>
            ) : (
              <mesh>
                <boxGeometry args={[leafW - sashThickness*2, door.heightMm/1000 - frameThickness*2 - sashThickness*2, 0.02]} />
                <meshPhysicalMaterial color="#aabed1" transmission={0.9} ior={1.5} thickness={0.05} roughness={0.1} clearcoat={1} envMapIntensity={3} />
              </mesh>
            )}
            {door.style === 'crittall' && (
              <CrittallBars
                glassW={leafW - sashThickness*2}
                glassH={door.heightMm/1000 - frameThickness*2 - sashThickness*2}
                depth={0.03}
                color={frameColorHex}
              />
            )}
          </group>
        )
      })}
    </>
  );
}

/**
 * One internal wall: the unified system.
 *
 * - Click SELECTS it (persistent, not hover) - the old handles lived behind
 *   isHovered, so drifting off the tiny handle mid-drag unmounted it and the
 *   drag died after a step or two.
 * - Drag the WALL BODY to move it: perpendicular position snaps to other
 *   parallel walls; the ends snap to the room's inner wall faces and to
 *   perpendicular internal walls (120mm magnet, 50mm grid otherwise).
 * - End handles resize, with the moving end snapping to the same targets.
 * - Doors BELONG to the wall (offset from its centre) so they travel with
 *   it; each door has a slide handle, and its opening is cut from this
 *   wall's own geometry in local space.
 */
function PartitionUnit({ part, hP, room, showDims }: { part: any; hP: number; room: any; showDims: boolean }) {
  const isSelected = useStore(s => s.selectedElementId === `part-${part.id}`);
  const [dragging, setDragging] = useState(false);
  const grabRef = useRef<{ dx: number; dz: number } | null>(null);
  const dragPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const pL = part.lengthMm / 1000;
  const pT = part.thicknessMm / 1000;
  const pX = part.xMm / 1000;
  const pZ = part.zMm / 1000;
  const rotAngle = part.rotation === 90 ? Math.PI / 2 : 0;

  const wallTmm = room.wallThicknessMm || 150;
  const innerX = room.widthMm / 2 - wallTmm;
  const innerZ = room.depthMm / 2 - wallTmm;
  const others = (room.partitions || []).filter((p: any) => p.id !== part.id);

  const snapNear = (v: number, targets: number[], tol = 120) => {
    let best: number | null = null;
    for (const t of targets) if (Math.abs(v - t) < tol && (best === null || Math.abs(v - t) < Math.abs(v - best))) best = t;
    return best;
  };

  const onDown = (e: any) => {
    e.stopPropagation();
    const st = useStore.getState();
    st.setSelectedElementId(`part-${part.id}`);
    if (st.viewMode === 'walking') return;
    st.saveState();
    setDragging(true);
    st.setControlsEnabled(false);
    try { e.target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    grabRef.current = { dx: e.point.x - pX, dz: e.point.z - pZ };
  };
  const onUp = (e: any) => {
    e.stopPropagation();
    setDragging(false);
    useStore.getState().setControlsEnabled(true);
    try { e.target.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    grabRef.current = null;
  };
  const onMove = (e: any) => {
    if (!dragging || !grabRef.current) return;
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(dragPlane, hit)) return;
    const st = useStore.getState();
    const cur = (st.scene.room.partitions || []).find((p: any) => p.id === part.id);
    if (!cur) return;
    let cx = (hit.x - grabRef.current.dx) * 1000;
    let cz = (hit.z - grabRef.current.dz) * 1000;
    const half = cur.lengthMm / 2;
    const halfT = cur.thicknessMm / 2;
    if (cur.rotation === 0) {
      cz = snapNear(cz, others.filter((p: any) => p.rotation === 0).map((p: any) => p.zMm)) ?? Math.round(cz / 50) * 50;
      cz = Math.min(innerZ - halfT, Math.max(-(innerZ - halfT), cz));
      const endTargets = [-innerX, innerX, ...others.filter((p: any) => p.rotation === 90).map((p: any) => p.xMm)];
      const leftSnap = snapNear(cx - half, endTargets);
      const rightSnap = snapNear(cx + half, endTargets);
      cx = leftSnap !== null ? leftSnap + half : rightSnap !== null ? rightSnap - half : Math.round(cx / 50) * 50;
      cx = Math.min(innerX - half, Math.max(-innerX + half, cx));
    } else {
      cx = snapNear(cx, others.filter((p: any) => p.rotation === 90).map((p: any) => p.xMm)) ?? Math.round(cx / 50) * 50;
      cx = Math.min(innerX - halfT, Math.max(-(innerX - halfT), cx));
      const endTargets = [-innerZ, innerZ, ...others.filter((p: any) => p.rotation === 0).map((p: any) => p.zMm)];
      const nearSnap = snapNear(cz - half, endTargets);
      const farSnap = snapNear(cz + half, endTargets);
      cz = nearSnap !== null ? nearSnap + half : farSnap !== null ? farSnap - half : Math.round(cz / 50) * 50;
      cz = Math.min(innerZ - half, Math.max(-innerZ + half, cz));
    }
    st.updatePartition(part.id, { xMm: cx, zMm: cz });
  };

  /** Resize from one end; the MOVING end magnetises to the same targets. */
  const resizeEnd = (movingPositive: boolean) => (delta: number) => {
    const st = useStore.getState();
    const cur = (st.scene.room.partitions || []).find((p: any) => p.id === part.id);
    if (!cur) return;
    const horiz = cur.rotation === 0;
    // Local +X maps to world +X (rot 0) or world -Z (rot 90, per the group rotation).
    const worldDelta = delta * 1000;
    const centre = horiz ? cur.xMm : cur.zMm;
    const half = cur.lengthMm / 2;
    const fixedEnd = movingPositive ? centre - half : centre + half;
    let movingEnd = (movingPositive ? centre + half : centre - half) + worldDelta;
    const endTargets = horiz
      ? [-innerX, innerX, ...others.filter((p: any) => p.rotation === 90).map((p: any) => p.xMm)]
      : [-innerZ, innerZ, ...others.filter((p: any) => p.rotation === 0).map((p: any) => p.zMm)];
    movingEnd = snapNear(movingEnd, endTargets) ?? Math.round(movingEnd / 100) * 100;
    const newL = Math.max(300, Math.abs(movingEnd - fixedEnd));
    const newCentre = (fixedEnd + (movingPositive ? fixedEnd + newL : fixedEnd - newL)) / 2;
    // Keep doors inside the shortened wall.
    const doors = (cur.doors || []).map((dr: any) => ({
      ...dr,
      offsetMm: Math.min(newL / 2 - dr.widthMm / 2 - 50, Math.max(-(newL / 2 - dr.widthMm / 2 - 50), dr.offsetMm)),
    }));
    st.updatePartition(part.id, horiz ? { lengthMm: newL, xMm: newCentre, doors } : { lengthMm: newL, zMm: newCentre, doors });
  };

  const doorHeight = (dr: any) => Math.min(dr.heightMm / 1000, hP - 0.05);

  return (
    <group
      position={[pX, hP / 2, pZ]}
      rotation={[0, rotAngle, 0]}
      onPointerOver={(e: any) => { e.stopPropagation(); useStore.getState().setHoveredElementId(`part-${part.id}`); }}
      onPointerOut={() => useStore.getState().setHoveredElementId(null)}
    >
      <mesh castShadow receiveShadow onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <Geometry>
          <Base>
            <boxGeometry args={[pL, hP, pT]} />
          </Base>
          {/* This wall's OWN doors, cut in local space - they move with it. */}
          {(part.doors || []).map((dr: any) => (
            <Subtraction key={dr.id} position={[dr.offsetMm / 1000, doorHeight(dr) / 2 - hP / 2, 0]}>
              <boxGeometry args={[dr.widthMm / 1000, doorHeight(dr), 0.4]} />
            </Subtraction>
          ))}
          {/* Legacy world-positioned interior doors from old saves. */}
          {(room.interiorDoors || []).map((door: any) => {
            const dW = door.widthMm / 1000;
            const dH = door.heightMm / 1000;
            const dx = door.xMm / 1000 - pX;
            const dz = door.zMm / 1000 - pZ;
            const dy = dH / 2 - hP / 2;
            let localX = dx;
            let localZ = dz;
            if (part.rotation === 90) { localX = -dz; localZ = dx; }
            const relRot = door.rotation === part.rotation ? 0 : Math.PI / 2;
            return (
              <Subtraction key={door.id} position={[localX, dy, localZ]} rotation={[0, relRot, 0]}>
                <boxGeometry args={[dW, dH, 0.4]} />
              </Subtraction>
            );
          })}
        </Geometry>
        <meshStandardMaterial
          color={room.interiorColor || '#ffffff'}
          roughness={0.9}
          emissive={isSelected ? '#10b981' : '#000000'}
          emissiveIntensity={isSelected ? 0.18 : 0}
        />
      </mesh>

      {/* L-shape leg: a perpendicular run welded to one end of the main
          wall, so a corner is ONE unit instead of two walls nudged together.
          It shares the group, so body-drag, rotate and selection all treat
          the L as a single wall. */}
      {(part.legLengthMm || 0) > 100 && (() => {
        const legL = part.legLengthMm / 1000;
        const le = part.legEnd === -1 ? -1 : 1;
        const ld = part.legDir === -1 ? -1 : 1;
        return (
          <mesh
            position={[le * (pL / 2 - pT / 2), 0, ld * (legL / 2 + pT / 2)]}
            castShadow receiveShadow
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          >
            <boxGeometry args={[pT, hP, legL]} />
            <meshStandardMaterial
              color={room.interiorColor || '#ffffff'}
              roughness={0.9}
              emissive={isSelected ? '#10b981' : '#000000'}
              emissiveIntensity={isSelected ? 0.18 : 0}
            />
          </mesh>
        );
      })()}

      {/* Door frames for this wall's own doors. */}
      {(part.doors || []).map((dr: any) => {
        const dW = dr.widthMm / 1000;
        const dH = doorHeight(dr);
        const ox = dr.offsetMm / 1000;
        const oy = dH / 2 - hP / 2;
        return (
          <group key={`frame-${dr.id}`} position={[ox, oy, 0]}>
            <mesh position={[-dW / 2 + 0.015, 0, 0]} castShadow><boxGeometry args={[0.03, dH, pT + 0.02]} /><meshStandardMaterial color="#e8e2d8" roughness={0.7} /></mesh>
            <mesh position={[dW / 2 - 0.015, 0, 0]} castShadow><boxGeometry args={[0.03, dH, pT + 0.02]} /><meshStandardMaterial color="#e8e2d8" roughness={0.7} /></mesh>
            <mesh position={[0, dH / 2 - 0.015, 0]} castShadow><boxGeometry args={[dW, 0.03, pT + 0.02]} /><meshStandardMaterial color="#e8e2d8" roughness={0.7} /></mesh>
          </group>
        );
      })}

      {showDims && isSelected && (
        <>
          {/* End handles: red, on the wall's local X axis ends. Local +X is
              world +X for rot 0 and world -Z for rot 90, so the drag axis and
              delta sign map accordingly. */}
          <DragHandle elementId={`part-${part.id}`} position={[pL / 2, 0, 0]} axis={part.rotation === 0 ? 'x' : 'z'} color="#ff0000" visualAxis="x" snapInterval={0.05}
            onChange={(d) => resizeEnd(true)(part.rotation === 0 ? d : -d)} />
          <DragHandle elementId={`part-${part.id}`} position={[-pL / 2, 0, 0]} axis={part.rotation === 0 ? 'x' : 'z'} color="#ff0000" visualAxis="x" snapInterval={0.05}
            onChange={(d) => resizeEnd(false)(part.rotation === 0 ? d : -d)} />
          {/* Leg tip handle: blue, resizes the L-shape leg. Local +Z maps to
              world +Z (rot 0) or world +X (rot 90). */}
          {(part.legLengthMm || 0) > 100 && (
            <DragHandle elementId={`part-${part.id}`}
              position={[(part.legEnd === -1 ? -1 : 1) * (pL / 2 - pT / 2), 0, (part.legDir === -1 ? -1 : 1) * (part.legLengthMm / 1000 + pT / 2)]}
              axis={part.rotation === 0 ? 'z' : 'x'} color="#2563eb" visualAxis="z" snapInterval={0.05}
              onChange={(d) => {
                const st = useStore.getState();
                const cur = (st.scene.room.partitions || []).find((p: any) => p.id === part.id);
                if (!cur) return;
                const localDz = cur.rotation === 0 ? d : d; // world z (rot 0) / world x (rot 90) both map to local +z
                const dirSign = cur.legDir === -1 ? -1 : 1;
                const next = Math.max(300, Math.round((cur.legLengthMm + dirSign * localDz * 1000) / 100) * 100);
                st.updatePartition(part.id, { legLengthMm: next });
              }} />
          )}
          {/* Door slide handles: green, above each opening. */}
          {(part.doors || []).map((dr: any) => (
            <DragHandle key={`slide-${dr.id}`} elementId={`part-${part.id}`} position={[dr.offsetMm / 1000, hP / 2 + 0.18, 0]} axis={part.rotation === 0 ? 'x' : 'z'} color="#10b981" visualAxis="x" snapInterval={0.05}
              onChange={(d) => {
                const st = useStore.getState();
                const cur = (st.scene.room.partitions || []).find((p: any) => p.id === part.id);
                if (!cur) return;
                const curDr = (cur.doors || []).find((x: any) => x.id === dr.id);
                if (!curDr) return;
                const local = part.rotation === 0 ? d : -d;
                const lim = cur.lengthMm / 2 - curDr.widthMm / 2 - 50;
                const next = Math.min(lim, Math.max(-lim, Math.round((curDr.offsetMm + local * 1000) / 50) * 50));
                st.updatePartitionDoor(part.id, dr.id, { offsetMm: next });
              }} />
          ))}
        </>
      )}
    </group>
  );
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

  // baseH must be declared before the gable height calculation below uses it.
  // It previously sat ~60 lines further down, which put this reference inside
  // the const's temporal dead zone. Because the ternary short-circuits, the Box
  // shape never evaluated that branch and looked fine — but selecting Gable
  // threw "Cannot access 'baseH' before initialization" during render, which
  // unmounted the whole 3D scene and left a black screen.
  const baseH = (room.baseHeightMm ?? 100) / 1000;

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
  // Side-orientation gable: ridge runs left-to-right, apex triangles on the
  // side walls (the annexe look). The slope then spans the DEPTH, so every
  // "across the slope" dimension switches from w/ohLeft/ohRight to
  // d/ohFront/ohBack, and the run along the ridge from roofD to roofW.
  const isSideGable = isGable && room.gableOrientation === 'side';
  const gSpan = isSideGable ? d : w;
  const gOhLow1 = isSideGable ? ohFront : ohLeft;
  const gOhLow2 = isSideGable ? ohBack : ohRight;
  const gRunLen = isSideGable ? roofW : roofD;
  const gablePitch = isGable ? Math.atan2(roofHRaw, gSpan/2) : 0;

  
  const hoveredElementId = useStore((s) => s.hoveredElementId);
  const isHoveredRoom = hoveredElementId === 'room';

  // Quba mono-pitch slope
  const isQuba = room.shape === 'Quba';
  const isTShape = false;
  const isCornerCut = false;
  const tCutW = 0;
  const tCutD = 0;
  const cornerCutSize = 0;


  // Base h for backward compatibility in variables
  const h = maxH; 
  
  const isVertical = room.claddingOrientation !== 'vertical';
  const texFront = useRealMaterial(room.claddingFront || room.cladding || 'timber', w, frontH, 0);
  const texBack = useRealMaterial(room.claddingBack || room.cladding || 'timber', w, backH, 0);
  const texLeft = useRealMaterial(room.claddingLeft || room.cladding || 'timber', d, maxH, 0);
  const texRight = useRealMaterial(room.claddingRight || room.cladding || 'timber', d, maxH, 0);
  const texRoof = useRealMaterial(room.roofMaterial || 'epdm', roofW, roofD, 0);
  const texBase = useRealMaterial(room.baseMaterial || 'concrete', baseW, baseD, 0);
  // Falls back to the cladding's DECKING equivalent, not the cladding key
  // itself - see resolveDeckingKey. Reusing the cladding key laid the vertical
  // slat texture across the deck instead of decking boards.
  const texDecking = useRealMaterial(resolveDeckingKey(room.deckingMaterial, room.cladding), baseW, deckFront, 0);
  const texFloor = useRealMaterial(room.interiorFloorType || 'oak', w, d, 0);

  const isVert = room.claddingOrientation !== 'vertical';
  const geomFrontWall = useMemo(() => createCladdingGeometry(w, frontH, isVert), [w, frontH, isVert]);
  const geomBackWall = useMemo(() => createCladdingGeometry(w, backH, isVert), [w, backH, isVert]);
  const geomLeftWall = useMemo(() => createCladdingGeometry(d, maxH, isVert), [d, maxH, isVert]);
  const geomRightWall = useMemo(() => createCladdingGeometry(d, maxH, isVert), [d, maxH, isVert]);
  const geomDecking = useMemo(() => createDeckingGeometry(baseW, deckFront), [baseW, deckFront]);



  const isDeckingMaterial = room.hasDecking || room.hasPictureFrame || room.baseMaterial === 'timber_decking' || room.baseMaterial === 'composite_decking';

  const baseMaterialColors: Record<string, string> = { concrete: '#8a8d8f', timber_decking: '#a3794a', composite_decking: '#545a5e' };
  const roofMaterialColors: Record<string, string> = { epdm: '#222222', sedum: '#2d3032', upvc: '#d3d5d7', metal: '#6a6d70' };
  const frameColors: Record<string, string> = { anthracite: '#2d3032', black: '#1a1a1a', white: '#f0f0f0', silver: '#a0a4a8' };
  
  const baseColorHex = baseMaterialColors[room.baseMaterial as string] || '#8a8d8f';
  // An explicit roofColor overrides the colour implied by the roof material, so
  // the roof and the fascia can be specified independently rather than the roof
  // being locked to whatever its material happens to be.
  const roofColorHex = (room as any).roofColor || roofMaterialColors[room.roofMaterial as string] || '#222222';
  const frameColorHex = frameColors[room.frameColor] || frameColors.anthracite;

  // baseH is declared with the other height calculations further up.
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
  const pfLeftGeom = useMemo(() => createWorldScaleBoxGeometry(wallThickness + 0.002, pfHeight + 0.002, ohFront + 0.01, false, -w/2 + wallThickness/2, 0, d/2 + ohFront/2 - 0.005, isVertical), [wallThickness, pfHeight, ohFront, w, d, isVertical]);
  const pfRightGeom = useMemo(() => createWorldScaleBoxGeometry(wallThickness + 0.002, pfHeight + 0.002, ohFront + 0.01, false, w/2 - wallThickness/2, 0, d/2 + ohFront/2 - 0.005, isVertical), [wallThickness, pfHeight, ohFront, w, d, isVertical]);
  const pfTopGeom = useMemo(() => createWorldScaleBoxGeometry(w + 0.002, 0.3 + 0.002, ohFront + 0.01, false, 0, pfHeight - 0.3, d/2 + ohFront/2 - 0.005, isVertical), [w, ohFront, pfHeight, d, isVertical]);

  const claddingBoxGeom = useMemo(() => createWorldScaleBoxGeometry(w, h + 0.05, d, true, 0, 0, 0, isVertical), [w, h, d, isVertical]);
  const gableTriangleGeom = useMemo(() => createWorldScaleGableGeometry(gSpan, roofH, wallThickness, 0, h + 0.05, 0, isVertical), [gSpan, roofH, wallThickness, h, isVertical]);
  const lShapeCutOuterGeom = useMemo(() => createWorldScaleBoxGeometry(cutW + 0.2, h + 1, cutD + 0.2, false, 0, 0, 0, isVertical), [cutW, cutD, h, roofH, isGable, isVertical]);
  // Roof plan size is exactly roofW x roofD (wall footprint + user overhangs).
  // A 100mm lip was previously baked in here (+0.2), so even with every
  // overhang at 0 the roof was never flush — overhang is now entirely the
  // user's Overhangs & Canopy setting.
  const roofFlatGeom = useMemo(() => createWorldScaleBoxGeometry(roofW, roofH, roofD, false, 0, 0, 0), [roofW, roofH, roofD]);
  // The slab thickness IS the visible fascia (bargeboard) depth on a gable -
  // user-adjustable, 100mm by default. Every roof edge overhangs 50mm: the
  // slabs run 50mm past both gable ends and 50mm past the eaves, like a real
  // roof line, instead of finishing dead flush with the cladding.
  const gableFascia = Math.min(0.4, Math.max(0.05, (room.gableFasciaMm ?? 100) / 1000));
  const ROOF_LIP = 0.05;
  const roofGableLeftGeom = useMemo(() => createWorldScaleBoxGeometry((gSpan/2 + gOhLow1) / Math.cos(gablePitch) + ROOF_LIP, gableFascia, gRunLen + ROOF_LIP * 2, false, 0, 0, 0), [gSpan, gOhLow1, gablePitch, gRunLen, gableFascia]);
  const roofGableRightGeom = useMemo(() => createWorldScaleBoxGeometry((gSpan/2 + gOhLow2) / Math.cos(gablePitch) + ROOF_LIP, gableFascia, gRunLen + ROOF_LIP * 2, false, 0, 0, 0), [gSpan, gOhLow2, gablePitch, gRunLen, gableFascia]);


  const renderBaseMeshes = () => {
    const materialProps = isDeckingMaterial ? {
      // Was hardcoded to "#ffffff", which discarded the chosen material's colour
      // entirely - every decking option rendered as the untinted texture, so
      // black composite came out pale.
      color: texDecking.color,
      map: texDecking.map,
      roughnessMap: texDecking.roughnessMap,
      normalMap: texDecking.normalMap, aoMap: texDecking.aoMap,
      
    } : {
      color: baseColorHex,
      roughness: 0.9,
      metalness: 0.1,
      
      
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

  // FROZEN + DEBOUNCED copies drive the CSG wall cutouts. The boolean
  // rebuild of the wall solid is expensive and visibly blanks the walls, so
  // it must never run while values are still moving:
  //  - 3D handle drags set controlsEnabled=false, so nothing updates until
  //    release;
  //  - sidebar sliders and other continuous inputs DON'T touch
  //    controlsEnabled, so a 300ms settle debounce catches those - the
  //    rebuild fires once when the user pauses, not on every tick.
  // While values move, the frames + dark overlay planes track at full rate.
  const [csgDoors, setCsgDoors] = useState(room.doors);
  const [csgWindows, setCsgWindows] = useState(room.windows);
  // No rebuild while ANY pointer is held down. Sidebar sliders never touch
  // controlsEnabled, so the settle-debounce alone still fired during slow
  // slider drags (every >300ms hesitation = one wall rebuild under the
  // user's finger). A held mouse button anywhere now blocks the commit; the
  // release re-arms the debounce and the rebuild lands 150ms later.
  const [pointerHeld, setPointerHeld] = useState(false);
  useEffect(() => {
    const dn = () => setPointerHeld(true);
    const up = () => setPointerHeld(false);
    window.addEventListener('pointerdown', dn, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      window.removeEventListener('pointerdown', dn, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, []);
  useEffect(() => {
    if (!controlsEnabled || pointerHeld) return; // frozen while interacting
    const t = setTimeout(() => {
      setCsgDoors(room.doors);
      setCsgWindows(room.windows);
    }, 150);
    return () => clearTimeout(t);
  }, [room.doors, room.windows, controlsEnabled, pointerHeld]);
  const deferredDoors = csgDoors;
  const deferredWindows = csgWindows;

  return (
    <group position={[room.x / 1000, 0, room.z / 1000]} rotation={[0, room.rot, 0]}>
      {/* Interior light to prevent partitions from being too dark */}
      <pointLight position={[0, h - 0.5, 0]} intensity={1.5} distance={15} decay={2} castShadow={false} />

      {/* Base Plinth / Decking Area */}
      {renderBaseMeshes()}

      {/* Click-to-add chip for walls */}
      {!isPlanView && <WallAddChip room={room} h={h} baseH={baseH} />}

      {/* Main Elevated Structure */}
      <group position={[0, baseH, 0]}>
        {/* Main Structure via CSG. The element is memoized so renders caused by
            per-step drag updates reuse the same element and React skips the
            subtree — the boolean ops only re-run when one of the deps below
            actually changes (deferredDoors/deferredWindows settle after drag). */}
        {useMemo(() => (
        <mesh
          castShadow
          receiveShadow
          onPointerOver={(e) => { e.stopPropagation(); useStore.getState().setHoveredElementId('room'); }}
          onPointerOut={() => useStore.getState().setHoveredElementId(null)}
          onClick={(e) => {
            // Click-to-add: hand the wall click point to the add-chip.
            // Closure-free (event dispatch only) so the CSG memo needs no
            // extra deps. The chip decides which wall face was hit.
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('wall-clicked', { detail: { x: e.point.x, y: e.point.y, z: e.point.z } }));
          }}
        >
          <Geometry useGroups>
            {/* Main block */}
            <Base position={[0, (h + 0.05)/2, 0]}>
              <primitive object={claddingBoxGeom} attach="geometry" />
              <meshStandardMaterial key="mat-0" attach="material-0" color="#ffffff" {...texRight}  metalness={0.1}  bumpScale={0.1} />
              <meshStandardMaterial key="mat-1" attach="material-1" color="#ffffff" {...texLeft}  metalness={0.1}  bumpScale={0.1} />
              <meshStandardMaterial key="mat-2" attach="material-2" color="#ffffff" {...texFront}  metalness={0.1}  bumpScale={0.1} />
              <meshStandardMaterial key="mat-3" attach="material-3" color="#ffffff" {...texFront}  metalness={0.1}  bumpScale={0.1} />
              <meshStandardMaterial attach="material-4" color="#ffffff" {...texFront}  metalness={0.1}  bumpScale={0.1} />
              <meshStandardMaterial attach="material-5" color="#ffffff" {...texBack}  metalness={0.1}  bumpScale={0.1} />
            </Base>

            {room.hasPictureFrame && (
              <>
                <Addition position={[-w/2 + wallThickness/2, isGable ? (h+roofH)/2 : (h+0.05)/2, d/2 + ohFront/2 - 0.005]}>
                  <primitive object={pfLeftGeom} attach="geometry" />
                  <meshStandardMaterial color="#ffffff" {...texFront}  metalness={0.1}  bumpScale={0.1} />
                </Addition>
                <Addition position={[w/2 - wallThickness/2, isGable ? (h+roofH)/2 : (h+0.05)/2, d/2 + ohFront/2 - 0.005]}>
                  <primitive object={pfRightGeom} attach="geometry" />
                  <meshStandardMaterial color="#ffffff" {...texFront}  metalness={0.1}  bumpScale={0.1} />
                </Addition>
                <Addition position={[0, pfHeight - 0.15, d/2 + ohFront/2 - 0.005]}>
                  <primitive object={pfTopGeom} attach="geometry" />
                  <meshStandardMaterial color="#ffffff" {...texFront}  metalness={0.1}  bumpScale={0.1} />
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
                  metalness={0.1}
                  bumpScale={0.1}
                />
              </Subtraction>
            )}

            {/* TShape Outer Cutout */}
            

            {/* CornerCut Outer Cutout */}
            

            {/* Gable end triangles. NEVER in plan view: a floor plan has no
                gable ends, and their CSG faces sit coplanar with the interior
                cutout boundary - the artifact faces that produced read as
                external cladding covering the whole floor from above. */}
            {isGable && !isPlanView && (

          
              <>


                {/* Apex triangles: front/back walls for the 'front' ridge
                    orientation, side walls (rotated 90°) for 'side'. The
                    front triangle is skipped when the apex is glazed - the
                    glazing unit rendered separately fills the opening. */}
                {isSideGable ? (
                  <>
                    {!room.hasApexGlazing && (
                    <>
                    <Addition position={[w/2 - wallThickness/2, h + 0.025, 0]} rotation={[0, Math.PI/2, 0]}>
                      <primitive object={gableTriangleGeom} attach="geometry" />
                      <meshStandardMaterial color="#ffffff" {...texRight}  metalness={0.1}  bumpScale={0.1} />
                    </Addition>
                    <Addition position={[-w/2 + wallThickness/2, h + 0.025, 0]} rotation={[0, Math.PI/2, 0]}>
                      <primitive object={gableTriangleGeom} attach="geometry" />
                      <meshStandardMaterial color="#ffffff" {...texLeft}  metalness={0.1}  bumpScale={0.1} />
                    </Addition>
                    </>
                    )}
                  </>
                ) : (
                  <>
                    {!room.hasApexGlazing && (
                    <Addition position={[0, h + 0.025, d/2 - wallThickness/2]}>
                      <primitive object={gableTriangleGeom} attach="geometry" />
                      <meshStandardMaterial color="#ffffff" {...texFront}  metalness={0.1}  bumpScale={0.1} />
                    </Addition>
                    )}
                    <Addition position={[0, h + 0.025, -d/2 + wallThickness/2]}>
                      <primitive object={gableTriangleGeom} attach="geometry" />
                      <meshStandardMaterial color="#ffffff" {...texBack}  metalness={0.1}  bumpScale={0.1} />
                    </Addition>
                  </>
                )}

          
              </>

          
            )}

          
            {/* Main Interior Cutout (split into non-overlapping boxes to avoid nested Geometry issues) */}
            {(!isLShape && !isTShape && !isCornerCut) && (
              <Subtraction position={[0, h/2, 0]}>
                <boxGeometry args={[w - wallThickness*2, h + 1, d - wallThickness*2]} />
                <meshStandardMaterial color={room.interiorColor || '#ffffff'} roughness={0.9} />
              </Subtraction>
            )}

            {isLShape && (
              <>
                {/* Left part of the L */}
                <Subtraction position={[-cutW/2, h/2, 0]}>
                  <boxGeometry args={[w - cutW - wallThickness*2, h + 1, d - wallThickness*2]} />
                  <meshStandardMaterial color={room.interiorColor || '#ffffff'} roughness={0.9} />
                </Subtraction>
                {/* Back-right part of the L */}
                <Subtraction position={[w/2 - cutW/2 - wallThickness, h/2, -cutD/2]}>
                  <boxGeometry args={[cutW + wallThickness*2, h + 1, d - cutD - wallThickness*2]} />
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
            {(deferredDoors || []).map(door => {
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
            {(deferredWindows || []).map(win => {
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
        ), [
          claddingBoxGeom, pfLeftGeom, pfRightGeom, pfTopGeom, lShapeCutOuterGeom, gableTriangleGeom,
          texFront.map, texBack.map, texLeft.map, texRight.map,
          texFront.color, texBack.color, texLeft.color, texRight.color, texFront.roughness,
          room.hasPictureFrame, room.interiorColor, room.hasApexGlazing, isSideGable,
          w, d, h, wallThickness, roofH, pfHeight, ohFront,
          isLShape, isTShape, isCornerCut, isGable, isPitched,
          cutW, cutD, frontH, backH, roofPitch,
          deferredDoors, deferredWindows,
        ])}

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
        {/* For the side orientation the whole assembly (built along X) is
            rotated 90° about Y: local X maps to world -Z (the slope spans the
            depth) and local Z to world +X (the ridge runs left-to-right).
            gSpan/gOhLow1/gOhLow2/gRunLen carry the swapped dimensions. */}
        {!isPlanView && isGable && (
          <group position={[roofX, h, roofZ]} rotation={[0, isSideGable ? Math.PI/2 : 0, 0]}>
            {/* Left Roof Plane */}
            <mesh position={[-gSpan/4 - gOhLow1/2 - (ROOF_LIP/2) * Math.cos(gablePitch), roofH/2 - gOhLow1 * Math.tan(gablePitch)/2 - (ROOF_LIP/2) * Math.sin(gablePitch), 0]} rotation={[0, 0, gablePitch]} castShadow receiveShadow>
               <primitive object={roofGableLeftGeom} attach="geometry" />

               {(() => {
                const getFasciaMat = (side) => {
                  const matKey = 'fascia-left-' + side + '-' + room.fasciaMaterial + '-' + room.cladding + '-' + room.claddingOrientation;
                  if (room.fasciaMaterial === 'match_cladding') {
                    const tex = side === 'front' ? texFront : side === 'back' ? texBack : side === 'left' ? texLeft : texRight;
                    // propsFront/Back/Left/Right were referenced here but never
                    // declared anywhere in this file, so choosing "Match Cladding"
                    // threw a ReferenceError during render and blanked the scene.
                    // The material values come from the cladding texture itself.
                    return <meshStandardMaterial key={matKey} color={tex.color} map={tex.map} normalMap={tex.normalMap} roughnessMap={tex.roughnessMap} roughness={tex.roughness} metalness={0.05} bumpScale={0.1} />;
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
            <mesh position={[gSpan/4 + gOhLow2/2 + (ROOF_LIP/2) * Math.cos(gablePitch), roofH/2 - gOhLow2 * Math.tan(gablePitch)/2 - (ROOF_LIP/2) * Math.sin(gablePitch), 0]} rotation={[0, 0, -gablePitch]} castShadow receiveShadow>
               <primitive object={roofGableRightGeom} attach="geometry" />
               
               {(() => {
                const getFasciaMat = (side) => {
                  const matKey = 'fascia-right-' + side + '-' + room.fasciaMaterial + '-' + room.cladding + '-' + room.claddingOrientation;
                  if (room.fasciaMaterial === 'match_cladding') {
                    const tex = side === 'front' ? texFront : side === 'back' ? texBack : side === 'left' ? texLeft : texRight;
                    // propsFront/Back/Left/Right were referenced here but never
                    // declared anywhere in this file, so choosing "Match Cladding"
                    // threw a ReferenceError during render and blanked the scene.
                    // The material values come from the cladding texture itself.
                    return <meshStandardMaterial key={matKey} color={tex.color} map={tex.map} normalMap={tex.normalMap} roughnessMap={tex.roughnessMap} roughness={tex.roughness} metalness={0.05} bumpScale={0.1} />;
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
                <mesh position={[-gSpan/4 - gOhLow1/2 - 0.06 * Math.sin(gablePitch), roofH/2 - gOhLow1 * Math.tan(gablePitch)/2 + 0.06 * Math.cos(gablePitch), 0]} rotation={[0, 0, gablePitch]} castShadow receiveShadow>
                   <boxGeometry args={[(gSpan/2 + gOhLow1) / Math.cos(gablePitch), 0.02, gRunLen - 0.02]} />
                   <meshStandardMaterial color="#ffffff" {...texRoof}  bumpScale={0.1} roughness={0.9} />
                </mesh>
                <mesh position={[gSpan/4 + gOhLow2/2 + 0.06 * Math.sin(gablePitch), roofH/2 - gOhLow2 * Math.tan(gablePitch)/2 + 0.06 * Math.cos(gablePitch), 0]} rotation={[0, 0, -gablePitch]} castShadow receiveShadow>
                   <boxGeometry args={[(gSpan/2 + gOhLow2) / Math.cos(gablePitch), 0.02, gRunLen - 0.02]} />
                   <meshStandardMaterial color="#ffffff" {...texRoof}  bumpScale={0.1} roughness={0.9} />
                </mesh>
              </>
            )}

            {/* Ridge cap: the two sloped slabs meet square-cut at the apex,
                which left an open V gap along the ridge. A real roof closes
                this with a ridge piece - so does this one. */}
            <mesh position={[isSideGable ? roofZ : -roofX, roofH + gableFascia / (2 * Math.cos(gablePitch)), 0]} castShadow>
              <boxGeometry args={[0.24 + gableFascia, 0.07, gRunLen + ROOF_LIP * 2 + 0.02]} />
              <meshStandardMaterial color={roofColorHex} metalness={0.4} roughness={0.5} />
            </mesh>

            {/* NO separate gable-end meshes here. The wall mesh itself already
                ADDS clad gable triangles (gableTriangleGeom) as part of the
                same CSG piece, with UVs that continue the wall's boards. A
                second overlapping triangle z-fought with it - the "glitching
                like it's not the same piece" was two coplanar copies. */}
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

        {/* Roof Fascia & EPDM flat roof.
            NOT for gables: on a gable this prism's end faces painted a
            fascia-coloured triangle over the entire gable end, its cut faces
            z-fought with the sloped slabs, and the flat "flashing" sheet at
            ridge height read as a giant dark plate floating on the roof. The
            gable's ends, fascia and ridge are built explicitly below. */}
        {!isPlanView && !isGable && (
          <group
            position={[roofX, (frontH + backH)/2 + roofH/2, roofZ]}
            rotation={[isPitched && !isGable ? roofPitch : 0, 0, 0]}
          >
            <mesh castShadow receiveShadow position={[0, 0, 0]}>
              
              {(() => {
                const getFasciaMat = (side) => {
                  const matKey = 'fascia-flat-' + side + '-' + room.fasciaMaterial + '-' + room.cladding + '-' + room.claddingOrientation;
                  if (room.fasciaMaterial === 'match_cladding') {
                    const tex = side === 'front' ? texFront : side === 'back' ? texBack : side === 'left' ? texLeft : texRight;
                    // propsFront/Back/Left/Right were referenced here but never
                    // declared anywhere in this file, so choosing "Match Cladding"
                    // threw a ReferenceError during render and blanked the scene.
                    // The material values come from the cladding texture itself.
                    return <meshStandardMaterial key={matKey} color={tex.color} map={tex.map} normalMap={tex.normalMap} roughnessMap={tex.roughnessMap} roughness={tex.roughness} metalness={0.05} bumpScale={0.1} />;
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
                  {room.fasciaMaterial === 'match_cladding' ? <primitive object={roofFlatGeom} attach="geometry" /> : <boxGeometry args={[roofW, roofH, roofD]} />}
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
                <boxGeometry args={[roofW + 0.02, 0.02, roofD + 0.02]} />
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
                  <boxGeometry args={[roofW - 0.02, 0.02, roofD - 0.02]} />
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

      {/*
        Interior warm light - deliberately NOT shadow casting.

        A point light with castShadow renders the whole scene SIX times a frame,
        once per face of a cube shadow map. This one sits inside the room, so
        from the default exterior camera almost none of that work is visible:
        it was costing six extra passes to shadow surfaces you cannot see. The
        matching light further up the file already had castShadow={false}, so
        this was an inconsistency rather than a decision.

        The warm glow through the glazing is unchanged - that comes from the
        light's colour and intensity, not from its shadows.
      */}
      <pointLight position={[0, h - 0.5, 0]} intensity={3} color="#ffe5b4" distance={10} castShadow={false} />

      {/* Guttering & downpipe. Pent/flat: one half-round run along the low
          edge with its rim flush with the fascia top. Gable: a run along each
          eave. Downpipe drops against the wall face nearest the gutter.
          The trough is an open half-cylinder (theta sweep) - real gutters are
          half-moons, not pipes - so the material must be double-sided or the
          inside face disappears when seen from above. */}
      {!isPlanView && room.hasGuttering && (() => {
        const gutterR = 0.055;
        const pipeR = 0.032;
        const gutterMat = <meshStandardMaterial color="#1f2224" metalness={0.5} roughness={0.4} side={THREE.DoubleSide} />;
        if (isGable) {
          const rimY = h + gableFascia;           // rim flush with the eave fascia top
          const cY = rimY - gutterR;
          const pipeTop = rimY - gutterR * 2;
          if (isSideGable) {
            // Eaves face front and back; gutters run along X.
            return (
              <group>
                <mesh position={[0, cY, (d/2 + ohFront) + gutterR]} rotation={[0, 0, Math.PI/2]}>
                  <cylinderGeometry args={[gutterR, gutterR, roofW + 0.1, 16, 1, false, Math.PI, Math.PI]} />
                  {gutterMat}
                </mesh>
                <mesh position={[0, cY, -(d/2 + ohBack) - gutterR]} rotation={[0, 0, Math.PI/2]}>
                  <cylinderGeometry args={[gutterR, gutterR, roofW + 0.1, 16, 1, false, Math.PI, Math.PI]} />
                  {gutterMat}
                </mesh>
                <mesh position={[w/2 - 0.2, (pipeTop - baseH)/2, -d/2 - pipeR - 0.01]}>
                  <cylinderGeometry args={[pipeR, pipeR, pipeTop + baseH, 12]} />
                  {gutterMat}
                </mesh>
              </group>
            );
          }
          return (
            <group>
              {/* axis along Z; theta picks the local half that faces world -Y, so the trough opens upward */}
              <mesh position={[-(w/2 + ohLeft) - gutterR, cY, 0]} rotation={[Math.PI/2, 0, 0]}>
                <cylinderGeometry args={[gutterR, gutterR, roofD + 0.1, 16, 1, false, -Math.PI/2, Math.PI]} />
                {gutterMat}
              </mesh>
              <mesh position={[(w/2 + ohRight) + gutterR, cY, 0]} rotation={[Math.PI/2, 0, 0]}>
                <cylinderGeometry args={[gutterR, gutterR, roofD + 0.1, 16, 1, false, -Math.PI/2, Math.PI]} />
                {gutterMat}
              </mesh>
              <mesh position={[w/2 + pipeR + 0.01, (pipeTop - baseH)/2, -d/2 + 0.2]}>
                <cylinderGeometry args={[pipeR, pipeR, pipeTop + baseH, 12]} />
                {gutterMat}
              </mesh>
            </group>
          );
        }
        const gutterAtBack = backH <= frontH;
        const edgeH = Math.min(frontH, backH);
        const rimY = edgeH + roofH;               // rim flush with the fascia top
        const cY = rimY - gutterR;
        const pipeTop = rimY - gutterR * 2;
        const zGutter = gutterAtBack ? -d/2 - ohBack - gutterR : d/2 + ohFront + gutterR;
        const zPipe = gutterAtBack ? -d/2 - pipeR - 0.01 : d/2 + pipeR + 0.01;
        return (
          <group>
            {/* axis along X; theta picks the local half that faces world -Y, so the trough opens upward */}
            <mesh position={[roofX, cY, zGutter]} rotation={[0, 0, Math.PI/2]}>
              <cylinderGeometry args={[gutterR, gutterR, roofW + 0.05, 16, 1, false, Math.PI, Math.PI]} />
              {gutterMat}
            </mesh>
            <mesh position={[w/2 - 0.2, (pipeTop - baseH)/2, zPipe]}>
              <cylinderGeometry args={[pipeR, pipeR, pipeTop + baseH, 12]} />
              {gutterMat}
            </mesh>
          </group>
        );
      })()}

      {/* Canopy support posts - added automatically once the canopy projects
          far enough that a real one would need them. Picture-frame surrounds
          carry their own sides, and the L-shape's cut front edge has no
          consistent corner to land a post on. */}
      {!isPlanView && room.hasCanopy && !room.hasPictureFrame && !isLShape && ohFront >= 0.9 && (
        <group>
          {[-(w/2 - 0.055), w/2 - 0.055].map((x, i) => (
            <mesh key={`canopy-post-${i}`} position={[x, (frontH - baseH)/2, d/2 + ohFront - 0.055]} castShadow>
              <boxGeometry args={[0.07, frontH + baseH, 0.07]} />
              <meshStandardMaterial color={frameColorHex} metalness={0.4} roughness={0.4} />
            </mesh>
          ))}
        </group>
      )}

      {/* Apex glazing - glass triangle with slim mullions filling the gable
          peak (the clad triangle is skipped in the CSG when this is on).
          Front orientation glazes the front apex; side orientation glazes
          BOTH side apexes. Mullion heights follow the rake so each bar meets
          the slope. */}
      {!isPlanView && isGable && room.hasApexGlazing && (() => {
        // The whole unit is inset from the true gable triangle so the rake
        // rails stay clear of the sloped roof slabs' underside - centred rails
        // on the raw rake line poked through the roof edge.
        const inset = 0.08;
        const apexBase = h + 0.03;
        const apexH = (h + 0.025 + roofH - 0.12) - apexBase;
        if (apexH <= 0.05) return null;
        const span = gSpan;
        const halfW = span/2 - inset;
        const isPlain = room.apexGlazingStyle === 'plain';
        const rakeAngle = Math.atan2(apexH, halfW);
        const rakeLen = Math.sqrt(halfW*halfW + apexH*apexH) + 0.04;
        const nGaps = Math.max(2, Math.round(span / 0.8));
        const glassShape = new THREE.Shape();
        glassShape.moveTo(-halfW, 0);
        glassShape.lineTo(halfW, 0);
        glassShape.lineTo(0, apexH);
        glassShape.closePath();
        const frameMat = <meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} />;
        const unit = (
          <>
            {/* Glass */}
            <mesh>
              <shapeGeometry args={[glassShape]} />
              <meshPhysicalMaterial color="#aabed1" transmission={0.9} ior={1.5} thickness={0.05} roughness={0.1} clearcoat={1} envMapIntensity={3} side={THREE.DoubleSide} />
            </mesh>
            {/* Bottom rail - kept in both styles so the glass never floats on the wall top */}
            <mesh position={[0, 0.005, 0]} castShadow>
              <boxGeometry args={[span - inset, isPlain ? 0.03 : 0.06, 0.05]} />
              {frameMat}
            </mesh>
            {!isPlain && (
              <>
                {/* Rake rails - centred on the inset edges, well below the roof underside */}
                <mesh position={[-halfW/2, apexH/2, 0]} rotation={[0, 0, rakeAngle]} castShadow>
                  <boxGeometry args={[rakeLen, 0.055, 0.05]} />
                  {frameMat}
                </mesh>
                <mesh position={[halfW/2, apexH/2, 0]} rotation={[0, 0, -rakeAngle]} castShadow>
                  <boxGeometry args={[rakeLen, 0.055, 0.05]} />
                  {frameMat}
                </mesh>
                {/* Mullions - height follows the rake at each position */}
                {Array.from({ length: nGaps - 1 }).map((_, i) => {
                  const x = -halfW + (2 * halfW * (i + 1)) / nGaps;
                  const hAt = apexH * (1 - Math.abs(x) / halfW) - 0.05;
                  if (hAt <= 0.05) return null;
                  return (
                    <mesh key={`apex-mullion-${i}`} position={[x, hAt/2 + 0.02, 0]}>
                      <boxGeometry args={[0.05, hAt, 0.05]} />
                      {frameMat}
                    </mesh>
                  );
                })}
              </>
            )}
          </>
        );
        if (isSideGable) {
          return (
            <>
              <group position={[w/2 - 0.035, apexBase, 0]} rotation={[0, Math.PI/2, 0]}>{unit}</group>
              <group position={[-w/2 + 0.035, apexBase, 0]} rotation={[0, -Math.PI/2, 0]}>{unit}</group>
            </>
          );
        }
        return <group position={[0, apexBase, d/2 - 0.035]}>{unit}</group>;
      })()}

      {/* Render Door frames and glass */}
      {(room.doors || []).map((door) => {
        const doorH = door.heightMm / 1000;
        const offset = door.offsetMm / 1000;
        // Crittall doors default to the slim steel profile; standard doors keep the room's frame style
        const doorFrameT = door.style === 'crittall' ? Math.min(frameThickness, 0.025) : frameThickness;
        const doorSashT = door.style === 'crittall' ? Math.min(sashThickness, 0.025) : sashThickness;
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
          {/* Drag highlight over the opening. This was an OPAQUE black plane
              sized to the opening: dragging a door/window wider grew a solid
              black rectangle across the whole building, which read as "the
              walls vanish and flash back" for the duration of the drag. Now
              a faint tint that never hides what is behind it. */}
          {isDraggingThis && (
            <mesh position={[0, 0, frameDepth/2 - 0.005]}>
              <planeGeometry args={[door.widthMm/1000, doorH]} />
              <meshBasicMaterial color="#10b981" transparent opacity={0.18} depthWrite={false} />
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
                  useStore.getState().updateDoor(door.id, { offsetMm: Math.round((door.offsetMm + dx * 1000) / 50) * 50 });
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
                    store.updateDoor(door.id, { widthMm: Math.max(100, Math.round((targetDoor.widthMm - dx * 2000) / 100) * 100) });
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
                    store.updateDoor(door.id, { widthMm: Math.max(100, Math.round((targetDoor.widthMm + dx * 2000) / 100) * 100) });
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
             <mesh position={[0, -door.heightMm/2000 + doorFrameT/2, 0]} castShadow><boxGeometry args={[door.widthMm/1000 - doorFrameT*2, doorFrameT, frameDepth]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
             <mesh position={[0, door.heightMm/2000 - doorFrameT/2, 0]} castShadow><boxGeometry args={[door.widthMm/1000 - doorFrameT*2, doorFrameT, frameDepth]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
             <mesh position={[-door.widthMm/2000 + doorFrameT/2, 0, 0]} castShadow><boxGeometry args={[doorFrameT, door.heightMm/1000, frameDepth]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
             <mesh position={[door.widthMm/2000 - doorFrameT/2, 0, 0]} castShadow><boxGeometry args={[doorFrameT, door.heightMm/1000, frameDepth]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
          </group>
          {/* Entrance steps down to the garden - solid blocks in even ~170mm
              rises, each tread reaching 300mm further out. Skipped on the
              front wall when decking already provides the platform. */}
          {room.hasDoorSteps && baseH > 0.03 && !(isDecking && door.wall === 'front') && (() => {
            const rises = Math.max(2, Math.ceil(baseH / 0.17));
            const treadD = 0.3;
            return (
              <group>
                {Array.from({ length: rises - 1 }).map((_, s) => {
                  const topY = -doorH/2 - baseH * (s + 1) / rises;
                  const hgt = baseH * (rises - 1 - s) / rises;
                  return (
                    <mesh key={`step-${s}`} position={[0, topY - hgt/2, frameDepth/2 + treadD*(s+1) - treadD/2 + 0.01]} castShadow receiveShadow>
                      <boxGeometry args={[door.widthMm/1000 + 0.15, hgt, treadD]} />
                      <meshStandardMaterial color={baseColorHex} roughness={0.85} />
                    </mesh>
                  );
                })}
              </group>
            );
          })()}
          {/* Leaves */}
          <AnimatedDoorLeaves door={door} room={room} frameColorHex={frameColorHex} frameThickness={doorFrameT} sashThickness={doorSashT} depth={frameDepth} />
        </group>
      )})}


      {/* Render Windows frames and glass */}
      {room.windows.map(win => {
        const winW = win.widthMm / 1000;
        const winH = win.heightMm / 1000;
        const sill = (win.sillMm ?? 0) / 1000;
        const offset = (win.offsetMm ?? 0) / 1000;
        // Crittall windows default to the slim steel profile; standard windows keep the room's frame style
        const winFrameT = win.style === 'crittall' ? Math.min(frameThickness, 0.025) : frameThickness;
        const winSashT = win.style === 'crittall' ? Math.min(sashThickness, 0.025) : sashThickness;

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
            {/* Faint drag highlight - see the door note above; this was an
                opaque black plane that blacked out the building on resize. */}
            {isDraggingThis && (
            <mesh position={[0, 0, frameDepth/2 - 0.005]}>
              <planeGeometry args={[winW, winH]} />
              <meshBasicMaterial color="#10b981" transparent opacity={0.18} depthWrite={false} />
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
             <mesh position={[0, winH/2-winFrameT/2, 0]} castShadow><boxGeometry args={[winW, winFrameT, frameDepth]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
             <mesh position={[0, -winH/2+winFrameT/2, 0]} castShadow><boxGeometry args={[winW, winFrameT, frameDepth]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
             <mesh position={[-winW/2+winFrameT/2, 0, 0]} castShadow><boxGeometry args={[winFrameT, winH - winFrameT*2, frameDepth]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
             <mesh position={[winW/2-winFrameT/2, 0, 0]} castShadow><boxGeometry args={[winFrameT, winH - winFrameT*2, frameDepth]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
             
             {/* Protruding Sill - only on raised windows; full-height glazing meets the floor */}
             {!win.fullHeight && (win.sillMm ?? 0) > 0 && (
               <mesh position={[0, -winH/2-0.01, frameDepth/2 + 0.02]} rotation={[0.08, 0, 0]} castShadow><boxGeometry args={[winW + 0.1, 0.04, 0.10]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
             )}
             
             {/* Sash Details & Glass panes */}
             {Array.from({ length: win.leaves || 1 }).map((_, i) => {
               const panesCount = win.leaves || 1;
               const paneW = (winW - winFrameT*2) / panesCount;
               const posX = - ((winW - winFrameT*2)/2) + paneW/2 + i * paneW;

               return (
                 <group key={`pane-${i}`} position={[posX, 0, 0]}>
                   <mesh position={[0, winH/2-winFrameT-winSashT/2, 0]}><boxGeometry args={[paneW, winSashT, frameDepth*0.3]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
                   <mesh position={[0, -winH/2+winFrameT+winSashT/2, 0]}><boxGeometry args={[paneW, winSashT, frameDepth*0.3]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
                   <mesh position={[-paneW/2+winSashT/2, 0, 0]}><boxGeometry args={[winSashT, winH - winFrameT*2 - winSashT*2, frameDepth*0.3]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
                   <mesh position={[paneW/2-winSashT/2, 0, 0]}><boxGeometry args={[winSashT, winH - winFrameT*2 - winSashT*2, frameDepth*0.3]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
                   {/* Glass */}
                   <mesh>
                     <boxGeometry args={[paneW - winSashT*2, winH - winFrameT*2 - winSashT*2, 0.02]} />
                     <meshPhysicalMaterial color="#aabed1" transmission={0.9} ior={1.5} thickness={0.05} roughness={0.1} clearcoat={1} envMapIntensity={3} />
                   </mesh>
                   {win.style === 'crittall' && (
                     <CrittallBars
                       glassW={paneW - winSashT*2}
                       glassH={winH - winFrameT*2 - winSashT*2}
                       depth={0.03}
                       color={frameColorHex}
                     />
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

            {/* Lantern option removed - the pyramid never looked like a real
                lantern. Any saved 'lantern' skylights render flat too. */}
            {(
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

      {/* Internal walls - one unified system. Each wall is selectable
          (click), body-draggable with snapping to the room walls and other
          internal walls, and owns its doors so they travel with it. */}
      {room.partitions?.map(part => (
        <PartitionUnit key={part.id} part={part} hP={isPitched && !isGable ? (frontH + backH)/2 : h} room={room} showDims={room.showDimensions} />
      ))}

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

          {/* Opening dimension chains: wall edge -> opening -> gap -> wall edge,
              one running chain per wall that has doors or windows. This is what
              a builder actually sets out from - the overall dims alone don't
              say WHERE the openings sit. Read-only labels; positions are edited
              on the openings themselves. LShape skipped: offsets there are not
              relative to a single straight wall. */}
          {room.showDimensions && room.shape !== 'LShape' && (['front', 'back', 'left', 'right'] as const).map(side => {
            const horiz = side === 'front' || side === 'back';
            const L = horiz ? w : d;
            const openings = [
              ...(room.doors || []).filter(dr => dr.wall === side).map(dr => ({ c: (dr.offsetMm || 0) / 1000, hw: (dr.widthMm / 1000) / 2 })),
              ...room.windows.filter(wn => wn.wall === side).map(wn => ({ c: (wn.offsetMm ?? 0) / 1000, hw: (wn.widthMm / 1000) / 2 })),
            ].sort((a, b) => a.c - b.c);
            if (openings.length === 0) return null;

            const pts: number[] = [-L / 2];
            openings.forEach(o => {
              pts.push(Math.max(-L / 2, o.c - o.hw), Math.min(L / 2, o.c + o.hw));
            });
            pts.push(L / 2);

            const off = 0.45; // between the wall face and the overall dimension line
            const base: [number, number, number] =
              side === 'front' ? [0, 0, d / 2 + off]
              : side === 'back' ? [0, 0, -d / 2 - off]
              : side === 'left' ? [-w / 2 - off, 0, 0]
              : [w / 2 + off, 0, 0];
            const rotText: [number, number, number] =
              side === 'front' ? [-Math.PI / 2, 0, 0]
              : side === 'back' ? [-Math.PI / 2, 0, Math.PI]
              : side === 'left' ? [-Math.PI / 2, 0, -Math.PI / 2]
              : [-Math.PI / 2, 0, Math.PI / 2];

            return (
              <group key={`chain-${side}`} position={base}>
                <Line points={horiz ? [[-L / 2, 0, 0], [L / 2, 0, 0]] : [[0, 0, -L / 2], [0, 0, L / 2]]} color="#000" lineWidth={0.75} />
                {pts.map((p, i) => (
                  <Line key={`tick-${i}`} points={horiz ? [[p, 0, -0.06], [p, 0, 0.06]] : [[-0.06, 0, p], [0.06, 0, p]]} color="#000" lineWidth={0.75} />
                ))}
                {pts.slice(0, -1).map((p, i) => {
                  const q = pts[i + 1];
                  const segMm = Math.round((q - p) * 1000);
                  if (segMm < 1) return null;
                  const mid = (p + q) / 2;
                  return (
                    <DimText
                      key={`seg-${i}`}
                      position={horiz ? [mid, 0, 0] : [0, 0, mid]}
                      rotation={rotText}
                      value={segMm}
                    />
                  );
                })}
              </group>
            );
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
                    store.updateRoom({ widthMm: Math.max(10, Math.round((store.scene.room.widthMm + dx * 2000) / 100) * 100) });
                  }} 
                />
                <DragHandle 
                  position={[-roofW/2, 0, 0]} 
                  axis="x" 
                  label="Room Width"
                  onChange={(dx) => {
                    const store = useStore.getState();
                    store.updateRoom({ widthMm: Math.max(10, Math.round((store.scene.room.widthMm - dx * 2000) / 100) * 100) });
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
                    store.updateRoom({ depthMm: Math.max(10, Math.round((store.scene.room.depthMm + dz * 2000) / 100) * 100) });
                  }} 
                />
                <DragHandle 
                  position={[0, 0, -roofD/2]} 
                  axis="z" 
                  label="Room Depth"
                  onChange={(dz) => {
                    const store = useStore.getState();
                    store.updateRoom({ depthMm: Math.max(10, Math.round((store.scene.room.depthMm - dz * 2000) / 100) * 100) });
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
                // For Gable, heightMm IS the total height (frontH already has
                // base+roof subtracted), so the typed total stores directly.
                // Subtracting again shrank a Gable building by base+roof every
                // time the displayed number was retyped unchanged.
                const newHeight = isGable
                  ? val
                  : val - (store.scene.room.baseHeightMm || 100) - (store.scene.room.roofHeightMm || 200);
                store.updateRoom({ heightMm: Math.max(10, newHeight) });
              }}
            />
            {room.showDimensions && (
              <DragHandle 
                position={[0, (frontH + baseH + roofH)/2, 0]} 
                axis="y" 
                label={isGable || isPitched ? "Eaves Height" : "Front Height"}
                onChange={(dy) => {
                  const store = useStore.getState();
                  store.updateRoom({ heightMm: Math.max(10, Math.round((store.scene.room.heightMm + dy * 1000) / 100) * 100) });
                }} 
              />
            )}
          </group>
          )}
          {/* Roof Height (Ridge) Handle. Never on plans: a HEIGHT floating on a
              top-down drawing read as a mystery "300mm" on the exported PDF. */}
          {(isGable || isPitched) && room.showDimensions && !isPlanView && (
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
                  store.updateRoom({ roofHeightMm: Math.max(10, Math.round(((store.scene.room.roofHeightMm || 200) + dy * 1000) / 100) * 100) });
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
                   store.updateRoom({ lShapeCutoutWidthMm: Math.max(10, Math.round((curW - dx * 1000) / 100) * 100) });
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
                   store.updateRoom({ lShapeCutoutDepthMm: Math.max(10, Math.round((curD - dz * 1000) / 100) * 100) });
                }}
              />
            </group>
          )}

          {/* Back Height. Never on a gable - a gable is symmetric, its one
              height story is eaves/ridge, and a separate back figure was how
              stale nonsense numbers reached the 3D view and PDF. */}
          {!isPlanView && !isGable && (
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
                  store.updateRoom({ backHeightMm: Math.max(10, Math.round((curBackH + dy * 1000) / 100) * 100) });
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
                      const newSize = Math.max(0, Math.round(((store.scene.room.canopySizeMm || 0) + dz * 1000) / 100) * 100);
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
                  store.updateRoom({ overhangBackMm: Math.max(0, Math.round(((store.scene.room.overhangBackMm || 0) - dz * 1000) / 100) * 100) });
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
                  store.updateRoom({ overhangLeftMm: Math.max(0, Math.round(((store.scene.room.overhangLeftMm || 0) - dx * 1000) / 100) * 100) });
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
                  store.updateRoom({ overhangRightMm: Math.max(0, Math.round(((store.scene.room.overhangRightMm || 0) + dx * 1000) / 100) * 100) });
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
                      const newSize = Math.max(0, Math.round(((store.scene.room.deckingSizeMm || 0) + dz * 1000) / 100) * 100);
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
                {room.shape !== 'LShape' && <DragHandle elementId="room" position={[w/2, 0, 0]} axis="x" label="Width" onChange={(dx) => useStore.getState().updateRoom({ widthMm: Math.max(100, Math.round((useStore.getState().scene.room.widthMm + dx * 2000) / 100) * 100) })} />}
                <DragHandle elementId="room" position={[-w/2, 0, 0]} axis="x" label="Width" onChange={(dx) => useStore.getState().updateRoom({ widthMm: Math.max(100, Math.round((useStore.getState().scene.room.widthMm - dx * 2000) / 100) * 100) })} />
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
                {room.shape !== 'LShape' && <DragHandle elementId="room" position={[0, 0, d/2]} axis="z" label="Depth" onChange={(dz) => useStore.getState().updateRoom({ depthMm: Math.max(100, Math.round((useStore.getState().scene.room.depthMm + dz * 2000) / 100) * 100) })} />}
                <DragHandle elementId="room" position={[0, 0, -d/2]} axis="z" label="Depth" onChange={(dz) => useStore.getState().updateRoom({ depthMm: Math.max(100, Math.round((useStore.getState().scene.room.depthMm - dz * 2000) / 100) * 100) })} />
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
                {room.shape !== 'LShape' && <DragHandle elementId="room" position={[w/2, 0, 0]} axis="x" label="Width" onChange={(dx) => useStore.getState().updateRoom({ widthMm: Math.max(100, Math.round((useStore.getState().scene.room.widthMm + dx * 2000) / 100) * 100) })} />}
                <DragHandle elementId="room" position={[-w/2, 0, 0]} axis="x" label="Width" onChange={(dx) => useStore.getState().updateRoom({ widthMm: Math.max(100, Math.round((useStore.getState().scene.room.widthMm - dx * 2000) / 100) * 100) })} />
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
                {room.shape !== 'LShape' && <DragHandle elementId="room" position={[0, 0, d/2]} axis="z" label="Depth" onChange={(dz) => useStore.getState().updateRoom({ depthMm: Math.max(100, Math.round((useStore.getState().scene.room.depthMm + dz * 2000) / 100) * 100) })} />}
                <DragHandle elementId="room" position={[0, 0, -d/2]} axis="z" label="Depth" onChange={(dz) => useStore.getState().updateRoom({ depthMm: Math.max(100, Math.round((useStore.getState().scene.room.depthMm - dz * 2000) / 100) * 100) })} />
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
                    <DragHandle position={[-cutW/2, 0, -0.3]} axis="x" label="Cutout" color="#ff8c00" onChange={(dx) => useStore.getState().updateRoom({ lShapeCutoutWidthMm: Math.max(100, Math.round(((useStore.getState().scene.room.lShapeCutoutWidthMm ?? 2000) - dx * 1000) / 100) * 100) })} />
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
                    <DragHandle position={[-0.3, 0, -cutD/2]} axis="z" label="Cutout" color="#ff8c00" onChange={(dz) => useStore.getState().updateRoom({ lShapeCutoutDepthMm: Math.max(100, Math.round(((useStore.getState().scene.room.lShapeCutoutDepthMm ?? 1500) - dz * 1000) / 100) * 100) })} />
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
            // Doors filter by their own wall, same as windows below — the old
            // code pushed EVERY door into the front chain, so a back-wall door
            // produced garbage segment dimensions on the front elevation and
            // was missing from its own wall's chain.
            (room.doors || []).filter(dr => dr.wall === wall).forEach(door => {
               elements.push({
                 id: door.id, type: 'door', offset: door.offsetMm / 1000, width: door.widthMm / 1000,
                 onUpdateWidth: (val) => useStore.getState().updateDoor(door.id, { widthMm: Math.max(10, val) })
               });
            });
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
