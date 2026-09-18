/**
 * The render engine's routes. Mounted from server.js with the pieces it
 * owns (auth, credits, logging, the Gemini client) so nothing here touches
 * Firestore or a key directly:
 *
 *   POST /api/render         a finished scene -> a render
 *   POST /api/render/survey  an uploaded view -> inventory items for the bar
 *   POST /api/render/plan    a plan capture or top view -> a rendered or CAD floor plan (Floor Plan Studio, Business)
 *
 * The flow for /api/render:
 *   inputs    shaded view (required), line drawing (from the configurator;
 *             drawn here for an upload), inventory (from the spec, or the
 *             items the user confirmed in the bar), setting, time
 *   pass      FINISH model, one pass, drawing + shaded + contract prompt
 *   verify    every inventory item + camera against the drawing
 *   retry     on failure: GEOMETRY model with the failures promoted, then a
 *             FINISH materials pass, verified again; the better attempt ships
 *   log       both attempts' verdicts, so QA can be read back later
 */
import { inventoryFromSpec, inventoryFromItems, inventoryToText } from './inventory.js';
import { buildRenderPrompt, buildMaterialsPassPrompt, LINE_CONVERSION_PROMPT, SURVEY_PROMPT, SCENE_PRESETS, TIME_PRESETS } from './prompt.js';
import { drawImage, GEOMETRY_MODEL, FINISH_MODEL, safeRatio } from './providers/gemini.js';
import { verifyRender } from './verify.js';
import { planInventoryFromSpec, buildPlanPrompt, PLAN_SURVEY_PROMPT } from './plan.js';

const stripDataUrl = (s) => (typeof s === 'string' ? s.replace(/^data:[^;]+;base64,/, '') : '');

/** The real type of a base64 image, from its first bytes; never trust the label. */
const sniffMime = (b64) => {
    const head = Buffer.from(String(b64).slice(0, 32), 'base64');
    if (head[0] === 0x89 && head[1] === 0x50) return 'image/png';
    if (head.slice(0, 4).toString() === 'RIFF' && head.slice(8, 12).toString() === 'WEBP') return 'image/webp';
    return 'image/jpeg';
};

