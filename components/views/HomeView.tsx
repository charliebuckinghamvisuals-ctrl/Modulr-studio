import React from 'react';
import { Box, Smartphone, Zap, Grid, Layers, ShieldCheck, Cpu, Maximize, FileText, CheckCircle2, Sparkles, PenTool, CloudSun, ArrowRight } from 'lucide-react';
import { AppStage } from '../../types';
import { CompareSlider } from '../CompareSlider';
import { Button } from '../Button';
import { DraftingBackground } from '../DraftingBackground';

interface HomeViewProps {
    onOpenEngine: () => void;
    onOpenMaterialStudio: () => void;
    onNavigate?: (stage: AppStage) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onOpenEngine, onOpenMaterialStudio, onNavigate }) => {
    return (
        <div className="min-h-full flex flex-col items-center bg-background relative overflow-x-hidden pt-20 pb-20 w-full">

            {/* Pro Drafting Grid (Disabled for Homepage for clean look) */}
            <DraftingBackground pageName="HOMEPAGE" hideGrid={true} />

            {/* Immersive Scattered Background Gallery */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 select-none">
                <ScatteredBackground />
            </div>

            <div className="max-w-6xl w-full flex flex-col items-center relative z-10 gap-24 px-8">

                {/* 1. Hero Section */}
                <div className="flex flex-col items-center text-center max-w-4xl">
                    <div className="mb-8 px-4 py-1.5 rounded-full glass-panel border border-border text-[9px] font-bold uppercase tracking-[0.2em] text-accent flex items-center gap-2 shadow-xl animate-glow">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                        Architectural Intelligence
                    </div>

                    <div className="flex flex-col items-center mb-8 w-full px-4">
                        <img src="/Logo.png" alt="Modulr Studio Logo" className="h-[24rem] md:h-[32rem] w-auto object-contain drop-shadow-2xl -mt-28 -mb-28 md:-mt-36 md:-mb-36" />
                        <h1 className="text-[5.5vw] sm:text-3xl lg:text-4xl text-accent font-bold block max-w-4xl mx-auto leading-tight mt-6 text-center w-fit inline-block">
                            The pinnacle of AI exterior rendering for garden rooms and annexes.
                        </h1>
                    </div>

                    <p className="text-secondary text-lg md:text-xl max-w-3xl mb-12 font-light leading-relaxed">
                        We bridge the gap between technical planning and photorealistic presentation, ensuring your designs look exactly as they will be built.
                    </p>

                    <div className="flex justify-center">
                        <Button
                            onClick={onOpenEngine}
                            className="px-10 py-5 text-lg shadow-2xl"
                            icon={<Sparkles size={22} />}
                        >
                            Launch Render Engine
                        </Button>
                    </div>
                </div>

                {/* 2. Before/After Demo Slider Section */}
                <div className="w-full space-y-8">
                    <div className="text-center space-y-4 max-w-[100vw] overflow-x-hidden md:max-w-4xl mx-auto px-4">
                        <h2 className="text-[5.5vw] sm:text-3xl lg:text-4xl text-accent font-bold whitespace-nowrap w-fit inline-block">From Plan to Perfection</h2>
                        <p className="text-secondary text-lg">
                            Swipe to see how our engine transforms technical geometry into stunning 4K visualizations—all created within Modulr Studio.
                        </p>
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

                {/* 3. Why Modulr Studio Explanation */}
                <div className="w-full py-16 px-10 md:px-16 rounded-[45px] bg-white/95 border border-slate-300 shadow-[0_20px_50px_rgba(0,0,0,0.08)] relative overflow-hidden backdrop-blur-xl">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-accent/5 blur-[100px] -mr-48 -mt-48 pointer-events-none"></div>
                    <div className="absolute bottom-0 left-0 w-72 h-72 bg-accent/5 blur-[80px] -ml-36 -mb-36 pointer-events-none"></div>

                    <div className="relative z-10 space-y-16">
                        <div className="max-w-3xl">
                            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-accent leading-tight mb-6 w-fit inline-block">
                                Why use Modulr&nbsp;Studio <br />
                                Instead of General AI?
                            </h2>
                            <p className="text-slate-600 text-xl leading-relaxed">
                                Generic AI models like ChatGPT or Gemini are built for art, not architecture. They "hallucinate" details that don't belong, often compromising the structural integrity of your vision.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                            <div className="space-y-4">
                                <div className="bg-accent/10 p-3 rounded-2xl text-accent w-fit border border-accent/10 shadow-sm mb-2">
                                    <ShieldCheck size={24} />
                                </div>
                                <h4 className="text-accent font-bold text-xl">Architectural Logic vs. Art</h4>
                                <p className="text-slate-600 leading-relaxed text-sm">
                                    Don't settle for "creative" guesses. While general AI patterns create beautiful images that can't be built, Modulr follows the strict architectural logic of your technical plan.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-accent/10 p-3 rounded-2xl text-accent w-fit border border-accent/10 shadow-sm mb-2">
                                    <Layers size={24} />
                                </div>
                                <h4 className="text-accent font-bold text-xl">Surgical Material Control</h4>
                                <p className="text-slate-600 leading-relaxed text-sm">
                                    Generic AI changes the whole building when you want one swap. In Modulr, you have surgical control. Change a cladding type or window frame instantly, while the rest of your scene stays perfect.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-accent/10 p-3 rounded-2xl text-accent w-fit border border-accent/10 shadow-sm mb-2">
                                    <Zap size={24} />
                                </div>
                                <h4 className="text-accent font-bold text-xl">Pro-Grade 4K Visualization</h4>
                                <p className="text-slate-600 leading-relaxed text-sm">
                                    Skip the low-res, artistic filters of chat models. Modulr generates high-fidelity, presentation-ready 4K renders designed specifically for clients, brochures, and planning applications.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 4. Dedicated Garden Room AI */}
                <div className="w-full flex flex-col items-center text-center py-12 gap-10">
                    <div className="max-w-2xl space-y-6">
                        <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mx-auto">
                            <Box size={24} />
                        </div>
                        <h2 className="text-4xl font-bold tracking-tight text-accent w-fit inline-block">World's First AI Render Engine for Garden Rooms & Annexes</h2>
                        <p className="text-secondary text-lg leading-relaxed">
                            Modulr Studio is the world's first platform purposefully built for the garden room and annexe industry.
                            We combine deep AI with an understanding of real-world construction standards.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl w-full text-left">
                        <div className="flex items-start gap-4">
                            <div className="mt-1 bg-accent/20 p-1.5 rounded-lg text-accent shrink-0"><Maximize size={18} /></div>
                            <div>
                                <h4 className="text-accent font-bold">CAD-Precision Foundation</h4>
                                <p className="text-secondary text-sm">Your structural drawing is the master. We lock the AI to your specific geometry, ensuring that every pillar and window stays exactly where it was designed to be.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <div className="mt-1 bg-accent/20 p-1.5 rounded-lg text-accent shrink-0"><Cpu size={18} /></div>
                            <div>
                                <h4 className="text-accent font-bold">Industry-Trained Specifics</h4>
                                <p className="text-secondary text-sm">Trained on Western Red Cedar, Siberian Larch, and Anthracite Grey profiles. We render with the knowledge of materials used in real-world UK construction projects.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 5. Full Features Grid */}
                <div className="w-full space-y-12 pb-24">
                    <div className="text-center">
                        <h2 className="text-4xl font-bold tracking-tight text-accent w-fit inline-block mb-4">Purpose-Built for Garden Rooms</h2>
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

                        </div>
                    </div>
            </div >
        </div >
    );
};

