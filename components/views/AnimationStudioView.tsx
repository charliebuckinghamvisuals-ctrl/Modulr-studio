import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
    Film, Upload, Loader2, Lock, Download, RotateCcw, Sparkles, Volume2, VolumeX, Clapperboard, Wallet,
} from 'lucide-react';
import { DraftingBackground } from '../DraftingBackground';
import { Button } from '../Button';
import { useAuth } from '../../hooks/useAuth';
import { useCredits, VideoModelInfo } from '../../hooks/useCredits';
import { compressImageFile } from '../../hooks/useAppEngine';
import { AppStage } from '../../types';
import { startAnimation, fetchAnimation, VideoModelKey } from '../../services/animationService';
import { RENDER_CANVAS } from '../canvasStyles';
import { GenerationProgress } from '../GenerationProgress';

/**
 * Animation Studio (redesigned 17 Sep 2026, after Higgsfield's console):
 * pick a model, drop a render, write or pick a prompt, choose length and
 * resolution, see the price, generate. No camera-move tiles and modifier
 * chips any more - the prompt IS the direction, and the presets below are
 * the prompts Charlie tested and liked, ready to edit.
 */
const PROMPT_PRESETS: { id: string; label: string; hint: string; text: string }[] = [
    {
        id: 'showcase', label: 'Showcase', hint: 'Zoom in, then cut to the details',
        text: 'Smooth zoom in. After the zoom in, cut to close-ups of details such as the windows and doors, the cladding and the roof. Soft breeze. Do not add or change anything.',
    },
    {
        id: 'push_in', label: 'Slow push in', hint: 'Drifts almost imperceptibly closer',
        text: 'A slow, steady push in towards the building, almost imperceptible. Soft breeze in the planting. Do not add or change anything.',
    },
    {
        id: 'pan', label: 'Slow pan', hint: 'Glides sideways at an even pace',
        text: 'A slow, level pan across the front of the building at an even pace, the whole building staying in frame. Soft breeze. Do not add or change anything.',
    },
    {
        id: 'arc', label: 'Gentle arc', hint: 'Short arc around the building',
        text: 'A gentle, short arc around the building, keeping it centred and fully in frame. Soft breeze in the planting. Do not add or change anything.',
    },
    {
        id: 'still', label: 'Locked off', hint: 'Camera still, only the scene moves',
        text: 'Camera locked off and perfectly still. Only the scene moves: leaves and grass in a soft breeze, light changing gently. Do not add or change anything.',
    },
];

const STAGES = [
    'Uploading your render…',
    'Planning the shot…',
    'Generating frames…',
    'Rendering motion…',
    'Finishing the clip…',
];

