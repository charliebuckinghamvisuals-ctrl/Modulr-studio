import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
    Film, Upload, Loader2, Lock, Download, RotateCcw, Sparkles,
    MoveRight, ZoomIn, Orbit, Video, Wind, Sun, Users, Aperture,
} from 'lucide-react';
import { DraftingBackground } from '../DraftingBackground';
import { Button } from '../Button';
import { useAuth } from '../../hooks/useAuth';
import { useCredits } from '../../hooks/useCredits';
import { compressImageFile } from '../../hooks/useAppEngine';
import { AppStage, AnimationPreset, AnimationModifier } from '../../types';
import { startAnimation, fetchAnimation } from '../../services/animationService';
import { RENDER_CANVAS } from '../canvasStyles';
import { GenerationProgress } from '../GenerationProgress';

const PRESETS: { id: AnimationPreset; label: string; hint: string; icon: React.ReactNode }[] = [
    { id: 'push_in', label: 'Slow push in', hint: 'Drifts almost imperceptibly closer', icon: <ZoomIn size={16} /> },
    { id: 'pan', label: 'Slow pan', hint: 'Glides sideways at an even pace', icon: <MoveRight size={16} /> },
    { id: 'orbit', label: 'Gentle arc', hint: 'Short arc around the building', icon: <Orbit size={16} /> },
    { id: 'still', label: 'Locked off', hint: 'Camera still, only the scene moves', icon: <Video size={16} /> },
];

const MODIFIERS: { id: AnimationModifier; label: string; icon: React.ReactNode }[] = [
    { id: 'motion_blur', label: 'Motion blur', icon: <Aperture size={14} /> },
    { id: 'breeze', label: 'Gentle breeze', icon: <Wind size={14} /> },
    { id: 'golden_hour', label: 'Golden hour', icon: <Sun size={14} /> },
    { id: 'people', label: 'Distant figure', icon: <Users size={14} /> },
];

/** Roughly what the measured run does: ~45s generating, ~6s finishing. The
 *  messages exist so a minute of waiting reads as progress rather than a hang. */
const STAGES = [
    'Reading your render…',
    'Planning the camera move…',
    'Generating frames…',
    'Rendering motion…',
    'Finishing the clip…',
];

const Gate: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar">
        <DraftingBackground pageName="ANIMATION" />
        <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[150px] pointer-events-none" />
        <div className="flex-1 flex items-center justify-center p-6 md:p-12 relative z-10">
            <div className="max-w-lg w-full text-center p-8 md:p-10 rounded-3xl bg-white border border-slate-200 shadow-sm">
                {children}
            </div>
        </div>
    </div>
);

interface AnimationStudioViewProps {
    onNavigate?: (stage: AppStage) => void;
}

