import { useStore } from '../../store';
import { useEffect, useState } from 'react';
import { Trash2, RotateCw, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { unitFamily, FAMILY_LABEL, isWidthAdjustable, NATIVE_WIDTH_MM, WIDTH_RANGE_MM, TINT_MATERIAL, UNIT_COLOURS, hasMetalFinish, METAL_FINISHES, DEFAULT_FINISH, hasFabric, FABRIC_COLOURS, hasWorktop, WORKTOPS, isLightFitting, LIGHT_COLOURS, hasTimber, VENEERS, isVeneerFinish } from '../../modelRegistry';
import { DimensionSlider } from '../DimensionSlider';
import { useSavedColours, addSavedColour, removeSavedColour } from '../../utils/savedColours';
import { resumeWalking } from '../../utils/walk';
import { WALL_COLOURS } from './WalkWallPanel';

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
 *
 * onPick's second argument says whether the colour is SETTLED. A swatch is one
 * decisive click, so it is. The colour wheel is not: the browser fires a change
 * on every drag of the picker, so treating those as settled closed the panel
 * the instant you started choosing - the caller must leave the panel up until
 * Done. The hex field settles only on commit, so it counts.
 */
function ColourRow({ current, onPick, presets = UNIT_COLOURS, label = 'Colour' }: { current: string; onPick: (hex: string, settled: boolean) => void; presets?: { name: string; hex: string }[]; label?: string }) {
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
          <button key={c.hex} title={c.name} onClick={() => onPick(c.hex, true)} style={{ background: c.hex }} className={ring(current === c.hex.toLowerCase())} />
        ))}
        {/* The customer's saved palette. Hover a swatch for its name; the x
            removes it from the palette (units already painted keep their
            colour - the design stores the hex itself). */}
        {saved.map(c => (
          <span key={c.hex} className="relative group">
            <button title={c.name} onClick={() => onPick(c.hex, true)} style={{ background: c.hex }} className={ring(current === c.hex.toLowerCase())} />
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
            onChange={(e) => onPick(e.target.value, false)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
        <HexField value={current} onCommit={(hex) => onPick(hex, true)} />
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
  // Declared before the early return below so the hook order never shifts.
  const [collapsed, setCollapsed] = useState(false);
  const { selectedObjectId, scene, updateObject, removeObject, viewMode, updateRoom, recolourUnits } = useStore();
  // Defaults to the selected unit's own run - the usual intent. Reset when a
  // different family is selected so it never silently paints the wrong run.
  const [scope, setScope] = useState<any>(null);
  const obj = scene.objects.find(o => o.id === selectedObjectId);
  // Worked out BEFORE the early return: a hook after it would change the hook
  // order the moment nothing is selected, which React refuses outright.
  const family = obj ? unitFamily(obj.type) : undefined;
  useEffect(() => { setScope(family ?? null); }, [family, obj?.id]);

  if (!obj || viewMode === 'capture' || viewMode === 'render') return null;

  // The walkthrough is the client's view: they can respecify a finish, but
  // the layout is not theirs to change. Everything that would move, copy,
  // delete or resize an item is hidden - only the colour and finish rows and
  // a Done button remain.
  const finishesOnly = viewMode === 'walking';

  /**
   * In the walkthrough, choosing a finish IS the whole errand - so it puts the
   * panel away and hands you straight back to walking. Anywhere else the panel
   * stays put, because there you are still laying the room out.
   */
  const afterPick = () => {
    if (!finishesOnly) return;
    useStore.getState().setSelectedObjectId(null);
    resumeWalking();
  };

  return (
    // Docked bottom-centre so it never covers the object being edited - the
    // old floating top-right card sat over the scene. Frequent actions
    // (rotate / duplicate / delete) live in the mini toolbar at the object.
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-2xl border border-black/5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] rounded-2xl px-5 py-3 z-20 w-80 text-[#3b4d4a]">
      <div className={`flex justify-between items-center ${collapsed ? '' : 'mb-2'}`}>
        <div className="flex items-center gap-2">
          {/* Minimise to the header only. Docked bottom-centre, this panel
              sits over the floor in the walkthrough and over the bottom of
              the plan while you are dragging - handy until it is exactly
              where you need to see. One click folds it to a strip. */}
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand' : 'Minimise'}
            className="text-gray-400 hover:text-[#3b4d4a] transition-colors"
          >
            {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{obj.type.replace(/_/g, ' ')}</h3>
        </div>
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

      {!collapsed && (
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
        {/*
          Which cabinets this colour lands on.
          A door colour belongs to a RUN, not one carcass - see UNIT_FAMILY.
          Defaults to the whole family the selected unit is in, because that
          is what someone almost always means, with "just this one" there for
          the exception rather than as the only option.
        */}
        {/*
          Bespoke takes a unit OUT of its run for good - an island in a
          contrasting colour with its own worktop. Without it, "just this one"
          lasted only until the next run recolour painted over it.
        */}
        {family && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">
                Bespoke unit
                <span className="block text-[10px] font-normal text-gray-400 leading-tight">
                  {obj.independent
                    ? 'Its own colour and worktop, ignores the run'
                    : `Follows ${FAMILY_LABEL[family].toLowerCase()}`}
                </span>
              </span>
              <button
                onClick={() => updateObject(obj.id, { independent: !obj.independent })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all shrink-0 ${obj.independent ? 'bg-emerald-500' : 'bg-gray-300/60'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all shadow-md ${obj.independent ? 'translate-x-[24px]' : 'translate-x-[3px]'}`} />
              </button>
            </div>
            {!obj.independent && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-gray-700 shrink-0">Apply to</span>
                <div className="flex gap-1 flex-wrap">
                  {([family, 'all'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setScope(s)}
                      className={`px-2 py-1 text-[10px] font-semibold rounded-md uppercase tracking-wide transition-colors ${
                        scope === s ? 'bg-[#3b4d4a] text-white' : 'bg-black/5 text-gray-600 hover:bg-black/10'
                      }`}
                    >
                      {s === 'all' ? 'All units' : FAMILY_LABEL[family]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Its own worktop, once it is bespoke. */}
        {obj.independent && hasWorktop(obj.type) && (
          <div className="flex items-start gap-3">
            <span className="text-xs font-semibold text-gray-700 shrink-0 pt-1">Its worktop</span>
            <div className="flex gap-1.5 flex-wrap">
              {WORKTOPS.map(wt => (
                <button
                  key={wt.id}
                  title={wt.name}
                  onClick={() => { updateObject(obj.id, { worktopMaterial: wt.id }); afterPick(); }}
                  style={{ backgroundImage: 'url(textures/' + wt.prefix + '_color.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
                  className={'w-7 h-7 rounded-md border transition-all ' + ((obj.worktopMaterial ?? scene.room.worktopMaterial ?? 'carrara') === wt.id ? 'ring-2 ring-[#3b4d4a] ring-offset-1 border-black/20 scale-110' : 'border-black/15 hover:scale-110')}
                />
              ))}
            </div>
          </div>
        )}

        {/* Wood on a timber piece: its own finish, or one of the veneers. */}
        {hasTimber(obj.type) && (
          <div className="flex items-start gap-3">
            <span className="text-xs font-semibold text-gray-700 shrink-0 pt-1">Wood</span>
            <div className="flex gap-1.5 flex-wrap items-center">
              <button
                title="As modelled"
                onClick={() => { updateObject(obj.id, { veneer: undefined }); afterPick(); }}
                className={'px-2 h-7 rounded-md border text-[10px] font-semibold transition-all ' + (!obj.veneer ? 'bg-[#3b4d4a] text-white border-transparent' : 'bg-white text-gray-600 border-black/15 hover:bg-gray-50')}
              >Natural</button>
              {VENEERS.map(v => (
                <button
                  key={v.id}
                  title={v.name}
                  onClick={() => { updateObject(obj.id, { veneer: v.id }); afterPick(); }}
                  style={{ backgroundImage: 'url(textures/' + v.prefix + '_color.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
                  className={'w-7 h-7 rounded-md border transition-all ' + (obj.veneer === v.id ? 'ring-2 ring-[#3b4d4a] ring-offset-1 border-black/20 scale-110' : 'border-black/15 hover:scale-110')}
                />
              ))}
            </div>
          </div>
        )}

        {TINT_MATERIAL[obj.type] && (
          <ColourRow
            current={(obj.color ?? UNIT_COLOURS[0].hex).toLowerCase()}
            onPick={(hex, settled) => {
              if (family && !obj.independent) recolourUnits(scope === 'all' ? 'all' : family, hex);
              else updateObject(obj.id, { color: hex });
              if (settled) afterPick();
            }}
          />
        )}

        {/* Wood grain under the colours, on the cabinet itself - Charlie
            wanted it here, not only on the Kitchen tab. The door finish is
            kitchen-wide (see UNIT_FINISHES), so a veneer picked on one unit
            veneers the run, and Paint hands the colours above back. */}
        {TINT_MATERIAL[obj.type] && family && (() => {
          const current = scene.room.unitFinish;
          const veneered = isVeneerFinish(current);
          return (
            <div className="flex items-start gap-3">
              <span className="text-xs font-semibold text-gray-700 shrink-0 pt-1">Wood</span>
              <div className="flex gap-1.5 flex-wrap items-center">
                <button
                  title="Painted doors"
                  onClick={() => { updateRoom({ unitFinish: 'satin' }); afterPick(); }}
                  className={'px-2 h-7 rounded-md border text-[10px] font-semibold transition-all ' + (!veneered ? 'bg-[#3b4d4a] text-white border-transparent' : 'bg-white text-gray-600 border-black/15 hover:bg-gray-50')}
                >Paint</button>
                {VENEERS.map(v => (
                  <button
                    key={v.id}
                    title={v.name}
                    onClick={() => { updateRoom({ unitFinish: v.id }); afterPick(); }}
                    style={{ backgroundImage: 'url(textures/' + v.prefix + '_color.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
                    className={'w-7 h-7 rounded-md border transition-all ' + (current === v.id ? 'ring-2 ring-[#3b4d4a] ring-offset-1 border-black/20 scale-110' : 'border-black/15 hover:scale-110')}
                  />
                ))}
              </div>
            </div>
          );
        })()}

        {/* Lamp colour temperature. Warm or cool changes how the whole room
            reads, so it belongs on the fitting rather than buried in a menu. */}
        {isLightFitting(obj.type) && (
          <ColourRow
            label="Lamp"
            presets={LIGHT_COLOURS}
            current={(obj.color ?? LIGHT_COLOURS[0].hex).toLowerCase()}
            onPick={(hex, settled) => { updateObject(obj.id, { color: hex }); if (settled) afterPick(); }}
          />
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
                    onClick={() => { updateRoom({ worktopMaterial: wt.id }); afterPick(); }}
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
            onPick={(hex, settled) => { updateObject(obj.id, { color: hex }); if (settled) afterPick(); }}
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
                    onClick={() => { updateObject(obj.id, { color: f.hex }); afterPick(); }}
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
            {/* The same swatches the room's own walls offer, rather than the
                bare colour well this had: one native picker with no presets
                is why repainting a partition to match the room was so
                awkward. Falls back to the room colour, so an untouched
                partition follows the walls automatically. */}
            <ColourRow
              label="Colour"
              presets={WALL_COLOURS}
              current={(obj.color || scene.room.interiorColor || '#ffffff').toLowerCase()}
              onPick={(hex, settled) => { updateObject(obj.id, { color: hex }); if (settled) afterPick(); }}
            />
            {!finishesOnly && (
              <>
{obj.type === 'interior_door' && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-gray-700 shrink-0">Style</span>
                <div className="flex gap-1.5">
                  {([['flush', 'Flush'], ['panelled', 'Panelled'], ['glazed', 'Half Glazed']] as const).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => updateObject(obj.id, { doorStyle: id })}
                      className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-md transition-colors ${(obj.doorStyle ?? 'flush') === id ? 'bg-[#3b4d4a] text-white' : 'bg-black/5 hover:bg-black/10 text-[#3b4d4a]'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
<DimensionSlider
  label={obj.type === 'interior_door' ? 'Door Width' : 'Wall Length (grows from the far end)'}
  min={100} max={6000} step={10}
  value={obj.widthMm || (obj.type === 'interior_door' ? 800 : 1000)}
  onChange={(v) => {
    if (obj.type !== 'interior_wall') { updateObject(obj.id, { widthMm: v }); return; }
    // A wall grows from ONE end. Growing from the centre moved both ends,
    // so a wall lined up on a corner drifted off it every time it was
    // lengthened. The start end stays put; the centre shifts by half the
    // change along the wall's own axis (rotation.y = r maps local +X to
    // world (cos r, 0, -sin r)).
    const half = (v - (obj.widthMm || 1000)) / 2000;
    const r = obj.rot || 0;
    updateObject(obj.id, { widthMm: v, x: obj.x + half * Math.cos(r), z: obj.z - half * Math.sin(r) });
  }}
/>
<DimensionSlider label={obj.type === 'interior_door' ? 'Frame Depth' : 'Wall Thickness'} min={50} max={500} step={10} value={obj.depthMm || (obj.type === 'interior_door' ? 150 : 100)} onChange={(v) => updateObject(obj.id, { depthMm: v })} />
              </>
            )}
          </>
        )}

        {obj.type === 'interior_wall' && !finishesOnly && (
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
                <div className="space-y-2">
<DimensionSlider label="Opening Width" min={500} max={2000} step={10} value={obj.doorGapWidthMm || 800} onChange={(v) => updateObject(obj.id, { doorGapWidthMm: v })} />
                  {/* Where it goes is set on the wall itself - the handle
                      slides it, the label takes a typed distance, and the
                      other run offers to take it. See PartitionOpenings. */}
                  <p className="text-[10px] text-gray-400 leading-snug">Position it on the wall: drag the green handle, click the distance to type one, or use "Move door here" on the other run.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      )}
    </div>
  );
}
