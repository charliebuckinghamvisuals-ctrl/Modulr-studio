import React from 'react';

interface DraftingBackgroundProps {
    pageName: string;
    hideGrid?: boolean;
}

export const DraftingBackground: React.FC<DraftingBackgroundProps> = ({ pageName, hideGrid = false }) => {
    if (hideGrid) return null;
    
    return (
        <div className="drafting-grid">
            <div className="absolute top-6 left-6 text-[6px] font-mono text-accent/20 uppercase tracking-[0.3em] hidden lg:block">
                <div>PRO_GRID_V4 // SCALE 1:20 // DATUM 0.00</div>
                <div className="mt-1">PAGE: {pageName}</div>
            </div>
            <div className="absolute top-6 right-6 text-[6px] font-mono text-accent/15 uppercase tracking-[0.3em] hidden lg:block text-right">
                MODULR_STUDIO_ENV <br />
                COORD: 51.5074 N, 0.1278 W
            </div>
        </div>
    );
};
