import React from 'react';
import { Sun } from 'lucide-react';

interface LightingDirectionPickerProps {
    value: string;
    onChange: (val: string) => void;
}

const directions = [
    { label: 'Front', value: 'Sunlight hitting the front facade directly' },
    { label: 'Left', value: 'Sunlight from the left side, casting long shadows to the right' },
    { label: 'Right', value: 'Sunlight from the right side, casting long shadows to the left' },
    { label: 'Back', value: 'Backlit from behind the building, dramatic silhouette lighting' },
    { label: 'Top', value: 'Harsh overhead midday sun, short shadows' }
];

export const LightingDirectionPicker: React.FC<LightingDirectionPickerProps> = ({ value, onChange }) => {
    return (
        <div className="space-y-3 pt-6 border-t border-border">
            <label className="text-xs font-bold uppercase tracking-widest text-secondary flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                Lighting Direction
            </label>
            <div className="grid grid-cols-5 gap-2">
                {directions.map(d => (
                    <button
                        key={d.label}
                        onClick={() => onChange(value === d.value ? '' : d.value)}
                        className={`p-2 rounded-xl flex flex-col items-center gap-1 transition-all duration-300 btn-micro border ${value === d.value
                                ? 'bg-white/10 border-white text-white shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                                : 'glass-panel border-white/5 text-secondary hover:text-white hover:border-white/30'
                            }`}
                        title={d.value}
                    >
                        <Sun size={18} className={value === d.value ? 'text-accent' : ''} />
                        <span className="text-[10px] font-semibold">{d.label}</span>
                    </button>
                ))}
            </div>
            {value && (
                <p className="text-[10px] text-accent/80 text-center font-medium">
                    Active: {directions.find(d => d.value === value)?.value}
                </p>
            )}
        </div>
    );
};
