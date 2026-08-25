import React, { useEffect, useRef, useState } from 'react';
import { useAppEngine, compressImageFile } from '../../hooks/useAppEngine';
import { AppStage, Project } from '../../types';
import { useCredits } from '../../hooks/useCredits';
import { Construction, FolderOpen, ChevronDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { createProject, listProjects, updateProject } from '../../services/projectService';
import { setConfigSpec } from '../../services/geminiService';
import { consumePendingDesign } from '../../services/designHandoff';

export const DesignerView: React.FC<{ engine: any }> = ({ engine }) => {

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [savedDesigns, setSavedDesigns] = useState<Project[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [designsOpen, setDesignsOpen] = useState(false);
  // The configurator bundle is ~2MB; on a cold connection the iframe sat as a
  // near-black empty box with no feedback, which testers read as "broken".
  const [configLoaded, setConfigLoaded] = useState(false);
  // A scene waiting to be named and saved to Projects (from Save Design).
  const [pendingSave, setPendingSave] = useState<{ room: any; price: number | null } | null>(null);
  const [saveName, setSaveName] = useState('');
  // '__new__' or an existing project id to attach the design to.
  const [saveTarget, setSaveTarget] = useState('__new__');

  const confirmSave = async () => {
    if (!pendingSave) return;
    const scene3d = JSON.stringify(pendingSave.room);
    try {
      if (saveTarget === '__new__') {
        await createProject({
          name: saveName.trim() || `Garden room ${pendingSave.room.widthMm || '?'} x ${pendingSave.room.depthMm || '?'}mm`,
          estimateValue: pendingSave.price,
          notes: 'Created from the 3D Configurator.',
          // The full room spec, restorable via the My Designs picker or Projects.
          scene3d,
        });
        toast.success('Design saved to a new project');
      } else {
        const target = allProjects.find(p => p.id === saveTarget);
        await updateProject(saveTarget, { scene3d, estimateValue: pendingSave.price });
        toast.success(`Design saved to "${target?.name || 'project'}"`);
      }
      setPendingSave(null);
      refreshDesigns();
    } catch (err: any) {
      console.error('Failed to save 3D design', err);
      toast.error(err?.message || 'Could not save the design to your projects.');
    }
  };

  /** Projects that carry a configurator scene — the loadable ones. */
  const refreshDesigns = async () => {
    try {
      const projects = await listProjects();
      setAllProjects(projects);
      setSavedDesigns(projects.filter(p => !!p.scene3d));
    } catch {
      // Signed-out or projects unavailable: the picker just stays empty.
      setAllProjects([]);
      setSavedDesigns([]);
    }
  };

  useEffect(() => { refreshDesigns(); }, []);

  const loadDesign = (project: Project) => {
    if (!project.scene3d) return;
    try {
      const room = JSON.parse(project.scene3d);
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'LOAD_3D_DESIGN', room },
        window.location.origin
      );
      setDesignsOpen(false);
      toast.success(`Loaded "${project.name}"`);
    } catch {
      toast.error('That saved design could not be read.');
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only trust messages from our own origin. The configurator is served from
      // the same host, so anything from elsewhere is not ours.
      if (event.origin !== window.location.origin) return;

      // Save Design in the configurator hands the scene up to here, because the
      // iframe has no Firebase client of its own. Rather than auto-naming, park
      // the scene and ask for a name - "Garden room 4000 x 3000mm" is
      // indistinguishable from the next one; the user knows it as
      // "Mrs Smith's office".
      if (event.data && event.data.type === 'SAVE_3D_DESIGN') {
        const { scene, price } = event.data;
        const room = scene?.room || {};
        setSaveName(`Garden room ${room.widthMm || '?'} x ${room.depthMm || '?'}mm`);
        setSaveTarget('__new__');
        setPendingSave({ room, price: typeof price === 'number' ? Math.round(price) : null });
        return;
      }

      if (event.data && event.data.type === 'RENDER_3D_SCENE') {
        const dataUrl = event.data.image;
        // Hard-constraint spec for the render prompt — the server turns this
        // into "exactly N doors, style X, cladding Y" so the render matches
        // the configured building instead of guessing from the screenshot.
        setConfigSpec(event.data.roomSpec || null);

        // Convert dataUrl to a File object so the engine can process it properly
        fetch(dataUrl)
          .then(res => res.blob())
          .then(async blob => {
            const file = new File([blob], '3d-design.png', { type: 'image/png' });

            try {
                // Compress the image to strip the prefix and reduce size before sending to API
                const base64Data = await compressImageFile(file, 1920);

                // Set it as if they uploaded a SketchUp image
                engine.setIsSketchUpMode(true);

                // Manually set the original image directly
                engine.setOriginalImageForStage(AppStage.RENDER_ENGINE, base64Data);

                // Switch to the Render Engine stage
                engine.setActiveStage(AppStage.RENDER_ENGINE);

                // Identical to a MANUAL SKETCHUP upload from here - which skips
                // material auto-detect. The configurator already chose every
                // material, so there is nothing for an image analyser to guess;
                // running it on the flat-shaded screenshot invented elements
                // (windows on windowless buildings) that then contradicted the
                // spec. Materials stay at their defaults, so the CGI render
                // prompt keeps the model's colour intent, and the spec locks
                // counts and dimensions.
                engine.setMaterials({ walls: 'none', roof: 'none', windows: 'none', doors: 'none', decking: 'none' });
            } catch (err) {
                console.error("Failed to process 3D scene image", err);
            }
          });
      }
    };

    window.addEventListener('message', handleMessage);

    // Lock scroll on the main page when configurator is active
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('message', handleMessage);
      document.body.style.overflow = 'auto';
      document.documentElement.style.overflow = 'auto';
    };
  }, [engine]);

  const { plan, loading } = useCredits();

  if (loading) {
    return (
        <div className="w-full h-[100dvh] flex flex-col bg-[#0F1110] items-center justify-center">
            <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
        </div>
    );
  }

  return (
    <div className="w-full h-[calc(100dvh-6rem)] flex flex-col bg-[#0F1110] relative">
      {/* My Designs — floats top-RIGHT so it never covers the configurator's
          own toolbar, while staying one click away. */}
      {savedDesigns.length > 0 && (
        <div className="absolute top-3 right-3 z-20">
          <button
            onClick={() => setDesignsOpen(o => !o)}
            className="flex items-center gap-2 bg-white/95 backdrop-blur-md border border-black/10 shadow-lg rounded-full px-4 py-2 text-xs font-bold text-[#3b4d4a] hover:bg-white transition-colors"
          >
            <FolderOpen size={14} />
            My Designs ({savedDesigns.length})
            <ChevronDown size={14} className={`transition-transform ${designsOpen ? 'rotate-180' : ''}`} />
          </button>
          {designsOpen && (
            <div className="absolute top-full mt-2 right-0 w-72 bg-white rounded-2xl shadow-2xl border border-black/5 p-1.5 max-h-72 overflow-y-auto">
              {savedDesigns.map(p => (
                <button
                  key={p.id}
                  onClick={() => loadDesign(p)}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <span className="block text-xs font-bold text-[#3b4d4a] truncate">{p.name}</span>
                  <span className="block text-[10px] text-slate-400">
                    {p.estimateValue ? `£${p.estimateValue.toLocaleString()} · ` : ''}
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {!configLoaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#f8fafc]">
          <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-semibold text-accent">Loading 3D Configurator…</p>
          <p className="text-xs text-slate-400">First load can take a few seconds</p>
        </div>
      )}
      {pendingSave && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80">
            <h3 className="text-sm font-bold text-[#3b4d4a] mb-1">Save design to Projects</h3>
            <p className="text-xs text-slate-400 mb-3">Add it to an existing project, or start a new one.</p>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Save to</label>
            <select
              value={saveTarget}
              onChange={e => setSaveTarget(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-[#3b4d4a] focus:outline-none focus:ring-2 focus:ring-accent/40 mb-3 bg-white"
            >
              <option value="__new__">+ New project</option>
              {allProjects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {saveTarget === '__new__' ? (
              <input
                autoFocus
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmSave(); }}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-[#3b4d4a] focus:outline-none focus:ring-2 focus:ring-accent/40 mb-4"
                placeholder="e.g. Smith garden office"
              />
            ) : allProjects.find(p => p.id === saveTarget)?.scene3d ? (
              <p className="text-[11px] text-amber-600 mb-4">This project already has a saved design - saving will replace it.</p>
            ) : (
              <div className="mb-4" />
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPendingSave(null)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700">Cancel</button>
              <button onClick={confirmSave} className="px-4 py-2 text-xs font-bold text-white bg-accent rounded-full hover:opacity-90">Save design</button>
            </div>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src="/3d-config/index.html"
        onLoad={() => {
          setConfigLoaded(true);
          // A design opened from the Projects page is waiting to be shown.
          // The iframe's app needs a beat to mount its message listener, and
          // LOAD_3D_DESIGN is idempotent, so post it a few times.
          const pending = consumePendingDesign();
          if (pending) {
            [400, 1500, 3000].forEach(ms => setTimeout(() => {
              iframeRef.current?.contentWindow?.postMessage(
                { type: 'LOAD_3D_DESIGN', room: pending },
                window.location.origin
              );
            }, ms));
          }
        }}
        className="w-full flex-1 border-none"
        title="3D Configurator"
      />
    </div>
  );
};
