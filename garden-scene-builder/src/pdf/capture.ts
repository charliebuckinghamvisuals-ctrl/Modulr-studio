import * as THREE from 'three';
import { useStore } from '../store';
import { toRoomLocal, toWorld } from '../utils/walkCollide';
import { isWallLight, isLightFitting } from '../modelRegistry';
import type { Room } from '../types';

/**
 * The proposal's drawings, taken off the live scene.
 *
 * Elevations are TRUE elevations: an orthographic camera square to each face
 * of the building, framed on the building's measured extents at a known
 * number of pixels per metre - so the PDF can print them at an architectural
 * scale (1:50) and draw its dimension lines in vector exactly over the
 * corners. Each is the shaded render with the edge drawing laid over it
 * (utils/renderInputs), which reads as an inked, coloured elevation. The
 * garden is left out; the building, its deck and its wall lights stay, and
 * furniture shows through the glazing as it would on a drawing.
 *
 * Perspectives are two three-quarter views in daylight with the real sky.
 */

export type ElevationKey = 'front' | 'rear' | 'left' | 'right';

export interface ElevationDrawing {
  key: ElevationKey;
  title: string;
  /** JPEG data URL. */
  image: string;
  widthPx: number;
  heightPx: number;
  /** The metres the image covers: across (screen right) and up. */
  u0: number; u1: number; y0: number; y1: number;
  /** The building's outer wall faces across this view, for the width figure. */
  wallU: [number, number];
  /** Top of the building above the ground, metres. */
  topY: number;
}

export interface PerspectiveView { title: string; image: string; widthPx: number; heightPx: number }

const VIEWS: Record<ElevationKey, { title: string; dir: [number, number, number]; right: [number, number, number] }> = {
  front: { title: 'Front elevation', dir: [0, 0, -1], right: [1, 0, 0] },
  rear: { title: 'Rear elevation', dir: [0, 0, 1], right: [-1, 0, 0] },
  left: { title: 'Left elevation', dir: [1, 0, 0], right: [0, 0, 1] },
  right: { title: 'Right elevation', dir: [-1, 0, 0], right: [0, 0, -1] },
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Let React commit and the scene draw a few frames. Timers plus stepping the
 * frame loop directly: a tab that is not on screen gets no animation frames,
 * and a capture must not depend on the user watching it.
 */
async function settle(ms = 450) {
  const advance = (window as any).__modulrAdvance;
  for (let i = 0; i < 4; i++) {
    await sleep(ms / 4);
    try { advance?.(performance.now()); } catch { /* the loop will draw anyway */ }
  }
}

/** Not design: dimension lines and text, drag handles, grids, glows. */
const isNotDesign = (o: THREE.Object3D) => {
  const a = o as any;
  if (a.isLine || a.isLine2 || a.isLineSegments || a.isPoints || a.isSprite || a.isTroikaText) return true;
  if ((o.name || '').toLowerCase() === 'dimension-label') return true;
  const mats = Array.isArray(a.material) ? a.material : [a.material];
  return mats.some((m: any) => m && (m.depthTest === false || m.isShaderMaterial || (m.transparent && (m.opacity ?? 1) < 0.5)));
};

/** The building's extents in its own frame: x across, z front-positive, y up. */
function buildingBounds(scene: THREE.Scene, room: Room) {
  const grp = scene.getObjectByName('pdf-building');
  const box = new THREE.Box3();
  if (!grp) return box;
  scene.updateMatrixWorld(true);
  const corner = new THREE.Vector3();
  // Whole branches are skipped, not just meshes: a dimension label is a
  // group whose plate is an ordinary mesh, and counting it stretched the
  // framing a metre and a half past the building.
  const visit = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const n = (o.name || '').toLowerCase();
    if (n === 'dimension-label' || n.includes('drag-handle') || n.includes('placement-ghost')) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry && !isNotDesign(m)) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(m.matrixWorld);
        const l = toRoomLocal(room, corner.x, corner.z);
        box.expandByPoint(new THREE.Vector3(l.x, corner.y, l.z));
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(grp);
  return box;
}

/** What a drawing leaves out: the garden, and furniture standing outside
 *  the building (wall lights stay - they are on it). */
function gardenToHide(scene: THREE.Scene, room: Room, keepPlanting = false): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const garden = scene.getObjectByName('pdf-garden');
  if (garden) out.push(garden);
  const objGroup = scene.getObjectByName('pdf-objects');
  if (!objGroup) return out;
  const w = room.widthMm / 1000, d = room.depthMm / 1000;
  const byId = new Map(useStore.getState().scene.objects.map(o => [o.id, o]));
  objGroup.traverse(o => {
    const id = (o.userData as any)?.objectId;
    if (!id) return;
    const obj = byId.get(id);
    if (!obj || isWallLight(obj.type)) return;
    const l = toRoomLocal(room, obj.x, obj.z);
    const inside = Math.abs(l.x) < w / 2 + 0.05 && Math.abs(l.z) < d / 2 + 0.05;
    if (inside) return;
    if (keepPlanting && !/tree|conifer|hedge/.test(obj.type)) return;
    out.push(o);
  });
  return out;
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src;
});

