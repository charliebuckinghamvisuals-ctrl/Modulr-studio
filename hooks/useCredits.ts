import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { trackUserPlan } from '../services/analytics';


/**
 * `credits` is the literal string 'Unlimited' for master accounts - see the
 * /api/user/credits handler. It was previously typed as `number`, which made
 * the `credits === 'Unlimited'` check in AccountView a type error that the
 * build never surfaced because TypeScript was not being run.
 */
type CreditBalance = number | 'Unlimited';

/** One video model as the server prices it (see VIDEO_MODELS in server.js). */
export interface VideoModelInfo {
    label: string;
    vendor: string;
    blurb: string;
    available: boolean;
    audio: boolean;
    minSeconds: number;
    maxSeconds: number;
    defaultSeconds: number;
    resolutions: string[];
    defaultResolution: string;
    pencePerSecond: Record<string, number>;
    priceFor: Record<string, Record<string, number>>;
}

interface CreditsData {
    credits: CreditBalance;
    plan: string;
    /** Whether this account may create projects. Sent by the server rather than
     *  worked out from `plan` here - the entitled plan list belongs in one
     *  place, and the same value is what Firestore rules enforce. */
    canUseProjects?: boolean;
    /** The full 3D configurator: every paid plan and the trial. */
    canUseFullConfigurator?: boolean;
    /** The AI image tools (Render Engine, material close-ups, Line Converter,
     *  Weather Lab, Floor Plan Studio). False on the Configurator plan, which
     *  is the 3D configurator, projects and PDFs with no AI generation. */
    canUseRenderTools?: boolean;
    /** Whether this account may generate animations, and how many of the
     *  monthly allowance are left. Both decided by the server. */
    canUseAnimation?: boolean;
    animationsLeft?: number;
    animationsLimit?: number;
    /** Whether this account may export 4K images, and how many of the monthly
     *  allowance are left. Generation is always 2K; 4K is a metered export. */
    canExport4K?: boolean;
    fourKLeft?: number;
    fourKLimit?: number;
    /** Pay-as-you-go video: balance in pence and the priced model table. */
    videoCreditsPence?: number;
    videoModels?: Record<string, VideoModelInfo>;
    includedClipSeconds?: number;
    // Free trial fields
    rendersLeft?: number;
    rendersPerDay?: number;
    trialDaysLeft?: number;
    trialBlocked?: boolean;
    trialExpiresAt?: string;
}

/**
 * The one balance every caller reads.
 *
 * useCredits used to be a private fetch per component: the header pill, the
 * account page, the workspace and the projects list each asked
 * /api/user/credits once when they mounted and never again. So the header
 * showed the balance from page load while the account page, mounted later,
 * showed the truth - a tester saw "40 credits" top right and "37 / 40" on the
 * dashboard (14 Sep 2026). Now there is a single shared state, one request in
 * flight at a time, and every mounted hook re-renders when it changes.
 */
interface CreditsState {
    credits: CreditBalance | null;
    plan: string | null;
    rendersLeft: number | null;
    rendersPerDay: number | null;
    trialDaysLeft: number | null;
    trialBlocked: boolean;
    trialExpiresAt: string | null;
    loading: boolean;
    /**
     * Whether this account may use the app at all.
     *
     * null while unknown. The SERVER decides - it is the only thing that knows
     * the master UID allowlist and the tester email list. Duplicating either in
     * the client would mean maintaining the same list twice and, worse, letting
     * the two disagree.
     */
    hasApiAccess: boolean | null;
    /** null while unknown, so the UI can wait rather than flashing an upsell at
     *  a subscriber whose plan has not loaded yet. */
    canUseProjects: boolean | null;
    canUseFullConfigurator: boolean | null;
    canUseRenderTools: boolean | null;
    canUseAnimation: boolean | null;
    animationsLeft: number | null;
    animationsLimit: number | null;
    canExport4K: boolean | null;
    fourKLeft: number | null;
    fourKLimit: number | null;
    videoCreditsPence: number;
    videoModels: Record<string, VideoModelInfo> | null;
    includedClipSeconds: number;
}

const EMPTY: CreditsState = {
    credits: null, plan: null, rendersLeft: null, rendersPerDay: null, trialDaysLeft: null,
    trialBlocked: false, trialExpiresAt: null, loading: false, hasApiAccess: null,
    canUseProjects: null, canUseFullConfigurator: null, canUseRenderTools: null, canUseAnimation: null, animationsLeft: null, animationsLimit: null,
    canExport4K: null, fourKLeft: null, fourKLimit: null,
    videoCreditsPence: 0, videoModels: null, includedClipSeconds: 8,
};

let state: CreditsState = { ...EMPTY, loading: true };
const listeners = new Set<(s: CreditsState) => void>();
let inFlight: Promise<void> | null = null;
let currentUser: { uid: string; getIdToken: () => Promise<string> } | null = null;

const publish = (patch: Partial<CreditsState>) => {
    state = { ...state, ...patch };
    listeners.forEach(l => l(state));
};

