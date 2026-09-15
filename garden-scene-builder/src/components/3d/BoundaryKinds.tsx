import { useMemo } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createWorldScaleBoxGeometry } from '../../utils/geometry';
import type { BoundaryStyle } from '../../types';

/**
 * The boundary kinds that are built rather than loaded: feather-edge,
 * slatted and hit-and-miss timber, brick and stone walls, a hedge, and the
 * open line. Close-board keeps Charlie's panel model (see FenceRuns).
 *
 * Every kind is built in a LOCAL frame: the run lies along +x from 0 to
 * `len`, y is up from the ground, z is across the thickness. The caller
 * positions the group at the run's start and turns it onto the run. All
 * boards of a run merge into one mesh - a 30 m boundary of feather-edge is
 * three hundred boards, and one draw call rather than three hundred.
 *
 * Boxes carry world-scale UVs so grain and brick courses are life-size no
 * matter how long the run is.
 */

export interface RunFrame { len: number }

const BAY = 1.8;          // post spacing, metres
const POST = 0.1;         // post section
const GRAVEL_BOARD = 0.15;

/** A box at (cx, cy, cz) in the local frame, UVs in metres. */
const box = (w: number, h: number, d: number, cx: number, cy: number, cz: number, vertical = false) => {
  const g = createWorldScaleBoxGeometry(w, h, d, false, cx, cy, cz, vertical);
  g.translate(cx, cy, cz);
  return g;
};

const merge = (parts: THREE.BufferGeometry[]) => {
  const m = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  parts.forEach(p => p.dispose());
  return m;
};

/** Posts at every bay end, a touch taller than the boards. */
const posts = (len: number, h: number, thick = POST) => {
  const n = Math.max(1, Math.round(len / BAY));
  const bay = len / n;
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i <= n; i++) out.push(box(POST, h + 0.05, thick, Math.min(len - POST / 2, Math.max(POST / 2, i * bay)), (h + 0.05) / 2, 0, true));
  return out;
};

/* ------------------------------------------------------------ materials */

const TIMBER = { prefix: 'planks_clean', tile: 1.5 };
const WALLS: Record<string, { prefix: string; tile: number }> = {
  red: { prefix: 'brick_red', tile: 1.35 },
  buff: { prefix: 'brick_buff', tile: 0.7 },
  dry: { prefix: 'stone_dry', tile: 1.0 },
  cotswold: { prefix: 'stone_cotswold', tile: 1.4 },
};

const matCache = new Map<string, THREE.MeshStandardMaterial>();
const prep = (t: THREE.Texture, tile: number, colour: boolean) => {
  const c = t.clone();
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(1 / tile, 1 / tile);
  c.colorSpace = colour ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  c.needsUpdate = true;
  return c;
};

/** Stained timber: the plank maps under a colour, lifted so black is a
 *  dark stain rather than a void - the same rule as the oak frames. */
function useTimberMaterial(hex: string) {
  const tex: any = useTexture({ map: `./textures/${TIMBER.prefix}_color.jpg`, normalMap: `./textures/${TIMBER.prefix}_normal.jpg`, roughnessMap: `./textures/${TIMBER.prefix}_roughness.jpg` });
  return useMemo(() => {
    const key = `timber|${hex}`;
    let m = matCache.get(key);
    if (m) return m;
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.1),
      map: prep(tex.map, TIMBER.tile, true),
      normalMap: prep(tex.normalMap, TIMBER.tile, false),
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughnessMap: prep(tex.roughnessMap, TIMBER.tile, false),
      roughness: 0.85, metalness: 0,
    });
    matCache.set(key, m);
    return m;
  }, [hex, tex.map, tex.normalMap, tex.roughnessMap]);
}

function useWallMaterial(id: string) {
  const w = WALLS[id] ?? WALLS.red;
  const tex: any = useTexture({ map: `./textures/${w.prefix}_color.jpg`, normalMap: `./textures/${w.prefix}_normal.jpg`, roughnessMap: `./textures/${w.prefix}_roughness.jpg`, aoMap: `./textures/${w.prefix}_ao.jpg` });
  return useMemo(() => {
    const key = `wall|${w.prefix}`;
    let m = matCache.get(key);
    if (m) return m;
    m = new THREE.MeshStandardMaterial({
      map: prep(tex.map, w.tile, true),
      normalMap: prep(tex.normalMap, w.tile, false),
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughnessMap: prep(tex.roughnessMap, w.tile, false),
      aoMap: prep(tex.aoMap, w.tile, false),
      roughness: 0.95, metalness: 0,
    });
    matCache.set(key, m);
    return m;
  }, [w.prefix, tex.map, tex.normalMap, tex.roughnessMap, tex.aoMap]);
}

/** Foliage: the grass maps at a tight repeat under a leaf colour reads as
 *  a clipped hedge from any distance the plan is looked at. */
