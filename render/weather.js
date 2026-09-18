/**
 * Weather Lab on the contract engine (18 Sep 2026).
 *
 * The old route asked Sunburst to "re-light and compose" the render and
 * checked nothing. This one hands the FINISH model the exact line drawing of
 * the render (from the engine when the render came from it, drawn here
 * otherwise), a contract that says weather is the ONLY thing that changes,
 * a description of what the chosen weather actually looks like - falling
 * AND settled, light AND shadow - and then verifies the result against the
 * source render item by item, with one retry. Weather may change the sky,
 * the light, the precipitation and what lies on surfaces; it may never
 * change what the surfaces are or where anything is.
 */

const clean = (v, n = 200) => (typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, n) : '');

/**
 * What each condition means, in physical terms. The model is told the
 * mechanism (where snow lies, where rain wets, where fog sits) so it renders
 * weather instead of a filter. Keys are the WEATHER_CONDITIONS labels the
 * client sends, lower-cased; free text falls through to the notes.
 */
const CONDITIONS = {
    'snowy winter': {
        sky: 'a flat pale grey-white winter sky, low cool light, soft shadows, cold colour temperature',
        effect: 'SNOW: fine flakes falling through the whole frame, and a settled layer lying ON every upward-facing surface - the roof, the deck boards, the tops of fence rails and posts, window sills, the lawn - thin and even (a few centimetres), with the true material showing at edges and where it meets a vertical face. Vertical surfaces (cladding, glass, doors) are NOT snow-covered. Snow lies on things; it never hides a step, a door threshold, a path edge or the deck edge, and it never changes what is under it. No footprints, no drifts, no snowman, no sledges, no icicles that were not there.',
    },
    'rainy / moody': {
        sky: 'a heavy overcast sky, dim diffuse light, muted colour, low contrast',
        effect: 'RAIN: fine rain falling, every horizontal surface wet and darkened - deck boards darker with a soft sheen, paving with shallow reflections, the lawn a deeper wet green - glass beaded, cladding darker where it is wet. No puddles that hide a surface, no umbrellas, no people.',
    },
    'foggy morning': {
        sky: 'pale, near-white, the sun a soft glow low behind the mist',
        effect: 'FOG: a cool morning mist that thickens with distance - the building crisp and fully visible, the boundary softer, the trees beyond fading toward white. Dew on the lawn and the deck. Nothing in the fog is removed or added; it is only softened by distance.',
    },
    'golden hour (sunset)': {
        sky: 'a warm low sun from the side, long soft shadows, an apricot-to-blue sky',
        effect: 'GOLDEN HOUR: warm raking light across the cladding showing its texture, long shadows from the building and fence across the lawn, warm reflections in the glass. Exterior and interior lights ON and glowing warmly.',
    },
    'night time': {
        sky: 'a deep blue night sky, a few stars, the horizon faintly lit',
        effect: 'NIGHT: every exterior wall light and interior light ON - warm pools on the cladding and ground exactly where the fittings are, the interior glowing through the glass. The building fully readable, not lost in black. No extra lights, lanterns or festoons that are not on the building.',
    },
    'overcast soft light': {
        sky: 'a bright even overcast sky',
        effect: 'OVERCAST: soft shadowless daylight, true material colours, no highlights blown. Fittings OFF.',
    },
    'sunny clear sky': {
        sky: 'a clear blue sky with a few small high clouds, bright sun',
        effect: 'SUN: crisp shadows from the building, fence and fittings, bright grass, sharp reflections in the glass. Fittings OFF.',
    },
    'auto': { sky: 'the natural daylight the source already shows, refined', effect: 'No change to the weather: the lighting and sky of the source, rendered cleanly.' },
};

const SEASONS = {
    winter: 'Winter: trees and shrubs beyond the boundary bare, the lawn duller, low sun.',
    autumn: 'Autumn: trees beyond the boundary turning gold and brown, a few leaves on the lawn, softer light.',
    spring: 'Spring: fresh green on the trees, the lawn bright, clear light.',
    summer: 'Summer: full green trees, bright lawn, high sun.',
};

