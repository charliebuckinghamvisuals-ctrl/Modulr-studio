import { useStore } from '../../store';
import { Trash2, RotateCw } from 'lucide-react';
import { DimensionSlider } from '../DimensionSlider';

export function ObjectEditorPanel() {
  const { selectedObjectId, scene, updateObject, removeObject, viewMode } = useStore();
  const obj = scene.objects.find(o => o.id === selectedObjectId);

  if (!obj || viewMode === 'capture' || viewMode === 'render') return null;

  return (
    <div className="absolute top-24 right-8 bg-white/80 backdrop-blur-2xl border border-black/5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] rounded-2xl p-4 z-20 w-64 text-[#3b4d4a]">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{obj.type} details</h3>
        <button 
          onClick={() => removeObject(obj.id)}
          className="text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-xs font-semibold text-gray-700">Scale</span>
            <span className="text-xs font-mono text-gray-500">{obj.scale.toFixed(1)}x</span>
          </div>
          <input 
            type="range" min="0.5" max="2.0" step="0.1" 
            value={obj.scale} 
            onChange={(e) => updateObject(obj.id, { scale: parseFloat(e.target.value) })}
            className="w-full apple-slider"
          />
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
        
        <button 
          onClick={() => updateObject(obj.id, { rot: obj.rot + Math.PI / 4 })}
          className="w-full flex items-center justify-center gap-2 bg-black/5 hover:bg-black/10 transition-colors rounded-xl p-3 text-xs font-semibold text-gray-700"
        >
          <RotateCw size={14} />
          Rotate 45°
        </button>
      </div>
    </div>
  );
}
