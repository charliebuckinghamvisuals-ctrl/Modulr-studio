/**
 * The prompts. Every one is short, and every one puts the geometry rules
 * first, because the image models read the top of a prompt and skim the
 * rest - the 17 Sep tests showed the same rule obeyed at the top and ignored
 * two thousand words down.
 *
 * The render prompt is a CONTRACT in four parts, in this order:
 *   HARD RULES  - what the inputs are and that geometry is final
 *   INVENTORY   - the numbered item list (render/inventory.js)
 *   FORBIDDEN   - the things the models kept adding
 *   LOOK        - light, sky, the setting the user asked for, materials
 * Nothing in it says "replace", "discard", "placeholder" or "dress" -
 * that wording, written for one model, was a licence for the next to
 * repaint the ground under the deck.
 *
 * 21 Sep 2026: TIME and WEATHER are two separate choices (Charlie), and
 * the LOOK is an editorial photography brief - lighting and colour words
 * only, never framing or form, because the last "brochure" line that
 * mentioned composition regrew the eaves (18 Sep). The flat-shaded
 * reference is named as a colour reference for the BUILDING only: its grey
 * sky and flat ground were being copied as the mood.
 */

/** Settings the user can pick; free text is appended after the chosen one. */
export const SCENE_PRESETS = {
    'uk-residential': 'A rear garden in a UK residential street: neat lawn, timber fence panels or a brick wall at the boundary, mature shrubs and a tree or two beyond it, the backs of neighbouring houses just visible over the fence.',
    'uk-country': 'A UK country garden: generous lawn, mixed cottage borders with lavender, grasses and hydrangea, a mature hedge or old brick wall at the boundary, fields or woodland softly beyond.',
    'urban-courtyard': 'A small urban courtyard garden: paving and gravel with clipped evergreens and a few large planters, high walls or slatted screens at the boundary, city rooftops beyond.',
    'coastal': 'A coastal garden: wind-shaped grasses and sea-thrift, gravel and weathered timber, a low stone wall at the boundary, open sky and a hint of sea beyond.',
    'woodland': 'A woodland-edge garden: dappled light through mature trees, ferns and shade planting, a soft bark or gravel margin, deep green beyond.',
    'none': '',
};

/**
 * TIME: where the sun is and what it does. Two wordings each - with a sun
 * (clear weather) and without (overcast, rain) - so a rainy morning does
 * not get "long shadows" it cannot have. Evening is the golden hour and
 * the default: the magazine shot.
 */
export const TIME_PRESETS = {
    morning: {
        label: 'Morning, 9am',
        sun: 'Morning, about 9am: a low, clear sun from the side, long cool-toned shadows raking across the cladding, deck and lawn, fresh bright light with a slight blue in the shade.',
        dull: 'Morning, about 9am: soft cool daylight with no direct sun, gentle shading, fresh and clean.',
        lightsOn: false,
    },
    midday: {
        label: 'Midday, 12pm',
        sun: 'Midday: a high, bright sun, short crisp shadows directly under the eaves and fascia, strong light on the roof and every top edge, the walls evenly lit.',
        dull: 'Midday: bright, even, diffuse daylight from above, soft shadows under the eaves.',
        lightsOn: false,
    },
    evening: {
        label: 'Evening, 6pm · golden hour',
        sun: 'Evening, about 6pm, golden hour: a low warm sun from the side, long soft shadows, amber light grazing the cladding and catching the glazing bars, the sky graded from warm gold at the horizon to blue above. Every interior and exterior light is ON and glowing warmly, the building lit from within.',
        dull: 'Evening, about 6pm: the last grey daylight fading, every interior and exterior light ON and glowing warm against the dull sky, the building lit from within.',
        lightsOn: true,
    },
    night: {
        label: 'Night, 9pm',
        sun: 'Night, about 9pm: a deep blue sky with the last of the light on the horizon, every exterior and interior light ON, warm pools of light on the walls, the deck and the ground, the glazing glowing.',
        dull: 'Night, about 9pm: a dark overcast sky, every exterior and interior light ON, warm pools of light on the walls, the deck and the wet ground, the glazing glowing.',
        lightsOn: true,
    },
};

