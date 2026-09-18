import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { LayoutGrid, Upload, Loader2, Lock, Download, RotateCcw, Ruler, Image as ImageIcon, CheckCircle2, AlertTriangle, FolderOpen, Box } from 'lucide-react';
import { DraftingBackground } from '../DraftingBackground';
import { Button } from '../Button';
import { useAuth } from '../../hooks/useAuth';
import { useCredits } from '../../hooks/useCredits';
import { compressImageFile } from '../../hooks/useAppEngine';
import { AppStage } from '../../types';
import { GenerationProgress } from '../GenerationProgress';
import {
    FloorPlanMode, InventoryItem, FloorPlanResult,
    generateFloorPlan, surveyFloorPlan, floorPlanInventory, takePendingPlanCapture,
} from '../../services/floorPlanService';

/**
 * Floor Plan Studio (18 Sep 2026).
 *
 * The render engine pointed straight down. A plan-view capture arrives from
 * the 3D configurator (shaded + exact line drawing + the design spec), or
 * the user drops a top view from SketchUp and the engine surveys it. Two
 * outputs: a RENDERED plan (real floor, furniture as placed, soft top-down
 * shadows) and a CAD plan (black on white, dimension strings, door swings,
 * symbols). Same contract as an exterior render - nothing added, nothing
 * moved, verified item by item - and each plan spends one render.
 */

const STAGES = {
    rendered: ['Reading the plan…', 'Locking the walls and openings…', 'Laying the floor…', 'Placing the furniture…', 'Checking every item…'],
    cad: ['Reading the plan…', 'Setting out the walls…', 'Drawing openings and symbols…', 'Adding dimension strings…', 'Checking every figure…'],
};

const MODES: { id: FloorPlanMode; label: string; hint: string; icon: React.ReactNode }[] = [
    { id: 'rendered', label: 'Rendered plan', hint: 'Real floor and furniture, seen from above - brochure style', icon: <ImageIcon size={16} /> },
    { id: 'cad', label: 'CAD plan', hint: 'Black on white with dimensions, swings and symbols', icon: <Ruler size={16} /> },
];

