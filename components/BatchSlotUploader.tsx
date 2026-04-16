import React, { useRef } from 'react';
import { Upload, X, CheckCircle2 } from 'lucide-react';

interface BatchSlotUploaderProps {
    batchImages: string[];
    batchRenders?: string[];
    onUpload: (file: File | null, index: number) => void;
}

export const BatchSlotUploader: React.FC<BatchSlotUploaderProps> = ({ batchImages, batchRenders, onUpload }) => {
    const slots = ['Angle 1', 'Angle 2', 'Angle 3', 'Angle 4', 'Angle 5'];
    const fileInputs = useRef<(HTMLInputElement | null)[]>([]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
        const file = e.target.files?.[0] || null;
        onUpload(file, index);
        if (e.target) e.target.value = '';
    };

    return (
        <div className="flex flex-col gap-2 w-full mt-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/60 mb-1 flex items-center gap-2">
                <Upload size={12} className="text-secondary" />
                Batch Angles
            </label>
            
            <div className="grid grid-cols-2 gap-2">
                {slots.map((label, index) => {
                    const hasImage = batchImages[index] && batchImages[index].trim() !== '';
                    const hasRender = batchRenders && batchRenders[index] && batchRenders[index].trim() !== '';
                    const imgUrl = hasImage ? (batchImages[index].startsWith('data:') ? batchImages[index] : `data:image/jpeg;base64,${batchImages[index]}`) : null;

                    return (
                        <div 
                            key={index} 
                            className={`relative w-full aspect-[4/3] rounded-xl overflow-hidden border-2 transition-all duration-300 flex flex-col items-center justify-center cursor-pointer group ${
                                hasImage 
                                    ? 'border-accent shadow-[0_0_15px_rgba(139,92,246,0.15)] bg-black' 
                                    : 'border-dashed border-slate-300 bg-slate-50 hover:border-accent hover:bg-accent/5'
                            }`}
                            onClick={() => !hasImage && fileInputs.current[index]?.click()}
                        >
                            <input 
                                type="file" 
                                className="hidden" 
                                accept="image/*"
                                ref={el => fileInputs.current[index] = el}
                                onChange={(e) => handleFileSelect(e, index)}
                            />

                            {hasImage ? (
                                <>
                                    <img src={imgUrl!} className="w-full h-full object-cover opacity-80" alt={label} />
                                    <div className="absolute top-1 right-1 flex gap-1">
                                        {hasRender && (
                                            <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                                                <CheckCircle2 size={12} color="white" />
                                            </div>
                                        )}
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); onUpload(null, index); }}
                                            className="w-5 h-5 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center shadow-lg transition-colors"
                                        >
                                            <X size={12} color="white" />
                                        </button>
                                    </div>
                                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] font-bold text-center py-1 backdrop-blur-md">
                                        {label}
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center p-2 text-center opacity-60 group-hover:opacity-100 transition-opacity">
                                    <Upload size={14} className="mb-1 text-slate-500 group-hover:text-accent" />
                                    <span className="text-[9px] font-bold text-slate-500 group-hover:text-accent">{label}</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            
            {!batchImages.some(img => img && img.trim() !== '') && (
                <p className="text-[10px] text-slate-400 mt-2 italic px-1">
                    Upload elevations into the specific slots above. You don't need to fill them all.
                </p>
            )}
        </div>
    );
};
