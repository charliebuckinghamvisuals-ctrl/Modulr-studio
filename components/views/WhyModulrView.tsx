import React from 'react';
import {
    Share2, Clock, PoundSterling, FileCheck, Users, Repeat,
    ArrowRight, Instagram, Camera, TrendingUp, Box, Sofa, Rotate3d,
    Layers, Palette, FileText, FolderOpen, Film, ClipboardCheck, Footprints, Link2,
} from 'lucide-react';
import { Button } from '../Button';
import { DraftingBackground } from '../DraftingBackground';
import { WalkthroughShowcase } from '../WalkthroughShowcase';
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

const CARD = 'rounded-xl border border-border bg-white/50 backdrop-blur-xl shadow-xl shadow-black/[0.03]';

interface UseCase {
    icon: React.ReactNode;
    title: string;
    body: string;
    points: string[];
    image?: string;
}

const USE_CASES: UseCase[] = [
    {
        icon: <Footprints size={22} />,
        title: 'Walk the client through it before it exists',
        body:
            'A plan and an elevation ask the client to imagine. The walkthrough does not. Walk Outside puts them in the garden facing the building they are about to buy; Walk Inside puts them in the room, with the kitchen run, the bed, the sofa and the lighting where you set them out. Open the doors, look out at the garden, click a wall and change the colour while they watch.',
        points: [
            'Two walks, one click each: outside facing the building, inside looking out',
            'Doors open the way the real set does - bi-fold, sliding, French or hinged',
            'Click any wall, floor, frame, door or kitchen unit and change its finish without stopping',
            'Send the view you are standing in straight to the Render Engine',
        ],
        image: '/config-walkthrough.jpg',
    },
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
            'A quote with a pro-level CGI visual of the proposed building beats a price list every time. Design the scheme, render it, and send a branded proposal the same afternoon while the conversation is still warm.',
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
            'Instead of going away and coming back in a week, change the cladding while the client watches. Drag the ridge down and see what it saves. Walk them into the room and let them pick the worktop. Agreement happens in the meeting, revisions collapse, and the client feels part of the design rather than presented with it.',
        points: [
            'Swap materials in seconds, from the sidebar or from inside the walkthrough',
            'Adjust dimensions in the 3D Configurator with live costing',
            'Settle the kitchen, the bathroom and the lighting before quoting',
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
        icon: <ClipboardCheck size={20} />,
        title: 'Check it',
        body: 'Run the plot through the free Planning Checker and know whether it is permitted development before you quote.',
    },
    {
        icon: <Box size={20} />,
        title: 'Design it',
        body: 'Build the room to real dimensions in the 3D Configurator - outside and inside, kitchen and lighting included - with live costing as you go.',
    },
    {
        icon: <Footprints size={20} />,
        title: 'Walk it',
        body: 'Walk Outside to stand in the garden facing the building. Walk Inside to stand in the room. Change finishes with a click as you go.',
    },
    {
        icon: <Layers size={20} />,
        title: 'Render it',
        body: 'Send the view you are looking at straight into the Render Engine and get a pro-level 4K CGI visual of the configured building back.',
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
        icon: <Link2 size={20} />,
        title: 'Share it',
        body: 'Send the client one read-only proposal link showing the renders and the estimate, with your contact details staying in your account.',
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
        status: 'In your account now',
        body:
            'Build a garden room or annexe to real dimensions in the browser, walk around it and through it, then send any view straight into the Render Engine. Because the geometry is real rather than generated, every elevation agrees with every other one. More models, options and finishes are being added week by week.',
        points: [
            'Millimetre-accurate footprint, eaves and ridge heights, box or gable',
            'Bi-fold, sliding, French and hinged door sets, skylights, a covered outdoor section',
            'Internal walls, kitchens, bathrooms, bedrooms, offices and games rooms, with a lighting plan',
            'Walk Inside and Walk Outside, with finishes changed by clicking as you go',
            'PDF pack with drawings, a permitted development checklist and a planning likelihood score',
        ],
    },
    {
        icon: <Sofa size={22} />,
        title: 'Interior renders',
        status: 'In progress',
        body:
            'The walkthrough already lets you stand inside the finished design. The next step is the Render Engine treating that view the way it treats an exterior: every surface and fitting identified on its own, so you can change a floor without redrawing the kitchen.',
        points: [
            'Per-surface control of floor, walls, ceiling and joinery',
            'Understands daylight direction from the glazing',
            'Separates fixed elements from loose furnishings',
            'Fed by the same configured room, so nothing is guessed',
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
    { figure: '250 a month', label: 'Renders included on The Hub' },
];

interface WhyModulrViewProps {
    onNavigate?: (stage: AppStage) => void;
}

export const WhyModulrView: React.FC<WhyModulrViewProps> = ({ onNavigate }) => {
    return (
        <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar">
            <DraftingBackground pageName="WHY MODULR" />

            <div className="flex-1 relative z-10 px-6 md:px-12 lg:px-16 py-16 md:py-24">
                <div className="max-w-[1200px] mx-auto space-y-24 md:space-y-32">

                    {/* Hero */}
                    <section className="grid lg:grid-cols-12 gap-10 items-end">
                        <div className="lg:col-span-8 space-y-7">
                            <div className={TYPE.eyebrow}>Why Modulr Studio</div>
                            <h1 className={TYPE.h1}>Better visuals win better work.</h1>
                            <p className={`${TYPE.lead} max-w-2xl`}>
                                Garden rooms and annexes are sold on how they look, inside and out.
                                Modulr Studio lets you design the building to real dimensions, walk
                                a client around it and through it, and render any view like a pro in
                                4K - for marketing, for quoting and for planning, without a studio
                                fee or a two-week wait.
                            </p>
                            <div className="flex flex-wrap gap-4 pt-2">
                                <Button onClick={() => onNavigate?.(AppStage.DESIGNER)} icon={<ArrowRight size={16} />} className="px-8">
                                    Open the 3D Configurator
                                </Button>
                                <Button variant="secondary" onClick={() => onNavigate?.(AppStage.PRICING)} className="px-8">
                                    See Pricing
                                </Button>
                            </div>
                        </div>

                        <div className="lg:col-span-4 aspect-[4/5] rounded-xl overflow-hidden border border-border bg-slate-100 shadow-xl">
                            <img
                                src="/gallery-13-after.jpg"
                                alt="Garden room visualisation produced with Modulr Studio"
                                loading="lazy"
                                className="w-full h-full object-cover"
                            />
                        </div>
                    </section>

                    {/* The walkthrough, before the argument. A minute of the
                        real configurator makes the case faster than the copy
                        under it, and every claim below is then something the
                        reader has just watched happen. */}
                    <section className="space-y-8">
                        <div className="grid lg:grid-cols-12 gap-10 items-end">
                            <div className="lg:col-span-7 space-y-5">
                                <div className={TYPE.eyebrow}>See it working</div>
                                <h2 className={TYPE.h2}>Design it, walk it, render it. One building all the way through.</h2>
                            </div>
                            <p className={`lg:col-span-5 ${TYPE.body}`}>
                                A games room, configured in the browser and then walked from the garden
                                to the sofa. Finishes change with a click as you go, and any view can be
                                sent to the Render Engine.
                            </p>
                        </div>
                        <WalkthroughShowcase />
                    </section>

                    {/* The pipeline. This is the genuine differentiator: rival
                        tools do one stage of this each. Worth stating plainly
                        and early, because it is the argument that justifies the
                        price. */}
                    <section className="space-y-10">
                        <div className="grid lg:grid-cols-12 gap-10 items-end">
                            <div className="lg:col-span-7 space-y-5">
                                <div className={TYPE.eyebrow}>The complete package</div>
                                <h2 className={TYPE.h2}>Design, walk, render, specify and quote. In one place.</h2>
                            </div>
                            <p className={`lg:col-span-5 ${TYPE.body}`}>
                                Other tools handle one step of this. Modulr Studio is built to carry a
                                scheme from a first measurement to a branded client proposal without
                                leaving the app, and without the model, the price and the render ever
                                disagreeing.
                            </p>
                        </div>

                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                                    <strong className="text-primary">Configurators do not render, and most stop at the front door.</strong> They
                                    produce an exterior preview and a price, then stop. No interior, no
                                    walkthrough, and what the client sees is a model rather than a
                                    photograph of their garden.
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
                                As far as we are aware, no other platform joins all of these steps for this
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
                                <h2 className={TYPE.h2}>Eight ways it pays for itself.</h2>
                            </div>
                            <p className={`lg:col-span-5 ${TYPE.body}`}>
                                From the first walkthrough on a sales call to the final planning submission.
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
                                <div className={TYPE.eyebrow}>Now and next</div>
                                <h2 className={TYPE.h2}>What we are building.</h2>
                            </div>
                            <p className={`lg:col-span-5 ${TYPE.body}`}>
                                One of these is already in your account. The rest are included as they
                                ship, at no extra cost on an existing plan.
                            </p>
                        </div>

                        <div className="grid md:grid-cols-3 gap-6">
                            {ROADMAP.map(item => (
                                <div key={item.title} className={`${CARD} p-8 space-y-4`}>
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-accent/8 border border-accent/15 flex items-center justify-center text-accent shrink-0">
                                            {item.icon}
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-none bg-accent/8 text-accent border border-accent/15 whitespace-nowrap">
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
                            Build a room in the 3D Configurator and walk through it, or upload a photograph, a sketch or a SketchUp screenshot and see what comes
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
