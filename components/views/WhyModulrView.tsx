import React from 'react';
import {
    Share2, Clock, PoundSterling, FileCheck, Users, Repeat,
    ArrowRight, Instagram, Camera, TrendingUp, Box, Sofa, Rotate3d,
    Layers, Palette, FileText, FolderOpen, Film,
} from 'lucide-react';
import { Button } from '../Button';
import { DraftingBackground } from '../DraftingBackground';
import { AppStage } from '../../types';

/** Same scale as About and Guide so the site reads as one thing. */
const TYPE = {
    eyebrow: 'text-[11px] font-bold uppercase tracking-[0.25em] text-accent',
    h1: 'text-5xl md:text-6xl lg:text-7xl font-bold text-accent tracking-tight leading-[1.05]',
    h2: 'text-3xl md:text-4xl font-bold text-accent tracking-tight leading-[1.1]',
    h3: 'text-xl md:text-2xl font-bold text-accent tracking-tight',
    lead: 'text-lg md:text-xl text-secondary leading-relaxed',
    body: 'text-base md:text-lg text-secondary leading-relaxed',
    small: 'text-sm md:text-base text-secondary leading-relaxed',
};

const CARD = 'rounded-[2rem] border border-border bg-white/50 backdrop-blur-xl shadow-xl shadow-black/[0.03]';

interface UseCase {
    icon: React.ReactNode;
    title: string;
    body: string;
    points: string[];
    image?: string;
}

const USE_CASES: UseCase[] = [
    {
        icon: <Share2 size={22} />,
        title: 'Social media that actually stops the scroll',
        body:
            'Most garden room companies post the same three photographs of the same three completed builds. Modulr Studio gives you an endless supply of fresh, high-end visuals: the same design in six cladding finishes, in summer and in snow, at golden hour and under overcast light.',
        points: [
            'Post every day without waiting on a photographer or a finished build',
            'Show designs you have never built yet',
            'Carousel-ready sets: one scheme, multiple finishes',
            'Seasonal variations of a design you have already posted',
        ],
        image: '/gallery-14-after.jpg',
    },
    {
        icon: <Film size={22} />,
        title: 'Video, without a film crew',
        body:
            'Every platform pushes video ahead of photographs, and a moving scheme holds attention in a way a still never does. Animation Studio turns any finished render into a short cinematic clip - a slow push in, a gentle pan, planting moving in the breeze - in about a minute, from the render you already made.',
        points: [
            'A moving hero for your website instead of a static image',
            'Reels and shorts from schemes you have never built',
            'Open a client presentation with the building alive rather than sitting still',
            'No camera, no drone, no waiting for the weather',
        ],
        image: '/hero-clip-4.jpg',
    },
    {
        icon: <PoundSterling size={22} />,
        title: 'Win the quote before a competitor turns up',
        body:
            'A quote with a photorealistic visual of the proposed building beats a price list every time. Design the scheme, render it, and send a branded proposal the same afternoon while the conversation is still warm.',
        points: [
            'Turn a sketch or model into a finished visual in minutes',
            'Branded PDF proposal with your logo and colours',
            'Show two or three specification options side by side',
            'Justify a premium price by showing the premium finish',
        ],
        image: '/gallery-5.jpg',
    },
    {
        icon: <Camera size={22} />,
        title: 'A brochure and website full of work you have not built',
        body:
            'New businesses face a chicken-and-egg problem: you need photographs to win work, and work to get photographs. Modulr Studio breaks it. Populate your website, brochure and showroom displays with the full range you offer, not just what happens to be finished.',
        points: [
            'Fill a website gallery from day one',
            'Consistent style across every product in the range',
            '4K output suitable for print and large-format display',
            'Full commercial rights on everything you generate',
        ],
        image: '/gallery-9.jpg',
    },
    {
        icon: <FileCheck size={22} />,
        title: 'Planning submissions that read as considered',
        body:
            'Planning officers respond to clarity. Clean line work, honest overcast lighting and a contextual view of the proposal in its actual setting make a scheme look resolved rather than speculative.',
        points: [
            'Neutral overcast renders rather than flattering sunsets',
            'Clean architectural line drawings from the Line Converter',
            'Consistent elevations straight from the 3D Configurator',
            'Backed by NAPC planning expertise',
        ],
        image: '/demo-line-drawing.jpg',
    },
    {
        icon: <Users size={22} />,
        title: 'Design live, on the call',
        body:
            'Instead of going away and coming back in a week, change the cladding while the client watches. Agreement happens in the room, revisions collapse, and the client feels part of the design rather than presented with it.',
        points: [
            'Swap materials in seconds during a meeting',
            'Adjust dimensions in the 3D Configurator with live costing',
            'Settle specification decisions before quoting',
            'Fewer rounds of "can we see it in a different colour"',
        ],
        image: '/gallery-11.jpg',
    },
    {
        icon: <Repeat size={22} />,
        title: 'Reuse everything, forever',
        body:
            'Every render, material sheet and drawing stays in your account against the project it belongs to. Build a library of your own work that gets more valuable the longer you use it, instead of losing files across folders and inboxes.',
        points: [
            'Projects hold renders, plans and documents together',
            'Reusable material library of the finishes you actually specify',
            'Find last year\'s scheme for a returning client in seconds',
            'Available on any device you sign in from',
        ],
        image: '/gallery-12.jpg',
    },
];

