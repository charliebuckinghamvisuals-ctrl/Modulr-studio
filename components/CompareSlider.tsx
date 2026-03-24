import React, { useState, useRef } from 'react';
import { GripVertical } from 'lucide-react';

interface CompareSliderProps {
  beforeImage: string;
  afterImage: string;
  beforeLabel?: string;
  afterLabel?: string;
}

export const CompareSlider: React.FC<CompareSliderProps> = ({
  beforeImage,
  afterImage,
  beforeLabel = "Original",
  afterLabel = "Render"
}) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;

    const { left, width } = containerRef.current.getBoundingClientRect();
    let clientX;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
    } else {
      clientX = (e as React.MouseEvent).clientX;
    }

    const position = ((clientX - left) / width) * 100;
    setSliderPosition(Math.min(Math.max(position, 0), 100));
  };

  const getImageUrl = (img: string) => {
    if (!img) return '';
    if (img.startsWith('http') || img.startsWith('/') || img.startsWith('./') || img.startsWith('blob:') || img.startsWith('data:')) {
      return img;
    }
    return `data:image/jpeg;base64,${img}`;
  };

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        className="relative w-full select-none overflow-hidden bg-neutral-900/10 cursor-col-resize group backdrop-blur-sm"
        style={{ paddingBottom: '56.25%' /* 16:9 aspect ratio */ }}
        onMouseMove={(e) => e.buttons === 1 && handleMouseMove(e)}
        onTouchMove={handleMouseMove}
        onClick={handleMouseMove}
      >
        {/* Background Image (After) - fills the 16:9 container */}
        <img
          src={getImageUrl(afterImage)}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          alt="After"
        />

        {/* Foreground Image (Before) */}
        <div
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{
            clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`
          }}
        >
          <img
            src={getImageUrl(beforeImage)}
            className="absolute inset-0 w-full h-full object-contain"
            alt="Before"
          />
        </div>

        {/* Labels */}
        {afterLabel && (
          <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-md text-white text-xs px-2 py-1 rounded font-medium z-10 pointer-events-none">
            {afterLabel}
          </div>
        )}
        {beforeLabel && (
          <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md text-white text-xs px-2 py-1 rounded font-medium z-10 pointer-events-none"
            style={{ opacity: sliderPosition > 10 ? 1 : 0 }}
          >
            {beforeLabel}
          </div>
        )}

        {/* Handle Line */}
        <div
          className="absolute inset-y-0 w-1 bg-white/80 shadow-[0_0_10px_rgba(0,0,0,0.3)] z-20 pointer-events-none"
          style={{ left: `${sliderPosition}%` }}
        />

        {/* Handle Grip */}
        <div
          className="absolute top-1/2 -mt-4 -ml-4 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-neutral-800 transition-transform group-active:scale-110 z-30 pointer-events-none"
          style={{ left: `${sliderPosition}%` }}
        >
          <GripVertical size={16} />
        </div>
      </div>
    </div>
  );
};