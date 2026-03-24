import React from 'react';
import { Box, Smartphone, Zap, Grid, Layers, ShieldCheck, Cpu, Maximize, FileText, CheckCircle2, Sparkles, PenTool, CloudSun } from 'lucide-react';
import { CompareSlider } from '../CompareSlider';

interface HomeViewProps {
    onOpenEngine: () => void;
    onOpenMaterialStudio: () => void; // Changed from onOpenSceneStudio
}

export const HomeView: React.FC<HomeViewProps> = ({ onOpenEngine, onOpenMaterialStudio }) => { // Changed from onOpenSceneStudio
    return (
        <div className="min-h-full flex flex-col items-center bg-background relative overflow-x-hidden pt-20 pb-20 w-full">

            {/* Ambient Background Glows */}
            <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-accent/10 rounded-full blur-[120px] pointer-events-none"></div>
            <div className="absolute bottom-1/4 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none"></div>

            <div className="max-w-6xl w-full flex flex-col items-center relative z-10 gap-24 px-8">

                {/* 1. Hero Section */}
                <div className="flex flex-col items-center text-center max-w-4xl">
                    <div className="mb-8 px-4 py-1.5 rounded-full glass-panel border border-border text-[9px] font-bold uppercase tracking-[0.2em] text-accent flex items-center gap-2 shadow-xl animate-glow">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                        Architectural Intelligence
                    </div>

                    <h1 className="flex flex-col items-center mb-8 w-full px-4">
                        <img src="/Logo.png" alt="Modulr Studio Logo" className="h-[24rem] md:h-[32rem] w-auto object-contain drop-shadow-2xl -mt-28 -mb-28 md:-mt-36 md:-mb-36" />
                        <span className="text-2xl md:text-3xl text-secondary font-medium tracking-normal block max-w-2xl mx-auto leading-tight mt-6">
                            The pinnacle of AI exterior rendering for garden rooms and annexes.
                        </span>
                    </h1>

                    <p className="text-secondary text-lg md:text-xl max-w-3xl mb-12 font-light leading-relaxed">
                        We bridge the gap between technical planning and photorealistic presentation, ensuring your designs look exactly as they will be built.
                    </p>

                    <div className="flex justify-center">
                        <button
                            onClick={onOpenEngine}
                            className="px-10 py-5 bg-primary text-background font-bold rounded-2xl hover:shadow-[0_20px_40px_rgba(255,255,255,0.1)] hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-3 text-lg"
                        >
                            <Zap size={22} className="text-background" />
                            Launch Studio
                        </button>
                    </div>
                </div>

                {/* 2. Before/After Demo Slider Section */}
                <div className="w-full space-y-8">
                    <div className="text-center space-y-4 max-w-[100vw] overflow-x-hidden md:max-w-4xl mx-auto px-4">
                        <h2 className="text-[5.5vw] sm:text-3xl lg:text-4xl text-primary whitespace-nowrap">From Plan to Perfection</h2>
                        <p className="text-secondary text-lg">Swipe to see how our engine transforms technical geometry into stunning 4K visualizations.</p>
                    </div>
                    <div className="w-[calc(100vw-0px)] relative left-1/2 -translate-x-1/2 rounded-none overflow-hidden border-y border-border bg-surface/10 backdrop-blur-md shadow-2xl relative group">
                        <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <CompareSlider
                            beforeImage="/demo-line-drawing.png"
                            afterImage="/demo-render.png"
                            beforeLabel="Structural Plan"
                            afterLabel="Proposed Concept"
                        />
                    </div>
                </div>

                {/* 3. Why Modulr Studio vs General AI */}
                <div className="w-full py-16 px-10 md:px-16 rounded-[45px] bg-white/95 border border-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.08)] relative overflow-hidden backdrop-blur-xl">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-accent/5 blur-[100px] -mr-48 -mt-48 pointer-events-none"></div>
                    <div className="absolute bottom-0 left-0 w-72 h-72 bg-blue-500/5 blur-[80px] -ml-36 -mb-36 pointer-events-none"></div>

                    <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                        <div className="space-y-8">
                            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 leading-tight">
                                Why Modulr Studio <br />
                                <span className="text-accent">Beat General AI</span>
                            </h2>
                            <p className="text-slate-600 text-lg leading-relaxed max-w-xl">
                                Don't settle for generic prompt-to-image AI like ChatGPT or Gemini. Those tools guess at architecture; we master it.
                            </p>

                            <div className="space-y-8">
                                <div className="flex gap-5">
                                    <div className="mt-1 bg-accent/10 p-2.5 rounded-2xl text-accent shrink-0 shadow-sm border border-accent/10"><CheckCircle2 size={24} /></div>
                                    <div>
                                        <h4 className="text-slate-900 font-bold text-xl mb-2">Granular Material Control</h4>
                                        <p className="text-slate-600 leading-relaxed">Directly modify specific materials—Siberian Larch, Anthracite Grey, or Cedar Cladding—with zero guesswork. General AI often changes the whole building when you only want to swap one material.</p>
                                    </div>
                                </div>
                                <div className="flex gap-5">
                                    <div className="mt-1 bg-accent/10 p-2.5 rounded-2xl text-accent shrink-0 shadow-sm border border-accent/10"><CheckCircle2 size={24} /></div>
                                    <div>
                                        <h4 className="text-slate-900 font-bold text-xl mb-2">Geometry-First Processing</h4>
                                        <p className="text-slate-600 leading-relaxed">Our AI analyzes your structural line drawings first. It understands your load-bearing pillars, window positions, and roof angles as technical data, not just artistic shapes.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 border border-slate-100 rounded-[35px] p-10 relative shadow-inner">
                            <div className="mb-8 pb-6 border-b border-slate-200 flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Feature Comparison</span>
                                <div className="px-4 py-1.5 bg-accent text-white rounded-full text-[10px] font-black tracking-widest uppercase">THE MODULR ADVANTAGE</div>
                            </div>

                            <table className="w-full text-left">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                        <th className="pb-6 font-bold">Feature</th>
                                        <th className="pb-6 font-bold text-center">ChatGPT/Gemini</th>
                                        <th className="pb-6 font-bold text-center text-accent">Modulr Studio</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    <tr className="border-b border-slate-100">
                                        <td className="py-5 text-slate-900 font-bold">Material Specificity</td>
                                        <td className="py-5 text-center text-slate-400 italic font-medium">Random Guessing</td>
                                        <td className="py-5 text-center text-accent font-black">100% Control</td>
                                    </tr>
                                    <tr className="border-b border-slate-100">
                                        <td className="py-5 text-slate-900 font-bold">Structural Accuracy</td>
                                        <td className="py-5 text-center text-slate-400 italic font-medium">Artistic Hallucination</td>
                                        <td className="py-5 text-center text-accent font-black">CAD Foundation</td>
                                    </tr>
                                    <tr className="border-b border-slate-100">
                                        <td className="py-5 text-slate-900 font-bold">Render Quality</td>
                                        <td className="py-5 text-center text-slate-400 italic font-medium">Variable (720p-1K)</td>
                                        <td className="py-5 text-center text-accent font-black">Architectural 4K</td>
                                    </tr>
                                    <tr>
                                        <td className="py-5 text-slate-900 font-bold">Repeatability</td>
                                        <td className="py-5 text-center text-slate-400 italic font-medium">Always Different</td>
                                        <td className="py-5 text-center text-accent font-black">Versioned Logic</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* 4. Dedicated Garden Room AI */}
                <div className="w-full flex flex-col items-center text-center py-12 gap-10">
                    <div className="max-w-2xl space-y-6">
                        <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mx-auto">
                            <Box size={24} />
                        </div>
                        <h2 className="text-4xl font-black tracking-tight text-primary">Dedicated Garden Room AI</h2>
                        <p className="text-secondary text-lg leading-relaxed">
                            Modulr Studio is the only platform purposefully built for the garden room industry.
                            We don't just render buildings. We understand timber construction, glazing ratios, and specialist cladding systems.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl w-full text-left">
                        <div className="flex items-start gap-4">
                            <div className="mt-1 bg-accent/20 p-1.5 rounded-lg text-accent shrink-0"><Maximize size={18} /></div>
                            <div>
                                <h4 className="text-primary font-bold">Geometry-Led Rendering</h4>
                                <p className="text-secondary text-sm">We use your structural line drawing as the foundation. Your CAD geometry stays the master, not the AI's interpretation of it.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <div className="mt-1 bg-accent/20 p-1.5 rounded-lg text-accent shrink-0"><ShieldCheck size={18} /></div>
                            <div>
                                <h4 className="text-primary font-bold">Industry-Trained Materials</h4>
                                <p className="text-secondary text-sm">Windows, doors, and rooflines are rendered with knowledge of real UK garden room construction standards, not generic AI texture guessing.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 5. Full Features Grid */}
                <div className="w-full space-y-12 pb-24">
                    <div className="text-center">
                        <h2 className="text-4xl font-black tracking-tight text-primary mb-4">Purpose-Built for Garden Rooms</h2>
                        <p className="text-secondary max-w-2xl mx-auto">Every feature is designed around the specific needs of the UK garden room and annexe industry, not adapted from generic tools.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 text-left w-full">
                        <FeatureCard
                            icon={<PenTool size={28} />}
                            title="Line-to-Render Engine"
                            description="Upload a CAD export or structural line drawing and receive a photorealistic 4K visualisation in seconds, with your geometry as the foundation."
                        />
                        <FeatureCard
                            icon={<Sparkles size={28} />}
                            title="Refinement Studio"
                            description="Change the weather, swap the environment, update cladding and materials, or add people and pets to bring your renders to life. Powerful AI-driven edits with a simple text prompt."
                        />
                        <FeatureCard
                            icon={<Grid size={28} />}
                            title="Material Studio"
                            description="Upload a photo of any surface and our AI extracts its material profile (colour, texture, finish) and applies it faithfully across your entire rendered build."
                        />
                        <FeatureCard
                            icon={<Box size={28} />}
                            title="AI Material Intelligence"
                            description="Our engine identifies real materials. Trained on Siberian Larch, Western Red Cedar, Anthracite Grey and more, it reproduces the exact texture, grain and finish your clients will see in real life."
                        />
                        <FeatureCard
                            icon={<Zap size={28} />}
                            title="Architectural Intelligence"
                            description="Trained on UK garden room construction: timber frame, SIPs, glazing systems, flat and pitched roofs. Our engine understands the details that matter to your clients."
                        />
                        <FeatureCard
                            icon={<CloudSun size={28} />}
                            title="Dynamic Lighting Scenes"
                            description="Seamlessly adjust the time of day and atmospheric conditions. From bright sunlit afternoons to moody dusk shots with warm interior glows, instantly visualize your garden room in any light."
                        />
                    </div>
                </div>
            </div >
        </div >
    );
};

