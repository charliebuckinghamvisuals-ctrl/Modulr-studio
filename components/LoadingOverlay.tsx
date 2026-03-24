import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  message: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message }) => {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/60 backdrop-blur-md rounded-2xl transition-all duration-500">
      <Loader2 className="w-10 h-10 animate-spin text-neutral-800 mb-4" />
      <p className="text-neutral-600 font-medium tracking-wide animate-pulse">{message}</p>
    </div>
  );
};