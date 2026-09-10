import type { Room, ObjectType } from '../types';

/**
 * The outdoor section: one end of the building left open under the same
 * roof - a covered bay for a hot tub or an outdoor kitchen.
 *
 * The building keeps ONE width. The bay takes a slice off one end of it,
 * inside the shell: the end wall and the back wall stay (clad on both faces),
 * the front wall is cut away over the bay, and a dividing wall stands
 * between the bay and the room. So the roof, fascia, base, cladding, gutters
 * and planning check all see the same building they always did.
 *
 * All extents are ROOM-LOCAL metres along x, between inner wall faces.
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
}

/** Room widths this small cannot spare an end for a bay. */
export const MIN_ROOM_M = 1.5;
export const MIN_BAY_M = 1.2;

export function bayRange(room: Room): BayRange | null {
  const bay = room.bay;
  if (!bay || !bay.widthMm) return null;
  const wt = (room.wallThicknessMm ?? 150) / 1000;
  const hx = room.widthMm / 2000 - wt;
  // Never wider than leaves a usable room behind the divider.
  const width = Math.max(MIN_BAY_M, Math.min(bay.widthMm / 1000, 2 * hx - wt - MIN_ROOM_M));
  if (width < MIN_BAY_M) return null;
  if (bay.side === 'right') {
    return { side: 'right', width, x0: hx - width, x1: hx, dividerX: hx - width - wt / 2 };
  }
  return { side: 'left', width, x0: -hx, x1: -hx + width, dividerX: -hx + width + wt / 2 };
}

/** Inner x extents of the ENCLOSED room - the whole interior when there is
 *  no bay, the part behind the divider when there is. */
export function enclosedRange(room: Room): { x0: number; x1: number } {
  const wt = (room.wallThicknessMm ?? 150) / 1000;
  const hx = room.widthMm / 2000 - wt;
  const bay = bayRange(room);
  if (!bay) return { x0: -hx, x1: hx };
  return bay.side === 'left' ? { x0: bay.x1 + wt, x1: hx } : { x0: -hx, x1: bay.x0 - wt };
}

/** Things that live in the outdoor section, not the room. */
export const OUTDOOR_TYPES: ObjectType[] = ['hot_tub'];
export const isOutdoorType = (type?: ObjectType) => !!type && OUTDOOR_TYPES.includes(type);

/**
 * The x extents an object of this type may occupy: the bay for outdoor
 * things (falling back to the room when there is no bay), the enclosed room
 * for everything else.
 */
export function zoneX(room: Room, type?: ObjectType): { x0: number; x1: number } {
  if (isOutdoorType(type)) {
    const bay = bayRange(room);
    if (bay) return { x0: bay.x0, x1: bay.x1 };
  }
  return enclosedRange(room);
}
