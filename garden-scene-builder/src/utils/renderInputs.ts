/**
 * Render-engine inputs, drawn straight off the live three.js scene.
 *
 * The render engine needs two pictures of the SAME view:
 *
 *   shaded  - what the user sees, at 2048px on the long edge, for colour and
 *             material reference.
 *   line    - a black-on-white edge drawing of exactly the same frame: every
 *             mesh drawn flat white with its hard edges in black, hidden
 *             lines removed by the depth buffer. This is the geometry lock -
 *             there is no shading in it for an image model to "replace" and
 *             no ground plane for it to "dress", only edges that read as
 *             structure. Drawn by the browser, so it is exact, free and
 *             instant, where an AI line conversion costs a call and can
 *             drift.
 *
 * Both are rendered with the renderer temporarily resized (the canvas
 * element keeps its CSS size), the camera untouched, so the framing is
 * pixel-for-pixel what the viewport shows, just sharper.
 */
import * as THREE from 'three';

export interface RenderInputs {
  /** data URL, image/png, the shaded view */
  shaded: string;
  /** data URL, image/png, the edge drawing */
  line: string;
  width: number;
  height: number;
}

const LONG_EDGE = 2048;
/** Edges sharper than this (degrees) between adjacent faces are drawn. */
const EDGE_THRESHOLD_DEG = 18;

/** Scene helpers that are not design: grid, sky, clouds, stars, gizmos. */
const isHelperMesh = (m: THREE.Mesh) => {
  const mat = m.material as THREE.Material | THREE.Material[];
  const mats = Array.isArray(mat) ? mat : [mat];
  // drei Grid, Sky, Clouds and the like draw with shader materials; the
  // design itself is standard/physical/basic materials.
  if (mats.some(x => x instanceof THREE.ShaderMaterial || x instanceof THREE.RawShaderMaterial)) return true;
  // Drag handles, ghosts and selection overlays draw on top of everything.
  if (mats.some(x => (x as any).depthTest === false)) return true;
  return false;
};

/** Objects the line drawing must never contain, by name or ancestry. */
const isExcludedBranch = (o: THREE.Object3D) => {
  const n = (o.name || '').toLowerCase();
  return n === 'environment-background' || n.includes('placement-ghost') || n.includes('drag-handle') || n === 'dimension-label';
};

const renderAt = (gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number, type: 'image/png' | 'image/jpeg' = 'image/png') => {
  const size = new THREE.Vector2();
  gl.getSize(size);
  const dpr = gl.getPixelRatio();
  gl.setPixelRatio(1);
  gl.setSize(w, h, false);
  gl.render(scene, camera);
  const url = gl.domElement.toDataURL(type, 0.92);
  gl.setPixelRatio(dpr);
  gl.setSize(size.x, size.y, false);
  return url;
};

