import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../services/firebase';

export type PdfTemplate = 'classic' | 'minimal' | 'bold';

export interface BrandingData {
    logo: string | null;
    primaryColor: string;
    contactInfo: string;
    /** PDF export design - read by the 3D Configurator via the localStorage mirror. */
    pdfTemplate: PdfTemplate;
}

const DEFAULT_BRANDING: BrandingData = {
    logo: null,
    primaryColor: '#0f172a', // default slate-900
    contactInfo: '',
    pdfTemplate: 'classic',
};

/**
 * Mirror of the user's branding, kept in localStorage.
 *
 * This exists for one specific reason: the 3D Configurator runs in a
 * same-origin iframe and generates its PDF synchronously, with no Firebase
 * client of its own. Reading this key is how it picks up the customer's logo
 * and colour. Firestore remains the source of truth.
 */
const CACHE_KEY = 'modulr_branding';

const readCache = (): BrandingData | null => {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        return raw ? { ...DEFAULT_BRANDING, ...JSON.parse(raw) } : null;
    } catch {
        return null;
    }
};

const writeCache = (data: BrandingData) => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* quota */ }
};

const clearCache = () => {
    try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
};

export function useBranding() {
    const [branding, setBrandingState] = useState<BrandingData>(DEFAULT_BRANDING);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        // Branding is per USER, not per browser. It previously lived only in
        // localStorage, which meant two people sharing a machine shared each
        // other's logo, and signing in on a second device showed none at all.
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                // Clear the cache on sign-out so the next person to use this
                // browser does not inherit the previous user's branding.
                clearCache();
                setBrandingState(DEFAULT_BRANDING);
                setIsLoaded(true);
                return;
            }

            // Show the cached value immediately, then reconcile with Firestore.
            const cached = readCache();
            if (cached) setBrandingState(cached);

            try {
                const snap = await getDoc(doc(db, 'users', user.uid));
                const stored = snap.exists() ? (snap.data() as any).branding : null;
                const next = { ...DEFAULT_BRANDING, ...(stored || {}) };
                setBrandingState(next);
                writeCache(next);
            } catch (e) {
                console.error('Failed to load branding', e);
            } finally {
                setIsLoaded(true);
            }
        });

        return unsub;
    }, []);

    const setBranding = async (newBranding: Partial<BrandingData>) => {
        const updated = { ...branding, ...newBranding };
        setBrandingState(updated);
        writeCache(updated);

        const user = auth.currentUser;
        if (!user) return;
        try {
            await setDoc(doc(db, 'users', user.uid), { branding: updated }, { merge: true });
        } catch (e) {
            console.error('Failed to save branding', e);
            throw e;
        }
    };

    return { branding, setBranding, isLoaded };
}
