import React from 'react';
import { useMemo, useState, useRef, useEffect, useDeferredValue } from 'react';
import { Room, Door, FrameMaterialType } from '../../types';
import { doorKind } from '../../utils/doors';
import { bayRange, enclosedRange, wallSpanMm, openingRemovedByBay } from '../../utils/bay';
import { BayParts } from './BayParts';
import { useFrame } from '@react-three/fiber';
// SafeCsg = fork of @react-three/csg whose failed boolean evaluations keep
// the previous geometry instead of blanking the mesh (see SafeCsg.tsx).
import { Geometry, Base, Subtraction, Addition } from './SafeCsg';
import * as THREE from 'three';
import { frameColourHex } from '../../utils/frameColours';
import { Text, Line, Html, Edges, Billboard, useTexture } from '@react-three/drei';
import { useRealMaterial, resolveDeckingKey, resolveFloorKey } from '../../utils/materials';
import { Suspense } from 'react';
import { createWorldScaleBoxGeometry, createWorldScaleGableGeometry } from '../../utils/geometry';
import { createCladdingGeometry, createDeckingGeometry } from '../../utils/geometryUtils';
import { wallpaperProps } from '../../utils/wallpaper';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { DragHandle } from './DragHandles';
import { GABLE_CEILING_T } from '../../utils/placement';
import { InteriorDoorModel } from './InteriorDoorModel';
import { DoorHandle } from './DoorHandleModel';
import { baseFrame, useDeckTexture } from '../../utils/deck';
import { DeckSlab } from './DeckSlab';

/** Apex liner thickness: enough to sit clear of the gable face without
 *  z-fighting, thin enough to read as paint rather than a second wall. */
const GABLE_LINER_T = 0.012;

/**
 * A piece of floor the size of one opening's reveal, with its UVs written in
 * the main slab's parametrisation - so the boards continue across the joint
 * as if the slab had simply been cut larger. The slab is a plain box whose
 * UVs run 0..1 across its whole (w - 2t) x (d - 2t) top, and the floor
 * material's repeat is set for that (see useRealMaterial's isFloor branch);
 * this piece is mapped into the same 0..1 space from its position.
 * cx/cz are the piece's centre in the slab's frame; sw/sd the slab's size.
 */
function floorTongueGeometry(width: number, depth: number, cx: number, cz: number, sw: number, sd: number) {
  const g = new THREE.BoxGeometry(width, 0.01, depth);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx;
    const z = pos.getZ(i) + cz;
    uv.setXY(i, (x + sw / 2) / sw, 1 - (z + sd / 2) / sd);
  }
  uv.needsUpdate = true;
  return g;
}

function DimText({ value, onValueChange, position, rotation, children, isDraggable, hideOnExport, hideIfZero }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(String(value));
  const { setControlsEnabled, viewMode, isExporting } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTempValue(String(value));
  }, [value]);

  if (viewMode === 'walking') return null;
  if (isExporting && hideOnExport) return null;
  if (hideIfZero && Number(value) === 0) return null;

  if (isExporting) {
    // PDF-bound labels read like architectural drawings: dark figures on a
    // white plate with a hairline frame, sized to the number. The old dark
    // blob at fixed width clipped long values and sank into the linework.
    const label = String(value);
    const plateW = 0.28 + label.length * 0.11;
    return (
      <group position={position} name="dimension-label">
        <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
          <mesh position={[0, 0, -0.012]}>
            <planeGeometry args={[plateW + 0.04, 0.34]} />
            <meshBasicMaterial color="#3b4d4a" />
          </mesh>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[plateW, 0.3]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <Text
            color="#1d1d1f"
            fontSize={0.17}
            anchorX="center"
            anchorY="middle"
          >
            {label}
          </Text>
        </Billboard>
      </group>
    );
  }

  const isPlanLabel = viewMode === 'plan' || viewMode === 'lighting';

  /**
   * On a plan, a dimension is DRAWN, not stuck on.
   *
   * These were HTML badges transformed into the scene, and an Html with
   * `transform` inherits whatever flip its rotation carries - which is why
   * half the numbers on a plan came out mirrored and upside down. Real text
   * geometry cannot mirror, sits in the drawing rather than floating over it,
   * and scales with the zoom like every other line on the page. The white
   * halo is what keeps it readable over a floor texture.
   *
   * Still editable: click it and the input below takes over, so typing a
   * dimension to resize something is unchanged.
   */
  if (isPlanLabel && !isEditing) {
    const label = (typeof children === 'string' || typeof children === 'number')
      ? String(children)
      : String(value);
    /*
     * Never upside down.
     *
     * Call sites pass [-PI/2, 0, t] with t of 0, +/-PI/2 or PI, which suited
     * an Html plate but as real geometry turns "6000" into "0009". Drafting
     * convention is that a dimension reads left-to-right or bottom-to-top and
     * never any other way, so the in-plane angle is wrapped into (-90, 90]:
     * PI becomes 0, -PI/2 becomes PI/2, and the number stays put.
     */
    const flat = (() => {
      const r = Array.isArray(rotation) ? rotation : [-Math.PI / 2, 0, 0];
      let t = Math.atan2(Math.sin(r[2] ?? 0), Math.cos(r[2] ?? 0));
      if (t > Math.PI / 2) t -= Math.PI;
      if (t <= -Math.PI / 2) t += Math.PI;
      return [-Math.PI / 2, 0, t] as [number, number, number];
    })();

    return (
      <Text
        position={position}
        rotation={flat}
        fontSize={0.24}
        color="#1d1d1f"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.035}
        outlineColor="#ffffff"
        onClick={(e: any) => {
          if (!onValueChange) return;
          e.stopPropagation();
          setIsEditing(true);
          setControlsEnabled(false);
          setTempValue(String(value));
        }}
        onPointerOver={() => { if (onValueChange) document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      >
        {label}
      </Text>
    );
  }

  return (
    <Html center position={position} transform rotation={rotation}>
      <div
        className={`${isPlanLabel
          // Plan view is a working drawing: bigger, dark-on-light labels that
          // stand clear of the dimension lines instead of tiny dark blobs.
          // Kept compact: at 11px with heavy padding these plates collided
          // with each other all over a plan and hid the building.
          ? 'bg-white/95 border border-[#3b4d4a]/40 rounded font-mono text-[9px] font-semibold tracking-tight whitespace-nowrap px-1 py-px text-[#1d1d1f] shadow-sm'
          : 'bg-[#3b4d4a] border border-[#3b4d4a] rounded-full font-mono text-[8px] tracking-wider whitespace-nowrap px-1.5 py-0.5 text-white opacity-90 shadow-md'} transition-all duration-200 ${onValueChange ? (isEditing ? 'cursor-auto ring-1 ring-[#2d3a38]' : 'cursor-pointer hover:scale-105') : 'pointer-events-none'}`}
        style={{ pointerEvents: (isEditing || onValueChange || isDraggable) ? 'auto' : 'none' }}
        onClick={(e) => {
          if (onValueChange && !isEditing) {
            e.stopPropagation();
            setIsEditing(true);
            setControlsEnabled(false);
            setTempValue(String(value));
          }
        }}
        onPointerDown={(e) => {
           if (isDraggable) e.stopPropagation();
        }}
      >
        {isEditing ? (
            <input 
              ref={inputRef}
              type="number"
              autoFocus
              className={`min-w-[40px] w-auto max-w-[80px] text-center outline-none bg-transparent font-bold ${isPlanLabel ? 'text-[#1d1d1f]' : 'text-white'}`}
              value={tempValue} 
              onChange={e => setTempValue(e.target.value)}
              onFocus={e => e.target.select()}
              onPointerDown={e => e.stopPropagation()}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  inputRef.current?.blur();
                } else if (e.key === 'Escape') {
                  setTempValue(String(value));
                  setIsEditing(false);
                  setControlsEnabled(true);
                }
              }}
              onKeyUp={e => e.stopPropagation()}
              onBlur={(e) => {
                setIsEditing(false);
                setControlsEnabled(true);
                const nv = Number(tempValue);
                if (!isNaN(nv) && onValueChange && String(value) !== tempValue) {
                  onValueChange(nv);
                }
              }}
            />
        ) : (
          children || `${value} mm`
        )}
      </div>
    </Html>
  );
}

// Crittall-style glazing bars: grid of slim steel bars over a glass panel.
// Pane sizes adapt to the glass dimensions (targeting ~800mm wide x ~650mm tall panes,
// so a normal leaf gets no internal vertical bars and only 2-3 horizontal ones).
/**
 * One member of a window or door frame, coloured per side.
 *
 * Dual-colour aluminium is two profiles - an outer shell and an inner one,
 * thermally broken - and that is how it is built here. A member's depth is
 * its local Z, which in every opening group runs through the wall with +Z
 * outside (the sill is placed at +Z). The depth is split in two and each half
 * takes its own colour. When the colours match it is one box, so a
 * single-colour frame draws exactly as it always did.
 */
/**
 * What a frame member is made of - the surface under the colour.
 *
 * Only the relief and roughness maps are used; the colour is the frame
 * colour, so white uPVC is white and black aluminium is black. (The
 * ambientCG colour maps are all dark and would swallow the tint.) Bars
 * carry world-scale UVs, so the grain and grip are life-size on a 50mm
 * sash and a 100mm jamb alike.
 *   upvc      ambientCG Plastic006 - the faint stipple of extruded PVC
 *   aluminium ambientCG Metal027   - powder coat, a touch of sheen
 *   timber    ambientCG Wood049   - real oak, colour map and all: white
 *             leaves it natural oak, anthracite and black read as a dark
 *             stain with the grain still showing
 */
const FRAME_FINISH: Record<FrameMaterialType, { prefix: string; tile: number; metalness: number; roughness: number; normalScale: number; colourMap?: boolean }> = {
  upvc: { prefix: 'upvc', tile: 0.5, metalness: 0, roughness: 0.55, normalScale: 0.5 },
  aluminium: { prefix: 'roof_alu', tile: 0.6, metalness: 0.7, roughness: 0.45, normalScale: 0.35 },
  timber: { prefix: 'frame_oak', tile: 0.8, metalness: 0, roughness: 0.65, normalScale: 0.7, colourMap: true },
};
/** One material per finish and colour, shared by every bar that uses it -
 *  nineteen bars per door, and a design has many doors. */
const frameMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
function useFrameMaterial(hex: string, metalnessOverride?: number, roughnessOverride?: number, vertical = false): THREE.MeshStandardMaterial {
  const finishId = useStore(s => s.scene.room.frameMaterial ?? 'aluminium');
  const finish = FRAME_FINISH[finishId] ?? FRAME_FINISH.aluminium;
  const tex: any = useTexture({ normalMap: `./textures/${finish.prefix}_normal.jpg`, roughnessMap: `./textures/${finish.prefix}_roughness.jpg`, ...(finish.colourMap ? { map: `./textures/${finish.prefix}_color.jpg` } : {}) });
  return useMemo(() => {
    // Grain runs along the bar: the oak map is cut with the grain across
    // it, so an upright member (jamb, mullion, stile) gets the maps turned
    // a quarter. Heads, sills and rails take them as they come.
    const turn = finish.colourMap && vertical;
    const key = `${finishId}|${hex}|${metalnessOverride ?? ''}|${roughnessOverride ?? ''}|${turn ? 'v' : 'h'}`;
    let m = frameMaterialCache.get(key);
    if (m) return m;
    const prep = (t: THREE.Texture, colour = false) => { const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(1 / finish.tile, 1 / finish.tile); if (turn) c.rotation = Math.PI / 2; c.colorSpace = colour ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace; c.needsUpdate = true; return c; };
    // Oak: white is natural oak; a dark frame colour stains it. The tint is
    // lifted so black does not go to nothing - stained, not painted over.
    const stained = finish.colourMap ? new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.35) : new THREE.Color(hex);
    m = new THREE.MeshStandardMaterial({
      color: stained,
      map: finish.colourMap && tex.map ? prep(tex.map, true) : null,
      normalMap: prep(tex.normalMap),
      normalScale: new THREE.Vector2(finish.normalScale, finish.normalScale),
      roughnessMap: prep(tex.roughnessMap),
      roughness: roughnessOverride ?? finish.roughness,
      metalness: metalnessOverride ?? finish.metalness,
    });
    frameMaterialCache.set(key, m);
    return m;
  }, [finishId, hex, metalnessOverride, roughnessOverride, vertical, tex.normalMap, tex.roughnessMap, tex.map]);
}

function FrameBar({ position, args, outer, inner, metalness, roughness, castShadow = false }: {
  position: [number, number, number];
  args: [number, number, number];
  outer: string;
  inner: string;
  metalness?: number;
  roughness?: number;
  castShadow?: boolean;
}) {
  const [w, h, d] = args;
  // An upright member is taller than it is wide.
  const vertical = h > w;
  const outerMat = useFrameMaterial(outer, metalness, roughness, vertical);
  const innerMat = useFrameMaterial(inner, metalness, roughness, vertical);
  // World-scale UVs, so the finish maps in metres rather than stretching
  // one tile over a 2.1m jamb.
  const whole = useMemo(() => createWorldScaleBoxGeometry(w, h, d, false, 0, 0, 0), [w, h, d]);
  const half = useMemo(() => createWorldScaleBoxGeometry(w, h, d / 2, false, 0, 0, 0), [w, h, d]);
  if (outer === inner) {
    return <mesh position={position} castShadow={castShadow} geometry={whole} material={outerMat} />;
  }
  const [x, y, z] = position;
  return (
    <group>
      <mesh position={[x, y, z + d / 4]} castShadow={castShadow} geometry={half} material={outerMat} />
      <mesh position={[x, y, z - d / 4]} castShadow={castShadow} geometry={half} material={innerMat} />
    </group>
  );
}

function CrittallBars({ glassW, glassH, depth, color, innerColor }: { glassW: number, glassH: number, depth: number, color: string, innerColor?: string }) {
  const barT = 0.018;
  const cols = Math.max(1, Math.round(glassW / 0.80));
  const rows = Math.max(2, Math.round(glassH / 0.65));
  return (
    <group>
      {Array.from({ length: cols - 1 }).map((_, i) => (
        <FrameBar key={`v-${i}`} position={[-glassW/2 + (glassW/cols)*(i+1), 0, 0]} args={[barT, glassH, depth]} outer={color} inner={innerColor ?? color} />
      ))}
      {Array.from({ length: rows - 1 }).map((_, i) => (
        <FrameBar key={`h-${i}`} position={[0, -glassH/2 + (glassH/rows)*(i+1), 0]} args={[glassW, barT, depth]} outer={color} inner={innerColor ?? color} />
      ))}
    </group>
  );
}

/**
 * Click-to-add chip: click a bare wall and choose "+ Window" or "+ Door" at
 * that exact spot - no more spawning centred and dragging across the wall.
 * Works in room-local space so it lands correctly on moved/rotated rooms.
 */
function WallAddChip({ room, h, baseH }: { room: Room, h: number, baseH: number }) {
  const [hit, setHit] = useState<{ wall: Door['wall'], offsetMm: number, pos: [number, number, number] } | null>(null);
  // With an outdoor section some of the wall is gone (utils/bay): the front
  // over the bay and its divider, the bay's stretch of the end wall. Clicks
  // and + buttons there used to put an opening in mid-air, where it is
  // hidden - "I added a door and it's invisible".
  const bay = useMemo(() => bayRange(room), [room.bay, room.widthMm, room.depthMm, room.wallThicknessMm]);
  const spans = useMemo(() => {
    const out: Partial<Record<Door['wall'], { lo: number; hi: number }>> = {};
    (['front', 'back', 'left', 'right', 'bay'] as const).forEach(wl => { const s = wallSpanMm(room, wl); if (s) out[wl] = s; });
    return out;
  }, [room.bay, room.widthMm, room.depthMm, room.wallThicknessMm]);

  useEffect(() => {
    const onWallClick = (e: any) => {
      const st = useStore.getState();
      if (st.viewMode === 'walking' || st.toolMode === 'place') return;
      const { x, y, z } = e.detail;
      const rx = (room.x ?? 0) / 1000, rz = (room.z ?? 0) / 1000, rot = room.rot ?? 0;
      const cos = Math.cos(-rot), sin = Math.sin(-rot);
      const lx = (x - rx) * cos - (z - rz) * sin;
      const lz = (x - rx) * sin + (z - rz) * cos;
      const w = room.widthMm / 1000, d = room.depthMm / 1000;
      const band = ((room.wallThicknessMm ?? 150) / 1000) + 0.06;
      if (y < baseH + 0.15 || y > baseH + h + 0.1) { setHit(null); return; }
      let wall: Door['wall'] | null = null;
      let offsetMm = 0;
      if (Math.abs(Math.abs(lz) - d / 2) < band && Math.abs(lx) < w / 2 - 0.05) {
        wall = lz > 0 ? 'front' : 'back';
        offsetMm = Math.round(lx * 1000);
      } else if (Math.abs(Math.abs(lx) - w / 2) < band && Math.abs(lz) < d / 2 - 0.05) {
        wall = lx > 0 ? 'right' : 'left';
        offsetMm = Math.round(lz * 1000);
      } else if (bay && Math.abs(lx - bay.dividerX) < band && lz > bay.z0 + 0.05 && lz < d / 2 - 0.05) {
        // The divider's face inside the section. offsetMm runs along the
        // divider from its midpoint.
        wall = 'bay';
        offsetMm = Math.round((lz - (bay.z0 + d / 2) / 2) * 1000);
      }
      // Wall the bay has taken away - nothing to put an opening in.
      const span = wall ? spans[wall] : undefined;
      if (!wall || !span || offsetMm < span.lo + 50 || offsetMm > span.hi - 50) { setHit(null); return; }
      setHit({ wall, offsetMm, pos: [lx, Math.min(Math.max(y, baseH + 0.8), baseH + h - 0.2), lz] });
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setHit(null); };
    window.addEventListener('wall-clicked', onWallClick);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('wall-clicked', onWallClick); window.removeEventListener('keydown', onKey); };
  }, [room.x, room.z, room.rot, room.widthMm, room.depthMm, room.wallThicknessMm, h, baseH, bay, spans]);

  const viewMode = useStore(s => s.viewMode);
  const isExporting = useStore(s => s.isExporting);
  const hovered = useStore(s => s.hoveredElementId);
  if (viewMode === 'walking' || viewMode === 'capture' || viewMode === 'render' || isExporting) return null;
  // Only while the pointer is over the building - four permanent + markers
  // sat on the walls in every view and cluttered the model. The chip itself
  // keeps them alive once opened.
  const showAdders = hovered === 'room' || !!hit;

  const add = (kind: 'door' | 'window') => {
    if (!hit) return;
    const st = useStore.getState();
    st.saveState();
    if (kind === 'door') st.addDoorAt(hit.wall, hit.offsetMm);
    else st.addWindowAt(hit.wall, hit.offsetMm);
    setHit(null);
  };

  // A permanent + button on the middle of each wall - the middle of the
  // wall that is THERE, so with an outdoor section the front one sits on
  // the room's stretch, not over the bay - the divider included, a wall
  // like any other - and the popup chip at whatever point was chosen (via
  // a + button or a direct wall click).
  const w = room.widthMm / 1000, d = room.depthMm / 1000;
  const wt = (room.wallThicknessMm ?? 150) / 1000;
  const midY = baseH + h * 0.55;
  const mid = (wl: Door['wall']) => { const s = spans[wl]; return s ? Math.round((s.lo + s.hi) / 2 / 50) * 50 : null; };
  const wallButtons: { wall: Door['wall']; offsetMm: number; pos: [number, number, number] }[] = [];
  const fm = mid('front'), bm = mid('back'), lm = mid('left'), rm = mid('right'), dm = mid('bay');
  if (fm !== null) wallButtons.push({ wall: 'front', offsetMm: fm, pos: [fm / 1000, midY, d / 2 + 0.12] });
  if (bm !== null) wallButtons.push({ wall: 'back', offsetMm: bm, pos: [bm / 1000, midY, -d / 2 - 0.12] });
  if (lm !== null) wallButtons.push({ wall: 'left', offsetMm: lm, pos: [-w / 2 - 0.12, midY, lm / 1000] });
  if (rm !== null) wallButtons.push({ wall: 'right', offsetMm: rm, pos: [w / 2 + 0.12, midY, rm / 1000] });
  if (dm !== null && bay) {
    const faceX = bay.dividerX + (bay.side === 'left' ? -(wt / 2 + 0.12) : wt / 2 + 0.12);
    wallButtons.push({ wall: 'bay', offsetMm: dm, pos: [faceX, midY, (bay.z0 + d / 2) / 2 + dm / 1000] });
  }

  return (
    <>
      {showAdders && wallButtons.map(b => (
        <Html key={`wall-add-${b.wall}`} position={b.pos} center zIndexRange={[125, 0]}>
          <button
            title={`Add a window or door to the ${b.wall === 'bay' ? 'divider' : b.wall} wall`}
            style={{ pointerEvents: 'auto' }}
            onPointerDown={(e) => e.stopPropagation()}
            // Moving onto the button leaves the 3D mesh, which would hide the
            // buttons out from under the cursor - keep the hover alive.
            onPointerEnter={() => useStore.getState().setHoveredElementId('room')}
            onClick={(e) => { e.stopPropagation(); setHit({ wall: b.wall, offsetMm: b.offsetMm, pos: b.pos }); }}
            className="w-7 h-7 rounded-full bg-white/90 backdrop-blur-md border border-black/10 shadow-md text-[#3b4d4a] text-base font-bold leading-none hover:bg-[#3b4d4a] hover:text-white hover:scale-110 transition-all"
          >
            +
          </button>
        </Html>
      ))}
      {hit && (
        <Html position={hit.pos} center zIndexRange={[130, 0]}>
          <div
            style={{ pointerEvents: 'auto' }}
            className="flex items-center gap-1 bg-white/95 backdrop-blur-md border border-black/10 rounded-full shadow-xl px-2 py-1.5 whitespace-nowrap"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerEnter={() => useStore.getState().setHoveredElementId('room')}
          >
            <button onClick={() => add('window')} className="px-3 py-1.5 rounded-full text-[11px] font-bold text-white bg-[#3b4d4a] hover:bg-[#2d3a38] transition-colors">+ Window</button>
            <button onClick={() => add('door')} className="px-3 py-1.5 rounded-full text-[11px] font-bold text-[#3b4d4a] bg-black/5 hover:bg-black/10 transition-colors">+ Door</button>
            <button onClick={() => setHit(null)} className="px-2 py-1.5 rounded-full text-[11px] font-bold text-gray-400 hover:text-gray-600">✕</button>
          </div>
        </Html>
      )}
    </>
  );
}

/**
 * One leaf of an exterior door set, centred on its own origin: sash, panel
 * (glass, or the solid entrance slab), Crittall bars, and a handle on the
 * edge that opens. The set's mechanism (below) decides where it goes.
 */
function DoorLeaf({ leafW, doorH, frameThickness, sashThickness, depth, style, frameColorHex, frameColorInnerHex, handle }: {
  leafW: number; doorH: number; frameThickness: number; sashThickness: number; depth: number;
  style?: string; frameColorHex: string; frameColorInnerHex: string; handle: 'left' | 'right' | null;
}) {
  return (
    <group>
      {/* Leaf Frame (Sash) */}
      <FrameBar position={[0, doorH/2 - frameThickness - sashThickness/2, 0]} args={[leafW, sashThickness, depth*0.5]} outer={frameColorHex} inner={frameColorInnerHex} />
      <FrameBar position={[0, -doorH/2 + frameThickness + sashThickness/2, 0]} args={[leafW, sashThickness, depth*0.5]} outer={frameColorHex} inner={frameColorInnerHex} />
      <FrameBar position={[-leafW/2 + sashThickness/2, 0, 0]} args={[sashThickness, doorH - frameThickness*2, depth*0.5]} outer={frameColorHex} inner={frameColorInnerHex} />
      <FrameBar position={[leafW/2 - sashThickness/2, 0, 0]} args={[sashThickness, doorH - frameThickness*2, depth*0.5]} outer={frameColorHex} inner={frameColorInnerHex} />

      {/* Door handle, on the edge that opens, both faces - Charlie's modelled
          handle in black metal (components/3d/DoorHandleModel.tsx). +Z is
          the outside of the leaf. */}
      {handle && (() => {
        // On the STILE, centred on the bar that opens - never on the glass.
        const hx = handle === 'right' ? leafW/2 - sashThickness/2 : -leafW/2 + sashThickness/2;
        // Crittall: the lock-rail block on the stile that the real sets have,
        // the lever mounted on it. Drawn with FrameBar so it is the SAME
        // material and colour as the frame it sits on, sized like the
        // product: 90 wide, 480 tall, 18 proud of the stile, each face.
        const crittall = style === 'crittall';
        // The block fills the whole pane the handle sits in: from the glazing
        // bar below to the bar above (the same row maths as CrittallBars), so
        // it joins the frame top and bottom rather than floating on the glass.
        const glassH = doorH - frameThickness*2 - sashThickness*2;
        const rows = Math.max(2, Math.round(glassH / 0.65));
        const paneH = glassH / rows;
        const paneIndex = Math.min(rows - 1, Math.max(0, Math.floor((0 + glassH/2) / paneH)));
        const paneCentre = -glassH/2 + paneH * (paneIndex + 0.5);
        const barT = 0.018;
        const blockW = 0.12, blockH = paneH + barT, blockD = 0.018;
        const faceZ = depth*0.25 + (crittall ? blockD : 0);
        return (
          <>
            {crittall && (
              <>
                <FrameBar position={[hx, paneCentre, depth*0.25 + blockD/2]} args={[blockW, blockH, blockD]} outer={frameColorHex} inner={frameColorHex} castShadow />
                <FrameBar position={[hx, paneCentre, -depth*0.25 - blockD/2]} args={[blockW, blockH, blockD]} outer={frameColorInnerHex} inner={frameColorInnerHex} castShadow />
              </>
            )}
            <group position={[hx, 0, faceZ]}>
              <DoorHandle side={handle} face="outside" />
            </group>
            <group position={[hx, 0, -faceZ]}>
              <DoorHandle side={handle} face="inside" />
            </group>
          </>
        );
      })()}

      {/*
        No "Open Door" badge on the leaf.

        It was an Html label welded to the leaf, so from inside the room
        you read it back to front, and with one per door set they hung in
        the glass across the whole elevation - the first thing a customer
        saw on the walkthrough was floating UI, not their room. Doors are
        still opened from Open Doors in the toolbar, which does the whole
        set at once anyway.
      */}
      {/* Panel: glass, or a solid slab for the entrance-door style.
          GLASS IS ALPHA-BLENDED, NOT TRANSMISSIVE - here and everywhere
          else in the scene. transmission made three.js render the whole
          opaque scene AGAIN into an offscreen buffer every frame for the
          refraction (measured 13.2ms -> 4.6ms of GPU per frame without
          it, 11 Sep), and doubled every shader variant. Through a flat
          20mm pane the refraction is invisible anyway. */}
      {style === 'solid' ? (
        <FrameBar position={[0, 0, 0]} args={[leafW - sashThickness*2, doorH - frameThickness*2 - sashThickness*2, 0.045]} outer={frameColorHex} inner={frameColorInnerHex} metalness={0.35} roughness={0.55} castShadow />
      ) : (
        <mesh>
          <boxGeometry args={[leafW - sashThickness*2, doorH - frameThickness*2 - sashThickness*2, 0.02]} />
          <meshPhysicalMaterial color="#aabed1" transparent opacity={0.3} depthWrite={false} roughness={0.05} metalness={0} clearcoat={1} clearcoatRoughness={0.05} envMapIntensity={3} />
        </mesh>
      )}
      {style === 'crittall' && (
        <CrittallBars
          glassW={leafW - sashThickness*2}
          glassH={doorH - frameThickness*2 - sashThickness*2}
          depth={0.03}
          color={frameColorHex}
          innerColor={frameColorInnerHex}
        />
      )}
    </group>
  );
}