export function mountRender(app, deps) {
    const { ai, Type, ANALYSIS_MODEL, enforceRenderAccess, CREDIT_COSTS, userAiLimiter, logRender, sanitizeString, resolveEffectivePlan, FLOOR_PLAN_PLANS } = deps;

    app.post('/api/render', userAiLimiter, async (req, res) => {
        const t0 = Date.now();
        try {
            const shaded = stripDataUrl(sanitizeString(req.body.shaded, 12_000_000));
            let line = stripDataUrl(sanitizeString(req.body.line, 6_000_000)) || null;
            const ratio = safeRatio(sanitizeString(req.body.ratio, 10));
            const scenePreset = sanitizeString(req.body.scenePreset, 30);
            const timePreset = sanitizeString(req.body.timePreset, 30);
            const sceneText = sanitizeString(req.body.sceneText, 600);
            const seed = req.body.seed !== undefined ? parseInt(req.body.seed) : undefined;
            if (!shaded) return res.status(400).json({ error: 'No source image.' });

            const access = await enforceRenderAccess(req, CREDIT_COSTS.STANDARD_RES);
            if (!access.allowed) return res.status(access.status).json(access.body);

            // ---- inventory: the user's confirmed items win over the raw spec
            let items = inventoryFromItems(req.body.items);
            let inventorySource = 'items';
            if (!items.length) { items = inventoryFromSpec(req.body.spec); inventorySource = items.length ? 'spec' : 'none'; }
            const inventoryText = inventoryToText(items);
            // The whole brief, in the log, so a wrong render can be read back
            // against exactly what the engine was told.
            console.log(`[RENDER] inventory (${inventorySource}, ${items.length} items):\n` + inventoryText);

            // ---- an upload has no drawing: draw one --------------------------
            let lineSource = line ? 'configurator' : 'none';
            let imageCalls = 0;
            if (!line) {
                line = await drawImage(ai, { model: GEOMETRY_MODEL, images: [{ b64: shaded, mime: sniffMime(shaded) }], prompt: LINE_CONVERSION_PROMPT, ratio, label: 'line' });
                imageCalls++;
                lineSource = line ? 'engine' : 'none';
            }
            const shadedMime = sniffMime(shaded);
            const lineMime = line ? sniffMime(line) : 'image/png';
            // An uploaded line drawing arrives as both: the drawing IS the source,
            // so there is no colour reference and the inventory carries the colours.
            const lineOnly = !!line && line === shaded;
            if (lineOnly) lineSource = 'upload';
            const references = lineOnly ? [{ b64: line, mime: lineMime }] : line ? [{ b64: line, mime: lineMime }, { b64: shaded, mime: shadedMime }] : [{ b64: shaded, mime: shadedMime }];
            const verifyAgainst = line ? { b64: line, mime: lineMime } : { b64: shaded, mime: shadedMime };

            // ---- pass 1: FINISH model on the drawing -------------------------
            const prompt = buildRenderPrompt({ inventoryText, hasLine: !!line, lineOnly, scenePreset, timePreset, sceneText });
            let image = await drawImage(ai, { model: FINISH_MODEL, images: references, prompt, ratio, seed, label: 'pass1' });
            imageCalls++;
            if (!image) return res.status(502).json({ error: 'The render engine produced no image. Please try again.' });

            const colourRef = lineOnly ? {} : { colourRefB64: shaded, colourRefMime: shadedMime };
            let verification = await verifyRender(ai, Type, { model: ANALYSIS_MODEL, referenceB64: verifyAgainst.b64, referenceMime: verifyAgainst.mime, renderB64: image, items, ...colourRef });
            let attempts = [{ pass: 'finish', ...verification }];
            let shipped = 'pass1';

            // ---- retry: GEOMETRY model with the failures promoted, then FINISH.
            // The retry ships only when it is STRICTLY better: on a tie the first
            // pass stays (18 Sep: a tied retry shipped an invented wall).
            if (verification.checked && !verification.passed) {
                console.warn('[RENDER] pass 1 failed verification:', verification.failures.map(f => `${f.label}: ${f.problem}`).join('; '));
                const promoted = 'PREVIOUS ATTEMPT REJECTED. These items were wrong and must be exactly as the drawing shows: ' + verification.failures.map(f => `${f.label} (${f.problem})`).join('; ') + '.\n\n';
                const geometry = await drawImage(ai, { model: GEOMETRY_MODEL, images: references, prompt: promoted + prompt, ratio, label: 'retry-geometry' });
                imageCalls++;
                if (geometry) {
                    const finished = await drawImage(ai, { model: FINISH_MODEL, images: [{ b64: geometry, mime: 'image/jpeg' }], prompt: buildMaterialsPassPrompt({ inventoryText, failures: verification.failures }), ratio, label: 'retry-finish' });
                    imageCalls++;
                    const candidate = finished || geometry;
                    const v2 = await verifyRender(ai, Type, { model: ANALYSIS_MODEL, referenceB64: verifyAgainst.b64, referenceMime: verifyAgainst.mime, renderB64: candidate, items, ...colourRef });
                    attempts.push({ pass: finished ? 'retry-geometry+finish' : 'retry-geometry', ...v2 });
                    if (!v2.checked || v2.failures.length < verification.failures.length) { image = candidate; verification = v2; shipped = finished ? 'retry' : 'retry-geometry-only'; }
                    if (!v2.passed) console.warn('[RENDER] retry still failing, shipping the better attempt:', v2.failures.map(f => `${f.label}: ${f.problem}`).join('; '));
                }
            }

            logRender(req, 'render', FINISH_MODEL, '2K', {
                imageCalls, qaCalls: attempts.length, shipped, lineSource, inventorySource, inventoryItems: items.length,
                verified: verification.passed, verificationChecked: verification.checked, failures: verification.failures.map(f => `${f.id}: ${f.problem}`).slice(0, 12),
                scenePreset: scenePreset || null, timePreset: timePreset || null, seconds: Math.round((Date.now() - t0) / 1000),
            });

            res.json({
                image,
                line: lineSource === 'engine' ? line : undefined,
                items,
                inventoryText,
                engine: { finish: FINISH_MODEL, geometry: GEOMETRY_MODEL, shipped, lineSource, inventorySource },
                verification: { ...verification, attempts: attempts.map(a => ({ pass: a.pass, checked: a.checked, passed: a.passed, failures: a.failures })) },
                rendersLeft: access.rendersLeft,
                seconds: Math.round((Date.now() - t0) / 1000),
            });
        } catch (error) {
            console.error('[RENDER] failed:', error);
            res.status(500).json({ error: error.clientMessage || 'Render failed. Please try again.' });
        }
    });

    /**
     * Floor Plan Studio. Same flow as /api/render - drawing + inventory ->
     * one FINISH pass -> verify -> one retry - but from above, in one of two
     * modes: 'rendered' (photoreal top-down) or 'cad' (black-on-white with
     * dimensions). Business only; a plan spends one render.
     */
    app.post('/api/render/plan', userAiLimiter, async (req, res) => {
        const t0 = Date.now();
        try {
            const mode = req.body.mode === 'cad' ? 'cad' : 'rendered';
            const shaded = stripDataUrl(sanitizeString(req.body.shaded, 12_000_000));
            let line = stripDataUrl(sanitizeString(req.body.line, 6_000_000)) || null;
            const ratio = safeRatio(sanitizeString(req.body.ratio, 10));
            const notes = sanitizeString(req.body.notes, 400);
            if (!shaded) return res.status(400).json({ error: 'No plan image.' });

            const plan = await resolveEffectivePlan(req);
            if (plan === null) return res.status(503).json({ error: 'Could not verify your plan. Please try again shortly.' });
            if (!FLOOR_PLAN_PLANS.has(plan)) return res.status(403).json({ error: 'Floor Plan Studio is part of the Business plan.', needsBusiness: true });
            const access = await enforceRenderAccess(req, CREDIT_COSTS.STANDARD_RES);
            if (!access.allowed) return res.status(access.status).json(access.body);

            let items = inventoryFromItems(req.body.items);
            let inventorySource = 'items';
            if (!items.length) { items = planInventoryFromSpec(req.body.spec, mode); inventorySource = items.length ? 'spec' : 'none'; }
            const inventoryText = inventoryToText(items);
            console.log(`[PLAN] ${mode} inventory (${inventorySource}, ${items.length} items):\n` + inventoryText);

            let lineSource = line ? 'configurator' : 'none';
            let imageCalls = 0;
            if (!line) {
                line = await drawImage(ai, { model: GEOMETRY_MODEL, images: [{ b64: shaded, mime: sniffMime(shaded) }], prompt: LINE_CONVERSION_PROMPT, ratio, label: 'plan-line' });
                imageCalls++;
                lineSource = line ? 'engine' : 'none';
            }
            const shadedMime = sniffMime(shaded);
            const lineMime = line ? sniffMime(line) : 'image/png';
            const references = line ? [{ b64: line, mime: lineMime }, { b64: shaded, mime: shadedMime }] : [{ b64: shaded, mime: shadedMime }];
            // A plan is checked against the shaded top view, not the edge
            // drawing: soft furniture (a bed, cushions) edges into scribble from
            // above, and the flat top view already has no perspective to lose.
            const verifyAgainst = { b64: shaded, mime: shadedMime };
            const kind = mode === 'cad' ? 'cad' : 'plan';

            const prompt = buildPlanPrompt({ mode, inventoryText, hasLine: !!line, notes });
            let image = await drawImage(ai, { model: FINISH_MODEL, images: references, prompt, ratio, label: `plan-${mode}` });
            imageCalls++;
            if (!image) return res.status(502).json({ error: 'The engine produced no plan. Please try again.' });

            const colourRef = { colourRefB64: shaded, colourRefMime: shadedMime };
            let verification = await verifyRender(ai, Type, { model: ANALYSIS_MODEL, referenceB64: verifyAgainst.b64, referenceMime: verifyAgainst.mime, renderB64: image, items, kind, ...colourRef });
            const attempts = [{ pass: 'finish', ...verification }];
            let shipped = 'pass1';
            if (verification.checked && !verification.passed) {
                console.warn('[PLAN] pass 1 failed verification:', verification.failures.map(f => `${f.label}: ${f.problem}`).join('; '));
                const promoted = 'PREVIOUS ATTEMPT REJECTED. These items were wrong and must be exactly as the drawing shows: ' + verification.failures.map(f => `${f.label} (${f.problem})`).join('; ') + '.\n\n';
                const retry = await drawImage(ai, { model: FINISH_MODEL, images: references, prompt: promoted + prompt, ratio, label: `plan-${mode}-retry` });
                imageCalls++;
                if (retry) {
                    const v2 = await verifyRender(ai, Type, { model: ANALYSIS_MODEL, referenceB64: verifyAgainst.b64, referenceMime: verifyAgainst.mime, renderB64: retry, items, kind, ...colourRef });
                    attempts.push({ pass: 'retry', ...v2 });
                    if (!v2.checked || v2.failures.length < verification.failures.length) { image = retry; verification = v2; shipped = 'retry'; }
                    if (!v2.passed) console.warn('[PLAN] retry still failing, shipping the better attempt:', v2.failures.map(f => `${f.label}: ${f.problem}`).join('; '));
                }
            }

            logRender(req, `floor-plan-${mode}`, FINISH_MODEL, '2K', {
                imageCalls, qaCalls: attempts.length, shipped, lineSource, inventorySource, inventoryItems: items.length,
                verified: verification.passed, verificationChecked: verification.checked, failures: verification.failures.map(f => `${f.id}: ${f.problem}`).slice(0, 12),
                seconds: Math.round((Date.now() - t0) / 1000),
            });
            res.json({
                image, mode, items, inventoryText,
                line: lineSource === 'engine' ? line : undefined,
                engine: { finish: FINISH_MODEL, shipped, lineSource, inventorySource },
                verification: { ...verification, attempts: attempts.map(a => ({ pass: a.pass, checked: a.checked, passed: a.passed, failures: a.failures })) },
                rendersLeft: access.rendersLeft,
                seconds: Math.round((Date.now() - t0) / 1000),
            });
        } catch (error) {
            console.error('[PLAN] failed:', error);
            res.status(500).json({ error: error.clientMessage || 'The floor plan failed. Please try again.' });
        }
    });

    /** The survey for an uploaded top view: what is on this plan, as items. */
    app.post('/api/render/plan/survey', userAiLimiter, async (req, res) => {
        try {
            const image = stripDataUrl(sanitizeString(req.body.image, 12_000_000));
            if (!image) return res.status(400).json({ error: 'No image.' });
            const access = await enforceRenderAccess(req, CREDIT_COSTS.ANALYSIS);
            if (!access.allowed) return res.status(access.status).json(access.body);
            const response = await ai.models.generateContent({
                model: ANALYSIS_MODEL,
                contents: { parts: [{ inlineData: { data: image, mimeType: sniffMime(image) } }, { text: PLAN_SURVEY_PROMPT }] },
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: { type: Type.OBJECT, properties: {
                        items: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
                            group: { type: Type.STRING, description: 'building | rooms | openings | interior | garden' },
                            label: { type: Type.STRING, description: 'short, under 8 words' },
                            text: { type: Type.STRING, description: 'the full precise description a drafter would keep' },
                        }, required: ['group', 'label', 'text'] } },
                    }, required: ['items'] },
                },
            });
            const json = JSON.parse(response.text || '{}');
            const items = inventoryFromItems((json.items || []).map((x, i) => ({ ...x, id: `${String(x.group || 'item').toLowerCase()}-${i + 1}` })));
            logRender(req, 'floor-plan-survey', ANALYSIS_MODEL, 'n/a', { items: items.length });
            res.json({ items });
        } catch (error) {
            console.error('[PLAN] survey failed:', error);
            res.status(500).json({ error: 'Could not read the plan. Please try again.' });
        }
    });

    /** A design's plan inventory, before any plan: no AI, no credits. */
    app.post('/api/render/plan/inventory', (req, res) => {
        const items = planInventoryFromSpec(req.body?.spec);
        res.json({ items, inventoryText: inventoryToText(items) });
    });

    /** The survey: an uploaded view described as inventory items for the bar. */
    app.post('/api/render/survey', userAiLimiter, async (req, res) => {
        try {
            const image = stripDataUrl(sanitizeString(req.body.image, 12_000_000));
            if (!image) return res.status(400).json({ error: 'No image.' });
            const access = await enforceRenderAccess(req, CREDIT_COSTS.ANALYSIS);
            if (!access.allowed) return res.status(access.status).json(access.body);
            const response = await ai.models.generateContent({
                model: ANALYSIS_MODEL,
                contents: { parts: [{ inlineData: { data: image, mimeType: sniffMime(image) } }, { text: SURVEY_PROMPT }] },
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: { type: Type.OBJECT, properties: {
                        items: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
                            group: { type: Type.STRING, description: 'building | materials | openings | garden | lights | interior' },
                            label: { type: Type.STRING, description: 'short, under 8 words' },
                            text: { type: Type.STRING, description: 'the full precise description a renderer would keep' },
                        }, required: ['group', 'label', 'text'] } },
                    }, required: ['items'] },
                },
            });
            const json = JSON.parse(response.text || '{}');
            const items = inventoryFromItems((json.items || []).map((x, i) => ({ ...x, id: `${String(x.group || 'item').toLowerCase()}-${i + 1}` })));
            logRender(req, 'render-survey', ANALYSIS_MODEL, 'n/a', { items: items.length });
            res.json({ items });
        } catch (error) {
            console.error('[RENDER] survey failed:', error);
            res.status(500).json({ error: 'Could not survey the image. Please try again.' });
        }
    });

    /** A design's inventory for the bar, before any render: no AI, no credits. */
    app.post('/api/render/inventory', (req, res) => {
        const items = inventoryFromSpec(req.body?.spec);
        res.json({ items, inventoryText: inventoryToText(items) });
    });

    /** The presets, so the UI and the server never disagree on the keys. */
    app.get('/api/render/presets', (_req, res) => {
        res.json({
            scenes: Object.entries(SCENE_PRESETS).map(([key, text]) => ({ key, text })),
            times: Object.entries(TIME_PRESETS).map(([key, text]) => ({ key, text })),
        });
    });

    console.log('RENDER ENGINE: line drawing + inventory ->', FINISH_MODEL, '(retry via', GEOMETRY_MODEL + '), QA on', ANALYSIS_MODEL);
}
