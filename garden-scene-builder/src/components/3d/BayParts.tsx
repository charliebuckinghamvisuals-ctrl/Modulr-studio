import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { Room } from '../../types';
import type { BayRange } from '../../utils/bay';
import { useRealMaterial, resolveDeckingKey } from '../../utils/materials';
import { createWorldScaleBoxGeometry } from '../../utils/geometry';
import { createDeckingGeometry } from '../../utils/geometryUtils';

type Tex = ReturnType<typeof useRealMaterial>;

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
export function BayParts({ room, bay, w, d, h, wallThickness, frameColorHex, roofColorHex, paper, texFront, texBack, texLeft, texRight, texRoof, isVertical, isNight, isPlanView }: {
  room: Room; bay: BayRange; w: number; d: number; h: number; wallThickness: number;
  frameColorHex: string; roofColorHex: string; paper: Record<string, unknown>;
  texFront: Tex; texBack: Tex; texLeft: Tex; texRight: Tex; texRoof: Tex; isVertical: boolean; isNight: boolean; isPlanView: boolean;
}) {
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
  const endSlats = screen === 'slatted' ? slatsAlong(bay.z0, d / 2 - 0.06) : [];
  const backSlats = backWall === 'slatted' ? slatsAlong(bay.x0, bay.x1) : [];
  const soffitSlats = soffit === 'slats' ? (() => { const o: number[] = []; for (let x = bay.x0 + 0.05; x < bay.x1 - 0.03; x += 0.1) o.push(x); return o; })() : [];

  return (
    <group>
      {/* Dividing wall. Box face order: +x, -x, +y, -y, +z, -z. With the bay
          on the LEFT its face is -x. The +z end shows outside, so it is the
          front elevation's cladding either way. */}
      <mesh position={[bay.dividerX, h / 2, cz]} castShadow receiveShadow userData={{ openingId: 'bay-divider' }}>
        <primitive object={createWorldScaleBoxGeometry(wt, h, len, true, bay.dividerX, 0, cz, isVertical)} attach="geometry" />
        {left ? paperMat('div-0', 'material-0') : wallMat(texFront, 'div-0', 'material-0')}
        {left ? wallMat(texFront, 'div-1', 'material-1') : paperMat('div-1', 'material-1')}
        {paperMat('div-2', 'material-2')}
        {paperMat('div-3', 'material-3')}
        {claddingMat(texFront, 'div-4', 'material-4')}
        {paperMat('div-5', 'material-5')}
      </mesh>

      {/* Return wall closing a corner bay: bay finish on its +z face, the
          room's paper behind. Runs end wall to divider. */}
      {!bay.full && (
        <mesh position={[cx, h / 2, bay.returnZ]} castShadow receiveShadow>
          <primitive object={createWorldScaleBoxGeometry(bayW + wt, h, wt, true, cx, 0, bay.returnZ, isVertical)} attach="geometry" />
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
        <mesh position={[cx, h / 2, bay.z0 + skin / 2]} receiveShadow>
          <primitive object={createWorldScaleBoxGeometry(bayW, h, skin, false, cx, 0, bay.z0 + skin / 2, isVertical)} attach="geometry" />
          {wallMat(texBack, 'bay-back')}
        </mesh>
      )}
      {/* ...and over the inside of the end wall, when it is kept. */}
      {screen === 'solid' && (
        <mesh position={[innerEndX + (left ? skin / 2 : -skin / 2), h / 2, cz]} receiveShadow>
          <primitive object={createWorldScaleBoxGeometry(skin, h, len, false, innerEndX, 0, cz, isVertical)} attach="geometry" />
          {wallMat(left ? texLeft : texRight, 'bay-end')}
        </mesh>
      )}

      {/* Slatted screens where a wall has gone. */}
      {endSlats.map((z, i) => (
        <mesh key={`es-${i}`} position={[left ? -w / 2 + wt / 2 : w / 2 - wt / 2, h / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[0.045, h, 0.045]} />
          <meshStandardMaterial color={slatColour} roughness={0.8} />
        </mesh>
      ))}
      {backSlats.map((x, i) => (
        <mesh key={`bs-${i}`} position={[x, h / 2, -d / 2 + wt / 2]} castShadow receiveShadow>
          <boxGeometry args={[0.045, h, 0.045]} />
          <meshStandardMaterial color={slatColour} roughness={0.8} />
        </mesh>
      ))}

      {/* Frameless glass screen on the end: a pane in slim channels. */}
      {screen === 'glass' && (
        <group position={[left ? -w / 2 + wt / 2 : w / 2 - wt / 2, 0, cz]}>
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[0.012, h - 0.1, len - 0.1]} />
            <meshPhysicalMaterial color="#b9cdd8" transmission={0.92} ior={1.5} thickness={0.02} roughness={0.05} clearcoat={1} />
          </mesh>
          <mesh position={[0, 0.025, 0]} castShadow><boxGeometry args={[0.05, 0.05, len]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
          <mesh position={[0, h - 0.025, 0]} castShadow><boxGeometry args={[0.05, 0.05, len]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
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
        <group position={[fcx, h - 0.016, fcz]}>
          <mesh receiveShadow>
            <primitive object={createWorldScaleBoxGeometry(floorW, 0.012, floorL, false, fcx, 0, fcz, isVertical)} attach="geometry" />
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
              <boxGeometry args={[0.04, 0.04, floorL - 0.02]} />
              <meshStandardMaterial color={slatColour} roughness={0.8} />
            </mesh>
          ))}
        </group>
      )}

      {/* Downlights in the soffit, lit. */}
      {!isPlanView && Array.from({ length: lights }).map((_, i) => (
        <mesh key={`bay-spot-${i}`} position={[bay.x0 + bayW * (i + 0.5) / lights, h - (soffit === 'slats' ? 0.052 : 0.024), cz]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.004, 24]} />
          <meshStandardMaterial color="#fff4e0" emissive="#ffe8c4" emissiveIntensity={isNight ? 2.5 : 1.2} toneMapped={false} />
        </mesh>
      ))}

      {/* Corner post at the open front corner, carrying the roof. */}
      {post !== 'none' && (
        <mesh position={[left ? -w / 2 + 0.05 : w / 2 - 0.05, h / 2 + 0.025, d / 2 - 0.05]} castShadow receiveShadow>
          <boxGeometry args={[0.1, h + 0.05, 0.1]} />
          <meshStandardMaterial color={postColour} roughness={post === 'timber' ? 0.8 : 0.4} metalness={post === 'timber' ? 0 : 0.5} />
        </mesh>
      )}
      {/* A back corner post too when the back is open - something has to
          hold that corner of the roof up. */}
      {bay.full && backWall === 'open' && (
        <mesh position={[left ? -w / 2 + 0.05 : w / 2 - 0.05, h / 2 + 0.025, -d / 2 + 0.05]} castShadow receiveShadow>
          <boxGeometry args={[0.1, h + 0.05, 0.1]} />
          <meshStandardMaterial color={postColour} roughness={post === 'timber' ? 0.8 : 0.4} metalness={post === 'timber' ? 0 : 0.5} />
        </mesh>
      )}
    </group>
  );
}
