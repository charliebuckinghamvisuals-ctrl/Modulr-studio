/**
 * Floor Plan Studio: the render engine pointed straight down.
 *
 * Two outputs from one plan-view capture (or an uploaded top view):
 *   rendered  a photoreal top-down plan - walls cut at 1.2 m, real floor,
 *             the furniture as placed, soft top-down shadows
 *   cad       a black-on-white architectural plan with dimension strings,
 *             door swings, sanitary and furniture symbols, room labels
 *
 * Same contract as the exterior engine (render/prompt.js): geometry rules
 * first, the numbered inventory, the forbidden list, then the look. The
 * inventory here is the exterior one with the elevation-only items (cladding,
 * fascia, wall lights) dropped, plus the things only a plan can show: the
 * overall dimensions, each placed piece of furniture with its position, and
 * the room labels. For a CAD plan the dimensions are TOLD to the model from
 * the spec, so the numbers on the drawing are the design's numbers and the
 * verifier can read them back.
 */
import { inventoryFromSpec } from './inventory.js';

const clean = (v, n = 200) => (typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, n) : '');
const mm = (v) => (typeof v === 'number' && isFinite(v) ? `${Math.round(v)}mm` : null);
const hex = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null);
const item = (id, group, label, text) => ({ id, group, label: clean(label, 80), text: clean(text, 900) });

/** Exterior-only groups that mean nothing from above. */
const DROP_GROUPS = new Set(['materials', 'lights']);
const DROP_IDS = new Set(['frames', 'fascia', 'roof']);

/** Where a placed object sits, in words the model and the verifier can check. */
const placeWords = (o, spec) => {
    const w = Number(spec.widthMm) || 0, d = Number(spec.depthMm) || 0;
    const x = Number(o.xMm) || 0, z = Number(o.zMm) || 0;
    const fromLeft = w ? Math.round(x + w / 2) : null;
    const fromFront = d ? Math.round(d / 2 - z) : null;
    const parts = [];
    if (fromLeft !== null) parts.push(`${fromLeft}mm from the left wall`);
    if (fromFront !== null) parts.push(`${fromFront}mm from the front wall`);
    return parts.length ? `centred ${parts.join(' and ')}` : 'where the drawing shows it';
};

/**
 * The dimension chains along each wall, computed from the spec so a CAD plan
 * copies figures instead of measuring pixels: for each wall, from the plan's
 * left (top and bottom walls) or from the front (side walls), the run of
 * blank wall / opening / blank wall in mm. Offsets follow the configurator:
 * front and back walls measure from the wall's midpoint (+ = right as seen
 * from outside), side walls from the midpoint (+ = toward the front).
 */
export function dimensionChains(spec) {
    const W = Number(spec.widthMm) || 0, D = Number(spec.depthMm) || 0;
    if (!W || !D) return [];
    const openings = [];
    (Array.isArray(spec.doors) ? spec.doors : []).forEach((d, i) => openings.push({ wall: d.wall || 'front', off: Number(d.offsetMm) || 0, w: Number(d.widthMm) || 0, label: `door ${i + 1}` }));
    (Array.isArray(spec.windows) ? spec.windows : []).forEach((w, i) => openings.push({ wall: w.wall || 'front', off: Number(w.offsetMm) || 0, w: Number(w.widthMm) || 0, label: `window ${i + 1}` }));
    const chains = [];
    for (const wall of ['front', 'back', 'left', 'right']) {
        const L = wall === 'front' || wall === 'back' ? W : D;
        const list = openings.filter(o => o.wall === wall && o.w > 0);
        // Start-of-run coordinate for each opening, measured from the plan's
        // left for front/back and from the front corner for the sides.
        const runs = list.map(o => {
            let start;
            if (wall === 'front') start = L / 2 + o.off - o.w / 2;
            else if (wall === 'back') start = L / 2 - o.off - o.w / 2;       // seen from outside the back wall, left is the plan's right
            else start = L / 2 - o.off - o.w / 2;                             // from the front corner
            return { ...o, start: Math.round(start) };
        }).sort((a, b) => a.start - b.start);
        const segs = []; let cursor = 0;
        for (const r of runs) {
            const blank = r.start - cursor; if (blank > 0) segs.push(`${blank}`);
            segs.push(`${r.w} (${r.label})`); cursor = r.start + r.w;
        }
        const tail = L - cursor; if (tail > 0 && runs.length) segs.push(`${tail}`);
        const from = wall === 'front' || wall === 'back' ? "from the plan's left" : 'from the front corner';
        chains.push({ wall, total: L, openings: runs.length, text: runs.length ? `${wall} wall, ${from}: ${segs.join(' + ')} = ${L}` : `${wall} wall: no openings, one run of ${L}` });
    }
    return chains;
}

