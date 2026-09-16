import React from 'react';

/**
 * The whole site, parked.
 *
 * Switched on with UNDER_CONSTRUCTION below while the render engine is
 * rebuilt (Charlie, 16 Sep 2026: "push live site to under construction for
 * tonight"). Every route shows this page. Charlie can still get in with
 * ?preview=1 once on any URL - that sets a flag in this browser only - so
 * the site can be checked without lifting the sign for everyone.
 */
export const UNDER_CONSTRUCTION = true;

const BYPASS_KEY = 'modulr_preview_bypass';

export const maintenanceActive = (): boolean => {
    if (!UNDER_CONSTRUCTION) return false;
    try {
        const q = new URLSearchParams(window.location.search);
        if (q.get('preview') === '1') { localStorage.setItem(BYPASS_KEY, '1'); return false; }
        if (q.get('preview') === '0') { localStorage.removeItem(BYPASS_KEY); return true; }
        return localStorage.getItem(BYPASS_KEY) !== '1';
    } catch { return true; }
};

export const MaintenanceView: React.FC = () => (
    <div className="w-full min-h-[100dvh] flex items-center justify-center bg-[#f5f5f0] text-[#3b4d4a] px-6">
        <div className="max-w-xl text-center">
            <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#3b4d4a]/60 mb-6">Modulr Studio</div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-5">Under construction</h1>
            <p className="text-base md:text-lg leading-relaxed text-[#3b4d4a]/80">
                We are rebuilding the render engine and will be back shortly. Your projects and designs are safe and will be here when we reopen.
            </p>
            <p className="mt-8 text-sm text-[#3b4d4a]/50">Questions in the meantime: <a className="underline" href="mailto:info@napc.uk">info@napc.uk</a></p>
        </div>
    </div>
);
