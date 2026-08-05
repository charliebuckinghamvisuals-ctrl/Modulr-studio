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

    const fetchCredits = async () => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/user/credits', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data: CreditsData = await response.json();
            setCredits(data.credits);
            setPlan(data.plan);
            if (data.plan) trackUserPlan(data.plan);
            setRendersLeft(data.rendersLeft ?? null);

            setRendersPerDay(data.rendersPerDay ?? null);
            setTrialDaysLeft(data.trialDaysLeft ?? null);
            setTrialBlocked(data.trialBlocked ?? false);
            setTrialExpiresAt(data.trialExpiresAt ?? null);
        } catch (error) {
            console.error("Error fetching credits:", error);
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
            setLoading(false);
        }
    }, [user]);

    return {
        credits, plan, loading, refreshCredits: fetchCredits,
        rendersLeft, rendersPerDay, trialDaysLeft, trialBlocked, trialExpiresAt
    };
}
