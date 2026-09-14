import type { Room, ObjectType } from '../types';

/**
 * The outdoor section: one end of the building left open under the same
 * roof - a covered bay for a hot tub or an outdoor kitchen.
 *
 * The building keeps ONE width. The bay takes a slice off one end of it,
 * inside the shell: the end wall and the back wall stay (finished on both
 * faces), the front wall is cut away over the bay, and a dividing wall
 * stands between the bay and the room. So the roof, fascia, base, cladding,
 * gutters and planning check all see the same building they always did.
 *
 * The bay can be the full depth of the building, or a corner of it: with a
 * depth set, a return wall closes it off and the room wraps round it in an L.
 *
 * All extents are ROOM-LOCAL metres, between inner wall faces. +z is the
 * front of the building.
 */
export interface BayRange {
  side: 'left' | 'right';
  /** Clear width of the bay, end-wall inner face to the divider. */
  width: number;
  /** Inner extents of the bay along x. */
  x0: number;
  x1: number;
  /** Centre of the dividing wall along x. */
  dividerX: number;
  /** Clear depth, from the building's front face back. */
  depth: number;
  /** True when the bay runs the whole depth, back wall to front. */
  full: boolean;
  /** The bay's back limit along z: the back wall's inner face, or the
   *  return wall's bay face. The front limit is the building's front face. */
  z0: number;
  /** Centre of the return wall along z (partial depth only). */
  returnZ: number;
}

/** Room widths this small cannot spare an end for a bay. */
export const MIN_ROOM_M = 1.5;
export const MIN_BAY_M = 1.2;

export function bayRange(room: Room): BayRange | null {
  const bay = room.bay;
  if (!bay || !bay.widthMm) return null;
  const wt = (room.wallThicknessMm ?? 150) / 1000;
  const hx = room.widthMm / 2000 - wt;
  const d = room.depthMm / 1000;
  // Never wider than leaves a usable room behind the divider.
  const width = Math.max(MIN_BAY_M, Math.min(bay.widthMm / 1000, 2 * hx - wt - MIN_ROOM_M));
  if (width < MIN_BAY_M) return null;
  const fullDepth = d - wt;
  const wanted = bay.depthMm ? bay.depthMm / 1000 : fullDepth;
  const full = wanted >= fullDepth - 0.01 || wanted > d - wt - MIN_BAY_M;
  const depth = full ? fullDepth : Math.max(MIN_BAY_M, wanted);
  const z0 = d / 2 - depth;
  const common = { width, depth, full, z0, returnZ: z0 - wt / 2 };
  if (bay.side === 'right') {
    return { side: 'right', x0: hx - width, x1: hx, dividerX: hx - width - wt / 2, ...common };
  }
  return { side: 'left', x0: -hx, x1: -hx + width, dividerX: -hx + width + wt / 2, ...common };
}

/** Inner x extents of the ENCLOSED room - the whole interior when there is
 *  no bay or the bay is only a corner, the part behind the divider when
 *  the bay runs the full depth. */
export function enclosedRange(room: Room): { x0: number; x1: number } {
  const wt = (room.wallThicknessMm ?? 150) / 1000;
  const hx = room.widthMm / 2000 - wt;
  const bay = bayRange(room);
  if (!bay || !bay.full) return { x0: -hx, x1: hx };
  return bay.side === 'left' ? { x0: bay.x1 + wt, x1: hx } : { x0: -hx, x1: bay.x0 - wt };
}

/** Height of the bay's walking surface above the plinth top: the deck
 *  boards (25mm on 4mm), porcelain (20mm), or the bare plinth. Must match
 *  the floor meshes in BayParts. */
export function bayFloorTop(room: Room): number {
  const floor = room.bay?.floor ?? 'decking';
  return floor === 'decking' ? 0.029 : floor === 'porcelain' ? 0.02 : 0;
}

/** Things that live in the outdoor section, not the room. */
export const OUTDOOR_TYPES: ObjectType[] = ['hot_tub'];
export const isOutdoorType = (type?: ObjectType) => !!type && OUTDOOR_TYPES.includes(type);

/**
 * The x extents an object of this type may occupy along the walls: the bay
 * for outdoor things (falling back to the room when there is no bay), the
 * enclosed room for everything else.
 */
export function zoneX(room: Room, type?: ObjectType): { x0: number; x1: number } {
  if (isOutdoorType(type)) {
    const bay = bayRange(room);
    if (bay) return { x0: bay.x0, x1: bay.x1 };
  }
  return enclosedRange(room);
}

/**
 * Keep a room-local point in its zone.
 *
 * Outdoor things stay inside the bay. Everything else stays inside the
 * room, which with a bay means outside the bay AND its walls: a point that
 * has strayed into that block is pushed out through whichever wall of it
 * is nearest - the divider, or the return wall of a corner bay. Without a
 * type (the walkthrough camera) the room's zone applies.
 */