interface FeatureCardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    features?: string[];
    actionLabel?: string;
    onAction?: () => void;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description, features, actionLabel, onAction }) => (
    <div className="p-10 rounded-[35px] glass-panel bg-white/95 shadow-[0_15px_40px_rgba(0,0,0,0.1)] relative overflow-hidden group border border-slate-300 hover:border-accent/60 transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_25px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-24 h-24 bg-accent/10 rounded-full blur-2xl -mr-8 -mt-8 group-hover:bg-accent/20 transition-colors"></div>
        <div className="text-accent mb-8 bg-accent/10 w-fit p-4 rounded-2xl border border-accent/20 group-hover:bg-accent group-hover:text-white transition-all duration-500 group-hover:scale-110 shadow-sm">
            {icon}
        </div>
        <h3 className="text-primary font-bold text-lg mb-2">{title}</h3>
        <p className="text-secondary text-sm leading-relaxed">{description}</p>

        {features && (
            <ul className="mt-4 space-y-2 text-left w-full relative z-10">
                {features.map((feature, i) => (
                    <li key={i} className="text-xs text-secondary flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent/50 mt-1 shrink-0"></div>
                        {feature}
                    </li>
                ))}
            </ul>
        )}

        {actionLabel && onAction && (
            <button
                onClick={(e) => { e.stopPropagation(); onAction(); }}
                className="mt-6 w-full py-2.5 rounded-xl bg-accent/10 border border-accent/20 text-accent font-bold text-xs uppercase tracking-widest hover:bg-accent hover:text-white transition-all duration-300 relative z-10"
            >
                {actionLabel}
            </button>
        )}
    </div>
);
