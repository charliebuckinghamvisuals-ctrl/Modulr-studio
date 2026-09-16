import * as THREE from 'three';
import { useMemo } from 'react';
import type { Room } from '../types';
import { MATERIAL_DEF, useRealMaterial } from './materials';

/**
 * The building's base and deck, in one place.
 *
 * The plinth under the building and the decking in front of it were one
 * textured box sized from deckingSizeMm / deckingLeftMm / deckingRightMm.
 * The deck is now an OUTLINE (room.deckOutline, building-local metres) that
 * the customer can pull into any shape - an L round the corner, a splay, a
 * cut-out for a tree. Until they touch it the outline is exactly the old
 * rectangle, so existing designs look the same.
 *
 * Everything here is building-local: x across, z front-positive, the
 * building centred on the origin, as RoomGeometry lays it out.
 */

const mm = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function baseFrame(room: Room) {
  const w = Math.max(0.5, mm(room.widthMm, 8000) / 1000);
  const d = Math.max(0.5, mm(room.depthMm, 4300) / 1000);
  const ohBack = room.overhangBackMm ? room.overhangBackMm / 1000 : 0;
  const ohLeft = room.overhangLeftMm ? room.overhangLeftMm / 1000 : 0;
  const ohRight = room.overhangRightMm ? room.overhangRightMm / 1000 : 0;
  const isDecking = !!(room.hasDecking || room.hasPictureFrame);
  const deckFront = isDecking ? (room.deckingSizeMm ?? 1500) / 1000 : 0;
  const deckLeft = isDecking ? Math.max(0, room.deckingLeftMm ?? 0) / 1000 : 0;
  const deckRight = isDecking ? Math.max(0, room.deckingRightMm ?? 0) / 1000 : 0;
  const baseW = w + ohLeft + ohRight + deckLeft + deckRight;
  const baseD = d + ohBack + deckFront;
  const baseX = (ohRight + deckRight - ohLeft - deckLeft) / 2;
  const baseZ = (deckFront - ohBack) / 2;
  const baseH = mm(room.baseHeightMm ?? 100, 100) / 1000;
  // The plinth alone: the footprint plus roof overhangs, no deck.
  const plinthW = w + ohLeft + ohRight, plinthD = d + ohBack;
  const plinthX = (ohRight - ohLeft) / 2, plinthZ = -ohBack / 2;
  return { w, d, ohBack, ohLeft, ohRight, isDecking, deckFront, deckLeft, deckRight, baseW, baseD, baseX, baseZ, baseH, plinthW, plinthD, plinthX, plinthZ };
}

/** The deck as it was before outlines: the whole base rectangle. */
export function defaultDeckOutline(room: Room): [number, number][] {
  const f = baseFrame(room);
  const x0 = f.baseX - f.baseW / 2, x1 = f.baseX + f.baseW / 2;
  const z0 = f.baseZ - f.baseD / 2, z1 = f.baseZ + f.baseD / 2;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return [[r(x0), r(z0)], [r(x1), r(z0)], [r(x1), r(z1)], [r(x0), r(z1)]];
}

/** The outline in force: the customer's, or the rectangle. */
export function deckOutline(room: Room): [number, number][] {
  const o = room.deckOutline;
  return Array.isArray(o) && o.length >= 3 ? o : defaultDeckOutline(room);
}

/** Area of a polygon in square metres (shoelace). */
export function polygonArea(points: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, z1] = points[i], [x2, z2] = points[(i + 1) % points.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

/**
 * A deck slab from an outline: the polygon pulled up by h, laid flat.
 *
 * UVs on the top are (x - ox, z - oz) in metres - the SAME convention as
 * the building's base box (createWorldScaleBoxGeometry: local position
 * relative to the box centre) - so with the base's centre as the origin the
 * boards run straight through from plinth to deck with no seam, and two
 * decks side by side line up. Sides get (distance along, height).
 */
export function deckSlabGeometry(points: [number, number][], h: number, ox = 0, oz = 0): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  // Shape y is -z so that a -90 degree turn about x lands it on world z.
  points.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
  shape.closePath();
  const uvGenerator = {
    generateTopUV(_g: THREE.ExtrudeGeometry, v: number[], a: number, b: number, c: number) {
      const uv = (i: number) => new THREE.Vector2(v[i * 3] - ox, -v[i * 3 + 1] - oz);
      return [uv(a), uv(b), uv(c)];
    },
    generateSideWallUV(_g: THREE.ExtrudeGeometry, v: number[], a: number, b: number, c: number, d: number) {
      const ax = v[a * 3], ay = v[a * 3 + 1], bx = v[b * 3], by = v[b * 3 + 1];
      const len = Math.hypot(bx - ax, by - ay);
      const s0 = ax - ox + (-ay - oz), s1 = s0 + len;
      return [new THREE.Vector2(s0, v[a * 3 + 2]), new THREE.Vector2(s1, v[b * 3 + 2]), new THREE.Vector2(s1, v[c * 3 + 2]), new THREE.Vector2(s0, v[d * 3 + 2])];
    },
  };
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, UVGenerator: uvGenerator });
  // aoMap reads uv1; give it the same set so the AO shows rather than
  // sampling an empty attribute.
  geo.setAttribute('uv1', geo.getAttribute('uv'));
  return geo;
}

/**
 * The decking texture set at TRUE world scale: one tile per tileSize metres
 * both ways, whatever the deck's size or the wall-board slider.
 *
 * useRealMaterial treats decking as cladding, so its v-repeat was
 * 1/heightMeters - the base box passed the deck DEPTH, which stretched
 * every board to the deck's depth (a 1.5 m deck had 1.5 m boards one way
 * and 2 m the other) and made two decks of different depth mismatch. The
 * maps here are this hook's own clones, so resetting their repeat is safe.
 */
export function useDeckTexture(key: string) {
  const props = useRealMaterial(key, 2, 2, 0);
  const def: any = (MATERIAL_DEF as any)[key] ?? (MATERIAL_DEF as any).timber_decking;
  return useMemo(() => {
    const tile = def.tileSize || 2;
    for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap'] as const) {
      const m = (props as any)[k] as THREE.Texture | undefined;
      if (m) { m.repeat.set(1 / tile, 1 / tile); m.rotation = 0; m.needsUpdate = true; }
    }
    return props;
  }, [props, def]);
}
