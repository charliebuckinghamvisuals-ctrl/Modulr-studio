import { useMemo } from 'react';
import * as THREE from 'three';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { SceneObject } from '../../types';
import { NATIVE_WIDTH_MM, hasWorktop, worktopById } from '../../modelRegistry';
import { createWorktopMaterial } from '../../utils/materialFixes';
import { createWorldScaleBoxGeometry } from '../../utils/geometry';
import { roomLocal } from '../../utils/placement';

/**
 * ONE worktop per run of cabinets, instead of one per cabinet.
 *
 * Every unit model ships with its own 30mm top. Pushed together, those tops
 * meet in a visible seam and - because a worktop overhangs its carcass - they
 * clip into each other, which is what made a run of units look wrong. Real
 * worktop is a single slab cut to length over however many units sit beneath.
 *
 * So the per-unit tops are hidden in the scene (see applyModelMaterials's
 * hideWorktop flag - the picker thumbnails keep theirs, since a topless
 * cabinet is not what a customer is choosing) and this component lays a
 * continuous slab over each run.
 *
 * A "run" is a set of units at the same rotation, on the same line, ACTUALLY
 * TOUCHING. Units at another angle or across the room form their own runs,
 * so an L-shaped kitchen or an island gets its own slab.
 */

// From the models themselves: the top sits 870-900mm above the unit's base
// and is 640mm deep, overhanging the 620mm carcass at the front.
const TOP_Y = 0.87;
const THICKNESS = 0.03;
const DEPTH = 0.64;
// The sink bowl drops through a 700 x 450 hole in the middle of its unit.
const SINK_HOLE_W = 0.70;
const SINK_HOLE_D = 0.45;
/**
 * Units closer than this along a run are treated as touching.
 *
 * This was 60mm, which meant a unit parked one 50mm grid cell short of its
 * neighbour still got a continuous slab laid over the gap - so it LOOKED
 * joined when it was not, and nothing on screen told you the difference.
 * Now it is a hair over zero: the slab only bridges units that really meet,
 * so a gap in the worktop IS the signal that a unit has not snapped. The
 * drag code (SceneObjects) magnetises units flush so that snap is easy to hit.
 */
const JOIN_GAP = 0.012;
// How far off the line a unit can sit and still be part of the same run.
const LINE_TOLERANCE = 0.15;

/**
 * Upstand: a 100mm strip standing on the back edge of the worktop where the
 * run meets a wall. Standard on fitted kitchens - it closes the joint between
 * worktop and wall - and absent on an island, which has no wall to meet.
 */
const UPSTAND_H = 0.10;
const UPSTAND_T = 0.018;
// The run's back edge must be this close to an inside wall face to get one.
const WALL_REACH = 0.08;

type Seg = { cx: number; cz: number; w: number; d: number };

const unitWidth = (o: SceneObject) =>
  (o.widthMm ?? NATIVE_WIDTH_MM[o.type] ?? 600) / 1000;

/** Slab pieces for one run, routed around any sink holes. */
function segmentsFor(runLength: number, holes: { cx: number; w: number }[]): Seg[] {
  const half = runLength / 2;
  const segs: Seg[] = [];
  const sorted = [...holes].sort((a, b) => a.cx - b.cx);
  let cursor = -half;
  const backD = (DEPTH - SINK_HOLE_D) / 2;
  for (const h of sorted) {
    const x0 = h.cx - h.w / 2, x1 = h.cx + h.w / 2;
    // Full-depth slab up to the hole.
    if (x0 - cursor > 0.001) segs.push({ cx: (cursor + x0) / 2, cz: 0, w: x0 - cursor, d: DEPTH });
    // Narrow strips behind and in front of the bowl.
    segs.push({ cx: h.cx, cz: -(DEPTH / 2) + backD / 2, w: h.w, d: backD });
    segs.push({ cx: h.cx, cz: (DEPTH / 2) - backD / 2, w: h.w, d: backD });
    cursor = x1;
  }
  if (half - cursor > 0.001) segs.push({ cx: (cursor + half) / 2, cz: 0, w: half - cursor, d: DEPTH });
  return segs;
}

