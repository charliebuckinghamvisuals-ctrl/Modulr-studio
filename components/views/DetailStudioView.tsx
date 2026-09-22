import React from 'react';
import { Grid, Download, CheckCircle, Circle, Loader2, Upload, X, FolderOpen, Camera } from 'lucide-react';
import { Button } from '../Button';
import { RENDER_CANVAS, TOOL_PAGE, TOOL_SIDEBAR, TOOL_CANVAS_COL } from '../canvasStyles';

/**
 * Detail Studio - was Material Studio until 21 Sep 2026.
 *
 * Two modes on one upload: 'closeup' = the 2x2 material sheet from four focal
 * points, 'shots' = one suggested camera shot. The masked material edit that
 * used to be a third mode here is its own tool now (MaterialEditorView): it
 * changes the building, these two only photograph it, and one page doing both
 * confused the choice.
 */
export type DetailStudioMode = 'closeup' | 'shots';

interface DetailStudioViewProps {
    onSaveToProject?: (image: string) => void;
    detectedDetails: string[];
    selectedDetails: string[];
    toggleDetailSelection: (detail: string) => void;
    handleDetailStudio: () => void;
    originalImage: string | null;
    detailStudioImage: string | null;
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
    mode: DetailStudioMode | null;
    onChooseMode: (mode: DetailStudioMode) => void;
    onResetMode: () => void;
}

