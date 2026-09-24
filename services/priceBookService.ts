import { auth } from './firebase';
import { PriceBook, PriceItem, normalizeBook, uid } from './quoteEngine';

/**
 * The company's price book: loaded from and saved to the account through the
 * server (/api/price-book, see server.js for why not Firestore directly), and
 * mirrored into localStorage under 'modulr_price_book' - the 3D configurator
 * runs in a same-origin iframe with no Firebase client and reads its live
 * price from that mirror, the way it reads branding from 'modulr_branding'.
 */

export const PRICE_BOOK_CACHE_KEY = 'modulr_price_book';

const item = (
    category: PriceItem['category'], name: string, unit: PriceItem['unit'], rate: number,
    extra: Partial<PriceItem> = {},
): PriceItem => ({ id: uid(), category, name, unit, rate, cost: null, measure: null, always: false, ...extra });

/** Width x depth table for the starter book: a setup cost plus a falling
 *  rate by area, to the nearest £50 - the shape published tables take. */
const STARTER_WIDTHS = [3, 3.5, 4, 5, 6, 7, 8];
const STARTER_DEPTHS = [2.5, 3, 3.5, 4];
const starterGrid = () => ({
    widths: [...STARTER_WIDTHS],
    depths: [...STARTER_DEPTHS],
    prices: STARTER_WIDTHS.map(w => STARTER_DEPTHS.map(d => Math.round((3500 + 950 * w * d) / 50) * 50)),
});

/**
 * A starting price book: typical UK garden-room rates for 2026, ex VAT, for
 * a company to overwrite with its own. Figures from published price lists
 * and cost guides (Garden Room Planner's demo book, Eden, Booths, The Green
 * Rooms, 2026 cost guides) - a sensible middle, not anyone's actual prices. The building is priced per m² for the
 * standard shell; everything that varies from one design to the next is its
 * own line, most of them counted straight off the 3D design.
 *
 * Cladding and roof coverings are UPGRADES over the standard finish the
 * building price includes, so the standard ones (composite cladding, EPDM)
 * are at 0 and print as "Included".
 */
/** What a set design's price usually covers: the building as shown, its
 *  doors and windows, the standard electrics, the base, delivery and fitting.
 *  Decking, internal walls, bathrooms and kitchens stay extras. */
const STANDARD_COVERS: PriceItem['category'][] = ['groundworks', 'cladding', 'roof', 'external_doors', 'windows', 'electrics', 'installation'];

/**
 * Most providers sell a range of set designs at set prices (Charlie, 24 Sep
 * 2026), so the starter book is priced that way. Placeholder names and
 * prices, for a company to replace with its own range.
 */
const part = (category: PriceItem['category'], name: string, amount: number) => ({ id: uid(), category, name, amount });
/** Each starter design broken down the way a customer reads a quote. The
 *  structure is what the parts leave, so it is not a part itself. */
const starterModels = () => [
    {
        id: uid(), name: 'The Studio', widthM: 3, depthM: 2.5, price: 14995, cost: null, includes: 'Single door and one window', covers: [...STANDARD_COVERS],
        breakdown: [part('groundworks', 'Ground screw foundation', 340), part('external_doors', 'Single glazed door, aluminium', 1150), part('windows', 'Window, aluminium, double glazed', 575), part('electrics', 'Electrics, lighting and certification', 1650), part('installation', 'Delivery and installation', 1535)],
    },
    {
        id: uid(), name: 'The Office', widthM: 4, depthM: 3, price: 19995, cost: null, includes: 'French doors and two windows', covers: [...STANDARD_COVERS],
        breakdown: [part('groundworks', 'Ground screw foundation', 540), part('external_doors', 'French doors, aluminium', 2100), part('windows', 'Two windows, aluminium, double glazed', 1150), part('electrics', 'Electrics, lighting and certification', 1650), part('installation', 'Delivery and installation', 2555)],
    },
    {
        id: uid(), name: 'The Retreat', widthM: 5, depthM: 3.5, price: 26995, cost: null, includes: '3-leaf bi-fold, side door and two windows', covers: [...STANDARD_COVERS],
        breakdown: [part('groundworks', 'Ground screw foundation', 790), part('external_doors', '3-leaf bi-fold and side door, aluminium', 3700), part('windows', 'Two windows, aluminium, double glazed', 1150), part('electrics', 'Electrics, lighting and certification', 1650), part('installation', 'Delivery and installation', 4055)],
    },
    {
        id: uid(), name: 'The Pavilion', widthM: 6, depthM: 4, price: 34995, cost: null, includes: '4-leaf bi-fold, side door and three windows', covers: [...STANDARD_COVERS],
        breakdown: [part('groundworks', 'Ground screw foundation', 1080), part('external_doors', '4-leaf bi-fold and side door, aluminium', 4550), part('windows', 'Three windows, aluminium, double glazed', 1725), part('electrics', 'Electrics, lighting and certification', 1650), part('installation', 'Delivery and installation', 5940)],
    },
];

