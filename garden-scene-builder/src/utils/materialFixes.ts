import * as THREE from 'three';
import type { ObjectType } from '../types';
import {
  TINT_MATERIAL, MATERIAL_TWEAKS, METAL_MATERIALS, METAL_FINISHES, DEFAULT_FINISH, FORCE_DIELECTRIC,
  FABRIC_MATERIAL, FABRIC_REPEAT, WORKTOP_MATERIAL, worktopById,
} from '../modelRegistry';
import type { WorktopDef } from '../modelRegistry';

/**
 * Applies the registry's material corrections to one cloned model instance.
 *
 * Used by the placed object (SceneObjects), so customers see real finishes,
 * and by the thumbnail renderer, so the picker shows the same thing. Returns
 * the materials that stay adjustable afterwards:
 *   bodyMats  - the paintable carcass/door material (kitchen units)
 *   metalMats - the tap metalwork, recolourable to a chosen finish
 */
/**
 * The upholstery texture set, loaded once and shared by every sofa, armchair
 * and footstool in the scene. Sharing is safe because all of them want the
 * same wrap and colour space; only the REPEAT differs per model, and that is
 * set on a per-material clone below.
 *
 * Paths are relative for the same reason the model URLs are: they have to
 * resolve both in standalone dev and inside the /3d-config/ iframe.
 */
let fabricSet: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } | null = null;

