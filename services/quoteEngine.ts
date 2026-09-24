/**
 * Quoting: a garden-room company's price book, applied to a design.
 *
 * Three steps, all pure (no Firebase, no React) so the 3D configurator can
 * import this file as well as the app - one engine, so the live price in the
 * configurator and the quote in Projects can never disagree:
 *
 *   takeoff(scene)       measure the saved 3D design: floor area, wall area
 *                        by cladding, doors by kind, windows, internal walls,
 *                        lights, sanitaryware, kitchen runs, decking...
 *   buildQuote(book, t)  turn the measurements into priced lines, category by
 *                        category, from the company's own rates.
 *   quoteTotals(q)       subtotal, discount, VAT, total, margin, payment stages.
 *
 * Every rate is EX VAT. VAT is added once, on the total, when the company is
 * VAT registered - the way a UK quotation is laid out.
 */

// ---------------------------------------------------------------------------
// Categories, units, measurements
// ---------------------------------------------------------------------------

export type QuoteCategoryId =
    | 'building' | 'groundworks' | 'cladding' | 'roof' | 'external_doors' | 'windows'
    | 'internal' | 'finishes' | 'electrics' | 'heating' | 'bathroom' | 'kitchen'
    | 'outdoor' | 'installation' | 'fees' | 'extras';

export const QUOTE_CATEGORIES: { id: QuoteCategoryId; label: string; blurb: string }[] = [
    { id: 'building', label: 'The building', blurb: 'The insulated shell, priced by its size' },
    { id: 'groundworks', label: 'Groundworks & base', blurb: 'Foundations, site preparation' },
    { id: 'cladding', label: 'Cladding & exterior', blurb: 'Wall finish, fascia, guttering' },
    { id: 'roof', label: 'Roof', blurb: 'Coverings, canopy, roof shape' },
    { id: 'external_doors', label: 'External doors', blurb: 'Single, French, bi-fold, sliding' },
    { id: 'windows', label: 'Windows & glazing', blurb: 'Windows, rooflights, apex glazing' },
    { id: 'internal', label: 'Internal walls & doors', blurb: 'Partitions and internal doors' },
    { id: 'finishes', label: 'Interior finishes', blurb: 'Flooring, walls, ceilings' },
    { id: 'electrics', label: 'Electrics & lighting', blurb: 'Supply, sockets, lights' },
    { id: 'heating', label: 'Heating & cooling', blurb: 'Heaters, air conditioning' },
    { id: 'bathroom', label: 'Bathroom & plumbing', blurb: 'WC, basin, shower, water' },
    { id: 'kitchen', label: 'Kitchen', blurb: 'Units, worktops, appliances' },
    { id: 'outdoor', label: 'Outdoor & landscaping', blurb: 'Decking, paths, fencing' },
    { id: 'installation', label: 'Delivery & installation', blurb: 'Delivery, access, waste' },
    { id: 'fees', label: 'Planning & fees', blurb: 'Drawings, applications, approvals' },
    { id: 'extras', label: 'Other', blurb: 'Anything else' },
];

export const categoryLabel = (id: QuoteCategoryId) =>
    QUOTE_CATEGORIES.find(c => c.id === id)?.label ?? 'Other';

export type PriceUnit = 'each' | 'm2' | 'lm' | 'leaf' | 'item' | 'day' | 'hour';

export const UNIT_LABELS: Record<PriceUnit, string> = {
    each: 'each',
    m2: 'm²',
    lm: 'm',
    leaf: 'leaf',
    item: 'item',
    day: 'day',
    hour: 'hour',
};
/** "per m²", "per leaf" - for rate columns. */
export const perUnit = (u: PriceUnit) => (u === 'item' ? '' : u === 'each' ? 'each' : `per ${UNIT_LABELS[u]}`);

/**
 * What can be counted off a design. A price book item that names one of these
 * gets its quantity from the drawing; anything else is added by hand.
 */
export type MeasureKey =
    | 'footprint_m2' | 'internal_floor_m2' | 'wall_net_m2' | 'perimeter_lm'
    | 'clad_composite_m2' | 'clad_timber_m2' | 'clad_metal_m2' | 'clad_painted_m2' | 'clad_render_m2' | 'clad_fibre_cement_m2'
    | 'gutter_lm' | 'picture_frame'
    | 'roof_m2' | 'roof_epdm_m2' | 'roof_green_m2' | 'roof_metal_m2' | 'roof_tiles_m2' | 'roof_slate_m2'
    | 'gable_m2' | 'canopy_m2' | 'lshape'
    | 'door_single' | 'door_french' | 'door_bifold_leaf' | 'door_sliding_leaf' | 'door_sets' | 'door_crittall'
    | 'window_each' | 'window_m2' | 'window_crittall' | 'skylight_flat' | 'skylight_lantern' | 'apex_glazing'
    | 'partition_lm' | 'internal_door'
    | 'floor_finish_m2'
    | 'downlight' | 'pendant' | 'ext_light'
    | 'heater' | 'aircon' | 'towel_rail' | 'water_heater'
    | 'wc' | 'basin' | 'shower' | 'extractor_fan'
    | 'kitchen_base_lm' | 'kitchen_wall_lm' | 'kitchen_tall' | 'worktop_lm' | 'kitchen_sink' | 'kitchen_hob' | 'kitchen_extractor' | 'kitchen_island'
    | 'decking_m2' | 'bay_m2' | 'path_m2' | 'fence_lm' | 'hot_tub' | 'garden_steps';

export const MEASURES: Record<MeasureKey, { label: string; unit: PriceUnit }> = {
    footprint_m2: { label: 'Building footprint', unit: 'm2' },
    internal_floor_m2: { label: 'Internal floor area', unit: 'm2' },
    wall_net_m2: { label: 'External walls, less openings', unit: 'm2' },
    perimeter_lm: { label: 'Building perimeter', unit: 'lm' },
    clad_composite_m2: { label: 'Composite cladding area', unit: 'm2' },
    clad_timber_m2: { label: 'Timber cladding area', unit: 'm2' },
    clad_metal_m2: { label: 'Metal cladding area', unit: 'm2' },
    clad_painted_m2: { label: 'Painted board cladding area', unit: 'm2' },
    clad_render_m2: { label: 'Render area', unit: 'm2' },
    clad_fibre_cement_m2: { label: 'Fibre cement board area', unit: 'm2' },
    gutter_lm: { label: 'Guttering run (when fitted)', unit: 'lm' },
    picture_frame: { label: 'Picture frame surround', unit: 'each' },
    roof_m2: { label: 'Roof area', unit: 'm2' },
    roof_epdm_m2: { label: 'EPDM / rubber roof area', unit: 'm2' },
    roof_green_m2: { label: 'Sedum (green) roof area', unit: 'm2' },
    roof_metal_m2: { label: 'Metal roof area', unit: 'm2' },
    roof_tiles_m2: { label: 'Clay tile roof area', unit: 'm2' },
    roof_slate_m2: { label: 'Slate roof area', unit: 'm2' },
    gable_m2: { label: 'Apex roof (footprint area)', unit: 'm2' },
    canopy_m2: { label: 'Canopy area', unit: 'm2' },
    lshape: { label: 'L-shaped building', unit: 'each' },
    door_single: { label: 'Single doors', unit: 'each' },
    door_french: { label: 'French door pairs', unit: 'each' },
    door_bifold_leaf: { label: 'Bi-fold door leaves', unit: 'leaf' },
    door_sliding_leaf: { label: 'Sliding door panes', unit: 'leaf' },
    door_sets: { label: 'External door sets (any kind)', unit: 'each' },
    door_crittall: { label: 'Doors with Crittall-style bars', unit: 'each' },
    window_each: { label: 'Windows (count)', unit: 'each' },
    window_m2: { label: 'Window area', unit: 'm2' },
    window_crittall: { label: 'Windows with Crittall-style bars', unit: 'each' },
    skylight_flat: { label: 'Flat rooflights', unit: 'each' },
    skylight_lantern: { label: 'Roof lanterns', unit: 'each' },
    apex_glazing: { label: 'Glazed apex', unit: 'each' },
    partition_lm: { label: 'Internal walls', unit: 'lm' },
    internal_door: { label: 'Internal doors', unit: 'each' },
    floor_finish_m2: { label: 'Floor finish area', unit: 'm2' },
    downlight: { label: 'Downlights', unit: 'each' },
    pendant: { label: 'Pendant lights', unit: 'each' },
    ext_light: { label: 'External lights', unit: 'each' },
    heater: { label: 'Heaters', unit: 'each' },
    aircon: { label: 'Air conditioning units', unit: 'each' },
    towel_rail: { label: 'Towel rails', unit: 'each' },
    water_heater: { label: 'Water heaters', unit: 'each' },
    wc: { label: 'WCs', unit: 'each' },
    basin: { label: 'Basins / vanity units', unit: 'each' },
    shower: { label: 'Showers', unit: 'each' },
    extractor_fan: { label: 'Extractor fans', unit: 'each' },
    kitchen_base_lm: { label: 'Kitchen base units', unit: 'lm' },
    kitchen_wall_lm: { label: 'Kitchen wall units', unit: 'lm' },
    kitchen_tall: { label: 'Tall units (fridge, oven, larder)', unit: 'each' },
    worktop_lm: { label: 'Worktop', unit: 'lm' },
    kitchen_sink: { label: 'Kitchen sinks', unit: 'each' },
    kitchen_hob: { label: 'Hobs', unit: 'each' },
    kitchen_extractor: { label: 'Cooker hoods', unit: 'each' },
    kitchen_island: { label: 'Kitchen islands', unit: 'each' },
    decking_m2: { label: 'Decking area', unit: 'm2' },
    bay_m2: { label: 'Covered outdoor section', unit: 'm2' },
    path_m2: { label: 'Garden paths', unit: 'm2' },
    fence_lm: { label: 'Fencing', unit: 'lm' },
    hot_tub: { label: 'Hot tubs', unit: 'each' },
    garden_steps: { label: 'Garden steps / ramps', unit: 'each' },
};

