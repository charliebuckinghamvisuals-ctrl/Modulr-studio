import React, { useEffect, useState, useRef } from 'react';
import { toast } from 'react-hot-toast';
import {
    FolderOpen, Plus, Trash2, MapPin, User, FileText, Image as ImageIcon,
    Upload, Loader2, ArrowLeft, PoundSterling, Paperclip, Trophy, Lock, Box,
    Share2, Link2Off,
} from 'lucide-react';
import { DraftingBackground } from '../DraftingBackground';
import { Button } from '../Button';
import { ProjectsDashboard } from '../ProjectsDashboard';
import { useAuth } from '../../hooks/useAuth';
import { useCredits } from '../../hooks/useCredits';
import { AppStage, Project, ProjectAssetKind, ProjectStatus } from '../../types';
import {
    listProjects, createProject, updateProject, deleteProject,
    uploadAsset, removeAsset, MAX_ASSET_BYTES,
} from '../../services/projectService';
import { isWon } from '../../services/projectMetrics';
import { setPendingDesign } from '../../services/designHandoff';
import { setCurrentProject } from '../../services/currentProject';

const STATUS_LABELS: Record<ProjectStatus, string> = {
    lead: 'Lead',
    quoted: 'Quoted',
    won: 'Won',
    lost: 'Lost',
    complete: 'Complete',
};

const STATUS_STYLES: Record<ProjectStatus, string> = {
    lead: 'bg-slate-100 text-slate-600',
    quoted: 'bg-amber-100 text-amber-700',
    won: 'bg-emerald-100 text-emerald-700',
    lost: 'bg-rose-100 text-rose-700',
    complete: 'bg-sky-100 text-sky-700',
};

const ASSET_KIND_LABELS: Record<ProjectAssetKind, string> = {
    exterior_render: 'Exterior render',
    interior_render: 'Interior render',
    line_drawing: 'Line drawing',
    floor_plan: 'Floor plan',
    document: 'Document',
    other: 'Other',
};

const formatCurrency = (value: number | null) =>
    value === null || Number.isNaN(value)
        ? '-'
        : new Intl.NumberFormat('en-GB', {
              style: 'currency',
              currency: 'GBP',
              maximumFractionDigits: 0,
          }).format(value);

const formatDate = (ms: number) =>
    new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const pad = (n: number) => String(n).padStart(2, '0');

/** ms -> the yyyy-mm-dd an <input type="date"> expects, in local time. */
const toDateInput = (ms: number | null) => {
    if (ms === null) return '';
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Parsed at midday local rather than midnight UTC: a quote dated the 1st would
 *  otherwise land on the 31st of the previous month west of Greenwich, and drop
 *  into the wrong month's total. */
const fromDateInput = (value: string) =>
    value === '' ? null : new Date(`${value}T12:00:00`).getTime();

/** Shared chrome for the locked states, so a signed-out visitor lands on a page
 *  that looks like the rest of the site rather than a bare message. */
const Gate: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar">
        <DraftingBackground pageName="PROJECTS" />
        <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[150px] pointer-events-none" />
        <div className="flex-1 flex items-center justify-center p-6 md:p-12 relative z-10">
            <div className="max-w-lg w-full text-center p-8 md:p-10 rounded-3xl bg-white border border-slate-200 shadow-sm">
                {children}
            </div>
        </div>
    </div>
);

