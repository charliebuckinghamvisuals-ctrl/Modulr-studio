import React, { useEffect, useState } from 'react';
import { Sparkles, X, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

/**
 * One-time "what's new" announcement, shown on the first visit after a
 * release. Keyed by UPDATE_ID + uid in localStorage, so each account sees a
 * given announcement once per browser and new releases just change the id.
 */
const UPDATE_ID = '2026-08-28-3d-config-upgrade';

const IMPROVEMENTS = [
    {
        title: 'Real furniture & bathroom models',
        detail: 'The 3D Configurator now places true-to-scale 3D models instead of block placeholders: sofas (including L-shape), armchair, bed, wardrobe, desk, coffee tables, and a full bathroom set with three shower sizes, toilet and vanity unit.',
    },
    {
        title: 'Much easier placing & moving',
        detail: 'Click an object and a live preview follows your cursor - click to drop, R to rotate, Esc to cancel. Objects can no longer land outside the room or sink into the floor, every object gets a rotate handle and quick toolbar, and dragging is smoother. The plan view camera no longer moves while you arrange furniture.',
    },
    {
        title: 'New building options',
        detail: 'Apex glazing for gable roofs (framed or frameless glass), gables with the ridge running front-to-back or side-to-side for annexe-style buildings, solid entrance doors, guttering & downpipes, canopy support posts, and entrance steps.',
    },
    {
        title: 'Glazing polish',
        detail: 'Crittall style now has larger panes with fewer, slimmer bars and an automatic slim frame. Full-height windows lose the sill, new windows appear in sensible positions, and window handles are gone from exteriors.',
    },
    {
        title: 'Camera lens control',
        detail: 'A new Lens slider lets you go wide-angle for dramatic hero shots or telephoto for true-proportion elevations before sending a view to the render engine.',
    },
];

export const UpdateNotice: React.FC = () => {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!user) return;
        const key = `modulr_update_seen_${UPDATE_ID}_${user.uid}`;
        try {
            // A brand-new account has no "before" to compare against -
            // "what's new" is meaningless and would stack on top of the
            // welcome tour. Same age test as the tour, so exactly one of the
            // two popups shows for any given account.
            const created = user.metadata?.creationTime ? new Date(user.metadata.creationTime).getTime() : 0;
            if (created > 0 && Date.now() - created < 60 * 60 * 1000) {
                localStorage.setItem(key, '1');
                return;
            }
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