export type Measures = Partial<Record<MeasureKey, number>>;

/** Upgrades on a building's standard spec: charged even where a set design
 *  covers the category they sit in. */
export const UPGRADE_MEASURES = new Set<MeasureKey>([
    'clad_timber_m2', 'clad_metal_m2', 'clad_painted_m2', 'clad_render_m2', 'clad_fibre_cement_m2', 'picture_frame',
    'roof_green_m2', 'roof_metal_m2', 'roof_tiles_m2', 'roof_slate_m2', 'gable_m2', 'canopy_m2', 'lshape',
    'door_crittall', 'window_crittall', 'skylight_flat', 'skylight_lantern', 'apex_glazing',
]);

// ---------------------------------------------------------------------------
// Price book
// ---------------------------------------------------------------------------

export interface PriceItem {
    id: string;
    category: QuoteCategoryId;
    name: string;
    /** Printed under the line on the customer's quote. */
    description?: string;
    unit: PriceUnit;
    /** Sell price per unit, ex VAT. 0 prints as "Included". */
    rate: number;
    /** What it costs the company per unit, ex VAT. Optional; only ever shown
     *  to the company, for the margin. */
    cost?: number | null;
    /** Counted off the design. */
    measure?: MeasureKey | null;
    /** On every quote at a quantity of 1 (delivery, waste, certification). */
    always?: boolean;
}

/**
 * How the building itself is priced - the part every company does its own
 * way. Per m² is the most common; a width x depth price table is how the
 * big names publish theirs (Eden, Booths); size bands by floor area suit a
 * range of standard sizes; base + per m² is a fixed setup cost plus area;
 * per job is a price typed on each quote.
 */
export type BuildingMethod = 'models' | 'per_m2' | 'grid' | 'bands' | 'base_plus_m2' | 'manual';

/**
 * One of the company's set designs - "The Studio, 3 x 2.5 m, £14,995" - the
 * way most providers actually sell. `covers` is what the price already
 * includes: anything the design has in those categories goes on the quote as
 * Included rather than being charged a second time.
 */
export interface DesignModel {
    id: string;
    name: string;
    widthM: number;
    depthM: number;
    price: number;
    cost?: number | null;
    /** Printed under it on the quote. */
    includes: string;
    covers: QuoteCategoryId[];
    /** A photo or render of the design, for the price book and the quote. */
    imageUrl?: string | null;
    /** What is in the price, for the customer: parts with their share of it.
     *  The building line carries whatever the parts do not. */
    breakdown?: ModelPart[];
}

export interface ModelPart { id: string; category: QuoteCategoryId; name: string; amount: number }

/** What a set design's parts add up to, and what is left for the building line. */
export const modelSplit = (m: DesignModel) => {
    const parts = (m.breakdown || []).reduce((t, x) => t + (x.amount || 0), 0);
    return { parts: round2(parts), shell: round2(Math.max(0, m.price - parts)), over: parts > m.price + 0.005 };
};

export interface SizeBand { upToM2: number; price: number }

/** Width x depth price table: prices[w][d] for widths[w] by depths[d], in
 *  metres. A design takes the smallest size that holds it. 0 = not offered. */
export interface SizeGrid { widths: number[]; depths: number[]; prices: number[][] }

export interface BuildingPricing {
    method: BuildingMethod;
    /** Which area the size is measured by. External footprint is what a
     *  customer means by "a 4 by 3". */
    basis: 'external' | 'internal';
    name: string;
    ratePerM2: number;
    basePrice: number;
    minimum: number;
    bands: SizeBand[];
    /** Above the largest band, each extra m² at this rate. */
    overBandRatePerM2: number;
    grid: SizeGrid;
    models: DesignModel[];
    /** Cost to the company per m², for the margin. Optional. */
    costPerM2?: number | null;
    /** "What's included" - printed on the quote under the building. */
    includes: string;
}

export interface PaymentStage { id: string; label: string; pct: number }

export type QuoteDetail = 'itemised' | 'categories' | 'total';

export interface PriceBook {
    v: 1;
    building: BuildingPricing;
    items: PriceItem[];
    vatRegistered: boolean;
    vatRate: number;
    /** Rates are typed INCLUDING VAT (how most garden-room companies publish
     *  prices). The quote then shows inc-VAT line prices and takes the VAT
     *  back out of the total, instead of adding it on. */
    pricesIncVat: boolean;
    validityDays: number;
    stages: PaymentStage[];
    numberPrefix: string;
    nextNumber: number;
    intro: string;
    terms: string;
    leadTime: string;
    /** How much of the working the customer's PDF shows by default. */
    detail: QuoteDetail;
    updatedAt?: number;
}

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined';

export interface QuoteLine {
    id: string;
    category: QuoteCategoryId;
    name: string;
    description?: string;
    qty: number;
    unit: PriceUnit;
    rate: number;
    cost?: number | null;
    /** design: counted off the drawing; building: the building price;
     *  book: from the price book by hand or on every quote; manual: typed in. */
    source: 'design' | 'building' | 'book' | 'manual';
    itemId?: string;
    measure?: MeasureKey;
    /** Offered to the customer but not in the total. */
    optional?: boolean;
    /** The quantity was changed by hand - a design refresh leaves it alone. */
    qtyEdited?: boolean;
    /** The price was changed by hand on this quote. */
    rateEdited?: boolean;
    /** Covered by the building price (a set design's standard spec): listed
     *  for the customer, charged at nothing. */
    included?: boolean;
}

export interface QuoteDiscount { kind: 'pct' | 'amount'; value: number; label: string }

