import React from 'react';
import {
    Sparkles, ClipboardCheck, Gift, ArrowRight, Box, Footprints, Layers,
    Ruler, Sofa, Users, FileCheck, FolderOpen,
} from 'lucide-react';
import { AppStage } from '../../types';
import { CompareSlider } from '../CompareSlider';
import { Button } from '../Button';
import { DraftingBackground } from '../DraftingBackground';
import { HeroVideoCarousel } from '../HeroVideoCarousel';
import { WalkthroughShowcase } from '../WalkthroughShowcase';

/**
 * The three moves the product is sold on, in the order a job runs. Shown
 * beside the walkthrough recording, which is the proof of the middle one.
 */
const WORKFLOW = [
    {
        icon: <Box size={20} />,
        step: 'Design it',
        title: 'Build the room to real dimensions',
        body: 'Box or gable, eaves and ridge in millimetres, cladding per elevation, bi-fold, sliding, French or hinged sets, a covered outdoor section, internal walls, a kitchen, a bathroom, a bed. The price updates as you go.',
    },
    {
        icon: <Footprints size={20} />,
        step: 'Walk it',
        title: 'Walk outside, then step in',
        body: 'Walk Outside puts you in the garden facing the building. Walk Inside puts you in the room. Open the doors, look up at the lighting plan, click a wall or a worktop and change the finish without stopping.',
    },
    {
        icon: <Layers size={20} />,
        step: 'Render it',
        title: 'Send any view to the Render Engine',
        body: 'The engine is handed the configured building - footprint, roof, every door and window, the cladding on each face - not just a screenshot. What comes back is a pro-level CGI visual of the design you actually priced.',
    },
];

/**
 * Why a garden room or annexe company picks this over a generic tool. Each
 * reason is a thing the product does, stated plainly, not a slogan.
 */
const REASONS = [
    {
        icon: <Ruler size={20} />,
        title: 'It is built around your product',
        body: 'Eaves and ridge heights, cladding board widths, composite colours, anthracite frames, decking, canopies, picture-frame fronts and a covered outdoor bay. The configurator knows what a garden room is made of, so you are never bending a house tool to fit.',
    },
    {
        icon: <Layers size={20} />,
        title: 'The render is honest because the geometry is real',
        body: 'The Render Engine is told exactly what you configured - the door count, the sets, the cladding on each elevation. It cannot quietly swap a bi-fold for a window or move a door, because it is not guessing from a picture.',
    },
    {
        icon: <Sofa size={20} />,
        title: 'You can sell the inside, not just the outside',
        body: 'Kitchens with real units, worktops and taps. Bathrooms, bedrooms, offices, games rooms. Lighting set out on a ceiling plan. A client can stand in the annexe you are quoting before a single panel is cut.',
    },
    {
        icon: <Users size={20} />,
        title: 'Design live, on the call',
        body: 'Change the cladding while the client watches. Drag the ridge down and see what it saves. Walk them through the room and let them pick the worktop. Decisions happen in the meeting, not a week later by email.',
    },
    {
        icon: <FileCheck size={20} />,
        title: 'Planning is built in, by planning people',
        body: 'Modulr Studio is made by NAPC, the UK planning consultancy dedicated to garden rooms and annexes. The configurator flags permitted development as you set the height, the free Planning Checker tests the plot, and the PDF pack carries the PD checklist.',
    },
    {
        icon: <FolderOpen size={20} />,
        title: 'One job, one place',
        body: 'Saved designs, renders, the PDF pack and the client all sit against the project. Send one read-only proposal link instead of six attachments. Come back to last year\'s scheme for a returning customer in seconds.',
    },
];