/** The shaded render with the edge drawing multiplied over it: an inked, coloured elevation. */
async function inkOver(shaded: string, line: string, w: number, h: number): Promise<string> {
  const [s, l] = await Promise.all([loadImage(shaded), loadImage(line)]);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(s, 0, 0, w, h);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(l, 0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  return c.toDataURL('image/jpeg', 0.9);
}

interface SavedState {
  viewMode: any; isExporting: boolean; timeOfDay: number;
  selectedObjectId: string | null; selectedElementId: string | null;
}

function takeState(): SavedState {
  const s: any = useStore.getState();
  return { viewMode: s.viewMode, isExporting: s.isExporting, timeOfDay: s.timeOfDay, selectedObjectId: s.selectedObjectId ?? null, selectedElementId: s.selectedElementId ?? null };
}

function putState(p: SavedState) {
  const s: any = useStore.getState();
  s.setIsExporting(p.isExporting);
  s.setTimeOfDay?.(p.timeOfDay);
  s.setViewMode(p.viewMode);
  if (p.selectedObjectId) s.setSelectedObjectId(p.selectedObjectId);
  else if (p.selectedElementId) s.setSelectedElementId(p.selectedElementId);
}

/**
 * The furniture inside the building drawn from straight above as line work,
 * for the floor plan: the actual models' outlines, where the plan used to
 * draw a labelled box for each ("the furniture is all block and looks
 * terrible, just needs to be line drawings" - Charlie, 23 Sep 2026). PNG,
 * transparent where there is no line; x0/z0/w/d place it in the building's
 * own frame, metres.
 */
export interface PlanFurniture { image: string; x0: number; z0: number; w: number; d: number }

export interface CaptureResult { elevations: ElevationDrawing[]; perspectives: PerspectiveView[]; furniture?: PlanFurniture | null }

/** Black-on-white line work to black-on-transparent, so it lays over the plan. */
async function inkOnly(line: string, w: number, h: number): Promise<string> {
  const img = await loadImage(line);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = 255 - d[i];
    d[i] = 28; d[i + 1] = 31; d[i + 2] = 33; d[i + 3] = a;
  }
  ctx.putImageData(data, 0, 0);
  return c.toDataURL('image/png');
}

async function capturePlanFurniture(scene: THREE.Scene, room: Room, capture: (cam: THREE.Camera, w: number, h: number, o?: any) => { shaded: string; line: string }): Promise<PlanFurniture | null> {
  const w = room.widthMm / 1000, d = room.depthMm / 1000;
  const objGroup = scene.getObjectByName('pdf-objects');
  if (!objGroup) return null;
  const byId = new Map(useStore.getState().scene.objects.map(o => [o.id, o]));
  // Everything but the furniture inside: the building itself (walls, roof,
  // floor, deck), the garden, anything outside, wall lights and ceiling
  // fittings (a pendant from above would sit on top of the table it hangs over).
  const hide: THREE.Object3D[] = [];
  const building = scene.getObjectByName('pdf-building'); if (building) hide.push(building);
  const garden = scene.getObjectByName('pdf-garden'); if (garden) hide.push(garden);
  let inside = 0;
  objGroup.traverse(o => {
    const id = (o.userData as any)?.objectId;
    if (!id) return;
    const obj = byId.get(id);
    if (!obj) return;
    const l = toRoomLocal(room, obj.x, obj.z);
    const within = Math.abs(l.x) < w / 2 && Math.abs(l.z) < d / 2;
    if (!within || isWallLight(obj.type) || isLightFitting(obj.type)) { hide.push(o); return; }
    inside++;
  });
  if (!inside) return null;
  // Looking straight down, the building's back at the top of the picture -
  // the plan's own orientation.
  const m = 0.1, ppm = Math.min(260, 4000 / (w + 2 * m), 4000 / (d + 2 * m));
  const W = Math.round((w + 2 * m) * ppm), H = Math.round((d + 2 * m) * ppm);
  const cam = new THREE.OrthographicCamera(-(w / 2 + m), w / 2 + m, d / 2 + m, -(d / 2 + m), 0.1, 100);
  const c0 = toWorld(room, 0, 0), back = toWorld(room, 0, -1);
  cam.position.set(c0.x, 40, c0.z);
  cam.up.set(back.x - c0.x, 0, back.z - c0.z);
  cam.lookAt(c0.x, 0, c0.z);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  const r = capture(cam, W, H, { hide, whiteBackground: true, edges: 'screen' });
  return { image: await inkOnly(r.line, W, H), x0: -(w / 2 + m), z0: -(d / 2 + m), w: w + 2 * m, d: d + 2 * m };
}

/**
 * Take every drawing the proposal needs, and put the configurator back as
 * the user left it. onStep reports progress for the dialog.
 */
