import { useStore } from '../../store';
import { useEffect, useState } from 'react';
import { Trash2, RotateCw, Copy } from 'lucide-react';
import { isWidthAdjustable, NATIVE_WIDTH_MM, WIDTH_RANGE_MM, TINT_MATERIAL, UNIT_COLOURS, hasMetalFinish, METAL_FINISHES, DEFAULT_FINISH, hasFabric, FABRIC_COLOURS, hasWorktop, WORKTOPS } from '../../modelRegistry';
import { DimensionSlider } from '../DimensionSlider';
import { useSavedColours, addSavedColour, removeSavedColour } from '../../utils/savedColours';
import { resumeWalking } from '../../utils/walk';

/**
 * Hex code entry for the unit colour - lets a customer type an actual paint
 * colour ("Little Greene give the hex on their site"). Accepts 3- or 6-digit
 * hex with or without the #; commits on Enter or blur, and shows the current
 * colour again if the text was not a valid code.
 */
function HexField({ value, onCommit }: { value: string; onCommit: (hex: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  const commit = () => {
    const t = text.trim().replace(/^#/, '').toLowerCase();
    if (/^[0-9a-f]{6}$/.test(t)) return onCommit('#' + t);
    if (/^[0-9a-f]{3}$/.test(t)) return onCommit('#' + t.split('').map(c => c + c).join(''));
    setText(value); // not a colour - put the real one back
  };
  return (
    <input
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      spellCheck={false}
      className="w-[70px] px-1.5 py-0.5 text-[11px] font-mono rounded-md border border-black/10 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#3b4d4a]"
    />
  );
}

/**
 * The unit colour row: preset swatches, the customer's SAVED palette, a
 * colour wheel, a hex field, and - when the current colour is a custom one -
 * a "Save" affordance that names it into the palette. Saved colours live in
 * localStorage (see utils/savedColours), so they follow the customer across
 * units and across designs on this browser.
 */
function ColourRow({ current, onPick, presets = UNIT_COLOURS, label = 'Colour' }: { current: string; onPick: (hex: string) => void; presets?: { name: string; hex: string }[]; label?: string }) {
  const saved = useSavedColours();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const isPreset = presets.some(c => c.hex.toLowerCase() === current);
  const savedMatch = saved.find(c => c.hex.toLowerCase() === current);

  const commitName = () => {
    if (name.trim()) addSavedColour(name, current);
    setNaming(false);
    setName('');
  };

  const ring = (active: boolean) =>
    `w-6 h-6 rounded-full border transition-all ${active ? 'ring-2 ring-[#3b4d4a] ring-offset-1 border-black/20 scale-110' : 'border-black/15 hover:scale-110'}`;

  return (
    <div className="flex items-start gap-3">
      <span className="text-xs font-semibold text-gray-700 shrink-0 pt-1">{label}</span>
      <div className="flex gap-1.5 flex-wrap items-center">
        {presets.map(c => (
          <button key={c.hex} title={c.name} onClick={() => onPick(c.hex)} style={{ background: c.hex }} className={ring(current === c.hex.toLowerCase())} />
        ))}
        {/* The customer's saved palette. Hover a swatch for its name; the x
            removes it from the palette (units already painted keep their
            colour - the design stores the hex itself). */}
        {saved.map(c => (
          <span key={c.hex} className="relative group">
            <button title={c.name} onClick={() => onPick(c.hex)} style={{ background: c.hex }} className={ring(current === c.hex.toLowerCase())} />
            <button
              title={`Remove "${c.name}" from saved colours`}
              onClick={(e) => { e.stopPropagation(); removeSavedColour(c.hex); }}
              className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center w-3.5 h-3.5 rounded-full bg-white border border-black/15 text-gray-500 hover:text-red-500 text-[9px] leading-none shadow-sm"
            >&times;</button>
          </span>
        ))}
        {/* Any-colour input: a real paint colour is a hex code, so the
            picker and the text field both write the same value. */}
        <label
          title="Custom colour"
          className={`relative w-6 h-6 rounded-full border cursor-pointer overflow-hidden transition-all ${
            !isPreset && !savedMatch ? 'ring-2 ring-[#3b4d4a] ring-offset-1 border-black/20 scale-110' : 'border-black/15 hover:scale-110'
          }`}
          style={{ background: !isPreset && !savedMatch ? current : 'conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
        >
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/.test(current) ? current : '#d4d4d4'}
            onChange={(e) => onPick(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
        <HexField value={current} onCommit={onPick} />
        {/* Save the current custom colour under a name. */}
        {!isPreset && !savedMatch && !naming && (
          <button
            onClick={() => setNaming(true)}
            className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-md bg-black/5 hover:bg-black/10 text-[#3b4d4a] transition-colors"
            title="Save this colour to your palette, for other units and other designs"
          >
            Save
          </button>
        )}
        {naming && (
          <input
            autoFocus
            type="text"
            value={name}
            placeholder="Name this colour"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNaming(false); setName(''); } }}
            onBlur={commitName}
            className="w-[110px] px-1.5 py-0.5 text-[11px] rounded-md border border-[#3b4d4a]/40 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#3b4d4a]"
          />
        )}
        {savedMatch && <span className="text-[10px] text-gray-400 italic">{savedMatch.name}</span>}
      </div>
    </div>
  );
}

export function ObjectEditorPanel() {
  const { selectedObjectId, scene, updateObject, removeObject, viewMode, updateRoom } = useStore();
  const obj = scene.objects.find(o => o.id === selectedObjectId);

  if (!obj || viewMode === 'capture' || viewMode === 'render') return null;

  // The walkthrough is the client's view: they can respecify a finish, but
  // the layout is not theirs to change. Everything that would move, copy,
  // delete or resize an item is hidden - only the colour and finish rows and
  // a Done button remain.
  const finishesOnly = viewMode === 'walking';

  return (
    // Docked bottom-centre so it never covers the object being edited - the
    // old floating top-right card sat over the scene. Frequent actions
    // (rotate / duplicate / delete) live in the mini toolbar at the object.
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-2xl border border-black/5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] rounded-2xl px-5 py-3 z-20 w-80 text-[#3b4d4a]">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{obj.type.replace(/_/g, ' ')}</h3>
        {finishesOnly ? (
          <button
            onClick={() => { useStore.getState().setSelectedObjectId(null); resumeWalking(); }}
            className="text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:text-[#3b4d4a] transition-colors"
          >
            Done
          </button>
        ) : (
          <button
            onClick={() => removeObject(obj.id)}
            className="text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="space-y-3">
        {/* Actions moved here from the pill that floated over the object.
            Not rendered at all in the walkthrough - hiding them with CSS
            would leave them clickable by keyboard. */}
        {!finishesOnly && (
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
        )}
        {/* Door/carcass colour. Only the body material is recoloured, so the
            worktop, sink and handles keep their own finish. */}
        {TINT_MATERIAL[obj.type] && (
          <ColourRow current={(obj.color ?? UNIT_COLOURS[0].hex).toLowerCase()} onPick={(hex) => updateObject(obj.id, { color: hex })} />
        )}

        {/* Worktop. Stored on the ROOM, not the unit - a kitchen has one
            worktop, and setting it six times would be a chore. Picking here
            re-surfaces every unit in the room at once. */}
        {hasWorktop(obj.type) && (
          <div className="flex items-start gap-3">
            <span className="text-xs font-semibold text-gray-700 shrink-0 pt-1">Worktop</span>
            <div className="flex gap-1.5 flex-wrap">
              {WORKTOPS.map(wt => {
                const active = (scene.room.worktopMaterial ?? 'carrara') === wt.id;
                return (
                  <button
                    key={wt.id}
                    title={wt.name}
                    onClick={() => updateRoom({ worktopMaterial: wt.id })}
                    style={{ backgroundImage: 'url(textures/' + wt.prefix + '_color.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
                    className={'w-7 h-7 rounded-md border transition-all ' + (active ? 'ring-2 ring-[#3b4d4a] ring-offset-1 border-black/20 scale-110' : 'border-black/15 hover:scale-110')}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Upholstery. The weave stays; the colour multiplies through it. */}
        {hasFabric(obj.type) && (
          <ColourRow
            label="Fabric"
            presets={FABRIC_COLOURS}
            current={(obj.color ?? FABRIC_COLOURS[0].hex).toLowerCase()}
            onPick={(hex) => updateObject(obj.id, { color: hex })}
          />
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
        {!finishesOnly && isWidthAdjustable(obj.type) && (() => {
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
