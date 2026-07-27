import React, { useState } from 'react';
import { DoorOpen, DoorClosed, FileText } from 'lucide-react';
import { useStore } from '../../store';
import { ExportPDFModal } from './ExportPDFModal';

export function ActionButtons() {
  const { viewMode, setViewMode, areDoorsOpen, toggleDoors, isExporting } = useStore();
  const [showExportModal, setShowExportModal] = useState(false);

  return (
    <>
      {(viewMode === '3d' || viewMode === 'walking') && !isExporting && (
        <div className="absolute bottom-8 right-8 z-10 flex flex-col md:flex-row gap-4 items-end">
          <button 
            onClick={() => setShowExportModal(true)}
            className="bg-white/90 backdrop-blur-md text-[#3b4d4a] border border-[#3b4d4a]/20 px-6 py-3 rounded-full font-semibold shadow-sm hover:bg-[#3b4d4a] hover:text-white transition-all flex items-center gap-2"
          >
            <FileText size={20} />
            Export PDF
          </button>
          <button 
            onClick={toggleDoors}
            className="bg-[#3b4d4a] text-white border border-[#3b4d4a]/20 px-6 py-3 rounded-full font-semibold shadow-sm hover:bg-[#2d3a38] transition-all flex items-center gap-2"
          >
            {areDoorsOpen ? <DoorClosed size={20} /> : <DoorOpen size={20} />}
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