export async function captureProposalDrawings(onStep: (label: string) => void = () => {}): Promise<CaptureResult> {
  const scene = (window as any).__modulrScene as THREE.Scene | undefined;
  const capture = (window as any).__modulrCaptureDrawing as undefined | ((cam: THREE.Camera, w: number, h: number, o?: any) => { shaded: string; line: string });
  if (!scene || !capture) throw new Error('The 3D view is not ready yet - give it a moment and try again.');

  const saved = takeState();
  const st: any = useStore.getState();
  st.setHoveredElementId?.(null);
  st.setSelectedObjectId(null);
  st.setSelectedElementId(null);

  try {
    // ---- perspectives: daylight, the real sky, the building in its setting ----
    onStep('Taking the 3D views');
    st.setIsExporting(false);
    st.setViewMode('3d');
    st.setTimeOfDay?.(13);
    await settle(900);
    const room = useStore.getState().scene.room;
    const bounds = buildingBounds(scene, room);
    const perspectives: PerspectiveView[] = [];
    {
      const centre = bounds.getCenter(new THREE.Vector3());
      const radius = Math.max(2, bounds.getSize(new THREE.Vector3()).length() / 2);
      const vfov = 30, aspect = 1.6, W = 2400, H = Math.round(2400 / aspect);
      // Framed on the building rather than its bounding sphere, and at eye
      // level: the first version sat the building small in a field of lawn
      // under a strip of pale horizon.
      const dist = radius / Math.sin((vfov / 2) * Math.PI / 180) * 0.74;
      const hide = gardenToHide(scene, room, true);
      for (const [title, az] of [['Perspective from the front left', -38], ['Perspective from the front right', 38]] as const) {
        const a = az * Math.PI / 180, el = 5 * Math.PI / 180;
        const lx = centre.x + Math.sin(a) * Math.cos(el) * dist, lz = centre.z + Math.cos(a) * Math.cos(el) * dist;
        const wp = toWorld(room, lx, lz), wt = toWorld(room, centre.x, centre.z);
        const cam = new THREE.PerspectiveCamera(vfov, aspect, 0.1, 800);
        cam.position.set(wp.x, centre.y + Math.sin(el) * dist, wp.z);
        cam.lookAt(wt.x, centre.y * 0.85, wt.z);
        cam.updateMatrixWorld(true);
        const r = capture(cam, W, H, { hide });
        perspectives.push({ title, image: r.shaded, widthPx: W, heightPx: H });
      }
    }

    // ---- elevations: flat drawing light, white ground, true scale ----
    onStep('Drawing the elevations');
    st.setIsExporting(true);
    await settle(700);
    const eb = buildingBounds(scene, room);
    const hide = gardenToHide(scene, room);
    const w = room.widthMm / 1000, d = room.depthMm / 1000;
    const elevations: ElevationDrawing[] = [];
    for (const key of ['front', 'rear', 'left', 'right'] as ElevationKey[]) {
      const v = VIEWS[key];
      const R = new THREE.Vector3(...v.right), dir = new THREE.Vector3(...v.dir);
      // Extents across the view, from the eight corners of the local box.
      let uMin = Infinity, uMax = -Infinity;
      for (let i = 0; i < 8; i++) {
        const p = new THREE.Vector3(i & 1 ? eb.max.x : eb.min.x, 0, i & 4 ? eb.max.z : eb.min.z);
        const u = p.dot(R); uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
      }
      const topY = Math.max(0.5, eb.max.y);
      const padU = (uMax - uMin) * 0.06 + 0.35;
      const u0 = uMin - padU, u1 = uMax + padU, y0 = -0.3, y1 = topY + 0.35;
      const ppm = Math.min(320, 3800 / (u1 - u0), 2600 / (y1 - y0));
      const W = Math.round((u1 - u0) * ppm), H = Math.round((y1 - y0) * ppm);
      const uMid = (u0 + u1) / 2, yMid = (y0 + y1) / 2;
      const cam = new THREE.OrthographicCamera(-(u1 - u0) / 2, (u1 - u0) / 2, (y1 - y0) / 2, -(y1 - y0) / 2, 0.1, 400);
      // The camera 80m back from the view's centre, square to the face.
      const cLocal = R.clone().multiplyScalar(uMid).addScaledVector(dir, -80);
      const tLocal = R.clone().multiplyScalar(uMid);
      const cw = toWorld(room, cLocal.x, cLocal.z), tw = toWorld(room, tLocal.x, tLocal.z);
      cam.position.set(cw.x, yMid, cw.z);
      cam.up.set(0, 1, 0);
      cam.lookAt(tw.x, yMid, tw.z);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      const r = capture(cam, W, H, { hide, whiteBackground: true, edges: 'screen' });
      const image = await inkOver(r.shaded, r.line, W, H);
      const half = key === 'front' || key === 'rear' ? w / 2 : d / 2;
      elevations.push({ key, title: v.title, image, widthPx: W, heightPx: H, u0, u1, y0, y1, wallU: [-half, half], topY });
    }
    onStep('Drawing the furniture for the plan');
    const furniture = await capturePlanFurniture(scene, room, capture);
    return { elevations, perspectives, furniture };
  } finally {
    putState(saved);
    await settle(200);
  }
}