interface ProjectsViewProps {
    onNavigate?: (stage: AppStage) => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ onNavigate }) => {
    const { user } = useAuth();
    /**
     * The server decides. Deriving entitlement from the plan string here would
     * put the list of entitled plans in a second place, free to drift from the
     * server's - and the flag the Firestore rules enforce comes from the same
     * source, so the button and the write can never disagree.
     */
    const { canUseProjects, loading: planLoading } = useCredits();

    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const [pendingKind, setPendingKind] = useState<ProjectAssetKind>('exterior_render');

    const active = projects.find(p => p.id === activeId) || null;

    // Remember the job being worked on, so Save-to-Project across the tools
    // can offer it first. Only set, never cleared on going back to the list -
    // "the last project I had open" stays the best default.
    useEffect(() => {
        if (active) setCurrentProject({ id: active.id, name: active.name });
    }, [active?.id, active?.name]);

    /**
     * Client sharing. The token is the whole credential (unlisted-link model),
     * so it is generated with real randomness and revoked by clearing it.
     */
    const handleShare = async () => {
        if (!active) return;
        try {
            let token = active.shareToken;
            if (!token) {
                token = crypto.randomUUID().replace(/-/g, '');
                await updateProject(active.id, { shareToken: token });
                setProjects(prev => prev.map(p => (p.id === active.id ? { ...p, shareToken: token } : p)));
            }
            await navigator.clipboard.writeText(`${window.location.origin}/share/${token}`);
            toast.success('Client link copied - text or email it to your customer');
        } catch (e: any) {
            toast.error(e?.message || 'Could not create the share link.');
        }
    };

    const handleUnshare = async () => {
        if (!active) return;
        try {
            await updateProject(active.id, { shareToken: null });
            setProjects(prev => prev.map(p => (p.id === active.id ? { ...p, shareToken: null } : p)));
            toast.success('Sharing disabled - the old link no longer works');
        } catch (e: any) {
            toast.error(e?.message || 'Could not disable sharing.');
        }
    };

    const refresh = async () => {
        try {
            setProjects(await listProjects());
        } catch (e: any) {
            console.error(e);
            toast.error(e?.message || 'Could not load your projects.');
        } finally {
            setLoading(false);
        }
    };

    // Only fetch once the account is known to be entitled. Asking earlier just
    // earns a permission-denied from Firestore and an error toast on a screen
    // that is about to show an upgrade panel anyway.
    useEffect(() => {
        if (user && canUseProjects) refresh();
        else if (!planLoading) setLoading(false);
    }, [user, canUseProjects, planLoading]);

    const handleCreate = async () => {
        try {
            const created = await createProject();
            setProjects(prev => [created, ...prev]);
            setActiveId(created.id);
            toast.success('Project created');
        } catch (e: any) {
            toast.error(e?.message || 'Could not create the project.');
        }
    };

    /**
     * Persist a field change, debounced.
     *
     * Local state updates immediately so typing stays responsive, but the write
     * is deferred. Writing on every keystroke would bill a Firestore write per
     * character - a 40-character address is 40 writes - and would also let a
     * slow response overwrite a newer keystroke.
     *
     * Pending edits are keyed by field so editing two fields quickly doesn't
     * drop the first one's write.
     */
    const pendingWrites = useRef<Record<string, any>>({});
    const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const flush = async () => {
        if (!activeIdRef.current) return;
        const changes = pendingWrites.current;
        pendingWrites.current = {};
        if (Object.keys(changes).length === 0) return;

        setSaving(true);
        try {
            await updateProject(activeIdRef.current, changes);
        } catch (e: any) {
            toast.error(e?.message || 'Change not saved.');
            refresh();
        } finally {
            setSaving(false);
        }
    };

    const activeIdRef = useRef<string | null>(null);
    useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

    // Flush anything outstanding on unmount so navigating away mid-edit does
    // not silently discard the last few characters typed.
    useEffect(() => () => {
        if (flushTimer.current) clearTimeout(flushTimer.current);
        flush();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleFields = (changes: Partial<Project>) => {
        if (!active) return;
        setProjects(prev => prev.map(p => (p.id === active.id ? { ...p, ...changes } : p)));
        Object.assign(pendingWrites.current, changes);
        if (flushTimer.current) clearTimeout(flushTimer.current);
        flushTimer.current = setTimeout(flush, 700);
    };

    const handleField = (field: keyof Project, value: any) =>
        handleFields({ [field]: value } as Partial<Project>);

    /**
     * Change status and keep the two dates the dashboard counts by honest.
     *
     * The dates are stamped here rather than inferred at read time because the
     * user can correct them afterwards - once a date is on the record it is
     * theirs, so nothing re-stamps a field that already has a value.
     */
    const handleStatus = (status: ProjectStatus) => {
        if (!active) return;
        const now = Date.now();
        const changes: Partial<Project> = { status };

        // Leaving Lead implies a price went out - Quoted, Won and Lost all
        // presuppose a quote.
        if (status !== 'lead' && active.quotedAt === null) changes.quotedAt = now;

        if (status === 'won' || status === 'complete') {
            if (active.wonAt === null) changes.wonAt = now;
        } else if (active.wonAt !== null) {
            // Moved back out of Won. Leaving the acceptance date behind would
            // keep the job in won totals for a month it is no longer won in.
            changes.wonAt = null;
        }

        handleFields(changes);
    };

    const handleDelete = async (project: Project) => {
        if (!window.confirm(`Delete "${project.name}" and all ${project.assets.length} attached file(s)? This cannot be undone.`)) return;
        try {
            await deleteProject(project.id);
            setProjects(prev => prev.filter(p => p.id !== project.id));
            if (activeId === project.id) setActiveId(null);
            toast.success('Project deleted');
        } catch (e: any) {
            toast.error(e?.message || 'Could not delete the project.');
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (!files.length || !active) return;

        setUploading(true);
        try {
            for (const file of files) {
                const asset = await uploadAsset(active.id, file, pendingKind);
                setProjects(prev => prev.map(p =>
                    p.id === active.id ? { ...p, assets: [...p.assets, asset] } : p
                ));
            }
            toast.success(files.length > 1 ? `${files.length} files attached` : 'File attached');
        } catch (err: any) {
            toast.error(err?.message || 'Upload failed.');
        } finally {
            setUploading(false);
        }
    };

    const handleRemoveAsset = async (assetId: string) => {
        if (!active) return;
        try {
            await removeAsset(active.id, assetId);
            setProjects(prev => prev.map(p =>
                p.id === active.id ? { ...p, assets: p.assets.filter(a => a.id !== assetId) } : p
            ));
            toast.success('File removed');
        } catch (e: any) {
            toast.error(e?.message || 'Could not remove the file.');
        }
    };

    const inputClass =
        'w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition';
    const labelClass = 'text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500';

    if (!user) {
        return (
            <Gate>
                <div className="w-14 h-14 mx-auto rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-6">
                    <FolderOpen size={24} className="text-accent" />
                </div>
                <h1 className="text-2xl font-bold text-accent tracking-tight mb-3">Projects</h1>
                <p className="text-sm text-slate-600 leading-relaxed mb-8">
                    Keep every client, address, quote value and file with the job it belongs to,
                    and see what you have quoted and won at a glance. Sign in to your Business
                    account to open your directory.
                </p>
                <Button onClick={() => onNavigate?.(AppStage.AUTH)}>Sign in</Button>
            </Gate>
        );
    }

    // Wait for the answer rather than guessing at it - flashing an upgrade
    // screen at a paying subscriber for half a second is worse than a spinner.
    if (planLoading || canUseProjects === null) {
        return (
            <Gate>
                <div className="flex items-center justify-center gap-3 text-slate-500 py-6">
                    <Loader2 className="animate-spin" size={20} />
                    <span className="text-sm">Checking your plan…</span>
                </div>
            </Gate>
        );
    }

    if (!canUseProjects) {
        return (
            <Gate>
                <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-6">
                    <Lock size={22} className="text-amber-600" />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600 mb-3">
                    Included on every paid plan
                </p>
                <h1 className="text-2xl font-bold text-accent tracking-tight mb-3">
                    Projects comes with a subscription
                </h1>
                <p className="text-sm text-slate-600 leading-relaxed mb-8">
                    Store clients, addresses, quote values, renders and documents against every
                    job, and track what you have quoted and won across the year. It is included
                    on Standard and Business, and the renders you save stay on your account
                    rather than in the browser you made them in.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                    <Button onClick={() => onNavigate?.(AppStage.PRICING)}>
                        See plans
                    </Button>
                    <button
                        onClick={() => onNavigate?.(AppStage.HOME)}
                        className="text-sm text-slate-500 hover:text-accent transition-colors px-3 py-2"
                    >
                        Back to home
                    </button>
                </div>
            </Gate>
        );
    }

    return (
        <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar">
            <DraftingBackground pageName="PROJECTS" />
            <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[150px] pointer-events-none" />

            <div className="flex-1 p-6 md:p-12 relative z-10 w-full">
                <div className="max-w-[1400px] mx-auto">

                    {!active && (
                        <>
                            <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
                                <div className="space-y-2">
                                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/5 border border-accent/15 text-accent text-[11px] font-bold uppercase tracking-[0.2em]">
                                        <FolderOpen size={14} />
                                        Project Directory
                                    </div>
                                    <h1 className="text-3xl md:text-5xl font-bold text-accent tracking-tight leading-tight">
                                        Projects
                                    </h1>
                                    <p className="text-slate-600 text-sm max-w-xl">
                                        Every client, address, value and file in one place - so your renders,
                                        plans and quotes live with the job instead of scattered across folders.
                                    </p>
                                </div>
                                <Button onClick={handleCreate} icon={<Plus size={16} />}>
                                    New Project
                                </Button>
                            </div>

                            {loading ? (
                                <div className="flex items-center justify-center py-24 text-slate-500 gap-3">
                                    <Loader2 className="animate-spin" size={20} />
                                    <span className="text-sm">Loading projects…</span>
                                </div>
                            ) : projects.length === 0 ? (
                                <div className="text-center py-24 rounded-3xl bg-white/70 border border-slate-200">
                                    <FolderOpen size={40} className="mx-auto text-slate-300 mb-4" />
                                    <h2 className="text-lg font-bold text-slate-700">No projects yet</h2>
                                    <p className="text-sm text-slate-500 mt-1">
                                        Use New Project, top right, to start collecting renders and documents.
                                    </p>
                                </div>
                            ) : (
                                <>
                                <ProjectsDashboard projects={projects} />

                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {projects.map(project => (
                                        <div
                                            key={project.id}
                                            onClick={() => setActiveId(project.id)}
                                            className="group cursor-pointer p-5 rounded-2xl bg-white border border-slate-200 hover:border-accent/40 hover:shadow-lg transition-all flex flex-col gap-3"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <h3 className="font-bold text-slate-800 leading-snug group-hover:text-accent transition-colors flex items-center gap-2">
                                                    {project.name}
                                                    {project.scene3d && (
                                                        <Box size={13} className="shrink-0 text-accent/60" aria-label="Has a saved 3D design" />
                                                    )}
                                                </h3>
                                                <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${STATUS_STYLES[project.status]}`}>
                                                    {STATUS_LABELS[project.status]}
                                                </span>
                                            </div>

                                            <div className="space-y-1.5 text-xs text-slate-500">
                                                {project.clientName && (
                                                    <div className="flex items-center gap-2">
                                                        <User size={12} /> {project.clientName}
                                                    </div>
                                                )}
                                                {project.address && (
                                                    <div className="flex items-center gap-2">
                                                        <MapPin size={12} /> {project.address}
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2">
                                                    <Paperclip size={12} /> {project.assets.length} file{project.assets.length === 1 ? '' : 's'}
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                                                <span className="text-lg font-bold text-accent">
                                                    {formatCurrency(project.estimateValue)}
                                                </span>
                                                <span className="text-[10px] text-slate-400">
                                                    {formatDate(project.updatedAt)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                </>
                            )}
                        </>
                    )}

                    {active && (
                        <div className="space-y-8">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <button
                                    onClick={() => setActiveId(null)}
                                    className="flex items-center gap-2 text-sm text-slate-600 hover:text-accent transition-colors"
                                >
                                    <ArrowLeft size={16} /> All projects
                                </button>
                                <div className="flex items-center gap-3">
                                    {saving && (
                                        <span className="text-xs text-slate-400 flex items-center gap-1.5">
                                            <Loader2 size={12} className="animate-spin" /> Saving
                                        </span>
                                    )}
                                    <button
                                        onClick={handleShare}
                                        className="flex items-center gap-2 text-sm font-semibold text-accent hover:opacity-80 transition-opacity"
                                        title="Copy a read-only link your customer can open - renders and estimate only, no contact details"
                                    >
                                        <Share2 size={16} /> {active.shareToken ? 'Copy client link' : 'Share with client'}
                                    </button>
                                    {active.shareToken && (
                                        <button
                                            onClick={handleUnshare}
                                            className="flex items-center gap-2 text-sm text-slate-400 hover:text-rose-600 transition-colors"
                                            title="Disable the share link"
                                        >
                                            <Link2Off size={16} />
                                        </button>
                                    )}
                                    {active.scene3d && (
                                        <button
                                            onClick={() => {
                                                if (!setPendingDesign(active.scene3d!)) {
                                                    toast.error('That saved design could not be read.');
                                                    return;
                                                }
                                                onNavigate?.(AppStage.DESIGNER);
                                            }}
                                            className="flex items-center gap-2 text-sm font-semibold text-accent hover:opacity-80 transition-opacity"
                                        >
                                            <Box size={16} /> Open in 3D Designer
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleDelete(active)}
                                        className="flex items-center gap-2 text-sm text-rose-600 hover:text-rose-700 transition-colors"
                                    >
                                        <Trash2 size={16} /> Delete
                                    </button>
                                </div>
                            </div>

                            <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
                                {/* Details */}
                                <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-5 h-fit">
                                    <h2 className="text-lg font-bold text-accent">Project details</h2>

                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Project name</label>
                                        <input
                                            className={inputClass}
                                            value={active.name}
                                            onChange={e => handleField('name', e.target.value)}
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Client name</label>
                                        <input
                                            className={inputClass}
                                            value={active.clientName}
                                            onChange={e => handleField('clientName', e.target.value)}
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Client email</label>
                                        <input
                                            type="email"
                                            className={inputClass}
                                            value={active.clientEmail}
                                            onChange={e => handleField('clientEmail', e.target.value)}
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Address</label>
                                        <input
                                            className={inputClass}
                                            value={active.address}
                                            onChange={e => handleField('address', e.target.value)}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className={labelClass}>Quote value (£)</label>
                                            <input
                                                type="number"
                                                min={0}
                                                className={inputClass}
                                                value={active.estimateValue ?? ''}
                                                onChange={e =>
                                                    handleField(
                                                        'estimateValue',
                                                        e.target.value === '' ? null : Number(e.target.value)
                                                    )
                                                }
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className={labelClass}>Status</label>
                                            <select
                                                className={inputClass}
                                                value={active.status}
                                                onChange={e => handleStatus(e.target.value as ProjectStatus)}
                                            >
                                                {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map(s => (
                                                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Dates the totals are counted by. Only shown once they
                                        mean something - a lead has no quote date to correct. */}
                                    {active.status !== 'lead' && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <label className={labelClass}>Quote sent</label>
                                                <input
                                                    type="date"
                                                    className={inputClass}
                                                    value={toDateInput(active.quotedAt)}
                                                    onChange={e =>
                                                        handleField('quotedAt', fromDateInput(e.target.value))
                                                    }
                                                />
                                            </div>
                                            {isWon(active) && (
                                                <div className="space-y-1.5">
                                                    <label className={labelClass}>Accepted</label>
                                                    <input
                                                        type="date"
                                                        className={inputClass}
                                                        value={toDateInput(active.wonAt)}
                                                        onChange={e =>
                                                            handleField('wonAt', fromDateInput(e.target.value))
                                                        }
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {isWon(active) ? (
                                        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
                                            <Trophy size={16} className="shrink-0" />
                                            <p className="text-xs font-semibold">
                                                Client accepted{active.wonAt ? ` on ${formatDate(active.wonAt)}` : ''}
                                                {(active.estimateValue ?? 0) > 0 &&
                                                    ` · ${formatCurrency(active.estimateValue)}`}
                                            </p>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => handleStatus('won')}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-[0.14em] hover:bg-emerald-100 transition-colors"
                                        >
                                            <Trophy size={15} />
                                            Client accepted - mark as won
                                        </button>
                                    )}

                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Notes</label>
                                        <textarea
                                            rows={5}
                                            className={inputClass}
                                            value={active.notes}
                                            onChange={e => handleField('notes', e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Files */}
                                <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-5">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <h2 className="text-lg font-bold text-accent">Files</h2>
                                        <div className="flex items-center gap-2">
                                            <select
                                                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700"
                                                value={pendingKind}
                                                onChange={e => setPendingKind(e.target.value as ProjectAssetKind)}
                                            >
                                                {(Object.keys(ASSET_KIND_LABELS) as ProjectAssetKind[]).map(k => (
                                                    <option key={k} value={k}>{ASSET_KIND_LABELS[k]}</option>
                                                ))}
                                            </select>
                                            <Button
                                                size="sm"
                                                onClick={() => fileRef.current?.click()}
                                                disabled={uploading}
                                                icon={uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                            >
                                                {uploading ? 'Uploading' : 'Attach'}
                                            </Button>
                                        </div>
                                    </div>

                                    <input
                                        ref={fileRef}
                                        type="file"
                                        multiple
                                        accept="image/png,image/jpeg,image/webp,application/pdf"
                                        className="hidden"
                                        onChange={handleUpload}
                                    />

                                    <p className="text-[11px] text-slate-400">
                                        PNG, JPEG, WebP or PDF · up to {MAX_ASSET_BYTES / 1048576} MB each
                                    </p>

                                    {active.assets.length === 0 ? (
                                        <div className="text-center py-16 rounded-2xl border border-dashed border-slate-200">
                                            <Paperclip size={28} className="mx-auto text-slate-300 mb-3" />
                                            <p className="text-sm text-slate-500">
                                                No files yet - attach renders, floor plans or documents.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                            {active.assets.map(asset => {
                                                const isImage = asset.contentType.startsWith('image/');
                                                return (
                                                    <div key={asset.id} className="group relative rounded-2xl border border-slate-200 overflow-hidden bg-slate-50">
                                                        <a href={asset.downloadUrl} target="_blank" rel="noopener noreferrer" className="block">
                                                            {isImage ? (
                                                                <img src={asset.downloadUrl} alt={asset.name} className="w-full h-32 object-cover" />
                                                            ) : (
                                                                <div className="w-full h-32 flex items-center justify-center text-slate-400">
                                                                    <FileText size={28} />
                                                                </div>
                                                            )}
                                                        </a>
                                                        <div className="p-3 space-y-1 bg-white">
                                                            <p className="text-[11px] font-semibold text-slate-700 truncate" title={asset.name}>
                                                                {asset.name}
                                                            </p>
                                                            <p className="text-[10px] text-slate-400">
                                                                {ASSET_KIND_LABELS[asset.kind]} · {(asset.sizeBytes / 1048576).toFixed(1)} MB
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => handleRemoveAsset(asset.id)}
                                                            aria-label={`Remove ${asset.name}`}
                                                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-slate-500 opacity-0 group-hover:opacity-100 hover:text-rose-600 transition-all"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
