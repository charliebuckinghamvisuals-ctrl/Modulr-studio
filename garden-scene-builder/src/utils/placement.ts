import type { ObjectType, Room, SceneObject } from '../types';
import { UNIT_FAMILY, NATIVE_WIDTH_MM, END_PANELS, END_PANEL_T, END_PANEL_GAP, isEndPanel, GLB_OBJECT_LABELS } from '../modelRegistry';
import { zoneX, clampInZone, bayRange, openingRemovedByBay } from './bay';

/**
 * Settle an object against the room's inner wall faces by its FACES.
 *
 * The same rule the drag uses: a face within 120mm of an inner wall face
 * jumps onto it, and no face can pass one. Click-placement clamped only the
 * object's CENTRE to the interior, so a wall-hung tap dropped by the wall
 * went in with its plate 12mm inside the plaster and its spout standing
 * out of the wall. ext is the object's extent around its origin, measured
 * from its lit meshes.
 */
export function settleAgainstWalls(
  room: Room, x: number, z: number,
  ext: { minX: number; maxX: number; minZ: number; maxZ: number },
  type?: ObjectType,
): { x: number; z: number } {
  const wt = (room.wallThicknessMm ?? 150) / 1000;
  // The x walls are the ZONE's: the room's own, or the bay's end wall and
  // the divider for something that lives in the outdoor section.
  const { x0, x1 } = zoneX(room, type);
  const innerZ = room.depthMm / 2000 - wt;
  const MAG = 0.12;
  let nx = x, nz = z;
  if (Math.abs(x1 - (nx + ext.maxX)) < MAG) nx = x1 - ext.maxX;
  else if (Math.abs((nx + ext.minX) - x0) < MAG) nx = x0 - ext.minX;
  if (Math.abs(innerZ - (nz + ext.maxZ)) < MAG) nz = innerZ - ext.maxZ;
  else if (Math.abs((nz + ext.minZ) + innerZ) < MAG) nz = -innerZ - ext.minZ;
  nx = Math.min(x1 - ext.maxX, Math.max(x0 - ext.minX, nx));
  nz = Math.min(innerZ - ext.maxZ, Math.max(-innerZ - ext.minZ, nz));
  return { x: nx, z: nz };
}

/**
 * Where an end panel lands against the nearest run of its own family.
 *
 * A panel dragged or placed within reach of a base, wall or tall unit's free
 * end jumps to that end: 3mm off the unit's side (the fitter's shadow line),
 * its back in line with the unit's back, turned to the unit's angle. Returns
 * null when nothing is in reach, and the caller keeps the raw position.
 */
export function snapEndPanel(
  type: ObjectType, x: number, z: number, objects: SceneObject[], selfId?: string,
): { x: number; z: number; rot: number } | null {
  const spec = END_PANELS[type];
  const fam = UNIT_FAMILY[type];
  if (!spec || !fam) return null;
  const REACH = 0.25;
  let best: { x: number; z: number; rot: number; dist: number } | null = null;
  for (const n of objects) {
    if (n.id === selfId || UNIT_FAMILY[n.type] !== fam || isEndPanel(n.type)) continue;
    const rot = n.rot ?? 0;
    // The run's direction and its across-vector, as the unit magnet uses.
    const dx = Math.cos(rot), dz = -Math.sin(rot);
    const px = Math.sin(rot), pz = Math.cos(rot);
    const nW = (n.widthMm ?? NATIVE_WIDTH_MM[n.type] ?? 600) / 1000;
    const vx = x - n.x, vz = z - n.z;
    const t = vx * dx + vz * dz;
    const s = vx * px + vz * pz;
    if (Math.abs(s) > 0.35) continue;
    for (const side of [1, -1]) {
      const target = side * (nW / 2 + END_PANEL_GAP + END_PANEL_T / 2);
      const dist = Math.abs(t - target);
      if (dist < REACH && (!best || dist < best.dist)) {
        best = {
          x: n.x + dx * target + px * spec.backOffset,
          z: n.z + dz * target + pz * spec.backOffset,
          rot, dist,
        };
      }
    }
  }
  return best;
}

