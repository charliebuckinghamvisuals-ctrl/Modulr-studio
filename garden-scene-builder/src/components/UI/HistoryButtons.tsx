import { useStore } from '../../store';
import { Undo, Redo } from 'lucide-react';

export function HistoryButtons() {
  const { undo, redo, pastScenes, futureScenes, viewMode } = useStore();

  if (viewMode === 'capture' || viewMode === 'render') return null;

  return (
    <div className="absolute top-6 left-6 flex items-center bg-white/50 backdrop-blur-2xl shadow-sm rounded-full p-1 border border-black/5 z-10">
      <button
        onClick={undo}
        disabled={pastScenes.length === 0}
        className="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold text-gray-500 hover:bg-[#3b4d4a] hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
        title="Undo"
      >
        <Undo size={16} />
      </button>
      <div className="w-px h-4 bg-black/10 mx-1"></div>
      <button
        onClick={redo}
        disabled={futureScenes.length === 0}
        className="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold text-gray-500 hover:bg-[#3b4d4a] hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
        title="Redo"
      >
        <Redo size={16} />
      </button>
    </div>
  );
}
