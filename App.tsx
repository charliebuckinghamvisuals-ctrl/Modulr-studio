import React from 'react';
import { ArrowRight, Wand2, RefreshCw, Zap, Sparkles, PenTool, Image as ImageIcon, Upload, Grid } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import { AppShell } from './components/AppShell';
import { StartupLoader } from './components/StartupLoader';
import { Button } from './components/Button';
import { LoadingOverlay } from './components/LoadingOverlay';
import { MaterialVisualPicker } from './components/MaterialVisualPicker';
import { LightingDirectionPicker } from './components/LightingDirectionPicker';
import { HistoryFooter } from './components/HistoryFooter';
import { CanvasMask } from './components/CanvasMask';
import { AppStage, HistoryItem } from './types';
import { PRESET_MATERIALS, WEATHER_CONDITIONS, ENTOURAGE_PEOPLE, ENTOURAGE_ANIMALS, SCENE_PRESETS } from './constants';
import { useAppEngine } from './hooks/useAppEngine';
// import { PDFGenerator } from './components/PDFGenerator';
import { HomeView } from './components/views/HomeView';
import { MaterialStudioView } from './components/views/MaterialStudioView';
import { WorkspaceView } from './components/views/WorkspaceView';
import { PricingView } from './components/views/PricingView';
import { AboutView } from './components/views/AboutView';

