import React, { useState } from 'react';
import { DoorOpen, DoorClosed, FileText, Save } from 'lucide-react';
import { useStore } from '../../store';
import { ExportPDFModal } from './ExportPDFModal';

export function ActionButtons() {
  const { viewMode, setViewMode, areDoorsOpen, toggleDoors, isExporting, cameraFov, setCameraFov } = useStore();
  const [showExportModal, setShowExportModal] = useState(false);

  /**
   * Saving was only reachable from inside the PDF export flow - to file a
   * design you had to pretend to export. Same message, first-class button:
   * the host app opens its name-and-project dialog over the configurator.
   */
  const handleSaveDesign = () => {
    window.parent.postMessage({
      type: 'SAVE_3D_DESIGN',
      scene: useStore.getState().scene,
      price: useStore.getState().calculatePrice(),
      savedAt: Date.now(),
    }, window.location.origin);
  };

  return (
    <>
      {(viewMode === '3d' || viewMode === 'walking') && !isExporting && (
        <div className="absolute bottom-6 right-8 z-30 flex flex-col md:flex-row gap-3 items-center">
          {/* Camera lens control - frames the shot that goes to the render
              engine. Lower = tighter/flatter (telephoto), higher = wider. */}
          <div className="bg-white/90 backdrop-blur-md border border-[#3b4d4a]/20 px-4 py-2 rounded-full shadow-md flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#3b4d4a] whitespace-nowrap">Lens {cameraFov}°</span>
            <input
              type="range"
              min={25}
              max={90}
              step={1}
              value={cameraFov}
              onChange={(e) => setCameraFov(Number(e.target.value))}
              className="w-24 accent-[#3b4d4a] cursor-pointer"
            />
          </div>
          <button
            onClick={handleSaveDesign}
            className="bg-white/90 backdrop-blur-md text-[#3b4d4a] border border-[#3b4d4a]/20 px-6 py-3 rounded-full font-semibold shadow-md hover:bg-[#3b4d4a] hover:text-white transition-all flex items-center gap-2 text-sm cursor-pointer"
          >
            <Save size={18} />
            Save Design
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            className="bg-white/90 backdrop-blur-md text-[#3b4d4a] border border-[#3b4d4a]/20 px-6 py-3 rounded-full font-semibold shadow-md hover:bg-[#3b4d4a] hover:text-white transition-all flex items-center gap-2 text-sm cursor-pointer"
          >
            <FileText size={18} />
            Export PDF
          </button>
          <button 
            onClick={toggleDoors}
            className="bg-[#3b4d4a] text-white border border-[#3b4d4a]/20 px-6 py-3 rounded-full font-semibold shadow-md hover:bg-[#2d3a38] transition-all flex items-center gap-2 text-sm cursor-pointer"
          >
            {areDoorsOpen ? <DoorClosed size={18} /> : <DoorOpen size={18} />}
            {areDoorsOpen ? "Close Doors" : "Open Doors"}
          </button>
        </div>
      )}
      {showExportModal && (
        <ExportPDFModal onClose={() => setShowExportModal(false)} />
      )}
    </>
  );
}