/** WEATHER: the sky, the quality of light and the state of the ground. */
export const WEATHER_PRESETS = {
    summer: { label: "Summer's day", sun: true, text: 'A clear summer day: a blue sky with a few small high clouds, hard clean sunlight, a lush freshly mown lawn with fine blade texture and subtle tonal variation, full leafy planting, dry surfaces.' },
    winter: { label: "Winter's day", sun: true, text: 'A clear, cold winter day: a low pale sun, a cool cloud-streaked sky, bare-branched trees and dormant planting, a light frost silvering the lawn, dry surfaces, long cool shadows.' },
    overcast: { label: 'Overcast', sun: false, text: 'Overcast: a bright, even grey-white sky, soft diffuse light with no hard shadows, true colours, a green lawn, dry surfaces.' },
    // Light rain only (Charlie, 21 Sep): a drizzle with a sheen, not a downpour with puddles.
    rain: { label: 'Rainy day', sun: false, text: 'Light rain: a soft grey sky, a fine drizzle in the air, surfaces damp with a gentle sheen - the deck and glass lightly beaded, the cladding a shade darker where it is wet - the lawn green and damp with no standing water.' },
    snow: { label: 'Snow', sun: true, text: 'Snow: a cold pale-blue sky, fresh snow lying on the roof, the deck, the lawn and the tops of fences and planting, cold blue shadows, the cladding clean and dry under the eaves, a few flakes in the air.' },
};

const asText = (map, key, fallback) => (typeof key === 'string' && map[key] !== undefined) ? map[key] : map[fallback];

/** Older clients sent one combined key; each maps onto the new pair. */
const LEGACY_TIME = { afternoon: ['evening', null], dusk: ['evening', null], overcast: ['midday', 'overcast'] };

/**
 * The light: time and weather resolved together, for the exterior and the
 * interior prompts alike.
 * @returns {{ time: string, weather: string, lightsOn: boolean, timeKey: string, weatherKey: string }}
 */
export function resolveLight(timePreset, weatherPreset) {
    let timeKey = typeof timePreset === 'string' && TIME_PRESETS[timePreset] ? timePreset : null;
    let weatherKey = typeof weatherPreset === 'string' && WEATHER_PRESETS[weatherPreset] ? weatherPreset : null;
    if (!timeKey && LEGACY_TIME[timePreset]) { timeKey = LEGACY_TIME[timePreset][0]; weatherKey = weatherKey || LEGACY_TIME[timePreset][1]; }
    timeKey = timeKey || 'evening';
    weatherKey = weatherKey || 'summer';
    const t = TIME_PRESETS[timeKey], w = WEATHER_PRESETS[weatherKey];
    return { time: w.sun ? t.sun : t.dull, weather: w.text, lightsOn: t.lightsOn, timeKey, weatherKey };
}

/**
 * The editorial photography brief: light and colour only. Nothing here may
 * describe framing, lens, crop, form or "hero" composition.
 */
const LOOK = 'LOOK: editorial architectural photography, the standard of a magazine cover or an architect\'s own website. One strong key light from the sun (or, without sun, one soft sky light) with deep but open shadows, real contrast and a full tonal range from bright highlights to rich darks - never flat, never washed out, never hazy - a subtle warm colour grade, and a sky with depth and gradient rather than a blank tone. Sharp from front to back, no depth of field, natural exposure. Materials rendered as real: timber with grain and board joints, metal with seams, glass with true reflections of the sky and garden and a dim view of the interior, decking boards with joints, brick with real coursing.';

/**
 * The render prompt.
 * @param {object} o
 * @param {string} o.inventoryText   numbered list from inventoryToText
 * @param {boolean} o.hasLine        image 1 is a line drawing (else the shaded view is image 1 alone)
 * @param {string} o.scenePreset     key of SCENE_PRESETS
 * @param {string} o.timePreset      key of TIME_PRESETS
 * @param {string} o.weatherPreset   key of WEATHER_PRESETS
 * @param {string} o.sceneText       the user's own words about the setting
 */