const fetchCredits = async (): Promise<void> => {
    const user = currentUser;
    if (!user) return;
    if (inFlight) return inFlight;
    inFlight = (async () => {
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/user/credits', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            // Only 401/403 mean "this account is locked out" - that is the
            // pre-launch lock (or a dead token) refusing this account.
            //
            // Every failure path must resolve canUseProjects to false rather
            // than leaving it null: null means "not known yet", and a screen
            // waiting on it would spin forever on a request that already failed.
            if (response.status === 401 || response.status === 403) {
                publish({ hasApiAccess: false, canUseProjects: false, canUseAnimation: false });
                return;
            }
            if (!response.ok) {
                // 429 / 5xx are transient. Setting hasApiAccess false here used
                // to unmount the whole app back to the pre-launch lock screen
                // mid-session whenever one credits refresh hit the rate limiter.
                // Keep whatever access state we already knew and try again later.
                publish({
                    canUseProjects: state.canUseProjects ?? false,
                    canUseAnimation: state.canUseAnimation ?? false,
                });
                return;
            }

            const data: CreditsData = await response.json();
            if (data.plan) trackUserPlan(data.plan);
            publish({
                hasApiAccess: true,
                credits: data.credits,
                plan: data.plan,
                canUseProjects: data.canUseProjects === true,
                canUseAnimation: data.canUseAnimation === true,
                animationsLeft: data.animationsLeft ?? null,
                animationsLimit: data.animationsLimit ?? null,
                canExport4K: data.canExport4K === true,
                canUseFullConfigurator: data.canUseFullConfigurator === true,
                // Older servers do not send it; treat absent as allowed so a
                // deploy ordering slip never locks a paying account out.
                canUseRenderTools: data.canUseRenderTools !== false,
                videoCreditsPence: Number(data.videoCreditsPence) || 0,
                videoModels: data.videoModels ?? null,
                includedClipSeconds: data.includedClipSeconds ?? 8,
                fourKLeft: data.fourKLeft ?? null,
                fourKLimit: data.fourKLimit ?? null,
                rendersLeft: data.rendersLeft ?? null,
                rendersPerDay: data.rendersPerDay ?? null,
                trialDaysLeft: data.trialDaysLeft ?? null,
                trialBlocked: data.trialBlocked ?? false,
                trialExpiresAt: data.trialExpiresAt ?? null,
            });
        } catch (error) {
            console.error("Error fetching credits:", error);
            publish({ canUseProjects: false, canUseAnimation: false });
        } finally {
            publish({ loading: false });
            inFlight = null;
        }
    })();
    return inFlight;
};

/**
 * Refresh soon, once, however many things asked. A render's completion, the
 * tab regaining focus and a page opening can all land within the same
 * second, and the credits endpoint is rate limited.
 */
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleRefresh = (delayMs = 400) => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { refreshTimer = null; fetchCredits(); }, delayMs);
};

if (typeof window !== 'undefined') {
    // Announced by the API helper after any call that can spend a render.
    window.addEventListener('modulr:credits-changed', () => scheduleRefresh());
    // Coming back to the tab after rendering elsewhere, or after a plan change.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && currentUser) scheduleRefresh(100);
    });
}

export function useCredits() {
    const { user } = useAuth();
    const [snapshot, setSnapshot] = useState<CreditsState>(state);

    useEffect(() => {
        const listener = (s: CreditsState) => setSnapshot(s);
        listeners.add(listener);
        setSnapshot(state);
        return () => { listeners.delete(listener); };
    }, []);

    useEffect(() => {
        if (user) {
            const changed = currentUser?.uid !== user.uid;
            currentUser = user;
            if (changed) {
                state = { ...EMPTY, loading: true };
                listeners.forEach(l => l(state));
            }
            // A fresh mount always asks once; the shared in-flight guard makes
            // ten mounts in the same tick one request.
            fetchCredits();
        } else {
            currentUser = null;
            state = { ...EMPTY };
            listeners.forEach(l => l(state));
        }
    }, [user]);

    /**
     * True until the server has answered for THIS account.
     *
     * Between auth resolving and the effect above running, the shared state is
     * still the signed-out EMPTY - loading false, plan null - so a screen
     * gating on `loading` would show its signed-out answer for a frame before
     * the real plan landed. A signed-in user the shared state has not picked
     * up yet is still loading.
     */
    const loading = snapshot.loading || (!!user && currentUser?.uid !== user.uid);

    return {
        credits: snapshot.credits,
        plan: snapshot.plan,
        loading,
        refreshCredits: fetchCredits,
        rendersLeft: snapshot.rendersLeft,
        rendersPerDay: snapshot.rendersPerDay,
        trialDaysLeft: snapshot.trialDaysLeft,
        trialBlocked: snapshot.trialBlocked,
        trialExpiresAt: snapshot.trialExpiresAt,
        hasApiAccess: snapshot.hasApiAccess,
        canUseProjects: snapshot.canUseProjects,
        canUseAnimation: snapshot.canUseAnimation,
        animationsLeft: snapshot.animationsLeft,
        animationsLimit: snapshot.animationsLimit,
        canExport4K: snapshot.canExport4K,
        canUseFullConfigurator: snapshot.canUseFullConfigurator,
        canUseRenderTools: snapshot.canUseRenderTools,
        videoCreditsPence: snapshot.videoCreditsPence,
        videoModels: snapshot.videoModels,
        includedClipSeconds: snapshot.includedClipSeconds,
        fourKLeft: snapshot.fourKLeft,
        fourKLimit: snapshot.fourKLimit,
    };
}
