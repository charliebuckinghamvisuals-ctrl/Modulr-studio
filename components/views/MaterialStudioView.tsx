import React from 'react';
import { Grid, Download, CheckCircle, Circle, Loader2, Upload, Layers, Palette, X } from 'lucide-react';
import { Button } from '../Button';
import { RENDER_CANVAS, WORKSPACE_HEIGHT } from '../canvasStyles';
import { MaterialVisualPicker } from '../MaterialVisualPicker';
import { PRESET_MATERIALS } from '../../constants';
import { MaterialConfig, MaterialLibrary } from '../../types';

export type MaterialStudioMode = 'closeup' | 'change';

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
    isHighQuality: boolean;
    setIsHighQuality: (val: boolean) => void;
    isProMode: boolean;
    setIsProMode: (val: boolean) => void;
    userPlan?: string;

    // Mode selection
    mode: MaterialStudioMode | null;
    onChooseMode: (mode: MaterialStudioMode) => void;
    onResetMode: () => void;

    // 'change' mode
    materials: MaterialConfig;
    setMaterials: React.Dispatch<React.SetStateAction<MaterialConfig>>;
    materialLibrary?: MaterialLibrary;
    onApplyMaterials: () => void;
    isAnalyzingMaterials?: boolean;
}

const MATERIAL_CATEGORIES: Array<{ key: keyof MaterialLibrary; label: string }> = [
    { key: 'walls', label: 'Cladding / Walls' },
    { key: 'roof', label: 'Roof' },
    { key: 'windows', label: 'Windows' },
    { key: 'doors', label: 'Doors' },
    { key: 'decking', label: 'Decking / Ground' },
];

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
    historyFooter,
    isHighQuality,
    setIsHighQuality,
    isProMode,
    setIsProMode,
    mode,
    onChooseMode,
    onResetMode,
    materials,
    setMaterials,
    materialLibrary,
    onApplyMaterials,
    isAnalyzingMaterials,
}) => {
    /** Presets plus anything the user saved to their own library. */
    const optionsFor = (key: keyof MaterialLibrary): string[] => {
        const presets = (PRESET_MATERIALS as any)[key] as string[] | undefined;
        const saved = (materialLibrary?.[key] || []).map(item => item.text || item.name);
        return Array.from(new Set([...(presets || []), ...saved]));
    };

    const getImageUrl = (img: string | null) => {
        if (!img) return '';
        if (img.startsWith('http') || img.startsWith('blob:') || img.startsWith('data:')) {
            return img;
        }
        return `data:image/jpeg;base64,${img}`;
    };

    return (
        <div className={`${WORKSPACE_HEIGHT} flex flex-col md:flex-row bg-background relative overflow-hidden`}>
            {/* Ambient Lighting */}
            <div className="absolute top-1/2 right-1/4 w-[600px] h-[600px] bg-white/5 rounded-full blur-[150px] pointer-events-none"></div>

            <div className="w-full md:w-80 flex flex-col gap-6 relative z-10 p-6 m-4 md:m-4 bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-y-auto border border-white">
                <div className="space-y-4">
                    <h2 className="text-[7vw] md:text-2xl lg:text-3xl font-bold text-accent w-fit inline-block leading-tight">Material Studio</h2>
                    <p className="text-slate-600 text-sm leading-relaxed">
                        {mode === 'change'
                            ? 'Swap the cladding, roof, glazing, doors and ground treatment on your building - the structure stays exactly as uploaded.'
                            : 'Architectural material detail sheet generator. The engine compiles a 4K 2x2 presentation grid based on your specific material focal points.'}
                    </p>
                    {mode && originalImage && (
                        <button
                            onClick={onResetMode}
                            className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 hover:text-accent transition-colors"
                        >
                            ← Switch mode
                        </button>
                    )}
                </div>

                {/* ── Change Materials mode ── */}
                {mode === 'change' ? (
                    <div className="flex-1 flex flex-col gap-5">
                        {isAnalyzingMaterials ? (
                            <div className="flex flex-col items-center gap-4 py-10">
                                <Loader2 className="w-8 h-8 animate-spin text-accent" />
                                <span className="text-accent font-medium animate-pulse text-sm">Analysing materials…</span>
                            </div>
                        ) : (
                            <>
                                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400">
                                    Detected materials - change any
                                </div>
                                <div className="flex flex-col gap-4">
                                    {MATERIAL_CATEGORIES.map(cat => (
                                        <MaterialVisualPicker
                                            key={cat.key}
                                            label={cat.label}
                                            options={optionsFor(cat.key)}
                                            value={(materials as any)[cat.key] || 'none'}
                                            onChange={val =>
                                                setMaterials(prev => ({ ...prev, [cat.key]: val }))
                                            }
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                ) : detectedDetails.length > 0 ? (
                    <div className="flex-1 flex flex-col gap-5">
                        {/* Dark-theme leftovers: white text on the white sidebar made
                            this instruction invisible, so the 16 chips looked
                            unexplained and the hidden Generate button confusing. */}
                        <div className="flex justify-between items-center text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400">
                            <span>Select 4 Focus Details</span>
                            <span className={`${selectedDetails.length === 4 ? 'text-accent' : 'text-slate-300'}`}>{selectedDetails.length} / 4 Selected</span>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                            {detectedDetails.map((detail, idx) => {
                                const isSelected = selectedDetails.includes(detail);
                                return (
                                    <div
                                        key={idx}
                                        onClick={() => toggleDetailSelection(detail)}
                                        className={`
                                        p-5 rounded-2xl border cursor-pointer transition-all duration-500 flex items-center justify-between group overflow-hidden relative
                                        ${isSelected
                                                ? 'bg-accent border-accent/20 text-white shadow-lg -translate-y-1'
                                                : 'bg-white border-accent/10 text-secondary hover:text-accent hover:border-accent/30 hover:bg-accent/5'
                                            }
                                        ${selectedDetails.length >= 4 && !isSelected ? 'opacity-20 cursor-not-allowed hover:-translate-y-0 hover:border-slate-100' : ''}
                                    `}
                                    >
                                        {isSelected && <div className="absolute inset-0 bg-gradient-to-r from-accent/10 to-transparent opacity-50 pointer-events-none" />}
                                        <div className="flex flex-col relative z-10">
                                            <span className={`text-sm font-semibold tracking-wide ${isSelected ? 'text-white' : 'text-accent'}`}>{detail}</span>
                                            <span className={`text-[10px] uppercase tracking-widest mt-1 font-medium ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>Texture / Macro</span>
                                        </div>
                                        {isSelected ? <CheckCircle size={20} className="text-white relative z-10 drop-shadow-[0_0_6px_rgba(0,0,0,0.35)]" /> : <Circle size={20} className="text-slate-200 group-hover:text-slate-400 transition-colors relative z-10" />}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="p-8 border border-slate-100 rounded-3xl bg-slate-50/50 flex flex-col items-center gap-4 text-center shadow-inner">
                        {originalImage ? (
                            <div className="flex flex-col items-center gap-4 py-4">
                                <Loader2 className="w-8 h-8 animate-spin text-accent shadow-[0_0_8px_rgba(64,90,86,0.35)] rounded-full" />
                                <span className="tracking-wide text-accent font-medium animate-pulse">Analyzing geometry...</span>
                            </div>
                        ) : (
                            <>
                                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-1">
                                    <Grid className="w-6 h-6 text-accent opacity-80" />
                                </div>
                                <h3 className="text-accent font-medium tracking-tight">Awaiting Scene</h3>
                                <p className="text-slate-400 text-xs leading-relaxed">
                                    Upload an image to detect surface materials and architectural details for your grid.
                                </p>
                            </>
                        )}
                    </div>
                )}

                <div className="mt-auto pt-6 border-t border-white/10">
                    {mode === 'change' && !isAnalyzingMaterials && (
                        <div className="pt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <Button
                                className="w-full"
                                onClick={onApplyMaterials}
                                disabled={isLoading}
                                icon={<Palette size={16} />}
                            >
                                Apply Materials
                            </Button>
                        </div>
                    )}

                    {mode === 'closeup' && selectedDetails.length === 4 && (
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
                    <div className={`${RENDER_CANVAS} flex-col bg-white z-50`}>
                        <Loader2 className="w-10 h-10 animate-spin text-accent mb-4 mx-auto" />
                        <p className="text-accent font-medium text-lg tracking-wide text-center mx-auto">{loadingMessage}</p>
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
                            <div className={`${RENDER_CANVAS} group`}>
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
                                className={`${RENDER_CANVAS} flex-col cursor-pointer group hover:bg-slate-50/60 transition-colors duration-200`}
                            >
                                <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

                                <div className="w-20 h-20 bg-background rounded-full flex items-center justify-center mb-6 shadow-2xl group-hover:scale-110 group-hover:shadow-sm transition-all duration-300 border border-border group-hover:border-accent/30 relative">
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

                {/* ── Mode picker ──
                    Shown once an image is loaded but no mode has been chosen.
                    The two modes need different analyses, so we ask before
                    spending a call rather than guessing. */}
                {originalImage && !mode && !isLoading && (
                    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-6 animate-in fade-in duration-300">
                        <div className="w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl border border-white p-8 md:p-10 space-y-8 relative animate-in zoom-in-95 duration-300">
                            <button
                                onClick={onOpenSceneUpload}
                                aria-label="Choose a different image"
                                className="absolute top-5 right-5 w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-accent hover:border-accent/40 transition-colors"
                            >
                                <X size={16} />
                            </button>

                            <div className="space-y-2">
                                <h3 className="text-2xl font-bold text-accent tracking-tight">What would you like to do?</h3>
                                <p className="text-slate-600 text-sm">
                                    Your image is ready. Choose how Material Studio should work with it.
                                </p>
                            </div>

                            <div className="grid sm:grid-cols-2 gap-4">
                                <button
                                    onClick={() => onChooseMode('closeup')}
                                    className="group text-left p-6 rounded-2xl border border-slate-200 hover:border-accent/50 hover:bg-accent/5 transition-all space-y-3"
                                >
                                    <div className="w-12 h-12 rounded-2xl bg-accent/8 border border-accent/15 flex items-center justify-center text-accent">
                                        <Grid size={22} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <h4 className="font-bold text-accent">Material Close-up</h4>
                                        <p className="text-xs text-slate-500 leading-relaxed">
                                            Pick four focal points and generate a 2x2 macro detail sheet of the
                                            materials - ideal for specification pages.
                                        </p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => onChooseMode('change')}
                                    className="group text-left p-6 rounded-2xl border border-slate-200 hover:border-accent/50 hover:bg-accent/5 transition-all space-y-3"
                                >
                                    <div className="w-12 h-12 rounded-2xl bg-accent/8 border border-accent/15 flex items-center justify-center text-accent">
                                        <Layers size={22} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <h4 className="font-bold text-accent">Change Materials</h4>
                                        <p className="text-xs text-slate-500 leading-relaxed">
                                            The AI analyses the building and detects its cladding, roof, glazing,
                                            doors and ground - then swap any of them.
                                        </p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
