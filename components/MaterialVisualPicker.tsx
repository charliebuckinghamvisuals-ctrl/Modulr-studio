import React from 'react';

interface MaterialVisualPickerProps {
    options: string[];
    value: string;
    onChange: (val: string) => void;
    label: string;
}

const getGradientForMaterial = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('cedar') || lower.includes('timber') || lower.includes('oak') || lower.includes('larch')) return 'linear-gradient(135deg, #8B5A2B, #D2B48C)';
    if (lower.includes('charred') || lower.includes('black')) return 'linear-gradient(135deg, #1a1a1a, #4a4a4a)';
    if (lower.includes('white') || lower.includes('render')) return 'linear-gradient(135deg, #f0f0f0, #ffffff)';
    if (lower.includes('zinc') || lower.includes('aluminium') || lower.includes('metal') || lower.includes('grey')) return 'linear-gradient(135deg, #708090, #B0C4DE)';
    if (lower.includes('slate') || lower.includes('anthracite') || lower.includes('composite')) return 'linear-gradient(135deg, #2F4F4F, #5c6c7c)';
    if (lower.includes('clay') || lower.includes('brick')) return 'linear-gradient(135deg, #A52A2A, #CD5C5C)';
    if (lower.includes('green') || lower.includes('sedum')) return 'linear-gradient(135deg, #556B2F, #8FBC8F)';
    if (lower.includes('glass')) return 'linear-gradient(135deg, #87CEEB, #E0FFFF)';
    if (lower.includes('stone') || lower.includes('concrete')) return 'linear-gradient(135deg, #9ca3af, #d1d5db)';
    if (lower.includes('porcelain') || lower.includes('tiles')) return 'linear-gradient(135deg, #e5e7eb, #f3f4f6)';
    return 'linear-gradient(135deg, #555, #888)';
};

export const MaterialVisualPicker: React.FC<MaterialVisualPickerProps> = ({ options, value, onChange, label }) => {
    return (
        <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-widest text-secondary flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></div>
                {label}
            </label>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                {options.map((opt) => (
                    <button
                        key={opt}
                        onClick={() => onChange(opt)}
                        className={`group relative overflow-hidden h-16 rounded-xl border transition-all duration-300 btn-micro ${value === opt ? 'border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'border-white/10 hover:border-white/40'
                            }`}
                    >
                        <div
                            className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity"
                            style={{ background: getGradientForMaterial(opt) }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center p-2 bg-black/40 backdrop-blur-[2px]">
                            <span className={`text-[10px] sm:text-xs font-medium text-center leading-tight drop-shadow-md ${value === opt ? 'text-white' : 'text-zinc-300 group-hover:text-white'}`}>
                                {opt}
                            </span>
                        </div>
                    </button>
                ))}
            </div>
            <input
                type="text"
                placeholder={`Or type custom ${label.toLowerCase()}...`}
                className="w-full mt-2 p-3 rounded-xl glass-panel text-white focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-transparent text-xs placeholder-secondary shadow-inner transition-all"
                value={!options.includes(value) && value ? value : ''}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
};
