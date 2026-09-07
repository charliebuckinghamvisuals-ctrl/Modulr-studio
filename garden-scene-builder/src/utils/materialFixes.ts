import * as THREE from 'three';
import type { ObjectType } from '../types';
import {
  TINT_MATERIAL, MATERIAL_TWEAKS, METAL_MATERIALS, METAL_FINISHES, DEFAULT_FINISH, FORCE_DIELECTRIC,
  EMISSIVE_MATERIAL, LIGHT_COLOURS, UNMIRROR_NORMALS, finishSpec,
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
 * So: a tileable fractal normal map plus a matching roughness map, both very
 * low amplitude. Generated procedurally rather than downloaded because it is
 * a few hundred kilobytes of maths, needs no licence, and the frequency can
 * be tuned to the real-world size we project it at.
 *
 * The first version of this was two octaves of value noise at 0.18m per
 * tile, which put the blobs at 20mm across - orange peel is under a
 * millimetre - and it read as mottled plastic. See paintTextures for the
 * scales used now.
 */
const PAINT_TEX_SIZE = 1024;

/**
 * Physical width of one tile of the paint maps, in metres. The door UVs are
 * box-projected in metres, so this alone decides how big the peel looks on a
 * door: 60mm across 1024 pixels is 0.06mm per pixel, fine enough for the
 * smallest octave below to be genuine sub-millimetre peel.
 */
export const PAINT_TILE_METRES = 0.06;

/**
 * Anisotropic filtering for the paint maps. A run of doors in the walkthrough
 * is seen almost edge-on, which is exactly the case this exists for - without
 * it the peel smears into streaks and shimmers as you walk. three.js clamps
 * this to what the GPU supports, so asking for 16 is safe everywhere.
 */
const PAINT_ANISOTROPY = 16;

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

  /*
   * Fractal noise across the scales orange peel actually has: about 0.2mm to
   * 2.5mm at PAINT_TILE_METRES, weighted toward 0.7-1.5mm. Nothing coarser.
   * A first cut added a 10mm "waviness" octave, and value noise peaks sit ON
   * its lattice - so a matt door showed a neat grid of dots a centimetre
   * apart, which is a tablecloth, not paint. The cell counts are coprime for
   * the same reason: octaves that share a lattice reinforce it.
   */
  const OCTAVES: [number, number][] = [[23, 0.25], [41, 0.45], [89, 0.7], [181, 0.55], [331, 0.3]];
  const height = new Float32Array(S * S);
  let total = 0;
  OCTAVES.forEach(([cells, amp], k) => {
    const n = tileableNoise(S, cells, 1 + k * 7.3);
    for (let i = 0; i < S * S; i++) height[i] += n[i] * amp;
    total += amp;
  });
  for (let i = 0; i < S * S; i++) height[i] /= total;

  const at = (x: number, y: number) => height[((y + S) % S) * S + ((x + S) % S)];

  const normal = new Uint8Array(S * S * 4);
  const rough = new Uint8Array(S * S * 4);
  // Slope gain. Fine octaves have steep per-pixel gradients, so this stays
  // modest; the per-finish normalScale values scale it from there.
  const STRENGTH = 5;
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
      // Kept subtle - it multiplies the finish's own roughness.
      const r = Math.max(0, Math.min(255, 210 + (height[y * S + x] - 0.5) * 70));
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
    t.anisotropy = PAINT_ANISOTROPY;
    t.needsUpdate = true;
    return t;
  };
  paintMaps = { normalMap: make(normal), roughnessMap: make(rough) };
  return paintMaps;
}

/**
 * The paint maps as one placed unit samples them.
 *
 * Box projection is in the model's own space, so two identical cabinets get
 * identical UVs and the peel repeats exactly from one door to the next - and
 * a repeat is the one thing the eye is sure means "generated". Each placed
 * object therefore reads the maps from its own offset, hashed from its id.
 * The clones share the GPU image (a cloned texture keeps the same source),
 * so this costs a couple of uniforms per unit and nothing else.
 */
