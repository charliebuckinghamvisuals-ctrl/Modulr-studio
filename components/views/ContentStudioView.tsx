import React from 'react';
import {
    Sparkles, Download, Loader2, Wand2, Copy, Check, Upload, Type, Square as SquareIcon,
    Image as ImageIcon, Instagram, Linkedin, Trash2, Undo2, Redo2, Copy as Duplicate,
    LayoutTemplate, Palette, Layers as LayersIcon, Eye, Lock, Unlock, ArrowUp, ArrowDown,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AppStage } from '../../types';
import { PostCanvas } from '../content/PostCanvas';
import {
    FORMATS, FONTS, TEMPLATES, DEFAULT_BRAND, DEFAULT_BACKGROUND, applyTemplate,
    newText, newShape, newLogo, uid,
    type PostDesign, type Layer, type TextLayer, type ShapeLayer, type LogoLayer,
    type BrandKit, type ContentFormat, type FontKey,
} from '../../services/postDesign';
import { exportNode, downloadDataUrl, assetFilename } from '../../services/postExport';
import { preloadLogos } from '../../services/logoProcessing';
import { reframeImage, writeCaption, suggestText, type CaptionResult, type TextSuggestion } from '../../services/contentService';

/**
 * Content Studio - a design surface, not a form with a preview.
 *
 * Three columns, which is the layout every design tool converges on because it
 * matches the order of the work: what you are making (templates, layers), the
 * thing itself (canvas), and the properties of whatever is selected.
 *
 * The canvas is real DOM and the export runs the same component off-screen at
 * full resolution, so preview and output cannot disagree.
 */

const BRAND_KEY = 'modulr.brandKit.v2';

const loadBrand = (): BrandKit => {
    try {
        const raw = localStorage.getItem(BRAND_KEY);
        return raw ? { ...DEFAULT_BRAND, ...JSON.parse(raw) } : DEFAULT_BRAND;
    } catch { return DEFAULT_BRAND; }
};

const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error('Could not read that file'));
        r.readAsDataURL(file);
    });

const toSrc = (img: string | null): string | null => {
    if (!img) return null;
    if (img.startsWith('data:') || img.startsWith('blob:') || img.startsWith('http')) return img;
    return `data:image/jpeg;base64,${img}`;
};

interface Props { engine: any; onNavigate?: (stage: AppStage) => void; }

