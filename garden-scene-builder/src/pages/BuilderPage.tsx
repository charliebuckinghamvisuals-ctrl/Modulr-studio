import { useState } from 'react';
import { CanvasArea } from '../components/CanvasArea';
import { Sidebar } from '../components/Sidebar';
import { ChevronRight, ChevronLeft, ChevronUp, ChevronDown } from 'lucide-react';

export default function BuilderPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="flex flex-col h-screen w-full bg-[#fafaf9] text-[#1d1d1f] overflow-hidden font-sans antialiased selection:bg-[#3b4d4a]/30">
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden relative">
        <div className="flex-1 relative order-2 md:order-1 h-full bg-transparent">
          <CanvasArea />
          
          {/* Sidebar Toggle Button (Desktop: side, Mobile: bottom) */}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="absolute z-30 bg-white shadow-md border border-black/10 text-gray-400 hover:text-gray-700 flex items-center justify-center transition-all md:right-0 md:top-1/2 md:-translate-y-1/2 md:translate-x-0 md:h-16 md:w-6 md:rounded-l-lg right-1/2 bottom-0 translate-x-1/2 translate-y-0 w-16 h-6 rounded-t-lg md:rounded-tr-none md:rounded-br-none"
            title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <span className="hidden md:block">
              {isSidebarOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </span>
            <span className="block md:hidden">
              {isSidebarOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </span>
          </button>
        </div>

        <div 
          className={`bg-white/95 backdrop-blur-3xl shadow-[-4px_0_20px_rgba(0,0,0,0.08)] border-l border-black/5 z-10 flex flex-col order-1 md:order-2 transition-all duration-300 ease-in-out ${
            isSidebarOpen ? 'h-[40vh] md:h-full md:w-[380px]' : 'h-0 md:h-full md:w-0 overflow-hidden'
          }`}
        >
          <div className="w-full md:w-[380px] h-full flex flex-col min-w-[380px]">
            <Sidebar />
          </div>
        </div>
      </div>
    </div>
  );
}
