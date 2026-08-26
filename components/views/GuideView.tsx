import React from 'react';
import {
    BookOpen, Box, Layers, PenTool, CloudSun, Palette, FolderOpen, Film,
    Lightbulb, AlertTriangle, CheckCircle2, ArrowRight, ClipboardCheck,
} from 'lucide-react';
import { DraftingBackground } from '../DraftingBackground';

/** Shared type scale, matching the About page so the two read as one site. */
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

interface ToolGuide {
    icon: React.ReactNode;
    name: string;
    purpose: string;
    inputs: string[];
    steps: string[];
    uses: string[];
    tips: string[];
    status?: string;
}

const TOOLS: ToolGuide[] = [
    {
        icon: <Box size={22} />,
        name: '3D Configurator',
        purpose:
            'Build the actual geometry of a garden room or annexe to real dimensions, then send any view straight into the Render Engine.',
        inputs: ['Nothing. You build it from scratch in the browser.'],
        steps: [
            'Pick the shape first, box or gable. That choice drives every control that follows.',
            'Set the footprint: width, depth and wall height, in millimetres.',
            'On a gable, set the eaves and ridge heights. The pitch follows from the two, and the bargeboards, fascia depth and roof lip are real geometry rather than a drawn-on line.',
            'Position doors, windows and skylights. Drag anywhere on the wall or nudge with the keyboard, and every handle snaps to clean steps.',
            'Add internal walls. Each one is a single object you select and drag, it snaps to the shell, and any door you put in it belongs to that wall and travels with it.',
            'Add decking, a canopy or a picture-frame front if the scheme has them.',
            'Pick cladding, roof and frame finishes to preview the specification.',
            'Watch the live cost estimate update as you go.',
            'Save Design keeps it on your account so you can reopen it later.',
            'Press Render in Modulr to push the current view into the Render Engine.',
        ],
        uses: [
            'Design live on a client call and agree the size before anyone draws anything',
            'Produce a consistent set of elevations and plans for a quote',
            'Test whether a taller ridge or deeper overhang is worth the cost',
            'Lay out the inside as well as the outside, so a client can see where the rooms fall',
            'Export a PDF pack with plan, elevations, a permitted development checklist and a planning likelihood score',
        ],
        tips: [
            'Dimensions here are real, so what you render matches what gets built.',
            'Every view comes from the same model, so your elevations cannot contradict each other.',
            'The planning score on the PDF is an indication drawn from your own dimensions, not a decision. Use the Planning Checker, or NAPC, when it needs confirming.',
            'Save before you leave the page. The design lives on your account, not in the browser tab.',
        ],
        status: 'Beta',
    },
    {
        icon: <Layers size={22} />,
        name: 'Render Engine',
        purpose:
            'Turn a drawing, model screenshot or photograph into a finished photorealistic exterior visual.',
        inputs: [
            'SketchUp or CAD screenshot',
            'Line drawing or elevation',
            'Photograph of an existing building',
            'A view sent over from the 3D Configurator',
        ],
        steps: [
            'No image to hand? Press Try a sample on the empty state and the engine runs on one of ours.',
            'Upload your image. The engine automatically detects the existing materials.',
            'Review what it found, then change any of the five categories: walls, roof, windows, doors, ground.',
            'Add instructions in the notes box for anything the pickers do not cover.',
            'Render, then download at 4K.',
            'Not quite right? Same look re-runs it with the design held steady; New look starts the interpretation again.',
            'Save it to a Project so it survives the browser tab.',
        ],
        uses: [
            'Sell a scheme from a rough SketchUp model before any detailed design work',
            'Show an existing house with a proposed annexe or extension in place',
            'Produce three cladding options for the same building in one sitting',
            'Batch a full set of angles for a brochure or planning pack',
        ],
        tips: [
            'The cleaner the input, the more faithful the output. A tidy model screenshot beats a cluttered one.',
            'Use SketchUp mode when the source is an untextured model. It tells the engine to add realism rather than reinterpret the design.',
            'Detected materials are a starting point, not a decision. Change anything that looks wrong before rendering.',
            'The verification badge on a finished render means the output was checked back against your source image, not just against the settings you chose.',
            'Same look and New look are the fastest fix for a render that is close but not right. Reach for them before you rewrite the notes.',
        ],
    },
    {
        icon: <PenTool size={22} />,
        name: 'Line Converter',
        purpose: 'Produce clean architectural line work from a model or a photograph.',
        inputs: ['SketchUp or CAD export', 'Photograph', 'Rough sketch'],
        steps: [
            'Upload the source image.',
            'Choose whether to keep colour or go pure line.',
            'Set the aspect ratio to suit the page it is going on.',
            'Generate, then download it or carry it into the Render Engine.',
        ],
        uses: [
            'Create drawings for a planning document or design statement',
            'Clean up a messy model screenshot before rendering it',
            'Keep a consistent drawing style across a whole project',
            'Turn a site photograph into a measured-looking elevation study',
        ],
        tips: [
            'This is the single best way to improve render fidelity. Convert first, render second.',
            'Colour retention suits tonal drawings. Turn it off when you want a technical look.',
        ],
    },
    {
        icon: <CloudSun size={22} />,
        name: 'Weather Lab',
        purpose:
            'Change the weather, season and atmosphere of a finished render. The building itself stays exactly as it is.',
        inputs: ['Any finished render, or a photograph'],
        steps: [
            'Upload or carry over a render.',
            'Pick a weather condition, from golden hour through to snow.',
            'Pick the season, which changes planting and ground treatment.',
            'Add environment notes for anything specific, such as wet paving or low sun through trees.',
            'Apply.',
        ],
        uses: [
            'Show a client the same scheme in summer and winter',
            'Produce a moody evening shot for the front of a brochure',
            'Demonstrate how a north-facing garden reads at different times of year',
            'Give a planning submission a neutral overcast look rather than a flattering sunset',
        ],
        tips: [
            'Overcast is the honest choice for planning. Golden hour is the persuasive choice for sales.',
            'If you want to change the building rather than the weather, use Material Studio instead.',
        ],
    },
    {
        icon: <Palette size={22} />,
        name: 'Material Studio',
        purpose:
            'Two jobs in one tool. Generate a close-up material detail sheet, or change the materials on a building.',
        inputs: ['A render, a photograph, or a model screenshot'],
        steps: [
            'Upload your image, then choose a mode when prompted.',
            'Material Close-up: pick four focal points, then generate a 2x2 macro detail sheet.',
            'Change Materials: the engine analyses the building and detects its cladding, roof, glazing, doors and ground.',
            'In Change Materials, swap any category from the presets or your own saved library, then apply.',
        ],
        uses: [
            'Build a specification page showing the actual texture of every finish',
            'Show three cladding options during a single client meeting',
            'Save a supplier sample to your library and reuse it across every job',
            'Answer "what would it look like in cedar instead" without redrawing anything',
        ],
        tips: [
            'The mode prompt appears after upload. Close-up is for showing materials, Change is for choosing them.',
            'Anything you save to your material library appears in the pickers on every future project.',
        ],
    },
    {
        icon: <Film size={22} />,
        name: 'Animation Studio',
        purpose:
            'Turn a finished render into a short cinematic clip - a slow push in, a gentle pan, a breeze through the planting.',
        inputs: ['A finished render, or any exterior photograph'],
        steps: [
            'Upload the render you want to bring to life.',
            'Choose a camera move: slow push in, slow pan, gentle arc, or locked off.',
            'Add motion if you want it: motion blur, gentle breeze, golden hour, a distant figure.',
            'Add anything else in your own words, then generate.',
            'It takes about a minute. Play it back, then download the MP4.',
        ],
        uses: [
            'A moving hero for your website instead of a still',
            'Social posts, which the algorithms favour over photographs',
            'Open a client presentation with the scheme moving rather than sitting there',
            'Show a scheme in its setting, with the planting and light alive',
        ],
        tips: [
            'Describe what you want to see, not what you do not. This model reads "no cars" as a request for cars.',
            'Clips are 10 seconds at 720p and every one carries an invisible SynthID watermark.',
            'Included with the Business plan, with a monthly allowance shown at the top of the page.',
        ],
        status: 'New',
    },
    {
        icon: <FolderOpen size={22} />,
        name: 'Projects',
        purpose:
            'Keep every client, address, value and file together instead of scattered across folders.',
        inputs: ['Renders, floor plans, PDFs, documents'],
        steps: [
            'Create a project and fill in the client name, address and value.',
            'Set a status: lead, quoted, won, lost or complete.',
            'Attach renders, floor plans and documents, tagging what each one is.',
            'Everything saves to your account automatically.',
            'Copy the share link from the project header to send the client a read-only proposal page.',
        ],
        uses: [
            'Find last March\'s render for a returning client in seconds',
            'Keep a pipeline view of what is quoted and what is won',
            'Hold plans, renders and the quote together for a handover',
            'Pick up on a different machine without copying files around',
        ],
        tips: [
            'Projects are private to your account. Nobody else can see them unless you create a share link.',
            'A share link shows renders and the estimate only. Client contact details never appear on it, and you can disable the link at any time.',
            'The Save to Project dialog offers your last-opened project first, which is almost always the one you want.',
            'A project holding a saved 3D design is badged as such on the card.',
            'Attach the source drawing as well as the render. Future you will want it.',
        ],
        status: 'New',
    },
    {
        icon: <ClipboardCheck size={22} />,
        name: 'Planning Checker',
        purpose:
            'Find out whether a scheme is likely to fall under permitted development or need a full planning application, before you spend time quoting it. Free, and open to anyone without an account.',
        inputs: ['A few facts about the plot and the proposed building. No drawing needed.'],
        steps: [
            'Answer the questions: height, footprint, distance to the boundary, what the building is for, and whether the property has anything unusual about it such as a listing or a conservation area.',
            'Submit. You get a traffic light back: likely permitted development, borderline, or likely to need an application.',
            'Read the reasoning underneath. It names the specific limits your answers were measured against.',
            'If it matters commercially, take it to NAPC for written confirmation.',
        ],
        uses: [
            'Qualify an enquiry in two minutes instead of a site visit',
            'Tell a client early that a 3.2m ridge within 2m of the boundary is a problem',
            'Put a planning position in the quote rather than leaving it open',
            'Give prospects something genuinely useful on your website before they ever buy',
        ],
        tips: [
            'It is an indication based on what you enter, not a determination. Only the local authority gives certainty, and NAPC is the step in between.',
            'Boundary distance is the answer that changes the outcome most often. Measure it rather than estimating.',
            'The rules it applies are the English permitted development rules. Scotland, Wales and Northern Ireland differ.',
        ],
        status: 'Free',
    },
];

