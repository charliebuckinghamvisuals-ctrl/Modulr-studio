import { Sun, Moon, Sunrise, Sunset } from 'lucide-react';
import { useStore } from '../../store';
import { DAY_START, DAY_END, formatHour, sunState } from '../../utils/sun';

/**
 * The time of day, dragged.
 *
 * One slider from early morning to midnight, the way Enscape does it: the
 * sun moves, the light warms and drops, the sky goes through dusk to stars
 * and a moon, and the fittings come on. Sits under the view toggle so it
 * is there in 3D and in the walkthrough alike.
 */
export function SunSlider() {
  const viewMode = useStore(s => s.viewMode);
  const isExporting = useStore(s => s.isExporting);
  const hours = useStore(s => s.timeOfDay);
  const setTimeOfDay = useStore(s => s.setTimeOfDay);
  if ((viewMode !== '3d' && viewMode !== 'walking') || isExporting) return null;

  const sun = sunState(hours);
  const Icon = sun.night ? Moon : sun.elevation < 12 ? (hours < 13 ? Sunrise : Sunset) : Sun;
  const label = sun.night ? 'Night' : hours < 12 ? 'Morning' : hours < 16.5 ? 'Afternoon' : sun.elevation < 12 ? 'Sunset' : 'Evening';

  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
      <div className="bg-white/80 backdrop-blur-2xl border border-black/5 shadow-sm rounded-full px-4 py-2 flex items-center gap-3">
        <Icon size={15} className="text-[#3b4d4a] shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#3b4d4a] whitespace-nowrap w-[118px]">{label} · {formatHour(hours)}</span>
        <input
          type="range"
          min={DAY_START}
          max={DAY_END}
          step={0.25}
          value={hours}
          onChange={(e) => setTimeOfDay(Number(e.target.value))}
          aria-label="Time of day"
          className="w-40 accent-[#3b4d4a] cursor-pointer"
        />
      </div>
    </div>
  );
}
