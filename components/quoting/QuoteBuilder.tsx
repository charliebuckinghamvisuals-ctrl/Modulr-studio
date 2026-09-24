import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
    Plus, Trash2, Ruler, Repeat, FileText, Download, Eye, Send, Check, X, Copy, RefreshCw,
    ChevronDown, BookOpen, Box, AlertTriangle, Loader2, Search, Sparkles, Lock, Undo2, Mail,
    FolderInput, Image as ImageIcon, PenLine,
} from 'lucide-react';
import { Project, ProjectStatus } from '../../types';
import {
    PriceBook, PriceItem, Quote, QuoteLine, QuoteCategoryId, QuoteStatus, QUOTE_CATEGORIES, UNIT_LABELS, PriceUnit,
    buildQuote, buildingLines, quoteTotals, refreshFromDesign, takeoff, hashDesign, lineTotal, lineFromItem,
    formatGBP, formatQuoteNumber, formatQty, uid, sortLines, categoryLabel, MEASURES, perUnit, Measures,
    matchModel, applyCovers, repriceLines,
} from '../../services/quoteEngine';
import { starterPriceBook } from '../../services/priceBookService';
import { makeQuotePdf, quoteFileName } from '../../services/quotePdf';
import { useBranding } from '../../hooks/useBranding';
import { NumField, Segmented, Toggle, labelClass, inputClass } from './fields';
import { Button } from '../Button';

/**
 * The quote for a job, inside its project (Projects > a job > Quote).
 *
 * Built from the company's price book: "From the 3D design" measures the
 * saved design and fills every line it can - building by size, doors by
 * kind, windows, internal walls and doors, cladding and roof upgrades, lights,
 * sanitaryware, kitchen, decking - so the job left is checking it and adding
 * what the drawing cannot show. Each change of mind is a new version; a sent
 * version is locked so what the customer holds is what the record says.
 */

const STATUS_META: Record<QuoteStatus, { label: string; cls: string }> = {
    draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-600' },
    sent: { label: 'Sent', cls: 'bg-amber-100 text-amber-700' },
    accepted: { label: 'Accepted', cls: 'bg-emerald-100 text-emerald-700' },
    declined: { label: 'Declined', cls: 'bg-rose-100 text-rose-700' },
};

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

interface Props {
    project: Project;
    book: PriceBook | null;
    bookLoading: boolean;
    setBook: (b: PriceBook, now?: boolean) => void;
    /** Debounced project write (the same path every project field takes). */
    onChange: (changes: Partial<Project>) => void;
    onStatus: (status: ProjectStatus) => void;
    onOpenPriceBook: () => void;
    onOpenDesigner: () => void;
    /** File a PDF in the project's Proposals folder. */
    onAttachPdf: (file: File) => Promise<void>;
}

