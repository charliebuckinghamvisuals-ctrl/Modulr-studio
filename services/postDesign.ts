/**
 * The document model for the Content Studio.
 *
 * The first build composed straight to a canvas from a fixed set of sliders,
 * which made it a form with a preview rather than a design tool: you could not
 * move anything, add anything, or have two pieces of text. This replaces that
 * with a layer list, which is what actually separates the two.
 *
 * GEOMETRY IS NORMALISED. Every x/y/w/h is a fraction of the canvas, never a
 * pixel. That is what lets one design switch between a 1080x1080 square and a
 * 1080x1920 story without anything sliding off the edge, and what lets the
 * editor draw at 380px wide while the export runs at full resolution.
 */

export type ContentFormat = 'square' | 'portrait' | 'story' | 'linkedin';

export interface FormatSpec {
    id: ContentFormat;
    label: string;
    hint: string;
    width: number;
    height: number;
    /** Fractions of height covered by platform UI. Stories are the strict one -
     *  profile row on top, reply bar underneath. */
    safeTop: number;
    safeBottom: number;
}

export const FORMATS: Record<ContentFormat, FormatSpec> = {
    square:   { id: 'square',   label: 'Square',   hint: 'Instagram feed',       width: 1080, height: 1080, safeTop: 0.04, safeBottom: 0.04 },
    portrait: { id: 'portrait', label: 'Portrait', hint: 'Instagram 4:5',        width: 1080, height: 1350, safeTop: 0.04, safeBottom: 0.04 },
    story:    { id: 'story',    label: 'Story',    hint: 'Reels & Stories 9:16', width: 1080, height: 1920, safeTop: 0.13, safeBottom: 0.17 },
    linkedin: { id: 'linkedin', label: 'Landscape',hint: 'LinkedIn & Facebook',  width: 1200, height: 627,  safeTop: 0.05, safeBottom: 0.05 },
};

export const FONTS = {
    montserrat: { label: 'Montserrat', stack: "'Montserrat', system-ui, sans-serif" },
    inter:      { label: 'Inter',      stack: "'Inter', system-ui, sans-serif" },
    playfair:   { label: 'Playfair',   stack: "'Playfair Display', Georgia, serif" },
    dmserif:    { label: 'DM Serif',   stack: "'DM Serif Display', Georgia, serif" },
    archivo:    { label: 'Archivo',    stack: "'Archivo Black', Impact, sans-serif" },
} as const;
export type FontKey = keyof typeof FONTS;

export type LayerType = 'text' | 'shape' | 'logo' | 'image';

interface LayerBase {
    id: string;
    type: LayerType;
    name: string;
    /** All fractions of canvas width/height, top-left origin. */
    x: number; y: number; w: number; h: number;
    opacity: number;
    locked?: boolean;
}

export interface TextLayer extends LayerBase {
    type: 'text';
    text: string;
    font: FontKey;
    weight: number;
    /** Font size as a fraction of canvas WIDTH, so it scales with the frame
     *  rather than stretching when the format gets taller. */
    size: number;
    lineHeight: number;
    letterSpacing: number;
    color: string;
    align: 'left' | 'center' | 'right';
    uppercase: boolean;
    shadow: boolean;
}

export interface ShapeLayer extends LayerBase {
    type: 'shape';
    fill: string;
    radius: number;
}

export interface LogoLayer extends LayerBase {
    type: 'logo';
    /** Null until a logo is uploaded in the brand panel. */
    src: string | null;
    stripWhite: boolean;
    shadow: boolean;
}

export interface ImageLayer extends LayerBase {
    type: 'image';
    src: string;
    fit: 'cover' | 'contain';
    radius: number;
}

export type Layer = TextLayer | ShapeLayer | LogoLayer | ImageLayer;

