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

      <div className="p-2 border-b border-black/5 bg-white">
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
            <CollapsibleSection title="Base Model & Features" defaultOpen={true}>
              <div className="grid grid-cols-2 gap-2">
                {['Box', 'Quba', 'LShape', 'Gable', 'TShape', 'CornerCut'].map((shape) => (
                  <div key={shape} onClick={() => updateRoom({ shape: shape as any })} className={`p-3 rounded-xl text-center cursor-pointer transition-all ${room.shape === shape ? 'bg-[#3b4d4a] text-white shadow-md' : 'bg-white border border-black/5 text-gray-600 hover:bg-gray-50'}`}>
                    <span className="text-[11px] font-semibold tracking-wide">{shape}</span>
                  </div>
                ))}
              </div>
              
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

            <CollapsibleSection title="Dimensions">
              <div className="space-y-3">
                {[
                  { label: 'Total Width', key: 'widthMm', hidden: viewMode !== 'plan' },
                  { label: 'Total Depth', key: 'depthMm', hidden: viewMode !== 'plan' },
                  { label: 'Total Front Height', key: 'heightMm' },
                  { label: 'Total Back Height', key: 'backHeightMm' },
                  { label: 'Base Height', key: 'baseHeightMm' },
                  { label: 'Fascia Height', key: 'roofHeightMm' },
                  { label: 'Wall Thickness', key: 'wallThicknessMm' },
                ].filter(d => !d.hidden).map(dim => {
                  const baseH = room.baseHeightMm ?? 100;
                  const roofH = room.roofHeightMm ?? 200;
                  let val = room[dim.key as keyof typeof room] as number;
                  if (dim.key === 'heightMm') val = (room.heightMm ?? 2350) + baseH + roofH;
                  if (dim.key === 'backHeightMm') val = (room.backHeightMm ?? room.heightMm ?? 2350) + baseH + roofH;
                  if (dim.key === 'wallThicknessMm') val = room.wallThicknessMm || 150;

                  return (
                    <div key={dim.key} className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-600 w-28">{dim.label}</span>
                      <DeferredInput type="number" 
                        value={val}
                        onChange={(e) => {
                          let newVal = parseInt(e.target.value) || 0;
                          if (dim.key === 'heightMm' || dim.key === 'backHeightMm') {
                            newVal = Math.max(10, newVal - baseH - roofH);
                          }
                          updateRoom({ [dim.key]: newVal });
                        }} 
                        className="flex-1 bg-white border border-black/5 shadow-sm rounded-lg py-1.5 px-3 text-xs focus:ring-2 focus:ring-[#3b4d4a] focus:border-[#3b4d4a] outline-none transition-shadow" />
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Doors">
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
<DimensionSlider label="Width" min={800} max={6000} step={100} value={door.widthMm} onChange={(v) => wrap(store.updateDoor)(door.id, { widthMm: v })} />
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

            <CollapsibleSection title="Windows">
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

            <CollapsibleSection title="Internal Walls">
              <div className="flex gap-2 mb-4">
                <button onClick={wrap(store.addPartition)} className="flex-1 bg-white border border-[#3b4d4a] text-[#3b4d4a] py-2 px-2 rounded-lg text-xs font-semibold hover:bg-[#3b4d4a] hover:text-white transition-all shadow-sm">+ Wall</button>
                <button onClick={wrap(store.addLShapeWall)} className="flex-1 bg-white border border-[#3b4d4a] text-[#3b4d4a] py-2 px-2 rounded-lg text-xs font-semibold hover:bg-[#3b4d4a] hover:text-white transition-all shadow-sm">+ L-Shape</button>
                <button onClick={wrap(store.addInteriorDoor)} className="flex-1 bg-white border border-[#3b4d4a] text-[#3b4d4a] py-2 px-2 rounded-lg text-xs font-semibold hover:bg-[#3b4d4a] hover:text-white transition-all shadow-sm">+ Door</button>
              </div>
              <div className="space-y-3">
                {room.partitions?.map((part, i) => (
                  <div key={part.id} className="p-4 bg-white border border-black/5 rounded-xl shadow-sm space-y-4 relative group">
                    <button onClick={() => wrap(store.removePartition)(part.id)} className="absolute top-3 right-3 text-red-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 size={14} />
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-800">Wall #{i + 1}</span>
                      <button onClick={(e) => wrap(store.updatePartition)(part.id, { rotation: part.rotation === 0 ? 90 : 0 })} className="text-[10px] font-semibold text-[#3b4d4a] hover:text-blue-600 transition-colors bg-blue-50 px-2 py-1 rounded">
                        Rotate 90°
                      </button>
                    </div>
<DimensionSlider label="Length" min={400} max={6000} step={100} value={part.lengthMm} onChange={(v) => wrap(store.updatePartition)(part.id, { lengthMm: v })} />
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

            <CollapsibleSection title="Exterior Finishes">
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
                            { id: 'composite_wood', color: 'bg-[#a07446]', name: 'Wood Composite' },
                            { id: 'composite_black', color: 'bg-[#2a2c2e]', name: 'Black Composite' },
                            { id: 'composite_grey', color: 'bg-[#5c5c5c]', name: 'Grey Composite' },
                            { id: 'oak', color: 'bg-[#a37e54]', name: 'Natural Oak' },
                            { id: 'cedar', color: 'bg-[#b67a53]', name: 'Cedar' },
                            { id: 'render_white', color: 'bg-[#f4efe0] border border-black/10', name: 'White Render' },
                            { id: 'box_metal_grey', color: 'bg-[#4a4d50]', name: 'Box Metal (Grey)' },
                            { id: 'box_metal_black', color: 'bg-[#1c1e1f]', name: 'Box Metal (Black)' },
                            { id: 'corrugated_metal', color: 'bg-[#808285]', name: 'Corrugated Metal' },
                            { id: 'fire_board_grey', color: 'bg-[#8c9298]', name: 'Fire Board (Grey)' },
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

            <CollapsibleSection title="Exterior Finishes (Misc)">
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
              
              <div className="space-y-4 mt-4">
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-400 tracking-wider mb-2 block">Base / Decking</label>
                  <div className="flex gap-2 flex-wrap">
                    {['concrete', 'timber', 'composite_grey', 'composite_oak', 'composite_cedar', 'composite_brown', 'composite_black'].map(col => {
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
              {room.shape === 'LShape' && (
                <div className="space-y-3 mt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 w-28">L-Shape Width</span>
                    <DeferredInput type="number" value={room.lShapeCutoutWidthMm ?? 2000} onChange={(e) => updateRoom({ lShapeCutoutWidthMm: parseInt(e.target.value) || 0 })} className="flex-1 bg-white border border-black/5 shadow-sm rounded-lg py-1.5 px-3 text-xs focus:ring-2 focus:ring-[#3b4d4a] outline-none" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 w-28">L-Shape Depth</span>
                    <DeferredInput type="number" value={room.lShapeCutoutDepthMm ?? 1500} onChange={(e) => updateRoom({ lShapeCutoutDepthMm: parseInt(e.target.value) || 0 })} className="flex-1 bg-white border border-black/5 shadow-sm rounded-lg py-1.5 px-3 text-xs focus:ring-2 focus:ring-[#3b4d4a] outline-none" />
                  </div>
                </div>
              )}
              {room.shape === 'TShape' && (
                <div className="space-y-3 mt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 w-28">T-Cutout Width</span>
                    <DeferredInput type="number" value={room.lShapeCutoutWidthMm ?? 1000} onChange={(e) => updateRoom({ lShapeCutoutWidthMm: parseInt(e.target.value) || 0 })} className="flex-1 bg-white border border-black/5 shadow-sm rounded-lg py-1.5 px-3 text-xs focus:ring-2 focus:ring-[#3b4d4a] outline-none" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 w-28">T-Cutout Depth</span>
                    <DeferredInput type="number" value={room.lShapeCutoutDepthMm ?? 1000} onChange={(e) => updateRoom({ lShapeCutoutDepthMm: parseInt(e.target.value) || 0 })} className="flex-1 bg-white border border-black/5 shadow-sm rounded-lg py-1.5 px-3 text-xs focus:ring-2 focus:ring-[#3b4d4a] outline-none" />
                  </div>
                </div>
              )}
              {room.shape === 'CornerCut' && (
                <div className="space-y-3 mt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 w-28">Corner Cut Size</span>
                    <DeferredInput type="number" value={room.lShapeCutoutWidthMm ?? 1000} onChange={(e) => updateRoom({ lShapeCutoutWidthMm: parseInt(e.target.value) || 0 })} className="flex-1 bg-white border border-black/5 shadow-sm rounded-lg py-1.5 px-3 text-xs focus:ring-2 focus:ring-[#3b4d4a] outline-none" />
                  </div>
                </div>
              )}
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
      
      <div className="p-4 border-t border-black/5 bg-white">
        <button 
          onClick={() => {
            const canvas = document.querySelector('canvas');
            if (canvas) {
              const dataUrl = canvas.toDataURL('image/png');
              window.parent.postMessage({ type: 'RENDER_3D_SCENE', image: dataUrl }, '*');
            }
          }}
          className="w-full bg-[#3b4d4a] text-white py-3.5 rounded-xl text-sm font-semibold hover:bg-[#2d3a38] transition-all shadow-md flex items-center justify-center gap-2"
        >
          Render in Modulr
        </button>
      </div>
    </div>
  );
}
