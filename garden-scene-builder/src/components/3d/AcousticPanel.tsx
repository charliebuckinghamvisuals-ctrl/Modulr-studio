import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import type { SceneObject } from '../../types';
import { MODEL_URLS } from '../../modelRegistry';
import { applyModelMaterials } from '../../utils/materialFixes';
import { ACOUSTIC_NATIVE, SLAT_PITCH_MM, SLAT_W_MM, slatCount, widthForSlats } from '../../utils/acousticPanel';

/** The felt behind the slats: jet black, no sheen. */
const FELT = new THREE.MeshPhysicalMaterial({ color: '#030303', roughness: 1, metalness: 0, specularIntensity: 0.1 });
FELT.name = 'acoustic felt';
/** How far the grain is drawn out along a slat: V is scaled by this, so
 *  0.35 stretches the figure nearly three times its length. */
const GRAIN_STRETCH = 0.35;

/**
 * The slatted acoustic wall panel (Charlie, 24 Sep 2026), laid out at the
 * size the customer picked rather than stretched. One slat and the felt
 * backing are taken out of models/acoustic_panel.glb, dressed like any other
 * model (applyModelMaterials - the slats are timber, so the wood is a real
 * veneer projected life-size, natural oak unless another is picked), and the
 * panel is rebuilt from them: a wider panel gets MORE slats at the same
 * 50mm-on-60mm spacing, a taller one gets longer slats. The picker thumbnail
 * and the placement ghost use the GLB as exported, at its native 1250 x 2000.
 */
export function AcousticPanel({ obj }: { obj: SceneObject }) {
  const { scene } = useGLTF(MODEL_URLS.acoustic_panel!);

  const parts = useMemo(() => {
    const root = scene.clone(true);
    applyModelMaterials('acoustic_panel', root, undefined, undefined, false, undefined, obj.id, obj.veneer);
    root.updateMatrixWorld(true);
    const baked: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; box: THREE.Box3 }[] = [];
    root.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const geometry = m.geometry.clone().applyMatrix4(m.matrixWorld);
      geometry.computeBoundingBox();
      baked.push({ geometry, material: m.material, box: geometry.boundingBox!.clone() });
    });
    const span = (p: (typeof baked)[number]) => p.box.max.x - p.box.min.x;
    // The backing is the one piece as wide as the panel; any other is a slat.
    const backing = baked.reduce((a, b) => (span(b) > span(a) ? b : a));
    const slat = baked.find(p => p !== backing)!;
    const centreX = (p: (typeof baked)[number]) => (p.box.min.x + p.box.max.x) / 2;
    slat.geometry.translate(-centreX(slat), 0, 0);
    backing.geometry.translate(-centreX(backing), 0, 0);
    // Only the two pieces used are kept.
    for (const p of baked) if (p !== backing && p !== slat) p.geometry.dispose();
    // The felt is JET black and dead matt (Charlie: it read as dark grey).
    // The export's obsidian black has a colour of its own and a sheen, and
    // it is what shows in every gap between the slats.
    backing.material = FELT;
    // Slats are matt lacquered. The veneer's clear coat (right for a table
    // top) mirrored the sky down every slat edge as a blue-grey line.
    const wood = slat.material as THREE.MeshPhysicalMaterial;
    if (wood.isMeshPhysicalMaterial) {
      wood.clearcoat = 0;
      wood.roughness = Math.max(wood.roughness, 0.62);
      wood.specularIntensity = 0.6;
    }
    return { backing, slat, backingW: span(backing), nativeH: backing.box.max.y - backing.box.min.y };
  }, [scene, obj.id, obj.veneer]);

  const n = slatCount(obj.widthMm ?? ACOUSTIC_NATIVE.widthMm);

  /*
   * One geometry per slat, each reading from a different part of the veneer
   * sheet. With one shared geometry every slat showed the same figure in
   * the same place, which is what made the wall look printed - real slats
   * are cut from different boards. The UVs are in metres (boxProjectUVs),
   * so a shift of a metre or two lands on unrelated grain.
   *
   * The grain is also drawn out along the slat (GRAIN_STRETCH). A veneer
   * sheet is crown cut, with arched "cathedral" figure, and a 50mm strip
   * through an arch shows the grain curving across the slat; slats are
   * straight-grained, so the figure is stretched until it runs straight up.
   */
  const slatGeometries = useMemo(() => {
    let h = 2166136261;
    for (let i = 0; i < obj.id.length; i++) h = Math.imul(h ^ obj.id.charCodeAt(i), 16777619);
    return Array.from({ length: n }, (_, i) => {
      const g = parts.slat.geometry.clone();
      const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
      if (uv) {
        h = Math.imul(h ^ (i + 1), 16777619);
        const du = ((h >>> 0) % 997) / 997 * 2.3;
        const dv = ((h >>> 11) % 991) / 991 * 2.3;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) + du, uv.getY(k) * GRAIN_STRETCH + dv);
        uv.needsUpdate = true;
      }
      return g;
    });
  }, [parts, n, obj.id]);

  // The geometry was cloned here, not cached by useGLTF, so it is freed here.
  useEffect(() => () => { parts.backing.geometry.dispose(); parts.slat.geometry.dispose(); }, [parts]);
  useEffect(() => () => { slatGeometries.forEach(g => g.dispose()); }, [slatGeometries]);

  const w = widthForSlats(n) / 1000;
  const sy = (obj.heightMm ?? ACOUSTIC_NATIVE.heightMm) / 1000 / parts.nativeH;
  const pitch = SLAT_PITCH_MM / 1000;
  const half = SLAT_W_MM / 2000;

  return (
    <group>
      <mesh geometry={parts.backing.geometry} material={parts.backing.material} scale={[w / parts.backingW, sy, 1]} castShadow receiveShadow />
      {slatGeometries.map((g, i) => (
        <mesh
          key={i}
          geometry={g}
          material={parts.slat.material}
          position={[-w / 2 + half + i * pitch, 0, 0]}
          scale={[1, sy, 1]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}
