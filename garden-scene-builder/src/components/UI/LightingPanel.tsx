import { useState, useEffect } from 'react';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { Moon, Trash2, Footprints, Plus } from 'lucide-react';
import { LIGHT_COLOURS } from '../../modelRegistry';

/**
 * The lighting view's panel.
 *
 * SPACING is the control, not a number you read back. A layout is specified
 * as "downlights at 1200 centres" - so the pitch is what you set, the run is
 * centred in the room, and the count is the second dial. Deriving the pitch
 * from a count did the opposite: you asked for four lights and got whatever
 * gap that left, which in a wide room is far wider than anyone would fit.
 */

/** Standard domestic downlight pitch, in mm. */
const DEFAULT_PITCH = 1200;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-gray-600">{label}</span>
      {children}
    </div>
  );
}

function Stepper({ value, set, min, max, step = 1, suffix }: {
  value: number; set: (n: number) => void; min: number; max: number; step?: number; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => set(Math.max(min, value - step))}
        className="w-6 h-6 rounded-md bg-black/5 hover:bg-black/10 text-[#3b4d4a] font-bold leading-none">&minus;</button>
      <span className="w-[52px] text-center text-xs font-semibold text-[#3b4d4a] tabular-nums">
        {value}{suffix}
      </span>
      <button onClick={() => set(Math.min(max, value + step))}
        className="w-6 h-6 rounded-md bg-black/5 hover:bg-black/10 text-[#3b4d4a] font-bold leading-none">+</button>
    </div>
  );
}

