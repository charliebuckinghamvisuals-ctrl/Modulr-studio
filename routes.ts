import { AppStage } from './types';

/**
 * One URL, title and description per page.
 *
 * The app used to live entirely at "/" with the page chosen in React state,
 * which meant three things a visitor notices and Google punishes: the tab
 * always said the same thing, the back button left the site instead of
 * going to the previous page, and search engines saw one page rather than
 * fifteen. This table is the single source for the path each stage lives
 * at and the head tags it carries; useAppEngine keeps the address bar and
 * document head in step with it, and public/sitemap.xml lists the indexable
 * entries.
 *
 * Keep the paths stable once shipped: they become inbound links.
 */

export const SITE_ORIGIN = 'https://www.modulrstudio.co.uk';
export const SITE_NAME = 'Modulr Studio';

export interface RouteMeta {
    path: string;
    /** Tab title. The site name is appended automatically except on Home. */
    title: string;
    description: string;
    keywords: string;
    /** false = account pages and workspaces that should never appear in search. */
    indexable: boolean;
}

const COMMON_KEYWORDS =
    'garden room design software, annexe design software, garden room 3D configurator, garden room render, garden office visualisation, garden room CGI, UK garden rooms';

export const ROUTES: Record<AppStage, RouteMeta> = {
    [AppStage.HOME]: {
        path: '/',
        title: 'Modulr Studio - 3D Configurator, Walkthrough and Render Engine for Garden Rooms and Annexes',
        description:
            'Design a garden room or annexe in 3D to real dimensions, walk a client around the outside and through the inside, then render any view like a pro. Built for UK garden room and annexe providers.',
        keywords: `${COMMON_KEYWORDS}, garden room walkthrough, garden room visualiser, annexe visualiser, garden room quoting tool, garden room configurator UK`,
        indexable: true,
    },
    [AppStage.DESIGNER]: {
        path: '/3d-configurator',
        title: '3D Configurator',
        description:
            'Build a garden room or annexe to millimetre dimensions in the browser: box or gable, cladding per elevation, bi-fold and sliding doors, kitchens, bathrooms and lighting. Walk inside and outside, get a live price, and send any view to the Render Engine.',
        keywords: `garden room 3D configurator, annexe configurator, garden room design tool online, garden room planner 3D, design a garden room online, garden room walkthrough, garden office configurator, ${COMMON_KEYWORDS}`,
        indexable: true,
    },
    [AppStage.RENDER_ENGINE]: {
        path: '/render-engine',
        title: 'Render Engine',
        description:
            'Turn a 3D Configurator view, SketchUp screenshot, CAD elevation or line drawing into a pro-level 4K CGI visual of a garden room or annexe in under a minute.',
        keywords: `garden room render, AI render garden room, SketchUp to render, CAD to render, architectural visualisation garden room, garden office render, annexe CGI, ${COMMON_KEYWORDS}`,
        indexable: true,
    },
    [AppStage.UPLOAD]: {
        path: '/render-engine',
        title: 'Render Engine',
        description:
            'Turn a 3D Configurator view, SketchUp screenshot, CAD elevation or line drawing into a pro-level 4K CGI visual of a garden room or annexe in under a minute.',
        keywords: COMMON_KEYWORDS,
        indexable: false,
    },
    [AppStage.INTERIOR_RENDER]: {
        path: '/interior-render-engine',
        title: 'Interior Render Engine',
        description:
            'Render the inside of a garden room or annexe: walk in, frame the view, and get a pro-level interior CGI with the real floor, kitchen, furniture and light through the glazing - nothing added, nothing moved.',
        keywords: `garden room interior render, annexe interior CGI, interior visualisation garden room, garden office interior render, room render from 3D model, ${COMMON_KEYWORDS}`,
        indexable: true,
    },
    [AppStage.LINE_CONVERT]: {
        path: '/line-converter',
        title: 'Line Converter',
        description:
            'Produce clean architectural line drawings of a garden room or annexe from a model screenshot, CAD export or photograph, ready for planning documents or the Render Engine.',
        keywords: `architectural line drawing generator, SketchUp to line drawing, garden room elevation drawing, planning drawing garden room, ${COMMON_KEYWORDS}`,
        indexable: true,
    },
    [AppStage.WEATHER_LAB]: {
        path: '/weather-lab',
        title: 'Weather Lab',
        description:
            'Show the same garden room render in summer sun, winter frost, overcast light or at night. The building stays exactly as designed while the weather, season and atmosphere change.',
        keywords: `render weather change, seasonal render garden room, golden hour render, overcast planning render, ${COMMON_KEYWORDS}`,
        indexable: true,
    },
    [AppStage.DETAIL_STUDIO]: {
        path: '/detail-studio',
        title: 'Detail Studio',
        description:
            'Take a finished garden room render to macro: a 2x2 close-up sheet of the cladding grain, glazing bars and joinery for the specification page, or a single camera shot of any detail - same building, same light.',
        keywords: `garden room material close-up, cladding detail render, architectural detail sheet, material specification sheet, garden room close-up render, ${COMMON_KEYWORDS}`,
        indexable: true,
    },
    [AppStage.MATERIAL_EDITOR]: {
        path: '/material-editor',
        title: 'Material Editor',
        description:
            'Swap cladding, roofing, glazing, doors and decking on an existing garden room render without redrawing it. Only the surface you change is repainted; every other pixel stays as it was.',
        keywords: `garden room cladding visualiser, cladding colour visualiser, composite cladding render, cedar cladding render, material swap render, ${COMMON_KEYWORDS}`,
        indexable: true,
    },
    [AppStage.STUDIO]: {
        path: '/studio',
        title: 'Studio',
        description: 'Isolated studio-background renders of a garden room or annexe for brochures and product pages.',
        keywords: COMMON_KEYWORDS,
        indexable: false,
    },
    [AppStage.EDITOR]: {
        path: '/editor',
        title: 'Editor',
        description: 'Edit and refine a finished render.',
        keywords: COMMON_KEYWORDS,
        indexable: false,
    },
    [AppStage.ANIMATION_STUDIO]: {
        path: '/animation-studio',
        title: 'Animation Studio',
        description:
            'Turn a finished garden room render into a short cinematic 1080p clip - a slow push in, a pan, a breeze through the planting - for your website or social media.',
        keywords: `garden room video render, render to video, animated architectural visualisation, garden room reel, ${COMMON_KEYWORDS}`,
        indexable: true,
    },
    [AppStage.FLOOR_PLAN_STUDIO]: {
        path: '/floor-plan-studio',
        title: 'Floor Plan Studio',
        description:
            'Turn a garden room or annexe design into a rendered floor plan with real materials, or a dimensioned black-and-white CAD plan - from the 3D configurator or an uploaded top view, nothing added or moved.',
        keywords: `garden room floor plan, annexe floor plan, rendered floor plan, 2D floor plan with dimensions, CAD floor plan garden room, ${COMMON_KEYWORDS}`,
        indexable: true,
    },
    [AppStage.ANIMATIONS]: {
        path: '/animations',
        title: 'Animations',
        description: 'Cinematic clips of garden rooms and annexes made in Modulr Studio Animation Studio.',
        keywords: `garden room animation, garden room video, annexe video visualisation, ${COMMON_KEYWORDS}`,
        indexable: true,
    },
    [AppStage.GALLERY]: {
        path: '/gallery',
        title: 'Gallery',
        description: 'Garden room and annexe visuals produced in Modulr Studio: cedar, larch, composite and render finishes, in every season.',
        keywords: `garden room render gallery, garden room design ideas, annexe design ideas, garden office ideas UK, ${COMMON_KEYWORDS}`,
        indexable: true,
    },
    [AppStage.PRICING]: {
        path: '/pricing',
        title: 'Pricing',
        description:
            'Free 7-day tester access with 40 renders and no card. Plans for garden room and annexe providers with the 3D Configurator, walkthrough, Render Engine and Jobs & Quotes.',
        keywords: `garden room software pricing, render software pricing UK, garden room design software free trial, ${COMMON_KEYWORDS}`,
        indexable: true,
    },
    [AppStage.ABOUT]: {
        path: '/about',
        title: 'About',
        description:
            'Modulr Studio is built by NAPC, the UK planning consultancy dedicated to garden rooms and annexes. The platform, the people, contact details, terms and privacy.',
        keywords: `about Modulr Studio, NAPC garden rooms, National Annexe Planning Company, garden room planning consultancy, ${COMMON_KEYWORDS}`,
        indexable: true,
    },
    [AppStage.GUIDE]: {
        path: '/guide',
        title: 'Guide',
        description:
            'How to use every Modulr Studio tool: build a garden room in the 3D Configurator, walk through it, render it, change materials and weather, and put a client pack together.',
        keywords: `how to design a garden room in 3D, garden room render tutorial, Modulr Studio guide, ${COMMON_KEYWORDS}`,
        indexable: true,
    },
    [AppStage.WHY]: {
        path: '/why-modulr',
        title: 'Why Modulr Studio',
        description:
            'Why garden room and annexe providers use Modulr Studio: design, walk, render, specify and quote from one building, at a fraction of the cost of a commissioned CGI.',
        keywords: `best garden room design software, garden room sales tool, garden room CGI cost UK, garden room visualisation software, ${COMMON_KEYWORDS}`,
        indexable: true,
    },
    [AppStage.PLANNING_CHECKER]: {
        path: '/planning-checker',
        title: 'Free Garden Room Planning Permission Checker',
        description:
            'Does your garden room or annexe need planning permission? Answer a few questions about the plot, height and boundary and get a permitted development indication, free and without an account.',
        keywords: `garden room planning permission checker, do I need planning permission for a garden room, permitted development garden room, annexe planning permission UK, garden office planning rules, outbuilding permitted development, ${COMMON_KEYWORDS}`,
        indexable: true,
    },
    [AppStage.PROJECTS]: {
        path: '/jobs',
        title: 'Jobs & Quotes',
        description: 'Your jobs, quotes, price book and pipeline: every garden room priced from its design, and every client, render and proposal in one place.',
        keywords: COMMON_KEYWORDS,
        indexable: false,
    },
    [AppStage.AUTH]: {
        path: '/sign-in',
        title: 'Sign in or create an account',
        description: 'Sign in to Modulr Studio, or create a free tester account with 40 renders over 7 days.',
        keywords: COMMON_KEYWORDS,
        indexable: false,
    },
    [AppStage.ACCOUNT]: {
        path: '/account',
        title: 'Account',
        description: 'Your Modulr Studio account, plan and credits.',
        keywords: COMMON_KEYWORDS,
        indexable: false,
    },
};

