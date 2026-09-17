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

const PROMPT = (n) => [
    `Image 1 is the geometry reference for a garden building scene (a line drawing or a flat-shaded 3D view). Image 2 is a photorealistic render that must show EXACTLY the same scene. Below is the inventory of the ${n} items in the design.`,
    'For EACH item, judge image 2 against image 1 AND against the item\'s own words: present - the item is there; unchanged - same shape, size, position and extent as the reference (a deck that is smaller, cut back or partly replaced by lawn is NOT unchanged; a door with a different leaf count or a solid door shown glazed is NOT unchanged; a light fitting of a different style or in a different place is NOT unchanged), AND, where the item names a material or colour, the render shows THAT material in THAT colour family (cedar-toned cladding rendered pale oak is NOT unchanged; black composite decking rendered as light timber is NOT unchanged; a black fascia rendered as timber is NOT unchanged; furniture listed as inside the room but missing through the glass is NOT present). Lighting, sky, planting beyond the boundary and fine surface texture are allowed to differ and never count against an item.',
    'Also report cameraMatch: true only if image 2 keeps image 1\'s camera angle, framing and crop with nothing the reference shows cropped out and no zoom in or pull back; and added: a short list of BUILT or PLACED things in image 2 that are NOT in image 1 - extra openings, steps, pots, planters, raised beds, paths, paving, walls, fences, structures, furniture - or an empty list. Lawn, planting, shrubs, flowers, trees, sky and neighbouring rooftops are the setting and are ALLOWED anywhere the reference shows plain ground or nothing; never list them as added unless they cover or replace an inventory item.',
    'note: for any item that is not present or not unchanged, one short sentence saying what is wrong. Judge only what both images can show; an item on an elevation the camera cannot see counts as present and unchanged.',
].join('\n');

export async function verifyRender(ai, Type, { model, referenceB64, referenceMime, renderB64, items }) {
    if (!items?.length) return { checked: false, passed: true, failures: [], added: [], cameraMatch: true };
    try {
        const inventory = items.map((it, i) => `${i + 1}. [${it.id}] ${it.text}`).join('\n');
        const response = await ai.models.generateContent({
            model,
            contents: { parts: [
                { inlineData: { data: referenceB64, mimeType: referenceMime || 'image/png' } },
                { inlineData: { data: renderB64, mimeType: 'image/jpeg' } },
                { text: PROMPT(items.length) + '\n\nINVENTORY:\n' + inventory },
            ] },
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
