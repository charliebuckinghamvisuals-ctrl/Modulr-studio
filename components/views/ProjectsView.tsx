import React, { useEffect, useState, useRef } from 'react';
import { toast } from 'react-hot-toast';
import {
    FolderOpen, Plus, Trash2, MapPin, User, FileText, Image as ImageIcon,
    Upload, Loader2, ArrowLeft, PoundSterling, Paperclip,
} from 'lucide-react';
import { DraftingBackground } from '../DraftingBackground';
import { Button } from '../Button';
import { Project, ProjectAssetKind, ProjectStatus } from '../../types';
import {
    listProjects, createProject, updateProject, deleteProject,
    uploadAsset, removeAsset, MAX_ASSET_BYTES,
} from '../../services/projectService';

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

export const ProjectsView: React.FC = () => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const [pendingKind, setPendingKind] = useState<ProjectAssetKind>('exterior_render');

    const active = projects.find(p => p.id === activeId) || null;

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

    useEffect(() => { refresh(); }, []);

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

    const handleField = (field: keyof Project, value: any) => {
        if (!active) return;
        setProjects(prev => prev.map(p => (p.id === active.id ? { ...p, [field]: value } : p)));
        pendingWrites.current[field as string] = value;
        if (flushTimer.current) clearTimeout(flushTimer.current);
        flushTimer.current = setTimeout(flush, 700);
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
    const labelClass = 'text-[10px] font-black uppercase tracking-[0.2em] text-slate-500';

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
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {projects.map(project => (
                                        <div
                                            key={project.id}
                                            onClick={() => setActiveId(project.id)}
                                            className="group cursor-pointer p-5 rounded-2xl bg-white border border-slate-200 hover:border-accent/40 hover:shadow-lg transition-all flex flex-col gap-3"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <h3 className="font-bold text-slate-800 leading-snug group-hover:text-accent transition-colors">
                                                    {project.name}
                                                </h3>
                                                <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${STATUS_STYLES[project.status]}`}>
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
                                                <span className="text-lg font-black text-accent">
                                                    {formatCurrency(project.estimateValue)}
                                                </span>
                                                <span className="text-[10px] text-slate-400">
                                                    {formatDate(project.updatedAt)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
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
                                            <label className={labelClass}>Value (£)</label>
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
                                                onChange={e => handleField('status', e.target.value)}
                                            >
                                                {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map(s => (
                                                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

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
