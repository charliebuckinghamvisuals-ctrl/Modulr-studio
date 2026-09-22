/**
 * The INVENTORY: everything in a design, as a list of items.
 *
 * One item per thing the render must keep - the building, each opening, the
 * deck, each boundary run, each path, each light fitting, the outdoor
 * section - each with a short label (for the analysis bar and the QA report)
 * and the full wording the prompt uses. The same list drives three things:
 *
 *   1. the prompt: numbered, at the TOP, where the image model reads it;
 *   2. the analysis bar in the app: what the engine has been told, editable;
 *   3. the verifier: one yes/no per item against the finished render.
 *
 * Two sources feed it. A configurator design carries exact data
 * (inventoryFromSpec). An uploaded view has none, so the survey step on the
 * analysis model describes it and the user corrects it (inventoryFromItems).
 *
 * The wording of the building items is carried over from the old
 * buildConfigSpecBlock in server.js - it was earned one regression at a time
 * (solid doors told as glass, per-elevation colour thrown away, the deck
 * extension, the outdoor section closed in) and every line of it is still
 * true. What changed is the shape: items, not a paragraph.
 */

const clean = (v, n = 200) => (typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, n) : '');
const mm = (v) => (typeof v === 'number' && isFinite(v) ? `${Math.round(v)}mm` : null);
const hex = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null);

const CLADDING_LOOKS = {
    cedar_composite: 'CEDAR-toned composite boards - a distinctly RED-BROWN cedar, #b0764b, like fresh western red cedar; NOT golden oak, NOT honey, NOT teak',
    oak_composite: 'OAK-toned composite boards (mid golden-brown, #c9a173)',
    light_oak_composite: 'light oak-toned composite boards (pale honey, #dcc09a)',
    black_composite: 'BLACK composite boards (deep charcoal-black, #1f2123)',
    dark_grey_composite: 'DARK GREY composite boards (#4a5057)',
    light_grey_composite: 'light grey composite boards (#a9aeb2)',
    grey_composite: 'grey composite boards (#a9aeb2)',
    white_composite: 'off-white composite boards (#e8e6e1)',
    slate_blue_composite: 'SLATE BLUE composite boards (muted blue-grey, #7c93a6)',
    sage_composite: 'SAGE GREEN composite boards (muted grey-green, #7e8c74)',
    clay_composite: 'clay / terracotta-toned composite boards (#9a6b58)',
    timber: 'natural larch timber boards',
    cedar: 'natural cedar timber boards',
    oak: 'oak timber boards',
    composite_wood: 'brown composite boards',
    composite_brown: 'brown composite boards',
    composite_black: 'BLACK composite boards (deep charcoal-black)',
    composite_grey: 'grey composite boards',
    charred_wood: 'charred (shou sugi ban) BLACK timber boards',
    render_white: 'smooth white render',
    box_metal_grey: 'grey box-profile standing-seam metal sheet',
    box_metal_black: 'BLACK box-profile standing-seam metal sheet',
    corrugated_metal: 'corrugated metal sheet',
    fire_board_grey: 'grey fibre-cement board',
    corrugated_iron: 'galvanised CORRUGATED STEEL sheet, vertical profile (dull grey metal)',
    corrugated_black: 'BLACK powder-coated CORRUGATED STEEL sheet, vertical profile',
    corrugated_dark_grey: 'DARK GREY powder-coated CORRUGATED STEEL sheet, vertical profile',
    painted_planks: 'PAINTED vertical timber boards',
    box_metal_black: 'BLACK BOX-PROFILE METAL SHEET cladding, crisp square vertical ribs',
    box_metal_anthracite: 'ANTHRACITE (dark grey) BOX-PROFILE METAL SHEET cladding, crisp square vertical ribs',
};

/** The building's deck, as the configurator resolves it (utils/materials.ts
 *  resolveDeckingKey): the chosen decking, else the cladding's match, else timber. */
