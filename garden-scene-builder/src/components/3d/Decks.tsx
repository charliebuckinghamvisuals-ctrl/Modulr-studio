import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import { useStore } from '../../store';
import type { DeckArea } from '../../types';
import { MATERIAL_DEF, resolveDeckingKey } from '../../utils/materials';
import { baseFrame, deckSlabGeometry, polygonArea, useDeckTexture } from '../../utils/deck';

/**
 * Freeform decking: a polygon the customer clicks out on the ground, raised
 * to a height in a decking material. Any shape - an L wrapping the corner
 * of the building, a platform off the doors with a lower deck stepping down
 * from it - and as many as the garden needs, each at its own height.
 *
 * This is separate from the building's own decking (room.hasDecking, the
 * strip across the front sized by mm). That one stays for the quick case;
 * this is for the client who has drawn a shape on a photo.
 *
 * Geometry is one ExtrudeGeometry per deck: the outline as a THREE.Shape,
 * pulled up by the height, laid flat. The extruder's UVs are the shape's
 * own coordinates, which are world x/z, so the boards run continuously at
 * world scale across every deck. Caps take the decking, sides a plain
 * fascia in the same colour.
 *
 * Select one to move it (drag anywhere on it) or reshape it (drag a corner
 * knob). Points are WORLD metres.
 */

const SNAP = 0.05;
const CLOSE_SNAP = 0.35;

export const DECK_MATERIALS: { id: string; name: string; swatch: string }[] = [
  // The building's own decking, whatever it is set to - the default, so a
  // second deck is seamless with the first without picking anything.
  { id: 'match', name: 'Match building', swatch: 'linear-gradient(135deg,#a3794a 50%,#4a5057 50%)' },
  { id: 'timber_decking', name: 'Timber', swatch: '#a3794a' },
  { id: 'composite_cedar', name: 'Cedar', swatch: '#b0764b' },
  { id: 'composite_oak', name: 'Oak', swatch: '#c9a173' },
  { id: 'composite_light_oak', name: 'Light Oak', swatch: '#dcc09a' },
  { id: 'composite_brown', name: 'Brown', swatch: '#8b6b55' },
  { id: 'composite_grey', name: 'Light Grey', swatch: '#a9aeb2' },
  { id: 'composite_dark_grey', name: 'Dark Grey', swatch: '#4a5057' },
  { id: 'composite_black', name: 'Black', swatch: '#1f2123' },
];
export const deckMaterialMeta = (id: string) => DECK_MATERIALS.find(m => m.id === id) ?? DECK_MATERIALS[0];

/** The MATERIAL_DEF key a deck material id resolves to for this building. */
export const resolveDeckKey = (id: string | undefined, room: { deckingMaterial?: string; cladding?: string }) =>
  id && id !== 'match' ? id : resolveDeckingKey(room.deckingMaterial, room.cladding);

/** A plain colour close to the boards, for fascias and kerbs. */
export const deckTone = (key: string) => {
  const c = ((MATERIAL_DEF as any)[key]?.color as string | undefined) ?? '#a3794a';
  return c.toLowerCase() === '#ffffff' ? '#a3794a' : c;
};

export const deckArea = polygonArea;

/** What the render prompt is told about a deck. */
export const describeDeck = (d: DeckArea) => {
  const m = deckMaterialMeta(d.material);
  const kind = d.material === 'match' ? 'the same decking as the building' : d.material === 'timber_decking' ? 'timber decking' : `${m.name.toLowerCase()} composite decking`;
  return `${kind}, ${deckArea(d.points).toFixed(1)} m² in the freeform outline drawn, its surface ${d.heightMm} mm above the lawn with a matching fascia board round the edge`;
};

/**
 * The deck surface as ONE material with the building's own base: the same
 * texture set, colour and world-scale tiling (useDeckTexture), with only
 * the maps the base box uses, so a deck here and the deck under the doors
 * are indistinguishable. 'match' (the default) follows whatever the
 * building's decking is set to.
 */
export function useDeckMaterial(id?: string) {
  const room = useStore(s => s.scene.room);
  const key = resolveDeckKey(id, room);
  const tex: any = useDeckTexture(key);
  return useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(tex.color || '#ffffff'),
    map: tex.map, roughnessMap: tex.roughnessMap, normalMap: tex.normalMap, aoMap: tex.aoMap,
    metalness: 0,
  }), [tex]);
}

