import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { Settings, Plus, Box, Tent, Trees, Map, Settings2, Trash2, DoorOpen, DoorClosed, ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Link } from 'react-router-dom';
import { ClaudeSketchUpPrompt } from './ClaudeSketchUpPrompt';
import { DimensionSlider } from './DimensionSlider';

function CollapsibleSection({ title, children, defaultOpen = false }: { title: string, children: React.ReactNode, defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
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
  const wrap = (fn: any) => (...args: any[]) => { store.saveState(); fn(...args); };
  // Reactive read so the selected wall's card highlights as selection changes.
  const selectedElementId = useStore(s => s.selectedElementId);

  const { room, env, viewMode, areDoorsOpen, toggleDoors } = useStore(useShallow(s => ({
    room: s.scene.room,
    env: s.scene.env,
    viewMode: s.viewMode,
    areDoorsOpen: s.areDoorsOpen,
    toggleDoors: s.toggleDoors
  })));

  const updateRoom = wrap(store.updateRoom);
  const updateDoor = wrap(store.updateDoor);
  const addWindow = wrap(store.addWindow);
  const updateWindow = wrap(store.updateWindow);
  const removeWindow = wrap(store.removeWindow);
  const toggleTime = wrap(store.toggleTime);
  
  const [tab, setTab] = useState('building');

  return (
    <div className="flex flex-col h-full bg-transparent text-[#1d1d1f]">
      <div className="p-6 border-b border-black/5 flex items-center gap-4">
        <Link to="/" className="w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 text-gray-700 transition-colors shrink-0">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-[#1d1d1f]">Modulr <span className="font-light">3D</span></h1>
          <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1 font-medium">Configurator</p>
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
          <button 
            onClick={toggleTime}
            className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center shadow-sm border border-black/5 text-gray-500 hover:text-gray-800 transition-colors"
            title="Toggle Day/Night"
          >
            {env.time === 'day' ? <Map size={16}/> : <Settings2 size={16}/>}
          </button>
        </div>
      </div>

      <div className="p-3 border-b border-black/5 bg-white space-y-2">
        <div className="flex bg-gray-100 p-1 rounded-lg border border-black/5">
          <button onClick={() => setTab('building')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${tab === 'building' ? 'bg-white shadow-sm text-[#1d1d1f]' : 'text-gray-400 hover:text-gray-600'}`}>Building</button>
          <button onClick={() => setTab('objects')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${tab === 'objects' ? 'bg-white shadow-sm text-[#1d1d1f]' : 'text-gray-400 hover:text-gray-600'}`}>Objects</button>
        </div>
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
          <>
            {/* Shape comes FIRST: it is the decision everything else depends
                on. It used to live six sections down inside "Base Model &
                Features", where even the owner could not find the Gable
                option. */}
            <CollapsibleSection title="Roof Shape" defaultOpen={true}>
              <div className="grid grid-cols-2 gap-2">
                {(['Box', 'Gable'] as const).map((shape) => (
                  <div key={shape} onClick={() => {
                    if (room.shape === shape) return;
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
                  }} className={`p-3 rounded-xl text-center cursor-pointer transition-all ${room.shape === shape ? 'bg-[#3b4d4a] text-white shadow-md' : 'bg-white border border-black/5 text-gray-600 hover:bg-gray-50'}`}>
                    <span className="text-[11px] font-semibold tracking-wide">{shape === 'Box' ? 'Flat Roof' : 'Gable Roof'}</span>
                  </div>
                ))}
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

            <CollapsibleSection title="Dimensions" defaultOpen={true}>
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

            <CollapsibleSection title="Cladding" defaultOpen={true}>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-medium text-gray-500 mb-2 block">Wall Cladding Orientation</label>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                     <div onClick={() => updateRoom({ claddingOrientation: 'horizontal' })} className={`p-2 rounded-xl text-center cursor-pointer transition-colors ${room.claddingOrientation !== 'vertical' ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white border border-black/5 text-gray-600 hover:bg-gray-50'}`}>
                      <span className="text-[10px] font-semibold uppercase">Horizontal</span>
                    </div>
                    <div onClick={() => updateRoom({ claddingOrientation: 'vertical' })} className={`p-2 rounded-xl text-center cursor-pointer transition-colors ${room.claddingOrientation === 'vertical' ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white border border-black/5 text-gray-600 hover:bg-gray-50'}`}>
                      <span className="text-[10px] font-semibold uppercase">Vertical</span>
                    </div>
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
                            // Swatch colours mirror MATERIAL_DEF exactly. If one is
                            // changed there, change it here too or the picker lies
                            // about what it is about to apply.
                            { id: 'cedar_composite', color: 'bg-[#b0764b]', name: 'Cedar Composite' },
                            { id: 'oak_composite', color: 'bg-[#c9a173]', name: 'Oak Composite' },
                            { id: 'light_oak_composite', color: 'bg-[#dcc09a]', name: 'Light Oak' },
                            { id: 'black_composite', color: 'bg-[#1f2123]', name: 'Black' },
                            { id: 'dark_grey_composite', color: 'bg-[#4a5057]', name: 'Dark Grey' },
                            { id: 'light_grey_composite', color: 'bg-[#a9aeb2]', name: 'Light Grey' },
                            { id: 'white_composite', color: 'bg-[#e8e6e1]', name: 'White' },
                            { id: 'slate_blue_composite', color: 'bg-[#7c93a6]', name: 'Slate Blue' },
                            { id: 'sage_composite', color: 'bg-[#7e8c74]', name: 'Sage Green' },
                            { id: 'clay_composite', color: 'bg-[#9a6b58]', name: 'Clay' },
                          ].map((cladding) => {
                            const isActive = field.key === 'cladding' 
                               ? room.cladding === cladding.id 
                               : (room as any)[field.key] === cladding.id;
                            return (
                              <div 
                                key={cladding.id} 
                                onClick={() => updateRoom({ [field.key]: cladding.id })} 
                                className={`w-6 h-6 rounded-full p-0.5 cursor-pointer transition-all ${isActive ? 'ring-2 ring-[#3b4d4a] ring-offset-1 shadow-sm scale-110' : 'ring-1 ring-black/5 hover:scale-105 opacity-70 hover:opacity-100'}`} 
                                title={cladding.name}
                              >
                                <div className={`w-full h-full rounded-full shadow-inner ${cladding.color}`}></div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Doors" defaultOpen={true}>
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
                      </select>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-medium text-gray-700">Leaves</span>
                      <select className="bg-gray-50 border border-black/5 rounded-lg px-2 py-1 outline-none text-[#3b4d4a] font-semibold focus:ring-2 focus:ring-[#3b4d4a]" value={door.leaves} onChange={e => wrap(store.updateDoor)(door.id, { leaves: parseInt(e.target.value) })}>
                        {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} Leaf</option>)}
                      </select>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-medium text-gray-700">Style</span>
                      <select className="bg-gray-50 border border-black/5 rounded-lg px-2 py-1 outline-none text-[#3b4d4a] font-semibold focus:ring-2 focus:ring-[#3b4d4a]" value={door.style || 'standard'} onChange={e => wrap(store.updateDoor)(door.id, { style: e.target.value as any })}>
                        <option value="standard">Standard</option>
                        <option value="crittall">Crittall</option>
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
            </CollapsibleSection>

            <CollapsibleSection title="Windows" defaultOpen={true}>
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

            <CollapsibleSection title="Colours & Materials" defaultOpen={true}>
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-2 block">Door/Window Frames</label>
                <div className="flex gap-2">
                  {['anthracite', 'black', 'white', 'silver'].map(col => (
                    <button key={col} onClick={() => updateRoom({ frameColor: col as any })} className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg capitalize transition-colors ${room.frameColor === col ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>
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
                  {['epdm', 'sedum', 'upvc', 'metal'].map(col => (
                    <button key={col} onClick={() => updateRoom({ roofMaterial: col as any })} className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg uppercase transition-colors ${room.roofMaterial === col ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>
                      {col.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>



              <div className="space-y-4 mt-4">
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-2 block">Base / Decking</label>
                  <div className="flex gap-2 flex-wrap">
                    {['concrete', 'timber', 'composite_cedar', 'composite_oak', 'composite_black', 'composite_dark_grey', 'composite_grey', 'composite_brown'].map(col => {
                      const isActive = col === 'concrete' ? room.baseMaterial === 'concrete' : (room.deckingMaterial || room.cladding || 'timber') === col && room.baseMaterial !== 'concrete';
                      return (
                        <button 
                          key={col} 
                          onClick={() => {
                            if (col === 'concrete') {
                              updateRoom({ baseMaterial: 'concrete' });
                            } else {
                              updateRoom({ 
                                baseMaterial: col === 'timber' ? 'timber_decking' : 'composite_decking',
                                deckingMaterial: col as any
                              });
                            }
                          }} 
                          className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg uppercase transition-colors ${isActive ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>
                          {col.replace('composite_', 'comp ').replace('_', ' ')}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Base Model & Features" defaultOpen={true}>

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

            <CollapsibleSection title="Overhangs & Canopy">
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 w-28">Decking Depth</span>
                    <DeferredInput type="number" value={room.deckingSizeMm ?? 1500} onChange={(e) => updateRoom({ deckingSizeMm: parseInt(e.target.value) || 0 })} className="flex-1 bg-white border border-black/5 shadow-sm rounded-lg py-1.5 px-3 text-xs focus:ring-2 focus:ring-[#3b4d4a] outline-none" />
                  </div>
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

            <CollapsibleSection title="Skylights & Lanterns">
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
                      <select value={sky.type} onChange={(e) => wrap(store.updateSkylight)(sky.id, { type: e.target.value as any })} className="bg-gray-50 border border-black/5 rounded-lg px-2 py-1 outline-none text-[#3b4d4a] font-semibold focus:ring-2 focus:ring-[#3b4d4a] text-xs">
                        <option value="lantern">Roof Lantern</option>
                        <option value="flat">Flat Skylight</option>
                      </select>
                    </div>
<DimensionSlider label="Width" min={400} max={3000} step={100} value={sky.widthMm} onChange={(v) => wrap(store.updateSkylight)(sky.id, { widthMm: v })} />
<DimensionSlider label="Length" min={400} max={3000} step={100} value={sky.lengthMm} onChange={(v) => wrap(store.updateSkylight)(sky.id, { lengthMm: v })} />
                  </div>
                ))}
                {(room.skylights || []).length === 0 && <p className="text-xs text-gray-400 text-center py-4">No roof features</p>}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Internal Walls">
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
                    <DimensionSlider label="Length" min={400} max={6000} step={100} value={part.lengthMm} onChange={(v) => wrap(store.updatePartition)(part.id, { lengthMm: v })} />

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

            <CollapsibleSection title="Interior Finishes">
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-medium text-gray-500 mb-2 block">Interior Wall Color</label>
                  <input type="color" value={room.interiorColor || '#ffffff'} onChange={(e) => updateRoom({ interiorColor: e.target.value })} className="w-8 h-8 rounded-full cursor-pointer border-0 shadow-sm overflow-hidden" title="Choose Interior Color"/>
                </div>

                <div>
                  <label className="text-[10px] font-medium text-gray-500 mb-2 block">Interior Floor Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'oak', name: 'Oak' },
                      { id: 'pine', name: 'Pine' },
                      { id: 'walnut', name: 'Walnut' },
                      { id: 'cherry', name: 'Cherry' },
                      { id: 'tiles', name: 'Tiles' },
                      { id: 'carpet', name: 'Carpet' },
                      { id: 'concrete', name: 'Concrete' }
                    ].map(floor => (
                      <button key={floor.id} onClick={() => updateRoom({ interiorFloorType: floor.id as any })} className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg uppercase transition-colors ${room.interiorFloorType === floor.id ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>
                        {floor.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CollapsibleSection>

          </>
        )}

        {tab === 'objects' && (
          <div className="space-y-8">
            <section>
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-4 block">Garden Objects</label>
              <p className="text-[10px] text-gray-500 mb-4">Drag and drop into the scene (plan view recommended).</p>
              <div className="grid grid-cols-2 gap-3">
                {['tree', 'conifer', 'planter', 'bench'].map(type => (
                   <div draggable key={type} onDragStart={(e) => e.dataTransfer.setData('type', type)} className="p-4 border border-gray-200 rounded-xl bg-[#F5F5F0] flex flex-col items-center gap-3 cursor-grab active:cursor-grabbing hover:border-[#5A5A40] hover:shadow-sm transition-all group">
                      <Trees size={32} strokeWidth={1.5} className="text-[#5A5A40] group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#5A5A40]">{type}</span>
                   </div>
                ))}
              </div>
            </section>
            
            <section>
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-4 block">Interior Objects</label>
              <div className="grid grid-cols-2 gap-3">
                {['toilet', 'sink', 'shower', 'desk', 'sofa', 'armchair', 'dining_table', 'coffee_table', 'kitchen_island', 'rug', 'tv', 'bed', 'bookshelf', 'dressing_table', 'wardrobe', 'indoor_plant'].map(type => (
                   <div draggable key={type} onDragStart={(e) => e.dataTransfer.setData('type', type)} className="p-4 border border-gray-200 rounded-xl bg-[#F5F5F0] flex flex-col items-center gap-3 cursor-grab active:cursor-grabbing hover:border-[#5A5A40] hover:shadow-sm transition-all group">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#5A5A40]">{type.replace('_', ' ')}</span>
                   </div>
                ))}
              </div>
            </section>
            
            <section>
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider mb-4 block">Lighting</label>
              <div className="grid grid-cols-2 gap-3">
                {['exterior_wall_light', 'drop_light'].map(type => (
                   <div draggable key={type} onDragStart={(e) => e.dataTransfer.setData('type', type)} className="p-4 border border-gray-200 rounded-xl bg-[#F5F5F0] flex flex-col items-center gap-3 cursor-grab active:cursor-grabbing hover:border-[#5A5A40] hover:shadow-sm transition-all group">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#5A5A40]">{type.replace('_', ' ')}</span>
                   </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
      
      <div className="p-4 border-t border-black/10 bg-white shrink-0 shadow-lg z-20">
        <button 
          onClick={() => {
            const canvas = document.querySelector('canvas');
            if (canvas) {
              const dataUrl = canvas.toDataURL('image/png');
              // Same payload as the canvas button: screenshot for composition,
              // room spec so the AI obeys the configured building exactly.
              const { room: roomSpec } = useStore.getState().scene;
              window.parent.postMessage({ type: 'RENDER_3D_SCENE', image: dataUrl, roomSpec }, window.location.origin);
            }
          }}
          className="w-full bg-[#3b4d4a] hover:bg-[#2d3a38] text-white py-3.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
        >
          Send to Render Engine
        </button>
      </div>
    </div>
  );
}
