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

export const TIME_PRESETS = {
    'morning': 'Early morning: low clear sun from the side, long soft shadows, fresh cool light.',
    'midday': 'Midday: bright overhead sun, crisp shadows, clear blue sky with a few small clouds.',
    'afternoon': 'Late afternoon: warm golden sun from a low angle, long shadows, a clear sky.',
    'dusk': 'Dusk: the sky turning apricot and blue, exterior and interior lights ON and glowing warmly, the building lit from within.',
    'overcast': 'Overcast: soft even daylight from a bright grey-white sky, no hard shadows, true colours.',
    'night': 'Night: a deep blue sky, every exterior and interior light ON, warm pools of light on the walls and ground.',
};

const asText = (map, key, fallback) => (typeof key === 'string' && map[key] !== undefined) ? map[key] : map[fallback];

/**
 * The render prompt.
 * @param {object} o
 * @param {string} o.inventoryText   numbered list from inventoryToText
 * @param {boolean} o.hasLine        image 1 is a line drawing (else the shaded view is image 1 alone)
 * @param {string} o.scenePreset     key of SCENE_PRESETS
 * @param {string} o.timePreset      key of TIME_PRESETS
 * @param {string} o.sceneText       the user's own words about the setting
 */
export function buildRenderPrompt({ inventoryText, hasLine, lineOnly = false, scenePreset, timePreset, sceneText }) {
    const inputs = lineOnly
        ? 'Image 1 is an exact LINE DRAWING of a finished design: every edge in it is real geometry, and it is the ONLY geometry there is. There is NO colour reference: every colour and material comes from the inventory below, and where the inventory names none, use a plain, plausible new-build finish. Keep the camera, framing and crop exactly.'
        : hasLine
        ? 'Image 1 is an exact LINE DRAWING of a finished 3D model: every edge in it is real geometry, and it is the ONLY geometry there is. Image 2 is the same view, flat-shaded, for colour and material reference only - where its colours disagree with the inventory below, the inventory wins. Keep image 1\'s camera, framing and crop exactly.'
        : 'Image 1 is a flat-shaded view of a finished 3D model. Its geometry is final and complete. Keep its camera, framing and crop exactly.';
    const setting = [asText(SCENE_PRESETS, scenePreset, 'uk-residential'), (sceneText || '').trim()].filter(Boolean).join(' ');
    const time = asText(TIME_PRESETS, timePreset, 'afternoon');
    const lightsOn = timePreset === 'dusk' || timePreset === 'night';
    return [
        'HARD RULES - these override everything below.',
        inputs,
        'You are an offline render engine given a finished scene: you light and shade the geometry you were handed. You cannot add, remove, move, resize or restyle anything. Every wall, opening, roof line, deck edge, wall, step, path and fitting is exactly where the drawing has it.',
        '',
        'INVENTORY - everything in the design. Each item is rendered exactly where and how the drawing shows it:',
        inventoryText || '(no inventory supplied - the drawing is the complete list)',
        '',
        'FORBIDDEN: ' + (lightsOn ? 'any exterior or interior light fitting left OFF - every fitting is ON and glowing; ' : 'any exterior light fitting switched ON - every wall light, soffit light and garden light is OFF, unlit, no glow, no light cone, no warm pool on the wall; ') + 'any door, window, rooflight or opening not in the drawing; any deck, patio, path, paving, step, wall, fence, pergola or structure not in the drawing; shrinking or cutting back a deck; moving the camera, zooming, cropping tighter or pulling back; furniture, pots, planters, bikes, parasols or people; restyling a door, frame or light fitting; changing a cladding colour family; glazing a door listed as solid; weathering, dirt, moss or staining - everything is newly built and clean.',
        '',
        'LOOK: a photorealistic architectural visualisation, sharp from front to back, no depth of field, natural exposure. Materials rendered as real: timber with grain and board joints, metal with seams, glass with true reflections of the sky and garden and a dim view of the interior, decking boards with joints, brick with real coursing. ' + time,
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
        'Improve only: material realism (grain, joints, seams, coursing), glass reflections, lighting softness, shadow and ambient occlusion in window and door reveals, along the fascia line and at the deck edge, sky and lawn texture. Output 2K, same aspect ratio as the input.',
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
