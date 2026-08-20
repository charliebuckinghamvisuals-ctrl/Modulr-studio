import React, { useEffect, useRef, useState } from 'react';
import { useAppEngine, compressImageFile } from '../../hooks/useAppEngine';
import { AppStage, Project } from '../../types';
import { useCredits } from '../../hooks/useCredits';
import { Construction, FolderOpen, ChevronDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { createProject, listProjects } from '../../services/projectService';
import { setConfigSpec } from '../../services/geminiService';

export const DesignerView: React.FC<{ engine: any }> = ({ engine }) => {

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [savedDesigns, setSavedDesigns] = useState<Project[]>([]);
  const [designsOpen, setDesignsOpen] = useState(false);
  // The configurator bundle is ~2MB; on a cold connection the iframe sat as a
  // near-black empty box with no feedback, which testers read as "broken".
  const [configLoaded, setConfigLoaded] = useState(false);

  /** Projects that carry a configurator scene — the loadable ones. */
  const refreshDesigns = async () => {
    try {
      const projects = await listProjects();
      setSavedDesigns(projects.filter(p => !!p.scene3d));
    } catch {
      // Signed-out or projects unavailable: the picker just stays empty.
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
      // iframe has no Firebase client of its own.
      if (event.data && event.data.type === 'SAVE_3D_DESIGN') {
        (async () => {
          try {
            const { scene, price } = event.data;
            const room = scene?.room || {};
            const name = `Garden room ${room.widthMm || '?'} x ${room.depthMm || '?'}mm`;
            await createProject({
              name,
              estimateValue: typeof price === 'number' ? Math.round(price) : null,
              notes: 'Created from the 3D Configurator.',
              // The full room spec, restorable via the My Designs picker.
              scene3d: JSON.stringify(room),
            });
            toast.success('Design saved to your projects');
            refreshDesigns();
          } catch (err: any) {
            console.error('Failed to save 3D design', err);
            toast.error(err?.message || 'Could not save the design to your projects.');
          }
        })();
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

                // Identical to a manual upload from here: analyse the image,
                // then render what was analysed. The configurator screenshot is
                // the source of truth for how the building LOOKS - the spec
                // only guarantees the things a picture cannot be miscounted on.
                engine.handleAnalyzeForRenderEngine(base64Data);
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
      {/* My Designs — floats over the configurator's top bar so saved scenes
          are one click away without stealing vertical space from the canvas. */}
      {savedDesigns.length > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
          <button
            onClick={() => setDesignsOpen(o => !o)}
            className="flex items-center gap-2 bg-white/95 backdrop-blur-md border border-black/10 shadow-lg rounded-full px-4 py-2 text-xs font-bold text-[#3b4d4a] hover:bg-white transition-colors"
          >
            <FolderOpen size={14} />
            My Designs ({savedDesigns.length})
            <ChevronDown size={14} className={`transition-transform ${designsOpen ? 'rotate-180' : ''}`} />
          </button>
          {designsOpen && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-72 bg-white rounded-2xl shadow-2xl border border-black/5 p-1.5 max-h-72 overflow-y-auto">
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
      <iframe
        ref={iframeRef}
        src="/3d-config/index.html"
        onLoad={() => setConfigLoaded(true)}
        className="w-full flex-1 border-none"
        title="3D Configurator"
      />
    </div>
  );
};