/**
 * Items for a plan of a configurator design. `spec` is the room spec the
 * Sidebar posts, with `planItems` (each placed object with its position) when
 * the plan capture supplied them.
 * `mode` adds the exact dimension chains for a CAD plan.
 */
export function planInventoryFromSpec(spec, mode = 'rendered') {
    if (!spec || typeof spec !== 'object') return [];
    const base = inventoryFromSpec(spec).filter(it => !DROP_GROUPS.has(it.group) && !DROP_IDS.has(it.id));
    const items = [];
    try {
        const w = mm(spec.widthMm), d = mm(spec.depthMm), t = mm(spec.wallThicknessMm) || '150mm';
        items.push(item('dimensions', 'building', `Overall ${w || '?'} x ${d || '?'}`,
            `OVERALL DIMENSIONS: the building is ${w || 'unspecified'} wide (left to right) by ${d || 'unspecified'} deep (front to back), external wall thickness ${t}. The front wall is at the BOTTOM of the plan, the back wall at the top. These are the design's exact numbers: every dimension string on the drawing is taken from these and the item positions below, never estimated from pixels.`));
        for (const it of base) {
            if (it.id.startsWith('partition-')) {
                const n = Number(it.id.split('-')[1]) || 1;
                const pt = (Array.isArray(spec.partitions) ? spec.partitions : [])[n - 1] || {};
                const runs = Number(pt.rotation) === 90 ? 'front-to-back' : 'left-to-right';
                const doorsIn = Array.isArray(pt.doors) ? pt.doors.length : 0;
                items.push(item(it.id, 'building', it.label,
                    `INTERNAL PARTITION WALL ${n}: ${mm(pt.lengthMm) || 'as drawn'} long, ${Number(pt.thicknessMm) || 100}mm thick, running ${runs}, exactly where image 1 draws it, dividing the room into the spaces the drawing shows${doorsIn ? `, with ${doorsIn} internal door opening${doorsIn === 1 ? '' : 's'} in it exactly where drawn` : ', with NO opening in it'}. There are NO other internal walls: no partition, screen, divider or return that image 1 does not draw.`));
            } else items.push(it);
        }
        if (!(Array.isArray(spec.partitions) && spec.partitions.length)) items.push(item('no-partitions', 'building', 'No internal walls', 'INTERNAL WALLS: none. One open room - do not add a partition, screen or divider anywhere.'));

        // ---- which walls are blank, said outright --------------------------
        const chains = dimensionChains(spec);
        const blank = chains.filter(c => !c.openings).map(c => c.wall);
        if (blank.length) items.push(item('blank-walls', 'openings', `No openings: ${blank.join(', ')} wall${blank.length === 1 ? '' : 's'}`,
            `WALLS WITH NO OPENINGS AT ALL: the ${blank.join(', ')} wall${blank.length === 1 ? '' : 's'}. Solid, unbroken, no door, window, gap or symbol anywhere along ${blank.length === 1 ? 'it' : 'them'}.`));

        // ---- the figures a CAD plan writes, exactly -------------------------
        if (mode === 'cad' && chains.length) items.push(item('dimension-chains', 'building', 'Dimension strings (exact figures)',
            `DIMENSION STRINGS - write exactly these figures and no others, in millimetres, a chain per wall with a tick at each break: ${chains.map(c => c.text).join('; ')}. Plus overall ${w} across the top and ${d} down the left side${spec.hasDecking && Number(spec.deckingSizeMm) ? `, and the deck depth ${Math.round(Number(spec.deckingSizeMm))} down the side of the deck` : ''}. A room's internal width is the run between the wall faces the drawing shows; do not invent any other figure.`));

        // ---- placed furniture, one item each, with its position ---------
        const placed = Array.isArray(spec.planItems) ? spec.planItems.slice(0, 40) : [];
        placed.forEach((o, i) => {
            if (!o || typeof o !== 'object' || typeof o.label !== 'string') return;
            const label = clean(o.label, 40);
            const colour = hex(o.color) ? ` in ${hex(o.color)}` : '';
            const size = o.widthMm && o.depthMm ? `, about ${mm(o.widthMm)} x ${mm(o.depthMm)} in plan` : '';
            const rot = Number.isFinite(o.rotDeg) && Math.round(o.rotDeg) % 360 !== 0 ? `, turned ${Math.round(o.rotDeg)} degrees` : '';
            items.push(item(`furniture-${i + 1}`, 'interior', `${label}${colour}`,
                `FURNITURE: ${label}${colour}${size}, ${placeWords(o, spec)}${rot}, exactly the footprint and orientation the drawing shows - drawn as the object, never as a labelled box and never with its name written on the plan. Present, in that place, at that size - nothing else placed near it.`));
        });
        if (!placed.length && !(spec.interior && Array.isArray(spec.interior.items) && spec.interior.items.length)) {
            items.push(item('furniture-none', 'interior', 'No furniture', 'FURNITURE: none. The room is empty - do NOT add a bed, sofa, table, kitchen, bathroom fittings, rugs, plants or anything else. Empty floor stays empty floor.'));
        }

        // ---- room labels ------------------------------------------------
        const labels = Array.isArray(spec.roomLabels) ? spec.roomLabels.slice(0, 12).map(l => clean(String(l), 30)).filter(Boolean) : [];
        if (labels.length) items.push(item('labels', 'interior', `Labels: ${labels.join(', ')}`,
            `ROOM LABELS, the only text allowed besides dimensions: ${labels.join('; ')}. Each label sits inside the space it names. No other words, no title block, no north arrow, no logo.`));
    } catch (e) {
        console.warn('[PLAN] planInventoryFromSpec skipped an item:', e.message || e);
    }
    return items;
}

