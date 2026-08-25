import React, { useState } from 'react';
import { DoorOpen, DoorClosed, FileText, Save } from 'lucide-react';
import { useStore } from '../../store';
import { ExportPDFModal } from './ExportPDFModal';

export function ActionButtons() {
  const { viewMode, setViewMode, areDoorsOpen, toggleDoors, isExporting } = useStore();
  const [showExportModal, setShowExportModal] = useState(false);

  const handleRenderInModulr = () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      // The scene spec rides along with the screenshot so the AI renders the
      // CONFIGURED building (exact door/window counts, styles, cladding)
      // instead of guessing from pixels.
      const { room } = useStore.getState().scene;
      window.parent.postMessage({ type: 'RENDER_3D_SCENE', image: dataUrl, roomSpec: room }, window.location.origin);
    }
  };

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
          <button
            onClick={handleRenderInModulr}
            className="bg-[#3b4d4a] text-white px-7 py-3 rounded-full font-bold shadow-xl hover:bg-[#2d3a38] hover:scale-105 transition-all flex items-center gap-2 text-sm uppercase tracking-wider cursor-pointer"
          >
            Send to Render Engine
          </button>
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