const DECK_LOOKS = {
    timber_decking: 'natural softwood timber decking boards (warm mid-brown, #a3794a)',
    timber: 'natural softwood timber decking boards (warm mid-brown, #a3794a)',
    composite_cedar: 'CEDAR-toned composite decking boards (reddish-brown, #b0764b)',
    composite_oak: 'OAK-toned composite decking boards (golden-brown, #c9a173)',
    composite_light_oak: 'light oak composite decking boards (pale honey, #dcc09a)',
    composite_brown: 'BROWN composite decking boards (#8b6b55)',
    composite_grey: 'LIGHT GREY composite decking boards (#a9aeb2)',
    composite_dark_grey: 'DARK GREY composite decking boards (#4a5057)',
    composite_black: 'BLACK composite decking boards (deep charcoal-black, #1f2123)',
    composite_white: 'off-white composite decking boards (#e8e6e1)',
    composite_slate_blue: 'slate-blue composite decking boards (#7c93a6)',
    composite_sage: 'sage-green composite decking boards (#7e8c74)',
    composite_clay: 'clay-toned composite decking boards (#9a6b58)',
};
const CLADDING_TO_DECKING = {
    cedar_composite: 'composite_cedar', oak_composite: 'composite_oak', light_oak_composite: 'composite_light_oak', white_composite: 'composite_white',
    black_composite: 'composite_black', dark_grey_composite: 'composite_dark_grey', light_grey_composite: 'composite_grey', grey_composite: 'composite_grey',
    slate_blue_composite: 'composite_slate_blue', sage_composite: 'composite_sage', clay_composite: 'composite_clay', corrugated_iron: 'composite_grey', painted_planks: 'composite_white',
};
const deckLook = (spec) => {
    const key = (typeof spec.deckingMaterial === 'string' && spec.deckingMaterial) || CLADDING_TO_DECKING[spec.cladding] || 'timber_decking';
    return DECK_LOOKS[key] || clean(String(key).replace(/_/g, ' '), 40) + ' decking boards';
};
const FASCIA_LOOKS = { black: 'BLACK (#141414)', anthracite: 'ANTHRACITE dark grey (#2f3236)', white: 'WHITE', grey: 'mid GREY' };

const ROOF_NAMES = {
    epdm: 'EPDM rubber membrane', sedum: 'sedum green roof', upvc: 'uPVC roof sheet', metal: 'standing-seam metal roof', rubber: 'textured black rubber roof sheeting', aluminium: 'black powder-coated aluminium roof sheet',
    // Pitched coverings added to the configurator 22 Sep 2026.
    roof_clay_tiles: 'dark CLAY PANTILES in courses', roof_slate_round: 'grey ROUND-EDGE (fish-scale) SLATES in courses', roof_slate: 'grey natural SLATE in courses',
    roof_corrugated_dark: 'dark weathered CORRUGATED STEEL sheet, ridges running down the slope', roof_corrugated_black: 'BLACK CORRUGATED STEEL sheet, ridges running down the slope', roof_corrugated_dark_grey: 'DARK GREY CORRUGATED STEEL sheet, ridges running down the slope',
};
const FRAME_NAMES = { upvc: 'uPVC', aluminium: 'aluminium', timber: 'painted timber' };

/** An item: id (stable, for QA), group (for the bar), label (short), text (prompt). */
const item = (id, group, label, text) => ({ id, group, label: clean(label, 80), text: clean(text, 900) });

/**
 * Items from a configurator design (the room spec the Sidebar posts with
 * the images). Returns [] for anything that is not a spec.
 */
