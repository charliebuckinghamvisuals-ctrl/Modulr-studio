/**
 * The INTERIOR route's knowledge (21 Sep 2026).
 *
 * A render taken from inside the room - the walk-mode camera - goes through
 * the same engine as an exterior: the configurator's shaded view and edge
 * drawing, one FINISH pass, the verifier, one retry. What differs is what
 * the engine is TOLD, and that is everything in this file:
 *
 *   interiorInventoryFromSpec   the room, walls, floor, ceiling, each opening
 *                               as seen from inside, partitions, the kitchen,
 *                               every piece of furniture - and what is NOT
 *                               there, so nothing is invented
 *   buildInteriorRenderPrompt   the contract: no set dressing inside the
 *                               room, light from the drawn openings and
 *                               fittings, the garden only through the glass
 *   buildInteriorMaterialsPass  the retry's surfaces-only pass, in interior
 *                               terms (plaster, floor grain, fabric, worktop)
 *
 * The exterior inventory (render/inventory.js) is not reused because almost
 * none of it applies indoors - cladding, fascia, deck, boundary and exterior
 * lights are invisible from a sofa - and the few shared things (openings,
 * partitions, furniture) are described from the other side of the wall.
 */
import { SCENE_PRESETS, resolveLight } from './prompt.js';

const clean = (v, n = 200) => (typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, n) : '');
const mm = (v) => (typeof v === 'number' && isFinite(v) ? `${Math.round(v)}mm` : null);
const hex = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null);
const item = (id, group, label, text) => ({ id, group, label: clean(label, 80), text: clean(text, 900) });

const FLOOR_WORDS = {
    oak: 'oak plank flooring', oak_plank: 'oak plank flooring', walnut: 'walnut plank flooring', light_oak: 'pale oak plank flooring', grey_oak: 'grey-washed oak plank flooring',
    herringbone: 'herringbone parquet flooring', tiles: 'large-format tiled flooring', carpet: 'carpet', concrete: 'polished concrete floor', laminate: 'laminate plank flooring',
};
const WORKTOP_WORDS = {
    carrara: 'white Carrara marble-effect worktop with soft grey veining', onyx: 'black onyx-effect stone worktop', cream: 'cream stone worktop', travertine: 'travertine-effect stone worktop',
    umber: 'dark umber stone worktop', nero: 'black stone worktop', oak: 'solid oak timber worktop',
};
const UNIT_FINISH_WORDS = { matt: 'matt painted', satin: 'satin painted', gloss: 'high-gloss lacquered', oak_veneer: 'oak veneer', walnut_veneer: 'walnut veneer', silver_oak_veneer: 'silver-grey oak veneer' };
const FRAME_NAMES = { upvc: 'uPVC', aluminium: 'aluminium', timber: 'painted timber' };
const asText = (map, key, fallback) => (typeof key === 'string' && map[key] !== undefined) ? map[key] : map[fallback];

/** Is this spec an interior capture? The configurator stamps `view` on the room spec. */
export const isInteriorSpec = (spec) => !!spec && typeof spec === 'object' && spec.view === 'interior';

/**
 * Items for a view from INSIDE the room. Returns [] for anything that is
 * not a spec. Every item ends with what the drawing fixes, because the
 * image models read an item as permission to restyle unless told otherwise.
 */
