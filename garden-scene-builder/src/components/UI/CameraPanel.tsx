import { useEffect, useRef, useState } from 'react';
import { Camera, Plus, RefreshCw, Trash2, Pencil, Check, X, ArrowRight, Aperture } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store';
import type { CameraRatio, SavedCamera } from '../../types';
import { CAMERA_RATIOS, ratioValue, readCameraPose, applyCamera, captureToFile, openRenderEngine } from '../../utils/renderPayload';

/**
 * Cameras (21 Sep 2026): think Blender's camera object, as a MODE.
 *
 * Normally a single "Cameras" pill sits bottom-left. Clicking it enters
 * camera mode: the toolbars, the price, the editors and the sidebar all go
 * (CanvasArea / BuilderPage read `cameraMode`), the view is the whole
 * screen, and this panel is the only control. Done or Escape leaves it,
 * with everything back as it was.
 *
 * In camera mode: choose the orbit or walk view, frame with the lens and
 * the output frame (viewport overlay with thirds), add a camera from the
 * current view, go back to any saved one, move it to where you are, rename
 * it - and CAPTURE. Capture takes the view at 2K inside the frame, plays a
 * shutter, and downloads the file. The Render Engine gets that file the
 * way it gets any image: uploaded by the user. Nothing about the design
 * travels with it (Charlie: the analysis must read the picture, not the
 * configurator). "Go to Render Engine" just opens the page.
 *
 * Not in the free public configurator, nor in plan, lighting or export views.
 */

const RATIO_LABEL: Record<CameraRatio, string> = { '16:9': '16:9', '3:2': '3:2', '4:3': '4:3', '1:1': '1:1', '4:5': '4:5' };
/** One stable empty list, so a design with no cameras never re-renders the panel. */
const NO_CAMERAS: SavedCamera[] = [];

type Box = { x: number; y: number; w: number; h: number };

/** The frame the capture will contain, in overlay pixels, for a ratio. */
const frameBox = (W: number, H: number, ratio: CameraRatio): Box => {
  const want = ratioValue(ratio);
  let w = W, h = H;
  if (W / H > want) w = Math.round(H * want); else h = Math.round(W / want);
  return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h };
};