/**
 * The leaves of an exterior door set, and how they open.
 *
 * Four mechanisms, each moving the way the real product does (see
 * utils/doors): a hinged leaf swings on its jamb; French doors are two of
 * those meeting in the middle; a bi-fold is a chain of leaves hinged to each
 * other that concertinas back to a jamb, folding face to face; a slider's
 * panes glide in parallel tracks behind a fixed pane. Everything is driven
 * by one progress value, 0 closed to 1 open, eased toward its target each
 * frame; the pose for any progress is computed outright, so the leaves are
 * always exactly where the mechanism puts them, mid-swing included.
 *
 * Local frame: x along the wall, +z OUT to the garden (the door group is
 * turned to face its wall), leaves closed at z = 0.
 */
function AnimatedDoorLeaves({ door, frameColorHex, frameColorInnerHex, frameThickness, sashThickness, depth, room }: { door: Door, frameColorHex: string, frameColorInnerHex: string, frameThickness: number, sashThickness: number, depth: number, room: Room }) {
  // Open with the Open Doors toggle, or on its own - clicked in the
  // walkthrough, which is how you get in from the garden.
  const areDoorsOpen = useStore(s => s.areDoorsOpen || s.openDoorIds.includes(door.id));
  const pivots = useRef<THREE.Group[]>([]);
  const progress = useRef(0);

  const kind = doorKind(door);
  const n = Math.max(1, door.leaves);
  const W = door.widthMm/1000 - frameThickness*1.5;
  const leafW = W / n;
  const doorH = door.heightMm/1000;
  const swing = door.swing ?? 1;
  const hinge = door.hinge ?? 'left';
  const stack = door.stack ?? 'left';
  // A leaf's thickness, hinge to hinge: what separates folded bi-fold
  // leaves and the tracks of a slider.
  const t = depth * 0.5 + 0.004;
  const HALF = Math.PI / 2;

  // Chains for a bi-fold: how many leaves fold to each jamb.
  const leftChain = kind !== 'bifold' ? 0 : stack === 'left' ? n : stack === 'right' ? 0 : Math.ceil(n / 2);
  const rightChain = kind === 'bifold' ? n - leftChain : 0;
  // A slider's fixed pane(s).
  const fixedLeft = stack === 'left' || (stack === 'split');
  const fixedRight = stack === 'right' || (stack === 'split' && n > 2);
  const closedX = (i: number) => -W/2 + leafW/2 + i * leafW;

  /** Put every pivot where the mechanism has it at progress p. */
  const pose = (p: number) => {
    const g = pivots.current;
    if (kind === 'hinged') {
      if (g[0]) g[0].rotation.y = (hinge === 'left' ? -1 : 1) * swing * HALF * p;
    } else if (kind === 'french') {
      if (g[0]) g[0].rotation.y = -swing * HALF * p;
      if (g[1]) g[1].rotation.y = swing * HALF * p;
    } else if (kind === 'bifold') {
      const th = HALF * p;
      // Left chain: the jamb hinge turns the first leaf out; each hinge
      // after it turns twice as far the other way, so the leaves zigzag and,
      // at 90 degrees, lie face to face.
      for (let k = 0; k < leftChain; k++) {
        if (!g[k]) continue;
        g[k].rotation.y = k === 0 ? -swing * th : (k % 2 ? 2 : -2) * swing * th;
      }
      // Right chain, mirrored, indexed from the right jamb inward.
      for (let k = 0; k < rightChain; k++) {
        const i = n - 1 - k;
        if (!g[i]) continue;
        g[i].rotation.y = k === 0 ? swing * th : (k % 2 ? -2 : 2) * swing * th;
      }
    } else {
      // Sliding: each pane glides toward the fixed pane on its side.
      for (let i = 0; i < n; i++) {
        if (!g[i]) continue;
        const half = Math.ceil(n / 2);
        const toLeft = stack === 'left' || (stack === 'split' && i < half);
        const target = toLeft ? closedX(0) : closedX(n - 1);
        g[i].position.x = closedX(i) + (target - closedX(i)) * p;
      }
    }
  };

  /**
   * True once the set has reached its target, so the loop can stop working -
   * the easing approaches asymptotically and never quite arrives, and without
   * this the door maths ran on every frame for the whole session. Reset
   * whenever anything about the set changes.
   */
  const settledRef = useRef(false);
  useEffect(() => { settledRef.current = false; }, [areDoorsOpen, kind, n, door.widthMm, swing, hinge, stack]);

  useFrame((_, delta) => {
    if (settledRef.current) return;
    const target = areDoorsOpen ? 1 : 0;
    const next = THREE.MathUtils.lerp(progress.current, target, Math.min(1, 5 * delta));
    if (Math.abs(next - target) < 0.002) {
      progress.current = target;
      pose(target);
      settledRef.current = true;
      return;
    }
    progress.current = next;
    pose(next);
  });

  const setPivot = (i: number) => (el: THREE.Group | null) => { if (el) pivots.current[i] = el; };
  const leafProps = { leafW, doorH, frameThickness, sashThickness, depth, style: door.style, frameColorHex, frameColorInnerHex };
  // Slim and ultra-slim frames have no stile to carry a handle (15-25mm
  // bars); those sets are handle-less, as the real products are.
  const handles = !!room.hasDoorHandles && room.frameStyle !== 'slim' && room.frameStyle !== 'ultra-slim';

  if (kind === 'hinged') {
    const left = hinge === 'left';
    return (
      <group position={[left ? -W/2 : W/2, 0, 0]} ref={setPivot(0)}>
        <group position={[left ? leafW/2 : -leafW/2, 0, 0]}>
          <DoorLeaf {...leafProps} handle={handles ? (left ? 'right' : 'left') : null} />
        </group>
      </group>
    );
  }

  if (kind === 'french') {
    return (
      <>
        <group position={[-W/2, 0, 0]} ref={setPivot(0)}>
          <group position={[leafW/2, 0, 0]}><DoorLeaf {...leafProps} handle={handles ? 'right' : null} /></group>
        </group>
        <group position={[W/2, 0, 0]} ref={setPivot(1)}>
          <group position={[-leafW/2, 0, 0]}><DoorLeaf {...leafProps} handle={handles ? 'left' : null} /></group>
        </group>
      </>
    );
  }

  if (kind === 'bifold') {
    /*
     * A chain of nested pivots. The hinges alternate faces - outside face,
     * inside face, outside - so folded leaves stack a thickness apart
     * rather than through each other. In the frame of pivot k the next
     * pivot sits a leaf along and a thickness across, and the leaf itself
     * hangs half a thickness the other way so that, closed, every leaf
     * lies at z = 0.
     */
    const chain = (count: number, fromLeft: boolean): JSX.Element | null => {
      const dir = fromLeft ? 1 : -1;
      const s = swing;
      const build = (k: number): JSX.Element | null => {
        if (k >= count) return null;
        const i = fromLeft ? k : n - 1 - k;
        const sign = k % 2 ? -1 : 1;
        const isLast = k === count - 1;
        const handle = handles && isLast && count > 0 ? (fromLeft ? 'right' : 'left') : null;
        return (
          <group
            position={k === 0 ? [fromLeft ? -W/2 : W/2, 0, s * t / 2] : [dir * leafW, 0, s * t * sign]}
            ref={setPivot(i)}
          >
            <group position={[dir * leafW/2, 0, -s * t / 2 * sign]}>
              <DoorLeaf {...leafProps} handle={handle} />
            </group>
            {build(k + 1)}
          </group>
        );
      };
      return build(0);
    };
    return (
      <>
        {chain(leftChain, true)}
        {chain(rightChain, false)}
      </>
    );
  }

  // Sliding: panes in parallel tracks, stepping inward from the fixed pane
  // so each can pass the next. The handle is on the pane you actually pull -
  // the moving pane furthest from the fixed one, on its lock stile, the edge
  // that closes against the jamb (or, on a set that opens both ways, against
  // the other half). So a set that slides right has its handle on the LEFT
  // pane's left edge (Charlie, 10 Sep).
  const half = Math.ceil(n / 2);
  return (
    <>
      {Array.from({ length: n }).map((_, i) => {
        const toLeft = stack === 'left' || (stack === 'split' && i < half);
        const lane = toLeft ? i : n - 1 - i;
        const groupSize = stack === 'split' ? (toLeft ? half : n - half) : n;
        const isFixed = (toLeft && i === 0 && fixedLeft) || (!toLeft && i === n - 1 && fixedRight);
        const handle = handles && !isFixed && lane === groupSize - 1 ? (toLeft ? 'right' : 'left') : null;
        return (
          <group key={`pane-${i}`} position={[closedX(i), 0, -lane * (t + 0.006)]} ref={setPivot(i)}>
            <DoorLeaf {...leafProps} handle={handle} />
          </group>
        );
      })}
    </>
  );
}

/**
 * One internal wall: the unified system.
 *
 * - Click SELECTS it (persistent, not hover) - the old handles lived behind
 *   isHovered, so drifting off the tiny handle mid-drag unmounted it and the
 *   drag died after a step or two.
 * - Drag the WALL BODY to move it: perpendicular position snaps to other
 *   parallel walls; the ends snap to the room's inner wall faces and to
 *   perpendicular internal walls (120mm magnet, 50mm grid otherwise).
 * - End handles resize, with the moving end snapping to the same targets.
 * - Doors BELONG to the wall (offset from its centre) so they travel with
 *   it; each door has a slide handle, and its opening is cut from this
 *   wall's own geometry in local space.
 */
const CHIP = 'flex items-center gap-1 bg-white/95 backdrop-blur-md border border-black/10 rounded-full shadow-xl px-2 py-1 whitespace-nowrap';
const CHIP_BTN = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide text-[#3b4d4a] hover:bg-[#3b4d4a] hover:text-white transition-colors';
const stopEvt = (e: { stopPropagation: () => void }) => e.stopPropagation();

/**
 * The label over a door in an internal wall: how far it is from the corner
 * (or, on a straight wall, from the end), typed into on click - "1200 from
 * that end" is how a wall gets set out. Plus remove, and a swap to the other
 * run of an L.
 */
function DoorLabel({ mm, from, onCommit, onRemove, onSwap, swapLabel }: {
  mm: number; from: string; onCommit: (mm: number) => void; onRemove: () => void; onSwap?: () => void; swapLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const setControlsEnabled = useStore(s => s.setControlsEnabled);
  const commit = () => { setEditing(false); setControlsEnabled(true); const v = Number(draft); if (!isNaN(v)) onCommit(v); };
  return (
    <div style={{ pointerEvents: 'auto' }} onPointerDown={stopEvt} className={CHIP}>
      {editing ? (
        <input
          autoFocus type="number" value={draft}
          onChange={e => setDraft(e.target.value)}
          onFocus={e => e.target.select()}
          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setControlsEnabled(true); } }}
          onBlur={commit}
          className="w-16 text-center text-[11px] font-mono font-bold text-[#1d1d1f] outline-none bg-transparent"
        />
      ) : (
        <button
          className="text-[11px] font-mono font-bold text-[#1d1d1f] px-1"
          title={`Click to type a distance from the ${from}`}
          onClick={(e) => { e.stopPropagation(); setDraft(String(mm)); setEditing(true); setControlsEnabled(false); }}
        >
          {mm} mm from {from}
        </button>
      )}
      {onSwap && <button className={CHIP_BTN} title={swapLabel} onClick={(e) => { e.stopPropagation(); onSwap(); }}>{swapLabel}</button>}
      <button className={CHIP_BTN} title="Remove this door" onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>
    </div>
  );
}

