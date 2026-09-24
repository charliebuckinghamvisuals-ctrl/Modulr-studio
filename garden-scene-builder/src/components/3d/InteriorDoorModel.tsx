import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../../store';
import { INTERIOR_DOOR_URL, INTERIOR_DOOR_STYLES, METAL_FINISHES } from '../../modelRegistry';
import type { InteriorDoorStyle, InteriorDoorHandle } from '../../types';
import { BLACK_METAL, buildHandle, useHandleScene } from './DoorHandleModel';

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

/** No finish chosen = black metal, the handle's default (Charlie, 17 Sep). */
const finishFor = (hex?: string) => {
  const h = (hex ?? '').toLowerCase();
  return METAL_FINISHES.find(f => f.hex.toLowerCase() === h) ?? BLACK_METAL;
};

/**
 * A round door knob on a rose, in one metal, built rather than modelled:
 * rose 54mm across, a short neck, a 56mm knob slightly flattened. Origin at
 * the centre of the rose on the door face, projecting towards +Z - the same
 * frame buildHandle() gives the lever, so it is placed the same way.
 */
function buildKnob(): { group: THREE.Group; material: THREE.MeshStandardMaterial } {
  const material = new THREE.MeshStandardMaterial({ color: BLACK_METAL.hex, metalness: 1, roughness: BLACK_METAL.roughness, envMapIntensity: 1.1 });
  material.name = 'door-knob-metal';
  const group = new THREE.Group();
  group.name = 'door-knob';
  const part = (geo: THREE.BufferGeometry, z: number, scaleZ = 1) => {
    const m = new THREE.Mesh(geo, material);
    m.rotation.x = Math.PI / 2; // cylinder axis along Z, out of the door
    m.position.z = z;
    m.scale.set(1, scaleZ, 1);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  };
  part(new THREE.CylinderGeometry(0.027, 0.027, 0.008, 40), 0.004);
  part(new THREE.CylinderGeometry(0.009, 0.011, 0.032, 24), 0.024);
  // The knob: a sphere squashed along its depth, the rotation making the
  // cylinder's Y the door's Z, so the squash is in scale Y.
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.028, 40, 24), material);
  knob.position.z = 0.058;
  knob.scale.set(1, 1, 0.8);
  knob.castShadow = true;
  group.add(knob);
  return { group, material };
}

