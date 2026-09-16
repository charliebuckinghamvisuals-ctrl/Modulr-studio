import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useTexture, Html, Line } from '@react-three/drei';
import { useStore } from '../../store';
import type { PathRun, PathSurface } from '../../types';

/**
 * Garden paths: a polyline the customer clicks out on the ground, drawn as
 * a flat ribbon of paving at the width they set. Anywhere on the plot -
 * house to garden room, round the side, across the lawn.
 *
 * The ribbon is one mesh per path: a quad per segment plus a disc at every
 * corner so a bend has no gap or overlap seam. UVs are WORLD x/z over the
 * tile size, so the setts run continuously through every bend rather than
 * restarting at each segment. It sits 12mm above the ground, under the
 * decking and the steps.
 */

export const PATH_SURFACES: { id: PathSurface; name: string; prefix: string; tile: number; words: string }[] = [
  { id: 'stone', name: 'Stone setts', prefix: 'paving_stone', tile: 1.4, words: 'mixed natural stone setts' },
  { id: 'grey', name: 'Grey setts', prefix: 'paving_slab', tile: 1.0, words: 'grey stone setts' },
];
export const pathSurface = (id: PathSurface) => PATH_SURFACES.find(s => s.id === id) ?? PATH_SURFACES[0];

const SNAP = 0.05;
const Y = 0.012;

export const pathLength = (p: PathRun) => {
  let l = 0;
  for (let i = 1; i < p.points.length; i++) l += Math.hypot(p.points[i][0] - p.points[i - 1][0], p.points[i][1] - p.points[i - 1][1]);
  return l;
};

/** What the render prompt is told about a path. */
export const describePath = (p: PathRun) =>
  `${(p.widthMm / 1000).toFixed(1)} m wide ${pathSurface(p.surface).words} path, ${pathLength(p).toFixed(1)} m long`;

