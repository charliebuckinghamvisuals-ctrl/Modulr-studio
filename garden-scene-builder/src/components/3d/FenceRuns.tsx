import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import * as THREE from 'three';
import { useGLTF, Html, Line } from '@react-three/drei';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useStore } from '../../store';
import type { BoundaryStyle, FenceRun } from '../../types';
import { runStyle } from '../../utils/boundary';
import { FeatherEdgeRun, SlattedRun, HitMissRun, WallRun, HedgeRun, OpenRun } from './BoundaryKinds';

/**
 * The garden boundary: fence runs the customer draws to mark out and
 * measure their plot.
 *
 * Draw mode (toolMode 'fence'): click the ground to start, click again for
 * each corner, and the run follows the cursor with its live length. Click
 * back on the first corner (or Close in the sidebar) to close the loop;
 * Enter or Esc stops. Each run is a straight fence of Charlie's panel model
 * repeated along it, the panels stretched a touch so the run is whole
 * panels with no gap at the end, and its length is written on it.
 *
 * All points are WORLD metres on the ground plane.
 */
export const FENCE_PANEL_URL = 'models/fence_panel.glb';
const PANEL_W = 1.8;   // the model's width, metres
const SNAP = 0.05;     // grid the corners land on
const CLOSE_SNAP = 0.35; // clicking this near the first corner closes the loop

/** Length of a run in metres. */
export const fenceLength = (f: FenceRun) => Math.hypot(f.bx - f.ax, f.bz - f.az);

/**
 * The boundary as an ordered ring of corners, if the runs chain into a
 * closed loop; null otherwise. Runs are drawn end to start so they chain
 * in order; the loop is closed when the last end meets the first start.
 */
export function fenceRing(fences: FenceRun[]): [number, number][] | null {
  if (fences.length < 3) return null;
  const pts: [number, number][] = [[fences[0].ax, fences[0].az]];
  for (const f of fences) {
    const last = pts[pts.length - 1];
    if (Math.hypot(f.ax - last[0], f.az - last[1]) > 0.02) return null;
    pts.push([f.bx, f.bz]);
  }
  const first = pts[0], end = pts[pts.length - 1];
  if (Math.hypot(end[0] - first[0], end[1] - first[1]) > 0.02) return null;
  pts.pop();
  return pts;
}

/** Enclosed area in square metres, or null when the boundary is not closed. */
export function fenceArea(fences: FenceRun[]): number | null {
  const ring = fenceRing(fences);
  if (!ring) return null;
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % ring.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

const fmt = (m: number) => `${Math.round(m * 1000)} mm`;

/** One straight run of panels. */
/** Charlie's close-board panel model, stained and stretched to height. */
function CloseBoardRun({ run, style, len, dx, dz, rotY }: { run: FenceRun; style: BoundaryStyle; len: number; dx: number; dz: number; rotY: number }) {
  const { scene } = useGLTF(FENCE_PANEL_URL);
  const n = Math.max(1, Math.round(len / PANEL_W));
  const panelLen = len / n;
  // The model is 1.8 m tall; other heights stretch it.
  const scaleY = (style.heightMm || 1800) / 1800;

  // The panel comes as dozens of separate boards. Merged into ONE mesh per
  // panel - a boundary of thirty panels was 1,700 draw calls otherwise -
  // in real timber, not the exporter's half-metal default.
  const { geometry, material } = useMemo(() => {
    scene.updateMatrixWorld(true);
    const parts: THREE.BufferGeometry[] = [];
    let mat: THREE.MeshStandardMaterial | null = null;
    scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      const g = m.geometry.clone();
      // Only what merge needs; the exporter's extra attributes differ
      // between boards and would make the merge refuse.
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      // Every board must carry the same attributes or the merge refuses;
      // a board with no UVs gets a flat set (it takes the material colour).
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(m.matrixWorld);
      parts.push(g.index ? g.toNonIndexed() : g);
      if (!mat) {
        const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
        mat = src.clone(); mat.metalness = 0; mat.roughness = 0.85;
        // The export's board texture reads bleached under the sky; the
        // stain colour brings it back - natural is fresh-sawn softwood.
        mat.color = new THREE.Color(style.colour || '#c9b08a'); mat.needsUpdate = true;
      }
    });
    const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
    parts.forEach(p => p.dispose());
    return { geometry: merged, material: mat ?? new THREE.MeshStandardMaterial({ color: '#8a7a62', roughness: 0.85 }) };
  }, [scene, style.colour]);

  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const t = panelLen * (i + 0.5);
        return (
          <mesh key={i} geometry={geometry} material={material} castShadow receiveShadow position={[run.ax + dx * t, 0, run.az + dz * t]} rotation={[0, rotY, 0]} scale={[panelLen / PANEL_W, scaleY, 1]} />
        );
      })}
    </group>
  );
}

