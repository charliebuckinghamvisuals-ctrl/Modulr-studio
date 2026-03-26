import React from 'react';
import { Grid, Download, CheckCircle, Circle, Loader2, Upload } from 'lucide-react';
import { Button } from '../Button';
import { SkeletonLoader } from '../SkeletonLoader';

interface MaterialStudioViewProps {
    detectedDetails: string[];
    selectedDetails: string[];
    toggleDetailSelection: (detail: string) => void;
    handleMaterialStudio: () => void;
    originalImage: string | null;
    materialStudioImage: string | null;
    handleDownload: (image: string | null, prefix: string) => void;
    onOpenSceneUpload: () => void;
    downloadFormat?: 'png' | 'jpg';
    onFormatChange?: (format: 'png' | 'jpg') => void;
    isLoading: boolean;
    loadingMessage: string;
    historyFooter?: React.ReactNode;
}

export const MaterialStudioView: React.FC<MaterialStudioViewProps> = ({
    detectedDetails,
    selectedDetails,
    toggleDetailSelection,
    handleMaterialStudio,
    originalImage,
    materialStudioImage,
    handleDownload,
    onOpenSceneUpload,
    downloadFormat,
    onFormatChange,
    isLoading,
    loadingMessage,
    historyFooter
}) => {
    const getImageUrl = (img: string | null) => {
        if (!img) return '';
        if (img.startsWith('http') || img.startsWith('blob:') || img.startsWith('data:')) {
            return img;
        }
        return `data:image/jpeg;base64,${img}`;
    };

    return (
        <div className="h-full flex flex-col md:flex-row bg-background relative overflow-hidden">
            {/* Ambient Lighting */}
            <div className="absolute top-1/2 right-1/4 w-[600px] h-[600px] bg-white/5 rounded-full blur-[150px] pointer-events-none"></div>

            <div className="w-full md:w-80 p-6 flex flex-col gap-6 relative z-10 overflow-y-auto">
                <div className="space-y-4">
                    <h2 className="text-[6vw] md:text-xl lg:text-2xl whitespace-nowrap font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#000000] via-[#404040] to-[#808080] w-fit inline-block">Material Studio</h2>
                    <p className="text-secondary text-lg leading-relaxed">
                        Architectural material detail sheet generator. The engine compiles a 4K 2x2 presentation grid based on your specific material focal points.
                    </p>
                </div>

                {/* Selection Area */}
                {detectedDetails.length > 0 ? (
                    <div className="flex-1 flex flex-col gap-5">
                        <div className="flex justify-between items-center text-xs uppercase tracking-widest font-bold text-secondary">
                            <span>Select 4 Focus Details</span>
                            <span className={`${selectedDetails.length === 4 ? 'text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]' : 'text-secondary'}`}>{selectedDetails.length} / 4 Selected</span>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                            {detectedDetails.map((detail, idx) => {
                                const isSelected = selectedDetails.includes(detail);
                                return (
                                    <div
                                        key={idx}
                                        onClick={() => toggleDetailSelection(detail)}
                                        className={`
                                        p-4 rounded-xl border cursor-pointer transition-all duration-300 flex items-center justify-between group overflow-hidden relative
                                        ${isSelected
                                                ? 'bg-white/10 border-white/50 text-white shadow-[0_0_20px_rgba(255,255,255,0.15)] -translate-y-0.5'
                                                : 'bg-surface/50 border-border text-secondary hover:text-white hover:border-white/30 hover:bg-surface'
                                            }
                                        ${selectedDetails.length >= 4 && !isSelected ? 'opacity-40 cursor-not-allowed hover:-translate-y-0 hover:border-border' : ''}
                                    `}
                                    >
                                        {isSelected && <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-50 pointer-events-none" />}
                                        <div className="flex flex-col relative z-10">
                                            <span className={`text-sm font-semibold tracking-wide ${isSelected ? 'text-white' : ''}`}>{detail}</span>
                                            <span className="text-[10px] text-white/70 uppercase tracking-widest mt-1 font-medium">Texture / Macro</span>
                                        </div>
                                        {isSelected ? <CheckCircle size={20} className="text-white relative z-10 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" /> : <Circle size={20} className="text-border group-hover:text-secondary transition-colors relative z-10" />}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="p-8 border border-white/5 rounded-2xl bg-surface/20 flex flex-col items-center gap-3 text-center shadow-inner">
                        {originalImage ? (
                            <div className="flex flex-col items-center gap-4 py-4">
                                <Loader2 className="w-8 h-8 animate-spin text-accent shadow-[0_0_10px_rgba(139,92,246,0.5)] rounded-full" />
                                <span className="tracking-wide text-white font-medium">Analyzing geometry...</span>
                            </div>
                        ) : (
                            <>
                                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-1">
                                    <Grid className="w-6 h-6 text-accent opacity-80" />
                                </div>
                                <h3 className="text-white font-medium tracking-tight">Awaiting Scene</h3>
                                <p className="text-secondary text-xs leading-relaxed">
                                    Upload an image to detect surface materials and architectural details for your grid.
                                </p>
                            </>
                        )}
                    </div>
                )}

                <div className="mt-auto pt-6 border-t border-border">
                    {selectedDetails.length === 4 && (
                        <div className="pt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <Button
                                className="w-full"
                                onClick={handleMaterialStudio}
                                disabled={isLoading}
                                icon={<Grid size={16} />}
                            >
                                Generate Grid (2x2)
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 p-6 md:p-12 flex items-center justify-center relative z-10 w-full overflow-hidden">
                {isLoading ? (
                    <div className="w-full max-w-5xl mx-auto flex-1 min-h-[500px] max-h-[85vh] glass-panel rounded-3xl overflow-hidden border-2 border-dashed border-border relative flex flex-col items-center justify-center bg-white z-50">
                        <Loader2 className="w-10 h-10 animate-spin text-black mb-4 mx-auto" />
                        <p className="text-black font-medium text-lg tracking-wide text-center mx-auto">{loadingMessage}</p>
                    </div>
                ) : materialStudioImage ? (
                    <div className="flex-1 flex items-center justify-center p-8 relative z-10 transition-all duration-700 opacity-100 scale-100">
                        <div className="relative group rounded-3xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.8)] border border-white/10 max-w-5xl w-full">
                            <img
                                src={getImageUrl(materialStudioImage)}
                                className="w-full h-auto object-contain bg-black"
                                alt="Material Studio Generation"
                            />
                            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 items-center">
                                <div className="flex items-center bg-black/40 backdrop-blur-xl rounded-xl p-1 border border-white/20 mr-1">
                                    <button
                                        onClick={() => onFormatChange?.('png')}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest transition-all ${downloadFormat === 'png' ? 'bg-white text-black shadow-lg' : 'text-white/60 hover:text-white'}`}
                                    >
                                        PNG
                                    </button>
                                    <button
                                        onClick={() => onFormatChange?.('jpg')}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest transition-all ${downloadFormat === 'jpg' ? 'bg-white text-black shadow-lg' : 'text-white/60 hover:text-white'}`}
                                    >
                                        JPG
                                    </button>
                                </div>
                                <button
                                    onClick={() => handleDownload(materialStudioImage, 'MaterialStudio')}
                                    className="p-3 bg-white text-black rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center border border-white/20 shadow-2xl scale-100 active:scale-95"
                                    title="Download Material Focus Sheet"
                                >
                                    <Download size={20} />
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center text-secondary w-full">
                        {originalImage ? (
                            <div className="w-full max-w-5xl mx-auto flex-1 min-h-[500px] max-h-[85vh] glass-panel rounded-3xl overflow-hidden border-2 border-dashed border-border relative flex items-center justify-center bg-surface/50 group">
                                <img src={getImageUrl(originalImage)} className="w-full h-full object-contain opacity-30 grayscale transition-all duration-700 group-hover:opacity-50 absolute inset-0" />
                                <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent"></div>
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="glass-panel px-8 py-6 rounded-2xl text-white text-center shadow-[0_0_30px_rgba(0,0,0,0.5)] border border-white/20 backdrop-blur-xl">
                                        <p className="text-xl font-bold mb-2 tracking-tight">Source Analyzed</p>
                                        <p className="text-sm text-white/80 font-medium">Select exactly 4 focal points to render.</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div
                                onClick={onOpenSceneUpload}
                                className="w-full max-w-5xl mx-auto flex-1 min-h-[500px] max-h-[85vh] glass-panel rounded-3xl overflow-hidden border-2 border-dashed border-border hover:border-accent/40 relative flex flex-col items-center justify-center bg-surface/50 cursor-pointer group hover:bg-accent/5 transition-colors duration-300"
                            >
                                <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

                                <div className="w-20 h-20 bg-background rounded-full flex items-center justify-center mb-6 shadow-2xl group-hover:scale-110 group-hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all duration-300 border border-border group-hover:border-accent/30 relative">
                                    <div className="absolute inset-0 rounded-full bg-accent/20 blur-xl group-hover:opacity-100 opacity-0 transition-opacity"></div>
                                    <Upload className="text-secondary group-hover:text-accent relative z-10 transition-colors" size={28} />
                                </div>
                                <div className="text-center relative z-10">
                                    <p className="text-primary font-semibold text-lg mb-1 tracking-tight">Drop your image here</p>
                                    <p className="text-secondary text-sm">Or click to browse files</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                
                {historyFooter && (
                    <div className="absolute bottom-6 left-6 right-6 z-20 flex justify-center">
                        <div className="w-full max-w-5xl">
                            {historyFooter}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
