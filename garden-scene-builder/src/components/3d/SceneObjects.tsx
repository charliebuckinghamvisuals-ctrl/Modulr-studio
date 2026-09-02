import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { SceneObject } from '../../types';
import * as THREE from 'three';
import { useRef, useState, useEffect, Suspense } from 'react';
import { useThree } from '@react-three/fiber';
import { Geometry, Base, Subtraction } from './SafeCsg';
import { useGLTF, Html } from '@react-three/drei';
import { MODEL_URLS, MODEL_SCALES, NATIVE_WIDTH_MM, hasWorktop, mountHeight, EXTRACTOR_FLUE_URL, EXTRACTOR_CANOPY_H, EXTRACTOR_FLUE_H } from '../../modelRegistry';
import { applyModelMaterials, retintModel, resurfaceWorktop } from '../../utils/materialFixes';
import { isInteriorType, clampToRoomInterior, roomLocal, FOOTPRINT_RADIUS } from '../../utils/placement';
import { RotateCw, Copy, Trash2 } from 'lucide-react';
import { WorktopRuns } from './WorktopRuns';

/**
 * Generic GLB object - any type registered in modelRegistry renders through
 * this. Paths are relative so they resolve correctly both in standalone dev
 * (served at the site root) and inside the /3d-config/ iframe, where an
 * absolute path would miss.
 */
function GlbModel({ url, type, color, worktop }: { url: string; type: SceneObject['type']; color?: string; worktop?: string }) {
    const { scene } = useGLTF(url);

    // Clone per instance. useGLTF caches one scene graph, so placing two of
    // the same object without cloning would move one shared graph twice.
    // Material corrections (paint, metal finishes, appliance glass) live in
    // utils/materialFixes so the thumbnail renderer applies the same look.
    const model = useRef<THREE.Group>(null);
    const cloned = useRef<THREE.Object3D | null>(null);
    const matHandles = useRef<ReturnType<typeof applyModelMaterials> | null>(null);

    if (!cloned.current) {
        cloned.current = scene.clone(true);
        matHandles.current = applyModelMaterials(type, cloned.current, color, worktop, true);
    }

    // Recolour on demand without rebuilding the model.
    useEffect(() => {
        if (!color || !matHandles.current) return;
        retintModel(type, matHandles.current, color);
    }, [color, type]);

    // Re-surface the worktop when the room's choice changes.
    useEffect(() => {
        if (!matHandles.current) return;
        resurfaceWorktop(matHandles.current, worktop);
    }, [worktop]);

    return <primitive ref={model} object={cloned.current} />;
}

/**
 * Warm the model cache in the BACKGROUND, once the app is already usable.
 *
 * These preloads used to run at module load, which put all 18 models -
 * 12.7MB - in front of the loading screen: nothing could be done with the
 * configurator until every sofa and shower had arrived, which on a normal
 * connection is a very long wait for models most designs never use. They are
 * now fetched one at a time after first paint, and any model placed before
 * its turn simply loads on demand through Suspense.
 */
if (typeof window !== 'undefined') {
  const warmCache = () => {
    const urls = Object.values(MODEL_URLS).filter(Boolean) as string[];
    let i = 0;
    const next = () => {
      if (i >= urls.length) return;
      try { useGLTF.preload(urls[i++]); } catch { /* a bad url must not stop the rest */ }
      setTimeout(next, 500);
    };
    next();
  };
  const idle = (window as any).requestIdleCallback;
  if (idle) idle(warmCache, { timeout: 10000 });
  else setTimeout(warmCache, 6000);
}

/** Simple stand-in shown while a model streams in. */
function ModelFallback() {
    return (
        <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[1.6, 0.6, 2.0]} />
            <meshStandardMaterial color="#cbd5e1" roughness={1} />
        </mesh>
    );
}

export function SceneObjects() {
  const { objects, isExporting } = useStore(useShallow(s => ({
    objects: s.scene.objects,
    isExporting: s.isExporting
  })));

  /**
   * Keyboard control for the selected object - the fastest way to place
   * furniture precisely once it is roughly in position:
   *   arrows        nudge 5cm       shift+arrows  nudge 25cm
   *   R             rotate 45deg    Delete        remove
   *   Escape        deselect
   * Ignored while typing in any input, so dimension fields keep their keys.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const st = useStore.getState();
      const id = st.selectedObjectId;
      if (!id) return;
      const o = st.scene.objects.find(ob => ob.id === id);
      if (!o) return;
      const step = e.shiftKey ? 0.25 : 0.05;
      let handled = true;
      if (e.key === 'ArrowLeft')       { st.saveState(); st.updateObject(id, { x: o.x - step }); }
      else if (e.key === 'ArrowRight') { st.saveState(); st.updateObject(id, { x: o.x + step }); }
      else if (e.key === 'ArrowUp')    { st.saveState(); st.updateObject(id, { z: o.z - step }); }
      else if (e.key === 'ArrowDown')  { st.saveState(); st.updateObject(id, { z: o.z + step }); }
      else if (e.key === 'r' || e.key === 'R') { st.saveState(); st.updateObject(id, { rot: o.rot + Math.PI / 4 }); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) { st.saveState(); st.duplicateObject(id); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { st.saveState(); st.removeObject(id); st.setSelectedObjectId(null); }
      else if (e.key === 'Escape') { st.setSelectedObjectId(null); }
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);


  return (
    <group>
      {objects.map(obj => {
        if (isExporting && ['tree', 'conifer', 'hedge', 'shrub', 'flowerbed', 'planter', 'bench', 'slab', 'patio'].includes(obj.type)) {
          return null;
        }
        return <ObjectMesh key={obj.id} obj={obj} />;
      })}
      {/* One slab per run of cabinets, laid over the hidden per-unit tops. */}
      <WorktopRuns />
    </group>
  );
}

