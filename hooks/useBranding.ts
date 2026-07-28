import { useState, useEffect } from 'react';

export interface BrandingData {
    logo: string | null;
    primaryColor: string;
    contactInfo: string;
}

const DEFAULT_BRANDING: BrandingData = {
    logo: null,
    primaryColor: '#0f172a', // default slate-900
    contactInfo: '',
};

export function useBranding() {
    const [branding, setBrandingState] = useState<BrandingData>(DEFAULT_BRANDING);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem('modulr_branding');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                setBrandingState({ ...DEFAULT_BRANDING, ...parsed });
            } catch (e) {
                console.error("Failed to parse branding data", e);
            }
        }
        setIsLoaded(true);
    }, []);

    const setBranding = (newBranding: Partial<BrandingData>) => {
        setBrandingState((prev) => {
            const updated = { ...prev, ...newBranding };
            localStorage.setItem('modulr_branding', JSON.stringify(updated));
            return updated;
        });
    };

    return { branding, setBranding, isLoaded };
}
