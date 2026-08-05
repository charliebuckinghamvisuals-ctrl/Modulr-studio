import { useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase';

/**
 * Emails that get past the pre-launch lock screen.
 *
 * This is a UI gate only - it decides who sees the app instead of the Coming
 * Soon page. The real authorisation is server-side in MASTER_UIDS, which is
 * keyed on Firebase UIDs rather than the email claim. Adding an address here
 * without adding the matching UID on the server gets someone into the
 * interface but not the API, which is the safe direction to fail.
 */
export const MASTER_EMAILS = [
    'charlie@napc.uk',
    'ed@napc.uk',
    'carysann@napc.uk',
];

/** Kept for existing imports. */
export const MASTER_EMAIL = MASTER_EMAILS[0];

export function isMasterAccount(userOrEmail?: User | string | null): boolean {
    if (!userOrEmail) return false;
    const email = typeof userOrEmail === 'string' ? userOrEmail : userOrEmail.email;
    if (!email) return false;
    return MASTER_EMAILS.includes(email.toLowerCase().trim());
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