const INPUTS = (hasLine, mode) => hasLine
    ? `Image 1 is an exact LINE DRAWING of a 3D model seen from directly above - a floor plan with the roof removed: every line in it is real geometry (external walls, internal walls, door and window openings, furniture outlines, the deck) and it is the ONLY geometry there is. Image 2 is the same plan flat-shaded, for colour and material reference only - where its colours disagree with the inventory, the inventory wins. Keep image 1's framing, scale, orientation and crop exactly: the plan is not rotated, mirrored, zoomed or re-centred. The view is TRUE BIRD'S EYE, straight down, orthographic: no tilt, no three-quarter view, no perspective; no vertical wall face is visible anywhere - every wall shows only its top at its plan thickness, exactly as in image 1.${mode === 'cad' ? ' Where image 2 shows dimension lines and figures, they are correct and are to be kept.' : ''}`
    : `Image 1 is a 3D model seen from directly above - a floor plan with the roof removed. Its geometry is final and complete: every wall, opening and piece of furniture is exactly where it is. Keep its framing, scale, orientation and crop exactly: not rotated, mirrored, zoomed or re-centred.`;

const FORBIDDEN_COMMON = 'any opening on a wall listed as having none; any wall, opening, door, window, partition or room not in the drawing; moving, resizing or removing a wall or opening; any furniture, fitting, kitchen, bathroom, rug, plant, pot, lamp, person or pet not in the inventory; changing what a piece of furniture is; a garden, patio, path, pool, planting or paving not in the drawing; rotating, mirroring, zooming, cropping or re-centring the plan; ANY tilt, perspective, isometric or three-quarter view - it is straight down and a visible vertical wall face is a failure; a title block, north arrow, scale bar, logo, watermark; any text at all except the dimension figures and room labels the inventory lists - never the name of a piece of furniture, never a caption.';

/**
 * The plan prompt.
 * @param {object} o
 * @param {'rendered'|'cad'} o.mode
 * @param {string} o.inventoryText
 * @param {boolean} o.hasLine
 * @param {string} o.notes   the user's own words (kept short, after the contract)
 */