export function clampInZone(room: Room, lx: number, lz: number, margin: number, type?: ObjectType, blockMargin = margin): { lx: number; lz: number } {
  const wt = (room.wallThicknessMm ?? 150) / 1000;
  const hx = Math.max(0.1, room.widthMm / 2000 - wt - margin);
  const hz = Math.max(0.1, room.depthMm / 2000 - wt - margin);
  const d = room.depthMm / 1000;
  const bay = bayRange(room);

  if (isOutdoorType(type) && bay) {
    return {
      lx: Math.max(bay.x0 + margin, Math.min(bay.x1 - margin, lx)),
      // Up to the front face of the building, less a little - there is no
      // front wall, and a tub is allowed right to the edge of the deck.
      lz: Math.max(bay.z0 + margin, Math.min(d / 2 - 0.02 - margin, lz)),
    };
  }

  let x = Math.max(-hx, Math.min(hx, lx));
  let z = Math.max(-hz, Math.min(hz, lz));
  if (!bay) return { lx: x, lz: z };

  // The block the room cannot use: bay plus divider (and return wall). Kept
  // clear by blockMargin - the object's own footprint, when the caller
  // knows it - so a bed is moved out whole rather than by its centre, with
  // half of it left standing through the divider.
  const left = bay.side === 'left';
  const bx0 = left ? -Infinity : bay.x0 - wt;
  const bx1 = left ? bay.x1 + wt : Infinity;
  const bz0 = bay.full ? -Infinity : bay.z0 - wt;
  const bm = Math.max(margin, blockMargin);
  const inside = x > bx0 - bm && x < bx1 + bm && z > bz0 - bm;
  if (!inside) return { lx: x, lz: z };

  // Push out through the nearest allowed wall of the block.
  const outX = left ? bx1 + bm : bx0 - bm;
  const moveX = Math.abs(outX - x);
  const outZ = bz0 - bm;
  const moveZ = bay.full ? Infinity : Math.abs(outZ - z);
  if (moveX <= moveZ) x = Math.max(-hx, Math.min(hx, outX));
  else z = Math.max(-hz, Math.min(hz, outZ));
  return { lx: x, lz: z };
}

/**
 * The stretch of a wall an opening may sit in, in that wall's own offset
 * coordinate in mm: along x for the front and back, along z for the ends,
 * along the divider from its midpoint for 'bay'.
 *
 * The bay takes wall away - the front over the bay and its divider, the
 * bay's stretch of the end wall and (full depth) of the back wall, the
 * whole end wall once it is a screen or open. An opening put there would
 * hang in the air across the open section, so RoomGeometry hides it
 * (openingInBay). This is the same rule from the other side: where an
 * opening CAN go. Null: nothing of this wall is left.
 */
export function wallSpanMm(room: Room, wall: string): { lo: number; hi: number } | null {
  const wtMm = room.wallThicknessMm ?? 150;
  const bay = bayRange(room);
  if (wall === 'bay') {
    if (!bay) return null;
    const half = bay.depth * 500;
    return { lo: -half, hi: half };
  }
  const alongX = wall === 'front' || wall === 'back';
  const len = alongX ? room.widthMm : room.depthMm;
  const full = { lo: -len / 2, hi: len / 2 };
  if (!bay) return full;
  if (wall === 'front' || (wall === 'back' && bay.full)) {
    // The bay and its divider, along x.
    return bay.side === 'left'
      ? { lo: Math.round(bay.x1 * 1000) + wtMm, hi: full.hi }
      : { lo: full.lo, hi: Math.round(bay.x0 * 1000) - wtMm };
  }
  if (wall === bay.side) {
    if ((room.bay?.screen ?? 'solid') !== 'solid') return null;
    // Behind the bay (and the return wall of a corner bay).
    return { lo: full.lo, hi: Math.round(bay.z0 * 1000) - wtMm };
  }
  return full;
}

/**
 * An opening that would sit in wall the bay has removed: on the front
 * wall over the bay (or its divider), or anywhere on the end wall once
 * that is a screen or open, or the bay's stretch of the end and back
 * walls. Such a door or window stays in the design - turn the bay off
 * and it is back - but it is neither drawn, cut nor walked through.
 * A door IN the divider exists only while the bay does.
 */
export function openingRemovedByBay(room: Room, bay: BayRange | null, o: { wall: string; offsetMm?: number; widthMm: number }): boolean {
  if (o.wall === 'bay') return !bay;
  if (!bay) return false;
  const wt = (room.wallThicknessMm ?? 150) / 1000;
  const half = o.widthMm / 2000, c = (o.offsetMm ?? 0) / 1000;
  if (o.wall === 'front') return c + half > bay.x0 - wt && c - half < bay.x1 + wt;
  if (o.wall === bay.side) {
    if ((room.bay?.screen ?? 'solid') !== 'solid') return true;
    return c + half > bay.z0 - wt;
  }
  if (o.wall === 'back' && bay.full) return c + half > bay.x0 - wt && c - half < bay.x1 + wt;
  return false;
}
