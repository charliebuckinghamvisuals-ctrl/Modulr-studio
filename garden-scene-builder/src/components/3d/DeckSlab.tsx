import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useStore } from '../../store';
import type { Room } from '../../types';
import { baseFrame, deckOutline, deckSlabGeometry } from '../../utils/deck';

/**
 * The building's deck as a reshapeable slab.
 *
 * Rendered by RoomGeometry in place of the deck part of the old base box,
 * in the SAME material props and UV origin, so the boards run from the
 * plinth onto the deck without a seam and an untouched deck looks exactly
 * as it did. Click it to pick it; then drag a green corner to move that
 * corner, drag a small mid-edge knob to grow a new corner there (this is
 * how a rectangle becomes an L), Alt-click a corner to remove it. All in
 * 50mm steps, all undoable, saved as room.deckOutline.
 */

const SNAP = 0.05;

export function DeckSlab({ room, materialProps, materialKey, sideProps }: { room: Room; materialProps: Record<string, unknown>; materialKey: string; sideProps?: Record<string, unknown> }) {
  const f = baseFrame(room);
  const pts = deckOutline(room);
  const selected = useStore(s => s.selectedElementId === 'deck');
  const geom = useMemo(() => deckSlabGeometry(pts, f.baseH, f.baseX, f.baseZ), [pts, f.baseH, f.baseX, f.baseZ]);
  useEffect(() => () => geom.dispose(), [geom]);

  const grab = useRef<{ index: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -f.baseH), [f.baseH]);
  const editable = () => { const st = useStore.getState(); return st.toolMode === 'select' && st.viewMode !== 'walking' && !st.activePlacementType; };
  const onPlane = (e: any) => { const p = new THREE.Vector3(); return e.ray.intersectPlane(plane, p) ? p : null; };
  const setOutline = (next: [number, number][]) => useStore.getState().updateRoom({ deckOutline: next });

  const pick = (e: any) => {
    if (!editable()) return;
    e.stopPropagation();
    const st = useStore.getState();
    st.setSelectedObjectId(null);
    st.setSelectedFenceId(null); st.setSelectedPathId(null); st.setSelectedDeckId(null);
    st.setSelectedElementId('deck');
    window.dispatchEvent(new CustomEvent('deck-outline-picked'));
  };
  // A corner knob: drag it. Alt-click removes it (three corners minimum).
  const cornerDown = (e: any, i: number) => {
    if (!editable()) return;
    e.stopPropagation();
    const st = useStore.getState();
    st.saveState();
    if (e.altKey && pts.length > 3) { setOutline(pts.filter((_, k) => k !== i)); return; }
    grab.current = { index: i };
    setDragging(true);
    st.setControlsEnabled(false);
    e.target.setPointerCapture(e.pointerId);
  };
  // A mid-edge knob: a new corner is born there and dragged straight away.
  const midDown = (e: any, i: number) => {
    if (!editable()) return;
    e.stopPropagation();
    const st = useStore.getState();
    st.saveState();
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const next = [...pts]; next.splice(i + 1, 0, [(ax + bx) / 2, (az + bz) / 2]);
    setOutline(next);
    grab.current = { index: i + 1 };
    setDragging(true);
    st.setControlsEnabled(false);
    e.target.setPointerCapture(e.pointerId);
  };
  const move = (e: any) => {
    const g = grab.current;
    if (!g) return;
    const p = onPlane(e);
    if (!p) return;
    const cur = deckOutline(useStore.getState().scene.room);
    const nx = Math.round(p.x / SNAP) * SNAP, nz = Math.round(p.z / SNAP) * SNAP;
    if (Math.abs(cur[g.index][0] - nx) < 1e-6 && Math.abs(cur[g.index][1] - nz) < 1e-6) return;
    setOutline(cur.map((pt, k) => k === g.index ? [nx, nz] as [number, number] : pt));
  };
  const up = (e: any) => {
    // Release FIRST, whichever knob this lands on. A new corner born from a
    // mid knob sits under the pointer at release and gets this event before
    // the captured knob does; if that early call bailed on grab.current the
    // captor kept its capture, and R3F ignores stopPropagation from anything
    // else while a capture stands - so the next click deselected the deck.
    e.target.releasePointerCapture?.(e.pointerId);
    if (!grab.current) return;
    e.stopPropagation();
    grab.current = null;
    setDragging(false);
    useStore.getState().setControlsEnabled(true);
  };

  const h = f.baseH;
  const outline = [...pts, pts[0]].map(([x, z]) => [x, h + 0.012, z] as [number, number, number]);

  return (
    <group>
      <mesh
        geometry={geom}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        userData={{ isFloor: true }}
        onPointerDown={pick}
        onClick={(e) => { if (editable()) e.stopPropagation(); }}
        onPointerOver={(e) => { e.stopPropagation(); useStore.getState().setHoveredElementId('room'); }}
        onPointerOut={() => useStore.getState().setHoveredElementId(null)}
      >
        {/* ExtrudeGeometry groups: 0 = the caps (boards), 1 = the sides.
            The sides take the flat skirting when given one, as the freeform
            decks always have. */}
        {sideProps ? (
          <>
            <meshStandardMaterial key={`${materialKey}-top`} attach="material-0" {...materialProps} />
            <meshStandardMaterial key={`${materialKey}-side`} attach="material-1" {...sideProps} />
          </>
        ) : (
          <meshStandardMaterial key={materialKey} attach="material" {...materialProps} />
        )}
      </mesh>
      {selected && (
        // The click that ends a knob drag lands on the knob, off the slab's
        // edge; swallowed here so the ground does not read it as a deselect.
        <group onClick={(e) => { if (editable()) e.stopPropagation(); }}>
          <Line points={outline} color="#10b981" lineWidth={2.5} depthTest={false} />
          {pts.map(([x, z], i) => (
            <mesh key={`c${i}`} position={[x, h + 0.06, z]} onPointerDown={(e) => cornerDown(e, i)} onPointerMove={move} onPointerUp={up}
              onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'grab'; }}
              onPointerOut={() => { if (!dragging) document.body.style.cursor = 'auto'; }}>
              <sphereGeometry args={[0.1, 16, 16]} />
              <meshBasicMaterial color="#10b981" depthTest={false} />
            </mesh>
          ))}
          {/* Always mounted: unmounting the mid knob that was just grabbed would drop its pointer capture. */}
          {pts.map(([x, z], i) => {
            const [bx, bz] = pts[(i + 1) % pts.length];
            return (
              <mesh key={`m${i}`} position={[(x + bx) / 2, h + 0.06, (z + bz) / 2]} onPointerDown={(e) => midDown(e, i)} onPointerMove={move} onPointerUp={up}
                onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'copy'; }}
                onPointerOut={() => { document.body.style.cursor = 'auto'; }}>
                <sphereGeometry args={[0.065, 12, 12]} />
                <meshBasicMaterial color="#10b981" transparent opacity={0.55} depthTest={false} />
              </mesh>
            );
          })}
        </group>
      )}
    </group>
  );
}
