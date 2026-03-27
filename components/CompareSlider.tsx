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
  const [aspectRatio, setAspectRatio] = useState<number>(16 / 9); // Default fallback
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

  // Detect aspect ratio of the rendered image to match container
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth && naturalHeight) {
      setAspectRatio(naturalWidth / naturalHeight);
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div
        ref={containerRef}
        className="relative w-full select-none overflow-hidden bg-neutral-900/10 cursor-col-resize group backdrop-blur-sm rounded-2xl shadow-2xl"
        style={{ 
          aspectRatio: `${aspectRatio}`,
          maxHeight: '100%',
          maxWidth: '100%'
        }}
        onMouseMove={(e) => e.buttons === 1 && handleMouseMove(e)}
        onTouchMove={handleMouseMove}
        onClick={handleMouseMove}
      >
        {/* Background Image (After) */}
        <img
          src={getImageUrl(afterImage)}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          onLoad={handleImageLoad}
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
            className="absolute inset-0 w-full h-full object-cover"
            alt="Before"
          />
        </div>

        {/* Labels */}
        {afterLabel && (
          <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-md text-white text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-lg font-bold z-10 pointer-events-none border border-white/10 shadow-xl">
            {afterLabel}
          </div>
        )}
        {beforeLabel && (
          <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md text-white text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-lg font-bold z-10 pointer-events-none border border-white/10 shadow-xl"
            style={{ opacity: sliderPosition > 15 ? 1 : 0, transition: 'opacity 0.3s' }}
          >
            {beforeLabel}
          </div>
        )}

        {/* Handle Line */}
        <div
          className="absolute inset-y-0 w-[2px] bg-white z-20 pointer-events-none"
          style={{ left: `${sliderPosition}%` }}
        >
            <div className="absolute inset-x-[-4px] inset-y-0 bg-accent/20 blur-sm"></div>
        </div>

        {/* Handle Grip */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -ml-5 w-10 h-10 bg-white rounded-full shadow-[0_0_20px_rgba(0,0,0,0.3)] flex items-center justify-center text-neutral-800 transition-transform group-active:scale-110 z-30 pointer-events-none"
          style={{ left: `${sliderPosition}%` }}
        >
          <div className="flex gap-0.5">
            <div className="w-[2px] h-4 bg-neutral-300 rounded-full"></div>
            <div className="w-[2px] h-4 bg-neutral-600 rounded-full"></div>
            <div className="w-[2px] h-4 bg-neutral-300 rounded-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
};