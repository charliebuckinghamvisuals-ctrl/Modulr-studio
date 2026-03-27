import React from 'react';

interface ToggleSwitchProps {
    isOn: boolean;
    onToggle: () => void;
    label: string;
    icon?: React.ReactNode;
    activeColor?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ 
    isOn, 
    onToggle, 
    label, 
    icon,
    activeColor = 'bg-accent' 
}) => {
    return (
        <div 
            className="flex items-center justify-between gap-4 p-2.5 rounded-xl bg-white border border-accent/20 hover:border-accent/40 transition-all cursor-pointer group shadow-sm hover:shadow-md"
            onClick={onToggle}
        >
            <div className="flex items-center gap-3">
                {icon && <div className={`transition-colors duration-300 ${isOn ? 'text-accent' : 'text-slate-400'}`}>{icon}</div>}
                <span className={`text-[11px] font-bold uppercase tracking-wider transition-colors duration-300 ${isOn ? 'text-accent' : 'text-secondary'}`}>
                    {label}
                </span>
            </div>
            
            <div className={`relative w-11 h-6 rounded-full transition-colors duration-300 ease-in-out ${isOn ? activeColor : 'bg-slate-300'}`}>
                <div 
                    className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ease-in-out ${isOn ? 'translate-x-5' : 'translate-x-0'}`}
                />
            </div>
        </div>
    );
};