/** The kitchen taps: they belong on the sink unit, not anywhere on a worktop. */
export const KITCHEN_TAP_TYPES: ObjectType[] = ['kitchen_tap_straight', 'kitchen_tap_curved'];
export const isKitchenTap = (type: ObjectType) => KITCHEN_TAP_TYPES.includes(type);

/**
 * How far behind the sink unit's centre the tap stands, in the unit's own
 * frame. Measured from kitchen_sink_1200.glb: the worktop's back edge is at
 * z -320 and the bowl runs z -224..226, so the tap deck is the 96mm strip
 * between them and the tap's base sits in the middle of it.
 */
const SINK_TAP_OFFSET_M = -0.272;

/**
 * Where a kitchen tap lands on the nearest sink unit.
 *
 * A tap dropped or dragged within reach of a sink jumps onto the tap deck
 * behind the bowl, centred, and takes the SINK'S rotation - which is what
 * makes the spout reach forward over the bowl. Before this the tap kept
 * whatever angle the placement ghost happened to have, and on a sink turned
 * to face the room that put the spout over the wall. Returns null when no
 * sink is in reach, and the caller keeps the raw position.
 */
export function snapTap(
  type: ObjectType, x: number, z: number, objects: SceneObject[], selfId?: string,
): { x: number; z: number; rot: number } | null {
  if (!isKitchenTap(type)) return null;
  const REACH = 0.7;
  let best: { x: number; z: number; rot: number; dist: number } | null = null;
  for (const n of objects) {
    if (n.id === selfId || n.type !== 'kitchen_sink_1200') continue;
    const rot = n.rot ?? 0;
    // Local +z is the unit's front; the tap deck is behind the bowl.
    const px = Math.sin(rot), pz = Math.cos(rot);
    const tx = n.x + px * SINK_TAP_OFFSET_M;
    const tz = n.z + pz * SINK_TAP_OFFSET_M;
    const dist = Math.hypot(x - tx, z - tz);
    if (dist < REACH && (!best || dist < best.dist)) best = { x: tx, z: tz, rot, dist };
  }
  return best;
}

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
  'kitchen_drawer_2', 'kitchen_drawer_3', 'kitchen_tall_larder', 'kitchen_corner_unit',
  'kitchen_hob_gas', 'kitchen_hob_induction', 'kitchen_extractor',
  'kitchen_wall_unit_600', 'kitchen_wall_unit_1200',
  'bar_stool', 'bar_stool_tall', 'towel_heater', 'spot_light', 'tv_unit',
  'dining_table_round', 'pendant_light',
  'end_panel_tall', 'end_panel_base', 'end_panel_wall',
  'basin_tap_mixer', 'basin_tap_widespread', 'basin_tap_wall',
  'heater_small', 'heater_large', 'boiler',
  'shelving_unit', 'chest_of_drawers', 'desk_single', 'bed_2', 'office_chair', 'aircon_indoor',
  // Stands on the finished floor like the rest, but in the outdoor section -
  // see OUTDOOR_TYPES in utils/bay for where it is allowed to go.
  'hot_tub',
  'pool_table', 'arcade_machine', 'wall_tv', 'dart_board',
  // aircon_outdoor is the condenser on the OUTSIDE wall, like the extract terminal.
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
  kitchen_drawer_2: 0.6, kitchen_drawer_3: 0.6, kitchen_tall_larder: 0.6, kitchen_corner_unit: 0.95,
  kitchen_hob_gas: 0.55, kitchen_hob_induction: 0.45, kitchen_extractor: 0.7,
  // Taps are tiny - a default-sized ring would swallow the sink unit.
  kitchen_tap_straight: 0.28, kitchen_tap_curved: 0.28,
  kitchen_wall_unit_600: 0.55, kitchen_wall_unit_1200: 0.85,
  bar_stool: 0.4, bar_stool_tall: 0.4,
  dining_table: 1.2, towel_heater: 0.45, external_extraction_fan: 0.35,
  // A 60mm bezel - anything like a normal ring would swallow the ceiling.
  spot_light: 0.16,
  canopy_spot: 0.16,
  hot_tub: 1.5,
  garden_steps: 0.8,
  garden_ramp: 1.2,
  wall_light_sconce: 0.3, wall_light_angled: 0.3, wall_light_box: 0.3, wall_light_slim: 0.3,
  pool_table: 1.35, arcade_machine: 0.55, wall_tv: 0.75, dart_board: 0.4,
};

