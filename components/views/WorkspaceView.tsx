import React from 'react';
import { Download, Upload, Loader2 } from 'lucide-react';
import { Button } from '../Button';
import { CompareSlider } from '../CompareSlider';
import { SkeletonLoader } from '../SkeletonLoader';

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
    onInputClick: () => void;
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
    onInputClick,
    downloadFormat,
    onFormatChange,
    customViewer,
    customEmptyState,
    extraFooter,
    historyFooter,
    batchImages,
    batchRenders,
    selectedBatchIndex = 0,
    onBatchSelect
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
            return (
                <div className="w-full h-full min-h-[500px] max-h-[85vh] absolute inset-0 flex flex-col items-center justify-center bg-white z-50">
                    <Loader2 className="w-10 h-10 animate-spin text-black mb-4 mx-auto" />
                    <p className="text-black font-medium text-lg tracking-wide text-center mx-auto">{loadingMessage}</p>
                </div>
            );
        }

        if (customViewer) {
            return (
                <div className="w-full h-full absolute inset-0 flex items-center justify-center">
                    {customViewer}
                </div>
            );
        }

        if (primaryImg && secondaryImg) {
            return (
                <div className="w-full h-full absolute inset-0 flex items-center justify-center">
                    <CompareSlider beforeImage={secondaryImg} afterImage={primaryImg} />
                </div>
            );
        }
        if (primaryImg) {
            return (
                <div className="w-full h-full absolute inset-0 flex items-center justify-center">
                    <img src={getImageUrl(primaryImg)} className="w-full h-full object-contain" alt="Result" />
                </div>
            );
        }
        if (secondaryImg) {
            return (
                <div className="w-full h-full absolute inset-0 flex items-center justify-center">
                    <img src={getImageUrl(secondaryImg)} className="w-full h-full object-contain opacity-40 grayscale" alt="Source" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-background/80 backdrop-blur-md px-6 py-3 rounded-full text-primary font-medium shadow-[0_0_20px_rgba(139,92,246,0.3)] border border-accent/20 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-accent animate-pulse"></div>
                            {placeholder}
                        </span>
                    </div>
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
                className="w-full h-full absolute inset-0 flex flex-col items-center justify-center cursor-pointer group hover:bg-accent/5 transition-colors duration-300"
                onClick={onInputClick}
            >
                <div className="w-20 h-20 bg-background rounded-full flex items-center justify-center mb-6 shadow-2xl group-hover:scale-110 group-hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all duration-300 border border-border group-hover:border-accent/30 relative">
                    <div className="absolute inset-0 rounded-full bg-accent/20 blur-xl group-hover:opacity-100 opacity-0 transition-opacity"></div>
                    <Upload className="text-secondary group-hover:text-accent relative z-10 transition-colors" size={28} />
                </div>
                <p className="text-primary font-semibold text-lg mb-1 tracking-tight text-center">Drop your drawing here</p>
                <p className="text-secondary text-sm text-center">Or click to browse files</p>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col md:flex-row bg-background relative overflow-hidden">

            {/* Ambient Lighting for Workspace */}
            <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[100px] pointer-events-none"></div>

            <div className="w-full md:w-80 p-6 flex flex-col gap-6 relative z-10 overflow-y-auto">
                <div className="space-y-4">
                    <h2 className="text-[6vw] md:text-xl lg:text-2xl whitespace-nowrap font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#3B82F6] w-fit inline-block">{title}</h2>
                    <p className="text-secondary text-lg leading-relaxed">{subtitle}</p>
                </div>
                {controls}
            </div>

            <div className="flex-1 p-6 lg:p-10 flex flex-col gap-6 relative z-10 min-w-0">
                <div className="w-full max-w-5xl mx-auto flex-1 min-h-[500px] max-h-[85vh] glass-panel rounded-3xl overflow-hidden border-2 border-dashed border-border hover:border-accent/40 transition-colors duration-300 relative flex items-center justify-center bg-surface/50">
                    {renderViewer()}
                </div>
                <div className="flex justify-between items-center text-xs text-secondary px-2 font-medium tracking-wide uppercase">
                    <div></div> {/* Placeholder for flex parity */}
                    {primaryImg && (
                        <div className="flex items-center gap-3">
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
                            <Button variant="secondary" size="sm" onClick={() => onDownload(primaryImg, 'modulr-export.jpg')} icon={<Download size={14} />}>
                                Save Output
                            </Button>
                        </div>
                    )}
                </div>

                {/* Batch Filmstrip Gallery */}
                {batchImages && batchImages.length > 1 && (
                    <div className="w-full max-w-5xl mx-auto flex gap-3 overflow-x-auto pb-2 custom-scrollbar mt-2">
                        {batchImages.map((bImage, idx) => {
                            const isSelected = selectedBatchIndex === idx;
                            const hasRender = batchRenders && batchRenders[idx];
                            const thumbUrl = getImageUrl(hasRender ? batchRenders[idx] : bImage);
                            
                            return (
                                <div 
                                    key={idx} 
                                    onClick={() => onBatchSelect?.(idx)}
                                    className={`relative flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden cursor-pointer border-2 transition-all duration-300 ${isSelected ? 'border-accent shadow-[0_0_15px_rgba(139,92,246,0.3)]' : 'border-border opacity-60 hover:opacity-100 hover:border-accent/50'}`}
                                >
                                    <img src={thumbUrl} className="w-full h-full object-cover" alt={`Angle ${idx + 1}`} />
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
                    <div className="w-full max-w-5xl mx-auto">
                        {extraFooter}
                    </div>
                )}
                {historyFooter && (
                    <div className="w-full max-w-5xl mx-auto">
                        {historyFooter}
                    </div>
                )}
            </div>
        </div>
    );
};
