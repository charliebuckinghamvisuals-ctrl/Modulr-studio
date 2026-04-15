import React from 'react';
import { ArrowRight } from 'lucide-react';

export const ComingSoonView: React.FC = () => {
    return (
        <div className="min-h-screen bg-transparent flex flex-col items-center justify-center relative overflow-hidden canvas-grid">
            {/* Ambient Background Glows */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/5 blur-[100px] rounded-full pointer-events-none"></div>
            <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full pointer-events-none delay-1000"></div>

            <div className="z-10 bg-white/60 backdrop-blur-3xl p-12 md:p-16 rounded-[3rem] border border-accent/10 shadow-2xl flex flex-col items-center text-center max-w-2xl w-full mx-4 relative overflow-hidden">
                
                {/* Logo */}
                <img src="/Logo.png" alt="Modulr Studio Logo" className="h-[200px] md:h-[250px] w-auto object-contain drop-shadow-xl -mt-16 -mb-6 relative z-10" />

                <h1 className="text-4xl md:text-5xl font-black text-accent mb-6 tracking-tight relative z-10">
                    Preparing for Launch
                </h1>
                
                <p className="text-secondary text-lg md:text-xl leading-relaxed mb-10 max-w-md mx-auto font-medium relative z-10">
                    We are putting the final touches on our revolutionary AI-powered architectural styling engine. 
                </p>

                <div className="w-full h-1 bg-accent/10 rounded-full overflow-hidden relative z-10">
                    <div className="w-1/3 h-full bg-gradient-to-r from-primary to-accent rounded-full animate-[pulse_3s_ease-in-out_infinite] shadow-lg"></div>
                </div>
            </div>
            
        </div>
    );
};
