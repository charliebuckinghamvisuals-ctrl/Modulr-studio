import { useStore } from '../../store';
import { DimensionSlider } from '../DimensionSlider';
import { resumeWalking } from '../../utils/walk';

/** The same six floors the sidebar offers, as picture tiles. */
const FLOORS = [
  { id: 'oak_plank', name: 'Oak Plank', img: 'textures/oak_plank_color.jpg' },
  { id: 'light_oak', name: 'Light Oak', img: 'textures/light_oak_color.jpg' },
  { id: 'rustic_pine', name: 'Rustic Pine', img: 'textures/rustic_pine_color.jpg' },
  { id: 'smoked_oak', name: 'Smoked Oak', img: 'textures/smoked_oak_color.jpg' },
  { id: 'oak_herringbone', name: 'Oak Herringbone', img: 'textures/oak_herringbone_color.jpg' },
  { id: 'walnut_parquet', name: 'Walnut Parquet', img: 'textures/walnut_parquet_color.jpg' },
];

/**
 * Floor finishes inside the walkthrough.
 *
 * Opened by looking at the floor and clicking - the same crosshair pick that
 * selects a cabinet - so a client can respecify what they are standing on
 * without leaving the room or hunting through the sidebar. Docked in the same
 * place as the object panel, because only one of the two is ever open.
 */
export function WalkFloorPanel() {
  const viewMode = useStore(s => s.viewMode);
  const open = useStore(s => s.walkFloorOpen);
  const room = useStore(s => s.scene.room);
  const updateRoom = useStore(s => s.updateRoom);
  const setOpen = useStore(s => s.setWalkFloorOpen);

  if (viewMode !== 'walking' || !open) return null;

  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-2xl border border-black/5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] rounded-2xl px-5 py-3 z-20 w-80 text-[#3b4d4a]">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Floor</h3>
        <button
          onClick={() => { setOpen(false); resumeWalking(); }}
          className="text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:text-[#3b4d4a] transition-colors"
        >
          Done
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {FLOORS.map(f => {
          const active = room.interiorFloorType === f.id;
          return (
            <button
              key={f.id}
              title={f.name}
              onClick={() => updateRoom({ interiorFloorType: f.id as any })}
              className={`group rounded-xl border overflow-hidden bg-white transition-all ${
                active ? 'border-[#3b4d4a] ring-2 ring-[#3b4d4a]/25 shadow-md' : 'border-black/5 hover:border-[#3b4d4a]/40 hover:shadow-sm'
              }`}
            >
              <div
                className="aspect-square w-full"
                style={{ backgroundImage: `url(${f.img})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              />
              <span className="block px-1 py-1 text-[9px] font-semibold text-[#3b4d4a] text-center leading-tight truncate border-t border-black/5">
                {f.name}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <DimensionSlider
          label="Plank Size %"
          min={50}
          max={250}
          step={5}
          value={Math.round((room.floorScale ?? 1) * 100)}
          onChange={(v) => updateRoom({ floorScale: v / 100 })}
        />
      </div>
    </div>
  );
}
