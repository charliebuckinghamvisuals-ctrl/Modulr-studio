import React from 'react';
import { Download, Loader2, Upload, Palette, FolderOpen, Layers } from 'lucide-react';
import { Button } from '../Button';
import { RENDER_CANVAS, TOOL_PAGE, TOOL_SIDEBAR, TOOL_CANVAS_COL } from '../canvasStyles';
import { MaterialVisualPicker } from '../MaterialVisualPicker';
import { PRESET_MATERIALS } from '../../constants';
import { MaterialConfig, MaterialLibrary } from '../../types';

/**
 * Material Editor - the masked material edit, a tool of its own since
 * 21 Sep 2026. It lived inside Material Studio as a "Change Materials" mode
 * next to the close-up sheet and the camera shots, which photograph the
 * building rather than change it; the split makes each page do one thing.
 *
 * No mode picker: an upload is analysed straight away (what each surface is
 * and where it is), then any surface can be swapped or a change typed, and
 * Apply repaints only the pixels inside that surface's mask.
 */
interface MaterialEditorViewProps {
    onSaveToProject?: (image: string) => void;
    originalImage: string | null;
    materialEditorImage: string | null;
    handleDownload: (image: string | null, prefix: string) => void;
    onOpenSceneUpload: () => void;
    downloadFormat?: 'png' | 'jpg';
    onFormatChange?: (format: 'png' | 'jpg') => void;
    isLoading: boolean;
    loadingMessage: string;
    historyFooter?: React.ReactNode;

    materials: MaterialConfig;
    setMaterials: React.Dispatch<React.SetStateAction<MaterialConfig>>;
    materialLibrary?: MaterialLibrary;
    onApplyMaterials: () => void;
    isAnalyzingMaterials?: boolean;
    /** Masked edit: the free instruction, and a tint of the pixels the next
     *  Apply is allowed to change (null when nothing is changed yet). */
    materialPrompt?: string;
    setMaterialPrompt?: (v: string) => void;
    materialMaskPreview?: string | null;
}

const MATERIAL_CATEGORIES: Array<{ key: keyof MaterialLibrary; label: string }> = [
    { key: 'walls', label: 'Cladding / Walls' },
    { key: 'roof', label: 'Roof' },
    { key: 'windows', label: 'Windows' },
    { key: 'doors', label: 'Doors' },
    { key: 'decking', label: 'Decking / Ground' },
];

