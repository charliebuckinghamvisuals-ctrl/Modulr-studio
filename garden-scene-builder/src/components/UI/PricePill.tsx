import { useStore } from '../../store';

export function PricePill() {
  const calculatePrice = useStore(state => state.calculatePrice);
  const viewMode = useStore(state => state.viewMode);
  
  if (viewMode === 'capture' || viewMode === 'render') return null;

  const price = calculatePrice();

  return (
    <div className="absolute bottom-8 left-8 bg-white/80 backdrop-blur-2xl text-[#3b4d4a] border border-black/5 px-6 py-4 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] z-10 flex flex-col pointer-events-none">
      <span className="text-[10px] uppercase tracking-widest text-[#3b4d4a]/70 font-semibold mb-1">Estimated Price</span>
      <span className="text-2xl font-semibold tracking-tight">£{price.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</span>
    </div>
  );
}
