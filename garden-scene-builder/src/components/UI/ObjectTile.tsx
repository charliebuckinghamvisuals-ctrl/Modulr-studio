import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { getThumbnail } from '../../utils/thumbnails';
import { MODEL_URLS, MODEL_SCALES } from '../../modelRegistry';
import type { ObjectType } from '../../types';

/**
 * One item in the object picker. Shows a thumbnail rendered from the real
 * model where there is one, and falls back to the icon/label tile otherwise.
 * Click arms click-to-place; dragging still works for anyone used to it.
 */
export function ObjectTile({ type, label, icon }: { type: ObjectType; label: string; icon?: React.ReactNode }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const isActive = useStore(s => s.activePlacementType === type);
  const url = MODEL_URLS[type];

  useEffect(() => {
    if (!url) return;
    let alive = true;
    getThumbnail(url, MODEL_SCALES[type]).then(src => { if (alive) setThumb(src); });
    return () => { alive = false; };
  }, [url, type]);

  return (
    <div
      draggable
      onClick={() => useStore.getState().setActivePlacementType(isActive ? null : type)}
      onDragStart={(e) => e.dataTransfer.setData('type', type)}
      title={label}
      className={`group relative rounded-xl border bg-white overflow-hidden cursor-pointer active:cursor-grabbing transition-all ${
        isActive
          ? 'border-[#3b4d4a] ring-2 ring-[#3b4d4a]/25 shadow-md'
          : 'border-black/5 hover:border-[#3b4d4a]/40 hover:shadow-sm'
      }`}
    >
      <div className="aspect-square bg-[#F5F5F0] flex items-center justify-center overflow-hidden">
        {thumb ? (
          <img
            src={thumb}
            alt={label}
            className="w-full h-full object-contain p-1 transition-transform duration-200 group-hover:scale-105"
            draggable={false}
          />
        ) : icon ? (
          <div className="text-[#5A5A40] transition-transform group-hover:scale-110">{icon}</div>
        ) : (
          // Neutral placeholder while the model renders, so tiles never jump.
          <div className="w-8 h-8 rounded-md bg-black/5 animate-pulse" />
        )}
      </div>
      <div className="px-2 py-1.5 border-t border-black/5">
        <span className="block text-[10px] font-semibold text-[#3b4d4a] text-center leading-tight truncate">{label}</span>
      </div>
    </div>
  );
}
