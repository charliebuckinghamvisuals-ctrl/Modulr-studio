import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ObjectType } from '../types';
import { applyModelMaterials } from './materialFixes';

/**
 * Product thumbnails for the object picker, rendered from the real GLB models
 * at runtime.
 *
 * Rendering them here rather than shipping PNGs means a thumbnail can never
 * drift from the model it represents, and adding a model to the registry
 * needs no asset step. One shared 256px renderer draws each model once; the
 * results are cached in memory and in localStorage so later visits are
 * instant.
 *
 * Everything is deliberately fault-tolerant: if WebGL or storage is
 * unavailable the picker just falls back to its text tiles.
 */

const SIZE = 256;
// Bump when the render/framing changes so cached images are regenerated.
// v4: models re-exported under the same file name (corner unit, hot tub)
// kept showing their old picture from the cache.
// v7 (24 Sep 2026): the woven fabric on the newer seating changed the
// MATERIALS, not the file - "Armchair (Low)" kept its old satin picture.
// Bump this whenever materialFixes changes how a model looks.
const STORAGE_PREFIX = 'modulr_thumb_v7:';

const memory = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

let renderer: THREE.WebGLRenderer | null = null;
let loader: GLTFLoader | null = null;
let envMap: THREE.Texture | null = null;

/** A studio environment for the metals. Lights alone gave a black powder-
 *  coated fitting nothing to reflect, so every dark metal thumbnail was a
 *  silhouette. Built once from three's RoomEnvironment. */
function getEnvironment(gl: THREE.WebGLRenderer): THREE.Texture {
  if (envMap) return envMap;
  const pmrem = new THREE.PMREMGenerator(gl);
  envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return envMap;
}

function getRenderer(): THREE.WebGLRenderer | null {
  if (renderer) return renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      // Required so the canvas can be read back with toDataURL.
      preserveDrawingBuffer: true,
    });
    renderer.setSize(SIZE, SIZE);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    return renderer;
  } catch {
    return null;
  }
}

/**
 * Frame the model in a three-quarter view.
 *
 * The bounding sphere alone pads wide flat objects badly - a coffee table
 * filled under a tenth of the tile - so after the rough placement the eight
 * box corners are projected to screen space and the distance is scaled to
 * make the model's actual silhouette fill the frame.
 */
function frame(object: THREE.Object3D, camera: THREE.PerspectiveCamera) {
  const box = new THREE.Box3().setFromObject(object);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const center = sphere.center;
  const radius = Math.max(sphere.radius, 0.001);

  // Slightly above and to the side - a catalogue angle rather than elevation.
  const dir = new THREE.Vector3(0.82, 0.52, 1).normalize();
  const place = (dist: number) => {
    camera.position.copy(center).addScaledVector(dir, dist);
    camera.near = Math.max(dist - radius * 4, 0.01);
    camera.far = dist + radius * 4;
    camera.updateProjectionMatrix();
    camera.lookAt(center);
    camera.updateMatrixWorld();
  };

  const fov = (camera.fov * Math.PI) / 180;
  let dist = (radius / Math.sin(fov / 2)) * 1.08;
  place(dist);

  // How much of the frame does the silhouette actually occupy?
  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z), new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z), new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z), new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z), new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];
  let extent = 0;
  for (const c of corners) {
    const p = c.clone().project(camera);
    extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y));
  }
  // Target 0.88 of the half-frame, leaving a small consistent margin.
  if (extent > 0.001) place(dist * (extent / 0.88));
}

/** Resolves once every texture on the model has an image, or after 4 s. */
function texturesReady(root: THREE.Object3D): Promise<void> {
  const maps: THREE.Texture[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m: any) => {
      if (!m) return;
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'clearcoatNormalMap'].forEach((k) => { if (m[k]?.isTexture) maps.push(m[k]); });
    });
  });
  const loaded = (t: THREE.Texture) => {
    const img: any = t.image;
    if (!img) return false;
    // An <img> mid-download has complete=false; a decoded one has a width.
    if (typeof img.complete === 'boolean') return img.complete && (img.naturalWidth ?? img.width) > 0;
    return (img.width ?? 0) > 0 || !!img.data;
  };
  return new Promise((resolve) => {
    const started = performance.now();
    const tick = () => {
      if (maps.every(loaded) || performance.now() - started > 4000) resolve();
      else setTimeout(tick, 40);
    };
    tick();
  });
}

async function render(url: string, scale?: [number, number, number], type?: ObjectType): Promise<string | null> {
  const gl = getRenderer();
  if (!gl) return null;
  if (!loader) loader = new GLTFLoader();

  const gltf = await loader.loadAsync(url);
  const model = gltf.scene;
  // Same finish corrections as the placed object, so a tap thumbnails as
  // chrome rather than the exporter's white plastic.
  if (type) applyModelMaterials(type, model, undefined, undefined, false);
  if (scale) model.scale.set(scale[0], scale[1], scale[2]);
  // The dressings above fetch their textures with TextureLoader.load and
  // hand back the texture before the image arrives. Rendering in the same
  // tick sampled those maps as BLACK - every sofa, chair and table
  // thumbnail came out as a silhouette, and the cache then kept it. Wait
  // for the images (bounded, so a missing file cannot hang the picker).
  await texturesReady(model);

  const scene = new THREE.Scene();
  scene.environment = getEnvironment(gl);
  scene.environmentIntensity = 0.9;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa4ad, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3, 5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.7);
  fill.position.set(-4, 2, -3);
  scene.add(fill);
  scene.add(model);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  frame(model, camera);

  gl.render(scene, camera);
  const dataUrl = gl.domElement.toDataURL('image/png');

  // Release the model's GPU resources - the picker only needs the image.
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m: any) => {
      if (!m) return;
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach((k) => m[k]?.dispose?.());
      m.dispose?.();
    });
  });
  scene.clear();

  return dataUrl;
}

/**
 * Thumbnail for a model URL, or null if one cannot be produced. Safe to call
 * repeatedly - concurrent calls for the same model share one render.
 */
export function getThumbnail(url: string, scale?: [number, number, number], type?: ObjectType): Promise<string | null> {
  const cached = memory.get(url);
  if (cached) return Promise.resolve(cached);

  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + url);
    if (stored) {
      memory.set(url, stored);
      return Promise.resolve(stored);
    }
  } catch { /* storage unavailable - render instead */ }

  const inflight = pending.get(url);
  if (inflight) return inflight;

  const job = render(url, scale, type)
    .then((dataUrl) => {
      if (dataUrl) {
        memory.set(url, dataUrl);
        try { localStorage.setItem(STORAGE_PREFIX + url, dataUrl); } catch { /* quota - keep memory copy */ }
      }
      return dataUrl;
    })
    .catch(() => null)
    .finally(() => { pending.delete(url); });

  pending.set(url, job);
  return job;
}
