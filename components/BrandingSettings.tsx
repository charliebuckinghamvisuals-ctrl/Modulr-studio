import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Grid, Upload } from 'lucide-react';
import { useBranding, BrandingData } from '../hooks/useBranding';
import { PDF_FONTS, pdfFontById, loadPdfFontSample } from '../services/pdfFonts';

/**
 * Company branding for the PDF proposal - set once here, used on every
 * export. "Make sure it's always there based off their account settings,
 * rather than changing it every time you want to export" (Charlie, 23 Sep
 * 2026). The configurator's export dialog reads it through the localStorage
 * mirror useBranding keeps, and only shows it.
 */

/** The configurator's defaults, so an unset field shows what will print. */
const DEFAULT_ACCENT = '#b89b72';

/** Shrink a logo to 1200px PNG. The branding lives in the user's Firestore
 *  document, which caps at 1 MB - a phone photo of a logo would not fit. */
function readLogo(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onerror = () => reject(fr.error);
        fr.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('That file is not an image we can read.'));
            img.onload = () => {
                const k = Math.min(1, 1200 / Math.max(img.width, img.height));
                const c = document.createElement('canvas');
                c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
                resolve(c.toDataURL('image/png'));
            };
            img.src = String(fr.result);
        };
        fr.readAsDataURL(file);
    });
}

const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

/** A text field that saves when typing pauses, not on every keystroke - each
 *  save is a Firestore write. */
const DebouncedField: React.FC<{
    value: string;
    onSave: (v: string) => void;
    multiline?: boolean;
    placeholder?: string;
    className: string;
}> = ({ value, onSave, multiline, placeholder, className }) => {
    const [draft, setDraft] = useState(value);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latest = useRef(value);
    useEffect(() => { if (!timer.current) setDraft(value); }, [value]);
    const change = (v: string) => {
        setDraft(v);
        latest.current = v;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => { timer.current = null; onSave(latest.current); }, 700);
    };
    const flush = () => {
        if (!timer.current) return;
        clearTimeout(timer.current); timer.current = null; onSave(latest.current);
    };
    return multiline
        ? <textarea value={draft} placeholder={placeholder} onChange={e => change(e.target.value)} onBlur={flush} className={className} />
        : <input value={draft} placeholder={placeholder} onChange={e => change(e.target.value)} onBlur={flush} className={className} />;
};

const ColourField: React.FC<{ label: string; value: string; onSave: (v: string) => void }> = ({ label, value, onSave }) => {
    const [text, setText] = useState(value);
    useEffect(() => setText(value), [value]);
    return (
        <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/40 pl-1">{label}</label>
            <div className="flex items-center gap-3">
                <input
                    type="color"
                    value={value}
                    onChange={e => onSave(e.target.value)}
                    className="w-12 h-12 rounded-xl border border-border cursor-pointer bg-transparent"
                />
                <input
                    type="text"
                    value={text}
                    onChange={e => { setText(e.target.value); if (isHex(e.target.value)) onSave(e.target.value); }}
                    className="w-32 px-4 py-2 rounded-xl bg-slate-50 border border-border outline-none focus:ring-2 focus:ring-accent/30 text-sm font-bold uppercase"
                />
            </div>
        </div>
    );
};