export function interiorInventoryFromSpec(spec) {
    if (!spec || typeof spec !== 'object') return [];
    const items = [];
    try {
        const wStr = mm(spec.widthMm), dStr = mm(spec.depthMm);
        const gable = spec.shape === 'Gable';
        const ceiling = gable
            ? (spec.gableFlatCeiling
                ? `a FLAT boarded ceiling at ${mm(spec.gableCeilingHeightMm) || 'the drawn height'} with no roof pitch showing`
                : 'a VAULTED ceiling that follows the gable roof pitch up to the ridge, exactly as the drawing shows it')
            : 'a flat ceiling at the drawn height';
        items.push(item('room', 'building', `Room ${wStr && dStr ? `${wStr} x ${dStr}` : ''}, ${gable ? 'gable' : 'flat roof'}`.trim(),
            `The ROOM, seen from inside: a single-storey garden building ${wStr && dStr ? `${wStr} wide x ${dStr} deep overall, ` : ''}with ${ceiling}. The camera is INSIDE the room. Every wall, corner, ceiling line, floor edge and opening is exactly where the drawing has it - nothing is added to the shell and nothing is taken away.`));

        // ---- surfaces ----------------------------------------------------
        const wallColour = hex(spec.interior?.wallsHex) || hex(spec.interiorColor) || '#ffffff';
        items.push(item('walls', 'materials', `Walls: painted ${wallColour}`,
            `WALLS: smooth plastered walls painted ${wallColour}, matt emulsion, exactly this colour on every wall the drawing shows, running straight down to meet the floor. There are NO skirting boards, NO coving, NO panelling, dado or picture rail - the drawing has none, so the render has none; no artwork, mirrors or shelves on any wall.`));
        const floorWords = clean(String(spec.interior?.floor || ''), 60) || FLOOR_WORDS[String(spec.interiorFloorType || '')] || 'timber plank flooring';
        items.push(item('floor', 'materials', `Floor: ${floorWords}`,
            `FLOOR: ${floorWords}, running in the direction the drawing shows, boards or tiles with real joints, exactly to the walls. No rugs or mats unless listed below.`));
        items.push(item('ceiling', 'materials', 'Ceiling: white, fittings as drawn',
            `CEILING: painted white, with EXACTLY the light fittings the drawing shows - recessed downlights or pendants only where they are drawn, the same number. If the drawing shows NO fittings, the ceiling is a plain flat painted surface with nothing on it at all: no downlights, no pendant, no spot rail. No beams, trusses, roof lights or ceiling features that are not drawn.`));

        // ---- frames ------------------------------------------------------
        const inner = clean(String(spec.frameColorInner || spec.frameColor || ''), 20);
        const openingCount = (Array.isArray(spec.doors) ? spec.doors.length : 0) + (Array.isArray(spec.windows) ? spec.windows.length : 0);
        // Only when there are frames to describe: on a sealed room the item
        // read as permission to add some (interior-1, 21 Sep).
        if (inner && openingCount > 0) {
            const fm = FRAME_NAMES[spec.frameMaterial] || 'aluminium';
            items.push(item('frames', 'materials', `Frames inside: ${inner.toUpperCase()} ${fm}`,
                `WINDOW AND DOOR FRAMES, inside face: ${inner.toUpperCase()} ${fm} on every opening, slim, exactly the frame widths and glazing divisions the drawing shows. A SOLID door leaf is ${inner.toUpperCase()} like its frame.`));
        }

        // ---- openings, as seen from inside ------------------------------
        const doors = Array.isArray(spec.doors) ? spec.doors.slice(0, 12) : [];
        const windows = Array.isArray(spec.windows) ? spec.windows.slice(0, 12) : [];
        doors.forEach((dr, i) => {
            const style = dr.style === 'crittall' ? 'black steel Crittall-style with a grid of slim glazing bars'
                : dr.style === 'solid' ? 'SOLID UNGLAZED - an opaque flush panel leaf with NO glass anywhere in it'
                : 'glazed, clear glass';
            const leaves = Math.max(1, parseInt(dr.leaves) || 1);
            const kind = ['hinged', 'french', 'bifold', 'sliding'].includes(dr.kind) ? dr.kind : leaves <= 1 ? 'hinged' : leaves === 2 ? 'french' : 'bifold';
            const product = kind === 'hinged' ? 'single hinged door, 1 leaf'
                : kind === 'french' ? 'French doors, a pair of hinged leaves, 2 leaves'
                : kind === 'bifold' ? `bi-fold door set of ${leaves} equal folding leaves in one frame`
                : `sliding door set of ${leaves} equal panes in one frame`;
            const wall = clean(String(dr.wall || 'front'), 10);
            const openWords = dr.open === true ? ' This door set is drawn OPEN, exactly as the drawing shows it, with the garden visible through the opening - not closed up.' : '';
            items.push(item(`door-${i + 1}`, 'openings', `Door ${i + 1}: ${kind}, ${leaves} leaf, ${dr.style === 'solid' ? 'solid' : dr.style === 'crittall' ? 'Crittall' : 'glazed'}, ${wall} wall`,
                `Door ${i + 1}, seen from inside: ${product}, ${mm(dr.widthMm) || 'unspecified width'} x ${mm(dr.heightMm) || 'unspecified height'}, ${style}, in the ${wall === 'bay' ? 'dividing' : wall} wall. Exactly where and how big the drawing shows it.${openWords}`));
        });
        windows.forEach((wn, i) => {
            const wall = clean(String(wn.wall || 'front'), 10);
            const style = wn.style === 'crittall' ? 'Crittall-style glazing bar grid' : 'plain clear glazing';
            items.push(item(`window-${i + 1}`, 'openings', `Window ${i + 1}: ${mm(wn.widthMm) || '?'} x ${mm(wn.heightMm) || '?'}, ${wall} wall`,
                `Window ${i + 1}, seen from inside: ${mm(wn.widthMm) || '?'} x ${mm(wn.heightMm) || '?'}, ${style}, in the ${wall === 'bay' ? 'dividing' : wall} wall${mm(wn.sillMm) ? `, sill ${mm(wn.sillMm)} above the floor` : ''}. Exactly where and how big the drawing shows it, with a plain painted reveal and no curtains, blinds or pelmets.`));
        });
        const sky = Array.isArray(spec.skylights) ? spec.skylights.length : 0;
        items.push(item('openings-total', 'openings', `${doors.length} door set${doors.length === 1 ? '' : 's'}, ${windows.length} window${windows.length === 1 ? '' : 's'}, ${sky} rooflight${sky === 1 ? '' : 's'}`,
            `Openings in the WHOLE room: ${doors.length} door set${doors.length === 1 ? '' : 's'}, ${windows.length} window${windows.length === 1 ? '' : 's'} and ${sky} rooflight${sky === 1 ? '' : 's'}, listed above. Only those the drawing shows are in frame; render an opening ONLY where the drawing shows one. A blank wall in the drawing stays a blank painted wall - even if that leaves NO window or door in view, which is normal for a view facing away from the glazing; never add one to let light in.${!windows.length ? ' There are NO windows anywhere in this room.' : ''}${!doors.length ? ' There are NO door sets anywhere in this room.' : ''}${!sky ? ' There are NO rooflights.' : ''}`));

        // ---- partitions and internal doors --------------------------------
        const parts = Array.isArray(spec.partitions) ? spec.partitions.slice(0, 8) : [];
        parts.forEach((pt, i) => {
            if (!pt || typeof pt !== 'object') return;
            const runs = Number(pt.rotation) === 90 ? 'front-to-back' : 'left-to-right';
            const doorsIn = Array.isArray(pt.doors) ? pt.doors.length : 0;
            items.push(item(`partition-${i + 1}`, 'interior', `Internal wall ${i + 1}: ${mm(pt.lengthMm) || '?'} long, runs ${runs}`,
                `INTERNAL PARTITION WALL ${i + 1}: a full-height plastered wall ${mm(pt.lengthMm) || 'of the drawn length'} long and ${Number(pt.thicknessMm) || 100}mm thick, running ${runs}, painted ${wallColour} like the other walls${doorsIn ? `, with ${doorsIn} internal door${doorsIn === 1 ? '' : 's'} in it` : ', with no opening in it'}. Exactly where and as thick as the drawing shows; never moved, removed or thinned.`));
        });
        const idoors = Array.isArray(spec.interiorDoors) ? spec.interiorDoors.slice(0, 8) : [];
        idoors.forEach((d, i) => {
            const style = clean(String(d?.style || 'flush'), 30).replace(/_/g, ' ');
            items.push(item(`internal-door-${i + 1}`, 'interior', `Internal door ${i + 1}: ${style}`,
                `INTERNAL DOOR ${i + 1}: a ${style} internal door${hex(d?.color) ? ` in ${hex(d.color)}` : ''}, exactly where and how big the drawing shows it, ${d?.open ? 'drawn open' : 'closed'}.`));
        });

        // ---- kitchen -------------------------------------------------------
        const pieces = Array.isArray(spec.interior?.items) ? spec.interior.items.slice(0, 30) : [];
        const kitchenPieces = pieces.filter(p => /kitchen|worktop|island|larder|hob|oven|fridge|extractor|sink|tap|drawer|unit/i.test(String(p.label || '')));
        // Only when kitchen units are actually placed: every room carries a
        // default worktopMaterial, so that alone means nothing.
        if (kitchenPieces.length) {
            const finish = UNIT_FINISH_WORDS[spec.unitFinish] || 'matt painted';
            const colours = [...new Set(kitchenPieces.map(p => hex(p.color)).filter(Boolean))];
            const worktop = WORKTOP_WORDS[spec.worktopMaterial] || (spec.worktopMaterial ? clean(String(spec.worktopMaterial), 30) + ' worktop' : 'the drawn worktop');
            const list = kitchenPieces.map(p => `${Number(p.count) > 1 ? `${Number(p.count)} x ` : ''}${clean(String(p.label || ''), 40)}${hex(p.color) ? ` in ${hex(p.color)}` : ''}`).join('; ');
            items.push(item('kitchen', 'interior', `Kitchen: ${finish}${colours.length ? ' ' + colours.join('/') : ''}, ${worktop.split(' with')[0]}`,
                `KITCHEN: ${finish} cabinet doors${colours.length ? ` in ${colours.join(' and ')}` : ''}, plain flat SLAB fronts - no shaker frames, no raised or recessed panels, no visible handles unless drawn - with fine shadow gaps, and a ${worktop}. Units EXACTLY as placed and drawn - the same number, sizes and positions - with the appliances the drawing shows and no others: ${list || 'as drawn'}. A tap, hob, oven or extractor appears ONLY if it is listed here and drawn; a sink unit with no tap listed has no tap. No open shelving, splashback tiling, utensils, crockery, bottles or plants on the worktop unless drawn.`));
        }

        // ---- furniture, piece by piece -------------------------------------
        const furniture = pieces.filter(p => !kitchenPieces.includes(p));
        furniture.forEach((p, i) => {
            const n = Number(p.count) > 1 ? Number(p.count) : 1;
            const label = clean(String(p.label || 'item'), 40);
            const colour = hex(p.color);
            items.push(item(`furniture-${i + 1}`, 'interior', `${n > 1 ? `${n} x ` : ''}${label}${colour ? ` in ${colour}` : ''}`,
                `${n > 1 ? `${n} x ` : ''}${label.toUpperCase()}${colour ? ` in ${colour}` : ''}: exactly where, how big and how many the drawing shows, in this colour, its real shape kept - not restyled into a different product.`));
        });
        items.push(item('furniture-total', 'interior', `${furniture.length} furniture item${furniture.length === 1 ? '' : 's'} in total`,
            `EVERYTHING inside the room is listed above - ${furniture.length} furniture item${furniture.length === 1 ? '' : 's'}${kitchenPieces.length ? ' plus the kitchen' : ''}. Nothing else is in the room: no rugs, cushions, throws, lamps, plants, artwork, mirrors, books, vases, ornaments, curtains, blinds or accessories. Empty floor in the drawing stays empty floor; a bare wall stays bare.`));

        // ---- through the glazing -------------------------------------------
        items.push(item('outside', 'garden', 'Outside, through the glass: garden and daylight',
            'THROUGH THE GLAZING AND ANY OPEN DOOR: the garden outside and the sky, slightly brighter than the room. It is the only thing that may be dressed, and it stays outside - nothing from it comes into the room.'));
    } catch (e) {
        console.warn('[RENDER] interiorInventoryFromSpec skipped an item:', e.message || e);
    }
    return items;
}

