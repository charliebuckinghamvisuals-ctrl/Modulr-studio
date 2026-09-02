import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useStore } from '../../store';
import { resumeWalking } from '../../utils/walk';

/**
 * Wall colour, chosen by clicking a wall in the walkthrough.
 *
 * Floors and units already had a panel each; walls had none, and because they
 * were not pickable at all a click on one fell through and opened whichever
 * surface sat behind it. This is the third of the set, and it writes
 * room.interiorColor - the same value every interior face already reads.
 *
 * Deliberately the same shape and position as WalkFloorPanel: same dock, same
 * collapse control, same Done. In the walkthrough the client is picking
 * finishes, and three panels that behave differently would be three things to
 * learn rather than one.
 */

const WALL_COLOURS = [
  { name: 'Brilliant White', hex: '#ffffff' },
  { name: 'Chalk',           hex: '#f4f1ea' },
  { name: 'Soft Stone',      hex: '#e8e2d8' },
  { name: 'Warm Grey',       hex: '#d9d5cf' },
  { name: 'Clay',            hex: '#cfc3b4' },
  { name: 'Sage',            hex: '#c3ccbe' },
  { name: 'Duck Egg',        hex: '#c2d3d2' },
  { name: 'Slate',           hex: '#9aa3a6' },
  { name: 'Charcoal',        hex: '#4a4f52' },
];

export function WalkWallPanel() {
  const open = useStore(s => s.walkWallOpen);
  const setOpen = useStore(s => s.setWalkWallOpen);
  const room = useStore(s => s.scene.room);
  const updateRoom = useStore(s => s.updateRoom);
  const [collapsed, setCollapsed] = useState(false);

  if (!open) return null;

  const current = (room.interiorColor || '#ffffff').toLowerCase();

  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-2xl border border-black/5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] rounded-2xl px-5 py-3 z-20 w-80 text-[#3b4d4a]">
      <div className={`flex justify-between items-center ${collapsed ? '' : 'mb-2'}`}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand' : 'Minimise'}
            className="text-gray-400 hover:text-[#3b4d4a] transition-colors"
          >
            {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Walls</h3>
        </div>
        <button
          onClick={() => { setOpen(false); resumeWalking(); }}
          className="text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:text-[#3b4d4a] transition-colors"
        >
          Done
        </button>
      </div>

      {!collapsed && (
        <div className="flex gap-1.5 flex-wrap items-center">
          {WALL_COLOURS.map(c => (
            <button
              key={c.hex}
              title={c.name}
              onClick={() => updateRoom({ interiorColor: c.hex })}
              style={{ background: c.hex }}
              className={`w-7 h-7 rounded-full border transition-all ${
                current === c.hex.toLowerCase()
                  ? 'ring-2 ring-[#3b4d4a] ring-offset-1 border-black/20 scale-110'
                  : 'border-black/15 hover:scale-110'
              }`}
            />
          ))}
          {/* Any colour, for a customer who has a paint reference to hand. */}
          <label
            title="Custom colour"
            className="relative w-7 h-7 rounded-full border border-black/15 cursor-pointer overflow-hidden hover:scale-110 transition-all"
            style={{ background: 'conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
          >
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/.test(current) ? current : '#ffffff'}
              onChange={(e) => updateRoom({ interiorColor: e.target.value })}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        </div>
      )}
    </div>
  );
}
