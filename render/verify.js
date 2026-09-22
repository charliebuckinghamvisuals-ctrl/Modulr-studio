/**
 * The verifier: one yes/no per inventory item, plus the camera.
 *
 * The old inspector checked doors, windows, roof form, cladding colour, door
 * type and camera - and nothing else, so a render with the deck cut in half
 * shipped as "verified". This one is handed the inventory and answers for
 * EVERY item: present, and unchanged in shape, size and position against
 * the drawing. Decking, paths, boundary runs and light fittings are items,
 * so they are checked like a door is.
 *
 * Fails soft: if the model errors, the render passes with checked:false.
 * A QA outage must never take rendering down.
 */

/** What image 2 is, by kind: an exterior render, an interior render, a rendered plan, or a CAD plan. */
const OPENING = {
    render: (hasColourRef) => `Image 1 is the geometry reference for a garden building scene (a line drawing or a flat-shaded 3D view). Image 2 is a photorealistic render that must show EXACTLY the same scene.${hasColourRef ? ' Image 3 is the same view flat-shaded: the COLOUR reference for cladding, deck, fascia, frames and furniture, to be read together with the item wording.' : ''}`,
    // 21 Sep 2026: the camera is INSIDE the room. The judging examples and
    // the "allowed setting" both change: what is outside the glass is the
    // setting now, and anything that appears inside the room is an addition.
    interior: (hasColourRef) => `Image 1 is the geometry reference for the INSIDE of a garden building, camera in the room (a line drawing or a flat-shaded 3D view). Image 2 is a photorealistic interior render that must show EXACTLY the same room.${hasColourRef ? ' Image 3 is the same view flat-shaded: the COLOUR reference for walls, floor, frames, kitchen units, worktop and every piece of furniture, to be read together with the item wording.' : ''}`,
    plan: (hasColourRef) => `Image 1 is the geometry reference for a floor plan seen from directly above (a line drawing or a flat-shaded top view). Image 2 is a photorealistic rendered floor plan that must show EXACTLY the same plan - same walls, openings, partitions and furniture in the same places, same framing and orientation.${hasColourRef ? ' Image 3 is the same plan flat-shaded: the COLOUR reference for floor, furniture and deck.' : ''}`,
    cad: () => 'Image 1 is the geometry reference for a floor plan seen from directly above (a line drawing or a flat-shaded top view, possibly with dimension lines). Image 2 is a black-and-white CAD-style floor plan drawing that must show EXACTLY the same plan - same walls, openings, partitions and furniture symbols in the same places, same framing and orientation. Where an inventory item states a dimension in millimetres, the figure written on the drawing for that element must be that number: a different figure means the item is NOT unchanged.',
};

/** The examples of "not unchanged", and what counts as setting rather than addition, by kind. */
const JUDGING = {
    render: {
        examples: '(a deck that is smaller, cut back or partly replaced by lawn is NOT unchanged; a door with a different leaf count or a solid door shown glazed is NOT unchanged; a light fitting of a different style or in a different place is NOT unchanged), AND, where the item names a material or colour, the render shows THAT material in THAT colour family (cedar-toned cladding rendered pale oak is NOT unchanged; black composite decking rendered as light timber is NOT unchanged; a black fascia rendered as timber is NOT unchanged; furniture listed as inside the room but missing through the glass is NOT present). Lighting, sky, planting beyond the boundary and fine surface texture are allowed to differ and never count against an item.',
        added: 'a short list of BUILT or PLACED things in image 2 that are NOT in image 1 - extra openings, steps, pots, planters, raised beds, paths, paving, structures, furniture - or an empty list. Lawn, planting, shrubs, flowers, trees, sky, neighbouring rooftops, and a boundary fence, wall or hedge at the EDGE of the garden where the reference shows none, are the setting and are ALLOWED; never list them as added unless they cover or replace an inventory item.',
    },
    interior: {
        examples: '(a sofa, bed or table of a different size, shape or place is NOT unchanged; a kitchen run with a unit more or fewer, or a different worktop, is NOT unchanged; a window or door of a different size, or a solid door shown glazed, is NOT unchanged; a partition wall moved or removed is NOT unchanged; a flat ceiling rendered vaulted, or the reverse, is NOT unchanged), AND, where the item names a material or colour, the render shows THAT material in THAT colour family (walls listed as sage painted white is NOT unchanged; oak flooring rendered grey is NOT unchanged; a grey sofa rendered cream is NOT unchanged; black frames rendered white is NOT unchanged). Lighting, the view outside the glass and fine surface texture are allowed to differ and never count against an item.',
        added: 'a short list of things PLACED or BUILT inside the room in image 2 that are NOT in image 1 - extra furniture, rugs, cushions, throws, lamps, plants, artwork, mirrors, books, vases, curtains, blinds, skirting, coving, beams, columns, openings - or an empty list. Whatever is seen OUTSIDE through the glazing - garden, lawn, planting, sky, fences, buildings - is the setting and is ALLOWED; never list it as added.',
    },
};
JUDGING.plan = JUDGING.render;
JUDGING.cad = JUDGING.render;

