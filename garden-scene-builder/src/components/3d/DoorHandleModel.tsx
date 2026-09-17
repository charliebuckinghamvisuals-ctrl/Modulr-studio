import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { METAL_FINISHES } from '../../modelRegistry';

/**
 * Charlie's door handle (17 Sep 2026): lever on a rose with a keep, on a
 * 40 x 200mm backplate. One model for every door in the building - the
 * exterior sets and the internal doors - in place of the two grey boxes
 * that stood in for a handle on the exterior leaves.
 *
 * The export (SimLab) sits 13.5m off the origin with the plate in the XY
 * plane: plate back at z = -0.058, lever out to z = 0 pointing +X, plate
 * 200mm tall in Y. buildHandle() moves it so the PLATE CENTRE is the
 * origin, the DOOR FACE is z = 0 and the lever projects towards +Z and
 * points +X. A door then places it by face and by which edge opens; a
 * mirror in X turns the lever to point at the door's centre.
 *
 * Loaded ONCE, imperatively, and handed out through useHandleScene() -
 * not through useGLTF. A suspending hook on every exterior leaf left the
 * whole scene blank on a cold load until something re-rendered it; a
 * state that flips from null to the model when the file arrives cannot
 * suspend anything.
 *
 * Default finish: black metal. The internal doors' ironmongery finish
 * (chrome, brass...) still applies when one is chosen.
 */
export const DOOR_HANDLE_URL = 'models/door_handle.glb';

/** Measured from the export: plate centre -> origin, door face -> z = 0. */
const OFFSET = new THREE.Vector3(-13.5299, -0.1279, 0.058);

export const BLACK_METAL = METAL_FINISHES.find(f => f.name === 'Matte Black') ?? { name: 'Matte Black', hex: '#26262a', roughness: 0.55 };

let loaded: THREE.Object3D | null = null;
let loading: Promise<THREE.Object3D> | null = null;
const listeners = new Set<(o: THREE.Object3D) => void>();

/** Start the load (once); resolves with the raw GLB scene. */
export function loadHandleScene(): Promise<THREE.Object3D> {
  if (loaded) return Promise.resolve(loaded);
  if (!loading) {
    loading = new GLTFLoader().loadAsync(DOOR_HANDLE_URL).then(g => {
      loaded = g.scene;
      listeners.forEach(l => l(g.scene));
      listeners.clear();
      return g.scene;
    }).catch(e => { console.warn('[handle] door handle model failed to load', e); loading = null; throw e; });
  }
  return loading;
}

/** The raw handle scene, or null until it has arrived. Never suspends. */
export function useHandleScene(): THREE.Object3D | null {
  const [scene, setScene] = useState<THREE.Object3D | null>(loaded);
  useEffect(() => {
    if (loaded) { setScene(loaded); return; }
    let live = true;
    const l = (o: THREE.Object3D) => { if (live) setScene(o); };
    listeners.add(l);
    loadHandleScene().catch(() => {});
    return () => { live = false; listeners.delete(l); };
  }, []);
  return scene;
}

/** A normalised copy of the handle in one metal, and that metal for later recolouring. */
export function buildHandle(scene: THREE.Object3D, hex: string = BLACK_METAL.hex, roughness: number = BLACK_METAL.roughness): { group: THREE.Group; material: THREE.MeshStandardMaterial } {
  const group = new THREE.Group();
  group.name = 'door-handle';
  const root = scene.clone(true);
  const material = new THREE.MeshStandardMaterial({ color: hex, metalness: 1, roughness, envMapIntensity: 1.1 });
  material.name = 'door-handle-metal';
  root.traverse(o => {
    // The exporter's camera stand-in, 13m away and empty.
    if (o.name === 'Active View') o.visible = false;
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.material = material; m.castShadow = true; m.receiveShadow = true; }
  });
  root.position.copy(OFFSET);
  group.add(root);
  return { group, material };
}

/**
 * Which way the lever points, and which way the handle faces, from where
 * it is on the door. `side` is the edge that opens (the handle's edge);
 * the lever points away from it, into the leaf. Returns the Y rotation and
 * the X mirror for a handle whose model lever points +X on the +Z face.
 */
export function handlePose(side: 'left' | 'right', face: 'outside' | 'inside') {
  const towardsCentre = side === 'right' ? -1 : 1;
  const rotY = face === 'outside' ? 0 : Math.PI;
  // Rotating by PI sends model +X to world -X, so the mirror flips with it.
  const mirror = (face === 'outside' ? towardsCentre : -towardsCentre) < 0 ? -1 : 1;
  return { rotY, mirror };
}

/** One handle on one face of an exterior leaf, at the leaf's local origin. Nothing until the model has loaded. */
export function DoorHandle({ side, face, hex, roughness }: { side: 'left' | 'right'; face: 'outside' | 'inside'; hex?: string; roughness?: number }) {
  const scene = useHandleScene();
  const built = useMemo(() => (scene ? buildHandle(scene, hex, roughness) : null), [scene, hex, roughness]);
  const { rotY, mirror } = handlePose(side, face);
  if (!built) return null;
  return <primitive object={built.group} rotation={[0, rotY, 0]} scale={[mirror, 1, 1]} />;
}

// Warm the cache as soon as the module is loaded.
loadHandleScene().catch(() => {});