export interface Quote {
    id: string;
    number: string;
    version: number;
    status: QuoteStatus;
    title: string;
    /** One line of what is being quoted: size, roof, cladding, openings. */
    spec: string;
    /** The building's size in m², as priced - editable on a blank quote. */
    areaM2: number;
    widthM: number | null;
    depthM: number | null;
    lines: QuoteLine[];
    discount: QuoteDiscount;
    vatRegistered: boolean;
    vatRate: number;
    /** Line prices include VAT - see PriceBook.pricesIncVat. */
    pricesIncVat: boolean;
    stages: PaymentStage[];
    intro: string;
    terms: string;
    leadTime: string;
    includes: string;
    detail: QuoteDetail;
    validDays: number;
    /** Hash of the design the quantities were measured from. */
    designHash: string | null;
    /** The project image printed at the top of the PDF; null for none. */
    imageId?: string | null;
    /** The set design the building is priced as (method 'models'). */
    modelId?: string | null;
    createdAt: number;
    updatedAt: number;
    sentAt: number | null;
    decidedAt: number | null;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export const uid = () =>
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
        : Math.random().toString(36).slice(2, 14);

export const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Quantities are counted in whole units, areas and lengths to 0.1. */
export const roundQty = (unit: PriceUnit, n: number) =>
    unit === 'm2' || unit === 'lm' || unit === 'hour' || unit === 'day' ? round1(n) : Math.round(n);

export const lineTotal = (l: Pick<QuoteLine, 'qty' | 'rate'> & { included?: boolean }) =>
    l.included ? 0 : round2((l.qty || 0) * (l.rate || 0));

/** "12.0 m²", "3 leaves", "2" - a quantity as the customer reads it. */
export const formatQty = (l: Pick<QuoteLine, 'qty' | 'unit'>) => {
    const q = l.qty || 0;
    const n = Number.isInteger(q) ? String(q) : q.toFixed(1);
    switch (l.unit) {
        case 'm2': return `${q.toFixed(1)} m²`;
        case 'lm': return `${q.toFixed(1)} m`;
        case 'leaf': return `${n} ${q === 1 ? 'leaf' : 'leaves'}`;
        case 'day': return `${n} day${q === 1 ? '' : 's'}`;
        case 'hour': return `${n} hr${q === 1 ? '' : 's'}`;
        default: return n;
    }
};

export const formatGBP = (n: number, pence = false) =>
    new Intl.NumberFormat('en-GB', {
        style: 'currency', currency: 'GBP',
        minimumFractionDigits: pence ? 2 : 0, maximumFractionDigits: pence ? 2 : 0,
    }).format(Number.isFinite(n) ? n : 0);

/** A short fingerprint of a saved design, to notice when it has changed. */
export const hashDesign = (s: string | null | undefined): string | null => {
    if (!s) return null;
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + ':' + s.length.toString(36);
};

// ---------------------------------------------------------------------------
// Take-off: measuring the design
// ---------------------------------------------------------------------------

type Pt = [number, number];

export interface Takeoff {
    measures: Measures;
    widthM: number;
    depthM: number;
    /** The area the building is priced by (external or internal, per book). */
    externalM2: number;
    internalM2: number;
    spec: string;
    /** What was counted, in words, for the "measured from your design" panel. */
    facts: { label: string; value: string }[];
}

const CLAD_FAMILY = (key: string | undefined): MeasureKey => {
    const k = (key || '').toLowerCase();
    if (k.includes('composite')) return 'clad_composite_m2';
    if (k.includes('metal') || k.includes('corrugated')) return 'clad_metal_m2';
    if (k.includes('render')) return 'clad_render_m2';
    if (k.includes('fire_board')) return 'clad_fibre_cement_m2';
    if (k.includes('painted')) return 'clad_painted_m2';
    // cedar, oak, timber, charred, siding, plank
    return 'clad_timber_m2';
};

const CLAD_WORDS: Partial<Record<MeasureKey, string>> = {
    clad_composite_m2: 'composite cladding',
    clad_timber_m2: 'timber cladding',
    clad_metal_m2: 'metal cladding',
    clad_painted_m2: 'painted board cladding',
    clad_render_m2: 'render',
    clad_fibre_cement_m2: 'fibre cement cladding',
};

const ROOF_FAMILY = (key: string | undefined): MeasureKey => {
    const k = (key || 'epdm').toLowerCase();
    if (k === 'sedum') return 'roof_green_m2';
    if (k.includes('clay')) return 'roof_tiles_m2';
    if (k.includes('slate')) return 'roof_slate_m2';
    if (k === 'metal' || k === 'aluminium' || k.includes('corrugated')) return 'roof_metal_m2';
    return 'roof_epdm_m2';
};

const ROOF_WORDS: Partial<Record<MeasureKey, string>> = {
    roof_epdm_m2: 'EPDM',
    roof_green_m2: 'sedum',
    roof_metal_m2: 'metal',
    roof_tiles_m2: 'clay tile',
    roof_slate_m2: 'slate',
};

const polyArea = (pts: Pt[]) => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
        const [x1, z1] = pts[i];
        const [x2, z2] = pts[(i + 1) % pts.length];
        a += x1 * z2 - x2 * z1;
    }
    return Math.abs(a) / 2;
};

const polyLength = (pts: Pt[]) => {
    let l = 0;
    for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return l;
};

const validPts = (v: unknown): Pt[] =>
    Array.isArray(v) ? v.filter((p): p is Pt => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) : [];

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Width along the wall of kitchen and joinery objects, in metres. */
const KITCHEN_BASE_W: Record<string, number> = {
    kitchen_unit_600: 0.6, kitchen_unit_1200: 1.2, kitchen_sink_1200: 1.2,
    kitchen_drawer_2: 0.6, kitchen_drawer_3: 0.6, kitchen_corner_unit: 1.0,
};
const KITCHEN_WALL_W: Record<string, number> = { kitchen_wall_unit_600: 0.6, kitchen_wall_unit_1200: 1.2 };
const KITCHEN_TALL = new Set(['kitchen_tall_fridge', 'kitchen_tall_oven_single', 'kitchen_tall_oven_double', 'kitchen_tall_larder']);

const COUNTED: Partial<Record<string, MeasureKey>> = {
    spot_light: 'downlight',
    pendant_light: 'pendant', drop_light: 'pendant',
    canopy_spot: 'ext_light', exterior_wall_light: 'ext_light',
    wall_light_sconce: 'ext_light', wall_light_angled: 'ext_light', wall_light_box: 'ext_light', wall_light_slim: 'ext_light',
    heater_small: 'heater', heater_large: 'heater',
    aircon_indoor: 'aircon',
    towel_heater: 'towel_rail',
    boiler: 'water_heater',
    toilet: 'wc',
    sink: 'basin', vanity: 'basin',
    shower: 'shower', shower_corner: 'shower', shower_small: 'shower',
    external_extraction_fan: 'extractor_fan',
    kitchen_tall_fridge: 'kitchen_tall', kitchen_tall_oven_single: 'kitchen_tall', kitchen_tall_oven_double: 'kitchen_tall', kitchen_tall_larder: 'kitchen_tall',
    kitchen_sink_1200: 'kitchen_sink',
    kitchen_hob_gas: 'kitchen_hob', kitchen_hob_induction: 'kitchen_hob',
    kitchen_extractor: 'kitchen_extractor',
    kitchen_island: 'kitchen_island',
    interior_door: 'internal_door',
    hot_tub: 'hot_tub',
    garden_steps: 'garden_steps', garden_ramp: 'garden_steps',
};

/** Parse whatever Projects holds in scene3d: the {v:2, room, objects...}
 *  save, or the bare room older saves hold. */
export const parseScene = (scene: unknown): { room: any; objects: any[]; fences: any[]; paths: any[]; decks: any[] } | null => {
    let s: any = scene;
    if (typeof s === 'string') {
        try { s = JSON.parse(s); } catch { return null; }
    }
    if (!s || typeof s !== 'object') return null;
    const room = s.room && typeof s.room === 'object' ? s.room : s;
    if (typeof room.widthMm !== 'number' || typeof room.depthMm !== 'number') return null;
    return {
        room,
        objects: Array.isArray(s.objects) ? s.objects : [],
        fences: Array.isArray(s.fences) ? s.fences : [],
        paths: Array.isArray(s.paths) ? s.paths : [],
        decks: Array.isArray(s.decks) ? s.decks : [],
    };
};

const doorKindOf = (d: any): 'hinged' | 'french' | 'bifold' | 'sliding' =>
    d.kind ?? (num(d.leaves, 1) <= 1 ? 'hinged' : num(d.leaves) === 2 ? 'french' : 'bifold');

