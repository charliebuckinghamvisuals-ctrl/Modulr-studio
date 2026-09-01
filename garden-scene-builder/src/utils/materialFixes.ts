import * as THREE from 'three';
import type { ObjectType } from '../types';
import {
  TINT_MATERIAL, MATERIAL_TWEAKS, METAL_MATERIALS, METAL_FINISHES, DEFAULT_FINISH,
} from '../modelRegistry';

/**
 * Applies the registry's material corrections to one cloned model instance.
 *
 * Used by the placed object (SceneObjects), so customers see real finishes,
 * and by the thumbnail renderer, so the picker shows the same thing. Returns
 * the materials that stay adjustable afterwards:
 *   bodyMats  - the paintable carcass/door material (kitchen units)
 *   metalMats - the tap metalwork, recolourable to a chosen finish
 */
export function applyModelMaterials(type: ObjectType, root: THREE.Object3D, color?: string) {
  const tintName = TINT_MATERIAL[type];
  const metalNames = METAL_MATERIALS[type];
  const tweaks = MATERIAL_TWEAKS[type];
  const finish = finishFor(type, color);

  const bodyMats: THREE.MeshPhysicalMaterial[] = [];
  const metalMats: THREE.MeshStandardMaterial[] = [];

  root.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((m: any) => {
      if (!m) return m;

      if (tintName && m.name === tintName) {
        // Painted door/carcass. A physical material with a light clearcoat
        // is what a sprayed kitchen door actually is - the old flat
        // roughness-0.62 standard material had no depth, which read as
        // "builder's emulsion".
        const paint = new THREE.MeshPhysicalMaterial({
          color: color ? new THREE.Color(color) : m.color?.clone() ?? new THREE.Color('#d4d4d4'),
          roughness: 0.38,
          metalness: 0,
          clearcoat: 0.35,
          clearcoatRoughness: 0.3,
          envMapIntensity: 0.9,
        });
        paint.name = m.name;
        bodyMats.push(paint);
        return paint;
      }

      if (metalNames?.includes(m.name)) {
        const metal = new THREE.MeshStandardMaterial({
          color: finish.hex,
          roughness: finish.roughness,
          metalness: 1,
          envMapIntensity: 1.2,
        });
        metal.name = m.name;
        metalMats.push(metal);
        return metal;
      }

      const tweak = tweaks?.[m.name];
      if (tweak) {
        const copy = m.clone();
        if (tweak.color !== undefined) copy.color = new THREE.Color(tweak.color);
        if (tweak.roughness !== undefined) copy.roughness = tweak.roughness;
        if (tweak.metalness !== undefined) copy.metalness = tweak.metalness;
        if (tweak.envMapIntensity !== undefined) copy.envMapIntensity = tweak.envMapIntensity;
        if (tweak.dropMap) copy.map = null;
        copy.needsUpdate = true;
        return copy;
      }

      return m;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });

  return { bodyMats, metalMats };
}

/** The finish entry a stored hex refers to, falling back to the model's
 *  default finish, then chrome. */
export function finishFor(type: ObjectType, color?: string) {
  const hex = (color ?? DEFAULT_FINISH[type] ?? METAL_FINISHES[0].hex).toLowerCase();
  return METAL_FINISHES.find(f => f.hex.toLowerCase() === hex) ?? METAL_FINISHES[0];
}

/** Recolour an already-instanced model without rebuilding it. */
export function retintModel(
  type: ObjectType,
  handles: { bodyMats: THREE.MeshPhysicalMaterial[]; metalMats: THREE.MeshStandardMaterial[] },
  color: string,
) {
  handles.bodyMats.forEach(m => { m.color.set(color); m.needsUpdate = true; });
  if (handles.metalMats.length) {
    const finish = finishFor(type, color);
    handles.metalMats.forEach(m => {
      m.color.set(finish.hex);
      m.roughness = finish.roughness;
      m.needsUpdate = true;
    });
  }
}
