import { auth } from './firebase';

/**
 * Floor Plan Studio client (18 Sep 2026).
 *
 * One call per plan: the plan-view capture (shaded + line drawing) or an
 * uploaded top view, the design spec or the surveyed items, and a mode -
 * 'rendered' (photoreal top-down) or 'cad' (black-on-white, dimensioned).
 * The server runs the same contract engine as exterior renders, from above,
 * and charges one render. Business only.
 */

const API_BASE_URL = '/api';

const authHeaders = async (base: Record<string, string> = {}) => {
    const token = await auth.currentUser?.getIdToken();
    return token ? { ...base, Authorization: `Bearer ${token}` } : base;
};

export type FloorPlanMode = 'rendered' | 'cad';

export interface InventoryItem {
    id: string;
    group: string;
    label: string;
    text: string;
}

export interface FloorPlanInput {
    /** The top view, base64 (data-URL prefix accepted). */
    shaded: string;
    /** The exact line drawing of the same view, from the configurator; absent for an upload. */
    line?: string | null;
    /** The design spec from the configurator; absent for an upload. */
    spec?: unknown;
    /** Surveyed or edited items - when present they win over the spec. */
    items?: InventoryItem[];
    mode: FloorPlanMode;
    ratio: string;
    notes?: string;
}

export interface FloorPlanResult {
    image: string;
    mode: FloorPlanMode;
    items: InventoryItem[];
    inventoryText: string;
    line?: string;
    engine: { finish: string; shipped: string; lineSource: string; inventorySource: string };
    verification: { checked: boolean; passed: boolean; failures: { id: string; label: string; problem: string }[] };
    rendersLeft?: number;
    seconds: number;
}

const readError = async (response: Response, fallback: string) => {
    const data = await response.json().catch(() => ({} as any));
    const err = new Error(data?.error || fallback) as Error & { needsBusiness?: boolean };
    err.needsBusiness = data?.needsBusiness === true;
    return err;
};

export const generateFloorPlan = async (input: FloorPlanInput): Promise<FloorPlanResult> => {
    const response = await fetch(`${API_BASE_URL}/render/plan`, {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(input),
    });
    if (!response.ok) throw await readError(response, 'The floor plan failed. Please try again.');
    return response.json();
};

/** An uploaded top view read as inventory items (an ANALYSIS call, cheap). */
export const surveyFloorPlan = async (image: string): Promise<InventoryItem[]> => {
    const response = await fetch(`${API_BASE_URL}/render/plan/survey`, {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ image }),
    });
    if (!response.ok) throw await readError(response, 'Could not read the plan.');
    return (await response.json()).items || [];
};

/** A design's plan inventory, no AI, no credits. */
export const floorPlanInventory = async (spec: unknown): Promise<InventoryItem[]> => {
    const response = await fetch(`${API_BASE_URL}/render/plan/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec }),
    });
    if (!response.ok) return [];
    return (await response.json()).items || [];
};

/**
 * The handoff from the 3D configurator. The configurator's iframe posts
 * RENDER_PLAN to DesignerView, which parks the capture here and navigates;
 * the Studio picks it up on mount. A module slot rather than app state
 * because nothing else needs it and the payload is a few MB of base64.
 */
export interface PendingPlanCapture {
    shaded: string;
    line: string | null;
    spec: unknown;
    width?: number;
    height?: number;
}

let pending: PendingPlanCapture | null = null;
export const setPendingPlanCapture = (p: PendingPlanCapture | null) => { pending = p; };
export const takePendingPlanCapture = (): PendingPlanCapture | null => { const p = pending; pending = null; return p; };