export interface Background {
    /** The render. Null shows the placeholder state. */
    src: string | null;
    fit: 'cover' | 'contain';
    /** Flat wash over the photo, for text contrast. */
    overlay: string;
    overlayOpacity: number;
    /** Gradient from the bottom, which is what actually keeps a headline
     *  readable without flattening the whole image. */
    scrim: number;
    scrimFrom: 'bottom' | 'top';
    blurBackdrop: boolean;
}

export interface PostDesign {
    format: ContentFormat;
    background: Background;
    layers: Layer[];
}

export interface BrandKit {
    businessName: string;
    website: string;
    accent: string;
    secondary: string;
    logo: string | null;
    font: FontKey;
}

export const DEFAULT_BRAND: BrandKit = {
    businessName: '',
    website: '',
    accent: '#405a56',
    secondary: '#0f172a',
    logo: null,
    font: 'montserrat',
};

let seq = 0;
export const uid = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export const newText = (over: Partial<TextLayer> = {}): TextLayer => ({
    id: uid(), type: 'text', name: 'Text',
    x: 0.07, y: 0.72, w: 0.62, h: 0.1,
    opacity: 1,
    text: 'Your headline',
    font: 'montserrat', weight: 800, size: 0.062, lineHeight: 1.1, letterSpacing: -0.02,
    color: '#ffffff', align: 'left', uppercase: false, shadow: true,
    ...over,
});

export const newShape = (over: Partial<ShapeLayer> = {}): ShapeLayer => ({
    id: uid(), type: 'shape', name: 'Shape',
    x: 0.07, y: 0.66, w: 0.16, h: 0.012,
    opacity: 1, fill: '#405a56', radius: 0.5,
    ...over,
});

export const newLogo = (src: string | null, over: Partial<LogoLayer> = {}): LogoLayer => ({
    id: uid(), type: 'logo', name: 'Logo',
    x: 0.72, y: 0.86, w: 0.2, h: 0.07,
    opacity: 1, src, stripWhite: true, shadow: true,
    ...over,
});

/* ── Templates ────────────────────────────────────────────────────────────
 *
 * Real starting points rather than one hard-coded arrangement. Each is a
 * function of the brand so the colours and the business name are already in
 * place - a template that needs ten edits before it looks like yours is not
 * doing its job.
 */

export interface Template {
    id: string;
    name: string;
    description: string;
    build: (brand: BrandKit) => { background: Partial<Background>; layers: Layer[] };
}

