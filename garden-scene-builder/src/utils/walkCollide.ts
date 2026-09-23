import type { Room, Door, WindowData, PartitionData } from '../types';
import { bayRange, openingRemovedByBay, bayFloorTop } from './bay';
import { lShapeNotch } from './lshape';

/**
 * Wall collision for the walkthrough.
 *
 * The walker used to be clamped INSIDE the room. Now the walk starts in
 * the garden and the walls are simply solid: every wall of the building -
 * the shell, the outdoor section's divider and return wall, the internal
 * walls - is a rectangle in room-local metres, and an OPEN door is a gap
 * cut out of its wall. Nothing else is walkable logic: outside, inside,
 * the deck of the outdoor section, they are all just "not in a wall".
 *
 * All coordinates are ROOM-LOCAL metres (the room's own x/z/rot undone by
 * the caller). +z is the front.
 */
export interface WallRect { x0: number; x1: number; z0: number; z1: number }

/** A span along a wall that is open: an open door, a plain opening. */
interface Gap { a: number; b: number }

/** Cut gaps out of a rectangle along x (front/back walls). */
function splitX(r: WallRect, gaps: Gap[]): WallRect[] {
  const out: WallRect[] = [];
  let x = r.x0;
  const sorted = gaps.filter(g => g.b > r.x0 && g.a < r.x1).sort((p, q) => p.a - q.a);
  for (const g of sorted) {
    if (g.a > x) out.push({ x0: x, x1: g.a, z0: r.z0, z1: r.z1 });
    x = Math.max(x, g.b);
  }
  if (x < r.x1) out.push({ x0: x, x1: r.x1, z0: r.z0, z1: r.z1 });
  return out;
}

/** Cut gaps out of a rectangle along z (end walls, the divider). */
function splitZ(r: WallRect, gaps: Gap[]): WallRect[] {
  const out: WallRect[] = [];
  let z = r.z0;
  const sorted = gaps.filter(g => g.b > r.z0 && g.a < r.z1).sort((p, q) => p.a - q.a);
  for (const g of sorted) {
    if (g.a > z) out.push({ x0: r.x0, x1: r.x1, z0: z, z1: g.a });
    z = Math.max(z, g.b);
  }
  if (z < r.z1) out.push({ x0: r.x0, x1: r.x1, z0: z, z1: r.z1 });
  return out;
}

/**
 * Every solid wall of the building, with the open doors taken out.
 *
 * @param openIds  doors opened one at a time in the walkthrough
 * @param allOpen  the "Open Doors" toggle - every exterior set at once
 */
