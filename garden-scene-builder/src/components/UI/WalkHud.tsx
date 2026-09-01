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
 * Two states, because the walkthrough has two: before the mouse is captured
 * there is nothing to explain except how to start, and after it is captured
 * the controls need to be legible at a glance without covering the room.
 * Deliberately small and low-contrast - it is a hint, not a panel - and
 * pointer-events-none so it can never intercept a click meant for the scene.
 */
export function WalkHud() {
  const viewMode = useStore(s => s.viewMode);
  const locked = useStore(s => s.walkPointerLocked);
  // A finish panel is open when the crosshair picked something; the big
  // 'click to look around' card would sit right on top of it.
  const editing = useStore(s => s.selectedObjectId !== null || s.walkFloorOpen);

  if (viewMode !== 'walking') return null;

  if (!locked && editing) {
    return (
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <div className="bg-black/55 backdrop-blur-sm text-white/85 px-4 py-1.5 rounded-full text-[11px] font-medium">
          Pick a finish below, then click the room to carry on walking
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
      {/* Crosshair: without a cursor there is no other cue for what you are
          pointing at, and clicking selects whatever is under it. */}
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
