import React from 'react';
import {
    Phone, Mail, ArrowRight, ExternalLink, Box, Layers,
    PenTool, Palette, CloudSun, FolderOpen, ShieldCheck, FileText, Lock,
} from 'lucide-react';
import { Button } from '../Button';
import { DraftingBackground } from '../DraftingBackground';

/**
 * Shared type scale.
 *
 * Every heading and body block on this page pulls from here rather than
 * hand-picking a size inline. That is what keeps the page feeling designed
 * rather than assembled - previously near-identical blocks used text-sm,
 * text-base and text-lg interchangeably, which reads as inconsistency.
 */
const TYPE = {
    eyebrow: 'text-[11px] font-bold uppercase tracking-[0.25em] text-accent',
    h1: 'text-5xl md:text-6xl lg:text-7xl font-bold text-accent tracking-tight leading-[1.05]',
    h2: 'text-3xl md:text-4xl lg:text-5xl font-bold text-accent tracking-tight leading-[1.1]',
    h3: 'text-xl md:text-2xl font-bold text-accent tracking-tight',
    h4: 'text-lg font-bold text-primary',
    lead: 'text-lg md:text-xl text-secondary leading-relaxed',
    body: 'text-base md:text-lg text-secondary leading-relaxed',
    small: 'text-sm md:text-base text-secondary leading-relaxed',
};

const SECTION = 'scroll-mt-24';
const CARD = 'rounded-[2rem] border border-border bg-white/50 backdrop-blur-xl shadow-xl shadow-black/[0.03]';

interface Tool {
    icon: React.ReactNode;
    name: string;
    tagline: string;
    body: string;
    points: string[];
    status?: string;
    /** Example output, drawn from the gallery. */
    image?: string;
}

const TOOLS: Tool[] = [
    {
        icon: <Box size={22} />,
        name: '3D Configurator',
        image: '/gallery-1.jpg',
        tagline: 'Design the building before you render it',
        body:
            'Build a garden room or annexe to real dimensions in your browser - footprint, wall and ridge heights, roof form, glazing, internal walls, decking and cladding. Because the geometry is real rather than generated, what you see is what gets built, and every view stays consistent with every other view.',
        points: [
            'Box and gable forms with adjustable pitch, overhangs and canopy',
            'Doors, windows, skylights and internal partitions positioned to the millimetre',
            'Live cost estimate that updates as the specification changes',
            'Walk-through, plan, elevation and orthographic views',
            'Send any view straight into the Render Engine in one click',
        ],
        status: 'In development',
    },
    {
        icon: <Layers size={22} />,
        name: 'Render Engine',
        image: '/gallery-4.jpg',
        tagline: 'Photoreal exteriors from a drawing or a photo',
        body:
            'The core of the platform. Feed it a SketchUp screenshot, a CAD elevation, a line drawing or a site photograph and it returns a finished architectural visual - correct materials, believable light, real context. Built specifically around the language of garden rooms and annexes rather than generic architecture.',
        points: [
            'Works from SketchUp and CAD exports, line drawings or photographs',
            'Automatic detection of cladding, roof, glazing, doors and ground treatment',
            'Weather, season and time-of-day control for the same scheme',
            'Batch mode for producing a full set of angles in one pass',
            'Up to 4K output suitable for print and planning submissions',
        ],
    },
    {
        icon: <PenTool size={22} />,
        name: 'Line Converter',
        image: '/demo-line-drawing.jpg',
        tagline: 'Clean architectural line work from any model',
        body:
            'Turn a messy model screenshot or a photograph into crisp, presentable line work. Useful on its own for drawings and planning documents, and as the cleanest possible starting point for the Render Engine - the tighter the line work, the more faithful the final render.',
        points: [
            'Converts SketchUp, CAD and photographic sources',
            'Optional colour retention for tonal drawings',
            'Composition control across standard aspect ratios',
            'Feeds directly into the Render Engine',
        ],
    },
    {
        icon: <Palette size={22} />,
        name: 'Material Studio',
        image: '/gallery-8.jpg',
        tagline: 'Change the specification, keep the building',
        body:
            'Swap cladding, roofing, glazing, doors and ground treatment on an existing scheme without redrawing it. Show a client the same building in charcoal composite, western red cedar and painted render inside a single meeting, and build a reusable library of the finishes you actually specify.',
        points: [
            'Independent control of walls, roof, windows, doors and decking',
            'Save your own finishes to a reusable material library',
            'Upload a supplier sample and apply it directly',
            'Keeps the building consistent across every variation',
        ],
    },
    {
        icon: <CloudSun size={22} />,
        name: 'Weather Lab',
        image: '/gallery-6.jpg',
        tagline: 'The same scheme, in every light',
        body:
            'Change the weather, season and atmosphere of a finished render while the building itself stays exactly as it is. Show a client their garden room in July sun and January frost, or give a planning submission a neutral overcast light instead of a flattering sunset.',
        points: [
            'Golden hour, overcast, rain, fog, snow and night',
            'Seasonal planting and ground treatment',
            'Free-text notes for specific atmospheric detail',
            'The building is never redrawn, only the environment around it',
        ],
    },
    {
        icon: <FolderOpen size={22} />,
        name: 'Projects',
        image: '/gallery-11.jpg',
        tagline: 'Every job, client and file in one place',
        body:
            'A directory for the work itself. Client name, address, value and status alongside the renders, floor plans and documents that belong to the job - so a scheme lives in one place rather than scattered across folders, inboxes and desktops.',
        points: [
            'Client details, address, project value and pipeline status',
            'Attach renders, floor plans and PDFs to the job they belong to',
            'Everything saved to your account and available on any device',
            'Visible only to you',
        ],
        status: 'New',
    },
];