export const MaterialEditorView: React.FC<MaterialEditorViewProps> = ({
    originalImage,
    materialEditorImage,
    handleDownload,
    onSaveToProject,
    onOpenSceneUpload,
    downloadFormat,
    onFormatChange,
    isLoading,
    loadingMessage,
    historyFooter,
    materials,
    setMaterials,
    materialLibrary,
    onApplyMaterials,
    isAnalyzingMaterials,
    materialPrompt = '',
    setMaterialPrompt,
    materialMaskPreview,
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
        <div className={TOOL_PAGE}>
            <div className={TOOL_SIDEBAR}>
                <div className="space-y-4">
                    <h2 className="text-[7vw] md:text-2xl lg:text-3xl font-bold text-accent w-fit inline-block leading-tight">Material Editor</h2>
                    <p className="text-slate-600 text-sm leading-relaxed">
                        Change the cladding, roof, glazing, doors or ground - as a true masked edit. Only the pixels of the surface you change are repainted; every other pixel of your image is left exactly as it is.
                    </p>
                </div>

                {!originalImage ? (
                    <div className="p-8 border border-slate-100 rounded-3xl bg-slate-50/50 flex flex-col items-center gap-4 text-center shadow-inner">
                        <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-1">
                            <Layers className="w-6 h-6 text-accent opacity-80" />
                        </div>
                        <h3 className="text-accent font-medium tracking-tight">Awaiting Scene</h3>
                        <p className="text-slate-400 text-xs leading-relaxed">
                            Upload a render and the engine finds its cladding, roof, glazing, doors and ground so you can swap any of them.
                        </p>
                    </div>
                ) : isAnalyzingMaterials ? (
                    <div className="flex flex-col items-center gap-4 py-10">
                        <Loader2 className="w-8 h-8 animate-spin text-accent" />
                        <span className="text-accent font-medium animate-pulse text-sm">Analysing materials…</span>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col gap-5">
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
                        {/* A typed instruction for anything the five pickers do not
                            cover. It gets its own mask - whatever it names is
                            found in the image and only that is repainted. */}
                        <div className="flex flex-col gap-2 pt-2">
                            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400">Or tell it what to change</div>
                            <textarea
                                value={materialPrompt}
                                onChange={e => setMaterialPrompt?.(e.target.value)}
                                rows={3}
                                placeholder="e.g. make the fascia board anthracite grey · change the door frames to bronze"
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
                            />
                            <p className="text-[10px] text-slate-400 leading-snug">
                                Name the surface plainly. It is found in the image and repainted inside its own outline; nothing else is touched.
                            </p>
                        </div>
                        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-[11px] text-emerald-900 leading-snug">
                            <span className="font-bold">Pixel-level masked edit.</span> {materialMaskPreview ? 'The green tint on the image is every pixel this change may touch. Everything else stays byte-for-byte identical.' : 'Change a material above and the image will show, in green, exactly which pixels will be repainted.'}
                        </div>
                    </div>
                )}

                <div className="mt-auto pt-6 border-t border-white/10">
                    {originalImage && !isAnalyzingMaterials && (
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
                </div>
            </div>

            <div className={`${TOOL_CANVAS_COL} relative z-10 justify-center`}>
                {isLoading ? (
                    <div className={`${RENDER_CANVAS} flex-col bg-white z-50`}>
                        <Loader2 className="w-10 h-10 animate-spin text-accent mb-4 mx-auto" />
                        <p className="text-accent font-medium text-lg tracking-wide text-center mx-auto">{loadingMessage}</p>
                    </div>
                ) : materialEditorImage ? (
                    <div className="flex-1 flex items-center justify-center p-8 relative z-10 transition-all duration-700 opacity-100 scale-100">
                        <div className="relative group rounded-3xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.8)] border border-white/10 max-w-5xl max-h-full">
                            <img
                                src={getImageUrl(materialEditorImage)}
                                className="max-h-[68vh] w-auto max-w-full object-contain bg-black block"
                                alt="Material Editor result"
                            />
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
                                {onSaveToProject && (
                                    <button
                                        onClick={() => onSaveToProject(materialEditorImage)}
                                        className="p-3 bg-white text-black rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center border border-white/20 shadow-2xl scale-100 active:scale-95"
                                        title="Save to Project"
                                    >
                                        <FolderOpen size={20} />
                                    </button>
                                )}
                                <button
                                    onClick={() => handleDownload(materialEditorImage, 'MaterialEditor')}
                                    className="p-3 bg-white text-black rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center border border-white/20 shadow-2xl scale-100 active:scale-95"
                                    title="Download"
                                >
                                    <Download size={20} />
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 flex flex-col items-stretch justify-center text-secondary w-full">
                        {originalImage ? (
                            /* The source, sharp, with the mask tint over it when a
                               change is pending - the honest picture of what the
                               next Apply will and will not touch. */
                            <div className={`${RENDER_CANVAS} group`}>
                                <img src={getImageUrl(materialMaskPreview || originalImage)} className="w-full h-full object-contain absolute inset-0 transition-opacity duration-300" alt="Source" />
                                {materialMaskPreview && (
                                    <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-none bg-emerald-600/90 text-white text-[10px] font-bold uppercase tracking-widest shadow-lg">Green = the only pixels that will change</div>
                                )}
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
            </div>
        </div>
    );
};