export function buildRenderPrompt({ inventoryText, hasLine, lineOnly = false, scenePreset, timePreset, weatherPreset, sceneText }) {
    const inputs = lineOnly
        ? 'Image 1 is an exact LINE DRAWING of a finished design: every edge in it is real geometry, and it is the ONLY geometry there is. There is NO colour reference: every colour and material comes from the inventory below, and where the inventory names none, use a plain, plausible new-build finish. Keep the camera, framing and crop exactly.'
        : hasLine
        ? 'Image 1 is an exact LINE DRAWING of a finished 3D model: every edge in it is real geometry, and it is the ONLY geometry there is. Image 2 is the same view, flat-shaded: a colour and material reference for the BUILDING only - where its colours disagree with the inventory below, the inventory wins - and its sky, ground tone and flat lighting are not references for anything. Keep image 1\'s camera, framing and crop exactly.'
        : 'Image 1 is a flat-shaded view of a finished 3D model. Its geometry is final and complete; its sky, ground tone and flat lighting are not references for anything. Keep its camera, framing and crop exactly.';
    const setting = [asText(SCENE_PRESETS, scenePreset, 'uk-residential'), (sceneText || '').trim()].filter(Boolean).join(' ');
    const light = resolveLight(timePreset, weatherPreset);
    return [
        'HARD RULES - these override everything below.',
        inputs,
        'You are an offline render engine given a finished scene: you light and shade the geometry you were handed. You cannot add, remove, move, resize or restyle anything. Every wall, opening, roof line, deck edge, wall, step, path and fitting is exactly where the drawing has it.',
        '',
        'INVENTORY - everything in the design. Each item is rendered exactly where and how the drawing shows it:',
        inventoryText || '(no inventory supplied - the drawing is the complete list)',
        '',
        'FORBIDDEN: ' + (light.lightsOn ? 'any exterior or interior light fitting left OFF - every fitting is ON and glowing; ' : 'any exterior light fitting switched ON - every wall light, soffit light and garden light is OFF, unlit, no glow, no light cone, no warm pool on the wall; ') + 'any door, window, rooflight or opening not in the drawing; any deck, patio, path, paving, step, wall, fence, pergola or structure not in the drawing; shrinking or cutting back a deck; moving the camera, zooming, cropping tighter or pulling back; furniture, pots, planters, bikes, parasols or people; restyling a door, frame or light fitting; changing a cladding colour family; glazing a door listed as solid; weathering, dirt, moss or staining - everything is newly built and clean.',
        '',
        LOOK,
        'TIME: ' + light.time,
        'WEATHER: ' + light.weather,
        `SETTING - the only thing you may dress, and only OUTSIDE the drawn items: ${setting || 'a simple lawn with a few shrubs beyond the boundary.'} Lawn, planting, sky, distant trees and neighbours live where the drawing shows plain ground or nothing at all; they never cover, replace or cut into a drawn item. A boundary fence, wall or hedge from the setting goes only where the drawing shows NO boundary; where a boundary run is drawn, render that run as listed and nothing else.`,
        'OUTPUT: 2K, the same aspect ratio as image 1.',
    ].join('\n');
}

/** Pass two, when the first pass drifted: surfaces only, geometry pixel-locked. */
export function buildMaterialsPassPrompt({ inventoryText, failures }) {
    return [
        'HARD RULES - this is a MATERIALS AND LIGHTING pass on a finished render. Keep every pixel of geometry, camera, framing, openings, deck extent, walls, steps and fittings exactly as the input shows. Nothing is added, removed, moved, resized or restyled.',
        failures?.length ? 'The previous attempt was rejected because: ' + failures.map(f => `${f.label} - ${f.problem}`).join('; ') + '. Correct exactly these against the inventory, and change nothing else.' : '',
        '',
        'INVENTORY:',
        inventoryText,
        '',
        'Improve only: material realism (grain, joints, seams, coursing), glass reflections, lighting contrast and softness, shadow and ambient occlusion in window and door reveals, along the fascia line and at the deck edge, sky and lawn texture. Output 2K, same aspect ratio as the input.',
    ].filter(l => l !== undefined).join('\n');
}

/** An uploaded shaded view has no drawing, so the engine draws one first. */
export const LINE_CONVERSION_PROMPT = 'Convert this flat-shaded 3D view into a clean black-on-white architectural LINE DRAWING. Trace every edge exactly where it is: the building, roof and fascia, every window and door frame and panel division, any wall lights, the decking outline and its board lines, any walls, fences, steps and paths, and whatever is visible through the glass. Same camera, same framing, same proportions, nothing added or removed. No shading, no colour, no hatching, no text, no grid.';

/** The survey for uploads: what is in this view, as inventory items. */
export const SURVEY_PROMPT = [
    'You are surveying a 3D view of a garden building for a render engine. List EVERYTHING modelled in the image as separate items, each described precisely enough that a renderer could keep it exactly: shape, size relative to the building, position, material and colour.',
    'Required groups, one item each unless there are several: building (storey count, roof form, fascia); materials (cladding per visible elevation with board direction and colour, roof covering, fascia, frame colour); openings (EACH door set and EACH window separately: which wall, type - hinged/French/bi-fold/sliding, leaf count, glazed or SOLID opaque, frame colour, and where along the wall); garden (decking with its shape, extent, level changes and board material; each path; each patio; each boundary run - fence, wall, hedge, open - with material and height; steps); lights (each exterior fitting: style, e.g. slim flat box up/down light, position, count; soffit downlights); interior (what is seen through the glazing: floor, furniture, kitchen, doors).',
    'Describe ONLY what is actually in the image. If there is no decking, no lights or no windows, say so in one item ("No windows on any visible elevation") - never assume a feature exists because buildings usually have one. Do not describe the plain ground plane, the sky or a floor grid.',
].join('\n');