export const DetailStudioView: React.FC<DetailStudioViewProps> = ({
    detectedDetails,
    selectedDetails,
    toggleDetailSelection,
    handleDetailStudio,
    originalImage,
    detailStudioImage,
    handleDownload,
    onSaveToProject,
    onOpenSceneUpload,
    downloadFormat,
    onFormatChange,
    isLoading,
    loadingMessage,
    historyFooter,
    mode,
    onChooseMode,
    onResetMode,
}) => {
    const getImageUrl = (img: string | null) => {
        if (!img) return '';
        if (img.startsWith('http') || img.startsWith('blob:') || img.startsWith('data:')) {
            return img;
        }
        return `data:image/jpeg;base64,${img}`;
    };

    return (
        <div className={TOOL_PAGE}>
            <div className={TOOL_SIDEBAR}>
                <div className="space-y-4">
                    <h2 className="text-[7vw] md:text-2xl lg:text-3xl font-bold text-accent w-fit inline-block leading-tight">Detail Studio</h2>
                    <p className="text-slate-600 text-sm leading-relaxed">
                        {mode === 'shots'
                            ? 'Close-up shots of a finished render. The engine reads the picture like a photographer and suggests the shots worth taking; pick one and it takes that photograph of the same building, same light, nothing redesigned.'
                            : 'Architectural material detail sheet generator. The engine compiles a high-resolution 2x2 presentation grid based on your specific material focal points.'}
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

                {detectedDetails.length > 0 ? (
                    <div className="flex-1 flex flex-col gap-5">
                        {/* Dark-theme leftovers: white text on the white sidebar made
                            this instruction invisible, so the 16 chips looked
                            unexplained and the hidden Generate button confusing. */}
                        <div className="flex justify-between items-center text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400">
                            <span>{mode === 'shots' ? 'Suggested camera shots' : 'Select 4 Focus Details'}</span>
                            {mode === 'shots'
                                ? <span className={`${selectedDetails.length === 1 ? 'text-accent' : 'text-slate-300'}`}>{selectedDetails.length === 1 ? 'Shot picked' : 'Pick one shot'}</span>
                                : <span className={`${selectedDetails.length === 4 ? 'text-accent' : 'text-slate-300'}`}>{selectedDetails.length} / 4 Selected</span>}
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
                                    Upload a finished render to pick out the details worth a close-up.
                                </p>
                            </>
                        )}
                    </div>
                )}

                <div className="mt-auto pt-6 border-t border-white/10">
                    {((mode === 'closeup' && selectedDetails.length === 4) || (mode === 'shots' && selectedDetails.length === 1)) && (
                        <div className="pt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <Button
                                className="w-full"
                                // Wrapped, NOT passed directly. handleDetailStudio
                                // takes an optional source image as its first
                                // argument, so handing it straight to onClick made
                                // React pass the click event as that image - and the
                                // event is truthy, so it was sent to the API and
                                // JSON.stringify choked on the React fiber inside
                                // the button element.
                                onClick={() => handleDetailStudio()}
                                disabled={isLoading}
                                icon={<Grid size={16} />}
                            >
                                {mode === 'shots' ? 'Generate shot' : 'Generate Grid (2x2)'}
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Same column as every other tool page (TOOL_CANVAS_COL), so the
                canvas fills the workspace height instead of sitting at its
                320px minimum in a centred wrapper (Charlie, 21 Sep 2026: "the
                render box is much thinner than all the others"). */}
            <div className={`${TOOL_CANVAS_COL} relative z-10 justify-center`}>
                {isLoading ? (
                    <div className={`${RENDER_CANVAS} flex-col bg-white z-50`}>
                        <Loader2 className="w-10 h-10 animate-spin text-accent mb-4 mx-auto" />
                        <p className="text-accent font-medium text-lg tracking-wide text-center mx-auto">{loadingMessage}</p>
                    </div>
                ) : detailStudioImage ? (
                    <div className="flex-1 flex items-center justify-center p-8 relative z-10 transition-all duration-700 opacity-100 scale-100">
                        {/*
                          * Bounded by HEIGHT as well as width.
                          *
                          * The detail sheet is a 2x2 grid, so it is roughly square.
                          * At `w-full` inside max-w-5xl that made it about 1024px
                          * tall - taller than the panel, which clips - so the top of
                          * the sheet was cut off along with the download button, and
                          * the rest ran over the Recent Iterations list below.
                          */}
                        <div className="relative group rounded-3xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.8)] border border-white/10 max-w-5xl max-h-full">
                            <img
                                src={getImageUrl(detailStudioImage)}
                                className="max-h-[68vh] w-auto max-w-full object-contain bg-black block"
                                alt="Detail Studio Generation"
                            />
                            {/* Always visible, not hover-only: on a tall sheet the
                                hover target sat off-screen, so the only way to
                                download was to guess where it was. */}
                            <div className="absolute top-4 right-4 flex gap-2 opacity-100 transition-opacity duration-300 items-center">
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
                                {onSaveToProject && detailStudioImage && (
                                    <button
                                        onClick={() => onSaveToProject(detailStudioImage)}
                                        className="p-3 bg-white text-black rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center border border-white/20 shadow-2xl scale-100 active:scale-95"
                                        title="Save to Project"
                                    >
                                        <FolderOpen size={20} />
                                    </button>
                                )}
                                <button
                                    onClick={() => handleDownload(detailStudioImage, 'DetailStudio')}
                                    className="p-3 bg-white text-black rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center border border-white/20 shadow-2xl scale-100 active:scale-95"
                                    title="Download this shot"
                                >
                                    <Download size={20} />
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 flex flex-col items-stretch justify-center text-secondary w-full">
                        {originalImage ? (
                            <div className={`${RENDER_CANVAS} group`}>
                                <img src={getImageUrl(originalImage)} className="w-full h-full object-contain opacity-30 grayscale transition-all duration-700 group-hover:opacity-50 absolute inset-0" />
                                <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent"></div>
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="glass-panel px-8 py-6 rounded-2xl text-white text-center shadow-[0_0_30px_rgba(0,0,0,0.5)] border border-white/20 backdrop-blur-xl">
                                        <p className="text-xl font-bold mb-2 tracking-tight">Source Analyzed</p>
                                        <p className="text-sm text-white/80 font-medium">{mode === 'shots' ? 'Pick one camera shot to generate.' : 'Select exactly 4 focal points to render.'}</p>
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
                        <div className="w-full max-w-xl bg-white rounded-xl shadow-2xl border border-white p-8 md:p-10 space-y-8 relative animate-in zoom-in-95 duration-300">
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
                                    Your image is ready. Choose how Detail Studio should work with it.
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
                                    onClick={() => onChooseMode('shots')}
                                    className="group text-left p-6 rounded-2xl border border-slate-200 hover:border-accent/50 hover:bg-accent/5 transition-all space-y-3"
                                >
                                    <div className="w-12 h-12 rounded-2xl bg-accent/8 border border-accent/15 flex items-center justify-center text-accent">
                                        <Camera size={22} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <h4 className="font-bold text-accent">Camera shots</h4>
                                        <p className="text-xs text-slate-500 leading-relaxed">
                                            The engine suggests close-up shots of your render - through the glazing,
                                            at a corner, on a detail. Pick one and it takes that photograph.
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
