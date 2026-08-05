import React, { useState } from 'react';
import { DoorOpen, DoorClosed, FileText, Sparkles } from 'lucide-react';
import { useStore } from '../../store';
import { ExportPDFModal } from './ExportPDFModal';

export function ActionButtons() {
  const { viewMode, setViewMode, areDoorsOpen, toggleDoors, isExporting } = useStore();
  const [showExportModal, setShowExportModal] = useState(false);

  const handleRenderInModulr = () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      window.parent.postMessage({ type: 'RENDER_3D_SCENE', image: dataUrl }, '*');
    }
  };

  return (
    <>
      {(viewMode === '3d' || viewMode === 'walking') && !isExporting && (
        <div className="absolute bottom-6 right-8 z-30 flex flex-col md:flex-row gap-3 items-center">
          <button 
            onClick={handleRenderInModulr}
            className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white px-7 py-3 rounded-full font-bold shadow-xl hover:from-emerald-500 hover:to-teal-500 hover:scale-105 transition-all flex items-center gap-2 text-sm uppercase tracking-wider border border-emerald-400/30 cursor-pointer"
          >
            <Sparkles size={18} className="text-emerald-200 animate-spin-slow" />
            Render in Modulr
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

