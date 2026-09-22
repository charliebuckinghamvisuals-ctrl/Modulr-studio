/**
 * Saved cameras and the capture (21 Sep 2026).
 *
 * The configurator hands NOTHING to the Render Engine any more (Charlie:
 * "I want a screenshot to send into it myself"). Camera mode captures a
 * 2K screenshot of the view, cropped to the camera's frame, and downloads
 * it; the user uploads that file to the Render Engine like any other image,
 * so the engine's analysis reads the picture and nothing else. No room
 * spec, no line drawing, no message with an image in it.
 *
 * Saved cameras: readCameraPose() takes the live camera (orbit or walk),
 * applyCamera() puts it back through the two events MainScene already
 * listens for ('camera-set-view' for the orbit controls, 'walk-teleport'
 * for the walker), so the pose logic stays where the cameras live.
 */
import * as THREE from 'three';
import { useStore } from '../store';
import type { CameraRatio, SavedCamera } from '../types';

export const CAMERA_RATIOS: CameraRatio[] = ['16:9', '3:2', '4:3', '1:1', '4:5'];
export const ratioValue = (r: CameraRatio): number => { const [w, h] = r.split(':').map(Number); return w / h; };

/** The live R3F camera - the one the frame is drawn with, not a stale handle. */
const liveCamera = (): THREE.PerspectiveCamera | null => {
  const w = window as any;
  return (w.__modulrScene?.__r3f?.root?.getState?.()?.camera as THREE.PerspectiveCamera) || (w.__modulrCamera as THREE.PerspectiveCamera) || null;
};

/** The live camera as a pose: where it is, what it looks at, its lens, which camera it is. */
export function readCameraPose(): Pick<SavedCamera, 'mode' | 'position' | 'target' | 'fov'> | null {
  const cam = liveCamera();
  if (!cam) return null;
  const st = useStore.getState();
  const mode: SavedCamera['mode'] = st.viewMode === 'walking' ? 'walking' : '3d';
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
  const target = cam.position.clone().add(fwd.multiplyScalar(6));
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return {
    mode,
    position: [r(cam.position.x), r(cam.position.y), r(cam.position.z)],
    target: [r(target.x), r(target.y), r(target.z)],
    fov: mode === 'walking' ? st.walkFov : st.cameraFov,
  };
}

/**
 * Go back to a saved camera. Switches to its view mode first if needed;
 * the pose event is sent a moment later because a mode switch remounts
 * the controls, which set their own starting pose during that render.
 */
export function applyCamera(cam: SavedCamera): void {
  const st = useStore.getState();
  const pose = { position: cam.position, target: cam.target };
  if (cam.mode === 'walking') {
    st.setWalkFov(cam.fov);
    const send = () => window.dispatchEvent(new CustomEvent('walk-teleport', { detail: { pose } }));
    if (st.viewMode !== 'walking') { st.setViewMode('walking'); setTimeout(send, 250); } else send();
  } else {
    st.setCameraFov(cam.fov);
    const send = () => window.dispatchEvent(new CustomEvent('camera-set-view', { detail: { pose, snap: false } }));
    if (st.viewMode !== '3d') { st.setViewMode('3d'); setTimeout(send, 250); } else send();
  }
}

/** A clean screenshot of the current view at 2K (grid, gizmos and labels are excluded by the capture helper). */
export function captureShaded(): string | null {
  const canvas = document.querySelector('canvas');
  if (!canvas) return null;
  let captured: { shaded: string } | null = null;
  try { captured = (window as any).__modulrCaptureRenderInputs?.() || null; } catch (e) { console.warn('capture failed, using the canvas', e); }
  return captured?.shaded || canvas.toDataURL('image/png');
}

/** Centre-crop a data URL to the camera's output ratio, as a high-quality JPEG. */
export async function cropToRatio(dataUrl: string, ratio: CameraRatio): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = dataUrl; });
  const want = ratioValue(ratio);
  const have = img.width / img.height;
  let sw = img.width, sh = img.height;
  if (have > want) sw = Math.round(img.height * want); else sh = Math.round(img.width / want);
  const sx = Math.round((img.width - sw) / 2), sy = Math.round((img.height - sh) / 2);
  const c = document.createElement('canvas'); c.width = sw; c.height = sh;
  c.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return c.toDataURL('image/jpeg', 0.95);
}

/** A safe file name from a camera name: "Front, dusk" -> "modulr-front-dusk.jpg". */
export const captureFileName = (cameraName: string) =>
  'modulr-' + (cameraName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'view') + '.jpg';

/**
 * Capture the current view, cropped to the frame, and download it. Returns
 * the data URL so the panel can play the shutter with the real picture.
 */
export async function captureToFile(ratio: CameraRatio, cameraName = 'view'): Promise<string | null> {
  const raw = captureShaded();
  if (!raw) return null;
  let image = raw;
  try { image = await cropToRatio(raw, ratio); } catch (e) { console.warn('ratio crop failed, saving uncropped', e); }
  const a = document.createElement('a');
  a.href = image;
  a.download = captureFileName(cameraName);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return image;
}

/** Ask the host app to open the Render Engine page - empty, ready for the upload. */
export function openRenderEngine(): void {
  window.parent.postMessage({ type: 'OPEN_RENDER_ENGINE' }, window.location.origin);
}
