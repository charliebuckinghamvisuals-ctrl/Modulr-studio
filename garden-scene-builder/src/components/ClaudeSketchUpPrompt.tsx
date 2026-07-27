import React, { useState } from 'react';
import { useStore } from '../store';
import { Copy, Check } from 'lucide-react';

export function ClaudeSketchUpPrompt() {
  const store = useStore();
  const room = store.scene.room;
  const [copied, setCopied] = useState(false);

  const generatePrompt = () => {
    let prompt = `I need you to write a ruby script for SketchUp to build a simple garden room shell with openings for doors and windows. Group the main structures appropriately.

Overall Dimensions:
- Width: ${room.widthMm} mm
- Depth: ${room.depthMm} mm
- Total Height Front: ${(room.heightMm ?? 2350) + (room.baseHeightMm ?? 100) + (room.roofHeightMm ?? 200)} mm
${room.backHeightMm ? `- Total Height Back: ${(room.backHeightMm ?? room.heightMm ?? 2350) + (room.baseHeightMm ?? 100) + (room.roofHeightMm ?? 200)} mm\n` : ''}- Base Height: ${room.baseHeightMm} mm
- Roof (Fascia) Height: ${room.roofHeightMm} mm
- Wall Thickness: ${room.wallThicknessMm || 150} mm
`;

    if (room.doors && room.doors.length > 0) {
      prompt += `\nDoor Openings:\n`;
      room.doors.forEach((door, i) => {
        prompt += `- Opening ${i + 1}: Wall: ${door.wall}, Width: ${door.widthMm}mm, Height: ${door.heightMm}mm, Offset from center: ${door.offsetMm}mm\n`;
      });
    }

    if (room.windows && room.windows.length > 0) {
      prompt += `\nWindow Openings:\n`;
      room.windows.forEach((win, i) => {
        prompt += `- Opening ${i + 1}: Wall: ${win.wall}, Width: ${win.widthMm}mm, Height: ${win.heightMm}mm, Offset from center: ${win.offsetMm ?? 0}mm, Sill Height (distance from floor): ${win.sillMm ?? 1000}mm\n`;
      });
    }

    prompt += `\nNote: Please only create the shell and cut out the openings. Do not add cladding, internal walls, or actual doors/windows.\n`;

    return prompt;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatePrompt());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 bg-white border border-black/5 rounded-xl shadow-sm space-y-3">
      <p className="text-xs text-gray-600 leading-relaxed">
        Generate a prompt to paste into Claude (or ChatGPT) to build this exact room model in SketchUp.
      </p>
      
      <button 
        onClick={handleCopy}
        className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? 'Prompt Copied!' : 'Copy Claude Prompt'}
      </button>
    </div>
  );
}