export const QuoteBuilder: React.FC<Props> = ({ project, book, bookLoading, setBook, onChange, onStatus, onOpenPriceBook, onOpenDesigner, onAttachPdf }) => {
    const quotes = project.quotes || [];
    const [activeId, setActiveId] = useState<string | null>(quotes[quotes.length - 1]?.id ?? null);
    const quote = quotes.find(q => q.id === activeId) || quotes[quotes.length - 1] || null;
    useEffect(() => { if (!quotes.some(q => q.id === activeId)) setActiveId(quotes[quotes.length - 1]?.id ?? null); }, [quotes.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const { branding } = useBranding();
    const [picker, setPicker] = useState<{ category: QuoteCategoryId | 'all' } | null>(null);
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [busy, setBusy] = useState<null | 'pdf' | 'preview' | 'save' | 'email'>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [factsOpen, setFactsOpen] = useState(false);
    const [wordingOpen, setWordingOpen] = useState(false);

    const design = useMemo(() => (project.scene3d ? takeoff(project.scene3d) : null), [project.scene3d]);
    const totals = useMemo(() => (quote ? quoteTotals(quote) : null), [quote]);
    const images = project.assets.filter(a => a.contentType.startsWith('image/')).sort((a, b) => b.createdAt - a.createdAt);
    useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

    /** Save the quotes and keep the project's value on the current one. */
    const commit = (next: Quote[], extra: Partial<Project> = {}) => {
        const latest = next[next.length - 1];
        const value = latest ? Math.round(quoteTotals(latest).total) : project.estimateValue;
        onChange({ quotes: next, estimateValue: value, ...extra });
    };
    const updateQuote = (patch: Partial<Quote> | ((q: Quote) => Quote)) => {
        if (!quote) return;
        const next = quotes.map(q => (q.id === quote.id ? { ...(typeof patch === 'function' ? patch(q) : { ...q, ...patch }), updatedAt: Date.now() } : q));
        commit(next);
    };

    // ---- no price book, no quote -----------------------------------------
    if (bookLoading && !book) {
        return <div className="flex items-center justify-center py-20 text-slate-500 gap-3"><Loader2 className="animate-spin" size={18} /> <span className="text-sm">Loading your prices…</span></div>;
    }

    if (!book) {
        return (
            <div className="p-8 md:p-10 rounded-3xl bg-white border border-slate-200 shadow-sm text-center">
                <BookOpen size={30} className="mx-auto text-accent/40 mb-4" />
                <h3 className="text-xl font-bold text-accent">First, your prices</h3>
                <p className="text-sm text-slate-500 max-w-lg mx-auto mt-2 mb-6">
                    Quotes are built from your price book: how you price the building, then external doors, windows,
                    internal walls and doors and the rest. Start from typical UK prices and change them to yours - it takes a few minutes, once.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                    <Button onClick={() => { setBook(starterPriceBook(), true); toast.success('Starter prices added - check them in Price book'); }} icon={<Sparkles size={16} />}>
                        Use typical UK prices for now
                    </Button>
                    <Button variant="outline" onClick={onOpenPriceBook} icon={<BookOpen size={16} />}>Set up my price book</Button>
                </div>
            </div>
        );
    }

    const newQuote = (fromDesign: boolean, modelId?: string) => {
        const number = formatQuoteNumber(book);
        const pick = modelId ? book.building.models.find(m => m.id === modelId) ?? null : null;
        let q = buildQuote(book, {
            scene3d: fromDesign ? project.scene3d : null,
            number,
            title: pick ? pick.name : !fromDesign ? (project.name && !/^untitled/i.test(project.name) ? project.name : undefined) : undefined,
        });
        if (pick) {
            // One of the set designs, as it comes: its price, its size, and
            // the every-quote lines it covers shown as Included.
            const areaM2 = Math.round((book.building.basis === 'internal' ? (pick.widthM - 0.3) * (pick.depthM - 0.3) : pick.widthM * pick.depthM) * 10) / 10;
            const size = { areaM2, widthM: pick.widthM, depthM: pick.depthM, modelId: pick.id };
            q = {
                ...q,
                areaM2, widthM: pick.widthM, depthM: pick.depthM, modelId: pick.id,
                spec: [`${pick.widthM} × ${pick.depthM} m`, pick.includes].filter(Boolean).join(' · '),
                lines: sortLines(applyCovers([...buildingLines(book, size), ...q.lines.filter(l => l.source !== 'building')], book, pick)),
            };
        }
        const qModel = book.building.models.find(m => m.id === q.modelId);
        q.imageId = images.find(a => a.kind === 'exterior_render')?.id ?? images[0]?.id ?? (qModel?.imageUrl ? 'model' : null);
        setBook({ ...book, nextNumber: (book.nextNumber || 1) + 1 }, true);
        commit([...quotes, q]);
        setActiveId(q.id);
        toast.success(fromDesign ? `${number} built from the design - check it over` : pick ? `${number}: ${pick.name}` : `${number} started`);
    };

    if (!quote) {
        return (
            <div className="grid gap-4 md:grid-cols-2">
                <button
                    onClick={() => project.scene3d ? newQuote(true) : onOpenDesigner()}
                    className="group text-left p-7 rounded-3xl bg-accent text-white shadow-sm hover:shadow-lg transition-all"
                >
                    <Box size={26} className="mb-5 opacity-80" />
                    <h3 className="text-lg font-bold">Quote from the 3D design</h3>
                    <p className="text-sm text-white/75 mt-1.5 leading-relaxed">
                        {project.scene3d
                            ? `Measures the saved design${design ? ` (${design.spec})` : ''} and prices every door, window, wall and fitting from your price book.`
                            : 'This project has no saved design yet. Design it in the 3D Configurator and use Save Design to add it here - then the quote builds itself.'}
                    </p>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider mt-5">
                        {project.scene3d ? 'Build the quote' : 'Open the 3D Configurator'} →
                    </span>
                </button>
                <button
                    onClick={() => newQuote(false)}
                    className="group text-left p-7 rounded-3xl bg-white border border-slate-200 shadow-sm hover:border-accent/40 hover:shadow-lg transition-all"
                >
                    <PenLine size={26} className="mb-5 text-accent/60" />
                    <h3 className="text-lg font-bold text-accent">Start a blank quote</h3>
                    <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                        Type the size and add items from your price book by hand - for a job you have measured on site or priced on the phone.
                    </p>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider mt-5 text-accent">Start →</span>
                </button>
                {book.building.method === 'models' && book.building.models.length > 0 && (
                    <div className="md:col-span-2 p-6 rounded-3xl bg-white border border-slate-200 shadow-sm">
                        <div className="flex items-baseline justify-between gap-3 mb-4">
                            <h3 className="text-sm font-bold text-accent">Or quote one of your set designs</h3>
                            <button onClick={onOpenPriceBook} className="text-[11px] text-slate-400 hover:text-accent underline">Edit designs</button>
                        </div>
                        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                            {book.building.models.map(m => (
                                <button key={m.id} onClick={() => newQuote(false, m.id)} className="group text-left rounded-2xl border border-slate-200 overflow-hidden hover:border-accent/50 hover:shadow-md transition-all">
                                    <div className="h-24 bg-slate-50 flex items-center justify-center overflow-hidden">
                                        {m.imageUrl ? <img src={m.imageUrl} alt={m.name} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform" /> : <Box size={24} className="text-slate-200" />}
                                    </div>
                                    <div className="p-3">
                                        <div className="text-sm font-bold text-slate-800 truncate group-hover:text-accent">{m.name || 'Unnamed design'}</div>
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span className="text-[11px] text-slate-400">{m.widthM} × {m.depthM} m</span>
                                            <span className="text-sm font-bold text-accent tabular-nums">{formatGBP(m.price)}</span>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ---- the quote ------------------------------------------------------------
    const locked = quote.status !== 'draft';
    const designChanged = !!project.scene3d && !!quote.designHash && hashDesign(project.scene3d) !== quote.designHash;
    const t = totals!;
    const vatWord = t.gross ? 'inc VAT' : 'ex VAT';
    const versions = quotes.filter(q => q.number === quote.number);

    const setLine = (id: string, patch: Partial<QuoteLine>) =>
        updateQuote(q => ({ ...q, lines: q.lines.map(l => (l.id === id ? { ...l, ...patch } : l)) }));
    const removeLine = (id: string) => updateQuote(q => ({ ...q, lines: q.lines.filter(l => l.id !== id) }));
    const addLines = (lines: QuoteLine[]) => updateQuote(q => ({ ...q, lines: sortLines([...q.lines, ...lines]) }));

    const addFromBook = (item: PriceItem) => {
        const measured = item.measure && design ? design.measures[item.measure] || 0 : 0;
        addLines([lineFromItem(item, measured > 0 ? measured : 1, measured > 0 ? 'design' : 'book')]);
        toast.success(`${item.name} added`);
    };
    const addCustom = (category: QuoteCategoryId) => {
        addLines([{ id: uid(), category, name: '', qty: 1, unit: 'each', rate: 0, cost: null, source: 'manual' }]);
        setPicker(null);
    };

    const models = book.building.method === 'models' ? book.building.models : [];
    const model = models.find(m => m.id === quote.modelId) ?? null;

    /** Reprice the building at a new size (and as the set design that size is). */
    const resize = (w: number | null, d: number | null, areaOverride?: number, modelId?: string | null, extra: Partial<Quote> = {}) => {
        const area = areaOverride ?? (w && d ? (book.building.basis === 'internal' ? (w - 0.3) * (d - 0.3) : w * d) : quote.areaM2);
        const rounded = Math.round(area * 10) / 10;
        const nextModel = book.building.method !== 'models' ? null
            : modelId !== undefined ? models.find(m => m.id === modelId) ?? null
            : matchModel(models, w, d);
        updateQuote(q => ({
            ...q,
            widthM: w,
            depthM: d,
            areaM2: rounded,
            modelId: nextModel?.id ?? null,
            ...extra,
            // Design lines are rebuilt too: a different set design covers,
            // or breaks down, different categories.
            lines: repriceLines(q, book, q.designHash ? design : null, { areaM2: rounded, widthM: w, depthM: d, modelId: nextModel?.id ?? null }),
        }));
    };

    /** Price the building as one of the set designs. A quote without a
     *  design takes the model's size too. */
    const chooseModel = (id: string) => {
        const m = models.find(x => x.id === id) ?? null;
        // A title that is just a design's name (or the default) follows the choice.
        const retitle = /^garden room/i.test(quote.title) || !quote.title.trim() || models.some(x => x.name === quote.title);
        const extra: Partial<Quote> = {
            ...(retitle ? { title: m ? m.name : quote.widthM && quote.depthM ? `Garden room, ${quote.widthM.toFixed(1)} × ${quote.depthM.toFixed(1)} m` : 'Garden room' } : {}),
            ...(m && !quote.imageId && m.imageUrl ? { imageId: 'model' } : {}),
        };
        if (m && !quote.designHash) {
            const area = book.building.basis === 'internal' ? (m.widthM - 0.3) * (m.depthM - 0.3) : m.widthM * m.depthM;
            resize(m.widthM, m.depthM, area, m.id, extra);
        } else {
            resize(quote.widthM, quote.depthM, quote.areaM2, m?.id ?? null, extra);
        }
    };

    const setStatus = (status: QuoteStatus) => {
        const now = Date.now();
        updateQuote({ status, sentAt: status === 'sent' ? now : status === 'draft' ? null : quote.sentAt ?? now, decidedAt: status === 'accepted' || status === 'declined' ? now : null });
        if (status === 'sent' && (project.status === 'lead')) onStatus('quoted');
        if (status === 'accepted') { onStatus('won'); toast.success('Accepted - the project is marked Won'); }
        if (status === 'sent') toast.success(`${quote.number} marked as sent`);
        if (status === 'declined' && project.status !== 'lost' && window.confirm('Mark the whole project as lost as well?\n\nChoose Cancel to keep it open - for example if you will send a revised quote.')) onStatus('lost');
    };

    const newVersion = () => {
        const maxV = Math.max(...versions.map(v => v.version));
        const copy: Quote = {
            ...quote,
            id: uid(),
            version: maxV + 1,
            status: 'draft',
            lines: quote.lines.map(l => ({ ...l, id: uid() })),
            stages: quote.stages.map(s => ({ ...s })),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            sentAt: null,
            decidedAt: null,
        };
        commit([...quotes, copy]);
        setActiveId(copy.id);
        toast.success(`Version ${copy.version} started - ${quote.number} v${quote.version} is kept as it was`);
    };

    const deleteQuote = () => {
        if (!window.confirm(`Delete ${quote.number}${quote.version > 1 ? ` v${quote.version}` : ''}? This cannot be undone.`)) return;
        const next = quotes.filter(q => q.id !== quote.id);
        commit(next);
        setActiveId(next[next.length - 1]?.id ?? null);
    };

    const refresh = () => {
        const { quote: next, changed } = refreshFromDesign(quote, book, project.scene3d ?? null);
        updateQuote(next);
        toast.success(changed ? `Quantities updated from the design (${changed} change${changed === 1 ? '' : 's'}). Lines you edited by hand were left alone.` : 'Already matches the design');
    };

    const pdfBlob = async () => {
        const image = quote.imageId === 'model' ? (model?.imageUrl ? { downloadUrl: model.imageUrl } : null) : images.find(a => a.id === quote.imageId);
        return makeQuotePdf({
            quote,
            project: { name: project.name, clientName: project.clientName, clientEmail: project.clientEmail, address: project.address },
            branding,
            heroUrl: image?.downloadUrl ?? null,
        });
    };
    const fileName = quoteFileName(quote, project.clientName);
    const download = async (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    };
    const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
        setBusy(kind);
        try { await fn(); } catch (e: any) { console.error(e); toast.error(e?.message || 'Something went wrong making the PDF.'); } finally { setBusy(null); }
    };

    const byCategory = QUOTE_CATEGORIES
        .map(c => ({ ...c, lines: quote.lines.filter(l => l.category === c.id) }))
        .filter(c => c.lines.length > 0);

    const statusMeta = STATUS_META[quote.status];

    return (
        <div className="space-y-5">
            {/* ---- Header -------------------------------------------------- */}
            <div className="p-5 md:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className="text-xs font-bold text-slate-500 tracking-wide">{quote.number}</span>
                            {versions.length > 1 ? (
                                <select
                                    value={quote.id}
                                    onChange={e => setActiveId(e.target.value)}
                                    className="text-[11px] font-bold text-slate-600 bg-slate-100 rounded-md px-1.5 py-0.5 border-0 focus:ring-2 focus:ring-accent/25"
                                    aria-label="Version"
                                >
                                    {versions.map(v => <option key={v.id} value={v.id}>v{v.version} · {STATUS_META[v.status].label}</option>)}
                                </select>
                            ) : <span className="text-[11px] font-bold text-slate-400">v{quote.version}</span>}
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 ${statusMeta.cls}`}>{statusMeta.label}</span>
                            {quote.sentAt && <span className="text-[11px] text-slate-400">sent {fmtDate(quote.sentAt)} · valid to {fmtDate(quote.sentAt + quote.validDays * 86400000)}</span>}
                            {quotes.length > versions.length && (
                                <select
                                    value=""
                                    onChange={e => e.target.value && setActiveId(e.target.value)}
                                    className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-md px-1.5 py-0.5"
                                    aria-label="Other quotes"
                                >
                                    <option value="">Other quotes…</option>
                                    {quotes.filter(q => q.number !== quote.number).map(q => <option key={q.id} value={q.id}>{q.number} v{q.version}</option>)}
                                </select>
                            )}
                        </div>
                        <input
                            className="w-full text-xl md:text-2xl font-bold text-accent tracking-tight bg-transparent focus:outline-none focus:bg-slate-50 rounded-lg -mx-2 px-2 py-0.5 disabled:bg-transparent"
                            value={quote.title}
                            disabled={locked}
                            onChange={e => updateQuote({ title: e.target.value })}
                            aria-label="Quote title"
                        />
                        {quote.spec && <p className="text-xs text-slate-500 mt-0.5">{quote.spec}</p>}
                    </div>
                    <div className="text-right">
                        <div className={labelClass}>{t.gross || quote.vatRegistered ? 'Total inc VAT' : 'Total'}</div>
                        <div className="text-3xl font-bold text-accent mt-0.5 tabular-nums">{formatGBP(t.total)}</div>
                        {quote.vatRegistered && <div className="text-[11px] text-slate-400 tabular-nums">{formatGBP(t.net)} ex VAT</div>}
                    </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => run('preview', async () => { const b = await pdfBlob(); setPreview(URL.createObjectURL(b)); })} disabled={!!busy} icon={busy === 'preview' ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}>
                        Preview PDF
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => run('pdf', async () => download(await pdfBlob()))} disabled={!!busy} icon={busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}>
                        Download
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => run('save', async () => { await onAttachPdf(new File([await pdfBlob()], fileName, { type: 'application/pdf' })); })} disabled={!!busy} icon={busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <FolderInput size={14} />} title="File this PDF in the project's Proposals folder">
                        Save to project
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy}
                        title="Downloads the PDF and opens an email to the client - attach the PDF and send"
                        icon={busy === 'email' ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                        onClick={() => run('email', async () => {
                            await download(await pdfBlob());
                            const who = project.clientName ? project.clientName.split(' ')[0] : '';
                            const body = `${who ? `Dear ${who},` : 'Hello,'}\n\nPlease find attached our quotation ${quote.number}${quote.version > 1 ? ` (version ${quote.version})` : ''} for your ${quote.title.toLowerCase().startsWith('garden') ? quote.title.toLowerCase() : 'garden room'}, at ${formatGBP(t.total)}${quote.vatRegistered ? ' including VAT' : ''}.\n\nIt is valid for ${quote.validDays} days. Any questions at all, just reply to this email.\n\nKind regards${branding.companyName ? `\n${branding.companyName}` : ''}`;
                            window.location.href = `mailto:${encodeURIComponent(project.clientEmail || '')}?subject=${encodeURIComponent(`Your quotation ${quote.number}${branding.companyName ? ` from ${branding.companyName}` : ''}`)}&body=${encodeURIComponent(body)}`;
                        })}
                    >
                        Email
                    </Button>

                    <span className="flex-1" />

                    {quote.status === 'draft' && (
                        <Button size="sm" onClick={() => setStatus('sent')} icon={<Send size={14} />}>Mark as sent</Button>
                    )}
                    {quote.status === 'sent' && (
                        <>
                            <button onClick={() => setStatus('accepted')} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"><Check size={14} /> Accepted</button>
                            <button onClick={() => setStatus('declined')} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"><X size={14} /> Declined</button>
                        </>
                    )}
                    <button onClick={newVersion} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-accent transition-colors" title="Copy this quote as a new version to change">
                        <Copy size={14} /> New version
                    </button>
                    <button onClick={() => newQuote(!!project.scene3d)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-accent transition-colors" title="A separate quote with its own number - for an alternative option">
                        <Plus size={14} /> New quote
                    </button>
                    <button onClick={deleteQuote} className="p-2 text-slate-300 hover:text-rose-600 transition-colors" aria-label="Delete quote" title="Delete this quote"><Trash2 size={15} /></button>
                </div>
            </div>

            {locked && (
                <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900">
                    <Lock size={16} className="shrink-0" />
                    <p className="text-sm flex-1 min-w-[240px]">
                        This version was {quote.status === 'sent' ? 'sent' : quote.status} {quote.decidedAt ? fmtDate(quote.decidedAt) : quote.sentAt ? fmtDate(quote.sentAt) : ''} and is locked, so it stays exactly what the customer has.
                    </p>
                    <button onClick={newVersion} className="text-xs font-bold text-amber-900 underline">Make a new version to change it</button>
                    <button onClick={() => setStatus('draft')} className="flex items-center gap-1 text-xs text-amber-800/70 hover:text-amber-900"><Undo2 size={13} /> Back to draft</button>
                </div>
            )}

            {designChanged && !locked && (
                <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900">
                    <AlertTriangle size={16} className="shrink-0" />
                    <p className="text-sm flex-1 min-w-[240px]">The 3D design has changed since this quote was measured.</p>
                    <Button size="sm" onClick={refresh} icon={<RefreshCw size={14} />}>Update quantities</Button>
                </div>
            )}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] items-start">
                {/* ---- Lines ------------------------------------------------- */}
                <div className="space-y-4 min-w-0">
                    {design && (
                        <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                            <button onClick={() => setFactsOpen(o => !o)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-50/60">
                                <Ruler size={15} className="text-accent" />
                                <span className="flex-1 text-sm font-semibold text-slate-700">Measured from the 3D design</span>
                                {!locked && quote.designHash && (
                                    <span onClick={e => { e.stopPropagation(); refresh(); }} className="text-[11px] font-semibold text-accent hover:underline mr-2" role="button">Re-measure</span>
                                )}
                                <ChevronDown size={15} className={`text-slate-400 transition-transform ${factsOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {factsOpen && (
                                <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 px-5 pb-4 pt-1">
                                    {design.facts.map(f => (
                                        <div key={f.label} className="flex gap-3 text-sm">
                                            <span className="w-28 shrink-0 text-slate-400">{f.label}</span>
                                            <span className="text-slate-700">{f.value}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {byCategory.map(cat => {
                        const catTotal = cat.lines.filter(l => !l.optional).reduce((s, l) => s + lineTotal(l), 0);
                        const isCollapsed = !!collapsed[cat.id];
                        return (
                            <div key={cat.id} className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                                <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-50/70 border-b border-slate-100">
                                    <button onClick={() => setCollapsed(c => ({ ...c, [cat.id]: !isCollapsed }))} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                                        <ChevronDown size={15} className={`text-slate-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                                        <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-700">{cat.label}</span>
                                        <span className="text-[11px] text-slate-400">{cat.lines.length}</span>
                                    </button>
                                    {!locked && (
                                        <button onClick={() => setPicker({ category: cat.id })} className="flex items-center gap-1 text-[11px] font-semibold text-accent hover:opacity-80"><Plus size={13} /> Add</button>
                                    )}
                                    <span className="text-sm font-bold text-accent tabular-nums w-24 text-right">{formatGBP(catTotal)}</span>
                                </div>

                                {!isCollapsed && (
                                    <>
                                        {cat.id === 'building' && book.building.method === 'models' && (
                                            <div className="flex flex-wrap items-center gap-4 px-5 py-3 border-b border-slate-100">
                                                {model?.imageUrl && <img src={model.imageUrl} alt={model.name} className="w-20 h-14 object-cover rounded-md border border-slate-200" />}
                                                <div className="space-y-1">
                                                    <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Design</span>
                                                    <select
                                                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60"
                                                        value={quote.modelId ?? ''}
                                                        disabled={locked}
                                                        onChange={e => chooseModel(e.target.value)}
                                                        aria-label="Set design"
                                                    >
                                                        <option value="">Bespoke - priced by area</option>
                                                        {models.map(m => <option key={m.id} value={m.id}>{m.name} · {m.widthM} × {m.depthM} m · {formatGBP(m.price)}</option>)}
                                                    </select>
                                                </div>
                                                {model && model.covers.length > 0 && (
                                                    <p className="flex-1 min-w-[200px] text-[11px] text-slate-400 leading-snug">
                                                        Its price covers {model.covers.map(c => categoryLabel(c).toLowerCase()).join(', ')} - those lines from the design show as Included.
                                                    </p>
                                                )}
                                                {!model && quote.widthM && quote.depthM && (
                                                    <p className="flex-1 min-w-[200px] text-[11px] text-amber-600 leading-snug">
                                                        {matchModel(models, quote.widthM, quote.depthM)
                                                            ? 'Priced as a bespoke size, by area.'
                                                            : `${quote.widthM} × ${quote.depthM} m is not one of your set designs, so it is priced by area. Pick the nearest design to price it as that instead.`}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                        {cat.id === 'building' && (
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 border-b border-slate-100 text-xs text-slate-500">
                                                <span className="font-semibold text-slate-600">Size</span>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-24"><NumField value={quote.widthM} suffix="m" allowEmpty placeholder="width" min={0} disabled={locked} onChange={v => resize(v, quote.depthM)} ariaLabel="Width" /></div>
                                                    <span>×</span>
                                                    <div className="w-24"><NumField value={quote.depthM} suffix="m" allowEmpty placeholder="depth" min={0} disabled={locked} onChange={v => resize(quote.widthM, v)} ariaLabel="Depth" /></div>
                                                    <span>=</span>
                                                    <div className="w-24"><NumField value={quote.areaM2} suffix="m²" min={0} disabled={locked} onChange={v => resize(quote.widthM, quote.depthM, v ?? 0)} ariaLabel="Area" /></div>
                                                </div>
                                                <span className="text-slate-400">
                                                    {book.building.basis === 'internal' ? 'internal floor' : 'external footprint'} ·{' '}
                                                    <button onClick={onOpenPriceBook} className="underline hover:text-accent">
                                                        {{ models: 'your set designs', per_m2: 'priced per m²', grid: 'priced from your size table', bands: 'priced by area band', base_plus_m2: 'base + per m²', manual: 'priced per job' }[book.building.method]}
                                                    </button>
                                                </span>
                                            </div>
                                        )}
                                        <div className="hidden md:grid grid-cols-[minmax(0,1fr)_120px_130px_100px_56px] gap-3 px-5 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                                            <span>Item</span><span className="text-right">Qty</span><span className="text-right">Price, {vatWord}</span><span className="text-right">Amount</span><span />
                                        </div>
                                        {cat.lines.map(l => (
                                            <LineRow
                                                key={l.id}
                                                line={l}
                                                locked={locked}
                                                measured={l.measure && design ? design.measures[l.measure] ?? 0 : null}
                                                onChange={patch => setLine(l.id, patch)}
                                                onRemove={() => removeLine(l.id)}
                                            />
                                        ))}
                                        {cat.id === 'building' && quote.includes.trim() && (
                                            <p className="px-5 py-3 text-[11px] text-slate-400 leading-relaxed border-t border-slate-100">
                                                <span className="font-semibold text-slate-500">Includes: </span>{quote.includes}
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })}

                    {!locked && (
                        <div className="flex flex-wrap gap-3">
                            <button onClick={() => setPicker({ category: 'all' })} className="flex-1 min-w-[220px] flex items-center justify-center gap-2 py-4 rounded-3xl border-2 border-dashed border-slate-200 text-sm font-semibold text-slate-500 hover:border-accent/50 hover:text-accent transition-colors">
                                <Plus size={16} /> Add from your price book
                            </button>
                            <button onClick={() => addCustom('extras')} className="flex items-center justify-center gap-2 px-6 py-4 rounded-3xl border-2 border-dashed border-slate-200 text-sm font-semibold text-slate-500 hover:border-accent/50 hover:text-accent transition-colors">
                                <PenLine size={16} /> Custom line
                            </button>
                        </div>
                    )}
                </div>

                {/* ---- Summary ------------------------------------------------ */}
                <div className="space-y-4 xl:sticky xl:top-4">
                    <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-5 space-y-3">
                        <div className={labelClass}>Summary</div>
                        {t.byCategory.map(c => (
                            <div key={c.id} className="flex items-center gap-3 text-sm">
                                <span className="flex-1 text-slate-600 truncate">{c.label}</span>
                                <span className="tabular-nums text-slate-700">{formatGBP(c.total)}</span>
                            </div>
                        ))}
                        <div className="border-t border-slate-100 pt-3 flex items-center gap-3 text-sm">
                            <span className="flex-1 font-semibold text-slate-700">Subtotal{t.gross ? ' (inc VAT)' : ''}</span>
                            <span className="tabular-nums font-semibold">{formatGBP(t.subtotal)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                className="flex-1 min-w-0 bg-transparent text-sm text-slate-600 focus:outline-none focus:bg-slate-50 rounded px-1 -mx-1 disabled:bg-transparent"
                                value={quote.discount.label}
                                disabled={locked}
                                onChange={e => updateQuote({ discount: { ...quote.discount, label: e.target.value } })}
                                aria-label="Discount label"
                            />
                            <Segmented size="sm" value={quote.discount.kind} onChange={v => !locked && updateQuote({ discount: { ...quote.discount, kind: v } })} options={[{ id: 'pct', label: '%' }, { id: 'amount', label: '£' }]} />
                            <div className="w-20"><NumField value={quote.discount.value || null} allowEmpty placeholder="0" min={0} disabled={locked} onChange={v => updateQuote({ discount: { ...quote.discount, value: v ?? 0 } })} ariaLabel="Discount" /></div>
                        </div>
                        {t.discount > 0 && (
                            <div className="flex items-center gap-3 text-sm text-rose-600">
                                <span className="flex-1">Less {quote.discount.label.toLowerCase() || 'discount'}</span>
                                <span className="tabular-nums">- {formatGBP(t.discount)}</span>
                            </div>
                        )}
                        {quote.vatRegistered && (
                            <>
                                <div className="flex items-center gap-3 text-sm">
                                    <span className="flex-1 text-slate-600">Total ex VAT</span>
                                    <span className="tabular-nums">{formatGBP(t.net)}</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm">
                                    <span className="flex-1 text-slate-600">{t.gross ? 'Includes VAT' : 'VAT'} at {quote.vatRate}%</span>
                                    <span className="tabular-nums">{formatGBP(t.vat)}</span>
                                </div>
                            </>
                        )}
                        <div className="flex items-center gap-3 pt-3 border-t-2 border-accent">
                            <span className="flex-1 text-sm font-bold uppercase tracking-[0.12em] text-accent">Total</span>
                            <span className="text-2xl font-bold text-accent tabular-nums">{formatGBP(t.total)}</span>
                        </div>
                        {t.optionalTotal > 0 && (
                            <p className="text-[11px] text-slate-400">Plus {formatGBP(t.optionalTotal)} of optional extras, offered but not in the total.</p>
                        )}
                        {(t.margin !== null || t.costPartial) && (
                            <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Your margin</span>
                                    <span className="text-[10px] text-slate-400">only you see this</span>
                                </div>
                                {t.margin !== null ? (
                                    <div className="flex items-baseline gap-2 mt-1">
                                        <span className={`text-lg font-bold tabular-nums ${t.marginPct !== null && t.marginPct < 15 ? 'text-rose-600' : 'text-emerald-700'}`}>{formatGBP(t.margin)}</span>
                                        <span className="text-xs text-slate-500">{t.marginPct}% of {formatGBP(t.net)} · cost {formatGBP(t.cost || 0)}</span>
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-slate-500 mt-1">Add a cost to every priced item in your price book to see the margin.</p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className={labelClass}>Payments</div>
                            {Math.abs(quote.stages.reduce((s, x) => s + x.pct, 0) - 100) > 0.01 && quote.stages.length > 0 && (
                                <span className="text-[10px] font-bold text-rose-600">adds up to {quote.stages.reduce((s, x) => s + x.pct, 0)}%</span>
                            )}
                        </div>
                        {t.stages.map(s => (
                            <div key={s.id} className="flex items-center gap-2">
                                <input
                                    className="flex-1 min-w-0 bg-transparent text-sm text-slate-600 focus:outline-none focus:bg-slate-50 rounded px-1 -mx-1 disabled:bg-transparent"
                                    value={s.label}
                                    disabled={locked}
                                    onChange={e => updateQuote({ stages: quote.stages.map(x => (x.id === s.id ? { ...x, label: e.target.value } : x)) })}
                                />
                                <div className="w-[72px]"><NumField value={s.pct} suffix="%" min={0} disabled={locked} onChange={v => updateQuote({ stages: quote.stages.map(x => (x.id === s.id ? { ...x, pct: v ?? 0 } : x)) })} /></div>
                                <span className="w-20 text-right text-sm font-semibold tabular-nums">{formatGBP(s.amount)}</span>
                            </div>
                        ))}
                    </div>

                    <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-5 space-y-4">
                        <div className={labelClass}>The customer's PDF</div>
                        <div>
                            <Segmented
                                size="sm"
                                value={quote.detail}
                                onChange={v => !locked && updateQuote({ detail: v })}
                                options={[
                                    { id: 'itemised', label: 'Every line' },
                                    { id: 'categories', label: 'Categories' },
                                    { id: 'total', label: 'Total only' },
                                ]}
                            />
                            <p className="text-[11px] text-slate-400 mt-1.5">
                                {quote.detail === 'itemised' ? 'Each item with its quantity and price.' : quote.detail === 'categories' ? 'One price per category; items listed without prices.' : 'What is included, and one price.'}
                            </p>
                        </div>
                        {(images.length > 0 || !!model?.imageUrl) && (
                            <div className="space-y-1.5">
                                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><ImageIcon size={13} /> Picture at the top</span>
                                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                                    <button
                                        onClick={() => !locked && updateQuote({ imageId: null })}
                                        className={`shrink-0 w-16 h-12 border-2 text-[10px] text-slate-400 ${!quote.imageId ? 'border-accent' : 'border-slate-200'}`}
                                    >None</button>
                                    {model?.imageUrl && (
                                        <button onClick={() => !locked && updateQuote({ imageId: 'model' })} className={`shrink-0 w-16 h-12 border-2 overflow-hidden ${quote.imageId === 'model' ? 'border-accent' : 'border-transparent'}`} title={`${model.name} - from your price book`}>
                                            <img src={model.imageUrl} alt={model.name} className="w-full h-full object-cover" />
                                        </button>
                                    )}
                                    {images.slice(0, 12).map(a => (
                                        <button key={a.id} onClick={() => !locked && updateQuote({ imageId: a.id })} className={`shrink-0 w-16 h-12 border-2 overflow-hidden ${quote.imageId === a.id ? 'border-accent' : 'border-transparent'}`}>
                                            <img src={a.downloadUrl} alt={a.name} className="w-full h-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <span className="text-xs font-semibold text-slate-600">Valid for</span>
                                <NumField value={quote.validDays} suffix="days" min={1} disabled={locked} onChange={v => updateQuote({ validDays: Math.max(1, Math.round(v ?? 30)) })} />
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs font-semibold text-slate-600">VAT</span>
                                <div className="pt-1.5">
                                    <Toggle on={quote.vatRegistered} onChange={v => !locked && updateQuote({ vatRegistered: v })} label={<span className="text-xs">{quote.vatRegistered ? `${quote.vatRate}%` : 'None'}</span>} />
                                </div>
                            </div>
                        </div>
                        <button onClick={() => setWordingOpen(o => !o)} className="flex items-center gap-1.5 text-xs font-semibold text-accent">
                            <ChevronDown size={13} className={`transition-transform ${wordingOpen ? 'rotate-180' : ''}`} /> Wording: note, what's included, terms
                        </button>
                        {wordingOpen && (
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <span className="text-xs font-semibold text-slate-600">Opening note</span>
                                    <textarea rows={3} className={inputClass} disabled={locked} value={quote.intro} onChange={e => updateQuote({ intro: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs font-semibold text-slate-600">What the building includes</span>
                                    <textarea rows={4} className={inputClass} disabled={locked} value={quote.includes} onChange={e => updateQuote({ includes: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs font-semibold text-slate-600">Lead time</span>
                                    <input className={inputClass} disabled={locked} value={quote.leadTime} onChange={e => updateQuote({ leadTime: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs font-semibold text-slate-600">Terms</span>
                                    <textarea rows={6} className={inputClass} disabled={locked} value={quote.terms} onChange={e => updateQuote({ terms: e.target.value })} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {picker && (
                <ItemPicker
                    book={book}
                    initial={picker.category}
                    measures={design?.measures ?? null}
                    onAdd={addFromBook}
                    onCustom={addCustom}
                    onClose={() => setPicker(null)}
                    onOpenPriceBook={onOpenPriceBook}
                />
            )}

            {preview && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 md:p-10" onClick={() => setPreview(null)}>
                    <div className="w-full max-w-4xl h-full bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200">
                            <FileText size={16} className="text-accent" />
                            <span className="flex-1 text-sm font-bold text-slate-700 truncate">{fileName}</span>
                            <a href={preview} download={fileName} className="flex items-center gap-1.5 text-xs font-semibold text-accent"><Download size={14} /> Download</a>
                            <button onClick={() => setPreview(null)} className="p-1.5 text-slate-400 hover:text-slate-700" aria-label="Close preview"><X size={18} /></button>
                        </div>
                        <iframe src={preview} title="Quote preview" className="flex-1 w-full" />
                    </div>
                </div>
            )}
        </div>
    );
};

/** One line of the quote. */
const LineRow: React.FC<{
    line: QuoteLine;
    locked: boolean;
    measured: number | null;
    onChange: (patch: Partial<QuoteLine>) => void;
    onRemove: () => void;
}> = ({ line: l, locked, measured, onChange, onRemove }) => {
    const total = lineTotal(l);
    const fromDesign = l.source === 'design';
    const dim = l.optional || l.included;
    return (
        <div className={`group grid gap-3 px-5 py-3 border-t border-slate-100 first:border-t-0 md:grid-cols-[minmax(0,1fr)_120px_130px_100px_84px] items-start ${l.optional ? 'bg-slate-50/60' : ''}`}>
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <input
                        className={`flex-1 min-w-0 bg-transparent text-sm font-semibold focus:outline-none focus:bg-slate-50 rounded px-1 -mx-1 py-0.5 disabled:bg-transparent ${dim ? 'text-slate-500' : 'text-slate-800'}`}
                        value={l.name}
                        disabled={locked}
                        placeholder="What is it?"
                        autoFocus={l.name === '' && !locked}
                        onChange={e => onChange({ name: e.target.value })}
                    />
                    {fromDesign && (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-accent bg-accent/8 border border-accent/15 px-1.5 py-0.5" title={l.measure ? `Counted from the design: ${MEASURES[l.measure].label}` : 'From the design'}>
                            <Ruler size={10} /> Design
                        </span>
                    )}
                    {l.optional && <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5">Optional</span>}
                </div>
                <input
                    className="w-full bg-transparent text-[11px] text-slate-500 focus:outline-none focus:bg-slate-50 rounded px-1 -mx-1 py-0.5 disabled:bg-transparent"
                    value={l.description || ''}
                    disabled={locked}
                    placeholder={locked ? '' : 'Description (optional)'}
                    onChange={e => onChange({ description: e.target.value })}
                />
            </div>
            <div>
                <div className="flex items-center gap-1">
                    <NumField
                        value={l.qty}
                        min={0}
                        disabled={locked}
                        onChange={v => onChange({ qty: v ?? 0, qtyEdited: fromDesign || l.source === 'building' ? true : l.qtyEdited })}
                        ariaLabel={`${l.name} quantity`}
                    />
                    <select
                        className="bg-transparent text-[11px] text-slate-500 focus:outline-none disabled:opacity-100"
                        value={l.unit}
                        disabled={locked}
                        onChange={e => onChange({ unit: e.target.value as PriceUnit })}
                        aria-label="Unit"
                    >
                        {(Object.keys(UNIT_LABELS) as PriceUnit[]).map(u => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
                    </select>
                </div>
                {l.qtyEdited && measured !== null && measured !== l.qty && !locked && (
                    <button onClick={() => onChange({ qty: measured, qtyEdited: false })} className="text-[10px] text-sky-600 hover:underline mt-0.5" title="Go back to the quantity measured from the design">
                        design says {formatQty({ qty: measured, unit: l.unit })}
                    </button>
                )}
            </div>
            <div>
                <NumField prefix="£" value={l.rate} min={0} disabled={locked} onChange={v => onChange({ rate: v ?? 0, rateEdited: true })} ariaLabel={`${l.name} price`} />
                <span className="block text-right text-[10px] text-slate-400 mt-0.5">{l.rate === 0 ? 'Included' : perUnit(l.unit)}</span>
            </div>
            <div className={`text-right text-sm font-bold tabular-nums pt-1.5 ${l.optional ? 'text-slate-400' : 'text-slate-800'}`}>
                {l.included || l.rate === 0 ? <span className="text-xs font-semibold text-emerald-600" title={l.included ? 'Covered by the price of the design' : undefined}>Included</span> : formatGBP(total, total % 1 !== 0)}
            </div>
            <div className="flex items-center justify-end gap-1 pt-1">
                {!locked && (
                    <>
                        {l.source !== 'building' && (
                            <button
                                onClick={() => onChange({ included: !l.included })}
                                className={`text-[10px] font-bold px-1.5 py-1 border transition-colors ${l.included ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-transparent text-slate-300 hover:text-emerald-600 hover:border-emerald-200 opacity-0 group-hover:opacity-100'}`}
                                title={l.included ? 'Charge for it on top of the building price' : 'Covered by the building price: show it, charge nothing'}
                            >
                                INC
                            </button>
                        )}
                        <button
                            onClick={() => onChange({ optional: !l.optional })}
                            className={`text-[10px] font-bold px-1.5 py-1 border transition-colors ${l.optional ? 'border-violet-300 text-violet-700 bg-violet-50' : 'border-transparent text-slate-300 hover:text-violet-600 hover:border-violet-200 opacity-0 group-hover:opacity-100'}`}
                            title={l.optional ? 'Put it back in the total' : 'Offer as an optional extra, outside the total'}
                        >
                            OPT
                        </button>
                        <button onClick={onRemove} className="text-slate-300 hover:text-rose-600 transition-colors" aria-label={`Remove ${l.name}`}><Trash2 size={15} /></button>
                    </>
                )}
            </div>
        </div>
    );
};

/** Add items from the price book - searchable, by category. */
const ItemPicker: React.FC<{
    book: PriceBook;
    initial: QuoteCategoryId | 'all';
    measures: Measures | null;
    onAdd: (item: PriceItem) => void;
    onCustom: (category: QuoteCategoryId) => void;
    onClose: () => void;
    onOpenPriceBook: () => void;
}> = ({ book, initial, measures, onAdd, onCustom, onClose, onOpenPriceBook }) => {
    const [cat, setCat] = useState<QuoteCategoryId | 'all'>(initial);
    const [q, setQ] = useState('');
    const query = q.trim().toLowerCase();
    const list = book.items.filter(i => (cat === 'all' || i.category === cat) && (!query || `${i.name} ${i.description || ''}`.toLowerCase().includes(query)));
    const cats = QUOTE_CATEGORIES.filter(c => c.id !== 'building' && book.items.some(i => i.category === c.id));

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-[8vh]" onClick={onClose}>
            <div className="w-full max-w-2xl max-h-[80vh] bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-slate-200 space-y-3">
                    <div className="flex items-center gap-3">
                        <Search size={16} className="text-slate-400" />
                        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search your price book…" className="flex-1 text-sm focus:outline-none" />
                        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Close"><X size={18} /></button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {[{ id: 'all' as const, label: 'All' }, ...cats].map(c => (
                            <button key={c.id} onClick={() => setCat(c.id)} className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${cat === c.id ? 'bg-accent text-white border-accent' : 'bg-white text-slate-600 border-slate-200 hover:border-accent/40'}`}>
                                {c.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {list.length === 0 && (
                        <p className="p-8 text-center text-sm text-slate-400">Nothing matches. Add it as a custom line, or to your price book to reuse it.</p>
                    )}
                    {list.map(i => {
                        const measured = i.measure && measures ? measures[i.measure] || 0 : 0;
                        return (
                            <button key={i.id} onClick={() => onAdd(i)} className="w-full flex items-center gap-4 px-5 py-3 border-b border-slate-100 text-left hover:bg-accent/5 transition-colors group">
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-slate-800 truncate">{i.name}</div>
                                    <div className="text-[11px] text-slate-400 truncate">
                                        {categoryLabel(i.category)}{i.description ? ` · ${i.description}` : ''}
                                        {measured > 0 && <span className="text-accent font-semibold"> · design has {formatQty({ qty: measured, unit: i.unit })}</span>}
                                    </div>
                                </div>
                                <span className="text-sm font-bold text-accent tabular-nums whitespace-nowrap">{i.rate === 0 ? 'Included' : `${formatGBP(i.rate, i.rate % 1 !== 0)} ${perUnit(i.unit)}`}</span>
                                <Plus size={16} className="text-slate-300 group-hover:text-accent" />
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50">
                    <button onClick={() => onCustom(cat === 'all' ? 'extras' : cat)} className="flex items-center gap-1.5 text-xs font-semibold text-accent"><PenLine size={14} /> Custom line{cat !== 'all' ? ` in ${categoryLabel(cat)}` : ''}</button>
                    <button onClick={() => { onClose(); onOpenPriceBook(); }} className="text-xs text-slate-500 hover:text-accent underline">Edit price book</button>
                </div>
            </div>
        </div>
    );
};