const WORKFLOWS = [
    {
        title: 'The quick quote',
        time: 'About 5 minutes',
        steps: [
            'Screenshot or sketch the scheme you are quoting',
            'Render Engine, detect materials, pick the client\'s cladding',
            'Weather Lab for a bright summer version',
            'Save both to a Project against the client\'s name',
        ],
    },
    {
        title: 'The full scheme pack',
        time: 'About 30 minutes',
        steps: [
            '3D Configurator to build the actual dimensions',
            'Export the plan and elevation PDF',
            'Render in Modulr for the hero exterior view',
            'Material Studio close-up sheet for the specification page',
            'Weather Lab for a seasonal alternate',
            'Everything attached to one Project',
        ],
    },
    {
        title: 'A moving hero for your website',
        time: 'About 3 minutes',
        steps: [
            'Open a finished render, or make one in the Render Engine',
            'Animation Studio, slow push in, with a gentle breeze',
            'Download the MP4 and drop it straight onto your homepage',
            'Repeat for two or three schemes and run them as a slideshow',
        ],
    },
    {
        title: 'Qualifying an enquiry before you quote',
        time: 'About 5 minutes',
        steps: [
            'Planning Checker with the height, footprint and boundary distance the client described',
            'If it comes back borderline, 3D Configurator to try a lower ridge and see what it costs',
            'Export the PDF pack with the permitted development checklist',
            'Send it with the quote so the planning position is answered up front',
        ],
    },
    {
        title: 'From an existing SketchUp model',
        time: 'About 10 minutes',
        steps: [
            'Screenshot your model from the best angle',
            'Line Converter to clean up the line work',
            'Render Engine in SketchUp mode',
            'Material Studio to produce two alternative finishes',
        ],
    },
    {
        title: 'Selling an option change',
        time: 'About 3 minutes',
        steps: [
            'Open the existing render from the Project',
            'Material Studio, Change Materials mode',
            'Swap the cladding, then apply',
            'Send both versions to the client side by side',
        ],
    },
];

