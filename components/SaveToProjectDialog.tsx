import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { FolderOpen, Plus, Loader2, X, Lock } from 'lucide-react';
import { Project, ProjectAssetKind } from '../types';
import { listProjects, createProject, uploadAsset } from '../services/projectService';
import { getCurrentProject } from '../services/currentProject';
import { useCredits } from '../hooks/useCredits';

/**
 * "Save to Project" picker, shared by every tool that produces an image.
 *
 * The tools hand over a finished image; the user picks an existing project or
 * names a new one, and the image lands in that project's assets. Kept as one
 * dialog so Render Engine, Weather Lab, Material Studio et al. all save the
 * same way - the alternative was five subtly different save flows.
 */
interface SaveToProjectDialogProps {
    /** Data URL (or fetchable URL) of the image to save. Null hides the dialog. */
    image: string | null;
    assetKind: ProjectAssetKind;
    /** Base filename, e.g. "render-engine". */
    defaultName: string;
    onClose: () => void;
}

export const SaveToProjectDialog: React.FC<SaveToProjectDialogProps> = ({ image, assetKind, defaultName, onClose }) => {
    const { canUseProjects } = useCredits();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingTo, setSavingTo] = useState<string | null>(null);
    const [newName, setNewName] = useState('');

    useEffect(() => {
        if (!image || !canUseProjects) return;
        setLoading(true);
        setNewName('');
        listProjects()
            .then(list => {
                // The project the user last had open goes first - it is almost
                // always the job this render belongs to.
                const cur = getCurrentProject();
                if (cur) list = [...list.filter(p => p.id === cur.id), ...list.filter(p => p.id !== cur.id)];
                setProjects(list);
            })
            .catch(() => setProjects([]))
            .finally(() => setLoading(false));
    }, [image, canUseProjects]);

    if (!image) return null;

    const toFile = async (): Promise<File> => {
        // Tools hand over data URLs, http URLs or raw base64 - normalise first.
        const src = image.startsWith('data:') || image.startsWith('http') || image.startsWith('blob:')
            ? image
            : `data:image/jpeg;base64,${image}`;
        const blob = await (await fetch(src)).blob();
        const ext = blob.type === 'image/png' ? 'png' : 'jpg';
        return new File([blob], `${defaultName}-${Date.now()}.${ext}`, { type: blob.type || 'image/jpeg' });
    };

    const saveToExisting = async (project: Project) => {
        setSavingTo(project.id);
        try {
            await uploadAsset(project.id, await toFile(), assetKind);
            toast.success(`Saved to "${project.name}"`);
            onClose();
        } catch (e: any) {
            toast.error(e?.message || 'Could not save to that project.');
        } finally {
            setSavingTo(null);
        }
    };

    const createAndSave = async () => {
        const name = newName.trim();
        if (!name) {
            toast.error('Give the new project a name.');
            return;
        }
        setSavingTo('__new__');
        try {
            const created = await createProject({ name });
            await uploadAsset(created.id, await toFile(), assetKind);
            toast.success(`Saved to new project "${name}"`);
            onClose();
        } catch (e: any) {
            toast.error(e?.message || 'Could not create the project.');
        } finally {
            setSavingTo(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-bold text-[#3b4d4a]">Save to Project</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                        <X size={16} />
                    </button>
                </div>

                {!canUseProjects ? (
                    <p className="text-xs text-slate-500 mt-3 flex items-start gap-2">
                        <Lock size={14} className="shrink-0 mt-0.5" />
                        Projects is included on Standard and Business. Subscribe to keep your renders filed against the client they belong to.
                    </p>
                ) : (
                    <>
                        <p className="text-xs text-slate-400 mb-4">Pick a project, or start a new one.</p>

                        <div className="flex gap-2 mb-4">
                            <input
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') createAndSave(); }}
                                placeholder="New project name…"
                                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-[#3b4d4a] focus:outline-none focus:ring-2 focus:ring-accent/40"
                            />
                            <button
                                onClick={createAndSave}
                                disabled={savingTo !== null}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:opacity-90 disabled:opacity-50"
                            >
                                {savingTo === '__new__' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                Create
                            </button>
                        </div>

                        {loading ? (
                            <div className="flex items-center justify-center py-6 text-slate-400">
                                <Loader2 size={18} className="animate-spin" />
                            </div>
                        ) : projects.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-4">No projects yet - create one above.</p>
                        ) : (
                            <div className="max-h-64 overflow-y-auto space-y-1 -mx-1 px-1">
                                {projects.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => saveToExisting(p)}
                                        disabled={savingTo !== null}
                                        className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                                    >
                                        {savingTo === p.id
                                            ? <Loader2 size={15} className="shrink-0 animate-spin text-accent" />
                                            : <FolderOpen size={15} className="shrink-0 text-accent" />}
                                        <span className="min-w-0">
                                            <span className="block text-xs font-bold text-[#3b4d4a] truncate">
                                                {p.name}
                                                {getCurrentProject()?.id === p.id && (
                                                    <span className="ml-2 text-[9px] font-bold uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">Current</span>
                                                )}
                                            </span>
                                            <span className="block text-[10px] text-slate-400">
                                                {p.clientName ? `${p.clientName} · ` : ''}
                                                {new Date(p.updatedAt).toLocaleDateString()}
                                            </span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