export function takeoff(scene: unknown): Takeoff | null {
    const s = parseScene(scene);
    if (!s) return null;
    const { room, objects, fences, paths, decks } = s;
    const m: Measures = {};
    const add = (k: MeasureKey, v: number) => { if (v > 0 && Number.isFinite(v)) m[k] = (m[k] || 0) + v; };

    const w = num(room.widthMm) / 1000;
    const d = num(room.depthMm) / 1000;
    const t = num(room.wallThicknessMm, 150) / 1000;
    const base = num(room.baseHeightMm, 150) / 1000;
    const isGable = room.shape === 'Gable';
    const isL = room.shape === 'LShape';
    const sideGable = isGable && room.gableOrientation === 'side';

    // Footprint, less an L's cut-out.
    const notchW = isL ? Math.min(num(room.lShapeCutoutWidthMm) / 1000, w - 0.5) : 0;
    const notchD = isL ? Math.min(num(room.lShapeCutoutDepthMm) / 1000, d - 0.5) : 0;
    const notch = isL && notchW > 0 && notchD > 0 ? notchW * notchD : 0;
    const footprint = Math.max(0, w * d - notch);

    // The covered outdoor section takes a slice of the shell (utils/bay).
    let bayArea = 0;
    if (room.bay && num(room.bay.widthMm) > 0) {
        const bw = Math.min(num(room.bay.widthMm) / 1000, Math.max(0, w - 2 * t - 1.5));
        const bd = room.bay.depthMm ? Math.min(num(room.bay.depthMm) / 1000, d - t) : d - t;
        bayArea = bw > 0 ? bw * bd : 0;
    }

    const internalGross = Math.max(0, (w - 2 * t) * (d - 2 * t) - (notch > 0 ? Math.max(0, (notchW - t) * (notchD - t)) : 0));
    const internal = Math.max(0, internalGross - bayArea);

    add('footprint_m2', footprint);
    add('internal_floor_m2', internal);
    add('floor_finish_m2', internal);
    add('bay_m2', bayArea);
    if (isL && notch > 0) add('lshape', 1);

    // Wall heights. A box room's heightMm/backHeightMm are ground to the top
    // at the front and back; a gable's heightMm is ground to the RIDGE.
    const roofRise = num(room.roofHeightMm, 300) / 1000;
    const frontH = isGable
        ? Math.max(1.8, num(room.heightMm, 2500) / 1000 - base - roofRise)
        : Math.max(1.8, num(room.heightMm, 2050) / 1000 - base);
    const backH = isGable ? frontH : Math.max(1.8, num(room.backHeightMm, num(room.heightMm, 2050)) / 1000 - base);
    const sideH = (frontH + backH) / 2;

    // Gross wall area per face. An L's perimeter equals its rectangle's; the
    // notch's two faces are counted with the walls they face.
    const faces: Record<'front' | 'back' | 'left' | 'right', number> = {
        front: w * frontH,
        back: w * backH,
        left: d * sideH,
        right: d * sideH,
    };
    // Gable triangles: on the front/back walls, or the sides for a side gable.
    let gableTri = 0;
    if (isGable) {
        const span = sideGable ? d : w;
        gableTri = (span * roofRise) / 2;
        if (sideGable) { faces.left += gableTri; faces.right += gableTri; }
        else {
            faces.back += gableTri;
            if (!room.hasApexGlazing) faces.front += gableTri;
        }
    }
    // The bay's open front has no wall.
    if (bayArea > 0) faces.front = Math.max(0, faces.front - Math.min(num(room.bay.widthMm) / 1000, w) * frontH);

    // Openings, by wall.
    const doors: any[] = Array.isArray(room.doors) ? room.doors : [];
    const windows: any[] = Array.isArray(room.windows) ? room.windows : [];
    const openingOn: Record<string, number> = {};
    let doorSets = 0, singles = 0, frenchPairs = 0, bifoldLeaves = 0, slidingLeaves = 0;
    for (const dr of doors) {
        const area = (num(dr.widthMm) / 1000) * (num(dr.heightMm) / 1000);
        openingOn[dr.wall] = (openingOn[dr.wall] || 0) + area;
        doorSets++;
        const kind = doorKindOf(dr);
        const leaves = Math.max(1, Math.round(num(dr.leaves, 1)));
        if (kind === 'hinged') { add('door_single', 1); singles++; }
        else if (kind === 'french') { add('door_french', 1); frenchPairs++; }
        else if (kind === 'bifold') { add('door_bifold_leaf', leaves); bifoldLeaves += leaves; }
        else { add('door_sliding_leaf', leaves); slidingLeaves += leaves; }
        if (dr.style === 'crittall') add('door_crittall', 1);
    }
    add('door_sets', doorSets);

    let windowArea = 0;
    for (const wn of windows) {
        const area = (num(wn.widthMm) / 1000) * (num(wn.heightMm) / 1000);
        openingOn[wn.wall] = (openingOn[wn.wall] || 0) + area;
        windowArea += area;
        if (wn.style === 'crittall') add('window_crittall', 1);
    }
    add('window_each', windows.length);
    add('window_m2', windowArea);

    // Net wall area by cladding family, honouring per-face overrides.
    let wallNet = 0;
    const cladByFace: Record<string, string | undefined> = {
        front: room.claddingFront, back: room.claddingBack, left: room.claddingLeft, right: room.claddingRight,
    };
    for (const face of ['front', 'back', 'left', 'right'] as const) {
        // Openings on the notch face keep their wall's name (utils/lshape), and
        // bay openings sit on the divider - counted against the front here.
        const open = (openingOn[face] || 0) + (face === 'front' ? (openingOn['bay'] || 0) : 0);
        let net = Math.max(0, faces[face] - open);
        // A gable's triangles can take their own cladding.
        if (isGable && room.claddingGable) {
            const tri = sideGable ? (face === 'left' || face === 'right' ? gableTri : 0)
                : face === 'back' ? gableTri : face === 'front' && !room.hasApexGlazing ? gableTri : 0;
            const triNet = Math.min(tri, net);
            if (triNet > 0) { add(CLAD_FAMILY(room.claddingGable), triNet); net -= triNet; wallNet += triNet; }
        }
        add(CLAD_FAMILY(cladByFace[face] || room.cladding), net);
        wallNet += net;
    }
    // The bay's dividing wall is clad on its outside face.
    if (bayArea > 0) {
        const divider = (room.bay.depthMm ? num(room.bay.depthMm) / 1000 : d) * frontH;
        add(CLAD_FAMILY(room.bay.wallCladding || room.cladding), divider);
        wallNet += divider;
    }
    add('wall_net_m2', wallNet);
    add('perimeter_lm', 2 * (w + d));
    if (room.hasPictureFrame) add('picture_frame', 1);

    // Roof: plan area with overhangs and canopy; a gable's slope is longer
    // than its plan.
    const canopy = room.hasCanopy ? w * num(room.canopySizeMm, 1500) / 1000 : 0;
    const planW = w + num(room.overhangLeftMm) / 1000 + num(room.overhangRightMm) / 1000;
    const planD = d + num(room.overhangBackMm) / 1000;
    let roof = Math.max(0, planW * planD - notch);
    if (isGable) {
        const halfSpan = (sideGable ? d : w) / 2;
        roof = roof * (Math.hypot(halfSpan, roofRise) / Math.max(0.1, halfSpan));
        add('gable_m2', footprint);
    }
    add('roof_m2', roof + canopy);
    add(ROOF_FAMILY(room.roofMaterial), roof + canopy);
    add('canopy_m2', canopy);
    if (room.hasGuttering) add('gutter_lm', isGable ? 2 * (sideGable ? w : d) : w);

    // Glazing in the roof and the apex.
    for (const sk of Array.isArray(room.skylights) ? room.skylights : []) {
        add(sk?.type === 'lantern' ? 'skylight_lantern' : 'skylight_flat', 1);
    }
    if (isGable && !sideGable && room.hasApexGlazing) add('apex_glazing', 1);

    // Internal walls (the sidebar's partitions) and their doors.
    let partitionLen = 0, internalDoors = 0;
    for (const p of Array.isArray(room.partitions) ? room.partitions : []) {
        partitionLen += (num(p.lengthMm) + num(p.legLengthMm)) / 1000;
        internalDoors += Array.isArray(p.doors) ? p.doors.length : 0;
    }
    internalDoors += Array.isArray(room.interiorDoors) ? room.interiorDoors.length : 0;
    add('partition_lm', partitionLen);
    add('internal_door', internalDoors);

    // Placed objects.
    let baseRun = 0, wallRun = 0, islandTop = 0;
    for (const o of objects) {
        if (!o || typeof o.type !== 'string') continue;
        const k = COUNTED[o.type];
        if (k) add(k, 1);
        if (o.type in KITCHEN_BASE_W) baseRun += num(o.widthMm) > 0 ? num(o.widthMm) / 1000 : KITCHEN_BASE_W[o.type];
        if (o.type in KITCHEN_WALL_W) wallRun += num(o.widthMm) > 0 ? num(o.widthMm) / 1000 : KITCHEN_WALL_W[o.type];
        if (o.type === 'kitchen_island') islandTop += num(o.widthMm) > 0 ? num(o.widthMm) / 1000 : 1.8;
        if (o.type === 'interior_wall') add('partition_lm', num(o.widthMm) > 0 ? num(o.widthMm) / 1000 : 0);
    }
    if (room.bay && num(room.bay.lights) > 0) add('ext_light', num(room.bay.lights));
    add('kitchen_base_lm', baseRun);
    add('kitchen_wall_lm', wallRun);
    add('worktop_lm', baseRun + islandTop);

    // Outside: the building's own deck, garden decks, paths, boundary.
    let deck = 0;
    const outline = validPts(room.deckOutline);
    if (room.hasDecking) {
        if (outline.length >= 3) {
            // The outline covers the building as well; the deck is what is
            // outside the footprint.
            deck += Math.max(0, polyArea(outline) - footprint);
        } else {
            const front = num(room.deckingSizeMm) / 1000;
            const sides = (num(room.deckingLeftMm) + num(room.deckingRightMm)) / 1000;
            deck += w * front + sides * (d + front);
        }
    }
    for (const dk of decks) deck += polyArea(validPts(dk?.points));
    add('decking_m2', deck);
    let pathArea = 0;
    for (const p of paths) pathArea += polyLength(validPts(p?.points)) * num(p?.widthMm, 900) / 1000;
    add('path_m2', pathArea);
    let fence = 0;
    for (const f of fences) {
        if (f?.kind === 'open' || f?.kind === 'hedge') continue;
        fence += Math.hypot(num(f?.bx) - num(f?.ax), num(f?.bz) - num(f?.az));
    }
    add('fence_lm', fence);

    // Round every measure the way it will be priced.
    for (const k of Object.keys(m) as MeasureKey[]) m[k] = roundQty(MEASURES[k].unit, m[k]!);

    // The one-line spec and the facts panel.
    const cladMain = CLAD_WORDS[CLAD_FAMILY(room.cladding)] || 'cladding';
    const roofWords = isGable ? `apex roof, ${ROOF_WORDS[ROOF_FAMILY(room.roofMaterial)]}` : `flat roof, ${ROOF_WORDS[ROOF_FAMILY(room.roofMaterial)]}`;
    const doorBits: string[] = [];
    if (singles) doorBits.push(`${singles} single door${singles > 1 ? 's' : ''}`);
    if (frenchPairs) doorBits.push(`${frenchPairs} French pair${frenchPairs > 1 ? 's' : ''}`);
    const bifoldSets = doors.filter(dr => doorKindOf(dr) === 'bifold');
    const slidingSets = doors.filter(dr => doorKindOf(dr) === 'sliding');
    if (bifoldSets.length) doorBits.push(bifoldSets.map(dr => `${Math.round(num(dr.leaves, 3))}-leaf bi-fold`).join(', '));
    if (slidingSets.length) doorBits.push(slidingSets.map(dr => `${Math.round(num(dr.leaves, 2))}-pane sliding`).join(', '));
    const spec = [
        `${w.toFixed(1)} × ${d.toFixed(1)} m${isL ? ' L-shape' : ''}`,
        `${round1(footprint)} m²`,
        roofWords,
        cladMain,
        doorBits.join(', '),
        windows.length ? `${windows.length} window${windows.length > 1 ? 's' : ''}` : '',
    ].filter(Boolean).join(' · ');

    const facts: { label: string; value: string }[] = [
        { label: 'Size', value: `${w.toFixed(2)} × ${d.toFixed(2)} m${isL ? ` (L, ${notchW.toFixed(1)} × ${notchD.toFixed(1)} m cut-out)` : ''}` },
        { label: 'Footprint', value: `${round1(footprint)} m² external · ${round1(internal)} m² inside` },
        { label: 'Roof', value: `${isGable ? 'Apex' : 'Flat'}, ${ROOF_WORDS[ROOF_FAMILY(room.roofMaterial)]} · ${round1(roof + canopy)} m²${canopy ? ` incl. ${round1(canopy)} m² canopy` : ''}` },
        { label: 'Walls', value: `${round1(wallNet)} m² clad after openings` },
        { label: 'External doors', value: doorBits.length ? doorBits.join(', ') : 'None' },
        { label: 'Windows', value: windows.length ? `${windows.length} · ${round1(windowArea)} m² of glazing` : 'None' },
    ];
    if (partitionLen || internalDoors) facts.push({ label: 'Internal', value: `${round1(partitionLen)} m of wall · ${internalDoors} door${internalDoors === 1 ? '' : 's'}` });
    const lights = (m.downlight || 0) + (m.pendant || 0);
    if (lights || m.ext_light) facts.push({ label: 'Lighting', value: `${lights} inside · ${m.ext_light || 0} outside` });
    if (bayArea) facts.push({ label: 'Outdoor section', value: `${round1(bayArea)} m²` });
    if (deck) facts.push({ label: 'Decking', value: `${round1(deck)} m²` });

    return {
        measures: m,
        widthM: round2(w),
        depthM: round2(d),
        externalM2: round1(footprint),
        internalM2: round1(internal),
        spec,
        facts,
    };
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/** The size the building is priced at. Width and depth are external,
 *  in metres; the area is by the book's basis. */
export interface BuildingSize { areaM2: number; widthM: number | null; depthM: number | null; modelId?: string | null }

/** The set design a size is, if any: the same footprint within 5 cm, either
 *  way round (a 3 x 4 drawn as 4 x 3 is the same building). */
export const matchModel = (models: DesignModel[], w: number | null, d: number | null): DesignModel | null => {
    if (!w || !d) return null;
    const near = (a: number, b: number) => Math.abs(a - b) <= 0.05;
    return models.find(m => near(m.widthM, w) && near(m.depthM, d))
        ?? models.find(m => near(m.widthM, d) && near(m.depthM, w))
        ?? null;
};

/** The model a quote is priced as: the one chosen, or the one its size is.
 *  modelId null means chosen as bespoke - no model, whatever the size. */
export const modelFor = (book: PriceBook, size: BuildingSize): DesignModel | null => {
    if (book.building.method !== 'models' || size.modelId === null) return null;
    return (size.modelId ? book.building.models.find(m => m.id === size.modelId) : null)
        ?? matchModel(book.building.models, size.widthM, size.depthM);
};

/**
 * Mark the lines a set design's price already covers. Only lines that came
 * from the design or go on every quote - anything added by hand afterwards is
 * an extra, and is charged.
 */
export function applyCovers(lines: QuoteLine[], book: PriceBook, model: DesignModel | null): QuoteLine[] {
    const always = new Set(book.items.filter(i => i.always).map(i => i.id));
    const covered = new Set(model?.covers ?? []);
    // A category the design's breakdown lists is described by the breakdown;
    // the counted lines there would say the same thing twice.
    const listed = new Set((model?.breakdown ?? []).filter(x => x.name.trim() || x.amount).map(x => x.category));
    const out: QuoteLine[] = [];
    for (const l of lines) {
        if (l.source === 'building' || l.source === 'manual') { out.push(l); continue; }
        if (l.source === 'book' && !(l.itemId && always.has(l.itemId))) { out.push(l); continue; }
        // A set design covers its standard spec, never an upgrade on it: a
        // canopy or a roof lantern is charged even where the roof and the
        // glazing are covered.
        const included = covered.has(l.category) && !(l.measure && UPGRADE_MEASURES.has(l.measure));
        if (included && listed.has(l.category) && !l.qtyEdited && !l.rateEdited) continue;
        out.push(!!l.included === included ? l : { ...l, included });
    }
    return out;
}

/**
 * The lines of a quote re-priced at a size or as a set design: the building
 * and everything counted from the design built afresh, and every line the
 * user added or changed by hand kept exactly as it is.
 */
export function repriceLines(quote: Pick<Quote, 'lines'>, book: PriceBook, t: Takeoff | null, size: BuildingSize): QuoteLine[] {
    const always = new Set(book.items.filter(i => i.always).map(i => i.id));
    const kept = quote.lines.filter(l =>
        l.source !== 'building' && (
            l.source === 'manual'
            || (l.source === 'book' && !(l.itemId && always.has(l.itemId)))
            || l.qtyEdited || l.rateEdited
        ));
    const keptItems = new Set(kept.map(l => l.itemId).filter(Boolean) as string[]);
    const fresh = bookLines(book, t).filter(l => !(l.itemId && keptItems.has(l.itemId)));
    return sortLines(applyCovers([...buildingLines(book, size), ...fresh, ...kept], book, modelFor(book, size)));
}

/** Index of the smallest size in a list that holds x, or -1. */
const fitIndex = (sizes: number[], x: number) => {
    let best = -1;
    sizes.forEach((v, i) => { if (v > 0 && v + 0.005 >= x && (best < 0 || v < sizes[best])) best = i; });
    return best;
};

/** The table's price for a size, and the size it was priced as. */
export const gridPrice = (grid: SizeGrid, w: number, d: number): { price: number; w: number; d: number } | null => {
    const wi = fitIndex(grid.widths, w);
    const di = fitIndex(grid.depths, d);
    if (wi < 0 || di < 0) return null;
    const price = grid.prices[wi]?.[di] || 0;
    return price > 0 ? { price, w: grid.widths[wi], d: grid.depths[di] } : null;
};

/** The building's own line(s) for a size, by the book's method. */
export function buildingLines(book: PriceBook, size: BuildingSize): QuoteLine[] {
    const b = book.building;
    const area = Math.max(0, round1(size.areaM2));
    const name = b.name || 'Garden room';
    const cost = b.costPerM2 ?? null;
    const line = (over: Partial<QuoteLine>): QuoteLine => ({
        id: uid(), category: 'building', name, qty: 1, unit: 'item', rate: 0, source: 'building', ...over,
    });
    switch (b.method) {
        case 'models': {
            const model = modelFor(book, size);
            if (model) {
                const parts = (model.breakdown || []).filter(x => x.name.trim() || x.amount);
                const split = modelSplit(model);
                return [
                    line({
                        name: model.name || name,
                        description: [`${model.widthM} × ${model.depthM} m`, model.includes].filter(Boolean).join(' · '),
                        rate: parts.length ? split.shell : model.price,
                        cost: model.cost ?? null,
                    }),
                    ...parts.map(x => line({ category: x.category === 'building' ? 'building' : x.category, name: x.name || categoryLabel(x.category), rate: x.amount })),
                ];
            }
            // Not one of the set designs: priced by area so it is never £0.
            const w = size.widthM || 0, d = size.depthM || 0;
            return [line({ description: w > 0 && d > 0 ? 'Bespoke size, not one of the standard designs - priced by area' : undefined, qty: area, unit: 'm2', rate: b.ratePerM2, cost })];
        }
        case 'per_m2': {
            const byArea = area * b.ratePerM2;
            if (b.minimum > 0 && byArea < b.minimum) {
                return [line({ description: `${area} m² · minimum charge`, rate: b.minimum, cost: cost !== null ? round2(cost * area) : null })];
            }
            return [line({ qty: area, unit: 'm2', rate: b.ratePerM2, cost })];
        }
        case 'base_plus_m2':
            return [
                line({ name: `${name} - base price`, rate: b.basePrice }),
                line({ name: `${name} - by size`, qty: area, unit: 'm2', rate: b.ratePerM2, cost }),
            ];
        case 'grid': {
            const w = size.widthM || 0, d = size.depthM || 0;
            const hit = w > 0 && d > 0 ? gridPrice(b.grid, w, d) : null;
            if (hit) {
                const exact = Math.abs(hit.w - w) < 0.01 && Math.abs(hit.d - d) < 0.01;
                return [line({
                    description: exact ? `${hit.w} × ${hit.d} m` : `${w.toFixed(2)} × ${d.toFixed(2)} m, priced as the ${hit.w} × ${hit.d} m size`,
                    rate: hit.price,
                    cost: cost !== null ? round2(cost * area) : null,
                })];
            }
            // Off the table (or no size yet): per m², so it is never £0 by accident.
            return [line({ description: w > 0 && d > 0 ? 'Outside the standard sizes, priced by area' : undefined, qty: area, unit: 'm2', rate: b.ratePerM2, cost })];
        }
        case 'bands': {
            const bands = [...(b.bands || [])].filter(x => x.upToM2 > 0).sort((a, c) => a.upToM2 - c.upToM2);
            const band = bands.find(x => area <= x.upToM2 + 1e-9);
            if (band) {
                return [line({ description: `Size band up to ${band.upToM2} m² (${area} m²)`, rate: band.price, cost: cost !== null ? round2(cost * area) : null })];
            }
            const top = bands[bands.length - 1];
            if (!top) return [line({ qty: area, unit: 'm2', rate: b.overBandRatePerM2, cost })];
            const extra = round1(area - top.upToM2);
            return [
                line({ description: `Size band up to ${top.upToM2} m²`, rate: top.price, cost: cost !== null ? round2(cost * top.upToM2) : null }),
                line({ name: `${name} - extra size over ${top.upToM2} m²`, qty: extra, unit: 'm2', rate: b.overBandRatePerM2, cost }),
            ];
        }
        case 'manual':
        default:
            return [line({ description: area ? `${area} m²` : undefined, rate: 0 })];
    }
}

/** What a book item looks like as a line on a quote. */
export const lineFromItem = (item: PriceItem, qty: number, source: QuoteLine['source']): QuoteLine => ({
    id: uid(),
    category: item.category,
    name: item.name,
    description: item.description || undefined,
    qty: roundQty(item.unit, qty),
    unit: item.unit,
    rate: item.rate,
    cost: item.cost ?? null,
    source,
    itemId: item.id,
    measure: item.measure ?? undefined,
});

/** The design-driven and every-quote lines for a take-off. */
function bookLines(book: PriceBook, t: Takeoff | null): QuoteLine[] {
    const out: QuoteLine[] = [];
    for (const item of book.items) {
        if (item.measure && t) {
            const q = t.measures[item.measure] || 0;
            if (q > 0) out.push(lineFromItem(item, q, 'design'));
        } else if (item.always) {
            out.push(lineFromItem(item, 1, 'book'));
        }
    }
    return out;
}

export const categoryOrder = (id: QuoteCategoryId) => {
    const i = QUOTE_CATEGORIES.findIndex(c => c.id === id);
    return i < 0 ? 99 : i;
};

export const sortLines = (lines: QuoteLine[]) =>
    [...lines].sort((a, b) => categoryOrder(a.category) - categoryOrder(b.category));

/** A new quote: from a design when there is one, otherwise blank. */
export function buildQuote(
    book: PriceBook,
    opts: { scene3d?: string | null; title?: string; number: string; version?: number },
): Quote {
    const t = opts.scene3d ? takeoff(opts.scene3d) : null;
    const area = t ? (book.building.basis === 'internal' ? t.internalM2 : t.externalM2) : 0;
    const size: BuildingSize = { areaM2: area, widthM: t?.widthM ?? null, depthM: t?.depthM ?? null };
    const model = modelFor(book, size);
    const now = Date.now();
    return {
        id: uid(),
        number: opts.number,
        version: opts.version ?? 1,
        status: 'draft',
        title: opts.title || (model ? model.name : t ? `Garden room, ${t.widthM.toFixed(1)} × ${t.depthM.toFixed(1)} m` : 'Garden room'),
        spec: t?.spec ?? '',
        areaM2: area,
        widthM: t?.widthM ?? null,
        depthM: t?.depthM ?? null,
        lines: sortLines(applyCovers([...buildingLines(book, size), ...bookLines(book, t)], book, model)),
        modelId: model?.id ?? null,
        discount: { kind: 'pct', value: 0, label: 'Discount' },
        vatRegistered: book.vatRegistered,
        vatRate: book.vatRate,
        pricesIncVat: book.pricesIncVat,
        stages: book.stages.map(s => ({ ...s })),
        intro: book.intro,
        terms: book.terms,
        leadTime: book.leadTime,
        includes: book.building.includes,
        detail: book.detail,
        validDays: book.validityDays,
        designHash: hashDesign(opts.scene3d),
        createdAt: now,
        updatedAt: now,
        sentAt: null,
        decidedAt: null,
    };
}

/**
 * Bring a quote's measured quantities up to date with a changed design.
 * Lines typed or edited by hand are kept exactly as they are; measured lines
 * follow the drawing, new things in the drawing are added and things taken
 * out of it are dropped. Returns what changed, for the toast.
 */
export function refreshFromDesign(quote: Quote, book: PriceBook, scene3d: string | null): { quote: Quote; changed: number } {
    const t = scene3d ? takeoff(scene3d) : null;
    if (!t) return { quote, changed: 0 };
    let changed = 0;
    const kept: QuoteLine[] = [];
    const seen = new Set<string>();
    for (const l of quote.lines) {
        if (l.source === 'design' && l.measure && !l.qtyEdited) {
            const q = roundQty(l.unit, t.measures[l.measure] || 0);
            seen.add(l.itemId || l.measure);
            if (q <= 0) { changed++; continue; }
            if (q !== l.qty) changed++;
            kept.push({ ...l, qty: q });
        } else {
            if (l.source === 'design') seen.add(l.itemId || l.measure || l.id);
            kept.push(l);
        }
    }
    for (const item of book.items) {
        if (!item.measure || seen.has(item.id) || seen.has(item.measure)) continue;
        const q = t.measures[item.measure] || 0;
        if (q > 0) { kept.push(lineFromItem(item, q, 'design')); changed++; }
    }
    // The building follows the new size unless its lines were edited.
    const area = book.building.basis === 'internal' ? t.internalM2 : t.externalM2;
    let lines = kept;
    const resized = area !== quote.areaM2 || t.widthM !== quote.widthM || t.depthM !== quote.depthM;
    // A new size can be a different set design; a chosen one that still fits stays.
    const chosen = quote.modelId ? book.building.models.find(m => m.id === quote.modelId) ?? null : null;
    const model = book.building.method !== 'models' ? null
        : resized ? (matchModel(book.building.models, t.widthM, t.depthM) ?? null) : chosen;
    if (resized && !kept.some(l => l.source === 'building' && (l.qtyEdited || l.rateEdited))) {
        lines = [...buildingLines(book, { areaM2: area, widthM: t.widthM, depthM: t.depthM, modelId: model?.id ?? null }), ...kept.filter(l => l.source !== 'building')];
        changed++;
    }
    lines = applyCovers(lines, book, model);
    return {
        quote: {
            ...quote,
            lines: sortLines(lines),
            areaM2: area,
            widthM: t.widthM,
            depthM: t.depthM,
            spec: t.spec,
            modelId: model?.id ?? (book.building.method === 'models' ? null : quote.modelId ?? null),
            designHash: hashDesign(scene3d),
            updatedAt: Date.now(),
        },
        changed,
    };
}

export interface QuoteTotals {
    /** Line prices include VAT (the VAT is taken out of the total). */
    gross: boolean;
    byCategory: { id: QuoteCategoryId; label: string; total: number; lines: QuoteLine[]; optional: QuoteLine[] }[];
    subtotal: number;
    discount: number;
    net: number;
    vat: number;
    total: number;
    optionalTotal: number;
    /** Only when every priced line carries a cost. */
    cost: number | null;
    margin: number | null;
    marginPct: number | null;
    /** Cost is known for some lines but not all. */
    costPartial: boolean;
    stages: (PaymentStage & { amount: number })[];
}

export function quoteTotals(q: Pick<Quote, 'lines' | 'discount' | 'vatRegistered' | 'vatRate' | 'stages'> & { pricesIncVat?: boolean }): QuoteTotals {
    const byCat = new Map<QuoteCategoryId, { lines: QuoteLine[]; optional: QuoteLine[]; total: number }>();
    let subtotal = 0, optionalTotal = 0, cost = 0, costed = 0, priced = 0;
    for (const l of q.lines) {
        const e = byCat.get(l.category) || { lines: [], optional: [], total: 0 };
        const t = lineTotal(l);
        if (l.optional) { e.optional.push(l); optionalTotal += t; }
        else {
            e.lines.push(l);
            e.total = round2(e.total + t);
            subtotal += t;
            if (t > 0) {
                priced++;
                if (typeof l.cost === 'number') { costed++; cost += (l.qty || 0) * l.cost; }
            }
        }
        byCat.set(l.category, e);
    }
    subtotal = round2(subtotal);
    const dv = Math.max(0, q.discount?.value || 0);
    const discount = round2(Math.min(subtotal, q.discount?.kind === 'amount' ? dv : subtotal * dv / 100));
    // Ex-VAT prices: VAT goes on top. Inc-VAT prices: the total is what the
    // lines add up to, and the VAT inside it is worked back out.
    const gross = !!q.pricesIncVat && q.vatRegistered;
    const afterDiscount = round2(subtotal - discount);
    const rate = q.vatRegistered ? (q.vatRate || 0) : 0;
    const vat = gross ? round2(afterDiscount * rate / (100 + rate)) : round2(afterDiscount * rate / 100);
    const net = gross ? round2(afterDiscount - vat) : afterDiscount;
    const total = gross ? afterDiscount : round2(net + vat);
    const allCosted = priced > 0 && costed === priced;
    const margin = allCosted ? round2(net - cost) : null;

    // Stages: rounded to the pound, the last one takes the remainder so they
    // always add up to the total exactly.
    const stages = (q.stages || []).map(s => ({ ...s, amount: 0 }));
    let allotted = 0;
    stages.forEach((s, i) => {
        s.amount = i === stages.length - 1 ? round2(total - allotted) : Math.round(total * (s.pct || 0) / 100);
        allotted += s.amount;
    });

    return {
        gross,
        byCategory: QUOTE_CATEGORIES
            .filter(c => byCat.has(c.id))
            .map(c => ({ id: c.id, label: c.label, ...byCat.get(c.id)! })),
        subtotal,
        discount,
        net,
        vat,
        total,
        optionalTotal: round2(optionalTotal),
        cost: allCosted ? round2(cost) : null,
        margin,
        marginPct: allCosted && net > 0 ? Math.round((margin! / net) * 1000) / 10 : null,
        costPartial: costed > 0 && !allCosted,
        stages,
    };
}

/** "Q-0012" style numbers, from the book's prefix and counter. */
export const formatQuoteNumber = (book: Pick<PriceBook, 'numberPrefix' | 'nextNumber'>) =>
    `${(book.numberPrefix || 'Q-').trim()}${String(Math.max(1, book.nextNumber || 1)).padStart(4, '0')}`;

/**
 * The price of a design by the book, without building a quote - for the
 * configurator's live price.
 */
export function priceDesign(book: PriceBook, scene: unknown): number | null {
    const t = takeoff(scene);
    if (!t) return null;
    const area = book.building.basis === 'internal' ? t.internalM2 : t.externalM2;
    const size: BuildingSize = { areaM2: area, widthM: t.widthM, depthM: t.depthM };
    const lines = applyCovers([...buildingLines(book, size), ...bookLines(book, t)], book, modelFor(book, size));
    const totals = quoteTotals({ lines, discount: { kind: 'pct', value: 0, label: '' }, vatRegistered: book.vatRegistered, vatRate: book.vatRate, pricesIncVat: book.pricesIncVat, stages: [] });
    return totals.total;
}

// ---------------------------------------------------------------------------
// Normalising stored data
// ---------------------------------------------------------------------------

const CATEGORY_IDS = new Set(QUOTE_CATEGORIES.map(c => c.id));
const UNIT_IDS = new Set(Object.keys(UNIT_LABELS));
const MEASURE_IDS = new Set(Object.keys(MEASURES));
const str = (v: unknown, n: number, d = '') => (typeof v === 'string' ? v.slice(0, n) : d);
const money = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? round2(v) : d);

