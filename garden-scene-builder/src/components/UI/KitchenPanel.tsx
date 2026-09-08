import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import {
  UNIT_COLOURS, UNIT_FINISHES, VENEERS, WORKTOPS, FAMILY_LABEL, UNIT_FAMILY,
  type UnitFamily,
} from '../../modelRegistry';
import { useSavedColours, addSavedColour } from '../../utils/savedColours';
import { useState } from 'react';

/**
 * Everything that belongs to the kitchen as a WHOLE, in one place.
 *
 * A kitchen is specified as a set of decisions - door colour, finish, worktop
 * - that apply across a run, not cabinet by cabinet. Scattering those through
 * a furniture picker meant repeating one decision six times and getting it
 * inconsistent. Per-unit overrides still live on the object panel, for the
 * island in a contrasting colour.
 *
 * Only shown once there is a kitchen to talk about.
 */

const FAMILIES: UnitFamily[] = ['base', 'wall', 'tall'];

export function KitchenPanel() {
  const { objects, room, recolourUnits, updateRoom } = useStore(useShallow(s => ({
    // Never filter in a selector - a fresh array every call renders forever.
    objects: s.scene.objects,
    room: s.scene.room,
    recolourUnits: s.recolourUnits,
    updateRoom: s.updateRoom,
  })));
  const saved = useSavedColours();
  const [naming, setNaming] = useState<string | null>(null);
  const [name, setName] = useState('');

  const present = new Set(
    objects.map(o => UNIT_FAMILY[o.type]).filter(Boolean) as UnitFamily[],
  );
  const countOf = (f: UnitFamily) => objects.filter(o => UNIT_FAMILY[o.type] === f).length;
  /** What a family is currently painted, if its units agree. */
  const colourOf = (f: UnitFamily) => {
    const cs = new Set(objects.filter(o => UNIT_FAMILY[o.type] === f).map(o => (o.color ?? UNIT_COLOURS[0].hex).toLowerCase()));
    return cs.size === 1 ? [...cs][0] : null;
  };

  if (!present.size) {
    return (
      <p className="text-[10px] text-gray-400 leading-snug">
        Add cabinets from Objects and their colours, finish and worktop will be set here.
      </p>
    );
  }

  const finish = room.unitFinish ?? 'satin';
  const swatch = (active: boolean) =>
    `w-6 h-6 rounded-full border transition-all ${active ? 'ring-2 ring-[#3b4d4a] ring-offset-1 border-black/20 scale-110' : 'border-black/15 hover:scale-110'}`;

  return (
    <div className="space-y-4">
      {/* Door finish: one product across the kitchen, as it is specified. */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Door finish</span>
        <div className="grid grid-cols-3 gap-1.5">
          {UNIT_FINISHES.map(f => (
            <button
              key={f.id}
              onClick={() => updateRoom({ unitFinish: f.id })}
              className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg uppercase transition-colors ${
                finish === f.id ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'
              }`}
            >{f.name}</button>
          ))}
        </div>
        {/* Or a veneer instead of paint: the doors take the wood, grain up,
            and the colour rows below no longer apply to them. */}
        <div className="grid grid-cols-3 gap-1.5">
          {VENEERS.map(v => (
            <button
              key={v.id}
              title={v.name}
              onClick={() => updateRoom({ unitFinish: v.id })}
              style={{ backgroundImage: 'url(textures/' + v.prefix + '_color.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
              className={`h-9 rounded-lg border text-[9px] font-bold uppercase tracking-wide text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.7)] transition-all ${
                finish === v.id ? 'ring-2 ring-[#3b4d4a] ring-offset-1 border-black/20' : 'border-black/10 hover:scale-[1.03]'
              }`}
            >{v.name}</button>
          ))}
        </div>
      </div>

      {/* One colour row per run that actually exists in the design. */}
      {FAMILIES.filter(f => present.has(f)).map(f => {
        const current = colourOf(f);
        return (
          <div key={f} className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              {FAMILY_LABEL[f]} <span className="text-gray-300 normal-case font-medium">&middot; {countOf(f)}</span>
              {current === null && <span className="text-amber-500 normal-case font-medium"> &middot; mixed</span>}
            </span>
            <div className="flex gap-1.5 flex-wrap items-center">
              {UNIT_COLOURS.map(c => (
                <button key={c.hex} title={c.name} onClick={() => recolourUnits(f, c.hex)}
                  style={{ background: c.hex }} className={swatch(current === c.hex.toLowerCase())} />
              ))}
              {saved.map(c => (
                <button key={c.hex} title={c.name} onClick={() => recolourUnits(f, c.hex)}
                  style={{ background: c.hex }} className={swatch(current === c.hex.toLowerCase())} />
              ))}
              {/* Save the run's colour to the palette so it can be reused on
                  another run, and on the next design. */}
              {current && !UNIT_COLOURS.some(c => c.hex.toLowerCase() === current)
                && !saved.some(c => c.hex.toLowerCase() === current) && (
                naming === f ? (
                  <input
                    autoFocus type="text" value={name} placeholder="Name it"
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { if (name.trim()) addSavedColour(name, current); setNaming(null); setName(''); }
                      if (e.key === 'Escape') { setNaming(null); setName(''); }
                    }}
                    onBlur={() => { if (name.trim()) addSavedColour(name, current); setNaming(null); setName(''); }}
                    className="w-[92px] px-1.5 py-0.5 text-[11px] rounded-md border border-[#3b4d4a]/40 bg-white focus:outline-none"
                  />
                ) : (
                  <button onClick={() => setNaming(f)}
                    className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-md bg-black/5 hover:bg-black/10 text-[#3b4d4a]">
                    Save
                  </button>
                )
              )}
            </div>
          </div>
        );
      })}

      {present.size > 1 && (
        <button
          onClick={() => {
            const base = colourOf('base') ?? UNIT_COLOURS[0].hex;
            recolourUnits('all', base);
          }}
          className="w-full py-2 rounded-lg bg-black/5 hover:bg-black/10 text-[10px] font-bold uppercase tracking-wide text-[#3b4d4a] transition-colors"
        >
          Match everything to the base units
        </button>
      )}

      <div className="space-y-1.5 pt-3 border-t border-black/5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Worktop</span>
        <div className="flex gap-1.5 flex-wrap">
          {WORKTOPS.map(wt => (
            <button key={wt.id} title={wt.name} onClick={() => updateRoom({ worktopMaterial: wt.id })}
              style={{ backgroundImage: `url(textures/${wt.prefix}_color.jpg)`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              className={`w-7 h-7 rounded-md border transition-all ${
                (room.worktopMaterial ?? 'carrara') === wt.id
                  ? 'ring-2 ring-[#3b4d4a] ring-offset-1 border-black/20 scale-110'
                  : 'border-black/15 hover:scale-110'
              }`} />
          ))}
        </div>
      </div>
    </div>
  );
}