export const starterPriceBook = (): PriceBook => ({
    v: 1,
    building: {
        method: 'models',
        models: starterModels(),
        basis: 'external',
        name: 'Garden room',
        ratePerM2: 1150,
        basePrice: 6500,
        minimum: 9500,
        bands: [
            { upToM2: 9, price: 11950 },
            { upToM2: 12, price: 14450 },
            { upToM2: 15, price: 16950 },
            { upToM2: 20, price: 20950 },
            { upToM2: 25, price: 24950 },
            { upToM2: 30, price: 28950 },
        ],
        overBandRatePerM2: 850,
        grid: starterGrid(),
        costPerM2: null,
        includes:
            'Insulated timber-frame structure on your chosen base, insulated to walls, floor and roof with a vapour control layer and breathable membrane. ' +
            'Composite cladding, EPDM rubber roof with aluminium trims, plasterboard and skim or lined interior finished in white, skirting and architrave, and a builder\'s clean on handover.',
    },
    items: [
        // Groundworks & base
        item('groundworks', 'Ground screw foundation', 'm2', 45, { measure: 'footprint_m2', description: 'Galvanised ground screws and a level timber base frame' }),
        item('groundworks', 'Concrete slab base', 'm2', 100, { description: 'In place of ground screws where the ground needs it' }),
        item('groundworks', 'Site clearance and levelling', 'item', 450),

        // Cladding & exterior - upgrades over the standard composite
        item('cladding', 'Composite cladding', 'm2', 0, { measure: 'clad_composite_m2' }),
        item('cladding', 'Timber cladding (cedar / larch)', 'm2', 35, { measure: 'clad_timber_m2', description: 'Upgrade over standard composite' }),
        item('cladding', 'Metal cladding', 'm2', 45, { measure: 'clad_metal_m2', description: 'Box-profile or corrugated sheet, upgrade over standard composite' }),
        item('cladding', 'Painted board cladding', 'm2', 30, { measure: 'clad_painted_m2', description: 'Upgrade over standard composite' }),
        item('cladding', 'Render finish', 'm2', 55, { measure: 'clad_render_m2', description: 'Through-coloured render on board, upgrade over standard composite' }),
        item('cladding', 'Fibre cement cladding', 'm2', 40, { measure: 'clad_fibre_cement_m2', description: 'Upgrade over standard composite' }),
        item('cladding', 'Guttering and downpipe', 'lm', 45, { measure: 'gutter_lm' }),
        item('cladding', 'Picture frame surround', 'each', 1450, { measure: 'picture_frame' }),

        // Roof
        item('roof', 'EPDM rubber roof', 'm2', 0, { measure: 'roof_epdm_m2' }),
        item('roof', 'Sedum green roof', 'm2', 95, { measure: 'roof_green_m2', description: 'Upgrade over EPDM, sedum blanket on drainage layer' }),
        item('roof', 'Metal roof', 'm2', 55, { measure: 'roof_metal_m2', description: 'Upgrade over EPDM' }),
        item('roof', 'Clay tile roof', 'm2', 75, { measure: 'roof_tiles_m2', description: 'Upgrade over EPDM' }),
        item('roof', 'Slate roof', 'm2', 90, { measure: 'roof_slate_m2', description: 'Upgrade over EPDM' }),
        item('roof', 'Apex (pitched) roof structure', 'm2', 140, { measure: 'gable_m2', description: 'Vaulted pitched roof in place of a flat roof' }),
        item('roof', 'Front canopy', 'm2', 380, { measure: 'canopy_m2' }),
        item('roof', 'L-shape construction', 'each', 1500, { measure: 'lshape' }),

        // External doors
        item('external_doors', 'Single glazed door', 'each', 1150, { measure: 'door_single', description: 'Aluminium, double glazed, multi-point lock' }),
        item('external_doors', 'French doors (pair)', 'each', 2100, { measure: 'door_french', description: 'Aluminium, double glazed, multi-point lock' }),
        item('external_doors', 'Bi-fold doors', 'leaf', 850, { measure: 'door_bifold_leaf', description: 'Aluminium bi-fold, priced per leaf' }),
        item('external_doors', 'Sliding doors', 'leaf', 1350, { measure: 'door_sliding_leaf', description: 'Aluminium sliding, priced per pane' }),
        item('external_doors', 'Crittall-style glazing bars', 'each', 280, { measure: 'door_crittall', description: 'Per door set' }),

        // Windows & glazing
        item('windows', 'Windows', 'm2', 575, { measure: 'window_m2', description: 'Aluminium, double glazed, fixed or opening' }),
        item('windows', 'Crittall-style glazing bars', 'each', 180, { measure: 'window_crittall', description: 'Per window' }),
        item('windows', 'Flat rooflight', 'each', 1150, { measure: 'skylight_flat' }),
        item('windows', 'Roof lantern', 'each', 2250, { measure: 'skylight_lantern' }),
        item('windows', 'Glazed apex', 'each', 1850, { measure: 'apex_glazing' }),

        // Internal walls & doors
        item('internal', 'Internal stud wall', 'lm', 240, { measure: 'partition_lm', description: 'Insulated, boarded and finished both sides' }),
        item('internal', 'Internal door', 'each', 450, { measure: 'internal_door', description: 'Supplied and hung, with handles' }),

        // Interior finishes
        item('finishes', 'Flooring', 'm2', 48, { measure: 'floor_finish_m2', description: 'Laminate or LVT on underlay' }),

        // Electrics & lighting
        item('electrics', 'Electrical installation', 'item', 1650, { always: true, description: 'Consumer unit, double sockets, switches, testing and certification' }),
        item('electrics', 'Armoured supply cable', 'lm', 65, { description: 'From the house, including trenching and reinstatement - per metre' }),
        item('electrics', 'Additional double socket', 'each', 110),
        item('electrics', 'External socket', 'each', 160),
        item('electrics', 'Downlights', 'each', 55, { measure: 'downlight' }),
        item('electrics', 'Pendant lights', 'each', 75, { measure: 'pendant' }),
        item('electrics', 'External lights', 'each', 95, { measure: 'ext_light' }),
        item('electrics', 'Data / ethernet point', 'each', 95),

        // Heating & cooling
        item('heating', 'Electric panel heater', 'each', 380, { measure: 'heater' }),
        item('heating', 'Air conditioning (heat and cool)', 'each', 2250, { measure: 'aircon' }),
        item('heating', 'Heated towel rail', 'each', 320, { measure: 'towel_rail' }),
        item('heating', 'Water heater', 'each', 650, { measure: 'water_heater' }),

        // Bathroom & plumbing
        item('bathroom', 'WC', 'each', 650, { measure: 'wc', description: 'Supplied and fitted' }),
        item('bathroom', 'Basin / vanity unit', 'each', 600, { measure: 'basin', description: 'Supplied and fitted, with tap' }),
        item('bathroom', 'Shower', 'each', 1550, { measure: 'shower', description: 'Tray, enclosure, electric shower and wall panels' }),
        item('bathroom', 'Extractor fan', 'each', 180, { measure: 'extractor_fan' }),
        item('bathroom', 'Water and waste connection', 'item', 1250, { description: 'Supply and waste run to the house connection' }),
        item('bathroom', 'Macerator / pumped waste', 'each', 450, { description: 'Where the waste cannot fall to a drain' }),

        // Kitchen
        item('kitchen', 'Kitchen base units', 'lm', 650, { measure: 'kitchen_base_lm' }),
        item('kitchen', 'Kitchen wall units', 'lm', 420, { measure: 'kitchen_wall_lm' }),
        item('kitchen', 'Tall units', 'each', 900, { measure: 'kitchen_tall', description: 'Fridge, oven or larder housing' }),
        item('kitchen', 'Worktop', 'lm', 220, { measure: 'worktop_lm' }),
        item('kitchen', 'Sink and tap', 'each', 350, { measure: 'kitchen_sink' }),
        item('kitchen', 'Hob', 'each', 450, { measure: 'kitchen_hob' }),
        item('kitchen', 'Cooker hood', 'each', 350, { measure: 'kitchen_extractor' }),
        item('kitchen', 'Kitchen island', 'each', 1800, { measure: 'kitchen_island' }),

        // Outdoor & landscaping
        item('outdoor', 'Composite decking', 'm2', 165, { measure: 'decking_m2' }),
        item('outdoor', 'Covered outdoor section', 'm2', 350, { measure: 'bay_m2', description: 'Decked floor, lined soffit, corner post and dividing wall' }),
        item('outdoor', 'Garden paths', 'm2', 85, { measure: 'path_m2' }),
        item('outdoor', 'Fencing', 'lm', 75, { measure: 'fence_lm' }),
        item('outdoor', 'Hot tub base and power', 'each', 750, { measure: 'hot_tub' }),
        item('outdoor', 'Garden steps', 'each', 350, { measure: 'garden_steps' }),

        // Delivery & installation
        item('installation', 'Delivery', 'item', 350, { always: true }),
        item('installation', 'Waste removal and skip', 'item', 395, { always: true }),
        item('installation', 'Restricted access surcharge', 'item', 650, { description: 'Where materials must be carried through the house or a long way' }),

        // Planning & fees
        item('fees', 'Planning drawings and application', 'item', 950, { description: 'Drawings and submission; the council fee is charged at cost' }),
        item('fees', 'Lawful development certificate', 'item', 450, { description: 'Confirmation from the council that no planning permission is needed' }),
        item('fees', 'Building regulations approval', 'item', 650, { description: 'Application and inspections - needed over 15 m² or where anyone will sleep' }),
        item('fees', 'Structural calculations', 'item', 450),
    ],
    vatRegistered: true,
    vatRate: 20,
    pricesIncVat: false,
    validityDays: 30,
    stages: [
        { id: uid(), label: 'Deposit to confirm your order', pct: 30 },
        { id: uid(), label: 'On delivery of materials to site', pct: 60 },
        { id: uid(), label: 'On completion and handover', pct: 10 },
    ],
    numberPrefix: 'Q-',
    nextNumber: 1,
    intro: 'Thank you for the opportunity to quote for your new garden room. This quotation is based on the design we have prepared together; everything included is listed below.',
    terms:
        'This quotation is valid for the period shown. Prices assume clear, level access to the site and ground conditions suitable for the foundation specified; anything found on site that could not reasonably be foreseen will be discussed and agreed before work continues. ' +
        'Changes to the design after ordering are quoted separately. Planning permission and building regulations approval are the customer\'s responsibility unless included above. ' +
        'Ownership of materials passes on payment in full.',
    leadTime: 'Installation typically 6-8 weeks from order',
    detail: 'itemised',
});