/** The size table, from the browser's shape (prices: number[][]) or the
 *  stored one (rows: {cells}[] - Firestore cannot hold nested arrays). */
function normalizeGrid(g: any, fb: SizeGrid): SizeGrid {
    if (!g || !Array.isArray(g.widths) || !Array.isArray(g.depths)) return fb;
    const raw: unknown[][] | null = Array.isArray(g.prices) ? g.prices
        : Array.isArray(g.rows) ? g.rows.map((r: any) => (Array.isArray(r?.cells) ? r.cells : []))
        : null;
    if (!raw) return fb;
    const widths = g.widths.slice(0, 20).map((v: unknown) => money(v));
    const depths = g.depths.slice(0, 20).map((v: unknown) => money(v));
    const prices = widths.map((_: number, i: number) => depths.map((_d: number, j: number) => money(raw[i]?.[j])));
    return { widths, depths, prices };
}

export function normalizeItem(i: any): PriceItem | null {
    if (!i || typeof i !== 'object') return null;
    return {
        id: str(i.id, 40) || uid(),
        category: CATEGORY_IDS.has(i.category) ? i.category : 'extras',
        name: str(i.name, 140) || 'Item',
        description: str(i.description, 400) || undefined,
        unit: UNIT_IDS.has(i.unit) ? i.unit : 'each',
        rate: money(i.rate),
        cost: typeof i.cost === 'number' && Number.isFinite(i.cost) ? round2(i.cost) : null,
        measure: MEASURE_IDS.has(i.measure) ? i.measure : null,
        always: !!i.always && !MEASURE_IDS.has(i.measure),
    };
}

