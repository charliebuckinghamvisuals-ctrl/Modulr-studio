import React from 'react';
import { Trees, Upload, Loader2, Trash2, ChevronDown, Pencil } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { describeGarden, setSceneContext, type SceneContext } from '../services/geminiService';

/**
 * "Match my client's garden".
 *
 * Upload a photo of the client's actual garden and the render is built in a
 * garden like it - close-board fence at the right height, the same paving, the
 * same planting character, the neighbour's roofline over the back.
 *
 * The photo is NEVER sent to the renderer and never composited. It is read once
 * into a written brief, and the garden is then rebuilt as CGI from that brief,
 * which is exactly how a visualiser works from site photos. Compositing a
 * render into a real photograph asks the model to solve perspective, scale and
 * sun direction simultaneously, which is why every attempt at it looks wrong.
 *
 * The description is deliberately EDITABLE. A photo cannot be corrected; a
 * sentence can - "the fence is dark grey and there's a shed on the right" is
 * the step that takes a render from close to right, and it is why the brief is
 * text rather than pixels.
 */

const STORE_KEY = 'modulr.sceneContext';

const FIELDS: Array<{ key: keyof SceneContext; label: string; placeholder: string }> = [
    { key: 'boundary',        label: 'Boundary',    placeholder: 'Close-board fence, 1.8m, weathered timber' },
    { key: 'levels',          label: 'Levels',      placeholder: 'Flat lawn, one step up to the patio' },
    { key: 'hardLandscaping', label: 'Paving',      placeholder: 'Grey porcelain slabs by the house' },
    { key: 'planting',        label: 'Planting',    placeholder: 'Mature beech left, shrub border right' },
    { key: 'context',         label: 'Beyond',      placeholder: 'Neighbouring rooflines over the rear fence' },
    { key: 'aspect',          label: 'Light',       placeholder: 'West facing, afternoon sun from the right' },
    { key: 'character',       label: 'Character',   placeholder: 'Suburban, established' },
];

const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error('Could not read that file'));
        r.readAsDataURL(file);
    });

/** A garden photo carries far more detail than the description needs, and the
 *  upload is most of the wait. */
const downscale = (src: string, maxEdge = 1024): Promise<string> =>
    new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const longest = Math.max(img.width, img.height);
            if (longest <= maxEdge) return resolve(src);
            const s = maxEdge / longest;
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * s);
            c.height = Math.round(img.height * s);
            const ctx = c.getContext('2d');
            if (!ctx) return resolve(src);
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => resolve(src);
        img.src = src;
    });