export const BrandingSettings: React.FC = () => {
    const { branding, setBranding } = useBranding();
    const font = pdfFontById(branding.pdfFont);
    const primary = isHex(branding.primaryColor) ? branding.primaryColor : '#3b4d4a';
    const accent = branding.secondaryColor && isHex(branding.secondaryColor) ? branding.secondaryColor : DEFAULT_ACCENT;

    // Arriving from the PDF export's "Edit in Account settings" link.
    useEffect(() => {
        if (window.location.hash !== '#branding') return;
        // Scroll the page's own scroller only: scrollIntoView also scrolls the
        // window, which pushed the whole app shell up off the screen.
        const t = setTimeout(() => {
            const el = document.getElementById('branding');
            let box = el?.parentElement || null;
            while (box && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) box = box.parentElement;
            if (!el) return;
            if (box) box.scrollTo({ top: el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 24, behavior: 'smooth' });
            else {
                // The page scrolls as a whole, under the sticky site bar.
                const bar = document.querySelector('nav')?.getBoundingClientRect().height ?? 0;
                window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - bar - 24, behavior: 'smooth' });
            }
        }, 400);
        return () => clearTimeout(t);
    }, []);

    // Every font is loaded for its own sample in the picker.
    useEffect(() => { PDF_FONTS.forEach(f => loadPdfFontSample(f, '/3d-config/fonts/')); }, []);

    const save = (patch: Partial<BrandingData>) =>
        setBranding(patch).catch(() => toast.error('Branding not saved - check your connection.'));

    const labelCls = 'text-[10px] font-bold uppercase tracking-[0.2em] text-accent/40 pl-1';
    const fieldCls = 'w-full px-4 py-3 rounded-2xl bg-slate-50 border border-border outline-none focus:ring-2 focus:ring-accent/30 transition-all text-sm text-accent';
    const contact = (branding.contactInfo || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 4);

    return (
        <div id="branding" className="space-y-8 scroll-mt-24">
            <div className="flex items-baseline gap-4">
                <h2 className="text-2xl font-bold text-accent tracking-tight">Company Branding</h2>
                <div className="flex-1 h-px bg-border"></div>
            </div>
            <p className="text-sm text-secondary font-medium -mt-4">
                Set once, used on every PDF proposal you export from the 3D Configurator.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-12">
                <div className="space-y-8">
                    {/* Logo */}
                    <div className="space-y-2">
                        <label className={labelCls}>Company logo</label>
                        <div className="flex items-center gap-4">
                            <div className="w-40 h-24 rounded-2xl bg-slate-50 border border-dashed border-border flex items-center justify-center overflow-hidden">
                                {branding.logo
                                    ? <img src={branding.logo} alt="Company logo" className="w-full h-full object-contain p-3" />
                                    : <Grid size={24} className="text-slate-300" />}
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/5 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/10 transition-all cursor-pointer">
                                    <Upload size={13} /> {branding.logo ? 'Replace logo' : 'Upload logo'}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={async e => {
                                            const file = e.target.files?.[0];
                                            e.target.value = '';
                                            if (!file) return;
                                            try { await save({ logo: await readLogo(file) }); }
                                            catch (err: any) { toast.error(err?.message || 'Could not read that logo.'); }
                                        }}
                                    />
                                </label>
                                {branding.logo && (
                                    <button
                                        onClick={() => save({ logo: null })}
                                        className="px-4 py-2 rounded-xl bg-red-50 text-red-500 text-xs font-bold uppercase tracking-widest hover:bg-red-100 transition-all"
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>
                        </div>
                        <p className="text-[11px] text-secondary pl-1">A PNG with a transparent background looks best.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <ColourField label="Brand colour" value={primary} onSave={v => save({ primaryColor: v })} />
                        <ColourField label="Accent colour" value={accent} onSave={v => save({ secondaryColor: v })} />
                    </div>

                    <div className="space-y-2">
                        <label className={labelCls}>Company name</label>
                        <DebouncedField
                            value={branding.companyName || ''}
                            onSave={v => save({ companyName: v.slice(0, 120) })}
                            placeholder="e.g. Kent Bespoke Rooms Ltd"
                            className={fieldCls}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className={labelCls}>Contact details</label>
                        <DebouncedField
                            multiline
                            value={branding.contactInfo || ''}
                            onSave={v => save({ contactInfo: v.slice(0, 600) })}
                            placeholder={'Unit 4, Mill Lane, Kent\n01622 000000\nhello@company.co.uk\nwww.company.co.uk'}
                            className={fieldCls + ' h-32 resize-none'}
                        />
                        <p className="text-[11px] text-secondary pl-1">One item per line - address, phone, email, website.</p>
                    </div>

                    <div className="space-y-2">
                        <label className={labelCls}>Proposal font</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {PDF_FONTS.map(f => {
                                const on = f.id === font.id;
                                return (
                                    <button
                                        key={f.id}
                                        onClick={() => save({ pdfFont: f.id })}
                                        className={`text-left px-3 py-3 rounded-2xl border-2 transition-all ${on ? 'border-accent bg-accent/5' : 'border-border bg-slate-50 hover:border-accent/40'}`}
                                    >
                                        <span className="block text-2xl text-accent leading-none" style={{ fontFamily: f.css }}>Aa</span>
                                        <span className="block text-[11px] font-bold text-primary mt-2 truncate" style={{ fontFamily: f.css }}>{f.label}</span>
                                        <span className="block text-[10px] text-secondary truncate">{f.note}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* A miniature of the proposal's title block, in the chosen branding. */}
                <div className="lg:sticky lg:top-8 h-fit">
                    <label className={labelCls}>Preview</label>
                    <div className="mt-2 aspect-[1.414] w-full rounded-xl border border-border bg-white shadow-sm overflow-hidden flex" style={{ fontFamily: font.css }}>
                        <div className="flex-1 p-3 flex flex-col">
                            <div className="flex-1 border border-slate-200 flex items-end p-2">
                                <div className="w-full h-3/5 border-2 border-slate-700 relative">
                                    <div className="absolute inset-x-0 -bottom-[2px] h-[2px] bg-slate-900" />
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 mt-2">
                                <div className="w-[3px] h-3" style={{ background: accent }} />
                                <span className="text-[8px] font-bold tracking-[0.2em] text-slate-800 uppercase">Front elevation</span>
                                <span className="text-[7px] text-slate-400">1:50</span>
                            </div>
                        </div>
                        <div className="w-[34%] border-l border-slate-300 flex flex-col">
                            <div className="p-2 h-[22%] flex items-center justify-center">
                                {branding.logo
                                    ? <img src={branding.logo} alt="" className="max-w-full max-h-full object-contain" />
                                    : <span className="text-[9px] font-bold text-center" style={{ color: primary }}>{branding.companyName || ''}</span>}
                            </div>
                            <div className="px-2 space-y-0.5">
                                {branding.companyName && branding.logo && <div className="text-[6.5px] font-bold text-slate-800 truncate">{branding.companyName}</div>}
                                {contact.map((c, i) => <div key={i} className="text-[5.5px] text-slate-400 truncate">{c}</div>)}
                            </div>
                            <div className="mx-2 my-1.5 h-px bg-slate-200" />
                            <div className="px-2">
                                <div className="text-[5px] tracking-[0.2em] text-slate-400 uppercase">Project</div>
                                <div className="text-[8px] font-bold text-slate-800">Garden Room</div>
                            </div>
                            <div className="flex-1" />
                            <div className="h-[3px]" style={{ background: accent }} />
                            <div className="h-[22%] px-2 py-1.5 flex flex-col justify-between" style={{ background: primary }}>
                                <span className="text-[5px] tracking-[0.25em] uppercase font-bold" style={{ color: readableOn(primary) }}>Design proposal</span>
                                <span className="text-[15px] font-bold leading-none" style={{ color: readableOn(primary) }}>01</span>
                            </div>
                        </div>
                    </div>
                    <p className="text-[11px] text-secondary mt-3">How each drawing sheet's title block will look.</p>
                </div>
            </div>
        </div>
    );
};

/** Black or white, whichever reads on this colour - as the PDF does it. */
function readableOn(hex: string) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return '#ffffff';
    const [r, g, b] = [1, 2, 3].map(i => parseInt(m[i], 16));
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? '#1c1e20' : '#ffffff';
}
