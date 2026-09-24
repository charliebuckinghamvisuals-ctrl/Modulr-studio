import * as THREE from 'three';
import type { ObjectType, SceneObject } from '../types';
import { isCeilingMounted, MOUNT_HEIGHT_MM, SURFACE_DECOR } from '../modelRegistry';

/**
 * Decor stands on whatever it is put over - a TV unit, a worktop, a table, a
 * sideboard, a shelf (Charlie, 24 Sep 2026: "models need to automatically
 * snap to top of any unit/worktop"; books set at a fixed height sank into
 * the TV unit).
 *
 * The height is found by looking straight down from above the decor at the
 * furniture actually drawn in the scene, so it is right for every model at
 * its real size, including ones added later, with no table of heights to
 * keep up to date.
 */
export const isSurfaceDecor = (type: ObjectType) => SURFACE_DECOR.includes(type);

/**
 * What decor may stand on: floor-standing furniture and units. Not ceiling
 * fittings, and not anything hung or raised (every type with a mount
 * height - wall cupboards, the TV on the wall, the extractor, taps and
 * hobs), so a vase under a wall cupboard lands on the worktop rather than on
 * top of the cupboard. Not other decor either: two pieces placed together
 * would keep lifting each other.
 */
const canCarry = (o: SceneObject) =>
  !isCeilingMounted(o.type) && !isSurfaceDecor(o.type) && MOUNT_HEIGHT_MM[o.type] === undefined;

const ray = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
const origin = new THREE.Vector3();
const normal = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();

/** Highest the search starts from, in metres - above any tall unit. */
const FROM_Y = 3.2;

/**
 * World height of the top surface under (x, z), or null when there is only
 * floor there. `selfId` is the decor piece itself, left out of the search.
 */
export function surfaceTopAt(scene: THREE.Object3D, objects: SceneObject[], x: number, z: number, selfId?: string): number | null {
  const carriers = new Set(objects.filter(o => o.id !== selfId && canCarry(o)).map(o => o.id));
  if (!carriers.size) return null;
  const targets: THREE.Object3D[] = [];
  scene.traverse(o => { const id = o.userData?.objectId; if (id && carriers.has(id)) targets.push(o); });
  if (!targets.length) return null;
  origin.set(x, FROM_Y, z);
  ray.set(origin, DOWN);
  ray.far = FROM_Y + 1;
  for (const hit of ray.intersectObjects(targets, true)) {
    const mesh = hit.object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) continue;
    const mat = mesh.material as THREE.Material & { opacity?: number };
    if (!mat || (Array.isArray(mat) ? false : mat.visible === false || (mat.transparent && (mat.opacity ?? 1) < 0.05))) continue;
    // A flat surface, not a side face grazed at an edge. Either sign: the
    // ray comes down from above everything, so the first flat face it meets
    // is a top even where the exporter wound it the other way.
    if (hit.face) {
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      normal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
      if (Math.abs(normal.y) < 0.5) continue;
    }
    return hit.point.y;
  }
  return null;
}
