import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
} from 'firebase/firestore';
import {
    ref as storageRef,
    uploadBytes,
    getDownloadURL,
    deleteObject,
} from 'firebase/storage';
import { db, storage, auth } from './firebase';
import { Project, ProjectDraft, ProjectAsset, ProjectAssetKind, ProjectStatus } from '../types';

const PROJECTS = 'projects';

/** Per-file upload ceiling. Keeps a stray 200 MB video from landing in Storage
 *  and on the bill. Renders are ~1-3 MB; PDFs and plans rarely exceed 20 MB. */
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
];

const requireUid = (): string => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('You must be signed in to manage projects.');
    return uid;
};

/**
 * Storage layout: projects/{uid}/{projectId}/{assetId}-{safeName}
 *
 * The uid is the FIRST path segment deliberately - Storage rules match on path
 * prefix, so this makes "a user may only touch their own files" expressible as
 * a single rule, and makes a mis-scoped write impossible rather than merely
 * discouraged.
 */
const assetPath = (uid: string, projectId: string, assetId: string, fileName: string) => {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    return `${PROJECTS}/${uid}/${projectId}/${assetId}-${safeName}`;
};

const emptyDraft = (): ProjectDraft => ({
    name: 'Untitled project',
    clientName: '',
    clientEmail: '',
    address: '',
    estimateValue: null,
    status: 'lead',
    quotedAt: null,
    wonAt: null,
    notes: '',
    scene3d: null,
    shareToken: null,
});

const toMillis = (v: any): number | null =>
    v?.toMillis?.() ?? (typeof v === 'number' ? v : null);

/** Normalise a Firestore document into a Project, tolerating older records
 *  written before a field existed. */
const toProject = (id: string, data: any): Project => {
    const createdAt = toMillis(data.createdAt) ?? Date.now();
    const status: ProjectStatus = data.status || 'lead';

    /* Projects saved before quote dates existed carry none. Rather than drop
     * them out of every total, they fall back to their creation date - which is
     * the closest thing to a quote date the record has. The fallback lives here
     * so the dashboard never has to know about the old shape. */
    const quotedAt = toMillis(data.quotedAt) ?? (status === 'lead' ? null : createdAt);
    const wonAt =
        toMillis(data.wonAt) ??
        (status === 'won' || status === 'complete' ? quotedAt ?? createdAt : null);

    return {
        id,
        ownerUid: data.ownerUid,
        name: data.name || 'Untitled project',
        clientName: data.clientName || '',
        clientEmail: data.clientEmail || '',
        address: data.address || '',
        estimateValue: typeof data.estimateValue === 'number' ? data.estimateValue : null,
        status,
        quotedAt,
        wonAt,
        notes: data.notes || '',
        scene3d: typeof data.scene3d === 'string' ? data.scene3d : null,
        shareToken: typeof data.shareToken === 'string' ? data.shareToken : null,
        assets: Array.isArray(data.assets) ? data.assets : [],
        createdAt,
        updatedAt: toMillis(data.updatedAt) ?? Date.now(),
    };
};

/**
 * The fields a status change touches, keeping the two dates the dashboard
 * counts by honest. Stamped rather than inferred at read time because the
 * user can correct them afterwards - once a date is on the record it is
 * theirs, so nothing re-stamps a field that already has a value.
 */
export const statusChanges = (
    project: Pick<Project, 'quotedAt' | 'wonAt'>,
    status: ProjectStatus,
    now = Date.now()
): Partial<ProjectDraft> => {
    const changes: Partial<ProjectDraft> = { status };
    // Leaving Lead implies a price went out - Quoted, Won and Lost all
    // presuppose a quote.
    if (status !== 'lead' && project.quotedAt === null) changes.quotedAt = now;
    if (status === 'won' || status === 'complete') {
        if (project.wonAt === null) changes.wonAt = now;
    } else if (project.wonAt !== null) {
        // Moved back out of Won. Leaving the acceptance date behind would keep
        // the job in won totals for a month it is no longer won in.
        changes.wonAt = null;
    }
    return changes;
};