export function buildWalkSolids(room: Room, openIds: string[], allOpen: boolean): WallRect[] {
  const w = room.widthMm / 1000, d = room.depthMm / 1000;
  const wt = (room.wallThicknessMm ?? 150) / 1000;
  const bay = bayRange(room);
  const rects: WallRect[] = [];

  const doorOpen = (dr: Door) => allOpen || openIds.includes(dr.id);
  const gapsFor = (wall: Door['wall']): Gap[] =>
    (room.doors || [])
      .filter(dr => dr.wall === wall && doorOpen(dr) && !openingRemovedByBay(room, bay, dr))
      .map(dr => ({ a: dr.offsetMm / 1000 - dr.widthMm / 2000, b: dr.offsetMm / 1000 + dr.widthMm / 2000 }));

  // Front wall: gone over the bay (RoomGeometry cuts x0..x1, or out through
  // the corner when the end is a screen or open).
  const frontGaps = gapsFor('front');
  if (bay) {
    const through = (room.bay?.screen ?? 'solid') !== 'solid';
    const outer = bay.side === 'left' ? -w / 2 - 0.1 : w / 2 + 0.1;
    const inner = bay.side === 'left' ? bay.x1 : bay.x0;
    frontGaps.push(through ? { a: Math.min(outer, inner), b: Math.max(outer, inner) } : { a: bay.x0, b: bay.x1 });
  }
  // An L's notch shortens the front-or-back wall and the end wall it sits
  // against, and brings two walls of its own. Before this the walkthrough
  // did not know the L existed: the rectangle's walls stood across the
  // notch as invisible walls you could not walk into.
  const notch = lShapeNotch(room, w, d);
  // The run of a front/back wall along x, and of an end wall along z, with
  // the notch's stretch taken off whichever end it sits at.
  const runX = (cut: boolean): [number, number] =>
    !cut || !notch ? [-w / 2, w / 2] : notch.sx > 0 ? [-w / 2, notch.lineX] : [notch.lineX, w / 2];
  const runZ = (cut: boolean): [number, number] =>
    !cut || !notch ? [-d / 2, d / 2] : notch.sz > 0 ? [-d / 2, notch.lineZ] : [notch.lineZ, d / 2];

  const [fx0, fx1] = runX(notch?.sz === 1);
  rects.push(...splitX({ x0: fx0, x1: fx1, z0: d / 2 - wt, z1: d / 2 }, frontGaps));

  // Back wall: gone over a full-depth bay whose back is open. Slats still
  // stand in the way.
  const backGaps = gapsFor('back');
  if (bay && bay.full && room.bay?.backWall === 'open') backGaps.push({ a: bay.x0, b: bay.x1 });
  const [bx0, bx1] = runX(notch?.sz === -1);
  rects.push(...splitX({ x0: bx0, x1: bx1, z0: -d / 2, z1: -d / 2 + wt }, backGaps));

  // End walls: the bay's end is gone along the bay when it is open.
  for (const side of ['left', 'right'] as const) {
    const gaps = gapsFor(side);
    if (bay && bay.side === side && room.bay?.screen === 'open') gaps.push({ a: bay.z0, b: d / 2 + 0.1 });
    const x0 = side === 'left' ? -w / 2 : w / 2 - wt;
    const [ez0, ez1] = runZ(notch?.sx === (side === 'left' ? -1 : 1));
    rects.push(...splitZ({ x0, x1: x0 + wt, z0: ez0, z1: ez1 }, gaps));
  }

  // The notch's own two walls, on the building side of its lines - where
  // RoomGeometry leaves them - each run a wall thickness past the inner
  // corner so the two close it. Their doors are the doors of the walls they
  // face the same way as (see outerFaceAt in utils/lshape), so the same gap
  // lists cut them; a gap from the main face falls outside and is dropped.
  if (notch) {
    const { sx, sz, lineX, lineZ } = notch;
    const acrossZ0 = sz > 0 ? lineZ - wt : lineZ;
    rects.push(...splitX({ x0: Math.min(lineX - sx * wt, sx * w / 2), x1: Math.max(lineX - sx * wt, sx * w / 2), z0: acrossZ0, z1: acrossZ0 + wt },
      sz > 0 ? frontGaps : backGaps));
    const alongX0 = sx > 0 ? lineX - wt : lineX;
    rects.push(...splitZ({ x0: alongX0, x1: alongX0 + wt, z0: Math.min(lineZ - sz * wt, sz * d / 2), z1: Math.max(lineZ - sz * wt, sz * d / 2) },
      gapsFor(sx > 0 ? 'right' : 'left')));
  }

  if (bay) {
    // The divider, with its doors measured from its midpoint.
    const cz = (bay.z0 + d / 2) / 2;
    const gaps = gapsFor('bay').map(g => ({ a: g.a + cz, b: g.b + cz }));
    rects.push(...splitZ({ x0: bay.dividerX - wt / 2, x1: bay.dividerX + wt / 2, z0: bay.z0, z1: d / 2 }, gaps));
    // The return wall closing a corner bay - no doors in it.
    if (!bay.full) {
      const cx = (bay.x0 + bay.x1) / 2, bw = bay.width + wt;
      rects.push({ x0: cx - bw / 2, x1: cx + bw / 2, z0: bay.returnZ - wt / 2, z1: bay.returnZ + wt / 2 });
    }
  }

  // Internal walls: a straight run, an optional leg, and their door sets.
  // A set with no leaf (no style) is a plain opening, always passable.
  for (const part of room.partitions || []) rects.push(...partitionRects(part, openIds));

  return rects;
}

