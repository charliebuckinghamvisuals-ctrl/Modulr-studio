import { useState, useEffect } from 'react';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { LayoutGrid, Minus, Moon, Sun, Trash2 } from 'lucide-react';

/**
 * Downlight layout tool.
 *
 * Spots are set out in runs, not placed one at a time - that is how a sparky
 * works and how a ceiling ends up looking deliberate rather than scattered.
 *
 * A ROW is the primary tool because a real ceiling is usually several runs: a
 * row over the worktop, a row down the middle, a pair over a desk. Rows add to
 * what is there, so layouts compose. The GRID is the shortcut for the common
 * case of covering a whole room evenly, and it replaces rather than adds so
 * that nudging the numbers re-lays it instead of piling a second grid on top.
 *
 * Either way the run is divided into equal cells with a fitting at each
 * CENTRE, which gives even gaps between fittings and a half-gap to the walls,
 * so no light sits hard against one - and a row lines through with a grid.
 */

/** Typical domestic downlight pitch, in metres. */
const TARGET_PITCH = 1.4;

function Stepper({ label, value, set, min = 1, max = 12 }: {
  label: string; value: number; set: (n: number) => void; min?: number; max?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-gray-600">{label}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => set(Math.max(min, value - 1))}
          className="w-6 h-6 rounded-md bg-black/5 hover:bg-black/10 text-[#3b4d4a] font-bold leading-none"
        >&minus;</button>
        <span className="w-6 text-center text-xs font-semibold text-[#3b4d4a]">{value}</span>
        <button
          onClick={() => set(Math.min(max, value + 1))}
          className="w-6 h-6 rounded-md bg-black/5 hover:bg-black/10 text-[#3b4d4a] font-bold leading-none"
        >+</button>
      </div>
    </div>
  );
}

export function SpotLayout() {
  const { room, spotCount, addSpotGrid, addSpotRow, clearSpots, nightPreview, setNightPreview } =
    useStore(useShallow(s => ({
      room: s.scene.room,
      spotCount: s.scene.objects.filter(o => o.type === 'spot_light').length,
      addSpotGrid: s.addSpotGrid,
      addSpotRow: s.addSpotRow,
      clearSpots: s.clearSpots,
      nightPreview: s.nightPreview,
      setNightPreview: s.setNightPreview,
    })));

  const wt = (room.wallThicknessMm ?? 150) / 1000;
  const iw = room.widthMm / 1000 - wt * 2;
  const id = room.depthMm / 1000 - wt * 2;
  const suggest = (span: number) => Math.max(1, Math.round(span / TARGET_PITCH));

  const [rowCount, setRowCount] = useState(() => suggest(iw));
  const [axis, setAxis] = useState<'across' | 'down'>('across');
  const [cols, setCols] = useState(() => suggest(iw));
  const [rows, setRows] = useState(() => suggest(id));

  useEffect(() => {
    if (spotCount === 0) { setCols(suggest(iw)); setRows(suggest(id)); setRowCount(suggest(iw)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iw, id, spotCount]);

  const mm = (v: number) => Math.round(v * 1000);
  const rowSpan = axis === 'across' ? iw : id;
  const rowPitch = rowSpan / rowCount;
  const gridPitchX = iw / cols;
  const gridPitchZ = id / rows;

  const btn = 'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors';

  return (
    <div className="p-4 bg-white border border-black/5 rounded-xl shadow-sm space-y-4">

      {/* A single run - the everyday tool. */}
      <div className="space-y-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Add a row</span>
        <Stepper label="How many" value={rowCount} set={setRowCount} />
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setAxis('across')}
            className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg uppercase transition-colors ${axis === 'across' ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}
          >Across</button>
          <button
            onClick={() => setAxis('down')}
            className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg uppercase transition-colors ${axis === 'down' ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}
          >Front to back</button>
        </div>
        <p className="text-[10px] text-gray-400 leading-snug">
          {rowCount} spots, {mm(rowPitch)}mm apart, down the middle. Drag any one afterwards to move it.
        </p>
        <button
          onClick={() => addSpotRow(rowCount, axis, 0)}
          className={`${btn} bg-[#3b4d4a] text-white hover:bg-[#2f3d3b]`}
        >
          <Minus size={14} /> Add row
        </button>
      </div>

      {/* Whole-room grid. */}
      <div className="space-y-2 pt-3 border-t border-black/5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Or fill the room</span>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <Stepper label="Across" value={cols} set={setCols} />
          <Stepper label="Down" value={rows} set={setRows} />
        </div>
        <p className="text-[10px] text-gray-400 leading-snug">
          {rows * cols} spots &middot; {mm(gridPitchX)} &times; {mm(gridPitchZ)}mm apart &middot; {mm(gridPitchX / 2)}mm off the side walls.
          {(gridPitchX > 1.8 || gridPitchZ > 1.8) && ' Wide for downlights - add a row or column.'}
          {(gridPitchX < 0.9 || gridPitchZ < 0.9) && ' Tighter than usual - you may not need this many.'}
        </p>
        <button
          onClick={() => addSpotGrid(rows, cols, true)}
          className={`${btn} bg-black/5 text-[#3b4d4a] hover:bg-black/10`}
        >
          <LayoutGrid size={14} /> {spotCount ? 'Replace with grid' : 'Lay out grid'}
        </button>
      </div>

      {spotCount > 0 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-gray-400">{spotCount} spotlight{spotCount === 1 ? '' : 's'} placed</span>
          <button
            onClick={clearSpots}
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-black/5">
        <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
          {nightPreview ? <Moon size={13} /> : <Sun size={13} />} Night preview
        </span>
        <button
          onClick={() => setNightPreview(!nightPreview)}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ${nightPreview ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-gray-300/60'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-all duration-300 shadow-md ${nightPreview ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
        </button>
      </div>
      <p className="text-[10px] text-gray-400 leading-snug -mt-2">
        Daylight drowns the fittings out. Turn this on to see what the lighting actually does.
      </p>
    </div>
  );
}