export const GardenContextPanel: React.FC = () => {
    const [ctx, setCtx] = React.useState<SceneContext | null>(() => {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    });
    const [open, setOpen] = React.useState(false);
    const [photo, setPhoto] = React.useState<string | null>(null);
    const [notes, setNotes] = React.useState('');
    const [editing, setEditing] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const fileRef = React.useRef<HTMLInputElement>(null);

    // Push into the render service on mount too, so a description restored from
    // a previous session is actually applied rather than only displayed.
    React.useEffect(() => {
        setSceneContext(ctx);
        try {
            if (ctx) localStorage.setItem(STORE_KEY, JSON.stringify(ctx));
            else localStorage.removeItem(STORE_KEY);
        } catch { /* private mode */ }
    }, [ctx]);

    /** Held only until Describe runs. The photo is never sent with a render -
     *  it exists to be read once, then the written brief does the work. */
    const handlePhoto = async (file?: File) => {
        if (!file) return;
        try {
            setPhoto(await downscale(await fileToBase64(file)));
        } catch {
            toast.error('Could not read that image');
        }
    };

    const describe = async () => {
        if (!photo && !notes.trim()) return;
        setBusy(true);
        try {
            const described = await describeGarden(photo || undefined, notes.trim() || undefined);
            setCtx(described);
            setEditing(false);
            toast.success('Garden described - edit anything that is not right');
        } catch (e: any) {
            toast.error(e?.message || 'Could not describe that garden');
        } finally {
            setBusy(false);
        }
    };

    const patch = (key: keyof SceneContext, value: string) =>
        setCtx(prev => ({ ...(prev || {}), [key]: value }));

    const clear = () => { setCtx(null); setEditing(false); setOpen(false); };

    const active = !!ctx && FIELDS.some(f => (ctx as any)[f.key]);

    return (
        <div className="border-t border-slate-200 pt-4 mt-2">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between gap-2 group"
            >
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/60 flex items-center gap-2">
                    <Trees size={14} className="text-secondary" />
                    Client's Garden
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                </span>
                <ChevronDown size={14} className={`text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="mt-3 space-y-3">
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                        Add a photo of your client's garden and the render is built in a garden
                        like theirs. The photo is only read for detail — it is never used in the
                        image itself.
                    </p>

                    <button
                        onClick={() => fileRef.current?.click()}
                        disabled={busy}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-accent/30 text-xs font-bold text-accent hover:bg-accent/5 transition-colors disabled:opacity-50"
                    >
                        {busy
                            ? <><Loader2 size={13} className="animate-spin" /> Reading the garden…</>
                            : <><Upload size={13} /> {photo ? 'Use a different photo' : 'Add garden photo'}</>}
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden"
                        onChange={e => handlePhoto(e.target.files?.[0])} />

                    {photo && (
                        <div className="relative rounded-xl overflow-hidden border border-slate-200">
                            <img src={photo} alt="Client's garden" className="w-full h-20 object-cover" />
                            <button onClick={() => setPhoto(null)}
                                className="absolute top-1 right-1 p-1 rounded-lg bg-slate-900/60 text-white hover:bg-slate-900/80">
                                <Trash2 size={11} />
                            </button>
                        </div>
                    )}

                    {/* Works with a photo, instead of one, or to correct one. */}
                    <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder={photo
                            ? 'Anything the photo misses? e.g. the fence is being replaced with dark grey'
                            : 'Or just describe it: north facing, close-board fence, lawn, small patio…'}
                        className="w-full bg-[#f8fafc] border border-accent/20 focus:border-accent focus:ring-2 focus:ring-accent/15 rounded-xl px-2.5 py-2 text-[11px] text-accent outline-none transition-all placeholder:text-slate-400 min-h-[56px] resize-none"
                    />

                    <button
                        onClick={describe}
                        disabled={busy || (!photo && !notes.trim())}
                        className="w-full py-2.5 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-hover transition-colors disabled:opacity-40"
                    >
                        {busy ? <><Loader2 size={13} className="animate-spin inline mr-1" /> Working…</> : 'Describe this garden'}
                    </button>

                    {active && !editing && (
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1.5">
                            {FIELDS.filter(f => (ctx as any)[f.key]).map(f => (
                                <div key={f.key} className="text-[11px] leading-snug">
                                    <span className="font-bold text-accent/70">{f.label}: </span>
                                    <span className="text-slate-600">{(ctx as any)[f.key]}</span>
                                </div>
                            ))}
                            <div className="flex gap-2 pt-2">
                                <button onClick={() => setEditing(true)}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-accent hover:underline">
                                    <Pencil size={10} /> Edit
                                </button>
                                <button onClick={clear}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-red-500">
                                    <Trash2 size={10} /> Remove
                                </button>
                            </div>
                        </div>
                    )}

                    {editing && (
                        <div className="space-y-2">
                            {FIELDS.map(f => (
                                <div key={f.key}>
                                    <label className="text-[9px] font-bold uppercase tracking-wider text-secondary">{f.label}</label>
                                    <input
                                        value={((ctx as any)?.[f.key]) || ''}
                                        placeholder={f.placeholder}
                                        onChange={e => patch(f.key, e.target.value)}
                                        className="w-full bg-[#f8fafc] border border-accent/20 focus:border-accent focus:ring-2 focus:ring-accent/15 rounded-lg px-2.5 py-2 text-[11px] text-accent outline-none transition-all placeholder:text-slate-400"
                                    />
                                </div>
                            ))}
                            {editing && (
                                <button onClick={() => setEditing(false)}
                                    className="w-full py-2 rounded-lg bg-accent text-white text-[11px] font-bold hover:bg-accent-hover transition-colors">
                                    Done
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