export function buildPlanPrompt({ mode, inventoryText, hasLine, notes }) {
    const cad = mode === 'cad';
    const look = cad
        ? [
            'LOOK: a clean BLACK-ON-WHITE architectural floor plan drawing, exactly as a CAD package prints it, on a plain white sheet. External and internal walls as double lines with a solid dark grey (poche) fill between them at the listed thickness. Every door drawn as its leaf with a thin quarter-circle swing arc (a sliding door as overlapping thin leaves in the opening, no arc). Windows as a thin triple line in the wall. Furniture and fittings as standard plan symbols in thin line - bed with pillows, sofa, table and chairs, WC, basin, shower tray, kitchen run with sink and hob - in the exact place and footprint drawn, with a light hatch on the deck outside.',
            'DIMENSIONS: dimension strings with thin lines, small tick marks at each end and the figure in millimetres centred above the line, in a plain sans-serif font: the overall width along the top and the overall depth down the left, then the widths of each room or bay along the top and the depths down the side, and each door and window opening width along its wall, using the numbers in the inventory. Dimension ONLY the walls, the openings and the deck - never a piece of furniture, never a bed or sofa size, never a gap between furniture and a wall. The figures in each chain add up to the total of that wall exactly. Room labels in small upper-case sans-serif inside each room. Line weights: walls heaviest, furniture and symbols light, dimensions lightest. No colour, no shading, no shadows, no textures, no 3D, no grey background.',
        ].join('\n')
        : [
            'LOOK: a high-end photoreal RENDERED floor plan for a property brochure, seen from DIRECTLY ABOVE - not a flat coloured diagram, and not a tilted 3D view. Lighting is what gives it depth: one soft sun from the upper left at about 45 degrees plus a bright overcast sky. The wall tops (cut at 1.2 m) are crisp white and catch the light; from their bases short, soft, transparent shadows fall across the floor toward the lower right, which is how the walls read as having height without any wall face being visible. Every piece of furniture sits ON the floor with a soft contact shadow under it and a slightly longer soft shadow to the lower right. Ambient occlusion darkens gently where floor meets wall and under furniture; the floor is a touch brighter mid-room than in the corners. Materials photographic: floor boards and deck boards with real grain, board joints, colour variation board to board and a low satin sheen that varies across the surface; linen with weave; painted wall tops with a hint of texture. Colours true to the inventory, exposure natural, whites not blown, blacks not crushed, no colour cast, no vignette, no depth of field, no lens effects.',
            'SETTING: around the building and deck, exactly what image 2 shows - where it shows lawn, render real grass with fine blade texture and gentle colour variation, lit by the same sun, with the building and deck casting one soft shadow onto it to the lower right; where it shows nothing, a plain pale ground. Nothing is placed on the lawn: no paths, paving, planting, pots, furniture or people. NO TEXT of any kind on a rendered plan: no dimension strings, no figures, no labels, no captions - the picture only.',
        ].join('\n');
    return [
        'HARD RULES - these override everything below.',
        INPUTS(hasLine, mode),
        `You are an offline drafting engine given a finished plan: you ${cad ? 'draw' : 'render'} the geometry you were handed. You cannot add, remove, move, resize or restyle anything. Every wall, opening, partition, piece of furniture and the deck is exactly where the drawing has it.`,
        '',
        'INVENTORY - everything in the design. Each item is drawn exactly where and how the drawing shows it:',
        inventoryText || '(no inventory supplied - the drawing is the complete list)',
        '',
        'FORBIDDEN: ' + FORBIDDEN_COMMON,
        '',
        look,
        notes ? `NOTES from the designer, only where they do not contradict the rules above: ${clean(notes, 400)}` : '',
        'OUTPUT: 2K, the same aspect ratio as image 1.',
    ].filter(Boolean).join('\n');
}

/** An uploaded top view (SketchUp, a scan) has no spec: read it as items. */
export const PLAN_SURVEY_PROMPT = [
    'You are surveying a floor plan or top-down view of a small building for a drafting engine. List EVERYTHING in it as separate items, each described precisely enough that a drafter could keep it exactly: what it is, its size, and its position relative to the walls.',
    'Required groups, one item each unless there are several: building (overall width and depth if dimensions are shown, wall thickness, footprint shape); rooms (each room or zone with its label if written, and its size); openings (EACH door and EACH window separately: which wall, type - hinged/French/bi-fold/sliding, width if shown, and where along the wall); interior (EACH piece of furniture or fitting separately: what it is, where it sits, roughly how big); garden (any deck, patio or path shown, with its extent).',
    'Describe ONLY what is actually in the image. If a room has no furniture, say so in one item ("Bedroom: empty") - never assume a feature exists because rooms usually have one. Do not describe the paper, a grid, a title block or a north arrow.',
].join('\n');
