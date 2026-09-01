import { useStore } from '../../store';
import { Trash2, RotateCw, Copy } from 'lucide-react';
import { isWidthAdjustable, NATIVE_WIDTH_MM, WIDTH_RANGE_MM, TINT_MATERIAL, UNIT_COLOURS, hasMetalFinish, METAL_FINISHES, DEFAULT_FINISH } from '../../modelRegistry';
import { DimensionSlider } from '../DimensionSlider';

export function ObjectEditorPanel() {
  const { selectedObjectId, scene, updateObject, removeObject, viewMode } = useStore();
  const obj = scene.objects.find(o => o.id === selectedObjectId);

  if (!obj || viewMode === 'capture' || viewMode === 'render') return null;

  return (
    // Docked bottom-centre so it never covers the object being edited - the
    // old floating top-right card sat over the scene. Frequent actions
    // (rotate / duplicate / delete) live in the mini toolbar at the object.
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-2xl border border-black/5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] rounded-2xl px-5 py-3 z-20 w-80 text-[#3b4d4a]">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{obj.type.replace(/_/g, ' ')}</h3>
        <button
          onClick={() => removeObject(obj.id)}
          className="text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="space-y-3">
        {/* Actions moved here from the pill that floated over the object. */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { const st = useStore.getState(); st.saveState(); st.updateObject(obj.id, { rot: obj.rot + Math.PI / 4 }); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-black/5 hover:bg-black/10 text-[#3b4d4a] text-[10px] font-bold uppercase tracking-wide transition-colors"
          >
            <RotateCw size={13} /> Rotate
          </button>
          <button
            onClick={() => { const st = useStore.getState(); st.saveState(); st.duplicateObject(obj.id); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-black/5 hover:bg-black/10 text-[#3b4d4a] text-[10px] font-bold uppercase tracking-wide transition-colors"
          >
            <Copy size={13} /> Duplicate
          </button>
        </div>
        {/* Door/carcass colour. Only the body material is recoloured, so the
            worktop, sink and handles keep their own finish. */}
        {TINT_MATERIAL[obj.type] && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-gray-700 shrink-0">Colour</span>
            <div className="flex gap-1.5 flex-wrap">
              {UNIT_COLOURS.map(c => {
                const active = (obj.color ?? UNIT_COLOURS[0].hex).toLowerCase() === c.hex.toLowerCase();
                return (
                  <button
                    key={c.hex}
                    title={c.name}
                    onClick={() => updateObject(obj.id, { color: c.hex })}
                    style={{ background: c.hex }}
                    className={`w-6 h-6 rounded-full border transition-all ${
                      active ? 'ring-2 ring-[#3b4d4a] ring-offset-1 border-black/20 scale-110' : 'border-black/15 hover:scale-110'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Metal finish, for taps. Same slot as the paint swatches - a tap
            has no paintable body, so the two never appear together. */}
        {hasMetalFinish(obj.type) && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-gray-700 shrink-0">Finish</span>
            <div className="flex gap-1.5 flex-wrap">
              {METAL_FINISHES.map(f => {
                const active = (obj.color ?? DEFAULT_FINISH[obj.type] ?? METAL_FINISHES[0].hex).toLowerCase() === f.hex.toLowerCase();
                return (
                  <button
                    key={f.hex}
                    title={f.name}
                    onClick={() => updateObject(obj.id, { color: f.hex })}
                    style={{ background: `linear-gradient(135deg, ${f.hex} 30%, #ffffff88 48%, ${f.hex} 62%)`, backgroundColor: f.hex }}
                    className={`w-6 h-6 rounded-full border transition-all ${
                      active ? 'ring-2 ring-[#3b4d4a] ring-offset-1 border-black/20 scale-110' : 'border-black/15 hover:scale-110'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Width, for kitchen units. Stretches the carcass along its length
            only, so depth and worktop height stay correct. */}
        {isWidthAdjustable(obj.type) && (() => {
          const native = NATIVE_WIDTH_MM[obj.type]!;
          const [min, max] = WIDTH_RANGE_MM[obj.type] ?? [native * 0.7, native * 1.5];
          const value = Math.round(obj.widthMm ?? native);
          const set = (v: number) => updateObject(obj.id, { widthMm: Math.max(min, Math.min(max, Math.round(v / 10) * 10)) });
          return (
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-gray-700 shrink-0">Width</span>
              <input
                type="range" min={min} max={max} step={10}
                value={value}
                onChange={e => set(Number(e.target.value))}
                className="w-full apple-slider"
              />
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="number"
                  value={value}
                  min={min}
                  max={max}
                  onChange={e => set(Number(e.target.value))}
                  onKeyDown={e => e.stopPropagation()}
                  className="w-[68px] bg-gray-50 border border-black/5 rounded-lg px-2 py-1 text-xs font-semibold text-[#3b4d4a] outline-none focus:ring-2 focus:ring-[#3b4d4a]"
                />
                <span className="text-[10px] text-gray-400">mm</span>
              </div>
            </div>
          );
        })()}

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-700 shrink-0">Scale</span>
          <input
            type="range" min="0.5" max="2.0" step="0.1"
            value={obj.scale}
            onChange={(e) => updateObject(obj.id, { scale: parseFloat(e.target.value) })}
            className="w-full apple-slider"
          />
          <span className="text-xs font-mono text-gray-500 shrink-0">{obj.scale.toFixed(1)}x</span>
        </div>

        {(obj.type === 'interior_wall' || obj.type === 'interior_door') && (
          <>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">Color</span>
              </div>
              <input 
                type="color" 
                value={obj.color || useStore.getState().scene.room.interiorColor || '#ffffff'} 
                onChange={(e) => updateObject(obj.id, { color: e.target.value })}
                className="w-8 h-8 rounded-full cursor-pointer border-0 shadow-sm overflow-hidden"
              />
            </div>
<DimensionSlider label={obj.type === 'interior_door' ? 'Door Width' : 'Wall Length (Width)'} min={100} max={6000} step={10} value={obj.widthMm || (obj.type === 'interior_door' ? 800 : 1000)} onChange={(v) => updateObject(obj.id, { widthMm: v })} />
<DimensionSlider label={obj.type === 'interior_door' ? 'Frame Depth' : 'Wall Thickness'} min={50} max={500} step={10} value={obj.depthMm || (obj.type === 'interior_door' ? 150 : 100)} onChange={(v) => updateObject(obj.id, { depthMm: v })} />
          </>
        )}

        {obj.type === 'interior_wall' && (
          <>
<DimensionSlider label="L-Shape Return Length" min={0} max={6000} step={10} value={obj.returnLengthMm || 0} onChange={(v) => updateObject(obj.id, { returnLengthMm: v })} />
            
            <div className="pt-4 border-t border-black/5">
              <label className="flex items-center gap-2 mb-4 cursor-pointer text-xs font-semibold text-gray-700">
                <input 
                  type="checkbox" 
                  checked={obj.hasDoorGap || false} 
                  onChange={(e) => updateObject(obj.id, { hasDoorGap: e.target.checked })}
                  className="rounded border-gray-300 text-[#3b4d4a] focus:ring-[#3b4d4a]"
                />
                Add Door Cutout
              </label>

              {obj.hasDoorGap && (
                <div className="space-y-4">
<DimensionSlider label="Cutout Width" min={500} max={2000} step={10} value={obj.doorGapWidthMm || 800} onChange={(v) => updateObject(obj.id, { doorGapWidthMm: v })} />
<DimensionSlider label="Cutout Position" min={-(obj.widthMm||1000)/2} max={(obj.widthMm||1000)/2} step={10} value={obj.doorGapOffsetMm || 0} onChange={(v) => updateObject(obj.id, { doorGapOffsetMm: v })} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