const pounds = (pence: number) => (pence % 100 === 0 ? `£${pence / 100}` : `£${(pence / 100).toFixed(2)}`);

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
        videoCreditsPence, videoModels, includedClipSeconds,
        loading: planLoading, refreshCredits,
    } = useCredits();

    const isBeta = plan === 'beta' || plan === 'tester';

    const [model, setModel] = useState<VideoModelKey>('kling');
    const [sourceImage, setSourceImage] = useState<string | null>(null);
    const [sourceName, setSourceName] = useState('');
    const [prompt, setPrompt] = useState(PROMPT_PRESETS[0].text);
    const [activePreset, setActivePreset] = useState<string | null>(PROMPT_PRESETS[0].id);
    const [duration, setDuration] = useState<number>(5);
    const [resolution, setResolution] = useState<string>('1080p');
    const [sound, setSound] = useState(false);

    const [busy, setBusy] = useState(false);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [lastJob, setLastJob] = useState<{ seconds: number; resolution: string; model: VideoModelKey } | null>(null);

    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);

    const info: VideoModelInfo | undefined = videoModels?.[model];

    // When the model changes, snap length and resolution into its range.
    useEffect(() => {
        if (!info) return;
        setResolution(r => (info.resolutions.includes(r) ? r : info.defaultResolution));
        setDuration(d => Math.min(info.maxSeconds, Math.max(info.minSeconds, d || info.defaultSeconds)));
    }, [model, info]);

    const durations = useMemo(() => {
        if (!info) return [5, 8, 10];
        return [3, 4, 5, 6, 8, 10, 12, 15].filter(s => s >= info.minSeconds && s <= info.maxSeconds);
    }, [info]);

    const pricePence = info ? (info.priceFor?.[resolution]?.[String(duration)] ?? (info.pencePerSecond?.[resolution] ?? 0) * duration) : 0;
    const includedApplies = model === 'kling' && duration <= includedClipSeconds && (animationsLeft ?? 0) > 0;
    const canAfford = includedApplies || videoCreditsPence >= pricePence;

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) { toast.error('Choose an image - a PNG or JPEG render.'); return; }
        try {
            const base64 = await compressImageFile(file, 1920);
            setSourceImage(`data:image/jpeg;base64,${base64}`);
            setSourceName(file.name);
            setVideoUrl(null);
        } catch {
            toast.error('Could not read that image. Try re-exporting it as a PNG or JPEG.');
        }
    };

    const resetAll = () => {
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        setVideoUrl(null);
        setSourceImage(null);
        setSourceName('');
        setPrompt(PROMPT_PRESETS[0].text);
        setActivePreset(PROMPT_PRESETS[0].id);
        if (fileRef.current) fileRef.current.value = '';
    };

    const applyPreset = (id: string) => {
        const p = PROMPT_PRESETS.find(x => x.id === id);
        if (!p) return;
        setPrompt(p.text);
        setActivePreset(id);
    };

    const handleGenerate = async () => {
        if (!sourceImage || !info) return;
        setBusy(true);
        if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }
        try {
            const base64 = sourceImage.split(',')[1] || sourceImage;
            const job = await startAnimation({ base64Image: base64, model, prompt: prompt.trim(), duration, resolution, sound });
            setLastJob({ seconds: job.seconds ?? duration, resolution: job.resolution ?? resolution, model: job.model ?? model });
            refreshCredits();
            const url = await fetchAnimation(job.fileName);
            setVideoUrl(url);
            toast.success(job.charge?.kind === 'credits'
                ? `Clip ready · ${pounds(job.charge.pence)} from your video credits`
                : `Clip ready · ${job.remaining} included clip${job.remaining === 1 ? '' : 's'} left this month`);
            refreshCredits();
        } catch (e: any) {
            if (e?.needsVideoCredits) {
                toast.error(e.message);
                onNavigate?.(AppStage.PRICING);
            } else {
                toast.error(e?.message || 'The animation could not be generated.');
            }
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
                    Turn a finished render into a short cinematic clip. Sign in to your Business account to use it.
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
                    {isBeta ? 'Not in the trial' : 'Business plan feature'}
                </p>
                <h1 className="text-2xl font-bold text-accent tracking-tight mb-3">
                    {isBeta ? 'Animation Studio is not part of the trial' : 'Animation Studio is part of Business'}
                </h1>
                <p className="text-sm text-slate-600 leading-relaxed mb-8">
                    {isBeta
                        ? 'Every other studio tool is open to you - this is the one exception. Video generation costs real money to run, so it comes with the Business plan.'
                        : 'Turn any finished render into a cinematic clip for your website, socials or a client quote. Three clips a month are included with Business, then pay as you go.'}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                    {isBeta ? (
                        <Button onClick={() => onNavigate?.(AppStage.RENDER_ENGINE)}>Back to the Render Engine</Button>
                    ) : (
                        <>
                            <Button onClick={() => onNavigate?.(AppStage.PRICING)}>See Business plan</Button>
                            <button onClick={() => onNavigate?.(AppStage.HOME)} className="text-sm text-slate-500 hover:text-accent transition-colors px-3 py-2">Back to home</button>
                        </>
                    )}
                </div>
            </Gate>
        );
    }

    const labelClass = 'text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500';
    const seg = (active: boolean, disabled = false) => `px-3 py-2 rounded-xl border text-xs font-bold transition-all ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${active ? 'border-accent bg-accent text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white'}`;

    return (
        <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar">
            <DraftingBackground pageName="ANIMATION" />
            <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[150px] pointer-events-none" />

            <div className="flex-1 p-6 md:p-12 relative z-10 w-full">
                <div className="max-w-[1400px] mx-auto">

                    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
                        <div className="space-y-2">
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-none bg-accent/5 border border-accent/15 text-accent text-[11px] font-bold uppercase tracking-[0.2em]">
                                <Film size={14} /> Animation Studio
                            </div>
                            <h1 className="text-3xl md:text-5xl font-bold text-accent tracking-tight leading-tight">Bring a render to life</h1>
                            <p className="text-slate-600 text-sm max-w-xl">Pick a model, drop in a render, say what you want to see. The building stays exactly as drawn.</p>
                        </div>
                        <div className="flex items-stretch gap-3">
                            {animationsLeft !== null && animationsLimit !== null && (
                                <div className="px-5 py-3 rounded-2xl bg-white border border-slate-200 text-right">
                                    <p className={labelClass}>Included this month</p>
                                    <p className="text-2xl font-bold text-accent leading-none mt-1">{animationsLeft}<span className="text-sm font-bold text-slate-400"> / {animationsLimit}</span></p>
                                    <p className="text-[11px] text-slate-400 mt-1">Kling, up to {includedClipSeconds}s</p>
                                </div>
                            )}
                            <button onClick={() => onNavigate?.(AppStage.PRICING)} className="px-5 py-3 rounded-2xl bg-white border border-slate-200 text-right hover:border-accent/40 transition-colors" title="Buy video credits">
                                <p className={labelClass}>Video credits</p>
                                <p className="text-2xl font-bold text-accent leading-none mt-1">{pounds(videoCreditsPence)}</p>
                                <p className="text-[11px] text-slate-400 mt-1 inline-flex items-center gap-1"><Wallet size={11} /> top up</p>
                            </button>
                        </div>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-[440px_1fr]">

                        {/* Input panel */}
                        <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-6 h-fit">

                            {/* Model */}
                            <div className="space-y-2">
                                <label className={labelClass}>Model</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['seedance', 'kling'] as VideoModelKey[]).map(key => {
                                        const m = videoModels?.[key];
                                        const off = !m || !m.available;
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => !off && setModel(key)}
                                                disabled={busy || off}
                                                className={`p-3.5 rounded-2xl border text-left transition-all ${off ? 'opacity-50 cursor-not-allowed' : ''} ${model === key ? 'border-accent bg-accent/5 ring-1 ring-accent/30' : 'border-slate-200 hover:border-slate-300'}`}
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Clapperboard size={14} className={model === key ? 'text-accent' : 'text-slate-400'} />
                                                    <p className="text-sm font-bold text-slate-800">{m?.label ?? (key === 'seedance' ? 'Seedance 2.5' : 'Kling 3.0 Pro')}</p>
                                                </div>
                                                <p className="text-[10px] text-slate-500 leading-snug">{m?.blurb ?? ''}</p>
                                                <p className="text-[10px] font-bold text-accent/80 mt-1.5">
                                                    {off ? 'Coming soon' : `from ${pounds(m!.pencePerSecond[m!.defaultResolution] ?? 0)} a second`}
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Source */}
                            <div className="space-y-2">
                                <label className={labelClass}>Start frame</label>
                                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
                                <button onClick={() => fileRef.current?.click()} disabled={busy} className="w-full rounded-2xl border border-dashed border-slate-300 hover:border-accent/50 transition-colors overflow-hidden disabled:opacity-50">
                                    {sourceImage ? (
                                        <img src={sourceImage} alt="Selected render" className="w-full aspect-video object-cover" />
                                    ) : (
                                        <div className="py-10 flex flex-col items-center gap-2 text-slate-400">
                                            <Upload size={22} />
                                            <span className="text-xs font-semibold">Choose a render</span>
                                            <span className="text-[10px]">PNG, JPEG or WebP</span>
                                        </div>
                                    )}
                                </button>
                                {sourceName && <p className="text-[11px] text-slate-400 truncate" title={sourceName}>{sourceName}</p>}
                            </div>

                            {/* Prompt */}
                            <div className="space-y-2">
                                <label className={labelClass}>Prompt</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {PROMPT_PRESETS.map(p => (
                                        <button key={p.id} onClick={() => applyPreset(p.id)} disabled={busy} title={p.hint}
                                            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all disabled:opacity-50 ${activePreset === p.id ? 'border-accent bg-accent/5 text-accent' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    rows={4}
                                    disabled={busy}
                                    value={prompt}
                                    onChange={e => { setPrompt(e.target.value); setActivePreset(null); }}
                                    maxLength={1200}
                                    placeholder="Say what you want to see. e.g. Smooth zoom in, then cut to close-ups of the doors, the cladding and the roof. Soft breeze."
                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition disabled:opacity-50"
                                />
                                <p className="text-[10px] text-slate-400 leading-snug">Describe what you want to see. The building is locked to your render automatically.</p>
                            </div>

                            {/* Length, resolution, sound */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className={labelClass}>Length</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {durations.map(s => (
                                            <button key={s} onClick={() => setDuration(s)} disabled={busy} className={seg(duration === s)}>{s}s</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className={labelClass}>Resolution</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(info?.resolutions ?? ['1080p']).map(r => (
                                            <button key={r} onClick={() => setResolution(r)} disabled={busy} className={seg(resolution === r)}>{r}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setSound(s => !s)} disabled={busy || !info?.audio} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${sound ? 'border-accent bg-accent/5' : 'border-slate-200 bg-white'} disabled:opacity-50`}>
                                <span className="text-xs font-bold text-slate-700 inline-flex items-center gap-2">{sound ? <Volume2 size={14} className="text-accent" /> : <VolumeX size={14} className="text-slate-400" />} Generate audio</span>
                                <span className={`w-10 h-5 rounded-full relative transition-colors ${sound ? 'bg-accent' : 'bg-slate-300'}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${sound ? 'left-5' : 'left-0.5'}`} /></span>
                            </button>

                            {/* Price and generate */}
                            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex items-center justify-between">
                                <div>
                                    <p className={labelClass}>This clip</p>
                                    <p className="text-lg font-bold text-accent leading-tight mt-0.5">
                                        {includedApplies ? 'Included' : pounds(pricePence)}
                                    </p>
                                </div>
                                <p className="text-[11px] text-slate-500 text-right leading-snug">
                                    {info?.label} · {duration}s · {resolution}{sound ? ' · audio' : ''}<br />
                                    {includedApplies ? `${animationsLeft} included left` : canAfford ? `${pounds(videoCreditsPence - pricePence)} left after` : 'Top up video credits'}
                                </p>
                            </div>

                            <Button
                                onClick={canAfford ? handleGenerate : () => onNavigate?.(AppStage.PRICING)}
                                disabled={!sourceImage || busy || !info?.available || !prompt.trim()}
                                className="w-full justify-center"
                                icon={busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                            >
                                {busy ? 'Generating…' : !canAfford ? 'Buy video credits' : includedApplies ? 'Generate, included' : `Generate for ${pounds(pricePence)}`}
                            </Button>

                            <p className="text-[10px] text-slate-400 text-center leading-snug">
                                Takes one to three minutes. Charged when generation starts; a failed clip is refunded automatically.
                            </p>
                            <p className="text-[9px] text-slate-400 font-medium leading-tight text-center">
                                <span className="font-bold uppercase tracking-widest">AI Disclaimer:</span> AI video can occasionally drift a detail mid-clip. If it does, generate again; each run is a fresh take.
                            </p>

                            {(sourceImage || videoUrl) && !busy && (
                                <button onClick={resetAll} className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors text-xs font-semibold">
                                    <RotateCcw size={14} /> Reset
                                </button>
                            )}
                        </div>

                        {/* Result */}
                        <div className="flex flex-col gap-4">
                            {videoUrl ? (
                                <>
                                    <div className={RENDER_CANVAS}>
                                        <video src={videoUrl} controls autoPlay loop playsInline className="w-full h-full object-contain" />
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <p className="text-[11px] text-slate-400">
                                            {lastJob ? `${lastJob.seconds} seconds · ${lastJob.resolution} · ${videoModels?.[lastJob.model]?.label ?? lastJob.model}` : ''}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:border-slate-300 transition-colors">
                                                <RotateCcw size={14} /> Start again
                                            </button>
                                            <a href={videoUrl} download="modulr-animation.mp4" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-hover transition-colors">
                                                <Download size={14} /> Download
                                            </a>
                                        </div>
                                    </div>
                                </>
                            ) : busy ? (
                                <div className={RENDER_CANVAS}>
                                    <GenerationProgress stages={STAGES} expectedSeconds={120} expectedLabel="one to three minutes" />
                                </div>
                            ) : (
                                <div className={`${RENDER_CANVAS} flex-col text-center`}>
                                    <Film size={36} className="text-slate-300 mb-4" />
                                    <p className="text-sm text-slate-500 px-6">{sourceImage ? 'Write or pick a prompt, then generate.' : 'Drop a render on the left to get started.'}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