function fabricTextures() {
  if (fabricSet) return fabricSet;
  const loader = new THREE.TextureLoader();
  const load = (suffix: string, srgb: boolean) => {
    const t = loader.load(`./textures/upholstery_${suffix}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    return t;
  };
  fabricSet = {
    map: load('color', true),
    normalMap: load('normal', false),
    roughnessMap: load('roughness', false),
  };
  return fabricSet;
}

/** A weave at this model's UV scale. The textures are shared; each material
 *  gets its own clone so the repeat can differ per model. */
function fabricMaterial(repeat: number, color?: string) {
  const src = fabricTextures();
  const scaled = (t: THREE.Texture) => {
    const c = t.clone();
    c.needsUpdate = true;
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(repeat, repeat);
    return c;
  };
  return new THREE.MeshStandardMaterial({
    map: scaled(src.map),
    normalMap: scaled(src.normalMap),
    roughnessMap: scaled(src.roughnessMap),
    // The weave carries its own light grey; a colour multiplies through it.
    color: color ? new THREE.Color(color) : new THREE.Color('#ffffff'),
    roughness: 1,
    metalness: 0,
    normalScale: new THREE.Vector2(0.8, 0.8),
  });
}

/**
 * Sprayed-paint micro-surface, generated once at runtime.
 *
 * The cabinet doors were reading as flat plastic no matter how the colour was
 * tuned, and the cause was not the colour: those meshes carry NO UVs and no
 * maps, so every pixel of a door face returns exactly the same shading answer.
 * Real paint is never uniform - it has fine orange-peel relief and slightly
 * uneven sheen, which is what makes a highlight travel across a door instead
 * of sitting on it as a dead patch.
 *
 * So: a tileable value-noise normal map plus a matching roughness map, both
 * very low amplitude. Generated procedurally rather than downloaded because
 * it is a few kilobytes of maths, needs no licence, and the frequency can be
 * tuned to the real world size we project it at.
 */
const PAINT_TEX_SIZE = 256;

let paintMaps: { normalMap: THREE.Texture; roughnessMap: THREE.Texture } | null = null;

/** Smooth, seamless value noise in [0,1]. Wraps on both axes so the map can
 *  tile across a door without a visible seam. */
function tileableNoise(size: number, cells: number, seed: number) {
  const rand = (x: number, y: number) => {
    // Deterministic hash - the same build always produces the same grain.
    const n = Math.sin((x * 127.1 + y * 311.7 + seed) * 43758.5453) * 43758.5453;
    return n - Math.floor(n);
  };
  const grid: number[][] = [];
  for (let y = 0; y < cells; y++) {
    grid[y] = [];
    for (let x = 0; x < cells; x++) grid[y][x] = rand(x, y);
  }
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = smooth(fx - x0), ty = smooth(fy - y0);
      // Modulo wrap on the lattice is what makes it seamless.
      const a = grid[y0 % cells][x0 % cells];
      const b = grid[y0 % cells][(x0 + 1) % cells];
      const c = grid[(y0 + 1) % cells][x0 % cells];
      const d = grid[(y0 + 1) % cells][(x0 + 1) % cells];
      out[y * size + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}

function paintTextures() {
  if (paintMaps) return paintMaps;
  const S = PAINT_TEX_SIZE;
  // Two octaves: broad unevenness in the film, plus finer orange peel.
  const coarse = tileableNoise(S, 8, 1.0);
  const fine = tileableNoise(S, 32, 7.0);
  const height = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) height[i] = coarse[i] * 0.65 + fine[i] * 0.35;

  const at = (x: number, y: number) => height[((y + S) % S) * S + ((x + S) % S)];

  const normal = new Uint8Array(S * S * 4);
  const rough = new Uint8Array(S * S * 4);
  const STRENGTH = 2.2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Central-difference gradient -> tangent-space normal.
      const dx = (at(x + 1, y) - at(x - 1, y)) * STRENGTH;
      const dy = (at(x, y + 1) - at(x, y - 1)) * STRENGTH;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      normal[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      normal[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      normal[i + 2] = (1 / len) * 0.5 * 255 + 127;
      normal[i + 3] = 255;
      // Sheen varies slightly with the film thickness: thicker sits glossier.
      const r = 235 - height[y * S + x] * 60;
      rough[i] = rough[i + 1] = rough[i + 2] = r;
      rough[i + 3] = 255;
    }
  }

  const make = (data: Uint8Array) => {
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.LinearSRGBColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  };
  paintMaps = { normalMap: make(normal), roughnessMap: make(rough) };
  return paintMaps;
}

/**
 * Box-project UVs onto a mesh that has none.
 *
 * The cabinet GLBs ship without UVs, so no map of any kind could be applied
 * to them. Every one of these panels is a flat, axis-aligned slab, so
 * projecting each face along its dominant normal is not an approximation -
 * it is exactly right, with no stretching. Units are metres, so the paint
 * grain comes out the same physical size on a drawer front and a tall unit.
 */
function boxProjectUVs(geometry: THREE.BufferGeometry, metresPerTile: number, force = false) {
  if (geometry.getAttribute('uv') && !force) return;
  if ((geometry as any).__boxProjected === metresPerTile) return;
  (geometry as any).__boxProjected = metresPerTile;
  const pos = geometry.getAttribute('position');
  const nor = geometry.getAttribute('normal');
  if (!pos || !nor) return;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u: number, v: number;
    if (nx >= ny && nx >= nz) { u = pos.getZ(i); v = pos.getY(i); }       // facing X
    else if (ny >= nx && ny >= nz) { u = pos.getX(i); v = pos.getZ(i); }  // facing Y
    else { u = pos.getX(i); v = pos.getY(i); }                            // facing Z
    uv[i * 2] = u / metresPerTile;
    uv[i * 2 + 1] = v / metresPerTile;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * Worktop surfaces, cached per material so switching between them is instant
 * and every unit in the room shares one set of GPU textures.
 */
const worktopSets = new Map<string, { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }>();

function worktopTextures(def: WorktopDef) {
  const hit = worktopSets.get(def.id);
  if (hit) return hit;
  const loader = new THREE.TextureLoader();
  const load = (suffix: string, srgb: boolean) => {
    const t = loader.load(`./textures/${def.prefix}_${suffix}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    // The worktop UVs below are box-projected in METRES, so the repeat is
    // simply how many tiles fit across a metre.
    t.repeat.set(1 / def.tileMetres, 1 / def.tileMetres);
    return t;
  };
  const set = {
    map: load('color', true),
    normalMap: load('normal', false),
    roughnessMap: load('roughness', false),
  };
  worktopSets.set(def.id, set);
  return set;
}

/** A standalone worktop material, for the continuous run slabs. */
export function createWorktopMaterial(def: WorktopDef) {
  const m = new THREE.MeshStandardMaterial();
  dressWorktop(m, def);
  return m;
}

/** Apply a worktop surface to an already-built material, in place. */
function dressWorktop(mat: THREE.MeshStandardMaterial, def: WorktopDef) {
  const tex = worktopTextures(def);
  mat.map = tex.map;
  mat.normalMap = tex.normalMap;
  mat.roughnessMap = tex.roughnessMap;
  mat.normalScale = new THREE.Vector2(0.35, 0.35);
  mat.color = new THREE.Color('#ffffff');
  mat.roughness = def.roughness;
  mat.metalness = 0;
  mat.envMapIntensity = 1.1;
  mat.needsUpdate = true;
}

export function applyModelMaterials(type: ObjectType, root: THREE.Object3D, color?: string, worktop?: string, hideWorktop = false) {
  const tintName = TINT_MATERIAL[type];
  const metalNames = METAL_MATERIALS[type];
  const tweaks = MATERIAL_TWEAKS[type];
  const finish = finishFor(type, color);
  const worktopDef = worktopById(worktop);

  const bodyMats: THREE.MeshPhysicalMaterial[] = [];
  const metalMats: THREE.MeshStandardMaterial[] = [];
  const worktopMats: THREE.MeshStandardMaterial[] = [];

  root.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((m: any) => {
      if (!m) return m;

      if (m.name === WORKTOP_MATERIAL && hideWorktop) {
        // A continuous slab is laid over the whole run instead - see
        // WorktopRuns. Thumbnails keep their own top, because a topless
        // cabinet is not what the customer is picking from.
        mesh.visible = false;
        return m;
      }

      if (m.name === WORKTOP_MATERIAL) {
        // Box-projected in metres so the veining is the same physical size on
        // a 600mm unit and a 1200mm one, and forced over the exporter's own
        // UVs, which are in arbitrary units.
        boxProjectUVs(mesh.geometry, 1, true);
        const top = new THREE.MeshStandardMaterial();
        top.name = m.name;
        dressWorktop(top, worktopDef);
        worktopMats.push(top);
        return top;
      }

      const fabricRepeat = FABRIC_REPEAT[type];
      if (fabricRepeat !== undefined && m.name === FABRIC_MATERIAL) {
        const fab = fabricMaterial(fabricRepeat, color);
        fab.name = m.name;
        bodyMats.push(fab as unknown as THREE.MeshPhysicalMaterial);
        return fab;
      }

      if (tintName && m.name === tintName) {
        // Painted door/carcass, as a real sprayed lacquer: a diffuse colour
        // under a clearcoat, carrying fine orange-peel relief and slightly
        // uneven sheen. Flat colour alone is what made these look like
        // untextured CG - see paintTextures above.
        const grain = paintTextures();
        // 0.18m per tile puts the grain at a believable physical size, and
        // the geometry has no UVs of its own to respect.
        boxProjectUVs(mesh.geometry, 0.18);
        const paint = new THREE.MeshPhysicalMaterial({
          color: color ? new THREE.Color(color) : m.color?.clone() ?? new THREE.Color('#d4d4d4'),
          roughness: 0.34,
          metalness: 0,
          normalMap: grain.normalMap,
          // Tuned by eye against renders: 0.12 was invisible even close up,
          // 0.35 read as textured plaster rather than paint. 0.2 breaks a
          // highlight without ever announcing itself as a texture.
          normalScale: new THREE.Vector2(0.2, 0.2),
          roughnessMap: grain.roughnessMap,
          clearcoat: 0.45,
          clearcoatRoughness: 0.24,
          // The room's HDR is what a door actually reflects; at 0.9 it was
          // barely contributing, which flattened the panels further.
          envMapIntensity: 1.15,
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

      if (FORCE_DIELECTRIC[type] && m.metalness > 0 && !m.metalnessMap) {
        // See FORCE_DIELECTRIC: the exporter's blanket metalness 0.5 is not a
        // real material. Roughness is nudged off its 0.5 default too, since
        // that reads as an unplaceable semi-gloss on timber and fabric.
        const copy = m.clone();
        copy.metalness = 0;
        if (copy.roughness === 0.5) copy.roughness = 0.7;
        copy.needsUpdate = true;
        return copy;
      }

      return m;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });

  return { bodyMats, metalMats, worktopMats };
}

/** The finish entry a stored hex refers to, falling back to the model's
 *  default finish, then chrome. */
export function finishFor(type: ObjectType, color?: string) {
  const hex = (color ?? DEFAULT_FINISH[type] ?? METAL_FINISHES[0].hex).toLowerCase();
  return METAL_FINISHES.find(f => f.hex.toLowerCase() === hex) ?? METAL_FINISHES[0];
}

/** Change the worktop surface on an already-instanced model. */
export function resurfaceWorktop(
  handles: { worktopMats: THREE.MeshStandardMaterial[] },
  worktop: string | undefined,
) {
  const def = worktopById(worktop);
  handles.worktopMats.forEach(m => dressWorktop(m, def));
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
