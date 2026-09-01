import * as THREE from 'three';

/**
 * Interior wall covering.
 *
 * The inside faces of the walls are produced by the CSG subtraction brush, so
 * they take that brush's material - which was a flat colour, and read as
 * painted card. This gives them a real woodchip-paper surface instead.
 *
 * The colour is NOT baked in: the paper photograph is near-white and the
 * chosen wall colour multiplies through it, so every colour still works and
 * the texture only supplies relief and sheen.
 *
 * Loaded once at module level rather than through Suspense, because these
 * materials feed the wall's boolean memo - a mid-flight suspend there would
 * rebuild the whole CSG.
 */
const TILE_METRES = 1.2;

let cached: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } | null = null;

export function wallpaperTextures() {
  if (cached) return cached;
  const loader = new THREE.TextureLoader();
  const load = (suffix: string, srgb: boolean) => {
    const t = loader.load(`./textures/wallpaper_${suffix}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    // The interior cutout brush carries world-scale UVs in metres.
    t.repeat.set(1 / TILE_METRES, 1 / TILE_METRES);
    return t;
  };
  cached = {
    map: load('color', true),
    normalMap: load('normal', false),
    roughnessMap: load('roughness', false),
  };
  return cached;
}

/** Props to spread onto the interior-face materials. */
export function wallpaperProps() {
  const t = wallpaperTextures();
  return {
    map: t.map,
    normalMap: t.normalMap,
    roughnessMap: t.roughnessMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.92,
    metalness: 0,
  };
}