export const ContentStudioView: React.FC<Props> = ({ engine, onNavigate }) => {
    const initialRender = toSrc(engine?.finalImage || engine?.renderedImage || engine?.materialStudioImage || null);

    const [brand, setBrand] = React.useState<BrandKit>(loadBrand);
    const [design, setDesign] = React.useState<PostDesign>(() => ({
        format: 'square',
        background: { ...DEFAULT_BACKGROUND, src: initialRender },
        layers: [],
    }));
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [panel, setPanel] = React.useState<'templates' | 'layers' | 'brand'>('templates');
    const [busy, setBusy] = React.useState<string | null>(null);
    const [caption, setCaption] = React.useState<CaptionResult | null>(null);
    const [platform, setPlatform] = React.useState<'instagram' | 'linkedin'>('instagram');
    const [copied, setCopied] = React.useState(false);
    const [showSafe, setShowSafe] = React.useState(false);
    const [reframed, setReframed] = React.useState<Partial<Record<ContentFormat, string>>>({});
    const [suggestions, setSuggestions] = React.useState<TextSuggestion[]>([]);

    /** Undo history. Capped, because a design is small but not free. */
    const past = React.useRef<PostDesign[]>([]);
    const future = React.useRef<PostDesign[]>([]);
    const commit = (next: PostDesign) => {
        past.current = [...past.current.slice(-40), design];
        future.current = [];
        setDesign(next);
    };
    const undo = () => {
        const prev = past.current.pop();
        if (!prev) return;
        future.current = [design, ...future.current.slice(0, 40)];
        setDesign(prev);
    };
    const redo = () => {
        const [next, ...rest] = future.current;
        if (!next) return;
        future.current = rest;
        past.current = [...past.current, design];
        setDesign(next);
    };

    const renderInput = React.useRef<HTMLInputElement>(null);
    const logoInput = React.useRef<HTMLInputElement>(null);
    const exportHost = React.useRef<HTMLDivElement>(null);

    const selected = design.layers.find(l => l.id === selectedId) || null;

    const saveBrand = (next: BrandKit) => {
        setBrand(next);
        try { localStorage.setItem(BRAND_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    };

    const setLayers = (layers: Layer[]) => setDesign(d => ({ ...d, layers }));
    const patchLayer = (id: string, p: Partial<Layer>) =>
        setDesign(d => ({ ...d, layers: d.layers.map(l => (l.id === id ? { ...l, ...p } as Layer : l)) }));

    /* Keyboard: delete, undo/redo, nudge. The things whose absence makes a tool
       feel like a form. */
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (t && /input|textarea|select/i.test(t.tagName)) return;
            // Typing on the canvas must never reach the delete-layer shortcut.
            // Without this, Backspace mid-word removed the entire text layer.
            if (t?.isContentEditable || (document.activeElement as HTMLElement)?.isContentEditable) return;

            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                e.shiftKey ? redo() : undo();
                return;
            }
            if (!selectedId) return;
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                commit({ ...design, layers: design.layers.filter(l => l.id !== selectedId) });
                setSelectedId(null);
                return;
            }
            const step = e.shiftKey ? 0.02 : 0.004;
            const map: Record<string, [number, number]> = {
                ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
            };
            const d = map[e.key];
            if (d) {
                e.preventDefault();
                const l = design.layers.find(x => x.id === selectedId);
                if (l) patchLayer(l.id, { x: l.x + d[0], y: l.y + d[1] } as Partial<Layer>);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedId, design]);

    const pickRender = async (file?: File) => {
        if (!file) return;
        const src = await fileToDataUrl(file);
        commit({ ...design, background: { ...design.background, src } });
    };

    const pickLogo = async (file?: File) => {
        if (!file) return;
        const logo = await fileToDataUrl(file);
        saveBrand({ ...brand, logo });
        // Drop it straight on - an uploaded logo that does not appear reads as
        // a broken upload.
        if (!design.layers.some(l => l.type === 'logo')) {
            commit({ ...design, layers: [...design.layers, newLogo(logo)] });
        } else {
            setLayers(design.layers.map(l => (l.type === 'logo' ? { ...l, src: logo } as LogoLayer : l)));
        }
    };

    const addLayer = (l: Layer) => { commit({ ...design, layers: [...design.layers, l] }); setSelectedId(l.id); };

    const move = (id: string, dir: -1 | 1) => {
        const i = design.layers.findIndex(l => l.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= design.layers.length) return;
        const next = [...design.layers];
        [next[i], next[j]] = [next[j], next[i]];
        commit({ ...design, layers: next });
    };

    const exportOne = async (format: ContentFormat) => {
        setBusy('Exporting…');
        try {
            // Render off-screen at true size, then capture. Waiting a frame lets
            // fonts and images settle before html2canvas reads the DOM.
            setDesign(d => ({ ...d, format }));
            // Warm the logo cache BEFORE capturing. html2canvas photographs the
            // DOM as it stands, so an unprocessed logo would be exported with
            // its white background still on it even though the editor had
            // already replaced it.
            await preloadLogos(
                (design.layers.filter(l => l.type === 'logo' && (l as LogoLayer).src) as LogoLayer[])
                    .map(l => ({ src: l.src!, strip: l.stripWhite }))
            );
            await new Promise(r => setTimeout(r, 400));
            const node = exportHost.current?.firstElementChild as HTMLElement;
            if (!node) throw new Error('Nothing to export');
            const url = await exportNode(node, format);
            downloadDataUrl(url, assetFilename(brand.businessName, format));
            toast.success(`${FORMATS[format].label} downloaded`);
        } catch (e: any) {
            toast.error(e?.message || 'Export failed');
        } finally { setBusy(null); }
    };

    const runReframe = async () => {
        const src = design.background.src;
        if (!src) return;
        setBusy(`Extending the scene to ${FORMATS[design.format].label}…`);
        try {
            const result = await reframeImage(src, design.format);
            const url = `data:image/jpeg;base64,${result}`;
            setReframed(p => ({ ...p, [design.format]: url }));
            commit({ ...design, background: { ...design.background, src: url, fit: 'cover' } });
            toast.success('Reframed');
        } catch (e: any) {
            toast.error(e?.message || 'Reframe failed');
        } finally { setBusy(null); }
    };

    /**
     * Read the attached render and offer copy for it.
     *
     * Applying an option writes into the existing headline and subline layers
     * where they exist, rather than piling new ones on - trying four suggestions
     * should leave one design, not four stacked text boxes.
     */
    const runSuggest = async () => {
        const src = design.background.src;
        if (!src) { toast.error('Attach a render first'); return; }
        setBusy('Reading your render…');
        try {
            const { options } = await suggestText(src, brand.businessName, { materials: engine?.materials });
            if (!options.length) { toast.error('No suggestions came back — try again'); return; }
            setSuggestions(options);
            setPanel('templates');
        } catch (e: any) {
            toast.error(e?.message || 'Could not read that image');
        } finally { setBusy(null); }
    };

    const applySuggestion = (s: TextSuggestion) => {
        const texts = design.layers.filter(l => l.type === 'text') as TextLayer[];
        if (!texts.length) {
            commit({
                ...design,
                layers: [
                    ...design.layers,
                    newText({ text: s.headline, font: brand.font, y: 0.74, size: 0.062 }),
                    newText({ text: s.subline, font: brand.font, y: 0.845, size: 0.026, weight: 600, color: 'rgba(255,255,255,0.85)' }),
                ],
            });
            return;
        }
        // Largest text is the headline; the next one down takes the subline.
        const sorted = [...texts].sort((a, b) => b.size - a.size);
        const head = sorted[0], sub = sorted[1];
        commit({
            ...design,
            layers: design.layers.map(l => {
                if (l.id === head.id) return { ...l, text: s.headline } as Layer;
                if (sub && l.id === sub.id) return { ...l, text: s.subline } as Layer;
                return l;
            }),
        });
    };

    const runCaption = async () => {
        setBusy('Writing…');
        try {
            const headline = design.layers.find(l => l.type === 'text') as TextLayer | undefined;
            const result = await writeCaption({
                platform,
                tone: platform === 'linkedin' ? 'professional' : 'friendly',
                businessName: brand.businessName,
                details: { materials: engine?.materials, headline: headline?.text },
            });
            setCaption(result);
        } catch (e: any) {
            toast.error(e?.message || 'Could not write a caption');
        } finally { setBusy(null); }
    };

    /* ── styling shorthands ───────────────────────────────────────────── */
    const side = 'bg-white border-slate-200';
    const lbl = 'text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block';
    const inp = 'w-full bg-slate-50 border border-slate-200 focus:border-accent focus:ring-2 focus:ring-accent/15 rounded-lg px-2.5 py-2 text-xs text-slate-700 outline-none transition-all';
    const chip = (on: boolean) =>
        `px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${on ? 'bg-accent text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`;
    const iconBtn = 'p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-accent transition-colors disabled:opacity-30';

    const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
        <div className="mb-3"><span className={lbl}>{label}</span>{children}</div>
    );

    const Num: React.FC<{ value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string }> =
        ({ value, min, max, step, onChange, suffix }) => (
            <div className="flex items-center gap-2">
                <input type="range" min={min} max={max} step={step} value={value}
                    onChange={e => onChange(parseFloat(e.target.value))}
                    className="flex-1 accent-accent cursor-pointer" />
                <span className="text-[10px] font-mono text-slate-400 w-9 text-right">
                    {Math.round(value * (suffix === 'x' ? 100 : 1000) / (suffix === 'x' ? 1 : 1)) / (suffix === 'x' ? 100 : 1000)}
                </span>
            </div>
        );

    return (
        <div className="w-full h-[calc(100dvh-6rem)] flex flex-col bg-slate-100">

            {/* ── Toolbar ─────────────────────────────────────────────── */}
            <div className="h-14 shrink-0 bg-white border-b border-slate-200 flex items-center justify-between px-4 gap-4">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 text-accent text-[10px] font-bold uppercase tracking-wider shrink-0">
                        <Sparkles size={12} /> Content Studio
                    </span>
                    <div className="hidden md:flex gap-1 p-1 rounded-xl bg-slate-100 ml-2">
                        {Object.values(FORMATS).map(f => (
                            <button key={f.id} onClick={() => setDesign(d => ({ ...d, format: f.id, background: { ...d.background, src: reframed[f.id] || d.background.src } }))}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${design.format === f.id ? 'bg-white text-accent shadow-sm' : 'text-slate-500'}`}>
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    <button onClick={undo} disabled={!past.current.length} className={iconBtn} title="Undo"><Undo2 size={15} /></button>
                    <button onClick={redo} disabled={!future.current.length} className={iconBtn} title="Redo"><Redo2 size={15} /></button>
                    <button onClick={() => setShowSafe(s => !s)} className={`${iconBtn} ${showSafe ? 'text-accent bg-accent/10' : ''}`} title="Safe areas"><Eye size={15} /></button>
                    <div className="w-px h-6 bg-slate-200 mx-1" />
                    <button onClick={runReframe} disabled={!design.background.src || !!busy}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-[11px] font-bold transition-colors disabled:opacity-40">
                        <Wand2 size={13} /> <span className="hidden sm:inline">AI Reframe</span>
                    </button>
                    <button onClick={() => exportOne(design.format)} disabled={!design.background.src || !!busy}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-[11px] font-bold transition-colors disabled:opacity-40">
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download
                    </button>
                </div>
            </div>

            <div className="flex-1 flex min-h-0">

                {/* ── Left rail ───────────────────────────────────────── */}
                <div className={`w-[248px] shrink-0 border-r ${side} flex flex-col min-h-0`}>
                    <div className="flex gap-1 p-2 border-b border-slate-100">
                        {([['templates', LayoutTemplate], ['layers', LayersIcon], ['brand', Palette]] as const).map(([k, Icon]) => (
                            <button key={k} onClick={() => setPanel(k)}
                                className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-1 ${
                                    panel === k ? 'bg-accent/10 text-accent' : 'text-slate-400 hover:bg-slate-50'}`}>
                                <Icon size={13} />
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto p-3">
                        {panel === 'templates' && (
                            <div className="space-y-2">
                                <button onClick={runSuggest} disabled={!design.background.src || !!busy}
                                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent text-[11px] font-bold transition-colors disabled:opacity-40 mb-1">
                                    <Sparkles size={13} /> Suggest text from the render
                                </button>

                                {suggestions.length > 0 && (
                                    <div className="mb-3 p-2 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                                        <div className="flex items-center justify-between px-1">
                                            <span className={`${lbl} mb-0`}>Suggestions</span>
                                            <button onClick={() => setSuggestions([])} className="text-[10px] text-slate-400 hover:text-slate-600">clear</button>
                                        </div>
                                        {suggestions.map((s, i) => (
                                            <button key={i} onClick={() => applySuggestion(s)}
                                                className="w-full text-left px-2.5 py-2 rounded-lg bg-white border border-slate-200 hover:border-accent transition-colors">
                                                <span className="block text-[11px] font-bold text-slate-700 leading-tight">{s.headline}</span>
                                                <span className="block text-[10px] text-slate-400 mt-0.5">{s.subline}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {TEMPLATES.map(t => (
                                    <button key={t.id} onClick={() => commit(applyTemplate(t, brand, design))}
                                        className="w-full text-left px-3 py-2.5 rounded-xl border border-slate-200 hover:border-accent hover:bg-accent/5 transition-all">
                                        <span className="block text-xs font-bold text-slate-700">{t.name}</span>
                                        <span className="block text-[10px] text-slate-400 mt-0.5">{t.description}</span>
                                    </button>
                                ))}
                                <div className="pt-3 mt-3 border-t border-slate-100 space-y-2">
                                    <span className={lbl}>Add</span>
                                    <button onClick={() => addLayer(newText({ font: brand.font }))} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-600 transition-colors"><Type size={13} /> Text</button>
                                    <button onClick={() => addLayer(newShape({ fill: brand.accent }))} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-600 transition-colors"><SquareIcon size={13} /> Shape</button>
                                    <button onClick={() => brand.logo ? addLayer(newLogo(brand.logo)) : logoInput.current?.click()} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-600 transition-colors"><ImageIcon size={13} /> Logo</button>
                                </div>
                            </div>
                        )}

                        {panel === 'layers' && (
                            <div className="space-y-1">
                                {[...design.layers].reverse().map(l => (
                                    <div key={l.id}
                                        onClick={() => setSelectedId(l.id)}
                                        className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all ${
                                            selectedId === l.id ? 'bg-accent/10 text-accent' : 'hover:bg-slate-50 text-slate-600'}`}>
                                        <span className="text-[11px] font-semibold flex-1 truncate">
                                            {l.type === 'text' ? (l as TextLayer).text.slice(0, 22) || 'Text' : l.name}
                                        </span>
                                        <button onClick={e => { e.stopPropagation(); patchLayer(l.id, { locked: !l.locked } as Partial<Layer>); }} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-accent">
                                            {l.locked ? <Lock size={11} /> : <Unlock size={11} />}
                                        </button>
                                        <button onClick={e => { e.stopPropagation(); move(l.id, 1); }} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-accent"><ArrowUp size={11} /></button>
                                        <button onClick={e => { e.stopPropagation(); move(l.id, -1); }} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-accent"><ArrowDown size={11} /></button>
                                    </div>
                                ))}
                                {!design.layers.length && <p className="text-[11px] text-slate-400 px-2 py-4 text-center">No layers yet — pick a template.</p>}
                            </div>
                        )}

                        {panel === 'brand' && (
                            <div className="space-y-3">
                                <Row label="Business name">
                                    <input className={inp} value={brand.businessName} placeholder="Kent Garden Rooms"
                                        onChange={e => saveBrand({ ...brand, businessName: e.target.value })} />
                                </Row>
                                <Row label="Website">
                                    <input className={inp} value={brand.website} placeholder="yoursite.co.uk"
                                        onChange={e => saveBrand({ ...brand, website: e.target.value })} />
                                </Row>
                                <Row label="Brand colour">
                                    <div className="flex gap-2">
                                        <input type="color" value={brand.accent} onChange={e => saveBrand({ ...brand, accent: e.target.value })}
                                            className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer bg-white" />
                                        <input className={inp} value={brand.accent} onChange={e => saveBrand({ ...brand, accent: e.target.value })} />
                                    </div>
                                </Row>
                                <Row label="Default font">
                                    <select className={inp} value={brand.font} onChange={e => saveBrand({ ...brand, font: e.target.value as FontKey })}>
                                        {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                                    </select>
                                </Row>
                                <Row label="Logo">
                                    <button onClick={() => logoInput.current?.click()}
                                        className="w-full px-3 py-2.5 rounded-lg border border-dashed border-accent/30 text-xs font-semibold text-accent hover:bg-accent/5 transition-colors">
                                        {brand.logo ? 'Replace logo' : 'Upload logo'}
                                    </button>
                                    {brand.logo && (
                                        <div className="mt-2 p-2 rounded-lg bg-slate-800 flex items-center justify-center">
                                            <img src={brand.logo} alt="Logo" className="max-h-10 w-auto" />
                                        </div>
                                    )}
                                </Row>
                                <p className="text-[10px] text-slate-400">Saved on this device.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Canvas ──────────────────────────────────────────── */}
                <div className="flex-1 min-w-0 flex flex-col items-center justify-center p-6 overflow-auto relative">
                    {busy && (
                        <div className="absolute inset-0 z-20 bg-slate-100/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                            <Loader2 className="animate-spin text-accent" size={24} />
                            <span className="text-xs font-bold text-accent">{busy}</span>
                        </div>
                    )}

                    <PostCanvas
                        design={design}
                        width={design.format === 'linkedin' ? 520 : design.format === 'story' ? 300 : 400}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        onChange={setLayers}
                        showSafeArea={showSafe}
                    />

                    <div className="mt-4 flex items-center gap-2">
                        <button onClick={() => renderInput.current?.click()}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-accent text-[11px] font-bold text-slate-600 transition-colors">
                            <Upload size={12} /> {design.background.src ? 'Change render' : 'Add render'}
                        </button>
                        {!design.background.src && (
                            <button onClick={() => onNavigate?.(AppStage.RENDER_ENGINE)}
                                className="text-[11px] text-accent font-bold underline underline-offset-2">Open Render Engine</button>
                        )}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-400">Drag to move · corner handle to resize · arrows to nudge · ⌫ to delete</p>
                </div>

                {/* ── Right rail: properties ──────────────────────────── */}
                <div className={`w-[260px] shrink-0 border-l ${side} flex flex-col min-h-0`}>
                    <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {selected ? (selected.type === 'text' ? 'Text' : selected.name) : 'Background'}
                        </span>
                        {selected && (
                            <div className="flex gap-1">
                                <button onClick={() => addLayer({ ...selected, id: uid(), x: selected.x + 0.03, y: selected.y + 0.03 } as Layer)} className={iconBtn} title="Duplicate"><Duplicate size={13} /></button>
                                <button onClick={() => { commit({ ...design, layers: design.layers.filter(l => l.id !== selected.id) }); setSelectedId(null); }} className={`${iconBtn} hover:text-red-500`} title="Delete"><Trash2 size={13} /></button>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-3">
                        {!selected && (
                            <>
                                <Row label="Image fit">
                                    <div className="flex gap-2">
                                        <button className={chip(design.background.fit === 'cover')} onClick={() => setDesign(d => ({ ...d, background: { ...d.background, fit: 'cover' } }))}>Fill</button>
                                        <button className={chip(design.background.fit === 'contain')} onClick={() => setDesign(d => ({ ...d, background: { ...d.background, fit: 'contain' } }))}>Show all</button>
                                    </div>
                                </Row>
                                <Row label={`Gradient ${Math.round(design.background.scrim * 100)}%`}>
                                    <input type="range" min={0} max={1} step={0.05} value={design.background.scrim} className="w-full accent-accent"
                                        onChange={e => setDesign(d => ({ ...d, background: { ...d.background, scrim: parseFloat(e.target.value) } }))} />
                                </Row>
                                <Row label="Gradient from">
                                    <div className="flex gap-2">
                                        {(['bottom', 'top'] as const).map(p => (
                                            <button key={p} className={chip(design.background.scrimFrom === p)}
                                                onClick={() => setDesign(d => ({ ...d, background: { ...d.background, scrimFrom: p } }))}>{p}</button>
                                        ))}
                                    </div>
                                </Row>
                                <Row label={`Tint ${Math.round(design.background.overlayOpacity * 100)}%`}>
                                    <input type="range" min={0} max={0.8} step={0.02} value={design.background.overlayOpacity} className="w-full accent-accent"
                                        onChange={e => setDesign(d => ({ ...d, background: { ...d.background, overlayOpacity: parseFloat(e.target.value) } }))} />
                                </Row>
                                <p className="text-[10px] text-slate-400 mt-4 leading-relaxed">
                                    Select a layer on the canvas to edit it, or pick a template to start.
                                </p>
                            </>
                        )}

                        {selected?.type === 'text' && (() => {
                            const t = selected as TextLayer;
                            return (
                                <>
                                    <Row label="Text">
                                        <textarea className={`${inp} resize-none h-20`} value={t.text}
                                            onChange={e => patchLayer(t.id, { text: e.target.value } as Partial<Layer>)} />
                                    </Row>
                                    <Row label="Font">
                                        <select className={inp} value={t.font} onChange={e => patchLayer(t.id, { font: e.target.value as FontKey } as Partial<Layer>)}>
                                            {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                                        </select>
                                    </Row>
                                    <Row label={`Size ${(t.size * 1000).toFixed(0)}`}>
                                        <input type="range" min={0.015} max={0.16} step={0.002} value={t.size} className="w-full accent-accent"
                                            onChange={e => patchLayer(t.id, { size: parseFloat(e.target.value) } as Partial<Layer>)} />
                                    </Row>
                                    <Row label="Weight">
                                        <div className="flex gap-1 flex-wrap">
                                            {[300, 400, 600, 700, 800, 900].map(w => (
                                                <button key={w} className={chip(t.weight === w)} onClick={() => patchLayer(t.id, { weight: w } as Partial<Layer>)}>{w}</button>
                                            ))}
                                        </div>
                                    </Row>
                                    <Row label="Align">
                                        <div className="flex gap-2">
                                            {(['left', 'center', 'right'] as const).map(a => (
                                                <button key={a} className={chip(t.align === a)} onClick={() => patchLayer(t.id, { align: a } as Partial<Layer>)}>{a}</button>
                                            ))}
                                        </div>
                                    </Row>
                                    <Row label="Colour">
                                        <div className="flex gap-2 items-center flex-wrap">
                                            {['#ffffff', '#0f172a', brand.accent, '#f8fafc'].map(c => (
                                                <button key={c} onClick={() => patchLayer(t.id, { color: c } as Partial<Layer>)}
                                                    className={`w-7 h-7 rounded-lg border-2 ${t.color === c ? 'border-accent' : 'border-slate-200'}`} style={{ background: c }} />
                                            ))}
                                            <input type="color" value={t.color.startsWith('#') ? t.color : '#ffffff'}
                                                onChange={e => patchLayer(t.id, { color: e.target.value } as Partial<Layer>)}
                                                className="w-7 h-7 rounded-lg border border-slate-200 cursor-pointer bg-white" />
                                        </div>
                                    </Row>
                                    <Row label={`Line height ${t.lineHeight.toFixed(2)}`}>
                                        <input type="range" min={0.85} max={1.8} step={0.05} value={t.lineHeight} className="w-full accent-accent"
                                            onChange={e => patchLayer(t.id, { lineHeight: parseFloat(e.target.value) } as Partial<Layer>)} />
                                    </Row>
                                    <Row label={`Letter spacing ${t.letterSpacing.toFixed(2)}em`}>
                                        <input type="range" min={-0.06} max={0.3} step={0.01} value={t.letterSpacing} className="w-full accent-accent"
                                            onChange={e => patchLayer(t.id, { letterSpacing: parseFloat(e.target.value) } as Partial<Layer>)} />
                                    </Row>
                                    <div className="flex flex-col gap-2 mt-3">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={t.uppercase} className="accent-accent"
                                                onChange={e => patchLayer(t.id, { uppercase: e.target.checked } as Partial<Layer>)} />
                                            <span className="text-[11px] font-semibold text-slate-600">Uppercase</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={t.shadow} className="accent-accent"
                                                onChange={e => patchLayer(t.id, { shadow: e.target.checked } as Partial<Layer>)} />
                                            <span className="text-[11px] font-semibold text-slate-600">Drop shadow</span>
                                        </label>
                                    </div>
                                </>
                            );
                        })()}

                        {selected?.type === 'shape' && (() => {
                            const s = selected as ShapeLayer;
                            return (
                                <>
                                    <Row label="Fill">
                                        <div className="flex gap-2 items-center flex-wrap">
                                            {[brand.accent, '#ffffff', '#0f172a'].map(c => (
                                                <button key={c} onClick={() => patchLayer(s.id, { fill: c } as Partial<Layer>)}
                                                    className={`w-7 h-7 rounded-lg border-2 ${s.fill === c ? 'border-accent' : 'border-slate-200'}`} style={{ background: c }} />
                                            ))}
                                            <input type="color" value={s.fill} onChange={e => patchLayer(s.id, { fill: e.target.value } as Partial<Layer>)}
                                                className="w-7 h-7 rounded-lg border border-slate-200 cursor-pointer bg-white" />
                                        </div>
                                    </Row>
                                    <Row label={`Corner ${s.radius >= 0.5 ? 'pill' : (s.radius * 1000).toFixed(0)}`}>
                                        <input type="range" min={0} max={0.5} step={0.005} value={s.radius} className="w-full accent-accent"
                                            onChange={e => patchLayer(s.id, { radius: parseFloat(e.target.value) } as Partial<Layer>)} />
                                    </Row>
                                    <Row label={`Opacity ${Math.round(s.opacity * 100)}%`}>
                                        <input type="range" min={0.05} max={1} step={0.05} value={s.opacity} className="w-full accent-accent"
                                            onChange={e => patchLayer(s.id, { opacity: parseFloat(e.target.value) } as Partial<Layer>)} />
                                    </Row>
                                </>
                            );
                        })()}

                        {selected?.type === 'logo' && (() => {
                            const l = selected as LogoLayer;
                            return (
                                <>
                                    <button onClick={() => logoInput.current?.click()}
                                        className="w-full px-3 py-2.5 mb-3 rounded-lg border border-dashed border-accent/30 text-xs font-semibold text-accent hover:bg-accent/5 transition-colors">
                                        Replace logo
                                    </button>
                                    <label className="flex items-center gap-2 cursor-pointer mb-3">
                                        <input type="checkbox" checked={l.stripWhite} className="accent-accent"
                                            onChange={e => patchLayer(l.id, { stripWhite: e.target.checked } as Partial<Layer>)} />
                                        <span className="text-[11px] font-semibold text-slate-600">Remove white background</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer mb-3">
                                        <input type="checkbox" checked={l.shadow} className="accent-accent"
                                            onChange={e => patchLayer(l.id, { shadow: e.target.checked } as Partial<Layer>)} />
                                        <span className="text-[11px] font-semibold text-slate-600">Drop shadow</span>
                                    </label>
                                    <Row label={`Opacity ${Math.round(l.opacity * 100)}%`}>
                                        <input type="range" min={0.1} max={1} step={0.05} value={l.opacity} className="w-full accent-accent"
                                            onChange={e => patchLayer(l.id, { opacity: parseFloat(e.target.value) } as Partial<Layer>)} />
                                    </Row>
                                </>
                            );
                        })()}

                        {/* Caption sits at the foot of the properties rail so it is
                            always reachable without stealing a column. */}
                        <div className="mt-6 pt-4 border-t border-slate-100">
                            <div className="flex items-center justify-between mb-2">
                                <span className={`${lbl} mb-0`}>Caption</span>
                                <div className="flex gap-1">
                                    {([['instagram', Instagram], ['linkedin', Linkedin]] as const).map(([p, Icon]) => (
                                        <button key={p} onClick={() => setPlatform(p)} title={p}
                                            className={`p-1.5 rounded-lg transition-all ${platform === p ? 'bg-accent/10 text-accent' : 'text-slate-300'}`}>
                                            <Icon size={12} />
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {caption ? (
                                <div className="space-y-2">
                                    <p className="text-[11px] text-slate-600 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">{caption.caption}</p>
                                    {caption.hashtags.length > 0 && <p className="text-[10px] text-accent/70 break-words">{caption.hashtags.join(' ')}</p>}
                                    <button onClick={async () => {
                                        await navigator.clipboard.writeText(`${caption.caption}\n\n${caption.hashtags.join(' ')}`.trim());
                                        setCopied(true); setTimeout(() => setCopied(false), 1600);
                                    }} className="w-full py-2 rounded-lg bg-accent text-white text-[11px] font-bold hover:bg-accent-hover transition-colors">
                                        {copied ? <><Check size={11} className="inline" /> Copied</> : <><Copy size={11} className="inline" /> Copy caption</>}
                                    </button>
                                </div>
                            ) : (
                                <button onClick={runCaption} disabled={!!busy}
                                    className="w-full py-2.5 rounded-lg border border-dashed border-accent/30 text-[11px] font-bold text-accent hover:bg-accent/5 transition-colors disabled:opacity-40">
                                    Write from the spec
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <input ref={renderInput} type="file" accept="image/*" className="hidden" onChange={e => pickRender(e.target.files?.[0])} />
            <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={e => pickLogo(e.target.files?.[0])} />

            {/*
              * Off-screen export surface, at true platform pixels.
              * Positioned rather than display:none - html2canvas cannot measure a
              * node that was never laid out.
              */}
            <div ref={exportHost} style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }} aria-hidden>
                <PostCanvas design={design} width={FORMATS[design.format].width} selectedId={null} stat />
            </div>
        </div>
    );
};