function PartitionUnit({ part, hP, room, showDims }: { part: any; hP: number; room: any; showDims: boolean }) {
  const isSelected = useStore(s => s.selectedElementId === `part-${part.id}`);
  const [dragging, setDragging] = useState(false);
  const grabRef = useRef<{ dx: number; dz: number } | null>(null);
  const dragPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const pL = part.lengthMm / 1000;
  const pT = part.thicknessMm / 1000;
  const pX = part.xMm / 1000;
  const pZ = part.zMm / 1000;
  const rotAngle = part.rotation === 90 ? Math.PI / 2 : 0;

  const wallTmm = room.wallThicknessMm || 150;
  const innerX = room.widthMm / 2 - wallTmm;
  const innerZ = room.depthMm / 2 - wallTmm;
  const others = (room.partitions || []).filter((p: any) => p.id !== part.id);

  const snapNear = (v: number, targets: number[], tol = 120) => {
    let best: number | null = null;
    for (const t of targets) if (Math.abs(v - t) < tol && (best === null || Math.abs(v - t) < Math.abs(v - best))) best = t;
    return best;
  };

  const onDown = (e: any) => {
    e.stopPropagation();
    const st = useStore.getState();
    st.setSelectedElementId(`part-${part.id}`);
    if (st.viewMode === 'walking') return;
    st.saveState();
    setDragging(true);
    st.setControlsEnabled(false);
    try { e.target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    grabRef.current = { dx: e.point.x - pX, dz: e.point.z - pZ };
  };
  const onUp = (e: any) => {
    e.stopPropagation();
    setDragging(false);
    useStore.getState().setControlsEnabled(true);
    try { e.target.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    grabRef.current = null;
  };
  const onMove = (e: any) => {
    if (!dragging || !grabRef.current) return;
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(dragPlane, hit)) return;
    const st = useStore.getState();
    const cur = (st.scene.room.partitions || []).find((p: any) => p.id === part.id);
    if (!cur) return;
    let cx = (hit.x - grabRef.current.dx) * 1000;
    let cz = (hit.z - grabRef.current.dz) * 1000;
    const half = cur.lengthMm / 2;
    const halfT = cur.thicknessMm / 2;
    if (cur.rotation === 0) {
      cz = snapNear(cz, others.filter((p: any) => p.rotation === 0).map((p: any) => p.zMm)) ?? Math.round(cz / 50) * 50;
      cz = Math.min(innerZ - halfT, Math.max(-(innerZ - halfT), cz));
      const endTargets = [-innerX, innerX, ...others.filter((p: any) => p.rotation === 90).map((p: any) => p.xMm)];
      const leftSnap = snapNear(cx - half, endTargets);
      const rightSnap = snapNear(cx + half, endTargets);
      cx = leftSnap !== null ? leftSnap + half : rightSnap !== null ? rightSnap - half : Math.round(cx / 50) * 50;
      cx = Math.min(innerX - half, Math.max(-innerX + half, cx));
    } else {
      cx = snapNear(cx, others.filter((p: any) => p.rotation === 90).map((p: any) => p.xMm)) ?? Math.round(cx / 50) * 50;
      cx = Math.min(innerX - halfT, Math.max(-(innerX - halfT), cx));
      const endTargets = [-innerZ, innerZ, ...others.filter((p: any) => p.rotation === 0).map((p: any) => p.zMm)];
      const nearSnap = snapNear(cz - half, endTargets);
      const farSnap = snapNear(cz + half, endTargets);
      cz = nearSnap !== null ? nearSnap + half : farSnap !== null ? farSnap - half : Math.round(cz / 50) * 50;
      cz = Math.min(innerZ - half, Math.max(-innerZ + half, cz));
    }
    st.updatePartition(part.id, { xMm: cx, zMm: cz });
  };

  /** Resize from one end; the MOVING end magnetises to the same targets. */
  const resizeEnd = (movingPositive: boolean) => (delta: number) => {
    const st = useStore.getState();
    const cur = (st.scene.room.partitions || []).find((p: any) => p.id === part.id);
    if (!cur) return;
    const horiz = cur.rotation === 0;
    // Local +X maps to world +X (rot 0) or world -Z (rot 90, per the group rotation).
    const worldDelta = delta * 1000;
    const centre = horiz ? cur.xMm : cur.zMm;
    const half = cur.lengthMm / 2;
    const fixedEnd = movingPositive ? centre - half : centre + half;
    let movingEnd = (movingPositive ? centre + half : centre - half) + worldDelta;
    const endTargets = horiz
      ? [-innerX, innerX, ...others.filter((p: any) => p.rotation === 90).map((p: any) => p.xMm)]
      : [-innerZ, innerZ, ...others.filter((p: any) => p.rotation === 0).map((p: any) => p.zMm)];
    movingEnd = snapNear(movingEnd, endTargets) ?? Math.round(movingEnd / 100) * 100;
    const newL = Math.max(300, Math.abs(movingEnd - fixedEnd));
    const newCentre = (fixedEnd + (movingPositive ? fixedEnd + newL : fixedEnd - newL)) / 2;
    // Keep doors inside the shortened wall.
    const doors = (cur.doors || []).map((dr: any) => ({
      ...dr,
      offsetMm: Math.min(newL / 2 - dr.widthMm / 2 - 50, Math.max(-(newL / 2 - dr.widthMm / 2 - 50), dr.offsetMm)),
    }));
    st.updatePartition(part.id, horiz ? { lengthMm: newL, xMm: newCentre, doors } : { lengthMm: newL, zMm: newCentre, doors });
  };

  /**
   * Internal walls follow the gable instead of stopping short of it.
   *
   * hP is the wall height, which under a gable roof left a triangular gap
   * between the top of every partition and the underside of the roof - you
   * could see straight over the wall into the next room.
   *
   * Two cases, and which one applies depends on how the partition lies
   * relative to the ridge:
   *
   *   ACROSS the slope - the roof height changes along the wall's length, so
   *     the wall needs a pitched top. Built by raising it to the ridge and
   *     cutting the two roof planes off it.
   *   ALONG the ridge - the roof height is the same everywhere along the
   *     wall, so it just needs to be taller. No cutting, no CSG.
   */
  const gRoofH = (room.roofHeightMm ?? 200) / 1000;
  const isGableRoom = room.shape === 'Gable';
  const sideGable = isGableRoom && room.gableOrientation === 'side';
  const roomW = room.widthMm / 1000;
  const roomD = room.depthMm / 1000;
  // Half-span measured across the slope, and the wall's offset from the ridge.
  const halfSpan = (sideGable ? roomD : roomW) / 2;
  const acrossSlope = isGableRoom && (sideGable ? part.rotation === 90 : part.rotation !== 90);
  // Distance from the ridge line to this wall, for the along-ridge case.
  const ridgeOffset = sideGable ? pZ : pX;
  const ridgeY = hP + gRoofH;
  const roofYAt = (u: number) => hP + gRoofH * (1 - Math.min(1, Math.abs(u) / halfSpan));

  /**
   * The wall body stays exactly as it was; the gap is filled by a CAP on top.
   *
   * The first attempt raised the wall to the ridge and tried to cut the two
   * roof planes off it with rotated boxes. Getting that transform wrong does
   * not fail safely - the cut simply misses and the wall stands at full ridge
   * height, straight through the roof, which is what happened.
   *
   * This computes the roof profile directly instead. Along the wall's own x
   * axis the underside of the roof is a known height at every point, so the
   * cap is just that outline extruded through the wall's thickness: no
   * booleans, no rotations, nothing to get subtly wrong. Where the wall runs
   * along the ridge the profile is flat and the same code yields a plain
   * rectangle.
   */
  const boxH = hP;

  /*
   * NOTE: internal walls do NOT yet follow the gable - they stop at wall
   * height and leave a triangular gap to the underside of the roof.
   *
   * Two attempts at closing it have been backed out. The first raised the
   * wall to the ridge and cut the roof planes off with rotated boxes: a wrong
   * transform there does not fail safely, the cut misses and the wall stands
   * through the roof. The second built the cap as an extruded profile, which
   * is the right approach, but it went out in the same build as a black
   * screen and could not be cleared of causing it.
   *
   * Backed out on purpose rather than left in unproven. Reinstate the profile
   * version only alongside someone who can actually see the render.
   */

  const doorHeight = (dr: any) => Math.min(dr.heightMm / 1000, hP - 0.05);
  const viewMode = useStore(s => s.viewMode);

  // The L-shape leg, if any, and which run each door is in.
  const hasLeg = (part.legLengthMm || 0) > 100;
  const legL = hasLeg ? part.legLengthMm / 1000 : 0;
  const le: 1 | -1 = part.legEnd === -1 ? -1 : 1;
  const ld: 1 | -1 = part.legDir === -1 ? -1 : 1;
  const mainDoors = (part.doors || []).filter((dr: any) => !dr.onLeg);
  const legDoors = hasLeg ? (part.doors || []).filter((dr: any) => dr.onLeg) : [];
  // Main-run doors are set out from the CORNER when there is a leg (the end
  // the leg is on), otherwise from the wall's local -X end.
  const refEnd: 1 | -1 = hasLeg ? le : -1;
  const mainFromMm = (dr: any) => Math.round(part.lengthMm / 2 - refEnd * dr.offsetMm - dr.widthMm / 2);
  const mainOffsetFor = (fromMm: number, widthMm: number) => {
    const lim = part.lengthMm / 2 - widthMm / 2 - 50;
    const off = refEnd * (part.lengthMm / 2 - widthMm / 2 - Math.round(fromMm / 10) * 10);
    return Math.min(lim, Math.max(-lim, off));
  };
  /** A leg door's centre in the group's frame; offsetMm is from the corner. */
  const legDoorCentre = (dr: any): [number, number, number] =>
    [le * (pL / 2 - pT / 2), 0, ld * (pT / 2 + dr.offsetMm / 1000 + dr.widthMm / 2000)];

  /**
   * Papered like the room's own walls, with world-scale UVs.
   *
   * This was a flat colour on a plain box: the same hex as the walls but a
   * different surface, which is why a partition read as a duller, unpapered
   * wall standing between papered ones. The geometries are memoised on
   * purpose - an inline geometry inside a <Geometry> rebuilds the boolean on
   * every render (see ceilingGeom).
   */
  const paper = wallpaperProps();
  const mainGeom = useMemo(() => createWorldScaleBoxGeometry(pL, boxH, pT, false, 0, 0, 0), [pL, boxH, pT]);
  const legGeom = useMemo(() => (hasLeg ? createWorldScaleBoxGeometry(pT, boxH, legL, false, 0, 0, 0) : null), [hasLeg, pT, boxH, legL]);
  const wallMat = (
    <meshStandardMaterial
      {...paper}
      color={room.interiorColor || '#ffffff'}
      emissive={isSelected ? '#10b981' : '#000000'}
      emissiveIntensity={isSelected ? 0.18 : 0}
    />
  );

  return (
    <group
      position={[pX, boxH / 2, pZ]}
      rotation={[0, rotAngle, 0]}
      userData={{ partitionId: part.id }}
      onPointerOver={(e: any) => { e.stopPropagation(); useStore.getState().setHoveredElementId(`part-${part.id}`); }}
      onPointerOut={() => useStore.getState().setHoveredElementId(null)}
    >
      {/* onClick stops here on purpose. The ground plane's onClick deselects
          everything, and R3F's click is a separate event from the pointerup
          this mesh already stops - so a click on the wall selected it and
          the plane deselected it in the same instant. "Click a wall and
          nothing happens" was that. */}
      <mesh castShadow receiveShadow onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClick={stopEvt}>
        <Geometry>
          <Base>
            <primitive object={mainGeom} attach="geometry" />
          </Base>
          {/* This wall's OWN doors, cut in local space - they move with it. */}
          {mainDoors.map((dr: any) => (
            <Subtraction key={dr.id} position={[dr.offsetMm / 1000, doorHeight(dr) / 2 - boxH / 2, 0]}>
              <boxGeometry args={[dr.widthMm / 1000, doorHeight(dr), 0.4]} />
            </Subtraction>
          ))}
          {/* Legacy world-positioned interior doors from old saves. */}
          {(room.interiorDoors || []).map((door: any) => {
            const dW = door.widthMm / 1000;
            const dH = door.heightMm / 1000;
            const dx = door.xMm / 1000 - pX;
            const dz = door.zMm / 1000 - pZ;
            const dy = dH / 2 - boxH / 2;
            let localX = dx;
            let localZ = dz;
            if (part.rotation === 90) { localX = -dz; localZ = dx; }
            const relRot = door.rotation === part.rotation ? 0 : Math.PI / 2;
            return (
              <Subtraction key={door.id} position={[localX, dy, localZ]} rotation={[0, relRot, 0]}>
                <boxGeometry args={[dW, dH, 0.4]} />
              </Subtraction>
            );
          })}
        </Geometry>
        {wallMat}
      </mesh>


      {/* L-shape leg: a perpendicular run welded to one end of the main
          wall, so a corner is ONE unit instead of two walls nudged together.
          It shares the group, so body-drag, rotate and selection all treat
          the L as a single wall. A boolean like the main run, so it can take
          doors of its own - it was a plain box that could not. */}
      {hasLeg && legGeom && (
        <mesh
          position={[le * (pL / 2 - pT / 2), 0, ld * (legL / 2 + pT / 2)]}
          castShadow receiveShadow
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClick={stopEvt}
        >
          <Geometry>
            <Base>
              <primitive object={legGeom} attach="geometry" />
            </Base>
            {/* In the leg's own frame the corner is at -ld * legL/2, and a
                door's offsetMm runs from there to its near edge. */}
            {legDoors.map((dr: any) => (
              <Subtraction key={dr.id} position={[0, doorHeight(dr) / 2 - boxH / 2, ld * (dr.offsetMm / 1000 + dr.widthMm / 2000 - legL / 2)]}>
                <boxGeometry args={[0.4, doorHeight(dr), dr.widthMm / 1000]} />
              </Subtraction>
            ))}
          </Geometry>
          {wallMat}
        </mesh>
      )}

      {/* Door frames for this wall's own doors, main run and leg. A door
          with a STYLE is a modelled door set - lining, leaf, ironmongery -
          standing on the floor in the opening, in place of the painted
          frame. */}
      {mainDoors.map((dr: any) => {
        const dW = dr.widthMm / 1000;
        const dH = doorHeight(dr);
        const ox = dr.offsetMm / 1000;
        const oy = dH / 2 - boxH / 2;
        if (dr.style) {
          return (
            <group key={`frame-${dr.id}`} position={[ox, -boxH / 2, 0]}>
              <Suspense fallback={null}>
                <InteriorDoorModel doorId={dr.id} style={dr.style} ironmongery={dr.ironmongery} swing={dr.swing} widthMm={dr.widthMm} heightMm={Math.round(dH * 1000)} thicknessM={pT} />
              </Suspense>
            </group>
          );
        }
        return (
          <group key={`frame-${dr.id}`} position={[ox, oy, 0]}>
            <mesh position={[-dW / 2 + 0.015, 0, 0]} castShadow><boxGeometry args={[0.03, dH, pT + 0.02]} /><meshStandardMaterial color="#e8e2d8" roughness={0.7} /></mesh>
            <mesh position={[dW / 2 - 0.015, 0, 0]} castShadow><boxGeometry args={[0.03, dH, pT + 0.02]} /><meshStandardMaterial color="#e8e2d8" roughness={0.7} /></mesh>
            <mesh position={[0, dH / 2 - 0.015, 0]} castShadow><boxGeometry args={[dW, 0.03, pT + 0.02]} /><meshStandardMaterial color="#e8e2d8" roughness={0.7} /></mesh>
          </group>
        );
      })}
      {legDoors.map((dr: any) => {
        const dW = dr.widthMm / 1000;
        const dH = doorHeight(dr);
        const c = legDoorCentre(dr);
        if (dr.style) {
          return (
            <group key={`frame-${dr.id}`} position={[c[0], -boxH / 2, c[2]]} rotation={[0, Math.PI / 2, 0]}>
              <Suspense fallback={null}>
                <InteriorDoorModel doorId={dr.id} style={dr.style} ironmongery={dr.ironmongery} swing={dr.swing} widthMm={dr.widthMm} heightMm={Math.round(dH * 1000)} thicknessM={pT} />
              </Suspense>
            </group>
          );
        }
        return (
          <group key={`frame-${dr.id}`} position={[c[0], dH / 2 - boxH / 2, c[2]]} rotation={[0, Math.PI / 2, 0]}>
            <mesh position={[-dW / 2 + 0.015, 0, 0]} castShadow><boxGeometry args={[0.03, dH, pT + 0.02]} /><meshStandardMaterial color="#e8e2d8" roughness={0.7} /></mesh>
            <mesh position={[dW / 2 - 0.015, 0, 0]} castShadow><boxGeometry args={[0.03, dH, pT + 0.02]} /><meshStandardMaterial color="#e8e2d8" roughness={0.7} /></mesh>
            <mesh position={[0, dH / 2 - 0.015, 0]} castShadow><boxGeometry args={[dW, 0.03, pT + 0.02]} /><meshStandardMaterial color="#e8e2d8" roughness={0.7} /></mesh>
          </group>
        );
      })}

      {showDims && isSelected && (
        <>
          {/* End handles: red, on the wall's local X axis ends. Local +X is
              world +X for rot 0 and world -Z for rot 90, so the drag axis and
              delta sign map accordingly. */}
          <DragHandle elementId={`part-${part.id}`} position={[pL / 2, 0, 0]} axis={part.rotation === 0 ? 'x' : 'z'} color="#ff0000" visualAxis="x" snapInterval={0.05}
            onChange={(d) => resizeEnd(true)(part.rotation === 0 ? d : -d)} />
          <DragHandle elementId={`part-${part.id}`} position={[-pL / 2, 0, 0]} axis={part.rotation === 0 ? 'x' : 'z'} color="#ff0000" visualAxis="x" snapInterval={0.05}
            onChange={(d) => resizeEnd(false)(part.rotation === 0 ? d : -d)} />
          {/* Leg tip handle: blue, resizes the L-shape leg. Local +Z maps to
              world +Z (rot 0) or world +X (rot 90). */}
          {(part.legLengthMm || 0) > 100 && (
            <DragHandle elementId={`part-${part.id}`}
              position={[(part.legEnd === -1 ? -1 : 1) * (pL / 2 - pT / 2), 0, (part.legDir === -1 ? -1 : 1) * (part.legLengthMm / 1000 + pT / 2)]}
              axis={part.rotation === 0 ? 'z' : 'x'} color="#2563eb" visualAxis="z" snapInterval={0.05}
              onChange={(d) => {
                const st = useStore.getState();
                const cur = (st.scene.room.partitions || []).find((p: any) => p.id === part.id);
                if (!cur) return;
                const localDz = cur.rotation === 0 ? d : d; // world z (rot 0) / world x (rot 90) both map to local +z
                const dirSign = cur.legDir === -1 ? -1 : 1;
                const next = Math.max(300, Math.round((cur.legLengthMm + dirSign * localDz * 1000) / 100) * 100);
                st.updatePartition(part.id, { legLengthMm: next });
              }} />
          )}
          {/* Door slide handles: green, above each opening. */}
          {mainDoors.map((dr: any) => (
            <DragHandle key={`slide-${dr.id}`} elementId={`part-${part.id}`} position={[dr.offsetMm / 1000, hP / 2 + 0.18, 0]} axis={part.rotation === 0 ? 'x' : 'z'} color="#10b981" visualAxis="x" snapInterval={0.05}
              onChange={(d) => {
                const st = useStore.getState();
                const cur = (st.scene.room.partitions || []).find((p: any) => p.id === part.id);
                if (!cur) return;
                const curDr = (cur.doors || []).find((x: any) => x.id === dr.id);
                if (!curDr) return;
                const local = part.rotation === 0 ? d : -d;
                const lim = cur.lengthMm / 2 - curDr.widthMm / 2 - 50;
                const next = Math.min(lim, Math.max(-lim, Math.round((curDr.offsetMm + local * 1000) / 50) * 50));
                st.updatePartitionDoor(part.id, dr.id, { offsetMm: next });
              }} />
          ))}
          {/* The same for doors in the leg, sliding along it. Local +Z is
              world +Z at rotation 0 and world +X at rotation 90 - the mapping
              the leg tip handle uses. */}
          {legDoors.map((dr: any) => {
            const c = legDoorCentre(dr);
            return (
              <DragHandle key={`slide-${dr.id}`} elementId={`part-${part.id}`} position={[c[0], hP / 2 + 0.18, c[2]]} axis={part.rotation === 0 ? 'z' : 'x'} color="#10b981" visualAxis="z" snapInterval={0.05}
                onChange={(d) => {
                  const st = useStore.getState();
                  const cur = (st.scene.room.partitions || []).find((p: any) => p.id === part.id);
                  const curDr = cur && (cur.doors || []).find((x: any) => x.id === dr.id);
                  if (!cur || !curDr) return;
                  const lim = cur.legLengthMm - curDr.widthMm - 50;
                  const next = Math.min(lim, Math.max(50, Math.round((curDr.offsetMm + ld * d * 1000) / 50) * 50));
                  st.updatePartitionDoor(part.id, dr.id, { offsetMm: next });
                }} />
            );
          })}
        </>
      )}

      {/*
        Doors placed ON the wall. Select it and each run - the main length,
        and the leg of an L - offers "+ Door" above its middle; every door
        carries a label with its distance from the corner (or the end, on a
        straight wall) that you click and type into, a swap to the other run,
        and remove. Above the wall's top so the wall's own panel cannot cover
        it, and not in the walkthrough, where a click is the paint brush.
      */}
      {isSelected && viewMode !== 'walking' && (() => {
        const st = useStore.getState;
        const clampLeg = (mm: number, widthMm: number) => Math.min(part.legLengthMm - widthMm - 50, Math.max(50, Math.round(mm / 10) * 10));
        const putOn = (doorId: string, leg: boolean, widthMm: number) =>
          st().updatePartitionDoor(part.id, doorId, leg
            ? { onLeg: true, offsetMm: clampLeg((part.legLengthMm - widthMm) / 2, widthMm) }
            : { onLeg: false, offsetMm: 0 });
        const addOn = (leg: boolean) => {
          st().addPartitionDoor(part.id);
          const cur = (st().scene.room.partitions || []).find((p: any) => p.id === part.id);
          const nd = cur && cur.doors && cur.doors[cur.doors.length - 1];
          if (nd) putOn(nd.id, leg, nd.widthMm);
        };
        const chipY = hP / 2 + 0.72;
        const labelY = hP / 2 + 0.42;
        const fromWord = hasLeg ? 'corner' : 'end';
        return (
          <>
            <Html position={[0, chipY, 0]} center zIndexRange={[125, 0]}>
              <button style={{ pointerEvents: 'auto' }} onPointerDown={stopEvt} onClick={(e) => { e.stopPropagation(); addOn(false); }} className={`${CHIP} ${CHIP_BTN}`} title="Add a door to this wall">+ Door</button>
            </Html>
            {hasLeg && (
              <Html position={[le * (pL / 2 - pT / 2), chipY, ld * (legL / 2 + pT / 2)]} center zIndexRange={[125, 0]}>
                <button style={{ pointerEvents: 'auto' }} onPointerDown={stopEvt} onClick={(e) => { e.stopPropagation(); addOn(true); }} className={`${CHIP} ${CHIP_BTN}`} title="Add a door to the leg">+ Door</button>
              </Html>
            )}
            {mainDoors.map((dr: any) => (
              <Html key={`lbl-${dr.id}`} position={[dr.offsetMm / 1000, labelY, 0]} center zIndexRange={[130, 0]}>
                <DoorLabel
                  mm={mainFromMm(dr)} from={fromWord}
                  onCommit={(mm) => st().updatePartitionDoor(part.id, dr.id, { offsetMm: mainOffsetFor(mm, dr.widthMm) })}
                  onRemove={() => st().removePartitionDoor(part.id, dr.id)}
                  onSwap={hasLeg ? () => putOn(dr.id, true, dr.widthMm) : undefined} swapLabel="→ leg"
                />
              </Html>
            ))}
            {legDoors.map((dr: any) => {
              const c = legDoorCentre(dr);
              return (
                <Html key={`lbl-${dr.id}`} position={[c[0], labelY, c[2]]} center zIndexRange={[130, 0]}>
                  <DoorLabel
                    mm={dr.offsetMm} from="corner"
                    onCommit={(mm) => st().updatePartitionDoor(part.id, dr.id, { offsetMm: clampLeg(mm, dr.widthMm) })}
                    onRemove={() => st().removePartitionDoor(part.id, dr.id)}
                    onSwap={() => putOn(dr.id, false, dr.widthMm)} swapLabel="→ main"
                  />
                </Html>
              );
            })}
          </>
        );
      })()}
    </group>
  );
}

export function RoomGeometry() {
  const roomStore = useStore(s => s.scene.room);
  const viewModeStore = useStore(s => s.viewMode);
  // The plan IS the dimensioned drawing: it always carries its dimensions.
  // The toggle governs the 3D view, and nothing is dimensioned in a render.
  const room = { ...roomStore, showDimensions: (roomStore.showDimensions || viewModeStore === 'plan') && viewModeStore !== 'render' };
  const { selectedElementId, setSelectedElementId, updateDoor, updateWindow, setControlsEnabled, viewMode, controlsEnabled } = useStore(useShallow(s => ({
    selectedElementId: s.selectedElementId,
    setSelectedElementId: s.setSelectedElementId,
    updateDoor: s.updateDoor,
    updateWindow: s.updateWindow,
    setControlsEnabled: s.setControlsEnabled,
    viewMode: s.viewMode,
    controlsEnabled: s.controlsEnabled
  })));
  const isPlanView = viewMode === 'plan' || viewMode === 'lighting';
  const isNight = useStore(s => s.nightPreview);
  // Every dimension the shell is built from goes through `mm`: a value that
  // is not a finite number takes the fallback instead of poisoning the
  // boolean. Math.max(0.5, NaN) is NaN, and one NaN input is enough to make
  // the walls draw nothing without a single error (see SafeCsg).
  const mm = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const w = Math.max(0.5, mm(room.widthMm, 8000) / 1000);
  const d = Math.max(0.5, mm(room.depthMm, 4300) / 1000);

  const wallThickness = mm(room.wallThicknessMm || 150, 150) / 1000;
  
  const isUltraSlim = room.frameStyle === 'ultra-slim';
  const isSlim = room.frameStyle === 'slim' || isUltraSlim;
  const frameThickness = isUltraSlim ? 0.015 : (room.frameStyle === 'slim' ? 0.025 : 0.04);
  const sashThickness = isUltraSlim ? 0.015 : (room.frameStyle === 'slim' ? 0.025 : 0.08);
  const frameDepth = 0.07; // 70mm deep frame, typical aluminum window


  // Canopy overhang
  const isCanopy = room.hasCanopy || room.hasPictureFrame;
  const ohFront = isCanopy ? (room.canopySizeMm ? room.canopySizeMm/1000 : 0) : 0;
  const ohBack = room.overhangBackMm ? room.overhangBackMm/1000 : 0;
  const ohLeft = room.overhangLeftMm ? room.overhangLeftMm/1000 : 0;
  const ohRight = room.overhangRightMm ? room.overhangRightMm/1000 : 0;

  const roofW = w + ohLeft + ohRight;
  const roofD = d + ohBack + ohFront;
  const roofX = (ohRight - ohLeft) / 2;
  const roofZ = (ohFront - ohBack) / 2;

  const isDecking = room.hasDecking || room.hasPictureFrame;
  let deckFront = 0, deckLeft = 0, deckRight = 0;
  if (isDecking) {
    deckFront = (room.deckingSizeMm ?? 1500) / 1000;
    // Side extensions widen the deck slab only. The roof (canopy and
    // overhangs) is sized from w above and never sees these.
    deckLeft = Math.max(0, room.deckingLeftMm ?? 0) / 1000;
    deckRight = Math.max(0, room.deckingRightMm ?? 0) / 1000;
  }

  const baseW = w + ohLeft + ohRight + deckLeft + deckRight;
  const baseD = d + ohBack + deckFront;
  const baseX = (ohRight + deckRight - ohLeft - deckLeft) / 2;
  const baseZ = (deckFront - ohBack) / 2;

  // LShape dimensions
  const isLShape = room.shape === 'LShape';
  const cutW = isLShape ? Math.min(((room.lShapeCutoutWidthMm ?? 2000) / 1000), w - 0.35) : 0;
  const cutD = isLShape ? Math.min(((room.lShapeCutoutDepthMm ?? 1500) / 1000), d - 0.35) : 0;


  // Heights and pitch
  const isGable = room.shape === 'Gable';
  const roofHRaw = mm(room.roofHeightMm ?? 200, 200) / 1000;

  // baseH must be declared before the gable height calculation below uses it.
  // It previously sat ~60 lines further down, which put this reference inside
  // the const's temporal dead zone. Because the ternary short-circuits, the Box
  // shape never evaluated that branch and looked fine — but selecting Gable
  // threw "Cannot access 'baseH' before initialization" during render, which
  // unmounted the whole 3D scene and left a black screen.
  const baseH = mm(room.baseHeightMm ?? 100, 100) / 1000;

  // For Gable, room.heightMm is the TOTAL height (base + wall + roof)
  // Therefore wall height = total height - base - roof
  const heightM = mm(room.heightMm, 2050) / 1000;
  const frontH = isGable
    ? heightM - baseH - roofHRaw
    : heightM;

  const backH = isGable
    ? frontH
    : mm(room.backHeightMm ?? room.heightMm, mm(room.heightMm, 2050)) / 1000;

  const isPitched = Math.abs(frontH - backH) > 0.001;
  const roofPitch = isPitched ? Math.atan2(backH - frontH, d) : 0;
  const maxH = Math.max(frontH, backH);
  // Side-orientation gable: ridge runs left-to-right, apex triangles on the
  // side walls (the annexe look). The slope then spans the DEPTH, so every
  // "across the slope" dimension switches from w/ohLeft/ohRight to
  // d/ohFront/ohBack, and the run along the ridge from roofD to roofW.
  const isSideGable = isGable && room.gableOrientation === 'side';
  const gSpan = isSideGable ? d : w;
  const gOhLow1 = isSideGable ? ohFront : ohLeft;
  const gOhLow2 = isSideGable ? ohBack : ohRight;
  const gRunLen = isSideGable ? roofW : roofD;
  const gablePitch = isGable ? Math.atan2(roofHRaw, gSpan/2) : 0;

  
  const hoveredElementId = useStore((s) => s.hoveredElementId);
  const isHoveredRoom = hoveredElementId === 'room';

  // Quba mono-pitch slope
  const isQuba = room.shape === 'Quba';
  const isTShape = false;
  const isCornerCut = false;
  const tCutW = 0;
  const tCutD = 0;
  const cornerCutSize = 0;


  // Base h for backward compatibility in variables
  const h = maxH; 
  
  const isVertical = room.claddingOrientation !== 'vertical';
  const texFront = useRealMaterial(room.claddingFront || room.cladding || 'timber', w, frontH, 0);
  const texBack = useRealMaterial(room.claddingBack || room.cladding || 'timber', w, backH, 0);
  const texLeft = useRealMaterial(room.claddingLeft || room.cladding || 'timber', d, maxH, 0);
  const texRight = useRealMaterial(room.claddingRight || room.cladding || 'timber', d, maxH, 0);
  const texRoof = useRealMaterial(room.roofMaterial || 'epdm', roofW, roofD, 0);
  const texBase = useRealMaterial(room.baseMaterial || 'concrete', baseW, baseD, 0);
  // Falls back to the cladding's DECKING equivalent, not the cladding key
  // itself - see resolveDeckingKey. Reusing the cladding key laid the vertical
  // slat texture across the deck instead of decking boards.
  const texDecking = useDeckTexture(resolveDeckingKey(room.deckingMaterial, room.cladding));
  /*
   * The outdoor section (utils/bay): a slice off one end, inside the same
   * shell. `enc` is the enclosed room's inner x-range - the whole interior
   * when there is no bay - and the floor, tongues and walkable area use it.
   */
  const bay = useMemo(() => bayRange(room), [room.bay, room.widthMm, room.wallThicknessMm]);
  const enc = useMemo(() => enclosedRange(room), [room.bay, room.widthMm, room.wallThicknessMm]);
  const encW = enc.x1 - enc.x0;
  const encCx = (enc.x0 + enc.x1) / 2;
  const bayW = bay ? bay.width : 1;
  const bayCx = bay ? (bay.x0 + bay.x1) / 2 : 0;
  const bayKey = bay ? `${bay.side}:${bay.width.toFixed(3)}:${bay.depth.toFixed(3)}:${room.bay?.screen ?? 'solid'}:${room.bay?.backWall ?? 'solid'}` : '';
  /**
   * An opening that would sit in wall the bay has removed: on the front
   * wall over the bay (or its divider), or anywhere on the end wall once
   * that is a screen or open. Such a door or window stays in the design -
   * turn the bay off and it is back - but it is neither drawn nor cut, so
   * it cannot hang in mid-air across the open section.
   */
  const openingInBay = (o: { wall: string; offsetMm?: number; widthMm: number }) => openingRemovedByBay(room, bay, o);
  const texFloor = useRealMaterial(resolveFloorKey(room.interiorFloorType), encW, d, 0);
  // The bay's wall finish, for the cut faces the bay's own cuts leave
  // INSIDE it (the back corner where the end wall was) - see the brushes.
  const texBayWall = useRealMaterial(room.bay?.wallFinish === 'cladding' && room.bay.wallCladding ? room.bay.wallCladding : (room.claddingBack || room.cladding || 'timber'), w, h, 0);
  const bayWallBrushMat = room.bay?.wallFinish === 'render'
    ? <meshStandardMaterial color={room.bay.wallColour ?? '#e8e4dc'} roughness={0.85} metalness={0} />
    : <meshStandardMaterial color="#ffffff" metalness={0.1} {...texBayWall} bumpScale={0.1} />;

  /**
   * One floor tongue per door and per floor-level window: the reveal between
   * the slab's edge (inner wall face) and the frame's inner face (the frame
   * is frameDepth deep, on the outer face). Sized exactly - it touches the
   * slab rather than overlapping it, so nothing is coplanar - and keyed by
   * the opening so a moved door gets a fresh piece under it.
   */
  const floorTongues = useMemo(() => {
    // The slab is the ENCLOSED room's: with a bay it is narrower than the
    // building and centred on the room, and the UVs are written in its frame.
    const sw = encW, sd = d - wallThickness * 2;
    const reveal = wallThickness - frameDepth;
    if (reveal <= 0.001) return [];
    const openings = [
      // Divider doors have their own threshold; the slab does not run into them.
      ...(room.doors || []).filter(o => !openingInBay(o) && o.wall !== 'bay').map(o => ({ key: `door-${o.id}`, wall: o.wall, offset: o.offsetMm / 1000, width: o.widthMm / 1000 })),
      ...(room.windows || []).filter(o => (o.sillMm ?? 0) < 1 && !openingInBay(o) && o.wall !== 'bay').map(o => ({ key: `win-${o.id}`, wall: o.wall, offset: (o.offsetMm ?? 0) / 1000, width: o.widthMm / 1000 })),
    ];
    return openings.map(o => {
      // The piece's centre: half a reveal inside the inner wall face.
      let x = 0, z = 0, gw = o.width, gd = reveal;
      if (o.wall === 'front') { x = o.offset; z = d/2 - wallThickness + reveal/2; }
      else if (o.wall === 'back') { x = o.offset; z = -(d/2 - wallThickness + reveal/2); }
      else if (o.wall === 'left') { x = -(w/2 - wallThickness + reveal/2); z = o.offset; gw = reveal; gd = o.width; }
      else { x = w/2 - wallThickness + reveal/2; z = o.offset; gw = reveal; gd = o.width; }
      return { key: o.key, x, z, geom: floorTongueGeometry(gw, gd, x - encCx, z, sw, sd) };
    });
  }, [room.doors, room.windows, w, d, wallThickness, frameDepth, encW, encCx, bayKey]);

  const isVert = room.claddingOrientation !== 'vertical';
  const geomFrontWall = useMemo(() => createCladdingGeometry(w, frontH, isVert), [w, frontH, isVert]);
  const geomBackWall = useMemo(() => createCladdingGeometry(w, backH, isVert), [w, backH, isVert]);
  const geomLeftWall = useMemo(() => createCladdingGeometry(d, maxH, isVert), [d, maxH, isVert]);
  const geomRightWall = useMemo(() => createCladdingGeometry(d, maxH, isVert), [d, maxH, isVert]);
  const geomDecking = useMemo(() => createDeckingGeometry(baseW, deckFront), [baseW, deckFront]);

  // The inside faces come from this brush, so it is what has to carry the
  // wallpaper - and it needs world-scale UVs, or one tile would stretch across
  // a whole wall and the paper would be a different size on every elevation.
  const interiorCutGeom = useMemo(
    () => createWorldScaleBoxGeometry(w - wallThickness * 2, h + 1, d - wallThickness * 2, false, 0, 0, 0),
    [w, d, h, wallThickness],
  );
  const paper = wallpaperProps();

  /**
   * Geometry for a brush whose CUT FACE becomes an interior surface.
   *
   * A CSG cut face takes the material AND the UVs of the operand that cut it.
   * These brushes were plain boxes with plain colour, so the ceiling, the wall
   * tops and every door and window reveal came out the same hex as the walls
   * but a completely different SURFACE - no paper, different roughness - which
   * is why a room read as several shades of the one colour. World-scale UVs
   * here, and the paper on the material, make them all one wall finish.
   */
  const interiorCut = (cw: number, ch: number, cd: number) =>
    createWorldScaleBoxGeometry(cw, ch, cd, false, 0, 0, 0);

  /**
   * The flat/pitched ceiling slab, memoised.
   *
   * This was an inline interiorCut() call in the JSX, which built a NEW
   * geometry on every render of RoomGeometry - and RoomGeometry re-renders
   * on every store change, including every pointer-move of a drag. A new
   * geometry means a new uuid in SafeCsg's fingerprint, so the ceiling's
   * boolean was torn down and rebuilt on every frame of dragging anything:
   * measured 20 rebuilds for 20 moves of a toilet. That per-frame dispose
   * and swap is what flashed. Every other interiorCut() call sits inside
   * the shell's own memo and only runs when the shell changes.
   */
  const ceilingGeom = useMemo(
    () => interiorCut(
      w - wallThickness * 2,
      0.01,
      isPitched && !isGable ? Math.sqrt((frontH - backH) ** 2 + d ** 2) - wallThickness * 2 : d - wallThickness * 2,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [w, d, wallThickness, isPitched, isGable, frontH, backH],
  );



  const isDeckingMaterial = room.hasDecking || room.hasPictureFrame || room.baseMaterial === 'timber_decking' || room.baseMaterial === 'composite_decking';

  const baseMaterialColors: Record<string, string> = { concrete: '#8a8d8f', timber_decking: '#a3794a', composite_decking: '#545a5e' };
  const roofMaterialColors: Record<string, string> = { epdm: '#222222', sedum: '#2d3032', upvc: '#d3d5d7', metal: '#6a6d70', rubber: '#1c1c1c', aluminium: '#26282b' };
  
  const baseColorHex = baseMaterialColors[room.baseMaterial as string] || '#8a8d8f';
  // An explicit roofColor overrides the colour implied by the roof material, so
  // the roof and the fascia can be specified independently rather than the roof
  // being locked to whatever its material happens to be.
  const roofColorHex = (room as any).roofColor || roofMaterialColors[room.roofMaterial as string] || '#222222';
  // Coverings with a real surface map get it on the roof's top face; EPDM
  // and the old ids stay a flat colour (sedum lays its own mat on top).
  const texturedRoof = room.roofMaterial === 'rubber' || room.roofMaterial === 'aluminium';
  const frameColorHex = frameColourHex(room.frameColor);
  // Inside face of every frame member. Falls back to the outside colour, so a
  // design saved before the split renders exactly as it did.
  const frameColorInnerHex = frameColourHex(room.frameColorInner ?? room.frameColor);

  // baseH is declared with the other height calculations further up.
  const roofH = (room.roofHeightMm ?? 200) / 1000;
  /** Thickness of the sloped roof slabs - they are as deep as their visible
   *  bargeboard. Declared here rather than with the roof, because the ceiling
   *  hangs off the underside of these slabs and is worked out further up. */
  const gableFascia = Math.min(0.4, Math.max(0.05, (room.gableFasciaMm ?? 100) / 1000));

  const cutBoxSize = 50;
  // LShape
  const cutBoxPosX = (w/2 - cutW + ohRight) - roofX + cutBoxSize/2;
  const cutBoxPosZ = (d/2 - cutD + ohFront) - roofZ + cutBoxSize/2;
  const baseCutBoxPosX = (w/2 - cutW + ohRight) - baseX + cutBoxSize/2;
  const baseCutBoxPosZ = (d/2 - cutD + deckFront) - baseZ + cutBoxSize/2;

  // TShape
  const tCutBoxPosXRight = (w/2 - tCutW + ohRight) - roofX + cutBoxSize/2;
  const tCutBoxPosXLeft = (-w/2 + tCutW - ohLeft) - roofX - cutBoxSize/2;
  const tCutBoxPosZ = (d/2 - tCutD + ohFront) - roofZ + cutBoxSize/2;
  const baseTCutBoxPosXRight = (w/2 - tCutW + ohRight) - baseX + cutBoxSize/2;
  const baseTCutBoxPosXLeft = (-w/2 + tCutW - ohLeft) - baseX - cutBoxSize/2;
  const baseTCutBoxPosZ = (d/2 - tCutD + deckFront) - baseZ + cutBoxSize/2;

  // CornerCut
  const cornerCutBoxPosX = w/2 - roofX;
  const cornerCutBoxPosZ = d/2 - roofZ;
  const baseCornerCutBoxPosX = w/2 - baseX;
  const baseCornerCutBoxPosZ = d/2 - baseZ;

  const floorBaseGeom = useMemo(() => createWorldScaleBoxGeometry(baseW, baseH, baseD, false, 0, 0, 0), [baseW, baseH, baseD]);
  const lShapeBaseCutGeom = useMemo(() => createWorldScaleBoxGeometry(cutBoxSize, baseH + 1, cutBoxSize, false, 0, 0, 0), [cutBoxSize, baseH]);
  
  const pfHeight = isGable ? h+roofH : h+0.05;
  const pfLeftGeom = useMemo(() => createWorldScaleBoxGeometry(wallThickness + 0.002, pfHeight + 0.002, ohFront + 0.01, false, -w/2 + wallThickness/2, 0, d/2 + ohFront/2 - 0.005, isVertical), [wallThickness, pfHeight, ohFront, w, d, isVertical]);
  const pfRightGeom = useMemo(() => createWorldScaleBoxGeometry(wallThickness + 0.002, pfHeight + 0.002, ohFront + 0.01, false, w/2 - wallThickness/2, 0, d/2 + ohFront/2 - 0.005, isVertical), [wallThickness, pfHeight, ohFront, w, d, isVertical]);
  const pfTopGeom = useMemo(() => createWorldScaleBoxGeometry(w + 0.002, 0.3 + 0.002, ohFront + 0.01, false, 0, pfHeight - 0.3, d/2 + ohFront/2 - 0.005, isVertical), [w, ohFront, pfHeight, d, isVertical]);

  const claddingBoxGeom = useMemo(() => createWorldScaleBoxGeometry(w, h + 0.05, d, true, 0, 0, 0, isVertical), [w, h, d, isVertical]);
  const gableTriangleGeom = useMemo(() => createWorldScaleGableGeometry(gSpan, roofH, wallThickness, 0, h + 0.05, 0, isVertical), [gSpan, roofH, wallThickness, h, isVertical]);

  /**
   * The apex liner: a thin painted triangle laid on the INSIDE face of each
   * gable end, so the apex reads as wall from within the room rather than as
   * cladding carried on up.
   *
   * Not a CSG cut. The cut was the same triangle as the apex itself, so its
   * two sloping faces were exactly coplanar with the apex's - and a coplanar
   * subtraction is the one case CSG cannot classify, so it took the whole
   * gable end away instead of shaving the inside of it. A liner has nothing to
   * classify: it is a separate mesh sitting in front of the face it covers.
   */
  const gableLinerGeom = useMemo(
    () => createWorldScaleGableGeometry(gSpan, roofH, GABLE_LINER_T, 0, h + 0.05, 0, isVertical),
    [gSpan, roofH, h, isVertical],
  );
  /**
   * The gable ceiling, as a list of panels.
   *
   * A gable room had no ceiling at all, so from inside you were looking at the
   * underside of the roof slabs - which wear the ROOF colour, and read as a
   * dark lid over a white room. The roof planes themselves cannot simply be
   * repainted underneath: they overhang the walls, and that same underside is
   * the external soffit.
   *
   * So the ceiling is lined, like the apex is. Everything below is worked in
   * the gable's own frame - u across the span, v along the ridge - and the
   * group carries the same Y rotation the roof group does, so one set of
   * numbers serves both ridge orientations.
   *
   * Vaulted (the default) is two sloped panels following the pitch. Flat is a
   * level panel across the middle, and - if it sits above the wall head - the
   * pitch still showing as a strip at each eaves, because that is where the
   * roof genuinely is. Drop the height to the wall head and those strips close
   * up into an ordinary flat ceiling.
   */
  const gableCeiling = useMemo(() => {
    if (!isGable) return null;
    const spanHalf = gSpan / 2;
    const halfU = spanHalf - wallThickness;
    const halfV = (isSideGable ? w : d) / 2 - wallThickness;
    if (halfU <= 0.01 || halfV <= 0.01 || roofH <= 0.001) return null;

    const wallTop = h + 0.025;
    const pitch = Math.atan2(roofH, spanHalf);

    /*
     * Where the roof's UNDERSIDE is, at a given distance from the ridge.
     *
     * The gable triangle's sloping edge is not it. Two things sit between:
     * the roof group hangs off the wall height h while the triangle starts
     * 25mm higher at the wall head, and the slabs then straddle their own
     * centre line by half a bargeboard. Sitting the ceiling on the triangle's
     * edge buried it inside the slab, so from in the room you still saw the
     * dark roof - exactly what this was meant to cover. (Measured against the
     * live scene: on an 8m span with a 1m rise, predicted 2.6485 and the roof
     * came back at 2.648.)
     */
    const perp = Math.cos(pitch);
    const roofUnder = (u: number) =>
      wallTop + roofH * (1 - Math.abs(u) / spanHalf) - 0.025 - (gableFascia / 2) / perp;
    // Centre of a ceiling panel hung just clear of that underside.
    const soffit = (u: number) => roofUnder(u) - (GABLE_CEILING_T / 2) / perp - 0.006;

    // Where the flat panel stops: the point at which the roof drops below it.
    // Zero when vaulted, or when the ceiling is asked for above the ridge.
    let flatY = 0;
    let uFlat = 0;
    if (room.gableFlatCeiling) {
      // This whole group already sits on the finished floor, so these heights
      // need no base added - they ARE the height a customer would measure.
      // Positioned by its UNDERSIDE, above the floor finish - so the height on
      // the slider is the height you would measure standing in the room, not
      // the height of the middle of a board.
      const asked = (room.gableCeilingHeightMm ?? 2400) / 1000;
      flatY = Math.max(1.8, Math.min(0.01 + asked + GABLE_CEILING_T / 2, soffit(0)));
      // Where the pitch drops past the flat panel - solved on the same line
      // the sloped strips hang from, so the two meet flush instead of
      // stepping. soffit(u) = flatY, rearranged for u.
      const rise = flatY + 0.025 + (gableFascia / 2) / perp + (GABLE_CEILING_T / 2) / perp + 0.006 - wallTop;
      uFlat = Math.max(0, Math.min(halfU, spanHalf * (1 - rise / roofH)));
    }

    /*
     * World-scale UVs, exactly as the walls have.
     *
     * A plain boxGeometry carries 0-1 UVs, but the wallpaper is tiled by the
     * metre - so on a panel metres wide the paper stretched to a single
     * enormous tile and the ceiling read as a different, much coarser
     * material than the walls it meets. This is the same helper the interior
     * cut uses, so the two now share one mapping.
     */
    const panels: { pos: [number, number, number]; rotZ: number; geom: THREE.BufferGeometry }[] = [];
    const slab = (len: number, wide: number, offU: number) =>
      createWorldScaleBoxGeometry(len, GABLE_CEILING_T, wide, false, offU, 0, 0);

    if (uFlat > 0.001) {
      panels.push({ pos: [0, flatY, 0], rotZ: 0, geom: slab(uFlat * 2, halfV * 2, 0) });
    }
    // A sloped strip each side, from where the flat panel ends out to the wall.
    if (halfU - uFlat > 0.001) {
      for (const side of [-1, 1]) {
        const mid = side * (uFlat + halfU) / 2;
        panels.push({
          pos: [mid, soffit(mid), 0],
          // +X rises on the left of the ridge and falls on the right, matching
          // the roof slabs above.
          rotZ: side < 0 ? pitch : -pitch,
          geom: slab((halfU - uFlat) / Math.cos(pitch), halfV * 2, mid),
        });
      }
    }
    return panels;
  }, [isGable, gSpan, wallThickness, isSideGable, w, d, roofH, h, gableFascia,
      room.gableFlatCeiling, room.gableCeilingHeightMm]);

  const lShapeCutOuterGeom = useMemo(() => createWorldScaleBoxGeometry(cutW + 0.2, h + 1, cutD + 0.2, false, 0, 0, 0, isVertical), [cutW, cutD, h, roofH, isGable, isVertical]);
  // Roof plan size is exactly roofW x roofD (wall footprint + user overhangs).
  // A 100mm lip was previously baked in here (+0.2), so even with every
  // overhang at 0 the roof was never flush — overhang is now entirely the
  // user's Overhangs & Canopy setting.
  // Six material groups, one per face: the fascia takes each elevation's own
  // cladding when set to match, and with a single group the boolean below
  // painted every edge with material 0 - the right-hand side's cladding -
  // so a corrugated back wall got a cedar fascia.
  const roofFlatGeom = useMemo(() => createWorldScaleBoxGeometry(roofW, roofH, roofD, true, 0, 0, 0), [roofW, roofH, roofD]);
  // The slab thickness IS the visible fascia (bargeboard) depth on a gable -
  // user-adjustable, 100mm by default. Every roof edge overhangs 50mm: the
  // slabs run 50mm past both gable ends and 50mm past the eaves, like a real
  // roof line, instead of finishing dead flush with the cladding.
  const ROOF_LIP = 0.05;
  const roofGableLeftGeom = useMemo(() => createWorldScaleBoxGeometry((gSpan/2 + gOhLow1) / Math.cos(gablePitch) + ROOF_LIP, gableFascia, gRunLen + ROOF_LIP * 2, false, 0, 0, 0), [gSpan, gOhLow1, gablePitch, gRunLen, gableFascia]);
  const roofGableRightGeom = useMemo(() => createWorldScaleBoxGeometry((gSpan/2 + gOhLow2) / Math.cos(gablePitch) + ROOF_LIP, gableFascia, gRunLen + ROOF_LIP * 2, false, 0, 0, 0), [gSpan, gOhLow2, gablePitch, gRunLen, gableFascia]);


  const renderBaseMeshes = () => {
    const materialProps = isDeckingMaterial ? {
      // Was hardcoded to "#ffffff", which discarded the chosen material's colour
      // entirely - every decking option rendered as the untinted texture, so
      // black composite came out pale.
      color: texDecking.color,
      map: texDecking.map,
      roughnessMap: texDecking.roughnessMap,
      normalMap: texDecking.normalMap, aoMap: texDecking.aoMap,
      
    } : {
      color: baseColorHex,
      roughness: 0.9,
      metalness: 0.1,
      
      
    };

    /**
     * The plinth IS the floor you stand on, so it carries isFloor.
     *
     * The floor-finish mesh sits at y=0.005 inside a plinth that runs from 0
     * to baseH - buried. The surface actually under your feet in the
     * walkthrough is this base. Before the shell was pickable a click here
     * matched nothing and the ray carried on until it found the buried
     * isFloor mesh, which is why the floor panel used to open; once the shell
     * became pickable this got there first and opened the WALL panel instead.
     * Marking it for what it is fixes that at the source.
     */
    const pointerEvents = {
      userData: { isFloor: true },
      onPointerOver: (e: any) => { e.stopPropagation(); useStore.getState().setHoveredElementId('room'); },
      onPointerOut: () => useStore.getState().setHoveredElementId(null)
    };

    if (isLShape) {
      const leftW = baseW - cutW;
      const leftD = baseD;
      const leftX = baseX - baseW/2 + leftW/2;
      const leftZ = baseZ;

      const rightW = cutW;
      const rightD = baseD - cutD;
      const rightX = baseX + baseW/2 - rightW/2;
      const rightZ = baseZ + baseD/2 - rightD/2;

      return (
        <group {...pointerEvents}>
          <mesh position={[leftX, baseH/2, leftZ]} receiveShadow>
            <primitive object={createWorldScaleBoxGeometry(leftW, baseH, leftD, false, leftX, 0, leftZ)} attach="geometry" />
            <meshStandardMaterial key={`${room.deckingMaterial || room.cladding || 'default'}-${room.baseMaterial}-${isDeckingMaterial}`} attach="material" {...materialProps} />
          </mesh>
          <mesh position={[rightX, baseH/2, rightZ]} receiveShadow>
            <primitive object={createWorldScaleBoxGeometry(rightW, baseH, rightD, false, rightX, 0, rightZ)} attach="geometry" />
            <meshStandardMaterial key={`${room.deckingMaterial || room.cladding || 'default'}-${room.baseMaterial}-${isDeckingMaterial}`} attach="material" {...materialProps} />
          </mesh>
        </group>
      );
    }

    if (isTShape) {
      const frontW = baseW;
      const frontD = baseD - tCutD;
      const frontX = baseX;
      const frontZ = baseZ + baseD/2 - frontD/2;

      const backW = baseW - 2 * tCutW;
      const backD = tCutD;
      const backX = baseX;
      const backZ = baseZ - baseD/2 + backD/2;

      return (
        <group {...pointerEvents}>
          <mesh position={[frontX, baseH/2, frontZ]} receiveShadow>
            <primitive object={createWorldScaleBoxGeometry(frontW, baseH, frontD, false, frontX, 0, frontZ)} attach="geometry" />
            <meshStandardMaterial key={`${room.deckingMaterial || room.cladding || 'default'}-${room.baseMaterial}-${isDeckingMaterial}`} attach="material" {...materialProps} />
          </mesh>
          <mesh position={[backX, baseH/2, backZ]} receiveShadow>
            <primitive object={createWorldScaleBoxGeometry(backW, baseH, backD, false, backX, 0, backZ)} attach="geometry" />
            <meshStandardMaterial key={`${room.deckingMaterial || room.cladding || 'default'}-${room.baseMaterial}-${isDeckingMaterial}`} attach="material" {...materialProps} />
          </mesh>
        </group>
      );
    }

    /*
     * With decking on, the deck is a reshapeable slab (DeckSlab) in the same
     * material and UV origin as this box, over a plinth that is just the
     * footprint plus overhangs. The plinth top sits 3mm under the slab so
     * the two never fight where they overlap; the slab's default outline is
     * the whole old base rectangle, so nothing looks different until the
     * customer pulls a corner.
     */
    if (isDecking) {
      const pf = baseFrame(room);
      const plinthH = Math.max(0.01, baseH - 0.003);
      const matKey = `${room.deckingMaterial || room.cladding || 'default'}-${room.baseMaterial}-${isDeckingMaterial}`;
      return (
        <group>
          <mesh position={[pf.plinthX, plinthH / 2, pf.plinthZ]} receiveShadow {...pointerEvents}>
            <primitive object={createWorldScaleBoxGeometry(pf.plinthW, plinthH, pf.plinthD, false, pf.plinthX - baseX, 0, pf.plinthZ - baseZ)} attach="geometry" />
            <meshStandardMaterial key={matKey} attach="material" {...materialProps} />
          </mesh>
          <DeckSlab room={room} materialProps={materialProps as Record<string, unknown>} materialKey={matKey} />
        </group>
      );
    }

    // Corner cut is complex to do without CSG, so we just use a single box for now
    // which might slightly overlap the cut, but preserves the texture.
    return (
      <mesh
        position={[baseX, baseH/2, baseZ]}
        receiveShadow
        {...pointerEvents}
      >
        <primitive object={createWorldScaleBoxGeometry(baseW, baseH, baseD, false, 0, 0, 0)} attach="geometry" />
        <meshStandardMaterial key={`${room.deckingMaterial || room.cladding || 'default'}-${room.baseMaterial}-${isDeckingMaterial}`} attach="material" {...materialProps} />
      </mesh>
    );
  };

  // FROZEN + DEBOUNCED copies drive the CSG wall cutouts. The boolean
  // rebuild of the wall solid is expensive and visibly blanks the walls, so
  // it must never run while values are still moving:
  //  - 3D handle drags set controlsEnabled=false, so nothing updates until
  //    release;
  //  - sidebar sliders and other continuous inputs DON'T touch
  //    controlsEnabled, so a 300ms settle debounce catches those - the
  //    rebuild fires once when the user pauses, not on every tick.
  // While values move, the frames + dark overlay planes track at full rate.
  const [csgDoors, setCsgDoors] = useState(room.doors);
  const [csgWindows, setCsgWindows] = useState(room.windows);
  // No rebuild while ANY pointer is held down. Sidebar sliders never touch
  // controlsEnabled, so the settle-debounce alone still fired during slow
  // slider drags (every >300ms hesitation = one wall rebuild under the
  // user's finger). A held mouse button anywhere now blocks the commit; the
  // release re-arms the debounce and the rebuild lands 150ms later.
  const [pointerHeld, setPointerHeld] = useState(false);
  useEffect(() => {
    const dn = () => setPointerHeld(true);
    const up = () => setPointerHeld(false);
    window.addEventListener('pointerdown', dn, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    // The configurator runs in an iframe on the live site. A button released
    // outside the frame (or with focus gone to another window) never sends
    // the up, and a held flag that never clears would freeze the openings at
    // their pre-drag positions for the rest of the session.
    window.addEventListener('blur', up);
    return () => {
      window.removeEventListener('pointerdown', dn, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('blur', up);
    };
  }, []);
  useEffect(() => {
    if (!controlsEnabled || pointerHeld) return; // frozen while interacting
    const t = setTimeout(() => {
      setCsgDoors(room.doors);
      setCsgWindows(room.windows);
    }, 150);
    return () => clearTimeout(t);
  }, [room.doors, room.windows, controlsEnabled, pointerHeld]);
  const deferredDoors = csgDoors;
  const deferredWindows = csgWindows;

  /*
   * The shell watchdog.
   *
   * Everything above makes the wall boolean fail loudly and fall back. This
   * is for the failure nobody has predicted: every 30 frames the shell's
   * geometry is checked for being drawable at all - vertices, finite
   * coordinates, a draw range. If it is not, the boolean is run again from
   * scratch; if that still gives nothing, the uncut base solid goes up. And
   * every failure - here or in SafeCsg - is recorded with the design that
   * produced it (console, window.__modulrShellDiag, and localStorage under
   * 'modulr:shell-diag'), so the next report of missing walls can be
   * reproduced from data rather than a screenshot.
   */
  const shellCsgRef = useRef<{ rebuild: () => void; showBase: () => boolean; healthy: () => boolean } | null>(null);
  const shellFrame = useRef(0);
  const shellStrikes = useRef(0);
  useEffect(() => {
    const record = (why: string) => {
      const snapshot = { at: new Date().toISOString(), why, room: useStore.getState().scene.room };
      (window as any).__modulrShellDiag = snapshot;
      try { localStorage.setItem('modulr:shell-diag', JSON.stringify(snapshot)); } catch { /* private mode */ }
      console.error('[Modulr] wall shell problem - design recorded in localStorage modulr:shell-diag', why, JSON.stringify(snapshot.room));
    };
    const onFail = (e: Event) => record((e as CustomEvent).detail?.message ?? 'csg failed');
    window.addEventListener('modulr-csg-failed', onFail);
    (window as any).__modulrShellRecord = record;
    return () => { window.removeEventListener('modulr-csg-failed', onFail); delete (window as any).__modulrShellRecord; };
  }, []);
  useFrame(() => {
    if (++shellFrame.current % 30 !== 0) return;
    const csg = shellCsgRef.current;
    if (!csg) return;
    if (csg.healthy()) { shellStrikes.current = 0; return; }
    shellStrikes.current++;
    // First strike: rebuild from the current inputs. Second: base solid.
    // Beyond that, stop poking it every half second - it is recorded.
    if (shellStrikes.current === 1) {
      csg.rebuild();
      if (!csg.healthy()) csg.showBase();
      (window as any).__modulrShellRecord?.('watchdog: shell geometry not drawable');
    } else if (shellStrikes.current === 2) {
      csg.showBase();
    }
  });

  return (
    /**
     * isShell marks everything that IS the building - walls, gable ends,
     * ceiling, cladding, partitions - as opposed to the furniture standing in
     * it or the floor underfoot.
     *
     * The walkthrough crosshair used to recognise only objects and the floor.
     * A wall carried no marker at all, so a click on one found nothing, fell
     * through to the NEXT surface along the ray, and opened whatever was
     * behind it - which is why clicking a wall brought up the floor. Marking
     * the shell means a wall click resolves to the wall it hit, and stops
     * there. The floor mesh sets its own isFloor deeper in and wins, because
     * the crosshair takes the nearest marker it finds.
     */
    <group userData={{ isShell: true }} position={[room.x / 1000, 0, room.z / 1000]} rotation={[0, room.rot, 0]}>
      {/* Interior light to prevent partitions from being too dark.
          Damped in the walkthrough - see the note on the warm light below. */}
      <pointLight position={[0, h - 0.5, 0]} intensity={viewMode === 'walking' || isNight ? 0 : 1.5} distance={15} decay={2} castShadow={false} />

      {/* Base Plinth / Decking Area */}
      {renderBaseMeshes()}

      {/* Click-to-add chip for walls */}
      {!isPlanView && <WallAddChip room={room} h={h} baseH={baseH} />}

      {/* Main Elevated Structure */}
      <group position={[0, baseH, 0]}>
        {/* Main Structure via CSG. The element is memoized so renders caused by
            per-step drag updates reuse the same element and React skips the
            subtree — the boolean ops only re-run when one of the deps below
            actually changes (deferredDoors/deferredWindows settle after drag). */}
        {useMemo(() => (
        <mesh
          castShadow
          receiveShadow
          onPointerOver={(e) => { e.stopPropagation(); useStore.getState().setHoveredElementId('room'); }}
          onPointerOut={() => useStore.getState().setHoveredElementId(null)}
          onClick={(e) => {
            // Click-to-add: hand the wall click point to the add-chip.
            // Closure-free (event dispatch only) so the CSG memo needs no
            // extra deps. The chip decides which wall face was hit.
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('wall-clicked', { detail: { x: e.point.x, y: e.point.y, z: e.point.z } }));
          }}
        >
          <Geometry useGroups ref={shellCsgRef}>
            {/* Main block */}
            <Base position={[0, (h + 0.05)/2, 0]}>
              <primitive object={claddingBoxGeom} attach="geometry" />
              <meshStandardMaterial key="mat-0" attach="material-0" color="#ffffff" metalness={0.1} {...texRight}  bumpScale={0.1} />
              <meshStandardMaterial key="mat-1" attach="material-1" color="#ffffff" metalness={0.1} {...texLeft}  bumpScale={0.1} />
              <meshStandardMaterial key="mat-2" attach="material-2" color="#ffffff" metalness={0.1} {...texFront}  bumpScale={0.1} />
              <meshStandardMaterial key="mat-3" attach="material-3" color="#ffffff" metalness={0.1} {...texFront}  bumpScale={0.1} />
              <meshStandardMaterial attach="material-4" color="#ffffff" metalness={0.1} {...texFront}  bumpScale={0.1} />
              <meshStandardMaterial attach="material-5" color="#ffffff" metalness={0.1} {...texBack}  bumpScale={0.1} />
            </Base>

            {room.hasPictureFrame && (
              <>
                <Addition position={[-w/2 + wallThickness/2, isGable ? (h+roofH)/2 : (h+0.05)/2, d/2 + ohFront/2 - 0.005]}>
                  <primitive object={pfLeftGeom} attach="geometry" />
                  <meshStandardMaterial color="#ffffff" metalness={0.1} {...texFront}  bumpScale={0.1} />
                </Addition>
                <Addition position={[w/2 - wallThickness/2, isGable ? (h+roofH)/2 : (h+0.05)/2, d/2 + ohFront/2 - 0.005]}>
                  <primitive object={pfRightGeom} attach="geometry" />
                  <meshStandardMaterial color="#ffffff" metalness={0.1} {...texFront}  bumpScale={0.1} />
                </Addition>
                <Addition position={[0, pfHeight - 0.15, d/2 + ohFront/2 - 0.005]}>
                  <primitive object={pfTopGeom} attach="geometry" />
                  <meshStandardMaterial color="#ffffff" metalness={0.1} {...texFront}  bumpScale={0.1} />
                </Addition>
              </>
            )}

            {/* LShape Outer Cutout */}
            {isLShape && (
              <Subtraction position={[w/2 - cutW/2 + 0.1, h/2, d/2 - cutD/2 + 0.1]}>
                <primitive object={lShapeCutOuterGeom} attach="geometry" />
                <meshStandardMaterial
                  color="#ffffff"
                  {...texFront}
                  metalness={0.1}
                  bumpScale={0.1}
                />
              </Subtraction>
            )}

            {/* TShape Outer Cutout */}
            

            {/* CornerCut Outer Cutout */}
            

            {/* Gable end triangles. NEVER in plan view: a floor plan has no
                gable ends, and their CSG faces sit coplanar with the interior
                cutout boundary - the artifact faces that produced read as
                external cladding covering the whole floor from above. */}
            {isGable && !isPlanView && (

          
              <>


                {/* Apex triangles: front/back walls for the 'front' ridge
                    orientation, side walls (rotated 90°) for 'side'. The
                    front triangle is skipped when the apex is glazed - the
                    glazing unit rendered separately fills the opening. */}
                {isSideGable ? (
                  <>
                    {!room.hasApexGlazing && (
                    <>
                    <Addition position={[w/2 - wallThickness/2, h + 0.025, 0]} rotation={[0, Math.PI/2, 0]}>
                      <primitive object={gableTriangleGeom} attach="geometry" />
                      <meshStandardMaterial color="#ffffff" metalness={0.1} {...texRight}  bumpScale={0.1} />
                    </Addition>
                    <Addition position={[-w/2 + wallThickness/2, h + 0.025, 0]} rotation={[0, Math.PI/2, 0]}>
                      <primitive object={gableTriangleGeom} attach="geometry" />
                      <meshStandardMaterial color="#ffffff" metalness={0.1} {...texLeft}  bumpScale={0.1} />
                    </Addition>
                    </>
                    )}
                  </>
                ) : (
                  <>
                    {!room.hasApexGlazing && (
                    <Addition position={[0, h + 0.025, d/2 - wallThickness/2]}>
                      <primitive object={gableTriangleGeom} attach="geometry" />
                      <meshStandardMaterial color="#ffffff" metalness={0.1} {...texFront}  bumpScale={0.1} />
                    </Addition>
                    )}
                    <Addition position={[0, h + 0.025, -d/2 + wallThickness/2]}>
                      <primitive object={gableTriangleGeom} attach="geometry" />
                      <meshStandardMaterial color="#ffffff" metalness={0.1} {...texBack}  bumpScale={0.1} />
                    </Addition>
                  </>
                )}

                {/* The apex is lined from the inside instead of being cut -
                    see GableLiners below the shell. */}

          
              </>

          
            )}

          
            {/* Main Interior Cutout (split into non-overlapping boxes to avoid nested Geometry issues) */}
            {(!isLShape && !isTShape && !isCornerCut) && (
              <Subtraction position={[0, h/2, 0]}>
                <primitive object={interiorCutGeom} attach="geometry" />
                <meshStandardMaterial {...paper} color={room.interiorColor || '#ffffff'} />
              </Subtraction>
            )}

            {isLShape && (
              <>
                {/* Left part of the L */}
                <Subtraction position={[-cutW/2, h/2, 0]}>
                  <primitive object={interiorCut(w - cutW - wallThickness*2, h + 1, d - wallThickness*2)} attach="geometry" />
                  <meshStandardMaterial {...paper} color={room.interiorColor || '#ffffff'} />
                </Subtraction>
                {/* Back-right part of the L */}
                <Subtraction position={[w/2 - cutW/2 - wallThickness, h/2, -cutD/2]}>
                  <primitive object={interiorCut(cutW + wallThickness*2, h + 1, d - cutD - wallThickness*2)} attach="geometry" />
                  <meshStandardMaterial {...paper} color={room.interiorColor || '#ffffff'} />
                </Subtraction>
              </>
            )}

            

            

            {/* Top Cutout for flat roofs to enforce wall top color */}
            {!isPitched && !isGable && (
              <Subtraction position={[0, h + 0.025, 0]}>
                 <primitive object={interiorCut(w + 1, 0.05 + 0.001, d + 1)} attach="geometry" />
                 <meshStandardMaterial {...paper} color={room.interiorColor || '#ffffff'} />
              </Subtraction>
            )}

            {/* Doors Cutouts. A door in the bay's divider is cut from the
                divider itself (BayParts), not from the shell. */}
            {(deferredDoors || []).filter(dr => !openingInBay(dr) && dr.wall !== 'bay').map(door => {
              // An opening with a dimension that is not a number is left
              // uncut rather than handed to the boolean as a NaN brush.
              if (![door.widthMm, door.heightMm, door.offsetMm].every(v => typeof v === 'number' && Number.isFinite(v))) return null;
              const doorW = door.widthMm / 1000;
              const doorH = door.heightMm / 1000;
              const offset = door.offsetMm / 1000;

              let pos: [number, number, number] = [0, doorH/2 - 0.05, 0];
              let size: [number, number, number] = [doorW, doorH + 0.1, wallThickness * 3];

              if (door.wall === 'front') {
                pos = [offset, doorH/2 - 0.05, d/2];
              } else if (door.wall === 'back') {
                pos = [offset, doorH/2 - 0.05, -d/2];
              } else if (door.wall === 'left') {
                pos = [-w/2, doorH/2 - 0.05, offset];
                size = [wallThickness * 3, doorH + 0.1, doorW];
              } else { // right
                pos = [w/2, doorH/2 - 0.05, offset];
                size = [wallThickness * 3, doorH + 0.1, doorW];
              }

              return (
                <Subtraction key={door.id} position={pos}>
                  <primitive object={interiorCut(size[0], size[1], size[2])} attach="geometry" />
                  <meshStandardMaterial {...paper} color={room.interiorColor || '#ffffff'} />
                </Subtraction>
              );
            })}

            {/* The outdoor section: the front wall is cut away over it, and
                its end wall too when the end is a screen or open. The back
                wall stays, and so does everything above - the roof runs on.
                See utils/bay. */}
            {/* The cut faces these leave - the end of the end wall at the
                open front, the wall tops - are OUTSIDE faces now, so the
                brushes carry cladding, not the room's paper: a white reveal
                on a black building was the first thing that looked wrong. */}
            {bay && (() => {
              // With the end wall kept, the cut stops at its inner face and
              // the wall's front end stays as the corner. With the end a
              // screen or open, the cut runs out through the corner too -
              // otherwise a stub of clad wall stood where the post is, and
              // the post disappeared into it (Charlie, 10 Sep).
              const through = (room.bay?.screen ?? 'solid') !== 'solid';
              const outer = bay.side === 'left' ? -w/2 - 0.1 : w/2 + 0.1;
              const inner = bay.side === 'left' ? bay.x1 : bay.x0;
              const lo = through ? Math.min(outer, inner) : bay.x0;
              const hi = through ? Math.max(outer, inner) : bay.x1;
              return (
                <Subtraction position={[(lo + hi) / 2, h/2, d/2]}>
                  <primitive object={interiorCut(hi - lo, h + 1, wallThickness * 3)} attach="geometry" />
                  <meshStandardMaterial color="#ffffff" metalness={0.1} {...texFront} bumpScale={0.1} />
                </Subtraction>
              );
            })()}
            {/* The end and back cuts leave their faces INSIDE the bay - the
                back wall's end where the end wall stood - so they carry the
                bay's wall finish, not the elevation that was removed
                (Charlie, 10 Sep: the back corner showed the end cladding). */}
            {bay && room.bay?.screen && room.bay.screen !== 'solid' && (
              <Subtraction position={[bay.side === 'left' ? -w/2 : w/2, h/2, (bay.z0 + d/2) / 2]}>
                <primitive object={interiorCut(wallThickness * 3, h + 1, d/2 - bay.z0)} attach="geometry" />
                {bayWallBrushMat}
              </Subtraction>
            )}
            {bay && bay.full && room.bay?.backWall && room.bay.backWall !== 'solid' && (
              <Subtraction position={[bayCx, h/2, -d/2]}>
                <primitive object={interiorCut(bayW, h + 1, wallThickness * 3)} attach="geometry" />
                {bayWallBrushMat}
              </Subtraction>
            )}

            {/* Slope Cutout (Top) to slice walls at an angle */}
            {isPitched && (
              <Subtraction 
                position={[
                  0, 
                  (frontH + backH) / 2 + 2 * Math.cos(roofPitch) - 0.001, 
                  2 * Math.sin(roofPitch)
                ]} 
                rotation={[roofPitch, 0, 0]}
              >
                 <primitive object={interiorCut(w + 1, 4, d + 2)} attach="geometry" />
                 <meshStandardMaterial {...paper} color={room.interiorColor || '#ffffff'} />
              </Subtraction>
            )}

            {/* Window Cutouts */}
            {(deferredWindows || []).filter(wn => !openingInBay(wn)).map(win => {
              if (![win.widthMm, win.heightMm, win.sillMm ?? 0, win.offsetMm ?? 0].every(v => typeof v === 'number' && Number.isFinite(v))) return null;
              const winW = win.widthMm / 1000;
              const winH = win.heightMm / 1000;
              const sill = (win.sillMm ?? 0) / 1000;
              const offset = (win.offsetMm ?? 0) / 1000;
              // A window on the floor is cut BELOW the floor, like a door: a
              // cut that stops exactly at floor level leaves the wall's cut
              // face lying on the plinth top, and two faces at one height
              // flicker. The floor tongue covers what the deeper cut exposes.
              const below = sill < 0.001 ? 0.1 : 0;
              const cutY = sill + winH/2 - below/2;
              const cutH = winH + below;

              let pos: [number, number, number] = [0, cutY, 0];
              let size: [number, number, number] = [winW, cutH, wallThickness * 3];

              // Windows mapping
              if (win.wall === 'front') {
                pos = [offset, cutY, d/2];
                size = [winW, cutH, wallThickness * 3];
              } else if (win.wall === 'back') {
                pos = [offset, cutY, -d/2];
                size = [winW, cutH, wallThickness * 3];
              } else if (win.wall === 'left') {
                pos = [-w/2, cutY, offset];
                size = [wallThickness * 3, cutH, winW];
              } else { // right
                pos = [w/2, cutY, offset];
                size = [wallThickness * 3, cutH, winW];
              }

              return (
                <Subtraction key={`cut-${win.id}`} position={pos}>
                  <primitive object={interiorCut(size[0], size[1], size[2])} attach="geometry" />
                  <meshStandardMaterial {...paper} color={room.interiorColor || '#ffffff'} />
                </Subtraction>
              );
            })}
          </Geometry>
        </mesh>
        ), [
          claddingBoxGeom, pfLeftGeom, pfRightGeom, pfTopGeom, lShapeCutOuterGeom, gableTriangleGeom,
          interiorCutGeom, paper.map,
          texFront.map, texBack.map, texLeft.map, texRight.map,
          texFront.color, texBack.color, texLeft.color, texRight.color, texFront.roughness,
          room.hasPictureFrame, room.interiorColor, room.hasApexGlazing, isSideGable,
          w, d, h, wallThickness, roofH, pfHeight, ohFront,
          isLShape, isTShape, isCornerCut, isGable, isPitched,
          cutW, cutD, frontH, backH, roofPitch,
          deferredDoors, deferredWindows,
          bayKey, bayCx, bayW, texBayWall.map, texBayWall.color, room.bay?.wallFinish, room.bay?.wallColour,
        ])}

        {/*
          Apex liners, one per gable end.

          Same transform as the apex triangles in the shell above, moved in by
          a wall thickness so each sits flat on the inside face of its gable.
          They carry the interior wallpaper props AND room.interiorColor, so
          the apex is not merely a similar white - it is the same surface as
          every wall below it, and it repaints with them.

          Rendered here rather than inside <Geometry> on purpose: anything in
          there is a CSG operand and gets welded into the shell, which is how
          the previous attempts ended up either deleting the gable or leaving a
          triangle floating over the roof.
        */}
        {!isPlanView && isGable && (() => {
          const inset = wallThickness + GABLE_LINER_T / 2;
          // The front apex is glazed rather than clad when apex glazing is on,
          // so it has no wall to line. The back one is always solid.
          /*
           * No liners at all once the apex is GLAZED.
           *
           * Apex glazing removes the triangle you are looking at, so from
           * outside you see straight through to the far gable - and a liner
           * there is a full-size sheet of near-white paper sitting right in
           * the opening. Through clear glass that reads as a solid white
           * panel where cladding should be, which is the "white gable" from
           * outside. Without it you see the far apex clad, which reads as
           * looking into a room, as it did before liners existed.
           *
           * The cost is that inside a glazed-apex gable the far apex stays
           * clad rather than painted. That is a fair trade against a white
           * triangle on the elevation, which is the first thing anyone sees.
           */
          if (room.hasApexGlazing) return null;
          const ends: number[] = isSideGable
            ? [w/2 - inset, -w/2 + inset]
            : [d/2 - inset, -d/2 + inset];
          return ends.map((v, i) => (
            <mesh
              key={`gable-liner-${i}`}
              position={isSideGable ? [v, h + 0.025, 0] : [0, h + 0.025, v]}
              rotation={[0, isSideGable ? Math.PI/2 : 0, 0]}
              receiveShadow
            >
              <primitive object={gableLinerGeom} attach="geometry" />
              <meshStandardMaterial {...paper} color={room.interiorColor || '#ffffff'} />
            </mesh>
          ));
        })()}

        {/*
          Gable ceiling. Same rotation as the roof group, so the panels
          computed in the gable's own frame land the right way round for both
          ridge orientations. Interior wallpaper props and interiorColor, so
          the ceiling is the same surface as the walls and repaints with them.

          Centred ON the roof's underside rather than hung below it: the panel
          is thick enough that its top half buries itself in the slab, which
          leaves no seam of daylight at the eaves and nothing coplanar to
          shimmer.
        */}
        {!isPlanView && gableCeiling && (
          <group rotation={[0, isSideGable ? Math.PI/2 : 0, 0]}>
            {gableCeiling.map((p, i) => (
              <mesh key={`gable-ceiling-${i}`} position={p.pos} rotation={[0, 0, p.rotZ]} receiveShadow>
                <primitive object={p.geom} attach="geometry" />
                <meshStandardMaterial {...paper} color={room.interiorColor || '#ffffff'} />
              </mesh>
            ))}
          </group>
        )}

        {/* Internal Floor - the ENCLOSED room's; the bay has its own deck.
            A corner bay is cut out of it, divider and return wall included,
            so the room's boards stop at the bay's walls. */}
        <mesh position={[encCx, 0.005, 0]} receiveShadow userData={{ isFloor: true }}>
          <meshStandardMaterial {...texFloor}  bumpScale={0.05} roughness={0.7} />
          <Geometry>
             <Base>
               <boxGeometry args={[encW, 0.01, d - wallThickness*2]} />
             </Base>
             {bay && !bay.full && (
                <Subtraction position={[(bay.side === 'left' ? (bay.x1 + wallThickness - (w/2 + 0.1)) / 2 : (bay.x0 - wallThickness + (w/2 + 0.1)) / 2) - encCx, 0, (bay.z0 - wallThickness + d/2 + 0.1) / 2]}>
                  <boxGeometry args={[bay.side === 'left' ? (bay.x1 + wallThickness) + (w/2 + 0.1) : (w/2 + 0.1) - (bay.x0 - wallThickness), 0.02, d/2 + 0.1 - (bay.z0 - wallThickness)]} />
                </Subtraction>
             )}
             {isLShape && (
                <Subtraction position={[w/2 - cutW/2 + 0.1, 0, d/2 - cutD/2 + 0.1]}>
                  <boxGeometry args={[cutW + 0.2, 0.02, cutD + 0.2]} />
                </Subtraction>
             )}


          </Geometry>
        </mesh>

        {/*
          The floor runs INTO each opening, up to the frame.
          The slab above stops at the inner wall face and the frame sits at
          the outer face, so under every door and full-height window there
          was a strip of wall thickness with nothing of the room's in it -
          just the plinth top, with the wall's own cut face lying exactly on
          it. Two surfaces at one height is a flicker, and it flickered. A
          real floor is laid through to the frame; so is this one. The UVs
          are rewritten in the slab's own parametrisation so the boards run
          straight through with no seam.
        */}
        {!isPlanView && floorTongues.map(t => (
          <mesh key={t.key} position={[t.x, 0.005, t.z]} receiveShadow userData={{ isFloor: true }}>
            <primitive object={t.geom} attach="geometry" />
            <meshStandardMaterial {...texFloor} bumpScale={0.05} roughness={0.7} />
          </mesh>
        ))}

        {/* The outdoor section's own parts - divider, return wall, finishes,
            screens, floor, soffit, lights and post. See BayParts. */}
        {bay && (
          <BayParts room={room} bay={bay} w={w} d={d} h={h} wallThickness={wallThickness} frameColorHex={frameColorHex} roofColorHex={roofColorHex} paper={paper}
            texFront={texFront} texBack={texBack} texLeft={texLeft} texRight={texRight} texRoof={texRoof} isVertical={isVertical} isNight={isNight} isPlanView={isPlanView}
            ceilingY={isPitched && !isGable ? (frontH + backH) / 2 : h} pitch={isPitched && !isGable ? roofPitch : 0} />
        )}

        {/* Internal Ceiling */}
        {/* For the side orientation the whole assembly (built along X) is
            rotated 90° about Y: local X maps to world -Z (the slope spans the
            depth) and local Z to world +X (the ridge runs left-to-right).
            gSpan/gOhLow1/gOhLow2/gRunLen carry the swapped dimensions. */}
        {!isPlanView && isGable && (
          <group position={[roofX, h, roofZ]} rotation={[0, isSideGable ? Math.PI/2 : 0, 0]}>
            {/* Left Roof Plane */}
            <mesh position={[-gSpan/4 - gOhLow1/2 - (ROOF_LIP/2) * Math.cos(gablePitch), roofH/2 - gOhLow1 * Math.tan(gablePitch)/2 - (ROOF_LIP/2) * Math.sin(gablePitch), 0]} rotation={[0, 0, gablePitch]} castShadow receiveShadow>
               <primitive object={roofGableLeftGeom} attach="geometry" />

               {(() => {
                const getFasciaMat = (side) => {
                  const matKey = 'fascia-left-' + side + '-' + room.fasciaMaterial + '-' + room.cladding + '-' + room.claddingOrientation;
                  if (room.fasciaMaterial === 'match_cladding') {
                    const tex = side === 'front' ? texFront : side === 'back' ? texBack : side === 'left' ? texLeft : texRight;
                    // propsFront/Back/Left/Right were referenced here but never
                    // declared anywhere in this file, so choosing "Match Cladding"
                    // threw a ReferenceError during render and blanked the scene.
                    // The material values come from the cladding texture itself.
                    return <meshStandardMaterial key={matKey} color={tex.color} map={tex.map} normalMap={tex.normalMap} roughnessMap={tex.roughnessMap} roughness={tex.roughness} metalness={0.05} bumpScale={0.1} />;
                  } else if (room.fasciaMaterial === 'white') {
                    return <meshStandardMaterial key={matKey} color="#ffffff" roughness={0.6} metalness={0.1} />;
                  } else if (room.fasciaMaterial === 'grey') {
                    return <meshStandardMaterial key={matKey} color="#6a6d70" roughness={0.6} metalness={0.2} />;
                  } else if (room.fasciaMaterial === 'black') {
                    return <meshStandardMaterial key={matKey} color="#1a1a1a" roughness={0.6} metalness={0.2} />;
                  } else {
                    return <meshStandardMaterial key={matKey} color="#2d3032" roughness={0.6} metalness={0.2} />; // anthracite default
                  }
                };
                return [
                  <meshStandardMaterial key="mat-0" attach="material-0" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Right
                  <meshStandardMaterial key="mat-1" attach="material-1" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Left
                  // The top face shows the covering itself when it has one - the
                  // rubber sheet, the aluminium - rather than a flat colour.
                  texturedRoof
                    ? (room.roofMaterial === 'aluminium'
                        ? <meshStandardMaterial key="mat-2" attach="material-2" color="#ffffff" map={texRoof.map} normalMap={texRoof.normalMap} roughnessMap={texRoof.roughnessMap} roughness={0.32} metalness={0.9} envMapIntensity={1.2} />
                        : <meshStandardMaterial key="mat-2" attach="material-2" color="#ffffff" map={texRoof.map} normalMap={texRoof.normalMap} normalScale={new THREE.Vector2(0.9, 0.9)} roughnessMap={texRoof.roughnessMap} roughness={1} metalness={0} />)
                    : <meshStandardMaterial key="mat-2" attach="material-2" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Top
                  <meshStandardMaterial key="mat-3" attach="material-3" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Bottom
                  React.cloneElement(getFasciaMat('front'), { key: 'mat-4', attach: 'material-4' }), // Front fascia
                  React.cloneElement(getFasciaMat('back'), { key: 'mat-5', attach: 'material-5' }), // Back fascia
                ];
              })()}

            </mesh>
            {/* Right Roof Plane */}
            <mesh position={[gSpan/4 + gOhLow2/2 + (ROOF_LIP/2) * Math.cos(gablePitch), roofH/2 - gOhLow2 * Math.tan(gablePitch)/2 - (ROOF_LIP/2) * Math.sin(gablePitch), 0]} rotation={[0, 0, -gablePitch]} castShadow receiveShadow>
               <primitive object={roofGableRightGeom} attach="geometry" />
               
               {(() => {
                const getFasciaMat = (side) => {
                  const matKey = 'fascia-right-' + side + '-' + room.fasciaMaterial + '-' + room.cladding + '-' + room.claddingOrientation;
                  if (room.fasciaMaterial === 'match_cladding') {
                    const tex = side === 'front' ? texFront : side === 'back' ? texBack : side === 'left' ? texLeft : texRight;
                    // propsFront/Back/Left/Right were referenced here but never
                    // declared anywhere in this file, so choosing "Match Cladding"
                    // threw a ReferenceError during render and blanked the scene.
                    // The material values come from the cladding texture itself.
                    return <meshStandardMaterial key={matKey} color={tex.color} map={tex.map} normalMap={tex.normalMap} roughnessMap={tex.roughnessMap} roughness={tex.roughness} metalness={0.05} bumpScale={0.1} />;
                  } else if (room.fasciaMaterial === 'white') {
                    return <meshStandardMaterial key={matKey} color="#ffffff" roughness={0.6} metalness={0.1} />;
                  } else if (room.fasciaMaterial === 'grey') {
                    return <meshStandardMaterial key={matKey} color="#6a6d70" roughness={0.6} metalness={0.2} />;
                  } else if (room.fasciaMaterial === 'black') {
                    return <meshStandardMaterial key={matKey} color="#1a1a1a" roughness={0.6} metalness={0.2} />;
                  } else {
                    return <meshStandardMaterial key={matKey} color="#2d3032" roughness={0.6} metalness={0.2} />; // anthracite default
                  }
                };
                return [
                  <meshStandardMaterial key="mat-0" attach="material-0" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Right
                  <meshStandardMaterial key="mat-1" attach="material-1" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Left
                  // The top face shows the covering itself when it has one - the
                  // rubber sheet, the aluminium - rather than a flat colour.
                  texturedRoof
                    ? (room.roofMaterial === 'aluminium'
                        ? <meshStandardMaterial key="mat-2" attach="material-2" color="#ffffff" map={texRoof.map} normalMap={texRoof.normalMap} roughnessMap={texRoof.roughnessMap} roughness={0.32} metalness={0.9} envMapIntensity={1.2} />
                        : <meshStandardMaterial key="mat-2" attach="material-2" color="#ffffff" map={texRoof.map} normalMap={texRoof.normalMap} normalScale={new THREE.Vector2(0.9, 0.9)} roughnessMap={texRoof.roughnessMap} roughness={1} metalness={0} />)
                    : <meshStandardMaterial key="mat-2" attach="material-2" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Top
                  <meshStandardMaterial key="mat-3" attach="material-3" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Bottom
                  React.cloneElement(getFasciaMat('front'), { key: 'mat-4', attach: 'material-4' }), // Front fascia
                  React.cloneElement(getFasciaMat('back'), { key: 'mat-5', attach: 'material-5' }), // Back fascia
                ];
              })()}

            </mesh>
            {room.roofMaterial === 'sedum' && (
              <>
                <mesh position={[-gSpan/4 - gOhLow1/2 - 0.06 * Math.sin(gablePitch), roofH/2 - gOhLow1 * Math.tan(gablePitch)/2 + 0.06 * Math.cos(gablePitch), 0]} rotation={[0, 0, gablePitch]} castShadow receiveShadow>
                   <boxGeometry args={[(gSpan/2 + gOhLow1) / Math.cos(gablePitch), 0.02, gRunLen - 0.02]} />
                   <meshStandardMaterial color="#ffffff" {...texRoof}  bumpScale={0.1} roughness={0.9} />
                </mesh>
                <mesh position={[gSpan/4 + gOhLow2/2 + 0.06 * Math.sin(gablePitch), roofH/2 - gOhLow2 * Math.tan(gablePitch)/2 + 0.06 * Math.cos(gablePitch), 0]} rotation={[0, 0, -gablePitch]} castShadow receiveShadow>
                   <boxGeometry args={[(gSpan/2 + gOhLow2) / Math.cos(gablePitch), 0.02, gRunLen - 0.02]} />
                   <meshStandardMaterial color="#ffffff" {...texRoof}  bumpScale={0.1} roughness={0.9} />
                </mesh>
              </>
            )}

            {/* Ridge cap: the two sloped slabs meet square-cut at the apex,
                which left an open V gap along the ridge. A real roof closes
                this with a ridge piece - so does this one. */}
            <mesh position={[isSideGable ? roofZ : -roofX, roofH + gableFascia / (2 * Math.cos(gablePitch)), 0]} castShadow>
              <boxGeometry args={[0.24 + gableFascia, 0.07, gRunLen + ROOF_LIP * 2 + 0.02]} />
              <meshStandardMaterial color={roofColorHex} metalness={0.4} roughness={0.5} />
            </mesh>

            {/* NO separate gable-end meshes here. The wall mesh itself already
                ADDS clad gable triangles (gableTriangleGeom) as part of the
                same CSG piece, with UVs that continue the wall's boards. A
                second overlapping triangle z-fought with it - the "glitching
                like it's not the same piece" was two coplanar copies. */}
          </group>
        )}
        {!isPlanView && !isGable && (
          <mesh position={[0, (isPitched && !isGable ? (frontH + backH)/2 : h) - 0.005, 0]} rotation={[isPitched && !isGable ? roofPitch : 0, 0, 0]} receiveShadow>
            {/* The flat/pitched ceiling. Papered like the walls it meets -
                plain colour here was the same hex but a different surface,
                which is what made a room read as several shades of one paint. */}
            <meshStandardMaterial {...paper} color={room.interiorColor || '#ffffff'} />
            <Geometry>
               <Base>
                 <primitive object={ceilingGeom} attach="geometry" />
               </Base>
               {isLShape && (
                  <Subtraction position={[w/2 - cutW/2 + 0.1, 0, d/2 - cutD/2 + 0.1]}>
                    <boxGeometry args={[cutW + 0.2, 0.02, cutD + 0.2]} />
                  </Subtraction>
               )}
            </Geometry>
          </mesh>
        )}

        {/* Roof Fascia & EPDM flat roof.
            NOT for gables: on a gable this prism's end faces painted a
            fascia-coloured triangle over the entire gable end, its cut faces
            z-fought with the sloped slabs, and the flat "flashing" sheet at
            ridge height read as a giant dark plate floating on the roof. The
            gable's ends, fascia and ridge are built explicitly below. */}
        {!isPlanView && !isGable && (
          <group
            position={[roofX, (frontH + backH)/2 + roofH/2, 0]}
            rotation={[isPitched && !isGable ? roofPitch : 0, 0, 0]}
          >
          {/* Tilted about the SAME axis as the ceiling (z = 0), with the canopy
              offset applied inside the tilt. Tilting about the slab's own
              centre, half a canopy forward, dropped its underside roofZ x
              tan(pitch) below the ceiling at the back - a steep fall with a
              canopy put the black EPDM underside where the ceiling should be. */}
          <group position={[0, 0, roofZ]}>
            <mesh castShadow receiveShadow position={[0, 0, 0]}>
              {/* The six face materials go on the BASE brush, not the mesh:
                  with useGroups the boolean hands the mesh a material array
                  built from its brushes, and a brush with no material of its
                  own is plain white. */}
              {(() => {
                const getFasciaMat = (side) => {
                  const matKey = 'fascia-flat-' + side + '-' + room.fasciaMaterial + '-' + room.cladding + '-' + room.claddingOrientation;
                  if (room.fasciaMaterial === 'match_cladding') {
                    const tex = side === 'front' ? texFront : side === 'back' ? texBack : side === 'left' ? texLeft : texRight;
                    // propsFront/Back/Left/Right were referenced here but never
                    // declared anywhere in this file, so choosing "Match Cladding"
                    // threw a ReferenceError during render and blanked the scene.
                    // The material values come from the cladding texture itself.
                    return <meshStandardMaterial key={matKey} color={tex.color} map={tex.map} normalMap={tex.normalMap} roughnessMap={tex.roughnessMap} roughness={tex.roughness} metalness={0.05} bumpScale={0.1} />;
                  } else if (room.fasciaMaterial === 'white') {
                    return <meshStandardMaterial key={matKey} color="#ffffff" roughness={0.6} metalness={0.1} />;
                  } else if (room.fasciaMaterial === 'grey') {
                    return <meshStandardMaterial key={matKey} color="#6a6d70" roughness={0.6} metalness={0.2} />;
                  } else if (room.fasciaMaterial === 'black') {
                    return <meshStandardMaterial key={matKey} color="#1a1a1a" roughness={0.6} metalness={0.2} />;
                  } else {
                    return <meshStandardMaterial key={matKey} color="#2d3032" roughness={0.6} metalness={0.2} />; // anthracite default
                  }
                };
                const faceMats = [
                  React.cloneElement(getFasciaMat('right'), { key: 'mat-0', attach: 'material-0' }),
                  React.cloneElement(getFasciaMat('left'), { key: 'mat-1', attach: 'material-1' }),
                  // The top face shows the covering itself when it has one - the
                  // rubber sheet, the aluminium - rather than a flat colour.
                  texturedRoof
                    ? (room.roofMaterial === 'aluminium'
                        ? <meshStandardMaterial key="mat-2" attach="material-2" color="#ffffff" map={texRoof.map} normalMap={texRoof.normalMap} roughnessMap={texRoof.roughnessMap} roughness={0.32} metalness={0.9} envMapIntensity={1.2} />
                        : <meshStandardMaterial key="mat-2" attach="material-2" color="#ffffff" map={texRoof.map} normalMap={texRoof.normalMap} normalScale={new THREE.Vector2(0.9, 0.9)} roughnessMap={texRoof.roughnessMap} roughness={1} metalness={0} />)
                    : <meshStandardMaterial key="mat-2" attach="material-2" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Top
                  <meshStandardMaterial key="mat-3" attach="material-3" color={roofColorHex} metalness={0.3} roughness={0.6}  bumpScale={0.1} />, // Bottom
                  React.cloneElement(getFasciaMat('front'), { key: 'mat-4', attach: 'material-4' }),
                  React.cloneElement(getFasciaMat('back'), { key: 'mat-5', attach: 'material-5' }),
                ];
                return (
              /* useGroups keeps the six face materials through the boolean.
                 Every brush then needs a material of its own for the faces
                 it cuts: the inner corner of an L takes the front elevation's
                 fascia, a skylight's reveal the roof colour. */
              <Geometry useGroups>
                <Base>
                  {room.fasciaMaterial === 'match_cladding' ? <primitive object={roofFlatGeom} attach="geometry" /> : <boxGeometry args={[roofW, roofH, roofD]} />}
                  {faceMats}
                </Base>
                {isLShape && (
                  <Subtraction position={[cutBoxPosX, 0, cutBoxPosZ]}>
                    <boxGeometry args={[cutBoxSize, roofH + 0.5, cutBoxSize]} />
                    {room.fasciaMaterial === 'match_cladding'
                      ? <meshStandardMaterial color={texFront.color} map={texFront.map} normalMap={texFront.normalMap} roughnessMap={texFront.roughnessMap} roughness={texFront.roughness} metalness={0.05} bumpScale={0.1} />
                      : <meshStandardMaterial color={room.fasciaMaterial === 'white' ? '#ffffff' : room.fasciaMaterial === 'grey' ? '#6a6d70' : room.fasciaMaterial === 'black' ? '#1a1a1a' : '#2d3032'} roughness={0.6} metalness={0.2} />}
                  </Subtraction>
                )}
                {isGable && (
                  <>
                    <Subtraction position={[-w/4 - roofX - Math.sin(gablePitch)*(w)/2, Math.cos(gablePitch)*(w)/2, -roofZ]} rotation={[0, 0, gablePitch]}><boxGeometry args={[w*2, w, roofD + 2]} />
                      <meshStandardMaterial color={roofColorHex} metalness={0.3} roughness={0.6} />
                    </Subtraction>
                    <Subtraction position={[w/4 - roofX + Math.sin(gablePitch)*(w)/2, Math.cos(gablePitch)*(w)/2, -roofZ]} rotation={[0, 0, -gablePitch]}><boxGeometry args={[w*2, w, roofD + 2]} />
                      <meshStandardMaterial color={roofColorHex} metalness={0.3} roughness={0.6} />
                    </Subtraction>
                  </>
                )}
                {(room.skylights || []).map(sky => (
                  <Subtraction key={sky.id} position={[sky.offsetX/1000 - roofX, 0, sky.offsetZ/1000 - roofZ]}>
                    <boxGeometry args={[sky.widthMm/1000, roofH + 0.5, sky.lengthMm/1000]} />
                    <meshStandardMaterial color={roofColorHex} metalness={0.3} roughness={0.6} />
                  </Subtraction>
                ))}
              </Geometry>
                );
              })()}
            </mesh>
          {/* The roof SURFACE: a 20mm sheet over the whole slab, which is
              what you actually see from above. It was a fixed glossy dark
              grey ("metal flashing") whatever covering was chosen, so
              rubber and aluminium looked identical to it (Charlie, 11 Sep).
              Now it IS the covering: matte speckled rubber, glossy
              powder-coated aluminium, or a matt EPDM membrane. Sedum lays
              its own mat over the top. */}
          <mesh position={[0, roofH/2 + 0.01, 0]}>
            {room.roofMaterial === 'aluminium'
              ? <meshStandardMaterial color="#ffffff" map={texRoof.map} normalMap={texRoof.normalMap} roughnessMap={texRoof.roughnessMap} roughness={0.32} metalness={0.9} envMapIntensity={1.2} />
              : room.roofMaterial === 'rubber'
                ? <meshStandardMaterial color="#ffffff" map={texRoof.map} normalMap={texRoof.normalMap} normalScale={new THREE.Vector2(0.9, 0.9)} roughnessMap={texRoof.roughnessMap} roughness={1} metalness={0} />
                : room.roofMaterial === 'epdm'
                  ? <meshStandardMaterial color="#262626" roughness={0.85} metalness={0.05} />
                  : <meshStandardMaterial color="#444" metalness={0.8} roughness={0.2} />}
            <Geometry>
              <Base>
                <boxGeometry args={[roofW + 0.02, 0.02, roofD + 0.02]} />
              </Base>
              {isLShape && (
                <Subtraction position={[cutBoxPosX, 0, cutBoxPosZ]}>
                  <boxGeometry args={[cutBoxSize, 0.5, cutBoxSize]} />
                </Subtraction>
              )}
              
              
              {isGable && (
                  <>
                    <Subtraction position={[-w/4 - roofX - Math.sin(gablePitch)*(w)/2, -roofH/2 + Math.cos(gablePitch)*(w)/2, -roofZ]} rotation={[0, 0, gablePitch]}><boxGeometry args={[w*2, w, roofD + 2]} />
                </Subtraction>
                    <Subtraction position={[w/4 - roofX + Math.sin(gablePitch)*(w)/2, -roofH/2 + Math.cos(gablePitch)*(w)/2, -roofZ]} rotation={[0, 0, -gablePitch]}><boxGeometry args={[w*2, w, roofD + 2]} />
                </Subtraction>
                  </>
                )}
                {(room.skylights || []).map(sky => (
                  <Subtraction key={sky.id} position={[sky.offsetX/1000 - roofX, 0, sky.offsetZ/1000 - roofZ]}>
                    <boxGeometry args={[sky.widthMm/1000, 0.5, sky.lengthMm/1000]} />
                  </Subtraction>
                ))}
            </Geometry>
          </mesh>
          {room.roofMaterial === 'sedum' && (
            <mesh position={[0, roofH/2 + 0.02, 0]} receiveShadow>
              <meshStandardMaterial color="#ffffff" {...texRoof}  bumpScale={0.1} roughness={0.9} />
              <Geometry>
                <Base>
                  <boxGeometry args={[roofW - 0.02, 0.02, roofD - 0.02]} />
                </Base>
                {isLShape && (
                  <Subtraction position={[cutBoxPosX, 0, cutBoxPosZ]}>
                    <boxGeometry args={[cutBoxSize, 0.5, cutBoxSize]} />
                  </Subtraction>
                )}
                
                
                {isGable && (
                  <>
                    <Subtraction position={[-w/4 - roofX - Math.sin(gablePitch)*(w)/2, -roofH/2 + Math.cos(gablePitch)*(w)/2, -roofZ]} rotation={[0, 0, gablePitch]}><boxGeometry args={[w*2, w, roofD + 2]} />
                </Subtraction>
                    <Subtraction position={[w/4 - roofX + Math.sin(gablePitch)*(w)/2, -roofH/2 + Math.cos(gablePitch)*(w)/2, -roofZ]} rotation={[0, 0, -gablePitch]}><boxGeometry args={[w*2, w, roofD + 2]} />
                </Subtraction>
                  </>
                )}
                {(room.skylights || []).map(sky => (
                  <Subtraction key={sky.id} position={[sky.offsetX/1000 - roofX, 0, sky.offsetZ/1000 - roofZ]}>
                    <boxGeometry args={[sky.widthMm/1000, 0.5, sky.lengthMm/1000]} />
                  </Subtraction>
                ))}
              </Geometry>
            </mesh>
          )}
          </group>
        </group>
        )}

      {/*
        Interior warm light - deliberately NOT shadow casting.

        A point light with castShadow renders the whole scene SIX times a frame,
        once per face of a cube shadow map. This one sits inside the room, so
        from the default exterior camera almost none of that work is visible:
        it was costing six extra passes to shadow surfaces you cannot see. The
        matching light further up the file already had castShadow={false}, so
        this was an inconsistency rather than a decision.

        The warm glow through the glazing is unchanged - that comes from the
        light's colour and intensity, not from its shadows.
      */}
      {/*
        Damped in the walkthrough. Both interior lights hang 500mm under the
        ceiling, and with inverse-square falloff that put a bright pool
        directly above them - measured 167 luminance on the ceiling against
        135 on the wall and 88 in the ceiling corner, on one flat colour. The
        walkthrough is where a customer judges the paint, so there the even
        bounce fill in MainScene carries the room and these only warm it.
      */}
      {/*
        Off in the walkthrough entirely.

        Both interior lights hang 500mm under the ceiling, and a point light
        that close throws a broad soft pool straight up onto it - a glowing
        blob over your head that belongs to no fitting at all. Damping it was
        not enough; it is generic room glow, and in the walkthrough the even
        bounce in MainScene lights the room while the spotlights do the rest.
        Kept for the 3D view, where it reads as warmth through the glazing.
      */}
      <pointLight position={[0, h - 0.5, 0]} intensity={viewMode === 'walking' || isNight ? 0 : 3} color="#ffe5b4" distance={10} castShadow={false} />

      {/* Guttering & downpipe. Pent/flat: one half-round run along the low
          edge with its rim flush with the fascia top. Gable: a run along each
          eave. Downpipe drops against the wall face nearest the gutter.
          The trough is an open half-cylinder (theta sweep) - real gutters are
          half-moons, not pipes - so the material must be double-sided or the
          inside face disappears when seen from above. */}
      {!isPlanView && room.hasGuttering && (() => {
        const gutterR = 0.055;
        const pipeR = 0.032;
        const gutterMat = <meshStandardMaterial color="#1f2224" metalness={0.5} roughness={0.4} side={THREE.DoubleSide} />;
        if (isGable) {
          const rimY = h + gableFascia;           // rim flush with the eave fascia top
          const cY = rimY - gutterR;
          const pipeTop = rimY - gutterR * 2;
          if (isSideGable) {
            // Eaves face front and back; gutters run along X.
            return (
              <group>
                <mesh position={[0, cY, (d/2 + ohFront) + gutterR]} rotation={[0, 0, Math.PI/2]}>
                  <cylinderGeometry args={[gutterR, gutterR, roofW + 0.1, 16, 1, false, Math.PI, Math.PI]} />
                  {gutterMat}
                </mesh>
                <mesh position={[0, cY, -(d/2 + ohBack) - gutterR]} rotation={[0, 0, Math.PI/2]}>
                  <cylinderGeometry args={[gutterR, gutterR, roofW + 0.1, 16, 1, false, Math.PI, Math.PI]} />
                  {gutterMat}
                </mesh>
                <mesh position={[w/2 - 0.2, (pipeTop - baseH)/2, -d/2 - pipeR - 0.01]}>
                  <cylinderGeometry args={[pipeR, pipeR, pipeTop + baseH, 12]} />
                  {gutterMat}
                </mesh>
              </group>
            );
          }
          return (
            <group>
              {/* axis along Z; theta picks the local half that faces world -Y, so the trough opens upward */}
              <mesh position={[-(w/2 + ohLeft) - gutterR, cY, 0]} rotation={[Math.PI/2, 0, 0]}>
                <cylinderGeometry args={[gutterR, gutterR, roofD + 0.1, 16, 1, false, -Math.PI/2, Math.PI]} />
                {gutterMat}
              </mesh>
              <mesh position={[(w/2 + ohRight) + gutterR, cY, 0]} rotation={[Math.PI/2, 0, 0]}>
                <cylinderGeometry args={[gutterR, gutterR, roofD + 0.1, 16, 1, false, -Math.PI/2, Math.PI]} />
                {gutterMat}
              </mesh>
              <mesh position={[w/2 + pipeR + 0.01, (pipeTop - baseH)/2, -d/2 + 0.2]}>
                <cylinderGeometry args={[pipeR, pipeR, pipeTop + baseH, 12]} />
                {gutterMat}
              </mesh>
            </group>
          );
        }
        const gutterAtBack = backH <= frontH;
        const edgeH = Math.min(frontH, backH);
        const rimY = edgeH + roofH;               // rim flush with the fascia top
        const cY = rimY - gutterR;
        const pipeTop = rimY - gutterR * 2;
        const zGutter = gutterAtBack ? -d/2 - ohBack - gutterR : d/2 + ohFront + gutterR;
        const zPipe = gutterAtBack ? -d/2 - pipeR - 0.01 : d/2 + pipeR + 0.01;
        return (
          <group>
            {/* axis along X; theta picks the local half that faces world -Y, so the trough opens upward */}
            <mesh position={[roofX, cY, zGutter]} rotation={[0, 0, Math.PI/2]}>
              <cylinderGeometry args={[gutterR, gutterR, roofW + 0.05, 16, 1, false, Math.PI, Math.PI]} />
              {gutterMat}
            </mesh>
            <mesh position={[w/2 - 0.2, (pipeTop - baseH)/2, zPipe]}>
              <cylinderGeometry args={[pipeR, pipeR, pipeTop + baseH, 12]} />
              {gutterMat}
            </mesh>
          </group>
        );
      })()}

      {/* Canopy support posts - added automatically once the canopy projects
          far enough that a real one would need them. Picture-frame surrounds
          carry their own sides, and the L-shape's cut front edge has no
          consistent corner to land a post on. */}
      {!isPlanView && room.hasCanopy && !room.hasPictureFrame && !isLShape && ohFront >= 0.9 && (
        <group>
          {[-(w/2 - 0.055), w/2 - 0.055].map((x, i) => (
            <mesh key={`canopy-post-${i}`} position={[x, (frontH - baseH)/2, d/2 + ohFront - 0.055]} castShadow>
              <boxGeometry args={[0.07, frontH + baseH, 0.07]} />
              <meshStandardMaterial color={frameColorHex} metalness={0.4} roughness={0.4} />
            </mesh>
          ))}
        </group>
      )}

      {/* Apex glazing - glass triangle with slim mullions filling the gable
          peak (the clad triangle is skipped in the CSG when this is on).
          Front orientation glazes the front apex; side orientation glazes
          BOTH side apexes. Mullion heights follow the rake so each bar meets
          the slope. */}
      {!isPlanView && isGable && room.hasApexGlazing && (() => {
        // The whole unit is inset from the true gable triangle so the rake
        // rails stay clear of the sloped roof slabs' underside - centred rails
        // on the raw rake line poked through the roof edge.
        const inset = 0.08;
        const apexBase = h + 0.03;
        const apexH = (h + 0.025 + roofH - 0.12) - apexBase;
        if (apexH <= 0.05) return null;
        const span = gSpan;
        const halfW = span/2 - inset;
        const isPlain = room.apexGlazingStyle === 'plain';
        const rakeAngle = Math.atan2(apexH, halfW);
        const rakeLen = Math.sqrt(halfW*halfW + apexH*apexH) + 0.04;
        const nGaps = Math.max(2, Math.round(span / 0.8));
        const glassShape = new THREE.Shape();
        glassShape.moveTo(-halfW, 0);
        glassShape.lineTo(halfW, 0);
        glassShape.lineTo(0, apexH);
        glassShape.closePath();
        const frameMat = <meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} />;
        const unit = (
          <>
            {/* Glass */}
            <mesh>
              <shapeGeometry args={[glassShape]} />
              <meshPhysicalMaterial color="#aabed1" transparent opacity={0.3} depthWrite={false} roughness={0.05} metalness={0} clearcoat={1} clearcoatRoughness={0.05} envMapIntensity={3} side={THREE.DoubleSide} />
            </mesh>
            {/* Bottom rail - kept in both styles so the glass never floats on the wall top */}
            <mesh position={[0, 0.005, 0]} castShadow>
              <boxGeometry args={[span - inset, isPlain ? 0.03 : 0.06, 0.05]} />
              {frameMat}
            </mesh>
            {!isPlain && (
              <>
                {/* Rake rails - centred on the inset edges, well below the roof underside */}
                <mesh position={[-halfW/2, apexH/2, 0]} rotation={[0, 0, rakeAngle]} castShadow>
                  <boxGeometry args={[rakeLen, 0.055, 0.05]} />
                  {frameMat}
                </mesh>
                <mesh position={[halfW/2, apexH/2, 0]} rotation={[0, 0, -rakeAngle]} castShadow>
                  <boxGeometry args={[rakeLen, 0.055, 0.05]} />
                  {frameMat}
                </mesh>
                {/* Mullions - height follows the rake at each position */}
                {Array.from({ length: nGaps - 1 }).map((_, i) => {
                  const x = -halfW + (2 * halfW * (i + 1)) / nGaps;
                  const hAt = apexH * (1 - Math.abs(x) / halfW) - 0.05;
                  if (hAt <= 0.05) return null;
                  return (
                    <mesh key={`apex-mullion-${i}`} position={[x, hAt/2 + 0.02, 0]}>
                      <boxGeometry args={[0.05, hAt, 0.05]} />
                      {frameMat}
                    </mesh>
                  );
                })}
              </>
            )}
          </>
        );
        if (isSideGable) {
          return (
            <>
              <group position={[w/2 - 0.035, apexBase, 0]} rotation={[0, Math.PI/2, 0]}>{unit}</group>
              <group position={[-w/2 + 0.035, apexBase, 0]} rotation={[0, -Math.PI/2, 0]}>{unit}</group>
            </>
          );
        }
        return <group position={[0, apexBase, d/2 - 0.035]}>{unit}</group>;
      })()}

      {/* Render Door frames and glass */}
      {(room.doors || []).filter(dr => !openingInBay(dr)).map((door) => {
        const doorH = door.heightMm / 1000;
        const offset = door.offsetMm / 1000;
        // Crittall doors default to the slim steel profile; standard doors keep the room's frame style
        const doorFrameT = door.style === 'crittall' ? Math.min(frameThickness, 0.025) : frameThickness;
        const doorSashT = door.style === 'crittall' ? Math.min(sashThickness, 0.025) : sashThickness;
        const frameZ = d/2 - frameDepth/2; 
        const frameX = w/2 - frameDepth/2;
        let pos: [number, number, number] = [offset, doorH/2, frameZ];
        let rot: [number, number, number] = [0, 0, 0];
        const isDraggingThis = selectedElementId === door.id && !controlsEnabled;
        const dragZOffset = isDraggingThis ? 0.015 : 0;

        if (door.wall === 'front') { pos = [offset, doorH/2, frameZ + dragZOffset]; }
        else if (door.wall === 'back') { pos = [offset, doorH/2, -frameZ - dragZOffset]; rot = [0, Math.PI, 0]; }
        else if (door.wall === 'left') { pos = [-frameX - dragZOffset, doorH/2, offset]; rot = [0, -Math.PI/2, 0]; }
        else if (door.wall === 'bay' && bay) {
          // In the divider between room and outdoor section. The set's
          // "outside" is the section, so the frame sits flush with the
          // divider's bay face and the leaves open out into the section.
          // offsetMm runs along the divider from its midpoint.
          const left = bay.side === 'left';
          const faceX = bay.dividerX + (left ? -wallThickness/2 + frameDepth/2 : wallThickness/2 - frameDepth/2);
          pos = [faceX + (left ? -dragZOffset : dragZOffset), doorH/2, (bay.z0 + d/2) / 2 + offset];
          rot = [0, left ? -Math.PI/2 : Math.PI/2, 0];
        }
        else { pos = [frameX + dragZOffset, doorH/2, offset]; rot = [0, Math.PI/2, 0]; }

        return (
        <group 
          key={door.id}
          position={pos}
          rotation={rot}
          userData={{ openingId: door.id }}
          onClick={(e) => { 
            e.stopPropagation(); 
            if (viewMode !== 'walking') setSelectedElementId(door.id); 
          }}
        >
          {/* Drag highlight over the opening. This was an OPAQUE black plane
              sized to the opening: dragging a door/window wider grew a solid
              black rectangle across the whole building, which read as "the
              walls vanish and flash back" for the duration of the drag. Now
              a faint tint that never hides what is behind it. */}
          {isDraggingThis && (
            <mesh position={[0, 0, frameDepth/2 - 0.005]}>
              <planeGeometry args={[door.widthMm/1000, doorH]} />
              <meshBasicMaterial color="#10b981" transparent opacity={0.18} depthWrite={false} />
            </mesh>
          )}
          {selectedElementId === door.id && (
            <>
              <mesh position={[0, 0, 0]}>
                <boxGeometry args={[door.widthMm/1000 + 0.1, door.heightMm/1000 + 0.1, 0.2]} />
                <meshBasicMaterial color="#5A5A40" opacity={0.3} transparent wireframe />
              </mesh>
              <DragHandle
                elementId={door.id}
                position={[0, 0, 0.15]}
                axis={(door.wall === 'front' || door.wall === 'back') ? 'x' : 'z'}
                visualAxis="x"
                color="#00ff00"
                onChange={(dx) => {
                  useStore.getState().updateDoor(door.id, { offsetMm: Math.round((door.offsetMm + dx * 1000) / 50) * 50 });
                }}
              />
              <DragHandle
                elementId={door.id}
                position={[-door.widthMm/2000, 0, 0.15]}
                axis={(door.wall === 'front' || door.wall === 'back') ? 'x' : 'z'}
                visualAxis="x"
                color="#ff0000"
                snapInterval={0.05}
                onChange={(dx) => {
                  const store = useStore.getState();
                  const targetDoor = store.scene.room.doors?.find(d => d.id === door.id);
                  if (targetDoor) {
                    store.updateDoor(door.id, { widthMm: Math.max(100, Math.round((targetDoor.widthMm - dx * 2000) / 100) * 100) });
                  }
                }}
              />
              <DragHandle
                elementId={door.id}
                position={[door.widthMm/2000, 0, 0.15]}
                axis={(door.wall === 'front' || door.wall === 'back') ? 'x' : 'z'}
                visualAxis="x"
                color="#ff0000"
                snapInterval={0.05}
                onChange={(dx) => {
                  const store = useStore.getState();
                  const targetDoor = store.scene.room.doors?.find(d => d.id === door.id);
                  if (targetDoor) {
                    store.updateDoor(door.id, { widthMm: Math.max(100, Math.round((targetDoor.widthMm + dx * 2000) / 100) * 100) });
                  }
                }}
              />
              <DimText 
                position={[0, door.heightMm/2000 + 0.2, 0.1]}
                rotation={[0, 0, 0]}
                value={Math.round(door.widthMm)}
                onValueChange={(val: number) => {
                  useStore.getState().updateDoor(door.id, { widthMm: Math.max(10, val) });
                }}
              />
            </>
          )}
          {/* Main frame border */}
          <group>
             <FrameBar position={[0, -door.heightMm/2000 + doorFrameT/2, 0]} args={[door.widthMm/1000 - doorFrameT*2, doorFrameT, frameDepth]} outer={frameColorHex} inner={frameColorInnerHex} castShadow />
             <FrameBar position={[0, door.heightMm/2000 - doorFrameT/2, 0]} args={[door.widthMm/1000 - doorFrameT*2, doorFrameT, frameDepth]} outer={frameColorHex} inner={frameColorInnerHex} castShadow />
             <FrameBar position={[-door.widthMm/2000 + doorFrameT/2, 0, 0]} args={[doorFrameT, door.heightMm/1000, frameDepth]} outer={frameColorHex} inner={frameColorInnerHex} castShadow />
             <FrameBar position={[door.widthMm/2000 - doorFrameT/2, 0, 0]} args={[doorFrameT, door.heightMm/1000, frameDepth]} outer={frameColorHex} inner={frameColorInnerHex} castShadow />
             {/*
               Threshold. The frame sits flush with the OUTER face of the wall,
               and the internal floor stops at the INNER face - so from inside
               there was a strip of the base plinth showing between the two,
               under the door, and the plinth is finished in decking. Every real
               door set has an aluminium threshold across that gap; this is it,
               spanning from the frame's inner face to the inner wall face
               (plus 10mm under the floor edge so there is no hairline), sitting
               4mm proud of the finished floor as a real one does.
             */}
             <mesh position={[0, -doorH/2 + 0.007, -wallThickness/2 - 0.005]} castShadow receiveShadow>
               <boxGeometry args={[door.widthMm/1000, 0.014, wallThickness - frameDepth + 0.01]} />
               <meshStandardMaterial color={frameColorInnerHex} metalness={0.6} roughness={0.3} />
             </mesh>
          </group>
          {/* Entrance steps down to the garden - solid blocks in even ~170mm
              rises, each tread reaching 300mm further out. Skipped on the
              front wall when decking already provides the platform. */}
          {room.hasDoorSteps && baseH > 0.03 && !(isDecking && door.wall === 'front') && (() => {
            const rises = Math.max(2, Math.ceil(baseH / 0.17));
            const treadD = 0.3;
            return (
              <group>
                {Array.from({ length: rises - 1 }).map((_, s) => {
                  const topY = -doorH/2 - baseH * (s + 1) / rises;
                  const hgt = baseH * (rises - 1 - s) / rises;
                  return (
                    <mesh key={`step-${s}`} position={[0, topY - hgt/2, frameDepth/2 + treadD*(s+1) - treadD/2 + 0.01]} castShadow receiveShadow>
                      <boxGeometry args={[door.widthMm/1000 + 0.15, hgt, treadD]} />
                      <meshStandardMaterial color={baseColorHex} roughness={0.85} />
                    </mesh>
                  );
                })}
              </group>
            );
          })()}
          {/* Leaves */}
          <AnimatedDoorLeaves door={door} room={room} frameColorHex={frameColorHex} frameColorInnerHex={frameColorInnerHex} frameThickness={doorFrameT} sashThickness={doorSashT} depth={frameDepth} />
        </group>
      )})}


      {/* Render Windows frames and glass */}
      {room.windows.filter(wn => !openingInBay(wn)).map(win => {
        const winW = win.widthMm / 1000;
        const winH = win.heightMm / 1000;
        const sill = (win.sillMm ?? 0) / 1000;
        const offset = (win.offsetMm ?? 0) / 1000;
        // Crittall windows default to the slim steel profile; standard windows keep the room's frame style
        const winFrameT = win.style === 'crittall' ? Math.min(frameThickness, 0.025) : frameThickness;
        const winSashT = win.style === 'crittall' ? Math.min(sashThickness, 0.025) : sashThickness;

        let pos: [number, number, number] = [0, sill + winH/2, 0];
        let rot: [number, number, number] = [0, 0, 0];
        const isDraggingThis = selectedElementId === win.id && !controlsEnabled;
        const dragZOffset = isDraggingThis ? 0.015 : 0;
        // Calculate offset to be flush with the wall surface
        const frameZ = d/2 - frameDepth/2; 
        const frameX = w/2 - frameDepth/2;

        if (win.wall === 'front') { pos = [offset, sill + winH/2, frameZ + dragZOffset]; } 
        else if (win.wall === 'back') { pos = [offset, sill + winH/2, -frameZ - dragZOffset]; rot = [0, Math.PI, 0]; } 
        else if (win.wall === 'left') { pos = [-frameX - dragZOffset, sill + winH/2, offset]; rot = [0, -Math.PI/2, 0]; } 
        else if (win.wall === 'bay' && bay) {
          // In the divider, outside face toward the section - as for doors.
          const left = bay.side === 'left';
          const faceX = bay.dividerX + (left ? -wallThickness/2 + frameDepth/2 : wallThickness/2 - frameDepth/2);
          pos = [faceX + (left ? -dragZOffset : dragZOffset), sill + winH/2, (bay.z0 + d/2) / 2 + offset];
          rot = [0, left ? -Math.PI/2 : Math.PI/2, 0];
        }
        else { pos = [frameX + dragZOffset, sill + winH/2, offset]; rot = [0, Math.PI/2, 0]; }

        return (
          <group 
            key={`win-${win.id}`} 
            position={pos} 
            rotation={rot}
            userData={{ openingId: win.id }}
            onClick={(e) => { 
              e.stopPropagation(); 
              if (viewMode !== 'walking') setSelectedElementId(win.id); 
            }}
          >
            {/* Faint drag highlight - see the door note above; this was an
                opaque black plane that blacked out the building on resize. */}
            {isDraggingThis && (
            <mesh position={[0, 0, frameDepth/2 - 0.005]}>
              <planeGeometry args={[winW, winH]} />
              <meshBasicMaterial color="#10b981" transparent opacity={0.18} depthWrite={false} />
            </mesh>
          )}
          {selectedElementId === win.id && (
              <>
                <DimText 
                  position={[0, winH/2 + 0.2, 0.1]}
                  rotation={[0, 0, 0]}
                  value={Math.round(win.widthMm)}
                  onValueChange={(val: number) => {
                    useStore.getState().updateWindow(win.id, { widthMm: Math.max(10, val) });
                  }}
                />
                <mesh position={[0, 0, 0]}>
                  <boxGeometry args={[winW + 0.1, winH + 0.1, 0.2]} />
                  <meshBasicMaterial color="#5A5A40" opacity={0.3} transparent wireframe />
                </mesh>
                <DragHandle
                  position={[0, 0, 0.15]}
                  axis={(win.wall === 'front' || win.wall === 'back') ? 'x' : 'z'}
                  visualAxis="x"
                  color="#0000ff"
                  onChange={(delta) => {
                     const store = useStore.getState();
                     const targetWin = store.scene.room.windows.find(w => w.id === win.id);
                     if (targetWin) {
                       store.updateWindow(win.id, { offsetMm: (targetWin.offsetMm ?? 0) + delta * 1000 });
                     }
                  }}
                />
                <DragHandle
                  position={[-winW/2, 0, 0.15]}
                  axis={(win.wall === 'front' || win.wall === 'back') ? 'x' : 'z'}
                  color="#ff0000"
                  snapInterval={0.05}
                  onChange={(delta) => {
                     const store = useStore.getState();
                     const targetWin = store.scene.room.windows.find(w => w.id === win.id);
                     if (targetWin) {
                       store.updateWindow(win.id, { widthMm: Math.max(10, (targetWin.widthMm ?? 1000) - delta * 2000) });
                     }
                  }}
                />
                <DragHandle
                  position={[winW/2, 0, 0.15]}
                  axis={(win.wall === 'front' || win.wall === 'back') ? 'x' : 'z'}
                  color="#ff0000"
                  snapInterval={0.05}
                  onChange={(delta) => {
                     const store = useStore.getState();
                     const targetWin = store.scene.room.windows.find(w => w.id === win.id);
                     if (targetWin) {
                       store.updateWindow(win.id, { widthMm: Math.max(10, (targetWin.widthMm ?? 1000) + delta * 2000) });
                     }
                  }}
                />
              </>
            )}
             {/* Outer Frame */}
             <FrameBar position={[0, winH/2-winFrameT/2, 0]} args={[winW, winFrameT, frameDepth]} outer={frameColorHex} inner={frameColorInnerHex} castShadow />
             <FrameBar position={[0, -winH/2+winFrameT/2, 0]} args={[winW, winFrameT, frameDepth]} outer={frameColorHex} inner={frameColorInnerHex} castShadow />
             <FrameBar position={[-winW/2+winFrameT/2, 0, 0]} args={[winFrameT, winH - winFrameT*2, frameDepth]} outer={frameColorHex} inner={frameColorInnerHex} castShadow />
             <FrameBar position={[winW/2-winFrameT/2, 0, 0]} args={[winFrameT, winH - winFrameT*2, frameDepth]} outer={frameColorHex} inner={frameColorInnerHex} castShadow />
             
             {/* Protruding Sill - only on raised windows; full-height glazing meets the floor */}
             {!win.fullHeight && (win.sillMm ?? 0) > 0 && (
               <mesh position={[0, -winH/2-0.01, frameDepth/2 + 0.02]} rotation={[0.08, 0, 0]} castShadow><boxGeometry args={[winW + 0.1, 0.04, 0.10]} /><meshStandardMaterial color={frameColorHex} metalness={0.6} roughness={0.3} /></mesh>
             )}
             
             {/* Sash Details & Glass panes */}
             {Array.from({ length: win.leaves || 1 }).map((_, i) => {
               const panesCount = win.leaves || 1;
               const paneW = (winW - winFrameT*2) / panesCount;
               const posX = - ((winW - winFrameT*2)/2) + paneW/2 + i * paneW;

               return (
                 <group key={`pane-${i}`} position={[posX, 0, 0]}>
                   <FrameBar position={[0, winH/2-winFrameT-winSashT/2, 0]} args={[paneW, winSashT, frameDepth*0.3]} outer={frameColorHex} inner={frameColorInnerHex} />
                   <FrameBar position={[0, -winH/2+winFrameT+winSashT/2, 0]} args={[paneW, winSashT, frameDepth*0.3]} outer={frameColorHex} inner={frameColorInnerHex} />
                   <FrameBar position={[-paneW/2+winSashT/2, 0, 0]} args={[winSashT, winH - winFrameT*2 - winSashT*2, frameDepth*0.3]} outer={frameColorHex} inner={frameColorInnerHex} />
                   <FrameBar position={[paneW/2-winSashT/2, 0, 0]} args={[winSashT, winH - winFrameT*2 - winSashT*2, frameDepth*0.3]} outer={frameColorHex} inner={frameColorInnerHex} />
                   {/* Glass */}
                   <mesh>
                     <boxGeometry args={[paneW - winSashT*2, winH - winFrameT*2 - winSashT*2, 0.02]} />
                     <meshPhysicalMaterial color="#aabed1" transparent opacity={0.3} depthWrite={false} roughness={0.05} metalness={0} clearcoat={1} clearcoatRoughness={0.05} envMapIntensity={3} />
                   </mesh>
                   {win.style === 'crittall' && (
                     <CrittallBars
                       glassW={paneW - winSashT*2}
                       glassH={winH - winFrameT*2 - winSashT*2}
                       depth={0.03}
                       color={frameColorHex}
                       innerColor={frameColorInnerHex}
                     />
                   )}

                 </group>
               );
             })}
          </group>
        );
      })}

      {/* Render Skylights */}
      {(room.skylights || []).map(sky => {
        const skyW = sky.widthMm / 1000;
        const skyL = sky.lengthMm / 1000;
        const sX = sky.offsetX / 1000;
        const sZ = sky.offsetZ / 1000;
        const roofY = (isPitched && !isGable ? (frontH + backH)/2 : h) + roofH;
        const isHovered = hoveredElementId === `sky-${sky.id}`;

        return (
          <group 
            key={sky.id} 
            position={[sX, roofY + 0.05, sZ]}
            onPointerOver={(e) => { e.stopPropagation(); useStore.getState().setHoveredElementId(`sky-${sky.id}`); }}
            onPointerOut={() => useStore.getState().setHoveredElementId(null)}
          >
            {/* Kerb (Upstand) */}
            <mesh position={[0, -0.05, 0]}>
               <boxGeometry args={[skyW, 0.1, skyL]} />
               <meshStandardMaterial color="#333333" />
            </mesh>

            {/* Lantern option removed - the pyramid never looked like a real
                lantern. Any saved 'lantern' skylights render flat too. */}
            {(
              <group position={[0, 0, 0]}>
                {/* Flat skylight glass */}
                <mesh position={[0, 0.02, 0]}>
                  <boxGeometry args={[skyW, 0.02, skyL]} />
                  <meshPhysicalMaterial color="#aabed1" transparent opacity={0.3} depthWrite={false} roughness={0.05} metalness={0} clearcoat={1} clearcoatRoughness={0.05} />
                </mesh>
                {/* Metal Frame */}
                {/* Front */}
                <mesh position={[0, 0.03, skyL/2]}><boxGeometry args={[skyW + 0.04, 0.04, 0.04]} /><meshStandardMaterial color={frameColorHex} /></mesh>
                {/* Back */}
                <mesh position={[0, 0.03, -skyL/2]}><boxGeometry args={[skyW + 0.04, 0.04, 0.04]} /><meshStandardMaterial color={frameColorHex} /></mesh>
                {/* Left */}
                <mesh position={[-skyW/2, 0.03, 0]}><boxGeometry args={[0.04, 0.04, skyL + 0.04]} /><meshStandardMaterial color={frameColorHex} /></mesh>
                {/* Right */}
                <mesh position={[skyW/2, 0.03, 0]}><boxGeometry args={[0.04, 0.04, skyL + 0.04]} /><meshStandardMaterial color={frameColorHex} /></mesh>
              </group>
            )}

            {room.showDimensions && isHovered && (
               <>
                 <DragHandle elementId={`sky-${sky.id}`} position={[0, 0.2, skyL/2 + 0.3]} axis="z" onChange={(dz) => useStore.getState().updateSkylight(sky.id, { offsetZ: sky.offsetZ + dz*1000 })} />
                 <DragHandle elementId={`sky-${sky.id}`} position={[skyW/2 + 0.3, 0.2, 0]} axis="x" onChange={(dx) => useStore.getState().updateSkylight(sky.id, { offsetX: sky.offsetX + dx*1000 })} />
                 
                 <DragHandle elementId={`sky-${sky.id}`} position={[skyW/2 + 0.1, 0.2, skyL/2]} axis="x" color="#ff0000" visualAxis="x" onChange={(dx) => useStore.getState().updateSkylight(sky.id, { widthMm: Math.max(300, sky.widthMm + dx*2000) })} />
                 <DragHandle elementId={`sky-${sky.id}`} position={[skyW/2, 0.2, skyL/2 + 0.1]} axis="z" color="#ff0000" visualAxis="z" onChange={(dz) => useStore.getState().updateSkylight(sky.id, { lengthMm: Math.max(300, sky.lengthMm + dz*2000) })} />
               </>
            )}
          </group>
        );
      })}

      {/* Internal walls - one unified system. Each wall is selectable
          (click), body-draggable with snapping to the room walls and other
          internal walls, and owns its doors so they travel with it. */}
      {room.partitions?.map(part => (
        <PartitionUnit key={part.id} part={part} hP={isPitched && !isGable ? (frontH + backH)/2 : h} room={room} showDims={room.showDimensions} />
      ))}

      {/* Interior Doors */}
      {(room.interiorDoors || []).map(door => {
        const dW = door.widthMm/1000;
        const dH = door.heightMm/1000;
        const dX = door.xMm/1000;
        const dZ = door.zMm/1000;
        const isHovered = hoveredElementId === `intdoor-${door.id}`;
        const rot = door.rotation === 90 ? Math.PI/2 : 0;
        return (
          <group 
            key={door.id}
            position={[dX, dH/2, dZ]}
            rotation={[0, rot, 0]}
            onPointerOver={(e) => { e.stopPropagation(); useStore.getState().setHoveredElementId(`intdoor-${door.id}`); }}
            onPointerOut={() => useStore.getState().setHoveredElementId(null)}
          >
            {/* Wooden Frame */}
            <mesh position={[-dW/2 + 0.015, 0, 0]} castShadow receiveShadow>
               <boxGeometry args={[0.03, dH, 0.12]} />
               <meshStandardMaterial color="#fcd3a1" roughness={0.7} />
            </mesh>
            <mesh position={[dW/2 - 0.015, 0, 0]} castShadow receiveShadow>
               <boxGeometry args={[0.03, dH, 0.12]} />
               <meshStandardMaterial color="#fcd3a1" roughness={0.7} />
            </mesh>
            <mesh position={[0, dH/2 - 0.015, 0]} castShadow receiveShadow>
               <boxGeometry args={[dW - 0.06, 0.03, 0.12]} />
               <meshStandardMaterial color="#fcd3a1" roughness={0.7} />
            </mesh>
            
            {/* Door Leaf (open 45 deg) */}
            <group position={[-dW/2 + 0.03, 0, 0]} rotation={[0, -Math.PI/4, 0]}>
              <mesh position={[dW/2 - 0.03, 0, 0]} castShadow>
                 <boxGeometry args={[dW - 0.06, dH - 0.03, 0.035]} />
                 <meshStandardMaterial color="#ffffff" roughness={0.8} />
              </mesh>
            </group>

            {room.showDimensions && isHovered && (
               <>
                 {door.rotation === 0 ? (
                   <>
                     <DragHandle elementId={`intdoor-${door.id}`} position={[0, dH/2 + 0.3, 0]} axis="z" visualAxis="z" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updateInteriorDoor(door.id, { zMm: door.zMm + dz*1000 })} />
                     <DragHandle elementId={`intdoor-${door.id}`} position={[0, dH/2 + 0.3, 0]} axis="x" visualAxis="x" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updateInteriorDoor(door.id, { xMm: door.xMm + dx*1000 })} />
                   </>
                 ) : (
                   <>
                     <DragHandle elementId={`intdoor-${door.id}`} position={[0, dH/2 + 0.3, 0]} axis="x" visualAxis="z" color="#00ff00" snapInterval={0.05} onChange={(dx) => useStore.getState().updateInteriorDoor(door.id, { xMm: door.xMm + dx*1000 })} />
                     <DragHandle elementId={`intdoor-${door.id}`} position={[0, dH/2 + 0.3, 0]} axis="z" visualAxis="x" color="#00ff00" snapInterval={0.05} onChange={(dz) => useStore.getState().updateInteriorDoor(door.id, { zMm: door.zMm + dz*1000 })} />
                   </>
                 )}
               </>
            )}
          </group>
        );
      })}
      
      {/* Plan View Annotations (Doors/Windows marked on walls) */}
      {isPlanView && (
        <group position={[0, h + 0.2, 0]}>
          {room.windows.map(win => {
            const winW = win.widthMm / 1000;
            const offset = (win.offsetMm ?? 0) / 1000;
            let pos: [number, number, number] = [0, 0, 0];
            let rot: [number, number, number] = [0, 0, 0];
            const frameZ = d/2 - frameDepth/2; 
            const frameX = w/2 - frameDepth/2;
            
            if (win.wall === 'front') { pos = [offset, 0, frameZ]; } 
            else if (win.wall === 'back') { pos = [offset, 0, -frameZ]; rot = [0, Math.PI, 0]; } 
            else if (win.wall === 'left') { pos = [-frameX, 0, offset]; rot = [0, -Math.PI/2, 0]; } 
            else if (win.wall === 'bay') { if (!bay) return null; pos = [bay.dividerX, 0, (bay.z0 + d/2) / 2 + offset]; rot = [0, Math.PI/2, 0]; }
            else { pos = [frameX, 0, offset]; rot = [0, Math.PI/2, 0]; }

            return (
              <mesh key={`plan-win-${win.id}`} position={pos} rotation={[...rot] as [number, number, number]}>
                {/* Main Box outline */}
                <mesh position={[0, 0, 0]} rotation={[-Math.PI/2, 0, 0]}>
                  <planeGeometry args={[winW, wallThickness]} />
                  <meshBasicMaterial color="white" />
                  <Edges color="black" scale={1} />
                </mesh>
                {/* Center Glass Line */}
                <mesh position={[0, 0, 0]} rotation={[-Math.PI/2, 0, 0]}>
                  <planeGeometry args={[winW, 0.05]} />
                  <meshBasicMaterial color="black" />
                </mesh>
              </mesh>
            );
          })}
          {(room.doors || []).map(door => {
            const offset = door.offsetMm / 1000;
            const frameZ = d/2 - frameDepth/2; 
            const frameX = w/2 - frameDepth/2;
            let pos: [number, number, number] = [offset, 0, frameZ];
            let rot: [number, number, number] = [0, 0, 0];
            
            if (door.wall === 'front') { pos = [offset, 0, frameZ]; } 
            else if (door.wall === 'back') { pos = [offset, 0, -frameZ]; rot = [0, Math.PI, 0]; } 
            else if (door.wall === 'left') { pos = [-frameX, 0, offset]; rot = [0, -Math.PI/2, 0]; } 
            else if (door.wall === 'bay') { if (!bay) return null; pos = [bay.dividerX, 0, (bay.z0 + d/2) / 2 + offset]; rot = [0, Math.PI/2, 0]; }
            else { pos = [frameX, 0, offset]; rot = [0, Math.PI/2, 0]; }
            
            return (
            <mesh key={door.id} position={pos} rotation={rot}>
              {/* Door Swing Arc / Frame block */}
              <mesh position={[0, 0, 0]} rotation={[-Math.PI/2, 0, 0]}>
                <planeGeometry args={[door.widthMm/1000, frameDepth]} />
                <meshBasicMaterial color="white" />
                <Edges color="black" scale={1} />
              </mesh>
              {/* Center Door Line */}
              <mesh position={[0, 0, 0]} rotation={[-Math.PI/2, 0, 0]}>
                <planeGeometry args={[door.widthMm/1000, 0.05]} />
                <meshBasicMaterial color="black" />
              </mesh>
            </mesh>
          )
          })}

          {/* Opening dimension chains: wall edge -> opening -> gap -> wall edge,
              one running chain per wall that has doors or windows. This is what
              a builder actually sets out from - the overall dims alone don't
              say WHERE the openings sit. Read-only labels; positions are edited
              on the openings themselves. LShape skipped: offsets there are not
              relative to a single straight wall. */}
          {room.showDimensions && room.shape !== 'LShape' && (['front', 'back', 'left', 'right'] as const).filter(side => {
            // On the PLAN every wall's setting-out chain is drawn by the
            // "Wall Openings Dimensions" block further down (editable widths),
            // so this one stays out of plan view or the numbers print twice.
            // In the 3D view only the wall whose opening is selected is
            // chained - all four at once stacked labels on top of each other.
            if (isPlanView) return false;
            const sel = selectedElementId;
            if (!sel) return false;
            const d0 = (room.doors || []).find(dr => dr.id === sel);
            const w0 = room.windows.find(wn => wn.id === sel);
            return (d0?.wall ?? w0?.wall) === side;
          }).map(side => {
            const horiz = side === 'front' || side === 'back';
            const L = horiz ? w : d;
            const openings = [
              ...(room.doors || []).filter(dr => dr.wall === side).map(dr => ({ c: (dr.offsetMm || 0) / 1000, hw: (dr.widthMm / 1000) / 2 })),
              ...room.windows.filter(wn => wn.wall === side).map(wn => ({ c: (wn.offsetMm ?? 0) / 1000, hw: (wn.widthMm / 1000) / 2 })),
            ].sort((a, b) => a.c - b.c);
            if (openings.length === 0) return null;

            const pts: number[] = [-L / 2];
            openings.forEach(o => {
              pts.push(Math.max(-L / 2, o.c - o.hw), Math.min(L / 2, o.c + o.hw));
            });
            pts.push(L / 2);

            const off = 0.45; // between the wall face and the overall dimension line
            // The front chain sits beyond the deck on a plan, as on a drawing,
            // so the numbers are not printed across the boards.
            const frontClear = isPlanView && room.hasDecking ? (room.deckingSizeMm || 0) / 1000 : 0;
            const base: [number, number, number] =
              side === 'front' ? [0, 0, d / 2 + frontClear + off]
              : side === 'back' ? [0, 0, -d / 2 - off]
              : side === 'left' ? [-w / 2 - off, 0, 0]
              : [w / 2 + off, 0, 0];
            const rotText: [number, number, number] =
              side === 'front' ? [-Math.PI / 2, 0, 0]
              : side === 'back' ? [-Math.PI / 2, 0, Math.PI]
              : side === 'left' ? [-Math.PI / 2, 0, -Math.PI / 2]
              : [-Math.PI / 2, 0, Math.PI / 2];

            return (
              <group key={`chain-${side}`} position={base}>
                <Line points={horiz ? [[-L / 2, 0, 0], [L / 2, 0, 0]] : [[0, 0, -L / 2], [0, 0, L / 2]]} color="#000" lineWidth={0.75} />
                {pts.map((p, i) => (
                  <Line key={`tick-${i}`} points={horiz ? [[p, 0, -0.06], [p, 0, 0.06]] : [[-0.06, 0, p], [0.06, 0, p]]} color="#000" lineWidth={0.75} />
                ))}
                {pts.slice(0, -1).map((p, i) => {
                  const q = pts[i + 1];
                  const segMm = Math.round((q - p) * 1000);
                  // Skip slivers: they produced unreadable "0 mm" tags stacked
                  // on the neighbouring label.
                  if (segMm < 50) return null;
                  const mid = (p + q) / 2;
                  return (
                    <DimText
                      key={`seg-${i}`}
                      position={horiz ? [mid, 0, 0] : [0, 0, mid]}
                      rotation={rotText}
                      value={segMm}
                    />
                  );
                })}
              </group>
            );
          })}
        </group>
      )}

      {/* Dimension Line Labels */}
      {room.showDimensions && (isHoveredRoom || isPlanView || useStore.getState().isExporting) && (
        <group>
          {/* Width */}
          {false && (
          <group position={[roofX, -0.05, d/2 + 0.5 + Math.max(0, ohFront)]}>
            <Line points={[[-roofW/2, 0, 0], [roofW/2, 0, 0]]} color="#000" lineWidth={1} />
            <Line points={[-roofW/2 - 0.05, 0, -0.05, -roofW/2 + 0.05, 0, 0.05]} color="#000" lineWidth={1} />
            <Line points={[roofW/2 - 0.05, 0, -0.05, roofW/2 + 0.05, 0, 0.05]} color="#000" lineWidth={1} />
            <Line points={[[-roofW/2, 0, -0.4], [-roofW/2, 0, 0.1]]} color="#000" lineWidth={0.5} opacity={0.3} transparent />
            <Line points={[[roofW/2, 0, -0.4], [roofW/2, 0, 0.1]]} color="#000" lineWidth={0.5} opacity={0.3} transparent />
            <DimText 
              position={[0, 0, 0]} 
              rotation={[-Math.PI/2, 0, 0]}
              value={Math.round(roofW * 1000)}
              onValueChange={(val: number) => {
                const store = useStore.getState();
                const newW = val - (store.scene.room.overhangLeftMm || 0) - (store.scene.room.overhangRightMm || 0);
                store.updateRoom({ widthMm: Math.max(10, newW) });
              }}
            />
            {room.showDimensions && (
              <>
                <DragHandle 
                  position={[roofW/2, 0, 0]} 
                  axis="x" 
                  label="Room Width"
                  onChange={(dx) => {
                    const store = useStore.getState();
                    store.updateRoom({ widthMm: Math.max(10, Math.round((store.scene.room.widthMm + dx * 2000) / 100) * 100) });
                  }} 
                />
                <DragHandle 
                  position={[-roofW/2, 0, 0]} 
                  axis="x" 
                  label="Room Width"
                  onChange={(dx) => {
                    const store = useStore.getState();
                    store.updateRoom({ widthMm: Math.max(10, Math.round((store.scene.room.widthMm - dx * 2000) / 100) * 100) });
                  }} 
                />
              </>
            )}
          </group>
          )}

          {/* Depth */}
          {false && (
          <group position={[w/2 + 0.5 + Math.max(0, ohRight), -0.05, roofZ]}>
            <Line points={[[0, 0, -roofD/2], [0, 0, roofD/2]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, 0, -roofD/2 - 0.05], [0.05, 0, -roofD/2 + 0.05]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, 0, roofD/2 - 0.05], [0.05, 0, roofD/2 + 0.05]]} color="#000" lineWidth={1} />
            <Line points={[[-0.4, 0, -roofD/2], [0.1, 0, -roofD/2]]} color="#000" lineWidth={0.5} opacity={0.3} transparent />
            <Line points={[[-0.4, 0, roofD/2], [0.1, 0, roofD/2]]} color="#000" lineWidth={0.5} opacity={0.3} transparent />
            <DimText 
              position={[0, 0, 0]} 
              rotation={[-Math.PI/2, 0, Math.PI/2]}
              value={Math.round(roofD * 1000)}
              onValueChange={(val: number) => {
                const store = useStore.getState();
                const newD = val - (store.scene.room.canopySizeMm || 0) - (store.scene.room.overhangBackMm || 0);
                store.updateRoom({ depthMm: Math.max(10, newD) });
              }}
            />
            {room.showDimensions && (
              <>
                <DragHandle 
                  position={[0, 0, roofD/2]} 
                  axis="z" 
                  label="Room Depth"
                  onChange={(dz) => {
                    const store = useStore.getState();
                    // Z axis goes backwards!
                    store.updateRoom({ depthMm: Math.max(10, Math.round((store.scene.room.depthMm + dz * 2000) / 100) * 100) });
                  }} 
                />
                <DragHandle 
                  position={[0, 0, -roofD/2]} 
                  axis="z" 
                  label="Room Depth"
                  onChange={(dz) => {
                    const store = useStore.getState();
                    store.updateRoom({ depthMm: Math.max(10, Math.round((store.scene.room.depthMm - dz * 2000) / 100) * 100) });
                  }} 
                />
              </>
            )}
          </group>
          )}

          {/* Front Height */}
          {!isPlanView && (
          <group position={[-w/2 - 0.5, (frontH + baseH + roofH)/2, d/2]}>
            <Line points={[[0, -(frontH + baseH + roofH)/2, 0], [0, (frontH + baseH + roofH)/2, 0]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, -(frontH + baseH + roofH)/2 - 0.05, 0], [0.05, -(frontH + baseH + roofH)/2 + 0.05, 0]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, (frontH + baseH + roofH)/2 - 0.05, 0], [0.05, (frontH + baseH + roofH)/2 + 0.05, 0]]} color="#000" lineWidth={1} />
            <Line points={[[0.4, -(frontH + baseH + roofH)/2, 0], [-0.1, -(frontH + baseH + roofH)/2, 0]]} color="#000" lineWidth={0.5} opacity={0.3} transparent />
            <Line points={[[0.4, (frontH + baseH + roofH)/2, 0], [-0.1, (frontH + baseH + roofH)/2, 0]]} color="#000" lineWidth={0.5} opacity={0.3} transparent />
            <DimText 
              position={[0, 0, 0]} 
              rotation={[0, -Math.PI/2, 0]}
              value={Math.round((frontH + baseH + roofH) * 1000)}
              onValueChange={(val: number) => {
                const store = useStore.getState();
                // For Gable, heightMm IS the total height (frontH already has
                // base+roof subtracted), so the typed total stores directly.
                // Subtracting again shrank a Gable building by base+roof every
                // time the displayed number was retyped unchanged.
                const newHeight = isGable
                  ? val
                  : val - (store.scene.room.baseHeightMm || 100) - (store.scene.room.roofHeightMm || 200);
                store.updateRoom({ heightMm: Math.max(10, newHeight) });
              }}
            />
            {room.showDimensions && (
              <DragHandle 
                position={[0, (frontH + baseH + roofH)/2, 0]} 
                axis="y" 
                label={isGable || isPitched ? "Eaves Height" : "Front Height"}
                onChange={(dy) => {
                  const store = useStore.getState();
                  store.updateRoom({ heightMm: Math.max(10, Math.round((store.scene.room.heightMm + dy * 1000) / 100) * 100) });
                }} 
              />
            )}
          </group>
          )}
          {/* Roof Height (Ridge) Handle. Never on plans: a HEIGHT floating on a
              top-down drawing read as a mystery "300mm" on the exported PDF. */}
          {(isGable || isPitched) && room.showDimensions && !isPlanView && (
            <group position={[0, h + roofH + 0.1, d/2 + 0.1]} rotation={[0, 0, 0]}>
              <DimText 
                position={[0, 0, 0]}
                rotation={[0, 0, 0]}
                value={Math.round(roofH * 1000)}
                onValueChange={(val) => {
                  useStore.getState().updateRoom({ roofHeightMm: Math.max(10, val) });
                }}
              />
              <DragHandle 
                position={[0, 0, 0]} 
                axis="y" 
                label="Ridge Height"
                color="#8a2be2"
                onChange={(dy) => {
                  const store = useStore.getState();
                  store.updateRoom({ roofHeightMm: Math.max(10, Math.round(((store.scene.room.roofHeightMm || 200) + dy * 1000) / 100) * 100) });
                }} 
              />
            </group>
          )}


          {/* LShape Cutout Dimensions */}
          {false && (
            <group position={[w/2 - cutW/2, 0.5, d/2 - cutD/2]}>
              <DimText 
                position={[-cutW/2, 0.1, cutD/2]}
                rotation={[-Math.PI/2, 0, 0]}
                value={Math.round(room.lShapeCutoutWidthMm ?? 2000)}
                onValueChange={(val: number) => {
                  useStore.getState().updateRoom({ lShapeCutoutWidthMm: Math.max(10, val) });
                }}
              />
              <DragHandle
                position={[-cutW/2, 0, cutD/2]}
                axis="x"
                color="#ff8c00"
                onChange={(dx) => {
                   const store = useStore.getState();
                   const curW = store.scene.room.lShapeCutoutWidthMm ?? 2000;
                   store.updateRoom({ lShapeCutoutWidthMm: Math.max(10, Math.round((curW - dx * 1000) / 100) * 100) });
                }}
              />
              <DimText 
                position={[cutW/2, 0.1, -cutD/2]}
                rotation={[-Math.PI/2, 0, Math.PI/2]}
                value={Math.round(room.lShapeCutoutDepthMm ?? 1500)}
                onValueChange={(val: number) => {
                  useStore.getState().updateRoom({ lShapeCutoutDepthMm: Math.max(10, val) });
                }}
              />
              <DragHandle
                position={[cutW/2, 0, -cutD/2]}
                axis="z"
                color="#ff8c00"
                onChange={(dz) => {
                   const store = useStore.getState();
                   const curD = store.scene.room.lShapeCutoutDepthMm ?? 1500;
                   store.updateRoom({ lShapeCutoutDepthMm: Math.max(10, Math.round((curD - dz * 1000) / 100) * 100) });
                }}
              />
            </group>
          )}

          {/* Back Height. Never on a gable - a gable is symmetric, its one
              height story is eaves/ridge, and a separate back figure was how
              stale nonsense numbers reached the 3D view and PDF. */}
          {!isPlanView && !isGable && (
          <group position={[-w/2 - 0.5, (backH + baseH + roofH)/2, -d/2]}>
            <Line points={[[0, -(backH + baseH + roofH)/2, 0], [0, (backH + baseH + roofH)/2, 0]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, -(backH + baseH + roofH)/2 - 0.05, 0], [0.05, -(backH + baseH + roofH)/2 + 0.05, 0]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, (backH + baseH + roofH)/2 - 0.05, 0], [0.05, (backH + baseH + roofH)/2 + 0.05, 0]]} color="#000" lineWidth={1} />
            <Line points={[[0.4, -(backH + baseH + roofH)/2, 0], [-0.1, -(backH + baseH + roofH)/2, 0]]} color="#000" lineWidth={0.5} opacity={0.3} transparent />
            <Line points={[[0.4, (backH + baseH + roofH)/2, 0], [-0.1, (backH + baseH + roofH)/2, 0]]} color="#000" lineWidth={0.5} opacity={0.3} transparent />
            <DimText 
              position={[0, 0, 0]} 
              rotation={[0, -Math.PI/2, 0]}
              value={Math.round((backH + baseH + roofH) * 1000)}
              onValueChange={(val: number) => {
                const store = useStore.getState();
                const newTotal = val;
                const newBackH = newTotal - (store.scene.room.baseHeightMm || 100) - (store.scene.room.roofHeightMm || 200);
                store.updateRoom({ backHeightMm: Math.max(10, newBackH) });
              }}
            />
            {room.showDimensions && room.shape !== 'Gable' && (
              <DragHandle 
                position={[0, (backH + baseH + roofH)/2, 0]} 
                axis="y" 
                onChange={(dy) => {
                  const store = useStore.getState();
                  const curBackH = store.scene.room.backHeightMm ?? store.scene.room.heightMm;
                  store.updateRoom({ backHeightMm: Math.max(10, Math.round((curBackH + dy * 1000) / 100) * 100) });
                }} 
              />
            )}
          </group>
          )}

          {/* Roof Thickness & Overhang Controls */}
          {room.showDimensions && !isPlanView && (
            <group position={[0, baseH + Math.max(frontH, backH) + roofH/2, 0]}>

              {isCanopy && (
                <>
                  <DimText 
                    position={[0, 0, d/2 + ohFront + 0.15]}
                    rotation={[-Math.PI/2, 0, Math.PI/2]}
                    hideIfZero value={Math.round(room.canopySizeMm || 0)}
                    onValueChange={(val: number) => {
                      useStore.getState().updateRoom({ canopySizeMm: Math.max(0, val) });
                    }}
                  />
                  <DragHandle
                    position={[0, 0, d/2 + ohFront + 0.1]}
                    axis="z"
                    color="#4a5568"
                    onChange={(dz) => {
                      const store = useStore.getState();
                      const newSize = Math.max(0, Math.round(((store.scene.room.canopySizeMm || 0) + dz * 1000) / 100) * 100);
                      store.updateRoom({ canopySizeMm: newSize });
                    }}
                  />
                </>
              )}

              <DimText 
                position={[0, 0, -d/2 - ohBack - 0.15]}
                rotation={[-Math.PI/2, 0, Math.PI/2]}
                hideIfZero value={Math.round(room.overhangBackMm || 0)}
                onValueChange={(val: number) => {
                  useStore.getState().updateRoom({ overhangBackMm: Math.max(0, val) });
                }}
              />
              <DragHandle
                position={[0, 0, -d/2 - ohBack - 0.1]}
                axis="z"
                color="#4a5568"
                onChange={(dz) => {
                  const store = useStore.getState();
                  store.updateRoom({ overhangBackMm: Math.max(0, Math.round(((store.scene.room.overhangBackMm || 0) - dz * 1000) / 100) * 100) });
                }}
              />

              <DimText 
                position={[-w/2 - ohLeft - 0.15, 0, 0]}
                rotation={[-Math.PI/2, 0, 0]}
                hideIfZero value={Math.round(room.overhangLeftMm || 0)}
                onValueChange={(val: number) => {
                  useStore.getState().updateRoom({ overhangLeftMm: Math.max(0, val) });
                }}
              />
              <DragHandle
                position={[-w/2 - ohLeft - 0.1, 0, 0]}
                axis="x"
                color="#4a5568"
                onChange={(dx) => {
                  const store = useStore.getState();
                  store.updateRoom({ overhangLeftMm: Math.max(0, Math.round(((store.scene.room.overhangLeftMm || 0) - dx * 1000) / 100) * 100) });
                }}
              />

              <DimText 
                position={[w/2 + ohRight + 0.15, 0, 0]}
                rotation={[-Math.PI/2, 0, 0]}
                hideIfZero value={Math.round(room.overhangRightMm || 0)}
                onValueChange={(val: number) => {
                  useStore.getState().updateRoom({ overhangRightMm: Math.max(0, val) });
                }}
              />
              <DragHandle
                position={[w/2 + ohRight + 0.1, 0, 0]}
                axis="x"
                color="#4a5568"
                onChange={(dx) => {
                  const store = useStore.getState();
                  store.updateRoom({ overhangRightMm: Math.max(0, Math.round(((store.scene.room.overhangRightMm || 0) + dx * 1000) / 100) * 100) });
                }}
              />
            </group>
          )}

          {/* Base Thickness & Decking Control */}
          {room.showDimensions && !isPlanView && (
            <group position={[0, baseH/2, 0]}>

              {room.hasDecking && (
                <>
                  <DimText 
                    position={[0, 0, d/2 + deckFront + 0.15]}
                    rotation={[-Math.PI/2, 0, Math.PI/2]}
                    hideIfZero value={Math.round(room.deckingSizeMm || 0)}
                    onValueChange={(val: number) => {
                      useStore.getState().updateRoom({ deckingSizeMm: Math.max(0, val) });
                    }}
                  />
                  <DragHandle
                    position={[0, 0, d/2 + deckFront + 0.1]}
                    axis="z"
                    color="#8a6e4d"
                    onChange={(dz) => {
                      const store = useStore.getState();
                      const newSize = Math.max(0, Math.round(((store.scene.room.deckingSizeMm || 0) + dz * 1000) / 100) * 100);
                      store.updateRoom({ deckingSizeMm: newSize });
                    }}
                  />
                </>
              )}
            </group>
          )}
        </group>
      )}

      {/* INTERNAL ROOM DIMENSIONS - plan only. Each partition splits the
          building, and a builder wants the clear room sizes it makes: inner
          wall face to partition face to inner wall face. Partitions running
          left-right give a chain of depths down the right-hand side; ones
          running front-back give a chain of widths along the back. Plus the
          deck depth, down the right past the deck. Second row out from the
          walls: the opening chains sit at 0.45, these at 0.9, the overall
          dimensions beyond both. */}
      {isPlanView && room.showDimensions && room.shape !== 'LShape' && (() => {
        const wallT = (room.wallThicknessMm || 150) / 1000;
        const parts = (room.partitions || []) as any[];
        const acrossDepth = parts.filter(p => p.rotation !== 90).map(p => ({ c: p.zMm / 1000, t: (p.thicknessMm || 100) / 1000 })).sort((a, b) => a.c - b.c);
        const acrossWidth = parts.filter(p => p.rotation === 90).map(p => ({ c: p.xMm / 1000, t: (p.thicknessMm || 100) / 1000 })).sort((a, b) => a.c - b.c);
        const chain = (inner: number, faces: { c: number; t: number }[]) => {
          const pts: number[] = [-inner];
          faces.forEach(f => { pts.push(Math.max(-inner, f.c - f.t / 2), Math.min(inner, f.c + f.t / 2)); });
          pts.push(inner);
          return pts;
        };
        const off = 0.9;
        const deckFrontM = room.hasDecking ? (room.deckingSizeMm || 0) / 1000 : 0;
        const deckRightM = room.hasDecking ? (room.deckingRightMm || 0) / 1000 : 0;
        const depthPts = acrossDepth.length ? chain(d / 2 - wallT, acrossDepth) : null;
        const widthPts = acrossWidth.length ? chain(w / 2 - wallT, acrossWidth) : null;
        return (
          <group position={[0, baseH + 0.12, 0]}>
            {depthPts && (
              <group position={[w / 2 + off, 0, 0]}>
                <Line points={[[0, 0, depthPts[0]], [0, 0, depthPts[depthPts.length - 1]]]} color="#000" lineWidth={0.75} />
                {depthPts.map((p, i) => <Line key={`dt-${i}`} points={[[-0.06, 0, p], [0.06, 0, p]]} color="#000" lineWidth={0.75} />)}
                {depthPts.slice(0, -1).map((p, i) => {
                  const q = depthPts[i + 1]; const mm = Math.round((q - p) * 1000);
                  if (mm < 150) return null; // a partition's own thickness is not a room
                  return <DimText key={`ds-${i}`} position={[0, 0, (p + q) / 2]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} value={mm} />;
                })}
              </group>
            )}
            {widthPts && (
              <group position={[0, 0, -d / 2 - off]}>
                <Line points={[[widthPts[0], 0, 0], [widthPts[widthPts.length - 1], 0, 0]]} color="#000" lineWidth={0.75} />
                {widthPts.map((p, i) => <Line key={`wt-${i}`} points={[[p, 0, -0.06], [p, 0, 0.06]]} color="#000" lineWidth={0.75} />)}
                {widthPts.slice(0, -1).map((p, i) => {
                  const q = widthPts[i + 1]; const mm = Math.round((q - p) * 1000);
                  if (mm < 150) return null;
                  return <DimText key={`ws-${i}`} position={[(p + q) / 2, 0, 0]} rotation={[-Math.PI / 2, 0, Math.PI]} value={mm} />;
                })}
              </group>
            )}
            {deckFrontM > 0.05 && (
              <group position={[w / 2 + deckRightM + off, 0, 0]}>
                <Line points={[[0, 0, d / 2], [0, 0, d / 2 + deckFrontM]]} color="#000" lineWidth={0.75} />
                <Line points={[[-0.06, 0, d / 2], [0.06, 0, d / 2]]} color="#000" lineWidth={0.75} />
                <Line points={[[-0.06, 0, d / 2 + deckFrontM], [0.06, 0, d / 2 + deckFrontM]]} color="#000" lineWidth={0.75} />
                <DimText position={[0, 0, d / 2 + deckFrontM / 2]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} value={Math.round(deckFrontM * 1000)}
                  onValueChange={(val: number) => useStore.getState().updateRoom({ deckingSizeMm: Math.max(0, val) })} />
              </group>
            )}
          </group>
        );
      })()}

      {/* Plan View Dimensions */}
      {isPlanView && (
        <group position={[0, baseH + 0.1, 0]}>
          {/* Back Wall (Always full width w) */}
          <group position={[0, 0, -d/2 - Math.max(1.2, ohBack + 0.8)]}>
            <Line points={[[-w/2, 0, 0], [w/2, 0, 0]]} color="#000" lineWidth={1} />
            <Line points={[[-w/2, 0, -0.05], [-w/2, 0, 0.05]]} color="#000" lineWidth={1} />
            <Line points={[[w/2, 0, -0.05], [w/2, 0, 0.05]]} color="#000" lineWidth={1} />
            {room.showDimensions && (isPlanView) && (
              <DimText 
                position={[0, 0, 0]} 
                rotation={[-Math.PI/2, 0, Math.PI]}
                value={Math.round(w * 1000)}
                onValueChange={isPlanView ? ((val: number) => useStore.getState().updateRoom({ widthMm: Math.max(10, val) })) : undefined}
              />
            )}
            {room.showDimensions && isPlanView && (
              <>
                {room.shape !== 'LShape' && <DragHandle elementId="room" position={[w/2, 0, 0]} axis="x" label="Width" onChange={(dx) => useStore.getState().updateRoom({ widthMm: Math.max(100, Math.round((useStore.getState().scene.room.widthMm + dx * 2000) / 100) * 100) })} />}
                <DragHandle elementId="room" position={[-w/2, 0, 0]} axis="x" label="Width" onChange={(dx) => useStore.getState().updateRoom({ widthMm: Math.max(100, Math.round((useStore.getState().scene.room.widthMm - dx * 2000) / 100) * 100) })} />
              </>
            )}
          </group>

          {/* Left Wall (Always full depth d) */}
          <group position={[-w/2 - Math.max(1.2, ohLeft + 0.8), 0, 0]}>
            <Line points={[[0, 0, -d/2], [0, 0, d/2]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, 0, -d/2], [0.05, 0, -d/2]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, 0, d/2], [0.05, 0, d/2]]} color="#000" lineWidth={1} />
            {room.showDimensions && (isPlanView) && (
              <DimText 
                position={[0, 0, 0]} 
                rotation={[-Math.PI/2, 0, -Math.PI/2]}
                value={Math.round(d * 1000)}
                onValueChange={isPlanView ? ((val: number) => useStore.getState().updateRoom({ depthMm: Math.max(10, val) })) : undefined}
              />
            )}
            {room.showDimensions && isPlanView && (
              <>
                {room.shape !== 'LShape' && <DragHandle elementId="room" position={[0, 0, d/2]} axis="z" label="Depth" onChange={(dz) => useStore.getState().updateRoom({ depthMm: Math.max(100, Math.round((useStore.getState().scene.room.depthMm + dz * 2000) / 100) * 100) })} />}
                <DragHandle elementId="room" position={[0, 0, -d/2]} axis="z" label="Depth" onChange={(dz) => useStore.getState().updateRoom({ depthMm: Math.max(100, Math.round((useStore.getState().scene.room.depthMm - dz * 2000) / 100) * 100) })} />
              </>
            )}
          </group>

          {/* Front Wall */}
          {/* Beyond the deck AND beyond the opening chain (deck + 0.45), so
              the overall width never prints on top of the setting-out. */}
          <group position={[0, 0, d/2 + Math.max(1.2, deckFront + 1.3)]}>
            <Line points={[[-w/2, 0, 0], [w/2 - (room.shape === 'LShape' ? cutW : 0), 0, 0]]} color="#000" lineWidth={1} />
            <Line points={[[-w/2, 0, -0.05], [-w/2, 0, 0.05]]} color="#000" lineWidth={1} />
            <Line points={[[w/2 - (room.shape === 'LShape' ? cutW : 0), 0, -0.05], [w/2 - (room.shape === 'LShape' ? cutW : 0), 0, 0.05]]} color="#000" lineWidth={1} />
            {room.showDimensions && (isPlanView) && (
              <DimText 
                position={[-(room.shape === 'LShape' ? cutW : 0)/2, 0, 0]} 
                rotation={[-Math.PI/2, 0, 0]}
                value={Math.round((w - (room.shape === 'LShape' ? cutW : 0)) * 1000)}
                onValueChange={isPlanView ? ((val: number) => { if (room.shape !== 'LShape') useStore.getState().updateRoom({ widthMm: Math.max(10, val) }); }) : undefined}
              />
            )}
            {room.showDimensions && isPlanView && (
              <>
                {room.shape !== 'LShape' && <DragHandle elementId="room" position={[w/2, 0, 0]} axis="x" label="Width" onChange={(dx) => useStore.getState().updateRoom({ widthMm: Math.max(100, Math.round((useStore.getState().scene.room.widthMm + dx * 2000) / 100) * 100) })} />}
                <DragHandle elementId="room" position={[-w/2, 0, 0]} axis="x" label="Width" onChange={(dx) => useStore.getState().updateRoom({ widthMm: Math.max(100, Math.round((useStore.getState().scene.room.widthMm - dx * 2000) / 100) * 100) })} />
              </>
            )}
          </group>

          {/* Right Wall */}
          <group position={[w/2 + Math.max(1.2, ohRight + 0.8), 0, 0]}>
            <Line points={[[0, 0, -d/2], [0, 0, d/2 - (room.shape === 'LShape' ? cutD : 0)]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, 0, -d/2], [0.05, 0, -d/2]]} color="#000" lineWidth={1} />
            <Line points={[[-0.05, 0, d/2 - (room.shape === 'LShape' ? cutD : 0)], [0.05, 0, d/2 - (room.shape === 'LShape' ? cutD : 0)]]} color="#000" lineWidth={1} />
            {room.showDimensions && (isPlanView) && (
              <DimText 
                position={[0, 0, -(room.shape === 'LShape' ? cutD : 0)/2]} 
                rotation={[-Math.PI/2, 0, Math.PI/2]}
                value={Math.round((d - (room.shape === 'LShape' ? cutD : 0)) * 1000)}
                onValueChange={isPlanView ? ((val: number) => { if (room.shape !== 'LShape') useStore.getState().updateRoom({ depthMm: Math.max(10, val) }); }) : undefined}
              />
            )}
            {room.showDimensions && isPlanView && (
              <>
                {room.shape !== 'LShape' && <DragHandle elementId="room" position={[0, 0, d/2]} axis="z" label="Depth" onChange={(dz) => useStore.getState().updateRoom({ depthMm: Math.max(100, Math.round((useStore.getState().scene.room.depthMm + dz * 2000) / 100) * 100) })} />}
                <DragHandle elementId="room" position={[0, 0, -d/2]} axis="z" label="Depth" onChange={(dz) => useStore.getState().updateRoom({ depthMm: Math.max(100, Math.round((useStore.getState().scene.room.depthMm - dz * 2000) / 100) * 100) })} />
              </>
            )}
          </group>

          {/* LShape Inner Walls */}
          {room.shape === 'LShape' && (
            <>
              {/* Inner Front-facing wall (cutW width) */}
              <group position={[w/2 - cutW/2, 0, d/2 - cutD + 0.3]}>
                <Line points={[[-cutW/2, 0, 0], [cutW/2, 0, 0]]} color="#000" lineWidth={1} />
                <Line points={[[-cutW/2, 0, -0.05], [-cutW/2, 0, 0.05]]} color="#000" lineWidth={1} />
                <Line points={[[cutW/2, 0, -0.05], [cutW/2, 0, 0.05]]} color="#000" lineWidth={1} />
                <DimText 
                  position={[0, 0, 0]} 
                  rotation={[-Math.PI/2, 0, 0]}
                  value={Math.round(cutW * 1000)}
                  onValueChange={(val: number) => useStore.getState().updateRoom({ lShapeCutoutWidthMm: Math.max(10, val) })}
                />
                {room.showDimensions && (
                  <>
                    <DragHandle position={[-cutW/2, 0, -0.3]} axis="x" label="Cutout" color="#ff8c00" onChange={(dx) => useStore.getState().updateRoom({ lShapeCutoutWidthMm: Math.max(100, Math.round(((useStore.getState().scene.room.lShapeCutoutWidthMm ?? 2000) - dx * 1000) / 100) * 100) })} />
                  </>
                )}
              </group>

              {/* Inner Right-facing wall (cutD depth) */}
              <group position={[w/2 - cutW + 0.3, 0, d/2 - cutD/2]}>
                <Line points={[[0, 0, -cutD/2], [0, 0, cutD/2]]} color="#000" lineWidth={1} />
                <Line points={[[-0.05, 0, -cutD/2], [0.05, 0, -cutD/2]]} color="#000" lineWidth={1} />
                <Line points={[[-0.05, 0, cutD/2], [0.05, 0, cutD/2]]} color="#000" lineWidth={1} />
                <DimText 
                  position={[0, 0, 0]} 
                  rotation={[-Math.PI/2, 0, Math.PI/2]}
                  value={Math.round(cutD * 1000)}
                  onValueChange={(val: number) => useStore.getState().updateRoom({ lShapeCutoutDepthMm: Math.max(10, val) })}
                />
                {room.showDimensions && (
                  <>
                    <DragHandle position={[-0.3, 0, -cutD/2]} axis="z" label="Cutout" color="#ff8c00" onChange={(dz) => useStore.getState().updateRoom({ lShapeCutoutDepthMm: Math.max(100, Math.round(((useStore.getState().scene.room.lShapeCutoutDepthMm ?? 1500) - dz * 1000) / 100) * 100) })} />
                  </>
                )}
              </group>
            </>
          )}

          {/* Wall Openings Dimensions */}
          {(['front', 'back', 'left', 'right'] as const).map(wall => {
            // Collect elements on this wall
            type Opening = { id: string, type: 'door'|'window', offset: number, width: number, onUpdateWidth?: (val: number) => void };
            const elements: Opening[] = [];
            // Doors filter by their own wall, same as windows below — the old
            // code pushed EVERY door into the front chain, so a back-wall door
            // produced garbage segment dimensions on the front elevation and
            // was missing from its own wall's chain.
            (room.doors || []).filter(dr => dr.wall === wall).forEach(door => {
               elements.push({
                 id: door.id, type: 'door', offset: door.offsetMm / 1000, width: door.widthMm / 1000,
                 onUpdateWidth: (val) => useStore.getState().updateDoor(door.id, { widthMm: Math.max(10, val) })
               });
            });
            room.windows.filter(w => w.wall === wall).forEach(win => {
               elements.push({
                 id: win.id, type: 'window', offset: (win.offsetMm ?? 0) / 1000, width: win.widthMm / 1000,
                 onUpdateWidth: (val) => useStore.getState().updateWindow(win.id, { widthMm: Math.max(10, val) })
               });
            });

            if (elements.length === 0) return null;

            // Sort by offset ascending
            elements.sort((a, b) => a.offset - b.offset);

            const isHorizontal = wall === 'front' || wall === 'back';
            const totalLen = isHorizontal ? w : d;
            
            let startEdge = -totalLen / 2;
            let endEdge = totalLen / 2;

            // Adjust LShape cutout boundaries so dimensions don't overlap empty space
            if (room.shape === 'LShape') {
              if (wall === 'front') {
                endEdge = w/2 - cutW; // Only measure to the cutout
              } else if (wall === 'right') {
                startEdge = -d/2 + cutD; // Only measure past cutout
              }
            }

            // Generate segments
            const segments: Array<{ isOpening: boolean, start: number, end: number, length: number, element?: Opening, onValueChange?: (val: number) => void }> = [];
            let currentPt = startEdge;

            elements.forEach((el) => {
               const elStart = Math.max(startEdge, el.offset - el.width / 2);
               const elEnd = Math.min(endEdge, el.offset + el.width / 2);
               
               const spaceBefore = elStart - currentPt;
               const savedCurrentPt = currentPt; // capture for closure
               if (spaceBefore > 0.01) {
                  segments.push({ 
                    isOpening: false, 
                    start: savedCurrentPt, 
                    end: elStart, 
                    length: spaceBefore,
                    onValueChange: (valMm) => {
                      const newLength = valMm / 1000;
                      const newOffsetMm = (savedCurrentPt + newLength + el.width / 2) * 1000;
                      if (el.type === 'door') {
                        useStore.getState().updateDoor(el.id, { offsetMm: Math.round(newOffsetMm) });
                      } else {
                        useStore.getState().updateWindow(el.id, { offsetMm: Math.round(newOffsetMm) });
                      }
                    }
                  });
               }

               if (elEnd > elStart) {
                 segments.push({ isOpening: true, element: el, start: elStart, end: elEnd, length: elEnd - elStart });
                 currentPt = elEnd;
               }
            });

            const spaceAfter = endEdge - currentPt;
            if (spaceAfter > 0.01) {
               const lastEl = elements[elements.length - 1];
               segments.push({ 
                 isOpening: false, 
                 start: currentPt, 
                 end: endEdge, 
                 length: spaceAfter,
                 onValueChange: (valMm) => {
                   if (lastEl) {
                     const newLength = valMm / 1000;
                     const newOffsetMm = (endEdge - newLength - lastEl.width / 2) * 1000;
                     if (lastEl.type === 'door') {
                       useStore.getState().updateDoor(lastEl.id, { offsetMm: Math.round(newOffsetMm) });
                     } else {
                       useStore.getState().updateWindow(lastEl.id, { offsetMm: Math.round(newOffsetMm) });
                     }
                   }
                 }
               });
            }

            let rot: [number, number, number] = [-Math.PI/2, 0, 0];
            let getPos: (center: number) => [number, number, number];

            if (wall === 'front') {
              const out = d/2 + Math.max(0.6, deckFront + 0.2);
              rot = [-Math.PI/2, 0, 0];
              getPos = (c) => [c, 0, out];
            } else if (wall === 'back') {
              const out = -d/2 - Math.max(0.6, ohBack + 0.2) - (room.shape === 'LShape' ? cutD : 0);
              rot = [-Math.PI/2, 0, Math.PI];
              getPos = (c) => [c, 0, out];
            } else if (wall === 'left') {
              const out = -w/2 - Math.max(0.6, ohLeft + 0.2) - (room.shape === 'LShape' ? cutW : 0);
              rot = [-Math.PI/2, 0, -Math.PI/2];
              getPos = (c) => [out, 0, c];
            } else {
              const out = w/2 + Math.max(0.6, ohRight + 0.2);
              rot = [-Math.PI/2, 0, Math.PI/2];
              getPos = (c) => [out, 0, c];
            }

            return (
              <group key={`dim-wall-${wall}`}>
                 {segments.map((seg, i) => {
                    const center = (seg.start + seg.end) / 2;
                    return (
                      <DimText 
                         key={`${wall}-seg-${i}`}
                         position={getPos(center)}
                         rotation={rot}
                         value={Math.round(seg.length * 1000)}
                         onValueChange={seg.isOpening && seg.element?.onUpdateWidth ? seg.element.onUpdateWidth : seg.onValueChange}
                      />
                    );
                 })}
              </group>
            );
          })}
        </group>
      )}

      {/* No night "glow" any more. There used to be a point light and an
          ambient here, on after dark, lighting the room from nowhere - a
          warm blob on the ceiling that belonged to no fitting. After dark
          the room is lit by its fittings and nothing else (Charlie, 11 Sep:
          "I want realism"). */}

      </group> {/* End Elevated Structure */}
    </group>
  );
}
