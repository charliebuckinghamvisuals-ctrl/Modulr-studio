import React, { useState, useEffect } from "react";
import { useStore } from "../../store";

export function CameraWidget() {
  const { viewMode } = useStore();
  const [isOrtho, setIsOrtho] = useState(false);

  // Listen to external changes to isOrtho if needed (optional)
  useEffect(() => {
    const handleSetView = (e: CustomEvent) => {
      if (e.detail === 'toggle-projection') {
        setIsOrtho(prev => !prev);
      }
    };
    window.addEventListener('camera-set-view', handleSetView as EventListener);
    return () => window.removeEventListener('camera-set-view', handleSetView as EventListener);
  }, []);

  if (viewMode !== "3d" && viewMode !== "plan") return null;

  const handleToggleProjection = () => {
    window.dispatchEvent(
      new CustomEvent("camera-set-view", { detail: "toggle-projection" })
    );
  };

  const setView = (side: string) => {
    window.dispatchEvent(new CustomEvent("camera-set-view", { detail: side }));
  };

  return (
    <div className="absolute top-24 left-8 z-50 flex flex-col items-center justify-center gap-6 p-4">
      <div className="relative w-28 h-28 flex items-center justify-center">
        {/* Center Toggle (Top View) */}
        <button
          onClick={() => setView("top")}
          className="absolute z-10 w-8 h-8 rounded-full border-2 border-[#3b4d4a] transition-all flex items-center justify-center shadow-sm bg-white hover:scale-110 text-[10px] font-bold text-[#3b4d4a]"
          title="Top View"
        >
          TOP
        </button>

        {/* Top (Front View) */}
        <div className="absolute top-0 flex flex-col items-center">
          <button
            onClick={() => setView("front")}
            className="text-sm font-bold text-[#3b4d4a] hover:text-[#2d3a38] transition-colors p-1"
            title="Front View"
          >
            F
          </button>
          <div className="w-[3px] h-6 bg-[#3b4d4a] -mt-1 rounded-sm"></div>
        </div>

        {/* Bottom (Back View) */}
        <div className="absolute bottom-0 flex flex-col items-center">
          <div className="w-[3px] h-6 bg-[#3b4d4a] -mb-1 rounded-sm"></div>
          <button
            onClick={() => setView("back")}
            className="text-sm font-bold text-[#3b4d4a] hover:text-[#2d3a38] transition-colors p-1"
            title="Back View"
          >
            B
          </button>
        </div>

        {/* Left (Left View) */}
        <div className="absolute left-0 flex items-center">
          <button
            onClick={() => setView("left")}
            className="text-sm font-bold text-[#3b4d4a] hover:text-[#2d3a38] transition-colors p-1"
            title="Left View"
          >
            L
          </button>
          <div className="w-6 h-[3px] bg-[#3b4d4a] -ml-1 rounded-sm"></div>
        </div>

        {/* Right (Right View) */}
        <div className="absolute right-0 flex items-center">
          <div className="w-6 h-[3px] bg-[#3b4d4a] -mr-1 rounded-sm"></div>
          <button
            onClick={() => setView("right")}
            className="text-sm font-bold text-[#3b4d4a] hover:text-[#2d3a38] transition-colors p-1"
            title="Right View"
          >
            R
          </button>
        </div>
      </div>

      {/* Projection Slider Toggle */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[9px] font-bold tracking-wider text-[#3b4d4a]/70 uppercase">
          {isOrtho ? 'Parallel' : 'Perspective'}
        </span>
        <button
          onClick={handleToggleProjection}
          className="relative w-12 h-6 bg-white border border-[#3b4d4a]/20 rounded-full shadow-inner p-1 transition-colors hover:bg-gray-50 flex items-center"
          title="Toggle Perspective / Orthographic"
        >
          <div 
            className={`w-4 h-4 bg-[#3b4d4a] rounded-full shadow-sm transition-transform duration-300 ease-in-out ${isOrtho ? 'translate-x-6' : 'translate-x-0'}`} 
          />
        </button>
      </div>
    </div>
  );
}