export function normalizeBook(raw: any, fallback: PriceBook): PriceBook {
    if (!raw || typeof raw !== 'object') return fallback;
    const b = raw.building && typeof raw.building === 'object' ? raw.building : {};
    const fb = fallback.building;
    return {
        v: 1,
        building: {
            method: ['models', 'per_m2', 'grid', 'bands', 'base_plus_m2', 'manual'].includes(b.method) ? b.method : fb.method,
            basis: b.basis === 'internal' ? 'internal' : 'external',
            name: str(b.name, 80) || fb.name,
            ratePerM2: money(b.ratePerM2, fb.ratePerM2),
            basePrice: money(b.basePrice, fb.basePrice),
            minimum: money(b.minimum, fb.minimum),
            bands: Array.isArray(b.bands)
                ? b.bands.filter((x: any) => x && Number.isFinite(x.upToM2) && Number.isFinite(x.price)).slice(0, 30).map((x: any) => ({ upToM2: round1(x.upToM2), price: round2(x.price) }))
                : fb.bands,
            overBandRatePerM2: money(b.overBandRatePerM2, fb.overBandRatePerM2),
            grid: normalizeGrid(b.grid, fb.grid),
            models: Array.isArray(b.models)
                ? b.models.filter((m: any) => m && typeof m === 'object').slice(0, 60).map((m: any) => ({
                    id: str(m.id, 40) || uid(),
                    name: str(m.name, 80) || 'Design',
                    widthM: money(m.widthM),
                    depthM: money(m.depthM),
                    price: money(m.price),
                    cost: typeof m.cost === 'number' && Number.isFinite(m.cost) ? round2(m.cost) : null,
                    includes: str(m.includes, 400),
                    covers: Array.isArray(m.covers) ? m.covers.filter((c: any) => CATEGORY_IDS.has(c)) : [],
                    imageUrl: typeof m.imageUrl === 'string' && m.imageUrl.startsWith('https://') ? m.imageUrl.slice(0, 1000) : null,
                    breakdown: Array.isArray(m.breakdown)
                        ? m.breakdown.filter((x: any) => x && typeof x === 'object').slice(0, 40).map((x: any) => ({
                            id: str(x.id, 40) || uid(),
                            category: CATEGORY_IDS.has(x.category) ? x.category : 'extras',
                            name: str(x.name, 120),
                            amount: money(x.amount),
                        }))
                        : [],
                }))
                : fb.models ?? [],
            costPerM2: typeof b.costPerM2 === 'number' && Number.isFinite(b.costPerM2) ? round2(b.costPerM2) : null,
            includes: str(b.includes, 1500, fb.includes),
        },
        items: Array.isArray(raw.items) ? raw.items.map(normalizeItem).filter(Boolean).slice(0, 400) as PriceItem[] : fallback.items,
        vatRegistered: typeof raw.vatRegistered === 'boolean' ? raw.vatRegistered : fallback.vatRegistered,
        vatRate: money(raw.vatRate, fallback.vatRate),
        pricesIncVat: typeof raw.pricesIncVat === 'boolean' ? raw.pricesIncVat : fallback.pricesIncVat,
        validityDays: Math.max(1, Math.round(money(raw.validityDays, fallback.validityDays))),
        stages: Array.isArray(raw.stages)
            ? raw.stages.slice(0, 8).map((s: any) => ({ id: str(s?.id, 40) || uid(), label: str(s?.label, 120) || 'Payment', pct: money(s?.pct) }))
            : fallback.stages,
        numberPrefix: str(raw.numberPrefix, 12, fallback.numberPrefix),
        nextNumber: Math.max(1, Math.round(money(raw.nextNumber, fallback.nextNumber))),
        intro: str(raw.intro, 2000, fallback.intro),
        terms: str(raw.terms, 6000, fallback.terms),
        leadTime: str(raw.leadTime, 200, fallback.leadTime),
        detail: ['itemised', 'categories', 'total'].includes(raw.detail) ? raw.detail : fallback.detail,
        updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
    };
}

