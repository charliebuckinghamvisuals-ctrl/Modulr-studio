import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';

interface CreditsData {
    credits: number;
    plan: string;
    // Free trial fields
    rendersLeft?: number;
    rendersPerDay?: number;
    trialDaysLeft?: number;
    trialBlocked?: boolean;
}

export function useCredits() {
    const { user } = useAuth();
    const [credits, setCredits] = useState<number | null>(null);
    const [plan, setPlan] = useState<string | null>(null);
    const [rendersLeft, setRendersLeft] = useState<number | null>(null);
    const [rendersPerDay, setRendersPerDay] = useState<number | null>(null);
    const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
    const [trialBlocked, setTrialBlocked] = useState(false);
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
            setRendersLeft(data.rendersLeft ?? null);
            setRendersPerDay(data.rendersPerDay ?? null);
            setTrialDaysLeft(data.trialDaysLeft ?? null);
            setTrialBlocked(data.trialBlocked ?? false);
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
            setLoading(false);
        }
    }, [user]);

    return {
        credits, plan, loading, refreshCredits: fetchCredits,
        rendersLeft, rendersPerDay, trialDaysLeft, trialBlocked
    };
}
