import { useState } from 'react';
import { ChevronDown, ChevronUp, DoorOpen, DoorClosed } from 'lucide-react';
import { useStore } from '../../store';
import { resumeWalking } from '../../utils/walk';
import { INTERIOR_DOOR_STYLES, METAL_FINISHES } from '../../modelRegistry';
import type { InteriorDoorStyle } from '../../types';

/**
 * An internal wall's doors, edited by clicking the wall in the walkthrough.
 *
 * Standing in the room is where a door gets judged, so this is where it is
 * chosen: per door, the set (plain opening, oak, painted white), the
 * ironmongery finish, and a button that swings that one leaf so you can
 * see it open without opening every door in the building. A wall with no
 * door yet offers to add one in the middle.
 *
 * Same dock, collapse control and Done as the other walkthrough panels.
 * Picks do NOT close the panel: comparing oak against white, or chrome
 * against brass, is exactly the moment you want to keep looking.
 */
/**
 * Which side of a door's wall the walker is standing on, +1 or -1 in the
 * door's own frame - so the swing chips can say "towards me" and "away from
 * me" rather than a wall-relative side nobody can picture.
 */
function walkerSide(part: { xMm: number; zMm: number; rotation: 0 | 90; lengthMm: number; thicknessMm: number; legEnd?: 1 | -1 }, onLeg?: boolean): 1 | -1 {
  const cam = (window as any).__modulrCamera;
  if (!cam) return 1;
  const a = part.rotation === 90 ? Math.PI / 2 : 0;
  const wx = cam.position.x - part.xMm / 1000;
  const wz = cam.position.z - part.zMm / 1000;
  // World to the wall's local frame (the inverse of its Y rotation).
  const lx = wx * Math.cos(a) - wz * Math.sin(a);
  const lz = wx * Math.sin(a) + wz * Math.cos(a);
  if (!onLeg) return lz >= 0 ? 1 : -1;
  // A leg door's group is turned a quarter, so its +Z is the wall's +X,
  // measured from where the leg stands.
  const le = part.legEnd === -1 ? -1 : 1;
  const legX = le * (part.lengthMm / 2000 - part.thicknessMm / 2000);
  return lx - legX >= 0 ? 1 : -1;
}

export function WalkDoorPanel() {
  const open = useStore(s => s.walkDoorOpen);
  const setOpen = useStore(s => s.setWalkDoorOpen);
  const partId = useStore(s => s.walkDoorPartId);
  const part = useStore(s => (s.scene.room.partitions || []).find(p => p.id === partId));
  const updatePartitionDoor = useStore(s => s.updatePartitionDoor);
  const addPartitionDoor = useStore(s => s.addPartitionDoor);
  const openIds = useStore(s => s.openDoorIds);
  const toggleDoorOpen = useStore(s => s.toggleDoorOpen);
  const [collapsed, setCollapsed] = useState(false);

  if (!open || !part) return null;

  const doors = part.doors || [];
  const chip = (active: boolean) =>
    `px-2.5 py-1 text-[10px] font-semibold rounded-full border transition-colors ${
      active ? 'bg-[#3b4d4a] text-white border-transparent' : 'bg-white text-gray-600 border-black/10 hover:bg-gray-50'
    }`;

  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-2xl border border-black/5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] rounded-2xl px-5 py-3 z-20 w-[22rem] text-[#3b4d4a]">
      <div className={`flex justify-between items-center ${collapsed ? '' : 'mb-2'}`}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand' : 'Minimise'}
            className="text-gray-400 hover:text-[#3b4d4a] transition-colors"
          >
            {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Internal Door</h3>
        </div>
        <button
          onClick={() => { setOpen(false); resumeWalking(); }}
          className="text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:text-[#3b4d4a] transition-colors"
        >
          Done
        </button>
      </div>

      {!collapsed && (
        <div className="flex flex-col gap-3">
          {doors.length === 0 && (
            <button
              onClick={() => addPartitionDoor(part.id)}
              className="w-full text-[10px] font-semibold text-[#3b4d4a] bg-[#3b4d4a]/5 hover:bg-[#3b4d4a]/10 rounded-lg py-2 transition-colors"
            >
              + Add a door to this wall
            </button>
          )}
          {doors.map((dr, i) => {
            const isOpen = openIds.includes(dr.id);
            const finish = (dr.ironmongery ?? METAL_FINISHES[0].hex).toLowerCase();
            return (
              <div key={dr.id} className={`flex flex-col gap-2 ${i > 0 ? 'pt-2 border-t border-black/5' : ''}`}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-14">{doors.length > 1 ? `Door ${i + 1}` : 'Door'}</span>
                  <button onClick={() => updatePartitionDoor(part.id, dr.id, { style: undefined })} className={chip(!dr.style)}>Opening</button>
                  {(Object.entries(INTERIOR_DOOR_STYLES) as [InteriorDoorStyle, { name: string }][]).map(([k, v]) => (
                    <button key={k} onClick={() => updatePartitionDoor(part.id, dr.id, { style: k })} className={chip(dr.style === k)}>{v.name}</button>
                  ))}
                </div>
                {dr.style && (() => {
                  const me = walkerSide(part as any, dr.onLeg);
                  const swing = dr.swing ?? 1;
                  return (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-14">Opens</span>
                      <button onClick={() => updatePartitionDoor(part.id, dr.id, { swing: me })} className={chip(swing === me)}>Towards me</button>
                      <button onClick={() => updatePartitionDoor(part.id, dr.id, { swing: (me * -1) as 1 | -1 })} className={chip(swing !== me)}>Away from me</button>
                    </div>
                  );
                })()}
                {dr.style && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-14">Handle</span>
                    {METAL_FINISHES.map(f => (
                      <button
                        key={f.hex}
                        title={f.name}
                        onClick={() => updatePartitionDoor(part.id, dr.id, { ironmongery: f.hex })}
                        style={{ background: f.hex }}
                        className={`w-6 h-6 rounded-full border transition-all ${
                          finish === f.hex.toLowerCase()
                            ? 'ring-2 ring-[#3b4d4a] ring-offset-1 border-black/20 scale-110'
                            : 'border-black/15 hover:scale-110'
                        }`}
                      />
                    ))}
                    <button
                      onClick={() => toggleDoorOpen(dr.id)}
                      title={isOpen ? 'Close this door' : 'Open this door'}
                      className="ml-auto flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-full border border-black/10 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      {isOpen ? <DoorClosed size={12} /> : <DoorOpen size={12} />}
                      {isOpen ? 'Close' : 'Open'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