function partitionRects(part: PartitionData, openIds: string[]): WallRect[] {
  const pL = part.lengthMm / 1000, pT = part.thicknessMm / 1000;
  const hasLeg = (part.legLengthMm || 0) > 100;
  const legL = hasLeg ? (part.legLengthMm as number) / 1000 : 0;
  const le = part.legEnd === -1 ? -1 : 1;
  const ld = part.legDir === -1 ? -1 : 1;
  const passable = (dr: { id: string; style?: string }) => !dr.style || openIds.includes(dr.id);

  // In the wall's own frame: the run along local x, the leg along local z
  // from the run's end.
  const mainGaps: Gap[] = (part.doors || [])
    .filter(dr => !dr.onLeg && passable(dr))
    .map(dr => ({ a: dr.offsetMm / 1000 - dr.widthMm / 2000, b: dr.offsetMm / 1000 + dr.widthMm / 2000 }));
  const local: WallRect[] = splitX({ x0: -pL / 2, x1: pL / 2, z0: -pT / 2, z1: pT / 2 }, mainGaps);
  if (hasLeg) {
    const legX = le * (pL / 2 - pT / 2);
    const legGaps: Gap[] = (part.doors || [])
      .filter(dr => dr.onLeg && passable(dr))
      .map(dr => { const a = pT / 2 + dr.offsetMm / 1000, b = a + dr.widthMm / 1000; return ld > 0 ? { a, b } : { a: -b, b: -a }; });
    const z0 = ld > 0 ? pT / 2 : -(pT / 2 + legL), z1 = ld > 0 ? pT / 2 + legL : -pT / 2;
    local.push(...splitZ({ x0: legX - pT / 2, x1: legX + pT / 2, z0, z1 }, legGaps));
  }

  // Into room-local: the wall's rotation is 0 or a quarter turn, so the
  // rectangles stay axis-aligned.
  const cx = part.xMm / 1000, cz = part.zMm / 1000;
  if (part.rotation === 90) {
    // Local x -> -z, local z -> x (a +90 degree turn about y).
    return local.map(r => ({ x0: cx + r.z0, x1: cx + r.z1, z0: cz - r.x1, z1: cz - r.x0 }));
  }
  return local.map(r => ({ x0: cx + r.x0, x1: cx + r.x1, z0: cz + r.z0, z1: cz + r.z1 }));
}

/** True when a walker of this radius at (x, z) overlaps a wall. */
export function walkBlocked(rects: WallRect[], x: number, z: number, radius: number): boolean {
  for (const r of rects) {
    if (x > r.x0 - radius && x < r.x1 + radius && z > r.z0 - radius && z < r.z1 + radius) return true;
  }
  return false;
}

/**
 * Where the walker's feet are, above the world ground: the finished floor
 * inside the building (and on the front deck, which sits on the plinth),
 * the outdoor section's deck, the ground outside.
 */
export function walkFloorY(room: Room, x: number, z: number): number {
  const w = room.widthMm / 1000, d = room.depthMm / 1000;
  const base = (room.baseHeightMm ?? 100) / 1000;
  const bay = bayRange(room);
  if (bay && x > bay.x0 && x < bay.x1 && z > bay.z0 && z < d / 2) return base + bayFloorTop(room);
  // An L's notch is outside: ground, or the deck where the deck runs into
  // the recess (its default outline is the whole base rectangle).
  const notch = lShapeNotch(room, w, d);
  if (notch && x > notch.x0 && x < notch.x1 && z > notch.z0 && z < notch.z1) {
    return (room.hasDecking || room.hasPictureFrame) ? base : 0;
  }
  if (Math.abs(x) <= w / 2 && Math.abs(z) <= d / 2) return base;
  const deck = (room.hasDecking || room.hasPictureFrame) ? (room.deckingSizeMm ?? 1500) / 1000 : 0;
  if (deck > 0 && Math.abs(x) <= w / 2 && z > d / 2 && z <= d / 2 + deck) return base;
  return 0;
}

/** Room-local <-> world, for a room that may be moved and turned. */
export function toRoomLocal(room: Room, x: number, z: number): { x: number; z: number } {
  const rx = (room.x ?? 0) / 1000, rz = (room.z ?? 0) / 1000, rot = room.rot ?? 0;
  const cos = Math.cos(-rot), sin = Math.sin(-rot);
  return { x: (x - rx) * cos - (z - rz) * sin, z: (x - rx) * sin + (z - rz) * cos };
}
export function toWorld(room: Room, lx: number, lz: number): { x: number; z: number } {
  const rx = (room.x ?? 0) / 1000, rz = (room.z ?? 0) / 1000, rot = room.rot ?? 0;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  return { x: rx + lx * cos - lz * sin, z: rz + lx * sin + lz * cos };
}

export type { Door, WindowData };
