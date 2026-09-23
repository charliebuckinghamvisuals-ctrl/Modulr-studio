import React, { useEffect, useRef, useState } from 'react';
import { useAppEngine } from '../../hooks/useAppEngine';
import { AppStage, Project, ProjectDraft } from '../../types';
import { useCredits } from '../../hooks/useCredits';
import { useAuth } from '../../hooks/useAuth';
import { Construction, FolderOpen, ChevronDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { createProject, listProjects, updateProject, statusChanges } from '../../services/projectService';
import { SaveToProjectDialog } from '../SaveToProjectDialog';
import { consumePendingDesign } from '../../services/designHandoff';
import { setPendingPlanCapture } from '../../services/floorPlanService';
import { useBranding } from '../../hooks/useBranding';

export const DesignerView: React.FC<{ engine: any }> = ({ engine }) => {

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [savedDesigns, setSavedDesigns] = useState<Project[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [designsOpen, setDesignsOpen] = useState(false);
  // The configurator bundle is ~2MB; on a cold connection the iframe sat as a
  // near-black empty box with no feedback, which testers read as "broken".
  const [configLoaded, setConfigLoaded] = useState(false);
  // A scene waiting to be named and saved to Projects (from Save Design).
  const [pendingSave, setPendingSave] = useState<{ room: any; scene: any; price: number | null } | null>(null);
  const [saveName, setSaveName] = useState('');
  // '__new__' or an existing project id to attach the design to.
  const [saveTarget, setSaveTarget] = useState('__new__');
  // A PDF proposal from the configurator's export, waiting for a project.
  const [pendingPdf, setPendingPdf] = useState<{
    file: File; name: string; client: string; address: string; price: number | null; scene3d: string | null;
  } | null>(null);
  // Read by the message handler, which is bound once per engine.
  const configModeRef = useRef<'public' | 'business' | null>(null);
  // The PDF export dialog edits branding inside the iframe, which has no
  // Firebase client; it hands the fields up to be saved against the account.
  const { setBranding } = useBranding();
  const setBrandingRef = useRef(setBranding);
  setBrandingRef.current = setBranding;

  const confirmSave = async () => {
    if (!pendingSave) return;
    // The WHOLE design: room, placed objects (furniture, kitchen, lights)
    // and the garden boundary. Saves used to hold the room alone, so a
    // reopened design came back as an empty shell; the configurator still
    // reads those older room-only saves.
    const scene3d = JSON.stringify(pendingSave.scene);
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
        setPendingSave({
          room,
          scene: { v: 2, room, objects: scene?.objects || [], fences: scene?.fences || [], paths: scene?.paths || [], garden: scene?.garden },
          price: typeof price === 'number' ? Math.round(price) : null,
        });
        return;
      }

      // Save to project in the PDF export: the finished proposal comes up
      // here to be filed, as the design does - the iframe has no Firebase.
      if (event.data && event.data.type === 'SAVE_PDF_TO_PROJECT' && event.data.pdf instanceof Blob) {
        const d = event.data;
        const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
        const scene = d.scene && typeof d.scene === 'object' ? d.scene : null;
        setPendingPdf({
          file: new File([d.pdf], str(d.fileName, 120) || 'design-proposal.pdf', { type: 'application/pdf' }),
          name: str(d.project?.name, 120),
          client: str(d.project?.client, 120),
          address: str(d.project?.address, 200),
          price: typeof d.price === 'number' && d.price > 0 ? Math.round(d.price) : null,
          scene3d: scene ? JSON.stringify({ v: 2, room: scene.room || {}, objects: scene.objects || [], fences: scene.fences || [], paths: scene.paths || [], garden: scene.garden }) : null,
        });
        return;
      }

      // Branding edited in the configurator's PDF export: save it to the
      // account. Only the known fields, and a logo only as an image data URL.
      if (event.data && event.data.type === 'SAVE_BRANDING' && event.data.branding) {
        const b = event.data.branding;
        const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined);
        const patch: Record<string, unknown> = {};
        if (b.logo === null || (typeof b.logo === 'string' && b.logo.startsWith('data:image/'))) patch.logo = b.logo;
        if (hex(b.primaryColor)) patch.primaryColor = b.primaryColor;
        if (hex(b.secondaryColor)) patch.secondaryColor = b.secondaryColor;
        if (typeof b.companyName === 'string') patch.companyName = b.companyName.slice(0, 120);
        if (typeof b.pdfFont === 'string' && /^[a-z]{2,24}$/.test(b.pdfFont)) patch.pdfFont = b.pdfFont;
        if (typeof b.contactInfo === 'string') patch.contactInfo = b.contactInfo.slice(0, 600);
        setBrandingRef.current(patch as any).catch(() => { /* kept locally; saved next time */ });
        return;
      }

      // The free configurator's upsell button: show the plans.
      if (event.data && event.data.type === 'OPEN_PRICING') {
        engine.setActiveStage(AppStage.PRICING);
        return;
      }

      // Floor Plan Studio: the plan-view capture, parked for the Studio to
      // pick up on mount. Full configurator only - the free one has no
      // button, and the server gates the call as well.
      if (event.data && event.data.type === 'RENDER_PLAN') {
        if (configModeRef.current !== 'business') return;
        const image: string = typeof event.data.image === 'string' ? event.data.image : '';
        if (!image) return;
        const lineImage: string | null = typeof event.data.lineImage === 'string' ? event.data.lineImage : null;
        setPendingPlanCapture({ shaded: image, line: lineImage, spec: event.data.roomSpec || null });
        engine.setActiveStage(AppStage.FLOOR_PLAN_STUDIO);
        return;
      }

      /**
       * The configurator no longer hands anything to the engine (Charlie,
       * 21 Sep 2026): its camera mode CAPTURES a screenshot that downloads,
       * and the user uploads it to the Render Engine like any other image,
       * so the analysis reads the picture and nothing else. The only message
       * left is "take me to the Render Engine", with nothing preloaded.
       */
      if (event.data && event.data.type === 'OPEN_RENDER_ENGINE') {
        if (configModeRef.current !== 'business') return;
        // A capture taken from inside the room opens the Interior Render
        // Engine instead (22 Sep 2026) - it is surveyed and rendered as a
        // room, not as a building seen from the garden.
        engine.setActiveStage(event.data.view === 'interior' ? AppStage.INTERIOR_RENDER : AppStage.RENDER_ENGINE);
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

  const { user, loading: authLoading } = useAuth();
  const { loading, canUseFullConfigurator } = useCredits();

  /**
   * Which configurator to open.
   *
   * Two tiles first: the free Public one - the building's exterior in 3D
   * and plan, no interiors, no renders, costs nothing to serve - and the
   * full one, which is everything. The full one is gated on the same
   * server-decided entitlement as Projects (business, master, tester, beta),
   * so the client never keeps its own plan list. The iframe gets the mode in
   * its URL and again by message, and it defaults to public on its own.
   */
  const [configMode, setConfigMode] = useState<'public' | 'business' | null>(null);
  // Every paid plan and the trial get the full configurator (20 Sep 2026);
  // the public one is for signed-out visitors. Server-decided.
  const canUseBusinessConfig = canUseFullConfigurator === true;
  /**
   * A paid account opens straight into the full one (22 Sep 2026). The chooser
   * was asking a subscriber the same question on every visit and there was
   * only ever one answer, so it is now for accounts that are NOT entitled:
   * the free tile and the plans behind the locked one.
   *
   * Derived rather than set from an effect, so the chooser cannot flash up for
   * a frame before the auto-open lands.
   */
  const effectiveMode: 'public' | 'business' | null =
    configMode ?? (canUseBusinessConfig ? 'business' : null);
  configModeRef.current = effectiveMode;

  // Signed in but the plan has not come back yet. Holding here rather than
  // rendering the chooser is the whole point: a subscriber must never be shown
  // the upsell tile, and a paid account must never be asked to click through.
  // `loading` always resolves, including on a failed fetch, so this cannot
  // spin forever - a failure falls through to the chooser.
  if (authLoading || (!!user && loading)) {
    return (
      <div className="w-full h-[calc(100dvh-6rem)] flex flex-col items-center justify-center gap-4 render-grid px-6">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-semibold text-[#3b4d4a]">Checking your plan…</p>
        <p className="text-xs text-slate-400">Opening your configurator</p>
      </div>
    );
  }

  if (!effectiveMode) {
    return (
      <div className="w-full h-[calc(100dvh-6rem)] flex flex-col items-center justify-center render-grid px-6">
        {/* The site's drafting-paper surface, not a black void - the chooser
            is a page of the app, and every other page sits on this grid. */}
        <h2 className="text-[#3b4d4a] text-xl font-bold mb-1">3D Configurator</h2>
        <p className="text-slate-500 text-sm mb-8">Choose which version to open.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-3xl">
          <button
            onClick={() => setConfigMode('public')}
            className="text-left bg-white rounded-3xl p-7 shadow-2xl border border-black/5 hover:-translate-y-0.5 transition-transform"
          >
            <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 rounded-none px-2.5 py-1 mb-4">Free</span>
            <h3 className="text-lg font-bold text-[#3b4d4a] mb-2">Public</h3>
            <p className="text-sm text-slate-500 leading-relaxed mb-5">Design the outside of a garden room: size, roof, cladding, doors and windows, in 3D and plan, with a PDF.</p>
            <span className="text-xs font-bold uppercase tracking-wider text-[#3b4d4a]">Open &rarr;</span>
          </button>
          <button
            onClick={() => { if (canUseBusinessConfig) setConfigMode('business'); else engine.setActiveStage(AppStage.PRICING); }}
            className={`text-left rounded-3xl p-7 shadow-2xl border transition-transform hover:-translate-y-0.5 ${canUseBusinessConfig ? 'bg-[#3b4d4a] border-transparent' : 'bg-[#2d3a38] border-transparent'}`}
          >
            <span className={`inline-block text-[10px] font-bold uppercase tracking-widest rounded-none px-2.5 py-1 mb-4 ${canUseBusinessConfig ? 'text-white bg-white/15' : 'text-amber-200 bg-amber-200/15'}`}>
              {canUseBusinessConfig ? 'Included in your plan' : 'Configurator plan and up'}
            </span>
            <h3 className="text-lg font-bold text-white mb-2">Full</h3>
            <p className="text-sm text-white/70 leading-relaxed mb-5">Everything: interiors, kitchens, furniture, the walkthrough and lighting plan. Capture any view and render it in the Render Engine on The Hub.</p>
            <span className="text-xs font-bold uppercase tracking-wider text-white">{canUseBusinessConfig ? 'Open →' : 'See the plans →'}</span>
          </button>
        </div>
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
            className="flex items-center gap-2 bg-white/95 backdrop-blur-md border border-black/10 shadow-lg rounded-none px-4 py-2 text-xs font-bold text-[#3b4d4a] hover:bg-white transition-colors"
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
      {pendingPdf && (
        <SaveToProjectDialog
          file={pendingPdf.file}
          assetKind="proposal"
          defaultName="design-proposal"
          title="Save proposal to a project"
          newProject={{
            name: pendingPdf.name || 'Garden room',
            clientName: pendingPdf.client,
            address: pendingPdf.address,
            estimateValue: pendingPdf.price,
            // A proposal made is a quote given.
            status: 'quoted',
            quotedAt: Date.now(),
            scene3d: pendingPdf.scene3d,
            notes: 'Created from a PDF proposal.',
          }}
          afterSave={p => {
            // File the proposal and bring the job up to date with it, never
            // overwriting what is already on the project.
            const c: Partial<ProjectDraft> = {};
            if (p.status === 'lead') Object.assign(c, statusChanges(p, 'quoted'));
            if (p.estimateValue === null && pendingPdf.price) c.estimateValue = pendingPdf.price;
            if (!p.clientName && pendingPdf.client) c.clientName = pendingPdf.client;
            if (!p.address && pendingPdf.address) c.address = pendingPdf.address;
            if (!p.scene3d && pendingPdf.scene3d) c.scene3d = pendingPdf.scene3d;
            return c;
          }}
          onSaved={projectName => {
            iframeRef.current?.contentWindow?.postMessage({ type: 'PDF_SAVED_TO_PROJECT', projectName }, window.location.origin);
            refreshDesigns();
          }}
          onClose={() => setPendingPdf(null)}
        />
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
              <button onClick={confirmSave} className="px-4 py-2 text-xs font-bold text-white bg-accent rounded-none hover:opacity-90">Save design</button>
            </div>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={`/3d-config/index.html?mode=${effectiveMode}`}
        onLoad={() => {
          setConfigLoaded(true);
          // Belt and braces with the URL: tell the configurator which one it is.
          iframeRef.current?.contentWindow?.postMessage({ type: 'SET_CONFIG_MODE', mode: effectiveMode }, window.location.origin);
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