const PIPELINE = [
    {
        icon: <Box size={20} />,
        title: 'Design it',
        body: 'Build the room to real dimensions in the 3D Configurator, with live costing as you go.',
    },
    {
        icon: <Layers size={20} />,
        title: 'Render it',
        body: 'Send any view straight into the Render Engine and get a photoreal 4K visual back.',
    },
    {
        icon: <Palette size={20} />,
        title: 'Specify it',
        body: 'Generate material close-up sheets showing the actual grain, seam and finish of every surface.',
    },
    {
        icon: <FileText size={20} />,
        title: 'Document it',
        body: 'Export a branded PDF with plan, elevations, material schedule and planning guidance.',
    },
    {
        icon: <FolderOpen size={20} />,
        title: 'Keep it',
        body: 'Everything filed against the client and job in Projects, on any device you sign in from.',
    },
];

interface RoadmapItem {
    icon: React.ReactNode;
    title: string;
    body: string;
    points: string[];
    status: string;
}

const ROADMAP: RoadmapItem[] = [
    {
        icon: <Box size={22} />,
        title: '3D Configurator',
        status: 'In development',
        body:
            'Build a garden room to real dimensions in the browser, then send any view straight into the Render Engine. Because the geometry is real rather than generated, every elevation agrees with every other one.',
        points: [
            'Millimetre-accurate footprint, heights and roof form',
            'Live cost estimate as the specification changes',
            'Plan, elevation and walk-through views',
            'Export a PDF pack with drawings and guidance',
        ],
    },
    {
        icon: <Sofa size={22} />,
        title: 'Interior Render Engine',
        status: 'In design',
        body:
            'The same engine, built for interiors. It analyses the whole room and identifies every surface and fitting independently, so you can change a floor without redrawing the kitchen.',
        points: [
            'Per-surface control of floor, walls, ceiling and joinery',
            'Understands daylight direction from the glazing',
            'Separates fixed elements from loose furnishings',
            'Works from the same SketchUp and photo sources',
        ],
    },
    {
        icon: <Rotate3d size={22} />,
        title: '360° Views',
        status: 'Exploring',
        body:
            'Panoramic and turntable output so a client can look around a scheme rather than at a single fixed angle. Shareable as a link, which turns a render into something they can send to a partner.',
        points: [
            'Full 360 panoramas from inside the building',
            'Turntable sequences of the exterior',
            'Viewable on phone without an app',
            'Embeddable in your own website',
        ],
    },
];

