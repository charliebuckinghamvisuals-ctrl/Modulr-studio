import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';

export const ComingSoonView: React.FC = () => {
    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
            {/* Ambient Background Glows */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 blur-[120px] rounded-full mix-blend-screen animate-pulse pointer-events-none"></div>
            <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-accent/20 blur-[150px] rounded-full mix-blend-screen pointer-events-none delay-1000"></div>

            <div className="z-10 bg-slate-900/60 backdrop-blur-2xl p-12 md:p-16 rounded-[3rem] border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col items-center text-center max-w-2xl w-full mx-4">
                
                {/* Logo / Brand */}
                <div className="flex items-center gap-3 bg-white/5 px-6 py-2 rounded-full border border-white/10 mb-8 mt-2 shadow-inner">
                    <Sparkles className="text-blue-400" size={18} />
                    <span className="text-white font-bold tracking-widest uppercase text-sm">Modulr Studio</span>
                </div>

                <h1 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 mb-6 tracking-tight">
                    Preparing for Launch
                </h1>
                
                <p className="text-slate-400 text-lg md:text-xl leading-relaxed mb-10 max-w-md mx-auto">
                    We are currently putting the final touches on our revolutionary AI-powered architectural styling engine. 
                </p>

                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mb-12">
                    <div className="w-1/3 h-full bg-gradient-to-r from-blue-500 to-accent rounded-full animate-[pulse_3s_ease-in-out_infinite]"></div>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-4 w-full justify-center">
                    <a 
                        href="https://linkedin.com/in/charlie-buckingham" 
                        target="_blank" 
                        rel="noreferrer"
                        className="w-full md:w-auto px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl transition-all duration-300 border border-white/10 hover:border-white/20 flex items-center justify-center gap-2 group"
                    >
                        Follow Updates
                        <ArrowRight size={16} className="text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all" />
                    </a>
                </div>
            </div>

            {/* Footer Watermark */}
            <div className="absolute bottom-6 left-0 right-0 text-center pointer-events-none">
                 <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/30">NAPC Town Planners Direct</p>
            </div>
        </div>
    );
};
