import React from 'react';

interface SkeletonLoaderProps {
    className?: string;
    pulseGlow?: boolean;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ className = '', pulseGlow = false }) => {
    return (
        <div className={`
            bg-surface-highlight rounded-xl overflow-hidden relative
            ${pulseGlow ? 'animate-glow' : 'animate-pulse'}
            ${className}
        `}>
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
        </div>
    );
};
