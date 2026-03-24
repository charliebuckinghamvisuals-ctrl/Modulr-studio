import React, { useState, useEffect } from 'react';

interface StartupLoaderProps {
    onFinish: () => void;
}

export const StartupLoader: React.FC<StartupLoaderProps> = ({ onFinish }) => {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        // Enforce dark theme on loader
        document.documentElement.classList.remove('dark');

        const duration = 2500; // 2.5 seconds total loading time
        const intervalTime = 30; // Update every 30ms
        const steps = duration / intervalTime;
        let currentStep = 0;

        const timer = setInterval(() => {
            currentStep++;
            // Calculate progress with a slight ease-out effect for realism
            const progressValue = Math.min(
                100,
                Math.round((1 - Math.pow(1 - currentStep / steps, 3)) * 100)
            );
            
            setProgress(progressValue);

            if (currentStep >= steps) {
                clearInterval(timer);
                // Brief pause at 100% before transitioning out
                setTimeout(onFinish, 400);
            }
        }, intervalTime);

        return () => clearInterval(timer);
    }, [onFinish]);

    return (
        <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center pt-10 pb-20 animate-in fade-in duration-500">
            {/* Ambient Background Glows */}
            <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[100px] pointer-events-none"></div>
            <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none"></div>

            <div className="relative z-10 flex flex-col items-center w-full max-w-sm px-8">
                {/* Logo Layout */}
                <div className="-mt-12 -mb-20 z-10">
                    <img 
                        src="/Logo.png" 
                        alt="Modulr Studio Logo" 
                        className="w-80 h-auto object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]" 
                    />
                </div>

                {/* Progress Bar Container */}
                <div className="w-full flex flex-col gap-4 relative z-20">
                    <div className="flex justify-between items-end px-1">
                        <span className="text-[10px] font-bold tracking-widest uppercase text-secondary">
                            Initializing Engine
                        </span>
                        <span className="text-sm font-black tracking-tighter text-primary">
                            {progress}%
                        </span>
                    </div>
                    
                    {/* The Bar */}
                    <div className="w-full h-1.5 bg-surface/80 rounded-full overflow-hidden border border-border/50">
                        <div 
                            className="h-full bg-accent rounded-full transition-all duration-75 relative"
                            style={{ width: `${progress}%` }}
                        >
                            {/* Glowing effect on the loading bar tip */}
                            <div className="absolute top-0 right-0 bottom-0 w-10 bg-gradient-to-l from-white/40 to-transparent"></div>
                            <div className="absolute top-0 right-0 bottom-0 w-2 blur-[2px] bg-white opacity-60"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
