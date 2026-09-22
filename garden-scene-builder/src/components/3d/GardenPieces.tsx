import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { SceneObject } from '../../types';
import { useStore } from '../../store';
import { useDeckMaterial, resolveDeckKey, deckTone } from './Decks';

/**
 * Procedural garden access pieces: steps and a ramp. Both are sized by the
 * object's width, run along local z with the LOW end at +z (the object's
 * front, like a unit's), and climb to riseMm at -z. Surface is concrete
 * (cast, pale, a lighter nosing) or any decking material, boards across.
 *
 * Kept procedural rather than modelled so the width, length and rise are
 * free - a ramp has to hit the deck height the client actually has.
 */

const CONCRETE = '#b8b4ad';
const NOSING = '#c9c5bd';

/** A concrete surface, or the decking one; the deck material hook is
 *  always called so the hook order is stable across surface changes. */
function useSurface(surface: string | undefined) {
  const decked = !!surface && surface !== 'concrete';
  const room = useStore(s => s.scene.room);
  const deck = useDeckMaterial(decked ? surface : undefined);
  const tone = decked ? deckTone(resolveDeckKey(surface, room), room.deckingTint) : CONCRETE;
  const concrete = useMemo(() => new THREE.MeshStandardMaterial({ color: CONCRETE, roughness: 0.95, metalness: 0 }), []);
  const fascia = useMemo(() => new THREE.MeshStandardMaterial({ color: tone, roughness: 0.9, metalness: 0 }), [tone]);
  return { decked, top: decked ? deck : concrete, side: fascia };
}

/**
 * The wedge: a sloped top from (y=0, z=+L/2) up to (y=rise, z=-L/2), a
 * vertical back, two triangular sides. Top UVs are metres across and along
 * so the boards keep world scale like the decks.
 */
function rampGeometry(w: number, L: number, rise: number): THREE.BufferGeometry {
  const hw = w / 2, hl = L / 2;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const v = (x: number, y: number, z: number, u: number, t: number) => { pos.push(x, y, z); uv.push(u, t); return pos.length / 3 - 1; };
  const slope = Math.hypot(L, rise);
  // Top (group 0): low edge at +z, high edge at -z.
  const a = v(-hw, 0, hl, -hw, 0), b = v(hw, 0, hl, hw, 0), c = v(hw, rise, -hl, hw, slope), d = v(-hw, rise, -hl, -hw, slope);
  idx.push(a, b, c, a, c, d);
  const topCount = idx.length;
  // Back (vertical, at -z), facing -z.
  const e = v(-hw, 0, -hl, -hw, 0), f = v(hw, 0, -hl, hw, 0), g = v(hw, rise, -hl, hw, rise), h = v(-hw, rise, -hl, -hw, rise);
  idx.push(e, g, f, e, h, g);
  // Sides (triangles), facing outward.
  const l0 = v(-hw, 0, hl, hl, 0), l1 = v(-hw, 0, -hl, -hl, 0), l2 = v(-hw, rise, -hl, -hl, rise);
  idx.push(l0, l2, l1);
  const r0 = v(hw, 0, hl, hl, 0), r1 = v(hw, 0, -hl, -hl, 0), r2 = v(hw, rise, -hl, -hl, rise);
  idx.push(r0, r1, r2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.addGroup(0, topCount, 0);
  geo.addGroup(topCount, idx.length - topCount, 1);
  geo.computeVertexNormals();
  return geo;
}

export function GardenRamp({ obj }: { obj: SceneObject }) {
  const w = (obj.widthMm ?? 1200) / 1000;
  const L = Math.max(0.3, (obj.depthMm ?? 1800) / 1000);
  const rise = Math.max(0.02, (obj.riseMm ?? 300) / 1000);
  const { top, side } = useSurface(obj.surface);
  const geo = useMemo(() => rampGeometry(w, L, rise), [w, L, rise]);
  useEffect(() => () => geo.dispose(), [geo]);
  // Just the wedge - a modelled ramp with its own kerbs and edging is coming.
  return <mesh geometry={geo} material={[top, side]} castShadow receiveShadow />;
}

/**
 * Steps: 150 rise x 300 going, as many as the rise needs (450 = three),
 * climbing towards -z. Each tread is a full-height block so there is no
 * hollow underneath from any angle.
 */
export function GardenSteps({ obj }: { obj: SceneObject }) {
  const w = (obj.widthMm ?? 1200) / 1000;
  const riseEach = 0.15, going = 0.3;
  const n = Math.max(1, Math.min(12, Math.round((obj.riseMm ?? 450) / 150)));
  const { decked, top, side } = useSurface(obj.surface);
  // Treads as extruded boxes with the deck material on the top face only.
  const mats = useMemo(() => [side, side, top, side, side, side], [top, side]);
  return (
    <group>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={[0, (riseEach * (i + 1)) / 2, going * (n - 1) / 2 - i * going]} material={mats} castShadow receiveShadow>
          <boxGeometry args={[w, riseEach * (i + 1), going]} />
        </mesh>
      ))}
      {!decked && Array.from({ length: n }, (_, i) => (
        <mesh key={`n${i}`} position={[0, riseEach * (i + 1) - 0.006, going * (n - 1) / 2 - i * going + going / 2 - 0.015]} receiveShadow>
          <boxGeometry args={[w, 0.012, 0.03]} />
          <meshStandardMaterial color={NOSING} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
