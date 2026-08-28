import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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
const STORAGE_PREFIX = 'modulr_thumb_v2:';

const memory = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

let renderer: THREE.WebGLRenderer | null = null;
let loader: GLTFLoader | null = null;

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

async function render(url: string, scale?: [number, number, number]): Promise<string | null> {
  const gl = getRenderer();
  if (!gl) return null;
  if (!loader) loader = new GLTFLoader();

  const gltf = await loader.loadAsync(url);
  const model = gltf.scene;
  if (scale) model.scale.set(scale[0], scale[1], scale[2]);

  const scene = new THREE.Scene();
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
export function getThumbnail(url: string, scale?: [number, number, number]): Promise<string | null> {
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

  const job = render(url, scale)
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
