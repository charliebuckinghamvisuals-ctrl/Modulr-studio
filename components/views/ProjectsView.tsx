import React, { useEffect, useMemo, useState, useRef } from 'react';
import { toast } from 'react-hot-toast';
import {
    FolderOpen, Folder, Plus, Trash2, MapPin, User, FileText, Image as ImageIcon,
    Upload, Loader2, ArrowLeft, Paperclip, Trophy, Lock, Box,
    Share2, Link2Off, Search, KanbanSquare, LayoutGrid, BarChart3, Check, XCircle,
    PenTool, Download, ExternalLink,
} from 'lucide-react';
import { DraftingBackground } from '../DraftingBackground';
import { Button } from '../Button';
import { ProjectsDashboard } from '../ProjectsDashboard';
import { useAuth } from '../../hooks/useAuth';
import { useCredits } from '../../hooks/useCredits';
import { AppStage, Project, ProjectAsset, ProjectAssetKind, ProjectStatus } from '../../types';
import {
    listProjects, createProject, updateProject, deleteProject,
    uploadAsset, removeAsset, statusChanges, MAX_ASSET_BYTES,
} from '../../services/projectService';
import { isWon } from '../../services/projectMetrics';
import { setPendingDesign } from '../../services/designHandoff';
import { setCurrentProject } from '../../services/currentProject';

/**
 * Projects: every job as a folder, run as a pipeline - leads, quoted, won,
 * complete ("proper nice folder, organised, a quoting/leads/won system",
 * Charlie, 23 Sep 2026).
 *
 * Three views of the same list: the Pipeline board (drag a job from Leads to
 * Quoted to Won), Folders (every job, filtered and searched) and Reports (the
 * quoted-vs-won dashboard). Inside a job, files are sorted into folders -
 * proposals, renders, drawings and plans, documents - by their kind.
 */

const STATUS_LABELS: Record<ProjectStatus, string> = {
    lead: 'Lead',
    quoted: 'Quoted',
    won: 'Won',
    lost: 'Lost',
    complete: 'Complete',
};

const STAGE_TITLES: Record<ProjectStatus, string> = {
    lead: 'Leads',
    quoted: 'Quoted',
    won: 'Won',
    complete: 'Complete',
    lost: 'Lost',
};

const STAGE_HINTS: Record<ProjectStatus, string> = {
    lead: 'Enquiries not yet priced',
    quoted: 'Proposal or price sent',
    won: 'Client accepted',
    complete: 'Built and handed over',
    lost: 'Went elsewhere',
};

const STATUS_STYLES: Record<ProjectStatus, string> = {
    lead: 'bg-slate-100 text-slate-600',
    quoted: 'bg-amber-100 text-amber-700',
    won: 'bg-emerald-100 text-emerald-700',
    lost: 'bg-rose-100 text-rose-700',
    complete: 'bg-sky-100 text-sky-700',
};

/** The folder tab and the column rule, one colour per stage. */
const STATUS_TAB: Record<ProjectStatus, string> = {
    lead: 'bg-slate-400',
    quoted: 'bg-amber-500',
    won: 'bg-emerald-600',
    lost: 'bg-rose-400',
    complete: 'bg-sky-500',
};

const PIPELINE: ProjectStatus[] = ['lead', 'quoted', 'won', 'complete', 'lost'];
/** The stepper in a project: the road a job travels. Lost sits apart. */
const STEPS: ProjectStatus[] = ['lead', 'quoted', 'won', 'complete'];

const ASSET_KIND_LABELS: Record<ProjectAssetKind, string> = {
    proposal: 'Proposal',
    exterior_render: 'Exterior render',
    interior_render: 'Interior render',
    line_drawing: 'Line drawing',
    floor_plan: 'Floor plan',
    document: 'Document',
    other: 'Other',
};

