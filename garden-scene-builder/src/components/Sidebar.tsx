import { useState, useEffect, createContext, useContext } from 'react';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { Settings, Plus, Box, Tent, Map, Settings2, Trash2, DoorOpen, DoorClosed, ChevronDown, ChevronRight, Save, FilePlus, Layers, TrendingUp, LayoutGrid } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Link } from 'react-router-dom';
import { gableCeilingMaxMm } from '../utils/placement';
import { fenceLength, fenceArea } from './3d/FenceRuns';
import { BOUNDARY_KINDS, boundaryMeta, runStyle, describeBoundary } from '../utils/boundary';
import { PATH_SURFACES, pathLength, describePath } from './3d/Paths';
import { DECK_MATERIALS, deckArea, describeDeck } from './3d/Decks';
import { ClaudeSketchUpPrompt } from './ClaudeSketchUpPrompt';
import { DimensionSlider } from './DimensionSlider';
import { GLB_OBJECT_TYPES, GLB_OBJECT_LABELS, INTERIOR_DOOR_STYLES } from '../modelRegistry';
import { describeExteriorLights, describeInterior, describePlanItems } from '../utils/placement';
import { cropToInk } from '../utils/renderInputs';
import { DOOR_KINDS, LEAF_RANGE, doorKind, clampLeaves, changesForKind } from '../utils/doors';
import type { DoorKind } from '../types';
import { MATERIAL_DEF, resolveDeckingKey } from '../utils/materials';

/** The preset colour the decking boards show when no custom colour is set. */
const deckPresetColour = (room: { deckingMaterial?: string; cladding?: string }): string =>
  ((MATERIAL_DEF as any)[resolveDeckingKey(room.deckingMaterial, room.cladding)]?.color as string | undefined) ?? '#a3794a';
import { ObjectTile } from './UI/ObjectTile';
import { KitchenPanel } from './UI/KitchenPanel';
import { TemplatesSection } from './UI/TemplatesSection';

/**
 * Which design step the sidebar is showing. Sections declare the step they
 * belong to and hide themselves outside it, so the twelve-section scroll
 * becomes five short, ordered stages without having to reorder the JSX.
 */
const StepContext = createContext<string | null>(null);

export const BUILDING_STEPS = [
  { id: 'size', label: 'Size' },
  { id: 'cladding', label: 'Finish' },
  { id: 'openings', label: 'Openings' },
  { id: 'extras', label: 'Extras' },
  { id: 'interior', label: 'Interior' },
] as const;