const App: React.FC = () => {
    const engine = useAppEngine();
    const [maskImage, setMaskImage] = React.useState<string | null>(null);
    const [isAppLoaded, setIsAppLoaded] = React.useState(false);
    const [selectedBatchIndex, setSelectedBatchIndex] = React.useState(0);
    const lineEnvInputRef = React.useRef<HTMLInputElement>(null);

    const handleLoadHistory = (item: HistoryItem) => {
        engine.setActiveStage(item.stage);

        if (item.originalImage) {
            engine.setOriginalImageForStage(item.stage, item.originalImage);
        }

        engine.setLineImage(null);
        engine.setRenderedImage(null);
        engine.setEditorImage(null);
        engine.setFinalImage(null);
        engine.setMaterialStudioImage(null);

        switch (item.stage) {
            case AppStage.RENDER_ENGINE:
                engine.setRenderedImage(item.image);
                engine.setMaterials(item.settings);
                engine.setAdditionalPrompt(item.prompt);
                break;
            case AppStage.LINE_CONVERT:
                engine.setLineImage(item.image);
                engine.setLineDrawingPrompt(item.prompt);
                break;
            case AppStage.EDITOR:
                engine.setEditorImage(item.image);
                engine.setEditorPrompt(item.prompt);
                // Restore weather settings if this was a weather edit
                if (item.settings?.condition) engine.setWeather(item.settings);
                if (item.image && !item.settings?.condition) engine.setFinalImage(item.image);
                break;
            case AppStage.MATERIAL_STUDIO:
                engine.setMaterialStudioImage(item.image);
                engine.setSelectedDetails(item.settings?.selectedDetails || []);
                break;
        }
    };

    const QualityToggle = () => (
        <button
            onClick={() => engine.setIsHighQuality(!engine.isHighQuality)}
            className={`flex items-center justify-center gap-2 px-2 py-3 rounded-xl text-xs font-bold transition-all duration-400 border w-full group relative overflow-hidden ${engine.isHighQuality
                ? 'bg-accent text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] border-accent/20'
                : 'glass-panel text-secondary hover:text-primary border-border hover:border-accent/40 bg-surface/30'
                }`}
        >
            {engine.isHighQuality && <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>}
            <Sparkles size={14} className={`relative z-10 ${engine.isHighQuality ? 'animate-pulse drop-shadow-md text-white' : 'text-accent'}`} />
            <span className="relative z-10 tracking-wide uppercase">{engine.isHighQuality ? '4K Ultra HD' : 'Standard HD'}</span>
        </button>
    );

    const ProModelToggle = () => (
        <button
            onClick={() => engine.setIsProMode(!engine.isProMode)}
            className={`flex items-center justify-center gap-2 px-2 py-3 rounded-xl text-xs font-bold transition-all duration-400 border w-full group relative overflow-hidden ${engine.isProMode
                ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)] border-blue-400/30'
                : 'glass-panel text-secondary hover:text-primary border-border hover:border-blue-400/40 bg-surface/30'
                }`}
        >
            {engine.isProMode && <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>}
            <Zap size={14} className={`relative z-10 ${engine.isProMode ? 'animate-pulse drop-shadow-md text-white' : 'text-blue-500'}`} />
            <span className="relative z-10 tracking-wide uppercase">{engine.isProMode ? 'Pro Mode' : 'Standard'}</span>
        </button>
    );

    const renderEngineControls = (
        <>
            <div className="grid grid-cols-2 gap-2 w-full">
                <QualityToggle />
                <ProModelToggle />
            </div>

            <button
                onClick={() => document.getElementById('batchUploadInput')?.click()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl glass-panel text-primary hover:text-accent border-border hover:border-accent/40 bg-surface/30 transition-all duration-300 font-semibold text-sm shadow-sm"
            >
                <Upload size={16} />
                {engine.batchImages.length > 0 ? 'Upload New Batch' : (engine.originalImage ? 'Change Reference Image' : 'Upload Batch / Reference Images')}
            </button>

            <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {Object.keys(engine.materials).map((key) => (
                    <div key={key} className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-secondary flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></div>
                            {key}
                        </label>
                        <textarea
                            className="w-full p-3 rounded-xl glass-panel text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-transparent text-sm placeholder-secondary min-h-[60px] resize-none shadow-inner transition-all border border-border"
                            placeholder={`Analyzed or custom ${key} material...`}
                            value={engine.materials[key as keyof typeof engine.materials]}
                            onChange={(e) => engine.setMaterials(prev => ({ ...prev, [key]: e.target.value }))}
                        />
                    </div>
                ))}
            </div>

            <LightingDirectionPicker value={engine.lightingDirection} onChange={engine.setLightingDirection} />

            {engine.batchMaterials.length > 0 && (
                <div className="space-y-3 p-3 bg-surface/50 rounded-xl border border-border">
                    <p className="text-xs font-bold text-white mb-2 tracking-wide">AI Geometry & Mapping detected</p>
                    {engine.batchMaterials.map((mat, i) => (
                        <div key={i} className="text-[11px] flex justify-between items-center bg-background/50 p-2 rounded-lg border border-border/50">
                            <span className="font-bold text-accent px-2 py-0.5 bg-accent/10 rounded">{mat.orientation || `Angle ${i+1}`}</span> 
                            <span className="text-secondary truncate ml-2 text-right">{mat.walls || 'Auto'} / {mat.roof || 'Auto'}</span>
                        </div>
                    ))}
                    <p className="text-[10px] text-secondary mt-1 leading-relaxed">These materials will be mapped dynamically per angle during batch rendering. Global overrides above will act as universal fallbacks.</p>
                </div>
            )}

            <div className="space-y-3 pt-6 border-t border-border">
                <label className="text-xs font-bold uppercase tracking-widest text-secondary flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                    Additional Instructions
                </label>
                <textarea
                    className="w-full p-4 rounded-xl glass-panel text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-transparent text-sm placeholder-secondary min-h-[100px] resize-none shadow-inner transition-all"
                    placeholder="e.g. Add a sunset background, dramatic lighting, rain..."
                    value={engine.additionalPrompt}
                    onChange={(e) => engine.setAdditionalPrompt(e.target.value)}
                />
            </div>
            <div className="mt-auto pt-6">
                {engine.batchImages.length > 0 ? (
                    <Button className="w-full" onClick={engine.handleBatchRender} icon={<Wand2 size={16} />} disabled={engine.processing.isLoading}>
                        Render Batch Sequence ({engine.batchImages.length})
                    </Button>
                ) : (
                    <Button className="w-full" onClick={engine.handleRender} icon={<Wand2 size={16} />} disabled={!engine.originalImage}>
                        Render Scene
                    </Button>
                )}
            </div>
        </>
    );

    const editorControls = (
        <div className="flex flex-col h-full space-y-4">
            <div className="grid grid-cols-2 gap-2 w-full">
                <QualityToggle />
                <ProModelToggle />
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <div className="space-y-3 mt-2">
                    <div className="space-y-1">
                        <label className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></div>
                            Editing Prompt
                        </label>
                        <p className="text-[10px] text-secondary/80 leading-relaxed pl-3.5">
                            Describe exactly what you want to change. The AI will perfectly preserve the rest of the image.
                        </p>
                    </div>

                    <textarea
                        className="w-full p-4 rounded-xl glass-panel text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-transparent text-sm placeholder-secondary min-h-[140px] resize-none shadow-inner transition-all border border-border"
                        placeholder="e.g. Add a timber pergola, change the cladding to brick, make it snow..."
                        value={engine.editorPrompt}
                        onChange={(e) => engine.setEditorPrompt(e.target.value)}
                    />

                    <Button className="w-full mt-4" onClick={() => engine.handleEditImage(maskImage)} icon={<Wand2 size={16} />} disabled={!engine.originalImage || !engine.editorPrompt.trim()}>
                        Apply Edit
                    </Button>
                </div>
            </div>
        </div>
    );

    const [lineMode, setLineMode] = React.useState<'image' | 'text'>('image');

    const lineControls = (
        <div className="flex flex-col h-full space-y-5">
            <div className="grid grid-cols-2 gap-2 w-full">
                <QualityToggle />
                <ProModelToggle />
            </div>

            {/* Mode Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-surface/60 border border-border">
                <button
                    onClick={() => setLineMode('image')}
                    className={`py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 ${lineMode === 'image'
                        ? 'bg-accent text-white shadow-md'
                        : 'text-secondary hover:text-primary'}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                    Image → Line
                </button>
                <button
                    onClick={() => setLineMode('text')}
                    className={`py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 ${lineMode === 'text'
                        ? 'bg-accent text-white shadow-md'
                        : 'text-secondary hover:text-primary'}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 6.1H3" /><path d="M21 12.1H3" /><path d="M15.1 18H3" /></svg>
                    Text → Line
                </button>
            </div>

            {/* Drawing Style — shared between both modes */}
            <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-widest text-secondary flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent"></div>
                    Drawing Style
                </label>
                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={() => engine.setIsColoredLineDrawing(false)}
                        className={`p-3 rounded-xl text-xs text-center font-semibold transition-all duration-300 flex flex-col items-center gap-2 ${!engine.isColoredLineDrawing
                            ? 'bg-slate-900 text-white shadow-lg border-slate-700'
                            : 'glass-panel text-secondary hover:text-primary border-border bg-surface/30'}`}
                    >
                        <PenTool size={18} className={!engine.isColoredLineDrawing ? "text-white" : "text-secondary hover:text-primary"} />
                        <span className={!engine.isColoredLineDrawing ? "text-white" : "text-secondary hover:text-primary"}>Monochrome</span>
                    </button>
                    <button
                        onClick={() => engine.setIsColoredLineDrawing(true)}
                        className={`p-3 rounded-xl text-xs text-center font-semibold transition-all duration-300 flex flex-col items-center gap-2 ${engine.isColoredLineDrawing
                            ? 'bg-accent text-white shadow-[0_0_15px_rgba(139,92,246,0.3)] border-accent/20'
                            : 'glass-panel text-secondary hover:text-primary border-border bg-surface/30'}`}
                    >
                        <div className="flex -space-x-1">
                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        </div>
                        <span className={engine.isColoredLineDrawing ? "text-white" : "text-secondary hover:text-primary"}>Coloured</span>
                    </button>
                </div>
            </div>

            {/* IMAGE MODE */}
            {lineMode === 'image' && (
                <div className="space-y-4 flex-1">
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-secondary flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-accent"></div>
                            Upload Image
                        </label>
                        <p className="text-[10px] text-secondary/70">Upload a photo, render, or sketch and the AI will trace it into a clean architectural line drawing.</p>
                        {engine.lineSourceImage ? (
                            <div className="relative rounded-xl overflow-hidden border border-border group">
                                <img src={`data:image/jpeg;base64,${engine.lineSourceImage}`} className="w-full h-32 object-cover" alt="Source" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                                    <button
                                        onClick={() => {
                                            engine.setLineSourceImage(null);
                                            engine.setOriginalImage(null);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <label className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed border-border hover:border-accent/60 hover:bg-accent/5 cursor-pointer transition-all group">
                                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-secondary group-hover:text-accent transition-colors"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                <div className="text-center">
                                    <p className="text-xs font-semibold text-secondary group-hover:text-primary transition-colors">Click to upload</p>
                                    <p className="text-[10px] text-secondary/60 mt-0.5">JPG, PNG, WEBP</p>
                                </div>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        const reader = new FileReader();
                                        reader.onload = (ev) => {
                                            const b64 = (ev.target?.result as string).split(',')[1];
                                            engine.setLineSourceImage(b64);
                                            engine.setOriginalImage(b64);
                                        };
                                        reader.readAsDataURL(file);
                                    }}
                                />
                            </label>
                        )}
                    </div>

                    {/* Environment Image Upload for Line Converter */}
                    {engine.lineSourceImage && (
                        <div className="pt-2 border-t border-border mt-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2 mb-2">
                                <ImageIcon size={14} className="text-secondary" />
                                Attach Environment <span className="text-[9px] font-normal normal-case tracking-normal text-secondary/50 ml-1">(Site Context)</span>
                            </label>
                            {engine.lineEnvironmentImage ? (
                                <div className="relative rounded-xl overflow-hidden border border-border group">
                                    <img src={engine.getRenderUrl(engine.lineEnvironmentImage) || ''} className="w-full h-24 object-cover opacity-80" alt="Environment" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <button
                                            onClick={() => engine.setLineEnvironmentImage(null)}
                                            className="bg-red-600/90 hover:bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-lg"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => lineEnvInputRef.current?.click()}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-border hover:border-accent/40 bg-surface/20 hover:bg-surface/50 text-secondary hover:text-primary transition-all duration-300 font-semibold text-xs shadow-sm"
                                >
                                    <Upload size={14} />
                                    Upload Location/Garden
                                </button>
                            )}
                            <input
                                type="file"
                                ref={lineEnvInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = (ev) => {
                                        const b64 = (ev.target?.result as string).split(',')[1];
                                        engine.setLineEnvironmentImage(b64);
                                    };
                                    reader.readAsDataURL(file);
                                    if (lineEnvInputRef.current) {
                                        lineEnvInputRef.current.value = ''; // Reset input
                                    }
                                }}
                            />
                        </div>
                    )}

                    {engine.lineSourceImage && (
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-secondary flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-white/40"></div>
                                Modifications <span className="text-[9px] font-normal normal-case tracking-normal text-secondary/50 ml-1">(optional)</span>
                            </label>
                            <textarea
                                className="w-full p-3 rounded-xl glass-panel text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm placeholder-secondary min-h-[70px] resize-none transition-all"
                                placeholder="e.g. Add thicker line weights, remove garden details..."
                                value={engine.additionalPrompt}
                                onChange={(e) => engine.setAdditionalPrompt(e.target.value)}
                            />
                        </div>
                    )}

                    <div className="pt-2">
                        <Button
                            className="w-full"
                            onClick={engine.handleGenerateLineDrawing}
                            icon={<PenTool size={16} />}
                            disabled={!engine.lineSourceImage}
                        >
                            Convert to Line Drawing
                        </Button>
                    </div>
                </div>
            )}

            {/* TEXT MODE */}
            {lineMode === 'text' && (
                <div className="space-y-4 flex-1">
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-secondary flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-accent"></div>
                            Describe Your Building
                        </label>
                        <p className="text-[10px] text-secondary/70 leading-relaxed">Describe the building or scene you want. The AI will generate a CAD line drawing from scratch.</p>
                        <textarea
                            className="w-full p-4 rounded-xl glass-panel text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm placeholder-secondary min-h-[120px] resize-none transition-all"
                            placeholder="e.g. A modern detached house in the UK with a flat roof, floor-to-ceiling windows, and a timber clad facade..."
                            value={engine.lineDrawingPrompt}
                            onChange={(e) => engine.setLineDrawingPrompt(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-secondary flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-white/40"></div>
                            Style Instructions <span className="text-[9px] font-normal normal-case tracking-normal text-secondary/50 ml-1">(optional)</span>
                        </label>
                        <textarea
                            className="w-full p-3 rounded-xl glass-panel text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm placeholder-secondary min-h-[60px] resize-none transition-all"
                            placeholder="e.g. Thick line weights, architectural hatching, minimal background..."
                            value={engine.additionalPrompt}
                            onChange={(e) => engine.setAdditionalPrompt(e.target.value)}
                        />
                    </div>

                    <div className="pt-2">
                        <Button
                            className="w-full"
                            onClick={engine.handleGenerateLineDrawing}
                            icon={<PenTool size={16} />}
                            disabled={!engine.lineDrawingPrompt.trim()}
                        >
                            Generate from Description
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );


    const renderEngineEmptyState = (
        <div className="flex flex-col md:flex-row gap-6 items-center justify-center w-full h-full p-8 relative">
            <div className="absolute inset-0 bg-accent/5 backdrop-blur-3xl pointer-events-none"></div>

            <div
                onClick={() => engine.fileInputRef.current?.click()}
                className="flex-1 max-w-sm w-full h-72 glass-panel border border-border hover:border-accent/50 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer group transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_10px_40px_rgba(139,92,246,0.2)] relative overflow-hidden text-center p-6"
            >
                <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-xl relative z-10">
                    <PenTool className="text-accent group-hover:text-white transition-colors" size={24} />
                </div>
                <div className="relative z-10">
                    <h3 className="text-primary font-bold text-lg mb-2">Upload B&W Line Drawing</h3>
                    <p className="text-secondary text-sm leading-relaxed">Auto-detect materials from structural lines and CAD patterns.</p>
                </div>
            </div>

            <div
                onClick={() => engine.fileInputRef.current?.click()}
                className="flex-1 max-w-sm w-full h-72 glass-panel border border-border hover:border-blue-500/50 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer group transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_10px_40px_rgba(59,130,246,0.2)] relative overflow-hidden text-center p-6"
            >
                <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-xl relative z-10">
                    <ImageIcon className="text-blue-400 group-hover:text-white transition-colors" size={24} />
                </div>
                <div className="relative z-10">
                    <h3 className="text-primary font-bold text-lg mb-2">Upload Previous Render</h3>
                    <p className="text-secondary text-sm leading-relaxed">Extract and enhance materials from an existing low-quality render.</p>
                </div>
            </div>
        </div>
    );

    const refinementBox = (
        <div className="mt-4 p-5 glass-panel rounded-2xl border border-accent/20 bg-accent/5 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-widest text-accent flex items-center gap-2">
                        <Sparkles size={14} className="animate-pulse" />
                        Quick Changes / Refinement
                    </label>
                    <span className="text-[10px] text-secondary font-medium italic">4K High Quality Refinement</span>
                </div>
                <div className="flex gap-3">
                    <textarea
                        value={engine.refinementPrompt}
                        onChange={(e) => engine.setRefinementPrompt(e.target.value)}
                        placeholder="e.g. 'Make the grass greener and add modern patio furniture'..."
                        className="flex-1 p-4 rounded-xl bg-surface/50 border border-border focus:border-accent/40 focus:ring-1 focus:ring-accent/20 outline-none text-sm text-primary placeholder:text-secondary/50 resize-none min-h-[60px] transition-all"
                    />
                    <Button
                        onClick={engine.handleRefineRender}
                        disabled={engine.processing.isLoading || !engine.refinementPrompt.trim()}
                        className="h-auto px-6 whitespace-nowrap bg-accent hover:bg-accent-hover text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-accent/20 active:scale-95 transition-all"
                        icon={<Wand2 size={16} />}
                    >
                        Refine
                    </Button>
                </div>
                <p className="text-[10px] text-secondary/70 leading-relaxed px-1">
                    This will use your current render as a seed to apply specific changes without losing quality.
                </p>
            </div>
        </div>
    );

    const materialStudioBox = (
        <div className="mt-4 p-5 glass-panel rounded-2xl border border-blue-500/20 bg-blue-500/5 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-5 duration-700">
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-widest text-blue-400 flex items-center gap-2">
                        <Grid size={14} className="text-blue-400" />
                        Material Studio (2x2 Sheet)
                    </label>
                    <span className="text-[10px] text-secondary font-medium italic">Callout Details</span>
                </div>

                {engine.detectedDetails.length === 0 ? (
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] text-secondary/80 leading-relaxed flex-1">
                            Extract specific architectural materials and textures into a high-resolution 2x2 presentation grid.
                        </p>
                        <Button
                            onClick={() => engine.handleAnalyzeForMaterialStudio(engine.renderedImage!)}
                            disabled={engine.processing.isLoading}
                            className="h-auto px-6 whitespace-nowrap bg-blue-600/80 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                            icon={<Sparkles size={16} />}
                        >
                            Detect Elements
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center text-xs uppercase tracking-widest font-bold text-secondary">
                            <span>Select 4 Focus Details</span>
                            <span className={`${engine.selectedDetails.length === 4 ? 'text-white' : 'text-secondary'}`}>
                                {engine.selectedDetails.length} / 4 Selected
                            </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {engine.detectedDetails.slice(0, 8).map((detail, idx) => {
                                const isSelected = engine.selectedDetails.includes(detail);
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => engine.toggleDetailSelection(detail)}
                                        className={`p-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-300 border text-center ${isSelected
                                            ? 'bg-blue-500/20 border-blue-400 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.3)]'
                                            : 'glass-panel border-white/5 text-secondary hover:text-white hover:border-white/30'
                                            }`}
                                    >
                                        {detail}
                                    </button>
                                );
                            })}
                        </div>
                        {engine.selectedDetails.length === 4 && (
                            <Button
                                className="w-full mt-2 bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-lg shadow-blue-500/30"
                                onClick={() => {
                                    engine.setActiveStage(AppStage.MATERIAL_STUDIO);
                                    engine.setOriginalImageForStage(AppStage.MATERIAL_STUDIO, engine.renderedImage); // Carry over render
                                    engine.handleMaterialStudio();
                                }}
                                disabled={engine.processing.isLoading}
                                icon={<Grid size={16} />}
                            >
                                Generate Material Grid
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    const renderAppContent = () => (
        <AppShell
            activeStage={engine.activeStage}
            onNavigate={engine.setActiveStage}
            onReset={engine.originalImage ? engine.handleReset : undefined}
            headerActions={
                /* PDF Generator removed for now */
                null
            }
        >
            <Toaster
                position="top-center"
                toastOptions={{
                    style: {
                        background: '#1A1D24',
                        color: '#fff',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }
                }}
            />

            {engine.activeStage === AppStage.PRICING && (
                <PricingView />
            )}

            {engine.activeStage === AppStage.ABOUT && (
                <AboutView />
            )}

            {engine.activeStage === AppStage.HOME && (
                <HomeView
                    onOpenEngine={() => engine.fileInputRef.current?.click()}
                    onOpenMaterialStudio={() => engine.materialInputRef.current?.click()}
                />
            )}

            {engine.activeStage === AppStage.MATERIAL_STUDIO && (
                <MaterialStudioView
                    detectedDetails={engine.detectedDetails}
                    selectedDetails={engine.selectedDetails}
                    toggleDetailSelection={engine.toggleDetailSelection}
                    handleMaterialStudio={engine.handleMaterialStudio}
                    originalImage={engine.getRenderUrl(engine.originalImage)}
                    materialStudioImage={engine.getRenderUrl(engine.materialStudioImage)}
                    handleDownload={engine.handleDownload}
                    downloadFormat={engine.downloadFormat}
                    onFormatChange={engine.setDownloadFormat}
                    onOpenSceneUpload={() => engine.materialInputRef.current?.click()}
                    isLoading={engine.activeStage === AppStage.MATERIAL_STUDIO && engine.processing.isLoading}
                    loadingMessage={engine.processing.message}
                    historyFooter={<HistoryFooter currentStage={AppStage.MATERIAL_STUDIO} onLoadHistoryItem={handleLoadHistory} />}
                />
            )}

            {engine.activeStage === AppStage.RENDER_ENGINE && (
                <WorkspaceView
                    title="Render Engine"
                    subtitle="Configure exterior materials and lighting."
                    controls={renderEngineControls}
                    primaryImg={engine.batchRenders.length > 0 ? engine.getRenderUrl(engine.batchRenders[selectedBatchIndex]) : engine.getRenderUrl(engine.renderedImage)}
                    secondaryImg={engine.batchImages.length > 0 ? engine.getRenderUrl(engine.batchImages[selectedBatchIndex]) : engine.getRenderUrl(engine.originalImage)}
                    batchImages={engine.batchImages}
                    batchRenders={engine.batchRenders}
                    selectedBatchIndex={selectedBatchIndex}
                    onBatchSelect={setSelectedBatchIndex}
                    placeholder="Ready to Render"
                    onDownload={engine.handleDownload}
                    onFormatChange={engine.setDownloadFormat}
                    downloadFormat={engine.downloadFormat}
                    onInputClick={() => document.getElementById('batchUploadInput')?.click()}
                    isLoading={engine.activeStage === AppStage.RENDER_ENGINE && engine.processing.isLoading}
                    loadingMessage={engine.processing.message}
                    customEmptyState={engine.activeStage === AppStage.RENDER_ENGINE && !engine.originalImage && engine.batchImages.length === 0 ? renderEngineEmptyState : undefined}
                    extraFooter={engine.renderedImage || engine.batchRenders.length > 0 ? (
                        <>
                            {refinementBox}
                            {materialStudioBox}
                        </>
                    ) : undefined}
                    historyFooter={<HistoryFooter currentStage={AppStage.RENDER_ENGINE} onLoadHistoryItem={handleLoadHistory} />}
                />
            )}

            {engine.activeStage === AppStage.EDITOR && (
                <WorkspaceView
                    title="Editor"
                    subtitle="Refine entourage and details."
                    controls={editorControls}
                    primaryImg={engine.getRenderUrl(engine.editorImage)}
                    secondaryImg={engine.getRenderUrl(engine.originalImage)}
                    customViewer={
                        (engine.editorImage || engine.originalImage) ? (
                            <CanvasMask
                                baseImage={engine.getRenderUrl(engine.editorImage || engine.originalImage)!}
                                onMaskComplete={setMaskImage}
                            />
                        ) : undefined
                    }
                    placeholder="Enter prompt to edit"
                    onDownload={engine.handleDownload}
                    onFormatChange={engine.setDownloadFormat}
                    downloadFormat={engine.downloadFormat}
                    onInputClick={() => engine.fileInputRef.current?.click()}
                    isLoading={engine.activeStage === AppStage.EDITOR && engine.processing.isLoading}
                    loadingMessage={engine.processing.message}
                    historyFooter={<HistoryFooter currentStage={AppStage.EDITOR} onLoadHistoryItem={handleLoadHistory} />}
                />
            )}

            {engine.activeStage === AppStage.LINE_CONVERT && (
                <WorkspaceView
                    title="Line Converter"
                    subtitle="Generate architectural drawings."
                    controls={lineControls}
                    primaryImg={engine.getRenderUrl(engine.lineImage)}
                    secondaryImg={engine.getRenderUrl(engine.lineSourceImage || engine.originalImage)}
                    placeholder="Ready for CAD"
                    onDownload={engine.handleDownload}
                    onFormatChange={engine.setDownloadFormat}
                    downloadFormat={engine.downloadFormat}
                    onInputClick={() => engine.fileInputRef.current?.click()}
                    isLoading={engine.activeStage === AppStage.LINE_CONVERT && engine.processing.isLoading}
                    loadingMessage={engine.processing.message}
                    historyFooter={<HistoryFooter currentStage={AppStage.LINE_CONVERT} onLoadHistoryItem={handleLoadHistory} />}
                />
            )}

            <input
                type="file"
                ref={engine.fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={(e) => engine.handleImageUpload(e, engine.activeStage === AppStage.HOME ? AppStage.RENDER_ENGINE : engine.activeStage)}
            />
            <input
                type="file"
                ref={engine.materialInputRef}
                className="hidden"
                accept="image/*"
                onChange={(e) => engine.handleImageUpload(e, AppStage.MATERIAL_STUDIO)}
            />
            <input
                type="file"
                id="batchUploadInput"
                className="hidden"
                multiple
                accept="image/*"
                onChange={engine.handleBatchImageUpload}
            />

        </AppShell>
    );

    if (!isAppLoaded) {
        return <StartupLoader onFinish={() => setIsAppLoaded(true)} />;
    }

    return (
        <div className="animate-app-startup opacity-0">
            {renderAppContent()}
        </div>
    );
};

export default App;