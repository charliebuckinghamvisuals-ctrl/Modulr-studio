import { Sun, Sunset, Moon } from 'lucide-react';
import { useStore } from '../../store';
import { sunState } from '../../utils/sun';
import { SKIES, skyForSun, type SkyKey } from '../../utils/skies';

const ICONS: Record<SkyKey, typeof Sun> = { day: Sun, evening: Sunset, night: Moon };

/**
 * Day / Evening / Night, under the view buttons - "add a switch or three
 * buttons at the top so you can switch" (Charlie, 23 Sep 2026).
 *
 * Each one sets the time of day, and the sky, the sun and the lighting all
 * follow from that (utils/skies) - so this and the Lighting slider can
 * never disagree, and the button that is lit is whichever sky the current
 * time gives. Shown where the sky is: the 3D view and both walks.
 */
export function SkyToggle() {
  const viewMode = useStore(s => s.viewMode);
  const timeOfDay = useStore(s => s.timeOfDay);
  const setTimeOfDay = useStore(s => s.setTimeOfDay);
  if (viewMode !== '3d' && viewMode !== 'walking') return null;
  const active = skyForSun(sunState(timeOfDay));

  return (
    <div className="absolute top-[4.6rem] left-1/2 -translate-x-1/2 flex items-center bg-white/50 backdrop-blur-2xl shadow-sm rounded-full p-1 border border-black/5 z-10">
      {(['day', 'evening', 'night'] as const).map(key => {
        const Icon = ICONS[key];
        return (
          <button
            key={key}
            onClick={() => setTimeOfDay(SKIES[key].hour)}
            aria-pressed={active === key}
            title={`${SKIES[key].label} sky`}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
              active === key ? 'bg-[#3b4d4a] text-white shadow-sm' : 'text-gray-500 hover:text-white hover:bg-[#3b4d4a]'
            }`}
          >
            <Icon size={14} />
            {SKIES[key].label}
          </button>
        );
      })}
    </div>
  );
}