export const TEMPLATES: Template[] = [
    {
        id: 'clean',
        name: 'Clean',
        description: 'Photo first, one line of text',
        build: (b) => ({
            background: { scrim: 0.5, scrimFrom: 'bottom', overlayOpacity: 0 },
            layers: [
                newShape({ fill: b.accent, x: 0.07, y: 0.775, w: 0.13, h: 0.009 }),
                newText({ text: b.businessName || 'Garden studio', y: 0.81, size: 0.058, font: b.font, w: 0.7 }),
                newLogo(b.logo, { x: 0.74, y: 0.855, w: 0.19, h: 0.06 }),
            ],
        }),
    },
    {
        id: 'editorial',
        name: 'Editorial',
        description: 'Serif headline, generous space',
        build: (b) => ({
            background: { scrim: 0.62, scrimFrom: 'bottom', overlayOpacity: 0.08, overlay: '#0f172a' },
            layers: [
                newText({ text: 'A quiet room at the end of the garden', y: 0.66, size: 0.058, font: 'playfair', weight: 500, letterSpacing: -0.01, lineHeight: 1.15, w: 0.72 }),
                newShape({ fill: b.accent, x: 0.07, y: 0.845, w: 0.09, h: 0.006 }),
                newText({ text: b.businessName || 'Your studio', y: 0.87, size: 0.024, weight: 700, letterSpacing: 0.14, uppercase: true, font: 'montserrat', w: 0.6, shadow: false }),
                newLogo(b.logo, { x: 0.76, y: 0.855, w: 0.17, h: 0.055 }),
            ],
        }),
    },
    {
        id: 'banner',
        name: 'Banner',
        description: 'Solid brand band under the photo',
        build: (b) => ({
            background: { scrim: 0, overlayOpacity: 0 },
            layers: [
                { id: uid(), type: 'shape', name: 'Brand band', x: 0, y: 0.78, w: 1, h: 0.22, opacity: 1, fill: b.accent, radius: 0 } as ShapeLayer,
                newText({ text: b.businessName || 'Your business', y: 0.825, size: 0.05, weight: 800, w: 0.62, shadow: false }),
                newText({ text: b.website || 'yourwebsite.co.uk', y: 0.895, size: 0.026, weight: 600, letterSpacing: 0.06, w: 0.62, shadow: false, color: 'rgba(255,255,255,0.82)' }),
                newLogo(b.logo, { x: 0.75, y: 0.83, w: 0.18, h: 0.11 }),
            ],
        }),
    },
    {
        id: 'poster',
        name: 'Poster',
        description: 'Big condensed type, high contrast',
        build: (b) => ({
            background: { scrim: 0.72, scrimFrom: 'bottom', overlay: '#0f172a', overlayOpacity: 0.12 },
            layers: [
                newText({ text: 'HOME GYM', y: 0.63, size: 0.115, font: 'archivo', weight: 400, letterSpacing: -0.02, lineHeight: 0.95, w: 0.86 }),
                newText({ text: '4.2m × 3.0m · Siberian larch', y: 0.79, size: 0.028, weight: 600, letterSpacing: 0.04, color: 'rgba(255,255,255,0.85)', w: 0.8 }),
                newShape({ fill: b.accent, x: 0.07, y: 0.845, w: 0.2, h: 0.008 }),
                newLogo(b.logo, { x: 0.75, y: 0.86, w: 0.18, h: 0.055 }),
            ],
        }),
    },
    {
        id: 'badge',
        name: 'Badge',
        description: 'Corner label, image left alone',
        build: (b) => ({
            background: { scrim: 0.22, scrimFrom: 'bottom', overlayOpacity: 0 },
            layers: [
                { id: uid(), type: 'shape', name: 'Badge', x: 0.06, y: 0.06, w: 0.42, h: 0.085, opacity: 0.95, fill: b.accent, radius: 0.5 } as ShapeLayer,
                newText({ text: b.businessName || 'Your business', x: 0.085, y: 0.079, size: 0.03, weight: 800, letterSpacing: 0.02, w: 0.37, shadow: false }),
                newLogo(b.logo, { x: 0.76, y: 0.88, w: 0.17, h: 0.055 }),
            ],
        }),
    },
    {
        id: 'minimal',
        name: 'Minimal',
        description: 'Logo only, nothing else',
        build: (b) => ({
            background: { scrim: 0.28, scrimFrom: 'bottom', overlayOpacity: 0 },
            layers: [newLogo(b.logo, { x: 0.39, y: 0.87, w: 0.22, h: 0.07 })],
        }),
    },
];

export const DEFAULT_BACKGROUND: Background = {
    src: null,
    fit: 'cover',
    overlay: '#0f172a',
    overlayOpacity: 0,
    scrim: 0.5,
    scrimFrom: 'bottom',
    blurBackdrop: true,
};

export const applyTemplate = (t: Template, brand: BrandKit, current: PostDesign): PostDesign => {
    const built = t.build(brand);
    return {
        ...current,
        background: { ...DEFAULT_BACKGROUND, ...current.background, ...built.background },
        // Logo layers are dropped when there is no logo, rather than leaving an
        // empty box the user has to find and delete.
        layers: built.layers.filter(l => l.type !== 'logo' || (l as LogoLayer).src),
    };
};

/** Clamp a layer inside the frame, leaving a sliver visible so nothing can be
 *  dragged somewhere it cannot be grabbed back from. */
export const clampLayer = <T extends Layer>(l: T): T => ({
    ...l,
    x: Math.min(Math.max(l.x, -l.w + 0.06), 1 - 0.06),
    y: Math.min(Math.max(l.y, -l.h + 0.03), 1 - 0.03),
});
