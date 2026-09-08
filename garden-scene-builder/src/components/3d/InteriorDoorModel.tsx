import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../../store';
import { INTERIOR_DOOR_URL, INTERIOR_DOOR_STYLES, METAL_FINISHES } from '../../modelRegistry';
import type { InteriorDoorStyle } from '../../types';

/**
 * A modelled internal door - lining, leaf, hinges and handle - sitting in a
 * partition's opening.
 *
 * The GLB is Charlie's oak country door (8 Sep 2026), cleaned to one lining
 * with its closed leaf: 762 wide x 2090 high outside the lining, 170 deep,
 * origin at the bottom centre of the lining. It is scaled to the opening it
 * is put in, and its depth to the wall it is in, so the lining reads as
 * fitting that wall rather than a standard 170mm one.
 *
 * The "open" copy in Charlie's export is not used: the leaf is swung about
 * its own hinge line here, so it follows the Open Doors button with the
 * exterior doors, can be opened on its own from the walkthrough panel, and
 * can stop at any angle.
 *
 * The white option is the same door painted: both oak materials are
 * replaced with a satin white, the ironmongery kept. The ironmongery takes
 * the tap finishes - chrome, brass, black and so on - per door.
 */

/** Model-space geometry, measured from the cleaned GLB. */
const MODEL_W = 0.762;
const MODEL_H = 2.09;
const MODEL_D = 0.17;
/** The hinge line: hinges sit at x 0.332-0.34 on the leaf, whose thickness
 *  spans z 0.025-0.075. */
const HINGE_X = 0.336;
const HINGE_Z = 0.05;
const LEAF_NODE = 'Door+hinges';
const HANDLE_NODE = 'DoorHandle_1';
/** The lever was modelled 207mm long - a big one. Scaled about the rose,
 *  which stays where it was fixed to the door. */
const HANDLE_SCALE = 0.72;
const OAK_MATERIALS = ['Oak,French', '941,942, 2941, Corn Oak (horizontaal)'];
const IRONMONGERY = ['[Steel Brushed Stainless]', '*9', '*5', '<LightGray>'];

const finishFor = (hex?: string) => {
  const h = (hex ?? '').toLowerCase();
  return METAL_FINISHES.find(f => f.hex.toLowerCase() === h) ?? METAL_FINISHES[0];
};

export function InteriorDoorModel({ doorId, style, ironmongery, swing = 1, widthMm, heightMm, thicknessM }: {
  doorId: string;
  style: InteriorDoorStyle;
  ironmongery?: string;
  swing?: 1 | -1;
  widthMm: number;
  heightMm: number;
  thicknessM: number;
}) {
  const { scene } = useGLTF(INTERIOR_DOOR_URL);
  const areDoorsOpen = useStore(s => s.areDoorsOpen);
  const thisOpen = useStore(s => s.openDoorIds.includes(doorId));
  const pivot = useRef<THREE.Group | null>(null);

  const model = useMemo(() => {
    const root = scene.clone(true);
    const spec = INTERIOR_DOOR_STYLES[style];
    const metals: THREE.MeshStandardMaterial[] = [];
    root.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const src = mesh.material as THREE.MeshStandardMaterial;
      if (OAK_MATERIALS.includes(src.name)) {
        if (spec.paint) {
          // Painted: a flat satin colour, the timber texture dropped.
          const m = new THREE.MeshStandardMaterial({ color: spec.paint, roughness: 0.55, metalness: 0 });
          m.name = src.name;
          mesh.material = m;
        } else {
          // Oak as exported, minus the exporter's blanket half-metalness.
          const m = src.clone();
          m.metalness = 0;
          m.roughness = 0.65;
          m.needsUpdate = true;
          mesh.material = m;
        }
      } else if (IRONMONGERY.includes(src.name)) {
        const m = new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.3, envMapIntensity: 1.1 });
        m.name = src.name;
        mesh.material = m;
        metals.push(m);
      }
    });

    // Smaller handle, both sides.
    root.traverse(o => { if (o.name === HANDLE_NODE) o.scale.multiplyScalar(HANDLE_SCALE); });

    /*
     * Re-hang the leaf on a pivot at its hinge line so it can swing.
     *
     * The pivot lives in the model ROOT's frame - upright, metres, the frame
     * the hinge line was measured in. The leaf's own parent still carries the
     * exporter's Z-up, inch-scaled transform (only the subtree root was baked
     * when the door was cut out of Charlie's file), so a pivot placed there
     * and turned about its Y spun the leaf about the wrong axis: it dipped
     * into the floor instead of swinging. `attach` keeps the leaf exactly
     * where it is while moving it under the pivot, and from then on
     * hinge.rotation.y is a turn about the vertical hinge edge, as on a door.
     */
    let leaf: THREE.Object3D | null = null;
    root.traverse(o => { if (!leaf && o.name === LEAF_NODE) leaf = o; });
    const hinge = new THREE.Group();
    hinge.name = 'hinge';
    hinge.position.set(HINGE_X, 0, HINGE_Z);
    root.add(hinge);
    root.updateMatrixWorld(true);
    if (leaf) hinge.attach(leaf);
    return { root, hinge, metals };
  }, [scene, style]);

  useEffect(() => { pivot.current = model.hinge; }, [model]);

  // The finish is a colour change on the metals, not a rebuild.
  useEffect(() => {
    const f = finishFor(ironmongery);
    model.metals.forEach(m => { m.color.set(f.hex); m.roughness = f.roughness; m.needsUpdate = true; });
  }, [model, ironmongery]);

  // Swing like the exterior leaves: eased toward the target each frame.
  // The hinges are on the leaf's +Z face, so the leaf opens towards +Z -
  // out of the lining, the way a hinge allows - never through it.
  const open = areDoorsOpen || thisOpen;
  useFrame((_, dt) => {
    const h = pivot.current;
    if (!h) return;
    const target = open ? Math.PI / 2 : 0;
    const diff = target - h.rotation.y;
    if (Math.abs(diff) < 0.001) { h.rotation.y = target; return; }
    h.rotation.y += diff * Math.min(1, dt * 6);
  });

  // To open the other way the whole set is turned round in its opening, so
  // the hinges sit on that face instead. (Handing follows: a door hung on
  // the right, opening towards you, is hung on the left from the other side.)
  return (
    <group rotation={[0, swing === -1 ? Math.PI : 0, 0]}>
      <primitive
        object={model.root}
        scale={[widthMm / 1000 / MODEL_W, heightMm / 1000 / MODEL_H, Math.min(1.2, Math.max(0.7, thicknessM / MODEL_D))]}
      />
    </group>
  );
}

useGLTF.preload(INTERIOR_DOOR_URL);