function ObjectMesh({ obj }: { obj: SceneObject }) {
  const { selectedObjectId, setSelectedObjectId, updateObject, viewMode, room } = useStore(useShallow(s => ({
    selectedObjectId: s.selectedObjectId,
    setSelectedObjectId: s.setSelectedObjectId,
    updateObject: s.updateObject,
    viewMode: s.viewMode,
    room: s.scene.room
  })));
  const isSelected = selectedObjectId === obj.id;
  const [isDragging, setIsDragging] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const { raycaster, camera } = useThree();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  
  // Interior objects stand on the FINISHED floor (top of the base plinth),
  // not on the outside ground - without the lift they sink baseH into the
  // floor.
  const isInterior = isInteriorType(obj.type);
  const baseH = isInterior ? ((room.baseHeightMm ?? 100) / 1000) + 0.005 : 0;
  // Worktop-mounted objects (taps) sit on the 900mm sink unit rather than on
  // the floor, so they are lifted by their mount height as well.
  const pos: [number, number, number] = [obj.x, baseH + mountHeight(obj.type), obj.z];

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    setSelectedObjectId(obj.id);
    // In the walkthrough an item can be SELECTED - so a client can change its
    // colour or finish - but never moved. The layout is the designer's; the
    // finishes are the client's.
    if (viewMode === 'walking') return;

    // Draggable in EVERY editing view. Plan-only dragging was the single
    // biggest interaction complaint: in the default 3D view objects selected
    // but would not move, so placing furniture meant constantly flipping to
    // plan. The ground-plane intersection works from any camera angle.
    useStore.getState().saveState(); // one undo step per drag, throttled in the store
    setIsDragging(true);
    useStore.getState().setControlsEnabled(false);
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: any) => {
    e.stopPropagation();
    setIsDragging(false);
    useStore.getState().setControlsEnabled(true);
    e.target.releasePointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: any) => {
    if (isDragging && viewMode !== 'walking') {
      const intersect = new THREE.Vector3();
      e.ray.intersectPlane(plane, intersect);
      if (intersect) {
        // Snap to 5cm grid to help "lock" items into place easily and align corners perfectly
        const snap = 0.05;
        let nx = Math.round(intersect.x / snap) * snap;
        let nz = Math.round(intersect.z / snap) * snap;
        // Interior objects gently magnetise to the inside wall faces when
        // within 12cm, so "push it against the wall" lands flush instead of
        // hovering a grid-cell away.
        if (isInterior) {
          const wallT = 0.05;
          const ix = room.widthMm / 2000 - wallT;
          const iz = room.depthMm / 2000 - wallT;
          const MAG = 0.12;
          if (Math.abs(nx - -ix) < MAG) nx = -ix; else if (Math.abs(nx - ix) < MAG) nx = ix;
          if (Math.abs(nz - -iz) < MAG) nz = -iz; else if (Math.abs(nz - iz) < MAG) nz = iz;

          /**
           * Kitchen units magnetise flush to a neighbouring unit.
           *
           * Grid snapping alone let a unit stop one 50mm cell short of the
           * next and read as joined - and the continuous worktop then bridged
           * the gap and hid it, so "is this snapped?" had no answer on screen.
           * Two halves of the fix: here, a unit within 120mm of a neighbour's
           * free edge - same angle, same line - jumps flush against it and
           * onto its line. Over in WorktopRuns the slab now only bridges units
           * that actually touch. So a snapped unit shows one continuous top,
           * and an unsnapped one shows a break. That break is the tell.
           */
          if (hasWorktop(obj.type)) {
            const all = useStore.getState().scene.objects;
            const myW = (obj.widthMm ?? NATIVE_WIDTH_MM[obj.type] ?? 600) / 1000;
            const rot = obj.rot ?? 0;
            const up = new THREE.Vector3(0, 1, 0);
            const dir = new THREE.Vector3(1, 0, 0).applyAxisAngle(up, rot);
            const perp = new THREE.Vector3(0, 0, 1).applyAxisAngle(up, rot);
            const UNIT_MAG = 0.12;
            let best: { dist: number; x: number; z: number } | null = null;
            for (const n of all) {
              if (n.id === obj.id || !hasWorktop(n.type)) continue;
              const dRot = Math.abs(((n.rot ?? 0) - rot) % (Math.PI * 2));
              if (Math.min(dRot, Math.PI * 2 - dRot) > 0.02) continue;
              const nW = (n.widthMm ?? NATIVE_WIDTH_MM[n.type] ?? 600) / 1000;
              const v = new THREE.Vector3(nx - n.x, 0, nz - n.z);
              const t = v.dot(dir), s = v.dot(perp);
              if (Math.abs(s) > 0.15) continue;
              for (const side of [1, -1]) {
                // Where my centre sits when my edge meets theirs on this side.
                const target = side * (nW / 2 + myW / 2);
                const dist = Math.abs(t - target);
                if (dist < UNIT_MAG && (!best || dist < best.dist)) {
                  // Lands flush along the run AND on the neighbour's line, so
                  // a unit dragged in slightly skew still meets it square.
                  const p = new THREE.Vector3(n.x, 0, n.z).addScaledVector(dir, target);
                  best = { dist, x: p.x, z: p.z };
                }
              }
            }
            if (best) { nx = best.x; nz = best.z; }
          }

          // Never draggable out through a wall
          const c = clampToRoomInterior(room, nx, nz);
          nx = c.x; nz = c.z;
        }
        updateObject(obj.id, { x: nx, z: nz });
      }
    }
  };

  const meshContent = (() => {
    // GLB-backed objects take priority: a type registered in modelRegistry
    // renders its real model even if a procedural builder exists below.
    const modelUrl = MODEL_URLS[obj.type];
    if (modelUrl) {
      const base = MODEL_SCALES[obj.type] ?? [1, 1, 1];
      // Width-adjustable objects (kitchen units) stretch on X only, so the
      // carcass keeps its real depth and worktop height at any width.
      const native = NATIVE_WIDTH_MM[obj.type];
      const stretch = native && obj.widthMm ? obj.widthMm / native : 1;
      return (
        <Suspense fallback={<ModelFallback />}>
          <group scale={[base[0] * stretch, base[1], base[2]]}>
            <GlbModel
              key={obj.type}
              url={modelUrl}
              type={obj.type}
              color={obj.color}
              worktop={room.worktopMaterial}
            />
            {/* The extractor's flue is its own model, stretched on Y so its
                top always lands on the ceiling. A duct that stops short
                looks broken, and the room height is a customer choice - so
                the flue is sized from it rather than shipped at one length.
                Scaling is about the canopy top, and the duct is a straight
                extrusion, so stretching it introduces no distortion. */}
            {obj.type === 'kitchen_extractor' && (() => {
              const ceiling = (room.heightMm ?? 2050) / 1000;
              const needed = ceiling - mountHeight(obj.type) - EXTRACTOR_CANOPY_H;
              const s = Math.max(0.02, needed / EXTRACTOR_FLUE_H);
              return (
                <group position={[0, EXTRACTOR_CANOPY_H, 0]} scale={[1, s, 1]}>
                  <group position={[0, -EXTRACTOR_CANOPY_H, 0]}>
                    <GlbModel key="flue" url={EXTRACTOR_FLUE_URL} type={obj.type} />
                  </group>
                </group>
              );
            })()}
          </group>
        </Suspense>
      );
    }
    if (obj.type === 'tree') {
      return (
        <>
           <mesh position={[0, 0.8, 0]} castShadow><cylinderGeometry args={[0.1, 0.15, 1.6]}/><meshStandardMaterial color="#5c4033" roughness={0.9} /></mesh>
           <mesh position={[0, 2, 0]} castShadow>
              <dodecahedronGeometry args={[1, 1]} />
              <meshStandardMaterial color="#4a7c59" roughness={0.8} />
           </mesh>
           <mesh position={[0.4, 2.2, 0.4]} castShadow>
              <dodecahedronGeometry args={[0.8, 1]} />
              <meshStandardMaterial color="#558c65" roughness={0.8} />
           </mesh>
           <mesh position={[-0.4, 1.8, -0.3]} castShadow>
              <dodecahedronGeometry args={[0.7, 1]} />
              <meshStandardMaterial color="#3d6c4a" roughness={0.8} />
           </mesh>
        </>
      );
    }
    
    if (obj.type === 'conifer') {
      return (
        <>
           <mesh position={[0, 0.2, 0]} castShadow><cylinderGeometry args={[0.3, 0.25, 0.4]}/><meshStandardMaterial color="#3a3a3a" roughness={0.8} /></mesh>
           <mesh position={[0, 0.9, 0]} castShadow><coneGeometry args={[0.6, 1.2, 8]} /><meshStandardMaterial color="#2e5437" roughness={0.9} /></mesh>
           <mesh position={[0, 1.5, 0]} castShadow><coneGeometry args={[0.5, 1, 8]} /><meshStandardMaterial color="#355e3e" roughness={0.9} /></mesh>
           <mesh position={[0, 2.0, 0]} castShadow><coneGeometry args={[0.3, 0.8, 8]} /><meshStandardMaterial color="#3c6b47" roughness={0.9} /></mesh>
        </>
      );
    }

    if (obj.type === 'planter') {
      return (
        <group scale={0.6}>
            <mesh position={[0, 0.3, 0]} castShadow>
              <boxGeometry args={[1.2, 0.6, 0.6]} />
              <meshStandardMaterial color="#a09f9c" metalness={0.1} roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.58, 0]}>
              <boxGeometry args={[1.1, 0.05, 0.5]} />
              <meshStandardMaterial color="#2d1a11" roughness={1} />
            </mesh>
            {[-0.4, 0, 0.4].map((x, i) => (
              <mesh key={i} position={[x, 0.7, 0]} castShadow>
                <dodecahedronGeometry args={[0.25, 0]} />
                <meshStandardMaterial color="#88b06a" roughness={0.7} />
              </mesh>
            ))}
        </group>
      );
    }

    if (obj.type === 'bench') {
      return (
        <group scale={0.8}>
            <mesh position={[-0.6, 0.25, 0]} castShadow><boxGeometry args={[0.05, 0.5, 0.4]} /><meshStandardMaterial color="#222" metalness={0.6} roughness={0.4} /></mesh>
            <mesh position={[0.6, 0.25, 0]} castShadow><boxGeometry args={[0.05, 0.5, 0.4]} /><meshStandardMaterial color="#222" metalness={0.6} roughness={0.4} /></mesh>
            <mesh position={[0, 0.5, 0.1]} castShadow><boxGeometry args={[1.4, 0.04, 0.1]} /><meshStandardMaterial color="#c29063" roughness={0.8} /></mesh>
            <mesh position={[0, 0.5, -0.05]} castShadow><boxGeometry args={[1.4, 0.04, 0.1]} /><meshStandardMaterial color="#c29063" roughness={0.8} /></mesh>
            <mesh position={[0, 0.5, -0.2]} castShadow><boxGeometry args={[1.4, 0.04, 0.1]} /><meshStandardMaterial color="#c29063" roughness={0.8} /></mesh>
            <mesh position={[-0.6, 0.75, -0.2]} castShadow rotation={[-0.2, 0, 0]}><boxGeometry args={[0.05, 0.5, 0.05]} /><meshStandardMaterial color="#222" metalness={0.6} roughness={0.4} /></mesh>
            <mesh position={[0.6, 0.75, -0.2]} castShadow rotation={[-0.2, 0, 0]}><boxGeometry args={[0.05, 0.5, 0.05]} /><meshStandardMaterial color="#222" metalness={0.6} roughness={0.4} /></mesh>
            <mesh position={[0, 0.85, -0.25]} castShadow rotation={[-0.2, 0, 0]}><boxGeometry args={[1.4, 0.1, 0.04]} /><meshStandardMaterial color="#c29063" roughness={0.8} /></mesh>
            <mesh position={[0, 0.7, -0.22]} castShadow rotation={[-0.2, 0, 0]}><boxGeometry args={[1.4, 0.1, 0.04]} /><meshStandardMaterial color="#c29063" roughness={0.8} /></mesh>
        </group>
      );
    }
    
    if (obj.type === 'toilet') {
      return (
        <group>
            {/* Base / Floor Mount */}
            <mesh position={[0, 0.2, 0]} castShadow>
               <cylinderGeometry args={[0.15, 0.18, 0.4, 32]} />
               <meshStandardMaterial color="#ffffff" roughness={0.1} />
            </mesh>
            {/* Tank */}
            <mesh position={[0, 0.65, -0.22]} castShadow>
               <boxGeometry args={[0.4, 0.5, 0.2]} />
               <meshStandardMaterial color="#ffffff" roughness={0.1} />
               {/* Flush Button */}
               <mesh position={[0, 0.25, 0.1]} rotation={[Math.PI/2, 0, 0]}>
                 <cylinderGeometry args={[0.03, 0.03, 0.02, 16]} />
                 <meshStandardMaterial color="#dddddd" metalness={0.8} roughness={0.2} />
               </mesh>
            </mesh>
            {/* Bowl */}
            <mesh position={[0, 0.4, 0.05]} rotation={[-0.1, 0, 0]} castShadow>
               <cylinderGeometry args={[0.22, 0.18, 0.25, 32]} />
               <meshStandardMaterial color="#ffffff" roughness={0.1} />
            </mesh>
            {/* Seat & Lid */}
            <mesh position={[0, 0.54, 0.05]} castShadow>
               <cylinderGeometry args={[0.225, 0.225, 0.02, 32]} />
               <meshStandardMaterial color="#f8f8f8" roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.56, 0.05]} rotation={[-0.1, 0, 0]} castShadow>
               <cylinderGeometry args={[0.225, 0.225, 0.02, 32]} />
               <meshStandardMaterial color="#ffffff" roughness={0.2} />
            </mesh>
        </group>
      );
    }

    if (obj.type === 'sink') {
      return (
        <group>
            {/* Floating Vanity Cabinet */}
            <mesh position={[0, 0.45, 0]} castShadow>
              <boxGeometry args={[0.7, 0.4, 0.45]} />
              <meshStandardMaterial color="#4a4a4a" roughness={0.7} />
              {/* Drawers lines */}
              <mesh position={[0, 0, 0.226]}>
                <boxGeometry args={[0.68, 0.02, 0.01]} />
                <meshStandardMaterial color="#333" />
              </mesh>
            </mesh>
            {/* Basin / Countertop */}
            <mesh position={[0, 0.675, 0]} castShadow>
              <boxGeometry args={[0.72, 0.05, 0.47]} />
              <meshStandardMaterial color="#ffffff" roughness={0.1} />
            </mesh>
            {/* Sink Bow Hole (simulated with a darker inner mesh) */}
            <mesh position={[0, 0.68, 0.05]}>
              <cylinderGeometry args={[0.2, 0.15, 0.04, 32]} />
              <meshStandardMaterial color="#eeeeee" roughness={0.2} />
            </mesh>
            {/* Tap Base */}
            <mesh position={[0, 0.72, -0.15]} castShadow>
              <cylinderGeometry args={[0.02, 0.025, 0.08, 16]} />
              <meshStandardMaterial color="#cccccc" metalness={0.9} roughness={0.1} />
            </mesh>
            {/* Tap Spout */}
            <mesh position={[0, 0.77, -0.1]} rotation={[Math.PI/2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.015, 0.015, 0.12, 16]} />
              <meshStandardMaterial color="#cccccc" metalness={0.9} roughness={0.1} />
              <mesh position={[0, -0.06, -0.02]} rotation={[Math.PI/2, 0, 0]}>
                 <cylinderGeometry args={[0.015, 0.015, 0.04, 16]} />
                 <meshStandardMaterial color="#cccccc" metalness={0.9} roughness={0.1} />
              </mesh>
            </mesh>
        </group>
      );
    }

    if (obj.type === 'shower') {
      return (
        <group>
            {/* Tray */}
            <mesh position={[0, 0.05, 0]} castShadow>
              <boxGeometry args={[0.9, 0.1, 0.9]} />
              <meshStandardMaterial color="#ffffff" roughness={0.1} />
            </mesh>
            {/* Drain */}
            <mesh position={[0, 0.101, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.002, 16]} />
              <meshStandardMaterial color="#cccccc" metalness={0.8} />
            </mesh>
            {/* Glass walls */}
            <mesh position={[0.44, 1.05, 0]}>
              <boxGeometry args={[0.01, 2, 0.9]} />
              <meshPhysicalMaterial color="#cceeff" transmission={0.9} ior={1.5} roughness={0} />
            </mesh>
            <mesh position={[0, 1.05, 0.44]}>
              <boxGeometry args={[0.88, 2, 0.01]} />
              <meshPhysicalMaterial color="#cceeff" transmission={0.9} ior={1.5} roughness={0} />
            </mesh>
            {/* Fixture pole */}
            <mesh position={[0, 1.2, -0.42]} castShadow>
              <cylinderGeometry args={[0.01, 0.01, 1.2, 16]} />
              <meshStandardMaterial color="#cccccc" metalness={0.9} roughness={0.1} />
            </mesh>
            {/* Rain shower head */}
            <mesh position={[0, 1.8, -0.22]} rotation={[0, 0, 0]} castShadow>
               <cylinderGeometry args={[0.1, 0.1, 0.02, 32]} />
               <meshStandardMaterial color="#cccccc" metalness={0.9} roughness={0.1} />
            </mesh>
            {/* Shower head arm */}
            <mesh position={[0, 1.8, -0.32]} rotation={[Math.PI/2, 0, 0]} castShadow>
               <cylinderGeometry args={[0.01, 0.01, 0.2, 16]} />
               <meshStandardMaterial color="#cccccc" metalness={0.9} roughness={0.1} />
            </mesh>
            {/* Mixer/Controls */}
            <mesh position={[0, 1.0, -0.42]} rotation={[Math.PI/2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.04, 0.04, 0.06, 32]} />
              <meshStandardMaterial color="#cccccc" metalness={0.9} roughness={0.1} />
            </mesh>
        </group>
      );
    }

    if (obj.type === 'desk') {
      return (
        <group>
            {/* Top */}
            <mesh position={[0, 0.73, 0]} castShadow><boxGeometry args={[1.4, 0.04, 0.7]} /><meshStandardMaterial color="#d4b595" roughness={0.8} /></mesh>
            {/* Legs */}
            <mesh position={[-0.65, 0.365, -0.3]} castShadow><boxGeometry args={[0.04, 0.73, 0.04]} /><meshStandardMaterial color="#222" metalness={0.5} roughness={0.5} /></mesh>
            <mesh position={[0.65, 0.365, -0.3]} castShadow><boxGeometry args={[0.04, 0.73, 0.04]} /><meshStandardMaterial color="#222" metalness={0.5} roughness={0.5} /></mesh>
            <mesh position={[-0.65, 0.365, 0.3]} castShadow><boxGeometry args={[0.04, 0.73, 0.04]} /><meshStandardMaterial color="#222" metalness={0.5} roughness={0.5} /></mesh>
            <mesh position={[0.65, 0.365, 0.3]} castShadow><boxGeometry args={[0.04, 0.73, 0.04]} /><meshStandardMaterial color="#222" metalness={0.5} roughness={0.5} /></mesh>
        </group>
      );
    }

    if (obj.type === 'sofa') {
      return (
        <group>
            {/* Base */}
            <mesh position={[0, 0.15, 0]} castShadow><boxGeometry args={[2.1, 0.1, 0.85]} /><meshStandardMaterial color="#3e3e3e" roughness={0.8} /></mesh>
            {/* Seat cushions */}
            <mesh position={[-0.5, 0.3, 0.05]} castShadow><boxGeometry args={[0.95, 0.2, 0.65]} /><meshStandardMaterial color="#6a6a6a" roughness={1.0} /></mesh>
            <mesh position={[0.5, 0.3, 0.05]} castShadow><boxGeometry args={[0.95, 0.2, 0.65]} /><meshStandardMaterial color="#6a6a6a" roughness={1.0} /></mesh>
            {/* Backrest */}
            <mesh position={[0, 0.6, -0.3]} castShadow><boxGeometry args={[2.0, 0.6, 0.25]} /><meshStandardMaterial color="#6a6a6a" roughness={1.0} /></mesh>
            {/* Armrests */}
            <mesh position={[-0.95, 0.5, 0.05]} castShadow><boxGeometry args={[0.2, 0.5, 0.75]} /><meshStandardMaterial color="#6a6a6a" roughness={1.0} /></mesh>
            <mesh position={[0.95, 0.5, 0.05]} castShadow><boxGeometry args={[0.2, 0.5, 0.75]} /><meshStandardMaterial color="#6a6a6a" roughness={1.0} /></mesh>
            {/* Legs */}
            <mesh position={[-0.9, 0.05, 0.3]}><cylinderGeometry args={[0.03, 0.02, 0.1, 16]} /><meshStandardMaterial color="#222" /></mesh>
            <mesh position={[0.9, 0.05, 0.3]}><cylinderGeometry args={[0.03, 0.02, 0.1, 16]} /><meshStandardMaterial color="#222" /></mesh>
            <mesh position={[-0.9, 0.05, -0.3]}><cylinderGeometry args={[0.03, 0.02, 0.1, 16]} /><meshStandardMaterial color="#222" /></mesh>
            <mesh position={[0.9, 0.05, -0.3]}><cylinderGeometry args={[0.03, 0.02, 0.1, 16]} /><meshStandardMaterial color="#222" /></mesh>
        </group>
      );
    }

    if (obj.type === 'armchair') {
      return (
        <group>
            {/* Base */}
            <mesh position={[0, 0.15, 0]} castShadow><boxGeometry args={[0.9, 0.1, 0.85]} /><meshStandardMaterial color="#3e3e3e" roughness={0.8} /></mesh>
            {/* Base cushion */}
            <mesh position={[0, 0.3, 0.05]} castShadow><boxGeometry args={[0.9, 0.2, 0.65]} /><meshStandardMaterial color="#6a6a6a" roughness={1.0} /></mesh>
            {/* Backrest */}
            <mesh position={[0, 0.6, -0.3]} castShadow><boxGeometry args={[0.9, 0.6, 0.25]} /><meshStandardMaterial color="#6a6a6a" roughness={1.0} /></mesh>
            {/* Armrests */}
            <mesh position={[-0.35, 0.5, 0.05]} castShadow><boxGeometry args={[0.2, 0.5, 0.75]} /><meshStandardMaterial color="#6a6a6a" roughness={1.0} /></mesh>
            <mesh position={[0.35, 0.5, 0.05]} castShadow><boxGeometry args={[0.2, 0.5, 0.75]} /><meshStandardMaterial color="#6a6a6a" roughness={1.0} /></mesh>
            {/* Legs */}
            <mesh position={[-0.3, 0.05, 0.3]}><cylinderGeometry args={[0.03, 0.02, 0.1, 16]} /><meshStandardMaterial color="#222" /></mesh>
            <mesh position={[0.3, 0.05, 0.3]}><cylinderGeometry args={[0.03, 0.02, 0.1, 16]} /><meshStandardMaterial color="#222" /></mesh>
            <mesh position={[-0.3, 0.05, -0.3]}><cylinderGeometry args={[0.03, 0.02, 0.1, 16]} /><meshStandardMaterial color="#222" /></mesh>
            <mesh position={[0.3, 0.05, -0.3]}><cylinderGeometry args={[0.03, 0.02, 0.1, 16]} /><meshStandardMaterial color="#222" /></mesh>
        </group>
      );
    }

    if (obj.type === 'dining_table') {
      return (
        <group>
            {/* Top */}
            <mesh position={[0, 0.75, 0]} castShadow>
               <cylinderGeometry args={[0.6, 0.6, 0.05, 32]} />
               <meshStandardMaterial color="#f4f4f4" roughness={0.3} />
            </mesh>
            {/* Base Pedestal */}
            <mesh position={[0, 0.36, 0]} castShadow>
               <cylinderGeometry args={[0.06, 0.1, 0.72, 32]} />
               <meshStandardMaterial color="#ffffff" roughness={0.1} />
            </mesh>
            {/* Base Plate */}
            <mesh position={[0, 0.02, 0]} castShadow>
               <cylinderGeometry args={[0.3, 0.35, 0.04, 32]} />
               <meshStandardMaterial color="#ffffff" roughness={0.1} />
            </mesh>
            {/* Chairs (Simple representations) */}
            <group position={[0, 0, -0.45]}>
               <mesh position={[0, 0.22, 0]} castShadow><cylinderGeometry args={[0.2, 0.2, 0.44, 32]} /><meshStandardMaterial color="#222" /></mesh>
            </group>
            <group position={[0, 0, 0.45]}>
               <mesh position={[0, 0.22, 0]} castShadow><cylinderGeometry args={[0.2, 0.2, 0.44, 32]} /><meshStandardMaterial color="#222" /></mesh>
            </group>
            <group position={[-0.45, 0, 0]}>
               <mesh position={[0, 0.22, 0]} castShadow><cylinderGeometry args={[0.2, 0.2, 0.44, 32]} /><meshStandardMaterial color="#222" /></mesh>
            </group>
            <group position={[0.45, 0, 0]}>
               <mesh position={[0, 0.22, 0]} castShadow><cylinderGeometry args={[0.2, 0.2, 0.44, 32]} /><meshStandardMaterial color="#222" /></mesh>
            </group>
        </group>
      );
    }

    if (obj.type === 'rug') {
      return (
        <mesh position={[0, 0.03, 0]} receiveShadow>
          <boxGeometry args={[2.5, 0.04, 3.5]} />
          <meshStandardMaterial color="#c2b5a3" roughness={1} />
        </mesh>
      );
    }

    if (obj.type === 'tv') {
      return (
        <group>
          {/* TV Unit / Cabinet */}
          <mesh position={[0, 0.25, 0]} castShadow><boxGeometry args={[1.8, 0.5, 0.45]} /><meshStandardMaterial color="#f0f0f0" roughness={0.5} /></mesh>
          {/* Wooden Top */}
          <mesh position={[0, 0.51, 0]} castShadow><boxGeometry args={[1.82, 0.04, 0.47]} /><meshStandardMaterial color="#d4b595" roughness={0.9} /></mesh>
          {/* Drawers */}
          <mesh position={[-0.45, 0.25, 0.23]} castShadow><boxGeometry args={[0.85, 0.45, 0.02]} /><meshStandardMaterial color="#fff" roughness={0.4} /></mesh>
          <mesh position={[0.45, 0.25, 0.23]} castShadow><boxGeometry args={[0.85, 0.45, 0.02]} /><meshStandardMaterial color="#fff" roughness={0.4} /></mesh>
          
          {/* Stand */}
          <mesh position={[0, 0.55, 0]} castShadow><boxGeometry args={[0.4, 0.05, 0.2]} /><meshStandardMaterial color="#222" roughness={0.5} /></mesh>
          <mesh position={[0, 0.65, 0]} castShadow><boxGeometry args={[0.05, 0.2, 0.05]} /><meshStandardMaterial color="#222" roughness={0.5} /></mesh>
          {/* TV Screen Frame */}
          <mesh position={[0, 1.1, 0]} castShadow><boxGeometry args={[1.5, 0.85, 0.06]} /><meshStandardMaterial color="#111" roughness={0.2} metalness={0.8} /></mesh>
          {/* Screen */}
          <mesh position={[0, 1.1, 0.031]}><planeGeometry args={[1.45, 0.8]} /><meshBasicMaterial color="#000" /></mesh>
        </group>
      );
    }

    if (obj.type === 'bed') {
      return (
        <Suspense fallback={<BedFallback />}>
          <BedModel />
        </Suspense>
      );
    }

    if (obj.type === 'bookshelf') {
      return (
        <group>
          {/* Frame */}
          <mesh position={[-0.48, 1.0, 0]} castShadow><boxGeometry args={[0.04, 2.0, 0.4]} /><meshStandardMaterial color="#2c2c2c" roughness={0.8} /></mesh>
          <mesh position={[0.48, 1.0, 0]} castShadow><boxGeometry args={[0.04, 2.0, 0.4]} /><meshStandardMaterial color="#2c2c2c" roughness={0.8} /></mesh>
          <mesh position={[0, 2.0, 0]} castShadow><boxGeometry args={[1.0, 0.04, 0.4]} /><meshStandardMaterial color="#2c2c2c" roughness={0.8} /></mesh>
          {/* Back panel */}
          <mesh position={[0, 1.0, -0.19]} castShadow><boxGeometry args={[0.92, 2.0, 0.02]} /><meshStandardMaterial color="#444" roughness={0.9} /></mesh>
          {/* Shelves */}
          <mesh position={[0, 0.1, 0]} castShadow><boxGeometry args={[0.92, 0.04, 0.38]} /><meshStandardMaterial color="#d4b595" roughness={0.9} /></mesh>
          <mesh position={[0, 0.5, 0]} castShadow><boxGeometry args={[0.92, 0.04, 0.38]} /><meshStandardMaterial color="#d4b595" roughness={0.9} /></mesh>
          <mesh position={[0, 0.9, 0]} castShadow><boxGeometry args={[0.92, 0.04, 0.38]} /><meshStandardMaterial color="#d4b595" roughness={0.9} /></mesh>
          <mesh position={[0, 1.3, 0]} castShadow><boxGeometry args={[0.92, 0.04, 0.38]} /><meshStandardMaterial color="#d4b595" roughness={0.9} /></mesh>
          <mesh position={[0, 1.7, 0]} castShadow><boxGeometry args={[0.92, 0.04, 0.38]} /><meshStandardMaterial color="#d4b595" roughness={0.9} /></mesh>
          {/* Books (random blocks) */}
          <mesh position={[-0.2, 0.25, 0]} castShadow><boxGeometry args={[0.3, 0.26, 0.2]} /><meshStandardMaterial color="#8b5a2b" roughness={0.8} /></mesh>
          <mesh position={[0.2, 0.65, 0]} castShadow><boxGeometry args={[0.4, 0.25, 0.25]} /><meshStandardMaterial color="#556b2f" roughness={0.8} /></mesh>
          <mesh position={[-0.1, 1.05, 0]} castShadow><boxGeometry args={[0.5, 0.26, 0.22]} /><meshStandardMaterial color="#4682b4" roughness={0.8} /></mesh>
          <mesh position={[0.25, 1.45, 0]} castShadow><boxGeometry args={[0.35, 0.26, 0.2]} /><meshStandardMaterial color="#cd5c5c" roughness={0.8} /></mesh>
        </group>
      );
    }

    if (obj.type === 'interior_wall') {
      const w = obj.widthMm ? obj.widthMm / 1000 : 1;
      const d = obj.depthMm ? obj.depthMm / 1000 : 0.1;
      const h = 2.5; // 2.5m high by default inside
      const retL = obj.returnLengthMm ? obj.returnLengthMm / 1000 : 0;
      
      const gapW = obj.doorGapWidthMm ? obj.doorGapWidthMm / 1000 : 0.8;
      const gapOff = obj.doorGapOffsetMm ? obj.doorGapOffsetMm / 1000 : 0;
      
      return (
        <group>
            <mesh position={[0, h/2, 0]} castShadow receiveShadow>
               <meshStandardMaterial color={obj.color || room.interiorColor || '#ffffff'} roughness={0.9} />
               <Geometry>
                 <Base>
                   <boxGeometry args={[w, h, d]} />
                 </Base>
                 {retL > 0 && (
                   <Base position={[w/2 - d/2, 0, retL/2 - d/2]}>
                     <boxGeometry args={[d, h, retL]} />
                   </Base>
                 )}
                 {obj.hasDoorGap && (
                   <Subtraction position={[gapOff, -h/2 + 2.1/2, 0]}>
                     <boxGeometry args={[gapW, 2.1, d * 3]} />
                   </Subtraction>
                 )}
               </Geometry>
            </mesh>
        </group>
      );
    }

    if (obj.type === 'interior_door') {
      const w = obj.widthMm ? obj.widthMm / 1000 : 0.8;
      const d = obj.depthMm ? obj.depthMm / 1000 : 0.15;
      const h = 2.0;
      return (
        <group>
            {/* Door Frame */}
            <mesh position={[-w/2 - 0.025, h/2, 0]} castShadow><boxGeometry args={[0.05, h, d + 0.02]} /><meshStandardMaterial color={obj.color || room.interiorColor || '#ffffff'} roughness={0.9} /></mesh>
            <mesh position={[w/2 + 0.025, h/2, 0]} castShadow><boxGeometry args={[0.05, h, d + 0.02]} /><meshStandardMaterial color={obj.color || room.interiorColor || '#ffffff'} roughness={0.9} /></mesh>
            <mesh position={[0, h + 0.025, 0]} castShadow><boxGeometry args={[w + 0.1, 0.05, d + 0.02]} /><meshStandardMaterial color={obj.color || room.interiorColor || '#ffffff'} roughness={0.9} /></mesh>
            {/* Door panel open at 45 deg */}
            <group position={[-w/2, 0.01, 0]} rotation={[0, Math.PI/4, 0]}>
               <mesh position={[w/2, h/2, 0]} castShadow><boxGeometry args={[w, h, 0.04]} /><meshStandardMaterial color="#f0f0f0" roughness={0.5} /></mesh>
            </group>
        </group>
      );
    }

    if (obj.type === 'dressing_table') {
      return (
        <group>
          {/* Table top */}
          <mesh position={[0, 0.75, 0]} castShadow><boxGeometry args={[1.2, 0.05, 0.5]} /><meshStandardMaterial color="#fff" roughness={0.5} /></mesh>
          {/* Legs */}
          <mesh position={[-0.55, 0.375, -0.2]} castShadow><cylinderGeometry args={[0.02, 0.015, 0.75]} /><meshStandardMaterial color="#b8935c" metalness={0.6} /></mesh>
          <mesh position={[0.55, 0.375, -0.2]} castShadow><cylinderGeometry args={[0.02, 0.015, 0.75]} /><meshStandardMaterial color="#b8935c" metalness={0.6} /></mesh>
          <mesh position={[-0.55, 0.375, 0.2]} castShadow><cylinderGeometry args={[0.02, 0.015, 0.75]} /><meshStandardMaterial color="#b8935c" metalness={0.6} /></mesh>
          <mesh position={[0.55, 0.375, 0.2]} castShadow><cylinderGeometry args={[0.02, 0.015, 0.75]} /><meshStandardMaterial color="#b8935c" metalness={0.6} /></mesh>
          {/* Mirror */}
          <mesh position={[0, 1.25, -0.22]} rotation={[Math.PI/2, 0, 0]} castShadow><cylinderGeometry args={[0.4, 0.4, 0.02, 32]} /><meshStandardMaterial color="#b8935c" metalness={0.8} /></mesh>
          <mesh position={[0, 1.25, -0.21]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.38, 0.38, 0.01, 32]} /><meshStandardMaterial color="#aaa" metalness={1} roughness={0} /></mesh>
          {/* Stool */}
          <mesh position={[0, 0.25, 0.3]} castShadow><cylinderGeometry args={[0.2, 0.2, 0.1, 32]} /><meshStandardMaterial color="#6a6a6a" roughness={0.9} /></mesh>
          <mesh position={[0, 0.1, 0.3]} castShadow><cylinderGeometry args={[0.03, 0.1, 0.2, 16]} /><meshStandardMaterial color="#b8935c" metalness={0.6} /></mesh>
        </group>
      );
    }

    if (obj.type === 'wardrobe') {
      return (
        <group>
          {/* Main body */}
          <mesh position={[0, 1.1, 0]} castShadow><boxGeometry args={[1.2, 2.2, 0.6]} /><meshStandardMaterial color="#f4f4f4" roughness={0.6} /></mesh>
          {/* Doors */}
          <mesh position={[-0.3, 1.1, 0.305]} castShadow><boxGeometry args={[0.58, 2.15, 0.02]} /><meshStandardMaterial color="#fff" roughness={0.4} /></mesh>
          <mesh position={[0.3, 1.1, 0.305]} castShadow><boxGeometry args={[0.58, 2.15, 0.02]} /><meshStandardMaterial color="#fff" roughness={0.4} /></mesh>
          {/* Handles */}
          <mesh position={[-0.05, 1.1, 0.32]} castShadow><boxGeometry args={[0.02, 0.2, 0.02]} /><meshStandardMaterial color="#b8935c" metalness={0.8} /></mesh>
          <mesh position={[0.05, 1.1, 0.32]} castShadow><boxGeometry args={[0.02, 0.2, 0.02]} /><meshStandardMaterial color="#b8935c" metalness={0.8} /></mesh>
        </group>
      );
    }

    if (obj.type === 'exterior_wall_light') {
      return (
        <group>
          <mesh position={[0, 1.5, 0]} castShadow>
             <boxGeometry args={[0.1, 0.2, 0.12]} />
             <meshStandardMaterial color="#222" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh position={[0, 1.5, 0.07]}>
             <boxGeometry args={[0.08, 0.18, 0.02]} />
             <meshBasicMaterial color="#ffeba8" />
          </mesh>
          <pointLight position={[0, 1.5, 0.1]} color="#ffeba8" intensity={0.8} distance={3} />
        </group>
      );
    }

    if (obj.type === 'drop_light') {
      return (
        <group>
          {/* Cord */}
          <mesh position={[0, 2.1, 0]}><cylinderGeometry args={[0.01, 0.01, 0.8]} /><meshStandardMaterial color="#111" /></mesh>
          {/* Shade */}
          <mesh position={[0, 1.6, 0]} castShadow><cylinderGeometry args={[0.15, 0.3, 0.2, 32]} /><meshStandardMaterial color="#333" metalness={0.7} roughness={0.3} /></mesh>
          {/* Bulb */}
          <mesh position={[0, 1.5, 0]}><sphereGeometry args={[0.08, 16, 16]} /><meshBasicMaterial color="#ffeba8" /></mesh>
          <pointLight position={[0, 1.4, 0]} color="#ffeba8" intensity={1} distance={4} />
        </group>
      );
    }

    if (obj.type === 'coffee_table') {
      return (
        <group>
          {/* Top */}
          <mesh position={[0, 0.4, 0]} castShadow><boxGeometry args={[1.0, 0.05, 0.6]} /><meshStandardMaterial color="#fff" roughness={0.4} /></mesh>
          {/* Legs */}
          <mesh position={[-0.45, 0.2, -0.25]} castShadow><cylinderGeometry args={[0.02, 0.015, 0.4]} /><meshStandardMaterial color="#222" metalness={0.8} /></mesh>
          <mesh position={[0.45, 0.2, -0.25]} castShadow><cylinderGeometry args={[0.02, 0.015, 0.4]} /><meshStandardMaterial color="#222" metalness={0.8} /></mesh>
          <mesh position={[-0.45, 0.2, 0.25]} castShadow><cylinderGeometry args={[0.02, 0.015, 0.4]} /><meshStandardMaterial color="#222" metalness={0.8} /></mesh>
          <mesh position={[0.45, 0.2, 0.25]} castShadow><cylinderGeometry args={[0.02, 0.015, 0.4]} /><meshStandardMaterial color="#222" metalness={0.8} /></mesh>
        </group>
      );
    }

    if (obj.type === 'kitchen_island') {
      return (
        <group>
          {/* Base */}
          <mesh position={[0, 0.45, 0]} castShadow><boxGeometry args={[1.8, 0.9, 0.8]} /><meshStandardMaterial color="#30415d" roughness={0.7} /></mesh>
          {/* Top */}
          <mesh position={[0, 0.92, 0]} castShadow><boxGeometry args={[1.9, 0.04, 0.9]} /><meshStandardMaterial color="#fff" roughness={0.2} /></mesh>
          {/* Stools */}
          <group position={[-0.4, 0.35, 0.5]}>
             <mesh castShadow><cylinderGeometry args={[0.15, 0.15, 0.04, 32]} /><meshStandardMaterial color="#d4b595" /></mesh>
             <mesh position={[0, -0.17, 0]} castShadow><cylinderGeometry args={[0.02, 0.02, 0.34]} /><meshStandardMaterial color="#222" /></mesh>
          </group>
          <group position={[0.4, 0.35, 0.5]}>
             <mesh castShadow><cylinderGeometry args={[0.15, 0.15, 0.04, 32]} /><meshStandardMaterial color="#d4b595" /></mesh>
             <mesh position={[0, -0.17, 0]} castShadow><cylinderGeometry args={[0.02, 0.02, 0.34]} /><meshStandardMaterial color="#222" /></mesh>
          </group>
        </group>
      );
    }

    if (obj.type === 'indoor_plant') {
      return (
        <group>
          {/* Pot */}
          <mesh position={[0, 0.2, 0]} castShadow><cylinderGeometry args={[0.2, 0.15, 0.4, 32]} /><meshStandardMaterial color="#fff" roughness={0.4} /></mesh>
          {/* Soil */}
          <mesh position={[0, 0.39, 0]}><cylinderGeometry args={[0.19, 0.19, 0.02, 32]} /><meshStandardMaterial color="#2c1a0e" roughness={1} /></mesh>
          {/* Leaves (abstracted as overlapping spheres) */}
          <mesh position={[0, 0.6, 0]} castShadow><sphereGeometry args={[0.25, 16, 16]} /><meshStandardMaterial color="#4a7c59" roughness={0.8} /></mesh>
          <mesh position={[-0.1, 0.8, 0.1]} castShadow><sphereGeometry args={[0.2, 16, 16]} /><meshStandardMaterial color="#4a7c59" roughness={0.8} /></mesh>
          <mesh position={[0.1, 0.7, -0.1]} castShadow><sphereGeometry args={[0.22, 16, 16]} /><meshStandardMaterial color="#4a7c59" roughness={0.8} /></mesh>
          <mesh position={[0, 0.9, 0]} castShadow><sphereGeometry args={[0.18, 16, 16]} /><meshStandardMaterial color="#4a7c59" roughness={0.8} /></mesh>
        </group>
      );
    }

    return null;
  })();

  const handleRadius = (FOOTPRINT_RADIUS[obj.type] ?? 0.8) + 0.25;

  const rotDown = (e: any) => {
    e.stopPropagation();
    setSelectedObjectId(obj.id);
    useStore.getState().saveState();
    setIsRotating(true);
    useStore.getState().setControlsEnabled(false);
    e.target.setPointerCapture(e.pointerId);
  };
  const rotMove = (e: any) => {
    if (!isRotating) return;
    const p = new THREE.Vector3();
    e.ray.intersectPlane(plane, p);
    if (!p) return;
    // Angle from the object centre to the pointer; 15° snap unless Shift.
    let ang = Math.atan2(p.x - obj.x, p.z - obj.z);
    if (!e.shiftKey) ang = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12);
    updateObject(obj.id, { rot: ang });
  };
  const rotUp = (e: any) => {
    e.stopPropagation();
    setIsRotating(false);
    useStore.getState().setControlsEnabled(true);
    e.target.releasePointerCapture(e.pointerId);
  };

  return (
    <group
      // Lets the walkthrough crosshair resolve a hit mesh back to its object.
      userData={{ objectId: obj.id }}
      position={pos}
      rotation={[0, obj.rot, 0]}
      scale={obj.scale}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('focus-object', { detail: { x: obj.x, z: obj.z } }));
      }}
    >
      {meshContent}
      {isSelected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI/2, 0, 0]}>
          {/* A tight ring reads as "this object", the old 2m halo read as
              "somewhere around here" and overlapped every neighbour. */}
          <ringGeometry args={[0.65, 0.75, 40]} />
          <meshBasicMaterial color="#10b981" side={THREE.DoubleSide} transparent opacity={0.9} />
        </mesh>
      )}
      {/* Rotation handle: a knob on a faint guide ring just outside the
          object. Drag it to rotate with a 15° snap (Shift = free). */}
      {isSelected && !isDragging && viewMode !== 'walking' && (
        <>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI/2, 0, 0]}>
            <ringGeometry args={[handleRadius - 0.012, handleRadius + 0.012, 48]} />
            <meshBasicMaterial color="#10b981" side={THREE.DoubleSide} transparent opacity={isRotating ? 0.8 : 0.3} depthWrite={false} />
          </mesh>
          <mesh
            position={[0, 0.08, handleRadius]}
            onPointerDown={rotDown}
            onPointerMove={rotMove}
            onPointerUp={rotUp}
            onPointerOver={() => { document.body.style.cursor = 'grab'; }}
            onPointerOut={() => { document.body.style.cursor = 'default'; }}
          >
            <sphereGeometry args={[0.09, 16, 16]} />
            <meshBasicMaterial color="#10b981" />
          </mesh>
        </>
      )}
      {/* The rotate/duplicate/delete pill that used to float above the object
          now lives in the docked panel at the bottom - one place for the
          selection's controls instead of a pill covering the thing you are
          trying to look at. */}
      {/* Live distances to the inside wall faces while dragging an interior
          object - the numbers a real furniture plan is made of. */}
      {isDragging && isInterior && (() => {
        const w = room.widthMm / 1000, d = room.depthMm / 1000;
        const f = (v: number) => `${Math.max(0, v).toFixed(2)}m`;
        return (
          <Html position={[0, 1.6, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[100, 0]}>
            <div style={{ background: 'rgba(29,29,31,0.88)', color: '#fff', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'system-ui, sans-serif' }}>
              &#8592; {f(obj.x + w / 2)} &nbsp;|&nbsp; {f(w / 2 - obj.x)} &#8594; &nbsp;&nbsp; &#8593; {f(obj.z + d / 2)} &nbsp;|&nbsp; {f(d / 2 - obj.z)} &#8595;
            </div>
          </Html>
        );
      })()}
    </group>
  );
}
