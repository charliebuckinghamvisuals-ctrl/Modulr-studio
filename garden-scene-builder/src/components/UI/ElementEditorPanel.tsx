import { useState, useEffect } from 'react';
import { useStore } from '../../store';
import { Trash2 } from 'lucide-react';

function MmField({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (v: number) => void }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => { setTxt(String(value)); }, [value]);
  const commit = () => {
    const n = Math.round(Number(txt));
    if (!isNaN(n) && String(n) !== '') onCommit(Math.max(min, Math.min(max, n)));
    else setTxt(String(value));
  };
  return (
    <label className="flex flex-col gap-1 items-start">
      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{label}</span>
      <input
        type="number"
        value={txt}
        onChange={e => setTxt(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); e.stopPropagation(); }}
        className="w-[76px] bg-gray-50 border border-black/5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#3b4d4a] outline-none focus:ring-2 focus:ring-[#3b4d4a]"
      />
    </label>
  );
}

/**
 * Numeric editor for the selected exterior door/window - the precision half
 * of placement. Position is entered the way a builder thinks: distance from
 * the wall's corners (viewed from OUTSIDE the building), not an abstract
 * centre offset.
 */
export function ElementEditorPanel() {
  const { selectedElementId, scene, viewMode } = useStore();
  if (viewMode === 'capture' || viewMode === 'render' || viewMode === 'walking') return null;

  const room = scene.room;
  const door = (room.doors || []).find(d => d.id === selectedElementId);
  const win = !door ? room.windows.find(w => w.id === selectedElementId) : undefined;
  const el = door || win;
  if (!el) return null;

  const isDoor = !!door;
  const L = (el.wall === 'front' || el.wall === 'back') ? room.widthMm : room.depthMm;
  // "Left" as seen standing OUTSIDE, facing this wall.
  const s = (el.wall === 'front' || el.wall === 'left') ? 1 : -1;
  const fromLeft = Math.round(L / 2 + s * el.offsetMm - el.widthMm / 2);
  const fromRight = Math.round(L - el.widthMm - fromLeft);

  const st = useStore.getState();
  const update = (u: Record<string, number>) => {
    st.saveState();
    if (isDoor) st.updateDoor(el.id, u); else st.updateWindow(el.id, u);
  };
  const setFromLeft = (v: number) => update({ offsetMm: Math.round(s * (v + el.widthMm / 2 - L / 2)) });

  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-2xl border border-black/5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] rounded-2xl px-5 py-3 z-20 text-[#3b4d4a]">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          {isDoor ? 'Door' : 'Window'} · {el.wall} wall <span className="normal-case tracking-normal text-gray-300">(corners viewed from outside)</span>
        </h3>
        <button
          onClick={() => { st.saveState(); isDoor ? st.removeDoor(el.id) : st.removeWindow(el.id); st.setSelectedElementId(null); }}
          className="text-gray-400 hover:text-red-500 transition-colors ml-4"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="flex items-end gap-3">
        <MmField label="Width" value={el.widthMm} min={300} max={L - 300} onCommit={v => update({ widthMm: v })} />
        <MmField label="Height" value={el.heightMm} min={300} max={3000} onCommit={v => update({ heightMm: v })} />
        {!isDoor && (
          <MmField label="Sill" value={(win as any).sillMm ?? 0} min={0} max={2000} onCommit={v => update({ sillMm: v })} />
        )}
        <div className="w-px h-8 bg-black/10 mx-1" />
        <MmField label="← Left corner" value={fromLeft} min={50} max={Math.max(50, L - el.widthMm - 50)} onCommit={setFromLeft} />
        <MmField label="Right corner →" value={fromRight} min={50} max={Math.max(50, L - el.widthMm - 50)} onCommit={v => setFromLeft(L - el.widthMm - v)} />
      </div>
    </div>
  );
}
