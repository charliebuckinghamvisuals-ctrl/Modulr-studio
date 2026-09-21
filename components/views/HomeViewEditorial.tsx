import React, { useEffect, useRef, useState } from 'react';
import { AppStage } from '../../types';
import { Button } from '../Button';
import { CompareSlider } from '../CompareSlider';
import { HeroVideoCarousel } from '../HeroVideoCarousel';
import { WalkthroughShowcase } from '../WalkthroughShowcase';

/**
 * Home, editorial pass (Charlie, 20 Sep 2026): closer to an architectural
 * practice than a SaaS landing page.
 *
 * This is a SEPARATE file from HomeView.tsx on purpose. App.tsx imports this
 * one; to go back to the 18 Sep bands, change that one import back to
 * './components/views/HomeView' and nothing else. Every navigation target,
 * the tester offer, the Planning Checker and the gallery link are all still
 * here - the pass is visual and copy only.
 *
 * Rules of this page:
 *   - only images and clips that were already on the site (Charlie, 20 Sep:
 *     no images of my own). The garden gym and sauna render and its Material
 *     Studio sheet are the same project, so they carry the hero, the detail
 *     step and the delivery step; the configurator recording, the line
 *     drawing pair and the Animation Studio clip are other projects and the
 *     captions say so.
 *   - the imagery is the argument; type is large, light and given room
 *   - no cards, no icons, hairlines only, square corners, one shadow (the
 *     primary button's own)
 *   - motion is a single slow settle on the hero and a fade-up as each
 *     section arrives; both are off for prefers-reduced-motion
 *   - headings inherit the site's uppercase, tracked Montserrat (index.css)
 */

interface HomeViewProps {
    onOpenEngine: () => void;
    onOpenMaterialStudio: () => void;
    onNavigate?: (stage: AppStage) => void;
}

/**
 * The Modulr Lock System, as outcomes. Deliberately not the recipe - no
 * mention of how the lock is built - only what it guarantees.
 */
const LOCKS = [
    { title: 'Locked to the design', body: 'The engine is given the building you configured - its exact form, every opening, every edge - not a screenshot to reinterpret. It cannot add a window or move a door.' },
    { title: 'Locked to the specification', body: 'Every door set, window, deck, boundary, fitting and finish is stated to the engine item by item, in your words. The cladding you chose is the cladding you get.' },
    { title: 'Checked before it ships', body: 'Each render is inspected against that specification, item by item. Anything that drifted is corrected automatically, and you are told what was checked.' },
];

/** Three reasons, each a thing the product does. */
const REASONS = [
    { title: 'Built around your product', body: 'Eaves and ridge, composite boards, anthracite frames, decking, canopies, a covered bay. It knows what a garden room is made of.' },
    { title: 'Renders that match the quote', body: 'The Modulr Lock System: every render is locked to the design and checked item by item before it ships.' },
    { title: 'Planning built in, by planning people', body: 'Made by NAPC, the UK planning consultancy for garden rooms and annexes. Permitted development is flagged as you design.' },
];

/** The tools, by name. Each has its own page under Tools. */
const TOOLS: { label: string; line: string; stage: AppStage; badge?: string }[] = [
    { label: '3D Configurator', line: 'Design to real dimensions', stage: AppStage.DESIGNER },
    { label: 'Render Engine', line: 'Pro-level CGI from the design', stage: AppStage.RENDER_ENGINE },
    { label: 'Material Studio', line: 'Swap any surface, honestly', stage: AppStage.MATERIAL_STUDIO },
    { label: 'Weather Lab', line: 'Same scheme, any season', stage: AppStage.WEATHER_LAB },
    { label: 'Floor Plan Studio', line: 'Rendered and CAD plans', stage: AppStage.FLOOR_PLAN_STUDIO, badge: 'Coming soon' },
    { label: 'Animation Studio', line: 'A render, brought to life', stage: AppStage.ANIMATION_STUDIO, badge: 'Coming soon' },
    { label: 'Projects', line: 'One job, one place, one link', stage: AppStage.PROJECTS },
    { label: 'Planning Checker', line: 'Will it need permission?', stage: AppStage.PLANNING_CHECKER, badge: 'Free' },
];