export function inventoryFromSpec(spec) {
    if (!spec || typeof spec !== 'object') return [];
    const items = [];
    try {
        // ---- building --------------------------------------------------
        const wStr = mm(spec.widthMm), dStr = mm(spec.depthMm);
        const roof = spec.shape === 'Gable' ? 'gable (dual pitched) roof' : 'flat roof';
        // L-shaped footprint (back in the configurator 22 Sep 2026): named,
        // or the engine tidies the notch into a plain box.
        const lCut = spec.shape === 'LShape' && spec.lShapeCutoutWidthMm && spec.lShapeCutoutDepthMm
            ? `L-shaped footprint: a ${mm(spec.lShapeCutoutWidthMm)} x ${mm(spec.lShapeCutoutDepthMm)} corner is cut out of the front-right, the roof and cladding following the notch, `
            : '';
        items.push(item('building', 'building', `Building ${wStr && dStr ? `${wStr} x ${dStr}` : ''}, ${lCut ? 'L-shaped, ' : ''}${roof}`.trim(),
            `The building: single storey, ${wStr && dStr ? `${wStr} wide x ${dStr} deep, ` : ''}${lCut}${roof}, exactly the footprint, height and proportions the line drawing shows.`));

        // ---- cladding, per elevation ----------------------------------
        const tint = hex(spec.claddingTint);
        const look = (id) => {
            if (typeof id !== 'string') return null;
            if (id === 'painted_planks' && tint) return `PAINTED vertical timber boards, paint colour ${tint}`;
            if (CLADDING_LOOKS[id]) return CLADDING_LOOKS[id];
            return id.trim() ? clean(id.replace(/_/g, ' '), 40) : null;
        };
        const base = look(spec.cladding);
        const faces = [['Front', look(spec.claddingFront) || base], ['Back', look(spec.claddingBack) || base], ['Left', look(spec.claddingLeft) || base], ['Right', look(spec.claddingRight) || base]].filter(f => f[1]);
        const dir = spec.claddingOrientation === 'horizontal' ? 'horizontal' : 'vertical';
        if (faces.length) {
            const uniform = faces.every(f => f[1] === faces[0][1]);
            if (uniform && faces.length === 4) {
                items.push(item('cladding', 'materials', `Cladding: ${faces[0][1]}`,
                    `Cladding on ALL elevations: ${faces[0][1]}, boards running ${dir}. This is the ordered colour - render exactly this colour family as real boards with joints and grain. Do NOT shift it toward grey or any other colour, and do not take the colour from the flat shading of the reference image if it disagrees.`));
            } else {
                faces.forEach(([label, desc]) => items.push(item(`cladding-${label.toLowerCase()}`, 'materials', `${label} cladding: ${desc}`,
                    `${label} elevation cladding: ${desc}, boards running ${dir}. Each elevation keeps its own listed colour.`)));
            }
            const gable = look(spec.claddingGable);
            if (gable && spec.shape === 'Gable') items.push(item('cladding-gable', 'materials', `Gable apex: ${gable}`, `Gable apex triangles: ${gable}.`));
        }
        {
            const f = clean(String(spec.fasciaMaterial || 'black'), 20);
            items.push(item('fascia', 'materials', `Fascia: ${f === 'match_cladding' ? 'matches cladding' : f}`, f === 'match_cladding'
                ? 'Fascia / roof edge trim: the SAME material and colour as the cladding, boards running continuously up to the roof edge.'
                : `Fascia / roof edge trim: ${FASCIA_LOOKS[f] || f.toUpperCase()}, a crisp flat smooth band along the top of every wall, clearly distinct from the cladding below it - never timber, never the cladding colour - at the depth the line drawing shows.`));
        }
        if (spec.roofMaterial) {
            const r = ROOF_NAMES[spec.roofMaterial] || clean(String(spec.roofMaterial), 20);
            const rc = hex(spec.roofColor);
            items.push(item('roof', 'materials', `Roof: ${r}`, `Roof covering: ${r}${rc ? ` in ${rc}` : ''}. The roof form and edge line stay exactly as drawn.`));
        }
        if (typeof spec.frameColor === 'string' && spec.frameColor.trim()) {
            const fc = clean(spec.frameColor, 20).toUpperCase();
            const fm = FRAME_NAMES[spec.frameMaterial] || 'aluminium';
            items.push(item('frames', 'materials', `Frames: ${fc} ${fm}`, `Window and door frames: ${fc} ${fm} on every opening, slim, exactly the frame widths drawn. A SOLID door leaf is ${fc} like its frame - never the cladding colour.`));
        }

        // ---- outdoor section ------------------------------------------
        if (spec.bay && typeof spec.bay === 'object' && (spec.bay.side === 'left' || spec.bay.side === 'right') && Number(spec.bay.widthMm) > 0) {
            const side = spec.bay.side;
            const bw = Math.round(Number(spec.bay.widthMm));
            const total = mm(spec.widthMm);
            const floor = spec.bay.floor === 'porcelain' ? 'porcelain paving slabs' : spec.bay.floor === 'base' ? 'the plain base' : 'timber decking boards';
            const bd = Number(spec.bay.depthMm) > 0 ? Math.round(Number(spec.bay.depthMm)) : 0;
            const depthWords = bd ? `${bd}mm deep from the front face - a CORNER of the building, with the enclosed room wrapping round behind it` : 'the full depth of the building';
            const end = spec.bay.screen === 'slatted' ? `its ${side} end is a screen of slim vertical timber slats`
                : spec.bay.screen === 'glass' ? `its ${side} end is a frameless clear glass screen`
                : spec.bay.screen === 'open' ? `its ${side} end is fully open too`
                : `its ${side} end wall is the building's own wall`;
            const back = !bd && spec.bay.backWall === 'slatted' ? ' Its back is a screen of vertical timber slats.'
                : !bd && spec.bay.backWall === 'open' ? ' Its back is open too - you can see straight through it to the garden behind.' : '';
            const finish = spec.bay.wallFinish === 'render' ? `painted render${hex(spec.bay.wallColour) ? ` in ${hex(spec.bay.wallColour)}` : ''}`
                : spec.bay.wallFinish === 'cladding' && spec.bay.wallCladding ? (look(spec.bay.wallCladding) || 'a contrasting cladding')
                : 'the same cladding as the outside of the building';
            const soffit = spec.bay.soffit === 'cladding' ? 'clad to match the walls' : spec.bay.soffit === 'slats' ? 'lined with timber slats' : spec.bay.soffit === 'white' ? 'lined white' : "the exposed underside of the roof, in the roof's own dark material";
            const postColour = spec.bay.post === 'timber' ? ' in natural timber' : spec.bay.post === 'black' ? ' in black' : spec.bay.post === 'white' ? ' in white' : ' in the frame colour';
            const post = spec.bay.post === 'none' ? 'no post' : `a slim 100mm square corner post${postColour} carrying the roof at its outer front corner`;
            items.push(item('outdoor-section', 'building', `Covered outdoor section, ${side}, ${bw}mm`,
                `COVERED OUTDOOR SECTION at the ${side.toUpperCase()} end of the building, ${bw}mm wide${total ? ` of the ${total} total width` : ''}, ${depthWords}, under the SAME continuous roof, fascia and cladding line - part of this one building, not a lean-to. It has NO front wall: open to the garden along its whole front, with ${post}. The wall faces inside it are finished in ${finish}; ${end}.${back} Its ceiling is ${soffit}. A dividing wall separates it from the enclosed room. Floor: ${floor}, level with the room floor. Do NOT put any door or window across the open section, and do NOT close it in with glazing.`));
        }

        // ---- openings, with position -----------------------------------
        const wallLen = (wall) => (wall === 'left' || wall === 'right') ? spec.depthMm : spec.widthMm;
        const where = (op) => {
            if (op.wall === 'bay') return '';
            const L = wallLen(op.wall), off = op.offsetMm, w = op.widthMm;
            if (![L, off, w].every(v => typeof v === 'number' && isFinite(v)) || L <= 0) return '';
            const rightIsPositive = op.wall === 'front' || op.wall === 'left';
            const toRight = rightIsPositive ? off : -off;
            const gapL = Math.max(0, Math.round(L / 2 + toRight - w / 2));
            const gapR = Math.max(0, Math.round(L / 2 - toRight - w / 2));
            const centre = Math.abs(toRight) < 50 ? 'centred on the wall' : `centred ${Math.round(Math.abs(toRight))}mm ${toRight > 0 ? 'right' : 'left'} of the wall's midpoint`;
            return ` Position, viewed from outside: ${centre}, leaving ${gapL}mm of blank wall to the left-hand corner and ${gapR}mm to the right-hand corner.`;
        };
        const doors = Array.isArray(spec.doors) ? spec.doors.slice(0, 12) : [];
        const windows = Array.isArray(spec.windows) ? spec.windows.slice(0, 12) : [];
        doors.forEach((dr, i) => {
            const style = dr.style === 'crittall' ? 'black steel Crittall-style with a grid of slim glazing bars'
                : dr.style === 'solid' ? 'SOLID UNGLAZED - an opaque flush panel leaf with NO glass anywhere in it; not a glazed set, not Crittall'
                : 'glazed';
            const leaves = Math.max(1, parseInt(dr.leaves) || 1);
            const kind = ['hinged', 'french', 'bifold', 'sliding'].includes(dr.kind) ? dr.kind : leaves <= 1 ? 'hinged' : leaves === 2 ? 'french' : 'bifold';
            const product = kind === 'hinged' ? 'single hinged door, 1 leaf'
                : kind === 'french' ? 'French doors - a pair of hinged leaves meeting in the middle, 2 leaves'
                : kind === 'bifold' ? `bi-fold door set of ${leaves} equal folding leaves in one frame, with the slim vertical mullions between the leaves that a bi-fold has`
                : `sliding door set of ${leaves} equal panes in one frame - large panes, slim vertical divisions, no folding hinges`;
            const wall = clean(String(dr.wall || 'front'), 10);
            // Drawn open: the moved leaf is real geometry in the drawing, in the
            // same frame finish and glass as the rest - never closed up, never
            // a blank white panel.
            const openWords = dr.open === true
                ? (kind === 'sliding' ? ' This door set is drawn OPEN: one pane slid across in front of its neighbour, exactly as the drawing shows, in the same slim frame and clear glass as the other panes - not a solid or white panel, and not closed up.'
                    : kind === 'bifold' ? ' This door set is drawn OPEN: the leaves folded back in a stack at the side of the opening, exactly as the drawing shows, in the same frame finish and glass - not closed up.'
                    : ' This door is drawn OPEN: the leaf swung out at the angle the drawing shows, in the same frame finish and glass, with the room visible through the opening - not closed up.')
                : '';
            const placeWords = wall === 'bay' ? 'in the dividing wall inside the covered outdoor section, seen only through its open front' : `on the ${wall} elevation`;
            items.push(item(`door-${i + 1}`, 'openings', `Door ${i + 1}: ${kind}, ${leaves} leaf, ${dr.style === 'solid' ? 'solid' : dr.style === 'crittall' ? 'Crittall' : 'glazed'}, ${wall}`,
                `Door ${i + 1}: ${product}, ${mm(dr.widthMm) || 'unspecified width'} x ${mm(dr.heightMm) || 'unspecified height'}, ${style}, ${placeWords}.${where(dr)} Exactly where and how big the line drawing shows it.${openWords}`));
        });
        windows.forEach((wn, i) => {
            const wall = clean(String(wn.wall || 'front'), 10);
            const style = wn.style === 'crittall' ? 'Crittall-style glazing bar grid' : 'plain glazing';
            const placeWords = wall === 'bay' ? 'in the dividing wall inside the covered outdoor section' : `${wall} elevation`;
            items.push(item(`window-${i + 1}`, 'openings', `Window ${i + 1}: ${mm(wn.widthMm) || '?'} x ${mm(wn.heightMm) || '?'}, ${wall}`,
                `Window ${i + 1}: ${mm(wn.widthMm) || '?'} x ${mm(wn.heightMm) || '?'}, ${style}, ${placeWords}.${where(wn)} Exactly where and how big the line drawing shows it.`));
        });
        items.push(item('openings-total', 'openings', `${doors.length} door set${doors.length === 1 ? '' : 's'}, ${windows.length} window${windows.length === 1 ? '' : 's'} in total`,
            `Openings across the WHOLE building, all elevations: ${doors.length} door set${doors.length === 1 ? '' : 's'} and ${windows.length} window${windows.length === 1 ? '' : 's'}, listed above. Only those the line drawing shows are in frame; render an opening ONLY where the drawing shows one, never add or duplicate one onto a visible wall, and a blank wall in the drawing stays a blank wall.${!windows.length ? ' There are NO windows anywhere on this building.' : ''}${!doors.length ? ' There are NO exterior door sets.' : ''}`));
        const sky = Array.isArray(spec.skylights) ? spec.skylights.length : 0;
        if (sky > 0) items.push(item('skylights', 'openings', `${sky} skylight${sky === 1 ? '' : 's'}`, `Skylights across the whole roof: ${sky}. Only the ones the line drawing shows are in frame.`));

        // ---- decking ---------------------------------------------------
        const outline = Array.isArray(spec.deckOutline) && spec.deckOutline.length >= 3
            ? spec.deckOutline.filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).slice(0, 40) : null;
        if ((spec.hasDecking || spec.hasPictureFrame) && outline && outline.length >= 3) {
            let a = 0;
            for (let i = 0; i < outline.length; i++) { const [x1, z1] = outline[i], [x2, z2] = outline[(i + 1) % outline.length]; a += x1 * z2 - x2 * z1; }
            const area = Math.round(Math.abs(a) / 2 * 10) / 10;
            items.push(item('deck', 'garden', `Deck: custom ${outline.length}-sided outline, about ${area} m², ${deckLook(spec).split(' (')[0]}`,
                `DECKING: one level deck of ${deckLook(spec)}, about ${area} m² in a custom ${outline.length}-sided outline, exactly the shape and extent the line drawing shows - it runs under and out from the building and may wrap a corner or step in and out. Keep EVERY edge of it where the drawing has it, right to the edge of the frame where the drawing does; do not shrink it, cut it back or replace any part of it with lawn, gravel, planting or paving. Boards in exactly that colour family, running straight with visible joints and a clean fascia edge. The roof and canopy above do NOT follow the deck.`));
        } else if (spec.hasDecking || spec.hasPictureFrame) {
            const front = Number(spec.deckingSizeMm) || 1500, left = Number(spec.deckingLeftMm) || 0, right = Number(spec.deckingRightMm) || 0;
            const sides = [left ? `${left}mm past the LEFT side of the building` : null, right ? `${right}mm past the RIGHT side of the building` : null].filter(Boolean);
            items.push(item('deck', 'garden', `Deck: ${front}mm deep across the front, ${deckLook(spec).split(' (')[0]}`,
                `DECKING: one level deck of ${deckLook(spec)}, ${front}mm deep across the full front of the building${sides.length ? `, and extending ${sides.join(' and ')} - deliberately wider than the building there; the roof and canopy above do NOT extend with it` : ''}. Keep the deck exactly the size, shape and extent the line drawing shows; do not shrink it, cut it back or replace any part of it with lawn, gravel, planting or paving. Boards in exactly that colour family, running straight with visible joints and a clean fascia edge.`));
        }

        // ---- internal partition walls, seen through the glazing ----------
        // A partition's end face sits right behind the glass, so without this
        // item the models read it as a "white pillar" and paint it out or
        // solid. Position from the room centre, as the configurator stores it.
        const parts = Array.isArray(spec.partitions) ? spec.partitions.slice(0, 8) : [];
        parts.forEach((pt, i) => {
            if (!pt || typeof pt !== 'object') return;
            const runs = Number(pt.rotation) === 90 ? 'front-to-back' : 'left-to-right';
            const len = mm(pt.lengthMm) || 'unspecified length', th = Number(pt.thicknessMm) || 100;
            const x = Number(pt.xMm) || 0, z = Number(pt.zMm) || 0;
            const place = runs === 'front-to-back'
                ? `${Math.abs(x)}mm ${x < 0 ? 'left' : 'right'} of the room's centre line, its end face flush with the inside of the front wall`
                : `${Math.abs(z)}mm ${z < 0 ? 'toward the back' : 'toward the front'} of the room's centre`;
            const doorsIn = Array.isArray(pt.doors) ? pt.doors.length : 0;
            items.push(item(`partition-${i + 1}`, 'interior', `Internal wall ${i + 1}: ${len} long, runs ${runs}`,
                `INTERNAL PARTITION WALL ${i + 1}, INSIDE the room and seen only through the glazing: a full-height plastered wall ${len} long and ${th}mm thick, running ${runs}, ${place}, painted ${hex(spec.interiorColor) || 'white'} like the other interior walls${doorsIn ? `, with ${doorsIn} internal door${doorsIn === 1 ? '' : 's'} in it` : ''}. Where it meets the front glazing its narrow end face shows through the glass as a slim vertical white band exactly as drawn - it is a WALL END, not a pillar, post, mullion or panel; keep it exactly where and as thick as the drawing shows, and never move it, remove it or turn it into part of the door.`));
        });

        // ---- interior, seen through the glazing --------------------------
        if (spec.interior && typeof spec.interior === 'object') {
            const it = spec.interior;
            const pieces = Array.isArray(it.items) ? it.items.slice(0, 30).map(p => `${Number(p.count) > 1 ? `${Number(p.count)} x ` : ''}${clean(String(p.label || ''), 40)}${hex(p.color) ? ` in ${hex(p.color)}` : ''}`).filter(s => s.trim()) : [];
            items.push(item('interior', 'interior', `Interior: ${pieces.length ? pieces.slice(0, 4).join(', ') + (pieces.length > 4 ? '...' : '') : 'empty room'}`,
                `INTERIOR, seen through the glazing and any open door: ${clean(String(it.walls || 'white walls'), 60)}, ${clean(String(it.floor || 'timber plank flooring'), 60)}, ceiling white with the downlights the drawing shows. Furniture and fittings EXACTLY as placed and drawn, each in its stated colour, none removed, none added: ${pieces.length ? pieces.join('; ') : 'no furniture - the room is empty'}. The glass is clear: the interior reads through it, lit softly, with only light reflections of the garden on the pane.`));
        }
        const decks = Array.isArray(spec.garden?.decks) ? spec.garden.decks.slice(0, 8) : [];
        decks.forEach((d, i) => {
            if (typeof d?.text !== 'string' || !d.text.trim()) return;
            items.push(item(`garden-deck-${i + 1}`, 'garden', `Garden deck ${i + 1}: ${clean(d.text, 60)}`,
                `GARDEN DECKING AREA ${i + 1}: ${clean(d.text, 160)}. Exactly the outline, size and position the line drawing shows: its own level platform at the height stated, boards running straight, a clean fascia edge; where a higher deck meets a lower one the height difference is a real step.`));
        });

        // ---- boundary, paths ------------------------------------------
        const boundary = Array.isArray(spec.garden?.boundary) ? spec.garden.boundary.slice(0, 12) : [];
        boundary.forEach((b, i) => {
            if (typeof b?.text !== 'string' || !b.text.trim()) return;
            const len = Math.round((Number(b.lengthMm) || 0) / 100) / 10;
            items.push(item(`boundary-${i + 1}`, 'garden', `Boundary run ${i + 1} (${len} m): ${clean(b.text, 50)}`,
                `GARDEN BOUNDARY run ${i + 1} (${len} m): ${clean(b.text, 120)}. Exactly where the line drawing shows it, in that material at that height. A run listed as open has no fence or wall.`));
        });
        const paths = Array.isArray(spec.garden?.paths) ? spec.garden.paths.slice(0, 12) : [];
        paths.forEach((p, i) => {
            if (typeof p?.text !== 'string' || !p.text.trim()) return;
            items.push(item(`path-${i + 1}`, 'garden', `Path ${i + 1}: ${clean(p.text, 60)}`,
                `GARDEN PATH ${i + 1}: ${clean(p.text, 120)}. Exactly where the line drawing shows it, on its drawn line at its drawn width, crisp, level, evenly jointed paving.`));
        });

        // ---- exterior lights -------------------------------------------
        const lights = Array.isArray(spec.exteriorLights) ? spec.exteriorLights.slice(0, 12) : [];
        lights.forEach((l, i) => {
            if (typeof l?.text !== 'string' || !l.text.trim()) return;
            const n = Number(l.count) || 1;
            items.push(item(`light-${i + 1}`, 'lights', `Light fitting${n > 1 ? `s x${n}` : ''}: ${clean(l.text, 60)}`,
                `EXTERIOR LIGHT FITTING${n > 1 ? `S, ${n} of them` : ''}: ${clean(l.text, 400)}. Exactly where the line drawing shows each one, keeping its precise shape, proportions and size - a slim flat box stays a slim flat box, it does not become a lantern, a cylinder or a different product. Only the finish colour is rendered from these words.`));
        });
    } catch (e) {
        console.warn('[RENDER] inventoryFromSpec skipped an item:', e.message || e);
    }
    return items;
}

/**
 * Items as the client sends them back from the analysis bar (either the
 * survey's output corrected by the user, or the spec items edited). Only
 * the fields the prompt uses survive, all cleaned.
 */
export function inventoryFromItems(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 40)
        .filter(x => x && typeof x === 'object' && typeof x.text === 'string' && x.text.trim())
        .map((x, i) => {
            // The designer's own colour / material for this item (the box under
            // the locked survey text, 18 Sep 2026): appended so it overrides
            // whatever the survey read off the image, and the verifier checks it.
            const finish = typeof x.finish === 'string' ? clean(x.finish, 160) : '';
            const text = finish ? `${x.text.trim().replace(/[.s]+$/, '')}. COLOUR / MATERIAL, as specified by the designer - this overrides anything the drawing or the survey suggests: ${finish}.` : x.text;
            return item(clean(String(x.id || `item-${i + 1}`), 40).replace(/[^a-z0-9-]/gi, '') || `item-${i + 1}`, clean(String(x.group || 'other'), 20), x.label || x.text.slice(0, 60), text);
        });
}

/** The numbered list the prompt and the verifier both use. */
export const inventoryToText = (items) => items.map((it, i) => `${i + 1}. ${it.text}`).join('\n');