function Deck({ deck, showLabel }: { deck: DeckArea; showLabel: boolean }) {
  const selected = useStore(s => s.selectedDeckId === deck.id);
  const room = useStore(s => s.scene.room);
  const h = Math.max(0.02, deck.heightMm / 1000);
  const top = useDeckMaterial(deck.material);
  const key = resolveDeckKey(deck.material, room);
  const fascia = useMemo(() => new THREE.MeshStandardMaterial({ color: deckTone(key), roughness: 0.85, metalness: 0 }), [key]);
  // Same UV origin as the building's base, so boards line through.
  const f = baseFrame(room);
  const geom = useMemo(() => deckSlabGeometry(deck.points, h, f.baseX, f.baseZ), [deck.points, h, f.baseX, f.baseZ]);
  useEffect(() => () => geom.dispose(), [geom]);
  const cx = deck.points.reduce((s, p) => s + p[0], 0) / deck.points.length;
  const cz = deck.points.reduce((s, p) => s + p[1], 0) / deck.points.length;

  /*
   * Drag the deck to move it, drag a corner knob to reshape it. Both slide
   * on a plane level with the deck's top, so the spot under the cursor
   * stays under it from any camera angle (see FenceRuns for why not the
   * ground). The outline at grab time is kept so the 50mm snap is applied
   * to the whole travel, not accumulated per move.
   */
  const grab = useRef<{ kind: 'move' | 'corner'; index: number; x: number; z: number; from: [number, number][] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), [h]);
  const editable = () => { const st = useStore.getState(); return st.toolMode === 'select' && st.viewMode !== 'walking' && !st.activePlacementType; };
  const onPlane = (e: any) => { const p = new THREE.Vector3(); return e.ray.intersectPlane(plane, p) ? p : null; };
  const start = (e: any, kind: 'move' | 'corner', index = -1) => {
    if (!editable()) return;
    e.stopPropagation();
    const st = useStore.getState();
    st.setSelectedDeckId(deck.id);
    if (kind === 'move') window.dispatchEvent(new CustomEvent('deck-picked'));
    const p = onPlane(e);
    if (!p) return;
    st.saveState();
    grab.current = { kind, index, x: p.x, z: p.z, from: deck.points.map(pt => [pt[0], pt[1]] as [number, number]) };
    setDragging(true);
    st.setControlsEnabled(false);
    e.target.setPointerCapture(e.pointerId);
  };
  const move = (e: any) => {
    const g = grab.current;
    if (!g) return;
    const p = onPlane(e);
    if (!p) return;
    const st = useStore.getState();
    if (g.kind === 'move') {
      const dx = Math.round((p.x - g.x) / SNAP) * SNAP, dz = Math.round((p.z - g.z) / SNAP) * SNAP;
      st.moveDeck(deck.id, dx, dz, g.from);
    } else {
      st.moveDeckPoint(deck.id, g.index, Math.round(p.x / SNAP) * SNAP, Math.round(p.z / SNAP) * SNAP);
    }
  };
  const end = (e: any) => {
    // Release first, whichever mesh this lands on - see DeckSlab.up.
    e.target.releasePointerCapture?.(e.pointerId);
    if (!editable()) return;
    e.stopPropagation();
    if (!grab.current) return;
    grab.current = null;
    setDragging(false);
    useStore.getState().setControlsEnabled(true);
  };

  if (deck.points.length < 3) return null;
  const outline = [...deck.points, deck.points[0]].map(([x, z]) => [x, h + 0.012, z] as [number, number, number]);

  return (
    <group
      onPointerDown={(e) => start(e, 'move')}
      onPointerMove={move}
      onPointerUp={end}
      // The ground clears the selection on CLICK; this keeps the pick.
      onClick={(e) => { if (useStore.getState().toolMode !== 'select') return; e.stopPropagation(); }}
      onPointerOver={() => { if (editable()) document.body.style.cursor = 'move'; }}
      onPointerOut={() => { if (!dragging) document.body.style.cursor = 'auto'; }}
    >
      <mesh geometry={geom} material={[top, fascia]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} castShadow receiveShadow />
      {selected && (
        <>
          <Line points={outline} color="#10b981" lineWidth={2.5} depthTest={false} />
          {/* Corner knobs: drag one to pull that corner about. */}
          {deck.points.map(([x, z], i) => (
            <mesh
              key={i}
              position={[x, h + 0.06, z]}
              onPointerDown={(e) => start(e, 'corner', i)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'grab'; }}
              onPointerOut={() => { if (!dragging) document.body.style.cursor = 'auto'; }}
            >
              <sphereGeometry args={[0.1, 16, 16]} />
              <meshBasicMaterial color="#10b981" depthTest={false} />
            </mesh>
          ))}
        </>
      )}
      {showLabel && (
        <Html position={[cx, h + 0.3, cz]} center zIndexRange={[90, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(29,29,31,0.85)', color: '#fff', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', fontFamily: 'system-ui, sans-serif' }}>
            {`${deckArea(deck.points).toFixed(1)} m² · ${deck.heightMm} mm`}
          </div>
        </Html>
      )}
    </group>
  );
}