/** The mirror is { uid, book }: the uid so a second person signing in on
 *  this browser never starts from the first one's rates. */
const readCache = (): PriceBook | null => {
    try {
        const raw = localStorage.getItem(PRICE_BOOK_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.book || parsed.uid !== auth.currentUser?.uid) return null;
        return normalizeBook(parsed.book, starterPriceBook());
    } catch { return null; }
};

const writeCache = (book: PriceBook | null) => {
    try {
        const uid = auth.currentUser?.uid;
        if (book && uid) localStorage.setItem(PRICE_BOOK_CACHE_KEY, JSON.stringify({ uid, book }));
        else localStorage.removeItem(PRICE_BOOK_CACHE_KEY);
    } catch { /* quota or private mode: the configurator falls back to its own rates */ }
};

const authHeader = async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('You must be signed in to use quoting.');
    return { Authorization: `Bearer ${token}` };
};

/** The account's book, or null when it has never been set up. */
export const loadPriceBook = async (): Promise<PriceBook | null> => {
    const res = await fetch('/api/price-book', { headers: await authHeader() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Your price book could not be loaded.');
    const book = data.priceBook ? normalizeBook(data.priceBook, starterPriceBook()) : null;
    writeCache(book);
    return book;
};

export const savePriceBook = async (book: PriceBook): Promise<void> => {
    writeCache(book);
    // Firestore cannot store an array of arrays, so the size table's rows go
    // up as objects; normalizeBook reads either shape back.
    const { prices, ...grid } = book.building.grid;
    const stored = { ...book, building: { ...book.building, grid: { ...grid, rows: prices.map(cells => ({ cells })) } } };
    const res = await fetch('/api/price-book', {
        method: 'PUT',
        headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        // JSON drops undefined fields, which Firestore would refuse.
        body: JSON.stringify({ priceBook: stored }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Your price book could not be saved.');
};

/** Shrink a picture to at most 1800px on its long side, as a JPEG - a phone
 *  photo is 5-10 MB, and a quote header never needs more than this. */
const shrinkImage = async (file: File): Promise<Blob> => {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) =>
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('That image could not be read.'))), 'image/jpeg', 0.86));
};

/** A picture of one of the set designs; returns its URL. */
export const uploadPriceBookImage = async (file: File): Promise<string> => {
    if (!file.type.startsWith('image/')) throw new Error('Choose a PNG, JPEG or WebP image.');
    const blob = await shrinkImage(file);
    const res = await fetch('/api/price-book/images', {
        method: 'POST',
        headers: { ...(await authHeader()), 'Content-Type': 'image/jpeg' },
        body: blob,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error(data.error || 'The image could not be saved.');
    return data.url as string;
};

export const cachedPriceBook = readCache;

/** Signed out: the next person on this browser must not quote from it. */
export const clearPriceBookCache = () => writeCache(null);
