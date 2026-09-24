import React, { useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
    Plus, Trash2, Ruler, Repeat, Hand, ChevronDown, Building2, Layers, Settings2,
    Loader2, Check, RotateCcw, Eye, EyeOff, Search, BookOpen, ImagePlus,
} from 'lucide-react';
import {
    PriceBook, PriceItem, BuildingMethod, QUOTE_CATEGORIES, QuoteCategoryId, MEASURES, MeasureKey,
    UNIT_LABELS, PriceUnit, buildingLines, lineTotal, formatGBP, formatQuoteNumber, uid, perUnit,
    DesignModel, ModelPart, modelSplit,
} from '../../services/quoteEngine';
import { starterPriceBook, uploadPriceBookImage } from '../../services/priceBookService';
import { NumField, Segmented, Toggle, labelClass, inputClass } from './fields';
import { Button } from '../Button';

/**
 * Projects > Price book: the company's rates, set once, used by every quote.
 *
 * Three parts in the order a company thinks about pricing: how the building
 * itself is priced (the part everyone does differently), then everything else
 * by category - doors, windows, internal walls and so on - and last the
 * quote's own settings (VAT, payment stages, wording).
 */

const METHODS: { id: BuildingMethod; title: string; body: string }[] = [
    { id: 'models', title: 'Set designs', body: 'Your range of standard models, each at its own price.' },
    { id: 'per_m2', title: 'Per m²', body: 'A rate for every square metre of floor.' },
    { id: 'grid', title: 'Size table', body: 'A price for each width × depth, like a brochure.' },
    { id: 'bands', title: 'Area bands', body: 'A fixed price for each floor area up to a limit.' },
    { id: 'base_plus_m2', title: 'Base + per m²', body: 'A fixed starting price, plus a rate by size.' },
    { id: 'manual', title: 'Priced per job', body: 'You type the building price on each quote.' },
];

const SAMPLE_SIZES: [number, number][] = [[3, 2.5], [4, 3], [5, 4], [6, 4]];

/** Round a price to the nearest step, for bulk changes. */
const roundTo = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : Math.round(v * 100) / 100);

/** Which measures make sense in each category, first in the picker. */
const MEASURE_HINTS: Record<QuoteCategoryId, MeasureKey[]> = {
    building: ['footprint_m2', 'internal_floor_m2'],
    groundworks: ['footprint_m2', 'perimeter_lm'],
    cladding: ['wall_net_m2', 'clad_composite_m2', 'clad_timber_m2', 'clad_metal_m2', 'clad_painted_m2', 'clad_render_m2', 'clad_fibre_cement_m2', 'gutter_lm', 'perimeter_lm', 'picture_frame'],
    roof: ['roof_m2', 'roof_epdm_m2', 'roof_green_m2', 'roof_metal_m2', 'roof_tiles_m2', 'roof_slate_m2', 'gable_m2', 'canopy_m2', 'lshape'],
    external_doors: ['door_single', 'door_french', 'door_bifold_leaf', 'door_sliding_leaf', 'door_sets', 'door_crittall'],
    windows: ['window_m2', 'window_each', 'window_crittall', 'skylight_flat', 'skylight_lantern', 'apex_glazing'],
    internal: ['partition_lm', 'internal_door'],
    finishes: ['floor_finish_m2', 'internal_floor_m2'],
    electrics: ['downlight', 'pendant', 'ext_light'],
    heating: ['heater', 'aircon', 'towel_rail', 'water_heater'],
    bathroom: ['wc', 'basin', 'shower', 'extractor_fan'],
    kitchen: ['kitchen_base_lm', 'kitchen_wall_lm', 'kitchen_tall', 'worktop_lm', 'kitchen_sink', 'kitchen_hob', 'kitchen_extractor', 'kitchen_island'],
    outdoor: ['decking_m2', 'bay_m2', 'path_m2', 'fence_lm', 'hot_tub', 'garden_steps'],
    installation: [],
    fees: [],
    extras: [],
};

/** A set design's picture: click or drop to add one, replace or remove it. */
const ModelImage: React.FC<{ url: string | null; name: string; onChange: (url: string | null) => void }> = ({ url, name, onChange }) => {
    const ref = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [over, setOver] = useState(false);
    const take = async (file: File | undefined) => {
        if (!file) return;
        setBusy(true);
        try {
            onChange(await uploadPriceBookImage(file));
        } catch (e: any) {
            toast.error(e?.message || 'The image could not be saved.');
        } finally {
            setBusy(false);
        }
    };
    return (
        <div
            className={`group relative shrink-0 w-full sm:w-44 h-32 rounded-xl overflow-hidden border-2 border-dashed transition-colors ${over ? 'border-accent bg-accent/5' : url ? 'border-transparent' : 'border-slate-200 bg-slate-50 hover:border-accent/40'}`}
            onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
            onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); }}
        >
            <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { take(e.target.files?.[0]); e.target.value = ''; }} />
            {url ? (
                <>
                    <img src={url} alt={name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button onClick={() => ref.current?.click()} className="px-2.5 py-1.5 text-[11px] font-bold bg-white text-slate-700">Replace</button>
                        <button onClick={() => onChange(null)} className="p-1.5 bg-white text-rose-600" aria-label="Remove image"><Trash2 size={13} /></button>
                    </div>
                </>
            ) : (
                <button onClick={() => ref.current?.click()} className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-slate-400 hover:text-accent transition-colors">
                    <ImagePlus size={20} />
                    <span className="text-[11px] font-semibold">Add a picture</span>
                    <span className="text-[10px] text-slate-300">drop or click</span>
                </button>
            )}
            {busy && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><Loader2 size={18} className="animate-spin text-accent" /></div>
            )}
        </div>
    );
};

/** Common parts of a set design, one click each. */
const PART_SUGGESTIONS: { category: QuoteCategoryId; name: string }[] = [
    { category: 'groundworks', name: 'Ground screw foundation' },
    { category: 'cladding', name: 'Cladding' },
    { category: 'roof', name: 'EPDM roof' },
    { category: 'external_doors', name: 'External doors' },
    { category: 'windows', name: 'Windows' },
    { category: 'electrics', name: 'Electrics and lighting' },
    { category: 'installation', name: 'Delivery and installation' },
];