export function Decks() {
  const decks = useStore(s => s.scene.decks);
  const viewMode = useStore(s => s.viewMode);
  const isExporting = useStore(s => s.isExporting);
  const showDims = useStore(s => s.scene.room.showDimensions);
  const selectedId = useStore(s => s.selectedDeckId);
  const showLabel = !!showDims && viewMode === 'plan' && !isExporting;

  // Keys for the picked deck: arrows nudge (shift 25cm), Delete, Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const st = useStore.getState();
      const id = st.selectedDeckId;
      if (!id || st.selectedObjectId || st.toolMode !== 'select') return;
      const step = e.shiftKey ? 0.25 : 0.05;
      let handled = true;
      if (e.key === 'ArrowLeft')       { st.saveState(); st.moveDeck(id, -step, 0); }
      else if (e.key === 'ArrowRight') { st.saveState(); st.moveDeck(id, step, 0); }
      else if (e.key === 'ArrowUp')    { st.saveState(); st.moveDeck(id, 0, -step); }
      else if (e.key === 'ArrowDown')  { st.saveState(); st.moveDeck(id, 0, step); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { st.saveState(); st.removeDeck(id); }
      else if (e.key === 'Escape') st.setSelectedDeckId(null);
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!decks?.length) return null;
  return <>{decks.map(d => <Deck key={d.id} deck={d} showLabel={showLabel || (selectedId === d.id && !isExporting)} />)}</>;
}

/**
 * The drawing tool. Mounted only while toolMode is 'deck'. Click each
 * corner of the deck; click the first corner again (or Enter, right-click,
 * or the sidebar's Finish) to close it. Esc abandons. A closed deck ends
 * the tool - the next one starts from the Draw button.
 */
export function DeckTool() {
  const toolMode = useStore(s => s.toolMode);
  const style = useStore(s => s.scene.deckStyle);
  const [pts, setPts] = useState<[number, number][]>([]);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const ptsRef = useRef(pts); ptsRef.current = pts;

  useEffect(() => {
    if (toolMode !== 'deck') { setPts([]); setCursor(null); return; }
    const finish = () => {
      const p = ptsRef.current;
      if (p.length >= 3) { const st = useStore.getState(); st.saveState(); st.addDeck(p); }
      ptsRef.current = []; setPts([]);
      useStore.getState().setToolMode('select');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') finish();
      if (e.key === 'Escape') { ptsRef.current = []; setPts([]); useStore.getState().setToolMode('select'); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('deck-finish', finish);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('deck-finish', finish); };
  }, [toolMode]);

  const h = (style?.heightMm ?? 150) / 1000;
  const preview = useMemo(() => {
    const p = cursor && pts.length ? [...pts, cursor] : pts;
    if (p.length < 3) return null;
    const shape = new THREE.Shape();
    p.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [pts, cursor]);
  useEffect(() => () => { preview?.dispose(); }, [preview]);

  if (toolMode !== 'deck') return null;
  const first = pts[0];
  const snap = (x: number, z: number): [number, number] => {
    const p: [number, number] = [Math.round(x / SNAP) * SNAP, Math.round(z / SNAP) * SNAP];
    if (first && pts.length >= 3 && Math.hypot(p[0] - first[0], p[1] - first[1]) < CLOSE_SNAP) return first;
    return p;
  };
  const line: [number, number][] = cursor && pts.length ? [...pts, cursor] : pts;

  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.003, 0]}
        renderOrder={999}
        onPointerMove={(e) => { e.stopPropagation(); setCursor(snap(e.point.x, e.point.z)); }}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (e.button === 2) return;
          const p = snap(e.point.x, e.point.z);
          const cur = ptsRef.current;
          // Back onto the first corner closes the deck.
          if (cur.length >= 3 && p === cur[0]) { window.dispatchEvent(new CustomEvent('deck-finish')); return; }
          const last = cur[cur.length - 1];
          if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.1) return;
          ptsRef.current = [...cur, p];
          setPts(ptsRef.current);
        }}
        onContextMenu={(e) => { e.stopPropagation(); e.nativeEvent?.preventDefault?.(); window.dispatchEvent(new CustomEvent('deck-finish')); }}
      >
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* The deck it would make, as a tint at its height. */}
      {preview && (
        <mesh geometry={preview} rotation={[-Math.PI / 2, 0, 0]} position={[0, h + 0.01, 0]}>
          <meshBasicMaterial color="#10b981" transparent opacity={0.25} depthTest={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {line.length >= 2 && (
        <Line points={line.map(([x, z]) => [x, 0.03, z] as [number, number, number])} color="#10b981" lineWidth={2} dashed dashSize={0.2} gapSize={0.1} depthTest={false} />
      )}
      {cursor && (
        <mesh position={[cursor[0], 0.02, cursor[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.1, 0.16, 24]} />
          <meshBasicMaterial color="#10b981" depthTest={false} transparent opacity={0.9} />
        </mesh>
      )}
      {pts.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[i === 0 && pts.length >= 3 ? 0.14 : 0.08, 24]} />
          <meshBasicMaterial color="#10b981" depthTest={false} />
        </mesh>
      ))}
    </>
  );
}
