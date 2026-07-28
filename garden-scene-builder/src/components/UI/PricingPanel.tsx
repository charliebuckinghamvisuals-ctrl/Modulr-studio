import { useState } from 'react';
import { useStore } from '../../store';
import { Settings, X } from 'lucide-react';

export function PricingPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const { scene, updatePricing } = useStore();
  const { pricing } = scene;

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="absolute bottom-24 right-8 bg-white/80 backdrop-blur-md p-3 rounded-full shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] border border-black/5 text-gray-500 hover:text-[#3b4d4a] hover:bg-white transition-all z-20"
        title="Pricing Settings"
      >
        <Settings size={20} />
      </button>
    );
  }

  return (
    <div className="absolute bottom-24 right-8 bg-white/95 backdrop-blur-2xl rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] border border-black/5 p-5 w-80 z-20 max-h-[80vh] overflow-y-auto flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-[#3b4d4a] tracking-tight">Pricing Config</h3>
        <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-700">Base Price (per sqm)</label>
          <input 
            type="number" 
            value={pricing.basePricePerSqm} 
            onChange={(e) => updatePricing({ basePricePerSqm: Number(e.target.value) })}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3b4d4a] focus:ring-1 focus:ring-[#3b4d4a] focus:border-[#3b4d4a] outline-none"
          />
        </div>
        
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-700">Canopy Price (per sqm)</label>
          <input 
            type="number" 
            value={pricing.canopyPricePerSqm} 
            onChange={(e) => updatePricing({ canopyPricePerSqm: Number(e.target.value) })}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3b4d4a]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-700">Decking Price (per sqm)</label>
          <input 
            type="number" 
            value={pricing.deckingPricePerSqm} 
            onChange={(e) => updatePricing({ deckingPricePerSqm: Number(e.target.value) })}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3b4d4a]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-700">Door Price (per leaf)</label>
          <input 
            type="number" 
            value={pricing.doorLeafPrice} 
            onChange={(e) => updatePricing({ doorLeafPrice: Number(e.target.value) })}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3b4d4a]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-700">Window Price (per sqm)</label>
          <input 
            type="number" 
            value={pricing.windowPricePerSqm} 
            onChange={(e) => updatePricing({ windowPricePerSqm: Number(e.target.value) })}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3b4d4a]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-700">Skylight Price (each)</label>
          <input 
            type="number" 
            value={pricing.skylightPrice} 
            onChange={(e) => updatePricing({ skylightPrice: Number(e.target.value) })}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3b4d4a]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-700">Partition Price (per linear m)</label>
          <input 
            type="number" 
            value={pricing.partitionLmPrice} 
            onChange={(e) => updatePricing({ partitionLmPrice: Number(e.target.value) })}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#3b4d4a]"
          />
        </div>

        <div className="mt-4 border-t pt-4">
          <label className="text-xs font-bold uppercase text-gray-500 tracking-wider mb-2 block">Material Pricing (per sqm)</label>
          
          <div className="space-y-2">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block">Cladding</span>
            {Object.entries(pricing.claddingPrices).map(([key, val]) => (
               <div key={key} className="flex justify-between items-center gap-2">
                 <span className="text-[11px] text-gray-600 truncate flex-1">{key.replace('_', ' ')}</span>
                 <input 
                   type="number" 
                   value={val} 
                   onChange={(e) => updatePricing({ claddingPrices: { ...pricing.claddingPrices, [key]: Number(e.target.value) } })}
                   className="w-20 bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs text-[#3b4d4a]"
                 />
               </div>
            ))}
          </div>

          <div className="space-y-2 mt-4">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block">Roof</span>
            {Object.entries(pricing.roofPrices).map(([key, val]) => (
               <div key={key} className="flex justify-between items-center gap-2">
                 <span className="text-[11px] text-gray-600 truncate flex-1">{key.replace('_', ' ')}</span>
                 <input 
                   type="number" 
                   value={val} 
                   onChange={(e) => updatePricing({ roofPrices: { ...pricing.roofPrices, [key]: Number(e.target.value) } })}
                   className="w-20 bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs text-[#3b4d4a]"
                 />
               </div>
            ))}
          </div>

          <div className="space-y-2 mt-4">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block">Base/Floor</span>
            {Object.entries(pricing.basePrices).map(([key, val]) => (
               <div key={key} className="flex justify-between items-center gap-2">
                 <span className="text-[11px] text-gray-600 truncate flex-1">{key.replace('_', ' ')}</span>
                 <input 
                   type="number" 
                   value={val} 
                   onChange={(e) => updatePricing({ basePrices: { ...pricing.basePrices, [key]: Number(e.target.value) } })}
                   className="w-20 bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs text-[#3b4d4a]"
                 />
               </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