function CollapsibleSection({ title, children, defaultOpen = false, step, openOn }: { title: string, children: React.ReactNode, defaultOpen?: boolean, step?: string, openOn?: string }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  // A section can be told to open by a window event - clicking a boundary
  // run in the scene opens Garden Boundary, so the pick has somewhere to go.
  useEffect(() => {
    if (!openOn) return;
    const open = () => setIsOpen(true);
    window.addEventListener(openOn, open);
    return () => window.removeEventListener(openOn, open);
  }, [openOn]);
  const activeStep = useContext(StepContext);
  // The public configurator has no interior step at all.
  const isPublic = useStore(s => s.configMode === 'public');
  if (isPublic && step === 'interior') return null;
  if (step && activeStep && step !== activeStep) return null;
  return (
    <div className="border-b border-black/5 last:border-0 pb-4 mb-4">
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="w-full flex items-center justify-between text-left py-2 outline-none group"
      >
        <span className="text-[11px] font-bold uppercase text-gray-400 tracking-wider group-hover:text-gray-600 transition-colors">{title}</span>
        {isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
      </button>
      {isOpen && <div className="mt-4 space-y-6">{children}</div>}
    </div>
  );
}


function DeferredInput({ type, value, onChange, className, ...props }: any) {
  const [localValue, setLocalValue] = useState(value);
  
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const commit = () => {
    if (localValue !== value) {
      onChange({ target: { value: localValue } });
    }
  };

  return (
    <input
      type={type}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onPointerUp={type === 'range' ? commit : undefined}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      className={className}
      {...props}
    />
  );
}

export function Sidebar() {
  const store = useStore.getState();
  const toolMode = useStore(s => s.toolMode);
  const selectedFenceId = useStore(s => s.selectedFenceId);
  const selectedPathId = useStore(s => s.selectedPathId);
  const selectedDeckId = useStore(s => s.selectedDeckId);
  const wrap = (fn: any) => (...args: any[]) => { store.saveState(); fn(...args); };
  // Reactive read so the selected wall's card highlights as selection changes.
  const selectedElementId = useStore(s => s.selectedElementId);
  // Free public configurator: exterior only. See configMode in the store.
  const isPublic = useStore(s => s.configMode === 'public');

  const { room, scene, env, viewMode, areDoorsOpen, toggleDoors, newDesign } = useStore(useShallow(s => ({
    room: s.scene.room,
    scene: s.scene,
    env: s.scene.env,
    viewMode: s.viewMode,
    areDoorsOpen: s.areDoorsOpen,
    toggleDoors: s.toggleDoors,
    newDesign: s.newDesign
  })));

  const updateRoom = wrap(store.updateRoom);
  const updateDoor = wrap(store.updateDoor);
  const addWindow = wrap(store.addWindow);
  const updateWindow = wrap(store.updateWindow);
  const removeWindow = wrap(store.removeWindow);
  
  // "New" asks in place rather than through a browser modal - see the button.
  const [confirmNew, setConfirmNew] = useState(false);
  const [tab, setTab] = useState('building');
  const [step, setStep] = useState<string>('size');
  // Picking a run in the scene brings the Extras step (and the Building tab)
  // forward so the boundary panel is on screen.
  useEffect(() => {
    const go = () => { setTab('building'); setStep('extras'); };
    window.addEventListener('boundary-picked', go);
    window.addEventListener('path-picked', go);
    window.addEventListener('deck-picked', go);
    window.addEventListener('deck-outline-picked', go);
    return () => { window.removeEventListener('boundary-picked', go); window.removeEventListener('path-picked', go); window.removeEventListener('deck-picked', go); window.removeEventListener('deck-outline-picked', go); };
  }, []);

  return (
    <div className="flex flex-col h-full bg-transparent text-[#1d1d1f]">
      <div className="p-6 border-b border-black/5 flex items-center gap-4">
        {/* The round back-arrow LINK that lived here sat exactly where users
            expect undo and silently navigated to the app's landing route
            ("undo kicked me to the homepage") - removed. Undo/redo live in
            the pill at the top-left of the canvas. */}
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-[#1d1d1f]">Modulr <span className="font-light">3D</span></h1>
          <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1 font-medium">
            Configurator <span className="normal-case tracking-normal text-gray-300">· build {typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'}</span>
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {room.doors.length > 0 && (
            <button 
              onClick={toggleDoors}
              className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center shadow-sm border border-black/5 text-gray-500 hover:text-gray-800 transition-colors"
              title="Toggle Doors Open/Closed"
            >
              {areDoorsOpen ? <DoorOpen size={16}/> : <DoorClosed size={16}/>}
            </button>
          )}

        </div>
      </div>

      {/*
        New and Save live HERE, in the sidebar, because the pair on the canvas
        only renders in the 3D and walkthrough views - switch to plan or an
        elevation and Save disappears, which is exactly when someone goes
        looking for it. The sidebar is on screen in every view.
      */}
      <div className="px-6 pt-4 flex gap-2">
        {/*
          Inline confirmation, NOT window.confirm.
          The configurator runs inside an iframe in the app, and a browser
          modal raised from there is suppressed in some setups - confirm()
          then returns false, the handler returns early, and the button looks
          dead. That is exactly what "I press New and nothing happens" was.
          Asking in the button itself works in every embedding.
        */}
        {confirmNew ? (
          <div className="flex-1 flex gap-1">
            <button
              onClick={() => { newDesign(); setConfirmNew(false); }}
              className="flex-1 px-2 py-2 rounded-lg bg-[#3b4d4a] text-white text-[11px] font-semibold hover:bg-[#2d3a38] transition-colors"
              title="Discard this design and start again"
            >
              Discard
            </button>
            <button
              onClick={() => setConfirmNew(false)}
              className="px-2 py-2 rounded-lg border border-black/10 text-[11px] font-semibold text-gray-600 hover:bg-black/5 transition-colors"
            >
              Keep
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              // Only ask when there is something to lose.
              const hasWork = scene.objects.length > 0 || room.doors.length > 0 || room.windows.length > 0;
              if (hasWork) setConfirmNew(true); else newDesign();
            }}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-black/10 text-[11px] font-semibold text-gray-600 hover:bg-black/5 hover:text-gray-900 transition-colors"
            title="Clear the canvas and start again"
          >
            <FilePlus size={13} /> New
          </button>
        )}
        <button
          onClick={() => {
            window.parent.postMessage({
              type: 'SAVE_3D_DESIGN',
              scene: useStore.getState().scene,
              price: useStore.getState().calculatePrice(),
              savedAt: Date.now(),
            }, window.location.origin);
          }}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#3b4d4a] text-white text-[11px] font-semibold hover:bg-[#2d3a38] transition-colors"
          title="Save this design to your projects"
        >
          <Save size={13} /> Save Design
        </button>
      </div>

      <div className="p-3 border-b border-black/5 bg-white space-y-2">
        {/* Public: the Building tab only - the exterior is the free product;
            objects, kitchens and interiors are the Business one. */}
        {!isPublic && <div className="flex bg-gray-100 p-1 rounded-lg border border-black/5">
          <button onClick={() => setTab('building')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${tab === 'building' ? 'bg-white shadow-sm text-[#1d1d1f]' : 'text-gray-400 hover:text-gray-600'}`}>Building</button>
          <button onClick={() => setTab('objects')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${tab === 'objects' ? 'bg-white shadow-sm text-[#1d1d1f]' : 'text-gray-400 hover:text-gray-600'}`}>Objects</button>
          {/* Kitchen gets its own tab. It was a section inside Objects, which
              meant scrolling past the sofas to find a worktop, and the units
              were in one place while their colours were in another. */}
          <button onClick={() => setTab('kitchen')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${tab === 'kitchen' ? 'bg-white shadow-sm text-[#1d1d1f]' : 'text-gray-400 hover:text-gray-600'}`}>Kitchen</button>
        </div>}
        {isPublic && (
          <div className="flex items-center justify-between bg-[#3b4d4a]/5 border border-[#3b4d4a]/10 rounded-lg px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#3b4d4a]">Free configurator</span>
            <span className="text-[10px] text-gray-500">Exterior design</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        
        {tab === 'studio' && (
          <div className="space-y-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#3b4d4a]/10 text-[#3b4d4a] text-[10px] font-bold tracking-widest uppercase mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                Modulr Studio
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-[#1d1d1f] mb-2 px-1">AI Visualiser</h2>
              <p className="text-xs text-gray-500 leading-relaxed px-1">
                Generate hyper-realistic CGI images of your current 3D configuration. Choose your style and let our AI engine do the rest.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700 px-1">Environment Style</label>
                <div className="grid grid-cols-2 gap-2">
                  <button className="border-2 border-[#3b4d4a] bg-[#3b4d4a]/5 rounded-xl p-3 text-left transition-all">
                    <span className="block text-sm font-bold text-[#1d1d1f]">Sunny Garden</span>
                    <span className="block text-[10px] text-gray-500 mt-0.5">Bright, clear daylight</span>
                  </button>
                  <button className="border-2 border-transparent bg-white hover:border-black/10 rounded-xl p-3 text-left transition-all shadow-sm">
                    <span className="block text-sm font-bold text-[#1d1d1f]">Dusk</span>
                    <span className="block text-[10px] text-gray-500 mt-0.5">Warm evening glow</span>
                  </button>
                  <button className="border-2 border-transparent bg-white hover:border-black/10 rounded-xl p-3 text-left transition-all shadow-sm">
                    <span className="block text-sm font-bold text-[#1d1d1f]">Overcast</span>
                    <span className="block text-[10px] text-gray-500 mt-0.5">Soft, diffused lighting</span>
                  </button>
                  <button className="border-2 border-transparent bg-white hover:border-black/10 rounded-xl p-3 text-left transition-all shadow-sm">
                    <span className="block text-sm font-bold text-[#1d1d1f]">Forest</span>
                    <span className="block text-[10px] text-gray-500 mt-0.5">Surrounded by trees</span>
                  </button>
                </div>
              </div>
              
              <button className="w-full bg-[#3b4d4a] text-white py-3.5 rounded-xl text-sm font-semibold hover:bg-[#2d3a38] transition-all shadow-md flex items-center justify-center gap-2 group mt-4">
                <Settings2 size={16} className="group-hover:rotate-90 transition-transform duration-500" />
                Generate AI Render
              </button>
            </div>
            
            <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-black/5">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Previous Renders</h3>
              <div className="text-center py-8">
                <Box size={24} className="mx-auto text-gray-300 mb-2" />
                <p className="text-xs text-gray-400">Your generated images will appear here</p>
              </div>
            </div>
            
            <div className="mt-8">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">Developer Tools</h3>
              <ClaudeSketchUpPrompt />
            </div>
          </div>
        )}

        {tab === 'building' && (
          <StepContext.Provider value={step}>
            {/* Step rail. Twelve stacked sections meant scrolling to find
                anything; these are the five stages of actually designing one
                of these buildings, in order. */}
            <div className="sticky top-0 z-10 -mx-6 px-6 pt-1 pb-3 mb-4 bg-[#FAFAF8]/95 backdrop-blur border-b border-black/5">
              <div className="flex gap-1">
                {BUILDING_STEPS.filter(s => !(isPublic && s.id === 'interior')).map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => setStep(s.id)}
                    className={`flex-1 flex flex-col items-center gap-1 py-1.5 rounded-lg transition-colors ${
                      step === s.id ? 'bg-[#3b4d4a] text-white shadow-sm' : 'text-gray-500 hover:bg-black/5'
                    }`}
                  >
                    <span className={`text-[10px] font-bold leading-none ${step === s.id ? 'opacity-70' : 'opacity-40'}`}>{i + 1}</span>
                    <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Templates first: starting from a building close to the one the
                customer wants beats building the same obvious things from an
                empty box every time. */}
            <CollapsibleSection title="My Templates" defaultOpen={false} step="size">
              <TemplatesSection />
            </CollapsibleSection>

            {/* Shape comes FIRST: it is the decision everything else depends
                on. It used to live six sections down inside "Base Model &
                Features", where even the owner could not find the Gable
                option. */}
            <CollapsibleSection title="Roof Shape" defaultOpen={true} step="size">
              <div className="grid grid-cols-2 gap-2">
                {(['Box', 'Gable'] as const).map((shape) => (
                  <div key={shape} onClick={() => {
                    // An L-shaped footprint is a flat roof too: "Flat Roof"
                    // is already active for it, and picking it must not
                    // throw the footprint away.
                    if (room.shape === shape || (shape === 'Box' && room.shape === 'LShape')) return;
                    const baseH = room.baseHeightMm ?? 100;
                    const roofH = room.roofHeightMm ?? 200;
                    if (shape === 'Gable') {
                      // Box stores WALL height; Gable stores total-to-ridge.
                      // Convert so the eaves line stays exactly where the flat
                      // roof's top was, and open with a real 1m pitch instead
                      // of inheriting the 200-300mm fascia - which rendered as
                      // a near-flat pancake that looked broken.
                      const eavesTotal = (room.heightMm ?? 2350) + baseH + roofH;
                      const rise = Math.max(roofH, 1000);
                      // backHeightMm is a flat/pent concept a gable ignores -
                      // but stale values leaked into the PDF ("2010mm at
                      // back"), so it is normalised to the front wall height.
                      updateRoom({ shape: 'Gable', heightMm: eavesTotal + rise, roofHeightMm: rise, backHeightMm: room.heightMm ?? 2350 });
                    } else {
                      const eavesTotal = (room.heightMm ?? 2350) - roofH;
                      updateRoom({ shape: 'Box', heightMm: Math.max(10, eavesTotal - baseH - 200), roofHeightMm: 200 });
                    }
                  }} className={`p-3 rounded-xl text-center cursor-pointer transition-all ${room.shape === shape || (shape === 'Box' && room.shape === 'LShape') ? 'bg-[#3b4d4a] text-white shadow-md' : 'bg-white border border-black/5 text-gray-600 hover:bg-gray-50'}`}>
                    <span className="text-[11px] font-semibold tracking-wide">{shape === 'Box' ? 'Flat Roof' : 'Gable Roof'}</span>
                  </div>
                ))}
              </div>

              {/* Footprint. Back in the picker 22 Sep 2026 (hidden since
                  4ab526b): "once we have L shapes that's pretty much the most
                  popular shapes we have". Flat roof only for now - a gable
                  over an L needs two ridges or a hip, which is its own job,
                  so the button is shown but disabled under a gable. The
                  cutout is taken out of the front-right corner. */}
              <div className="mt-3">
                <label className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-2 block">Footprint</label>
                <div className="grid grid-cols-2 gap-2">
                  {([['rect', 'Rectangle'], ['l', 'L-Shape']] as const).map(([id, label]) => {
                    const active = id === 'l' ? room.shape === 'LShape' : room.shape !== 'LShape';
                    const disabled = id === 'l' && room.shape === 'Gable';
                    return (
                      <div key={id}
                        title={disabled ? 'L-shape is flat roof only for now' : undefined}
                        onClick={() => {
                          if (disabled || active) return;
                          if (id === 'l') updateRoom({ shape: 'LShape', lShapeCutoutWidthMm: room.lShapeCutoutWidthMm ?? 2000, lShapeCutoutDepthMm: room.lShapeCutoutDepthMm ?? 1500 });
                          else updateRoom({ shape: 'Box' });
                        }}
                        className={`p-3 rounded-xl text-center transition-all ${disabled ? 'bg-gray-50 text-gray-300 border border-black/5 cursor-not-allowed' : active ? 'bg-[#3b4d4a] text-white shadow-md cursor-pointer' : 'bg-white border border-black/5 text-gray-600 hover:bg-gray-50 cursor-pointer'}`}>
                        <span className="text-[11px] font-semibold tracking-wide">{label}</span>
                      </div>
                    );
                  })}
                </div>
                {room.shape === 'Gable' && (
                  <p className="text-[10px] text-gray-400 mt-1.5">L-shape is flat roof only for now.</p>
                )}
                {room.shape === 'LShape' && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-600 w-28">Cut-out width</span>
                      <DeferredInput type="number" step={100} value={room.lShapeCutoutWidthMm ?? 2000} onChange={(e) => updateRoom({ lShapeCutoutWidthMm: Math.max(100, Math.min(room.widthMm - 400, parseInt(e.target.value) || 0)) })} className="flex-1 bg-white border border-black/5 shadow-sm rounded-lg py-1.5 px-3 text-xs focus:ring-2 focus:ring-[#3b4d4a] outline-none" />
                      <span className="text-[10px] text-gray-400">mm</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-600 w-28">Cut-out depth</span>
                      <DeferredInput type="number" step={100} value={room.lShapeCutoutDepthMm ?? 1500} onChange={(e) => updateRoom({ lShapeCutoutDepthMm: Math.max(100, Math.min(room.depthMm - 400, parseInt(e.target.value) || 0)) })} className="flex-1 bg-white border border-black/5 shadow-sm rounded-lg py-1.5 px-3 text-xs focus:ring-2 focus:ring-[#3b4d4a] outline-none" />
                      <span className="text-[10px] text-gray-400">mm</span>
                    </div>
                    <p className="text-[10px] text-gray-400">Taken out of the front-right corner. Drag the cut-out's own handles in Plan View.</p>
                  </div>
                )}
              </div>
              {room.shape === 'Gable' && (
                <div className="mt-3">
                  <label className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-2 block">Ridge Direction</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => updateRoom({ gableOrientation: 'front' })} className={`px-3 py-2 text-[10px] font-semibold rounded-lg uppercase transition-colors ${(room.gableOrientation || 'front') === 'front' ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>
                      Apex at Front
                    </button>
                    <button onClick={() => updateRoom({ gableOrientation: 'side' })} className={`px-3 py-2 text-[10px] font-semibold rounded-lg uppercase transition-colors ${room.gableOrientation === 'side' ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>
                      Apex at Sides
                    </button>
                  </div>
                </div>
              )}
              {room.shape === 'Gable' && (
                <div className="mt-3 p-4 bg-white border border-black/5 rounded-xl shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-700">Apex Glazing</span>
                    <button onClick={() => updateRoom({ hasApexGlazing: !room.hasApexGlazing })} className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ${room.hasApexGlazing ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-gray-300/60'}`}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-all duration-300 shadow-md ${room.hasApexGlazing ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
                    </button>
                  </div>
                  {room.hasApexGlazing && (
                    <div className="flex gap-2">
                      <button onClick={() => updateRoom({ apexGlazingStyle: 'framed' })} className={`flex-1 px-3 py-1.5 text-[10px] font-semibold rounded-lg uppercase transition-colors ${(room.apexGlazingStyle || 'framed') === 'framed' ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>
                        Framed
                      </button>
                      <button onClick={() => updateRoom({ apexGlazingStyle: 'plain' })} className={`flex-1 px-3 py-1.5 text-[10px] font-semibold rounded-lg uppercase transition-colors ${room.apexGlazingStyle === 'plain' ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>
                        Plain Glass
                      </button>
                    </div>
                  )}

                  {/* Ceiling. A gable is vaulted by default - you see the
                      pitch from inside - but plenty of builds board a flat
                      ceiling in and use the void above for insulation and
                      services. Heights are internal, floor to ceiling, which
                      is the number a customer will quote at you; heightMm is
                      the whole building, ground to ridge, so the two are not
                      interchangeable. */}
                  {(() => {
                    const baseH = room.baseHeightMm ?? 100;
                    const roofH = room.roofHeightMm ?? 200;
                    // Internal wall head, from the finished floor.
                    const wallHead = Math.round((room.heightMm ?? 2350) - baseH - roofH + 15);
                    // The real limit, from the same maths the geometry uses -
                    // so the slider cannot offer a height it would then clamp.
                    const maxC = Math.max(1800, gableCeilingMaxMm(room));
                    const value = Math.round(Math.min(maxC, Math.max(1800, room.gableCeilingHeightMm ?? wallHead)));
                    return (
                      <>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs font-medium text-gray-700">Flat Ceiling</span>
                          <button
                            onClick={() => updateRoom({
                              gableFlatCeiling: !room.gableFlatCeiling,
                              // Start at the wall head - a plain flat ceiling -
                              // rather than at some height the room may not have.
                              gableCeilingHeightMm: room.gableCeilingHeightMm ?? wallHead,
                            })}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ${room.gableFlatCeiling ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-gray-300/60'}`}
                          >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-all duration-300 shadow-md ${room.gableFlatCeiling ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
                          </button>
                        </div>
                        {!room.gableFlatCeiling && (
                          <p className="text-[10px] text-gray-400 leading-snug">Vaulted &mdash; the ceiling follows the roof pitch up to the ridge.</p>
                        )}
                        {room.gableFlatCeiling && (
                          <>
                            <div className="flex items-center gap-3">
                              <input
                                type="range"
                                min={1800} max={maxC} step={10}
                                value={value}
                                onChange={e => updateRoom({ gableCeilingHeightMm: Number(e.target.value) })}
                                className="w-full apple-slider"
                              />
                              <div className="flex items-center gap-1 shrink-0">
                                <input
                                  type="number"
                                  min={1800} max={maxC}
                                  value={value}
                                  onChange={e => updateRoom({ gableCeilingHeightMm: Math.max(1800, Math.min(maxC, Number(e.target.value))) })}
                                  onKeyDown={e => e.stopPropagation()}
                                  className="w-[68px] bg-gray-50 border border-black/5 rounded-lg px-2 py-1 text-xs font-semibold text-[#3b4d4a] outline-none focus:ring-2 focus:ring-[#3b4d4a]"
                                />
                                <span className="text-[10px] text-gray-400">mm</span>
                              </div>
                            </div>
                            <p className="text-[10px] text-gray-400 leading-snug">
                              Internal height, floor to ceiling. At {wallHead}mm it is flat wall to wall; raise it and the pitch stays on show at the eaves. The most this roof allows is {maxC}mm.
                            </p>
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between p-4 bg-white border border-black/5 rounded-xl shadow-sm">
                <span className="text-xs font-medium text-gray-700">Guttering & Downpipe</span>
                <button onClick={() => updateRoom({ hasGuttering: !room.hasGuttering })} className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ${room.hasGuttering ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-gray-300/60'}`}>
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-all duration-300 shadow-md ${room.hasGuttering ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
                </button>
              </div>
            </CollapsibleSection>

            {/* Live permitted-development traffic light. Pure client-side
                maths, MIRRORING pdVerdict in server.js (keep in sync):
                green <= 2.5m total; amber within Class E limits but needs 2m+
                boundary siting; red exceeds the PD envelope. Updates as the
                user resizes, so planning becomes a design constraint they can
                feel - drag the ridge past 4m and watch it go red. */}
            {(() => {
              const isG = room.shape === 'Gable';
              const baseH = room.baseHeightMm ?? 100;
              const roofH = room.roofHeightMm ?? 200;
              const frontTotal = (room.heightMm ?? 2350) + (isG ? 0 : baseH + roofH);
              const backTotal = isG ? frontTotal : (room.backHeightMm ?? room.heightMm ?? 2350) + baseH + roofH;
              const total = Math.max(frontTotal, backTotal);
              const eaves = isG ? (room.heightMm ?? 2350) - roofH : total;
              const light = total <= 2500
                ? { key: 'green', bg: 'bg-emerald-600', label: 'Likely Permitted Development', sub: 'Under 2.5m - no boundary set-off (still behind the house)' }
                : (isG ? (eaves <= 2500 && total <= 4000) : total <= 3000)
                  ? { key: 'amber', bg: 'bg-amber-500', label: 'PD with conditions', sub: 'Only if sited 2m+ from every boundary - get advice' }
                  : { key: 'red', bg: 'bg-red-600', label: 'Permission likely required', sub: isG ? 'Lower the ridge to 4000mm to fit PD, or apply' : 'Lower the height to 3000mm to fit PD, or apply' };
              return (
                <div className={`${light.bg} text-white rounded-xl px-3 py-2.5 flex items-center gap-2.5`}>
                  <span className="flex gap-1 shrink-0">
                    {(['green', 'amber', 'red'] as const).map(k => (
                      <span key={k} className={`w-2 h-2 rounded-full ${k === light.key ? 'bg-white' : 'bg-white/30'}`} />
                    ))}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold leading-tight">{light.label}</span>
                    <span className="block text-[9px] opacity-85 leading-tight">{light.sub}</span>
                  </span>
                </div>
              );
            })()}

            <CollapsibleSection title="Dimensions" defaultOpen={true} step="size">
              <div className="space-y-3">
                {/* A gable is specced the way surveyors and planners spec it:
                    EAVES height and RIDGE height, both as totals from the
                    ground. Internally heightMm stays "total to ridge" and
                    roofHeightMm the rise - these two fields are just the
                    honest projection of that model. Flat roofs keep the
                    original front/back/fascia fields. */}
                {(room.shape === 'Gable' ? [
                  { label: 'Total Width', key: 'widthMm', hidden: viewMode !== 'plan' },
                  { label: 'Total Depth', key: 'depthMm', hidden: viewMode !== 'plan' },
                  { label: 'Eaves Height', key: '__eavesMm' },
                  { label: 'Ridge Height', key: '__ridgeMm' },
                  { label: 'Fascia Depth', key: 'gableFasciaMm' },
                  { label: 'Base Height', key: 'baseHeightMm' },
                  { label: 'Wall Thickness', key: 'wallThicknessMm' },
                ] : [
                  { label: 'Total Width', key: 'widthMm', hidden: viewMode !== 'plan' },
                  { label: 'Total Depth', key: 'depthMm', hidden: viewMode !== 'plan' },
                  { label: 'Total Front Height', key: 'heightMm' },
                  { label: 'Total Back Height', key: 'backHeightMm' },
                  { label: 'Base Height', key: 'baseHeightMm' },
                  { label: 'Fascia Height', key: 'roofHeightMm' },
                  { label: 'Wall Thickness', key: 'wallThicknessMm' },
                ]).filter(d => !d.hidden).map(dim => {
                  const baseH = room.baseHeightMm ?? 100;
                  const roofH = room.roofHeightMm ?? 200;
                  // For Gable, heightMm is ALREADY the total height (the 3D
                  // maths subtracts base+roof from it) — adding base+roof here
                  // showed a total 450mm taller than the 3D label for the same
                  // building. Box stores wall height, so it still converts.
                  const heightIsTotal = room.shape === 'Gable';
                  const ridgeTotal = room.heightMm ?? 2350;
                  let val = room[dim.key as keyof typeof room] as number;
                  if (dim.key === 'heightMm') val = (room.heightMm ?? 2350) + (heightIsTotal ? 0 : baseH + roofH);
                  if (dim.key === 'backHeightMm') val = (room.backHeightMm ?? room.heightMm ?? 2350) + (heightIsTotal ? 0 : baseH + roofH);
                  if (dim.key === 'wallThicknessMm') val = room.wallThicknessMm || 150;
                  if (dim.key === '__ridgeMm') val = ridgeTotal;
                  if (dim.key === '__eavesMm') val = ridgeTotal - roofH;
                  if (dim.key === 'gableFasciaMm') val = room.gableFasciaMm ?? 100;

                  return (
                    <div key={dim.key} className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-600 w-28">{dim.label}</span>
                      <DeferredInput type="number"
                        value={val}
                        onChange={(e) => {
                          let newVal = parseInt(e.target.value) || 0;
                          if (dim.key === '__ridgeMm') {
                            // Ridge moves, eaves stay put: the rise absorbs it.
                            const eaves = ridgeTotal - roofH;
                            const ridge = Math.max(eaves + 100, newVal);
                            updateRoom({ heightMm: ridge, roofHeightMm: ridge - eaves });
                            return;
                          }
                          if (dim.key === '__eavesMm') {
                            // Eaves move, ridge stays put: the rise absorbs it.
                            const eaves = Math.min(ridgeTotal - 100, Math.max(1000, newVal));
                            updateRoom({ roofHeightMm: ridgeTotal - eaves });
                            return;
                          }
                          if ((dim.key === 'heightMm' || dim.key === 'backHeightMm') && !heightIsTotal) {
                            newVal = newVal - baseH - roofH;
                          }
                          if (dim.key === 'heightMm' || dim.key === 'backHeightMm') {
                            newVal = Math.max(10, newVal);
                          }
                          updateRoom({ [dim.key]: newVal });
                        }}
                        className="flex-1 bg-white border border-black/5 shadow-sm rounded-lg py-1.5 px-3 text-xs focus:ring-2 focus:ring-[#3b4d4a] focus:border-[#3b4d4a] outline-none transition-shadow" />
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Cladding" defaultOpen={true} step="cladding">
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-medium text-gray-500 mb-2 block">Wall Cladding Orientation</label>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                     <div onClick={() => updateRoom({ claddingOrientation: 'horizontal' })} className={`p-2 rounded-xl text-center cursor-pointer transition-colors ${room.claddingOrientation !== 'vertical' ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white border border-black/5 text-gray-600 hover:bg-gray-50'}`}>
                      <span className="text-[10px] font-semibold uppercase">Horizontal</span>
                    </div>
                    {/* Lap siding only comes horizontal: Vertical is locked
                        while any elevation wears it (22 Sep 2026). */}
                    {(() => {
                      const sidingOn = ['cladding', 'claddingFront', 'claddingBack', 'claddingLeft', 'claddingRight', 'claddingGable']
                        .some(k => (MATERIAL_DEF as any)[(room as any)[k]]?.horizontalOnly);
                      return (
                        <div
                          title={sidingOn ? 'Timber siding is horizontal only' : undefined}
                          onClick={() => { if (!sidingOn) updateRoom({ claddingOrientation: 'vertical' }); }}
                          className={`p-2 rounded-xl text-center transition-colors ${sidingOn ? 'bg-gray-50 text-gray-300 border border-black/5 cursor-not-allowed' : room.claddingOrientation === 'vertical' ? 'bg-[#3b4d4a] text-white shadow-sm cursor-pointer' : 'bg-white border border-black/5 text-gray-600 hover:bg-gray-50 cursor-pointer'}`}>
                          <span className="text-[10px] font-semibold uppercase">Vertical</span>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="mb-6">
<DimensionSlider label="Board Width" min={50} max={300} step={5} value={room.claddingWidthMm ?? 100} onChange={(v) => updateRoom({ claddingWidthMm: v })} />
                  </div>

                  <div className="space-y-4">
                    {[
                      { key: 'cladding', label: 'Primary Material' },
                      { key: 'claddingFront', label: 'Front Override' },
                      { key: 'claddingBack', label: 'Back Override' },
                      { key: 'claddingLeft', label: 'Left Override' },
                      { key: 'claddingRight', label: 'Right Override' },
   { key: 'claddingGable', label: 'Gable Override' },
                    ].map((field) => (
                      <div key={field.key} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-medium text-gray-500">{field.label}</label>
                          {field.key !== 'cladding' && (room as any)[field.key] && (
                             <button onClick={() => updateRoom({ [field.key]: undefined })} className="text-[9px] uppercase tracking-wider text-red-500 hover:text-red-700">Clear</button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[
                            // Each swatch is the material's own texture, tinted
                            // with its colour the way the wall is - so the
                            // picker shows what it is about to apply.
                            { id: 'cedar_composite', name: 'Cedar Composite' },
                            { id: 'oak_composite', name: 'Oak Composite' },
                            { id: 'light_oak_composite', name: 'Light Oak' },
                            { id: 'black_composite', name: 'Black' },
                            { id: 'dark_grey_composite', name: 'Dark Grey' },
                            { id: 'light_grey_composite', name: 'Light Grey' },
                            { id: 'white_composite', name: 'White' },
                            { id: 'slate_blue_composite', name: 'Slate Blue' },
                            { id: 'sage_composite', name: 'Sage Green' },
                            { id: 'clay_composite', name: 'Clay' },
                            { id: 'corrugated_iron', name: 'Corrugated Steel' },
                            { id: 'corrugated_black', name: 'Corrugated Black' },
                            { id: 'corrugated_dark_grey', name: 'Corrugated Dark Grey' },
                            { id: 'box_metal_black', name: 'Box Metal Black' },
                            { id: 'box_metal_anthracite', name: 'Box Metal Anthracite' },
                            { id: 'cedar_plank', name: 'Japanese Cedar Plank' },
                            { id: 'painted_planks', name: 'Painted Boards (any colour)' },
                            { id: 'wood_siding', name: 'Timber Siding (horizontal, any colour)' },
                          ].map((cladding) => {
                            const isActive = field.key === 'cladding'
                               ? room.cladding === cladding.id
                               : (room as any)[field.key] === cladding.id;
                            const def: any = (MATERIAL_DEF as any)[cladding.id];
                            const img = `textures/${def.prefix}${def.neutral ? '_neutral' : ''}_color.jpg`;
                            const tint = def.tintable ? (room.claddingTint || def.color) : def.color;
                            return (
                              <div
                                key={cladding.id}
                                onClick={() => updateRoom({ [field.key]: cladding.id, ...(def.horizontalOnly ? { claddingOrientation: 'horizontal' } : {}) })}
                                className={`w-7 h-7 rounded-md cursor-pointer transition-all overflow-hidden ${isActive ? 'ring-2 ring-[#3b4d4a] ring-offset-1 shadow-sm scale-110' : 'ring-1 ring-black/10 hover:scale-105'}`}
                                title={cladding.name}
                                style={{ backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: tint, backgroundBlendMode: 'multiply' }}
                              />
                            );
                          })}
                        </div>
                        {/* Tintable claddings (painted boards, timber siding) take
                            any colour: the paint is the room's claddingTint,
                            shared by every face using one. */}
                        {(MATERIAL_DEF as any)[(field.key === 'cladding' ? room.cladding : (room as any)[field.key]) as string]?.tintable && (
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-[10px] font-medium text-gray-500">Paint</span>
                            <input type="color" value={room.claddingTint || '#e8e6e1'} onChange={(e) => updateRoom({ claddingTint: e.target.value })} className="w-7 h-7 rounded-md cursor-pointer border-0 shadow-sm overflow-hidden" title="Paint colour" />
                            {['#e8e6e1', '#1f2123', '#4a5057', '#7e8c74', '#7c93a6', '#9a6b58', '#2f3f4a', '#b7a98a'].map(hex => (
                              <button key={hex} title={hex} onClick={() => updateRoom({ claddingTint: hex })} style={{ background: hex }}
                                className={`w-5 h-5 rounded-full border transition-all ${(room.claddingTint || '#e8e6e1').toLowerCase() === hex ? 'ring-2 ring-[#3b4d4a] ring-offset-1 border-black/20' : 'border-black/15 hover:scale-110'}`} />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Doors" defaultOpen={true} step="openings">
              <button onClick={wrap(store.addDoor)} className="w-full mb-4 bg-white border border-[#3b4d4a] text-[#3b4d4a] py-2 px-4 rounded-lg text-xs font-semibold hover:bg-[#3b4d4a] hover:text-white transition-all flex items-center justify-center shadow-sm">+ Add Door</button>
              <div className="space-y-4">
                {(room.doors || []).map((door, idx) => (
                  <div key={door.id} className="p-4 bg-white border border-black/5 rounded-xl shadow-sm space-y-4 relative group">
                    <button onClick={() => wrap(store.removeDoor)(door.id)} className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                    <div className="text-xs font-bold text-gray-800 mb-2">Door {idx + 1}</div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-medium text-gray-700">Wall</span>
                      <select className="bg-gray-50 border border-black/5 rounded-lg px-2 py-1 outline-none text-[#3b4d4a] font-semibold focus:ring-2 focus:ring-[#3b4d4a]" value={door.wall} onChange={e => wrap(store.updateDoor)(door.id, { wall: e.target.value as any })}>
                        <option value="front">Front</option>
                        <option value="back">Back</option>
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                        {/* The divider between room and outdoor section,
                            once there is one. A door already set there
                            keeps its option if the section is turned off,
                            so it can be moved rather than lost. */}
                        {(room.bay || door.wall === 'bay') && <option value="bay">{room.bay ? 'Divider' : 'Divider (section off)'}</option>}
                      </select>
                    </div>
                    {/* The product: single, French, bi-fold or sliding. Each
                        is made in its own leaf counts and opens its own way
                        (Open Doors animates it) - see utils/doors. */}
                    {(() => {
                      const kind = doorKind(door);
                      const [lo, hi] = LEAF_RANGE[kind];
                      const counts = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
                      return (
                        <>
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-medium text-gray-700">Type</span>
                            <select className="bg-gray-50 border border-black/5 rounded-lg px-2 py-1 outline-none text-[#3b4d4a] font-semibold focus:ring-2 focus:ring-[#3b4d4a]" value={kind} onChange={e => wrap(store.updateDoor)(door.id, changesForKind(door, e.target.value as DoorKind))}>
                              {DOOR_KINDS.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                            </select>
                          </div>
                          {counts.length > 1 && (
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-medium text-gray-700">{kind === 'sliding' ? 'Panes' : 'Leaves'}</span>
                              <select className="bg-gray-50 border border-black/5 rounded-lg px-2 py-1 outline-none text-[#3b4d4a] font-semibold focus:ring-2 focus:ring-[#3b4d4a]" value={clampLeaves(kind, door.leaves)} onChange={e => wrap(store.updateDoor)(door.id, { leaves: parseInt(e.target.value) })}>
                                {counts.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                          )}
                          {kind !== 'sliding' && (
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-medium text-gray-700">Opens</span>
                              <div className="flex gap-1">
                                {([[1, 'Out'], [-1, 'In']] as const).map(([v, label]) => (
                                  <button key={v} onClick={() => wrap(store.updateDoor)(door.id, { swing: v })} className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-md transition-colors ${(door.swing ?? 1) === v ? 'bg-[#3b4d4a] text-white' : 'bg-black/5 hover:bg-black/10 text-[#3b4d4a]'}`}>{label}</button>
                                ))}
                              </div>
                            </div>
                          )}
                          {kind === 'hinged' && (
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-medium text-gray-700" title="Viewed from outside">Hinges</span>
                              <div className="flex gap-1">
                                {(['left', 'right'] as const).map(v => (
                                  <button key={v} onClick={() => wrap(store.updateDoor)(door.id, { hinge: v })} className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-md transition-colors ${(door.hinge ?? 'left') === v ? 'bg-[#3b4d4a] text-white' : 'bg-black/5 hover:bg-black/10 text-[#3b4d4a]'}`}>{v}</button>
                                ))}
                              </div>
                            </div>
                          )}
                          {(kind === 'bifold' || kind === 'sliding') && (
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-medium text-gray-700" title="Viewed from outside">{kind === 'bifold' ? 'Folds to' : 'Slides to'}</span>
                              <div className="flex gap-1">
                                {(['left', 'right', 'split'] as const).filter(v => v !== 'split' || door.leaves >= 3).map(v => (
                                  <button key={v} onClick={() => wrap(store.updateDoor)(door.id, { stack: v })} className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-md transition-colors ${(door.stack ?? 'left') === v ? 'bg-[#3b4d4a] text-white' : 'bg-black/5 hover:bg-black/10 text-[#3b4d4a]'}`}>{v === 'split' ? 'Both' : v}</button>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-medium text-gray-700">Style</span>
                      <select className="bg-gray-50 border border-black/5 rounded-lg px-2 py-1 outline-none text-[#3b4d4a] font-semibold focus:ring-2 focus:ring-[#3b4d4a]" value={door.style || 'standard'} onChange={e => wrap(store.updateDoor)(door.id, { style: e.target.value as any })}>
                        <option value="standard">Standard</option>
                        <option value="crittall">Crittall</option>
                        <option value="solid">Solid (Entrance)</option>
                      </select>
                    </div>
<DimensionSlider label="Width" min={800} max={6000} step={100} value={door.widthMm} onChange={(v) => wrap(store.updateDoor)(door.id, { widthMm: v })} />
<DimensionSlider label="Height" min={1800} max={2500} step={50} value={door.heightMm} onChange={(v) => wrap(store.updateDoor)(door.id, { heightMm: v })} />
<DimensionSlider label="Offset (Pos)" min={-3000} max={3000} step={100} value={door.offsetMm} onChange={(v) => wrap(store.updateDoor)(door.id, { offsetMm: v })} />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between p-4 bg-white border border-black/5 rounded-xl shadow-sm">
                <span className="text-xs font-medium text-gray-700">Door Handles</span>
                <button onClick={() => updateRoom({ hasDoorHandles: !room.hasDoorHandles })} className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ${room.hasDoorHandles ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-gray-300/60'}`}>
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-all duration-300 shadow-md ${room.hasDoorHandles ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between p-4 bg-white border border-black/5 rounded-xl shadow-sm">
                <span className="text-xs font-medium text-gray-700">Entrance Steps</span>
                <button onClick={() => updateRoom({ hasDoorSteps: !room.hasDoorSteps })} className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ${room.hasDoorSteps ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-gray-300/60'}`}>
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-all duration-300 shadow-md ${room.hasDoorSteps ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
                </button>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Windows" defaultOpen={true} step="openings">
              <div className="flex justify-end mb-4">
                <button onClick={addWindow} className="text-[10px] font-semibold text-[#3b4d4a] hover:text-blue-600 transition-colors">+ Add New</button>
              </div>
              <div className="space-y-3">
                {room.windows.map((win, i) => (
                  <div key={win.id} className="p-4 bg-white border border-black/5 rounded-xl shadow-sm space-y-4 relative group">
                    <div className="flex justify-between items-center text-xs mb-2">
                      <span className="font-semibold text-gray-800">Window {i + 1}</span>
                      <button onClick={() => removeWindow(win.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-medium text-gray-700">Wall</span>
                      <select className="bg-gray-50 border border-black/5 rounded-lg px-2 py-1 outline-none text-[#3b4d4a] font-semibold focus:ring-2 focus:ring-[#3b4d4a]" value={win.wall} onChange={e => updateWindow(win.id, { wall: e.target.value as any })}>
                        <option value="front">Front</option>
                        <option value="back">Back</option>
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                        {/* The divider between room and outdoor section - a
                            wall like the others while the section is on. */}
                        {(room.bay || win.wall === 'bay') && <option value="bay">{room.bay ? 'Divider' : 'Divider (section off)'}</option>}
                      </select>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-medium text-gray-700">Leaves (Panes)</span>
                      <select className="bg-gray-50 border border-black/5 rounded-lg px-2 py-1 outline-none text-[#3b4d4a] font-semibold focus:ring-2 focus:ring-[#3b4d4a]" value={win.leaves || 1} onChange={e => updateWindow(win.id, { leaves: parseInt(e.target.value) })}>
                        {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} Pane(s)</option>)}
                      </select>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-medium text-gray-700">Style</span>
                      <select className="bg-gray-50 border border-black/5 rounded-lg px-2 py-1 outline-none text-[#3b4d4a] font-semibold focus:ring-2 focus:ring-[#3b4d4a]" value={win.style || 'standard'} onChange={e => updateWindow(win.id, { style: e.target.value as any })}>
                        <option value="standard">Standard</option>
                        <option value="crittall">Crittall</option>
                      </select>
                    </div>
<DimensionSlider label="Width" min={400} max={6000} step={100} value={win.widthMm} onChange={(v) => updateWindow(win.id, { widthMm: v })} />
                    <div>
                      <div className="flex justify-between items-center text-xs mb-2">
                        <span className="font-medium text-gray-700">Full Height</span>
                        <button onClick={() => updateWindow(win.id, { fullHeight: !win.fullHeight, sillMm: 0, heightMm: 2100 })} className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ${win.fullHeight ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-gray-300/60'}`}>
                          <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-all duration-300 shadow-md ${win.fullHeight ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
                        </button>
                      </div>
                    </div>
                    {!win.fullHeight && (
                      <>
<DimensionSlider label="Height" min={400} max={2500} step={100} value={win.heightMm} onChange={(v) => updateWindow(win.id, { heightMm: v })} />
<DimensionSlider label="Sill Height" min={0} max={2000} step={100} value={win.sillMm} onChange={(v) => updateWindow(win.id, { sillMm: v })} />
                      </>
                    )}
<DimensionSlider label="Offset Position" min={-3000} max={3000} step={100} value={win.offsetMm} onChange={(v) => updateWindow(win.id, { offsetMm: v })} />
                  </div>
                ))}
                {room.windows.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No windows</p>}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Colours & Materials" defaultOpen={true} step="cladding">
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-2 block">Frame Material</label>
                <div className="flex gap-2 mb-3">
                  {([['upvc', 'uPVC'], ['aluminium', 'Aluminium'], ['timber', 'Timber']] as const).map(([id, name]) => (
                    <button key={id} onClick={() => updateRoom({ frameMaterial: id })} className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg transition-colors ${(room.frameMaterial ?? 'aluminium') === id ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>
                      {name}
                    </button>
                  ))}
                </div>
                <label className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-2 block">Door/Window Frames</label>
                <div className="flex gap-2">
                  {['white', 'anthracite', 'black'].map(col => (
                    <button key={col} onClick={() => updateRoom({ frameColor: col as any })} className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg capitalize transition-colors ${room.frameColor === col ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>
                      {col}
                    </button>
                  ))}
                </div>
              </div>

              {/* Inside face of the frames. Dual-colour - black out, white in -
                  is a normal spec; 'Match' is the single-colour default. */}
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-2 block">Frames Inside</label>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => updateRoom({ frameColorInner: undefined })} className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg transition-colors ${room.frameColorInner === undefined ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>
                    Match
                  </button>
                  {['white', 'anthracite', 'black'].map(col => (
                    <button key={col} onClick={() => updateRoom({ frameColorInner: col as any })} className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg capitalize transition-colors ${room.frameColorInner === col ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>
                      {col}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-2 block">Frame Style</label>
                <div className="flex gap-2">
                  <button onClick={() => updateRoom({ frameStyle: 'default' })} className={`px-3 py-1.5 text-[10px] font-semibold rounded-lg uppercase transition-colors ${!room.frameStyle || room.frameStyle === 'default' ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>
                    Default
                  </button>
                  <button onClick={() => updateRoom({ frameStyle: 'slim' })} className={`px-3 py-1.5 text-[10px] font-semibold rounded-lg uppercase transition-colors ${room.frameStyle === 'slim' ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>
                    Slim
                  </button>
                  <button onClick={() => updateRoom({ frameStyle: 'ultra-slim' })} className={`px-3 py-1.5 text-[10px] font-semibold rounded-lg uppercase transition-colors ${room.frameStyle === 'ultra-slim' ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>
                    Ultra Slim
                  </button>
                </div>
              </div>

              
                <div>
                  {/* Roof colour is separate from fascia so the two can differ.
                      It previously followed the roof material with no way to
                      change it independently. */}
                  <label className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-2 block mt-6">Roof Colour</label>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { id: '', name: 'Match Material' },
                      { id: '#1a1a1a', name: 'Black' },
                      { id: '#2d3032', name: 'Anthracite' },
                      { id: '#6a6d70', name: 'Grey' },
                      { id: '#d3d5d7', name: 'Light Grey' },
                    ].map(col => {
                      const isActive = ((room as any).roofColor || '') === col.id;
                      return (
                        <button
                          key={col.id || 'auto'}
                          onClick={() => updateRoom({ roofColor: (col.id || undefined) } as any)}
                          className={`px-3 py-1.5 rounded-xl text-[10px] font-semibold uppercase transition-colors ${isActive ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}
                        >
                          {col.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-2 block mt-6">Fascia Finish</label>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { id: 'match_cladding', name: 'Match Cladding' },
                      { id: 'black', name: 'Black' },
                      { id: 'anthracite', name: 'Anthracite' },
                      { id: 'grey', name: 'Grey' },
                      { id: 'white', name: 'White' },
                    ].map(col => {
                      const isActive = (room.fasciaMaterial || 'anthracite') === col.id;
                      return (
                        <button 
                          key={col.id} 
                          onClick={() => updateRoom({ fasciaMaterial: col.id as any })}
                          className={`px-3 py-1.5 rounded-xl text-[10px] font-semibold uppercase transition-colors ${isActive ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}
                        >
                          {col.name}
                        </button>
                      );
                    })}
                  </div>
                </div>


              <div>
                <label className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-2 block">Roof Material</label>
                <div className="flex gap-2 flex-wrap">
                  {/* Tiles and slates are pitched-roof coverings, so they only
                      appear under a gable; the corrugated sheets suit either. */}
                  {([
                    ['epdm', 'EPDM'], ['rubber', 'Rubber'], ['aluminium', 'Aluminium'], ['sedum', 'Sedum'],
                    ...(room.shape === 'Gable' ? [['roof_clay_tiles', 'Clay Tiles'], ['roof_slate_round', 'Round Slate'], ['roof_slate', 'Slate']] as const : []),
                    ['roof_corrugated_dark', 'Corrugated'], ['roof_corrugated_black', 'Corrugated Black'], ['roof_corrugated_dark_grey', 'Corrugated Grey'],
                  ] as ReadonlyArray<readonly [string, string]>).map(([col, name]) => (
                    <button key={col} onClick={() => updateRoom({ roofMaterial: col as any })} className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg transition-colors ${room.roofMaterial === col ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>



              <div className="space-y-4 mt-4">
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-2 block">Base / Decking</label>
                  {/* Every deck is the same painted-board set (22 Sep 2026); these
                      are its preset colours. Picking one clears any custom
                      colour so the preset shows as itself. */}
                  <div className="flex gap-2 flex-wrap">
                    {['concrete', 'timber', 'composite_cedar', 'composite_oak', 'composite_black', 'composite_dark_grey', 'composite_grey', 'composite_brown'].map(col => {
                      const isActive = col === 'concrete' ? room.baseMaterial === 'concrete' : (room.deckingMaterial || room.cladding || 'timber') === col && room.baseMaterial !== 'concrete' && !room.deckingTint;
                      return (
                        <button
                          key={col}
                          onClick={() => {
                            if (col === 'concrete') {
                              updateRoom({ baseMaterial: 'concrete' });
                            } else {
                              updateRoom({
                                baseMaterial: col === 'timber' ? 'timber_decking' : 'composite_decking',
                                deckingMaterial: col as any,
                                deckingTint: undefined,
                              });
                            }
                          }}
                          className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg uppercase transition-colors ${isActive ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>
                          {col === 'concrete' ? 'Concrete' : col === 'timber' ? 'Timber' : col.replace('composite_', '').replace('_', ' ')}
                        </button>
                      );
                    })}
                  </div>
                  {room.baseMaterial !== 'concrete' && (
                    <div className="flex items-center gap-2 mt-2">
                      <input type="color" value={room.deckingTint || deckPresetColour(room)} onChange={(e) => updateRoom({ deckingTint: e.target.value })} className="w-7 h-7 rounded-md cursor-pointer border-0 shadow-sm overflow-hidden" title="Board colour" />
                      <span className="text-[10px] text-gray-500">Board colour{room.deckingTint ? '' : ' (preset)'}</span>
                      {room.deckingTint && (
                        <button onClick={() => updateRoom({ deckingTint: undefined })} className="ml-auto text-[10px] font-semibold text-gray-400 hover:text-[#3b4d4a]">Reset</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Base Model & Features" defaultOpen={true} step="extras">

              <div className="space-y-3">
                {[
                  { label: 'Has Canopy', key: 'hasCanopy' as const },
                  { label: 'Picture Frame Front', key: 'hasPictureFrame' as const },
                  { label: 'Has Decking', key: 'hasDecking' as const },
                  { label: 'Show Dimensions', key: 'showDimensions' as const },
                ].map(({label, key}) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-700">{label}</span>
                    <button 
                      onClick={() => {
                        const newValue = !room[key];
                        if (key === 'hasDecking') {
                          if (newValue) {
                            const matName = room.deckingMaterial || room.cladding || 'timber';
                            const baseMat = matName === 'timber' ? 'timber_decking' : 'composite_decking';
                            updateRoom({
                              hasDecking: true,
                              baseMaterial: baseMat,
                              deckingMaterial: matName as any
                            });
                          } else {
                            updateRoom({
                              hasDecking: false,
                              baseMaterial: room.hasPictureFrame ? room.baseMaterial : 'concrete'
                            });
                          }
                        } else if (key === 'hasPictureFrame') {
                          if (newValue) {
                            const matName = room.deckingMaterial || room.cladding || 'timber';
                            const baseMat = matName === 'timber' ? 'timber_decking' : 'composite_decking';
                            updateRoom({
                              hasPictureFrame: true,
                              baseMaterial: baseMat,
                              deckingMaterial: matName as any
                            });
                          } else {
                            updateRoom({
                              hasPictureFrame: false,
                              baseMaterial: room.hasDecking ? room.baseMaterial : 'concrete'
                            });
                          }
                        } else {
                          updateRoom({ [key]: newValue });
                        }
                      }}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ${room[key] ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-gray-300/60'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-all duration-300 shadow-md ${room[key] ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Overhangs & Canopy" step="extras" openOn="deck-outline-picked">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] font-medium text-gray-500 mb-1 block">Front (Canopy)</span>
                  <DeferredInput type="number" 
                    value={room.canopySizeMm ?? 0} 
                    onChange={(e) => updateRoom({ canopySizeMm: Math.max(0, parseInt(e.target.value) || 0) })} 
                    className="w-full bg-white border border-black/5 shadow-sm rounded-lg py-1.5 px-3 text-xs focus:ring-2 focus:ring-[#3b4d4a] outline-none" />
                </div>
                <div>
                  <span className="text-[10px] font-medium text-gray-500 mb-1 block">Back</span>
                  <DeferredInput type="number" 
                    value={room.overhangBackMm ?? 0} 
                    onChange={(e) => updateRoom({ overhangBackMm: Math.max(0, parseInt(e.target.value) || 0) })} 
                    className="w-full bg-white border border-black/5 shadow-sm rounded-lg py-1.5 px-3 text-xs focus:ring-2 focus:ring-[#3b4d4a] outline-none" />
                </div>
                <div>
                  <span className="text-[10px] font-medium text-gray-500 mb-1 block">Left</span>
                  <DeferredInput type="number" 
                    value={room.overhangLeftMm ?? 0} 
                    onChange={(e) => updateRoom({ overhangLeftMm: Math.max(0, parseInt(e.target.value) || 0) })} 
                    className="w-full bg-white border border-black/5 shadow-sm rounded-lg py-1.5 px-3 text-xs focus:ring-2 focus:ring-[#3b4d4a] outline-none" />
                </div>
                <div>
                  <span className="text-[10px] font-medium text-gray-500 mb-1 block">Right</span>
                  <DeferredInput type="number" 
                    value={room.overhangRightMm ?? 0} 
                    onChange={(e) => updateRoom({ overhangRightMm: Math.max(0, parseInt(e.target.value) || 0) })} 
                    className="w-full bg-white border border-black/5 shadow-sm rounded-lg py-1.5 px-3 text-xs focus:ring-2 focus:ring-[#3b4d4a] outline-none" />
                </div>
              </div>

              {room.hasDecking && (
                <div className="space-y-4 mt-4">
                  {/* The deck is a shape now, not three numbers: once a corner has
                      been pulled the numbers below no longer describe it. */}
                  {room.deckOutline ? (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 space-y-2">
                      <p className="text-[11px] font-semibold text-[#3b4d4a]">Custom deck shape · {deckArea(room.deckOutline).toFixed(1)} m²</p>
                      <p className="text-[10px] text-gray-500 leading-snug">Click the deck, then drag a green corner to move it, drag a small mid-edge knob to add a corner, Alt-click a corner to remove it.</p>
                      <button onClick={() => { store.saveState(); updateRoom({ deckOutline: undefined }); }} className="text-[10px] font-bold uppercase tracking-wide text-gray-500 hover:text-red-500">Reset to rectangle</button>
                    </div>
                  ) : (
                    <p className="text-[10px] text-gray-400 leading-snug">Any shape you like: click the deck in the scene and drag its green corners. The sizes below set the starting rectangle.</p>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 w-28">Decking Depth</span>
                    <DeferredInput type="number" value={room.deckingSizeMm ?? 1500} onChange={(e) => updateRoom({ deckingSizeMm: parseInt(e.target.value) || 0 })} className="flex-1 bg-white border border-black/5 shadow-sm rounded-lg py-1.5 px-3 text-xs focus:ring-2 focus:ring-[#3b4d4a] outline-none" />
                  </div>
                  {/* Wider than the building, per side. The canopy stays put. */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 w-28">Extend Left</span>
                    <DeferredInput type="number" value={room.deckingLeftMm ?? 0} onChange={(e) => updateRoom({ deckingLeftMm: Math.max(0, parseInt(e.target.value) || 0) })} className="flex-1 bg-white border border-black/5 shadow-sm rounded-lg py-1.5 px-3 text-xs focus:ring-2 focus:ring-[#3b4d4a] outline-none" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 w-28">Extend Right</span>
                    <DeferredInput type="number" value={room.deckingRightMm ?? 0} onChange={(e) => updateRoom({ deckingRightMm: Math.max(0, parseInt(e.target.value) || 0) })} className="flex-1 bg-white border border-black/5 shadow-sm rounded-lg py-1.5 px-3 text-xs focus:ring-2 focus:ring-[#3b4d4a] outline-none" />
                  </div>
                  <p className="text-[10px] text-gray-400 leading-snug">Beyond the building's side, in mm. The canopy and roof do not change.</p>
                </div>
              )}
              

              {room.shape === 'Gable' && (
                <div className="space-y-3 mt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 w-28">Roof Height</span>
                    <DeferredInput type="number" value={room.roofHeightMm ?? 200} onChange={(e) => {
                      // Clamp below the total height: a roof taller than the
                      // building makes the wall height negative and the walls
                      // invert into a broken mess (three.js tolerates it, so
                      // there's no error — just a mangled model).
                      const maxRoof = (room.heightMm ?? 2350) - (room.baseHeightMm ?? 100) - 100;
                      updateRoom({ roofHeightMm: Math.min(Math.max(0, parseInt(e.target.value) || 0), Math.max(100, maxRoof)) });
                    }} className="flex-1 bg-white border border-black/5 shadow-sm rounded-lg py-1.5 px-3 text-xs focus:ring-2 focus:ring-[#3b4d4a] outline-none" />
                  </div>
                </div>
              )}
            </CollapsibleSection>

            {/* The covered outdoor section - one end of the building left
                open under the same roof, for a hot tub or outdoor kitchen.
                See utils/bay for what it does to the shell. */}
            {/* The garden boundary: fence runs drawn on the ground to mark out
                and measure the plot - each run's length, the perimeter, and
                the enclosed area once the loop is closed. */}
            <CollapsibleSection title="Garden Boundary" step="extras" openOn="boundary-picked">
              {(() => {
                const fences = scene.fences || [];
                const drawing = toolMode === 'fence';
                const perimeter = fences.reduce((s, f) => s + fenceLength(f), 0);
                const area = fenceArea(fences);
                const last = fences[fences.length - 1];
                const canClose = fences.length >= 2 && area === null && !!last;
                const btn = 'px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide bg-white border border-black/10 ';
                return (
                  <div className="space-y-3">
                    <p className="text-[10px] text-gray-400 leading-snug">Click the ground to set each corner of your garden. Click the first corner again to close it, Esc to stop. Right-click (or New run) lifts the pen so the next click starts a separate run - a wall beside some steps, say.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => store.setToolMode(drawing ? 'select' : 'fence')}
                        className={'flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ' + (drawing ? 'bg-emerald-500 text-white' : 'bg-[#3b4d4a] text-white hover:bg-[#2d3a38]')}
                      >
                        {drawing ? 'Drawing - Esc to stop' : fences.length ? 'Continue boundary' : 'Draw boundary'}
                      </button>
                      {canClose && (
                        <button onClick={() => { store.saveState(); store.addFence(last.bx, last.bz, fences[0].ax, fences[0].az); store.setToolMode('select'); }} className={btn + 'text-[#3b4d4a] hover:bg-gray-50'}>Close</button>
                      )}
                      {drawing && fences.length > 0 && (
                        <button onClick={() => window.dispatchEvent(new CustomEvent('fence-lift-pen'))} className={btn + 'text-[#3b4d4a] hover:bg-gray-50'} title="Start a separate run that does not join the last one">New run</button>
                      )}
                      {fences.length > 0 && (
                        <button onClick={() => { store.saveState(); store.clearFences(); }} className={btn + 'text-gray-500 hover:text-red-500'}>Clear</button>
                      )}
                    </div>
                    {fences.length > 0 && (
                      <div className="bg-white border border-black/5 rounded-xl shadow-sm divide-y divide-black/5">
                        {fences.map((f, i) => {
                          const st = runStyle(f, scene.boundaryStyle);
                          const picked = selectedFenceId === f.id;
                          return (
                            <div key={f.id} className={'flex items-center justify-between gap-2 px-3 py-1.5 text-xs cursor-pointer ' + (picked ? 'bg-emerald-50' : 'hover:bg-gray-50')} onClick={() => store.setSelectedFenceId(picked ? null : f.id)}>
                              <span className="text-gray-500 shrink-0">Run {i + 1}</span>
                              <span className="text-[10px] text-gray-400 truncate flex-1 text-center">{boundaryMeta(st.kind).name}{st.kind !== 'open' ? ` ${st.heightMm / 1000} m` : ''}</span>
                              <span className="font-semibold text-[#3b4d4a] shrink-0">{Math.round(fenceLength(f) * 1000)} mm</span>
                              <button onClick={(e) => { e.stopPropagation(); store.saveState(); store.removeFence(f.id); }} className="text-gray-300 hover:text-red-500" title="Remove this run"><Trash2 size={12} /></button>
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-between px-3 py-2 text-xs font-bold text-[#3b4d4a]">
                          <span>Perimeter</span><span>{perimeter.toFixed(2)} m</span>
                        </div>
                        <div className="flex items-center justify-between px-3 py-2 text-xs font-bold text-[#3b4d4a]">
                          <span>Garden area</span>
                          {area === null ? <span className="font-normal text-gray-400">close the boundary</span> : <span>{area.toFixed(1)} m²</span>}
                        </div>
                      </div>
                    )}
                    {/* What the boundary is built of. Edits the picked run, or
                        every run (and the style new runs take) when none is
                        picked - click a run in the list or on the plan. */}
                    {(() => {
                      const target = fences.find(f => f.id === selectedFenceId) ?? null;
                      const cur = target ? runStyle(target, scene.boundaryStyle) : (scene.boundaryStyle ?? runStyle(fences[0] ?? { id: '', ax: 0, az: 0, bx: 1, bz: 0 }));
                      const meta = boundaryMeta(cur.kind);
                      const apply = (patch: Partial<typeof cur>) => { store.saveState(); store.updateFenceStyle(target ? target.id : null, patch); };
                      const setKind = (kind: typeof cur.kind) => { const m = boundaryMeta(kind); apply({ kind, heightMm: m.defaultHeight, colour: m.defaultColour }); };
                      return (
                        <div className="space-y-2.5 pt-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-semibold text-gray-500">{target ? `Run ${fences.indexOf(target) + 1}` : fences.length ? 'All runs' : 'New runs'}</label>
                            {target && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    // A quarter turn about the run's middle; joined ends follow, as they do when it is dragged.
                                    const mx = (target.ax + target.bx) / 2, mz = (target.az + target.bz) / 2, half = fenceLength(target) / 2;
                                    const ang = Math.atan2(target.bz - target.az, target.bx - target.ax) + Math.PI / 2;
                                    const r = (v: number) => Math.round(v * 1000) / 1000;
                                    store.saveState();
                                    store.moveFenceRun(target.id, r(mx - Math.cos(ang) * half), r(mz - Math.sin(ang) * half), r(mx + Math.cos(ang) * half), r(mz + Math.sin(ang) * half));
                                  }}
                                  className="text-[10px] font-semibold text-[#3b4d4a] hover:text-emerald-600" title="Turn this run a quarter turn about its middle">Turn 90°</button>
                                <button onClick={() => store.setSelectedFenceId(null)} className="text-[10px] text-gray-400 hover:text-[#3b4d4a]">edit all</button>
                              </div>
                            )}
                          </div>
                          {target && <p className="text-[10px] text-gray-400 leading-snug">Drag the run on the plan to move it, or drag the green knob beside it to turn it. Arrow keys nudge, R turns 45°, Delete removes. Ends joined to other runs come with it - hold Alt to move this run on its own.</p>}
                          <div className="grid grid-cols-4 gap-1.5">
                            {BOUNDARY_KINDS.map(k => (
                              <button key={k.kind} title={k.hint} onClick={() => setKind(k.kind)}
                                className={'py-1.5 px-1 rounded-lg text-[10px] font-semibold leading-tight border transition-colors ' + (cur.kind === k.kind ? 'bg-[#3b4d4a] text-white border-transparent' : 'bg-white text-gray-600 border-black/10 hover:bg-gray-50')}>
                                {k.name}
                              </button>
                            ))}
                          </div>
                          {meta.kind !== 'open' && (
                            <DimensionSlider label="Height" min={meta.minHeight} max={meta.maxHeight} step={50} value={cur.heightMm} onChange={(v) => apply({ heightMm: v })} />
                          )}
                          {meta.thickness && (
                            <DimensionSlider label="Thickness" min={meta.thickness.min} max={meta.thickness.max} step={5} value={cur.thicknessMm ?? meta.thickness.default} onChange={(v) => apply({ thicknessMm: v })} />
                          )}
                          {meta.colours.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {meta.colours.map(c => (
                                <button key={c.id} title={c.name} onClick={() => apply({ colour: c.id })}
                                  className={'w-7 h-7 rounded-full border-2 transition-transform ' + (cur.colour === c.id ? 'border-[#3b4d4a] scale-110' : 'border-white shadow-sm hover:scale-105')}
                                  style={{ background: c.swatch }} />
                              ))}
                              <span className="self-center text-[10px] text-gray-400 ml-1">{meta.colours.find(c => c.id === cur.colour)?.name ?? ''}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
            </CollapsibleSection>

            {/* Paths: click out a line anywhere on the plot, at a width, in
                stone. Finished with Enter, right-click or the button. */}
            <CollapsibleSection title="Paths" step="extras" openOn="path-picked">
              {(() => {
                const paths = scene.paths || [];
                const drawing = toolMode === 'path';
                const target = paths.find(p => p.id === selectedPathId) ?? null;
                const cur = target ? { widthMm: target.widthMm, surface: target.surface } : { widthMm: scene.pathStyle?.widthMm ?? 900, surface: scene.pathStyle?.surface ?? 'stone' };
                const apply = (patch: Partial<typeof cur>) => { store.saveState(); store.updatePath(target ? target.id : null, patch); };
                const btn = 'px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide bg-white border border-black/10 ';
                return (
                  <div className="space-y-3">
                    <p className="text-[10px] text-gray-400 leading-snug">Click the ground for each point of the path, then Finish (or Enter, or right-click). Paths go anywhere - house to garden room, round the side, across the lawn.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { if (drawing) window.dispatchEvent(new CustomEvent('path-finish')); store.setToolMode(drawing ? 'select' : 'path'); }}
                        className={'flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ' + (drawing ? 'bg-emerald-500 text-white' : 'bg-[#3b4d4a] text-white hover:bg-[#2d3a38]')}
                      >
                        {drawing ? 'Finish path' : 'Draw a path'}
                      </button>
                      {paths.length > 0 && !drawing && (
                        <button onClick={() => { store.saveState(); store.clearPaths(); }} className={btn + 'text-gray-500 hover:text-red-500'}>Clear</button>
                      )}
                    </div>
                    {paths.length > 0 && (
                      <div className="bg-white border border-black/5 rounded-xl shadow-sm divide-y divide-black/5">
                        {paths.map((p, i) => {
                          const picked = selectedPathId === p.id;
                          return (
                            <div key={p.id} className={'flex items-center justify-between gap-2 px-3 py-1.5 text-xs cursor-pointer ' + (picked ? 'bg-emerald-50' : 'hover:bg-gray-50')} onClick={() => store.setSelectedPathId(picked ? null : p.id)}>
                              <span className="text-gray-500 shrink-0">Path {i + 1}</span>
                              <span className="text-[10px] text-gray-400 truncate flex-1 text-center">{PATH_SURFACES.find(s => s.id === p.surface)?.name} · {p.widthMm} mm wide</span>
                              <span className="font-semibold text-[#3b4d4a] shrink-0">{Math.round(pathLength(p) * 1000)} mm</span>
                              <button onClick={(e) => { e.stopPropagation(); store.saveState(); store.removePath(p.id); }} className="text-gray-300 hover:text-red-500" title="Remove this path"><Trash2 size={12} /></button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="space-y-2.5 pt-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-semibold text-gray-500">{target ? `Path ${paths.indexOf(target) + 1}` : paths.length ? 'All paths' : 'New paths'}</label>
                        {target && <button onClick={() => store.setSelectedPathId(null)} className="text-[10px] text-gray-400 hover:text-[#3b4d4a]">edit all</button>}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {PATH_SURFACES.map(s => (
                          <button key={s.id} onClick={() => apply({ surface: s.id })}
                            className={'py-1.5 px-2 rounded-lg text-[10px] font-semibold border transition-colors ' + (cur.surface === s.id ? 'bg-[#3b4d4a] text-white border-transparent' : 'bg-white text-gray-600 border-black/10 hover:bg-gray-50')}>
                            {s.name}
                          </button>
                        ))}
                      </div>
                      <DimensionSlider label="Width" min={400} max={3000} step={50} value={cur.widthMm} onChange={(v) => apply({ widthMm: v })} />
                    </div>
                  </div>
                );
              })()}
            </CollapsibleSection>

            {/* Freeform decking: click out any outline, at any height, in a
                decking material. As many decks as the garden needs - a raised
                platform off the doors stepping down to a lower one. */}
            <CollapsibleSection title="Decking Areas" step="extras" openOn="deck-picked">
              {(() => {
                const decks = scene.decks || [];
                const drawing = toolMode === 'deck';
                const target = decks.find(d => d.id === selectedDeckId) ?? null;
                const cur = target ? { heightMm: target.heightMm, material: target.material } : { heightMm: scene.deckStyle?.heightMm ?? 150, material: scene.deckStyle?.material ?? 'match' };
                const apply = (patch: Partial<typeof cur>) => { store.saveState(); store.updateDeck(target ? target.id : null, patch); };
                const btn = 'px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide bg-white border border-black/10 ';
                const total = decks.reduce((s, d) => s + deckArea(d.points), 0);
                return (
                  <div className="space-y-3">
                    <p className="text-[10px] text-gray-400 leading-snug">Any shape, any size. Click the ground at each corner of the deck and click the first corner again to close it (or Enter / right-click). Draw a second deck at a different height for a raised platform that steps down.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { if (drawing) window.dispatchEvent(new CustomEvent('deck-finish')); else store.setToolMode('deck'); }}
                        className={'flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ' + (drawing ? 'bg-emerald-500 text-white' : 'bg-[#3b4d4a] text-white hover:bg-[#2d3a38]')}
                      >
                        {drawing ? 'Finish deck' : decks.length ? 'Draw another deck' : 'Draw a deck'}
                      </button>
                      {decks.length > 0 && !drawing && (
                        <button onClick={() => { store.saveState(); store.clearDecks(); }} className={btn + 'text-gray-500 hover:text-red-500'}>Clear</button>
                      )}
                    </div>
                    {decks.length > 0 && (
                      <div className="bg-white border border-black/5 rounded-xl shadow-sm divide-y divide-black/5">
                        {decks.map((d, i) => {
                          const picked = selectedDeckId === d.id;
                          return (
                            <div key={d.id} className={'flex items-center justify-between gap-2 px-3 py-1.5 text-xs cursor-pointer ' + (picked ? 'bg-emerald-50' : 'hover:bg-gray-50')} onClick={() => store.setSelectedDeckId(picked ? null : d.id)}>
                              <span className="text-gray-500 shrink-0">Deck {i + 1}</span>
                              <span className="text-[10px] text-gray-400 truncate flex-1 text-center">{DECK_MATERIALS.find(m => m.id === d.material)?.name ?? 'Composite'} · {d.heightMm} mm high</span>
                              <span className="font-semibold text-[#3b4d4a] shrink-0">{deckArea(d.points).toFixed(1)} m²</span>
                              <button onClick={(e) => { e.stopPropagation(); store.saveState(); store.removeDeck(d.id); }} className="text-gray-300 hover:text-red-500" title="Remove this deck"><Trash2 size={12} /></button>
                            </div>
                          );
                        })}
                        {decks.length > 1 && (
                          <div className="flex items-center justify-between px-3 py-2 text-xs font-bold text-[#3b4d4a]"><span>Total decking</span><span>{total.toFixed(1)} m²</span></div>
                        )}
                      </div>
                    )}
                    <div className="space-y-2.5 pt-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-semibold text-gray-500">{target ? `Deck ${decks.indexOf(target) + 1}` : decks.length ? 'All decks' : 'New decks'}</label>
                        {target && <button onClick={() => store.setSelectedDeckId(null)} className="text-[10px] text-gray-400 hover:text-[#3b4d4a]">edit all</button>}
                      </div>
                      {target && <p className="text-[10px] text-gray-400 leading-snug">Drag the deck to move it, or drag a green corner to reshape it. Arrow keys nudge, Delete removes.</p>}
                      <DimensionSlider label="Height above lawn" min={50} max={1200} step={10} value={cur.heightMm} onChange={(v) => apply({ heightMm: v })} />
                      <div className="flex flex-wrap gap-1.5">
                        {DECK_MATERIALS.map(m => (
                          <button key={m.id} title={m.name} onClick={() => apply({ material: m.id })}
                            className={'w-7 h-7 rounded-full border-2 transition-transform ' + (cur.material === m.id ? 'border-[#3b4d4a] scale-110' : 'border-white shadow-sm hover:scale-105')}
                            style={{ background: m.swatch }} />
                        ))}
                        <span className="self-center text-[10px] text-gray-400 ml-1">{DECK_MATERIALS.find(m => m.id === cur.material)?.name ?? ''}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CollapsibleSection>

            <CollapsibleSection title="Outdoor Section" step="extras">
              <div className="flex items-center justify-between p-4 bg-white border border-black/5 rounded-xl shadow-sm">
                <span className="text-xs font-medium text-gray-700">
                  Covered outdoor section
                  <span className="block text-[10px] font-normal text-gray-400 leading-tight">One end open to the garden, under the same roof</span>
                </span>
                <button
                  onClick={() => updateRoom({ bay: room.bay ? undefined : { side: 'left', widthMm: 2400, floor: 'decking', post: 'frame', screen: 'solid' } })}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 shrink-0 ${room.bay ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-gray-300/60'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-all duration-300 shadow-md ${room.bay ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
                </button>
              </div>
              {room.bay && (() => {
                const bay = room.bay;
                const set = (patch: Partial<typeof bay>) => updateRoom({ bay: { ...bay, ...patch } });
                const wt = room.wallThicknessMm ?? 150;
                const maxW = Math.max(1200, room.widthMm - 3 * wt - 1500);
                const maxD = Math.max(1200, room.depthMm - wt - 1200);
                const fullDepth = !bay.depthMm;
                const usesSlats = bay.screen === 'slatted' || bay.backWall === 'slatted' || bay.soffit === 'slats';
                const chips = <T extends string>(label: string, value: T, options: [T, string][], onPick: (v: T) => void) => (
                  <div className="flex justify-between items-center gap-2 text-xs">
                    <span className="font-medium text-gray-700 shrink-0">{label}</span>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {options.map(([v, name]) => (
                        <button key={v} onClick={() => onPick(v)} className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wide rounded-md transition-colors ${value === v ? 'bg-[#3b4d4a] text-white' : 'bg-black/5 hover:bg-black/10 text-[#3b4d4a]'}`}>{name}</button>
                      ))}
                    </div>
                  </div>
                );
                const colour = (label: string, value: string, onPick: (hex: string) => void) => (
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-gray-700">{label}</span>
                    <input type="color" value={value} onChange={(e) => onPick(e.target.value)} className="w-8 h-7 rounded-md cursor-pointer border-0 shadow-sm overflow-hidden" />
                  </div>
                );
                const heading = (t: string) => <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pt-1">{t}</div>;
                return (
                  <div className="mt-3 p-4 bg-white border border-black/5 rounded-xl shadow-sm space-y-3">
                    {heading('Size')}
                    {chips('Which end', bay.side, [['left', 'Left'], ['right', 'Right']], side => set({ side }))}
                    <DimensionSlider label="Width" min={1200} max={maxW} step={100} value={Math.min(bay.widthMm, maxW)} onChange={(v) => set({ widthMm: v })} />
                    {chips('Depth', fullDepth ? 'full' : 'part', [['full', 'Full depth'], ['part', 'Corner']], v => set({ depthMm: v === 'full' ? undefined : Math.min(maxD, Math.max(1200, Math.round(room.depthMm * 0.6 / 100) * 100)), backWall: v === 'full' ? bay.backWall : undefined }))}
                    {!fullDepth && <DimensionSlider label="Depth" min={1200} max={maxD} step={100} value={Math.min(bay.depthMm!, maxD)} onChange={(v) => set({ depthMm: v })} />}

                    {heading('Walls')}
                    {chips('End wall', bay.screen, [['solid', 'Wall'], ['slatted', 'Slats'], ['glass', 'Glass'], ['open', 'Open']], screen => set({ screen, post: screen === 'solid' ? bay.post : (bay.post === 'none' ? 'frame' : bay.post) }))}
                    {fullDepth && chips('Back wall', bay.backWall ?? 'solid', [['solid', 'Wall'], ['slatted', 'Slats'], ['open', 'Open']], backWall => set({ backWall }))}
                    {chips('Wall finish', bay.wallFinish ?? 'match', [['match', 'Cladding'], ['cladding', 'Other cladding'], ['render', 'Painted']], wallFinish => set({ wallFinish }))}
                    {bay.wallFinish === 'cladding' && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-gray-700">Cladding</span>
                        <select className="bg-gray-50 border border-black/5 rounded-lg px-2 py-1 outline-none text-[#3b4d4a] font-semibold focus:ring-2 focus:ring-[#3b4d4a]" value={bay.wallCladding ?? 'cedar_composite'} onChange={e => set({ wallCladding: e.target.value as any })}>
                          {[['cedar_composite', 'Cedar Composite'], ['oak_composite', 'Oak Composite'], ['light_oak_composite', 'Light Oak'], ['black_composite', 'Black'], ['dark_grey_composite', 'Dark Grey'], ['light_grey_composite', 'Light Grey'], ['white_composite', 'White'], ['slate_blue_composite', 'Slate Blue'], ['sage_composite', 'Sage Green'], ['clay_composite', 'Clay'], ['corrugated_iron', 'Corrugated Steel']].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                        </select>
                      </div>
                    )}
                    {bay.wallFinish === 'render' && colour('Paint', bay.wallColour ?? '#e8e4dc', wallColour => set({ wallColour }))}

                    {heading('Ceiling & floor')}
                    {chips('Ceiling', bay.soffit ?? 'roof', [['roof', 'Roof'], ['white', 'White'], ['cladding', 'Cladding'], ['slats', 'Timber slats']], soffit => set({ soffit }))}
                    {chips('Downlights', String(bay.lights ?? 3), [['0', 'None'], ['2', '2'], ['3', '3'], ['4', '4']], n => set({ lights: Number(n) }))}
                    {chips('Floor', bay.floor, [['decking', 'Decking'], ['porcelain', 'Porcelain'], ['base', 'Plain']], floor => set({ floor }))}
                    {bay.floor === 'decking' && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-gray-700">Boards</span>
                        <select className="bg-gray-50 border border-black/5 rounded-lg px-2 py-1 outline-none text-[#3b4d4a] font-semibold focus:ring-2 focus:ring-[#3b4d4a]" value={bay.deckingMaterial ?? ''} onChange={e => set({ deckingMaterial: e.target.value || undefined })}>
                          <option value="">Same as the base</option>
                          {[['timber', 'Timber'], ['composite_cedar', 'Cedar composite'], ['composite_oak', 'Oak composite'], ['composite_black', 'Black composite'], ['composite_dark_grey', 'Dark grey composite'], ['composite_grey', 'Grey composite'], ['composite_brown', 'Brown composite']].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                        </select>
                      </div>
                    )}
                    {bay.floor === 'porcelain' && colour('Tile colour', bay.floorColour ?? '#d8d6d0', floorColour => set({ floorColour }))}

                    {heading('Details')}
                    {chips('Corner post', bay.post, [['frame', 'Frame'], ['timber', 'Timber'], ['black', 'Black'], ['white', 'White'], ['none', 'None']], post => set({ post }))}
                    {usesSlats && colour('Slat colour', bay.slatColour ?? '#9a7a52', slatColour => set({ slatColour }))}
                    <p className="text-[10px] text-gray-400 leading-snug">Openings that fall in the section are hidden while it is on. Furniture in its footprint is moved into the room. Put the hot tub and outdoor pieces in from the Objects tab.</p>
                  </div>
                );
              })()}
            </CollapsibleSection>

            <CollapsibleSection title="Skylights" step="openings">
              <div className="flex justify-end mb-4">
                <button onClick={wrap(store.addSkylight)} className="text-[10px] font-semibold text-[#3b4d4a] hover:text-blue-600 transition-colors">+ Add New</button>
              </div>
              <div className="space-y-3">
                {(room.skylights || []).map((sky, i) => (
                  <div key={sky.id} className="p-4 bg-white border border-black/5 rounded-xl shadow-sm space-y-4 relative group">
                    <button onClick={() => wrap(store.removeSkylight)(sky.id)} className="absolute top-3 right-3 text-red-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 size={14} />
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-800">#{i + 1}</span>
                      <span className="text-xs font-semibold text-[#3b4d4a]">Flat Skylight</span>
                    </div>
<DimensionSlider label="Width" min={400} max={3000} step={100} value={sky.widthMm} onChange={(v) => wrap(store.updateSkylight)(sky.id, { widthMm: v })} />
<DimensionSlider label="Length" min={400} max={3000} step={100} value={sky.lengthMm} onChange={(v) => wrap(store.updateSkylight)(sky.id, { lengthMm: v })} />
                  </div>
                ))}
                {(room.skylights || []).length === 0 && <p className="text-xs text-gray-400 text-center py-4">No roof features</p>}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Internal Walls" step="interior">
              {/* ONE system: walls own their doors. The old separate "+ Door"
                  created world-positioned doors that stayed behind when their
                  wall moved; new doors are added per-wall below. */}
              <button onClick={wrap(store.addPartition)} className="w-full bg-white border border-[#3b4d4a] text-[#3b4d4a] py-2 px-2 rounded-lg text-xs font-semibold hover:bg-[#3b4d4a] hover:text-white transition-all shadow-sm mb-4">+ Add Internal Wall</button>
              <p className="text-[10px] text-gray-400 mb-3 leading-snug">Click a wall in the 3D view to select it, then drag its body to move (it snaps to the room and other walls), red ends to resize, green handles to slide doors.</p>
              <div className="space-y-3">
                {room.partitions?.map((part, i) => (
                  <div key={part.id} onClick={() => store.setSelectedElementId(`part-${part.id}`)} className={`p-4 bg-white border rounded-xl shadow-sm space-y-3 relative group cursor-pointer transition-colors ${selectedElementId === `part-${part.id}` ? 'border-[#3b4d4a]' : 'border-black/5'}`}>
                    <button onClick={(e) => { e.stopPropagation(); wrap(store.removePartition)(part.id); }} className="absolute top-3 right-3 text-red-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 size={14} />
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-800">Wall #{i + 1}</span>
                      <button onClick={(e) => { e.stopPropagation(); wrap(store.updatePartition)(part.id, { rotation: part.rotation === 0 ? 90 : 0 }); }} className="text-[10px] font-semibold text-[#3b4d4a] hover:text-blue-600 transition-colors bg-blue-50 px-2 py-1 rounded">
                        Rotate 90°
                      </button>
                      <span className="text-[10px] text-gray-400">{part.rotation === 0 ? 'runs left-right' : 'runs front-back'}</span>
                    </div>
                    <DimensionSlider label="Length (grows from the far end)" min={400} max={6000} step={100} value={part.lengthMm} onChange={(v) => {
                      // Grow from ONE end, as the red handles do. Growing from
                      // the centre moved both ends, so a wall lined up on a
                      // corner drifted off it every time it was lengthened.
                      // The start (local -X) end stays put: the centre shifts
                      // by half the change along local +X, which is world +X
                      // at rotation 0 and world -Z at rotation 90.
                      const half = (v - part.lengthMm) / 2;
                      wrap(store.updatePartition)(part.id, part.rotation === 0
                        ? { lengthMm: v, xMm: part.xMm + half }
                        : { lengthMm: v, zMm: part.zMm - half });
                    }} />

                    {/* L-shape: a corner as ONE wall - lining up two separate
                        walls at a corner was needlessly fiddly. */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); wrap(store.updatePartition)(part.id, { legLengthMm: (part.legLengthMm || 0) > 100 ? 0 : 1500, legEnd: part.legEnd || 1, legDir: part.legDir || 1 }); }}
                        className={`text-[10px] font-semibold px-2 py-1 rounded transition-colors ${(part.legLengthMm || 0) > 100 ? 'bg-[#3b4d4a] text-white' : 'bg-blue-50 text-[#3b4d4a] hover:text-blue-600'}`}
                      >
                        {(part.legLengthMm || 0) > 100 ? 'L-Shape ✓' : 'Make L-Shape'}
                      </button>
                      {(part.legLengthMm || 0) > 100 && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); wrap(store.updatePartition)(part.id, { legEnd: (part.legEnd === -1 ? 1 : -1) }); }} className="text-[10px] font-semibold text-[#3b4d4a] bg-blue-50 hover:text-blue-600 px-2 py-1 rounded" title="Move the corner to the other end of the wall">
                            Swap end
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); wrap(store.updatePartition)(part.id, { legDir: (part.legDir === -1 ? 1 : -1) }); }} className="text-[10px] font-semibold text-[#3b4d4a] bg-blue-50 hover:text-blue-600 px-2 py-1 rounded" title="Turn the leg to the other side">
                            Flip side
                          </button>
                        </>
                      )}
                    </div>
                    {(part.legLengthMm || 0) > 100 && (
                      <DimensionSlider label="Leg Length" min={300} max={6000} step={100} value={part.legLengthMm || 1500} onChange={(v) => wrap(store.updatePartition)(part.id, { legLengthMm: v })} />
                    )}

                    <div className="border-t border-black/5 pt-3 space-y-2">
                      {(part.doors || []).map((dr, di) => (
                        <div key={dr.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-2">
                          <span className="text-[10px] font-semibold text-gray-600 shrink-0">Door {di + 1}</span>
                          <input type="number" step={50} value={dr.widthMm} title="Width (mm)"
                            onChange={(e) => wrap(store.updatePartitionDoor)(part.id, dr.id, { widthMm: Math.max(400, Number(e.target.value) || 800) })}
                            className="w-16 bg-white border border-gray-200 rounded px-1.5 py-1 text-[10px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#3b4d4a]" />
                          <span className="text-[9px] text-gray-400">w</span>
                          <input type="number" step={50} value={dr.heightMm} title="Height (mm)"
                            onChange={(e) => wrap(store.updatePartitionDoor)(part.id, dr.id, { heightMm: Math.max(1600, Number(e.target.value) || 2000) })}
                            className="w-16 bg-white border border-gray-200 rounded px-1.5 py-1 text-[10px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#3b4d4a]" />
                          <span className="text-[9px] text-gray-400">h</span>
                          <select value={dr.style || ''} title="Door style"
                            onChange={(e) => wrap(store.updatePartitionDoor)(part.id, dr.id, { style: (e.target.value || undefined) as any })}
                            className="bg-white border border-gray-200 rounded px-1 py-1 text-[10px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#3b4d4a]">
                            <option value="">Opening</option>
                            {Object.entries(INTERIOR_DOOR_STYLES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                          </select>
                          <button onClick={(e) => { e.stopPropagation(); wrap(store.removePartitionDoor)(part.id, dr.id); }} className="ml-auto text-red-400 hover:text-red-500">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      <button onClick={(e) => { e.stopPropagation(); wrap(store.addPartitionDoor)(part.id); store.setSelectedElementId(`part-${part.id}`); }} className="w-full text-[10px] font-semibold text-[#3b4d4a] bg-[#3b4d4a]/5 hover:bg-[#3b4d4a]/10 rounded-lg py-1.5 transition-colors">
                        + Door in this wall
                      </button>
                    </div>
                  </div>
                ))}
                {!room.partitions?.length && <p className="text-xs text-gray-400 text-center py-4">No internal walls</p>}
              </div>

              {room.interiorDoors && room.interiorDoors.length > 0 && (
                <div className="mt-6 border-t border-black/5 pt-4">
                  <h4 className="text-[10px] font-bold uppercase text-gray-500 mb-3">Interior Doors</h4>
                  {room.interiorDoors.map((door, i) => (
                    <div key={door.id} className="p-4 bg-white border border-black/5 rounded-xl shadow-sm space-y-4 relative group mb-3">
                      <button onClick={() => wrap(store.removeInteriorDoor)(door.id)} className="absolute top-3 right-3 text-red-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={14} />
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-800">Interior Door #{i + 1}</span>
                        <button onClick={(e) => wrap(store.updateInteriorDoor)(door.id, { rotation: door.rotation === 0 ? 90 : 0 })} className="text-[10px] font-semibold text-[#3b4d4a] hover:text-blue-600 transition-colors bg-blue-50 px-2 py-1 rounded">
                          Rotate 90°
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="block text-[10px] font-medium text-gray-500 mb-1">Width (mm)</label>
                          <input type="number" value={door.widthMm} onChange={(e) => wrap(store.updateInteriorDoor)(door.id, { widthMm: Number(e.target.value) })} className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-gray-500 mb-1">Height (mm)</label>
                          <input type="number" value={door.heightMm} onChange={(e) => wrap(store.updateInteriorDoor)(door.id, { heightMm: Number(e.target.value) })} className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div>
                          <label className="block text-[10px] font-medium text-gray-500 mb-1">X Position (mm)</label>
                          <input type="number" value={Math.round(door.xMm)} onChange={(e) => wrap(store.updateInteriorDoor)(door.id, { xMm: Number(e.target.value) })} className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-gray-500 mb-1">Z Position (mm)</label>
                          <input type="number" value={Math.round(door.zMm)} onChange={(e) => wrap(store.updateInteriorDoor)(door.id, { zMm: Number(e.target.value) })} className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                      </div>
                      
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Interior Finishes" step="interior">
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-medium text-gray-500 mb-2 block">Interior Wall Color</label>
                  <input type="color" value={room.interiorColor || '#ffffff'} onChange={(e) => updateRoom({ interiorColor: e.target.value })} className="w-8 h-8 rounded-full cursor-pointer border-0 shadow-sm overflow-hidden" title="Choose Interior Color"/>
                </div>

                <div>
                  <label className="text-[10px] font-medium text-gray-500 mb-2 block">Interior Floor Type</label>
                  {/* Picture tiles, like the Objects picker: each floor shows
                      the texture it actually renders with. Tinted floors
                      (oak, pine...) blend their tint over the shared plank
                      map - the same multiply the 3D material does - so the
                      swatch is an honest preview, not an approximation. */}
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'oak_plank', name: 'Oak Plank', img: 'textures/oak_plank_color.jpg' },
                      { id: 'light_oak', name: 'Light Oak', img: 'textures/light_oak_color.jpg' },
                      { id: 'rustic_pine', name: 'Rustic Pine', img: 'textures/rustic_pine_color.jpg' },
                      { id: 'smoked_oak', name: 'Smoked Oak', img: 'textures/smoked_oak_color.jpg' },
                      { id: 'oak_herringbone', name: 'Oak Herringbone', img: 'textures/oak_herringbone_color.jpg' },
                      { id: 'walnut_parquet', name: 'Walnut Parquet', img: 'textures/walnut_parquet_color.jpg' },
                      { id: 'laminate', name: 'Laminate', img: 'textures/laminate_color.jpg' },
                    ] as { id: string; name: string; img?: string; tint?: string }[]).map(floor => {
                      const active = room.interiorFloorType === floor.id;
                      return (
                        <button
                          key={floor.id}
                          onClick={() => updateRoom({ interiorFloorType: floor.id as any })}
                          title={floor.name}
                          className={`group rounded-xl border overflow-hidden bg-white transition-all ${
                            active ? 'border-[#3b4d4a] ring-2 ring-[#3b4d4a]/25 shadow-md' : 'border-black/5 hover:border-[#3b4d4a]/40 hover:shadow-sm'
                          }`}
                        >
                          <div
                            className="aspect-square w-full"
                            style={{
                              backgroundColor: floor.tint || '#ffffff',
                              backgroundImage: floor.img ? `url(${floor.img})` : undefined,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              backgroundBlendMode: floor.img && floor.tint ? 'multiply' : undefined,
                            }}
                          />
                          <span className="block px-1 py-1 text-[9px] font-semibold text-[#3b4d4a] text-center leading-tight truncate border-t border-black/5">
                            {floor.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Plank size lives with the floor it scales. Each texture is
                      mapped at its real-world size, so this is a straight
                      multiplier: 100% is the true plank width, 200% lays them
                      twice as wide. */}
                  <div className="mt-4">
                    <DimensionSlider
                      label="Plank Size %"
                      min={50}
                      max={250}
                      step={5}
                      value={Math.round((room.floorScale ?? 1) * 100)}
                      onChange={(v) => updateRoom({ floorScale: v / 100 })}
                    />
                  </div>
                </div>
              </div>
            </CollapsibleSection>

          </StepContext.Provider>
        )}

        {/*
          The whole kitchen in one place: what to add, then how it is
          finished. Split across the Objects picker and an object panel it
          meant hunting for a worktop past the sofas, and setting a door
          colour six times because the units were nowhere near their finishes.
        */}
        {tab === 'kitchen' && (
          <div className="space-y-7">
            <section>
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-3 block">Add units</label>
              <p className="text-[10px] text-gray-500 leading-relaxed mb-3">
                Click an item, then click in the scene.
                <span className="text-gray-400"> R rotates &middot; Esc cancels.</span>
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {([
                  'kitchen_unit_600', 'kitchen_unit_1200', 'kitchen_sink_1200',
                  'kitchen_drawer_2', 'kitchen_drawer_3', 'kitchen_corner_unit', 'kitchen_tall_larder',
                  'kitchen_wall_unit_600', 'kitchen_wall_unit_1200',
                  'end_panel_base', 'end_panel_tall', 'end_panel_wall',
                  'kitchen_hob_gas', 'kitchen_hob_induction', 'kitchen_extractor',
                  'external_extraction_fan',
                  'kitchen_tall_fridge', 'kitchen_tall_oven_single', 'kitchen_tall_oven_double',
                  'kitchen_tap_straight', 'kitchen_tap_curved',
                  'bar_stool', 'bar_stool_tall',
                ] as const).filter(t => GLB_OBJECT_TYPES.includes(t)).map(type => (
                  <ObjectTile key={type} type={type} label={GLB_OBJECT_LABELS[type] || type} />
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                Base unit widths are adjustable once placed. Taps drop straight onto the worktop at 900mm.
              </p>
            </section>

            <section>
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-3 block">Finishes</label>
              <div className="p-4 bg-white border border-black/5 rounded-xl shadow-sm">
                <KitchenPanel />
              </div>
            </section>
          </div>
        )}

        {tab === 'objects' && (
          <div className="space-y-7">
            {/* No negative margin: the line wraps at this width, and pulling
                it up put the second line through the first section heading. */}
            <p className="text-[10px] text-gray-500 leading-relaxed">
              Click an item, then click in the scene.
              <span className="text-gray-400"> R rotates &middot; Esc cancels.</span>
            </p>

            <section>
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-3 block">Seating</label>
              <div className="grid grid-cols-2 gap-2.5">
                {(['sofa', 'sofa_l', 'sofa_3', 'sofa_4', 'armchair', 'armchair_2', 'armchair_3', 'footstool', 'office_chair', 'bar_stool', 'bar_stool_tall'] as const).filter(t => GLB_OBJECT_TYPES.includes(t)).map(type => (
                  <ObjectTile key={type} type={type} label={GLB_OBJECT_LABELS[type] || type} />
                ))}
              </div>
            </section>

            <section>
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-3 block">Rugs</label>
              <div className="grid grid-cols-2 gap-2.5">
                {(['rug', 'rug_2'] as const).filter(t => GLB_OBJECT_TYPES.includes(t)).map(type => (
                  <ObjectTile key={type} type={type} label={GLB_OBJECT_LABELS[type] || type} />
                ))}
              </div>
            </section>

            <section>
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-3 block">Tables & Storage</label>
              <div className="grid grid-cols-2 gap-2.5">
                {(['dining_table', 'dining_table_round', 'coffee_table', 'coffee_table_black', 'tv_unit', 'wall_tv', 'desk', 'desk_single', 'shelving_unit', 'wardrobe', 'chest_of_drawers', 'bedside_table'] as const).filter(t => GLB_OBJECT_TYPES.includes(t)).map(type => (
                  <ObjectTile key={type} type={type} label={GLB_OBJECT_LABELS[type] || type} />
                ))}
              </div>
            </section>

            <section>
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-3 block">Games</label>
              <div className="grid grid-cols-2 gap-2.5">
                {(['pool_table', 'arcade_machine', 'dart_board'] as const).filter(t => GLB_OBJECT_TYPES.includes(t)).map(type => (
                  <ObjectTile key={type} type={type} label={GLB_OBJECT_LABELS[type] || type} />
                ))}
              </div>
            </section>

            <section>
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-3 block">Bedroom</label>
              <div className="grid grid-cols-2 gap-2.5">
                {(['bed', 'bed_2'] as const).filter(t => GLB_OBJECT_TYPES.includes(t)).map(type => (
                  <ObjectTile key={type} type={type} label={GLB_OBJECT_LABELS[type] || type} />
                ))}
              </div>
            </section>

            {/* Kitchen units live on the Kitchen tab, with the finishes that
                apply to them. */}
            <section>
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-3 block">Bathroom</label>
              <div className="grid grid-cols-2 gap-2.5">
                {(['toilet', 'vanity', 'basin_tap_mixer', 'basin_tap_widespread', 'basin_tap_wall', 'shower', 'shower_corner', 'shower_small', 'towel_heater'] as const).filter(t => GLB_OBJECT_TYPES.includes(t)).map(type => (
                  <ObjectTile key={type} type={type} label={GLB_OBJECT_LABELS[type] || type} />
                ))}
              </div>
            </section>

            {/* Things for the outdoor section. They can only be placed in
                the bay (utils/bay), so the picker says so when there is none. */}
            <section>
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-1 block">Outdoor</label>
              {!room.bay && <p className="text-[10px] text-gray-400 mb-2 leading-snug">Add an Outdoor Section on the Extras step first - these go in it.</p>}
              <div className="grid grid-cols-2 gap-2.5">
                <ObjectTile type="hot_tub" label="Hot Tub" />
              </div>
            </section>

            {/* Garden objects: placed anywhere on the plot, not clamped to
                the room or the outdoor section. */}
            <section>
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-1 block">Garden</label>
              <p className="text-[10px] text-gray-400 mb-2 leading-snug">Drop anywhere in the garden, then drag, turn and set the width.</p>
              <div className="grid grid-cols-2 gap-2.5">
                <ObjectTile type="garden_steps" label="Steps" icon={<Layers size={20} />} />
                <ObjectTile type="garden_ramp" label="Ramp" icon={<TrendingUp size={20} />} />
              </div>
            </section>

            <section>
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-3 block">Heating &amp; Utilities</label>
              <div className="grid grid-cols-2 gap-2.5">
                {(['heater_small', 'heater_large', 'boiler', 'aircon_indoor', 'aircon_outdoor'] as const).filter(t => GLB_OBJECT_TYPES.includes(t)).map(type => (
                  <ObjectTile key={type} type={type} label={GLB_OBJECT_LABELS[type] || type} />
                ))}
              </div>
            </section>

            {/* Lighting has its own view now - a reflected ceiling plan, where
                the fittings are actually visible and can be dragged. Laying
                them out from the furniture picker meant placing them into a
                view that had the roof over them. */}
            <section>
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-3 block">Lighting</label>
              <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                {(['pendant_light', 'canopy_spot'] as const).filter(t => GLB_OBJECT_TYPES.includes(t)).map(type => (
                  <ObjectTile key={type} type={type} label={GLB_OBJECT_LABELS[type] || type} />
                ))}
              </div>
              {!room.hasCanopy && !room.hasPictureFrame && <p className="text-[10px] text-gray-400 mb-2.5 leading-snug">Canopy spotlights need a canopy - add one on the Extras step and they recess into its underside.</p>}
              {/* Exterior wall lights: dropped anywhere near the building,
                  they fix themselves to the nearest outside wall. */}
              <label className="text-[10px] font-semibold text-gray-500 mb-2 block">Outside walls</label>
              <div className="grid grid-cols-3 gap-2.5 mb-2.5">
                {(['wall_light_sconce', 'wall_light_angled', 'wall_light_box', 'wall_light_slim'] as const).filter(t => GLB_OBJECT_TYPES.includes(t)).map(type => (
                  <ObjectTile key={type} type={type} label={GLB_OBJECT_LABELS[type] || type} />
                ))}
              </div>
              <button
                onClick={() => {
                  useStore.getState().setViewMode('lighting');
                  window.dispatchEvent(new CustomEvent('reset-plan-view'));
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white border border-black/5 shadow-sm text-[11px] font-bold uppercase tracking-wide text-[#3b4d4a] hover:bg-gray-50 transition-colors"
              >
                Open lighting plan
              </button>
              <p className="text-[10px] text-gray-400 leading-snug mt-2">
                Set out spotlights on a ceiling plan, in rows or a grid.
              </p>
            </section>

            {/* Garden objects and the procedural light fittings were retired
                from the picker: everything offered here is now a real model.
                Saved designs containing the old items still render. */}
          </div>
        )}
      </div>
      
      <div className="p-4 border-t border-black/10 bg-white shrink-0 shadow-lg z-20">
        {isPublic ? (
          /* No renders on the free configurator - each one costs real money.
             What the Business version adds is spelled out, and the button
             asks the host app to show the plan. */
          <div className="space-y-2">
            <p className="text-[11px] text-gray-500 leading-snug">
              <span className="font-bold text-[#3b4d4a]">Business</span> adds AI renders, interiors, kitchens, the walkthrough and lighting plan.
            </p>
            <button
              onClick={() => window.parent.postMessage({ type: 'OPEN_PRICING' }, window.location.origin)}
              className="w-full bg-[#3b4d4a] hover:bg-[#2d3a38] text-white py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-lg cursor-pointer"
            >
              See the Business plan
            </button>
          </div>
        ) : (
        /* "Send to Render Engine" is gone (Charlie, 21 Sep 2026): a view is
           framed with a saved camera and imported from the Cameras panel on
           the canvas (UI/CameraPanel.tsx), in the 3D or walk view. */
        <p className="text-[11px] text-gray-500 leading-snug text-center">
          To render, frame the view with a <span className="font-bold text-[#3b4d4a]">camera</span> on the canvas and press Import into Render Engine.
        </p>
        )}
        {!isPublic && (
        /* Floor Plan Studio (18 Sep 2026): the plan view with dimensions on,
           captured from straight above as shaded + line drawing, with the
           spec and every placed piece of furniture with its position. The
           host app turns it into a rendered or CAD plan. */
        <button
          onClick={async () => {
            const st = useStore.getState();
            const prevMode = st.viewMode;
            st.setHoveredElementId(null);
            st.setViewMode('plan');
            st.setIsExporting(true);
            const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
            await wait(400);
            window.dispatchEvent(new CustomEvent('camera-set-view', { detail: { view: 'top', snap: true } }));
            await wait(600);
            let captured: { shaded: string; line: string } | null = null;
            try { captured = (window as any).__modulrCaptureRenderInputs?.() || null; } catch (e) { console.warn('plan capture failed', e); }
            useStore.getState().setIsExporting(false);
            useStore.getState().setViewMode(prevMode);
            if (!captured) return;
            // The top camera frames the whole lawn: crop both to the drawing.
            let image = captured.shaded, lineImage: string | null = captured.line;
            try { const c = await cropToInk(captured.line, captured.shaded); image = c.shaded; lineImage = c.line; } catch (e) { console.warn('plan crop failed, sending uncropped', e); }
            const { room, fences, boundaryStyle, paths, decks, objects } = useStore.getState().scene;
            const { areDoorsOpen, openDoorIds } = useStore.getState();
            const roomSpec = {
              ...room,
              doors: (room.doors || []).map(d => ({ ...d, open: !!(areDoorsOpen || openDoorIds.includes(d.id)) })),
              garden: (fences?.length || paths?.length || decks?.length) ? {
                boundary: (fences || []).map(f => ({ lengthMm: Math.round(fenceLength(f) * 1000), text: describeBoundary(runStyle(f, boundaryStyle)) })),
                paths: (paths || []).map(p => ({ lengthMm: Math.round(pathLength(p) * 1000), text: describePath(p) })),
                decks: (decks || []).map(d => ({ areaM2: Math.round(deckArea(d.points) * 10) / 10, heightMm: d.heightMm, text: describeDeck(d) })),
              } : undefined,
              interior: describeInterior(room, objects || []),
              planItems: describePlanItems(objects || []),
            };
            window.parent.postMessage({ type: 'RENDER_PLAN', image, lineImage, roomSpec }, window.location.origin);
          }}
          className="w-full mt-2 bg-white hover:bg-gray-50 text-[#3b4d4a] border border-[#3b4d4a]/30 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <LayoutGrid size={16} />
          Floor Plan Studio
        </button>
        )}
      </div>
    </div>
  );
}
