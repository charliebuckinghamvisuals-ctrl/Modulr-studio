import { Paintbrush } from 'lucide-react';
import { useStore } from '../../store';

/** One key on the little WASD diagram. */
function Key({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center h-[18px] ${wide ? 'px-2' : 'w-[18px]'} rounded-[4px] bg-white/15 border border-white/25 text-[9px] font-bold text-white/90 leading-none`}
    >
      {children}
    </span>
  );
}

/**
 * Walkthrough heads-up display.
 *
 * Three states, and the order of them is the whole interaction:
 *
 *   walking  - a bare dot, nothing in the way, free to move and look
 *   armed    - you clicked something, so a brush appears over it
 *   editing  - you clicked the brush, so its finishes are open
 *
 * Picking a finish drops straight back to walking. The brush used to follow
 * the crosshair on hover, which meant it was on screen almost permanently -
 * there is very little in a room that is not repaintable - so it read as a
 * stuck cursor rather than a cue.
 */
export function WalkHud() {
  const viewMode = useStore(s => s.viewMode);
  const locked = useStore(s => s.walkPointerLocked);
  const pending = useStore(s => s.walkPending);
  // A finish panel is open when the brush was clicked; the big
  // 'click to look around' card would sit right on top of it.
  const editing = useStore(s => s.selectedObjectId !== null || s.walkFloorOpen || s.walkWallOpen);

  if (viewMode !== 'walking') return null;

  if (!locked && editing) {
    return (
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <div className="bg-black/55 backdrop-blur-sm text-white/85 px-4 py-1.5 rounded-full text-[11px] font-medium">
          Pick a finish below and you will carry straight on walking
        </div>
      </div>
    );
  }

  /*
   * Armed: the brush sits at the crosshair, where you were aiming, and is the
   * only thing on screen that takes a click. Clicking anywhere else in the
   * room disarms and puts you back to walking (handled in MainScene).
   */
  if (!locked && pending) {
    const label =
      pending.kind === 'object' ? 'Change finish'
      : pending.kind === 'floor' ? 'Change floor'
      : 'Change wall colour';
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
        <div className="flex flex-col items-center gap-2 animate-[fadeIn_120ms_ease-out]">
          <button
            type="button"
            onClick={() => {
              const st = useStore.getState();
              if (pending.kind === 'object') st.setSelectedObjectId(pending.id ?? null);
              st.setWalkFloorOpen(pending.kind === 'floor');
              st.setWalkWallOpen(pending.kind === 'wall');
              st.setWalkPending(null);
            }}
            className="pointer-events-auto w-12 h-12 rounded-full bg-white shadow-[0_2px_14px_rgba(0,0,0,0.5)] ring-2 ring-white/70 flex items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-pointer"
            aria-label={label}
          >
            <Paintbrush size={20} className="text-[#3b4d4a]" />
          </button>
          <span className="px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-semibold tracking-wide">
            {label}
          </span>
        </div>
      </div>
    );
  }

  if (!locked) {
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
        <div className="bg-black/70 backdrop-blur-sm text-white px-5 py-3 rounded-xl text-center shadow-2xl">
          <div className="text-sm font-semibold">Click to look around</div>
          <div className="text-[11px] text-white/60 mt-1">WASD to walk · Shift to jog · click an item or the floor to change its finish</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Walking: a bare dot and nothing else. */}
      <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
        <div className="w-[5px] h-[5px] rounded-full bg-white/80 shadow-[0_0_3px_rgba(0,0,0,0.8)]" />
      </div>

      <div className="absolute bottom-6 left-6 z-30 pointer-events-none select-none">
        <div className="bg-black/45 backdrop-blur-sm rounded-lg px-3 py-2.5 flex items-center gap-4">
          {/* The classic inverted-T, so it reads instantly as movement keys. */}
          <div className="flex flex-col items-center gap-[3px]">
            <Key>W</Key>
            <div className="flex gap-[3px]">
              <Key>A</Key>
              <Key>S</Key>
              <Key>D</Key>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-[9px] text-white/70 leading-none">
            <div className="flex items-center gap-1.5"><Key wide>Shift</Key> jog</div>
            <div className="flex items-center gap-1.5"><Key wide>Esc</Key> cursor</div>
          </div>
        </div>
        <div className="text-[9px] text-white/50 mt-1.5 pl-1">Click an item or the floor to change its finish</div>
      </div>
    </>
  );
}
