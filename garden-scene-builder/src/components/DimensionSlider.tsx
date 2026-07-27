import React, { useState, useEffect, useRef, useCallback } from 'react';

interface DimensionSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
}

export function DimensionSlider({ label, value, min, max, step, onChange }: DimensionSliderProps) {
  const [localValue, setLocalValue] = useState(value.toString());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestOnChange = useRef(onChange);
  latestOnChange.current = onChange;

  useEffect(() => {
    setLocalValue(value.toString());
  }, [value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const debouncedCommit = useCallback((num: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      latestOnChange.current(num);
    }, 60);
  }, []);

  const commit = (val: string) => {
    const num = parseInt(val) || 0;
    setLocalValue(num.toString());
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (num !== value) {
      onChange(num);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-xs">
        <span className="font-medium text-gray-700">{label}</span>
        <div className="flex items-center gap-1">
          <input 
            type="number" 
            value={localValue} 
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(e.currentTarget.value); }}
            className="w-14 text-right font-mono bg-transparent border-b border-transparent hover:border-gray-300 focus:border-[#3b4d4a] outline-none transition-colors -my-1 py-1"
          />
          <span className="text-gray-500 font-mono">mm</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value);
          const num = parseInt(e.target.value) || 0;
          if (num !== value) debouncedCommit(num);
        }}
        onPointerUp={() => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          const num = parseInt(localValue) || 0;
          if (num !== value) onChange(num);
        }}
        className="w-full apple-slider"
      />
    </div>
  );
}
