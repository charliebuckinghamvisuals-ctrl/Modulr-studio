import { useStore } from '../../store';
import { Layers, Cuboid, LocateFixed, Footprints, RotateCw } from 'lucide-react';

export function ViewModeToggle() {
  const { viewMode, setViewMode } = useStore();

  if (viewMode === 'capture' || viewMode === 'render') return null;

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center bg-white/50 backdrop-blur-2xl shadow-sm rounded-full p-1 border border-black/5 z-10">
      <button
        onClick={() => setViewMode('3d')}
        className={`flex items-center gap-2 px-6 py-2 rounded-full text-xs font-semibold transition-colors ${
          viewMode === '3d' ? 'bg-[#3b4d4a] text-white shadow-sm' : 'text-gray-500 hover:text-white hover:bg-[#3b4d4a]'
        }`}
      >
        <Cuboid size={16} />
        3D View
      </button>
      <button
        onClick={() => setViewMode('walking')}
        className={`flex items-center gap-2 px-6 py-2 rounded-full text-xs font-semibold transition-colors ${
          viewMode === 'walking' ? 'bg-[#3b4d4a] text-white shadow-sm' : 'text-gray-500 hover:text-white hover:bg-[#3b4d4a]'
        }`}
      >
        <Footprints size={16} />
        Walk
      </button>
      <button
        onClick={() => {
          setViewMode('plan');
          window.dispatchEvent(new CustomEvent('reset-plan-view'));
        }}
        className={`flex items-center gap-2 px-6 py-2 rounded-full text-xs font-semibold transition-colors ${
          viewMode === 'plan' ? 'bg-[#3b4d4a] text-white shadow-sm' : 'text-gray-500 hover:text-white hover:bg-[#3b4d4a]'
        }`}
      >
        <Layers size={16} />
        Plan View
      </button>
      {viewMode === '3d' && (
        <>
          <div className="w-px h-4 bg-black/10 mx-2"></div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('camera-set-view', { detail: 'spin' }))}
            className="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold text-gray-500 hover:bg-[#3b4d4a] hover:text-white transition-colors"
            title="360° Spin"
          >
            <RotateCw size={16} />
            <span className="sr-only">Spin</span>
          </button>
        </>
      )}
      {viewMode === 'plan' && (
        <div className="w-px h-4 bg-black/10 mx-2"></div>
      )}
      {viewMode === 'plan' && (
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('reset-plan-view'))}
          className="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold text-gray-500 hover:bg-[#3b4d4a] hover:text-white transition-colors"
          title="Back to Top View"
        >
          <LocateFixed size={16} />
        </button>
      )}
    </div>
  );
}
