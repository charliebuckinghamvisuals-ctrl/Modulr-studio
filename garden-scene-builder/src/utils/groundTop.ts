import type { DeckArea, ObjectType, Room } from '../types';
import { walkFloorY, toRoomLocal } from './walkCollide';
import { deckOutline } from './deck';

/**
 * Garden furniture - outdoor sofa, chairs, table, BBQ. Placed anywhere
 * outside, not clamped to the room or the outdoor section, and standing on
 * whatever is under it ("separate the outdoor furniture so users can add
 * them in separately", Charlie, 23 Sep 2026).
 */
export const GARDEN_FURNITURE: ObjectType[] = ['outdoor_sofa', 'outdoor_chair', 'outdoor_table', 'bbq'];
export const isGardenFurniture = (type: ObjectType) => GARDEN_FURNITURE.includes(type);

const inPolygon = (pts: [number, number][], x: number, z: number) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};

/**
 * The top of whatever stands at world (x, z): the building's deck or plinth
 * (the deck's own outline, which the customer may have reshaped), the
 * outdoor section's deck, a garden deck, or the lawn. A chair set down on
 * the decking stood on the grass and sank the deck's height into it.
 */
export function groundTopAt(room: Room, decks: DeckArea[] | undefined, x: number, z: number): number {
  const l = toRoomLocal(room, x, z);
  let y = walkFloorY(room, l.x, l.z);
  if (y === 0 && (room.hasDecking || room.hasPictureFrame) && inPolygon(deckOutline(room), l.x, l.z)) {
    y = (room.baseHeightMm ?? 100) / 1000;
  }
  for (const d of decks || []) {
    if (Array.isArray(d.points) && d.points.length >= 3 && inPolygon(d.points, x, z)) y = Math.max(y, (d.heightMm || 0) / 1000);
  }
  return y;
}
