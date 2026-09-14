import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { Room } from '../../types';
import type { BayRange } from '../../utils/bay';
import { useRealMaterial, resolveDeckingKey } from '../../utils/materials';
import { createWorldScaleBoxGeometry } from '../../utils/geometry';
import { createDeckingGeometry } from '../../utils/geometryUtils';
import { Geometry, Base, Subtraction } from './SafeCsg';

type Tex = ReturnType<typeof useRealMaterial>;

/**
 * A wall box whose TOP follows the ceiling: flat on a flat roof, sloping
 * on a mono-pitch. Six faces in the same group order as a box (+x, -x,
 * +y, -y, +z, -z) with world-scale UVs in metres, so the shell's cladding
 * materials read the same on it. width along x, depth along z, centred on
 * (cx, cz) at the floor; topAt gives the top height at a world z.
 */
function slopedWallGeometry(width: number, depth: number, cx: number, cz: number, topAt: (z: number) => number, isVertical: boolean) {
  const x0 = cx - width / 2, x1 = cx + width / 2;
  const z0 = cz - depth / 2, z1 = cz + depth / 2;
  const tz0 = topAt(z0), tz1 = topAt(z1);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[], uvOf: (p: number[]) => [number, number], mi: number) => {
    const start = idx.length;
    const base = pos.length / 3;
    for (const p of [a, b, c, d]) {
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0], n[1], n[2]);
      const [u, v] = uvOf(p);
      uv.push(u, v);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    groups.push({ start, count: 6, materialIndex: mi });
  };
  // Vertical faces: u along the wall, v up. Horizontal: u along x, v along z.
  const uvX = (p: number[]): [number, number] => (isVertical ? [p[1], p[2]] : [p[2], p[1]]);
  const uvZ = (p: number[]): [number, number] => (isVertical ? [p[1], p[0]] : [p[0], p[1]]);
  const uvY = (p: number[]): [number, number] => [p[0], p[2]];
  // +x
  quad([x1, 0, z1], [x1, 0, z0], [x1, tz0, z0], [x1, tz1, z1], [1, 0, 0], uvX, 0);
  // -x
  quad([x0, 0, z0], [x0, 0, z1], [x0, tz1, z1], [x0, tz0, z0], [-1, 0, 0], uvX, 1);
  // +y (top, sloped)
  quad([x0, tz1, z1], [x1, tz1, z1], [x1, tz0, z0], [x0, tz0, z0], [0, 1, 0], uvY, 2);
  // -y
  quad([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [0, -1, 0], uvY, 3);
  // +z
  quad([x0, 0, z1], [x1, 0, z1], [x1, tz1, z1], [x0, tz1, z1], [0, 0, 1], uvZ, 4);
  // -z
  quad([x1, 0, z0], [x0, 0, z0], [x0, tz0, z0], [x1, tz0, z0], [0, 0, -1], uvZ, 5);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  groups.forEach(gr => g.addGroup(gr.start, gr.count, gr.materialIndex));
  // Centre on the floor at (cx, 0, cz): the mesh is positioned there.
  g.translate(-cx, 0, -cz);
  return g;
}

/**
 * Everything that stands IN the outdoor section - see utils/bay.
 *
 * The shell (RoomGeometry) has had its front wall cut away over the bay,
 * and its end or back wall too where those are screens or open. This
 * builds what the bay then needs, outside the boolean: the DIVIDING wall
 * between bay and room (the bay's finish on one face, the room's paper on
 * the other), the RETURN wall closing a corner bay, the bay's finish laid
 * over the inside faces of the walls it keeps, slatted or glass screens
 * where a wall is gone, a deck or porcelain floor, the lined soffit with
 * its downlights, and the post carrying the roof at the open corner.
 *
 * Coordinates are the room's, inside the group already lifted by the
 * plinth height: y = 0 is the finished floor, +z the front.
 */