const TROUBLESHOOTING = [
    {
        problem: 'The render changed my building',
        fix: 'Run the source through Line Converter first. Clean line work constrains the engine far more than a photograph does. Keep your instructions to materials and lighting rather than describing the structure.',
    },
    {
        problem: 'The materials came out wrong',
        fix: 'Detected materials are only a starting point. Open each of the five pickers and set them explicitly before rendering rather than relying on detection.',
    },
    {
        problem: 'It looks like a computer game',
        fix: 'Use an overcast or golden hour condition in Weather Lab rather than harsh midday sun, and avoid stacking too many dramatic instructions in the notes.',
    },
    {
        problem: 'Two renders of the same scheme do not match',
        fix: 'Generative models vary between runs. For a consistent set, build in the 3D Configurator and render from that, since the geometry is real and every view comes from the same model.',
    },
    {
        problem: 'The output is blurry or lacks detail',
        fix: 'Check the source resolution. Upscaling a small screenshot cannot add detail that was never there. Re-export from your model at a larger size.',
    },
    {
        problem: 'I lost a render',
        fix: 'History only holds recent work on this device. Attach anything you care about to a Project, which saves to your account and is available anywhere.',
    },
    {
        problem: 'I lost a 3D design',
        fix: 'The configurator does not save on its own. Press Save Design in the toolbar and it goes to your account, where you can reopen it and attach it to a Project.',
    },
    {
        problem: 'The client cannot open the link I sent',
        fix: 'Share links are unlisted rather than password protected, so the whole URL matters. Copy it from the project header rather than retyping it, and check you have not disabled the link since you sent it.',
    },
    {
        problem: 'The planning result is not what I expected',
        fix: 'Read the reasoning under the traffic light. It names the limit your answers crossed, and the usual culprit is boundary distance or ridge height. The result is an indication from what you entered, not a determination, and NAPC can confirm it properly.',
    },
];