const ScatteredBackground: React.FC = () => {
    const [scrollY, setScrollY] = React.useState(0);

    React.useEffect(() => {
        const handleScroll = () => setScrollY(window.scrollY);
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const galleryImages = [
        // Section 1: Hero
        { src: "/gallery-4.jpg.png", top: "-2%", left: "-12%", size: "w-[48rem]", rotate: "-8deg", speed: 0.05 },
        { src: "/gallery-8.jpg.png", top: "2%", right: "-15%", size: "w-[52rem]", rotate: "6deg", speed: 0.1 },
        { src: "/gallery-1.jpg.png", top: "15%", left: "5%", size: "w-[45rem]", rotate: "12deg", speed: 0.08 },
        
        // Section 2: Before/After & Comparison
        { src: "/gallery-2.jpg.png", top: "45%", right: "-5%", size: "w-[50rem]", rotate: "-4deg", speed: 0.12 },
        { src: "/gallery-3.jpg.png", top: "60%", left: "-8%", size: "w-[42rem]", rotate: "15deg", speed: 0.04 },
        { src: "/gallery-5.jpg.png", top: "75%", right: "2%", size: "w-[48rem]", rotate: "-9deg", speed: 0.14 },
        { src: "/gallery-7.jpg.png", top: "90%", left: "20%", size: "w-[38rem]", rotate: "5deg", speed: 0.06 },

        // Section 3: Why Modulr / Features
        { src: "/gallery-9.jpg.png", top: "120%", left: "-10%", size: "w-[55rem]", rotate: "4deg", speed: 0.15 },
        { src: "/gallery-10.jpg.png", top: "135%", right: "-12%", size: "w-[58rem]", rotate: "-12deg", speed: 0.07 },
        { src: "/gallery-11.jpg.png", top: "155%", left: "10%", size: "w-[48rem]", rotate: "8deg", speed: 0.11 },
        { src: "/gallery-12.jpg.png", top: "180%", right: "5%", size: "w-[45rem]", rotate: "-6deg", speed: 0.09 },
        
        // Section 4: Garden Rooms Specifics
        { src: "/gallery-13-after.jpg.png", top: "220%", left: "-15%", size: "w-[52rem]", rotate: "-4deg", speed: 0.14 },
        { src: "/gallery-14-after.jpg.png", top: "245%", right: "-8%", size: "w-[55rem]", rotate: "10deg", speed: 0.08 },
        { src: "/gallery-15-after.jpg.png", top: "270%", left: "5%", size: "w-[48rem]", rotate: "-15deg", speed: 0.12 },
        
        // Section 5: Features Grid
        { src: "/gallery-16-after.jpg.png", top: "320%", right: "-10%", size: "auto w-[50rem]", rotate: "8deg", speed: 0.05 },
        { src: "/gallery-17-after.jpg.png", top: "350%", left: "-5%", size: "w-[52rem]", rotate: "-10deg", speed: 0.1 },
        { src: "/gallery-12-after.jpg.png", top: "380%", right: "12%", size: "w-[48rem]", rotate: "15deg", speed: 0.07 }
    ];

    return (
        <div className="relative w-full h-full">
            {galleryImages.map((img, i) => (
                <ParallaxImage 
                    key={i} 
                    {...img} 
                    currentScroll={scrollY} 
                />
            ))}
        </div>
    );
};

interface ParallaxImageProps {
    src: string;
    top: string;
    left?: string;
    right?: string;
    size: string;
    rotate: string;
    speed: number;
    currentScroll: number;
}

const ParallaxImage: React.FC<ParallaxImageProps> = ({ src, top, left, right, size, rotate, speed, currentScroll }) => {
    const yOffset = currentScroll * speed;
    
    return (
        <div 
            className={`absolute ${size} h-auto opacity-[0.25] transition-transform duration-700 ease-out animate-in fade-in duration-1000`}
            style={{ 
                top, 
                left: left || 'auto', 
                right: right || 'auto',
                transform: `translateY(${-yOffset}px) rotate(${rotate})`,
                filter: 'grayscale(15%)'
            }}
        >
            <img 
                src={src} 
                alt="" 
                className="w-full h-auto rounded-[4.5rem] shadow-[0_50px_100px_rgba(0,0,0,0.2)]" 
            />
        </div>
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
        <h3 className="text-accent font-bold text-lg mb-2">{title}</h3>
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
            <Button
                onClick={(e) => { e.stopPropagation(); onAction(); }}
                className="mt-6 w-full py-2.5 text-xs uppercase tracking-widest"
            >
                {actionLabel}
            </Button>
        )}
    </div>
);
