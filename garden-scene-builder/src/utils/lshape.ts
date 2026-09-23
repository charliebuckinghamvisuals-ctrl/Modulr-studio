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

/**
 * The notch itself, in room-local metres (x across, +z the front), or null
 * when the footprint is not an L.
 *
 * RoomGeometry cuts the walls, roof and base from this, and the walkthrough
 * collides against it. The walkthrough used to know nothing about the L at
 * all: the front and end walls still ran straight across the notch as
 * invisible walls, and the notch's own two walls could be walked through
 * (Charlie, 23 Sep 2026). One definition means the two cannot disagree.
 *
 * w and d are the caller's own footprint in metres, so each caller's clamps
 * on the overall size carry through unchanged.
 */
export function lShapeNotch(room: Room, w: number, d: number) {
  if (room.shape !== 'LShape') return null;
  // Leaves at least 350mm of building beside and behind the cut, whatever a
  // saved design asks for - thinner than two walls is a solid the wall
  // boolean cannot resolve.
  const cutW = Math.min((room.lShapeCutoutWidthMm ?? 2000) / 1000, w - 0.35);
  const cutD = Math.min((room.lShapeCutoutDepthMm ?? 1500) / 1000, d - 0.35);
  const corner = room.lShapeCutoutCorner ?? 'front-right';
  /** +1 = the cut is on the right (+x), -1 = on the left. */
  const sx = corner.endsWith('left') ? -1 : 1;
  /** +1 = the cut is at the front (+z), -1 = at the back. */
  const sz = corner.startsWith('back') ? -1 : 1;
  /** The notch's inner corner, on the building's own wall lines. */
  const lineX = sx * (w / 2 - cutW);
  const lineZ = sz * (d / 2 - cutD);
  // The notch as a box, from its inner corner out to the outer wall lines.
  return {
    cutW, cutD, sx, sz, lineX, lineZ,
    x0: Math.min(lineX, sx * w / 2), x1: Math.max(lineX, sx * w / 2),
    z0: Math.min(lineZ, sz * d / 2), z1: Math.max(lineZ, sz * d / 2),
  };
}

/**
 * Openings on the notch's walls.
 *
 * The notch steps two elevations back. Its recessed face points exactly the
 * way the front (or back) wall does, and its side face the way the end wall
 * does - on a drawing they ARE part of those elevations, stepped. So an
 * opening on them keeps its wall's name (a door on the recessed face of a
 * front cut is a 'front' door) and only the plane it sits in moves. Its
 * rotation, which side is outside, the door's swing, the inside/outside
 * frame colours and the elevation's cladding all stay right with no special
 * case - which a new wall id, like the outdoor section's divider needed,
 * would have had to add at every one of them.
 *
 * The signed coordinate of the OUTER face an opening sits in: z for
 * front/back, x for left/right. offsetM is its centre along the wall.
 */
export function outerFaceAt(
  notch: ReturnType<typeof lShapeNotch>, w: number, d: number, wall: string, offsetM: number,
): number {
  const onRecessX = !!notch && offsetM > notch.x0 && offsetM < notch.x1;
  const onRecessZ = !!notch && offsetM > notch.z0 && offsetM < notch.z1;
  switch (wall) {
    case 'front': return notch && notch.sz > 0 && onRecessX ? notch.lineZ : d / 2;
    case 'back': return notch && notch.sz < 0 && onRecessX ? notch.lineZ : -d / 2;
    case 'right': return notch && notch.sx > 0 && onRecessZ ? notch.lineX : w / 2;
    case 'left': return notch && notch.sx < 0 && onRecessZ ? notch.lineX : -w / 2;
    default: return 0;
  }
}

/**
 * Where a stepped wall steps, in mm along it, and on which side of that
 * point the recessed face is - or null for a wall the notch leaves whole.
 * An opening lives on the main face or the recessed one, never across the
 * corner; wallSpanMm (utils/bay) splits the wall here.
 */
export function steppedWallMm(room: Room, wall: string): { line: number; recessHigh: boolean } | null {
  const notch = lShapeNotch(room, (room.widthMm ?? 8000) / 1000, (room.depthMm ?? 4300) / 1000);
  if (!notch) return null;
  if (wall === (notch.sz > 0 ? 'front' : 'back')) return { line: Math.round(notch.lineX * 1000), recessHigh: notch.sx > 0 };
  if (wall === (notch.sx > 0 ? 'right' : 'left')) return { line: Math.round(notch.lineZ * 1000), recessHigh: notch.sz > 0 };
  return null;
}