interface HomeViewProps {
    onOpenEngine: () => void;
    onOpenMaterialStudio: () => void;
    onNavigate?: (stage: AppStage) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onOpenEngine, onOpenMaterialStudio, onNavigate }) => {
    // No page scrollbar gutter beside the full-bleed hero (see index.css).
    React.useEffect(() => {
        document.documentElement.classList.add('home-fullbleed');
        return () => document.documentElement.classList.remove('home-fullbleed');
    }, []);
    return (
        <div className="min-h-full flex flex-col items-center bg-background relative overflow-x-hidden pt-16 pb-20 w-full">

            {/* Pro Drafting Grid (Disabled for Homepage for clean look) */}
            <DraftingBackground pageName="HOMEPAGE" hideGrid={true} />

            {/*
              Hero, FULL BLEED at the top of the page (Charlie, 17 Sep 2026):
              the work is the first thing seen, edge to edge, the headline and
              the buttons follow. The height is set from the viewport width and
              capped so the headline is still reachable without scrolling far.
              The six clips are up to 1920 wide, so on a retina laptop the
              frame is drawn a little above its source; that is the trade for
              the impact of the full width, taken knowingly.
            */}
            <div className="w-full relative z-10 -mt-16 mb-16">
                <HeroVideoCarousel fullBleed />
            </div>

            <div className="max-w-6xl w-full flex flex-col items-center relative z-10 gap-24 px-8">

                {/* Open tester offer (14 Sep 2026). Sits above the hero so it
                    is the first thing read. The numbers are the real
                    allowance the server enforces - 40 renders in 7 days - not
                    a marketing round-up, so the panel behind "Start free"
                    says the same thing. */}
                <button
                    type="button"
                    onClick={onOpenEngine}
                    className="w-full -mb-12 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 rounded-2xl bg-accent text-white px-5 py-3 shadow-lg hover:bg-accent-hover transition-colors text-left"
                >
                    <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider bg-white/15 rounded-full px-3 py-1">
                        <Gift size={14} />
                        Limited-time offer
                    </span>
                    <span className="text-sm sm:text-base font-semibold">
                        Free 7-day access to Modulr Studio: 40 AI renders, no card needed.
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm font-bold underline underline-offset-4">
                        Start free <ArrowRight size={16} />
                    </span>
                </button>

                {/* 1. Hero Section. The eyebrow badge that used to open this
                    block now sits on the hero video below, so it is not said
                    twice within one screen. */}
                <div className="flex flex-col items-center text-center max-w-4xl">
                    {/* No wordmark here. The header carries the logo a few
                        pixels above this, so a second one - at 32rem, the
                        largest thing on the page - meant the brand name was
                        said twice on one screen, and it was the first thing you
                        saw as the splash lifted. The headline opens the page
                        instead. */}
                    <div className="flex flex-col items-center mb-8 w-full px-4 pt-4">
                        <h1 className="text-[5.5vw] sm:text-3xl lg:text-4xl text-accent font-bold block max-w-4xl mx-auto leading-tight text-center w-fit inline-block">
                            Design it in 3D. Walk through it. Render it like a pro.
                        </h1>
                    </div>

                    <p className="text-secondary text-lg md:text-xl max-w-3xl mb-12 font-light leading-relaxed">
                        Modulr Studio is the design-to-render platform built for garden room and annexe
                        providers. Configure the building to real dimensions, walk a client around the
                        outside and through the inside, then send any view to the Render Engine for pro-level CGI
                        visualisation of the design you actually priced.
                    </p>

                    <div className="flex flex-wrap justify-center gap-4">
                        {onNavigate && (
                            <Button
                                onClick={() => onNavigate(AppStage.DESIGNER)}
                                className="px-10 py-5 text-lg shadow-2xl"
                                icon={<Box size={22} />}
                            >
                                Open the 3D Configurator
                            </Button>
                        )}
                        <Button
                            variant="secondary"
                            onClick={onOpenEngine}
                            className="px-10 py-5 text-lg"
                            icon={<Sparkles size={22} />}
                        >
                            Launch Render Engine
                        </Button>
                    </div>
                </div>

                {/* 2. The workflow, with the walkthrough recording as proof.
                    This is the thing the product is sold on - design, walk,
                    render - so it comes before any single feature and before
                    the before/after slider. The recording is a real screen
                    capture of the configurator, not a mock-up. */}
                <div className="w-full space-y-10">
                    <div className="text-center space-y-4 max-w-4xl mx-auto px-4">
                        <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-accent">The workflow</span>
                        <h2 className="text-[5.5vw] sm:text-3xl lg:text-4xl text-accent font-bold w-fit inline-block">
                            One model, from the first measurement to the finished visual.
                        </h2>
                        <p className="text-secondary text-lg">
                            Other tools do one of these. Modulr Studio does all three from the same
                            building, so the walkthrough, the price, the drawings and the render can
                            never disagree with each other.
                        </p>
                    </div>

                    <WalkthroughShowcase />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {WORKFLOW.map((w, i) => (
                            <div key={w.step} className="p-7 rounded-[2rem] border border-border bg-white/60 backdrop-blur-xl shadow-lg shadow-black/[0.03] space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-accent/8 border border-accent/15 flex items-center justify-center text-accent shrink-0">
                                        {w.icon}
                                    </div>
                                    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary/50">
                                        {String(i + 1).padStart(2, '0')} · {w.step}
                                    </span>
                                </div>
                                <h3 className="text-accent font-bold text-lg leading-snug">{w.title}</h3>
                                <p className="text-secondary text-sm leading-relaxed">{w.body}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 3. Before/After Demo Slider Section */}
                <div className="w-full space-y-8">
                    <div className="text-center space-y-4 max-w-[100vw] overflow-x-hidden md:max-w-4xl mx-auto px-4">
                        <h2 className="text-[5.5vw] sm:text-3xl lg:text-4xl text-accent font-bold w-fit inline-block">From line work to finished visual</h2>
                        <p className="text-secondary text-lg">
                            The Render Engine also works from what you already have. Drag the slider to see
                            a structural drawing become a 4K visual, with the geometry kept exactly where it
                            was drawn.
                        </p>
                    </div>
                    <div className="w-[calc(100vw-0px)] relative left-1/2 -translate-x-1/2 rounded-none overflow-hidden border-y border-border bg-surface/10 backdrop-blur-md shadow-2xl relative group">
                        <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <CompareSlider
                            beforeImage="/demo-line-drawing.jpg"
                            afterImage="/demo-render.jpg"
                            beforeLabel="Structural Plan"
                            afterLabel="Proposed Concept"
                        />
                    </div>
                </div>
            </div>

            {/* Wide Section for Overview Grid - Broken out of max-w-6xl */}
            <div className="w-full max-w-[1500px] mx-auto px-6 my-16 relative z-10">
                {/* Showcase. Nothing argues for the product as well as its own
                    output, so the work appears before the feature list. */}
                <section className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
                    <div className="flex items-baseline justify-between gap-4 flex-wrap">
                        <h2 className="text-2xl font-bold text-accent tracking-tight">Made with Modulr Studio</h2>
                        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary/60">
                            Every image generated in-app
                        </span>
                    </div>

                    {/* Uniform tiles. The staggered offsets made the row look
                        misaligned rather than dynamic, so every tile is now the
                        same size on a single baseline. */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {['/gallery-6.jpg', '/gallery-5.jpg', '/gallery-9.jpg', '/gallery-12.jpg'].map(src => (
                            <div
                                key={src}
                                className="aspect-[4/5] rounded-3xl overflow-hidden border border-border bg-slate-100 shadow-lg group"
                            >
                                <img
                                    src={src}
                                    alt="Architectural visualisation produced with Modulr Studio"
                                    loading="lazy"
                                    className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700"
                                />
                            </div>
                        ))}
                    </div>
                </section>

                {/* Why providers choose it. Six concrete reasons, each one a
                    thing the product does. This replaced a single "ultimate
                    quoting package" banner that said a lot and showed nothing. */}
                <section className="mt-24 space-y-10 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300">
                    <div className="text-center max-w-3xl mx-auto space-y-4">
                        <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-accent">Why Modulr Studio</span>
                        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-accent">
                            The go-to app for garden room and annexe providers.
                        </h2>
                        <p className="text-secondary text-lg leading-relaxed">
                            Generic design software was made for houses. Generic AI was made for
                            pictures. Modulr Studio was made for the people who sell, design and build
                            garden rooms and annexes, and it shows in every control.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {REASONS.map(r => (
                            <div key={r.title} className="p-8 rounded-[2rem] border border-border bg-white/60 backdrop-blur-xl shadow-lg shadow-black/[0.03] space-y-3">
                                <div className="w-11 h-11 rounded-2xl bg-accent/8 border border-accent/15 flex items-center justify-center text-accent">
                                    {r.icon}
                                </div>
                                <h3 className="text-accent font-bold text-lg leading-snug">{r.title}</h3>
                                <p className="text-secondary text-sm leading-relaxed">{r.body}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            {/* Resume Main Container */}
            <div className="max-w-6xl w-full flex flex-col items-center relative z-10 gap-24 px-8">
                {/* 4. Dedicated Garden Room AI */}
                <div className="w-full flex flex-col items-center text-center py-12 gap-10">
                    <div className="max-w-2xl space-y-6">
                        <h2 className="text-4xl font-bold tracking-tight text-accent w-fit inline-block">The UK's first design-to-render platform for garden rooms and annexes</h2>
                        <p className="text-secondary text-lg leading-relaxed">
                            Modulr Studio is the first platform built purposefully for the garden room and
                            annexe industry: a configurator that knows the product, a walkthrough for the
                            client, and a render engine that understands real UK construction.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl w-full text-left">
                        <div className="flex items-start gap-4">
                            <Ruler size={18} className="text-accent shrink-0 mt-1" />
                            <div>
                                <h4 className="text-accent font-bold">Real geometry in, honest render out</h4>
                                <p className="text-secondary text-sm">Whether the source is the 3D Configurator or your own structural drawing, the AI is locked to the geometry. Every door, window and ridge line stays exactly where it was designed to be.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <Layers size={18} className="text-accent shrink-0 mt-1" />
                            <div>
                                <h4 className="text-accent font-bold">Industry-trained specifics</h4>
                                <p className="text-secondary text-sm">Western Red Cedar, Siberian Larch, composite boards, anthracite and black frames, EPDM and sedum roofs. The engine renders with the knowledge of materials used on real UK garden room builds.</p>
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
                                title="3D Configurator"
                                description="Build the room to real dimensions in the browser: box or gable, eaves and ridge in millimetres, cladding per elevation, bi-fold, sliding, French or hinged sets, skylights, a covered outdoor section, decking and canopies. Live costing as you go, and a permitted development flag as you set the height."
                                badge="Beta"
                            />
                            <FeatureCard
                                title="Walk Inside, Walk Outside"
                                description="Two buttons, two walks. Stand in the garden facing the building, or in the room looking out. Doors open, walls stop you, and a click on any wall, floor, frame or unit changes its finish while you keep walking."
                                badge="New"
                            />
                            <FeatureCard
                                title="Interiors, kitchens and lighting"
                                description="Internal walls with doors that travel with them. Kitchen runs with real units, corner units, worktops, taps and veneers. Bathrooms, beds, desks, sofas, games. Spotlights and pendants set out on their own ceiling plan."
                                badge="New"
                            />
                            <FeatureCard
                                title="Render Engine"
                                description="Send any configurator view, CAD export or line drawing and get a pro-level 4K CGI visual back, with your geometry as the foundation. From the configurator it is handed the full specification, so the render matches the design you priced."
                            />
                            <FeatureCard
                                title="Weather Lab"
                                description="Change the weather, season and atmosphere of any render. Show the same scheme in July sun or January frost, while the building itself stays exactly as designed."
                            />
                            <FeatureCard
                                title="Material Studio"
                                description="Upload a photo of any surface and our AI extracts its material profile (colour, texture, finish) and applies it faithfully across your entire rendered build."
                            />
                            <FeatureCard
                                title="Architectural Intelligence"
                                description="Trained on UK garden room construction: timber frame, SIPs, glazing systems, flat and pitched roofs, and the real materials - Siberian Larch, Western Red Cedar, composite boards, anthracite frames - reproduced with the grain and finish your clients will see."
                            />
                            <FeatureCard
                                title="Animation Studio"
                                description="Turn a finished render into a short cinematic clip. A slow push in, a gentle pan, a breeze through the planting-a moving hero for your website or a social post, from a still you already have."
                                badge="New"
                            />
                            <FeatureCard
                                title="Projects & Client Sharing"
                                description="Every client, address, value and file kept together against the job. Send a read-only proposal link instead of six attachments, with your contact details never leaving your account."
                                badge="New"
                            />
                            <FeatureCard
                                title="Planning Checker"
                                description="Answer a few questions about the plot and find out whether a scheme reads as permitted development or needs a full application-with the limits it was measured against, not just a verdict."
                                badge="Free"
                            />
                        </div>
                    </div>

                {/* 6. Free Planning Checker. Deliberately after the feature grid
                    rather than in it - it is the only thing here that costs
                    nothing and needs no account, and that is worth stating
                    plainly rather than as one tile among nine. */}
                <div className="w-full pb-24">
                    <div className="glass-panel p-10 md:p-14 rounded-[2.5rem] border border-border bg-gradient-to-br from-white/80 to-accent/5 backdrop-blur-3xl overflow-hidden relative text-center">
                        <div className="absolute top-0 left-0 w-96 h-96 bg-accent/5 blur-[100px] -ml-48 -mt-48 pointer-events-none"></div>
                        <div className="space-y-5 relative z-10 max-w-3xl mx-auto">
                            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-accent">Free, no account needed</span>
                            <h3 className="text-accent font-bold text-3xl">Will it need planning permission?</h3>
                            <p className="text-slate-600 leading-relaxed text-lg">
                                Answer a few questions about the plot, the height and the boundary, and the Planning Checker tells you whether the scheme is likely to fall under permitted development or need a full application. It shows the limits it measured you against, so you can take the answer to a client rather than just to yourself.
                            </p>
                            <p className="text-slate-500 text-sm">
                                Built by NAPC, the UK's only planning consultancy dedicated to garden rooms and annexes. An indication, not a determination-we can confirm it in writing when it matters.
                            </p>
                            {onNavigate && (
                                <div className="flex justify-center pt-2">
                                    <Button
                                        onClick={() => onNavigate(AppStage.PLANNING_CHECKER)}
                                        className="px-10 py-4"
                                        icon={<ClipboardCheck size={20} />}
                                    >
                                        Check a scheme
                                    </Button>
                                </div>
                            )}
                        </div>
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
        { src: "/gallery-4.jpg", top: "-2%", left: "-12%", size: "w-[48rem]", rotate: "-8deg", speed: 0.05 },
        { src: "/gallery-8.jpg", top: "2%", right: "-15%", size: "w-[52rem]", rotate: "6deg", speed: 0.1 },
        { src: "/gallery-1.jpg", top: "15%", left: "5%", size: "w-[45rem]", rotate: "12deg", speed: 0.08 },
        
        // Section 2: Before/After & Comparison
        { src: "/gallery-2.jpg", top: "45%", right: "-5%", size: "w-[50rem]", rotate: "-4deg", speed: 0.12 },
        { src: "/gallery-6.jpg", top: "60%", left: "-8%", size: "w-[42rem]", rotate: "15deg", speed: 0.04 },
        { src: "/gallery-5.jpg", top: "75%", right: "2%", size: "w-[48rem]", rotate: "-9deg", speed: 0.14 },
        { src: "/gallery-7.jpg", top: "90%", left: "20%", size: "w-[38rem]", rotate: "5deg", speed: 0.06 },

        // Section 3: Why Modulr / Features
        { src: "/gallery-9.jpg", top: "120%", left: "-10%", size: "w-[55rem]", rotate: "4deg", speed: 0.15 },
        { src: "/gallery-10.jpg", top: "135%", right: "-12%", size: "w-[58rem]", rotate: "-12deg", speed: 0.07 },
        { src: "/gallery-11.jpg", top: "155%", left: "10%", size: "w-[48rem]", rotate: "8deg", speed: 0.11 },
        { src: "/gallery-12.jpg", top: "180%", right: "5%", size: "w-[45rem]", rotate: "-6deg", speed: 0.09 },
        
        // Section 4: Garden Rooms Specifics
        { src: "/gallery-13-after.jpg", top: "220%", left: "-15%", size: "w-[52rem]", rotate: "-4deg", speed: 0.14 },
        { src: "/gallery-14-after.jpg", top: "245%", right: "-8%", size: "w-[55rem]", rotate: "10deg", speed: 0.08 },
        { src: "/gallery-15-after.jpg", top: "270%", left: "5%", size: "w-[48rem]", rotate: "-15deg", speed: 0.12 },
        
        // Section 5: Features Grid
        { src: "/gallery-16-after.jpg", top: "320%", right: "-10%", size: "auto w-[50rem]", rotate: "8deg", speed: 0.05 },
        { src: "/gallery-17-after.jpg", top: "350%", left: "-5%", size: "w-[52rem]", rotate: "-10deg", speed: 0.1 },
        { src: "/gallery-12-after.jpg", top: "380%", right: "12%", size: "w-[48rem]", rotate: "15deg", speed: 0.07 }
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
    title: string;
    description: string;
    features?: string[];
    actionLabel?: string;
    onAction?: () => void;
    badge?: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ title, description, features, actionLabel, onAction, badge }) => (
    <div className="p-10 rounded-[35px] glass-panel bg-white/95 shadow-[0_15px_40px_rgba(0,0,0,0.1)] relative overflow-hidden group border border-slate-300 hover:border-accent/60 transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_25px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl h-full flex flex-col justify-between">
        {badge && (
            <span className="absolute top-6 right-6 text-[9px] font-bold uppercase tracking-wider bg-accent/10 text-accent border border-accent/20 px-3 py-1 rounded-full z-10">
                {badge}
            </span>
        )}
        <div className="absolute top-0 right-0 w-24 h-24 bg-accent/10 rounded-full blur-2xl -mr-8 -mt-8 group-hover:bg-accent/20 transition-colors"></div>
        <div>
            <h3 className="text-accent font-bold text-lg mb-2 pr-20">{title}</h3>
            <p className="text-secondary text-sm leading-relaxed">{description}</p>
        </div>

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