export function captureRenderInputs(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): RenderInputs {
  const size = new THREE.Vector2();
  gl.getSize(size);
  const aspect = size.x / size.y;
  const width = aspect >= 1 ? LONG_EDGE : Math.round(LONG_EDGE * aspect);
  const height = aspect >= 1 ? Math.round(LONG_EDGE / aspect) : LONG_EDGE;

  // ---- 1. shaded view, as the user sees it, minus the floor grid ---------
  const hidden: THREE.Object3D[] = [];
  scene.traverse(o => {
    if (!o.visible) return;
    // A dimension label's plate (plan view draws them always): hide the
    // whole group, text and plates, so no white boxes land in the capture.
    if ((o.name || '').toLowerCase() === 'dimension-label') { o.visible = false; hidden.push(o); return; }
    // Drop what is not the design: the floor grid (named in MainScene),
    // dimension lines and their text, drag handles and selection overlays.
    // Sky and clouds stay because they are the view's backdrop.
    const n = (o.name || '').toLowerCase();
    const isDimension = (o as any).isLine2 || (o as any).isLine || (o as any).isTroikaText || (o as any).isText || o.constructor?.name === 'Text';
    const isOverlay = o instanceof THREE.Mesh && !isDimension && (Array.isArray(o.material) ? o.material : [o.material]).some(m => m && (m as any).depthTest === false);
    if (n === 'floor-grid' || isDimension || isOverlay) { o.visible = false; hidden.push(o); }
  });
  // JPEG: a 2K PNG of a textured scene is 7MB+, a JPEG under 1MB, and this
  // one is only a colour reference. The edge drawing stays PNG (crisp lines,
  // ~100KB).
  const shaded = renderAt(gl, scene, camera, width, height, 'image/jpeg');
  hidden.forEach(o => { o.visible = true; });

  // ---- 2. edge drawing ----------------------------------------------------
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const black = new THREE.LineBasicMaterial({ color: 0x000000 });
  const swapped: Array<{ mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }> = [];
  const hiddenForLine: THREE.Object3D[] = [];
  const lines = new THREE.Group();
  lines.name = 'render-input-edges';
  const edgeGeoms: THREE.BufferGeometry[] = [];

  // Decide visibility branch by branch, so excluding a group excludes its
  // children without visiting them twice.
  const visit = (o: THREE.Object3D, excluded: boolean) => {
    if (!o.visible) return;
    const ex = excluded || isExcludedBranch(o);
    if (o instanceof THREE.Mesh) {
      // See-through things are not drawn: glass (so the interior reads
      // through it, as on a drawing) and the light-cone / glow meshes,
      // whose edges came out as stray diagonals under the windows.
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const seeThrough = mats.some(m => m && (m as any).transparent && ((m as any).opacity ?? 1) < 0.5);
      if (ex || isHelperMesh(o) || seeThrough || !o.geometry?.attributes?.position) {
        o.visible = false; hiddenForLine.push(o);
      } else {
        swapped.push({ mesh: o, material: o.material });
        o.material = white;
        const eg = new THREE.EdgesGeometry(o.geometry, EDGE_THRESHOLD_DEG);
        edgeGeoms.push(eg);
        const seg = new THREE.LineSegments(eg, black);
        // The lines group sits at the scene root with an identity transform,
        // so the segment's LOCAL matrix is the mesh's world matrix. Setting
        // matrixWorld directly is undone by updateMatrixWorld on render.
        seg.matrixAutoUpdate = false;
        seg.matrix.copy(o.matrixWorld);
        lines.add(seg);
      }
    } else if ((o as any).isLine || (o as any).isPoints || (o as any).isSprite) {
      o.visible = false; hiddenForLine.push(o);
    }
    for (const c of o.children) visit(c, ex);
  };
  visit(scene, false);
  scene.add(lines);

  const oldBg = scene.background;
  const oldFog = scene.fog;
  const oldTone = gl.toneMapping;
  const oldClear = new THREE.Color();
  gl.getClearColor(oldClear);
  const oldAlpha = gl.getClearAlpha();
  scene.background = new THREE.Color(0xffffff);
  scene.fog = null;
  gl.toneMapping = THREE.NoToneMapping;
  gl.setClearColor(0xffffff, 1);

  let line: string;
  try {
    line = renderAt(gl, scene, camera, width, height);
  } finally {
    scene.remove(lines);
    edgeGeoms.forEach(g => g.dispose());
    white.dispose(); black.dispose();
    swapped.forEach(s => { s.mesh.material = s.material; });
    hiddenForLine.forEach(o => { o.visible = true; });
    scene.background = oldBg;
    scene.fog = oldFog;
    gl.toneMapping = oldTone;
    gl.setClearColor(oldClear, oldAlpha);
    // Put the on-screen frame back the way it was.
    gl.render(scene, camera);
  }

  return { shaded, line, width, height };
}

/**
 * Crop a shaded + line pair to the drawing's ink, plus a margin, so a plan
 * captured from the fixed top camera fills its frame instead of sitting
 * small in a field of lawn (which the image models then "zoom" into on
 * their own terms). The line drawing is black on white, so its bounds are
 * the design's bounds; the shaded image is cropped identically.
 */
export async function cropToInk(line: string, shaded: string, marginFrac = 0.08): Promise<{ line: string; shaded: string; width: number; height: number }> {
  const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
  const [li, si] = await Promise.all([load(line), load(shaded)]);
  const c = document.createElement('canvas'); c.width = li.width; c.height = li.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(li, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
    const i = (y * c.width + x) * 4;
    if (d[i] < 128 && d[i + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0 || y1 < 0) return { line, shaded, width: c.width, height: c.height };
  const mx = Math.round((x1 - x0) * marginFrac), my = Math.round((y1 - y0) * marginFrac);
  const sx = Math.max(0, x0 - mx), sy = Math.max(0, y0 - my);
  const sw = Math.min(c.width - sx, x1 - x0 + 2 * mx), sh = Math.min(c.height - sy, y1 - y0 + 2 * my);
  const out = (img: HTMLImageElement, type: 'image/png' | 'image/jpeg') => {
    const o = document.createElement('canvas'); o.width = sw; o.height = sh;
    const octx = o.getContext('2d')!;
    // Both captures share a frame size; scale the source rect if not.
    const kx = img.width / c.width, ky = img.height / c.height;
    octx.drawImage(img, sx * kx, sy * ky, sw * kx, sh * ky, 0, 0, sw, sh);
    return o.toDataURL(type, 0.92);
  };
  return { line: out(li, 'image/png'), shaded: out(si, 'image/jpeg'), width: sw, height: sh };
}