function useHedgeMaterial(hex: string) {
  const tex: any = useTexture({ map: './textures/grass_color.jpg', normalMap: './textures/grass_normal.jpg' });
  return useMemo(() => {
    const key = `hedge|${hex}`;
    let m = matCache.get(key);
    if (m) return m;
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      map: prep(tex.map, 0.45, true),
      normalMap: prep(tex.normalMap, 0.45, false),
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughness: 1, metalness: 0,
    });
    matCache.set(key, m);
    return m;
  }, [hex, tex.map, tex.normalMap]);
}

/* ---------------------------------------------------------------- kinds */

/** Overlapping vertical boards on three rails, a gravel board below. */
export function FeatherEdgeRun({ len, style }: RunFrame & { style: BoundaryStyle }) {
  const h = style.heightMm / 1000;
  const mat = useTimberMaterial(style.colour);
  const geom = useMemo(() => {
    const parts = posts(len, h);
    const pitch = 0.1, bw = 0.125, bt = 0.022;
    const top = h, bottom = GRAVEL_BOARD;
    // Boards lap: each sits a hair in front of the last, so light catches the edges.
    for (let x = bw / 2; x < len - bw / 4; x += pitch) {
      const lap = ((Math.round(x / pitch)) % 2) * 0.006;
      parts.push(box(bw, top - bottom, bt, x, bottom + (top - bottom) / 2, POST / 2 + bt / 2 + lap, true));
    }
    for (const ry of [bottom + 0.2, h * 0.55, h - 0.2]) parts.push(box(len, 0.075, 0.038, len / 2, ry, -POST / 2 - 0.019));
    parts.push(box(len, GRAVEL_BOARD, 0.022, len / 2, GRAVEL_BOARD / 2, POST / 2 + 0.011));
    return merge(parts);
  }, [len, h]);
  return <mesh geometry={geom} material={mat} castShadow receiveShadow />;
}

/** Horizontal slats with a gap, the contemporary screen. */
export function SlattedRun({ len, style }: RunFrame & { style: BoundaryStyle }) {
  const h = style.heightMm / 1000;
  const mat = useTimberMaterial(style.colour);
  const geom = useMemo(() => {
    const parts = posts(len, h);
    const slat = 0.07, gap = 0.025, t = 0.02;
    for (let y = 0.08 + slat / 2; y + slat / 2 <= h; y += slat + gap) parts.push(box(len, slat, t, len / 2, y, POST / 2 + t / 2));
    return merge(parts);
  }, [len, h]);
  return <mesh geometry={geom} material={mat} castShadow receiveShadow />;
}

/** Horizontal boards alternating front and back of the rails. */
export function HitMissRun({ len, style }: RunFrame & { style: BoundaryStyle }) {
  const h = style.heightMm / 1000;
  const mat = useTimberMaterial(style.colour);
  const geom = useMemo(() => {
    const parts = posts(len, h);
    const board = 0.12, pitch = 0.18, t = 0.02;
    let i = 0;
    for (let y = 0.08 + board / 2; y + board / 2 <= h; y += pitch / 2, i++) {
      const front = i % 2 === 0;
      parts.push(box(len, board, t, len / 2, y, front ? POST / 2 + t / 2 : -POST / 2 - t / 2));
    }
    return merge(parts);
  }, [len, h]);
  return <mesh geometry={geom} material={mat} castShadow receiveShadow />;
}

/** Brick or stone: a solid wall with a coping course proud of both faces. */
export function WallRun({ len, style }: RunFrame & { style: BoundaryStyle }) {
  const h = style.heightMm / 1000;
  const brick = style.kind === 'brick';
  const t = brick ? 0.215 : 0.4;
  const mat = useWallMaterial(style.colour);
  const geom = useMemo(() => merge([
    box(len, h - 0.05, t, len / 2, (h - 0.05) / 2, 0),
    box(len + 0.02, 0.05, t + 0.06, len / 2, h - 0.025, 0),
  ]), [len, h, t]);
  return <mesh geometry={geom} material={mat} castShadow receiveShadow />;
}

/** A clipped hedge, 600 thick, on the line. */
export function HedgeRun({ len, style }: RunFrame & { style: BoundaryStyle }) {
  const h = style.heightMm / 1000;
  const mat = useHedgeMaterial(style.colour);
  const geom = useMemo(() => merge([box(len, h, 0.6, len / 2, h / 2, 0)]), [len, h]);
  return <mesh geometry={geom} material={mat} castShadow receiveShadow />;
}

/** No boundary: a thin dark line on the ground so the plan still shows it. */
export function OpenRun({ len }: RunFrame) {
  return (
    <mesh position={[len / 2, 0.012, 0]}>
      <boxGeometry args={[len, 0.02, 0.05]} />
      <meshBasicMaterial color="#3b4d4a" transparent opacity={0.6} />
    </mesh>
  );
}