const grainBySeed = new Map<string, { normalMap: THREE.Texture; roughnessMap: THREE.Texture }>();

function grainFor(seed?: string) {
  const src = paintTextures();
  if (!seed) return src;
  const hit = grainBySeed.get(seed);
  if (hit) return hit;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const u = ((h >>> 0) % 1000) / 1000;
  const v = (((h >>> 10) >>> 0) % 1000) / 1000;
  const shifted = (t: THREE.Texture) => {
    const c = t.clone();
    c.offset.set(u, v);
    c.needsUpdate = true;
    return c;
  };
  const set = { normalMap: shifted(src.normalMap), roughnessMap: shifted(src.roughnessMap) };
  grainBySeed.set(seed, set);
  return set;
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

/**
 * A connected island of triangles inside one mesh, with its local-space bounds.
 * Bounds are in the mesh's own coordinates (the exporter's units, before the
 * node scale), so pickers must use RELATIVE tests - ratios and orderings - not
 * absolute sizes.
 */
type Island = { tris: number[]; min: THREE.Vector3; max: THREE.Vector3 };

/**
 * Parts that need their own material but were exported without one.
 *
 * The toilet came out of SketchUp as ONE mesh under ONE material,
 * "Porcelain" - flush plate included. There is nothing to match by name, so
 * a name-based finish could never reach the plate. But the plate IS its own
 * island of geometry (nothing joins it to the pan), so it is found by shape
 * at load time - the thinnest island with the highest top - cut into a mesh
 * of its own, and given a named material that METAL_MATERIALS then treats
 * exactly like a tap. Measured: 285 x 176 x 7mm at 0.83-1.0m; the only other
 * thin island is the seat, 0.6m lower.
 *
 * This is a workaround for how that one model was exported, not the way to
 * do metal parts: a model exported with its metalwork under its own material
 * name needs nothing here - just an entry in METAL_MATERIALS.
 */
const ISLAND_SPLITS: Partial<Record<ObjectType, { material: string; pick: (islands: Island[]) => Island | undefined }>> = {
  toilet: {
    material: 'FlushPlate',
    pick: islands => {
      const thin = islands.filter(i => {
        const s = [i.max.x - i.min.x, i.max.y - i.min.y, i.max.z - i.min.z].sort((a, b) => a - b);
        // A plate: one dimension under a tenth of the next. Bolt caps are
        // small in every direction and fail this; the seat passes but sits
        // far lower.
        return s[0] < s[1] * 0.1;
      });
      return thin.sort((a, b) => b.max.y - a.max.y)[0];
    },
  },
};

/** Triangle islands of a geometry: union-find over shared indices, plus
 *  coincident positions (split normals and UV seams duplicate vertices). */
function islandsOf(geometry: THREE.BufferGeometry): Island[] {
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const n = pos.count;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x: number) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const unite = (a: number, b: number) => { parent[find(a)] = find(b); };
  const triCount = index ? index.count / 3 : n / 3;
  const vert = (t: number, k: number) => (index ? index.getX(t * 3 + k) : t * 3 + k);
  for (let t = 0; t < triCount; t++) { unite(vert(t, 0), vert(t, 1)); unite(vert(t, 1), vert(t, 2)); }
  const seen = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    const o = seen.get(k);
    if (o === undefined) seen.set(k, i); else unite(i, o);
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < triCount; t++) {
    const r = find(vert(t, 0));
    let g = groups.get(r);
    if (!g) { g = []; groups.set(r, g); }
    g.push(t);
  }
  return [...groups.values()].map(tris => {
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const t of tris) for (let k = 0; k < 3; k++) {
      const i = vert(t, k);
      min.min(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
      max.max(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
    }
    return { tris, min, max };
  });
}

/**
 * Cut one island out of a mesh into a child mesh of its own, under a named
 * clone of the material. Both meshes get NEW geometries that share the
 * source's attribute buffers with their own index - the source geometry is
 * never touched, because it is shared with every other instance of the model
 * and with the picker thumbnail.
 */