export function InteriorDoorModel({ doorId, style, ironmongery, handle = 'plate', swing = 1, widthMm, heightMm, thicknessM }: {
  doorId: string;
  style: InteriorDoorStyle;
  ironmongery?: string;
  handle?: InteriorDoorHandle;
  swing?: 1 | -1;
  widthMm: number;
  heightMm: number;
  thicknessM: number;
}) {
  const { scene } = useGLTF(INTERIOR_DOOR_URL);
  // null until the handle file arrives; the door's own handles show till then.
  const handleScene = useHandleScene();
  // Only its own button opens it (the walkthrough's door panel). Open Doors
  // in the 3D view is for the exterior sets - it used to swing every
  // internal door in the house too (Charlie, 10 Sep).
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

    /*
     * The door's own handles are replaced by Charlie's modelled handle
     * (DoorHandleModel.tsx): each original is hidden and the new one is
     * put at its centre, on the leaf face it was on, lever pointing into
     * the leaf. Added to the leaf itself so it swings with the door; the
     * metal joins the ironmongery list so the finish picker recolours it.
     */
    let leafForHandles: THREE.Object3D | null = null;
    root.traverse(o => { if (!leafForHandles && o.name === LEAF_NODE) leafForHandles = o; });
    // One handle on each face, both called DoorHandle_1 in the file - but
    // GLTFLoader makes node names unique, so the second arrives as
    // DoorHandle_1_1. Matching the exact name only ever swapped the first:
    // one face of every door had the plate lever and the other the model's
    // own rose lever (Charlie, 24 Sep 2026: "the handles are different").
    const originals: THREE.Object3D[] = [];
    root.traverse(o => { if (o.name === HANDLE_NODE || o.name.startsWith(`${HANDLE_NODE}_`)) originals.push(o); });
    root.updateMatrixWorld(true);
    /*
     * The handle is a choice (Charlie, 24 Sep 2026): 'rose' keeps the door
     * model's own lever on a round rose - its metal is already in the
     * ironmongery list, so the finish still applies; 'plate' (the default)
     * swaps in the lever on a backplate once that file has loaded; 'knob'
     * fits a built knob at the rose, which sits at the lever's door-edge
     * end rather than the middle of the lever.
     */
    const replace = handle === 'knob' || (handle !== 'rose' && !!handleScene);
    if (replace) originals.forEach(n => {
      const box = new THREE.Box3().setFromObject(n);
      const c = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      n.visible = false;
      const { group, material } = handle === 'knob' ? buildKnob() : buildHandle(handleScene!);
      metals.push(material);
      const onFront = c.z > HINGE_Z;
      const towardsCentre = c.x < 0 ? 1 : -1;
      const mirror = (onFront ? towardsCentre : -towardsCentre) < 0 ? -1 : 1;
      const x = handle === 'knob' ? c.x - towardsCentre * Math.max(0, size.x / 2 - 0.027) : c.x;
      group.position.set(x, c.y, onFront ? HINGE_Z + 0.025 : HINGE_Z - 0.025);
      group.rotation.y = onFront ? 0 : Math.PI;
      group.scale.set(mirror, 1, 1);
      root.add(group);
      root.updateMatrixWorld(true);
      if (leafForHandles) (leafForHandles as THREE.Object3D).attach(group);
    });
    void HANDLE_SCALE;

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
    // The hinge is then lifted OUT of the root so the leaf is not inside the
    // lining's scale - see the render below. Its transform relative to the
    // root is kept as-is: the root is rendered at the origin of the same
    // group the hinge is placed in.
    root.remove(hinge);
    return { root, hinge, metals };
  }, [scene, handleScene, style, handle]);

  useEffect(() => { pivot.current = model.hinge; }, [model]);

  // The finish is a colour change on the metals, not a rebuild.
  useEffect(() => {
    const f = finishFor(ironmongery);
    model.metals.forEach(m => { m.color.set(f.hex); m.roughness = f.roughness; m.needsUpdate = true; });
  }, [model, ironmongery]);

  // Swing like the exterior leaves: eased toward the target each frame.
  // The hinges are on the leaf's +Z face, so the leaf opens towards +Z -
  // out of the lining, the way a hinge allows - never through it.
  const open = thisOpen;
  useFrame((_, dt) => {
    const h = pivot.current;
    if (!h) return;
    const target = open ? Math.PI / 2 : 0;
    const diff = target - h.rotation.y;
    if (Math.abs(diff) < 0.001) { h.rotation.y = target; return; }
    h.rotation.y += diff * Math.min(1, dt * 6);
  });

  /*
   * Two scales, on purpose.
   *
   * The lining is stretched to the opening's width and height and squashed
   * to the wall's thickness - three different factors. The leaf must NOT
   * live inside that: a leaf lying along X while closed and along Z once
   * open would take the X factor in one and the Z factor in the other, so
   * it visibly shrank as it swung. The leaf hangs from its own pivot, placed
   * where the hinge line lands after the lining's scale, and is scaled by
   * the width factor in every horizontal direction so it keeps its
   * proportions through the whole arc.
   *
   * To open the other way the whole set is turned round in its opening, so
   * the hinges sit on that face instead. (Handing follows: a door hung on
   * the right, opening towards you, is hung on the left from the other side.)
   */
  const sx = widthMm / 1000 / MODEL_W;
  const sy = heightMm / 1000 / MODEL_H;
  const sz = Math.min(1.2, Math.max(0.7, thicknessM / MODEL_D));
  return (
    <group rotation={[0, swing === -1 ? Math.PI : 0, 0]}>
      <primitive object={model.root} scale={[sx, sy, sz]} />
      <primitive object={model.hinge} position={[HINGE_X * sx, 0, HINGE_Z * sz]} scale={[sx, sy, sx]} />
    </group>
  );
}

useGLTF.preload(INTERIOR_DOOR_URL);