/**
 * "What's in the price" for one set design (Charlie, 24 Sep 2026: customers
 * want the cost broken down). Parts with amounts: the quote itemises the
 * design by them, and the building line carries what they do not.
 */
const ModelBreakdown: React.FC<{
    model: DesignModel;
    open: boolean;
    onToggle: () => void;
    onChange: (patch: Partial<DesignModel>) => void;
}> = ({ model, open, onToggle, onChange }) => {
    const parts = model.breakdown || [];
    const split = modelSplit(model);
    const setPart = (id: string, patch: Partial<ModelPart>) => onChange({ breakdown: parts.map(x => (x.id === id ? { ...x, ...patch } : x)) });
    /** A listed part is part of the price, so its category is covered. */
    const addPart = (category: QuoteCategoryId, name = '') => onChange({
        breakdown: [...parts, { id: uid(), category, name, amount: 0 }],
        covers: category === 'building' || model.covers.includes(category) ? model.covers : [...model.covers, category],
    });
    const unused = PART_SUGGESTIONS.filter(sg => !parts.some(x => x.category === sg.category));
    return (
        <div className="border-t border-slate-100 pt-3">
            <button onClick={onToggle} className="flex items-center gap-1.5 text-xs font-semibold text-accent">
                <ChevronDown size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
                What's in the price
                <span className="font-normal text-slate-400">
                    {parts.length ? `· ${parts.length} part${parts.length === 1 ? '' : 's'}, ${formatGBP(split.parts)} of ${formatGBP(model.price)}` : '· not broken down - the quote shows one price'}
                </span>
            </button>
            {open && (
                <div className="mt-3 space-y-2">
                    <p className="text-[11px] text-slate-400 leading-snug">
                        What the customer gets, and what each part costs. The quote itemises the design this way; whatever the parts
                        do not account for stays on the {model.name || 'design'} line.
                    </p>
                    {parts.map(x => (
                        <div key={x.id} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_110px_24px] gap-2 items-center">
                            <select
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] text-slate-600 focus:outline-none focus:ring-2 focus:ring-accent/25"
                                value={x.category}
                                onChange={e => setPart(x.id, { category: e.target.value as QuoteCategoryId })}
                                aria-label="Category"
                            >
                                {QUOTE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                            </select>
                            <input className={`${inputClass} py-1.5`} value={x.name} placeholder="e.g. French doors, aluminium" autoFocus={x.name === ''} onChange={e => setPart(x.id, { name: e.target.value })} />
                            <NumField prefix="£" value={x.amount || null} allowEmpty placeholder="0" min={0} onChange={v => setPart(x.id, { amount: v ?? 0 })} ariaLabel={`${x.name} amount`} />
                            <button onClick={() => onChange({ breakdown: parts.filter(p => p.id !== x.id) })} className="text-slate-300 hover:text-rose-600" aria-label="Remove part"><Trash2 size={14} /></button>
                        </div>
                    ))}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <button onClick={() => addPart('building')} className="flex items-center gap-1 text-[11px] font-semibold text-accent mr-2"><Plus size={13} /> Add a part</button>
                        {unused.map(sg => (
                            <button key={sg.category} onClick={() => addPart(sg.category, sg.name)} className="px-2 py-0.5 rounded-full text-[10px] font-semibold border border-slate-200 text-slate-500 hover:border-accent/40 hover:text-accent">
                                + {sg.name}
                            </button>
                        ))}
                    </div>
                    {parts.length > 0 && (
                        <div className={`flex flex-wrap items-center justify-between gap-2 mt-2 px-3 py-2 rounded-lg text-[11px] ${split.over ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-500'}`}>
                            <span>Parts {formatGBP(split.parts)} · {model.name || 'Design'} line {formatGBP(split.shell)} · total {formatGBP(model.price)}</span>
                            {split.over
                                ? <button onClick={() => onChange({ price: split.parts })} className="font-semibold underline">The parts come to more than the price - set the price to {formatGBP(split.parts)}</button>
                                : split.shell > 0 && <button onClick={() => onChange({ price: split.parts })} className="font-semibold text-accent underline" title="Make the price exactly what the parts add up to">Price = parts only</button>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/** How an item gets onto a quote. */
type Mode = 'hand' | 'always' | MeasureKey;
const modeOf = (i: PriceItem): Mode => (i.measure ? i.measure : i.always ? 'always' : 'hand');

const buildingPrice = (book: PriceBook, w: number, d: number) => {
    const area = book.building.basis === 'internal' ? (w - 0.3) * (d - 0.3) : w * d;
    return buildingLines(book, { areaM2: area, widthM: w, depthM: d }).reduce((t, l) => t + lineTotal(l), 0);
};

interface Props {
    book: PriceBook | null;
    setBook: (b: PriceBook, now?: boolean) => void;
    saving: boolean;
    savedAt: number | null;
    loading: boolean;
}

export const PriceBookEditor: React.FC<Props> = ({ book, setBook, saving, savedAt, loading }) => {
    const [section, setSection] = useState<'building' | 'rates' | 'settings'>('building');
    const [open, setOpen] = useState<Record<string, boolean>>({ external_doors: true, windows: true, internal: true });
    const [showCosts, setShowCosts] = useState(false);
    const [filter, setFilter] = useState('');
    const [adjustOpen, setAdjustOpen] = useState(false);
    // Set designs are how most providers sell, so the other ways of pricing
    // the building stay folded away until asked for (Charlie, 24 Sep 2026:
    // "otherwise it's a lot of info").
    const [showMethods, setShowMethods] = useState(false);
    const [openParts, setOpenParts] = useState<Record<string, boolean>>({});
    const [adjust, setAdjust] = useState<{ dir: 'up' | 'down'; pct: number; scope: 'all' | QuoteCategoryId; round: number }>({ dir: 'up', pct: 5, scope: 'all', round: 5 });

    const counts = useMemo(() => {
        const c: Record<string, number> = {};
        for (const i of book?.items || []) c[i.category] = (c[i.category] || 0) + 1;
        return c;
    }, [book]);

    if (loading && !book) {
        return (
            <div className="flex items-center justify-center py-24 text-slate-500 gap-3">
                <Loader2 className="animate-spin" size={20} /> <span className="text-sm">Loading your price book…</span>
            </div>
        );
    }

    if (!book) {
        return (
            <div className="max-w-3xl mx-auto text-center py-16 px-6 rounded-3xl bg-white border border-slate-200 shadow-sm">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-6">
                    <BookOpen size={24} className="text-accent" />
                </div>
                <h2 className="text-2xl font-bold text-accent tracking-tight mb-3">Set up your price book</h2>
                <p className="text-sm text-slate-600 leading-relaxed max-w-xl mx-auto mb-3">
                    Your rates, set once: how you price the building itself, then external doors, windows,
                    internal walls and doors, electrics, decking and the rest. Every quote starts from here,
                    and anything drawn in the 3D Configurator is counted for you.
                </p>
                <p className="text-xs text-slate-400 mb-8">
                    Start from typical UK garden-room prices and change them to yours. Nothing is sent to a client until you choose to.
                </p>
                <Button onClick={() => setBook(starterPriceBook(), true)} icon={<Plus size={16} />}>
                    Start from typical UK prices
                </Button>
            </div>
        );
    }

    const b = book.building;
    const setBuilding = (patch: Partial<PriceBook['building']>) => setBook({ ...book, building: { ...b, ...patch } });
    const setItem = (id: string, patch: Partial<PriceItem>) =>
        setBook({ ...book, items: book.items.map(i => (i.id === id ? { ...i, ...patch } : i)) });
    const removeItem = (id: string) => setBook({ ...book, items: book.items.filter(i => i.id !== id) });
    const addItem = (category: QuoteCategoryId) => {
        const fresh: PriceItem = { id: uid(), category, name: '', unit: 'each', rate: 0, cost: null, measure: null, always: false };
        // After the last item of its category, so it appears where it was asked for.
        const last = book.items.map(i => i.category).lastIndexOf(category);
        const items = [...book.items];
        items.splice(last < 0 ? items.length : last + 1, 0, fresh);
        setBook({ ...book, items });
        setOpen(o => ({ ...o, [category]: true }));
    };
    const stageSum = book.stages.reduce((t, s) => t + (s.pct || 0), 0);
    const q = filter.trim().toLowerCase();
    const vatWord = book.pricesIncVat && book.vatRegistered ? 'inc VAT' : 'ex VAT';

    /** Every price in scope up or down by a percentage - the yearly price
     *  rise, or one supplier's increase on one category. */
    const applyAdjust = () => {
        const f = 1 + (adjust.dir === 'up' ? 1 : -1) * (adjust.pct || 0) / 100;
        const r = (v: number) => (v > 0 ? roundTo(v * f, adjust.round) : v);
        const items = book.items.map(i => (adjust.scope === 'all' || i.category === adjust.scope ? { ...i, rate: r(i.rate) } : i));
        const building = adjust.scope === 'all' || adjust.scope === 'building'
            ? {
                ...b,
                ratePerM2: r(b.ratePerM2),
                basePrice: r(b.basePrice),
                minimum: r(b.minimum),
                overBandRatePerM2: r(b.overBandRatePerM2),
                bands: b.bands.map(x => ({ ...x, price: r(x.price) })),
                grid: { ...b.grid, prices: b.grid.prices.map(row => row.map(r)) },
                models: b.models.map(m => ({ ...m, price: r(m.price) })),
            }
            : b;
        setBook({ ...book, items, building }, true);
        setAdjustOpen(false);
    };

    // Size table editing.
    const grid = b.grid;
    const setGrid = (g: Partial<typeof grid>) => setBuilding({ grid: { ...grid, ...g } });
    const setCell = (wi: number, di: number, v: number) =>
        setGrid({ prices: grid.prices.map((row, i) => (i === wi ? row.map((c, j) => (j === di ? v : c)) : row)) });

    const nav: { id: typeof section; label: string; icon: React.ReactNode; hint: string }[] = [
        { id: 'building', label: 'The building', icon: <Building2 size={15} />, hint: METHODS.find(m => m.id === b.method)!.title },
        { id: 'rates', label: 'Rates by category', icon: <Layers size={15} />, hint: `${book.items.length} items` },
        { id: 'settings', label: 'Quote settings', icon: <Settings2 size={15} />, hint: book.vatRegistered ? `VAT ${book.vatRate}%` : 'No VAT' },
    ];

    return (
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
            {/* Section nav */}
            <nav className="lg:sticky lg:top-4 h-fit space-y-1.5">
                {nav.map(n => (
                    <button
                        key={n.id}
                        onClick={() => setSection(n.id)}
                        className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors ${section === n.id ? 'bg-white border-slate-200 shadow-sm' : 'border-transparent hover:bg-white/70'}`}
                    >
                        <span className={section === n.id ? 'text-accent' : 'text-slate-400'}>{n.icon}</span>
                        <span className="min-w-0">
                            <span className={`block text-sm ${section === n.id ? 'font-bold text-accent' : 'font-semibold text-slate-600'}`}>{n.label}</span>
                            <span className="block text-[11px] text-slate-400 truncate">{n.hint}</span>
                        </span>
                    </button>
                ))}
                <div className="px-4 pt-4 text-[11px] text-slate-400 flex items-center gap-1.5">
                    {saving ? <><Loader2 size={12} className="animate-spin" /> Saving</>
                        : savedAt ? <><Check size={12} className="text-emerald-600" /> Saved</>
                        : 'Changes save as you go'}
                </div>
                <p className="px-4 text-[11px] text-slate-400 leading-snug">
                    {!book.vatRegistered ? 'No VAT is charged on your quotes.'
                        : book.pricesIncVat ? `All prices include VAT at ${book.vatRate}%. The quote shows the VAT inside the total.`
                        : `All prices are ex VAT. VAT at ${book.vatRate}% is added once, on the quote total.`}
                </p>
            </nav>

            <div className="space-y-6 min-w-0">
                {/* ---------------- The building ---------------- */}
                {section === 'building' && (
                    <div className="p-6 md:p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-8">
                        <div>
                            <h2 className="text-xl font-bold text-accent">{b.method === 'models' && !showMethods ? 'Your set designs' : 'How do you price the building?'}</h2>
                            <p className="text-sm text-slate-500 mt-1">
                                {b.method === 'models' && !showMethods
                                    ? <>Each of your standard designs at its price, with what is in it. Extras - decking, internal walls, a shower room - come from <button className="underline hover:text-accent" onClick={() => setSection('rates')}>Rates by category</button>.</>
                                    : <>The insulated shell at its size. Doors, windows, cladding upgrades and everything else are
                                        priced separately in <button className="underline hover:text-accent" onClick={() => setSection('rates')}>Rates by category</button>.</>}
                            </p>
                        </div>

                        {(b.method !== 'models' || showMethods) && (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {METHODS.map(m => (
                                <button
                                    key={m.id}
                                    onClick={() => setBuilding({ method: m.id })}
                                    className={`text-left p-4 rounded-2xl border-2 transition-all ${b.method === m.id ? 'border-accent bg-accent/5' : 'border-slate-200 hover:border-accent/40'}`}
                                >
                                    <span className="flex items-center justify-between">
                                        <span className={`text-sm font-bold ${b.method === m.id ? 'text-accent' : 'text-slate-700'}`}>{m.title}</span>
                                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${b.method === m.id ? 'border-accent' : 'border-slate-300'}`}>
                                            {b.method === m.id && <span className="w-2 h-2 rounded-full bg-accent" />}
                                        </span>
                                    </span>
                                    <span className="block text-xs text-slate-500 mt-1.5 leading-snug">{m.body}</span>
                                </button>
                            ))}
                        </div>
                        )}

                        <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
                            <div className="space-y-5">
                                {(b.method !== 'models' || showMethods) && (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Name on the quote</label>
                                        <input className={inputClass} value={b.name} onChange={e => setBuilding({ name: e.target.value })} placeholder="Garden room" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Size measured by</label>
                                        <div>
                                            <Segmented
                                                value={b.basis}
                                                onChange={v => setBuilding({ basis: v })}
                                                options={[
                                                    { id: 'external', label: 'External footprint', title: 'Outside of the walls - what a customer means by "a 4 by 3"' },
                                                    { id: 'internal', label: 'Internal floor', title: 'Usable floor inside the walls' },
                                                ]}
                                            />
                                        </div>
                                    </div>
                                </div>
                                )}

                                {(b.method === 'per_m2' || b.method === 'base_plus_m2') && (
                                    <div className="grid gap-4 sm:grid-cols-3">
                                        {b.method === 'base_plus_m2' && (
                                            <div className="space-y-1.5">
                                                <label className={labelClass}>Base price</label>
                                                <NumField prefix="£" value={b.basePrice} onChange={v => setBuilding({ basePrice: v ?? 0 })} min={0} />
                                            </div>
                                        )}
                                        <div className="space-y-1.5">
                                            <label className={labelClass}>Price per m²</label>
                                            <NumField prefix="£" suffix="/m²" value={b.ratePerM2} onChange={v => setBuilding({ ratePerM2: v ?? 0 })} min={0} step={10} />
                                        </div>
                                        {b.method === 'per_m2' && (
                                            <div className="space-y-1.5">
                                                <label className={labelClass}>Minimum charge</label>
                                                <NumField prefix="£" value={b.minimum} onChange={v => setBuilding({ minimum: v ?? 0 })} min={0} />
                                            </div>
                                        )}
                                        {showCosts && (
                                            <div className="space-y-1.5">
                                                <label className={labelClass}>Your cost per m²</label>
                                                <NumField prefix="£" value={b.costPerM2 ?? null} allowEmpty placeholder="optional" onChange={v => setBuilding({ costPerM2: v })} min={0} />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {b.method === 'bands' && (
                                    <div className="space-y-3">
                                        <label className={labelClass}>Size bands</label>
                                        <div className="rounded-2xl border border-slate-200 overflow-hidden">
                                            <div className="grid grid-cols-[1fr_1fr_40px] gap-3 px-4 py-2 bg-slate-50 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                                                <span>Up to</span><span>Price</span><span />
                                            </div>
                                            {b.bands.map((band, i) => (
                                                <div key={i} className="grid grid-cols-[1fr_1fr_40px] gap-3 px-4 py-2 border-t border-slate-100 items-center">
                                                    <NumField suffix="m²" value={band.upToM2} min={0} onChange={v => setBuilding({ bands: b.bands.map((x, j) => (j === i ? { ...x, upToM2: v ?? 0 } : x)) })} />
                                                    <NumField prefix="£" value={band.price} min={0} onChange={v => setBuilding({ bands: b.bands.map((x, j) => (j === i ? { ...x, price: v ?? 0 } : x)) })} />
                                                    <button onClick={() => setBuilding({ bands: b.bands.filter((_, j) => j !== i) })} className="text-slate-300 hover:text-rose-600 justify-self-center" aria-label="Remove band"><Trash2 size={15} /></button>
                                                </div>
                                            ))}
                                            <div className="grid grid-cols-[1fr_1fr_40px] gap-3 px-4 py-2 border-t border-slate-100 items-center bg-slate-50/50">
                                                <span className="text-xs text-slate-500">Larger than that, each extra m²</span>
                                                <NumField prefix="£" suffix="/m²" value={b.overBandRatePerM2} min={0} onChange={v => setBuilding({ overBandRatePerM2: v ?? 0 })} />
                                                <span />
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const last = b.bands[b.bands.length - 1];
                                                setBuilding({ bands: [...b.bands, { upToM2: (last?.upToM2 || 10) + 5, price: (last?.price || 10000) + 4000 }] });
                                            }}
                                            className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:opacity-80"
                                        >
                                            <Plus size={14} /> Add a band
                                        </button>
                                    </div>
                                )}

                                {b.method === 'models' && (
                                    <div className="space-y-3">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <label className={labelClass}>Your designs, {vatWord}</label>
                                            <span className="text-[11px] text-slate-400">A design with the same footprint is priced as that model automatically.</span>
                                        </div>
                                        {b.models.map(m => {
                                            const setModel = (patch: Partial<typeof m>) => setBuilding({ models: b.models.map(x => (x.id === m.id ? { ...x, ...patch } : x)) });
                                            return (
                                                <div key={m.id} className="rounded-2xl border border-slate-200 p-4 hover:border-accent/30 transition-colors flex flex-col sm:flex-row gap-4">
                                                    <ModelImage
                                                        url={m.imageUrl ?? null}
                                                        name={m.name}
                                                        onChange={url => setModel({ imageUrl: url })}
                                                    />
                                                    <div className="flex-1 min-w-0 space-y-3">
                                                    <div className="flex flex-wrap items-end gap-3">
                                                        <div className="flex-1 min-w-[180px] space-y-1">
                                                            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Name</span>
                                                            <input className={`${inputClass} font-semibold`} value={m.name} placeholder="e.g. The Studio" autoFocus={m.name === ''} onChange={e => setModel({ name: e.target.value })} />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Size, external</span>
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="w-[84px]"><NumField value={m.widthM} suffix="m" min={0} onChange={v => setModel({ widthM: v ?? 0 })} ariaLabel="Width" /></div>
                                                                <span className="text-slate-400 text-xs">×</span>
                                                                <div className="w-[84px]"><NumField value={m.depthM} suffix="m" min={0} onChange={v => setModel({ depthM: v ?? 0 })} ariaLabel="Depth" /></div>
                                                            </div>
                                                        </div>
                                                        <div className="w-32 space-y-1">
                                                            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Price</span>
                                                            <NumField prefix="£" value={m.price} min={0} onChange={v => setModel({ price: v ?? 0 })} ariaLabel={`${m.name} price`} />
                                                        </div>
                                                        {showCosts && (
                                                            <div className="w-28 space-y-1">
                                                                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Your cost</span>
                                                                <NumField prefix="£" value={m.cost ?? null} allowEmpty placeholder="-" min={0} onChange={v => setModel({ cost: v })} />
                                                            </div>
                                                        )}
                                                        <button onClick={() => setBuilding({ models: b.models.filter(x => x.id !== m.id) })} className="p-2 text-slate-300 hover:text-rose-600" aria-label={`Remove ${m.name}`}><Trash2 size={15} /></button>
                                                    </div>
                                                    <input
                                                        className="w-full bg-transparent text-xs text-slate-500 focus:outline-none focus:bg-slate-50 rounded px-1 -mx-1 py-0.5"
                                                        value={m.includes}
                                                        placeholder="Standard spec on the quote, e.g. French doors and two windows"
                                                        onChange={e => setModel({ includes: e.target.value })}
                                                    />
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <span className="text-[11px] text-slate-500 mr-1">The price already covers:</span>
                                                        {QUOTE_CATEGORIES.filter(c => c.id !== 'building').map(c => {
                                                            const on = m.covers.includes(c.id);
                                                            return (
                                                                <button
                                                                    key={c.id}
                                                                    onClick={() => setModel({ covers: on ? m.covers.filter(x => x !== c.id) : [...m.covers, c.id] })}
                                                                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${on ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'}`}
                                                                    title={on ? `${c.label} in the design shows as Included` : `${c.label} is charged on top`}
                                                                >
                                                                    {on && <Check size={10} className="inline -mt-0.5 mr-0.5" />}{c.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                    <ModelBreakdown
                                                        model={m}
                                                        open={!!openParts[m.id]}
                                                        onToggle={() => setOpenParts(o => ({ ...o, [m.id]: !o[m.id] }))}
                                                        onChange={patch => setModel(patch)}
                                                    />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <button
                                                onClick={() => setBuilding({ models: [...b.models, { id: uid(), name: '', widthM: 4, depthM: 3, price: 0, cost: null, includes: '', covers: b.models[b.models.length - 1]?.covers ?? ['groundworks', 'cladding', 'roof', 'external_doors', 'windows', 'electrics', 'installation'] }] })}
                                                className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:opacity-80"
                                            >
                                                <Plus size={14} /> Add a design
                                            </button>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-500">A bespoke size, per m²</span>
                                                <div className="w-32"><NumField prefix="£" suffix="/m²" value={b.ratePerM2} min={0} onChange={v => setBuilding({ ratePerM2: v ?? 0 })} /></div>
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-slate-400">
                                            What the design has in a covered category - its doors, windows, lights - is listed on the quote as Included.
                                            Upgrades are always charged: a canopy, timber or metal cladding, a green or tiled roof, an apex, roof lanterns and Crittall bars.
                                            So is anything added to a quote by hand.
                                        </p>
                                        {!showMethods && (
                                            <button onClick={() => setShowMethods(true)} className="text-xs text-slate-500 hover:text-accent underline">
                                                Don't sell set designs? Price by size instead - per m², a size table or area bands
                                            </button>
                                        )}
                                    </div>
                                )}

                                {b.method === 'grid' && (
                                    <div className="space-y-3">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <label className={labelClass}>Price table, {vatWord}</label>
                                            <span className="text-[11px] text-slate-400">Width across the front × depth, external. A design takes the next size up.</span>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 overflow-x-auto custom-scrollbar">
                                            <table className="text-sm border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-50">
                                                        <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 whitespace-nowrap">Width ↓ · Depth →</th>
                                                        {grid.depths.map((d, j) => (
                                                            <th key={j} className="px-2 py-2 min-w-[112px]">
                                                                <div className="flex items-center gap-1">
                                                                    <NumField value={d} suffix="m" min={0} onChange={v => setGrid({ depths: grid.depths.map((x, k) => (k === j ? v ?? 0 : x)) })} ariaLabel={`Depth ${j + 1}`} />
                                                                    <button
                                                                        onClick={() => setGrid({ depths: grid.depths.filter((_, k) => k !== j), prices: grid.prices.map(row => row.filter((_, k) => k !== j)) })}
                                                                        className="text-slate-300 hover:text-rose-600" aria-label="Remove depth"
                                                                    ><Trash2 size={13} /></button>
                                                                </div>
                                                            </th>
                                                        ))}
                                                        <th className="px-2">
                                                            <button
                                                                onClick={() => {
                                                                    const last = grid.depths[grid.depths.length - 1] || 3;
                                                                    setGrid({ depths: [...grid.depths, last + 0.5], prices: grid.prices.map(row => [...row, 0]) });
                                                                }}
                                                                className="flex items-center gap-1 text-[11px] font-semibold text-accent whitespace-nowrap"
                                                            ><Plus size={13} /> Depth</button>
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {grid.widths.map((w, i) => (
                                                        <tr key={i} className="border-t border-slate-100">
                                                            <td className="sticky left-0 bg-white px-2 py-1.5">
                                                                <div className="flex items-center gap-1 w-[112px]">
                                                                    <NumField value={w} suffix="m" min={0} onChange={v => setGrid({ widths: grid.widths.map((x, k) => (k === i ? v ?? 0 : x)) })} ariaLabel={`Width ${i + 1}`} />
                                                                    <button
                                                                        onClick={() => setGrid({ widths: grid.widths.filter((_, k) => k !== i), prices: grid.prices.filter((_, k) => k !== i) })}
                                                                        className="text-slate-300 hover:text-rose-600" aria-label="Remove width"
                                                                    ><Trash2 size={13} /></button>
                                                                </div>
                                                            </td>
                                                            {grid.depths.map((_, j) => (
                                                                <td key={j} className="px-2 py-1.5">
                                                                    <NumField prefix="£" value={grid.prices[i]?.[j] || null} allowEmpty placeholder="n/a" min={0} onChange={v => setCell(i, j, v ?? 0)} ariaLabel={`Price ${w} by ${grid.depths[j]}`} />
                                                                </td>
                                                            ))}
                                                            <td />
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <button
                                                onClick={() => {
                                                    const last = grid.widths[grid.widths.length - 1] || 3;
                                                    setGrid({ widths: [...grid.widths, last + 1], prices: [...grid.prices, grid.depths.map(() => 0)] });
                                                }}
                                                className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:opacity-80"
                                            >
                                                <Plus size={14} /> Add a width
                                            </button>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-500">Bigger than the table, or a blank size: per m²</span>
                                                <div className="w-32"><NumField prefix="£" suffix="/m²" value={b.ratePerM2} min={0} onChange={v => setBuilding({ ratePerM2: v ?? 0 })} /></div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {b.method === 'manual' && (
                                    <p className="text-sm text-slate-500 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                                        Each quote starts with the building at £0 for you to price. Everything else is still counted from the design.
                                    </p>
                                )}

                                <div className="space-y-1.5">
                                    <label className={labelClass}>What the building price includes</label>
                                    <textarea
                                        rows={4}
                                        className={inputClass}
                                        value={b.includes}
                                        onChange={e => setBuilding({ includes: e.target.value })}
                                        placeholder="Structure, insulation, standard cladding, roof, interior finish..."
                                    />
                                    <p className="text-[11px] text-slate-400">Printed under the building on the quote, so the customer can see what they are getting.</p>
                                </div>
                            </div>

                            {/* Live examples */}
                            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5 h-fit">
                                <div className={labelClass}>At these prices</div>
                                <p className="text-[11px] text-slate-400 mt-1 mb-4">The building alone, {vatWord}</p>
                                <div className="space-y-2.5">
                                    {b.method === 'models' && b.models.map(m => (
                                        <div key={m.id} className="flex items-baseline justify-between gap-3">
                                            <span className="text-sm text-slate-600 truncate">{m.name || 'Unnamed'} <span className="text-[11px] text-slate-400">{m.widthM} × {m.depthM} m</span></span>
                                            <span className="text-sm font-bold text-accent tabular-nums">{formatGBP(m.price)}</span>
                                        </div>
                                    ))}
                                    {b.method !== 'models' && SAMPLE_SIZES.map(([w, d]) => {
                                        const area = b.basis === 'internal' ? (w - 0.3) * (d - 0.3) : w * d;
                                        return (
                                            <div key={`${w}x${d}`} className="flex items-baseline justify-between">
                                                <span className="text-sm text-slate-600">{w} × {d} m <span className="text-[11px] text-slate-400">({area.toFixed(1)} m²)</span></span>
                                                <span className="text-sm font-bold text-accent tabular-nums">{b.method === 'manual' ? '-' : formatGBP(buildingPrice(book, w, d))}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ---------------- Rates by category ---------------- */}
                {section === 'rates' && (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-bold text-accent">Rates by category</h2>
                                <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                                    <Ruler size={13} className="inline -mt-0.5 text-accent" /> Counted from the design fills its own quantity.{' '}
                                    <Repeat size={13} className="inline -mt-0.5 text-accent" /> On every quote goes on each one.{' '}
                                    <Hand size={13} className="inline -mt-0.5 text-accent" /> By hand waits in the list until you add it.
                                    A price of £0 prints as <em>Included</em>.
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Find an item" className="w-44 bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/25" />
                                </label>
                                <button
                                    onClick={() => setAdjustOpen(v => !v)}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${adjustOpen ? 'bg-accent text-white border-accent' : 'bg-white text-slate-600 border-slate-200 hover:border-accent/40'}`}
                                    title="Put every price, or one category, up or down by a percentage"
                                >
                                    ± Adjust prices
                                </button>
                                <button
                                    onClick={() => setShowCosts(v => !v)}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${showCosts ? 'bg-accent text-white border-accent' : 'bg-white text-slate-600 border-slate-200 hover:border-accent/40'}`}
                                    title="Your cost for each item, to see the margin on a quote. Never shown to a customer."
                                >
                                    {showCosts ? <EyeOff size={14} /> : <Eye size={14} />} {showCosts ? 'Hide costs' : 'Add your costs'}
                                </button>
                            </div>
                        </div>

                        {adjustOpen && (
                            <div className="p-5 rounded-3xl bg-white border-2 border-accent/30 shadow-sm flex flex-wrap items-end gap-4">
                                <div className="space-y-1.5">
                                    <label className={labelClass}>Change</label>
                                    <div>
                                        <Segmented value={adjust.dir} onChange={v => setAdjust(a => ({ ...a, dir: v }))} options={[{ id: 'up', label: 'Increase' }, { id: 'down', label: 'Decrease' }]} />
                                    </div>
                                </div>
                                <div className="space-y-1.5 w-28">
                                    <label className={labelClass}>By</label>
                                    <NumField suffix="%" value={adjust.pct} min={0} onChange={v => setAdjust(a => ({ ...a, pct: v ?? 0 }))} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={labelClass}>Prices</label>
                                    <select className={`${inputClass} w-56`} value={adjust.scope} onChange={e => setAdjust(a => ({ ...a, scope: e.target.value as typeof a.scope }))}>
                                        <option value="all">Everything, building included</option>
                                        {QUOTE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className={labelClass}>Round to</label>
                                    <select className={`${inputClass} w-32`} value={adjust.round} onChange={e => setAdjust(a => ({ ...a, round: Number(e.target.value) }))}>
                                        <option value={0}>The penny</option>
                                        <option value={1}>£1</option>
                                        <option value={5}>£5</option>
                                        <option value={10}>£10</option>
                                        <option value={50}>£50</option>
                                    </select>
                                </div>
                                <Button size="sm" onClick={applyAdjust} disabled={!adjust.pct}>
                                    Apply {adjust.dir === 'up' ? '+' : '-'}{adjust.pct || 0}%
                                </Button>
                                <p className="basis-full text-[11px] text-slate-400">Quotes already made keep their prices. Items at £0 (Included) stay at £0.</p>
                            </div>
                        )}

                        {QUOTE_CATEGORIES.filter(c => c.id !== 'building').map(cat => {
                            const items = book.items.filter(i => i.category === cat.id && (!q || i.name.toLowerCase().includes(q)));
                            if (q && items.length === 0) return null;
                            const isOpen = q ? true : !!open[cat.id];
                            const hints = MEASURE_HINTS[cat.id];
                            return (
                                <div key={cat.id} className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                                    <button
                                        onClick={() => setOpen(o => ({ ...o, [cat.id]: !isOpen }))}
                                        className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-slate-50/60 transition-colors"
                                    >
                                        <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-sm font-bold text-slate-800">{cat.label}</span>
                                            <span className="block text-[11px] text-slate-400">{cat.blurb}</span>
                                        </span>
                                        <span className="text-[11px] font-bold text-slate-400 tabular-nums">{counts[cat.id] || 0} item{counts[cat.id] === 1 ? '' : 's'}</span>
                                    </button>
                                    {isOpen && (
                                        <div className="border-t border-slate-100">
                                            {items.length > 0 && (
                                                <div className={`hidden md:grid gap-3 px-6 py-2 bg-slate-50 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 ${showCosts ? 'grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_90px_120px_110px_32px]' : 'grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_90px_120px_32px]'}`}>
                                                    <span>Item</span><span>Gets on a quote</span><span>Unit</span><span className="text-right">Price, {vatWord}</span>{showCosts && <span className="text-right">Your cost</span>}<span />
                                                </div>
                                            )}
                                            {items.map(i => {
                                                const mode = modeOf(i);
                                                const margin = showCosts && typeof i.cost === 'number' && i.rate > 0 ? Math.round(((i.rate - i.cost) / i.rate) * 100) : null;
                                                return (
                                                    <div key={i.id} className={`grid gap-3 px-6 py-3 border-t border-slate-100 items-start ${showCosts ? 'md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_90px_120px_110px_32px]' : 'md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_90px_120px_32px]'}`}>
                                                        <div className="space-y-1 min-w-0">
                                                            <input
                                                                className="w-full bg-transparent text-sm font-semibold text-slate-800 focus:outline-none focus:bg-slate-50 rounded px-1 -mx-1 py-1"
                                                                value={i.name}
                                                                placeholder="Item name"
                                                                autoFocus={i.name === ''}
                                                                onChange={e => setItem(i.id, { name: e.target.value })}
                                                            />
                                                            <input
                                                                className="w-full bg-transparent text-[11px] text-slate-500 focus:outline-none focus:bg-slate-50 rounded px-1 -mx-1 py-0.5"
                                                                value={i.description || ''}
                                                                placeholder="Description on the quote (optional)"
                                                                onChange={e => setItem(i.id, { description: e.target.value })}
                                                            />
                                                        </div>
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="text-accent shrink-0">
                                                                {mode === 'hand' ? <Hand size={14} /> : mode === 'always' ? <Repeat size={14} /> : <Ruler size={14} />}
                                                            </span>
                                                            <select
                                                                className="w-full min-w-0 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/25"
                                                                value={mode}
                                                                onChange={e => {
                                                                    const v = e.target.value as Mode;
                                                                    if (v === 'hand') setItem(i.id, { measure: null, always: false });
                                                                    else if (v === 'always') setItem(i.id, { measure: null, always: true });
                                                                    else setItem(i.id, { measure: v, always: false, unit: MEASURES[v].unit });
                                                                }}
                                                                aria-label="How this item gets onto a quote"
                                                            >
                                                                <option value="hand">Added by hand when needed</option>
                                                                <option value="always">On every quote</option>
                                                                {hints.length > 0 && (
                                                                    <optgroup label="Counted from the design">
                                                                        {hints.map(k => <option key={k} value={k}>{MEASURES[k].label}</option>)}
                                                                    </optgroup>
                                                                )}
                                                                <optgroup label={hints.length ? 'Counted from the design - more' : 'Counted from the design'}>
                                                                    {(Object.keys(MEASURES) as MeasureKey[]).filter(k => !hints.includes(k)).map(k => (
                                                                        <option key={k} value={k}>{MEASURES[k].label}</option>
                                                                    ))}
                                                                </optgroup>
                                                            </select>
                                                        </div>
                                                        <select
                                                            className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/25"
                                                            value={i.unit}
                                                            onChange={e => setItem(i.id, { unit: e.target.value as PriceUnit })}
                                                            aria-label="Unit"
                                                        >
                                                            {(Object.keys(UNIT_LABELS) as PriceUnit[]).map(u => <option key={u} value={u}>{u === 'item' ? 'item (fixed)' : UNIT_LABELS[u]}</option>)}
                                                        </select>
                                                        <div>
                                                            <NumField prefix="£" value={i.rate} min={0} onChange={v => setItem(i.id, { rate: v ?? 0 })} ariaLabel={`${i.name} price`} />
                                                            <span className="block text-right text-[10px] text-slate-400 mt-0.5">{i.rate === 0 ? 'Included' : perUnit(i.unit)}</span>
                                                        </div>
                                                        {showCosts && (
                                                            <div>
                                                                <NumField prefix="£" value={i.cost ?? null} allowEmpty placeholder="-" min={0} onChange={v => setItem(i.id, { cost: v })} ariaLabel={`${i.name} cost`} />
                                                                <span className={`block text-right text-[10px] mt-0.5 ${margin === null ? 'text-slate-300' : margin < 15 ? 'text-rose-500' : 'text-emerald-600'}`}>
                                                                    {margin === null ? 'optional' : `${margin}% margin`}
                                                                </span>
                                                            </div>
                                                        )}
                                                        <button onClick={() => removeItem(i.id)} className="text-slate-300 hover:text-rose-600 transition-colors mt-2 justify-self-end" aria-label={`Remove ${i.name}`}>
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                            {!q && (
                                                <div className="px-6 py-3 border-t border-slate-100">
                                                    <button onClick={() => addItem(cat.id)} className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:opacity-80">
                                                        <Plus size={14} /> Add an item to {cat.label}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </>
                )}

                {/* ---------------- Quote settings ---------------- */}
                {section === 'settings' && (
                    <div className="p-6 md:p-8 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-8">
                        <div>
                            <h2 className="text-xl font-bold text-accent">Quote settings</h2>
                            <p className="text-sm text-slate-500 mt-1">The defaults every new quote starts with. Each quote can still change its own.</p>
                        </div>

                        <div className="grid gap-6 md:grid-cols-2">
                            <div className="space-y-3">
                                <Toggle
                                    on={book.vatRegistered}
                                    onChange={v => setBook({ ...book, vatRegistered: v })}
                                    label="VAT registered"
                                    hint="Adds VAT to the quote total. Off prints the total with no VAT line."
                                />
                                {book.vatRegistered && (
                                    <>
                                        <div className="w-32">
                                            <NumField suffix="%" value={book.vatRate} min={0} onChange={v => setBook({ ...book, vatRate: v ?? 0 })} ariaLabel="VAT rate" />
                                        </div>
                                        <div className="space-y-1.5 pt-1">
                                            <label className={labelClass}>My prices are entered</label>
                                            <div>
                                                <Segmented
                                                    value={book.pricesIncVat ? 'inc' : 'ex'}
                                                    onChange={v => setBook({ ...book, pricesIncVat: v === 'inc' })}
                                                    options={[
                                                        { id: 'ex', label: 'Ex VAT', title: 'VAT is added on top of the total' },
                                                        { id: 'inc', label: 'Inc VAT', title: 'Prices already include VAT; the quote shows the VAT inside the total' },
                                                    ]}
                                                />
                                            </div>
                                            <p className="text-[11px] text-slate-400">Switching this does not change any numbers - only whether they are read as with or without VAT.</p>
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className={labelClass}>Quotes valid for</label>
                                    <NumField suffix="days" value={book.validityDays} min={1} onChange={v => setBook({ ...book, validityDays: Math.round(v ?? 30) })} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={labelClass}>Numbering</label>
                                    <div className="flex gap-2">
                                        <input className={`${inputClass} w-20`} value={book.numberPrefix} onChange={e => setBook({ ...book, numberPrefix: e.target.value.slice(0, 12) })} aria-label="Quote number prefix" />
                                        <NumField value={book.nextNumber} min={1} onChange={v => setBook({ ...book, nextNumber: Math.max(1, Math.round(v ?? 1)) })} ariaLabel="Next quote number" />
                                    </div>
                                    <p className="text-[11px] text-slate-400">Next quote: <span className="font-semibold text-slate-600">{formatQuoteNumber(book)}</span></p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-baseline justify-between">
                                <label className={labelClass}>Payment stages</label>
                                <span className={`text-xs font-bold tabular-nums ${Math.abs(stageSum - 100) < 0.01 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {stageSum}% {Math.abs(stageSum - 100) < 0.01 ? '' : '- should add up to 100%'}
                                </span>
                            </div>
                            <div className="space-y-2">
                                {book.stages.map((s, i) => (
                                    <div key={s.id} className="grid grid-cols-[1fr_110px_32px] gap-3 items-center">
                                        <input className={inputClass} value={s.label} onChange={e => setBook({ ...book, stages: book.stages.map(x => (x.id === s.id ? { ...x, label: e.target.value } : x)) })} aria-label={`Stage ${i + 1}`} />
                                        <NumField suffix="%" value={s.pct} min={0} onChange={v => setBook({ ...book, stages: book.stages.map(x => (x.id === s.id ? { ...x, pct: v ?? 0 } : x)) })} />
                                        <button onClick={() => setBook({ ...book, stages: book.stages.filter(x => x.id !== s.id) })} className="text-slate-300 hover:text-rose-600 justify-self-center" aria-label="Remove stage"><Trash2 size={15} /></button>
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={() => setBook({ ...book, stages: [...book.stages, { id: uid(), label: 'Stage payment', pct: Math.max(0, 100 - stageSum) }] })}
                                className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:opacity-80"
                            >
                                <Plus size={14} /> Add a stage
                            </button>
                        </div>

                        <div className="grid gap-6 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className={labelClass}>Customer sees</label>
                                <div>
                                    <Segmented
                                        value={book.detail}
                                        onChange={v => setBook({ ...book, detail: v })}
                                        options={[
                                            { id: 'itemised', label: 'Every line', title: 'Each item with its quantity and price' },
                                            { id: 'categories', label: 'Category totals', title: 'One price per category, items listed without prices' },
                                            { id: 'total', label: 'Total only', title: 'What is included, and one price' },
                                        ]}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelClass}>Lead time</label>
                                <input className={inputClass} value={book.leadTime} onChange={e => setBook({ ...book, leadTime: e.target.value })} placeholder="Installation typically 6-8 weeks from order" />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className={labelClass}>Opening note</label>
                            <textarea rows={3} className={inputClass} value={book.intro} onChange={e => setBook({ ...book, intro: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Terms</label>
                            <textarea rows={7} className={inputClass} value={book.terms} onChange={e => setBook({ ...book, terms: e.target.value })} />
                            <p className="text-[11px] text-slate-400">Starter wording only - have your own terms checked before you rely on them.</p>
                        </div>

                        <div className="pt-4 border-t border-slate-100">
                            <button
                                onClick={() => {
                                    if (!window.confirm('Replace every rate and setting with the starter UK prices? Your quotes keep the prices they already have.')) return;
                                    setBook({ ...starterPriceBook(), numberPrefix: book.numberPrefix, nextNumber: book.nextNumber }, true);
                                }}
                                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-600 transition-colors"
                            >
                                <RotateCcw size={13} /> Reset to the starter prices
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