/**
 * Surveying an INTERIOR capture into inventory items.
 *
 * The exterior SURVEY_PROMPT asks for elevations, decking, boundaries and
 * roof coverings, none of which exist in a room; pointed at an interior it
 * invented a building around the view. This asks for what a room actually
 * holds, in the same groups the bar already renders.
 */
export const INTERIOR_SURVEY_PROMPT = [
    'You are surveying a 3D view taken INSIDE a room of a garden building, for a render engine. List EVERYTHING modelled in the image as separate items, each described precisely enough that a renderer could keep it exactly: what it is, its size relative to the room, where it sits, its material and its colour.',
    'Required groups, one item each unless there are several: building (the room itself - its shape, ceiling form - flat, vaulted or part-flat - and rough proportions); materials (wall finish and colour, ceiling finish and colour, floor material with board or tile direction and colour, any partition or feature wall); openings (EACH door set and EACH window separately: which wall, type - hinged/French/bi-fold/sliding, leaf count, glazed or SOLID, frame colour inside, and where along the wall; rooflights); interior (EACH piece of furniture, kitchen or bathroom unit, worktop, appliance, tap, rug, and what is fitted where - never a generic "furniture" item); lights (each fitting seen: downlight, pendant, wall light - style, position and count).',
    'Describe ONLY what is actually in the image. An empty room is an empty room: say so in one item ("No furniture - the room is empty") rather than furnishing it. Do not describe anything seen through the glass beyond a single item naming what the view is (for example "Through the glazing: lawn and planting").',
].join('\n');

