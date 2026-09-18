import React from 'react';
import { AppStage } from '../../types';
import { CompareSlider } from '../CompareSlider';
import { Button } from '../Button';
import { HeroVideoCarousel } from '../HeroVideoCarousel';
import { WalkthroughShowcase } from '../WalkthroughShowcase';

/**
 * Home, rebuilt 18 Sep 2026 as full-bleed bands (Charlie: the card-in-a-
 * column version read as scattered and childish - rounded boxes floating in
 * space, each asking for attention, and far too many words).
 *
 * Rules of this page:
 *   - every section is an edge-to-edge band; the band IS the container, so
 *     no cards, no per-block borders or shadows, hairlines where a division
 *     is needed, square corners (index.css radius tokens)
 *   - one idea per band, one sentence per column, the imagery does the work
 *   - the tools are listed by name, not described - each has its own page
 *
 * The checkpoint before this rebuild is commit 510c7c8, in case it is the
 * wrong direction.
 */

/** The three moves the product is sold on, in the order a job runs. */
const WORKFLOW = [
    { step: 'Design it', body: 'Box or gable, every door and window, cladding per elevation, the inside too. Priced as you go.' },
    { step: 'Walk it', body: 'Stand in the garden, then step inside. Open the doors, change a finish, keep walking.' },
    { step: 'Render it', body: 'The engine is handed the building you priced, not a screenshot. What comes back matches it.' },
];

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
    { label: 'Floor Plan Studio', line: 'Rendered and CAD plans', stage: AppStage.FLOOR_PLAN_STUDIO, badge: 'New' },
    { label: 'Animation Studio', line: 'A render, brought to life', stage: AppStage.ANIMATION_STUDIO },
    { label: 'Material Studio', line: 'Swap any surface, honestly', stage: AppStage.MATERIAL_STUDIO },
    { label: 'Weather Lab', line: 'Same scheme, any season', stage: AppStage.WEATHER_LAB },
    { label: 'Projects', line: 'One job, one place, one link', stage: AppStage.PROJECTS },
    { label: 'Planning Checker', line: 'Will it need permission?', stage: AppStage.PLANNING_CHECKER, badge: 'Free' },
];

const SHOWCASE = ['/gallery-6.jpg', '/gallery-5.jpg', '/gallery-9.jpg', '/gallery-12.jpg'];

interface HomeViewProps {
    onOpenEngine: () => void;
    onOpenMaterialStudio: () => void;
    onNavigate?: (stage: AppStage) => void;
}

/** One full-bleed band: the background runs edge to edge, the content sits on the 1400px grid. */
const Band: React.FC<{ tone?: 'white' | 'pale' | 'dark'; className?: string; inner?: string; children: React.ReactNode }> = ({ tone = 'white', className = '', inner = '', children }) => (
    <section className={`w-full ${tone === 'dark' ? 'bg-accent text-white' : tone === 'pale' ? 'bg-background' : 'bg-white'} ${className}`}>
        <div className={`max-w-[1400px] mx-auto px-4 sm:px-6 ${inner}`}>{children}</div>
    </section>
);

const Eyebrow: React.FC<{ children: React.ReactNode; light?: boolean }> = ({ children, light }) => (
    <span className={`text-[11px] font-bold uppercase tracking-[0.25em] ${light ? 'text-white/70' : 'text-accent'}`}>{children}</span>
);

