import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useStore } from '../../store';
import { resumeWalking } from '../../utils/walk';
import { FRAME_COLOURS } from '../../utils/frameColours';
import type { FrameColorType, GlazingStyle } from '../../types';

/**
 * Windows and doors, edited by clicking one in the walkthrough.
 *
 * Colour rows first, inside before outside: standing in the room it is the
 * inside face you are looking at, and "black outside, white inside" is a
 * normal thing to specify. Inside can be told to match outside, which is what
 * every design did before the two were separated.
 *
 * Below that, the glazing style of the opening you clicked (standard,
 * crittall bars, or a solid leaf for a door) and the frame profile for the
 * whole room. Those two do NOT close the panel on a pick: the point of trying
 * slim against ultra-slim is to look at both, so the panel stays until Done.
 *
 * Same dock, collapse control and Done as the floor and wall panels - one
 * behaviour to learn, not three.
 */
const PROFILES: { id: 'default' | 'slim' | 'ultra-slim'; name: string }[] = [
  { id: 'default', name: 'Standard' },
  { id: 'slim', name: 'Slim' },
  { id: 'ultra-slim', name: 'Ultra slim' },
];

export function WalkFramePanel() {
  const open = useStore(s => s.walkFrameOpen);
  const setOpen = useStore(s => s.setWalkFrameOpen);
  const targetId = useStore(s => s.walkFrameId);
  const room = useStore(s => s.scene.room);
  const updateRoom = useStore(s => s.updateRoom);
  const updateDoor = useStore(s => s.updateDoor);
  const updateWindow = useStore(s => s.updateWindow);
  const [collapsed, setCollapsed] = useState(false);

  if (!open) return null;

  const outer = room.frameColor;
  const inner = room.frameColorInner ?? room.frameColor;
  const matched = room.frameColorInner === undefined;

  // The opening that was clicked, if it still exists.
  const door = room.doors?.find(d => d.id === targetId);
  const win = !door ? room.windows?.find(w => w.id === targetId) : undefined;
  const style = (door?.style ?? win?.style ?? 'standard') as GlazingStyle;
  const styles: { id: GlazingStyle; name: string }[] = [
    { id: 'standard', name: 'Standard' },
    { id: 'crittall', name: 'Crittall' },
    ...(door ? [{ id: 'solid' as GlazingStyle, name: 'Solid' }] : []),
  ];
  const setStyle = (id: GlazingStyle) => {
    if (door) updateDoor(door.id, { style: id });
    else if (win) updateWindow(win.id, { style: id });
  };
  const profile = room.frameStyle ?? 'default';

  const chip = (active: boolean) =>
    `px-2.5 py-1 text-[10px] font-semibold rounded-full border transition-colors ${
      active ? 'bg-[#3b4d4a] text-white border-transparent' : 'bg-white text-gray-600 border-black/10 hover:bg-gray-50'
    }`;

  // Pick a colour, and you are walking again - see WalkWallPanel for why.
  const pick = (patch: Partial<typeof room>) => { updateRoom(patch); setOpen(false); resumeWalking(); };

  const swatches = (current: FrameColorType, onPick: (id: FrameColorType) => void) =>
    FRAME_COLOURS.map(c => (
      <button
        key={c.id}
        title={c.name}
        onClick={() => onPick(c.id)}
        style={{ background: c.hex }}
        className={`w-7 h-7 rounded-full border transition-all ${
          current === c.id
            ? 'ring-2 ring-[#3b4d4a] ring-offset-1 border-black/20 scale-110'
            : 'border-black/15 hover:scale-110'
        }`}
      />
    ));

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
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Window &amp; Door Frames</h3>
        </div>
        <button
          onClick={() => { setOpen(false); resumeWalking(); }}
          className="text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:text-[#3b4d4a] transition-colors"
        >
          Done
        </button>
      </div>

      {!collapsed && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-14">Inside</span>
            {swatches(inner, id => pick({ frameColorInner: id }))}
            <button
              title="Same colour as outside"
              onClick={() => pick({ frameColorInner: undefined })}
              className={`ml-1 px-2 py-1 text-[9px] font-semibold rounded-full border transition-colors ${
                matched ? 'bg-[#3b4d4a] text-white border-transparent' : 'bg-white text-gray-500 border-black/10 hover:bg-gray-50'
              }`}
            >
              Match
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-14">Outside</span>
            {swatches(outer, id => pick({ frameColor: id }))}
          </div>
          {(door || win) && (
            <div className="flex items-center gap-1.5 pt-2 border-t border-black/5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-14">{door ? 'Door' : 'Window'}</span>
              {styles.map(s => (
                <button key={s.id} onClick={() => setStyle(s.id)} className={chip(style === s.id)}>{s.name}</button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-14">Frame</span>
            {PROFILES.map(p => (
              <button key={p.id} onClick={() => updateRoom({ frameStyle: p.id })} className={chip(profile === p.id)}>{p.name}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