export function WorktopRuns() {
  const { objects, room } = useStore(useShallow(s => ({ objects: s.scene.objects, room: s.scene.room })));

  const material = useMemo(
    () => createWorktopMaterial(worktopById(room.worktopMaterial)),
    [room.worktopMaterial],
  );

  const runs = useMemo(() => {
    const units = objects.filter(o => hasWorktop(o.type));
    if (!units.length) return [];

    // Same angle first - a return leg or an island is its own run.
    const byAngle = new Map<string, SceneObject[]>();
    units.forEach(o => {
      const key = (Math.round((o.rot ?? 0) * 180 / Math.PI) % 360 + 360) % 360 + '';
      (byAngle.get(key) ?? byAngle.set(key, []).get(key)!).push(o);
    });

    const out: { pos: [number, number, number]; rot: number; length: number; segs: Seg[]; upstand: boolean; ownerId: string }[] = [];
    const Y = new THREE.Vector3(0, 1, 0);

    byAngle.forEach(group => {
      const rot = group[0].rot ?? 0;
      const dir = new THREE.Vector3(1, 0, 0).applyAxisAngle(Y, rot);
      const perp = new THREE.Vector3(0, 0, 1).applyAxisAngle(Y, rot);
      const origin = new THREE.Vector3(group[0].x, 0, group[0].z);

      // Project every unit onto the run's own axes: t along it, s across it.
      const placed = group.map(o => {
        const v = new THREE.Vector3(o.x, 0, o.z).sub(origin);
        return { o, t: v.dot(dir), s: v.dot(perp), w: unitWidth(o) };
      }).sort((a, b) => a.t - b.t);

      // Split into lines, then into touching stretches within each line.
      const lines: (typeof placed)[] = [];
      placed.forEach(p => {
        const line = lines.find(l => Math.abs(l[0].s - p.s) < LINE_TOLERANCE);
        if (line) line.push(p); else lines.push([p]);
      });

      lines.forEach(line => {
        let current: typeof line = [];
        const flush = () => {
          if (!current.length) return;
          const start = current[0].t - current[0].w / 2;
          const end = current[current.length - 1].t + current[current.length - 1].w / 2;
          const length = end - start;
          const midT = (start + end) / 2;
          const s = current[0].s;
          const holes = current
            .filter(p => p.o.type.startsWith('kitchen_sink'))
            .map(p => ({ cx: p.t - midT, w: SINK_HOLE_W }));
          const centre = origin.clone().addScaledVector(dir, midT).addScaledVector(perp, s);

          // Does the back edge of this run meet an inside wall face? Units
          // face +z locally, so the back edge is a half-depth behind the
          // centre along -perp. Checked in room space so a rotated room or a
          // return leg against the side wall both count.
          const back = centre.clone().addScaledVector(perp, -DEPTH / 2);
          const rl = roomLocal(room, back.x, back.z);
          const upstand =
            (rl.hx - Math.abs(rl.lx)) < WALL_REACH ||
            (rl.hz - Math.abs(rl.lz)) < WALL_REACH;

          // The run answers to one of its own units, so clicking the worktop
          // in the walkthrough opens that unit's finishes rather than falling
          // through to whatever is behind it.
          out.push({ pos: [centre.x, 0, centre.z], rot, length, segs: segmentsFor(length, holes), upstand, ownerId: current[0].o.id });
          current = [];
        };
        line.forEach(p => {
          if (!current.length) { current = [p]; return; }
          const prev = current[current.length - 1];
          const gap = (p.t - p.w / 2) - (prev.t + prev.w / 2);
          if (gap <= JOIN_GAP) current.push(p); else { flush(); current = [p]; }
        });
        flush();
      });
    });

    return out;
  }, [objects, room]);

  // Interior objects stand on the finished floor, and so does the worktop.
  // Matches SceneObjects: the floor slab's TOP face, not its centre.
  const baseH = ((room.baseHeightMm ?? 100) / 1000) + 0.01;

  return (
    <group>
      {runs.map((run, i) => (
        <group key={i} userData={{ objectId: run.ownerId }} position={[run.pos[0], baseH, run.pos[2]]} rotation={[0, run.rot, 0]}>
          {run.segs.map((seg, j) => (
            <SlabPiece key={j} seg={seg} material={material} y={TOP_Y + THICKNESS / 2} />
          ))}
          {run.upstand && <Upstand length={run.length} material={material} />}
        </group>
      ))}
    </group>
  );
}

function SlabPiece({ seg, material, y }: { seg: Seg; material: THREE.Material; y: number }) {
  // World-scale UVs, so the veining is the same physical size on every piece
  // and reads as one slab across the joins rather than restarting per piece.
  const geom = useMemo(
    () => createWorldScaleBoxGeometry(seg.w, THICKNESS, seg.d, false, seg.cx, 0, seg.cz),
    [seg.w, seg.d, seg.cx, seg.cz],
  );
  return (
    <mesh position={[seg.cx, y, seg.cz]} geometry={geom} material={material} castShadow receiveShadow />
  );
}

/** One continuous strip along the whole run's back edge, sink or no sink -
 *  an upstand does not stop for the bowl, the bowl sits in front of it. */
function Upstand({ length, material }: { length: number; material: THREE.Material }) {
  const cz = -DEPTH / 2 + UPSTAND_T / 2;
  const geom = useMemo(
    () => createWorldScaleBoxGeometry(length, UPSTAND_H, UPSTAND_T, false, 0, 0, cz),
    [length, cz],
  );
  return (
    <mesh position={[0, TOP_Y + THICKNESS + UPSTAND_H / 2, cz]} geometry={geom} material={material} castShadow receiveShadow />
  );
}
