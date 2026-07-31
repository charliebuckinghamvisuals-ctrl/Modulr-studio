import { useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase';

export const MASTER_EMAIL = 'charlie@napc.uk';

export function isMasterAccount(userOrEmail?: User | string | null): boolean {
    if (!userOrEmail) return false;
    const email = typeof userOrEmail === 'string' ? userOrEmail : userOrEmail.email;
    if (!email) return false;
    return email.toLowerCase().trim() === MASTER_EMAIL.toLowerCase();
}

export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const isMaster = isMasterAccount(user);

    return { user, loading, isMaster };
}