/**
 * Clamp a world-space point into the room's interior (inside the walls, with
 * a small margin), respecting the room's position and rotation. Used so
 * interior objects can never be placed or dragged outside the building.
 */
export function clampToRoomInterior(room: Room, x: number, z: number, margin = 0.05, type?: ObjectType): { x: number; z: number } {
  // Against the bay's block the object's whole footprint counts, not just
  // its centre - see clampInZone. FOOTPRINT_RADIUS is generous (it is the
  // rotate ring), which errs on the side of nothing poking through a wall.
  const blockMargin = type ? (FOOTPRINT_RADIUS[type] ?? 0.5) : margin;
  const rx = (room.x ?? 0) / 1000;
  const rz = (room.z ?? 0) / 1000;
  const rot = room.rot ?? 0;
  const cos = Math.cos(-rot), sin = Math.sin(-rot);
  let lx = (x - rx) * cos - (z - rz) * sin;
  let lz = (x - rx) * sin + (z - rz) * cos;
  // The limit is the object's ZONE - the room, or the outdoor bay for the
  // things that belong there, with the bay's block kept out of the room's
  // zone (utils/bay). Without a type it is the room, which is what the
  // walkthrough camera wants.
  const zone = clampInZone(room, lx, lz, margin, type, blockMargin);
  lx = zone.lx;
  lz = zone.lz;
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
  if (room.shape === 'Gable') {
    const base = (room.baseHeightMm ?? 100) / 1000;
    const roof = (room.roofHeightMm ?? 200) / 1000;
    const eaves = (room.heightMm ?? 2050) / 1000 - base - roof + 0.025;
    return room.gableFlatCeiling
      ? Math.min(eaves, (room.gableCeilingHeightMm ?? 2400) / 1000)
      : eaves;
  }
  // A box room is only flat if both heights agree. backHeightMm defaults to
  // 2010 against a 2050 front, so MOST designs are quietly a mono-pitch, and
  // reading heightMm alone gives the high end - the safe answer is the low one.
  const front = (room.heightMm ?? 2050) / 1000;
  const back = (room.backHeightMm ?? room.heightMm ?? 2050) / 1000;
  return Math.min(front, back) - 0.02;
}

/**
 * Ceiling height above the finished floor AT A POINT, for things that have to
 * sit flush with it - a downlight in a sloping ceiling has to follow the
 * slope, not hang below its lowest corner.
 *
 * z runs front (+) to back (-) in room-local space, and x across the span.
 */