/** The letterbox / pillarbox showing the capture crop over the live view. */
function Viewport({ ratio, onBox }: { ratio: CameraRatio; onBox: (b: Box) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const measure = () => {
      const W = el.clientWidth, H = el.clientHeight; if (!W || !H) return;
      const b = frameBox(W, H, ratio);
      setBox(b); onBox(b);
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratio]);
  const bar = 'absolute bg-black/45 pointer-events-none';
  return (
    <div ref={ref} className="absolute inset-0 z-20 pointer-events-none">
      {box && (
        <>
          <div className={bar} style={{ left: 0, top: 0, right: 0, height: box.y }} />
          <div className={bar} style={{ left: 0, bottom: 0, right: 0, height: box.y }} />
          <div className={bar} style={{ left: 0, top: box.y, width: box.x, height: box.h }} />
          <div className={bar} style={{ right: 0, top: box.y, width: box.x, height: box.h }} />
          <div className="absolute border border-white/80 pointer-events-none" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
            {/* Rule-of-thirds guides, faint, the way a camera viewfinder shows them. */}
            <div className="absolute inset-y-0 left-1/3 border-l border-white/25" />
            <div className="absolute inset-y-0 left-2/3 border-l border-white/25" />
            <div className="absolute inset-x-0 top-1/3 border-t border-white/25" />
            <div className="absolute inset-x-0 top-2/3 border-t border-white/25" />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The shutter. A white flash over the frame, then the captured picture
 * itself shrinks from the frame down to a small print in the bottom
 * corner and fades - the file is already downloading by then.
 */
function Shutter({ image, box, onDone }: { image: string; box: Box; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 1400); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="absolute inset-0 z-40 pointer-events-none">
      <style>{`
        @keyframes modulrShutterFlash { 0% { opacity: 0; } 12% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes modulrShutterBars { 0% { transform: scaleY(0); } 15% { transform: scaleY(1); } 30% { transform: scaleY(0); } 100% { transform: scaleY(0); } }
        @keyframes modulrShutterPrint {
          0%   { transform: translate(0, 0) scale(1); opacity: 1; }
          25%  { transform: translate(0, 0) scale(0.96); opacity: 1; }
          80%  { transform: translate(var(--dx), var(--dy)) scale(0.18); opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0.18); opacity: 0; }
        }
      `}</style>
      <div className="absolute bg-white" style={{ left: box.x, top: box.y, width: box.w, height: box.h, animation: 'modulrShutterFlash 420ms ease-out both' }} />
      <div className="absolute bg-black origin-top" style={{ left: box.x, top: box.y, width: box.w, height: box.h / 2, animation: 'modulrShutterBars 420ms ease-in-out both' }} />
      <div className="absolute bg-black origin-bottom" style={{ left: box.x, top: box.y + box.h / 2, width: box.w, height: box.h / 2, animation: 'modulrShutterBars 420ms ease-in-out both' }} />
      <img
        src={image}
        alt=""
        className="absolute shadow-[0_20px_60px_rgba(0,0,0,0.45)] border-4 border-white origin-center"
        style={{
          left: box.x, top: box.y, width: box.w, height: box.h, objectFit: 'cover',
          // Fly to the bottom-right corner of the frame.
          ['--dx' as any]: `${box.w * 0.41}px`, ['--dy' as any]: `${box.h * 0.41}px`,
          animation: 'modulrShutterPrint 1300ms cubic-bezier(0.16, 1, 0.3, 1) 120ms both',
        }}
      />
    </div>
  );
}

const chip = (on: boolean) => `text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${on ? 'bg-[#3b4d4a] text-white border-[#3b4d4a]' : 'border-[#3b4d4a]/20 text-[#3b4d4a]/70 hover:border-[#3b4d4a]/50'}`;

export function CameraPanel() {
  // `cameras` is selected as stored (possibly undefined) and defaulted
  // below: defaulting inside the selector made a new [] every call, which
  // the shallow compare saw as a change, which re-rendered, which... React
  // error 185 and a blank configurator (21 Sep 2026).
  const {
    viewMode, setViewMode, isExporting, configMode, storedCameras, activeCameraId, setActiveCameraId,
    addCamera, updateCamera, removeCamera, cameraMode, setCameraMode, setWalkStart,
    cameraFov, setCameraFov, walkFov, setWalkFov,
  } = useStore(useShallow(s => ({
    viewMode: s.viewMode, setViewMode: s.setViewMode, isExporting: s.isExporting, configMode: s.configMode,
    storedCameras: s.scene.cameras, activeCameraId: s.activeCameraId, setActiveCameraId: s.setActiveCameraId,
    addCamera: s.addCamera, updateCamera: s.updateCamera, removeCamera: s.removeCamera,
    cameraMode: s.cameraMode, setCameraMode: s.setCameraMode, setWalkStart: s.setWalkStart,
    cameraFov: s.cameraFov, setCameraFov: s.setCameraFov, walkFov: s.walkFov, setWalkFov: s.setWalkFov,
  })));
  const cameras = storedCameras || NO_CAMERAS;
  const [ratio, setRatio] = useState<CameraRatio>('16:9');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [shot, setShot] = useState<{ image: string; box: Box } | null>(null);
  const boxRef = useRef<Box | null>(null);

  // Escape leaves camera mode.
  useEffect(() => {
    if (!cameraMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCameraMode(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cameraMode, setCameraMode]);

  if (configMode === 'public' || isExporting || (viewMode !== '3d' && viewMode !== 'walking')) return null;

  const active = cameras.find(c => c.id === activeCameraId) || null;
  const frameRatio = active ? active.ratio : ratio;
  const isWalk = viewMode === 'walking';
  const lens = isWalk ? walkFov : cameraFov;
  const setLens = isWalk ? setWalkFov : setCameraFov;

  // Collapsed: one pill, bottom-left, above the price.
  if (!cameraMode) {
    return (
      <button
        type="button"
        onClick={() => setCameraMode(true)}
        title="Camera mode: frame, save and capture views"
        className="absolute left-8 bottom-56 z-30 inline-flex items-center gap-2 bg-white/90 backdrop-blur-md text-[#3b4d4a] border border-[#3b4d4a]/20 px-5 py-3 rounded-full font-semibold shadow-md hover:bg-[#3b4d4a] hover:text-white transition-all text-sm cursor-pointer"
      >
        <Camera size={18} />
        Cameras{cameras.length ? ` (${cameras.length})` : ''}
      </button>
    );
  }

  const handleAdd = () => {
    const pose = readCameraPose();
    if (!pose) return;
    const cam: SavedCamera = { id: uuidv4(), name: `Camera ${cameras.length + 1}`, ...pose, ratio: frameRatio };
    addCamera(cam);
    setActiveCameraId(cam.id);
  };
  const handleGo = (cam: SavedCamera) => { setActiveCameraId(cam.id); applyCamera(cam); };
  const handleMoveHere = (cam: SavedCamera) => { const pose = readCameraPose(); if (pose) updateCamera(cam.id, pose); };
  const handleRatio = (r: CameraRatio) => { setRatio(r); if (active) updateCamera(active.id, { ratio: r }); };
  const startRename = (cam: SavedCamera) => { setEditing(cam.id); setDraft(cam.name); };
  const commitRename = () => { if (editing) updateCamera(editing, { name: draft.trim() || 'Camera' }); setEditing(null); };
  const handleCapture = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const image = await captureToFile(frameRatio, active?.name || `view-${cameras.length + 1}`);
      const box = boxRef.current;
      if (image && box) setShot({ image, box });
    } finally { setBusy(false); }
  };
  const goOrbit = () => { if (viewMode !== '3d') setViewMode('3d'); };
  const goWalk = (where: 'inside' | 'outside') => {
    setWalkStart(where);
    if (viewMode !== 'walking') setViewMode('walking');
    else window.dispatchEvent(new CustomEvent('walk-teleport', { detail: { where } }));
  };

  return (
    <>
      <Viewport ratio={frameRatio} onBox={b => { boxRef.current = b; }} />
      {shot && <Shutter image={shot.image} box={shot.box} onDone={() => setShot(null)} />}

      {/* Top-left: which view you are framing in, and the way out. */}
      <div className="absolute top-6 left-8 z-30 flex items-center gap-2">
        <div className="bg-white/90 backdrop-blur-md border border-[#3b4d4a]/15 rounded-full shadow-md px-2 py-1.5 flex items-center gap-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-[#3b4d4a]/60 px-2">View</span>
          <button type="button" onClick={goOrbit} className={chip(viewMode === '3d')}>Orbit</button>
          <button type="button" onClick={() => goWalk('inside')} className={chip(isWalk)}>Walk inside</button>
          <button type="button" onClick={() => goWalk('outside')} className={chip(false)}>Walk outside</button>
        </div>
        <button
          type="button"
          onClick={() => setCameraMode(false)}
          title="Leave camera mode (Esc)"
          className="inline-flex items-center gap-1.5 bg-[#3b4d4a] text-white px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider shadow-md hover:bg-[#2d3a38] transition-colors cursor-pointer"
        >
          <X size={14} /> Done
        </button>
      </div>

      {/* Bottom-left: the cameras and the frame. */}
      <div className="absolute left-8 bottom-8 z-30 w-72 bg-white/90 backdrop-blur-md border border-[#3b4d4a]/15 rounded-2xl shadow-md text-[#3b4d4a] overflow-hidden">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
            <Camera size={14} />
            Cameras
          </div>
          <button
            type="button"
            onClick={handleAdd}
            title="Add a camera at the current view"
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#3b4d4a] text-white hover:bg-[#2d3a38] transition-colors cursor-pointer"
          >
            <Plus size={12} /> Add
          </button>
        </div>

        {cameras.length > 0 ? (
          <ul className="px-2 pb-1 max-h-44 overflow-y-auto">
            {cameras.map(cam => {
              const isActive = cam.id === activeCameraId;
              return (
                <li key={cam.id} className={`flex items-center gap-1 rounded-lg px-2 py-1 ${isActive ? 'bg-[#3b4d4a]/10' : 'hover:bg-black/5'}`}>
                  {editing === cam.id ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }}
                      onBlur={commitRename}
                      className="flex-1 min-w-0 text-xs bg-white border border-[#3b4d4a]/30 rounded px-1.5 py-0.5 outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleGo(cam)}
                      onDoubleClick={() => startRename(cam)}
                      title={`Go to ${cam.name} (${cam.mode === 'walking' ? 'walk' : 'orbit'} view, ${RATIO_LABEL[cam.ratio]})`}
                      className="flex-1 min-w-0 text-left text-xs font-semibold truncate cursor-pointer"
                    >
                      {cam.name}
                      <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-[#3b4d4a]/50">{cam.mode === 'walking' ? 'walk' : 'orbit'} · {RATIO_LABEL[cam.ratio]}</span>
                    </button>
                  )}
                  {editing === cam.id ? (
                    <button type="button" onClick={commitRename} className="p-1 text-[#3b4d4a]/70 hover:text-[#3b4d4a] cursor-pointer" title="Done"><Check size={13} /></button>
                  ) : (
                    <>
                      <button type="button" onClick={() => startRename(cam)} className="p-1 text-[#3b4d4a]/50 hover:text-[#3b4d4a] cursor-pointer" title="Rename"><Pencil size={12} /></button>
                      <button type="button" onClick={() => handleMoveHere(cam)} className="p-1 text-[#3b4d4a]/50 hover:text-[#3b4d4a] cursor-pointer" title="Move this camera to the current view"><RefreshCw size={12} /></button>
                      <button type="button" onClick={() => removeCamera(cam.id)} className="p-1 text-[#3b4d4a]/50 hover:text-red-600 cursor-pointer" title="Delete camera"><Trash2 size={12} /></button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 pb-2 text-[10px] text-[#3b4d4a]/60 leading-snug">No cameras yet. Frame the view, then Add.</p>
        )}

        <div className="px-4 pb-2 flex items-center gap-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-[#3b4d4a]/60 mr-1">Frame</span>
          {CAMERA_RATIOS.map(r => (
            <button key={r} type="button" onClick={() => handleRatio(r)} className={chip(frameRatio === r)}>{RATIO_LABEL[r]}</button>
          ))}
        </div>

        <div className="px-4 pb-3 flex items-center gap-3">
          <span className="text-[9px] font-bold uppercase tracking-wider text-[#3b4d4a]/60 whitespace-nowrap">Lens {lens}°</span>
          <input
            type="range" min={25} max={90} step={1} value={lens}
            onChange={(e) => { const v = Number(e.target.value); setLens(v); if (active && active.mode === (isWalk ? 'walking' : '3d')) updateCamera(active.id, { fov: v }); }}
            className="flex-1 accent-[#3b4d4a] cursor-pointer"
          />
        </div>

        <div className="flex">
          <button
            type="button"
            onClick={handleCapture}
            disabled={busy}
            className="flex-1 bg-[#3b4d4a] hover:bg-[#2d3a38] disabled:opacity-60 text-white py-3 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer"
            title="Capture this view inside the frame at 2K and download it"
          >
            <Aperture size={15} />
            {busy ? 'Capturing…' : 'Capture'}
          </button>
          <button
            type="button"
            onClick={openRenderEngine}
            className="px-4 bg-white hover:bg-gray-50 text-[#3b4d4a] border-l border-[#3b4d4a]/15 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            title="Open the Render Engine, where you upload the capture"
          >
            Render Engine <ArrowRight size={12} />
          </button>
        </div>
        <p className="px-4 py-1.5 text-[9px] text-[#3b4d4a]/60 leading-snug">
          Capture saves the view as a JPEG. Upload it in the Render Engine. Double-click a name to rename a camera. Esc to leave.
        </p>
      </div>
    </>
  );
}