export const listProjects = async (): Promise<Project[]> => {
    const uid = requireUid();
    // Filtered by ownerUid here AND enforced in Firestore rules. The query is a
    // convenience; the rule is the control.
    const q = query(
        collection(db, PROJECTS),
        where('ownerUid', '==', uid),
        orderBy('updatedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => toProject(d.id, d.data()));
};

export const getProject = async (projectId: string): Promise<Project | null> => {
    requireUid();
    const snap = await getDoc(doc(db, PROJECTS, projectId));
    if (!snap.exists()) return null;
    return toProject(snap.id, snap.data());
};

export const createProject = async (draft?: Partial<ProjectDraft>): Promise<Project> => {
    const uid = requireUid();
    const payload = {
        ...emptyDraft(),
        ...draft,
        ownerUid: uid,
        assets: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };
    const created = await addDoc(collection(db, PROJECTS), payload);
    const snap = await getDoc(created);
    return toProject(created.id, snap.data());
};

export const updateProject = async (
    projectId: string,
    changes: Partial<ProjectDraft>
): Promise<void> => {
    requireUid();
    await updateDoc(doc(db, PROJECTS, projectId), {
        ...changes,
        updatedAt: serverTimestamp(),
    });
};

/**
 * Delete a project and every file belonging to it.
 *
 * Storage objects are removed first: if the Firestore document went first and a
 * deletion failed, the files would be orphaned with nothing left pointing at
 * them, invisible in the UI but still billed.
 */
export const deleteProject = async (projectId: string): Promise<void> => {
    requireUid();
    const project = await getProject(projectId);
    if (project) {
        await Promise.allSettled(
            project.assets.map(a => deleteObject(storageRef(storage, a.storagePath)))
        );
    }
    await deleteDoc(doc(db, PROJECTS, projectId));
};

export const uploadAsset = async (
    projectId: string,
    file: File,
    kind: ProjectAssetKind
): Promise<ProjectAsset> => {
    const uid = requireUid();

    if (file.size > MAX_ASSET_BYTES) {
        throw new Error(
            `"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_ASSET_BYTES / 1048576} MB.`
        );
    }
    if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
        throw new Error('Only PNG, JPEG, WebP and PDF files can be attached.');
    }

    const assetId = crypto.randomUUID();
    const path = assetPath(uid, projectId, assetId, file.name);
    const objectRef = storageRef(storage, path);

    try {
        await uploadBytes(objectRef, file, { contentType: file.type });
    } catch (e: any) {
        // storage/unauthorized for an entitled account means the Storage rules
        // could not read the account record (the cross-service Firestore
        // permission, see storage.rules). The server makes the same checks
        // and saves to the same place, so the file goes that way instead.
        if (e?.code === 'storage/unauthorized') return uploadViaServer(projectId, file, kind);
        throw e;
    }
    const downloadUrl = await getDownloadURL(objectRef);

    const asset: ProjectAsset = {
        id: assetId,
        storagePath: path,
        downloadUrl,
        name: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        kind,
        createdAt: Date.now(),
    };

    const project = await getProject(projectId);
    const nextAssets = [...(project?.assets || []), asset];
    await updateDoc(doc(db, PROJECTS, projectId), {
        assets: nextAssets,
        updatedAt: serverTimestamp(),
    });

    return asset;
};

/** The same upload, made by the server - see uploadAsset. It files the
 *  asset on the project itself. */
const uploadViaServer = async (projectId: string, file: File, kind: ProjectAssetKind): Promise<ProjectAsset> => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('You must be signed in to manage projects.');
    const qs = new URLSearchParams({ kind, name: file.name });
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assets?${qs}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': file.type },
        body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.asset) throw new Error(data.error || 'The file could not be saved. Please try again in a moment.');
    return data.asset as ProjectAsset;
};

/** Attach a render the app produced. Renders live in memory as base64, so they
 *  are converted to a File and take the same path as a manual upload. */
export const attachRender = async (
    projectId: string,
    base64OrDataUrl: string,
    kind: ProjectAssetKind,
    fileName = 'render.png'
): Promise<ProjectAsset> => {
    const dataUrl = base64OrDataUrl.startsWith('data:')
        ? base64OrDataUrl
        : `data:image/png;base64,${base64OrDataUrl}`;
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], fileName, { type: blob.type || 'image/png' });
    return uploadAsset(projectId, file, kind);
};

export const removeAsset = async (projectId: string, assetId: string): Promise<void> => {
    requireUid();
    const project = await getProject(projectId);
    if (!project) return;

    const asset = project.assets.find(a => a.id === assetId);
    if (!asset) return;

    try {
        await deleteObject(storageRef(storage, asset.storagePath));
    } catch (e) {
        // A missing object shouldn't block removing the reference - otherwise a
        // half-deleted asset is stuck in the UI forever.
        console.error('Failed to delete storage object', asset.storagePath, e);
    }

    await updateDoc(doc(db, PROJECTS, projectId), {
        assets: project.assets.filter(a => a.id !== assetId),
        updatedAt: serverTimestamp(),
    });
};
