import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';

export function useCredits() {
    const { user } = useAuth();
    const [credits, setCredits] = useState<number | null>(null);
    const [plan, setPlan] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchCredits = async () => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/user/credits', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();
            setCredits(data.credits);
            setPlan(data.plan);
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
            setLoading(false);
        }
    }, [user]);

    return { credits, plan, loading, refreshCredits: fetchCredits };
}