export function LightingPanel() {
  const { viewMode, setViewMode, room, objects, addSpotGrid, addSpotRow, clearSpots,
          nightPreview, setNightPreview, updateObject, selectedObjectId } =
    useStore(useShallow(s => ({
      viewMode: s.viewMode,
      setViewMode: s.setViewMode,
      room: s.scene.room,
      // Never filter in the selector - a new array every call re-renders forever.
      objects: s.scene.objects,
      addSpotGrid: s.addSpotGrid,
      addSpotRow: s.addSpotRow,
      clearSpots: s.clearSpots,
      nightPreview: s.nightPreview,
      setNightPreview: s.setNightPreview,
      updateObject: s.updateObject,
      selectedObjectId: s.selectedObjectId,
    })));

  const spots = objects.filter(o => o.type === 'spot_light');
  const wt = (room.wallThicknessMm ?? 150) / 1000;
  const iw = room.widthMm / 1000 - wt * 2;
  const id = room.depthMm / 1000 - wt * 2;

  const [pitch, setPitch] = useState(DEFAULT_PITCH);
  const [count, setCount] = useState(4);
  const [axis, setAxis] = useState<'across' | 'down'>('across');
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(3);

  // How many fit at this pitch, so the suggestion tracks the room and the
  // spacing rather than being a number the user has to work out.
  const fits = (span: number, p: number) => Math.max(1, Math.floor(span / (p / 1000)));
  useEffect(() => {
    if (spots.length) return;
    setCount(fits(axis === 'across' ? iw : id, pitch));
    setCols(fits(iw, pitch));
    setRows(fits(id, pitch));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iw, id, pitch, axis, spots.length]);

  if (viewMode !== 'lighting') return null;

  const p = pitch / 1000;
  const span = axis === 'across' ? iw : id;
  const runLen = (count - 1) * p;
  const endGap = (span - runLen) / 2;
  const gridW = (cols - 1) * p, gridD = (rows - 1) * p;
  const gridGapX = (iw - gridW) / 2, gridGapZ = (id - gridD) / 2;
  const mm = (v: number) => Math.round(v * 1000);

  const tooWide = endGap < 0.15;
  const gridTooWide = gridGapX < 0.15 || gridGapZ < 0.15;

  const setTemp = (hex: string) => {
    const picked = selectedObjectId && spots.some(s => s.id === selectedObjectId);
    (picked ? spots.filter(s => s.id === selectedObjectId) : spots)
      .forEach(s => updateObject(s.id, { color: hex }));
  };
  const scope = selectedObjectId && spots.some(s => s.id === selectedObjectId) ? 'this one' : 'all';

  return (
    <div className="absolute top-24 left-6 z-30 w-[276px] bg-white/95 backdrop-blur-xl border border-black/5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.25)] rounded-2xl text-[#3b4d4a] max-h-[calc(100%-8rem)] overflow-y-auto">

      <div className="px-4 pt-4 pb-3">
        <h3 className="text-[13px] font-bold">Lighting plan</h3>
        <p className="text-[10px] text-gray-400 leading-snug mt-0.5">
          Looking down at the ceiling. Drag a light and its row follows &mdash; Alt for one.
        </p>
      </div>

      {/* Spacing first: it applies to everything below, so it is set once. */}
      <div className="px-4 py-3 bg-[#3b4d4a]/[0.04] border-y border-black/5 space-y-1">
        <Row label="Gap between lights">
          <Stepper value={pitch} set={setPitch} min={400} max={3000} step={50} suffix="mm" />
        </Row>
        <p className="text-[10px] text-gray-400">Usual for downlights is 1000&ndash;1500mm.</p>
      </div>

      <div className="px-4 py-3 space-y-2.5 border-b border-black/5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">One row</span>
        <Row label="How many">
          <Stepper value={count} set={setCount} min={1} max={20} />
        </Row>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setAxis('across')}
            className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg uppercase transition-colors ${axis === 'across' ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>Across</button>
          <button onClick={() => setAxis('down')}
            className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg uppercase transition-colors ${axis === 'down' ? 'bg-[#3b4d4a] text-white shadow-sm' : 'bg-white text-gray-600 border border-black/5 hover:bg-gray-50'}`}>Front to back</button>
        </div>
        <p className={`text-[10px] leading-snug ${tooWide ? 'text-amber-600' : 'text-gray-400'}`}>
          {tooWide
            ? `Too many for this room at ${pitch}mm - the row would reach the walls.`
            : `${count} lights, ${mm(runLen)}mm long, ${mm(endGap)}mm to each end.`}
        </p>
        <button onClick={() => addSpotRow(count, axis, 0, p)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#3b4d4a] text-white text-[11px] font-bold uppercase tracking-wide hover:bg-[#2f3d3b] transition-colors">
          <Plus size={14} /> Add this row
        </button>
      </div>

      <div className="px-4 py-3 space-y-2.5 border-b border-black/5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Fill the room</span>
        <Row label="Across"><Stepper value={cols} set={setCols} min={1} max={20} /></Row>
        <Row label="Front to back"><Stepper value={rows} set={setRows} min={1} max={20} /></Row>
        <p className={`text-[10px] leading-snug ${gridTooWide ? 'text-amber-600' : 'text-gray-400'}`}>
          {gridTooWide
            ? `Too many for this room at ${pitch}mm.`
            : `${rows * cols} lights, ${mm(gridGapX)}mm and ${mm(gridGapZ)}mm to the walls.`}
        </p>
        <button onClick={() => addSpotGrid(rows, cols, true, p)}
          className="w-full py-2.5 rounded-lg bg-black/5 hover:bg-black/10 text-[11px] font-bold uppercase tracking-wide transition-colors">
          {spots.length ? 'Replace with grid' : 'Fill the room'}
        </button>
      </div>

      <div className="px-4 py-3 space-y-2 border-b border-black/5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Lamp colour <span className="text-gray-300 normal-case font-medium">&middot; {scope}</span>
        </span>
        <div className="flex gap-1.5">
          {LIGHT_COLOURS.map(c => (
            <button key={c.hex} title={c.name} onClick={() => setTemp(c.hex)} style={{ background: c.hex }}
              className="w-7 h-7 rounded-full border border-black/15 hover:scale-110 transition-transform" />
          ))}
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold">{spots.length} spotlight{spots.length === 1 ? '' : 's'}</span>
          {spots.length > 0 && (
            <button onClick={clearSpots}
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:text-red-500 transition-colors">
              <Trash2 size={12} /> Clear
            </button>
          )}
        </div>
        <button
          onClick={() => { setNightPreview(true); setViewMode('walking'); }}
          disabled={!spots.length}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ${spots.length ? 'bg-[#1f2a37] text-white hover:bg-[#111a24]' : 'bg-black/5 text-gray-400 cursor-not-allowed'}`}>
          <Footprints size={14} /> Walk it at night
        </button>
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-gray-600 flex items-center gap-1.5"><Moon size={12} /> Night preview</span>
          <button onClick={() => setNightPreview(!nightPreview)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all ${nightPreview ? 'bg-emerald-500' : 'bg-gray-300/60'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all shadow-md ${nightPreview ? 'translate-x-[24px]' : 'translate-x-[3px]'}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
