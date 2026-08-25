import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Loader2, CheckCircle2, AlertTriangle, HelpCircle, ArrowRight, Ruler, ShieldCheck } from 'lucide-react';

/**
 * Free public "Do I need planning permission?" checker.
 *
 * Deliberately account-free: it answers a question every garden room buyer
 * asks, and every answer hands them to NAPC. The endpoint is unauthenticated
 * and strictly rate limited server-side; nothing here touches Firebase.
 */

interface CheckResult {
    verdict: 'likely_permitted_development' | 'likely_needs_permission' | 'unclear';
    headline: string;
    reasons: string[];
    caveats: string[];
    napcNote: string;
}

const VERDICT_STYLES: Record<CheckResult['verdict'], { label: string; icon: React.ReactNode; bg: string; text: string }> = {
    likely_permitted_development: {
        label: 'Likely Permitted Development',
        icon: <CheckCircle2 size={22} />,
        bg: 'bg-emerald-50 border-emerald-200',
        text: 'text-emerald-700',
    },
    likely_needs_permission: {
        label: 'Likely Needs Planning Permission',
        icon: <AlertTriangle size={22} />,
        bg: 'bg-amber-50 border-amber-200',
        text: 'text-amber-700',
    },
    unclear: {
        label: 'It Depends - Get Advice',
        icon: <HelpCircle size={22} />,
        bg: 'bg-slate-50 border-slate-200',
        text: 'text-slate-700',
    },
};

export const PlanningCheckerView: React.FC = () => {
    const [form, setForm] = useState({
        widthM: '', depthM: '', heightM: '', boundaryM: '',
        description: '', isHouse: true, designatedLand: false,
        forwardOfHouse: false, use: 'incidental',
    });
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<CheckResult | null>(null);

    const field = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [k]: e.target.value }));

    const runCheck = async () => {
        if (!form.widthM || !form.depthM || !form.heightM || !form.boundaryM || !form.description.trim()) {
            toast.error('Fill in all the dimensions and a short description first.');
            return;
        }
        setLoading(true);
        setResult(null);
        try {
            const res = await fetch('/api/public/planning-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'The checker could not run.');
            setResult(data.result);
        } catch (e: any) {
            toast.error(e?.message || 'The checker could not run just now.');
        } finally {
            setLoading(false);
        }
    };

    const inputClass = 'w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 bg-white';
    const labelClass = 'text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500';

    return (
        <div className="min-h-screen bg-[#f7f8f6] py-16 px-4">
            <div className="max-w-2xl mx-auto">
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-[11px] font-bold uppercase tracking-widest mb-4">
                        <ShieldCheck size={13} /> Free for everyone
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold text-accent tracking-tight mb-3">Quick Planning Check</h1>
                    <p className="text-sm text-slate-500 max-w-md mx-auto">
                        Do I need planning permission? Four numbers and a sentence &mdash; get an
                        instant read against UK permitted development rules.
                    </p>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 space-y-5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {([
                            ['widthM', 'Width (m)', 'e.g. 4'],
                            ['depthM', 'Depth (m)', 'e.g. 3'],
                            ['heightM', 'Max height (m)', 'e.g. 2.5'],
                            ['boundaryM', 'To boundary (m)', 'e.g. 1'],
                        ] as const).map(([k, label, ph]) => (
                            <div key={k} className="space-y-1.5">
                                {/* Fixed label height keeps all four inputs on one line even
                                    when a label wraps at narrow column widths. */}
                                <label className={`${labelClass} block min-h-[2rem] flex items-end`}>{label}</label>
                                <input value={form[k]} onChange={field(k)} inputMode="decimal" placeholder={ph} className={inputClass} />
                            </div>
                        ))}
                    </div>

                    <div className="space-y-1.5">
                        <label className={labelClass}>What is it, and how will it be used?</label>
                        <textarea
                            value={form.description}
                            onChange={field('description')}
                            maxLength={600}
                            placeholder="e.g. A timber garden office at the bottom of the garden, used for working from home a few days a week."
                            className={`${inputClass} h-24 resize-none`}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className={labelClass}>How will it mainly be used?</label>
                        <select
                            value={form.use}
                            onChange={e => setForm(f => ({ ...f, use: e.target.value }))}
                            className={inputClass}
                        >
                            <option value="incidental">Office, gym, studio or hobby room</option>
                            <option value="garage">Garage or carport</option>
                            <option value="sleeping">Guest room / occasional sleeping</option>
                            <option value="annexe">Self-contained annexe (kitchen/bathroom, lived in)</option>
                            <option value="other">Something else</option>
                        </select>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                        <label className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={form.isHouse} onChange={e => setForm(f => ({ ...f, isHouse: e.target.checked }))} className="w-4 h-4 accent-current" />
                            The property is a house (not a flat)
                        </label>
                        <label className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={form.designatedLand} onChange={e => setForm(f => ({ ...f, designatedLand: e.target.checked }))} className="w-4 h-4 accent-current" />
                            Conservation area, AONB or listed building
                        </label>
                        <label className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer sm:col-span-2">
                            <input type="checkbox" checked={form.forwardOfHouse} onChange={e => setForm(f => ({ ...f, forwardOfHouse: e.target.checked }))} className="w-4 h-4 accent-current" />
                            It will sit in front of the house (between the house and the road)
                        </label>
                    </div>

                    <button
                        onClick={runCheck}
                        disabled={loading}
                        className="w-full py-3.5 bg-accent text-white rounded-2xl font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Ruler size={16} />}
                        {loading ? 'Checking against UK planning rules…' : 'Check my building'}
                    </button>
                </div>

                {result && (
                    <div className="mt-8 space-y-4">
                        <div className={`rounded-3xl border p-6 ${VERDICT_STYLES[result.verdict].bg}`}>
                            <div className={`flex items-center gap-2.5 font-bold ${VERDICT_STYLES[result.verdict].text}`}>
                                {VERDICT_STYLES[result.verdict].icon}
                                {VERDICT_STYLES[result.verdict].label}
                            </div>
                            <p className="mt-2 text-sm text-slate-700">{result.headline}</p>
                        </div>

                        {result.reasons.length > 0 && (
                            <div className="bg-white rounded-3xl border border-slate-200 p-6">
                                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Why</h3>
                                <ul className="space-y-2">
                                    {result.reasons.map((r, i) => (
                                        <li key={i} className="text-sm text-slate-600 flex gap-2.5"><span className="text-accent shrink-0">•</span>{r}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {result.caveats.length > 0 && (
                            <div className="bg-white rounded-3xl border border-slate-200 p-6">
                                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Worth knowing</h3>
                                <ul className="space-y-2">
                                    {result.caveats.map((c, i) => (
                                        <li key={i} className="text-sm text-slate-600 flex gap-2.5"><span className="text-amber-500 shrink-0">•</span>{c}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <a
                            href="https://www.napc.uk"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block bg-accent text-white rounded-3xl p-6 hover:opacity-95 transition-opacity"
                        >
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <h3 className="font-bold text-sm mb-1">Want certainty? Talk to NAPC</h3>
                                    <p className="text-xs text-white/80 max-w-md">{result.napcNote}</p>
                                </div>
                                <ArrowRight size={20} className="shrink-0" />
                            </div>
                        </a>

                        <p className="text-[11px] text-slate-400 text-center max-w-md mx-auto">
                            Guidance only, based on the information you entered - not legal advice or a formal
                            determination. Only a Lawful Development Certificate or planning decision settles it.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