export const AboutView: React.FC = () => {
    return (
        <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar">
            <DraftingBackground pageName="ABOUT" />

            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[150px] pointer-events-none" />
            <div className="absolute bottom-1/3 left-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />

            <div className="flex-1 relative z-10 px-6 md:px-12 lg:px-16 py-16 md:py-24">
                <div className="max-w-[1200px] mx-auto space-y-28 md:space-y-36">

                    {/* ── Hero - left-aligned editorial, not centred ── */}
                    <section className={`${SECTION} grid lg:grid-cols-12 gap-10 items-end animate-in fade-in slide-in-from-bottom-6 duration-1000`}>
                        <div className="lg:col-span-8 space-y-7">
                            <div className={TYPE.eyebrow}>Architectural Intelligence</div>
                            <h1 className={TYPE.h1}>
                                The UK's dedicated render engine for garden rooms and annexes.
                            </h1>
                            <p className={`${TYPE.lead} max-w-2xl`}>
                                Modulr Studio makes high-end architectural visuals instant and affordable
                                for the people who design and build domestic outbuildings - without the
                                studio fees, the lead times, or the back-and-forth.
                            </p>
                        </div>

                        <div className="lg:col-span-4 grid grid-cols-3 lg:grid-cols-1 gap-4">
                            {[
                                { figure: '< 30s', label: 'Per visual' },
                                { figure: '4K', label: 'Print & planning ready' },
                                { figure: 'UK', label: 'Built for our planning system' },
                            ].map(stat => (
                                <div key={stat.label} className={`${CARD} p-5 md:p-6`}>
                                    <div className="text-2xl md:text-3xl font-bold text-accent tracking-tight">{stat.figure}</div>
                                    <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-secondary mt-1.5 leading-snug">
                                        {stat.label}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Showcase band. Every image here was produced by the engine,
                        which is the most direct argument the page can make. */}
                    <section className={SECTION}>
                        {/* Aspect ratio belongs on the CONTAINER. On the <img> the
                            box sizes to its content, so tiles came out uneven and
                            the staggered offsets made that read as misalignment. */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {['/gallery-2.jpg', '/gallery-5.jpg', '/gallery-7.jpg', '/gallery-10.jpg'].map(src => (
                                <div
                                    key={src}
                                    className="aspect-[4/5] rounded-2xl overflow-hidden border border-border bg-slate-100 group"
                                >
                                    <img
                                        src={src}
                                        alt="Render produced with Modulr Studio"
                                        loading="lazy"
                                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
                                    />
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-secondary/70 mt-5">
                            Every image on this page was produced in Modulr Studio.
                        </p>
                    </section>

                    {/* ── Why / Who - asymmetric split ── */}
                    <section className={`${SECTION} grid lg:grid-cols-12 gap-10 lg:gap-16`}>
                        <div className="lg:col-span-5 space-y-5">
                            <div className={TYPE.eyebrow}>The problem</div>
                            <h2 className={TYPE.h2}>Visualisation shouldn't cost more than the drawings.</h2>
                        </div>
                        <div className="lg:col-span-7 space-y-8">
                            <p className={TYPE.body}>
                                Traditional CGI is slow and expensive. A single exterior visual runs to
                                several hundred pounds and takes days to come back - so schemes get
                                presented flat, revisions get avoided, and clients are asked to imagine
                                the thing they're being sold.
                            </p>
                            <p className={TYPE.body}>
                                Modulr Studio moves that work in-house. Iterate on a design while the
                                client is still sitting at the table, show three cladding options instead
                                of describing them, and put a finished visual in front of someone the
                                same afternoon you measured the garden.
                            </p>
                            <div className="grid sm:grid-cols-2 gap-5 pt-2">
                                <div className={`${CARD} p-7 space-y-3`}>
                                    <h3 className={TYPE.h3}>Who it's for</h3>
                                    <p className={TYPE.small}>
                                        Garden room and annexe specialists, from bespoke builders to
                                        national providers - plus the architects and designers working
                                        on domestic outbuildings.
                                    </p>
                                </div>
                                <div className={`${CARD} p-7 space-y-3`}>
                                    <h3 className={TYPE.h3}>What makes it different</h3>
                                    <p className={TYPE.small}>
                                        It's trained on the architectural language of this sector, and it
                                        works from your real geometry rather than inventing a building
                                        from a text prompt.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ── Tools ──
                        Deliberately a SUMMARY only. The step-by-step walkthrough
                        lives in the Guide; duplicating it here made the two pages
                        look like the same page. About answers "what is this and
                        who made it", the Guide answers "how do I use it". */}
                    <section className={`${SECTION} space-y-10`}>
                        <div className="grid lg:grid-cols-12 gap-10 items-end">
                            <div className="lg:col-span-7 space-y-5">
                                <div className={TYPE.eyebrow}>The platform</div>
                                <h2 className={TYPE.h2}>Six tools, one workflow.</h2>
                            </div>
                            <p className={`lg:col-span-5 ${TYPE.body}`}>
                                Each tool handles one stage of getting a scheme in front of a
                                client, and they pass work between them so nothing is rebuilt twice.
                            </p>
                        </div>

                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                            {TOOLS.map(tool => (
                                <div key={tool.name} className={`${CARD} p-7 space-y-4`}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 rounded-2xl bg-accent/8 border border-accent/15 flex items-center justify-center text-accent shrink-0">
                                            {tool.icon}
                                        </div>
                                        {tool.status && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-accent/8 text-accent border border-accent/15">
                                                {tool.status}
                                            </span>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        <h3 className="text-lg font-bold text-accent tracking-tight">{tool.name}</h3>
                                        <p className="text-sm font-semibold text-primary leading-snug">{tool.tagline}</p>
                                    </div>
                                    <p className={TYPE.small}>{tool.body}</p>
                                </div>
                            ))}
                        </div>

                        <p className={TYPE.small}>
                            For a full walkthrough of each tool, the workflows that combine them and
                            troubleshooting, see the <strong className="text-primary">Guide</strong>.
                        </p>
                    </section>

                    {/* ── NAPC ── */}
                    <section className={`${SECTION} grid lg:grid-cols-12 gap-10 lg:gap-16`}>
                        <div className="lg:col-span-5 space-y-5">
                            <div className={TYPE.eyebrow}>Exclusively built by NAPC</div>
                            <h2 className={TYPE.h2}>Expertise in planning, not just pixels.</h2>
                        </div>
                        <div className="lg:col-span-7 space-y-7">
                            <p className={TYPE.body}>
                                Modulr Studio was developed by <strong className="text-primary">NAPC Ltd</strong> - 
                                the National Annexe Planning Company - the UK's first and only planning
                                and development consultancy dedicated to garden rooms, annexes and mobile homes.
                            </p>
                            <p className={TYPE.body}>
                                That background is why the engine understands the constraints of domestic
                                projects: permitted development limits, ridge heights, boundary treatments
                                and the details that decide whether a scheme gets approved.
                            </p>

                            <div className="flex flex-wrap gap-8 border-y border-border/60 py-6">
                                <a href="tel:01285283200" className="flex items-center gap-3 text-base font-semibold text-primary hover:text-accent transition-colors">
                                    <Phone size={18} className="text-accent" />
                                    01285 283 200
                                </a>
                                <a href="mailto:info@napc.uk" className="flex items-center gap-3 text-base font-semibold text-primary hover:text-accent transition-colors">
                                    <Mail size={18} className="text-accent" />
                                    info@napc.uk
                                </a>
                            </div>

                            <div className="flex flex-wrap gap-4">
                                <Button
                                    onClick={() => window.open('https://napc.uk', '_blank', 'noopener,noreferrer')}
                                    icon={<ExternalLink size={16} />}
                                    className="px-8"
                                >
                                    Visit NAPC
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => window.open('https://napc.uk/contact/', '_blank', 'noopener,noreferrer')}
                                    icon={<ArrowRight size={16} />}
                                    className="px-8"
                                >
                                    Work With Us
                                </Button>
                            </div>
                        </div>
                    </section>

                    {/* ── Legal ── */}
                    <section className={`${SECTION} space-y-10`}>
                        <div className="grid lg:grid-cols-12 gap-10 items-end">
                            <div className="lg:col-span-7 space-y-5">
                                <div className={TYPE.eyebrow}>Legal &amp; compliance</div>
                                <h2 className={TYPE.h2}>Terms, privacy &amp; GDPR.</h2>
                            </div>
                            <p className={`lg:col-span-5 ${TYPE.small}`}>
                                Modulr Studio is operated by <strong className="text-primary">NAPC Ltd</strong> (Company
                                No. 12849395), registered in England &amp; Wales. Last updated April 2026.
                            </p>
                        </div>

                        <div className="grid md:grid-cols-3 gap-6">
                            <div className={`${CARD} p-8 space-y-5`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-xl bg-accent/8 border border-accent/15 flex items-center justify-center text-accent shrink-0">
                                        <FileText size={18} />
                                    </div>
                                    <h3 className="text-lg font-bold text-accent tracking-tight">Terms of Service</h3>
                                </div>
                                <div className="space-y-3 text-sm md:text-base text-secondary leading-relaxed">
                                    <p><strong className="text-primary">Eligibility.</strong> You must be 18 or older and acting on behalf of a legitimate business.</p>
                                    <p><strong className="text-primary">Licence.</strong> A limited, non-exclusive, non-transferable licence to use the platform for your own commercial rendering. You may not resell, sublicence or redistribute the service.</p>
                                    <p><strong className="text-primary">Acceptable use.</strong> Do not upload images you do not hold rights to, circumvent credit or rate limits, reverse-engineer the pipeline, or generate illegal content.</p>
                                    <p><strong className="text-primary">Credits &amp; billing.</strong> Credits are non-refundable once consumed and do not roll over. Prices are in GBP inclusive of VAT. Pricing may change with 30 days' notice.</p>
                                    <p><strong className="text-primary">Availability.</strong> We target 99% uptime but cannot guarantee uninterrupted access; maintenance and third-party AI outages may cause downtime.</p>
                                    <p><strong className="text-primary">Termination.</strong> Accounts violating these terms may be suspended without notice or refund.</p>
                                    <p><strong className="text-primary">Liability.</strong> NAPC Ltd's total liability shall not exceed amounts paid in the preceding 12 months. We are not liable for indirect or consequential loss.</p>
                                    <p><strong className="text-primary">Governing law.</strong> England &amp; Wales, with exclusive jurisdiction of its courts.</p>
                                </div>
                            </div>

                            <div className={`${CARD} p-8 space-y-5`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-xl bg-accent/8 border border-accent/15 flex items-center justify-center text-accent shrink-0">
                                        <Lock size={18} />
                                    </div>
                                    <h3 className="text-lg font-bold text-accent tracking-tight">Privacy Policy</h3>
                                </div>
                                <div className="space-y-3 text-sm md:text-base text-secondary leading-relaxed">
                                    <p><strong className="text-primary">Controller.</strong> NAPC Ltd is the data controller for personal data collected through Modulr Studio (info@napc.uk).</p>
                                    <p><strong className="text-primary">What we collect.</strong> Email and password (via Firebase Authentication, hashed), billing information (processed by Stripe - we never see full card details), usage data, and images you upload for processing.</p>
                                    <p><strong className="text-primary">How we use it.</strong> To provide and improve the service, process payments, send essential service communications and prevent abuse. We do not sell your data.</p>
                                    <p><strong className="text-primary">Image data.</strong> Uploads are transmitted securely to Google's Gemini API for processing and are not retained on our servers beyond the request.</p>
                                    <p><strong className="text-primary">Project data.</strong> Projects and attached files are stored against your account and visible only to you, unless you explicitly share them.</p>
                                    <p><strong className="text-primary">Retention.</strong> Account data is kept for the subscription term plus 6 years for tax purposes. Deletion may be requested at any time.</p>
                                    <p><strong className="text-primary">Cookies.</strong> Essential session cookies only. No tracking or advertising cookies.</p>
                                    <p><strong className="text-primary">Processors.</strong> Firebase (Google LLC), Stripe Inc. and Render Inc., all GDPR-compliant with DPAs in place.</p>
                                </div>
                            </div>

                            <div className={`${CARD} p-8 space-y-5`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-xl bg-accent/8 border border-accent/15 flex items-center justify-center text-accent shrink-0">
                                        <ShieldCheck size={18} />
                                    </div>
                                    <h3 className="text-lg font-bold text-accent tracking-tight">GDPR &amp; UK GDPR</h3>
                                </div>
                                <div className="space-y-3 text-sm md:text-base text-secondary leading-relaxed">
                                    <p><strong className="text-primary">Compliance.</strong> Operated in compliance with UK GDPR and the Data Protection Act 2018.</p>
                                    <p><strong className="text-primary">Lawful bases.</strong> <em>Contract</em> - delivering the service. <em>Legitimate interests</em> - fraud and abuse prevention. <em>Legal obligation</em> - retaining billing records.</p>
                                    <p><strong className="text-primary">Your rights.</strong> Access, rectification, erasure, restriction, objection and data portability.</p>
                                    <p><strong className="text-primary">Exercising rights.</strong> Email <a href="mailto:info@napc.uk" className="text-accent underline underline-offset-2">info@napc.uk</a>. We respond within 30 days, no fee for standard requests.</p>
                                    <p><strong className="text-primary">International transfers.</strong> Some processing occurs outside the UK, covered by the UK IDTA, Standard Contractual Clauses or adequacy decisions.</p>
                                    <p><strong className="text-primary">Security.</strong> Firebase Authentication, HTTPS-only transport, server-side API key storage, per-user rate limiting and owner-scoped database rules.</p>
                                    <p><strong className="text-primary">Complaints.</strong> You may complain to the ICO at <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">ico.org.uk</a>.</p>
                                </div>
                            </div>
                        </div>

                        <p className="text-sm text-secondary/70 max-w-3xl">
                            For legal enquiries contact NAPC Ltd at{' '}
                            <a href="mailto:info@napc.uk" className="text-accent underline underline-offset-2">info@napc.uk</a>{' '}
                            or 01285 283 200. These documents do not constitute formal legal advice.
                        </p>
                    </section>

                    <div className="h-16" />
                </div>
            </div>
        </div>
    );
};