export function BayParts({ room, bay, w, d, h, wallThickness, frameColorHex, roofColorHex, paper, texFront, texBack, texLeft, texRight, texRoof, isVertical, isNight, isPlanView, ceilingY, pitch }: {
  room: Room; bay: BayRange; w: number; d: number; h: number; wallThickness: number;
  frameColorHex: string; roofColorHex: string; paper: Record<string, unknown>;
  texFront: Tex; texBack: Tex; texLeft: Tex; texRight: Tex; texRoof: Tex; isVertical: boolean; isNight: boolean; isPlanView: boolean;
  /** The ceiling's centre height at z = 0, and its pitch about x (positive
   *  when the back is higher) - a mono-pitch ceiling slopes, and the bay's
   *  soffit and wall tops have to follow it. */
  ceilingY: number; pitch: number;
}) {
  // Ceiling height at a world z, on the slab's underside.
  const ceilAt = (z: number) => ceilingY - 0.005 - z * Math.tan(pitch);
  // Wall tops run 20mm up into the ceiling slab, so nothing is coplanar.
  const wallTop = (z: number) => ceilAt(z) + 0.02;
  const cfg = room.bay!;
  const left = bay.side === 'left';
  const wt = wallThickness;
  const screen = cfg.screen ?? 'solid';
  const backWall = bay.full ? (cfg.backWall ?? 'solid') : 'solid';
  const finish = cfg.wallFinish ?? 'match';
  const soffit = cfg.soffit ?? 'roof';
  const floor = cfg.floor ?? 'decking';
  const lights = Math.max(0, Math.min(4, cfg.lights ?? 3));
  const post = cfg.post ?? 'frame';
  const timber = '#9a7a52';
  const slatColour = cfg.slatColour ?? timber;

  const bayW = bay.width;
  const cx = (bay.x0 + bay.x1) / 2;
  // Bay runs from its back limit to the building's front face.
  const len = d / 2 - bay.z0;
  const cz = (bay.z0 + d / 2) / 2;
  const innerEndX = left ? -(w / 2 - wt) : (w / 2 - wt);
  const skin = 0.006;

  /*
   * The floor runs to wherever the bay actually ends. With the end wall
   * kept, that is its inner face; with the end a screen or open, the deck
   * runs out to the building's outer face, under the post and the slats -
   * a deck that stopped short of the edge left a strip of bare plinth
   * round it (Charlie, 10 Sep). The same at the back when that is open.
   */
  const fx0 = left ? (screen === 'solid' ? bay.x0 : -w / 2) : bay.x0;
  const fx1 = left ? bay.x1 : (screen === 'solid' ? bay.x1 : w / 2);
  const fz0 = bay.full && backWall === 'open' ? -d / 2 : bay.z0;
  const fz1 = d / 2;
  const floorW = fx1 - fx0, floorL = fz1 - fz0;
  const fcx = (fx0 + fx1) / 2, fcz = (fz0 + fz1) / 2;

  // The finishes. Hooks run unconditionally, so every option's texture is
  // loaded; only the one in use is drawn.
  const wallTex = useRealMaterial(finish === 'cladding' && cfg.wallCladding ? cfg.wallCladding : (room.cladding || 'timber'), bayW, h, 0);
  const deckTex = useRealMaterial(resolveDeckingKey((cfg.deckingMaterial as any) ?? room.deckingMaterial, room.cladding), floorW, floorL, 0);
  const porcelainTex = useRealMaterial('concrete', floorW, floorL, 0);
  const deckGeom = useMemo(() => createDeckingGeometry(floorW, floorL), [floorW, floorL]);

  const claddingMat = (tex: Tex, key: string, attach?: string) => (
    <meshStandardMaterial key={key} attach={attach} color="#ffffff" metalness={0.1} {...tex} bumpScale={0.1} />
  );
  const paperMat = (key: string, attach?: string) => (
    <meshStandardMaterial key={key} attach={attach} {...paper} color={room.interiorColor || '#ffffff'} />
  );
  /** A bay-facing wall surface: the elevation's own cladding, the chosen
   *  cladding, or painted render. */
  const wallMat = (own: Tex, key: string, attach?: string) => {
    if (finish === 'render') return <meshStandardMaterial key={key} attach={attach} color={cfg.wallColour ?? '#e8e4dc'} roughness={0.85} metalness={0} />;
    if (finish === 'cladding') return claddingMat(wallTex, key, attach);
    return claddingMat(own, key, attach);
  };
  const postColour = post === 'timber' ? timber : post === 'black' ? '#1b1c1e' : post === 'white' ? '#f2f2f0' : frameColorHex;

  // Slats: 45mm square at 90mm centres, the way a timber screen is built.
  const slatsAlong = (from: number, to: number) => {
    const out: number[] = [];
    for (let v = from + 0.06; v < to - 0.06; v += 0.09) out.push(v);
    return out;
  };
  // Doors set in the divider, and the divider itself - memoised, because a
  // fresh geometry every render would tear the boolean down each frame.
  const bayDoors = (room.doors || []).filter(dr => dr.wall === 'bay');
  const bayWindows = (room.windows || []).filter(wn => wn.wall === 'bay');
  const dividerGeom = useMemo(
    () => slopedWallGeometry(wt, len, bay.dividerX, cz, wallTop, isVertical),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wt, len, bay.dividerX, cz, ceilingY, pitch, isVertical],
  );
  const dividerMats = [
    left ? paperMat('div-0', 'material-0') : wallMat(texFront, 'div-0', 'material-0'),
    left ? wallMat(texFront, 'div-1', 'material-1') : paperMat('div-1', 'material-1'),
    paperMat('div-2', 'material-2'),
    paperMat('div-3', 'material-3'),
    claddingMat(texFront, 'div-4', 'material-4'),
    paperMat('div-5', 'material-5'),
  ];

  const endSlats = screen === 'slatted' ? slatsAlong(bay.z0, d / 2 - 0.06) : [];
  const backSlats = backWall === 'slatted' ? slatsAlong(bay.x0, bay.x1) : [];
  const soffitSlats = soffit === 'slats' ? (() => { const o: number[] = []; for (let x = bay.x0 + 0.05; x < bay.x1 - 0.03; x += 0.1) o.push(x); return o; })() : [];

  return (
    <group>
      {/* Dividing wall. Box face order: +x, -x, +y, -y, +z, -z. With the bay
          on the LEFT its face is -x. The +z end shows outside, so it is the
          front elevation's cladding either way. Doors set in it (Door.wall
          'bay') are cut out here, with the same boolean the shell uses;
          the geometry is memoised so the boolean only re-runs when the
          wall or its doors actually change. */}
      {bayDoors.length || bayWindows.length ? (
        <mesh position={[bay.dividerX, 0, cz]} castShadow receiveShadow userData={{ openingId: 'bay-divider' }}>
          <Geometry useGroups>
            <Base>
              <primitive object={dividerGeom} attach="geometry" />
              {dividerMats}
            </Base>
            {bayDoors.map(dr => (
              <Subtraction key={dr.id} position={[0, dr.heightMm / 2000 - 0.05, dr.offsetMm / 1000]}>
                <boxGeometry args={[wt * 3, dr.heightMm / 1000 + 0.1, dr.widthMm / 1000]} />
                {paperMat('cut-' + dr.id)}
              </Subtraction>
            ))}
            {/* Windows in the divider, cut like the shell cuts its own: a
                window on the floor is cut a little below it so no cut face
                lies level with the floor and flickers. */}
            {bayWindows.map(wn => {
              const sill = (wn.sillMm ?? 0) / 1000, winH = wn.heightMm / 1000;
              const below = sill < 0.001 ? 0.1 : 0;
              return (
                <Subtraction key={wn.id} position={[0, sill + winH / 2 - below / 2, (wn.offsetMm ?? 0) / 1000]}>
                  <boxGeometry args={[wt * 3, winH + below, wn.widthMm / 1000]} />
                  {paperMat('cut-' + wn.id)}
                </Subtraction>
              );
            })}
          </Geometry>
        </mesh>
      ) : (
        <mesh position={[bay.dividerX, 0, cz]} castShadow receiveShadow userData={{ openingId: 'bay-divider' }}>
          <primitive object={dividerGeom} attach="geometry" />
          {dividerMats}
        </mesh>
      )}

      {/* Return wall closing a corner bay: bay finish on its +z face, the
          room's paper behind. Runs end wall to divider. */}
      {!bay.full && (
        <mesh position={[cx, 0, bay.returnZ]} castShadow receiveShadow>
          <primitive object={slopedWallGeometry(bayW + wt, wt, cx, bay.returnZ, wallTop, isVertical)} attach="geometry" />
          {paperMat('ret-0', 'material-0')}
          {paperMat('ret-1', 'material-1')}
          {paperMat('ret-2', 'material-2')}
          {paperMat('ret-3', 'material-3')}
          {wallMat(texBack, 'ret-4', 'material-4')}
          {paperMat('ret-5', 'material-5')}
        </mesh>
      )}

      {/* The bay's finish over the inside of the back wall, when the bay
          reaches it and keeps it. */}
      {bay.full && backWall === 'solid' && (
        <mesh position={[cx, 0, bay.z0 + skin / 2]} receiveShadow>
          <primitive object={slopedWallGeometry(bayW, skin, cx, bay.z0 + skin / 2, wallTop, isVertical)} attach="geometry" />
          {[0, 1, 2, 3, 4, 5].map(i => wallMat(texBack, `bay-back-${i}`, `material-${i}`))}
        </mesh>
      )}
      {/* ...and over the inside of the end wall, when it is kept. */}
      {screen === 'solid' && (
        <mesh position={[innerEndX + (left ? skin / 2 : -skin / 2), 0, cz]} receiveShadow>
          <primitive object={slopedWallGeometry(skin, len, innerEndX + (left ? skin / 2 : -skin / 2), cz, wallTop, isVertical)} attach="geometry" />
          {[0, 1, 2, 3, 4, 5].map(i => wallMat(left ? texLeft : texRight, `bay-end-${i}`, `material-${i}`))}
        </mesh>
      )}

      {/* Slatted screens where a wall has gone. */}
      {endSlats.map((z, i) => (
        <mesh key={`es-${i}`} position={[left ? -w / 2 + wt / 2 : w / 2 - wt / 2, wallTop(z) / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[0.045, wallTop(z), 0.045]} />
          <meshStandardMaterial color={slatColour} roughness={0.8} />
        </mesh>
      ))}
      {backSlats.map((x, i) => (
        <mesh key={`bs-${i}`} position={[x, wallTop(-d / 2 + wt / 2) / 2, -d / 2 + wt / 2]} castShadow receiveShadow>
          <boxGeometry args={[0.045, wallTop(-d / 2 + wt / 2), 0.045]} />
          <meshStandardMaterial color={slatColour} roughness={0.8} />
        </mesh>
      ))}

      {/* Frameless glass screen on the end: a pane in slim channels, its top
          following the ceiling. */}
      {screen === 'glass' && (
        <group position={[left ? -w / 2 + wt / 2 : w / 2 - wt / 2, 0, cz]}>
          <mesh>
            <primitive object={slopedWallGeometry(0.012, len - 0.1, 0, 0, (z) => ceilAt(z + cz) - 0.05, false)} attach="geometry" />
            {[0, 1, 2, 3, 4, 5].map(i => <meshPhysicalMaterial key={`gl-${i}`} attach={`material-${i}`} color="#b9cdd8" transparent opacity={0.28} depthWrite={false} roughness={0.05} metalness={0} clearcoat={1} clearcoatRoughness={0.05} />)}
          </mesh>
          <mesh position={[0, 0.025, 0]} castShadow><boxGeometry args={[0.05, 0.05, len]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
          <mesh position={[0, ceilAt(cz) - 0.03, 0]} rotation={[pitch, 0, 0]} castShadow><boxGeometry args={[0.05, 0.05, len / Math.cos(pitch)]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
        </group>
      )}

      {/* The floor. */}
      {floor === 'decking' && (
        <mesh position={[fcx, 0.0165, fcz]} receiveShadow userData={{ isFloor: true }}>
          <primitive object={deckGeom} attach="geometry" />
          <meshStandardMaterial color={deckTex.color} map={deckTex.map} roughnessMap={deckTex.roughnessMap} normalMap={deckTex.normalMap} aoMap={deckTex.aoMap} />
        </mesh>
      )}
      {floor === 'porcelain' && (
        <mesh position={[fcx, 0.01, fcz]} receiveShadow userData={{ isFloor: true }}>
          <boxGeometry args={[floorW, 0.02, floorL]} />
          <meshStandardMaterial color={cfg.floorColour ?? '#d8d6d0'} map={porcelainTex.map} roughness={0.5} metalness={0.02} />
        </mesh>
      )}

      {/* The soffit: the underside of the roof in its own material (the
          default - an outdoor section is not a painted room), or a lined
          panel: white, clad, or timber slats on a dark backing. Covers the
          room's papered ceiling, which runs on over the bay. Sized like the
          floor, so it reaches the outer face where the walls are gone. */}
      {!isPlanView && (
        // In the ceiling's own frame: turned to its pitch, hung just under
        // it, and the panel stretched along the slope.
        <group position={[fcx, ceilAt(0) - 0.011, 0]} rotation={[pitch, 0, 0]}>
        <group position={[0, 0, fcz / Math.cos(pitch)]}>
          <mesh receiveShadow>
            <primitive object={createWorldScaleBoxGeometry(floorW, 0.012, floorL / Math.cos(pitch), false, fcx, 0, fcz, isVertical)} attach="geometry" />
            {soffit === 'cladding'
              ? claddingMat(finish === 'cladding' ? wallTex : texFront, 'soffit')
              : soffit === 'slats'
                ? <meshStandardMaterial color="#26282a" roughness={0.9} />
                : soffit === 'white'
                  ? paperMat('soffit')
                  : <meshStandardMaterial {...texRoof} color={roofColorHex} roughness={0.85} metalness={0.05} />}
          </mesh>
          {soffitSlats.map((x, i) => (
            <mesh key={`ss-${i}`} position={[x - fcx, -0.026, 0]} castShadow>
              <boxGeometry args={[0.04, 0.04, floorL / Math.cos(pitch) - 0.02]} />
              <meshStandardMaterial color={slatColour} roughness={0.8} />
            </mesh>
          ))}
          {/* Downlights in the soffit, lit - in the same frame, so they sit
              flush with a sloping ceiling too. */}
          {Array.from({ length: lights }).map((_, i) => (
            <mesh key={`bay-spot-${i}`} position={[bay.x0 + bayW * (i + 0.5) / lights - fcx, soffit === 'slats' ? -0.05 : -0.009, (cz - fcz) / Math.cos(pitch)]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.045, 0.045, 0.004, 24]} />
              <meshStandardMaterial color="#fff4e0" emissive="#ffe8c4" emissiveIntensity={isNight ? 2.5 : 1.2} toneMapped={false} />
            </mesh>
          ))}
        </group>
        </group>
      )}

      {/* Corner post at the open front corner, carrying the roof. */}
      {post !== 'none' && (
        <mesh position={[left ? -w / 2 + 0.05 : w / 2 - 0.05, (wallTop(d / 2 - 0.05) + 0.03) / 2, d / 2 - 0.05]} castShadow receiveShadow>
          <boxGeometry args={[0.1, wallTop(d / 2 - 0.05) + 0.03, 0.1]} />
          <meshStandardMaterial color={postColour} roughness={post === 'timber' ? 0.8 : 0.4} metalness={post === 'timber' ? 0 : 0.5} />
        </mesh>
      )}
      {/* A back corner post too when the back is open - something has to
          hold that corner of the roof up. */}
      {bay.full && backWall === 'open' && (
        <mesh position={[left ? -w / 2 + 0.05 : w / 2 - 0.05, (wallTop(-d / 2 + 0.05) + 0.03) / 2, -d / 2 + 0.05]} castShadow receiveShadow>
          <boxGeometry args={[0.1, wallTop(-d / 2 + 0.05) + 0.03, 0.1]} />
          <meshStandardMaterial color={postColour} roughness={post === 'timber' ? 0.8 : 0.4} metalness={post === 'timber' ? 0 : 0.5} />
        </mesh>
      )}
    </group>
  );
}