export function normalizeQuote(raw: any): Quote | null {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.lines)) return null;
    const lines: QuoteLine[] = raw.lines.filter((l: any) => l && typeof l === 'object').slice(0, 300).map((l: any) => ({
        id: str(l.id, 40) || uid(),
        category: CATEGORY_IDS.has(l.category) ? l.category : 'extras',
        name: str(l.name, 140) || 'Item',
        description: str(l.description, 400) || undefined,
        qty: money(l.qty),
        unit: UNIT_IDS.has(l.unit) ? l.unit : 'each',
        rate: money(l.rate),
        cost: typeof l.cost === 'number' && Number.isFinite(l.cost) ? round2(l.cost) : null,
        source: ['design', 'building', 'book', 'manual'].includes(l.source) ? l.source : 'manual',
        itemId: str(l.itemId, 40) || undefined,
        measure: MEASURE_IDS.has(l.measure) ? l.measure : undefined,
        optional: !!l.optional,
        qtyEdited: !!l.qtyEdited,
        rateEdited: !!l.rateEdited,
        included: !!l.included,
    }));
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return {
        id: str(raw.id, 40) || uid(),
        number: str(raw.number, 40) || 'Q-0001',
        version: Math.max(1, Math.round(money(raw.version, 1))),
        status: ['draft', 'sent', 'accepted', 'declined'].includes(raw.status) ? raw.status : 'draft',
        title: str(raw.title, 140) || 'Garden room',
        spec: str(raw.spec, 400),
        areaM2: money(raw.areaM2),
        widthM: n(raw.widthM),
        depthM: n(raw.depthM),
        lines,
        discount: {
            kind: raw.discount?.kind === 'amount' ? 'amount' : 'pct',
            value: money(raw.discount?.value),
            label: str(raw.discount?.label, 80) || 'Discount',
        },
        vatRegistered: raw.vatRegistered !== false,
        vatRate: money(raw.vatRate, 20),
        pricesIncVat: raw.pricesIncVat === true,
        stages: Array.isArray(raw.stages) ? raw.stages.slice(0, 8).map((s: any) => ({ id: str(s?.id, 40) || uid(), label: str(s?.label, 120) || 'Payment', pct: money(s?.pct) })) : [],
        intro: str(raw.intro, 2000),
        terms: str(raw.terms, 6000),
        leadTime: str(raw.leadTime, 200),
        includes: str(raw.includes, 1500),
        detail: ['itemised', 'categories', 'total'].includes(raw.detail) ? raw.detail : 'itemised',
        validDays: Math.max(1, Math.round(money(raw.validDays, 30))),
        designHash: typeof raw.designHash === 'string' ? raw.designHash : null,
        imageId: typeof raw.imageId === 'string' ? raw.imageId.slice(0, 60) : null,
        modelId: typeof raw.modelId === 'string' ? raw.modelId.slice(0, 40) : null,
        createdAt: n(raw.createdAt) ?? Date.now(),
        updatedAt: n(raw.updatedAt) ?? Date.now(),
        sentAt: n(raw.sentAt),
        decidedAt: n(raw.decidedAt),
    };
}