/**
 * The interior render prompt. Same four-part contract as the exterior
 * (render/prompt.js): HARD RULES, INVENTORY, FORBIDDEN, LOOK. The setting
 * exists only through the glass.
 */
export function buildInteriorRenderPrompt({ inventoryText, hasLine, lineOnly = false, scenePreset, timePreset, weatherPreset, sceneText }) {
    const inputs = lineOnly
        ? 'Image 1 is an exact LINE DRAWING of a finished room interior: every edge in it is real geometry, and it is the ONLY geometry there is. There is NO colour reference: every colour and material comes from the inventory below. Keep the camera, framing and crop exactly.'
        : hasLine
        ? 'Image 1 is an exact LINE DRAWING of a finished 3D model of a ROOM, camera inside it: every edge in it is real geometry, and it is the ONLY geometry there is. Image 2 is the same view, flat-shaded, for colour and material reference only - where its colours disagree with the inventory below, the inventory wins. Keep image 1\'s camera, framing and crop exactly.'
        : 'Image 1 is a flat-shaded view of a finished 3D model of a ROOM, camera inside it. Its geometry is final and complete. Keep its camera, framing and crop exactly.';
    const setting = [asText(SCENE_PRESETS, scenePreset, 'uk-residential'), (sceneText || '').trim()].filter(Boolean).join(' ');
    const light = resolveLight(timePreset, weatherPreset);
    const time = light.time + ' Outside the glass: ' + light.weather;
    const lightsOn = light.lightsOn;
    return [
        'HARD RULES - these override everything below.',
        inputs,
        'You are an offline render engine given a finished INTERIOR scene: you light and shade the geometry you were handed. You cannot add, remove, move, resize or restyle anything. Every wall, ceiling line, floor edge, opening, frame, partition, kitchen unit and piece of furniture is exactly where the drawing has it. A wall the drawing shows as blank is a blank painted wall: never cut a window or door into it to let light in, even if that leaves no opening in view. The floor meets each wall in a plain line: no skirting board is drawn, so none is rendered.',
        '',
        'INVENTORY - everything in the room. Each item is rendered exactly where and how the drawing shows it:',
        inventoryText || '(no inventory supplied - the drawing is the complete list)',
        '',
        'FORBIDDEN: ' + (lightsOn ? 'any ceiling or wall light fitting left OFF - every drawn fitting is ON, warm and glowing; ' : 'any light fitting switched ON - the drawn fittings are OFF and the room is lit by daylight through its openings; ')
            + 'any furniture, rug, cushion, throw, lamp, plant, artwork, mirror, book, vase, ornament, curtain, blind, shelf or accessory not in the drawing - the room holds ONLY the listed items; any door, window, rooflight or opening not in the drawing; any skirting, coving, beam, column, alcove or ceiling feature not in the drawing; moving the camera, zooming, cropping tighter or pulling back; people or pets; changing a wall, floor, frame, worktop or unit colour; wear, dirt, scuffs or clutter - everything is newly fitted and clean.',
        '',
        'LOOK: a photorealistic interior architectural visualisation, sharp from front to back, no depth of field, natural exposure, neutral white balance. Materials rendered as real: matt emulsion on smooth plaster, timber flooring with grain and board joints, fabric with visible weave, painted cabinet doors with crisp edges and fine shadow gaps, stone worktops with a soft sheen, clear glass with light reflections. Soft global illumination: daylight from the drawn openings bounces off the walls and floor, with gentle contact shadows under every piece of furniture and where the floor meets each wall. ' + time,
        `THROUGH THE GLAZING - the only thing you may dress, and only OUTSIDE the room: ${setting || 'a simple lawn with a few shrubs beyond.'} It is seen through the windows and doors, a little brighter than the room, and it never comes inside the drawing.`,
        'OUTPUT: 2K, the same aspect ratio as image 1.',
    ].join('\n');
}

/** The retry's surfaces-only pass, in interior terms. */
export function buildInteriorMaterialsPassPrompt({ inventoryText, failures }) {
    return [
        'HARD RULES - this is a MATERIALS AND LIGHTING pass on a finished interior render. Keep every pixel of geometry, camera, framing, openings, walls, ceiling, kitchen units and furniture exactly as the input shows. Nothing is added, removed, moved, resized or restyled.',
        failures?.length ? 'The previous attempt was rejected because: ' + failures.map(f => `${f.label} - ${f.problem}`).join('; ') + '. Correct exactly these against the inventory, and change nothing else.' : '',
        '',
        'INVENTORY:',
        inventoryText,
        '',
        'Improve only: material realism (plaster, floor grain and joints, fabric weave, cabinet edges, worktop sheen), glass reflections, the softness of the daylight, ambient occlusion in the window and door reveals, under the furniture and along the floor-to-wall line. Output 2K, same aspect ratio as the input.',
    ].filter(l => l !== undefined).join('\n');
}
