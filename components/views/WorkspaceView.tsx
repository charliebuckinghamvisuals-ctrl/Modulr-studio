import React from 'react';
import { Download, Upload, Loader2, RotateCcw, FolderOpen, ShieldCheck, ShieldAlert, RefreshCw, Lock } from 'lucide-react';
import { Button } from '../Button';
import { CompareSlider } from '../CompareSlider';
import { SkeletonLoader } from '../SkeletonLoader';
import { ImageViewport } from '../ImageViewport';
import { RENDER_CANVAS, RENDER_CANVAS_FITTED, RENDER_CANVAS_IMG_MAX_H, WORKSPACE_HEIGHT } from '../canvasStyles';
import { GenerationProgress, RENDER_STAGES } from '../GenerationProgress';

interface WorkspaceViewProps {
    title: string;
    subtitle: string;
    controls: React.ReactNode;
    primaryImg: string | null;
    secondaryImg: string | null;
    placeholder: string;
    isLoading?: boolean;
    loadingMessage?: string;
    onDownload: (base64Data: string, filename: string) => void;
    /** Offer "Save to Project" on the finished image. */
    onSaveToProject?: (image: string) => void;
    /** The server's automatic quality check on the last render. */
    verification?: { checked: boolean; passed?: boolean; retried?: boolean } | null;
    /** Re-render: sameLook=true reuses the last seed, false rolls a new one. */
    onRerender?: (sameLook: boolean) => void;
    onInputClick: () => void;
    /** Empty the workspace without leaving the tool. */
    onReset?: () => void;
    downloadFormat?: 'png' | 'jpg';
    onFormatChange?: (format: 'png' | 'jpg') => void;
    customViewer?: React.ReactNode;
    customEmptyState?: React.ReactNode;
    extraFooter?: React.ReactNode;
    historyFooter?: React.ReactNode;
    batchImages?: string[];
    batchRenders?: string[];
    selectedBatchIndex?: number;
    onBatchSelect?: (index: number) => void;
    userPlan?: string;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
    title,
    subtitle,
    controls,
    primaryImg,
    secondaryImg,
    placeholder,
    isLoading,
    loadingMessage,
    onDownload,
    onSaveToProject,
    verification,
    onRerender,
    onInputClick,
    onReset,
    downloadFormat,
    onFormatChange,
    customViewer,
    customEmptyState,
    extraFooter,
    historyFooter,
    batchImages,
    batchRenders,
    selectedBatchIndex = 0,
    onBatchSelect,
    userPlan
}) => {

    const getImageUrl = (img: string | null) => {
        if (!img) return '';
        if (img.startsWith('http') || img.startsWith('blob:') || img.startsWith('data:')) {
            return img;
        }
        return `data:image/jpeg;base64,${img}`;
    };

    const renderViewer = () => {
        if (isLoading) {
            const isBatchActive = batchImages && batchImages.length > 1;
            const currentIsRendered = isBatchActive && batchRenders && batchRenders[selectedBatchIndex];
            
            if (!currentIsRendered) {
                return (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm z-50">
                        {/* Same waiting state as Animation Studio. loadingMessage
                            wins when the caller has something specific to say;
                            otherwise it walks the generic render stages. */}
                        <GenerationProgress
                            stages={RENDER_STAGES}
                            expectedSeconds={30}
                            message={loadingMessage}
                        />
                    </div>
                );
            }
        }

        if (customViewer) {
            return (
                <div className="w-full h-full absolute inset-0 flex items-center justify-center">
                    {customViewer}
                </div>
            );
        }

        let content = null;
        if (primaryImg && secondaryImg) {
            content = <CompareSlider beforeImage={secondaryImg} afterImage={primaryImg} />;
        } else if (primaryImg) {
            // The finished render gets the real viewer - scroll to zoom, drag to
            // pan. At 4K the detail that sells the job is invisible fitted to
            // the window.
            content = <ImageViewport src={getImageUrl(primaryImg)} alt="Render" />;
        } else if (secondaryImg) {
            content = (
                <>
                    <img src={getImageUrl(secondaryImg)} className="w-full h-full object-contain opacity-40 grayscale" alt="Source" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-white/90 backdrop-blur-md px-5 py-2.5 rounded-xl text-slate-600 text-sm font-medium border border-slate-200 shadow-sm">
                            {placeholder}
                        </span>
                    </div>
                </>
            );
        }

        if (content) {
            return (
                <div className="w-full h-full absolute inset-0 flex items-center justify-center">
                    {content}
                    {isLoading && (
                        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-xl border border-accent/20 flex items-center gap-3 z-50">
                            <Loader2 className="w-4 h-4 animate-spin text-accent" />
                            <span className="text-accent text-[10px] font-bold uppercase tracking-widest">{loadingMessage}</span>
                        </div>
                    )}
                </div>
            );
        }
        if (customEmptyState) {
            return (
                <div className="w-full h-full absolute inset-0 flex items-center justify-center">
                    {customEmptyState}
                </div>
            );
        }

        return (
            <div
                className="w-full h-full absolute inset-0 flex flex-col items-center justify-center cursor-pointer group transition-colors duration-200 hover:bg-slate-50/60"
                onClick={onInputClick}
            >
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mb-5 shadow-sm group-hover:border-accent/40 transition-colors">
                    <Upload className="text-slate-400 group-hover:text-accent transition-colors" size={22} />
                </div>
                <p className="text-slate-700 font-semibold text-base mb-1 text-center">Drop your drawing here</p>
                <p className="text-slate-400 text-sm text-center">or click to browse files</p>
            </div>
        );
    };

    return (
        <div className={`${WORKSPACE_HEIGHT} flex flex-col md:flex-row bg-background relative overflow-hidden`}>

            {/* A whisper of warmth behind the panels. It used to be a 400px
                accent blob at 10% - the blurred coloured glow that makes an app
                look like a demo rather than a tool. */}
            <div className="absolute top-1/3 left-1/3 w-[500px] h-[500px] bg-accent/[0.03] rounded-full blur-[140px] pointer-events-none"></div>

            <div className="w-full md:w-80 flex flex-col gap-6 relative z-10 p-6 m-4 md:m-4 bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-y-auto border border-white">
                <div className="space-y-4">
                    <h2 className="text-[7vw] md:text-2xl lg:text-3xl font-bold text-accent w-fit inline-block leading-tight">{title}</h2>
                    <p className="text-slate-600 text-sm leading-relaxed">{subtitle}</p>
                </div>
                {controls}
            </div>

            {/* overflow-y-auto: the column stacks canvas + export row + filmstrip
                + history inside a fixed-height workspace — without its own
                scrollbar, a tall (portrait) image pushed the history strip off
                the bottom with no way to reach it. */}
            <div className="flex-1 p-3 lg:p-4 flex flex-col gap-3 relative z-10 min-w-0 overflow-y-auto custom-scrollbar">
                {/* Shared with Material Studio and Animation Studio - see
                    canvasStyles. Once an image is loaded the frame shrink-wraps
                    it (RENDER_CANVAS_FITTED): the invisible in-flow img below
                    gives the box the image's exact aspect ratio, and every
                    viewer branch renders absolute inset-0 over it, so the
                    viewport IS the image - no letterbox bands. */}
                {(() => {
                    const sizingSrc = primaryImg ? getImageUrl(primaryImg) : (secondaryImg ? getImageUrl(secondaryImg) : null);
                    return (
                <div className={sizingSrc ? RENDER_CANVAS_FITTED : RENDER_CANVAS}>
                    {sizingSrc && (
                        <img
                            src={sizingSrc}
                            alt=""
                            aria-hidden
                            className={`block w-auto h-auto max-w-full ${RENDER_CANVAS_IMG_MAX_H} opacity-0 pointer-events-none select-none`}
                        />
                    )}
                    {renderViewer()}
                    {/* Trial watermark overlay - off for now at Charlie's
                        request (7 Aug 2026). The matching burn-in on download
                        is gated in useAppEngine.handleDownload; re-enable both
                        together. */}
                    {false && (userPlan === 'free' || userPlan === 'trial') && primaryImg && (
                        <div className="absolute inset-0 pointer-events-none flex flex-col items-end justify-end p-8 z-50">
                            <h1 className="text-4xl md:text-5xl font-bold text-white/80 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] tracking-tighter">MODULR STUDIO</h1>
                            <p className="text-lg text-white/60 font-medium italic drop-shadow-[0_2px_5px_rgba(0,0,0,0.8)]">Trial Render</p>
                        </div>
                    )}
                </div>
                    );
                })()}
                <div className="flex justify-between items-center text-xs text-secondary px-2 font-medium tracking-wide uppercase">
                    {/* Reset lives here, opposite the export controls, rather
                        than only in the header - after a render you did not want,
                        the fix should be next to the thing you are looking at.
                        Only offered when there is something to clear. */}
                    {onReset && (primaryImg || secondaryImg) ? (
                        <button
                            onClick={() => {
                                if (window.confirm('Clear this workspace and start again? Your uploaded image and render will be removed.')) {
                                    onReset();
                                }
                            }}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors normal-case tracking-normal font-semibold"
                        >
                            <RotateCcw size={14} />
                            Reset
                        </button>
                    ) : (
                        <div />
                    )}
                    {primaryImg && (
                        <div className="flex items-center gap-3 flex-wrap">
                            {/* The verification badge: invisible engineering made visible.
                                Green = the render passed the automatic count check against
                                the design; amber = checked, differences may remain. */}
                            {verification?.checked && (
                                verification.passed ? (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold" title={verification.retried ? 'An automatic correction was applied before this render was accepted.' : 'Doors, windows and roof verified against your design.'}>
                                        <ShieldCheck size={13} /> Checked against your design
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold" title="The automatic check found differences it could not fully correct - review the render before sending it to a client.">
                                        <ShieldAlert size={13} /> Auto-checked - review recommended
                                    </span>
                                )
                            )}
                            {onRerender && (
                                <div className="flex items-center bg-surface/50 rounded-lg p-1 border border-border">
                                    <button
                                        onClick={() => onRerender(false)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-secondary hover:text-primary transition-all"
                                        title="Re-render with a fresh composition"
                                    >
                                        <RefreshCw size={13} /> New look
                                    </button>
                                    <button
                                        onClick={() => onRerender(true)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-secondary hover:text-primary transition-all"
                                        title="Re-render keeping the same composition (same seed) - useful after changing materials"
                                    >
                                        <Lock size={13} /> Same look
                                    </button>
                                </div>
                            )}
                            <div className="flex items-center bg-surface/50 rounded-lg p-1 border border-border">
                                <button
                                    onClick={() => onFormatChange?.('png')}
                                    className={`px-3 py-1.5 rounded-md transition-all ${downloadFormat === 'png' ? 'bg-accent text-white shadow-sm' : 'text-secondary hover:text-primary'}`}
                                >
                                    PNG
                                </button>
                                <button
                                    onClick={() => onFormatChange?.('jpg')}
                                    className={`px-3 py-1.5 rounded-md transition-all ${downloadFormat === 'jpg' ? 'bg-accent text-white shadow-sm' : 'text-secondary hover:text-primary'}`}
                                >
                                    JPG
                                </button>
                            </div>
                            {onSaveToProject && (
                                <Button variant="secondary" size="sm" onClick={() => onSaveToProject(primaryImg)} icon={<FolderOpen size={14} />}>
                                    Save to Project
                                </Button>
                            )}
                            <Button variant="secondary" size="sm" onClick={() => onDownload(primaryImg, 'modulr-export.jpg')} icon={<Download size={14} />}>
                                Save Output
                            </Button>
                        </div>
                    )}
                </div>

                {/* Batch Filmstrip Gallery */}
                {batchImages && batchImages.length > 1 && (
                    <div className="w-full flex gap-3 overflow-x-auto pb-2 custom-scrollbar mt-2">
                        {batchImages.map((bImage, idx) => {
                            const isSelected = selectedBatchIndex === idx;
                            const hasRender = batchRenders && batchRenders[idx];
                            const hasImage = bImage && bImage.trim() !== '';
                            const thumbUrl = getImageUrl(hasRender ? batchRenders[idx] : bImage);
                            
                            return (
                                <div 
                                    key={idx} 
                                    onClick={() => onBatchSelect?.(idx)}
                                    className={`relative flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden cursor-pointer border-2 transition-all duration-300 ${isSelected ? 'border-accent shadow-sm ring-2 ring-accent/20' : 'border-border opacity-60 hover:opacity-100 hover:border-accent/50'}`}
                                >
                                    {hasImage || hasRender ? (
                                        <img src={thumbUrl} className="w-full h-full object-cover" alt={`Angle ${idx + 1}`} />
                                    ) : (
                                        <div className="w-full h-full bg-slate-50 flex items-center justify-center"></div>
                                    )}
                                    {hasRender && (
                                        <div className="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background flex items-center justify-center shadow-lg">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        </div>
                                    )}
                                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] font-bold text-center py-1 backdrop-blur-sm">
                                        Angle {idx + 1}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {extraFooter && (
                    <div className="w-full">
                        {extraFooter}
                    </div>
                )}
                {historyFooter && (
                    <div className="w-full">
                        {historyFooter}
                    </div>
                )}
            </div>
        </div>
    );
};