type FolderKey = 'all' | 'proposals' | 'renders' | 'drawings' | 'documents';
const FOLDERS: { key: Exclude<FolderKey, 'all'>; label: string; kinds: ProjectAssetKind[]; icon: React.ReactNode }[] = [
    { key: 'proposals', label: 'Proposals', kinds: ['proposal'], icon: <FileText size={15} /> },
    { key: 'renders', label: 'Renders', kinds: ['exterior_render', 'interior_render'], icon: <ImageIcon size={15} /> },
    { key: 'drawings', label: 'Drawings & plans', kinds: ['line_drawing', 'floor_plan'], icon: <PenTool size={15} /> },
    { key: 'documents', label: 'Documents', kinds: ['document', 'other'], icon: <Paperclip size={15} /> },
];
/** What a file uploaded into each folder is filed as, and the choices there. */
const FOLDER_UPLOAD_KINDS: Record<FolderKey, ProjectAssetKind[]> = {
    all: ['exterior_render', 'interior_render', 'line_drawing', 'floor_plan', 'proposal', 'document', 'other'],
    proposals: ['proposal'],
    renders: ['exterior_render', 'interior_render'],
    drawings: ['floor_plan', 'line_drawing'],
    documents: ['document', 'other'],
};
const folderOf = (kind: ProjectAssetKind): Exclude<FolderKey, 'all'> =>
    FOLDERS.find(f => f.kinds.includes(kind))?.key ?? 'documents';

const formatCurrency = (value: number | null) =>
    value === null || Number.isNaN(value)
        ? '-'
        : new Intl.NumberFormat('en-GB', {
              style: 'currency',
              currency: 'GBP',
              maximumFractionDigits: 0,
          }).format(value);

const formatCompact = (value: number) =>
    value >= 1_000_000 ? `£${(value / 1_000_000).toFixed(1)}m`
        : value >= 10_000 ? `£${Math.round(value / 1000)}k`
        : formatCurrency(value);

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

const imagesOf = (p: Project) => p.assets.filter(a => a.contentType.startsWith('image/'));
const latestImage = (p: Project) => imagesOf(p).sort((a, b) => b.createdAt - a.createdAt)[0] || null;
const proposalsOf = (p: Project) => p.assets.filter(a => a.kind === 'proposal');

const VIEW_KEY = 'modulr_projects_view';
type View = 'pipeline' | 'folders' | 'reports';
const savedView = (): View => {
    try {
        const v = localStorage.getItem(VIEW_KEY);
        return v === 'folders' || v === 'reports' ? v : 'pipeline';
    } catch { return 'pipeline'; }
};

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

/** A job as a folder: the stage colour on its tab, its latest render in the
 *  window, and what is inside. */
const FolderCard: React.FC<{ project: Project; onOpen: () => void }> = ({ project, onOpen }) => {
    const img = latestImage(project);
    const proposals = proposalsOf(project).length;
    return (
        <button onClick={onOpen} className="group relative text-left pt-3 focus:outline-none">
            {/* The tab */}
            <div className="absolute top-0 left-0 h-5 w-28 rounded-t-lg bg-white border border-b-0 border-slate-200 group-hover:border-accent/40 transition-colors">
                <div className={`absolute left-3 top-2 h-1.5 w-10 rounded-full ${STATUS_TAB[project.status]}`} />
            </div>
            <div className="relative rounded-2xl rounded-tl-none bg-white border border-slate-200 group-hover:border-accent/40 group-hover:shadow-lg transition-all overflow-hidden">
                <div className="h-36 bg-slate-50 border-b border-slate-100 relative overflow-hidden">
                    {img ? (
                        <img src={img.downloadUrl} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            {project.scene3d
                                ? <Box size={34} className="text-accent/25" />
                                : <Folder size={38} className="text-slate-200" />}
                        </div>
                    )}
                    <span className={`absolute top-3 right-3 text-[9px] font-bold uppercase tracking-wider px-2 py-1 ${STATUS_STYLES[project.status]}`}>
                        {STATUS_LABELS[project.status]}
                    </span>
                </div>
                <div className="p-4 space-y-2">
                    <h3 className="font-bold text-slate-800 leading-snug group-hover:text-accent transition-colors truncate flex items-center gap-2">
                        {project.name}
                        {project.scene3d && <Box size={13} className="shrink-0 text-accent/60" aria-label="Has a saved 3D design" />}
                    </h3>
                    <div className="space-y-1 text-xs text-slate-500">
                        {project.clientName && <div className="flex items-center gap-2 truncate"><User size={12} className="shrink-0" /> {project.clientName}</div>}
                        {project.address && <div className="flex items-center gap-2 truncate"><MapPin size={12} className="shrink-0" /> {project.address}</div>}
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                        <span className="text-lg font-bold text-accent">{formatCurrency(project.estimateValue)}</span>
                        <span className="flex items-center gap-3 text-[10px] text-slate-400">
                            {proposals > 0 && <span className="flex items-center gap-1"><FileText size={11} /> {proposals}</span>}
                            <span className="flex items-center gap-1"><Paperclip size={11} /> {project.assets.length}</span>
                        </span>
                    </div>
                </div>
            </div>
        </button>
    );
};