const SHOWCASE = ['/gallery-6.jpg', '/gallery-5.jpg', '/gallery-9.jpg', '/gallery-12.jpg'];

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * Fade-up as a block scrolls into view. One observer for the page; a block
 * reveals once and is then left alone. Reduced motion: everything is simply
 * visible (the CSS handles that too, this is belt and braces).
 */
const useReveal = () => {
    useEffect(() => {
        const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
        if (reduced || !('IntersectionObserver' in window)) {
            els.forEach(el => el.classList.add('is-visible'));
            return;
        }
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.classList.add('is-visible');
                    io.unobserve(e.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
        els.forEach(el => io.observe(el));
        return () => io.disconnect();
    }, []);
};

/** One band: the background runs edge to edge, the content sits on the 1400px grid. */
const Band: React.FC<{ tone?: 'white' | 'pale' | 'dark'; className?: string; inner?: string; children: React.ReactNode }> = ({ tone = 'white', className = '', inner = '', children }) => (
    <section className={`w-full ${tone === 'dark' ? 'bg-accent text-white' : tone === 'pale' ? 'bg-[#f6f7f5]' : 'bg-white'} ${className}`}>
        <div className={`max-w-[1400px] mx-auto px-5 sm:px-8 lg:px-12 ${inner}`}>{children}</div>
    </section>
);

const Eyebrow: React.FC<{ children: React.ReactNode; light?: boolean }> = ({ children, light }) => (
    <span className={`block text-[11px] font-semibold uppercase tracking-[0.3em] ${light ? 'text-white/75' : 'text-accent'}`}>{children}</span>
);

/** A quiet text link, the page's secondary action everywhere. */
const TextLink: React.FC<{ onClick?: () => void; children: React.ReactNode; light?: boolean }> = ({ onClick, children, light }) => (
    <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-[6px] decoration-1 transition-colors ${light ? 'text-white decoration-white/40 hover:decoration-white' : 'text-accent decoration-accent/30 hover:decoration-accent'}`}
    >
        {children}
        <span aria-hidden className="text-base leading-none">&rarr;</span>
    </button>
);

/** Small caption under an image: what it is, honestly. */
const Caption: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-secondary">{children}</p>
);

/**
 * An Animation Studio clip that fetches nothing until it scrolls into view,
 * plays muted while visible and pauses when it leaves. Same rule as the
 * walkthrough showcase: a visitor who never reaches it never downloads it.
 */
const LazyClip: React.FC<{ src: string; poster: string; label: string }> = ({ src, poster, label }) => {
    const ref = useRef<HTMLVideoElement | null>(null);
    const [inView, setInView] = useState(false);
    const reduced = React.useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);

    useEffect(() => {
        const el = ref.current;
        if (!el || !('IntersectionObserver' in window)) { setInView(true); return; }
        const io = new IntersectionObserver(entries => setInView(entries.some(e => e.isIntersecting)), { threshold: 0.4 });
        io.observe(el);
        return () => io.disconnect();
    }, []);

    useEffect(() => {
        const v = ref.current;
        if (!v) return;
        v.muted = true;
        if (inView && !reduced) v.play().catch(() => {}); else v.pause();
    }, [inView, reduced]);

    return (
        <video
            ref={ref}
            src={inView ? src : undefined}
            poster={poster}
            muted
            loop
            playsInline
            preload="none"
            aria-label={label}
            className="absolute inset-0 w-full h-full object-cover"
        />
    );
};

/**
 * The hero's words: one line, one sentence, one button, and a quiet link.
 * Rendered twice - over the clip on large screens, under it on small ones -
 * so the copy lives in one place.
 */
const HeroCopy: React.FC<{ light?: boolean; onOpenEngine: () => void; onDesign?: () => void }> = ({ light, onOpenEngine, onDesign }) => (
    <>
        <Eyebrow light={light}>Modulr Studio</Eyebrow>
        <h1
            className={`${light ? 'text-white' : 'text-accent'} text-[1.9rem] sm:text-4xl lg:text-[3.1rem] leading-[1.1] mt-4`}
            style={light ? { textShadow: '0 1px 2px rgba(0,0,0,0.35)' } : undefined}
        >
            Design it in 3D. Walk through it. Render it like a pro.
        </h1>
        <p className={`${light ? 'text-white/85' : 'text-secondary'} text-base lg:text-lg font-light leading-relaxed mt-5 max-w-xl`}>
            The design-to-render platform for garden room and annexe providers: one design, carried from the configurator to the client's inbox.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-4">
            {onDesign && (
                <Button onClick={onDesign} className="px-10 py-4 text-sm tracking-wide">
                    Open the 3D Configurator
                </Button>
            )}
            <TextLink onClick={onOpenEngine} light={light}>Or start in the Render Engine</TextLink>
        </div>
    </>
);

/**
 * One step of the workflow: media on one side, a numbered paragraph on the
 * other, sides alternating down the page. The media column is the wider one
 * because the image is the point. The text is aligned to the TOP of the
 * media, its first line level with the image's top edge, the way a caption
 * column sits beside a plate - centring it drifted against the caption
 * hanging under each image (Charlie, 20 Sep: "make sure things line up").
 */
const Step: React.FC<{
    n: string;
    name: string;
    title: string;
    body: string;
    action?: { label: string; onClick?: () => void };
    badge?: string;
    flip?: boolean;
    children: React.ReactNode;
}> = ({ n, name, title, body, action, badge, flip, children }) => (
    <div data-reveal className={`grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start ${flip ? 'lg:[&>*:first-child]:order-2' : ''}`}>
        <div className="lg:col-span-8">{children}</div>
        <div className="lg:col-span-4 max-w-md lg:pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-accent/80">
                <span className="tabular-nums">{n}</span>
                <span className="mx-3 text-accent/30">/</span>
                {name}
                {badge && <span className="ml-3 px-2 py-0.5 border border-accent/25 text-accent text-[9px] tracking-[0.2em]">{badge}</span>}
            </p>
            <h3 className="text-xl sm:text-2xl lg:text-[1.7rem] text-accent mt-4 leading-snug">{title}</h3>
            <p className="text-secondary text-base font-light leading-relaxed mt-4">{body}</p>
            {action && <div className="mt-6"><TextLink onClick={action.onClick}>{action.label}</TextLink></div>}
        </div>
    </div>
);

export const HomeViewEditorial: React.FC<HomeViewProps> = ({ onOpenEngine, onNavigate }) => {
    useReveal();

    // No page scrollbar gutter beside the full-bleed hero (see index.css).
    useEffect(() => {
        document.documentElement.classList.add('home-fullbleed');
        return () => document.documentElement.classList.remove('home-fullbleed');
    }, []);

    const go = (stage: AppStage) => () => onNavigate?.(stage);

    return (
        <div className="min-h-full flex flex-col bg-white w-full">

            {/* Open tester offer (14 Sep 2026). Same words, same allowance the
                server enforces, same click; the marquee is gone - a still line
                reads as a notice, a moving one reads as an advert. */}
            <button
                type="button"
                onClick={onOpenEngine}
                aria-label="Free 7-day access to Modulr Studio: 40 AI renders, no card needed. Start free"
                /* Amber, the site's one warm highlight (the founding-price
                   badge uses the same pair), so the offer stands out on the
                   white page without being a second dark band under the
                   dark header. Off-white vanished into the page and dark
                   green merged with the header (Charlie, 21 Sep 2026). */
                className="group w-full relative z-20 bg-amber-100 text-amber-900 border-b border-amber-200 hover:bg-amber-200/70 transition-colors py-2.5 px-4"
            >
                <span className="inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12px] sm:text-[13px]">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-800">Limited-time offer</span>
                    <span className="font-medium">Free 7-day access to Modulr Studio · 40 AI renders · no card needed</span>
                    <span className="font-semibold underline underline-offset-4 decoration-amber-900/40 group-hover:decoration-amber-900">Start free</span>
                </span>
            </button>

            {/* 1. Hero: the Animation Studio clips (Charlie, 20 Sep 2026:
                lead with the clips), one line, one sentence, one button.
                Framed on the 1400px grid rather than edge to edge - the clips
                are 1920 wide and full bleed drew them soft on a retina laptop
                (6 Aug, 17 Sep). On large screens the copy sits over the
                bottom left of the frame; below that it sits under the frame,
                where a 16:9 frame is too short to carry it. */}
            <section className="w-full bg-white">
                <div className="max-w-[1400px] mx-auto px-5 sm:px-8 lg:px-12 pt-5 sm:pt-6">
                    <HeroVideoCarousel quiet>
                        <div className="hidden lg:block px-10 pb-9 max-w-3xl">
                            <HeroCopy light onOpenEngine={onOpenEngine} onDesign={onNavigate ? go(AppStage.DESIGNER) : undefined} />
                        </div>
                    </HeroVideoCarousel>
                    <div className="lg:hidden pt-8 pb-2 max-w-2xl">
                        <HeroCopy onOpenEngine={onOpenEngine} onDesign={onNavigate ? go(AppStage.DESIGNER) : undefined} />
                    </div>
                </div>
            </section>

            {/* 2. The workflow, introduced. */}
            <Band inner="pt-20 sm:pt-28 lg:pt-32 pb-6">
                <div data-reveal className="max-w-3xl">
                    <Eyebrow>One design, the whole way through</Eyebrow>
                    <h2 className="text-2xl sm:text-3xl lg:text-[2.6rem] text-accent leading-tight mt-4">
                        Configure. Render. Detail. Plan. Animate. Deliver.
                    </h2>
                    <p className="text-secondary text-lg font-light leading-relaxed mt-6 max-w-2xl">
                        A design is made once, in the configurator. Everything after that - the renders, the material details, the drawings, the clip, the client's page - is made from that one design, so what the client sees is what you priced.
                    </p>
                </div>
            </Band>

            {/* 3. The six steps, alternating. */}
            <Band inner="py-12 sm:py-16 lg:py-20 space-y-24 sm:space-y-32">

                <Step
                    n="01" name="Configure"
                    title="Design it to real dimensions."
                    body="Box or gable, every door and window, cladding per elevation, the inside too. Walk the garden, then step inside and change a finish as you go. It is priced as you build it."
                    action={{ label: 'Open the 3D Configurator', onClick: go(AppStage.DESIGNER) }}
                >
                    <WalkthroughShowcase plain />
                </Step>

                <Step
                    n="02" name="Render" flip
                    title="The engine is handed the building you priced, not a screenshot."
                    body="Send any configurator view, CAD export or line drawing. The geometry is the foundation; the engine lights and finishes it, it does not redraw it. The Modulr Lock System checks every item before the image ships."
                    action={{ label: 'Launch the Render Engine', onClick: onOpenEngine }}
                >
                    <div className="overflow-hidden border border-slate-200">
                        <CompareSlider beforeImage="/demo-line-drawing.jpg" afterImage="/demo-render.jpg" beforeLabel="Line drawing" afterLabel="Render" />
                    </div>
                    <Caption>Drag to compare · the drawing sent in and the render that came back</Caption>
                </Step>

                <Step
                    n="03" name="Material details"
                    title="Close enough to sell the finish."
                    body="Material Studio takes a finished render to macro: the cladding grain, the glazing bars, the bench in the sauna. Swap a surface and only that surface changes; the rest of the image is left exactly as it was."
                    action={{ label: 'Open Material Studio', onClick: go(AppStage.MATERIAL_STUDIO) }}
                >
                    {/* The sheet is square and narrower than the column; it and
                        its caption share one left-aligned wrapper so the caption
                        starts under the image's edge, not the column's. */}
                    <div className="max-w-[720px]">
                        <div className="aspect-square overflow-hidden bg-[#eef0ec]">
                            <img src="/sauna-materials.jpg" alt="Material Studio sheet of the garden gym and sauna: bronze glazing bars, the sauna bench, oak cladding grain and a frame corner against lavender" loading="lazy" className="w-full h-full object-cover" />
                        </div>
                        <Caption>Material Studio sheet · the garden gym and sauna at the top of the page</Caption>
                    </div>
                </Step>

                <Step
                    n="04" name="Plan" flip
                    title="The drawing for the quote pack."
                    body="The Line Converter turns a render into a clean line drawing for the proposal, the planning file or the client's fridge door. Rendered floor plans with the real floor and furniture, and dimensioned CAD plans, follow in Floor Plan Studio."
                    badge="Floor plans coming soon"
                    action={{ label: 'Open the Line Converter', onClick: go(AppStage.LINE_CONVERT) }}
                >
                    <div className="overflow-hidden border border-slate-200 bg-white">
                        <CompareSlider beforeImage="/gallery-13-after.jpg" afterImage="/gallery-13-before.jpg" beforeLabel="Render" afterLabel="Line drawing" />
                    </div>
                    <Caption>Drag to compare · a gable garden gym, rendered, then drawn by the Line Converter</Caption>
                </Step>

                <Step
                    n="05" name="Animate"
                    title="A render, brought to life."
                    body="A finished render becomes an eight-second clip: a slow push in, a breeze through the planting, the light changing. For the website, the socials and the top of every quote."
                    badge="Coming soon"
                    action={{ label: 'See Animation Studio', onClick: go(AppStage.ANIMATION_STUDIO) }}
                >
                    <div className="relative aspect-video overflow-hidden bg-[#141a19]">
                        <LazyClip src="/hero-clip-8.mp4" poster="/hero-clip-8.jpg" label="Animation Studio clip: a sage garden office in autumn rain, wet deck and falling leaves" />
                    </div>
                    <Caption>Animation Studio clip · sage garden office in autumn rain</Caption>
                </Step>

                <Step
                    n="06" name="Deliver" flip
                    title="One job, one place, one link."
                    body="Every render, detail, drawing and clip is filed against the client in Projects. Send a link the homeowner opens on their phone, and a PDF with the design, the finishes and the drawings in one document."
                    action={{ label: 'Open Projects', onClick: go(AppStage.PROJECTS) }}
                >
                    <div className="relative aspect-[16/10] overflow-hidden bg-[#eef0ec]">
                        <img src="/sauna-hero.jpg" alt="" aria-hidden loading="lazy" className="absolute inset-0 w-full h-full object-cover object-[50%_45%]" />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#141a19]/85 via-[#141a19]/30 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10 grid grid-cols-3 gap-6 text-white">
                            {[
                                ['Projects', 'Every asset, filed against the client'],
                                ['Client link', 'A page they open on their phone'],
                                ['PDF & spec', 'Design, finishes and drawings, in one'],
                            ].map(([t, b]) => (
                                <div key={t} className="border-t border-white/30 pt-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em]">{t}</p>
                                    <p className="text-white/75 text-xs sm:text-sm font-light mt-1 leading-snug">{b}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    <Caption>The garden gym and sauna, delivered</Caption>
                </Step>
            </Band>

            {/* 4. The Modulr Lock System. Why the renders are accurate, without
                the recipe: three locks stated as outcomes, not mechanisms. */}
            <Band tone="pale" inner="py-20 sm:py-28">
                <div data-reveal className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
                    <div className="lg:col-span-5">
                        <Eyebrow>Why the render matches the quote</Eyebrow>
                        <h2 className="text-2xl sm:text-3xl lg:text-[2.4rem] text-accent leading-tight mt-4">The Modulr Lock System</h2>
                        <p className="text-secondary text-base lg:text-lg font-light leading-relaxed mt-6 max-w-md">
                            Most AI render tools are handed a picture and asked to imagine a better one. That is why they add a window, lose a door, or quietly change the cladding. Modulr Studio does not work from a picture. Every render is locked to the design three ways, and nothing ships until it passes.
                        </p>
                    </div>
                    <ol className="lg:col-span-7 border-t border-slate-300/70">
                        {LOCKS.map((l, i) => (
                            <li key={l.title} className="py-7 grid grid-cols-[3.5rem_1fr] gap-4 border-b border-slate-300/70">
                                <span className="text-accent/60 text-2xl font-light tabular-nums leading-none pt-1">0{i + 1}</span>
                                <div>
                                    <p className="text-accent font-semibold text-base">{l.title}</p>
                                    <p className="text-secondary text-base font-light mt-2 leading-relaxed max-w-xl">{l.body}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            </Band>

            {/* 5. The work. Four images on the grid, hairline gaps, no chrome. */}
            <Band inner="py-20 sm:py-28">
                <div data-reveal>
                    <div className="flex items-end justify-between gap-6 flex-wrap mb-8">
                        <div>
                            <Eyebrow>Made with Modulr Studio</Eyebrow>
                            <h2 className="text-2xl sm:text-3xl text-accent mt-4">Every image generated in-app</h2>
                        </div>
                        {onNavigate && <TextLink onClick={go(AppStage.GALLERY)}>See the gallery</TextLink>}
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-1">
                        {SHOWCASE.map(src => (
                            <div key={src} className="aspect-[4/5] overflow-hidden bg-[#eef0ec] group">
                                <img src={src} alt="Architectural visualisation produced with Modulr Studio" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-[1200ms]" style={{ transitionTimingFunction: EASE }} />
                            </div>
                        ))}
                    </div>
                </div>
            </Band>

            {/* 6. Three reasons, hairline-divided, no cards. */}
            <Band tone="pale" inner="py-20 sm:py-28">
                <div data-reveal>
                    <div className="max-w-3xl mb-12">
                        <Eyebrow>Why Modulr Studio</Eyebrow>
                        <h2 className="text-2xl sm:text-3xl lg:text-[2.4rem] text-accent leading-tight mt-4">The go-to app for garden room and annexe providers.</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x divide-slate-300/70 border-t border-slate-300/70">
                        {REASONS.map(r => (
                            <div key={r.title} className="pt-8 pb-6 md:px-8 first:md:pl-0 last:md:pr-0">
                                <h3 className="text-accent text-sm leading-snug">{r.title}</h3>
                                <p className="text-secondary text-base font-light mt-3 leading-relaxed">{r.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </Band>

            {/* 7. The tools, by name, as an index rather than a grid of tiles. */}
            <Band inner="py-20 sm:py-28">
                <div data-reveal>
                    <Eyebrow>The tools</Eyebrow>
                    <h2 className="text-2xl sm:text-3xl text-accent mt-4 mb-10">Purpose-built for garden rooms</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-16 border-t border-slate-200">
                        {TOOLS.map(t => (
                            <button
                                key={t.label}
                                type="button"
                                onClick={go(t.stage)}
                                className="text-left flex items-baseline justify-between gap-6 py-5 border-b border-slate-200 group"
                            >
                                <span className="flex items-baseline gap-3 min-w-0">
                                    <span className="text-accent font-semibold text-base group-hover:underline underline-offset-[6px] decoration-1 decoration-accent/40">{t.label}</span>
                                    {t.badge && <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-accent/80 border border-accent/25 px-1.5 py-0.5">{t.badge}</span>}
                                </span>
                                <span className="text-secondary text-sm font-light text-right shrink-0">{t.line}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </Band>

            {/* 8. Free Planning Checker, on the dark band, last. */}
            <Band tone="dark" inner="py-20 sm:py-28">
                <div data-reveal className="max-w-3xl">
                    <Eyebrow light>Free, no account needed</Eyebrow>
                    <h2 className="text-2xl sm:text-3xl lg:text-[2.4rem] leading-tight mt-4 text-white">Will it need planning permission?</h2>
                    <p className="text-white/75 text-base lg:text-lg font-light mt-6 leading-relaxed">
                        A few questions about the plot, the height and the boundary, and the Planning Checker tells you whether the scheme reads as permitted development - with the limits it measured against. An indication, not a determination; NAPC can confirm it in writing when it matters.
                    </p>
                    {onNavigate && (
                        <div className="mt-10">
                            <Button variant="secondary" onClick={go(AppStage.PLANNING_CHECKER)} className="px-10 py-4">
                                Check a scheme
                            </Button>
                        </div>
                    )}
                </div>
            </Band>
        </div>
    );
};
