import React, { useEffect, useState } from 'react';
import { Sparkles, X, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

/**
 * One-time "what's new" announcement, shown on the first visit after a
 * release. Keyed by UPDATE_ID + uid in localStorage, so each account sees a
 * given announcement once per browser and new releases just change the id.
 */
const UPDATE_ID = '2026-08-render-accuracy';

const IMPROVEMENTS = [
    {
        title: 'Render accuracy',
        detail: 'We spotted a few anomalies where renders could show windows or doors that weren’t in your design, especially from the 3D Configurator. That’s fixed, and every configurator render is now automatically checked against your exact configuration before you see it.',
    },
    {
        title: 'Sharper, cleaner renders',
        detail: 'Renders are now pin-sharp front to back by default, with a new Camera Effects toggle if you want the photographic depth-of-field look. Every plan now renders on our best engine.',
    },
    {
        title: 'Save to Projects from every tool',
        detail: 'Renders, weather shots, line drawings and 3D designs can now be saved straight into a project folder, existing or new, and reopened later.',
    },
    {
        title: 'Better PDF proposals',
        detail: 'Fixed garbled headings, cleaner floor-plan dimensions, your own price (or no price) on proposals, and a choice of PDF designs in Account → Company Branding.',
    },
];

export const UpdateNotice: React.FC = () => {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!user) return;
        const key = `modulr_update_seen_${UPDATE_ID}_${user.uid}`;
        try {
            if (!localStorage.getItem(key)) setOpen(true);
        } catch { /* storage unavailable - just skip the notice */ }
    }, [user]);

    const dismiss = () => {
        setOpen(false);
        if (user) {
            try { localStorage.setItem(`modulr_update_seen_${UPDATE_ID}_${user.uid}`, '1'); } catch { /* ignore */ }
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="bg-accent px-6 py-5 flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-white/80 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">
                            <Sparkles size={12} /> Update
                        </div>
                        <h2 className="text-white font-bold text-lg leading-snug">Fixes &amp; improvements, live now</h2>
                    </div>
                    <button onClick={dismiss} className="text-white/70 hover:text-white shrink-0 mt-1" aria-label="Close">
                        <X size={18} />
                    </button>
                </div>
                <div className="p-6 space-y-4 max-h-[55vh] overflow-y-auto">
                    <p className="text-xs text-slate-500">
                        Thanks for testing Modulr Studio during the beta. Your feedback drives these directly.
                    </p>
                    {IMPROVEMENTS.map(item => (
                        <div key={item.title} className="flex gap-3">
                            <CheckCircle2 size={16} className="text-accent shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-slate-800">{item.title}</p>
                                <p className="text-xs text-slate-500 leading-relaxed">{item.detail}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="px-6 pb-6">
                    <button
                        onClick={dismiss}
                        className="w-full py-3 bg-accent text-white rounded-2xl text-sm font-bold hover:opacity-90 transition-opacity"
                    >
                        Great, let&rsquo;s go
                    </button>
                </div>
            </div>
        </div>
    );
};
