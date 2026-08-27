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

interface CreditsData {
    credits: CreditBalance;
    plan: string;
    /** Whether this account may create projects. Sent by the server rather than
     *  worked out from `plan` here - the entitled plan list belongs in one
     *  place, and the same value is what Firestore rules enforce. */
    canUseProjects?: boolean;
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
    // Free trial fields
    rendersLeft?: number;
    rendersPerDay?: number;
    trialDaysLeft?: number;
    trialBlocked?: boolean;
    trialExpiresAt?: string;
}

export function useCredits() {
    const { user } = useAuth();
    const [credits, setCredits] = useState<CreditBalance | null>(null);
    const [plan, setPlan] = useState<string | null>(null);
    const [rendersLeft, setRendersLeft] = useState<number | null>(null);
    const [rendersPerDay, setRendersPerDay] = useState<number | null>(null);
    const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
    const [trialBlocked, setTrialBlocked] = useState(false);
    const [trialExpiresAt, setTrialExpiresAt] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    /**
     * Whether this account may use the app at all.
     *
     * null while unknown. The SERVER decides - it is the only thing that knows
     * the master UID allowlist and the tester email list. Duplicating either in
     * the client would mean maintaining the same list twice and, worse, letting
     * the two disagree.
     */
    const [hasApiAccess, setHasApiAccess] = useState<boolean | null>(null);
    /** null while unknown, so the UI can wait rather than flashing an upsell at
     *  a subscriber whose plan has not loaded yet. */
    const [canUseProjects, setCanUseProjects] = useState<boolean | null>(null);
    const [canUseAnimation, setCanUseAnimation] = useState<boolean | null>(null);
    const [animationsLeft, setAnimationsLeft] = useState<number | null>(null);
    const [animationsLimit, setAnimationsLimit] = useState<number | null>(null);
    const [canExport4K, setCanExport4K] = useState<boolean | null>(null);
    const [fourKLeft, setFourKLeft] = useState<number | null>(null);
    const [fourKLimit, setFourKLimit] = useState<number | null>(null);

    const fetchCredits = async () => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/user/credits', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            // Only 401/403 mean "this account is locked out" — that is the
            // pre-launch lock (or a dead token) refusing this account.
            //
            // Every failure path must resolve canUseProjects to false rather
            // than leaving it null: null means "not known yet", and a screen
            // waiting on it would spin forever on a request that already failed.
            if (response.status === 401 || response.status === 403) {
                setHasApiAccess(false);
                setCanUseProjects(false);
                setCanUseAnimation(false);
                return;
            }
            if (!response.ok) {
                // 429 / 5xx are transient. Setting hasApiAccess false here used
                // to unmount the whole app back to the pre-launch lock screen
                // mid-session whenever one credits refresh hit the rate limiter.
                // Keep whatever access state we already knew and try again later.
                setCanUseProjects(prev => prev ?? false);
                setCanUseAnimation(prev => prev ?? false);
                return;
            }
            setHasApiAccess(true);

            const data: CreditsData = await response.json();
            setCredits(data.credits);
            setPlan(data.plan);
            setCanUseProjects(data.canUseProjects === true);
            setCanUseAnimation(data.canUseAnimation === true);
            setAnimationsLeft(data.animationsLeft ?? null);
            setAnimationsLimit(data.animationsLimit ?? null);
            setCanExport4K(data.canExport4K === true);
            setFourKLeft(data.fourKLeft ?? null);
            setFourKLimit(data.fourKLimit ?? null);
            if (data.plan) trackUserPlan(data.plan);
            setRendersLeft(data.rendersLeft ?? null);

            setRendersPerDay(data.rendersPerDay ?? null);
            setTrialDaysLeft(data.trialDaysLeft ?? null);
            setTrialBlocked(data.trialBlocked ?? false);
            setTrialExpiresAt(data.trialExpiresAt ?? null);
        } catch (error) {
            console.error("Error fetching credits:", error);
            setCanUseProjects(false);
            setCanUseAnimation(false);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchCredits();
        } else {
            setCredits(null);
            setPlan(null);
            setRendersLeft(null);
            setRendersPerDay(null);
            setTrialDaysLeft(null);
            setTrialBlocked(false);
            setTrialExpiresAt(null);
            setHasApiAccess(null);
            setCanUseProjects(null);
            setCanUseAnimation(null);
            setAnimationsLeft(null);
            setAnimationsLimit(null);
            setCanExport4K(null);
            setFourKLeft(null);
            setFourKLimit(null);
            setLoading(false);
        }
    }, [user]);

    return {
        credits, plan, loading, refreshCredits: fetchCredits,
        rendersLeft, rendersPerDay, trialDaysLeft, trialBlocked, trialExpiresAt,
        hasApiAccess, canUseProjects,
        canUseAnimation, animationsLeft, animationsLimit,
        canExport4K, fourKLeft, fourKLimit
    };
}