function detachIsland(mesh: THREE.Mesh, island: Island, materialName: string) {
  const src = mesh.geometry;
  const index = src.getIndex();
  const total = index ? index.count / 3 : src.getAttribute('position').count / 3;
  const inIsland = new Uint8Array(total);
  for (const t of island.tris) inIsland[t] = 1;
  const indicesWhere = (want: 0 | 1) => {
    const out: number[] = [];
    for (let t = 0; t < total; t++) {
      if (inIsland[t] !== want) continue;
      for (let k = 0; k < 3; k++) out.push(index ? index.getX(t * 3 + k) : t * 3 + k);
    }
    return out;
  };
  const withIndex = (idx: number[]) => {
    const g = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, attr as THREE.BufferAttribute);
    g.setIndex(idx);
    return g;
  };
  mesh.geometry = withIndex(indicesWhere(0));
  const base = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
  const part = new THREE.Mesh(withIndex(indicesWhere(1)), base.clone());
  part.material.name = materialName;
  part.castShadow = true;
  part.receiveShadow = true;
  // A child with the identity transform sits exactly where its parent does.
  mesh.add(part);
  // Both flagged: a second pass must not cut the plate out of the plate.
  mesh.userData.__islandSplit = materialName;
  part.userData.__islandSplit = materialName;
  return part;
}

function splitIslandsFor(type: ObjectType, root: THREE.Object3D) {
  const rule = ISLAND_SPLITS[type];
  if (!rule) return;
  const meshes: THREE.Mesh[] = [];
  root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.__islandSplit) meshes.push(m); });
  for (const mesh of meshes) {
    const island = rule.pick(islandsOf(mesh.geometry));
    if (island) { detachIsland(mesh, island, rule.material); return; }
  }
}

