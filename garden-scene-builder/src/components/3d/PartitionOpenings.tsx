import { useRef, useState } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useStore } from '../../store';
import { SceneObject } from '../../types';

/**
 * Door openings in an internal wall, placed ON the wall.
 *
 * Select a partition and each straight run of it - the main length, and the
 * return leg of an L - offers "+ Door" at its middle. The run that has the
 * opening shows a handle to slide it along, a distance-from-the-start label
 * you can click and type into, and a way to send it to the other run. This
 * replaces the sidebar sliders for position: a slider that measured from the
 * wall's midpoint answered a question nobody asks. "1200 from that end" is
 * how a wall gets set out.
 *
 * Everything here is in the partition's LOCAL frame - the component sits
 * inside the object's positioned, rotated group - so a rotated wall needs no
 * special handling. The main run lies along +X from its start end at -w/2;
 * the return runs along +Z from the outside corner at -d/2.
 */
type Seg = 'main' | 'return';

const chip = 'flex items-center gap-1 bg-white/95 backdrop-blur-md border border-black/10 rounded-full shadow-xl px-2 py-1 whitespace-nowrap';
const btn = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide text-[#3b4d4a] hover:bg-[#3b4d4a] hover:text-white transition-colors';

export function PartitionOpenings({ obj, w, d, h, retL }: { obj: SceneObject; w: number; d: number; h: number; retL: number }) {
  const updateObject = useStore(s => s.updateObject);
  const setControlsEnabled = useStore(s => s.setControlsEnabled);
  const frame = useRef<THREE.Group>(null);
  const sliding = useRef(false);
  const lastWrite = useRef(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const gapW = (obj.doorGapWidthMm ?? 800) / 1000;
  const has = !!obj.hasDoorGap;
  const gapSeg: Seg | null = has ? ((obj.doorGapOnReturn && retL > 0) ? 'return' : 'main') : null;
  const midY = h * 0.55;

  const segLen = (s: Seg) => (s === 'main' ? w : retL);
  // The return shares its first `d` with the main wall's thickness - an
  // opening there would have to cut both - so it starts one thickness in.
  const segMin = (s: Seg) => (s === 'main' ? 0 : d);
  /** Local position of a point `along` metres from a run's start, pushed
   *  `side` metres out from the wall face. */
  const localAt = (s: Seg, along: number, side = 0): [number, number, number] =>
    s === 'main' ? [-w / 2 + along, midY, d / 2 + side] : [w / 2 - d / 2 + side, midY, -d / 2 + along];

  const fromStart = (s: Seg) =>
    s === 'main' ? w / 2 + (obj.doorGapOffsetMm ?? 0) / 1000 - gapW / 2 : (obj.doorGapReturnMm ?? d) / 1000;

  /** Store a run's opening by its distance from that run's start, in 10mm steps. */
  const writeFromStart = (s: Seg, along: number) => {
    const clamped = Math.max(segMin(s), Math.min(segLen(s) - gapW, along));
    const mm = Math.round(clamped * 100) * 10;
    if (s === 'main') updateObject(obj.id, { doorGapOffsetMm: Math.round(mm + gapW * 500 - w * 500) });
    else updateObject(obj.id, { doorGapReturnMm: mm });
  };

  /** Put the opening on a run, centred - or move it there from the other run. */
  const placeOn = (s: Seg) => {
    useStore.getState().saveState();
    const along = Math.max(segMin(s), (segLen(s) - gapW) / 2);
    updateObject(obj.id, {
      hasDoorGap: true,
      doorGapOnReturn: s === 'return',
      doorGapWidthMm: obj.doorGapWidthMm ?? 800,
      ...(s === 'main'
        ? { doorGapOffsetMm: Math.round(along * 1000 + gapW * 500 - w * 500) }
        : { doorGapReturnMm: Math.round(along * 1000) }),
    });
  };

  const remove = () => { useStore.getState().saveState(); updateObject(obj.id, { hasDoorGap: false }); };

  // ---- sliding the opening along its run -------------------------------
  const onDown = (e: any) => {
    e.stopPropagation();
    try { e.target.setPointerCapture(e.pointerId); } catch { /* not all targets support it */ }
    sliding.current = true;
    useStore.getState().saveState();
    setControlsEnabled(false);
  };
  /** Where the pointer's ray meets the wall, as a distance along the run. */
  const alongFromRay = (ray: THREE.Ray): number | null => {
    if (!gapSeg || !frame.current) return null;
    // Slide on a horizontal plane at the handle's own height, so the opening
    // stays under the cursor from any camera angle.
    const g = frame.current;
    g.updateMatrixWorld(true);
    const handleWorld = g.localToWorld(new THREE.Vector3(...localAt(gapSeg, fromStart(gapSeg) + gapW / 2)));
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -handleWorld.y);
    const hit = new THREE.Vector3();
    if (!ray.intersectPlane(plane, hit)) return null;
    const local = g.worldToLocal(hit);
    const centreAlong = gapSeg === 'main' ? local.x + w / 2 : local.z + d / 2;
    return centreAlong - gapW / 2;
  };
  const onMove = (e: any) => {
    if (!sliding.current || !gapSeg) return;
    e.stopPropagation();
    // Each move rebuilds the wall's boolean, so moves are rate-limited; the
    // release below always lands the final position regardless.
    const now = performance.now();
    if (now - lastWrite.current < 32) return;
    lastWrite.current = now;
    const along = alongFromRay(e.ray);
    if (along !== null) writeFromStart(gapSeg, along);
  };
  const onUp = (e: any) => {
    if (!sliding.current) return;
    e.stopPropagation();
    try { e.target.releasePointerCapture(e.pointerId); } catch { /* see above */ }
    sliding.current = false;
    // Never leave the opening a frame short of where the pointer let go.
    if (gapSeg && e.ray) { const along = alongFromRay(e.ray); if (along !== null) writeFromStart(gapSeg, along); }
    setControlsEnabled(true);
  };

  const commitDraft = () => {
    setEditing(false);
    setControlsEnabled(true);
    const mm = Number(draft);
    if (gapSeg && !isNaN(mm)) writeFromStart(gapSeg, mm / 1000);
  };

  const runs: Seg[] = retL > 0 ? ['main', 'return'] : ['main'];
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <group ref={frame}>
      {/* A + at the middle of every run that does not hold the opening.
          Above the wall's top, not at mid-height: the wall's editor panel
          docks bottom-centre and covered the middle of the wall, which hid
          the chips exactly when they were wanted. */}
      {runs.filter(s => s !== gapSeg).map(s => (
        <Html key={`add-${s}`} position={(p => [p[0], h + 0.15, p[2]] as [number, number, number])(localAt(s, segLen(s) / 2))} center zIndexRange={[125, 0]}>
          <button
            style={{ pointerEvents: 'auto' }}
            onPointerDown={stop}
            onClick={(e) => { e.stopPropagation(); placeOn(s); }}
            className={`${chip} ${btn}`}
            title={has ? 'Move the door opening to this wall' : 'Add a door opening to this wall'}
          >
            {has ? '↔ Move door here' : '+ Door'}
          </button>
        </Html>
      ))}

      {gapSeg && (() => {
        const centre = localAt(gapSeg, fromStart(gapSeg) + gapW / 2);
        const mm = Math.round(fromStart(gapSeg) * 1000);
        return (
          <>
            {/* The slide handle: a generous invisible grab over a small dot. */}
            <mesh position={centre} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              onPointerOver={() => { document.body.style.cursor = 'grab'; }}
              onPointerOut={() => { if (!sliding.current) document.body.style.cursor = 'auto'; }}>
              <sphereGeometry args={[0.22, 12, 12]} />
              <meshBasicMaterial transparent opacity={0} depthTest={false} />
            </mesh>
            <mesh position={centre}>
              <sphereGeometry args={[0.06, 16, 16]} />
              <meshBasicMaterial color="#10b981" depthTest={false} transparent opacity={0.9} />
            </mesh>
            {/* Distance from the run's start, editable. */}
            <Html position={[centre[0], centre[1] + 0.32, centre[2]]} center zIndexRange={[130, 0]}>
              <div style={{ pointerEvents: 'auto' }} className={chip} onPointerDown={stop}>
                {editing ? (
                  <input
                    autoFocus
                    type="number"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onFocus={e => e.target.select()}
                    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commitDraft(); if (e.key === 'Escape') { setEditing(false); setControlsEnabled(true); } }}
                    onBlur={commitDraft}
                    className="w-16 text-center text-[11px] font-mono font-bold text-[#1d1d1f] outline-none bg-transparent"
                  />
                ) : (
                  <button
                    className="text-[11px] font-mono font-bold text-[#1d1d1f] px-1"
                    title="Click to type a distance from the start of this wall"
                    onClick={(e) => { e.stopPropagation(); setDraft(String(mm)); setEditing(true); setControlsEnabled(false); }}
                  >
                    {mm} mm from start
                  </button>
                )}
                <button className={btn} title="Remove the door opening" onClick={(e) => { e.stopPropagation(); remove(); }}>×</button>
              </div>
            </Html>
          </>
        );
      })()}
    </group>
  );
}