export const HomeView: React.FC<HomeViewProps> = ({ onOpenEngine, onNavigate }) => {
    // No page scrollbar gutter beside the full-bleed bands (see index.css).
    React.useEffect(() => {
        document.documentElement.classList.add('home-fullbleed');
        return () => document.documentElement.classList.remove('home-fullbleed');
    }, []);

    return (
        <div className="min-h-full flex flex-col bg-white w-full">

            {/* Open tester offer (14 Sep 2026), a full-bleed strip under the
                header: the line drifts slowly so it reads as live, pauses on
                hover, and the whole strip is the button. The numbers are the
                real allowance the server enforces - 40 renders in 7 days. */}
            <button
                type="button"
                onClick={onOpenEngine}
                aria-label="Free 7-day access to Modulr Studio: 40 AI renders, no card needed. Start free"
                className="offer-strip group w-full relative z-20 overflow-hidden bg-[#2d3a38] text-white border-b border-white/10 hover:bg-[#344542] transition-colors"
            >
                <div className="offer-marquee flex items-center whitespace-nowrap py-2.5 will-change-transform">
                    {[0, 1, 2, 3].map(i => (
                        <span key={i} className="inline-flex items-center gap-4 pr-16 text-[13px] sm:text-sm" aria-hidden={i > 0}>
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">Limited-time offer</span>
                            <span className="font-medium">Free 7-day access to Modulr Studio · 40 AI renders · no card needed</span>
                            <span className="inline-flex items-center gap-1 font-bold underline underline-offset-4 decoration-white/60 group-hover:decoration-white">Start free</span>
                        </span>
                    ))}
                </div>
            </button>

            {/* 1. Hero: the work first. Capped at 1400px, 16:9, no crop - true
                edge to edge drew the 1920-wide clips soft (6 Aug, 17 Sep). */}
            <Band tone="white" inner="pt-6 sm:pt-8">
                <HeroVideoCarousel fullBleed />
            </Band>

            {/* 2. The promise: one line, one sentence, two buttons. */}
            <Band tone="white" inner="py-14 sm:py-20 text-center">
                <h1 className="text-[6vw] sm:text-3xl lg:text-5xl text-accent font-bold leading-tight max-w-4xl mx-auto">
                    Design it in 3D. Walk through it. Render it like a pro.
                </h1>
                <p className="text-secondary text-base md:text-xl max-w-2xl mx-auto mt-6 font-light leading-relaxed">
                    The design-to-render platform for garden room and annexe providers.
                </p>
                <div className="flex flex-wrap justify-center gap-4 mt-10">
                    {onNavigate && (
                        <Button onClick={() => onNavigate(AppStage.DESIGNER)} className="px-10 py-5 text-base">
                            Open the 3D Configurator
                        </Button>
                    )}
                    <Button variant="secondary" onClick={onOpenEngine} className="px-10 py-5 text-base">
                        Launch Render Engine
                    </Button>
                </div>
            </Band>

            {/* 3. Design, walk, render - with the walkthrough recording as the
                proof of the middle one. Three columns, one sentence each. */}
            {/* Extra bottom padding: the chapter chips hang below the frame. */}
            <Band tone="pale" inner="pt-16 sm:pt-24 pb-16 sm:pb-24 lg:pb-36">
                <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-10 lg:gap-16 items-center">
                    <WalkthroughShowcase chaptersOverlay />
                    <div>
                        <Eyebrow>How a job runs</Eyebrow>
                        <h2 className="text-2xl sm:text-3xl lg:text-4xl text-accent font-bold mt-3 mb-8">Design it. Walk it. Render it.</h2>
                        <ol className="divide-y divide-slate-200 border-y border-slate-200">
                            {WORKFLOW.map((w, i) => (
                                <li key={w.step} className="py-5 grid grid-cols-[2.5rem_1fr] gap-4">
                                    <span className="text-accent/60 font-bold text-sm pt-0.5">0{i + 1}</span>
                                    <div>
                                        <p className="text-accent font-bold">{w.step}</p>
                                        <p className="text-secondary text-sm mt-1 leading-relaxed">{w.body}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </div>
                </div>
            </Band>

            {/* 4. Before and after, on the dark band. */}
            <Band tone="dark" inner="py-16 sm:py-24">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-10 lg:gap-16 items-center">
                    <div>
                        <Eyebrow light>The render engine</Eyebrow>
                        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mt-3 text-white">From line work to finished visual</h2>
                        <p className="text-white/75 text-sm sm:text-base mt-5 leading-relaxed max-w-md">
                            Send any configurator view, CAD export or line drawing. The geometry is the foundation; the engine lights and finishes it - it does not redraw it.
                        </p>
                        <div className="mt-8">
                            <Button variant="secondary" onClick={onOpenEngine}>Try the Render Engine</Button>
                        </div>
                    </div>
                    <div className="overflow-hidden border border-white/10">
                        <CompareSlider beforeImage="/demo-line-drawing.jpg" afterImage="/demo-render.jpg" beforeLabel="Line drawing" afterLabel="Render" />
                    </div>
                </div>
            </Band>

            {/* 4b. The Modulr Lock System. Why the renders are accurate, without
                the recipe: three locks stated as outcomes, not mechanisms. */}
            <Band tone="white" inner="py-16 sm:py-24">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-10 lg:gap-16 items-start">
                    <div>
                        <Eyebrow>Why the render matches the quote</Eyebrow>
                        <h2 className="text-2xl sm:text-3xl lg:text-4xl text-accent font-bold mt-3">The Modulr Lock System</h2>
                        <p className="text-secondary text-sm sm:text-base mt-5 leading-relaxed max-w-md">
                            Most AI render tools are handed a picture and asked to imagine a better one. That is why they add a window, lose a door, or quietly change the cladding. Modulr Studio does not work from a picture. Every render is locked to the design three ways, and nothing ships until it passes.
                        </p>
                    </div>
                    <ol className="divide-y divide-slate-200 border-y border-slate-200">
                        {LOCKS.map((l, i) => (
                            <li key={l.title} className="py-5 grid grid-cols-[2.5rem_1fr] gap-4">
                                <span className="text-accent/60 font-bold text-sm pt-0.5">0{i + 1}</span>
                                <div>
                                    <p className="text-accent font-bold">{l.title}</p>
                                    <p className="text-secondary text-sm mt-1 leading-relaxed">{l.body}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            </Band>

            {/* 5. The work. Four tiles edge to edge on the grid, hairline gaps. */}
            <Band tone="white" inner="py-16 sm:py-24">
                <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
                    <div>
                        <Eyebrow>Made with Modulr Studio</Eyebrow>
                        <h2 className="text-2xl sm:text-3xl text-accent font-bold mt-3">Every image generated in-app</h2>
                    </div>
                    {onNavigate && (
                        <button onClick={() => onNavigate(AppStage.GALLERY)} className="inline-flex items-center gap-2 text-sm font-bold text-accent underline underline-offset-4 hover:text-accent-hover">
                            See the gallery
                        </button>
                    )}
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-1">
                    {SHOWCASE.map(src => (
                        <div key={src} className="aspect-[4/5] overflow-hidden bg-slate-100 group">
                            <img src={src} alt="Architectural visualisation produced with Modulr Studio" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700" />
                        </div>
                    ))}
                </div>
            </Band>

            {/* 6. Three reasons, hairline-divided, no cards. */}
            <Band tone="pale" inner="py-16 sm:py-24">
                <div className="max-w-3xl mb-10">
                    <Eyebrow>Why Modulr Studio</Eyebrow>
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl text-accent font-bold mt-3">The go-to app for garden room and annexe providers.</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x divide-slate-200 border-t border-slate-200">
                    {REASONS.map(r => (
                        <div key={r.title} className="pt-8 md:pr-8 md:pl-8 first:pl-0 last:pr-0 pb-4">
                            <h3 className="text-accent font-bold text-base leading-snug">{r.title}</h3>
                            <p className="text-secondary text-sm mt-2 leading-relaxed">{r.body}</p>
                        </div>
                    ))}
                </div>
            </Band>

            {/* 7. The tools, by name. */}
            <Band tone="white" inner="py-16 sm:py-24">
                <Eyebrow>The tools</Eyebrow>
                <h2 className="text-2xl sm:text-3xl text-accent font-bold mt-3 mb-8">Purpose-built for garden rooms</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 border-t border-l border-slate-200">
                    {TOOLS.map(t => (
                        <button
                            key={t.label}
                            onClick={() => onNavigate?.(t.stage)}
                            className="text-left p-5 sm:p-6 border-b border-r border-slate-200 hover:bg-background transition-colors group"
                        >
                            <p className="text-accent font-bold text-sm sm:text-base inline-flex items-center gap-2">
                                {t.label}
                                {t.badge && <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-none bg-accent/10 text-accent">{t.badge}</span>}
                            </p>
                            <p className="text-secondary text-xs sm:text-sm mt-1">{t.line}</p>
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-accent/70 mt-3 group-hover:text-accent">Open</span>
                        </button>
                    ))}
                </div>
            </Band>

            {/* 8. Free Planning Checker, on the dark band, last. */}
            <Band tone="dark" inner="py-16 sm:py-24 text-center">
                <Eyebrow light>Free, no account needed</Eyebrow>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mt-3 text-white">Will it need planning permission?</h2>
                <p className="text-white/75 text-sm sm:text-base mt-5 leading-relaxed max-w-2xl mx-auto">
                    A few questions about the plot, the height and the boundary, and the Planning Checker tells you whether the scheme reads as permitted development - with the limits it measured against. An indication, not a determination; NAPC can confirm it in writing when it matters.
                </p>
                {onNavigate && (
                    <div className="flex justify-center mt-8">
                        <Button variant="secondary" onClick={() => onNavigate(AppStage.PLANNING_CHECKER)} className="px-10 py-4">
                            Check a scheme
                        </Button>
                    </div>
                )}
            </Band>
        </div>
    );
};