/** Ribbon geometry for a polyline at a width, world-scale UVs. */
function ribbon(points: [number, number][], width: number, tile: number): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const hw = width / 2;
  const push = (x: number, z: number) => { pos.push(x, Y, z); uv.push(x / tile, z / tile); return pos.length / 3 - 1; };
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    const len = Math.hypot(bx - ax, bz - az); if (len < 1e-4) continue;
    const nx = -(bz - az) / len * hw, nz = (bx - ax) / len * hw;
    const a = push(ax + nx, az + nz), b = push(ax - nx, az - nz), c = push(bx - nx, bz - nz), d = push(bx + nx, bz + nz);
    idx.push(a, b, c, a, c, d);
  }
  // A disc at every point rounds the bends and caps the ends.
  const SEG = 20;
  for (const [x, z] of points) {
    const centre = push(x, z);
    const ring: number[] = [];
    for (let k = 0; k < SEG; k++) { const t = (k / SEG) * Math.PI * 2; ring.push(push(x + Math.cos(t) * hw, z + Math.sin(t) * hw)); }
    for (let k = 0; k < SEG; k++) idx.push(centre, ring[(k + 1) % SEG], ring[k]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function usePavingMaterial(surface: PathSurface) {
  const s = pathSurface(surface);
  const tex: any = useTexture({ map: `./textures/${s.prefix}_color.jpg`, normalMap: `./textures/${s.prefix}_normal.jpg`, roughnessMap: `./textures/${s.prefix}_roughness.jpg`, aoMap: `./textures/${s.prefix}_ao.jpg` });
  return useMemo(() => {
    let m = matCache.get(s.id);
    if (m) return m;
    const prep = (t: THREE.Texture, colour: boolean) => { const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.colorSpace = colour ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace; c.needsUpdate = true; return c; };
    m = new THREE.MeshStandardMaterial({ map: prep(tex.map, true), normalMap: prep(tex.normalMap, false), normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap: prep(tex.roughnessMap, false), aoMap: prep(tex.aoMap, false), roughness: 0.95, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
    matCache.set(s.id, m);
    return m;
  }, [s.id, tex.map, tex.normalMap, tex.roughnessMap, tex.aoMap]);
}

function Path({ path, showLabel }: { path: PathRun; showLabel: boolean }) {
  const s = pathSurface(path.surface);
  const mat = usePavingMaterial(path.surface);
  const selected = useStore(st => st.selectedPathId === path.id);
  const geom = useMemo(() => ribbon(path.points, path.widthMm / 1000, s.tile), [path.points, path.widthMm, s.tile]);
  useEffect(() => () => geom.dispose(), [geom]);
  if (path.points.length < 2) return null;
  const mid = path.points[Math.floor(path.points.length / 2)];
  return (
    <group
      onPointerDown={(e) => { if (useStore.getState().toolMode !== 'select') return; e.stopPropagation(); useStore.getState().setSelectedPathId(path.id); window.dispatchEvent(new CustomEvent('path-picked')); }}
      onPointerUp={(e) => { if (useStore.getState().toolMode !== 'select') return; e.stopPropagation(); }}
      onClick={(e) => { if (useStore.getState().toolMode !== 'select') return; e.stopPropagation(); }}
    >
      <mesh geometry={geom} material={mat} receiveShadow />
      {selected && (
        <Line points={path.points.map(([x, z]) => [x, Y + 0.01, z] as [number, number, number])} color="#10b981" lineWidth={3} depthTest={false} />
      )}
      {showLabel && (
        <Html position={[mid[0], 0.5, mid[1]]} center zIndexRange={[90, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(29,29,31,0.85)', color: '#fff', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', fontFamily: 'system-ui, sans-serif' }}>{`${Math.round(pathLength(path) * 1000)} mm`}</div>
        </Html>
      )}
    </group>
  );
}

export function Paths() {
  const paths = useStore(s => s.scene.paths);
  const viewMode = useStore(s => s.viewMode);
  const isExporting = useStore(s => s.isExporting);
  const showDims = useStore(s => s.scene.room.showDimensions);
  const selectedId = useStore(s => s.selectedPathId);
  const showLabel = !!showDims && viewMode === 'plan' && !isExporting;
  if (!paths?.length) return null;
  return <>{paths.map(p => <Path key={p.id} path={p} showLabel={showLabel || (selectedId === p.id && !isExporting)} />)}</>;
}

/**
 * The drawing tool. Mounted only while toolMode is 'path'. Click to set
 * each point; Enter or the sidebar's Finish button ends the path (Esc
 * abandons an unfinished one); the next path starts wherever you click.
 */
export function PathTool() {
  const toolMode = useStore(s => s.toolMode);
  const style = useStore(s => s.scene.pathStyle);
  const [pts, setPts] = useState<[number, number][]>([]);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const ptsRef = useRef(pts); ptsRef.current = pts;

  useEffect(() => {
    if (toolMode !== 'path') { setPts([]); setCursor(null); return; }
    const finish = () => {
      const p = ptsRef.current;
      if (p.length >= 2) { const st = useStore.getState(); st.saveState(); st.addPath(p); }
      setPts([]);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') finish();
      if (e.key === 'Escape') { setPts([]); useStore.getState().setToolMode('select'); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('path-finish', finish);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('path-finish', finish); };
  }, [toolMode]);

  if (toolMode !== 'path') return null;
  const snap = (x: number, z: number): [number, number] => [Math.round(x / SNAP) * SNAP, Math.round(z / SNAP) * SNAP];
  const w = (style?.widthMm ?? 900) / 1000;
  const preview: [number, number][] = cursor ? [...pts, cursor] : pts;

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
          // Read through the ref, not the render closure: two quick clicks
          // before a commit would otherwise both see the same list.
          const cur = ptsRef.current;
          const last = cur[cur.length - 1];
          if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.1) return;
          ptsRef.current = [...cur, p];
          setPts(ptsRef.current);
        }}
        onContextMenu={(e) => { e.stopPropagation(); e.nativeEvent?.preventDefault?.(); window.dispatchEvent(new CustomEvent('path-finish')); }}
      >
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {preview.length >= 2 && (
        <Line points={preview.map(([x, z]) => [x, 0.03, z] as [number, number, number])} color="#10b981" lineWidth={Math.max(2, w * 6)} transparent opacity={0.55} depthTest={false} />
      )}
      {cursor && (
        <mesh position={[cursor[0], 0.02, cursor[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[w / 2 - 0.02, w / 2, 32]} />
          <meshBasicMaterial color="#10b981" depthTest={false} transparent opacity={0.9} />
        </mesh>
      )}
      {pts.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.08, 24]} />
          <meshBasicMaterial color="#10b981" depthTest={false} />
        </mesh>
      ))}
    </>
  );
}