/** One run of the boundary, whatever it is built of. */
function Run({ run, showLabel }: { run: FenceRun; showLabel: boolean }) {
  const fallback = useStore(s => s.scene.boundaryStyle);
  const selected = useStore(s => s.selectedFenceId === run.id);
  const style = runStyle(run, fallback);
  const len = fenceLength(run);
  const dx = (run.bx - run.ax) / len, dz = (run.bz - run.az) / len;
  // Local +x is turned onto the run's direction.
  const rotY = Math.atan2(-dz, dx);
  const local = { position: [run.ax, 0, run.az] as [number, number, number], rotation: [0, rotY, 0] as [number, number, number] };
  const body = (() => {
    switch (style.kind) {
      case 'featheredge': return <group {...local}><FeatherEdgeRun len={len} style={style} /></group>;
      case 'slatted': return <group {...local}><SlattedRun len={len} style={style} /></group>;
      case 'hitmiss': return <group {...local}><HitMissRun len={len} style={style} /></group>;
      case 'brick': case 'stone': return <group {...local}><WallRun len={len} style={style} /></group>;
      case 'hedge': return <group {...local}><HedgeRun len={len} style={style} /></group>;
      case 'open': return <group {...local}><OpenRun len={len} /></group>;
      default: return <CloseBoardRun run={run} style={style} len={len} dx={dx} dz={dz} rotY={rotY} />;
    }
  })();
  const h = Math.max(0.05, (style.heightMm || 0) / 1000);

  return (
    <group
      // Click a run to restyle it in the sidebar. The ground plane clears
      // the selection, as it does for objects.
      onPointerDown={(e) => { if (useStore.getState().toolMode !== 'select') return; e.stopPropagation(); useStore.getState().setSelectedFenceId(run.id); }}
    >
      {body}
      {/* A generous invisible hit box: a slatted fence is mostly gaps. */}
      <mesh {...local} position={[run.ax + dx * len / 2, h / 2, run.az + dz * len / 2]} visible={false}>
        <boxGeometry args={[len, h, 0.5]} />
        <meshBasicMaterial />
      </mesh>
      {selected && (
        <mesh position={[run.ax + dx * len / 2, 0.015, run.az + dz * len / 2]} rotation={[0, rotY, 0]}>
          <boxGeometry args={[len, 0.01, 0.7]} />
          <meshBasicMaterial color="#10b981" transparent opacity={0.45} depthTest={false} />
        </mesh>
      )}
      {showLabel && (
        <Html position={[(run.ax + run.bx) / 2, h + 0.25, (run.az + run.bz) / 2]} center zIndexRange={[90, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(29,29,31,0.85)', color: '#fff', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', fontFamily: 'system-ui, sans-serif' }}>{fmt(len)}</div>
        </Html>
      )}
    </group>
  );
}

export function FenceRuns() {
  const fences = useStore(s => s.scene.fences);
  const viewMode = useStore(s => s.viewMode);
  const isExporting = useStore(s => s.isExporting);
  const showLabel = (viewMode === '3d' || viewMode === 'plan') && !isExporting;
  if (!fences?.length) return null;
  return (
    <Suspense fallback={null}>
      {fences.map(f => <Run key={f.id} run={f} showLabel={showLabel} />)}
    </Suspense>
  );
}

/** The drawing tool. Mounted only while toolMode is 'fence'. */
export function FenceTool() {
  const toolMode = useStore(s => s.toolMode);
  const fences = useStore(s => s.scene.fences);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const startRef = useRef<[number, number] | null>(null);

  // The pen picks up from the end of the last run, so a boundary is drawn
  // corner to corner without re-clicking each one.
  useEffect(() => {
    if (toolMode !== 'fence') { startRef.current = null; setCursor(null); return; }
    const last = fences[fences.length - 1];
    startRef.current = last ? [last.bx, last.bz] : null;
  }, [toolMode, fences]);

  useEffect(() => {
    if (toolMode !== 'fence') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') useStore.getState().setToolMode('select');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toolMode]);

  if (toolMode !== 'fence') return null;

  const first: [number, number] | null = fences.length ? [fences[0].ax, fences[0].az] : null;
  const snap = (x: number, z: number): [number, number] => {
    let p: [number, number] = [Math.round(x / SNAP) * SNAP, Math.round(z / SNAP) * SNAP];
    // Back onto the first corner closes the loop.
    if (first && fences.length >= 2 && Math.hypot(p[0] - first[0], p[1] - first[1]) < CLOSE_SNAP) p = first;
    return p;
  };
  const start = startRef.current;

  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.003, 0]}
        renderOrder={999}
        onPointerMove={(e) => { e.stopPropagation(); setCursor(snap(e.point.x, e.point.z)); }}
        onPointerDown={(e) => {
          e.stopPropagation();
          const p = snap(e.point.x, e.point.z);
          const st = useStore.getState();
          if (!start) { startRef.current = p; setCursor(p); return; }
          if (Math.hypot(p[0] - start[0], p[1] - start[1]) < 0.1) return;
          st.saveState();
          st.addFence(start[0], start[1], p[0], p[1]);
          // Closed the loop: done.
          if (first && p[0] === first[0] && p[1] === first[1]) st.setToolMode('select');
          else startRef.current = p;
        }}
      >
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* The pen: where the next corner will land, and the run it would make. */}
      {cursor && (
        <mesh position={[cursor[0], 0.02, cursor[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.1, 0.16, 24]} />
          <meshBasicMaterial color="#10b981" depthTest={false} transparent opacity={0.9} />
        </mesh>
      )}
      {start && (
        <mesh position={[start[0], 0.02, start[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.1, 24]} />
          <meshBasicMaterial color="#10b981" depthTest={false} />
        </mesh>
      )}
      {start && cursor && (
        <>
          <Line points={[[start[0], 0.03, start[1]], [cursor[0], 0.03, cursor[1]]]} color="#10b981" lineWidth={2} dashed dashSize={0.2} gapSize={0.1} depthTest={false} />
          <Html position={[(start[0] + cursor[0]) / 2, 0.6, (start[1] + cursor[1]) / 2]} center zIndexRange={[95, 0]} style={{ pointerEvents: 'none' }}>
            <div style={{ background: '#10b981', color: '#fff', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', fontFamily: 'system-ui, sans-serif' }}>{fmt(Math.hypot(cursor[0] - start[0], cursor[1] - start[1]))}</div>
          </Html>
        </>
      )}
    </>
  );
}

useGLTF.preload(FENCE_PANEL_URL);