export function applyModelMaterials(type: ObjectType, root: THREE.Object3D, color?: string, worktop?: string, hideWorktop = false, finish_?: string, seed?: string) {
  const tintName = TINT_MATERIAL[type];
  const metalNames = METAL_MATERIALS[type];
  const tweaks = MATERIAL_TWEAKS[type];
  const finish = finishFor(type, color);
  const worktopDef = worktopById(worktop);

  // Parts exported without a material of their own - see ISLAND_SPLITS.
  // Before the traverse, so the new mesh is dressed with everything else.
  splitIslandsFor(type, root);

  const bodyMats: THREE.MeshPhysicalMaterial[] = [];
  const metalMats: THREE.MeshStandardMaterial[] = [];
  const worktopMats: THREE.MeshStandardMaterial[] = [];
  const lampMats: THREE.MeshStandardMaterial[] = [];

  // Needed by the mirrored-normal fix below, which reads matrixWorld.
  root.updateMatrixWorld(true);

  root.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    /**
     * Un-mirror a mesh placed by a negative-determinant transform.
     *
     * SketchUp components get mirrored all the time - a pair of matching
     * pillows is one component placed twice, the second flipped. Transforming
     * a normal by a mirror turns it INWARD, so that copy is lit as though its
     * top faced the floor: measured -0.77 average normal Y against +0.77 on
     * its twin, which is why one pillow of a pair came out a different shade.
     *
     * three.js already flips the winding for mirrored objects, so the facing
     * is fine and only the normals need turning back. The geometry is cloned
     * first because the mirrored copy usually SHARES it with the one that is
     * the right way round.
     */
    if (UNMIRROR_NORMALS[type] && mesh.matrixWorld.determinant() < 0 && !mesh.userData.__unmirrored) {
      const geom = mesh.geometry.clone();
      const n = geom.getAttribute('normal');
      if (n) {
        for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
        n.needsUpdate = true;
        mesh.geometry = geom;
      }
      mesh.userData.__unmirrored = true;
    }

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

      /*
       * The lit lens of a fitting.
       *
       * Driven as an EMISSIVE, which is light the surface gives off rather
       * than light falling on it - so the lens reads as switched on even when
       * the room around it is dark, which is the whole point of previewing a
       * lighting layout. toneMapped is off so it keeps its brightness through
       * the ACES curve instead of being rolled back to a grey disc.
       */
      const emissiveName = EMISSIVE_MATERIAL[type];
      if (emissiveName && m.name === emissiveName) {
        const lamp = new THREE.MeshStandardMaterial({
          name: m.name,
          color: '#111111',
          emissive: new THREE.Color(color ?? LIGHT_COLOURS[0].hex),
          emissiveIntensity: 2.4,
          roughness: 0.4,
          metalness: 0,
        });
        lamp.toneMapped = false;
        lampMats.push(lamp);
        return lamp;
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
        const grain = grainFor(seed);
        // FORCED over any UVs the exporter wrote. Some floor units carry a
        // TEXCOORD_0 in arbitrary units and the wall units carry none, so
        // respecting them put the peel at a different size on every unit -
        // invisible on one door, a coarse grid on the next. Box projection in
        // metres is exact for these flat panels and the same on all of them.
        boxProjectUVs(mesh.geometry, PAINT_TILE_METRES, true);
        // Matt, satin or gloss - three real products, not a slider. See
        // UNIT_FINISHES for what each number is doing.
        const fin = finishSpec(finish_);
        const paint = new THREE.MeshPhysicalMaterial({
          color: color ? new THREE.Color(color) : m.color?.clone() ?? new THREE.Color('#d4d4d4'),
          roughness: fin.roughness,
          metalness: 0,
          normalMap: grain.normalMap,
          normalScale: new THREE.Vector2(fin.normalScale, fin.normalScale),
          roughnessMap: grain.roughnessMap,
          clearcoat: fin.clearcoat,
          clearcoatRoughness: fin.clearcoatRoughness,
          // The peel goes on the LACQUER, not just the paint under it. With
          // the coat left perfectly smooth the reflection was a flawless
          // mirror over a lumpy base - backwards from a real door, where it
          // is the reflection rippling across the coat that sells it.
          clearcoatNormalMap: grain.normalMap,
          clearcoatNormalScale: new THREE.Vector2(fin.coatNormalScale, fin.coatNormalScale),
          // The room's HDR is what a door actually reflects, and a gloss door
          // reflects a great deal more of it than a matt one.
          envMapIntensity: fin.env,
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

  return { bodyMats, metalMats, worktopMats, lampMats };
}

/**
 * Change the door finish on an already-instanced model, without rebuilding it.
 * Matt/satin/gloss is a material change, not a new model - see UNIT_FINISHES.
 */
export function refinishUnits(
  handles: { bodyMats: THREE.MeshPhysicalMaterial[] },
  finish?: string,
) {
  const f = finishSpec(finish);
  handles.bodyMats.forEach(mat => {
    if (!(mat as any).isMeshPhysicalMaterial) return;
    mat.roughness = f.roughness;
    mat.clearcoat = f.clearcoat;
    mat.clearcoatRoughness = f.clearcoatRoughness;
    mat.envMapIntensity = f.env;
    if (mat.normalScale) mat.normalScale.set(f.normalScale, f.normalScale);
    if (mat.clearcoatNormalScale) mat.clearcoatNormalScale.set(f.coatNormalScale, f.coatNormalScale);
    mat.needsUpdate = true;
  });
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
  handles: { bodyMats: THREE.MeshPhysicalMaterial[]; metalMats: THREE.MeshStandardMaterial[]; lampMats?: THREE.MeshStandardMaterial[] },
  color: string,
) {
  handles.bodyMats.forEach(m => { m.color.set(color); m.needsUpdate = true; });
  // A lamp's colour is the light it gives off, not the colour of its glass,
  // so it lands on the emissive - and the spot light beside it takes the same
  // hex, keeping lens and beam the same temperature.
  handles.lampMats?.forEach(m => { m.emissive.set(color); m.needsUpdate = true; });
  if (handles.metalMats.length) {
    const finish = finishFor(type, color);
    handles.metalMats.forEach(m => {
      m.color.set(finish.hex);
      m.roughness = finish.roughness;
      m.needsUpdate = true;
    });
  }
}