const SUPPORTED: [string, number][] = [['1:1', 1], ['3:4', 3 / 4], ['4:3', 4 / 3], ['9:16', 9 / 16], ['16:9', 16 / 9], ['2:3', 2 / 3], ['3:2', 3 / 2], ['4:5', 4 / 5], ['5:4', 5 / 4], ['21:9', 21 / 9]];
const ratioFor = (w: number, h: number) => (w > 0 && h > 0 ? [...SUPPORTED].sort((a, b) => Math.abs(a[1] - w / h) - Math.abs(b[1] - w / h))[0][0] : '4:3');
const imageSize = (src: string) => new Promise<{ w: number; h: number }>(resolve => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = src;
});
const toDataUrl = (b64: string) => (b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`);

const Gate: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar">
        <DraftingBackground pageName="FLOOR PLAN" />
        <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[150px] pointer-events-none" />
        <div className="flex-1 flex items-center justify-center p-6 md:p-12 relative z-10">
            <div className="max-w-lg w-full text-center p-8 md:p-10 rounded-3xl bg-white border border-slate-200 shadow-sm">
                {children}
            </div>
        </div>
    </div>
);

interface FloorPlanStudioViewProps {
    onNavigate?: (stage: AppStage) => void;
    onSaveToProject?: (image: string) => void;
}

type Source = { kind: 'configurator' | 'upload'; shaded: string; line: string | null; spec: unknown; ratio: string; name: string };

export const FloorPlanStudioView: React.FC<FloorPlanStudioViewProps> = ({ onNavigate, onSaveToProject }) => {
    const { user } = useAuth();
    // Floor Plan Studio shares the Business gate with Animation Studio (the
    // server's FLOOR_PLAN_PLANS set); `canUseAnimation` is the client's view of it.
    const { canUseAnimation, rendersLeft, plan, loading: planLoading, refreshCredits } = useCredits();
    const isBeta = plan === 'beta' || plan === 'tester';

    const [source, setSource] = useState<Source | null>(null);
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [surveying, setSurveying] = useState(false);
    const [mode, setMode] = useState<FloorPlanMode>('rendered');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<FloorPlanResult | null>(null);
    const [showItems, setShowItems] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // The configurator's capture, if we were sent here by its button.
    useEffect(() => {
        const p = takePendingPlanCapture();
        if (!p) return;
        (async () => {
            const { w, h } = await imageSize(p.shaded);
            setSource({ kind: 'configurator', shaded: p.shaded, line: p.line, spec: p.spec, ratio: ratioFor(w, h), name: 'Plan view from the 3D configurator' });
            setResult(null);
            setItems(await floorPlanInventory(p.spec));
        })();
    }, []);

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) { toast.error('Choose an image - a PNG or JPEG top view.'); return; }
        try {
            const base64 = await compressImageFile(file, 2048);
            const dataUrl = `data:image/jpeg;base64,${base64}`;
            const { w, h } = await imageSize(dataUrl);
            setSource({ kind: 'upload', shaded: dataUrl, line: null, spec: null, ratio: ratioFor(w, h), name: file.name });
            setResult(null);
            setItems([]);
            setSurveying(true);
            try {
                setItems(await surveyFloorPlan(base64));
            } catch (e: any) {
                toast.error(e?.message || 'Could not read the plan - the engine will work from the image alone.');
            } finally {
                setSurveying(false);
            }
        } catch {
            toast.error('Could not read that image. Try re-exporting it as a PNG or JPEG.');
        }
    };

    const resetAll = () => {
        setSource(null); setItems([]); setResult(null); setNotes('');
        if (fileRef.current) fileRef.current.value = '';
    };

    const handleGenerate = async (which: FloorPlanMode = mode) => {
        if (!source || busy) return;
        setBusy(true);
        setResult(null);
        try {
            const r = await generateFloorPlan({
                shaded: source.shaded, line: source.line, spec: source.spec,
                items: source.kind === 'upload' ? items : undefined,
                mode: which, ratio: source.ratio, notes: notes.trim() || undefined,
            });
            setResult(r);
            setMode(which);
            refreshCredits();
            if (r.verification?.checked && !r.verification.passed) {
                toast(`Plan ready - ${r.verification.failures.length} item${r.verification.failures.length === 1 ? '' : 's'} flagged by the checker, listed under the plan.`, { icon: '⚠️' });
            } else {
                toast.success(which === 'cad' ? 'CAD plan ready' : 'Rendered plan ready');
            }
        } catch (e: any) {
            if (e?.needsBusiness) { toast.error(e.message); onNavigate?.(AppStage.PRICING); }
            else toast.error(e?.message || 'The floor plan could not be generated.');
        } finally {
            setBusy(false);
        }
    };

    const download = () => {
        if (!result) return;
        const a = document.createElement('a');
        a.href = toDataUrl(result.image);
        a.download = `modulr-floor-plan-${result.mode}-${Date.now()}.jpg`;
        a.click();
    };

    const grouped = useMemo(() => {
        const g = new Map<string, InventoryItem[]>();
        for (const it of items) { const k = it.group || 'other'; if (!g.has(k)) g.set(k, []); g.get(k)!.push(it); }
        return [...g.entries()];
    }, [items]);

    if (!user) {
        return (
            <Gate>
                <div className="w-14 h-14 mx-auto rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-6">
                    <LayoutGrid size={24} className="text-accent" />
                </div>
                <h1 className="text-2xl font-bold text-accent tracking-tight mb-3">Floor Plan Studio</h1>
                <p className="text-sm text-slate-600 leading-relaxed mb-8">
                    Rendered and CAD floor plans from your design, nothing added or moved. Sign in to your Business account to use it.
                </p>
                <Button onClick={() => onNavigate?.(AppStage.AUTH)}>Sign in</Button>
            </Gate>
        );
    }

    if (planLoading || canUseAnimation === null) {
        return (
            <Gate>
                <div className="flex items-center justify-center gap-3 text-slate-500 py-6">
                    <Loader2 className="animate-spin" size={20} />
                    <span className="text-sm">Checking your plan…</span>
                </div>
            </Gate>
        );
    }

    if (!canUseAnimation) {
        return (
            <Gate>
                <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-6">
                    <Lock size={22} className="text-amber-600" />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600 mb-3">{isBeta ? 'Not in the trial' : 'Business plan feature'}</p>
                <h1 className="text-2xl font-bold text-accent tracking-tight mb-3">Floor Plan Studio is part of Business</h1>
                <p className="text-sm text-slate-600 leading-relaxed mb-8">
                    A rendered floor plan with the real floor and furniture, or a dimensioned black-and-white CAD plan, straight from the 3D configurator or an uploaded top view. Each plan uses one render from the Business allowance.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                    <Button onClick={() => onNavigate?.(AppStage.PRICING)}>See Business plan</Button>
                    <button onClick={() => onNavigate?.(AppStage.HOME)} className="text-sm text-slate-500 hover:text-accent transition-colors px-3 py-2">Back to home</button>
                </div>
            </Gate>
        );
    }

    const labelClass = 'text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500';
    const failures = result?.verification?.failures || [];

    return (
        <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar">
            <DraftingBackground pageName="FLOOR PLAN" />
            <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[150px] pointer-events-none" />

            <div className="flex-1 p-6 md:p-12 relative z-10 w-full">
                <div className="max-w-[1400px] mx-auto">

                    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
                        <div className="space-y-2">
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/5 border border-accent/15 text-accent text-[11px] font-bold uppercase tracking-[0.2em]">
                                <LayoutGrid size={14} /> Floor Plan Studio
                            </div>
                            <h1 className="text-3xl md:text-5xl font-bold text-accent tracking-tight leading-tight">The plan, drawn properly</h1>
                            <p className="text-slate-600 text-sm max-w-xl">Send the plan view from the 3D configurator, or drop a top view from SketchUp. Get a rendered plan or a dimensioned CAD plan - every wall, opening and piece of furniture exactly where you put it.</p>
                        </div>
                        {rendersLeft !== null && (
                            <div className="px-5 py-3 rounded-2xl bg-white border border-slate-200 text-right">
                                <p className={labelClass}>Renders left</p>
                                <p className="text-2xl font-bold text-accent leading-none mt-1">{rendersLeft}</p>
                                <p className="text-[11px] text-slate-400 mt-1">one per plan</p>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
                        {/* ---- controls ------------------------------------------------ */}
                        <div className="space-y-5">
                            <div className="p-5 rounded-3xl bg-white border border-slate-200 space-y-4">
                                <p className={labelClass}>1 · Source</p>
                                {source ? (
                                    <div className="flex items-center gap-3">
                                        <img src={source.shaded} alt="" className="w-20 h-14 object-cover rounded-lg border border-slate-200 bg-slate-50" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-accent truncate">{source.name}</p>
                                            <p className="text-[11px] text-slate-400">
                                                {source.kind === 'configurator' ? 'Exact line drawing + design spec' : surveying ? 'Reading the plan…' : `${items.length} item${items.length === 1 ? '' : 's'} read from the image`}
                                            </p>
                                        </div>
                                        <button onClick={resetAll} className="p-2 rounded-lg text-slate-400 hover:text-accent hover:bg-slate-50" title="Start again"><RotateCcw size={16} /></button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <button
                                            onClick={() => onNavigate?.(AppStage.DESIGNER)}
                                            className="w-full flex items-center gap-3 p-3 rounded-2xl border border-accent/20 bg-accent/5 hover:bg-accent/10 transition-colors text-left"
                                        >
                                            <Box size={18} className="text-accent shrink-0" />
                                            <span className="text-sm text-accent"><span className="font-semibold">From the 3D configurator</span><br /><span className="text-[11px] text-slate-500">Open a design and press Floor Plan Studio</span></span>
                                        </button>
                                        <label
                                            onDragOver={e => e.preventDefault()}
                                            onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
                                            className="w-full flex items-center gap-3 p-3 rounded-2xl border border-dashed border-slate-300 hover:border-accent/40 transition-colors cursor-pointer"
                                        >
                                            <Upload size={18} className="text-slate-400 shrink-0" />
                                            <span className="text-sm text-slate-600"><span className="font-semibold text-accent">Upload a top view</span><br /><span className="text-[11px] text-slate-500">A SketchUp top view or plan screenshot, PNG or JPEG</span></span>
                                            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
                                        </label>
                                    </div>
                                )}
                            </div>

                            <div className="p-5 rounded-3xl bg-white border border-slate-200 space-y-3">
                                <p className={labelClass}>2 · Output</p>
                                {MODES.map(m => (
                                    <button
                                        key={m.id}
                                        onClick={() => setMode(m.id)}
                                        className={`w-full flex items-start gap-3 p-3 rounded-2xl border text-left transition-all ${mode === m.id ? 'border-accent bg-accent text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
                                    >
                                        <span className={`mt-0.5 ${mode === m.id ? 'text-white' : 'text-accent'}`}>{m.icon}</span>
                                        <span className="text-sm"><span className="font-semibold">{m.label}</span><br /><span className={`text-[11px] ${mode === m.id ? 'text-white/80' : 'text-slate-500'}`}>{m.hint}</span></span>
                                    </button>
                                ))}
                            </div>

                            <div className="p-5 rounded-3xl bg-white border border-slate-200 space-y-3">
                                <p className={labelClass}>3 · Notes <span className="normal-case tracking-normal font-normal text-slate-400">(optional)</span></p>
                                <textarea
                                    value={notes}
                                    onChange={e => setNotes(e.target.value.slice(0, 400))}
                                    rows={3}
                                    placeholder={mode === 'cad' ? 'e.g. label the left room STUDIO, the right room STORE' : 'e.g. pale oak floor, charcoal deck'}
                                    className="w-full text-sm rounded-xl border border-slate-200 p-3 outline-none focus:ring-2 focus:ring-accent/30 resize-none"
                                />
                                <p className="text-[11px] text-slate-400">Notes can name colours and labels. They cannot add, move or remove anything - the drawing wins.</p>
                            </div>

                            {items.length > 0 && (
                                <div className="p-5 rounded-3xl bg-white border border-slate-200">
                                    <button onClick={() => setShowItems(v => !v)} className="w-full flex items-center justify-between">
                                        <p className={labelClass}>What the engine will keep · {items.length}</p>
                                        <span className="text-[11px] text-slate-400">{showItems ? 'hide' : 'show'}</span>
                                    </button>
                                    {showItems && (
                                        <div className="mt-3 space-y-3 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                                            {grouped.map(([group, list]) => (
                                                <div key={group}>
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{group}</p>
                                                    <ul className="space-y-1">
                                                        {list.map(it => <li key={it.id} className="text-xs text-slate-600 flex items-start gap-2"><CheckCircle2 size={12} className="text-accent mt-0.5 shrink-0" />{it.label}</li>)}
                                                    </ul>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <Button
                                onClick={() => handleGenerate()}
                                disabled={!source || busy || surveying}
                                className="w-full py-4 text-sm"
                            >
                                {busy ? <span className="inline-flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Drawing…</span> : `Generate ${mode === 'cad' ? 'CAD plan' : 'rendered plan'} · 1 render`}
                            </Button>
                        </div>

                        {/* ---- canvas -------------------------------------------------- */}
                        <div className="space-y-4">
                            <div className="rounded-3xl bg-white border border-slate-200 overflow-hidden min-h-[420px] flex items-center justify-center relative">
                                {busy ? (
                                    <div className="p-10 w-full max-w-md">
                                        <GenerationProgress stages={STAGES[mode]} expectedSeconds={mode === 'cad' ? 60 : 70} />
                                    </div>
                                ) : result ? (
                                    <img src={toDataUrl(result.image)} alt={result.mode === 'cad' ? 'CAD floor plan' : 'Rendered floor plan'} className="w-full h-auto" />
                                ) : source ? (
                                    <div className="w-full">
                                        <img src={source.shaded} alt="Plan view" className="w-full h-auto opacity-90" />
                                        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/50 text-white text-[10px] font-bold uppercase tracking-widest">Source · plan view</p>
                                    </div>
                                ) : (
                                    <div className="text-center p-10 text-slate-400">
                                        <LayoutGrid size={40} className="mx-auto mb-4 opacity-40" />
                                        <p className="text-sm">Your plan will appear here.</p>
                                    </div>
                                )}
                            </div>

                            {result && !busy && (
                                <>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <Button onClick={download} className="text-sm"><span className="inline-flex items-center gap-2"><Download size={16} /> Download</span></Button>
                                        {onSaveToProject && (
                                            <button onClick={() => onSaveToProject(result.image)} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border border-slate-200 text-sm font-semibold text-accent hover:border-accent/40 transition-colors">
                                                <FolderOpen size={16} /> Save to project
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleGenerate(result.mode === 'cad' ? 'rendered' : 'cad')}
                                            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border border-slate-200 text-sm font-semibold text-accent hover:border-accent/40 transition-colors"
                                        >
                                            {result.mode === 'cad' ? <ImageIcon size={16} /> : <Ruler size={16} />}
                                            Also make the {result.mode === 'cad' ? 'rendered plan' : 'CAD plan'} · 1 render
                                        </button>
                                        <span className="text-[11px] text-slate-400 ml-auto">{result.seconds}s · {result.engine.shipped === 'retry' ? 'second attempt' : 'first attempt'}</span>
                                    </div>
                                    {result.verification?.checked && (
                                        failures.length ? (
                                            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700 mb-2 inline-flex items-center gap-2"><AlertTriangle size={12} /> The checker flagged {failures.length} item{failures.length === 1 ? '' : 's'}</p>
                                                <ul className="space-y-1">
                                                    {failures.map(f => <li key={f.id} className="text-xs text-amber-800"><span className="font-semibold">{f.label}:</span> {f.problem}</li>)}
                                                </ul>
                                                <p className="text-[11px] text-amber-700/80 mt-2">Generate again for a fresh attempt, or add a note naming the item.</p>
                                            </div>
                                        ) : (
                                            <p className="text-[11px] text-slate-500 inline-flex items-center gap-2"><CheckCircle2 size={12} className="text-green-600" /> Every item checked against the drawing.</p>
                                        )
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