const NUMBERS = [
    { figure: '£400-800', label: 'Typical UK cost of a single commissioned exterior render' },
    { figure: '2-5 days', label: 'Typical turnaround from a visualisation studio' },
    { figure: 'Under a minute', label: 'Turnaround in Modulr Studio' },
    { figure: 'Unlimited', label: 'Renders included on the Business plan' },
];

interface WhyModulrViewProps {
    onNavigate?: (stage: AppStage) => void;
}

export const WhyModulrView: React.FC<WhyModulrViewProps> = ({ onNavigate }) => {
    return (
        <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar">
            <DraftingBackground pageName="WHY MODULR" />
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[150px] pointer-events-none" />

            <div className="flex-1 relative z-10 px-6 md:px-12 lg:px-16 py-16 md:py-24">
                <div className="max-w-[1200px] mx-auto space-y-24 md:space-y-32">

                    {/* Hero */}
                    <section className="grid lg:grid-cols-12 gap-10 items-end">
                        <div className="lg:col-span-8 space-y-7">
                            <div className={TYPE.eyebrow}>Why Modulr Studio</div>
                            <h1 className={TYPE.h1}>Better visuals win better work.</h1>
                            <p className={`${TYPE.lead} max-w-2xl`}>
                                Garden rooms are sold on how they look. Modulr Studio gives you an
                                unlimited supply of photorealistic 4K visuals of your own designs,
                                for marketing, for quoting and for planning, without a studio fee
                                or a two-week wait.
                            </p>
                            <div className="flex flex-wrap gap-4 pt-2">
                                <Button onClick={() => onNavigate?.(AppStage.PRICING)} icon={<ArrowRight size={16} />} className="px-8">
                                    See Pricing
                                </Button>
                                <Button variant="secondary" onClick={() => onNavigate?.(AppStage.GALLERY)} className="px-8">
                                    View the Gallery
                                </Button>
                            </div>
                        </div>

                        <div className="lg:col-span-4 aspect-[4/5] rounded-[2rem] overflow-hidden border border-border bg-slate-100 shadow-xl">
                            <img
                                src="/gallery-13-after.jpg"
                                alt="Garden room visualisation produced with Modulr Studio"
                                loading="lazy"
                                className="w-full h-full object-cover"
                            />
                        </div>
                    </section>

                    {/* The pipeline. This is the genuine differentiator: rival
                        tools do one stage of this each. Worth stating plainly
                        and early, because it is the argument that justifies the
                        price. */}
                    <section className="space-y-10">
                        <div className="grid lg:grid-cols-12 gap-10 items-end">
                            <div className="lg:col-span-7 space-y-5">
                                <div className={TYPE.eyebrow}>The complete package</div>
                                <h2 className={TYPE.h2}>Design, render, specify and quote. In one place.</h2>
                            </div>
                            <p className={`lg:col-span-5 ${TYPE.body}`}>
                                Other tools handle one step of this. Modulr Studio is built to carry a
                                scheme from a first sketch to a branded client proposal without
                                leaving the app.
                            </p>
                        </div>

                        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
                            {PIPELINE.map((step, i) => (
                                <div key={step.title} className={`${CARD} p-6 space-y-3 relative`}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-accent/8 border border-accent/15 flex items-center justify-center text-accent shrink-0">
                                            {step.icon}
                                        </div>
                                        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary/40">
                                            {String(i + 1).padStart(2, '0')}
                                        </span>
                                    </div>
                                    <h3 className="text-base font-bold text-accent tracking-tight leading-snug">
                                        {step.title}
                                    </h3>
                                    <p className="text-sm text-secondary leading-relaxed">{step.body}</p>
                                </div>
                            ))}
                        </div>

                        <div className={`${CARD} p-8 md:p-10 space-y-5`}>
                            <h3 className={TYPE.h3}>Why that matters</h3>
                            <div className="grid md:grid-cols-3 gap-8">
                                <p className={TYPE.small}>
                                    <strong className="text-primary">Rendering tools do not design.</strong> They
                                    take an image you already made and restyle it. You still need
                                    somewhere to work out the actual building.
                                </p>
                                <p className={TYPE.small}>
                                    <strong className="text-primary">Configurators do not render.</strong> They
                                    produce a 3D preview and a price, then stop. What the client sees is
                                    a model, not a photograph of their garden.
                                </p>
                                <p className={TYPE.small}>
                                    <strong className="text-primary">Neither produces the paperwork.</strong> The
                                    material schedule, the elevations and the branded proposal still get
                                    assembled by hand afterwards.
                                </p>
                            </div>
                            <p className={TYPE.body}>
                                Built specifically for garden rooms and annexes rather than adapted from
                                generic architecture software, and backed by NAPC's planning expertise.
                                As far as we are aware, no other platform joins all five steps for this
                                sector.
                            </p>
                        </div>
                    </section>

                    {/* The numbers */}
                    <section className="space-y-8">
                        <div className="grid lg:grid-cols-12 gap-10 items-end">
                            <div className="lg:col-span-7 space-y-5">
                                <div className={TYPE.eyebrow}>The maths</div>
                                <h2 className={TYPE.h2}>One commissioned render costs more than a month of Modulr.</h2>
                            </div>
                            <p className={`lg:col-span-5 ${TYPE.body}`}>
                                Visualisation has always been the bottleneck between designing
                                something and selling it. It does not need to be.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                            {NUMBERS.map(n => (
                                <div key={n.label} className={`${CARD} p-7 space-y-3`}>
                                    <div className="text-2xl md:text-3xl font-bold text-accent tracking-tight leading-none">
                                        {n.figure}
                                    </div>
                                    <div className="text-xs md:text-sm text-secondary leading-snug">{n.label}</div>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-secondary/70">
                            UK visualisation costs based on published 2026 studio and freelance rates.
                        </p>
                    </section>

                    {/* Use cases */}
                    <section className="space-y-12">
                        <div className="grid lg:grid-cols-12 gap-10 items-end">
                            <div className="lg:col-span-7 space-y-5">
                                <div className={TYPE.eyebrow}>What people use it for</div>
                                <h2 className={TYPE.h2}>Six ways it pays for itself.</h2>
                            </div>
                            <p className={`lg:col-span-5 ${TYPE.body}`}>
                                From the first post on Instagram to the final planning submission.
                            </p>
                        </div>

                        <div className="space-y-6">
                            {USE_CASES.map((uc, i) => (
                                <article key={uc.title} className={`${CARD} p-8 md:p-10 grid lg:grid-cols-12 gap-8 lg:gap-12 items-start`}>
                                    <div className={`lg:col-span-5 space-y-4 ${i % 2 === 1 ? 'lg:order-2' : ''}`}>
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-accent/8 border border-accent/15 flex items-center justify-center text-accent shrink-0">
                                                {uc.icon}
                                            </div>
                                            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary/50">
                                                {String(i + 1).padStart(2, '0')}
                                            </span>
                                        </div>
                                        <h3 className={TYPE.h3}>{uc.title}</h3>
                                        <p className={TYPE.small}>{uc.body}</p>
                                        <ul className="space-y-2 pt-1">
                                            {uc.points.map(p => (
                                                <li key={p} className="flex gap-3 text-sm text-secondary leading-relaxed">
                                                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-accent/50 shrink-0" />
                                                    {p}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    {uc.image && (
                                        <div className={`lg:col-span-7 aspect-[16/10] rounded-2xl overflow-hidden border border-border bg-slate-100 ${i % 2 === 1 ? 'lg:order-1' : ''}`}>
                                            <img
                                                src={uc.image}
                                                alt={uc.title}
                                                loading="lazy"
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    )}
                                </article>
                            ))}
                        </div>
                    </section>

                    {/* Social media focus */}
                    <section className={`${CARD} p-8 md:p-14 space-y-10`}>
                        <div className="grid lg:grid-cols-12 gap-10 items-end">
                            <div className="lg:col-span-7 space-y-5">
                                <div className={TYPE.eyebrow}>Content</div>
                                <h2 className={TYPE.h2}>Never run out of things to post.</h2>
                            </div>
                            <p className={`lg:col-span-5 ${TYPE.body}`}>
                                The single biggest reason garden room companies stop posting is that
                                they run out of photographs. That constraint disappears.
                            </p>
                        </div>

                        <div className="grid md:grid-cols-3 gap-6">
                            {[
                                {
                                    icon: <Instagram size={20} />,
                                    title: 'One design, a week of content',
                                    body: 'Render the same scheme in cedar, anthracite, sage and slate blue. That is four posts from one upload, each showing a different buyer what they want to see.',
                                },
                                {
                                    icon: <Clock size={20} />,
                                    title: 'Seasonal, on demand',
                                    body: 'Post a snow render in January and a golden hour shot in June, from the same design, without waiting for the weather or revisiting a completed site.',
                                },
                                {
                                    icon: <TrendingUp size={20} />,
                                    title: 'Line drawing beside render performs',
                                    body: 'A technical drawing next to the finished visual shows the craft behind the product. Both come out of the same upload, so the pairing costs you nothing extra.',
                                },
                            ].map(c => (
                                <div key={c.title} className="space-y-3">
                                    <div className="w-11 h-11 rounded-2xl bg-accent/8 border border-accent/15 flex items-center justify-center text-accent">
                                        {c.icon}
                                    </div>
                                    <h3 className="text-lg font-bold text-accent leading-snug">{c.title}</h3>
                                    <p className={TYPE.small}>{c.body}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Roadmap */}
                    <section className="space-y-10">
                        <div className="grid lg:grid-cols-12 gap-10 items-end">
                            <div className="lg:col-span-7 space-y-5">
                                <div className={TYPE.eyebrow}>Coming soon</div>
                                <h2 className={TYPE.h2}>What we are building next.</h2>
                            </div>
                            <p className={`lg:col-span-5 ${TYPE.body}`}>
                                Included as they ship, at no extra cost on an existing plan.
                            </p>
                        </div>

                        <div className="grid md:grid-cols-3 gap-6">
                            {ROADMAP.map(item => (
                                <div key={item.title} className={`${CARD} p-8 space-y-4`}>
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-accent/8 border border-accent/15 flex items-center justify-center text-accent shrink-0">
                                            {item.icon}
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-accent/8 text-accent border border-accent/15 whitespace-nowrap">
                                            {item.status}
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-bold text-accent tracking-tight leading-snug">
                                        {item.title}
                                    </h3>
                                    <p className={TYPE.small}>{item.body}</p>
                                    <ul className="space-y-2 pt-1">
                                        {item.points.map(p => (
                                            <li key={p} className="flex gap-3 text-sm text-secondary leading-relaxed">
                                                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-accent/50 shrink-0" />
                                                {p}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>

                        <p className="text-xs text-secondary/70">
                            Roadmap items are in active development. Timings are indicative and we
                            will not commit to a date we cannot hold.
                        </p>
                    </section>

                    {/* Closing CTA */}
                    <section className={`${CARD} p-10 md:p-16 text-center space-y-6`}>
                        <h2 className={TYPE.h2}>Try it on your own design.</h2>
                        <p className={`${TYPE.body} max-w-2xl mx-auto`}>
                            Upload a photograph, a sketch or a SketchUp screenshot and see what comes
                            back. No card required to start.
                        </p>
                        <div className="flex flex-wrap justify-center gap-4 pt-2">
                            <Button onClick={() => onNavigate?.(AppStage.RENDER_ENGINE)} icon={<ArrowRight size={16} />} className="px-8">
                                Launch Render Engine
                            </Button>
                            <Button variant="secondary" onClick={() => onNavigate?.(AppStage.PRICING)} className="px-8">
                                See Pricing
                            </Button>
                        </div>
                    </section>

                    <div className="h-16" />
                </div>
            </div>
        </div>
    );
};
