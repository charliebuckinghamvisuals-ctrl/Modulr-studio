import { useEffect, useRef, useState, Suspense } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useStore } from '../../store';
import { MODEL_URLS, MODEL_SCALES } from '../../modelRegistry';
import { isInteriorType, clampToRoomInterior } from '../../utils/placement';

/** Semi-transparent clone of a GLB model, used as the placement preview. */
function GhostGlb({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const cloned = useRef<THREE.Object3D | null>(null);
  if (!cloned.current) {
    cloned.current = scene.clone(true);
    cloned.current.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mesh.material = mats.length === 1
          ? Object.assign(mats[0].clone(), { transparent: true, opacity: 0.55, depthWrite: false })
          : mats.map(m => Object.assign(m.clone(), { transparent: true, opacity: 0.55, depthWrite: false }));
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
  }
  return <primitive object={cloned.current} />;
}

/**
 * Click-to-place: while a placement type is active (clicked in the sidebar),
 * a ghost of the object follows the cursor across the ground. Click drops it
 * (interior objects clamp inside the room), R rotates it 45°, Esc cancels.
 * Replaces blind HTML5 drag-drop as the primary placement flow.
 */
export function PlacementGhost() {
  const type = useStore(s => s.activePlacementType);
  const room = useStore(s => s.scene.room);
  const baseH = (room.baseHeightMm ?? 100) / 1000;
  const groupRef = useRef<THREE.Group>(null);
  const [rot, setRot] = useState(0);
  const posRef = useRef<{ x: number; z: number } | null>(null);

  useEffect(() => {
    if (!type) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useStore.getState().setActivePlacementType(null);
      else if (e.key === 'r' || e.key === 'R') setRot(r => r + Math.PI / 4);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [type]);

  useEffect(() => { setRot(0); posRef.current = null; }, [type]);

  if (!type) return null;

  const interior = isInteriorType(type);
  const modelUrl = MODEL_URLS[type];
  const y = interior ? baseH + 0.005 : 0;

  const moveGhost = (e: any) => {
    let x = e.point.x, z = e.point.z;
    if (interior) { const c = clampToRoomInterior(room, x, z); x = c.x; z = c.z; }
    posRef.current = { x, z };
    if (groupRef.current) {
      groupRef.current.position.set(x, y, z);
      groupRef.current.visible = true;
    }
  };

  const place = (e: any) => {
    e.stopPropagation();
    moveGhost(e);
    if (!posRef.current) return;
    const st = useStore.getState();
    st.saveState();
    st.addObject(type, posRef.current.x, posRef.current.z, rot);
    st.setActivePlacementType(null);
  };

  return (
    <>
      {/* Invisible catch-all plane: tracks the cursor and takes the placing
          click before anything else in the scene can react to it. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.002, 0]}
        onPointerMove={moveGhost}
        onPointerDown={place}
        renderOrder={999}
      >
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <group ref={groupRef} visible={false} rotation={[0, rot, 0]}>
        {/* Drop ring so the footprint reads even before the model streams in */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[0.32, 0.4, 32]} />
          <meshBasicMaterial color="#3b4d4a" transparent opacity={0.5} depthWrite={false} />
        </mesh>
        {modelUrl ? (
          <Suspense fallback={null}>
            <group scale={MODEL_SCALES[type] ?? [1, 1, 1]}>
              <GhostGlb url={modelUrl} />
            </group>
          </Suspense>
        ) : (
          <mesh position={[0, 0.4, 0]}>
            <cylinderGeometry args={[0.35, 0.35, 0.8, 16]} />
            <meshBasicMaterial color="#3b4d4a" transparent opacity={0.35} depthWrite={false} />
          </mesh>
        )}
      </group>
    </>
  );
}