export const GuideView: React.FC = () => {
    return (
        <div className="h-full flex flex-col bg-background relative overflow-y-auto custom-scrollbar">
            <DraftingBackground pageName="GUIDE" />
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[150px] pointer-events-none" />

            <div className="flex-1 relative z-10 px-6 md:px-12 lg:px-16 py-16 md:py-24">
                <div className="max-w-[1200px] mx-auto space-y-24 md:space-y-32">

                    {/* Hero */}
                    <section className="grid lg:grid-cols-12 gap-10 items-end">
                        <div className="lg:col-span-8 space-y-7">
                            <div className={TYPE.eyebrow}>User Guide</div>
                            <h1 className={TYPE.h1}>How to get the most out of Modulr Studio.</h1>
                            <p className={`${TYPE.lead} max-w-2xl`}>
                                Every tool, what it is for, how to drive it, and the workflows that
                                string them together. If you read one section, make it the workflows.
                            </p>
                        </div>
                        <div className={`lg:col-span-4 ${CARD} p-6 space-y-3`}>
                            <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-secondary">
                                Covered in this guide
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {TOOLS.map(t => (
                                    <span key={t.name} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-accent/8 text-accent border border-accent/15">
                                        {t.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* Start here */}
                    <section className="grid lg:grid-cols-12 gap-10 lg:gap-16">
                        <div className="lg:col-span-5 space-y-5">
                            <div className={TYPE.eyebrow}>Start here</div>
                            <h2 className={TYPE.h2}>The one rule that decides your results.</h2>
                        </div>
                        <div className="lg:col-span-7 space-y-6">
                            <p className={TYPE.body}>
                                The quality of what comes out depends almost entirely on what goes in.
                                A clean, well-composed source produces a faithful render. A dark,
                                cluttered, low-resolution photograph produces a guess.
                            </p>
                            <div className={`${CARD} p-7 space-y-4`}>
                                <div className="flex items-center gap-3">
                                    <CheckCircle2 size={20} className="text-accent shrink-0" />
                                    <h3 className="text-lg font-bold text-accent">What a good input looks like</h3>
                                </div>
                                <ul className="space-y-2.5">
                                    {[
                                        'The whole building in frame, with a little space around it',
                                        'Shot straight on, or at a clean three-quarter angle',
                                        'Even light, with no heavy shadow across the elevation',
                                        'Nothing large blocking the view: cars, bins, scaffolding',
                                        'Reasonable resolution. Phone photos are fine, screenshots of screenshots are not',
                                    ].map(item => (
                                        <li key={item} className="flex gap-3 text-sm md:text-base text-secondary leading-relaxed">
                                            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-accent/50 shrink-0" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* Tools */}
                    <section className="space-y-12">
                        <div className="grid lg:grid-cols-12 gap-10 items-end">
                            <div className="lg:col-span-7 space-y-5">
                                <div className={TYPE.eyebrow}>The tools</div>
                                <h2 className={TYPE.h2}>Every tool, end to end.</h2>
                            </div>
                            <p className={`lg:col-span-5 ${TYPE.body}`}>
                                What it does, what to feed it, how to drive it, and what people
                                actually use it for.
                            </p>
                        </div>

                        <div className="space-y-6">
                            {TOOLS.map((tool, i) => (
                                <article key={tool.name} className={`${CARD} p-8 md:p-10 space-y-8`}>
                                    <div className="grid lg:grid-cols-12 gap-6 lg:gap-12 items-start">
                                        <div className="lg:col-span-5 space-y-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-accent/8 border border-accent/15 flex items-center justify-center text-accent shrink-0">
                                                    {tool.icon}
                                                </div>
                                                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary/50">
                                                    {String(i + 1).padStart(2, '0')}
                                                </span>
                                                {tool.status && (
                                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-accent/8 text-accent border border-accent/15">
                                                        {tool.status}
                                                    </span>
                                                )}
                                            </div>
                                            <h3 className={TYPE.h3}>{tool.name}</h3>
                                            <p className={TYPE.small}>{tool.purpose}</p>

                                            <div className="pt-2 space-y-2">
                                                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/60">
                                                    What to feed it
                                                </div>
                                                <ul className="space-y-1.5">
                                                    {tool.inputs.map(input => (
                                                        <li key={input} className="text-sm text-secondary flex gap-2.5">
                                                            <ArrowRight size={14} className="mt-1 shrink-0 text-accent/50" />
                                                            {input}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>

                                        <div className="lg:col-span-7 space-y-6">
                                            <div className="space-y-3">
                                                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/60">
                                                    How to use it
                                                </div>
                                                <ol className="space-y-2.5">
                                                    {tool.steps.map((step, si) => (
                                                        <li key={step} className="flex gap-3 text-sm md:text-base text-secondary leading-relaxed">
                                                            <span className="shrink-0 w-5 h-5 rounded-full bg-accent/10 text-accent text-[10px] font-bold flex items-center justify-center mt-0.5">
                                                                {si + 1}
                                                            </span>
                                                            {step}
                                                        </li>
                                                    ))}
                                                </ol>
                                            </div>

                                            <div className="space-y-3">
                                                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/60">
                                                    Ways people use it
                                                </div>
                                                <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
                                                    {tool.uses.map(use => (
                                                        <li key={use} className="flex gap-3 text-sm text-secondary leading-relaxed">
                                                            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-accent/50 shrink-0" />
                                                            {use}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-6 border-t border-border/60 space-y-2.5">
                                        {tool.tips.map(tip => (
                                            <div key={tip} className="flex gap-3 text-sm text-secondary leading-relaxed">
                                                <Lightbulb size={16} className="text-accent/60 shrink-0 mt-0.5" />
                                                {tip}
                                            </div>
                                        ))}
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>

                    {/* Workflows */}
                    <section className="space-y-12">
                        <div className="grid lg:grid-cols-12 gap-10 items-end">
                            <div className="lg:col-span-7 space-y-5">
                                <div className={TYPE.eyebrow}>Workflows</div>
                                <h2 className={TYPE.h2}>Putting the tools together.</h2>
                            </div>
                            <p className={`lg:col-span-5 ${TYPE.body}`}>
                                Four routes people run regularly, from a five minute quote to a full
                                scheme pack.
                            </p>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            {WORKFLOWS.map(flow => (
                                <div key={flow.title} className={`${CARD} p-8 space-y-5`}>
                                    <div className="flex items-baseline justify-between gap-4">
                                        <h3 className="text-lg font-bold text-accent tracking-tight">{flow.title}</h3>
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-secondary/60 shrink-0">
                                            {flow.time}
                                        </span>
                                    </div>
                                    <ol className="space-y-2.5">
                                        {flow.steps.map((step, i) => (
                                            <li key={step} className="flex gap-3 text-sm text-secondary leading-relaxed">
                                                <span className="shrink-0 w-5 h-5 rounded-full bg-accent/10 text-accent text-[10px] font-bold flex items-center justify-center mt-0.5">
                                                    {i + 1}
                                                </span>
                                                {step}
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Troubleshooting */}
                    <section className="space-y-10">
                        <div className="lg:w-7/12 space-y-5">
                            <div className={TYPE.eyebrow}>Troubleshooting</div>
                            <h2 className={TYPE.h2}>When it does not look right.</h2>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            {TROUBLESHOOTING.map(item => (
                                <div key={item.problem} className={`${CARD} p-7 space-y-3`}>
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle size={18} className="text-accent/70 shrink-0 mt-0.5" />
                                        <h3 className="text-base font-bold text-accent leading-snug">{item.problem}</h3>
                                    </div>
                                    <p className={TYPE.small}>{item.fix}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className={`${CARD} p-8 md:p-12 text-center space-y-4`}>
                        <BookOpen size={28} className="text-accent mx-auto" />
                        <h2 className="text-2xl font-bold text-accent tracking-tight">Still stuck?</h2>
                        <p className={`${TYPE.small} max-w-xl mx-auto`}>
                            Send us the image you are working from and what you were trying to achieve,
                            and we will tell you the fastest route to it.
                        </p>
                        <a
                            href="mailto:info@napc.uk"
                            className="inline-block text-accent font-bold underline underline-offset-4"
                        >
                            info@napc.uk
                        </a>
                    </section>

                    <div className="h-16" />
                </div>
            </div>
        </div>
    );
};
