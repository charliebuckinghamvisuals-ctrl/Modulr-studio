import React, { useState } from 'react';
import { WorkspaceView } from './WorkspaceView';
import { ToggleSwitch } from '../ToggleSwitch';
import { BatchSlotUploader } from '../BatchSlotUploader';
import { Sparkles, Layers, Search, ChevronDown, CheckCircle2, History, Zap, Grid } from 'lucide-react';
import { AppStage } from '../../types';
import { Button } from '../Button';
import toast from 'react-hot-toast';

interface StudioViewProps {
    engine: any; // We just pass the entire useAppEngine object for simplicity
    selectedBatchIndex: number;
    setSelectedBatchIndex: (idx: number) => void;
}

export const StudioView: React.FC<StudioViewProps> = ({ engine, selectedBatchIndex, setSelectedBatchIndex }) => {
    const backgrounds = ['Pure White Studio', 'Soft Gradient Studio', 'Dark/Anthracite Studio'];
    const [openCategoryDropdown, setOpenCategoryDropdown] = useState<string | null>(null);

    const studioControls = (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex flex-col gap-2 w-full">
                <ToggleSwitch 
                    isOn={engine.isHighQuality} 
                    onToggle={() => engine.setIsHighQuality(!engine.isHighQuality)} 
                    label={engine.isHighQuality ? '4K Ultra HD' : 'Standard HD'}
                    icon={<Sparkles size={14} className={engine.isHighQuality ? 'text-accent' : 'text-slate-400'} />}
                    activeColor="bg-accent"
                />
                <ToggleSwitch 
                    isOn={engine.isProMode} 
                    onToggle={() => engine.setIsProMode(!engine.isProMode)} 
                    label={engine.isProMode ? 'Pro Mode' : 'Standard'}
                    icon={<Zap size={14} className={engine.isProMode ? 'text-accent' : 'text-slate-400'} />}
                    activeColor="bg-accent"
                />
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 block">Studio Background</label>
                <select 
                    value={engine.studioBackground} 
                    onChange={(e) => engine.setStudioBackground(e.target.value)}
                    className="w-full bg-white border border-slate-300 text-sm font-bold text-accent rounded-xl px-3 py-2 outline-none shadow-sm focus:ring-2 focus:ring-accent/50"
                >
                    {backgrounds.map(b => (
                        <option key={b} value={b}>{b}</option>
                    ))}
                </select>
            </div>

            <BatchSlotUploader 
                batchImages={engine.batchImages}
                batchRenders={engine.batchRenders}
                onUpload={(file, index) => engine.handleSlotImageUpload(file, index, AppStage.STUDIO)}
            />

            <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar mt-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/60 flex items-center gap-2">
                        <Layers size={14} className="text-secondary" />
                        Material Overrides
                    </label>
                </div>

                {engine.batchImages.some((img: string) => img && img.trim() !== '') && !engine.materials.walls && (
                    <Button 
                        variant="secondary" 
                        size="sm" 
                        className="w-full" 
                        icon={<Search size={14} />} 
                        onClick={() => engine.handleAnalyzeMaterials(engine.batchImages.find((img: string) => img && img.trim() !== ''))}
                    >
                        Auto-Detect Materials
                    </Button>
                )}

                {Object.keys(engine.materials).filter(k => k !== 'orientation').map((key) => (
                    <div key={key} className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/60 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></div>
                                {key === 'walls' ? 'Walls / Cladding' : key}
                            </label>
                        </div>
                        
                        <input
                            type="text"
                            value={engine.materials[key as keyof typeof engine.materials]}
                            onChange={(e) => engine.setMaterials((prev: any) => ({ ...prev, [key]: e.target.value }))}
                            className="w-full bg-slate-50 border border-slate-200 text-accent rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-accent/50 text-xs transition-all shadow-inner"
                            placeholder={`Describe ${key}...`}
                        />
                    </div>
                ))}
            </div>

            <div className="mt-auto pt-6">
                {engine.batchImages.some((img: string) => img && img.trim() !== '') ? (
                    <Button borderless className="w-full" onClick={engine.handleBatchRender} icon={<Sparkles size={16} />} disabled={engine.processing.isLoading}>
                        Render Studio Passes
                    </Button>
                ) : (
                    <Button borderless className="w-full disabled" disabled={true} icon={<Sparkles size={16} />}>
                        Upload Images First
                    </Button>
                )}
            </div>
        </div>
    );

    return (
        <WorkspaceView
            title="Studio"
            subtitle="Generate pure architectural elevations on isolated backdrops."
            controls={studioControls}
            primaryImg={engine.batchRenders.length > 0 ? engine.getRenderUrl(engine.batchRenders[selectedBatchIndex]) : null}
            secondaryImg={engine.batchImages.length > 0 ? engine.getRenderUrl(engine.batchImages[selectedBatchIndex]) : null}
            batchImages={engine.batchImages}
            batchRenders={engine.batchRenders}
            selectedBatchIndex={selectedBatchIndex}
            onBatchSelect={setSelectedBatchIndex}
            placeholder="Ready for Studio Render"
            onDownload={engine.handleDownload}
            onFormatChange={engine.setDownloadFormat}
            downloadFormat={engine.downloadFormat}
            onInputClick={() => {}} // Inputs handled by slots
            isLoading={engine.activeStage === AppStage.STUDIO && engine.processing.isLoading}
            loadingMessage={engine.processing.message}
            userPlan={engine.userPlan}
            customEmptyState={!engine.batchImages.some((img:string) => img && img.trim() !== '') ? (
                <div className="flex flex-col items-center justify-center p-8 text-center bg-white/60 rounded-3xl border border-slate-200 shadow-sm">
                    <Grid size={48} className="text-accent/20 mb-4" />
                    <h3 className="text-xl font-bold text-accent mb-2">Isolated Studio Environment</h3>
                    <p className="text-secondary text-sm max-w-sm">Upload your angles to generate sterile, environment-free catalogue renders perfect for presentation.</p>
                </div>
            ) : undefined}
        />
    );
};
