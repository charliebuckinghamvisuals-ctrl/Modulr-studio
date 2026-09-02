import type { ObjectType, Room } from '../types';

/** Object types that live INSIDE the room: they stand on the finished floor
 *  and are clamped to the interior when placed or dragged. */
export const INTERIOR_TYPES: ObjectType[] = [
  'toilet', 'sink', 'shower', 'shower_corner', 'shower_small', 'vanity',
  'interior_wall', 'interior_door',
  'desk', 'sofa', 'sofa_2seater', 'sofa_l', 'footstool', 'armchair', 'dining_table',
  'coffee_table', 'coffee_table_black', 'rug', 'tv', 'bed',
  'bedside_table', 'bookshelf', 'dressing_table', 'wardrobe',
  'kitchen_island', 'indoor_plant',
  'kitchen_unit_600', 'kitchen_unit_1200', 'kitchen_sink_1200',
  'kitchen_tall_fridge', 'kitchen_tall_oven_single', 'kitchen_tall_oven_double',
  'kitchen_tap_straight', 'kitchen_tap_curved',
  'kitchen_drawer_2', 'kitchen_drawer_3', 'kitchen_tall_larder',
  'kitchen_hob_gas', 'kitchen_hob_induction', 'kitchen_extractor',
  'kitchen_wall_unit_600', 'kitchen_wall_unit_1200',
  'bar_stool', 'bar_stool_tall', 'towel_heater',
  // external_extraction_fan is deliberately NOT here - it is the outside
  // terminal of the extract run, so it has to be placeable on an outside wall.
];

export const isInteriorType = (type: ObjectType) => INTERIOR_TYPES.includes(type);

/** Rough footprint radius (m) per type, used for the rotate ring so the
 *  handle sits just outside the object. */
export const FOOTPRINT_RADIUS: Partial<Record<ObjectType, number>> = {
  bed: 1.3, sofa: 1.5, sofa_l: 1.8, armchair: 0.8, footstool: 0.6,
  wardrobe: 1.1, desk: 1.0, bedside_table: 0.5,
  coffee_table: 0.7, coffee_table_black: 0.7,
  toilet: 0.5, vanity: 0.6, shower: 1.2, shower_corner: 0.8, shower_small: 0.9,
  kitchen_tall_fridge: 0.6, kitchen_tall_oven_single: 0.6, kitchen_tall_oven_double: 0.6,
  kitchen_drawer_2: 0.6, kitchen_drawer_3: 0.6, kitchen_tall_larder: 0.6,
  kitchen_hob_gas: 0.55, kitchen_hob_induction: 0.45, kitchen_extractor: 0.7,
  // Taps are tiny - a default-sized ring would swallow the sink unit.
  kitchen_tap_straight: 0.28, kitchen_tap_curved: 0.28,
  kitchen_wall_unit_600: 0.55, kitchen_wall_unit_1200: 0.85,
  bar_stool: 0.4, bar_stool_tall: 0.4,
  dining_table: 1.2, towel_heater: 0.45, external_extraction_fan: 0.35,
};

/**
 * Clamp a world-space point into the room's interior (inside the walls, with
 * a small margin), respecting the room's position and rotation. Used so
 * interior objects can never be placed or dragged outside the building.
 */
export function clampToRoomInterior(room: Room, x: number, z: number, margin = 0.05): { x: number; z: number } {
  const rx = (room.x ?? 0) / 1000;
  const rz = (room.z ?? 0) / 1000;
  const rot = room.rot ?? 0;
  const cos = Math.cos(-rot), sin = Math.sin(-rot);
  let lx = (x - rx) * cos - (z - rz) * sin;
  let lz = (x - rx) * sin + (z - rz) * cos;
  const wallT = (room.wallThicknessMm ?? 150) / 1000;
  const hx = Math.max(0.1, room.widthMm / 2000 - wallT - margin);
  const hz = Math.max(0.1, room.depthMm / 2000 - wallT - margin);
  lx = Math.max(-hx, Math.min(hx, lx));
  lz = Math.max(-hz, Math.min(hz, lz));
  const c2 = Math.cos(rot), s2 = Math.sin(rot);
  return { x: rx + lx * c2 - lz * s2, z: rz + lx * s2 + lz * c2 };
}

/** Room-local coordinates and inner half-extents - used for the live
 *  distance-to-wall readouts while dragging. */
/**
 * Height of the ceiling above the FINISHED FLOOR - the datum everything
 * inside the room is measured from.
 *
 * heightMm means different things by shape. On a box it is the wall height.
 * On a GABLE it is the whole building, ground to ridge, so the wall height
 * has to be recovered from it - reading it as a wall height there sent an
 * extractor flue out through the roof by the base plinth plus the whole roof
 * pitch. Anything that must stop at the ceiling wants the LOWEST ceiling over
 * it, which on a gable is the eaves rather than the ridge, or the flat
 * ceiling if one has been boarded in.
 */
export function interiorCeilingHeight(room: Room): number {
  const total = (room.heightMm ?? 2050) / 1000;
  if (room.shape !== 'Gable') return total - 0.01;
  const base = (room.baseHeightMm ?? 100) / 1000;
  const roof = (room.roofHeightMm ?? 200) / 1000;
  const eaves = total - base - roof + 0.025;
  return room.gableFlatCeiling
    ? Math.min(eaves, (room.gableCeilingHeightMm ?? 2400) / 1000)
    : eaves;
}

/** Ceiling panel thickness, and the floor finish they are measured above.
 *  Here rather than in RoomGeometry so the sidebar can quote the same limits
 *  the geometry enforces, instead of a number the geometry then clamps. */
export const GABLE_CEILING_T = 0.04;
const FLOOR_TOP = 0.01;

/**
 * Highest a flat gable ceiling can go, in mm above the finished floor.
 *
 * Not the ridge: the roof group hangs off the wall height while the gable
 * starts 25mm above it, the slabs straddle their centre line by half a
 * bargeboard, and the ceiling panel needs its own thickness and a little
 * clearance under that.
 */
export function gableCeilingMaxMm(room: Room): number {
  const base = (room.baseHeightMm ?? 100) / 1000;
  const roof = (room.roofHeightMm ?? 200) / 1000;
  const fascia = Math.min(0.4, Math.max(0.05, (room.gableFasciaMm ?? 100) / 1000));
  const wallTop = (room.heightMm ?? 2050) / 1000 - base - roof + 0.025;
  const spanHalf = ((room.gableOrientation === 'side' ? room.depthMm : room.widthMm) / 1000) / 2;
  const perp = Math.cos(Math.atan2(roof, Math.max(0.1, spanHalf)));
  const centre = wallTop + roof - 0.025 - (fascia / 2) / perp - (GABLE_CEILING_T / 2) / perp - 0.006;
  return Math.round((centre - GABLE_CEILING_T / 2 - FLOOR_TOP) * 1000);
}

export function roomLocal(room: Room, x: number, z: number) {
  const rx = (room.x ?? 0) / 1000;
  const rz = (room.z ?? 0) / 1000;
  const rot = room.rot ?? 0;
  const cos = Math.cos(-rot), sin = Math.sin(-rot);
  const lx = (x - rx) * cos - (z - rz) * sin;
  const lz = (x - rx) * sin + (z - rz) * cos;
  const wallT = (room.wallThicknessMm ?? 150) / 1000;
  return {
    lx, lz,
    hx: room.widthMm / 2000 - wallT,
    hz: room.depthMm / 2000 - wallT,
  };
}