const TIMES = {
    morning: 'early morning light, low from the side',
    midday: 'midday light, high sun',
    afternoon: 'late afternoon light, warm and low',
    dusk: 'dusk, lights on',
    night: 'night, lights on',
    overcast: 'overcast, soft light',
};

/** The items the verifier checks when the render came in without an inventory. */
export const GENERIC_WEATHER_ITEMS = [
    { id: 'building', group: 'building', label: 'The building', text: 'THE BUILDING exactly as the source shows it: footprint, height, roof form, fascia, cladding colour family and board direction, every wall where it is.' },
    { id: 'openings', group: 'openings', label: 'Doors and windows', text: 'EVERY DOOR AND WINDOW exactly as the source shows: same count, same walls, same positions, same leaf and pane divisions, glazed stays glazed, solid stays solid, frames the same colour. None added, none removed, none moved.' },
    { id: 'garden', group: 'garden', label: 'Deck, paths, boundary', text: 'THE DECK, ANY PATH OR PAVING, STEPS AND THE BOUNDARY exactly as the source shows: same extent, same edges, same materials beneath any weather lying on them.' },
    { id: 'fittings', group: 'lights', label: 'Light fittings and furniture', text: 'EVERY LIGHT FITTING, and any furniture visible outside or through the glass, exactly where and what the source shows.' },
];

/** The weather prompt. `condition`, `season`, `timeOfDay` are the client's strings; `notes` the designer's own words. */
export function buildWeatherPrompt({ condition, season, timeOfDay, notes, hasLine }) {
    const key = clean(condition, 60).toLowerCase();
    const c = CONDITIONS[key] || { sky: 'the sky and light for this weather', effect: `WEATHER, as described by the designer: ${clean(condition, 100)}.` };
    const s = SEASONS[clean(season, 20).toLowerCase()];
    const t = TIMES[clean(timeOfDay, 20).toLowerCase()];
    const inputs = hasLine
        ? 'Image 1 is an exact LINE DRAWING of the scene in image 2: every edge in it is real geometry and it is the ONLY geometry there is. Image 2 is a finished photorealistic render. Keep image 2\'s camera, framing and crop exactly.'
        : 'Image 1 is a finished photorealistic render. Its geometry is final. Keep its camera, framing and crop exactly.';
    return [
        'HARD RULES - these override everything below.',
        inputs,
        'You are a WEATHER pass on a finished render. You change the sky, the light, the precipitation and what the weather leaves lying on surfaces - and NOTHING else. Every wall, opening, roof line, deck edge, step, path, fence, light fitting and piece of furniture stays exactly where it is, exactly what it is, exactly its colour beneath the weather. The materials do not change; only how the weather lights or coats them.',
        '',
        'THE WEATHER:',
        `Sky and light: ${c.sky}.`,
        c.effect,
        s || '',
        t ? `Time of day: ${t}.` : '',
        notes ? `The designer's own words, within the rules above: ${clean(notes, 300)}.` : '',
        '',
        'FORBIDDEN: any door, window, opening, wall, roof change, deck change, path, step, fence, structure, plant, pot, furniture, vehicle, person or animal not in the source; moving, resizing, restyling or recolouring anything; snow, water or leaves hiding a step, threshold, edge or fitting; a change of camera, zoom, crop or framing; a change of season in the planting unless a season is set above; weathering, dirt, staining or damage to the building - it is newly built and clean under the weather.',
        '',
        'LOOK: photorealistic, sharp from front to back, no depth of field, natural exposure, no vignette, no lens effects; precipitation rendered as real falling and settled matter with correct scale; wet surfaces with real reflections; snow with real depth and soft edges.',
        'OUTPUT: 2K, the same aspect ratio as the source.',
    ].filter(l => l !== '').join('\n');
}