const PROMPT = (n, hasColourRef, kind = 'render') => [
    `${(OPENING[kind] || OPENING.render)(hasColourRef)} Below is the inventory of the ${n} items in the design.`,
    'For EACH item, judge image 2 against image 1 AND against the item\'s own words: present - the item is there; unchanged - same shape, size, position and extent as the reference ' + (JUDGING[kind] || JUDGING.render).examples,
    'Also report cameraMatch: true only if image 2 keeps image 1\'s camera angle, framing and crop with nothing the reference shows cropped out and no zoom in or pull back; and added: ' + (JUDGING[kind] || JUDGING.render).added,
    'note: for any item that is not present or not unchanged, one short sentence saying what is wrong. Judge only what both images can show; an item on an elevation the camera cannot see counts as present and unchanged.',
].join('\n');

export async function verifyRender(ai, Type, { model, referenceB64, referenceMime, renderB64, items, colourRefB64, colourRefMime, kind = 'render' }) {
    if (!items?.length) return { checked: false, passed: true, failures: [], added: [], cameraMatch: true };
    try {
        const inventory = items.map((it, i) => `${i + 1}. [${it.id}] ${it.text}`).join('\n');
        const parts = [
            { inlineData: { data: referenceB64, mimeType: referenceMime || 'image/png' } },
            { inlineData: { data: renderB64, mimeType: 'image/jpeg' } },
        ];
        if (kind !== 'cad' && colourRefB64 && colourRefB64 !== referenceB64) parts.push({ inlineData: { data: colourRefB64, mimeType: colourRefMime || 'image/jpeg' } });
        parts.push({ text: PROMPT(items.length, parts.length === 3, kind) + '\n\nINVENTORY:\n' + inventory });
        const response = await ai.models.generateContent({
            model,
            contents: { parts },
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        items: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
                            id: { type: Type.STRING },
                            present: { type: Type.BOOLEAN },
                            unchanged: { type: Type.BOOLEAN },
                            note: { type: Type.STRING },
                        }, required: ['id', 'present', 'unchanged'] } },
                        cameraMatch: { type: Type.BOOLEAN },
                        added: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: ['items', 'cameraMatch', 'added'],
                },
            },
        });
        const json = JSON.parse(response.text);
        const byId = new Map(items.map(it => [it.id, it]));
        const failures = [];
        for (const r of json.items || []) {
            const it = byId.get(r.id); if (!it) continue;
            if (r.present === false || r.unchanged === false) failures.push({ id: it.id, label: it.label, problem: r.note || (r.present === false ? 'missing' : 'changed') });
        }
        const added = Array.isArray(json.added) ? json.added.filter(s => typeof s === 'string' && s.trim()).slice(0, 8) : [];
        if (added.length) failures.push({ id: 'added', label: 'Nothing added', problem: 'added: ' + added.join(', ') });
        if (json.cameraMatch === false) failures.push({ id: 'camera', label: 'Camera', problem: 'the camera, framing or crop changed' });
        return { checked: true, passed: failures.length === 0, failures, added, cameraMatch: json.cameraMatch !== false };
    } catch (e) {
        console.warn('[RENDER] verification skipped:', e.message || e);
        return { checked: false, passed: true, failures: [], added: [], cameraMatch: true };
    }
}
