import type { Room } from '../types';

/**
 * The L-shape's cut-out, in one place.
 *
 * The sidebar, the plan-view drag handles and the editable dimension text
 * each clamped the cut-out differently - the sidebar to widthMm - 400, the
 * drag handles to nothing at all - so a handle could pull the cut past the
 * far wall and leave a sliver of solid that the wall boolean cannot resolve.
 * They all come through here now.
 */

/** What must be left of the building beside and behind the cut-out. */
export const MIN_LEG_MM = 400;

const clamp = (val: number, overall: number | undefined, fallback: number) => {
  const max = Math.max(100, (overall ?? fallback) - MIN_LEG_MM);
  const n = Math.round(Number(val));
  return Math.max(100, Math.min(max, Number.isFinite(n) ? n : 100));
};

export const clampCutoutWidthMm = (room: Room, val: number) => clamp(val, room.widthMm, 6000);
export const clampCutoutDepthMm = (room: Room, val: number) => clamp(val, room.depthMm, 4000);