/** A job on the pipeline board - small enough that a column holds a dozen. */
const BoardCard: React.FC<{ project: Project; onOpen: () => void; dragging: boolean; onDragStart: () => void; onDragEnd: () => void }> = ({ project, onOpen, dragging, onDragStart, onDragEnd }) => {
    const img = latestImage(project);
    return (
        <div
            draggable
            onDragStart={e => { e.dataTransfer.setData('text/plain', project.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
            onDragEnd={onDragEnd}
            onClick={onOpen}
            className={`group cursor-pointer rounded-xl bg-white border border-slate-200 hover:border-accent/40 hover:shadow-md transition-all overflow-hidden ${dragging ? 'opacity-40' : ''}`}
        >
            <div className="flex gap-3 p-3">
                <div className="w-14 h-14 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {img ? <img src={img.downloadUrl} alt="" className="w-full h-full object-cover" />
                        : project.scene3d ? <Box size={20} className="text-accent/30" /> : <Folder size={20} className="text-slate-200" />}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold text-slate-800 truncate group-hover:text-accent transition-colors">{project.name}</div>
                    <div className="text-[11px] text-slate-400 truncate">{project.clientName || project.address || 'No client yet'}</div>
                    <div className="flex items-center justify-between mt-1">
                        <span className="text-[13px] font-bold text-accent">{formatCurrency(project.estimateValue)}</span>
                        <span className="flex items-center gap-2 text-[10px] text-slate-400">
                            {proposalsOf(project).length > 0 && <FileText size={11} aria-label="Has a proposal" />}
                            <span>{new Date(project.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

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

    const [view, setView] = useState<View>(savedView);
    const [stageFilter, setStageFilter] = useState<ProjectStatus | 'all'>('all');
    const [search, setSearch] = useState('');
    const [dragId, setDragId] = useState<string | null>(null);
    const [dropStage, setDropStage] = useState<ProjectStatus | null>(null);

    const [folder, setFolder] = useState<FolderKey>('all');
    const [uploadKind, setUploadKind] = useState<ProjectAssetKind>('exterior_render');
    const [fileDrag, setFileDrag] = useState(false);

    useEffect(() => { try { localStorage.setItem(VIEW_KEY, view); } catch { /* private mode */ } }, [view]);
    // A new folder offers its own kinds; keep the choice if it still fits.
    useEffect(() => {
        const kinds = FOLDER_UPLOAD_KINDS[folder];
        if (!kinds.includes(uploadKind)) setUploadKind(kinds[0]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [folder]);
    // Opening a different job starts at All files.
    useEffect(() => { setFolder('all'); }, [activeId]);

    const active = projects.find(p => p.id === activeId) || null;

    // Remember the job being worked on, so Save-to-Project across the tools
    // can offer it first. Only set, never cleared on going back to the list -
    // "the last project I had open" stays the best default.
    useEffect(() => {
        if (active) setCurrentProject({ id: active.id, name: active.name });
    }, [active?.id, active?.name]);

    const matches = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return projects;
        return projects.filter(p =>
            [p.name, p.clientName, p.clientEmail, p.address].some(v => (v || '').toLowerCase().includes(q)));
    }, [projects, search]);

    const byStage = useMemo(() => {
        const out = Object.fromEntries(PIPELINE.map(s => [s, [] as Project[]])) as Record<ProjectStatus, Project[]>;
        for (const p of matches) (out[p.status] || out.lead).push(p);
        return out;
    }, [matches]);
    const stageValue = (s: ProjectStatus) => byStage[s].reduce((t, p) => t + (p.estimateValue || 0), 0);

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

    const handleCreate = async (status: ProjectStatus = 'lead') => {
        try {
            const created = await createProject(status === 'lead' ? undefined : { status, ...statusChanges({ quotedAt: null, wonAt: null }, status) });
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

    /** Status from inside a project: through the debounced writer. */
    const handleStatus = (status: ProjectStatus) => {
        if (!active || active.status === status) return;
        handleFields(statusChanges(active, status));
    };

    /** Status from the board: a drop is one deliberate act, written at once. */
    const moveTo = async (projectId: string, status: ProjectStatus) => {
        const project = projects.find(p => p.id === projectId);
        if (!project || project.status === status) return;
        const changes = statusChanges(project, status);
        setProjects(prev => prev.map(p => (p.id === projectId ? { ...p, ...changes, updatedAt: Date.now() } : p)));
        try {
            await updateProject(projectId, changes);
            if (status === 'won') toast.success(`"${project.name}" won`);
        } catch (e: any) {
            toast.error(e?.message || 'Could not move that project.');
            refresh();
        }
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

    const uploadFiles = async (files: File[]) => {
        if (!files.length || !active) return;
        setUploading(true);
        try {
            for (const file of files) {
                // A PDF dropped in the Proposals folder is a proposal; anywhere
                // else a PDF is a document unless the chosen kind says otherwise.
                const kind: ProjectAssetKind = file.type === 'application/pdf' && !['proposal', 'floor_plan', 'line_drawing', 'document', 'other'].includes(uploadKind)
                    ? 'document'
                    // and an image is never a proposal.
                    : file.type.startsWith('image/') && uploadKind === 'proposal' ? 'document' : uploadKind;
                const asset = await uploadAsset(active.id, file, kind);
                setProjects(prev => prev.map(p =>
                    p.id === active.id ? { ...p, assets: [...p.assets, asset] } : p
                ));
            }
            toast.success(files.length > 1 ? `${files.length} files added` : 'File added');
        } catch (err: any) {
            toast.error(err?.message || 'Upload failed.');
        } finally {
            setUploading(false);
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        await uploadFiles(files);
    };

    const handleRemoveAsset = async (asset: ProjectAsset) => {
        if (!active) return;
        if (!window.confirm(`Remove "${asset.name}" from this project?`)) return;
        try {
            await removeAsset(active.id, asset.id);
            setProjects(prev => prev.map(p =>
                p.id === active.id ? { ...p, assets: p.assets.filter(a => a.id !== asset.id) } : p
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
                    and see what you have quoted and won at a glance. Sign in to your Hub
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
                    on Configurator and The Hub, and the renders you save stay on your account
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

    // ---- inside a project --------------------------------------------------
    const renderProject = (p: Project) => {
        const inFolder = folder === 'all' ? p.assets : p.assets.filter(a => folderOf(a.kind) === folder);
        const sorted = [...inFolder].sort((a, b) => b.createdAt - a.createdAt);
        const count = (key: FolderKey) => key === 'all' ? p.assets.length : p.assets.filter(a => folderOf(a.kind) === key).length;
        const stepIndex = STEPS.indexOf(p.status);
        const docs = sorted.filter(a => !a.contentType.startsWith('image/'));
        const images = sorted.filter(a => a.contentType.startsWith('image/'));

        return (
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <button
                        onClick={() => setActiveId(null)}
                        className="flex items-center gap-2 text-sm text-slate-600 hover:text-accent transition-colors"
                    >
                        <ArrowLeft size={16} /> All projects
                    </button>
                    <div className="flex items-center gap-4">
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
                            <Share2 size={16} /> {p.shareToken ? 'Copy client link' : 'Share with client'}
                        </button>
                        {p.shareToken && (
                            <button
                                onClick={handleUnshare}
                                className="flex items-center gap-2 text-sm text-slate-400 hover:text-rose-600 transition-colors"
                                title="Disable the share link"
                            >
                                <Link2Off size={16} />
                            </button>
                        )}
                        {p.scene3d && (
                            <button
                                onClick={() => {
                                    if (!setPendingDesign(p.scene3d!)) {
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
                            onClick={() => handleDelete(p)}
                            className="flex items-center gap-2 text-sm text-rose-600 hover:text-rose-700 transition-colors"
                        >
                            <Trash2 size={16} /> Delete
                        </button>
                    </div>
                </div>

                {/* The folder's cover: name, client, value and where the job stands. */}
                <div className="relative pt-4">
                    <div className="absolute top-0 left-0 h-6 w-40 rounded-t-xl bg-white border border-b-0 border-slate-200">
                        <div className={`absolute left-4 top-2.5 h-1.5 w-14 rounded-full ${STATUS_TAB[p.status]}`} />
                    </div>
                    <div className="relative rounded-3xl rounded-tl-none bg-white border border-slate-200 shadow-sm p-6 md:p-8">
                        <div className="flex flex-wrap items-start justify-between gap-6">
                            <div className="min-w-0 flex-1">
                                <input
                                    className="w-full text-2xl md:text-3xl font-bold text-accent tracking-tight bg-transparent focus:outline-none focus:bg-slate-50 rounded-lg -mx-2 px-2 py-1"
                                    value={p.name}
                                    onChange={e => handleField('name', e.target.value)}
                                    aria-label="Project name"
                                />
                                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-1 text-sm text-slate-500">
                                    {p.clientName && <span className="flex items-center gap-1.5"><User size={14} /> {p.clientName}</span>}
                                    {p.address && <span className="flex items-center gap-1.5"><MapPin size={14} /> {p.address}</span>}
                                    <span className="text-slate-400 text-xs">Created {formatDate(p.createdAt)}</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className={labelClass}>Quote value</div>
                                <div className="text-3xl font-bold text-accent mt-1">{formatCurrency(p.estimateValue)}</div>
                            </div>
                        </div>

                        {/* The stepper: Lead > Quoted > Won > Complete, and Lost apart. */}
                        <div className="mt-8 flex flex-wrap items-center gap-3">
                            <div className="flex-1 min-w-[320px] grid grid-cols-4">
                                {STEPS.map((s, i) => {
                                    const done = p.status !== 'lost' && stepIndex >= i;
                                    const current = p.status === s;
                                    return (
                                        <button
                                            key={s}
                                            onClick={() => handleStatus(s)}
                                            className="group relative flex flex-col items-center gap-2 focus:outline-none"
                                            title={`Mark as ${STATUS_LABELS[s]}`}
                                        >
                                            {i > 0 && <div className={`absolute top-3.5 right-1/2 w-full h-0.5 ${done ? STATUS_TAB[p.status] : 'bg-slate-200'}`} />}
                                            <span className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${done ? `${STATUS_TAB[p.status]} border-transparent text-white` : 'bg-white border-slate-200 text-slate-300 group-hover:border-accent/50'} ${current ? 'ring-4 ring-offset-0 ring-slate-100' : ''}`}>
                                                {done ? <Check size={14} strokeWidth={3} /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                                            </span>
                                            <span className={`text-[11px] font-bold uppercase tracking-[0.14em] ${current ? 'text-slate-800' : 'text-slate-400 group-hover:text-slate-600'}`}>{STATUS_LABELS[s]}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <button
                                onClick={() => handleStatus(p.status === 'lost' ? (p.quotedAt ? 'quoted' : 'lead') : 'lost')}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-[0.12em] border transition-colors ${p.status === 'lost' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200'}`}
                            >
                                <XCircle size={14} /> {p.status === 'lost' ? 'Lost - reopen' : 'Mark lost'}
                            </button>
                        </div>
                        {isWon(p) && (
                            <div className="mt-6 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
                                <Trophy size={16} className="shrink-0" />
                                <p className="text-xs font-semibold">
                                    Client accepted{p.wonAt ? ` on ${formatDate(p.wonAt)}` : ''}
                                    {(p.estimateValue ?? 0) > 0 && ` · ${formatCurrency(p.estimateValue)}`}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
                    {/* Details */}
                    <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-5 h-fit">
                        <h2 className="text-lg font-bold text-accent">Client & quote</h2>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Client name</label>
                            <input className={inputClass} value={p.clientName} onChange={e => handleField('clientName', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Client email</label>
                            <input type="email" className={inputClass} value={p.clientEmail} onChange={e => handleField('clientEmail', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Site address</label>
                            <input className={inputClass} value={p.address} onChange={e => handleField('address', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Quote value (£)</label>
                            <input
                                type="number"
                                min={0}
                                className={inputClass}
                                value={p.estimateValue ?? ''}
                                onChange={e => handleField('estimateValue', e.target.value === '' ? null : Number(e.target.value))}
                            />
                        </div>
                        {/* Dates the totals are counted by. Only shown once they
                            mean something - a lead has no quote date to correct. */}
                        {p.status !== 'lead' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className={labelClass}>Quote sent</label>
                                    <input type="date" className={inputClass} value={toDateInput(p.quotedAt)} onChange={e => handleField('quotedAt', fromDateInput(e.target.value))} />
                                </div>
                                {isWon(p) && (
                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Accepted</label>
                                        <input type="date" className={inputClass} value={toDateInput(p.wonAt)} onChange={e => handleField('wonAt', fromDateInput(e.target.value))} />
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <label className={labelClass}>Notes</label>
                            <textarea rows={5} className={inputClass} value={p.notes} onChange={e => handleField('notes', e.target.value)} />
                        </div>
                    </div>

                    {/* Files, in folders */}
                    <div
                        className={`rounded-3xl bg-white border shadow-sm overflow-hidden transition-colors ${fileDrag ? 'border-accent ring-4 ring-accent/10' : 'border-slate-200'}`}
                        onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setFileDrag(true); } }}
                        onDragLeave={e => { if (e.currentTarget === e.target) setFileDrag(false); }}
                        onDrop={e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setFileDrag(false); uploadFiles(Array.from(e.dataTransfer.files)); }}
                    >
                        <div className="grid md:grid-cols-[210px_1fr] min-h-[420px]">
                            <nav className="border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/60 p-3 space-y-1">
                                <div className="px-3 pt-2 pb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Folders</div>
                                {([{ key: 'all' as FolderKey, label: 'All files', icon: <FolderOpen size={15} /> }, ...FOLDERS]).map(f => (
                                    <button
                                        key={f.key}
                                        onClick={() => setFolder(f.key)}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors ${folder === f.key ? 'bg-white shadow-sm border border-slate-200 text-accent font-bold' : 'text-slate-600 hover:bg-white/70 border border-transparent'}`}
                                    >
                                        <span className={folder === f.key ? 'text-accent' : 'text-slate-400'}>{f.icon}</span>
                                        <span className="flex-1 text-left truncate">{f.label}</span>
                                        <span className="text-[11px] text-slate-400 tabular-nums">{count(f.key)}</span>
                                    </button>
                                ))}
                            </nav>

                            <div className="p-5 md:p-6 space-y-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <h2 className="text-lg font-bold text-accent">
                                        {folder === 'all' ? 'All files' : FOLDERS.find(f => f.key === folder)!.label}
                                    </h2>
                                    <div className="flex items-center gap-2">
                                        {FOLDER_UPLOAD_KINDS[folder].length > 1 && (
                                            <select
                                                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700"
                                                value={uploadKind}
                                                onChange={e => setUploadKind(e.target.value as ProjectAssetKind)}
                                                aria-label="File type"
                                            >
                                                {FOLDER_UPLOAD_KINDS[folder].map(k => <option key={k} value={k}>{ASSET_KIND_LABELS[k]}</option>)}
                                            </select>
                                        )}
                                        <Button
                                            size="sm"
                                            onClick={() => fileRef.current?.click()}
                                            disabled={uploading}
                                            icon={uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                        >
                                            {uploading ? 'Uploading' : 'Add files'}
                                        </Button>
                                    </div>
                                </div>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    multiple
                                    accept={folder === 'proposals' ? 'application/pdf' : 'image/png,image/jpeg,image/webp,application/pdf'}
                                    className="hidden"
                                    onChange={handleUpload}
                                />
                                <p className="text-[11px] text-slate-400 -mt-2">
                                    Drop files here, or use Add files · PNG, JPEG, WebP or PDF · up to {MAX_ASSET_BYTES / 1048576} MB each
                                    {folder === 'proposals' && ' · or save one straight from the 3D Configurator\'s PDF export'}
                                </p>

                                {sorted.length === 0 ? (
                                    <div className="text-center py-16 rounded-2xl border border-dashed border-slate-200">
                                        <Folder size={30} className="mx-auto text-slate-300 mb-3" />
                                        <p className="text-sm text-slate-500">
                                            {folder === 'proposals' ? 'No proposals yet - export one from the 3D Configurator and choose Save to project.'
                                                : folder === 'all' ? 'No files yet - add renders, plans, proposals or documents.'
                                                : 'Nothing in this folder yet.'}
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        {docs.length > 0 && (
                                            <div className="space-y-2">
                                                {docs.map(asset => (
                                                    <div key={asset.id} className="group flex items-center gap-4 p-3 rounded-2xl border border-slate-200 hover:border-accent/30 transition-colors">
                                                        <div className={`w-11 h-14 rounded-md shrink-0 flex flex-col items-center justify-center border ${asset.kind === 'proposal' ? 'bg-accent/5 border-accent/20 text-accent' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                                            <FileText size={18} />
                                                            <span className="text-[8px] font-bold mt-0.5">PDF</span>
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-semibold text-slate-800 truncate" title={asset.name}>{asset.name}</p>
                                                            <p className="text-[11px] text-slate-400">
                                                                {ASSET_KIND_LABELS[asset.kind]} · {formatDate(asset.createdAt)} · {(asset.sizeBytes / 1048576).toFixed(1)} MB
                                                            </p>
                                                        </div>
                                                        <a href={asset.downloadUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"><ExternalLink size={13} /> Open</a>
                                                        <a href={asset.downloadUrl} download={asset.name} className="text-slate-400 hover:text-accent" aria-label={`Download ${asset.name}`}><Download size={15} /></a>
                                                        <button onClick={() => handleRemoveAsset(asset)} aria-label={`Remove ${asset.name}`} className="text-slate-300 hover:text-rose-600 transition-colors"><Trash2 size={15} /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {images.length > 0 && (
                                            <div className="grid gap-3 grid-cols-2 xl:grid-cols-3">
                                                {images.map(asset => (
                                                    <div key={asset.id} className="group relative rounded-2xl border border-slate-200 overflow-hidden bg-slate-50">
                                                        <a href={asset.downloadUrl} target="_blank" rel="noopener noreferrer" className="block">
                                                            <img src={asset.downloadUrl} alt={asset.name} className="w-full h-36 object-cover" />
                                                        </a>
                                                        <div className="p-3 space-y-0.5 bg-white">
                                                            <p className="text-[11px] font-semibold text-slate-700 truncate" title={asset.name}>{asset.name}</p>
                                                            <p className="text-[10px] text-slate-400">{ASSET_KIND_LABELS[asset.kind]} · {formatDate(asset.createdAt)}</p>
                                                        </div>
                                                        <button
                                                            onClick={() => handleRemoveAsset(asset)}
                                                            aria-label={`Remove ${asset.name}`}
                                                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center text-slate-500 opacity-0 group-hover:opacity-100 hover:text-rose-600 transition-all"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // ---- the list ------------------------------------------------------------
    const folderList = stageFilter === 'all' ? matches : byStage[stageFilter];
    const openValue = stageValue('lead') + stageValue('quoted');

    return (
        <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar">
            <DraftingBackground pageName="PROJECTS" />
            <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[150px] pointer-events-none" />

            <div className="flex-1 p-6 md:p-12 relative z-10 w-full">
                <div className="max-w-[1400px] mx-auto">
                    {active ? renderProject(active) : (
                        <>
                            <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
                                <div className="space-y-2">
                                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-none bg-accent/5 border border-accent/15 text-accent text-[11px] font-bold uppercase tracking-[0.2em]">
                                        <FolderOpen size={14} />
                                        Project Directory
                                    </div>
                                    <h1 className="text-3xl md:text-5xl font-bold text-accent tracking-tight leading-tight">
                                        Projects
                                    </h1>
                                    <p className="text-slate-600 text-sm max-w-xl">
                                        Every job as a folder - its client, value, proposals, renders and plans -
                                        moved from lead to quoted to won as it goes.
                                    </p>
                                </div>
                                <Button onClick={() => handleCreate()} icon={<Plus size={16} />}>
                                    New Project
                                </Button>
                            </div>

                            {/* Views, and search */}
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                                <div className="inline-flex p-1 rounded-2xl bg-white border border-slate-200 shadow-sm">
                                    {([
                                        ['pipeline', 'Pipeline', <KanbanSquare size={15} key="p" />],
                                        ['folders', 'Folders', <LayoutGrid size={15} key="f" />],
                                        ['reports', 'Reports', <BarChart3 size={15} key="r" />],
                                    ] as const).map(([k, l, icon]) => (
                                        <button
                                            key={k}
                                            onClick={() => setView(k)}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-[0.12em] transition-colors ${view === k ? 'bg-accent text-white' : 'text-slate-500 hover:text-accent'}`}
                                        >
                                            {icon} {l}
                                        </button>
                                    ))}
                                </div>
                                {view !== 'reports' && (
                                    <div className="flex items-center gap-4">
                                        {projects.length > 0 && (
                                            <span className="hidden md:block text-xs text-slate-500">
                                                <span className="font-bold text-accent">{formatCompact(openValue)}</span> open in leads and quotes
                                            </span>
                                        )}
                                        <label className="relative">
                                            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                value={search}
                                                onChange={e => setSearch(e.target.value)}
                                                placeholder="Search clients, addresses…"
                                                className="w-64 bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent/30"
                                            />
                                        </label>
                                    </div>
                                )}
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
                                    <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                                        Start one with New Project, or save a design or a PDF proposal from the
                                        3D Configurator - it lands here as a folder.
                                    </p>
                                </div>
                            ) : view === 'reports' ? (
                                <ProjectsDashboard projects={projects} />
                            ) : view === 'pipeline' ? (
                                /* The board: one column per stage, drag a job along. */
                                <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1 custom-scrollbar">
                                    {PIPELINE.map(stage => (
                                        <div
                                            key={stage}
                                            onDragOver={e => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropStage(stage); } }}
                                            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropStage(s => (s === stage ? null : s)); }}
                                            onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || dragId; setDropStage(null); setDragId(null); if (id) moveTo(id, stage); }}
                                            className={`flex-1 min-w-[220px] rounded-3xl border p-3 flex flex-col transition-colors ${dropStage === stage ? 'bg-accent/5 border-accent/40' : stage === 'lost' ? 'bg-slate-50/50 border-slate-200/70' : 'bg-white/70 border-slate-200'}`}
                                        >
                                            <div className="px-2 pt-1 pb-3">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${STATUS_TAB[stage]}`} />
                                                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-700">{STAGE_TITLES[stage]}</span>
                                                    <span className="ml-auto text-[11px] font-bold text-slate-400 tabular-nums">{byStage[stage].length}</span>
                                                </div>
                                                <div className="flex items-baseline justify-between mt-1.5">
                                                    <span className="text-[10px] text-slate-400">{STAGE_HINTS[stage]}</span>
                                                    <span className="text-sm font-bold text-accent">{stageValue(stage) > 0 ? formatCompact(stageValue(stage)) : ''}</span>
                                                </div>
                                                <div className={`mt-3 h-0.5 rounded-full ${STATUS_TAB[stage]} opacity-60`} />
                                            </div>
                                            <div className={`flex-1 space-y-2 min-h-[120px] ${stage === 'lost' ? 'opacity-75' : ''}`}>
                                                {byStage[stage].map(p => (
                                                    <BoardCard
                                                        key={p.id}
                                                        project={p}
                                                        dragging={dragId === p.id}
                                                        onDragStart={() => setDragId(p.id)}
                                                        onDragEnd={() => { setDragId(null); setDropStage(null); }}
                                                        onOpen={() => setActiveId(p.id)}
                                                    />
                                                ))}
                                                {byStage[stage].length === 0 && (
                                                    <div className="h-24 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-[11px] text-slate-400 text-center px-4">
                                                        {dragId ? 'Drop here' : search ? 'No matches' : 'Nothing here'}
                                                    </div>
                                                )}
                                            </div>
                                            {stage === 'lead' && (
                                                <button onClick={() => handleCreate('lead')} className="mt-3 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-accent hover:bg-white transition-colors">
                                                    <Plus size={14} /> Add a lead
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <>
                                    {/* Stage filter */}
                                    <div className="flex flex-wrap gap-2 mb-6">
                                        {(['all', ...PIPELINE] as const).map(s => {
                                            const n = s === 'all' ? matches.length : byStage[s].length;
                                            const on = stageFilter === s;
                                            return (
                                                <button
                                                    key={s}
                                                    onClick={() => setStageFilter(s)}
                                                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold border transition-colors ${on ? 'bg-accent text-white border-accent' : 'bg-white text-slate-600 border-slate-200 hover:border-accent/40'}`}
                                                >
                                                    {s !== 'all' && <span className={`w-2 h-2 rounded-full ${STATUS_TAB[s]}`} />}
                                                    {s === 'all' ? 'All projects' : STAGE_TITLES[s]}
                                                    <span className={on ? 'text-white/70' : 'text-slate-400'}>{n}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {folderList.length === 0 ? (
                                        <div className="text-center py-20 rounded-3xl bg-white/70 border border-slate-200 text-sm text-slate-500">
                                            {search ? `Nothing matches "${search}".` : 'No projects at this stage.'}
                                        </div>
                                    ) : (
                                        <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                            {folderList.map(p => <FolderCard key={p.id} project={p} onOpen={() => setActiveId(p.id)} />)}
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
