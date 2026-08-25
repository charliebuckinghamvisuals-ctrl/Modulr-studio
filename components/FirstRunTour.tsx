import React, { useEffect, useState } from 'react';
import { Upload, Sparkles, FolderOpen, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { AppStage } from '../types';

/**
 * Three-step welcome shown once per account on first sign-in. New users land
 * on a homepage with a dozen destinations and no path; this gives them one.
 * Keyed per-uid in localStorage, same pattern as the update notice. The
 * update notice checks this flag and stands down for brand-new accounts, so
 * a first session never opens with two stacked popups.
 */
export const TOUR_KEY_PREFIX = 'modulr_tour_done_';

const STEPS = [
    {
        icon: <Upload size={22} />,
        title: 'Start with any drawing',
        text: 'Upload a line drawing, a SketchUp screenshot or a photo - or design a building from scratch in the 3D Configurator. No file handy? The Render Engine has a built-in sample to try.',
    },
    {
        icon: <Sparkles size={22} />,
        title: 'Render it photoreal',
        text: 'One click turns it into a presentation-grade visual. Every configurator render is automatically checked against your design - doors, windows and roof - before you see it.',
    },
    {
        icon: <FolderOpen size={22} />,
        title: 'Save it to a client project',
        text: 'File renders and 3D designs into project folders, track the quote, and export a branded PDF proposal. Your logo and colours live in Account > Company Branding.',
    },
];

export const FirstRunTour: React.FC<{ onStart: (stage: AppStage) => void }> = ({ onStart }) => {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(0);

    useEffect(() => {
        if (!user) return;
        try {
            if (localStorage.getItem(TOUR_KEY_PREFIX + user.uid)) return;
            // Only genuinely NEW accounts get the tour - an account created
            // within the last hour. Existing users (who simply have no flag
            // yet) know the app; showing them a beginner tour would insult
            // them and bury the release notes behind it.
            const created = user.metadata?.creationTime ? new Date(user.metadata.creationTime).getTime() : 0;
            const isNew = created > 0 && Date.now() - created < 60 * 60 * 1000;
            if (isNew) {
                setOpen(true);
            } else {
                localStorage.setItem(TOUR_KEY_PREFIX + user.uid, '1');
            }
        } catch { /* storage unavailable */ }
    }, [user]);

    const finish = (goRender: boolean) => {
        setOpen(false);
        if (user) {
            try { localStorage.setItem(TOUR_KEY_PREFIX + user.uid, '1'); } catch { /* ignore */ }
        }
        if (goRender) onStart(AppStage.RENDER_ENGINE);
    };

    if (!open) return null;
    const s = STEPS[step];
    const last = step === STEPS.length - 1;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7 text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-4">
                    {s.icon}
                </div>
                <h2 className="text-lg font-bold text-slate-800 mb-2">{s.title}</h2>
                <p className="text-sm text-slate-500 leading-relaxed mb-6">{s.text}</p>

                <div className="flex items-center justify-center gap-1.5 mb-6">
                    {STEPS.map((_, i) => (
                        <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-accent' : 'w-1.5 bg-slate-200'}`} />
                    ))}
                </div>

                <button
                    onClick={() => (last ? finish(true) : setStep(step + 1))}
                    className="w-full py-3 bg-accent text-white rounded-2xl text-sm font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                    {last ? 'Make my first render' : 'Next'} <ArrowRight size={15} />
                </button>
                <button onClick={() => finish(false)} className="mt-3 text-xs font-semibold text-slate-400 hover:text-slate-600">
                    Skip for now
                </button>
            </div>
        </div>
    );
};