export const AnimationStudioView: React.FC<AnimationStudioViewProps> = ({ onNavigate }) => {
    const { user } = useAuth();
    const {
        canUseAnimation, animationsLeft, animationsLimit, plan,
        loading: planLoading, refreshCredits,
    } = useCredits();

    /** Beta accounts are locked out of animation for cost reasons, not billing
     *  ones. Sending them to a pricing page that refuses payment would be a
     *  dead end, so they get a different explanation below. */
    const isBeta = plan === 'beta' || plan === 'tester';

    const [sourceImage, setSourceImage] = useState<string | null>(null);
    const [sourceName, setSourceName] = useState('');
    const [preset, setPreset] = useState<AnimationPreset>('push_in');
    const [modifiers, setModifiers] = useState<AnimationModifier[]>(['breeze']);
    const [extraPrompt, setExtraPrompt] = useState('');

    const [busy, setBusy] = useState(false);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);

    const fileRef = useRef<HTMLInputElement>(null);

    // Blob URLs are not garbage collected on their own - without this every
    // generation in a session leaks the whole clip.
    useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);

    /**
     * Take the dropped file through the same canvas pass every other tool uses:
     * resized to 1920 and re-encoded as JPEG.
     *
     * Reading the file straight with FileReader and posting the original bytes
     * fails two ways. The API is told the image is image/jpeg, so a PNG is
     * rejected outright as unprocessable - which is what "unable to process
     * image" was. And a 4K PNG base64s to well over the request's 10 MB ceiling,
     * so it arrives truncated even when the type does line up.
     */
    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Choose an image - a PNG or JPEG render.');
            return;
        }
        try {
            const base64 = await compressImageFile(file, 1920);
            setSourceImage(`data:image/jpeg;base64,${base64}`);
            setSourceName(file.name);
            setVideoUrl(null);
        } catch {
            toast.error('Could not read that image. Try re-exporting it as a PNG or JPEG.');
        }
    };

    /** Back to a blank page - source, settings, result. */
    const resetAll = () => {
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        setVideoUrl(null);
        setSourceImage(null);
        setSourceName('');
        setPreset('push_in');
        setModifiers(['breeze']);
        setExtraPrompt('');
        if (fileRef.current) fileRef.current.value = '';
    };

    const toggleModifier = (id: AnimationModifier) =>
        setModifiers(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);

    const handleGenerate = async () => {
        if (!sourceImage) return;
        setBusy(true);
        if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }

        try {
            // Strip the data: prefix. sourceImage is always a JPEG data URL by
            // this point - handleFile puts every upload through the canvas pass.
            const base64 = sourceImage.split(',')[1] || sourceImage;

            const job = await startAnimation({ base64Image: base64, preset, modifiers, extraPrompt });
            const url = await fetchAnimation(job.fileName);

            setVideoUrl(url);
            toast.success(
                job.remaining > 0
                    ? `Animation ready · ${job.remaining} left this month`
                    : 'Animation ready · that was your last one this month'
            );
            refreshCredits();
        } catch (e: any) {
            toast.error(e?.message || 'The animation could not be generated.');
        } finally {
            setBusy(false);
        }
    };

    if (!user) {
        return (
            <Gate>
                <div className="w-14 h-14 mx-auto rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-6">
                    <Film size={24} className="text-accent" />
                </div>
                <h1 className="text-2xl font-bold text-accent tracking-tight mb-3">Animation Studio</h1>
                <p className="text-sm text-slate-600 leading-relaxed mb-8">
                    Turn a finished render into a short cinematic clip - a slow push in, a gentle
                    pan, a breeze through the planting. Sign in to your Business account to use it.
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
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600 mb-3">
                    {isBeta ? 'Not in the beta' : 'Business plan feature'}
                </p>
                <h1 className="text-2xl font-bold text-accent tracking-tight mb-3">
                    {isBeta ? 'Animation Studio is not part of the beta' : 'Animation Studio is part of Business'}
                </h1>
                <p className="text-sm text-slate-600 leading-relaxed mb-8">
                    {isBeta ? (
                        <>
                            Every other studio tool is open to you - this is the one exception.
                            Video generation is expensive to run, so it stays closed while we are
                            in beta. It arrives with the Business plan at launch.
                        </>
                    ) : (
                        <>
                            Turn any finished render into a 10-second cinematic clip for your website,
                            social feeds or client presentations. Included with the Business plan.
                        </>
                    )}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                    {isBeta ? (
                        <Button onClick={() => onNavigate?.(AppStage.RENDER_ENGINE)}>Back to the Render Engine</Button>
                    ) : (
                        <>
                            <Button onClick={() => onNavigate?.(AppStage.PRICING)}>See Business plan</Button>
                            <button
                                onClick={() => onNavigate?.(AppStage.HOME)}
                                className="text-sm text-slate-500 hover:text-accent transition-colors px-3 py-2"
                            >
                                Back to home
                            </button>
                        </>
                    )}
                </div>
            </Gate>
        );
    }

    const outOfAllowance = animationsLeft !== null && animationsLeft <= 0;
    const labelClass = 'text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500';

    return (
        <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar">
            <DraftingBackground pageName="ANIMATION" />
            <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[150px] pointer-events-none" />

            <div className="flex-1 p-6 md:p-12 relative z-10 w-full">
                <div className="max-w-[1400px] mx-auto">

                    <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
                        <div className="space-y-2">
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/5 border border-accent/15 text-accent text-[11px] font-bold uppercase tracking-[0.2em]">
                                <Film size={14} />
                                Animation Studio
                            </div>
                            <h1 className="text-3xl md:text-5xl font-bold text-accent tracking-tight leading-tight">
                                Bring a render to life
                            </h1>
                            <p className="text-slate-600 text-sm max-w-xl">
                                Pick a finished render, choose a camera move, and get a 10-second
                                cinematic clip back - for your site, your socials or a client pitch.
                            </p>
                        </div>

                        {animationsLeft !== null && animationsLimit !== null && (
                            <div className="px-5 py-3 rounded-2xl bg-white border border-slate-200 text-right">
                                <p className={labelClass}>This month</p>
                                <p className="text-2xl font-bold text-accent leading-none mt-1">
                                    {animationsLeft}
                                    <span className="text-sm font-bold text-slate-400"> / {animationsLimit}</span>
                                </p>
                                <p className="text-[11px] text-slate-400 mt-1">resets on the 1st</p>
                            </div>
                        )}
                    </div>

                    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">

                        {/* Controls */}
                        <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-6 h-fit">
                            <div className="space-y-2">
                                <label className={labelClass}>Source render</label>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="hidden"
                                    onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
                                />
                                <button
                                    onClick={() => fileRef.current?.click()}
                                    disabled={busy}
                                    className="w-full rounded-2xl border border-dashed border-slate-300 hover:border-accent/50 transition-colors overflow-hidden disabled:opacity-50"
                                >
                                    {sourceImage ? (
                                        <img src={sourceImage} alt="Selected render" className="w-full aspect-video object-cover" />
                                    ) : (
                                        <div className="py-12 flex flex-col items-center gap-2 text-slate-400">
                                            <Upload size={22} />
                                            <span className="text-xs font-semibold">Choose a render</span>
                                            <span className="text-[10px]">PNG, JPEG or WebP</span>
                                        </div>
                                    )}
                                </button>
                                {sourceName && (
                                    <p className="text-[11px] text-slate-400 truncate" title={sourceName}>{sourceName}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className={labelClass}>Camera move</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {PRESETS.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => setPreset(p.id)}
                                            disabled={busy}
                                            title={p.hint}
                                            className={`p-3 rounded-xl border text-left transition-all disabled:opacity-50 ${
                                                preset === p.id
                                                    ? 'border-accent bg-accent/5 text-accent'
                                                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                                            }`}
                                        >
                                            <div className="mb-1">{p.icon}</div>
                                            <p className="text-xs font-bold leading-tight">{p.label}</p>
                                            <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{p.hint}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className={labelClass}>Add motion</label>
                                <div className="flex flex-wrap gap-2">
                                    {MODIFIERS.map(m => (
                                        <button
                                            key={m.id}
                                            onClick={() => toggleModifier(m.id)}
                                            disabled={busy}
                                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-semibold transition-all disabled:opacity-50 ${
                                                modifiers.includes(m.id)
                                                    ? 'border-accent bg-accent/5 text-accent'
                                                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                                            }`}
                                        >
                                            {m.icon}
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className={labelClass}>Anything else</label>
                                <textarea
                                    rows={3}
                                    disabled={busy}
                                    value={extraPrompt}
                                    onChange={e => setExtraPrompt(e.target.value)}
                                    maxLength={800}
                                    placeholder="e.g. a light mist over the lawn, birds crossing the sky"
                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition disabled:opacity-50"
                                />
                                {/* The model has no negative prompt. Saying what you do not want
                                    reads to it as a request for exactly that. */}
                                <p className="text-[10px] text-slate-400 leading-snug">
                                    Describe what you want to see, not what you don't - this model
                                    reads "no cars" as a request for cars.
                                </p>
                            </div>

                            <Button
                                onClick={handleGenerate}
                                disabled={!sourceImage || busy || outOfAllowance}
                                className="w-full justify-center"
                                icon={busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                            >
                                {busy ? 'Generating…' : outOfAllowance ? 'No animations left' : 'Generate animation'}
                            </Button>

                            <p className="text-[10px] text-slate-400 text-center leading-snug">
                                Takes about a minute. Uses one of your {animationsLimit ?? 15} monthly
                                animations, and is spent as soon as generation begins.
                            </p>

                            {/* Same expectation-setting note as the Render Engine's
                                AI disclaimer, worded for video: drift/hallucination
                                is rare but possible, and the fix is a re-run. */}
                            <p className="text-[9px] text-slate-400 font-medium leading-tight text-center">
                                <span className="font-bold uppercase tracking-widest">AI Disclaimer:</span>{' '}
                                As this is AI-generated video, it can occasionally hallucinate — a detail
                                of the scene may drift mid-clip. If that happens, simply generate again;
                                each run is a fresh take.
                            </p>

                            {/* Full reset, matching the render tools. The one on
                                the finished clip only clears the video; this puts
                                the whole page back to empty. */}
                            {(sourceImage || videoUrl) && !busy && (
                                <button
                                    onClick={resetAll}
                                    className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors text-xs font-semibold"
                                >
                                    <RotateCcw size={14} /> Reset
                                </button>
                            )}
                        </div>

                        {/* Result. Same artboard as every other tool's canvas -
                            the clip is the output here, so it sits on the same
                            surface a render would. */}
                        <div className="flex flex-col gap-4">
                            {videoUrl ? (
                                <>
                                    <div className={RENDER_CANVAS}>
                                        <video
                                            src={videoUrl}
                                            controls
                                            autoPlay
                                            loop
                                            playsInline
                                            className="w-full h-full object-contain"
                                        />
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <p className="text-[11px] text-slate-400">
                                            10 seconds · 720p · carries an invisible SynthID watermark
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }}
                                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:border-slate-300 transition-colors"
                                            >
                                                <RotateCcw size={14} /> Start again
                                            </button>
                                            <a
                                                href={videoUrl}
                                                download="modulr-animation.mp4"
                                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-hover transition-colors"
                                            >
                                                <Download size={14} /> Download
                                            </a>
                                        </div>
                                    </div>
                                </>
                            ) : busy ? (
                                <div className={RENDER_CANVAS}>
                                    <GenerationProgress
                                        stages={STAGES}
                                        expectedSeconds={60}
                                        expectedLabel="about a minute"
                                    />
                                </div>
                            ) : (
                                <div className={`${RENDER_CANVAS} flex-col text-center`}>
                                    <Film size={36} className="text-slate-300 mb-4" />
                                    <p className="text-sm text-slate-500 px-6">
                                        {sourceImage
                                            ? 'Choose a camera move, then generate.'
                                            : 'Pick a render on the left to get started.'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