/**
 * Paths that were shipped and then renamed. They may be bookmarked or indexed,
 * so they keep opening a page instead of falling through to Home.
 */
const LEGACY_PATHS: Record<string, AppStage> = {
    // Material Studio was split on 21 Sep 2026: the material swap it was
    // indexed for became the Material Editor; close-ups moved to Detail Studio.
    '/material-studio': AppStage.MATERIAL_EDITOR,
    // Projects became Jobs & Quotes on 24 Sep 2026, when quoting moved in.
    '/projects': AppStage.PROJECTS,
};

/** The stage a URL path opens, or null when the path is not a page. */
export const stageFromPath = (pathname: string): AppStage | null => {
    const clean = pathname.replace(/\/+$/, '') || '/';
    if (LEGACY_PATHS[clean]) return LEGACY_PATHS[clean];
    for (const stage of Object.keys(ROUTES) as AppStage[]) {
        // UPLOAD shares /render-engine; the first match wins, and
        // RENDER_ENGINE is declared before it.
        if (ROUTES[stage].path === clean) return stage;
    }
    return null;
};

export const pathForStage = (stage: AppStage): string => ROUTES[stage]?.path ?? '/';

export const fullTitle = (stage: AppStage): string => {
    const { title } = ROUTES[stage];
    return stage === AppStage.HOME ? title : `${title} - ${SITE_NAME}`;
};

/**
 * Write the page's head tags for a stage.
 *
 * Google renders JavaScript, so a title and description set here are what
 * appears in results for that URL; index.html carries the Home values as the
 * static default for crawlers that do not.
 */
export const applyDocumentHead = (stage: AppStage): void => {
    const meta = ROUTES[stage];
    if (!meta) return;

    document.title = fullTitle(stage);

    const setMeta = (selector: string, attr: 'name' | 'property', key: string, content: string) => {
        let el = document.head.querySelector<HTMLMetaElement>(selector);
        if (!el) {
            el = document.createElement('meta');
            el.setAttribute(attr, key);
            document.head.appendChild(el);
        }
        el.setAttribute('content', content);
    };

    const url = `${SITE_ORIGIN}${meta.path}`;
    setMeta('meta[name="description"]', 'name', 'description', meta.description);
    setMeta('meta[name="keywords"]', 'name', 'keywords', meta.keywords);
    setMeta('meta[name="robots"]', 'name', 'robots', meta.indexable ? 'index, follow' : 'noindex, nofollow');
    setMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle(stage));
    setMeta('meta[property="og:description"]', 'property', 'og:description', meta.description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', url);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle(stage));
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', meta.description);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);
};