export function ceilingHeightAt(room: Room, x: number, z: number): number {
  if (room.shape === 'Gable') {
    const base = (room.baseHeightMm ?? 100) / 1000;
    const roof = (room.roofHeightMm ?? 200) / 1000;
    const fascia = Math.min(0.4, Math.max(0.05, (room.gableFasciaMm ?? 100) / 1000));
    const wallTop = (room.heightMm ?? 2050) / 1000 - base - roof + 0.025;
    const sideGable = room.gableOrientation === 'side';
    const spanHalf = ((sideGable ? room.depthMm : room.widthMm) / 1000) / 2;
    const u = sideGable ? z : x;
    const perp = Math.cos(Math.atan2(roof, Math.max(0.1, spanHalf)));
    // Mirrors the soffit line in RoomGeometry's gableCeiling.
    const slope = wallTop + roof * (1 - Math.min(1, Math.abs(u) / spanHalf))
      - 0.025 - (fascia / 2) / perp - 0.02;
    if (room.gableFlatCeiling) {
      return Math.min(slope, (room.gableCeilingHeightMm ?? 2400) / 1000);
    }
    return slope;
  }
  const front = (room.heightMm ?? 2050) / 1000;
  const back = (room.backHeightMm ?? room.heightMm ?? 2050) / 1000;
  const halfD = Math.max(0.1, (room.depthMm / 1000) / 2);
  const t = Math.max(-1, Math.min(1, z / halfD));
  return (front + back) / 2 + t * (front - back) / 2 - 0.02;
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

/**
 * Put a wall-mounted exterior fitting on the nearest OUTSIDE wall face.
 *
 * World in, world out. The candidates are the four outer faces of the
 * building and, with an outdoor section, the faces that look into it (the
 * divider, the end and back walls, the return wall of a corner bay); the
 * stretch of the front wall the bay has taken away is not a wall. The
 * fitting's back plate sits on the face and it is turned to point out
 * from it - its local -z is the back plate (modelRegistry WALL_LIGHT_TYPES).
 */
export function snapToOutsideWall(room: Room, x: number, z: number): { x: number; z: number; rot: number } {
  const rx = (room.x ?? 0) / 1000, rz = (room.z ?? 0) / 1000, rot = room.rot ?? 0;
  const cos = Math.cos(-rot), sin = Math.sin(-rot);
  const lx = (x - rx) * cos - (z - rz) * sin;
  const lz = (x - rx) * sin + (z - rz) * cos;
  const w = room.widthMm / 1000, d = room.depthMm / 1000;
  const wt = (room.wallThicknessMm ?? 150) / 1000;
  const bay = bayRange(room);
  const M = 0.15; // keep the fitting off the corners
  // A face: fixed coordinate, the span it runs over, which way it looks.
  // wall: whose doors and windows sit in this face, and where along it
  // their offsets are measured from (0 for the shell, the divider's
  // midpoint for the bay wall).
  type Face = { axis: 'x' | 'z'; at: number; lo: number; hi: number; out: 1 | -1; wall?: string; origin?: number };
  const faces: Face[] = [];
  // Front: the room's stretch only.
  if (bay) {
    const through = (room.bay?.screen ?? 'solid') !== 'solid';
    if (bay.side === 'left') faces.push({ axis: 'z', at: d / 2, lo: bay.x1 + wt, hi: w / 2, out: 1, wall: 'front' });
    else faces.push({ axis: 'z', at: d / 2, lo: -w / 2, hi: bay.x0 - wt, out: 1, wall: 'front' });
    // The bay's own faces.
    faces.push({ axis: 'x', at: bay.dividerX + (bay.side === 'left' ? -wt / 2 : wt / 2), lo: bay.z0, hi: d / 2, out: bay.side === 'left' ? -1 : 1, wall: 'bay', origin: (bay.z0 + d / 2) / 2 });
    if (!through) faces.push({ axis: 'x', at: bay.side === 'left' ? -w / 2 + wt : w / 2 - wt, lo: bay.z0, hi: d / 2, out: bay.side === 'left' ? 1 : -1 });
    if (bay.full) { if ((room.bay?.backWall ?? 'solid') === 'solid') faces.push({ axis: 'z', at: bay.z0, lo: bay.x0, hi: bay.x1, out: 1 }); }
    else faces.push({ axis: 'z', at: bay.returnZ + wt / 2, lo: bay.x0, hi: bay.x1, out: 1 });
  } else {
    faces.push({ axis: 'z', at: d / 2, lo: -w / 2, hi: w / 2, out: 1, wall: 'front' });
  }
  faces.push({ axis: 'z', at: -d / 2, lo: -w / 2, hi: w / 2, out: -1, wall: 'back' });
  faces.push({ axis: 'x', at: -w / 2, lo: -d / 2, hi: d / 2, out: -1, wall: 'left' });
  faces.push({ axis: 'x', at: w / 2, lo: -d / 2, hi: d / 2, out: 1, wall: 'right' });

  /**
   * Magnets along a face: the centre of every door and window in it, and
   * the middle of each blank stretch - between two openings, or between
   * an opening and the corner. A light centred over a door, or centred
   * between two, is what people are actually trying to do, and a 50mm
   * grid always left it a fraction off (Charlie, 11 Sep).
   */
  const magnets = (f: Face): number[] => {
    if (!f.wall) return [];
    const origin = f.origin ?? 0;
    const ops = [...(room.doors || []), ...(room.windows || [])]
      .filter(o => o.wall === f.wall && !openingRemovedByBay(room, bay, o))
      .map(o => ({ c: origin + (o.offsetMm ?? 0) / 1000, hw: o.widthMm / 2000 }))
      .filter(o => o.c > f.lo && o.c < f.hi)
      .sort((p, q) => p.c - q.c);
    const out: number[] = [];
    let edge = f.lo;
    for (const o of ops) {
      out.push((edge + (o.c - o.hw)) / 2, o.c);
      edge = o.c + o.hw;
    }
    out.push((edge + f.hi) / 2);
    return out;
  };
  const MAGNET = 0.12;

  let best: { dist: number; x: number; z: number; rot: number } | null = null;
  for (const f of faces) {
    if (f.hi - f.lo < M * 2 + 0.05) continue;
    const along = f.axis === 'z' ? lx : lz;
    let a = Math.max(f.lo + M, Math.min(f.hi - M, along));
    for (const m of magnets(f)) if (Math.abs(m - a) < MAGNET) { a = m; break; }
    const across = f.axis === 'z' ? lz : lx;
    const dist = Math.hypot(across - f.at, along - a);
    if (best && dist >= best.dist) continue;
    // Local -z is the back plate: turned so it faces INTO the wall.
    const r = f.axis === 'z' ? (f.out > 0 ? 0 : Math.PI) : (f.out > 0 ? Math.PI / 2 : -Math.PI / 2);
    best = f.axis === 'z' ? { dist, x: a, z: f.at, rot: r } : { dist, x: f.at, z: a, rot: r };
  }
  if (!best) return { x, z, rot: 0 };
  const c2 = Math.cos(rot), s2 = Math.sin(rot);
  return { x: rx + best.x * c2 - best.z * s2, z: rz + best.x * s2 + best.z * c2, rot: best.rot + rot };
}

/**
 * The canopy soffit - the roof's underside where it overhangs the front -
 * at a room-local z, relative to the top of the base. The same plane as the
 * ceiling, carried on past the front wall rather than clamped at it, so a
 * fitting recessed in the canopy sits flush however steep the fall.
 */
export function canopySoffitAt(room: Room, z: number): number {
  const d = Math.max(0.5, (room.depthMm || 4300) / 1000);
  if (room.shape === 'Gable') return ceilingHeightAt(room, 0, Math.min(z, d / 2));
  const front = (room.heightMm ?? 2050) / 1000;
  const back = (room.backHeightMm ?? room.heightMm ?? 2050) / 1000;
  const t = z / (d / 2);
  return (front + back) / 2 + t * (front - back) / 2 - 0.02;
}

/** Keeps a canopy fitting under the canopy: within the roof's side reach and
 *  between the front wall and the canopy's front edge, 120mm in from each. */
export function clampToCanopy(room: Room, x: number, z: number): { x: number; z: number } {
  const w = (room.widthMm || 8000) / 1000, d = (room.depthMm || 4300) / 1000;
  const ohFront = (room.hasCanopy || room.hasPictureFrame) ? (room.canopySizeMm ?? 0) / 1000 : 0;
  const ohL = (room.overhangLeftMm ?? 0) / 1000, ohR = (room.overhangRightMm ?? 0) / 1000;
  const m = 0.12;
  const cx = Math.max(-w / 2 - ohL + m, Math.min(w / 2 + ohR - m, x));
  // No canopy to speak of: hang at the front edge so the fitting is at
  // least visible, rather than vanishing into the wall.
  if (ohFront < 2 * m + 0.05) return { x: cx, z: d / 2 + m };
  return { x: cx, z: Math.max(d / 2 + m, Math.min(d / 2 + ohFront - m, z)) };
}

/**
 * The exterior light fittings, in words the render prompt can hold the
 * model to. The render kept restyling the wall lights - a slim box became
 * a lantern, one of two vanished, a black one came back grey - because the
 * prompt never mentioned them. Each fitting is described by its real shape
 * and size, its finish colour, which wall it is on and how high, so the
 * instruction can be: keep the fitting exactly as shown, change nothing but
 * the colour named.
 */
const WALL_LIGHT_WORDS: Record<string, string> = {
  wall_light_sconce: 'a cylindrical up/down wall lantern, about 90 mm diameter and 220 mm tall',
  wall_light_angled: 'an angled wedge wall light with a downward-facing lens, about 150 mm tall',
  wall_light_box: 'a small square box wall light, about 100 mm, with a diffuser on its face',
  wall_light_slim: 'a slim flat rectangular up/down wall light, 260 mm wide x 90 mm tall x 40 mm deep, with a plain flat face and thin LED slots on its top and bottom edges',
};
const FINISH_WORDS: [string, string][] = [
  ['#26262a', 'matte black'], ['#1f2123', 'black'], ['#cfd1d4', 'chrome'], ['#c8c9c7', 'brushed steel'],
  ['#c8a35f', 'brushed brass'], ['#d9b44a', 'polished brass'], ['#f2f2f2', 'powder-coated white'], ['#4a5057', 'anthracite grey'],
];
const finishWords = (hex?: string) => {
  if (!hex) return 'matte black';
  const h = hex.toLowerCase();
  const hit = FINISH_WORDS.find(([k]) => k === h);
  return hit ? hit[1] : `the colour ${h}`;
};
const wallName = (rot: number) => {
  const a = ((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (a < Math.PI / 4 || a > 7 * Math.PI / 4) return 'front';
  if (a < 3 * Math.PI / 4) return 'right-hand side';
  if (a < 5 * Math.PI / 4) return 'back';
  return 'left-hand side';
};

/** Placed objects that live OUTSIDE the room: not part of the interior. */
const EXTERIOR_TYPES = new Set<string>(['wall_light_sconce', 'wall_light_angled', 'wall_light_box', 'wall_light_slim', 'hot_tub', 'garden_steps', 'garden_ramp', 'aircon_outdoor', 'external_extraction_fan', 'canopy_spot']);

const INTERIOR_FLOOR_WORDS: Record<string, string> = {
  oak: 'oak plank flooring', walnut: 'walnut plank flooring', light_oak: 'pale oak plank flooring', grey_oak: 'grey-washed oak plank flooring',
  herringbone: 'herringbone parquet flooring', tiles: 'large-format tiled flooring', carpet: 'carpet', concrete: 'polished concrete floor', laminate: 'laminate plank flooring',
};

/**
 * What is INSIDE the building, for the render engine's inventory: the wall
 * colour, the floor, and every piece of furniture and fitting with its
 * colour, so what shows through the glazing is rendered as placed rather
 * than left out or invented (Charlie, 17 Sep: "it didn't include furniture").
 */
export function describeInterior(room: Room, objects: { type: string; color?: string }[]): { walls: string; floor: string; items: { label: string; count: number; color?: string }[] } {
  const counts = new Map<string, { label: string; count: number; color?: string }>();
  for (const o of objects) {
    if (EXTERIOR_TYPES.has(o.type)) continue;
    const label = (GLB_OBJECT_LABELS as Record<string, string>)[o.type] || o.type.replace(/_/g, ' ');
    const key = label + '|' + (o.color || '');
    const cur = counts.get(key);
    if (cur) cur.count++; else counts.set(key, { label, count: 1, color: o.color });
  }
  const floorKey = String((room as any).interiorFloorType || '');
  return {
    walls: `walls painted ${room.interiorColor || '#ffffff'}`,
    floor: INTERIOR_FLOOR_WORDS[floorKey] || (floorKey ? floorKey.replace(/_/g, ' ') + ' flooring' : 'timber plank flooring'),
    items: [...counts.values()].slice(0, 30),
  };
}

export function describeExteriorLights(room: Room, objects: { type: string; x: number; z: number; rot: number; color?: string; mountHeightMm?: number }[]): { count: number; text: string }[] {
  const out: { count: number; text: string }[] = [];
  const wall = objects.filter(o => WALL_LIGHT_WORDS[o.type]);
  const w = (room.widthMm || 8000) / 1000;
  for (const o of wall) {
    const h = o.mountHeightMm ?? 2200;
    const along = wallName(o.rot) === 'front' || wallName(o.rot) === 'back'
      ? `${Math.round((o.x + w / 2) * 1000)} mm from the building's left corner`
      : `${Math.round(((room.depthMm || 4300) / 2 - o.z) * 1000)} mm from the front corner`;
    out.push({ count: 1, text: `${WALL_LIGHT_WORDS[o.type]}, finished in ${finishWords(o.color)}, on the ${wallName(o.rot)} wall, its centre ${h} mm above the ground, ${along}` });
  }
  const spots = objects.filter(o => o.type === 'canopy_spot');
  if (spots.length) out.push({ count: spots.length, text: `${spots.length} small round recessed LED downlight${spots.length === 1 ? '' : 's'} flush in the canopy soffit, warm white, exactly where shown` });
  return out;
}
